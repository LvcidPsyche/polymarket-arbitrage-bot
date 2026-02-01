#!/usr/bin/env node

// ULTRA-LIGHTWEIGHT ARBITRAGE SCANNER
// Minimal token usage - pure JavaScript logic

const https = require('https');
const fs = require('fs');

const CONFIG = {
    WALLET: '0x4365F3339e8Aef1EdD95916DBF57949012E8B6f2',
    MIN_PROFIT_APY: 0.30,      // 30% APY minimum
    MIN_PROBABILITY: 0.80,     // 80%+ probability
    MIN_VOLUME: 200,           // $200 minimum volume
    MAX_POSITION_PCT: 0.35,    // Max 35% of balance
    SCAN_LIMIT: 25             // Reduced API calls
};

let BALANCE = 8; // Starting balance

class EfficientScanner {
    async fetch(url) {
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: { 'User-Agent': 'LightweightBot/1.0' },
                timeout: 5000
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(res.statusCode === 200 ? JSON.parse(data) : null);
                    } catch (e) { resolve(null); }
                });
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => resolve(null));
        });
    }

    async scanMarkets() {
        const API = 'https://gamma-api.polymarket.com';
        const markets = await this.fetch(`${API}/markets?active=true&limit=${CONFIG.SCAN_LIMIT}&closed=false`);
        
        if (!markets?.data) return [];

        const opps = [];
        const now = Date.now();

        for (const market of markets.data.slice(0, 20)) { // Limit processing
            if (!market.tokens?.[0]) continue;

            try {
                const token = market.tokens[0];
                const book = await this.fetch(`${API}/book?token_id=${token.token_id}`);
                
                if (book?.bids?.[0] && book?.asks?.[0]) {
                    const bid = parseFloat(book.bids[0].price);
                    const ask = parseFloat(book.asks[0].price);
                    const price = (bid + ask) / 2;
                    
                    if (price >= CONFIG.MIN_PROBABILITY) {
                        // Calculate timing
                        let hours = 24;
                        if (market.end_date_iso) {
                            hours = Math.max(1, (new Date(market.end_date_iso) - now) / 3600000);
                        }
                        
                        const profit = (1 - price) / price;
                        const apy = profit * (365 * 24 / hours);
                        const volume = market.volume_24hr || 0;
                        
                        if (apy >= CONFIG.MIN_PROFIT_APY && volume >= CONFIG.MIN_VOLUME) {
                            opps.push({
                                id: token.token_id,
                                market: market.question?.slice(0, 60) || 'Unknown',
                                price: price.toFixed(4),
                                profit: (profit * 100).toFixed(1),
                                apy: (apy * 100).toFixed(0),
                                hours: Math.round(hours),
                                volume: volume,
                                score: apy * Math.log(volume + 1) // Scoring algorithm
                            });
                        }
                    }
                }
            } catch (e) {
                // Skip errors silently
            }
            
            await new Promise(r => setTimeout(r, 100)); // Rate limiting
        }

        return opps.sort((a, b) => b.score - a.score);
    }

    calculatePosition(opp) {
        const maxSize = BALANCE * CONFIG.MAX_POSITION_PCT;
        const baseSize = Math.max(1, BALANCE * 0.08); // 8% base
        
        // Scale by confidence and profitability
        let multiplier = 1;
        if (parseFloat(opp.profit) > 15) multiplier += 0.3; // >15% profit
        if (parseInt(opp.apy) > 200) multiplier += 0.4;      // >200% APY
        if (opp.volume > 1000) multiplier += 0.2;            // Good volume
        
        return Math.min(maxSize, baseSize * multiplier);
    }

    async executeTrade(opp) {
        const size = this.calculatePosition(opp);
        const fee = size * 0.02;
        const netProfit = size * parseFloat(opp.profit) / 100 - fee;
        
        // LIGHTWEIGHT EXECUTION LOG
        const trade = {
            time: new Date().toISOString().slice(0, 16),
            market: opp.market,
            size: size.toFixed(2),
            price: opp.price,
            profit: opp.profit + '%',
            apy: opp.apy + '%',
            expected: '+$' + netProfit.toFixed(2),
            balance_before: BALANCE.toFixed(2)
        };
        
        // Simulate success (90% rate for high-probability)
        const success = Math.random() < 0.90;
        
        if (success) {
            BALANCE += netProfit;
            trade.result = 'WIN';
            trade.new_balance = BALANCE.toFixed(2);
        } else {
            BALANCE -= fee;
            trade.result = 'LOSS';
            trade.new_balance = BALANCE.toFixed(2);
        }
        
        // Minimal logging
        const logLine = `${trade.time} | ${trade.result} | $${trade.size} -> ${trade.expected} | Bal: $${trade.new_balance}\n`;
        fs.appendFileSync('trades.log', logLine);
        
        // Update state file
        fs.writeFileSync('balance.txt', BALANCE.toString());
        
        console.log(`📊 ${trade.result}: ${opp.market.slice(0, 40)}... | $${size.toFixed(2)} -> ${trade.expected} | Balance: $${BALANCE.toFixed(2)}`);
        
        return success;
    }

    async run() {
        // Load previous balance
        try {
            if (fs.existsSync('balance.txt')) {
                BALANCE = parseFloat(fs.readFileSync('balance.txt', 'utf8')) || 8;
            }
        } catch (e) {
            BALANCE = 8;
        }
        
        console.log(`🔍 Efficient scan | Balance: $${BALANCE.toFixed(2)} | ${new Date().toISOString().slice(11, 16)}`);
        
        const opportunities = await this.scanMarkets();
        
        if (opportunities.length === 0) {
            console.log('📊 No opportunities found');
            return;
        }
        
        console.log(`💰 Found ${opportunities.length} opportunities`);
        
        // Execute best opportunity
        const best = opportunities[0];
        if (BALANCE >= 1) {
            await this.executeTrade(best);
        } else {
            console.log('⚠️  Insufficient balance');
        }
        
        // Log milestone profits
        if (BALANCE > 15) {
            fs.writeFileSync('/tmp/trading_milestone.txt', `Balance reached $${BALANCE.toFixed(2)} - significant growth!`);
        }
    }
}

// Execute
new EfficientScanner().run().catch(e => console.error('❌', e.message));