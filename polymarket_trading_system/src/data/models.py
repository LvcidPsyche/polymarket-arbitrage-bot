"""
Database Models for Polymarket Trading Bot
SQLAlchemy models for storing trades, market data, and analytics.
"""

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from typing import Optional, Dict, Any

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Enum, 
    ForeignKey, Integer, JSON, Numeric, String, Text, Index
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

Base = declarative_base()

class TradeStatus(PyEnum):
    """Trade execution status"""
    PENDING = "pending"
    EXECUTED = "executed" 
    FILLED = "filled"
    CANCELLED = "cancelled"
    FAILED = "failed"
    RESOLVED = "resolved"

class TradeType(PyEnum):
    """Type of arbitrage trade"""
    ENDGAME = "endgame"
    CROSS_PLATFORM = "cross_platform" 
    INTRA_MARKET = "intra_market"

class Market(Base):
    """Polymarket market data"""
    __tablename__ = "markets"
    
    # Primary identification
    id = Column(String, primary_key=True)  # Polymarket market ID
    condition_id = Column(String, nullable=False, index=True)
    question = Column(Text, nullable=False)
    description = Column(Text)
    
    # Market metadata
    category = Column(String)
    tags = Column(JSON)
    language = Column(String, default="en")
    
    # Timing
    created_at = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False, index=True)
    resolution_date = Column(DateTime(timezone=True))
    
    # Market state
    active = Column(Boolean, default=True, index=True)
    closed = Column(Boolean, default=False)
    resolved = Column(Boolean, default=False)
    winning_outcome = Column(String)
    
    # Trading data
    volume = Column(Numeric(20, 8), default=0)
    volume_24h = Column(Numeric(20, 8), default=0)
    liquidity = Column(Numeric(20, 8), default=0)
    
    # Tracking
    first_seen = Column(DateTime(timezone=True), default=func.now())
    last_updated = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    
    # Relationships
    tokens = relationship("Token", back_populates="market")
    trades = relationship("Trade", back_populates="market")
    price_history = relationship("PriceSnapshot", back_populates="market")
    
    # Indexes for efficient queries
    __table_args__ = (
        Index('idx_market_active_end_date', 'active', 'end_date'),
        Index('idx_market_volume_24h', 'volume_24h'),
        Index('idx_market_category', 'category'),
    )

class Token(Base):
    """Individual outcome tokens within a market"""
    __tablename__ = "tokens"
    
    # Primary identification
    id = Column(String, primary_key=True)  # Token ID
    market_id = Column(String, ForeignKey("markets.id"), nullable=False, index=True)
    
    # Token details
    outcome = Column(String, nullable=False)  # YES/NO or outcome name
    ticker = Column(String)
    
    # Current pricing
    best_bid = Column(Numeric(10, 6))
    best_ask = Column(Numeric(10, 6))
    last_price = Column(Numeric(10, 6))
    mid_price = Column(Numeric(10, 6))
    
    # Volume and liquidity
    volume = Column(Numeric(20, 8), default=0)
    volume_24h = Column(Numeric(20, 8), default=0)
    bid_liquidity = Column(Numeric(20, 8), default=0)
    ask_liquidity = Column(Numeric(20, 8), default=0)
    
    # Tracking
    last_updated = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    
    # Relationships
    market = relationship("Market", back_populates="tokens")
    trades = relationship("Trade", back_populates="token")
    
    # Indexes
    __table_args__ = (
        Index('idx_token_market_outcome', 'market_id', 'outcome'),
        Index('idx_token_last_price', 'last_price'),
    )

class Trade(Base):
    """Individual trades executed by the bot"""
    __tablename__ = "trades"
    
    # Primary identification
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    external_id = Column(String, unique=True, index=True)  # Exchange trade ID
    
    # Market and token
    market_id = Column(String, ForeignKey("markets.id"), nullable=False, index=True)
    token_id = Column(String, ForeignKey("tokens.id"), nullable=False, index=True)
    
    # Trade details
    trade_type = Column(Enum(TradeType), nullable=False, index=True)
    side = Column(String, nullable=False)  # BUY/SELL
    size = Column(Numeric(20, 8), nullable=False)  # Shares/contracts
    price = Column(Numeric(10, 6), nullable=False)  # Price per share
    
    # Execution details
    status = Column(Enum(TradeStatus), default=TradeStatus.PENDING, index=True)
    filled_size = Column(Numeric(20, 8), default=0)
    average_price = Column(Numeric(10, 6))
    
    # Financial data
    cost_basis = Column(Numeric(20, 8))  # Total cost (size * price)
    fees = Column(Numeric(20, 8), default=0)
    realized_pnl = Column(Numeric(20, 8))
    unrealized_pnl = Column(Numeric(20, 8))
    
    # Strategy context
    strategy_data = Column(JSON)  # Strategy-specific metadata
    expected_probability = Column(Numeric(5, 4))  # Expected win probability
    expected_return_pct = Column(Numeric(8, 4))  # Expected return %
    
    # Timing
    created_at = Column(DateTime(timezone=True), default=func.now())
    executed_at = Column(DateTime(timezone=True))
    resolved_at = Column(DateTime(timezone=True))
    
    # Risk management
    stop_loss_price = Column(Numeric(10, 6))
    risk_score = Column(Numeric(5, 2))
    
    # Relationships
    market = relationship("Market", back_populates="trades")
    token = relationship("Token", back_populates="trades")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_trade_created_at', 'created_at'),
        Index('idx_trade_status_type', 'status', 'trade_type'),
        Index('idx_trade_market_created', 'market_id', 'created_at'),
    )

class PriceSnapshot(Base):
    """Historical price snapshots for analysis"""
    __tablename__ = "price_snapshots"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    
    # Market reference
    market_id = Column(String, ForeignKey("markets.id"), nullable=False, index=True)
    token_id = Column(String, ForeignKey("tokens.id"), nullable=False, index=True)
    
    # Price data
    timestamp = Column(DateTime(timezone=True), default=func.now(), index=True)
    bid_price = Column(Numeric(10, 6))
    ask_price = Column(Numeric(10, 6)) 
    mid_price = Column(Numeric(10, 6))
    last_price = Column(Numeric(10, 6))
    
    # Volume and liquidity
    bid_size = Column(Numeric(20, 8))
    ask_size = Column(Numeric(20, 8))
    volume_1h = Column(Numeric(20, 8))
    
    # Market context
    implied_probability = Column(Numeric(5, 4))
    time_to_resolution_hours = Column(Integer)
    
    # Relationships
    market = relationship("Market", back_populates="price_history")
    
    # Indexes for time-series queries
    __table_args__ = (
        Index('idx_price_market_timestamp', 'market_id', 'timestamp'),
        Index('idx_price_token_timestamp', 'token_id', 'timestamp'),
    )

class OpportunityLog(Base):
    """Log of detected arbitrage opportunities"""
    __tablename__ = "opportunity_log"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    
    # Opportunity identification
    opportunity_type = Column(Enum(TradeType), nullable=False, index=True)
    market_id = Column(String, ForeignKey("markets.id"), nullable=False)
    
    # Opportunity details
    detected_at = Column(DateTime(timezone=True), default=func.now(), index=True)
    expected_profit_pct = Column(Numeric(8, 4), nullable=False)
    expected_return_annualized = Column(Numeric(10, 2))
    confidence_score = Column(Numeric(5, 2))
    
    # Market state at detection
    market_data = Column(JSON)  # Snapshot of relevant market data
    
    # Execution status
    executed = Column(Boolean, default=False, index=True)
    trade_id = Column(BigInteger, ForeignKey("trades.id"))
    rejection_reason = Column(String)  # Why opportunity was rejected
    
    # Indexes
    __table_args__ = (
        Index('idx_opportunity_detected_at', 'detected_at'),
        Index('idx_opportunity_type_executed', 'opportunity_type', 'executed'),
    )

class PortfolioSnapshot(Base):
    """Daily portfolio snapshots for performance tracking"""
    __tablename__ = "portfolio_snapshots"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    
    # Snapshot timing
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    
    # Portfolio values
    total_value_usd = Column(Numeric(20, 8), nullable=False)
    cash_balance = Column(Numeric(20, 8), nullable=False)
    positions_value = Column(Numeric(20, 8), default=0)
    unrealized_pnl = Column(Numeric(20, 8), default=0)
    
    # Performance metrics
    daily_return_pct = Column(Numeric(8, 4))
    total_return_pct = Column(Numeric(8, 4))
    sharpe_ratio = Column(Numeric(8, 4))
    max_drawdown_pct = Column(Numeric(8, 4))
    
    # Trading activity
    trades_today = Column(Integer, default=0)
    winning_trades = Column(Integer, default=0)
    losing_trades = Column(Integer, default=0)
    
    # Risk metrics
    var_95 = Column(Numeric(20, 8))  # Value at Risk (95%)
    portfolio_beta = Column(Numeric(8, 4))
    
    # Metadata
    created_at = Column(DateTime(timezone=True), default=func.now())
    
    # Unique constraint on date
    __table_args__ = (
        Index('idx_portfolio_date', 'date', unique=True),
    )

class SystemLog(Base):
    """System logs for monitoring and debugging"""
    __tablename__ = "system_logs"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    
    # Log details
    timestamp = Column(DateTime(timezone=True), default=func.now(), index=True)
    level = Column(String(10), nullable=False, index=True)  # INFO, WARNING, ERROR
    component = Column(String(50), nullable=False, index=True)  # trading_engine, risk_manager, etc.
    message = Column(Text, nullable=False)
    
    # Additional context
    trade_id = Column(BigInteger, ForeignKey("trades.id"))
    market_id = Column(String, ForeignKey("markets.id"))
    error_details = Column(JSON)
    
    # Indexes for log analysis
    __table_args__ = (
        Index('idx_log_timestamp_level', 'timestamp', 'level'),
        Index('idx_log_component_timestamp', 'component', 'timestamp'),
    )