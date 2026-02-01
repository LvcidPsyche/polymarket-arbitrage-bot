"""
Configuration Management System
Handles loading and validation of bot configuration from YAML files.
"""

import os
import yaml
from typing import Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel, Field, validator
from decimal import Decimal

class WalletConfig(BaseModel):
    """Wallet configuration and credentials"""
    address: str = Field(..., description="Ethereum wallet address")
    private_key: str = Field(..., description="Private key (encrypted)")
    network: str = Field(default="polygon", description="Blockchain network")
    rpc_url: str = Field(default="https://polygon-rpc.com", description="RPC endpoint")

class RiskConfig(BaseModel):
    """Risk management parameters"""
    max_position_size_pct: float = Field(default=0.10, description="Max % of wallet per trade")
    max_daily_loss_pct: float = Field(default=0.05, description="Max daily loss %")
    max_weekly_loss_pct: float = Field(default=0.15, description="Max weekly loss %")
    stop_loss_threshold: float = Field(default=0.85, description="Stop loss probability threshold")
    min_probability: float = Field(default=0.90, description="Minimum trade probability")
    max_exposure_per_market: float = Field(default=0.20, description="Max exposure per market")
    cooling_period_hours: int = Field(default=1, description="Cooling period after loss")
    
    @validator('max_position_size_pct', 'max_daily_loss_pct', 'max_weekly_loss_pct')
    def validate_percentages(cls, v):
        if not 0 < v <= 1:
            raise ValueError("Percentage must be between 0 and 1")
        return v

class StrategyConfig(BaseModel):
    """Individual strategy configuration"""
    enabled: bool = Field(default=True, description="Strategy enabled")
    weight: float = Field(default=1.0, description="Strategy allocation weight")
    min_volume_24h: float = Field(default=1000.0, description="Minimum 24h volume")
    max_time_horizon_hours: int = Field(default=48, description="Max time to resolution")
    min_spread_bps: int = Field(default=50, description="Minimum spread in basis points")

class EndgameConfig(StrategyConfig):
    """Endgame arbitrage specific config"""
    min_probability: float = Field(default=0.95, description="Minimum probability for endgame")
    max_hours_to_resolution: int = Field(default=48, description="Max hours until resolution")

class CrossPlatformConfig(StrategyConfig):
    """Cross-platform arbitrage config"""
    kalshi_enabled: bool = Field(default=False, description="Enable Kalshi integration")
    min_spread_pct: float = Field(default=0.05, description="Minimum cross-platform spread %")

class IntraMarketConfig(StrategyConfig):
    """Intra-market arbitrage config"""
    max_price_sum: float = Field(default=0.98, description="Max YES+NO price sum")
    min_profit_margin: float = Field(default=0.02, description="Min profit margin")

class MonitoringConfig(BaseModel):
    """Monitoring and alerting configuration"""
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    discord_webhook_url: Optional[str] = None
    dashboard_port: int = Field(default=5000, description="Dashboard web port")
    metrics_enabled: bool = Field(default=True, description="Enable Prometheus metrics")

class DatabaseConfig(BaseModel):
    """Database configuration"""
    url: str = Field(default="postgresql://user:pass@localhost/polymarket_bot", description="Database URL")
    pool_size: int = Field(default=10, description="Connection pool size")
    max_overflow: int = Field(default=20, description="Max overflow connections")

class APIConfig(BaseModel):
    """API configuration and rate limits"""
    polymarket_api_url: str = Field(default="https://gamma-api.polymarket.com", description="Polymarket API URL")
    rate_limit_per_second: int = Field(default=5, description="API calls per second limit")
    websocket_reconnect_delay: int = Field(default=30, description="WebSocket reconnect delay (seconds)")
    request_timeout: int = Field(default=30, description="HTTP request timeout")

class BotConfig(BaseModel):
    """Main bot configuration"""
    # Core components
    wallet: WalletConfig
    risk: RiskConfig = RiskConfig()
    monitoring: MonitoringConfig = MonitoringConfig()
    database: DatabaseConfig = DatabaseConfig()
    api: APIConfig = APIConfig()
    
    # Trading strategies
    endgame: EndgameConfig = EndgameConfig()
    cross_platform: CrossPlatformConfig = CrossPlatformConfig()
    intra_market: IntraMarketConfig = IntraMarketConfig()
    
    # Operational settings
    dry_run: bool = Field(default=True, description="Dry run mode (no real trades)")
    log_level: str = Field(default="INFO", description="Logging level")
    heartbeat_interval: int = Field(default=60, description="Heartbeat interval (seconds)")
    max_concurrent_trades: int = Field(default=3, description="Max concurrent positions")

class ConfigManager:
    """Configuration manager with environment and file loading"""
    
    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or self._get_default_config_path()
        self._config: Optional[BotConfig] = None
    
    def _get_default_config_path(self) -> Path:
        """Get default configuration file path"""
        env = os.getenv("BOT_ENV", "development")
        return Path(__file__).parent.parent.parent / "config" / f"{env}.yaml"
    
    def load_config(self) -> BotConfig:
        """Load and validate configuration"""
        if self._config is None:
            self._config = self._load_from_file()
            self._apply_env_overrides()
        return self._config
    
    def _load_from_file(self) -> BotConfig:
        """Load configuration from YAML file"""
        if not self.config_path.exists():
            raise FileNotFoundError(f"Configuration file not found: {self.config_path}")
        
        with open(self.config_path, 'r') as f:
            config_data = yaml.safe_load(f)
        
        return BotConfig(**config_data)
    
    def _apply_env_overrides(self):
        """Apply environment variable overrides"""
        # Override sensitive values from environment
        if os.getenv("WALLET_PRIVATE_KEY"):
            self._config.wallet.private_key = os.getenv("WALLET_PRIVATE_KEY")
        
        if os.getenv("DATABASE_URL"):
            self._config.database.url = os.getenv("DATABASE_URL")
        
        if os.getenv("TELEGRAM_BOT_TOKEN"):
            self._config.monitoring.telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
        
        if os.getenv("DRY_RUN"):
            self._config.dry_run = os.getenv("DRY_RUN").lower() == "true"
    
    @property
    def config(self) -> BotConfig:
        """Get loaded configuration"""
        return self.load_config()
    
    def save_config(self, config: BotConfig, path: Optional[Path] = None):
        """Save configuration to file"""
        save_path = path or self.config_path
        save_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(save_path, 'w') as f:
            yaml.dump(config.dict(), f, default_flow_style=False, indent=2)

# Global config manager instance
config_manager = ConfigManager()

def get_config() -> BotConfig:
    """Get the global bot configuration"""
    return config_manager.load_config()