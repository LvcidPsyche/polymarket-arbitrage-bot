"""
Main Trading Engine
Orchestrates the entire autonomous trading system with strategy execution,
risk management, and trade lifecycle management.
"""

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional, Set
from dataclasses import dataclass
from enum import Enum

from ..utils.config import get_config
from ..data.database import (
    trade_repo, market_repo, opportunity_repo, 
    get_session
)
from ..data.models import (
    Trade, TradeType, TradeStatus, Market, 
    OpportunityLog
)
from ..integrations.polymarket_client import get_polymarket_client
from ..integrations.wallet_manager import get_wallet
from .risk_manager import get_risk_manager, RiskLevel
from ..strategies.endgame_arbitrage import EndgameStrategy
from ..strategies.cross_platform import CrossPlatformStrategy  
from ..strategies.intra_market import IntraMarketStrategy

logger = logging.getLogger(__name__)

class EngineState(Enum):
    """Trading engine states"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    PAUSING = "pausing"
    PAUSED = "paused"
    EMERGENCY_SHUTDOWN = "emergency_shutdown"
    ERROR = "error"

@dataclass
class TradeExecution:
    """Trade execution result"""
    success: bool
    trade_id: Optional[int] = None
    order_id: Optional[str] = None
    error_message: Optional[str] = None
    executed_size: Decimal = Decimal('0')
    executed_price: Decimal = Decimal('0')

class TradingEngine:
    """Main autonomous trading engine"""
    
    def __init__(self):
        self.config = get_config()
        self.polymarket = get_polymarket_client()
        self.wallet = get_wallet()
        self.risk_manager = get_risk_manager()
        
        # Initialize strategies
        self.strategies = {
            TradeType.ENDGAME: EndgameStrategy(),
            TradeType.CROSS_PLATFORM: CrossPlatformStrategy(),
            TradeType.INTRA_MARKET: IntraMarketStrategy()
        }
        
        # Engine state
        self.state = EngineState.STOPPED
        self._shutdown_event = asyncio.Event()
        self._running_task: Optional[asyncio.Task] = None
        
        # Performance tracking
        self.cycle_count = 0
        self.opportunities_found = 0
        self.trades_executed = 0
        self.last_cycle_time = datetime.now(timezone.utc)
        
        # Active monitoring
        self.active_orders: Set[str] = set()
        self.monitored_trades: Set[int] = set()
    
    async def start(self):
        """Start the trading engine"""
        if self.state != EngineState.STOPPED:
            logger.warning(f"Cannot start engine in state: {self.state}")
            return
        
        logger.info("🚀 Starting Polymarket Arbitrage Trading Engine")
        self.state = EngineState.STARTING
        
        try:
            # Initialize components
            await self._initialize_components()
            
            # Start main trading loop
            self.state = EngineState.RUNNING
            self._running_task = asyncio.create_task(self._main_trading_loop())
            
            logger.info("✅ Trading engine started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start trading engine: {e}")
            self.state = EngineState.ERROR
            raise
    
    async def stop(self):
        """Stop the trading engine gracefully"""
        logger.info("🛑 Stopping trading engine...")
        
        if self.state == EngineState.RUNNING:
            self.state = EngineState.PAUSING
            self._shutdown_event.set()
            
            if self._running_task:
                await self._running_task
        
        # Cancel any pending orders
        await self._cancel_all_pending_orders()
        
        self.state = EngineState.STOPPED
        logger.info("✅ Trading engine stopped")
    
    async def emergency_shutdown(self):
        """Emergency shutdown with immediate stop"""
        logger.critical("🚨 EMERGENCY SHUTDOWN TRIGGERED")
        self.state = EngineState.EMERGENCY_SHUTDOWN
        self._shutdown_event.set()
        
        # Cancel all orders immediately
        await self._cancel_all_pending_orders()
        
        # Log emergency state
        logger.critical("Emergency shutdown complete - manual intervention required")
    
    async def _initialize_components(self):
        """Initialize all trading components"""
        logger.info("Initializing trading components...")
        
        # Initialize wallet and check balance
        self.wallet.initialize()
        eth_balance, usdc_balance = self.wallet.get_balance()
        logger.info(f"Wallet balance: {eth_balance:.4f} MATIC, {usdc_balance:.2f} USDC")
        
        if eth_balance < Decimal('0.1'):
            logger.warning("Low MATIC balance - may not have enough for gas fees")
        
        # Initialize Polymarket client
        self.polymarket.initialize()
        
        # Health checks
        wallet_health = self.wallet.health_check()
        poly_health = self.polymarket.health_check()
        
        if not wallet_health.get('connected'):
            raise ConnectionError("Wallet connection failed")
        
        if not poly_health.get('connected'):
            raise ConnectionError("Polymarket API connection failed")
        
        logger.info("All components initialized successfully")
    
    async def _main_trading_loop(self):
        """Main trading loop - runs continuously"""
        logger.info("Starting main trading loop...")
        
        try:
            while not self._shutdown_event.is_set():
                cycle_start = datetime.now(timezone.utc)
                
                # Check for emergency shutdown
                if self.risk_manager.check_emergency_shutdown():
                    await self.emergency_shutdown()
                    break
                
                # Run trading cycle
                await self._trading_cycle()
                
                # Update performance metrics
                self.cycle_count += 1
                self.last_cycle_time = cycle_start
                
                # Log periodic status
                if self.cycle_count % 10 == 0:
                    await self._log_engine_status()
                
                # Sleep before next cycle (configurable)
                await asyncio.sleep(self.config.heartbeat_interval)
                
        except Exception as e:
            logger.error(f"Trading loop error: {e}")
            self.state = EngineState.ERROR
        finally:
            logger.info("Trading loop stopped")
    
    async def _trading_cycle(self):
        """Single trading cycle"""
        try:
            # 1. Monitor existing positions
            await self._monitor_active_trades()
            
            # 2. Find new opportunities
            opportunities = await self._scan_opportunities()
            
            # 3. Evaluate and execute trades
            if opportunities:
                self.opportunities_found += len(opportunities)
                await self._evaluate_and_execute_opportunities(opportunities)
            
        except Exception as e:
            logger.error(f"Trading cycle error: {e}")
    
    async def _monitor_active_trades(self):
        """Monitor and manage active trades"""
        try:
            active_trades = trade_repo.get_active_trades()
            
            for trade in active_trades:
                await self._monitor_individual_trade(trade)
                
        except Exception as e:
            logger.error(f"Error monitoring active trades: {e}")
    
    async def _monitor_individual_trade(self, trade: Trade):
        """Monitor individual trade for stop-loss, resolution, etc."""
        try:
            # Check if order is filled
            if trade.status == TradeStatus.EXECUTED and trade.external_id:
                order_status = self.polymarket.get_order_status(trade.external_id)
                
                if order_status and order_status.get('status') == 'filled':
                    # Update trade status
                    trade_repo.update_trade_status(
                        trade.id,
                        TradeStatus.FILLED,
                        filled_size=Decimal(str(order_status.get('filled_size', 0))),
                        average_price=Decimal(str(order_status.get('average_price', 0)))
                    )
                    logger.info(f"Trade {trade.id} filled")
            
            # Check for stop-loss conditions
            elif trade.status == TradeStatus.FILLED:
                # Get current market price
                market_prices = self.polymarket.get_market_prices(trade.market_id)
                current_price_data = market_prices.get(trade.token_id)
                
                if current_price_data:
                    current_probability = Decimal(str(current_price_data['mid_price']))
                    
                    # Check stop-loss
                    if self.risk_manager.should_stop_loss(trade, current_probability):
                        await self._execute_stop_loss(trade)
            
            # Check for market resolution
            elif trade.status in [TradeStatus.FILLED, TradeStatus.EXECUTED]:
                market_data = self.polymarket.get_market_by_id(trade.market_id)
                
                if market_data and market_data.get('resolved'):
                    await self._handle_market_resolution(trade, market_data)
                    
        except Exception as e:
            logger.error(f"Error monitoring trade {trade.id}: {e}")
    
    async def _execute_stop_loss(self, trade: Trade):
        """Execute stop-loss for a position"""
        try:
            logger.warning(f"Executing stop-loss for trade {trade.id}")
            
            # Create opposite side order
            stop_loss_side = "SELL" if trade.side == "BUY" else "BUY"
            
            # Get current best price
            book = self.polymarket.get_order_book(trade.token_id)
            if not book:
                logger.error(f"Cannot get order book for stop-loss: {trade.token_id}")
                return
            
            # Use best bid/ask for immediate execution
            if stop_loss_side == "SELL" and book['bids']:
                price = book['bids'][0][0] * 0.99  # Slightly below best bid
            elif stop_loss_side == "BUY" and book['asks']:
                price = book['asks'][0][0] * 1.01  # Slightly above best ask
            else:
                logger.error("No liquidity available for stop-loss")
                return
            
            # Place stop-loss order
            order_id = self.polymarket.place_order(
                token_id=trade.token_id,
                side=stop_loss_side,
                size=float(trade.filled_size or trade.size),
                price=price
            )
            
            if order_id:
                # Create stop-loss trade record
                stop_loss_trade = trade_repo.create_trade(
                    market_id=trade.market_id,
                    token_id=trade.token_id,
                    trade_type=trade.trade_type,
                    side=stop_loss_side,
                    size=trade.filled_size or trade.size,
                    price=Decimal(str(price)),
                    external_id=order_id,
                    status=TradeStatus.EXECUTED,
                    strategy_data={'stop_loss_for': trade.id}
                )
                
                logger.info(f"Stop-loss order placed: {order_id}")
            else:
                logger.error(f"Failed to place stop-loss order for trade {trade.id}")
                
        except Exception as e:
            logger.error(f"Stop-loss execution failed for trade {trade.id}: {e}")
    
    async def _handle_market_resolution(self, trade: Trade, market_data: Dict):
        """Handle market resolution and P&L calculation"""
        try:
            winning_outcome = market_data.get('winning_outcome')
            
            if not winning_outcome:
                logger.warning(f"Market {trade.market_id} resolved but no winning outcome specified")
                return
            
            # Calculate realized P&L
            if trade.side == "BUY":
                if winning_outcome == "YES":  # Assuming binary market
                    payout_per_share = Decimal('1.0')
                else:
                    payout_per_share = Decimal('0.0')
                
                total_payout = (trade.filled_size or trade.size) * payout_per_share
                realized_pnl = total_payout - Decimal(str(trade.cost_basis))
            else:  # SELL
                # For short positions, profit calculation is different
                if winning_outcome == "YES":
                    realized_pnl = Decimal('0') - Decimal(str(trade.cost_basis))
                else:
                    realized_pnl = Decimal(str(trade.cost_basis))
            
            # Update trade record
            trade_repo.update_trade_status(
                trade.id,
                TradeStatus.RESOLVED,
                realized_pnl=realized_pnl
            )
            
            logger.info(f"Trade {trade.id} resolved - P&L: {realized_pnl:.4f}")
            
        except Exception as e:
            logger.error(f"Error handling resolution for trade {trade.id}: {e}")
    
    async def _scan_opportunities(self) -> List[Dict]:
        """Scan for arbitrage opportunities using all strategies"""
        all_opportunities = []
        
        try:
            for trade_type, strategy in self.strategies.items():
                if not strategy.is_enabled():
                    continue
                
                try:
                    opportunities = await strategy.scan_opportunities()
                    
                    for opp in opportunities:
                        opp['trade_type'] = trade_type
                        all_opportunities.append(opp)
                        
                except Exception as e:
                    logger.error(f"Error scanning {trade_type.value} opportunities: {e}")
            
            # Sort by expected return
            all_opportunities.sort(
                key=lambda x: x.get('expected_return_pct', 0),
                reverse=True
            )
            
            # Log opportunity summary
            if all_opportunities:
                logger.info(f"Found {len(all_opportunities)} opportunities")
                top_opp = all_opportunities[0]
                logger.info(f"Best opportunity: {top_opp.get('expected_return_pct', 0):.1f}% return")
            
            return all_opportunities[:10]  # Limit to top 10
            
        except Exception as e:
            logger.error(f"Error scanning opportunities: {e}")
            return []
    
    async def _evaluate_and_execute_opportunities(self, opportunities: List[Dict]):
        """Evaluate opportunities and execute approved trades"""
        for opportunity in opportunities:
            try:
                # Log opportunity for tracking
                opp_log = opportunity_repo.log_opportunity(
                    opportunity_type=opportunity['trade_type'],
                    market_id=opportunity['market_id'],
                    expected_profit_pct=Decimal(str(opportunity.get('expected_return_pct', 0))),
                    market_data=opportunity
                )
                
                # Risk assessment
                risk_assessment = self.risk_manager.assess_trade_risk(
                    market_id=opportunity['market_id'],
                    token_id=opportunity['token_id'],
                    trade_type=opportunity['trade_type'],
                    size=Decimal(str(opportunity.get('suggested_size', 10))),
                    price=Decimal(str(opportunity['price'])),
                    probability=Decimal(str(opportunity.get('probability', 0.5))),
                    market_data=opportunity
                )
                
                if not risk_assessment.approved:
                    logger.info(f"Trade rejected by risk management: {'; '.join(risk_assessment.reasons)}")
                    
                    # Mark opportunity as rejected
                    opportunity_repo.mark_opportunity_executed(
                        opp_log.id, 
                        None  # No trade ID
                    )
                    continue
                
                # Execute trade
                execution = await self._execute_trade(opportunity, risk_assessment.max_position_size)
                
                if execution.success:
                    self.trades_executed += 1
                    
                    # Link opportunity to trade
                    if execution.trade_id:
                        opportunity_repo.mark_opportunity_executed(
                            opp_log.id, 
                            execution.trade_id
                        )
                    
                    logger.info(f"Trade executed successfully: {execution.trade_id}")
                else:
                    logger.warning(f"Trade execution failed: {execution.error_message}")
                
            except Exception as e:
                logger.error(f"Error evaluating opportunity: {e}")
    
    async def _execute_trade(self, opportunity: Dict, position_size: Decimal) -> TradeExecution:
        """Execute a single trade"""
        try:
            market_id = opportunity['market_id']
            token_id = opportunity['token_id']
            price = float(opportunity['price'])
            
            # Calculate trade size in shares
            trade_size = min(
                float(position_size) / price,  # Size based on dollar amount
                opportunity.get('max_size', float(position_size))  # Strategy max size
            )
            
            if trade_size < 0.01:  # Minimum viable trade size
                return TradeExecution(
                    success=False,
                    error_message="Trade size too small"
                )
            
            # Create trade record first
            trade = trade_repo.create_trade(
                market_id=market_id,
                token_id=token_id,
                trade_type=opportunity['trade_type'],
                side="BUY",  # Most arbitrage opportunities are buying
                size=Decimal(str(trade_size)),
                price=Decimal(str(price)),
                expected_probability=Decimal(str(opportunity.get('probability', 0.5))),
                expected_return_pct=Decimal(str(opportunity.get('expected_return_pct', 0))),
                strategy_data=opportunity
            )
            
            # Place order on Polymarket
            order_id = self.polymarket.place_order(
                token_id=token_id,
                side="BUY",
                size=trade_size,
                price=price
            )
            
            if order_id:
                # Update trade with order ID
                trade_repo.update_trade_status(
                    trade.id,
                    TradeStatus.EXECUTED,
                    external_id=order_id
                )
                
                # Track order
                self.active_orders.add(order_id)
                self.monitored_trades.add(trade.id)
                
                return TradeExecution(
                    success=True,
                    trade_id=trade.id,
                    order_id=order_id,
                    executed_size=Decimal(str(trade_size)),
                    executed_price=Decimal(str(price))
                )
            else:
                # Mark trade as failed
                trade_repo.update_trade_status(
                    trade.id,
                    TradeStatus.FAILED
                )
                
                return TradeExecution(
                    success=False,
                    error_message="Order placement failed"
                )
                
        except Exception as e:
            logger.error(f"Trade execution error: {e}")
            return TradeExecution(
                success=False,
                error_message=str(e)
            )
    
    async def _cancel_all_pending_orders(self):
        """Cancel all pending orders"""
        try:
            for order_id in self.active_orders.copy():
                success = self.polymarket.cancel_order(order_id)
                if success:
                    self.active_orders.remove(order_id)
                    logger.info(f"Cancelled order: {order_id}")
                
        except Exception as e:
            logger.error(f"Error cancelling orders: {e}")
    
    async def _log_engine_status(self):
        """Log periodic engine status"""
        try:
            risk_metrics = self.risk_manager.get_risk_metrics()
            
            logger.info(f"Engine Status - Cycle: {self.cycle_count}")
            logger.info(f"  State: {self.state.value}")
            logger.info(f"  Opportunities Found: {self.opportunities_found}")
            logger.info(f"  Trades Executed: {self.trades_executed}")
            logger.info(f"  Active Trades: {risk_metrics.get('active_trades_count', 0)}")
            logger.info(f"  Portfolio Value: ${risk_metrics.get('portfolio_value', 0):.2f}")
            logger.info(f"  Daily P&L: ${risk_metrics.get('daily_pnl', 0):.2f}")
            logger.info(f"  Win Rate: {risk_metrics.get('win_rate', 0):.1%}")
            
        except Exception as e:
            logger.error(f"Error logging engine status: {e}")
    
    def get_status(self) -> Dict[str, any]:
        """Get current engine status"""
        try:
            risk_metrics = self.risk_manager.get_risk_metrics()
            
            return {
                'state': self.state.value,
                'cycle_count': self.cycle_count,
                'opportunities_found': self.opportunities_found,
                'trades_executed': self.trades_executed,
                'active_orders': len(self.active_orders),
                'monitored_trades': len(self.monitored_trades),
                'last_cycle': self.last_cycle_time.isoformat(),
                'uptime_seconds': (datetime.now(timezone.utc) - self.last_cycle_time).total_seconds(),
                'risk_metrics': risk_metrics,
                'strategy_status': {
                    name: strategy.get_status() 
                    for name, strategy in self.strategies.items()
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting engine status: {e}")
            return {'state': 'error', 'error': str(e)}

# Global trading engine instance
trading_engine = TradingEngine()

def get_trading_engine() -> TradingEngine:
    """Get the global trading engine"""
    return trading_engine