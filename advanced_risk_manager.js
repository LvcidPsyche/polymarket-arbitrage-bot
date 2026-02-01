#!/usr/bin/env node

/**
 * Advanced Risk Management System for Arbitrage Trading
 * Implements Kelly Criterion, position sizing, and portfolio protection
 */

const fs = require('fs');
const path = require('path');

class AdvancedRiskManager {
    constructor() {
        this.configFile = 'risk_config.json';
        this.historyFile = 'trading_history.json';
        this.defaultConfig = {
            maxPositionSize: 0.10,        // 10% of portfolio per trade
            maxDailyRisk: 0.25,           // 25% of portfolio per day
            kellyMultiplier: 0.25,        // Conservative Kelly fraction
            stopLossPercent: 0.15,        // 15% stop loss
            maxDrawdown: 0.20,            // 20% maximum drawdown
            minWinRate: 0.45,             // Minimum 45% win rate to continue
            coolingPeriod: 300000,        // 5 minutes between failed trades
            emergencyStop: false
        };
        this.loadConfig();
        this.loadHistory();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
            } else {
                this.config = { ...this.defaultConfig };
                this.saveConfig();
            }
        } catch (error) {
            console.error('📛 Error loading risk config:', error.message);
            this.config = { ...this.defaultConfig };
        }
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                this.history = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
            } else {
                this.history = {
                    trades: [],
                    performance: {
                        totalTrades: 0,
                        winningTrades: 0,
                        totalPnL: 0,
                        maxDrawdown: 0,
                        currentStreak: 0,
                        lastTradeTime: 0
                    }
                };
            }
        } catch (error) {
            console.error('📛 Error loading trading history:', error.message);
            this.history = { trades: [], performance: {} };
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('📛 Error saving risk config:', error.message);
        }
    }

    saveHistory() {
        try {
            fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('📛 Error saving trading history:', error.message);
        }
    }

    /**
     * Kelly Criterion position sizing
     * Formula: (bp - q) / b
     * Where: b = odds, p = win probability, q = loss probability
     */
    calculateKellyPosition(winProbability, avgWin, avgLoss, portfolioBalance) {
        if (winProbability <= 0.5 || avgWin <= 0 || avgLoss <= 0) {
            return 0; // Don't trade if edge is unclear
        }

        const b = avgWin / avgLoss;  // Reward to risk ratio
        const p = winProbability;
        const q = 1 - p;

        const kellyFraction = (b * p - q) / b;
        
        // Apply conservative multiplier
        const conservativeKelly = kellyFraction * this.config.kellyMultiplier;
        
        // Cap at maximum position size
        const finalFraction = Math.min(conservativeKelly, this.config.maxPositionSize);
        
        return Math.max(0, finalFraction * portfolioBalance);
    }

    /**
     * Evaluate if trade should be taken based on risk parameters
     */
    evaluateTradeRisk(opportunity, portfolioBalance, currentPositions) {
        const riskAssessment = {
            approved: false,
            positionSize: 0,
            reasons: [],
            warnings: []
        };

        // Emergency stop check
        if (this.config.emergencyStop) {
            riskAssessment.reasons.push('❌ Emergency stop activated');
            return riskAssessment;
        }

        // Portfolio protection checks
        const currentExposure = this.calculateCurrentExposure(currentPositions);
        if (currentExposure >= this.config.maxDailyRisk * portfolioBalance) {
            riskAssessment.reasons.push('❌ Daily risk limit exceeded');
            return riskAssessment;
        }

        // Performance-based restrictions
        const winRate = this.calculateWinRate();
        if (winRate < this.config.minWinRate && this.history.performance.totalTrades > 10) {
            riskAssessment.reasons.push(`❌ Win rate too low: ${(winRate * 100).toFixed(1)}%`);
            return riskAssessment;
        }

        // Cooling period check
        const timeSinceLastTrade = Date.now() - this.history.performance.lastTradeTime;
        if (this.history.performance.currentStreak < -2 && timeSinceLastTrade < this.config.coolingPeriod) {
            riskAssessment.reasons.push('❌ In cooling period after losses');
            return riskAssessment;
        }

        // Calculate position size using Kelly Criterion
        const historicalStats = this.getHistoricalStats();
        const positionSize = this.calculateKellyPosition(
            historicalStats.winProbability,
            historicalStats.avgWin,
            historicalStats.avgLoss,
            portfolioBalance
        );

        if (positionSize < portfolioBalance * 0.001) { // Less than 0.1%
            riskAssessment.reasons.push('❌ Position size too small to be profitable');
            return riskAssessment;
        }

        // Opportunity-specific checks
        if (opportunity.expectedReturn < 0.05) { // Less than 5% expected return
            riskAssessment.reasons.push('❌ Expected return too low');
            return riskAssessment;
        }

        if (opportunity.confidence < 0.8) { // Less than 80% confidence
            riskAssessment.warnings.push('⚠️ Low confidence opportunity');
        }

        // Approve trade
        riskAssessment.approved = true;
        riskAssessment.positionSize = positionSize;
        riskAssessment.reasons.push('✅ Trade approved by risk management');

        return riskAssessment;
    }

    /**
     * Record trade result for future risk calculations
     */
    recordTrade(trade) {
        const tradeRecord = {
            timestamp: Date.now(),
            size: trade.size,
            expectedReturn: trade.expectedReturn,
            actualReturn: trade.actualReturn,
            success: trade.actualReturn > 0,
            market: trade.market,
            strategy: trade.strategy
        };

        this.history.trades.push(tradeRecord);
        this.updatePerformanceStats(tradeRecord);
        this.saveHistory();

        // Auto-adjust risk parameters based on performance
        this.adaptiveRiskAdjustment();
    }

    updatePerformanceStats(trade) {
        const perf = this.history.performance;
        
        perf.totalTrades++;
        if (trade.success) {
            perf.winningTrades++;
            perf.currentStreak = Math.max(0, perf.currentStreak) + 1;
        } else {
            perf.currentStreak = Math.min(0, perf.currentStreak) - 1;
        }

        perf.totalPnL += trade.actualReturn;
        perf.lastTradeTime = trade.timestamp;

        // Update max drawdown
        if (perf.totalPnL < 0 && Math.abs(perf.totalPnL) > perf.maxDrawdown) {
            perf.maxDrawdown = Math.abs(perf.totalPnL);
        }
    }

    /**
     * Adaptive risk adjustment based on recent performance
     */
    adaptiveRiskAdjustment() {
        const recentTrades = this.history.trades.slice(-20); // Last 20 trades
        if (recentTrades.length < 10) return;

        const recentWinRate = recentTrades.filter(t => t.success).length / recentTrades.length;
        
        // Reduce risk if performance is poor
        if (recentWinRate < 0.4) {
            this.config.maxPositionSize = Math.max(0.05, this.config.maxPositionSize * 0.8);
            this.config.kellyMultiplier = Math.max(0.1, this.config.kellyMultiplier * 0.9);
            console.log('📉 Risk parameters reduced due to poor performance');
        } 
        // Increase risk if performance is excellent
        else if (recentWinRate > 0.7) {
            this.config.maxPositionSize = Math.min(0.15, this.config.maxPositionSize * 1.1);
            this.config.kellyMultiplier = Math.min(0.5, this.config.kellyMultiplier * 1.05);
            console.log('📈 Risk parameters increased due to strong performance');
        }

        this.saveConfig();
    }

    getHistoricalStats() {
        if (this.history.trades.length < 5) {
            // Default stats for new systems
            return {
                winProbability: 0.55,
                avgWin: 0.12,
                avgLoss: 0.08
            };
        }

        const wins = this.history.trades.filter(t => t.success);
        const losses = this.history.trades.filter(t => !t.success);

        return {
            winProbability: wins.length / this.history.trades.length,
            avgWin: wins.length > 0 ? wins.reduce((sum, t) => sum + t.actualReturn, 0) / wins.length : 0.1,
            avgLoss: losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.actualReturn, 0)) / losses.length : 0.05
        };
    }

    calculateWinRate() {
        if (this.history.performance.totalTrades === 0) return 1.0;
        return this.history.performance.winningTrades / this.history.performance.totalTrades;
    }

    calculateCurrentExposure(positions) {
        return positions.reduce((total, pos) => total + pos.size, 0);
    }

    /**
     * Generate risk report
     */
    generateRiskReport() {
        const stats = this.getHistoricalStats();
        const winRate = this.calculateWinRate();

        return {
            timestamp: new Date().toISOString(),
            config: this.config,
            performance: {
                totalTrades: this.history.performance.totalTrades,
                winRate: (winRate * 100).toFixed(1) + '%',
                totalPnL: this.history.performance.totalPnL.toFixed(4),
                maxDrawdown: this.history.performance.maxDrawdown.toFixed(4),
                currentStreak: this.history.performance.currentStreak,
                avgWin: (stats.avgWin * 100).toFixed(2) + '%',
                avgLoss: (stats.avgLoss * 100).toFixed(2) + '%'
            },
            riskMetrics: {
                kellyOptimal: this.calculateKellyPosition(stats.winProbability, stats.avgWin, stats.avgLoss, 100),
                expectedValue: stats.winProbability * stats.avgWin - (1 - stats.winProbability) * stats.avgLoss,
                sharpeRatio: this.calculateSharpeRatio()
            }
        };
    }

    calculateSharpeRatio() {
        const returns = this.history.trades.map(t => t.actualReturn);
        if (returns.length < 2) return 0;

        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        return stdDev === 0 ? 0 : avgReturn / stdDev;
    }

    // Emergency controls
    emergencyStop() {
        this.config.emergencyStop = true;
        this.saveConfig();
        console.log('🚨 EMERGENCY STOP ACTIVATED - All trading halted');
    }

    resumeTrading() {
        this.config.emergencyStop = false;
        this.saveConfig();
        console.log('✅ Trading resumed');
    }
}

// CLI interface
if (require.main === module) {
    const riskManager = new AdvancedRiskManager();
    const command = process.argv[2];

    switch (command) {
        case 'report':
            console.log('📊 RISK MANAGEMENT REPORT');
            console.log('========================');
            const report = riskManager.generateRiskReport();
            console.log(JSON.stringify(report, null, 2));
            break;
            
        case 'stop':
            riskManager.emergencyStop();
            break;
            
        case 'resume':
            riskManager.resumeTrading();
            break;
            
        default:
            console.log('Advanced Risk Manager v1.0');
            console.log('Usage:');
            console.log('  node advanced_risk_manager.js report  - Generate risk report');
            console.log('  node advanced_risk_manager.js stop    - Emergency stop trading');
            console.log('  node advanced_risk_manager.js resume  - Resume trading');
    }
}

module.exports = AdvancedRiskManager;