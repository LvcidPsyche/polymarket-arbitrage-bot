"""
Cross-Platform Arbitrage Strategy
Identifies price differences between Polymarket and other prediction markets
like Kalshi, PredictIt, etc. Currently focused on Polymarket vs Kalshi.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from ..utils.config import get_config
from ..integrations.polymarket_client import get_polymarket_client

logger = logging.getLogger(__name__)

@dataclass
class CrossPlatformOpportunity:
    """Cross-platform arbitrage opportunity"""
    market_id: str
    token_id: str
    question: str
    outcome: str
    polymarket_price: float
    external_price: float
    price_difference: float
    profit_potential_pct: float
    external_platform: str
    volume_24h: float
    confidence_score: float
    execution_complexity: str

class CrossPlatformStrategy:
    """Cross-platform arbitrage strategy implementation"""
    
    def __init__(self):
        self.config = get_config().cross_platform
        self.polymarket = get_polymarket_client()
        self.enabled = self.config.enabled
        
        # Strategy parameters
        self.min_spread_pct = self.config.min_spread_pct
        self.min_volume = self.config.min_volume_24h
        self.kalshi_enabled = self.config.kalshi_enabled
        
        # External platform data sources
        self.external_sources = {
            'kalshi': 'https://trading-api.kalshi.com/trade-api/v2/',
            'predictit': None,  # Not implemented
            'manifold': None    # Not implemented
        }
        
        # Performance tracking
        self.opportunities_scanned = 0
        self.opportunities_found = 0
        self.last_scan_time: Optional[datetime] = None
        self.scan_duration_ms = 0
        
        # Market mapping cache
        self.market_mappings: Dict[str, Dict] = {}
    
    def is_enabled(self) -> bool:
        """Check if strategy is enabled"""
        return self.enabled and self.kalshi_enabled  # Currently requires Kalshi
    
    async def scan_opportunities(self) -> List[Dict]:
        """Scan for cross-platform arbitrage opportunities"""
        if not self.is_enabled():
            return []
        
        scan_start = datetime.now(timezone.utc)
        opportunities = []
        
        try:
            logger.debug("Scanning for cross-platform arbitrage opportunities")
            
            # Get comparable markets from both platforms
            poly_markets = self._get_polymarket_markets()
            kalshi_markets = self._get_kalshi_markets() if self.kalshi_enabled else []
            
            # Find matching markets
            matched_markets = self._match_markets(poly_markets, kalshi_markets)
            self.opportunities_scanned = len(matched_markets)
            
            # Analyze each matched market pair
            for poly_market, external_market in matched_markets:
                try:
                    opportunity = await self._analyze_market_pair(poly_market, external_market)
                    if opportunity:
                        opportunities.append(self._format_opportunity(opportunity))
                        
                except Exception as e:
                    logger.warning(f"Error analyzing market pair: {e}")
            
            # Sort by profit potential
            opportunities.sort(key=lambda x: x.get('profit_potential_pct', 0), reverse=True)
            
            # Filter top opportunities
            top_opportunities = opportunities[:3]  # Limit to top 3 (these are complex)
            self.opportunities_found = len(top_opportunities)
            
            # Update performance metrics
            scan_duration = datetime.now(timezone.utc) - scan_start
            self.scan_duration_ms = scan_duration.total_seconds() * 1000
            self.last_scan_time = scan_start
            
            if top_opportunities:
                logger.info(f"Found {len(top_opportunities)} cross-platform opportunities")
                best = top_opportunities[0]
                logger.info(f"Best: {best['profit_potential_pct']:.1f}% spread")
            
            return top_opportunities
            
        except Exception as e:
            logger.error(f"Cross-platform strategy scan failed: {e}")
            return []
    
    def _get_polymarket_markets(self) -> List[Dict]:
        """Get active markets from Polymarket"""
        try:
            markets = self.polymarket.get_markets(active=True, limit=100)
            
            # Filter for markets with sufficient volume
            filtered_markets = []
            for market in markets:
                volume_24h = float(market.get('volume_24hr', 0))
                if volume_24h >= self.min_volume:
                    filtered_markets.append(market)
            
            return filtered_markets
            
        except Exception as e:
            logger.error(f"Error getting Polymarket markets: {e}")
            return []
    
    def _get_kalshi_markets(self) -> List[Dict]:
        """Get markets from Kalshi (placeholder implementation)"""
        # NOTE: This is a simplified implementation
        # In production, you would need:
        # 1. Kalshi API client with authentication
        # 2. Proper rate limiting
        # 3. Market data parsing
        # 4. Error handling
        
        try:
            # For demonstration, return common market types that exist on both platforms
            kalshi_markets = [
                {
                    'id': 'fed_rate_march_2024',
                    'question': 'Will the Federal Reserve raise rates in March 2024?',
                    'outcomes': ['YES', 'NO'],
                    'prices': {'YES': 0.75, 'NO': 0.25},
                    'volume_24h': 50000,
                    'category': 'economics'
                },
                {
                    'id': 'btc_100k_2024',
                    'question': 'Will Bitcoin reach $100,000 in 2024?',
                    'outcomes': ['YES', 'NO'], 
                    'prices': {'YES': 0.60, 'NO': 0.40},
                    'volume_24h': 25000,
                    'category': 'crypto'
                },
                {
                    'id': 'unemployment_february_2024',
                    'question': 'Will US unemployment be above 4% in February 2024?',
                    'outcomes': ['YES', 'NO'],
                    'prices': {'YES': 0.35, 'NO': 0.65},
                    'volume_24h': 15000,
                    'category': 'economics'
                }
            ]
            
            logger.debug(f"Retrieved {len(kalshi_markets)} Kalshi markets (demo data)")
            return kalshi_markets
            
        except Exception as e:
            logger.error(f"Error getting Kalshi markets: {e}")
            return []
    
    def _match_markets(self, poly_markets: List[Dict], kalshi_markets: List[Dict]) -> List[Tuple[Dict, Dict]]:
        """Match markets between platforms based on question similarity"""
        matches = []
        
        try:
            for poly_market in poly_markets:
                poly_question = poly_market['question'].lower()
                
                for kalshi_market in kalshi_markets:
                    kalshi_question = kalshi_market['question'].lower()
                    
                    # Simple keyword matching (in production, use more sophisticated NLP)
                    similarity_score = self._calculate_question_similarity(poly_question, kalshi_question)
                    
                    if similarity_score > 0.7:  # 70% similarity threshold
                        matches.append((poly_market, kalshi_market))
                        break  # One match per Polymarket
            
            logger.debug(f"Matched {len(matches)} market pairs")
            return matches
            
        except Exception as e:
            logger.error(f"Error matching markets: {e}")
            return []
    
    def _calculate_question_similarity(self, question1: str, question2: str) -> float:
        """Calculate similarity between two market questions"""
        try:
            # Simple keyword-based similarity
            # In production, use proper NLP similarity measures
            
            # Extract key terms
            key_terms_1 = set(self._extract_key_terms(question1))
            key_terms_2 = set(self._extract_key_terms(question2))
            
            if not key_terms_1 or not key_terms_2:
                return 0.0
            
            # Calculate Jaccard similarity
            intersection = len(key_terms_1.intersection(key_terms_2))
            union = len(key_terms_1.union(key_terms_2))
            
            return intersection / union if union > 0 else 0.0
            
        except Exception as e:
            logger.debug(f"Error calculating similarity: {e}")
            return 0.0
    
    def _extract_key_terms(self, question: str) -> List[str]:
        """Extract key terms from a market question"""
        # Remove common words and extract meaningful terms
        stop_words = {
            'will', 'be', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
            'a', 'an', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'by'
        }
        
        terms = []
        words = question.lower().replace('?', '').split()
        
        for word in words:
            # Clean word
            clean_word = word.strip('.,!?;:')
            
            # Skip stop words and short words
            if len(clean_word) > 2 and clean_word not in stop_words:
                terms.append(clean_word)
        
        return terms
    
    async def _analyze_market_pair(self, poly_market: Dict, external_market: Dict) -> Optional[CrossPlatformOpportunity]:
        """Analyze a pair of matched markets for arbitrage opportunities"""
        try:
            # Get current Polymarket prices
            poly_prices = self.polymarket.get_market_prices(poly_market['id'])
            if not poly_prices:
                return None
            
            # Find best arbitrage opportunity between outcomes
            best_opportunity = None
            best_profit = 0
            
            for token_id, poly_price_data in poly_prices.items():
                outcome = poly_price_data['outcome']
                poly_price = poly_price_data['mid_price']
                
                # Find corresponding outcome in external market
                external_price = external_market['prices'].get(outcome)
                if external_price is None:
                    continue
                
                # Calculate potential profit
                price_difference = abs(poly_price - external_price)
                
                if price_difference >= self.min_spread_pct:
                    # Determine which side to trade
                    if poly_price < external_price:
                        # Buy on Polymarket, sell on external platform
                        profit_potential = external_price - poly_price
                        execution_side = "buy_poly_sell_external"
                    else:
                        # Sell on Polymarket, buy on external platform  
                        profit_potential = poly_price - external_price
                        execution_side = "sell_poly_buy_external"
                    
                    profit_pct = (profit_potential / min(poly_price, external_price)) * 100
                    
                    if profit_pct > best_profit:
                        # Calculate confidence score
                        confidence_score = self._calculate_cross_platform_confidence(
                            poly_market, external_market, price_difference
                        )
                        
                        best_opportunity = CrossPlatformOpportunity(
                            market_id=poly_market['id'],
                            token_id=token_id,
                            question=poly_market['question'],
                            outcome=outcome,
                            polymarket_price=poly_price,
                            external_price=external_price,
                            price_difference=price_difference,
                            profit_potential_pct=profit_pct,
                            external_platform='kalshi',
                            volume_24h=float(poly_market.get('volume_24hr', 0)),
                            confidence_score=confidence_score,
                            execution_complexity=execution_side
                        )
                        best_profit = profit_pct
            
            return best_opportunity
            
        except Exception as e:
            logger.error(f"Error analyzing market pair: {e}")
            return None
    
    def _calculate_cross_platform_confidence(self, poly_market: Dict, external_market: Dict, price_diff: float) -> float:
        """Calculate confidence score for cross-platform arbitrage"""
        try:
            score = 0
            
            # Price difference component (0-30 points)
            if price_diff >= 0.10:  # 10%+ difference
                score += 30
            elif price_diff >= 0.05:  # 5%+ difference
                score += 20
            elif price_diff >= 0.03:  # 3%+ difference
                score += 15
            elif price_diff >= 0.01:  # 1%+ difference
                score += 10
            
            # Volume component (0-25 points)
            poly_volume = float(poly_market.get('volume_24hr', 0))
            external_volume = float(external_market.get('volume_24h', 0))
            min_volume = min(poly_volume, external_volume)
            
            if min_volume >= 10000:
                score += 25
            elif min_volume >= 5000:
                score += 20
            elif min_volume >= 1000:
                score += 15
            elif min_volume >= 500:
                score += 10
            
            # Market category stability (0-25 points)
            category = poly_market.get('category', '').lower()
            if 'economics' in category or 'politics' in category:
                score += 20  # More stable categories
            elif 'sports' in category:
                score += 15  # Moderately stable
            elif 'crypto' in category:
                score += 10  # Volatile but predictable
            
            # Question clarity (0-20 points)
            question = poly_market['question'].lower()
            if any(term in question for term in ['unemployment', 'gdp', 'inflation', 'election']):
                score += 20  # Clear, objective outcomes
            elif any(term in question for term in ['price', 'above', 'below']):
                score += 15  # Quantitative outcomes
            else:
                score += 10  # Subjective outcomes
            
            return min(score, 100)  # Cap at 100
            
        except Exception as e:
            logger.debug(f"Error calculating cross-platform confidence: {e}")
            return 50  # Default moderate confidence
    
    def _format_opportunity(self, opportunity: CrossPlatformOpportunity) -> Dict:
        """Format opportunity for trading engine"""
        return {
            'market_id': opportunity.market_id,
            'token_id': opportunity.token_id,
            'question': opportunity.question,
            'outcome': opportunity.outcome,
            'price': opportunity.polymarket_price,
            'external_price': opportunity.external_price,
            'price_difference': opportunity.price_difference,
            'expected_return_pct': opportunity.profit_potential_pct,
            'profit_potential_pct': opportunity.profit_potential_pct,
            'external_platform': opportunity.external_platform,
            'volume_24h': opportunity.volume_24h,
            'confidence_score': opportunity.confidence_score,
            'execution_complexity': opportunity.execution_complexity,
            'strategy': 'cross_platform',
            'suggested_size': self._calculate_suggested_position_size(opportunity),
            'max_size': self._calculate_max_position_size(opportunity),
            'requires_external_account': True,  # Flag for manual intervention
            'execution_notes': self._generate_execution_notes(opportunity)
        }
    
    def _calculate_suggested_position_size(self, opportunity: CrossPlatformOpportunity) -> float:
        """Calculate suggested position size for cross-platform arbitrage"""
        try:
            # More conservative sizing due to execution complexity
            base_size = 25.0  # $25 base position
            
            # Adjust based on confidence and profit potential
            confidence_multiplier = opportunity.confidence_score / 50  # 0.5 - 2.0 range
            profit_multiplier = min(opportunity.profit_potential_pct / 10, 1.5)  # Cap at 1.5x
            
            suggested_size = base_size * confidence_multiplier * profit_multiplier
            
            # Conservative cap due to execution complexity
            return min(suggested_size, 100.0)  # Max $100 per cross-platform trade
            
        except Exception as e:
            logger.debug(f"Error calculating cross-platform position size: {e}")
            return 15.0  # Very conservative default
    
    def _calculate_max_position_size(self, opportunity: CrossPlatformOpportunity) -> float:
        """Calculate maximum position size"""
        try:
            # Very conservative for cross-platform trades
            suggested = self._calculate_suggested_position_size(opportunity)
            return min(suggested * 1.5, 150.0)  # Absolute max $150
            
        except Exception as e:
            logger.debug(f"Error calculating max cross-platform position size: {e}")
            return 50.0  # Conservative default
    
    def _generate_execution_notes(self, opportunity: CrossPlatformOpportunity) -> str:
        """Generate execution notes for cross-platform arbitrage"""
        if opportunity.polymarket_price < opportunity.external_price:
            return f"Buy {opportunity.outcome} on Polymarket at ${opportunity.polymarket_price:.3f}, sell on {opportunity.external_platform} at ${opportunity.external_price:.3f}"
        else:
            return f"Sell {opportunity.outcome} on Polymarket at ${opportunity.polymarket_price:.3f}, buy on {opportunity.external_platform} at ${opportunity.external_price:.3f}"
    
    def get_status(self) -> Dict[str, any]:
        """Get strategy status and performance metrics"""
        return {
            'enabled': self.enabled,
            'name': 'Cross-Platform Arbitrage',
            'kalshi_enabled': self.kalshi_enabled,
            'min_spread_pct': self.min_spread_pct,
            'min_volume': self.min_volume,
            'opportunities_scanned': self.opportunities_scanned,
            'opportunities_found': self.opportunities_found,
            'last_scan': self.last_scan_time.isoformat() if self.last_scan_time else None,
            'scan_duration_ms': self.scan_duration_ms,
            'success_rate': (self.opportunities_found / max(self.opportunities_scanned, 1)) * 100,
            'external_platforms': list(self.external_sources.keys())
        }
    
    def update_config(self, new_config: Dict):
        """Update strategy configuration"""
        if 'min_spread_pct' in new_config:
            self.min_spread_pct = float(new_config['min_spread_pct'])
        if 'min_volume' in new_config:
            self.min_volume = float(new_config['min_volume'])
        if 'kalshi_enabled' in new_config:
            self.kalshi_enabled = bool(new_config['kalshi_enabled'])
        if 'enabled' in new_config:
            self.enabled = bool(new_config['enabled'])
        
        logger.info(f"Cross-platform strategy config updated: {new_config}")