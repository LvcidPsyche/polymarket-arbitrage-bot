"""
Polymarket API Client
Official py-clob-client wrapper with enhanced functionality for arbitrage trading.
"""

import asyncio
import json
import logging
import time
from decimal import Decimal
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timezone

import requests
from py_clob_client.client import ClobClient
from py_clob_client.constants import POLYGON
from py_clob_client.order_builder.constants import BUY, SELL

from .wallet_manager import get_wallet
from ..utils.config import get_config
from ..data.database import market_repo, trade_repo
from ..data.models import Market, Token, TradeType, TradeStatus

logger = logging.getLogger(__name__)

class PolymarketClient:
    """Enhanced Polymarket client with arbitrage-focused features"""
    
    def __init__(self):
        self.config = get_config()
        self.wallet = get_wallet()
        self._client: Optional[ClobClient] = None
        self._rate_limiter = RateLimiter(self.config.api.rate_limit_per_second)
    
    def initialize(self):
        """Initialize the Polymarket client"""
        if self._client is None:
            self.wallet.initialize()
            
            try:
                # Initialize py-clob-client
                self._client = ClobClient(
                    host=self.config.api.polymarket_api_url,
                    key=self.wallet.account.key,
                    chain_id=POLYGON,
                    signature_type=2,  # EOA signature
                    funder=self.wallet.address.lower()
                )
                
                # Test connection
                self._test_connection()
                logger.info("Polymarket client initialized successfully")
                
            except Exception as e:
                logger.error(f"Failed to initialize Polymarket client: {e}")
                raise
    
    def _test_connection(self):
        """Test API connection and authentication"""
        try:
            # Test with a simple API call
            markets = self.get_markets(limit=1)
            if not markets:
                raise ConnectionError("No markets returned")
            
            logger.info("Polymarket API connection test successful")
            
        except Exception as e:
            logger.error(f"API connection test failed: {e}")
            raise
    
    @property
    def client(self) -> ClobClient:
        """Get the initialized client"""
        if self._client is None:
            self.initialize()
        return self._client
    
    async def _rate_limited_request(self, func, *args, **kwargs):
        """Execute request with rate limiting"""
        await self._rate_limiter.acquire()
        return func(*args, **kwargs)
    
    def get_markets(
        self,
        active: bool = True,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get list of markets from Polymarket"""
        try:
            url = f"{self.config.api.polymarket_api_url}/markets"
            params = {
                'active': str(active).lower(),
                'limit': limit,
                'offset': offset
            }
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            return data.get('data', [])
            
        except Exception as e:
            logger.error(f"Failed to fetch markets: {e}")
            return []
    
    def get_market_by_id(self, market_id: str) -> Optional[Dict]:
        """Get detailed market information"""
        try:
            url = f"{self.config.api.polymarket_api_url}/markets/{market_id}"
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Failed to fetch market {market_id}: {e}")
            return None
    
    def get_order_book(self, token_id: str) -> Optional[Dict]:
        """Get order book for a specific token"""
        try:
            book = self.client.get_order_book(token_id)
            return {
                'bids': [(float(b['price']), float(b['size'])) for b in book.bids],
                'asks': [(float(a['price']), float(a['size'])) for a in book.asks],
                'timestamp': time.time()
            }
            
        except Exception as e:
            logger.error(f"Failed to get order book for {token_id}: {e}")
            return None
    
    def get_market_prices(self, market_id: str) -> Dict[str, Dict]:
        """Get current prices for all tokens in a market"""
        try:
            # First get market details to find tokens
            market_data = self.get_market_by_id(market_id)
            if not market_data:
                return {}
            
            prices = {}
            for token in market_data.get('tokens', []):
                token_id = token['token_id']
                book = self.get_order_book(token_id)
                
                if book and book['bids'] and book['asks']:
                    prices[token_id] = {
                        'outcome': token['outcome'],
                        'best_bid': book['bids'][0][0],
                        'best_ask': book['asks'][0][0],
                        'mid_price': (book['bids'][0][0] + book['asks'][0][0]) / 2,
                        'spread': book['asks'][0][0] - book['bids'][0][0],
                        'bid_size': book['bids'][0][1],
                        'ask_size': book['asks'][0][1],
                        'timestamp': book['timestamp']
                    }
            
            return prices
            
        except Exception as e:
            logger.error(f"Failed to get market prices for {market_id}: {e}")
            return {}
    
    def place_order(
        self,
        token_id: str,
        side: str,  # BUY or SELL
        size: float,
        price: float,
        order_type: str = "GTC"  # Good Till Cancelled
    ) -> Optional[str]:
        """Place an order on Polymarket"""
        try:
            # Validate inputs
            if side not in [BUY, SELL]:
                raise ValueError(f"Invalid side: {side}")
            
            if price <= 0 or price >= 1:
                raise ValueError(f"Price must be between 0 and 1: {price}")
            
            if size <= 0:
                raise ValueError(f"Size must be positive: {size}")
            
            # Check if dry run
            if self.config.dry_run:
                logger.info(f"DRY RUN: Would place {side} order for {size} shares at ${price} on token {token_id}")
                return f"dry_run_{int(time.time())}"
            
            # Build order using py-clob-client
            order = self.client.create_order(
                token_id=token_id,
                price=price,
                size=size,
                side=side,
                fee_rate_bps=0,  # Will be calculated by client
                nonce=int(time.time() * 1000)
            )
            
            # Submit order
            resp = self.client.post_order(order, OrderType.GTC)
            
            order_id = resp.get('orderID')
            if order_id:
                logger.info(f"Order placed successfully: {order_id}")
                logger.info(f"  Token: {token_id}")
                logger.info(f"  Side: {side}")
                logger.info(f"  Size: {size}")
                logger.info(f"  Price: ${price}")
            else:
                logger.error(f"Order placement failed: {resp}")
            
            return order_id
            
        except Exception as e:
            logger.error(f"Failed to place order: {e}")
            return None
    
    def cancel_order(self, order_id: str) -> bool:
        """Cancel an existing order"""
        try:
            if self.config.dry_run:
                logger.info(f"DRY RUN: Would cancel order {order_id}")
                return True
            
            resp = self.client.cancel_order(order_id)
            success = resp.get('success', False)
            
            if success:
                logger.info(f"Order cancelled: {order_id}")
            else:
                logger.error(f"Failed to cancel order {order_id}: {resp}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to cancel order {order_id}: {e}")
            return False
    
    def get_order_status(self, order_id: str) -> Optional[Dict]:
        """Get status of a specific order"""
        try:
            orders = self.client.get_orders()
            for order in orders:
                if order['orderID'] == order_id:
                    return {
                        'order_id': order['orderID'],
                        'status': order['status'],
                        'filled_size': float(order.get('sizeFilled', 0)),
                        'remaining_size': float(order.get('sizeRemaining', 0)),
                        'average_price': float(order.get('avgFillPrice', 0)) if order.get('avgFillPrice') else None
                    }
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get order status {order_id}: {e}")
            return None
    
    def get_positions(self) -> List[Dict]:
        """Get current trading positions"""
        try:
            positions = []
            balances = self.client.get_balances()
            
            for balance in balances:
                if float(balance['balance']) > 0:
                    positions.append({
                        'token_id': balance['asset_id'],
                        'balance': float(balance['balance']),
                        'market_id': balance.get('market_id'),
                        'outcome': balance.get('outcome')
                    })
            
            return positions
            
        except Exception as e:
            logger.error(f"Failed to get positions: {e}")
            return []
    
    def calculate_trade_cost(
        self,
        token_id: str,
        side: str,
        size: float,
        price: float
    ) -> Dict[str, float]:
        """Calculate total cost including fees for a trade"""
        try:
            # Get fee rate (usually 1 basis point on Polymarket)
            fee_rate = 0.0001  # 0.01%
            
            if side == BUY:
                cost = size * price
                fees = cost * fee_rate
                total_cost = cost + fees
            else:  # SELL
                proceeds = size * price
                fees = proceeds * fee_rate
                total_cost = proceeds - fees
            
            return {
                'base_cost': cost if side == BUY else proceeds,
                'fees': fees,
                'total_cost': total_cost,
                'fee_rate': fee_rate
            }
            
        except Exception as e:
            logger.error(f"Failed to calculate trade cost: {e}")
            return {}
    
    def get_endgame_opportunities(
        self,
        min_probability: float = 0.95,
        max_hours: int = 48,
        min_volume: float = 1000.0
    ) -> List[Dict]:
        """Find endgame arbitrage opportunities"""
        try:
            opportunities = []
            markets = self.get_markets(active=True, limit=100)
            
            current_time = datetime.now(timezone.utc)
            
            for market in markets:
                # Check if market ends soon
                end_date = datetime.fromisoformat(market['end_date_iso'].replace('Z', '+00:00'))
                hours_left = (end_date - current_time).total_seconds() / 3600
                
                if hours_left <= 0 or hours_left > max_hours:
                    continue
                
                # Check volume
                volume_24h = float(market.get('volume_24hr', 0))
                if volume_24h < min_volume:
                    continue
                
                # Get current prices
                prices = self.get_market_prices(market['id'])
                
                for token_id, price_data in prices.items():
                    # Look for high-probability outcomes
                    mid_price = price_data['mid_price']
                    
                    if mid_price >= min_probability:
                        potential_return = (1.0 - mid_price) / mid_price
                        annualized_return = potential_return * (365 * 24 / hours_left)
                        
                        opportunities.append({
                            'market_id': market['id'],
                            'token_id': token_id,
                            'question': market['question'],
                            'outcome': price_data['outcome'],
                            'probability': mid_price,
                            'price': mid_price,
                            'potential_return_pct': potential_return * 100,
                            'annualized_return_pct': annualized_return * 100,
                            'hours_left': hours_left,
                            'volume_24h': volume_24h,
                            'spread': price_data['spread'],
                            'bid_size': price_data['bid_size'],
                            'ask_size': price_data['ask_size'],
                            'trade_type': TradeType.ENDGAME
                        })
            
            # Sort by potential return
            opportunities.sort(key=lambda x: x['potential_return_pct'], reverse=True)
            return opportunities
            
        except Exception as e:
            logger.error(f"Failed to find endgame opportunities: {e}")
            return []
    
    def get_intramarket_opportunities(
        self,
        max_price_sum: float = 0.98,
        min_profit_margin: float = 0.02
    ) -> List[Dict]:
        """Find intra-market arbitrage opportunities (YES + NO ≠ $1.00)"""
        try:
            opportunities = []
            markets = self.get_markets(active=True, limit=100)
            
            for market in markets:
                prices = self.get_market_prices(market['id'])
                
                # Look for binary markets (YES/NO)
                if len(prices) != 2:
                    continue
                
                tokens = list(prices.items())
                if len(tokens) != 2:
                    continue
                
                token1_id, price1 = tokens[0]
                token2_id, price2 = tokens[1]
                
                # Calculate total price (should be ~$1.00)
                total_mid_price = price1['mid_price'] + price2['mid_price']
                
                if total_mid_price < max_price_sum:
                    profit_opportunity = 1.0 - total_mid_price
                    
                    if profit_opportunity >= min_profit_margin:
                        opportunities.append({
                            'market_id': market['id'],
                            'question': market['question'],
                            'token1_id': token1_id,
                            'token2_id': token2_id,
                            'token1_outcome': price1['outcome'],
                            'token2_outcome': price2['outcome'],
                            'token1_price': price1['mid_price'],
                            'token2_price': price2['mid_price'],
                            'total_price': total_mid_price,
                            'profit_opportunity': profit_opportunity,
                            'profit_margin_pct': profit_opportunity * 100,
                            'volume_24h': float(market.get('volume_24hr', 0)),
                            'trade_type': TradeType.INTRA_MARKET
                        })
            
            # Sort by profit margin
            opportunities.sort(key=lambda x: x['profit_margin_pct'], reverse=True)
            return opportunities
            
        except Exception as e:
            logger.error(f"Failed to find intramarket opportunities: {e}")
            return []
    
    def health_check(self) -> Dict[str, Any]:
        """Check Polymarket API health"""
        try:
            self.initialize()
            
            # Test basic API functionality
            markets = self.get_markets(limit=1)
            balances = self.get_positions()
            
            return {
                'connected': True,
                'api_url': self.config.api.polymarket_api_url,
                'markets_accessible': len(markets) > 0,
                'balances_accessible': isinstance(balances, list),
                'wallet_address': self.wallet.address,
            }
            
        except Exception as e:
            logger.error(f"Polymarket health check failed: {e}")
            return {
                'connected': False,
                'error': str(e)
            }

class RateLimiter:
    """Simple rate limiter for API calls"""
    
    def __init__(self, calls_per_second: float):
        self.calls_per_second = calls_per_second
        self.min_interval = 1.0 / calls_per_second
        self.last_call = 0
    
    async def acquire(self):
        """Wait if necessary to respect rate limit"""
        now = time.time()
        elapsed = now - self.last_call
        
        if elapsed < self.min_interval:
            wait_time = self.min_interval - elapsed
            await asyncio.sleep(wait_time)
        
        self.last_call = time.time()

from py_clob_client.order_builder.constants import OrderType

# Global client instance
polymarket_client = PolymarketClient()

def get_polymarket_client() -> PolymarketClient:
    """Get the global Polymarket client"""
    return polymarket_client