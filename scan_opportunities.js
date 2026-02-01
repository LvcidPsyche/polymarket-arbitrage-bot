#!/usr/bin/env node

const https = require('https');

// Polymarket API endpoints
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

async function scanMarkets() {
    console.log('🎯 POLYMARKET OPPORTUNITY SCANNER');
    console.log('Launch:', new Date().toISOString());
    console.log('=' .repeat(50));
    
    try {
        console.log('📊 Fetching markets from Polymarket API...');
        
        // Try different endpoints
        const endpoints = [
            '/markets?active=true&limit=20&closed=false',
            '/markets?limit=20',
            '/events?active=true&limit=10'
        ];
        
        let data = null;
        
        for (const endpoint of endpoints) {
            const url = `${POLYMARKET_API}${endpoint}`;
            console.log(`🌐 Trying: ${endpoint}`);
            
            const result = await fetchJSON(url);
            
            if (result && !result.error && (result.data || result.length > 0)) {
                data = result;
                console.log('✅ Got data!');
                break;
            } else {
                console.log(`❌ Failed: ${result.error || 'No data'}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!data) {
            console.log('\\n🔗 MANUAL ALTERNATIVES:');
            console.log('1. EventArb.com - Cross-platform opportunities');
            console.log('2. Polymarket.com - Browse high-probability markets manually');
            console.log('3. Metaculus.com - Compare prediction markets');
            console.log('\\n💡 Strategy while API is down:');
            console.log('- Look for 95%+ probability markets ending <24h');
            console.log('- Calculate: (1 - price) / price = potential return');
            console.log('- Target annualized returns >100%');
            return;
        }
        
        // Process market data
        const markets = data.data || data;
        console.log(`\\n📈 Analyzing ${markets.length} markets...`);
        
        const opportunities = [];
        const now = Date.now();
        
        for (const market of markets.slice(0, 10)) {
            try {
                if (market.tokens && market.tokens.length > 0) {
                    const token = market.tokens[0];
                    
                    // Get current price from last trade or other source
                    let probability = 0.5;  // default
                    
                    if (token.price) {
                        probability = parseFloat(token.price);
                    } else if (market.volume && market.volume > 0) {
                        // Use volume as a proxy for activity
                        probability = 0.5 + (Math.random() - 0.5) * 0.4; // simulate
                    }
                    
                    // Check if high probability (>90%)
                    if (probability > 0.90) {
                        let hoursLeft = 24; // default
                        
                        if (market.end_date_iso || market.endDate) {
                            const endTime = new Date(market.end_date_iso || market.endDate).getTime();
                            hoursLeft = Math.max(1, Math.round((endTime - now) / (60 * 60 * 1000)));
                        }
                        
                        const potential = (1.0 - probability) / probability;
                        const annualized = potential * (365 * 24 / hoursLeft);
                        
                        opportunities.push({
                            question: market.question || market.title || 'Unknown Market',
                            probability: (probability * 100).toFixed(1),
                            potential: (potential * 100).toFixed(1),
                            annualized: (annualized * 100).toFixed(0),
                            hoursLeft: hoursLeft,
                            volume: market.volume_24hr || market.volume || 0
                        });
                    }
                }
            } catch (e) {
                console.log(`⚠️  Skipped market: ${e.message}`);
            }
        }
        
        console.log(`\\n🔍 HIGH-PROBABILITY OPPORTUNITIES:`);
        console.log('=' .repeat(50));
        
        if (opportunities.length === 0) {
            console.log('😐 No 90%+ probability markets found in this batch');
            console.log('💡 Try again later or check manually on Polymarket.com');
            console.log('🎯 Look for markets with phrases like:');
            console.log('   - "Will X happen by [soon date]?" (when very likely)');
            console.log('   - Economic/political events with clear outcomes');
            console.log('   - Sports events heavily favoring one side');
        } else {
            opportunities.forEach((opp, i) => {
                console.log(`${i + 1}. ${opp.question.slice(0, 60)}...`);
                console.log(`   💰 Probability: ${opp.probability}%`);
                console.log(`   📈 Potential return: ${opp.potential}%`);
                console.log(`   📊 Annualized: ${opp.annualized}% APY`);
                console.log(`   ⏰ Time left: ~${opp.hoursLeft}h`);
                console.log('');
            });
        }
        
        console.log('\\n🎯 NEXT STEPS:');
        console.log('1. Fund wallet: 0xBff2b13F6C63018a7BcFd5fB21427880270c7e0c');
        console.log('2. Convert to USDC on Polygon (Polymarket trading currency)');
        console.log('3. Pick high-volume, high-probability opportunities');
        console.log('4. Execute trades manually on polymarket.com');
        console.log('5. Monitor and collect profits! 💰');
        
    } catch (error) {
        console.error('❌ Scanner error:', error.message);
        console.log('\\n🔧 FALLBACK STRATEGY:');
        console.log('- Visit polymarket.com directly');
        console.log('- Filter by "Popular" or "Trending"');
        console.log('- Look for 90%+ probability markets ending soon');
        console.log('- Calculate returns manually: (1-price)/price');
    }
}

// Run scanner
scanMarkets().catch(console.error);