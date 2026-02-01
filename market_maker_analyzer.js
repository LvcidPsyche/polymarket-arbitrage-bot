#!/usr/bin/env node

/**
 * Market Maker Analyzer for Advanced Arbitrage Detection
 * Identifies market maker behavior patterns and pricing inefficiencies
 */

const fs = require('fs');
const WebSocket = require('ws');
const axios = require('axios');

class MarketMakerAnalyzer {
    constructor() {
        this.patterns = new Map();
        this.orderBookSnapshots = [];
        this.mmProfiles = new Map();
        this.exploitableOpportunities = [];
        
        // Market maker detection parameters
        this.mmDetectionThresholds = {
            minOrderBookDepth: 500,
            maxSpread: 0.02,       // 2% max spread for MM activity
            minUpdateFrequency: 10,  // Updates per minute
            symmetryThreshold: 0.8,  // Order book symmetry
            volumeConsistency: 0.7   // Volume pattern consistency
        };
        
        // Load historical MM data
        this.loadHistoricalData();
        
        // Start monitoring
        this.startMonitoring();
    }
    
    async loadHistoricalData() {
        try {
            if (fs.existsSync('mm_profiles.json')) {
                const data = JSON.parse(fs.readFileSync('mm_profiles.json', 'utf8'));
                this.mmProfiles = new Map(Object.entries(data));
                console.log(`📊 Loaded ${this.mmProfiles.size} market maker profiles`);
            }
            
            if (fs.existsSync('mm_patterns.json')) {
                const data = JSON.parse(fs.readFileSync('mm_patterns.json', 'utf8'));
                this.patterns = new Map(Object.entries(data));
                console.log(`🎯 Loaded ${this.patterns.size} MM behavior patterns`);
            }
        } catch (error) {
            console.error('📛 Error loading MM historical data:', error.message);
        }
    }
    
    saveHistoricalData() {
        try {
            fs.writeFileSync('mm_profiles.json', JSON.stringify(Object.fromEntries(this.mmProfiles), null, 2));
            fs.writeFileSync('mm_patterns.json', JSON.stringify(Object.fromEntries(this.patterns), null, 2));
        } catch (error) {
            console.error('📛 Error saving MM data:', error.message);
        }
    }
    
    startMonitoring() {
        // Monitor order book changes every 5 seconds
        setInterval(() => {
            this.captureOrderBookSnapshots();
        }, 5000);
        
        // Analyze patterns every minute
        setInterval(() => {
            this.analyzeMMBehavior();
        }, 60000);
        
        // Update MM profiles every 5 minutes
        setInterval(() => {
            this.updateMMProfiles();
            this.saveHistoricalData();
        }, 300000);
        
        console.log('🤖 Market maker monitoring started');
    }
    
    async captureOrderBookSnapshots() {
        try {
            // This would connect to actual market APIs
            // For now, we'll simulate with sample data
            const snapshot = await this.fetchOrderBookData();
            
            if (snapshot) {
                this.orderBookSnapshots.push({
                    timestamp: Date.now(),
                    ...snapshot
                });
                
                // Keep only recent snapshots (last hour)
                const cutoff = Date.now() - 3600000;
                this.orderBookSnapshots = this.orderBookSnapshots.filter(s => s.timestamp > cutoff);
            }
        } catch (error) {
            console.error('📛 Error capturing order book:', error.message);
        }
    }
    
    async fetchOrderBookData() {
        // Simulate order book data fetch
        // In production, this would connect to Polymarket API
        return {
            market_id: 'sample_market',
            bids: this.generateSimulatedOrderBook('bid'),
            asks: this.generateSimulatedOrderBook('ask'),
            spread: Math.random() * 0.05,
            depth: Math.random() * 2000 + 500
        };
    }
    
    generateSimulatedOrderBook(side) {
        const orders = [];
        const basePrice = 0.6 + Math.random() * 0.3;
        const adjustment = side === 'bid' ? -0.01 : 0.01;
        
        for (let i = 0; i < 10; i++) {
            orders.push({
                price: basePrice + (adjustment * i),
                size: Math.random() * 100 + 50,
                timestamp: Date.now()
            });
        }
        
        return orders;
    }
    
    analyzeMMBehavior() {
        if (this.orderBookSnapshots.length < 10) return;
        
        const recentSnapshots = this.orderBookSnapshots.slice(-20);
        
        recentSnapshots.forEach(snapshot => {
            const mmSignature = this.identifyMMSignature(snapshot);
            if (mmSignature.isMarketMaker) {
                this.recordMMActivity(snapshot.market_id, mmSignature);
                this.checkForExploitablePatterns(snapshot, mmSignature);
            }
        });
    }
    
    identifyMMSignature(snapshot) {
        const signature = {
            isMarketMaker: false,
            confidence: 0,
            characteristics: {},
            exploitability: 0
        };
        
        // Check order book symmetry
        const symmetry = this.calculateOrderBookSymmetry(snapshot);
        signature.characteristics.symmetry = symmetry;
        
        if (symmetry > this.mmDetectionThresholds.symmetryThreshold) {
            signature.confidence += 0.3;
        }
        
        // Check spread consistency
        const spreadConsistency = this.calculateSpreadConsistency(snapshot);
        signature.characteristics.spreadConsistency = spreadConsistency;
        
        if (spreadConsistency > 0.8 && snapshot.spread < this.mmDetectionThresholds.maxSpread) {
            signature.confidence += 0.25;
        }
        
        // Check order size patterns
        const sizePatterns = this.analyzeSizePatterns(snapshot);
        signature.characteristics.sizePatterns = sizePatterns;
        
        if (sizePatterns.consistency > 0.7) {
            signature.confidence += 0.2;
        }
        
        // Check update frequency
        const updateFrequency = this.calculateUpdateFrequency(snapshot.market_id);
        signature.characteristics.updateFrequency = updateFrequency;
        
        if (updateFrequency > this.mmDetectionThresholds.minUpdateFrequency) {
            signature.confidence += 0.15;
        }
        
        // Check depth consistency
        if (snapshot.depth > this.mmDetectionThresholds.minOrderBookDepth) {
            signature.confidence += 0.1;
        }
        
        signature.isMarketMaker = signature.confidence > 0.7;
        
        // Calculate exploitability based on predictable patterns
        signature.exploitability = this.calculateExploitability(signature.characteristics);
        
        return signature;
    }
    
    calculateOrderBookSymmetry(snapshot) {
        try {
            const bidVolume = snapshot.bids.reduce((sum, bid) => sum + bid.size, 0);
            const askVolume = snapshot.asks.reduce((sum, ask) => sum + ask.size, 0);
            
            if (bidVolume === 0 && askVolume === 0) return 0;
            
            const ratio = Math.min(bidVolume, askVolume) / Math.max(bidVolume, askVolume);
            return ratio;
        } catch (error) {
            return 0;
        }
    }
    
    calculateSpreadConsistency(snapshot) {
        const marketId = snapshot.market_id;
        const recentSpreads = this.orderBookSnapshots
            .filter(s => s.market_id === marketId)
            .slice(-10)
            .map(s => s.spread);
        
        if (recentSpreads.length < 3) return 0;
        
        const avgSpread = recentSpreads.reduce((a, b) => a + b, 0) / recentSpreads.length;
        const variance = recentSpreads.reduce((sum, spread) => sum + Math.pow(spread - avgSpread, 2), 0) / recentSpreads.length;
        const stdDev = Math.sqrt(variance);
        
        // Lower standard deviation = higher consistency
        return Math.max(0, 1 - (stdDev / avgSpread));
    }
    
    analyzeSizePatterns(snapshot) {
        const bidSizes = snapshot.bids.map(b => b.size);
        const askSizes = snapshot.asks.map(a => a.size);
        
        const bidConsistency = this.calculateSizeConsistency(bidSizes);
        const askConsistency = this.calculateSizeConsistency(askSizes);
        
        return {
            consistency: (bidConsistency + askConsistency) / 2,
            bidPattern: this.identifyPattern(bidSizes),
            askPattern: this.identifyPattern(askSizes)
        };
    }
    
    calculateSizeConsistency(sizes) {
        if (sizes.length < 2) return 0;
        
        const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
        const variance = sizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) / sizes.length;
        const coefficientOfVariation = Math.sqrt(variance) / avgSize;
        
        // Lower CV = higher consistency
        return Math.max(0, 1 - coefficientOfVariation);
    }
    
    identifyPattern(sizes) {
        if (sizes.length < 3) return 'insufficient_data';
        
        // Check for common MM patterns
        const isIncreasing = sizes.every((size, i) => i === 0 || size >= sizes[i-1]);
        const isDecreasing = sizes.every((size, i) => i === 0 || size <= sizes[i-1]);
        const isUniform = sizes.every(size => Math.abs(size - sizes[0]) / sizes[0] < 0.1);
        
        if (isUniform) return 'uniform';
        if (isIncreasing) return 'increasing';
        if (isDecreasing) return 'decreasing';
        return 'random';
    }
    
    calculateUpdateFrequency(marketId) {
        const recentUpdates = this.orderBookSnapshots
            .filter(s => s.market_id === marketId && s.timestamp > Date.now() - 300000) // Last 5 minutes
            .length;
        
        return recentUpdates; // Updates in last 5 minutes
    }
    
    calculateExploitability(characteristics) {
        let exploitability = 0;
        
        // Highly symmetric and consistent MMs are more predictable
        if (characteristics.symmetry > 0.9 && characteristics.spreadConsistency > 0.8) {
            exploitability += 0.4;
        }
        
        // Predictable size patterns can be exploited
        if (characteristics.sizePatterns.consistency > 0.8) {
            exploitability += 0.3;
        }
        
        // High update frequency with consistency suggests automated MM
        if (characteristics.updateFrequency > 15 && characteristics.spreadConsistency > 0.7) {
            exploitability += 0.2;
        }
        
        // Uniform patterns are easiest to exploit
        if (characteristics.sizePatterns.bidPattern === 'uniform' || 
            characteristics.sizePatterns.askPattern === 'uniform') {
            exploitability += 0.1;
        }
        
        return Math.min(exploitability, 1.0);
    }
    
    recordMMActivity(marketId, signature) {
        if (!this.mmProfiles.has(marketId)) {
            this.mmProfiles.set(marketId, {
                firstSeen: Date.now(),
                samples: 0,
                avgConfidence: 0,
                avgExploitability: 0,
                patterns: [],
                bestExploitWindow: null
            });
        }
        
        const profile = this.mmProfiles.get(marketId);
        profile.samples++;
        profile.avgConfidence = (profile.avgConfidence * (profile.samples - 1) + signature.confidence) / profile.samples;
        profile.avgExploitability = (profile.avgExploitability * (profile.samples - 1) + signature.exploitability) / profile.samples;
        profile.patterns.push({
            timestamp: Date.now(),
            characteristics: signature.characteristics,
            exploitability: signature.exploitability
        });
        
        // Keep only recent patterns
        profile.patterns = profile.patterns.slice(-100);
        
        this.mmProfiles.set(marketId, profile);
    }
    
    checkForExploitablePatterns(snapshot, signature) {
        if (signature.exploitability > 0.6) {
            const opportunity = this.generateExploitOpportunity(snapshot, signature);
            if (opportunity) {
                this.exploitableOpportunities.push(opportunity);
                
                // Keep only recent opportunities
                const cutoff = Date.now() - 1800000; // 30 minutes
                this.exploitableOpportunities = this.exploitableOpportunities.filter(o => o.timestamp > cutoff);
                
                console.log('🎯 Found exploitable MM pattern:', opportunity.type);
            }
        }
    }
    
    generateExploitOpportunity(snapshot, signature) {
        const characteristics = signature.characteristics;
        
        // Strategy 1: Spread Compression Attack
        if (characteristics.spreadConsistency > 0.8 && snapshot.spread > 0.01) {
            return {
                type: 'spread_compression',
                market_id: snapshot.market_id,
                timestamp: Date.now(),
                confidence: signature.confidence,
                exploitability: signature.exploitability,
                strategy: {
                    action: 'place_orders_inside_spread',
                    target_spread: snapshot.spread * 0.7,
                    expected_profit: snapshot.spread * 0.3,
                    risk_level: 'low'
                },
                execution_window: 300000, // 5 minutes
                expected_return: snapshot.spread * 0.2 // Conservative estimate
            };
        }
        
        // Strategy 2: Size Pattern Exploitation
        if (characteristics.sizePatterns.consistency > 0.8) {
            return {
                type: 'size_pattern_exploit',
                market_id: snapshot.market_id,
                timestamp: Date.now(),
                confidence: signature.confidence,
                exploitability: signature.exploitability,
                strategy: {
                    action: 'mirror_and_undercut',
                    pattern: characteristics.sizePatterns.bidPattern,
                    undercut_amount: 0.001,
                    expected_fill_probability: 0.7
                },
                execution_window: 600000, // 10 minutes
                expected_return: snapshot.spread * 0.4
            };
        }
        
        // Strategy 3: Update Frequency Exploitation
        if (characteristics.updateFrequency > 20) {
            return {
                type: 'frequency_exploit',
                market_id: snapshot.market_id,
                timestamp: Date.now(),
                confidence: signature.confidence,
                exploitability: signature.exploitability,
                strategy: {
                    action: 'latency_arbitrage',
                    update_delay_estimate: 2000, // 2 seconds
                    position_size: 'small',
                    hold_duration: 30000 // 30 seconds
                },
                execution_window: 180000, // 3 minutes
                expected_return: 0.005 // 0.5%
            };
        }
        
        return null;
    }
    
    getTopOpportunities(limit = 5) {
        return this.exploitableOpportunities
            .sort((a, b) => b.expected_return - a.expected_return)
            .slice(0, limit);
    }
    
    getMMProfilesReport() {
        const report = {
            timestamp: Date.now(),
            total_markets_monitored: this.mmProfiles.size,
            active_opportunities: this.exploitableOpportunities.length,
            market_profiles: []
        };
        
        for (const [marketId, profile] of this.mmProfiles) {
            if (profile.samples > 10) { // Only include markets with sufficient data
                report.market_profiles.push({
                    market_id: marketId,
                    mm_confidence: profile.avgConfidence,
                    exploitability: profile.avgExploitability,
                    samples: profile.samples,
                    monitoring_duration: Date.now() - profile.firstSeen,
                    recent_opportunities: this.exploitableOpportunities
                        .filter(o => o.market_id === marketId)
                        .length
                });
            }
        }
        
        // Sort by exploitability
        report.market_profiles.sort((a, b) => b.exploitability - a.exploitability);
        
        return report;
    }
    
    executeExploitStrategy(opportunityId) {
        const opportunity = this.exploitableOpportunities.find(o => 
            o.timestamp === opportunityId);
        
        if (!opportunity) {
            throw new Error('Opportunity not found or expired');
        }
        
        console.log(`🎯 Executing ${opportunity.type} strategy on ${opportunity.market_id}`);
        
        // This would implement the actual trading logic
        // For now, we'll simulate the execution
        return this.simulateExecution(opportunity);
    }
    
    simulateExecution(opportunity) {
        // Simulate execution results
        const success = Math.random() < (opportunity.exploitability * 0.8);
        const actualReturn = success ? 
            opportunity.expected_return * (0.8 + Math.random() * 0.4) : 
            -opportunity.expected_return * 0.1;
        
        return {
            opportunity_id: opportunity.timestamp,
            success: success,
            actual_return: actualReturn,
            execution_time: Date.now(),
            strategy_used: opportunity.strategy.action
        };
    }
    
    // CLI interface methods
    static async runCLI(args) {
        const analyzer = new MarketMakerAnalyzer();
        await analyzer.loadHistoricalData();
        
        const command = args[0];
        
        switch (command) {
            case 'monitor':
                console.log('🤖 Starting market maker monitoring...');
                // Keep running
                break;
                
            case 'report':
                const report = analyzer.getMMProfilesReport();
                console.log('📊 MARKET MAKER ANALYSIS REPORT');
                console.log('================================');
                console.log(JSON.stringify(report, null, 2));
                process.exit(0);
                break;
                
            case 'opportunities':
                const opportunities = analyzer.getTopOpportunities();
                console.log('🎯 TOP EXPLOITABLE OPPORTUNITIES');
                console.log('================================');
                opportunities.forEach((opp, i) => {
                    console.log(`${i+1}. ${opp.type} - Market: ${opp.market_id}`);
                    console.log(`   Expected Return: ${(opp.expected_return * 100).toFixed(3)}%`);
                    console.log(`   Exploitability: ${(opp.exploitability * 100).toFixed(1)}%`);
                    console.log(`   Strategy: ${opp.strategy.action}`);
                    console.log('');
                });
                process.exit(0);
                break;
                
            case 'execute':
                const oppId = parseInt(args[1]);
                if (!oppId) {
                    console.log('Usage: node market_maker_analyzer.js execute <opportunity_timestamp>');
                    process.exit(1);
                }
                
                try {
                    const result = analyzer.executeExploitStrategy(oppId);
                    console.log('✅ Execution Result:', result);
                } catch (error) {
                    console.error('❌ Execution Error:', error.message);
                }
                process.exit(0);
                break;
                
            default:
                console.log('Market Maker Analyzer v1.0');
                console.log('Usage:');
                console.log('  node market_maker_analyzer.js monitor       - Start monitoring');
                console.log('  node market_maker_analyzer.js report        - Generate analysis report');
                console.log('  node market_maker_analyzer.js opportunities - Show top opportunities');
                console.log('  node market_maker_analyzer.js execute <id>  - Execute opportunity');
                process.exit(0);
        }
    }
}

// CLI execution
if (require.main === module) {
    MarketMakerAnalyzer.runCLI(process.argv.slice(2));
}

module.exports = MarketMakerAnalyzer;