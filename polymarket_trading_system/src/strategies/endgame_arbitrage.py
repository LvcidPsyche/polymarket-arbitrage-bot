"""
Endgame Arbitrage Strategy
Targets high-probability markets (95%+) that resolve within 48 hours.
This strategy aims for consistent, high-annualized returns with lower risk.
"""

import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Dict, List, Optional
from dataclasses import dataclass

from ..utils.config import get_config
from ..integrations.polymarket_client import get_polymarket_client

logger = logging.getLogger(__name__)

@dataclass
class EndgameOpportunity:
    """Endgame arbitrage opportunity data"""
    market_id: str
    token_id: str
    question: str
    outcome: str
    probability: float
    price: float
    potential_return_pct: float
    annualized_return_pct: float
    hours_to_resolution: float
    volume_24h: float
    spread: float
    liquidity_score: float
    confidence_score: float

class EndgameStrategy:
    """Endgame arbitrage strategy implementation"""
    
    def __init__(self):
        self.config = get_config().endgame
        self.polymarket = get_polymarket_client()
        self.enabled = self.config.enabled
        
        # Strategy parameters
        self.min_probability = self.config.min_probability
        self.max_hours = self.config.max_hours_to_resolution
        self.min_volume = self.config.min_volume_24h
        self.min_spread = self.config.min_spread_bps / 10000  # Convert bps to decimal
        
        # Performance tracking
        self.opportunities_scanned = 0
        self.opportunities_found = 0
        self.last_scan_time: Optional[datetime] = None
        self.scan_duration_ms = 0
    
    def is_enabled(self) -> bool:
        """Check if strategy is enabled"""
        return self.enabled
    
    async def scan_opportunities(self) -> List[Dict]:
        """Scan for endgame arbitrage opportunities"""
        if not self.enabled:
            return []
        
        scan_start = datetime.now(timezone.utc)
        opportunities = []
        
        try:
            logger.debug("Scanning for endgame arbitrage opportunities")
            
            # Get markets ending soon
            markets = self._get_ending_markets()
            self.opportunities_scanned = len(markets)
            
            current_time = datetime.now(timezone.utc)
            
            for market in markets:
                try:
                    opportunity = await self._analyze_market_for_endgame(market, current_time)
                    if opportunity:
                        opportunities.append(self._format_opportunity(opportunity))
                        
                except Exception as e:
                    logger.warning(f"Error analyzing market {market.get('id', 'unknown')}: {e}")
            
            # Sort by annualized return
            opportunities.sort(key=lambda x: x.get('annualized_return_pct', 0), reverse=True)
            
            # Filter top opportunities
            top_opportunities = opportunities[:5]  # Limit to top 5
            self.opportunities_found = len(top_opportunities)
            
            # Update performance metrics
            scan_duration = datetime.now(timezone.utc) - scan_start
            self.scan_duration_ms = scan_duration.total_seconds() * 1000
            self.last_scan_time = scan_start
            
            if top_opportunities:
                logger.info(f"Found {len(top_opportunities)} endgame opportunities")
                best = top_opportunities[0]
                logger.info(f"Best: {best['potential_return_pct']:.1f}% in {best['hours_to_resolution']:.1f}h")
            
            return top_opportunities
            
        except Exception as e:
            logger.error(f"Endgame strategy scan failed: {e}")
            return []
    
    def _get_ending_markets(self) -> List[Dict]:
        """Get markets ending within the strategy time horizon"""
        try:
            # Get active markets from Polymarket
            all_markets = self.polymarket.get_markets(active=True, limit=200)
            
            current_time = datetime.now(timezone.utc)
            cutoff_time = current_time + timedelta(hours=self.max_hours)
            
            ending_markets = []
            
            for market in all_markets:
                try:
                    # Parse end date
                    end_date_str = market.get('end_date_iso', '')
                    if not end_date_str:
                        continue
                    
                    end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
                    
                    # Check if market ends within our time window
                    if current_time < end_date <= cutoff_time:
                        # Check minimum volume requirement
                        volume_24h = float(market.get('volume_24hr', 0))
                        if volume_24h >= self.min_volume:
                            ending_markets.append(market)
                
                except Exception as e:
                    logger.debug(f"Error processing market end date: {e}")
                    continue
            
            logger.debug(f"Found {len(ending_markets)} markets ending within {self.max_hours} hours")
            return ending_markets
            
        except Exception as e:
            logger.error(f"Error getting ending markets: {e}")
            return []
    
    async def _analyze_market_for_endgame(self, market: Dict, current_time: datetime) -> Optional[EndgameOpportunity]:
        """Analyze a single market for endgame opportunities"""
        try:
            market_id = market['id']
            
            # Get current prices for all outcomes
            prices = self.polymarket.get_market_prices(market_id)
            if not prices:
                return None
            
            # Calculate time to resolution
            end_date = datetime.fromisoformat(market['end_date_iso'].replace('Z', '+00:00'))
            time_to_resolution = end_date - current_time
            hours_to_resolution = time_to_resolution.total_seconds() / 3600
            
            # Find the best high-probability opportunity
            best_opportunity = None
            best_return = 0
            
            for token_id, price_data in prices.items():
                mid_price = price_data['mid_price']
                spread = price_data['spread']
                
                # Check if this meets our probability threshold
                if mid_price >= self.min_probability:
                    # Check spread requirements
                    spread_pct = spread / mid_price if mid_price > 0 else 1
                    if spread_pct > self.min_spread:
                        continue  # Spread too wide
                    
                    # Calculate potential returns
                    potential_return = (1.0 - mid_price) / mid_price
                    annualized_return = potential_return * (365 * 24 / hours_to_resolution)
                    
                    if potential_return > best_return:
                        # Calculate liquidity score
                        liquidity_score = self._calculate_liquidity_score(price_data)
                        
                        # Calculate confidence score
                        confidence_score = self._calculate_confidence_score(
                            market, price_data, hours_to_resolution
                        )
                        
                        best_opportunity = EndgameOpportunity(
                            market_id=market_id,
                            token_id=token_id,
                            question=market['question'],
                            outcome=price_data['outcome'],
                            probability=mid_price,
                            price=mid_price,
                            potential_return_pct=potential_return * 100,
                            annualized_return_pct=annualized_return * 100,
                            hours_to_resolution=hours_to_resolution,
                            volume_24h=float(market.get('volume_24hr', 0)),
                            spread=spread,
                            liquidity_score=liquidity_score,
                            confidence_score=confidence_score
                        )
                        best_return = potential_return
            
            return best_opportunity
            
        except Exception as e:
            logger.error(f"Error analyzing market {market.get('id', 'unknown')}: {e}")
            return None
    
    def _calculate_liquidity_score(self, price_data: Dict) -> float:
        """Calculate liquidity score based on bid/ask sizes and spread"""
        try:
            bid_size = price_data.get('bid_size', 0)
            ask_size = price_data.get('ask_size', 0)
            spread = price_data.get('spread', 1)
            mid_price = price_data.get('mid_price', 0.5)
            
            # Size component (0-50 points)
            avg_size = (bid_size + ask_size) / 2
            size_score = min(avg_size / 100, 50)  # Max 50 points for 100+ shares
            
            # Spread component (0-50 points)
            spread_pct = spread / mid_price if mid_price > 0 else 1
            spread_score = max(0, 50 - (spread_pct * 1000))  # Lower spread = higher score
            
            return size_score + spread_score
            
        except Exception as e:
            logger.debug(f"Error calculating liquidity score: {e}")
            return 0
    
    def _calculate_confidence_score(self, market: Dict, price_data: Dict, hours_to_resolution: float) -> float:
        """Calculate confidence score based on market characteristics"""
        try:
            score = 0
            
            # Probability component (0-30 points)
            probability = price_data.get('mid_price', 0.5)
            if probability >= 0.99:
                score += 30
            elif probability >= 0.97:
                score += 25
            elif probability >= 0.95:
                score += 20
            elif probability >= 0.90:
                score += 10
            
            # Time component (0-25 points)
            if hours_to_resolution <= 6:
                score += 25  # Very soon
            elif hours_to_resolution <= 12:
                score += 20
            elif hours_to_resolution <= 24:
                score += 15
            elif hours_to_resolution <= 48:
                score += 10
            
            # Volume component (0-25 points)
            volume_24h = float(market.get('volume_24hr', 0))
            if volume_24h >= 10000:
                score += 25
            elif volume_24h >= 5000:
                score += 20
            elif volume_24h >= 1000:
                score += 15
            elif volume_24h >= 500:
                score += 10
            
            # Market category bonus (0-20 points)
            category = market.get('category', '').lower()
            question = market.get('question', '').lower()
            
            # High confidence categories
            if any(term in question for term in ['unemployment', 'gdp', 'inflation', 'fed rate']):
                score += 15  # Economic data releases
            elif any(term in question for term in ['super bowl', 'world series', 'championship']):
                score += 10  # Major sports events
            elif 'weather' in category or 'temperature' in question:
                score += 12  # Weather events
            elif 'election' in question and 'uncontested' in question:
                score += 20  # Uncontested elections
            
            return min(score, 100)  # Cap at 100
            
        except Exception as e:
            logger.debug(f"Error calculating confidence score: {e}")
            return 50  # Default moderate confidence
    
    def _format_opportunity(self, opportunity: EndgameOpportunity) -> Dict:
        """Format opportunity for trading engine"""
        return {
            'market_id': opportunity.market_id,
            'token_id': opportunity.token_id,
            'question': opportunity.question,
            'outcome': opportunity.outcome,
            'probability': opportunity.probability,
            'price': opportunity.price,
            'expected_return_pct': opportunity.potential_return_pct,
            'annualized_return_pct': opportunity.annualized_return_pct,
            'hours_to_resolution': opportunity.hours_to_resolution,
            'volume_24h': opportunity.volume_24h,
            'spread': opportunity.spread,
            'liquidity_score': opportunity.liquidity_score,
            'confidence_score': opportunity.confidence_score,
            'strategy': 'endgame',
            'suggested_size': self._calculate_suggested_position_size(opportunity),
            'max_size': self._calculate_max_position_size(opportunity)
        }
    
    def _calculate_suggested_position_size(self, opportunity: EndgameOpportunity) -> float:
        """Calculate suggested position size in USD"""
        try:
            # Base size from configuration
            base_size = 50.0  # $50 base position
            
            # Adjust based on confidence
            confidence_multiplier = opportunity.confidence_score / 50  # 0.5 - 2.0 range
            
            # Adjust based on return potential
            return_multiplier = min(opportunity.potential_return_pct / 5, 2.0)  # Cap at 2x
            
            # Adjust based on time to resolution
            time_multiplier = 2.0 if opportunity.hours_to_resolution <= 12 else 1.0
            
            suggested_size = base_size * confidence_multiplier * return_multiplier * time_multiplier
            
            # Cap at reasonable limits
            return min(suggested_size, 200.0)  # Max $200 per position
            
        except Exception as e:
            logger.debug(f"Error calculating position size: {e}")
            return 25.0  # Conservative default
    
    def _calculate_max_position_size(self, opportunity: EndgameOpportunity) -> float:
        """Calculate maximum allowable position size"""
        try:
            # Base on available liquidity
            avg_liquidity = (opportunity.volume_24h / 24) * 0.1  # 10% of hourly volume
            
            # Factor in our suggested size
            suggested = self._calculate_suggested_position_size(opportunity)
            
            # Use smaller of liquidity-based or strategy-based limit
            return min(avg_liquidity, suggested * 2.0, 500.0)  # Absolute max $500
            
        except Exception as e:
            logger.debug(f"Error calculating max position size: {e}")
            return 100.0  # Conservative default
    
    def get_status(self) -> Dict[str, any]:
        """Get strategy status and performance metrics"""
        return {
            'enabled': self.enabled,
            'name': 'Endgame Arbitrage',
            'min_probability': self.min_probability,
            'max_hours': self.max_hours,
            'min_volume': self.min_volume,
            'opportunities_scanned': self.opportunities_scanned,
            'opportunities_found': self.opportunities_found,
            'last_scan': self.last_scan_time.isoformat() if self.last_scan_time else None,
            'scan_duration_ms': self.scan_duration_ms,
            'success_rate': (self.opportunities_found / max(self.opportunities_scanned, 1)) * 100
        }
    
    def update_config(self, new_config: Dict):
        """Update strategy configuration"""
        if 'min_probability' in new_config:
            self.min_probability = float(new_config['min_probability'])
        if 'max_hours' in new_config:
            self.max_hours = int(new_config['max_hours'])
        if 'min_volume' in new_config:
            self.min_volume = float(new_config['min_volume'])
        if 'enabled' in new_config:
            self.enabled = bool(new_config['enabled'])
        
        logger.info(f"Endgame strategy config updated: {new_config}")