# 🚀 Polymarket Arbitrage Bot

**Autonomous trading system for cross-platform arbitrage opportunities on Polymarket and Kalshi.**

Built with Node.js, Python, and Web3 integration for automated profit generation through market inefficiencies.

## ✨ Features

### 🤖 **Advanced Automated Detection**
- **Real-time scanning** of Polymarket markets for endgame arbitrage (95-99% probability markets)
- **Cross-platform arbitrage** detection between Polymarket and Kalshi
- **Silent execution** mode for continuous background operation
- **Smart filtering** to identify high-probability opportunities
- **Market maker pattern analysis** for sophisticated exploitation strategies
- **Machine learning** opportunity ranking and success prediction

### 💰 **Comprehensive Trading Strategies**
- **Endgame Arbitrage**: Target markets near resolution with extreme probability skew
- **Cross-Platform**: Exploit price differences between Polymarket and Kalshi
- **Market Maker Exploitation**: Identify and exploit MM behavior patterns
- **ML-Enhanced Selection**: Use historical data to improve opportunity selection
- **Advanced Risk Management**: Kelly Criterion position sizing with adaptive parameters
- **Compound Growth**: Intelligent reinvestment strategy for exponential scaling

### 📊 **Real-Time Monitoring & Control**
- **Web Dashboard**: Real-time performance monitoring and system control
- **WebSocket Updates**: Live data streaming for immediate insights
- **Risk Analytics**: Comprehensive risk metrics and emergency controls
- **ML Insights**: Actionable intelligence from pattern recognition
- **Performance Tracking**: Detailed analytics with Sharpe ratio and drawdown analysis

### 🔧 **Technical Architecture**
- **Node.js** detection engines with WebSocket support
- **Python** wallet management and Web3 integration
- **Multi-network** support (Ethereum, Polygon, Solana)
- **API Integration** with Polymarket and Kalshi platforms
- **Secure credential** management with environment variables

## 🚀 **Quick Start**

### Prerequisites
- Node.js 18+
- Python 3.8+
- Web3 wallet with funding (~$10+ to start)

### Installation

```bash
# Clone the repository
git clone https://github.com/LvcidPsyche/polymarket-arbitrage-bot.git
cd polymarket-arbitrage-bot

# Install Node.js dependencies
npm install

# Set up Python environment
python3 -m venv polymarket-env
source polymarket-env/bin/activate
pip install web3 mnemonic requests

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials
```

### Configuration

Create a `.env` file with:
```env
WALLET_SEED="your twelve word seed phrase here"
KALSHI_API_KEY="your_kalshi_api_key"
KALSHI_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
POLYGON_RPC_URL="https://polygon-rpc.com"
```

### Usage

#### Basic Operations
```bash
# Check wallet balances
source polymarket-env/bin/activate
python3 check_all_balances.py

# Run single arbitrage scan
node arbitrage_detector.js

# Start continuous silent operation
./execute_silent_trading.sh

# Check system status
node check_silent_status.js
```

#### Advanced Features
```bash
# Start real-time web dashboard
node dashboard_server.js
# Then visit http://localhost:3000

# Advanced risk management
node advanced_risk_manager.js report    # Generate risk report
node advanced_risk_manager.js stop      # Emergency stop
node advanced_risk_manager.js resume    # Resume trading

# Machine learning insights
python3 ml_opportunity_predictor.py insights  # Generate ML insights
python3 ml_opportunity_predictor.py retrain   # Retrain model

# Market maker analysis
node market_maker_analyzer.js monitor        # Start MM monitoring
node market_maker_analyzer.js report         # Generate MM report
node market_maker_analyzer.js opportunities  # Show exploitable opportunities
```

## 📊 **Performance**

**Target Performance:**
- **548% annualized returns** on successful endgame trades
- **15-25% success rate** on identified opportunities  
- **Starting capital:** $10
- **Growth target:** $10 → $1,000+ through compounding

**Risk Management:**
- Maximum 10% of balance per trade
- Automated position sizing
- Stop-loss mechanisms
- Diversified opportunity hunting

## 🛠 **System Components**

### Advanced Detection Engines
- `arbitrage_detector.js` - Main opportunity scanner
- `intensive_arbitrage_scanner.js` - Deep market analysis
- `efficient_arbitrage_scanner.js` - Optimized resource usage
- `silent_arbitrage_executor.js` - Background trading system
- `market_maker_analyzer.js` - **NEW**: MM behavior analysis and exploitation
- `ml_opportunity_predictor.py` - **NEW**: Machine learning opportunity ranking

### Risk & Portfolio Management
- `advanced_risk_manager.js` - **NEW**: Kelly Criterion position sizing with adaptive parameters
- `check_all_balances.py` - Multi-network balance checking
- `check_wallet.py` - Primary wallet validation
- `create_test_wallet.py` - Development wallet generation

### Monitoring & Control
- `dashboard_server.js` - **NEW**: Real-time web dashboard with WebSocket
- `autonomous_trader.js` - Execution engine
- `manual_arbitrage_guide.md` - Manual trading procedures

### Core Trading Infrastructure
- `polymarket_trading_system/` - Core trading logic with strategies
- `polymarket_trading_system/src/strategies/endgame_arbitrage.py` - Endgame strategy implementation
- `polymarket_trading_system/src/strategies/cross_platform.py` - Cross-platform arbitrage
- `polymarket_trading_system/src/core/risk_manager.py` - Risk management core
- `polymarket_trading_system/src/core/trading_engine.py` - Main execution engine

## 🔍 **Monitoring**

The system provides comprehensive monitoring:

```bash
# System health check
node check_silent_status.js

# Recent activity logs  
cat arbitrage_scans/recent_activity.log

# Balance tracking
python3 check_all_balances.py
```

## 🎯 **Strategy Details**

### Endgame Arbitrage
Target markets with 95-99% probability near resolution:
- Sports events with clear outcomes
- Economic announcements 
- Political events with deadlines
- Time-sensitive predictions

### Cross-Platform Opportunities
Exploit price differences between:
- Polymarket vs Kalshi
- Different resolution timeframes
- Market maker inefficiencies

## 🔐 **Security**

- **Environment variables** for sensitive data
- **Local credential storage** with secure access
- **Transaction signing** with private key management
- **Rate limiting** and API compliance
- **Fail-safe mechanisms** to prevent large losses

## 📈 **Scaling Strategy**

1. **Phase 1**: Manual validation with $10-50
2. **Phase 2**: Semi-automated with $50-500  
3. **Phase 3**: Fully autonomous with $500+
4. **Phase 4**: Multi-strategy deployment

## 🤝 **Contributing**

This is an active development project. Key areas for improvement:
- Additional arbitrage strategies
- Enhanced risk management
- UI/dashboard development
- Performance optimization
- Strategy backtesting

## ⚠️ **Disclaimer**

This software is for educational and research purposes. Trading involves risk of loss. Always test with small amounts and understand the risks involved. Past performance does not guarantee future results.

## 📞 **Support**

For questions or issues:
- Create a GitHub issue
- Review the documentation in `/docs`
- Check the troubleshooting guide

---

**Built by OpenClawdad** 🦀 | **Autonomous AI Trading System**