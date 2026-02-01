"""
Database Connection and Management
Handles PostgreSQL connections, session management, and database operations.
"""

import logging
from contextlib import contextmanager
from typing import Generator, Optional, Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from ..utils.config import get_config
from .models import Base

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages database connections and sessions"""
    
    def __init__(self):
        self.config = get_config().database
        self._engine: Optional[Engine] = None
        self._session_factory: Optional[sessionmaker] = None
    
    def initialize(self):
        """Initialize database engine and session factory"""
        if self._engine is None:
            self._create_engine()
            self._create_session_factory()
            self._setup_event_listeners()
    
    def _create_engine(self):
        """Create SQLAlchemy engine with optimized settings"""
        self._engine = create_engine(
            self.config.url,
            # Connection pooling
            poolclass=QueuePool,
            pool_size=self.config.pool_size,
            max_overflow=self.config.max_overflow,
            pool_pre_ping=True,  # Validate connections before use
            pool_recycle=3600,   # Recycle connections every hour
            
            # Performance settings
            echo=False,  # Set to True for SQL debugging
            echo_pool=False,
            future=True,
            
            # Connection settings
            connect_args={
                "connect_timeout": 30,
                "application_name": "polymarket_arbitrage_bot"
            }
        )
        
        logger.info(f"Database engine created: {self.config.url.split('@')[1]}")  # Log without credentials
    
    def _create_session_factory(self):
        """Create session factory"""
        self._session_factory = sessionmaker(
            bind=self._engine,
            expire_on_commit=False,
            autoflush=True,
            autocommit=False
        )
    
    def _setup_event_listeners(self):
        """Setup SQLAlchemy event listeners for monitoring"""
        
        @event.listens_for(self._engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            # PostgreSQL-specific optimizations
            with dbapi_connection.cursor() as cursor:
                # Set timezone to UTC
                cursor.execute("SET timezone TO 'UTC'")
                # Optimize for analytics workload
                cursor.execute("SET work_mem = '256MB'")
        
        @event.listens_for(self._engine, "before_cursor_execute")
        def log_slow_queries(conn, cursor, statement, parameters, context, executemany):
            context._query_start_time = time.time()
        
        @event.listens_for(self._engine, "after_cursor_execute")
        def log_slow_queries(conn, cursor, statement, parameters, context, executemany):
            total = time.time() - context._query_start_time
            if total > 0.5:  # Log queries taking >500ms
                logger.warning(f"Slow query ({total:.2f}s): {statement[:200]}...")
    
    @property
    def engine(self) -> Engine:
        """Get database engine"""
        if self._engine is None:
            self.initialize()
        return self._engine
    
    @contextmanager
    def session(self) -> Generator[Session, None, None]:
        """Get database session with automatic cleanup"""
        if self._session_factory is None:
            self.initialize()
        
        session = self._session_factory()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            session.close()
    
    def create_tables(self):
        """Create all database tables"""
        logger.info("Creating database tables...")
        Base.metadata.create_all(self._engine)
        logger.info("Database tables created successfully")
    
    def drop_tables(self):
        """Drop all database tables (use with caution!)"""
        logger.warning("Dropping all database tables...")
        Base.metadata.drop_all(self._engine)
        logger.warning("All tables dropped")
    
    def health_check(self) -> bool:
        """Check database connectivity"""
        try:
            with self.session() as session:
                session.execute("SELECT 1")
                return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

# Global database manager instance
db_manager = DatabaseManager()

# Convenience functions
def get_session() -> Generator[Session, None, None]:
    """Get a database session"""
    return db_manager.session()

def init_database():
    """Initialize database and create tables"""
    db_manager.initialize()
    db_manager.create_tables()

import time
from typing import List, Dict
from decimal import Decimal
from datetime import datetime

from .models import (
    Market, Token, Trade, PriceSnapshot, OpportunityLog, 
    PortfolioSnapshot, SystemLog, TradeType, TradeStatus
)

class TradeRepository:
    """Repository for trade-related database operations"""
    
    @staticmethod
    def create_trade(
        market_id: str,
        token_id: str,
        trade_type: TradeType,
        side: str,
        size: Decimal,
        price: Decimal,
        **kwargs
    ) -> Trade:
        """Create a new trade record"""
        trade = Trade(
            market_id=market_id,
            token_id=token_id,
            trade_type=trade_type,
            side=side,
            size=size,
            price=price,
            cost_basis=size * price,
            **kwargs
        )
        
        with get_session() as session:
            session.add(trade)
            session.flush()
            trade_id = trade.id
            
        logger.info(f"Created trade record: {trade_id}")
        return trade
    
    @staticmethod
    def update_trade_status(trade_id: int, status: TradeStatus, **updates):
        """Update trade status and other fields"""
        with get_session() as session:
            trade = session.query(Trade).filter(Trade.id == trade_id).first()
            if trade:
                trade.status = status
                for key, value in updates.items():
                    setattr(trade, key, value)
                
                if status == TradeStatus.EXECUTED:
                    trade.executed_at = datetime.utcnow()
                elif status == TradeStatus.RESOLVED:
                    trade.resolved_at = datetime.utcnow()
    
    @staticmethod
    def get_active_trades() -> List[Trade]:
        """Get all active (unfilled/unresolved) trades"""
        with get_session() as session:
            return session.query(Trade).filter(
                Trade.status.in_([TradeStatus.PENDING, TradeStatus.EXECUTED, TradeStatus.FILLED])
            ).all()
    
    @staticmethod
    def get_trades_by_market(market_id: str) -> List[Trade]:
        """Get all trades for a specific market"""
        with get_session() as session:
            return session.query(Trade).filter(Trade.market_id == market_id).all()

class MarketRepository:
    """Repository for market data operations"""
    
    @staticmethod
    def upsert_market(market_data: Dict[str, Any]) -> Market:
        """Insert or update market data"""
        with get_session() as session:
            market = session.query(Market).filter(Market.id == market_data['id']).first()
            
            if market:
                # Update existing market
                for key, value in market_data.items():
                    if hasattr(market, key):
                        setattr(market, key, value)
            else:
                # Create new market
                market = Market(**market_data)
                session.add(market)
            
            session.flush()
            return market
    
    @staticmethod
    def get_active_markets(hours_ahead: int = 48) -> List[Market]:
        """Get markets ending within specified hours"""
        cutoff = datetime.utcnow() + timedelta(hours=hours_ahead)
        
        with get_session() as session:
            return session.query(Market).filter(
                Market.active == True,
                Market.end_date <= cutoff,
                Market.resolved == False
            ).all()
    
    @staticmethod
    def record_price_snapshot(
        market_id: str,
        token_id: str,
        price_data: Dict[str, Any]
    ):
        """Record a price snapshot for analysis"""
        snapshot = PriceSnapshot(
            market_id=market_id,
            token_id=token_id,
            **price_data
        )
        
        with get_session() as session:
            session.add(snapshot)

class OpportunityRepository:
    """Repository for arbitrage opportunity tracking"""
    
    @staticmethod
    def log_opportunity(
        opportunity_type: TradeType,
        market_id: str,
        expected_profit_pct: Decimal,
        market_data: Dict[str, Any],
        **kwargs
    ) -> OpportunityLog:
        """Log a detected arbitrage opportunity"""
        opportunity = OpportunityLog(
            opportunity_type=opportunity_type,
            market_id=market_id,
            expected_profit_pct=expected_profit_pct,
            market_data=market_data,
            **kwargs
        )
        
        with get_session() as session:
            session.add(opportunity)
            session.flush()
            return opportunity
    
    @staticmethod
    def mark_opportunity_executed(opportunity_id: int, trade_id: int):
        """Mark opportunity as executed with trade reference"""
        with get_session() as session:
            opportunity = session.query(OpportunityLog).filter(
                OpportunityLog.id == opportunity_id
            ).first()
            if opportunity:
                opportunity.executed = True
                opportunity.trade_id = trade_id

class AnalyticsRepository:
    """Repository for analytics and performance data"""
    
    @staticmethod
    def create_portfolio_snapshot(snapshot_data: Dict[str, Any]) -> PortfolioSnapshot:
        """Create daily portfolio snapshot"""
        snapshot = PortfolioSnapshot(**snapshot_data)
        
        with get_session() as session:
            session.merge(snapshot)  # Use merge to handle duplicates
            session.flush()
            return snapshot
    
    @staticmethod
    def get_performance_metrics(days: int = 30) -> Dict[str, Any]:
        """Get performance metrics for the last N days"""
        from datetime import timedelta
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        with get_session() as session:
            # Get completed trades in period
            trades = session.query(Trade).filter(
                Trade.resolved_at >= start_date,
                Trade.status == TradeStatus.RESOLVED
            ).all()
            
            if not trades:
                return {}
            
            total_pnl = sum(t.realized_pnl or 0 for t in trades)
            winning_trades = [t for t in trades if (t.realized_pnl or 0) > 0]
            losing_trades = [t for t in trades if (t.realized_pnl or 0) < 0]
            
            return {
                'total_trades': len(trades),
                'winning_trades': len(winning_trades),
                'losing_trades': len(losing_trades),
                'win_rate': len(winning_trades) / len(trades) if trades else 0,
                'total_pnl': float(total_pnl),
                'average_win': float(sum(t.realized_pnl for t in winning_trades) / len(winning_trades)) if winning_trades else 0,
                'average_loss': float(sum(t.realized_pnl for t in losing_trades) / len(losing_trades)) if losing_trades else 0,
                'profit_factor': abs(sum(t.realized_pnl for t in winning_trades) / sum(t.realized_pnl for t in losing_trades)) if losing_trades else float('inf')
            }

# Export commonly used repositories
trade_repo = TradeRepository()
market_repo = MarketRepository()
opportunity_repo = OpportunityRepository()
analytics_repo = AnalyticsRepository()

from datetime import timedelta