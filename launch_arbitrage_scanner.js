#!/usr/bin/env node

const https = require('https');

// FUNDED WALLET CREDENTIALS
const WALLET_ADDRESS = '0x4365F3339e8Aef1EdD95916DBF57949012E8B6f2';
const WALLET_BALANCE = '78.43 POL (~$43.14)';

// Polymarket API
const POLYMARKET_API = 'https://gamma-api.polymarket.com';

async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ArbitrageBot/1.0)',
                'Accept': 'application/json'
            }
        };
        
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ error: 'Parse error', raw: data.slice(0, 200) });
                }
            });
        }).on('error', reject);
    });
}

async function findArbitrageOpportunities() {
    console.log('💰 POLYMARKET ARBITRAGE BOT - LIVE SCAN');
    console.log('🤖 Wallet:', WALLET_ADDRESS);
    console.log('💵 Funds:', WALLET_BALANCE);
    console.log('📅 Scan time:', new Date().toISOString());
    console.log('=' .repeat(60));
    
    try {
        console.log('📊 Fetching active markets...');
        const markets = await fetchJSON(`${POLYMARKET_API}/markets?active=true&limit=30&closed=false`);
        
        if (!markets || !markets.data) {
            console.log('❌ No market data - trying alternative endpoint...');
            const altMarkets = await fetchJSON(`${POLYMARKET_API}/markets?limit=30`);
            if (!altMarkets || !altMarkets.data) {
                console.log('❌ All API endpoints failed');
                return [];
            }
            markets.data = altMarkets.data;
        }
        
        console.log(`✅ Found ${markets.data.length} active markets`);
        
        const opportunities = [];
        const now = Date.now();
        const HOUR = 60 * 60 * 1000;
        const DAY = 24 * HOUR;
        
        console.log('🔍 Analyzing markets for high-probability opportunities...');
        
        for (const market of markets.data) {
            try {
                // Focus on markets ending soon (within 7 days for broader scan)
                let endTime = null;
                if (market.end_date_iso) {
                    endTime = new Date(market.end_date_iso).getTime();
                } else if (market.endDate) {
                    endTime = new Date(market.endDate).getTime();
                }
                
                let timeLeft = endTime ? endTime - now : 7 * DAY; // default 7 days
                let hoursLeft = Math.max(1, Math.round(timeLeft / HOUR));
                
                if (timeLeft > 0 && timeLeft < 7 * DAY) {
                    // Get market data
                    if (market.tokens && market.tokens.length > 0) {
                        for (const token of market.tokens) {
                            try {
                                // Try to get live book data
                                const bookUrl = `${POLYMARKET_API}/book?token_id=${token.token_id}`;
                                const book = await fetchJSON(bookUrl);
                                
                                let probability = 0.5; // default
                                let hasRealData = false;
                                
                                if (book && book.bids && book.asks && book.bids.length > 0 && book.asks.length > 0) {
                                    const bestBid = parseFloat(book.bids[0].price);
                                    const bestAsk = parseFloat(book.asks[0].price);
                                    probability = (bestBid + bestAsk) / 2; // mid-price
                                    hasRealData = true;
                                } else if (token.price) {
                                    probability = parseFloat(token.price);
                                    hasRealData = true;
                                }
                                
                                // Look for high-probability positions (>85% to catch more opportunities)
                                if (probability > 0.85 && hasRealData) {
                                    const potential = (1.0 - probability) / probability;
                                    const annualized = potential * (365 * 24 / Math.max(hoursLeft, 1));
                                    
                                    // Only include if annualized return > 50%
                                    if (annualized > 0.50) {
                                        opportunities.push({
                                            market: market.question || 'Unknown Market',
                                            outcome: token.outcome || 'Yes',
                                            probability: (probability * 100).toFixed(1),
                                            price: probability.toFixed(3),
                                            potential: (potential * 100).toFixed(1),
                                            annualized: (annualized * 100).toFixed(0),
                                            hoursLeft: hoursLeft,
                                            volume: market.volume_24hr || 0,
                                            token_id: token.token_id,
                                            hasRealData: hasRealData
                                        });
                                    }
                                }
                                
                            } catch (tokenError) {
                                // Skip individual token errors
                            }
                        }
                    }
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (marketError) {
                // Skip individual market errors
            }
        }
        
        // Sort by annualized return (highest first)
        opportunities.sort((a, b) => parseFloat(b.annualized) - parseFloat(a.annualized));
        
        console.log(`\\n🎯 FOUND ${opportunities.length} ARBITRAGE OPPORTUNITIES:`);
        console.log('=' .repeat(60));
        
        if (opportunities.length === 0) {
            console.log('😐 No high-probability opportunities found in current scan');
            console.log('💡 This is normal - opportunities are cyclical');
            console.log('🔄 Recommend running every 2-4 hours');
            console.log('\\n🎯 MANUAL HUNTING TIPS:');
            console.log('- Visit polymarket.com and sort by "Trending"');
            console.log('- Look for 90%+ probability markets ending <48h');
            console.log('- Check EventArb.com for cross-platform opportunities');
        } else {
            console.log('💰 TOP OPPORTUNITIES (sorted by annualized return):');
            console.log('');
            
            opportunities.slice(0, 10).forEach((opp, i) => {
                const indicator = opp.hasRealData ? '📊' : '⚠️ ';
                console.log(`${i + 1}. ${indicator}${opp.market.slice(0, 65)}`);
                console.log(`   💰 ${opp.outcome}: ${opp.price} (${opp.probability}% probability)`);
                console.log(`   📈 Potential return: ${opp.potential}% in ${opp.hoursLeft}h`);
                console.log(`   🚀 Annualized: ${opp.annualized}% APY`);
                console.log(`   📊 Volume (24h): $${opp.volume.toLocaleString()}`);
                console.log(`   🔗 Token ID: ${opp.token_id}`);
                console.log('');
            });
            
            console.log('📊 = Live market data | ⚠️  = Estimated data');
        }
        
        console.log('\\n🎯 NEXT STEPS TO EXECUTE:');
        console.log('1. 💱 Convert POL → USDC on Polygon (QuickSwap, Uniswap)');
        console.log('2. 🌐 Visit polymarket.com and connect wallet');
        console.log('3. 🎲 Pick highest volume + return opportunity');
        console.log('4. 💰 Execute trade (start with $10-20)');
        console.log('5. 📊 Monitor until resolution');
        console.log('6. 🔄 Repeat and compound profits!');
        
        return opportunities;
        
    } catch (error) {
        console.error('❌ Scanner error:', error.message);
        console.log('\\n🔧 FALLBACK: Visit polymarket.com manually');
        return [];
    }
}

// Execute the scan
findArbitrageOpportunities()
    .then(opportunities => {
        console.log(`\\n✅ SCAN COMPLETE - Found ${opportunities.length} opportunities`);
        console.log('🔄 Run this script periodically for fresh opportunities');
        console.log('💰 Happy hunting! 🦀');
    })
    .catch(console.error);