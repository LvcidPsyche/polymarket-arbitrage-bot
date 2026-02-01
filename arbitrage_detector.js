#!/usr/bin/env node

const https = require('https');

// Polymarket API endpoints
const POLYMARKET_API = 'https://gamma-api.polymarket.com';

async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function findEndgameArbitrage() {
    console.log('🎯 SCANNING FOR ENDGAME ARBITRAGE OPPORTUNITIES');
    console.log('=' .repeat(60));
    
    try {
        // Get active markets
        console.log('📊 Fetching active markets...');
        const markets = await fetchJSON(`${POLYMARKET_API}/markets?active=true&limit=50`);
        
        if (!markets || !markets.data) {
            console.log('❌ No market data received');
            return;
        }
        
        console.log(`📈 Found ${markets.data.length} active markets`);
        
        const opportunities = [];
        const now = Date.now();
        const HOUR = 60 * 60 * 1000;
        const DAY = 24 * HOUR;
        
        for (const market of markets.data) {
            // Check if market ends soon (within 48 hours)
            const endTime = new Date(market.end_date_iso).getTime();
            const timeLeft = endTime - now;
            
            if (timeLeft > 0 && timeLeft < 2 * DAY) {
                // Get market books/prices
                const bookUrl = `${POLYMARKET_API}/book?token_id=${market.tokens[0].token_id}`;
                
                try {
                    const book = await fetchJSON(bookUrl);
                    
                    if (book && book.bids && book.asks && book.bids.length > 0) {
                        const bestBid = parseFloat(book.bids[0].price);
                        const bestAsk = parseFloat(book.asks[0].price);
                        
                        // Look for high-probability positions (>90% chance)
                        if (bestBid > 0.90) {
                            const hoursLeft = Math.round(timeLeft / HOUR);
                            const potential = (1.0 - bestBid) / bestBid;
                            const annualized = potential * (365 * 24 / hoursLeft);
                            
                            opportunities.push({
                                market: market.question,
                                probability: (bestBid * 100).toFixed(1),
                                price: bestBid.toFixed(3),
                                potential: (potential * 100).toFixed(1),
                                annualized: (annualized * 100).toFixed(0),
                                hoursLeft: hoursLeft,
                                volume: market.volume_24hr || 0,
                                token_id: market.tokens[0].token_id
                            });
                        }
                    }
                } catch (bookError) {
                    console.log(`⚠️  Could not get book for: ${market.question.slice(0, 50)}...`);
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // Sort by potential return
        opportunities.sort((a, b) => parseFloat(b.potential) - parseFloat(a.potential));
        
        console.log(`\\n🔍 FOUND ${opportunities.length} ENDGAME OPPORTUNITIES:`);
        console.log('=' .repeat(60));
        
        if (opportunities.length === 0) {
            console.log('😞 No high-probability opportunities found at this time');
            console.log('💡 Try running again later - opportunities appear throughout the day');
        } else {
            opportunities.slice(0, 10).forEach((opp, i) => {
                console.log(`${i + 1}. ${opp.market.slice(0, 70)}`);
                console.log(`   💰 Price: $${opp.price} (${opp.probability}% probability)`);
                console.log(`   📈 Potential: ${opp.potential}% return in ${opp.hoursLeft}h`);
                console.log(`   📊 Annualized: ${opp.annualized}% APY`);
                console.log(`   📚 24h Volume: $${opp.volume.toLocaleString()}`);
                console.log(`   🔗 Token ID: ${opp.token_id}`);
                console.log('');
            });
        }
        
        console.log('\\n🚀 NEXT STEPS:');
        console.log('1. Pick opportunity with good volume (>$1000 24h)');
        console.log('2. Manually execute trade on Polymarket.com');
        console.log('3. Monitor until resolution');
        console.log('4. Collect profits! 💰');
        
    } catch (error) {
        console.error('❌ Error scanning markets:', error.message);
        console.log('\\n💡 This might be due to:');
        console.log('- API rate limiting (try again in a minute)');
        console.log('- Network connectivity issues');
        console.log('- Polymarket API changes');
    }
}

async function checkCrossMarketArbitrage() {
    console.log('\\n🌉 CHECKING CROSS-PLATFORM ARBITRAGE');
    console.log('=' .repeat(40));
    console.log('⚠️  Cross-platform detection requires Kalshi API access');
    console.log('📝 For now, manually check EventArb.com for opportunities');
    console.log('🔗 https://eventarb.com');
}

// Main execution
async function main() {
    console.log('🤖 POLYMARKET ARBITRAGE OPPORTUNITY SCANNER');
    console.log('Launch time:', new Date().toISOString());
    console.log('Wallet: 0x4365F3339e8Aef1EdD95916DBF57949012E8B6f2\\n');
    
    await findEndgameArbitrage();
    await checkCrossMarketArbitrage();
    
    console.log('\\n✅ Scan complete! Re-run this script periodically for new opportunities.');
}

if (require.main === module) {
    main().catch(console.error);
}