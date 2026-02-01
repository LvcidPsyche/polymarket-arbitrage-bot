# Polymarket Arbitrage Research & Strategy

## Executive Summary
- **Total market opportunity:** $40M+ extracted in past year
- **Success rate:** Only 0.51% of users profitable (>$1k)  
- **Documented case:** $10k → $100k in 6 months via pure arbitrage
- **Speed requirement:** Opportunities last seconds, not minutes
- **Starting capital:** $10 → 4 figures goal

## Types of Arbitrage Opportunities

### 1. **Intra-Market (Binary)** - BEST FOR BEGINNERS
- **How:** YES + NO prices ≠ $1.00
- **Example:** YES=$0.45, NO=$0.50, Cost=$0.95, Profit=5.3%
- **Frequency:** Most common
- **Competition:** High (bots dominate)

### 2. **Cross-Platform** - MOST PROMISING
- **How:** Same event, different prices on Polymarket vs Kalshi
- **Example:** BTC>$100k - Poly YES=$0.55, Kalshi YES=$0.62 = 12.7% profit
- **Advantage:** Less bot competition, higher margins
- **Fees:** Polymarket 0.01%, Kalshi 0.7%

### 3. **Endgame** - BEST ROI
- **How:** Near-certain outcomes (95-99%) close to resolution
- **Example:** 97¢ → $1.00 in 2 days = 548% annualized
- **Risk:** Black swan events can reverse "certain" outcomes

### 4. **Multi-Outcome (Combinatorial)**
- **How:** All outcomes should sum to $1.00
- **Complexity:** Higher, but less competition
- **Margins:** Lower (0.5-2%) but more frequent

## Technical Infrastructure

### **APIs & Tools**
- **pmxt.dev** - Unified API for all platforms (like CCXT for crypto)
- **py-clob-client** - Official Polymarket Python client  
- **Kalshi API** - Direct Kalshi integration
- **WebSocket streams** - Real-time price updates (mandatory)

### **Execution Requirements**
- **Speed:** Sub-500ms detection to execution
- **Orders:** Market orders (take liquidity) vs limit orders
- **Capital:** Start small (1-5% of market liquidity)
- **Infrastructure:** Consider co-located servers near Polygon nodes

## Successful Bot Architectures

### **1. Reddit Bot (realfishsam)**
- **Strategy:** Synthetic arbitrage (YES on one platform, NO on other)
- **Execution:** Convergence trading (don't hold to maturity)
- **Tech:** Node.js + pmxt.dev
- **Focus:** Fed Chair nominations, major political events

### **2. BTC Hour Bot (CarlosIbCu)**
- **Strategy:** BTC 1-hour price predictions
- **Stack:** Python FastAPI + Next.js dashboard
- **Advantage:** High-frequency, predictable patterns
- **Matching:** Strike price alignment between platforms

### **3. Multi-Market Scanner**
- **Strategy:** Monitor all markets simultaneously
- **Detection:** Real-time WebSocket monitoring
- **Execution:** Atomic trades (both legs simultaneously)

## Profitability Analysis

### **Fee Structure**
| Platform | Fee | Impact on $1000 trade |
|----------|-----|---------------------|
| Polymarket (US) | 0.01% | $0.10 |
| Polymarket (Intl) | 2% net winnings | $20 on $1000 profit |
| Kalshi | ~0.7% | $7.00 |
| Polygon gas | ~$0.007 | $0.01 |

### **Expected Returns by Strategy**
- **Manual endgame:** 10-30% annualized
- **Semi-automated detection:** 30-100% annualized  
- **Fully automated bots:** 100-300%+ (highly competitive)

## Risk Factors

### **Execution Risk**
- **Slippage:** 3% planned profit → 0.5% actual
- **Timing:** Markets move in seconds
- **Liquidity:** Thin orderbooks = higher slippage

### **Platform Risk**
- **Resolution disputes:** Even "certain" outcomes can reverse
- **API failures:** Downtime during opportunities
- **Rate limits:** Execution throttling

### **Competition**
- **Bot dominated:** Manual trading uncompetitive
- **Speed wars:** Co-location becoming necessity
- **Margin compression:** Profits decreasing over time

## Recommended Implementation Plan

### **Phase 1: Manual Detection ($10-$100)**
1. Use EventArb.com calculator for cross-platform opportunities
2. Focus on endgame arbitrage (95-99% markets)
3. Manual execution via web interfaces
4. **Target:** 20-50% monthly returns

### **Phase 2: Semi-Automated ($100-$1000)**
1. Build detection scripts using pmxt.dev
2. Manual execution of identified opportunities
3. Focus on multi-outcome markets (less competition)
4. **Target:** 50-100% monthly returns

### **Phase 3: Full Automation ($1000-$10000)**
1. WebSocket real-time monitoring
2. Automated execution via APIs
3. Cross-platform + endgame combined strategy
4. **Target:** 100%+ monthly returns

## Technical Implementation Roadmap

### **Week 1-2: Foundation**
- Set up pmxt.dev + APIs
- Build basic detection script
- Paper trading to validate logic
- **Budget:** $0 (testing only)

### **Week 3-4: Live Testing**
- Start with $10 endgame trades
- Manual execution, automated detection
- Track performance metrics
- **Target:** $10 → $50

### **Month 2-3: Scaling**
- Implement cross-platform detection
- Semi-automated execution
- Increase capital allocation
- **Target:** $50 → $500

### **Month 4-6: Full Bot**
- Real-time WebSocket integration
- Fully automated trading
- Multi-strategy approach
- **Target:** $500 → $5000+

## Key Success Factors
1. **Speed over accuracy** - Fast execution beats perfect detection
2. **Diversification** - Multiple strategies reduce single-point failure
3. **Risk management** - Never bet more than 10% on single market
4. **Infrastructure** - Proper APIs, monitoring, error handling
5. **Adaptation** - Strategies evolve as competition increases

## Next Actions
1. Set up pmxt.dev development environment
2. Choose wallet (recommend Polygon/Ethereum for Polymarket)
3. Start with manual endgame detection
4. Build monitoring dashboard
5. Scale based on performance data