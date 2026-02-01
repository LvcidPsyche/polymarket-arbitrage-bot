"""
Advanced Risk Management System
Comprehensive risk controls for autonomous trading with position sizing, 
stop losses, exposure limits, and emergency shutdown mechanisms.
"""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

from ..utils.config import get_config
from ..data.database import trade_repo, analytics_repo, get_session
from ..data.models import Trade, TradeType, TradeStatus
from ..integrations.wallet_manager import get_wallet

logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    """Risk assessment levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class RiskAssessment:
    """Risk assessment result"""
    approved: bool
    risk_level: RiskLevel
    max_position_size: Decimal
    reasons: List[str]
    warnings: List[str]
    
class TradingLimits:
    """Dynamic trading limits based on performance"""
    
    def __init__(self, config):
        self.base_position_pct = Decimal(str(config.max_position_size_pct))
        self.daily_loss_limit_pct = Decimal(str(config.max_daily_loss_pct))
        self.weekly_loss_limit_pct = Decimal(str(config.max_weekly_loss_pct))
        self.max_exposure_per_market = Decimal(str(config.max_exposure_per_market))
        self.stop_loss_threshold = Decimal(str(config.stop_loss_threshold))
        self.cooling_period_hours = config.cooling_period_hours
    
    def calculate_dynamic_limits(self, recent_performance: Dict) -> Dict[str, Decimal]:
        """Calculate dynamic limits based on recent performance"""
        win_rate = recent_performance.get('win_rate', 0.5)
        total_trades = recent_performance.get('total_trades', 0)
        sharpe_ratio = recent_performance.get('sharpe_ratio', 0)
        
        # Adjust position size based on performance
        performance_multiplier = Decimal('1.0')
        
        # Reduce size if poor performance
        if win_rate < 0.4:
            performance_multiplier *= Decimal('0.5')
        elif win_rate < 0.5:
            performance_multiplier *= Decimal('0.7')
        elif win_rate > 0.7:
            performance_multiplier *= Decimal('1.2')
        elif win_rate > 0.8:
            performance_multiplier *= Decimal('1.5')
        
        # Scale with experience (more trades = larger positions allowed)
        if total_trades < 10:
            experience_multiplier = Decimal('0.5')
        elif total_trades < 50:
            experience_multiplier = Decimal('0.8')
        else:
            experience_multiplier = Decimal('1.0')
        
        return {
            'max_position_pct': self.base_position_pct * performance_multiplier * experience_multiplier,
            'daily_loss_limit_pct': self.daily_loss_limit_pct,
            'weekly_loss_limit_pct': self.weekly_loss_limit_pct,
            'performance_multiplier': performance_multiplier,
            'experience_multiplier': experience_multiplier
        }

class ExposureTracker:
    """Track exposure across markets and correlations"""
    
    def __init__(self):
        self.market_exposures: Dict[str, Decimal] = {}
        self.category_exposures: Dict[str, Decimal] = {}
        self.total_exposure = Decimal('0')
    
    def update_exposure(self, trades: List[Trade]):
        """Update exposure tracking from current trades"""
        self.market_exposures.clear()
        self.category_exposures.clear()
        self.total_exposure = Decimal('0')
        
        for trade in trades:
            if trade.status in [TradeStatus.EXECUTED, TradeStatus.FILLED]:
                exposure = Decimal(str(trade.cost_basis or 0))
                
                # Market exposure
                if trade.market_id not in self.market_exposures:
                    self.market_exposures[trade.market_id] = Decimal('0')
                self.market_exposures[trade.market_id] += exposure
                
                # Total exposure
                self.total_exposure += exposure
    
    def get_market_exposure_pct(self, market_id: str, portfolio_value: Decimal) -> Decimal:
        """Get exposure percentage for a specific market"""
        if portfolio_value <= 0:
            return Decimal('0')
        
        exposure = self.market_exposures.get(market_id, Decimal('0'))
        return exposure / portfolio_value

class RiskManager:
    """Comprehensive risk management system"""
    
    def __init__(self):
        self.config = get_config().risk
        self.wallet = get_wallet()
        self.limits = TradingLimits(self.config)
        self.exposure_tracker = ExposureTracker()
        self._shutdown_triggered = False
        self._last_assessment = {}
    
    def assess_trade_risk(
        self,
        market_id: str,
        token_id: str,
        trade_type: TradeType,
        size: Decimal,
        price: Decimal,
        probability: Decimal,
        market_data: Dict
    ) -> RiskAssessment:
        """Comprehensive risk assessment for a potential trade"""
        
        reasons = []
        warnings = []
        risk_level = RiskLevel.LOW
        
        try:
            # Get current portfolio state
            portfolio_value = self._get_portfolio_value()
            recent_performance = self._get_recent_performance()
            active_trades = trade_repo.get_active_trades()
            
            # Update exposure tracking
            self.exposure_tracker.update_exposure(active_trades)
            
            # Calculate dynamic limits
            dynamic_limits = self.limits.calculate_dynamic_limits(recent_performance)
            
            # 1. Portfolio size check
            trade_value = size * price
            max_position_value = portfolio_value * dynamic_limits['max_position_pct']
            
            if trade_value > max_position_value:
                reasons.append(f"Trade size ${trade_value:.2f} exceeds max position size ${max_position_value:.2f}")
                risk_level = RiskLevel.HIGH
            
            # 2. Market exposure check
            current_market_exposure = self.exposure_tracker.get_market_exposure_pct(market_id, portfolio_value)
            total_market_exposure = current_market_exposure + (trade_value / portfolio_value)
            
            if total_market_exposure > self.limits.max_exposure_per_market:
                reasons.append(f"Market exposure {total_market_exposure:.1%} exceeds limit {self.limits.max_exposure_per_market:.1%}")
                risk_level = RiskLevel.HIGH
            
            # 3. Daily loss limit check
            daily_pnl = self._get_daily_pnl()
            daily_loss_pct = abs(daily_pnl) / portfolio_value if portfolio_value > 0 else Decimal('0')
            
            if daily_pnl < 0 and daily_loss_pct >= self.limits.daily_loss_limit_pct:
                reasons.append(f"Daily loss limit reached: {daily_loss_pct:.1%}")
                risk_level = RiskLevel.CRITICAL
            
            # 4. Weekly loss limit check
            weekly_pnl = self._get_weekly_pnl()
            weekly_loss_pct = abs(weekly_pnl) / portfolio_value if portfolio_value > 0 else Decimal('0')
            
            if weekly_pnl < 0 and weekly_loss_pct >= self.limits.weekly_loss_limit_pct:
                reasons.append(f"Weekly loss limit reached: {weekly_loss_pct:.1%}")
                risk_level = RiskLevel.CRITICAL
            
            # 5. Probability threshold check
            if probability < Decimal(str(self.config.min_probability)):
                warnings.append(f"Probability {probability:.1%} below minimum {self.config.min_probability:.1%}")
                if risk_level == RiskLevel.LOW:
                    risk_level = RiskLevel.MEDIUM
            
            # 6. Market liquidity check
            volume_24h = market_data.get('volume_24h', 0)
            if volume_24h < 100:  # Very low liquidity
                warnings.append(f"Low market liquidity: ${volume_24h:.0f}")
                if risk_level == RiskLevel.LOW:
                    risk_level = RiskLevel.MEDIUM
            
            # 7. Time to resolution check
            hours_to_resolution = market_data.get('hours_to_resolution', 999)
            if hours_to_resolution < 1:
                warnings.append("Market resolves very soon (<1 hour)")
                if risk_level == RiskLevel.LOW:
                    risk_level = RiskLevel.MEDIUM
            
            # 8. Concurrent trades limit
            if len(active_trades) >= self.config.parent.max_concurrent_trades:
                reasons.append(f"Max concurrent trades limit reached: {len(active_trades)}")
                risk_level = RiskLevel.HIGH
            
            # 9. Cooling period check (after recent loss)
            if self._in_cooling_period():
                reasons.append("In cooling period after recent loss")
                risk_level = RiskLevel.HIGH
            
            # 10. Black swan protection
            if trade_type == TradeType.ENDGAME and probability > Decimal('0.98'):
                warnings.append("Extreme high probability - black swan risk")
            
            # Determine if trade is approved
            approved = len(reasons) == 0 and risk_level != RiskLevel.CRITICAL
            
            # Calculate final position size
            if approved:
                # Use the smaller of requested size or risk-adjusted max size
                risk_adjusted_max = min(
                    max_position_value / price,  # Max shares based on value limit
                    size  # Requested size
                )
                
                # Apply additional safety factor for higher risk levels
                if risk_level == RiskLevel.HIGH:
                    risk_adjusted_max *= Decimal('0.5')
                elif risk_level == RiskLevel.MEDIUM:
                    risk_adjusted_max *= Decimal('0.8')
                
                max_position_size = max(risk_adjusted_max, Decimal('0'))
            else:
                max_position_size = Decimal('0')
            
            assessment = RiskAssessment(
                approved=approved,
                risk_level=risk_level,
                max_position_size=max_position_size,
                reasons=reasons,
                warnings=warnings
            )
            
            # Log assessment
            self._log_risk_assessment(assessment, {
                'market_id': market_id,
                'trade_type': trade_type.value,
                'requested_size': float(size),
                'price': float(price),
                'probability': float(probability)
            })
            
            return assessment
            
        except Exception as e:
            logger.error(f"Risk assessment failed: {e}")
            return RiskAssessment(
                approved=False,
                risk_level=RiskLevel.CRITICAL,
                max_position_size=Decimal('0'),
                reasons=[f"Risk assessment error: {str(e)}"],
                warnings=[]
            )
    
    def should_stop_loss(self, trade: Trade, current_probability: Decimal) -> bool:
        """Determine if a position should be closed due to stop-loss"""
        try:
            # Only check filled trades
            if trade.status != TradeStatus.FILLED:
                return False
            
            # Check if probability dropped below threshold
            if current_probability < self.limits.stop_loss_threshold:
                logger.warning(f"Stop-loss triggered for trade {trade.id}: {current_probability:.1%} < {self.limits.stop_loss_threshold:.1%}")
                return True
            
            # Check if unrealized loss exceeds individual position limit
            if trade.unrealized_pnl and Decimal(str(trade.unrealized_pnl)) < -Decimal(str(trade.cost_basis)) * Decimal('0.5'):
                logger.warning(f"Position loss limit triggered for trade {trade.id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Stop-loss check failed for trade {trade.id}: {e}")
            return False
    
    def check_emergency_shutdown(self) -> bool:
        """Check if emergency shutdown should be triggered"""
        try:
            if self._shutdown_triggered:
                return True
            
            # Get current state
            portfolio_value = self._get_portfolio_value()
            daily_pnl = self._get_daily_pnl()
            weekly_pnl = self._get_weekly_pnl()
            
            # Daily loss emergency
            if portfolio_value > 0:
                daily_loss_pct = abs(daily_pnl) / portfolio_value
                if daily_pnl < 0 and daily_loss_pct >= self.limits.daily_loss_limit_pct * Decimal('2'):
                    logger.critical(f"EMERGENCY SHUTDOWN: Daily loss {daily_loss_pct:.1%} exceeds emergency threshold")
                    self._shutdown_triggered = True
                    return True
                
                # Weekly loss emergency
                weekly_loss_pct = abs(weekly_pnl) / portfolio_value
                if weekly_pnl < 0 and weekly_loss_pct >= self.limits.weekly_loss_limit_pct * Decimal('1.5'):
                    logger.critical(f"EMERGENCY SHUTDOWN: Weekly loss {weekly_loss_pct:.1%} exceeds emergency threshold")
                    self._shutdown_triggered = True
                    return True
            
            # Too many concurrent failures
            recent_failures = self._count_recent_failures()
            if recent_failures >= 5:
                logger.critical(f"EMERGENCY SHUTDOWN: Too many recent failures ({recent_failures})")
                self._shutdown_triggered = True
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Emergency shutdown check failed: {e}")
            # Err on the side of caution
            return True
    
    def reset_shutdown(self):
        """Reset emergency shutdown (manual intervention required)"""
        self._shutdown_triggered = False
        logger.info("Emergency shutdown reset by operator")
    
    def _get_portfolio_value(self) -> Decimal:
        """Get current portfolio value"""
        try:
            eth_balance, usdc_balance = self.wallet.get_balance()
            # For simplicity, assume 1 ETH = $2000 (should use real price feed)
            eth_value = eth_balance * Decimal('2000')
            return eth_value + usdc_balance
        except Exception as e:
            logger.error(f"Failed to get portfolio value: {e}")
            return Decimal('0')
    
    def _get_daily_pnl(self) -> Decimal:
        """Get PnL for the current day"""
        try:
            today = datetime.now(timezone.utc).date()
            with get_session() as session:
                trades = session.query(Trade).filter(
                    Trade.created_at >= today,
                    Trade.status == TradeStatus.RESOLVED
                ).all()
                
                return sum(Decimal(str(t.realized_pnl or 0)) for t in trades)
        except Exception as e:
            logger.error(f"Failed to get daily PnL: {e}")
            return Decimal('0')
    
    def _get_weekly_pnl(self) -> Decimal:
        """Get PnL for the current week"""
        try:
            week_ago = datetime.now(timezone.utc) - timedelta(days=7)
            with get_session() as session:
                trades = session.query(Trade).filter(
                    Trade.created_at >= week_ago,
                    Trade.status == TradeStatus.RESOLVED
                ).all()
                
                return sum(Decimal(str(t.realized_pnl or 0)) for t in trades)
        except Exception as e:
            logger.error(f"Failed to get weekly PnL: {e}")
            return Decimal('0')
    
    def _get_recent_performance(self) -> Dict[str, Any]:
        """Get recent performance metrics"""
        try:
            return analytics_repo.get_performance_metrics(days=30)
        except Exception as e:
            logger.error(f"Failed to get recent performance: {e}")
            return {
                'total_trades': 0,
                'win_rate': 0.5,
                'sharpe_ratio': 0,
                'total_pnl': 0
            }
    
    def _in_cooling_period(self) -> bool:
        """Check if we're in cooling period after recent loss"""
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=self.limits.cooling_period_hours)
            with get_session() as session:
                recent_loss = session.query(Trade).filter(
                    Trade.resolved_at >= cutoff,
                    Trade.realized_pnl < 0,
                    Trade.status == TradeStatus.RESOLVED
                ).first()
                
                return recent_loss is not None
        except Exception as e:
            logger.error(f"Failed to check cooling period: {e}")
            return False
    
    def _count_recent_failures(self) -> int:
        """Count recent failed trades/errors"""
        try:
            hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
            with get_session() as session:
                failed_trades = session.query(Trade).filter(
                    Trade.created_at >= hour_ago,
                    Trade.status == TradeStatus.FAILED
                ).count()
                
                return failed_trades
        except Exception as e:
            logger.error(f"Failed to count recent failures: {e}")
            return 0
    
    def _log_risk_assessment(self, assessment: RiskAssessment, trade_data: Dict):
        """Log risk assessment for audit trail"""
        logger.info(f"Risk Assessment: {assessment.risk_level.value.upper()}")
        logger.info(f"  Approved: {assessment.approved}")
        logger.info(f"  Max Position: {assessment.max_position_size}")
        
        if assessment.reasons:
            logger.info(f"  Rejection Reasons: {'; '.join(assessment.reasons)}")
        
        if assessment.warnings:
            logger.info(f"  Warnings: {'; '.join(assessment.warnings)}")
    
    def get_risk_metrics(self) -> Dict[str, Any]:
        """Get current risk metrics for monitoring"""
        try:
            portfolio_value = self._get_portfolio_value()
            daily_pnl = self._get_daily_pnl()
            weekly_pnl = self._get_weekly_pnl()
            active_trades = trade_repo.get_active_trades()
            recent_performance = self._get_recent_performance()
            
            self.exposure_tracker.update_exposure(active_trades)
            
            return {
                'portfolio_value': float(portfolio_value),
                'daily_pnl': float(daily_pnl),
                'weekly_pnl': float(weekly_pnl),
                'daily_pnl_pct': float(daily_pnl / portfolio_value) if portfolio_value > 0 else 0,
                'weekly_pnl_pct': float(weekly_pnl / portfolio_value) if portfolio_value > 0 else 0,
                'active_trades_count': len(active_trades),
                'total_exposure': float(self.exposure_tracker.total_exposure),
                'exposure_pct': float(self.exposure_tracker.total_exposure / portfolio_value) if portfolio_value > 0 else 0,
                'emergency_shutdown': self._shutdown_triggered,
                'cooling_period': self._in_cooling_period(),
                'win_rate': recent_performance.get('win_rate', 0),
                'profit_factor': recent_performance.get('profit_factor', 0)
            }
            
        except Exception as e:
            logger.error(f"Failed to get risk metrics: {e}")
            return {}

# Global risk manager instance
risk_manager = RiskManager()

def get_risk_manager() -> RiskManager:
    """Get the global risk manager"""
    return risk_manager