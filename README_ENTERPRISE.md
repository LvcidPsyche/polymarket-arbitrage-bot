# 🏢 Enterprise Polymarket Arbitrage Bot

**Institutional-grade prediction market arbitrage system with mathematical precision.**

---

## 📊 Mathematical Foundations

### 1. Dutch Book Arbitrage

**The Core Formula:**
```
IF: YES_price + NO_price < $1.00
THEN: Guaranteed profit = $1.00 - (YES_price + NO_price)
```

**Example:**
- YES shares trading at $0.58
- NO shares trading at $0.40
- Total cost: $0.98
- **Guaranteed profit: $0.02 (2.04% ROI)**

In a binary market, one outcome MUST occur. By purchasing both at a combined discount to $1.00, you lock in risk-free profit at resolution.

---

### 2. Synthetic Arbitrage (Cross-Platform)

**Strategy:** Exploit price differences between Polymarket and Kalshi

**Formula (Direct):**
```
IF: Poly_YES_price + Kalshi_NO_price < $1.00 - fees
THEN: Execute synthetic position
```

**Formula (Reverse):**
```
IF: Poly_NO_price + Kalshi_YES_price < $1.00 - fees
THEN: Execute reverse synthetic position
```

**Example:**
- Polymarket YES: $0.52
- Kalshi NO: $0.46
- Fees: 0.7%
- Total cost: $0.98 + $0.007 = $0.987
- **Net profit: $0.013 (1.32% ROI)**

---

### 3. Kelly Criterion Position Sizing

**The Formula:**
```
f* = (bp - q) / b

Where:
- f* = Optimal fraction of bankroll to bet
- b = Average win / Average loss (reward-to-risk)
- p = Probability of win
- q = Probability of loss (1 - p)
```

**Conservative Implementation:**
```javascript
// Use Half-Kelly for safety margin
recommended = fullKelly * 0.5

// Cap at 25% maximum per trade
recommended = Math.min(recommended, 0.25)
```

**Example:**
- Win rate: 60%
- Avg win: 15%
- Avg loss: 10%
- b = 1.5
- f* = (1.5 × 0.6 - 0.4) / 1.5 = 0.33
- **Half-Kelly: 16.5% of bankroll**

---

### 4. Latency Arbitrage

**Concept:** Exploit price leadership between platforms

**Detection:**
```
IF: Platform_A updates price
AND: Platform_B follows within X milliseconds
AND: Price difference > threshold
THEN: Pre-position on follower platform
```

**Lead-Lag Correlation:**
```python
# Calculate cross-correlation at different lags
best_lag = argmax(correlation(Platform_A, Platform_B, lag))
leader = Platform_A if best_lag < 0 else Platform_B
```

---

## 🏗️ Architecture

```
src/
├── core/
│   ├── dutch_book_arbitrage.ts      # Risk-free arbitrage math
│   ├── synthetic_arbitrage.ts       # Cross-platform opportunities
│   ├── hft_execution_engine.ts      # Millisecond execution
│   └── market_microstructure.ts     # Order book analysis
├── risk/
│   └── kelly_criterion.ts           # Position sizing algorithms
├── utils/
│   └── latency_arbitrage.ts         # Cross-platform latency exploitation
└── types/
    └── index.ts                     # Type definitions
```

---

## 🚀 Enterprise Features

### High-Frequency Execution
- **WebSocket price feeds** for sub-second updates
- **Latency monitoring** across all platforms
- **Order book depth analysis** for slippage prediction
- **Coordinated multi-platform execution**

### Advanced Risk Management
- **Kelly Criterion** position sizing
- **Portfolio-level** allocation optimization
- **Dynamic adjustment** based on performance
- **Maximum drawdown** protection

### Market Intelligence
- **Market maker pattern detection**
- **Order flow imbalance** analysis
- **Liquidity profiling** (TWAL)
- **Iceberg order detection**

### Execution Quality
- **Slippage estimation** before trade
- **Price impact modeling**
- **Fallback execution** strategies
- **Execution monitoring** and reporting

---

## 📈 Performance Expectations

| Metric | Target |
|--------|--------|
| Dutch Book ROI | 0.5% - 3% per trade |
| Synthetic Arbitrage ROI | 1% - 5% per trade |
| Trade Success Rate | >75% |
| Max Position Size | 25% of bankroll |
| Expected Drawdown | <15% |
| Sharpe Ratio | >1.5 |

---

## 🔧 Configuration

### Environment Variables
```bash
# Platform APIs
POLYMARKET_API_KEY=your_key
POLYMARKET_PRIVATE_KEY=your_private_key
KALSHI_API_KEY=your_key
KALSHI_API_SECRET=your_secret

# Risk Parameters
MAX_POSITION_PCT=0.25
KELLY_MULTIPLIER=0.5
MAX_DAILY_RISK=0.25

# Execution
MAX_SLIPPAGE_PCT=0.005
EXECUTION_TIMEOUT_MS=5000
WEBSOCKET_RECONNECT_MS=1000

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "Dutch Book"

# Run with coverage
npm run test:coverage
```

---

## 🐳 Docker Deployment

```bash
# Build image
docker build -t polymarket-arbitrage .

# Run with environment
docker run -d \
  --env-file .env \
  --name arb-bot \
  polymarket-arbitrage

# View logs
docker logs -f arb-bot
```

---

## 📊 Monitoring Dashboard

The included dashboard provides real-time visibility into:

- Active arbitrage opportunities
- Position P&L
- Risk metrics
- Execution quality
- System health

Access at `http://localhost:3000`

---

## ⚠️ Risk Disclosures

**This system involves financial risk:**

1. **Execution Risk:** Prices may move before both legs execute
2. **Platform Risk:** Exchanges may fail or freeze
3. **Smart Contract Risk:** Bugs in platform contracts
4. **Regulatory Risk:** Prediction markets may face restrictions
5. **Liquidity Risk:** Large orders may move the market

**Always start with small capital and thoroughly test in dry-run mode.**

---

## 🎓 Mathematical Deep Dive

### Expected Value Calculation

For any opportunity:
```
EV = (Win_Probability × Win_Amount) - (Loss_Probability × Loss_Amount)

IF EV > 0: Trade is profitable
IF EV < 0: Do not trade
```

### Geometric Brownian Motion

Price movements modeled as:
```
dS = μS dt + σS dW

Where:
- S = Price
- μ = Drift (expected return)
- σ = Volatility
- dW = Wiener process (random walk)
```

### Optimal Stopping

When to exit a position:
```
V(t) = max{π(t), E[V(t+1)]}

Exit when: Current profit ≥ Expected future profit
```

---

## 📚 References

1. **Kelly Criterion:** Kelly, J.L. (1956). "A New Interpretation of Information Rate"
2. **Dutch Book:** de Finetti, B. (1937). "La Prévision: ses lois logiques, ses sources subjectives"
3. **Market Microstructure:** O'Hara, M. (1995). "Market Microstructure Theory"
4. **Latency Arbitrage:** Aldrich, E. (2016). "HFT and the Risk of a Financial system" 

---

**Built for institutional-grade performance with mathematical rigor.**
