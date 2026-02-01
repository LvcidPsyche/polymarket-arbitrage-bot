#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// AUTONOMOUS TRADING CONFIGURATION
const WALLET_ADDRESS = '0x4365F3339e8Aef1EdD95916DBF57949012E8B6f2';
const STARTING_BALANCE = 8; // $8 USDC to start with

// Trading Parameters  
const MIN_PROFIT_THRESHOLD = 0.25; // 25% APY minimum (aggressive)
const MIN_VOLUME_THRESHOLD = 100;   // $100 minimum volume (low threshold)
const MAX_POSITION_SIZE = 0.40;     // Max 40% of balance per trade
const MIN_POSITION_SIZE = 1;        // Minimum $1 per trade

class SilentArbitrageExecutor {
    constructor() {
        this.balance = STARTING_BALANCE;
        this.totalProfit = 0;
        this.tradesExecuted = 0;
        this.successfulTrades = 0;
        this.loadState();
    }

    loadState() {
        try {
            if (fs.existsSync('trading_state.json')) {
                const state = JSON.parse(fs.readFileSync('trading_state.json', 'utf8'));
                this.balance = state.balance || STARTING_BALANCE;
                this.totalProfit = state.totalProfit || 0;
                this.tradesExecuted = state.tradesExecuted || 0;
                this.successfulTrades = state.successfulTrades || 0;
            }
        } catch (e) {
            console.log('⚠️  Could not load previous state, starting fresh');
        }
    }

    saveState() {
        const state = {
            balance: this.balance,
            totalProfit: this.totalProfit,
            tradesExecuted: this.tradesExecuted,
            successfulTrades: this.successfulTrades,
            lastUpdate: new Date().toISOString()
        };
        
        try {
            fs.writeFileSync('trading_state.json', JSON.stringify(state, null, 2));
        } catch (e) {
            console.error('⚠️  Could not save state');
        }
    }

    async fetchJSON(url, retries = 2) {
        for (let i = 0; i < retries; i++) {
            try {
                return await new Promise((resolve, reject) => {
                    const options = {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; SilentArbitrage/1.0)',
                            'Accept': 'application/json'
                        },
                        timeout: 8000
                    };
                    
                    https.get(url, options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                if (res.statusCode === 200) {
                                    resolve(JSON.parse(data));
                                } else {
                                    reject(new Error(`HTTP ${res.statusCode}`));
                                }
                            } catch (e) {
                                reject(e);
                            }
                        });
                    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
                });
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async scanMarkets() {
        try {
            const POLYMARKET_API = 'https://gamma-api.polymarket.com';
            const markets = await this.fetchJSON(`${POLYMARKET_API}/markets?active=true&limit=40&closed=false`);
            
            if (!markets || !markets.data) {
                return [];
            }

            const opportunities = [];
            const now = Date.now();
            const HOUR = 60 * 60 * 1000;

            for (const market of markets.data) {
                if (market.tokens && market.tokens.length > 0) {
                    for (const token of market.tokens) {
                        try {
                            // Get live pricing
                            const bookUrl = `${POLYMARKET_API}/book?token_id=${token.token_id}`;
                            const book = await this.fetchJSON(bookUrl, 1);
                            
                            if (book && book.bids && book.asks && book.bids.length > 0 && book.asks.length > 0) {
                                const bestBid = parseFloat(book.bids[0].price);
                                const bestAsk = parseFloat(book.asks[0].price);
                                const midPrice = (bestBid + bestAsk) / 2;
                                
                                // Time to resolution
                                let hoursLeft = 24;
                                if (market.end_date_iso) {
                                    const endTime = new Date(market.end_date_iso).getTime();
                                    hoursLeft = Math.max(1, Math.round((endTime - now) / HOUR));
                                }
                                
                                // High probability trades (75%+)
                                if (midPrice > 0.75) {
                                    const potential = (1.0 - midPrice) / midPrice;
                                    const annualized = potential * (365 * 24 / hoursLeft);
                                    const volume = market.volume_24hr || 0;
                                    
                                    if (annualized >= MIN_PROFIT_THRESHOLD && volume >= MIN_VOLUME_THRESHOLD) {
                                        opportunities.push({
                                            tokenId: token.token_id,
                                            market: market.question || 'Unknown',
                                            outcome: token.outcome || 'Yes',
                                            price: midPrice,
                                            probability: midPrice * 100,
                                            potential: potential,
                                            annualized: annualized,
                                            volume: volume,
                                            hoursLeft: hoursLeft,
                                            bestAsk: bestAsk,
                                            bidAskSpread: bestAsk - bestBid
                                        });
                                    }
                                }
                            }
                        } catch (tokenError) {
                            // Skip individual errors
                        }
                        
                        // Small delay
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
            
            return opportunities.sort((a, b) => b.annualized - a.annualized);
            
        } catch (error) {
            console.error('🔍 Market scan failed:', error.message);
            return [];
        }
    }

    calculatePositionSize(opportunity) {
        const maxSize = this.balance * MAX_POSITION_SIZE;
        const minSize = Math.max(MIN_POSITION_SIZE, this.balance * 0.10); // At least 10% of balance
        
        // Scale based on confidence and profitability
        let multiplier = 1;
        if (opportunity.probability > 90) multiplier += 0.3;
        if (opportunity.annualized > 2) multiplier += 0.2; // >200% APY
        if (opportunity.volume > 1000) multiplier += 0.2;
        
        let positionSize = minSize * multiplier;
        positionSize = Math.min(positionSize, maxSize);
        
        return Math.round(positionSize * 100) / 100;
    }

    async executeTrade(opportunity) {
        const positionSize = this.calculatePositionSize(opportunity);
        const expectedProfit = positionSize * opportunity.potential;
        const tradeFee = positionSize * 0.02; // 2% fee estimate
        const netExpectedProfit = expectedProfit - tradeFee;
        
        // SIMULATED EXECUTION (would integrate with real Polymarket API)
        const timestamp = new Date().toISOString();
        const tradeId = `TRADE_${Date.now()}`;
        
        console.log(`\\n💰 EXECUTING SILENT TRADE #${this.tradesExecuted + 1}`);
        console.log(`🎯 ${opportunity.market.slice(0, 60)}...`);
        console.log(`📊 ${opportunity.outcome}: $${opportunity.price.toFixed(4)} (${opportunity.probability.toFixed(1)}%)`);
        console.log(`💵 Position: $${positionSize} | Expected profit: $${netExpectedProfit.toFixed(2)}`);
        console.log(`🚀 ${(opportunity.annualized * 100).toFixed(0)}% APY | ${opportunity.hoursLeft}h to resolution`);
        
        // Log the trade
        const tradeLog = {
            id: tradeId,
            timestamp: timestamp,
            tokenId: opportunity.tokenId,
            market: opportunity.market,
            outcome: opportunity.outcome,
            positionSize: positionSize,
            price: opportunity.price,
            probability: opportunity.probability,
            expectedProfit: expectedProfit,
            netExpectedProfit: netExpectedProfit,
            annualizedReturn: opportunity.annualized,
            volume: opportunity.volume,
            balanceBefore: this.balance,
            status: 'SIMULATED'
        };
        
        // Save individual trade
        try {
            if (!fs.existsSync('trades')) fs.mkdirSync('trades');
            const filename = `trades/trade_${tradeId}.json`;
            fs.writeFileSync(filename, JSON.stringify(tradeLog, null, 2));
        } catch (e) {
            console.error('⚠️  Trade log save failed');
        }
        
        // Update state
        this.balance -= tradeFee; // Deduct fee immediately
        this.tradesExecuted++;
        
        // Simulate trade outcome (85% success rate for high-probability trades)
        const success = Math.random() < 0.85;
        
        if (success) {
            this.balance += expectedProfit;
            this.totalProfit += netExpectedProfit;
            this.successfulTrades++;
            console.log(`✅ TRADE SUCCESSFUL - New balance: $${this.balance.toFixed(2)}`);
        } else {
            console.log(`❌ Trade unsuccessful - Balance: $${this.balance.toFixed(2)}`);
        }
        
        this.saveState();
        
        return success;
    }

    async runSilentScan() {
        const scanTime = new Date().toISOString().slice(0, 16).replace('T', ' ');
        
        console.log(`\\n🤖 SILENT ARBITRAGE SCAN - ${scanTime}`);
        console.log(`💰 Current Balance: $${this.balance.toFixed(2)} | Profit: $${this.totalProfit.toFixed(2)}`);
        console.log(`📊 Trades: ${this.tradesExecuted} total, ${this.successfulTrades} successful`);
        
        try {
            const opportunities = await this.scanMarkets();
            
            if (opportunities.length === 0) {
                console.log('📊 No profitable opportunities found - continuing hunt...');
                return;
            }
            
            console.log(`🎯 Found ${opportunities.length} opportunities`);
            
            // Execute best opportunity if balance allows
            const bestOpp = opportunities[0];
            const minTradeSize = this.calculatePositionSize(bestOpp);
            
            if (this.balance >= minTradeSize) {
                await this.executeTrade(bestOpp);
                
                // Log summary to file
                const summary = {
                    timestamp: new Date().toISOString(),
                    balance: this.balance,
                    totalProfit: this.totalProfit,
                    tradesExecuted: this.tradesExecuted,
                    successRate: (this.successfulTrades / Math.max(this.tradesExecuted, 1) * 100).toFixed(1)
                };
                
                fs.writeFileSync('silent_trading_summary.json', JSON.stringify(summary, null, 2));
            } else {
                console.log(`⚠️  Insufficient balance for minimum trade ($${minTradeSize.toFixed(2)})`);
            }
            
        } catch (error) {
            console.error('❌ Silent scan error:', error.message);
        }
        
        console.log('🔄 Continuing silent operations...');
    }
}

// Execute scan
if (require.main === module) {
    const executor = new SilentArbitrageExecutor();
    executor.runSilentScan().catch(console.error);
}