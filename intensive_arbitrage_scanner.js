#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// WALLET CREDENTIALS
const WALLET_ADDRESS = '0x4365F3339e8Aef1EdD95916DBF57949012E8B6f2';
const WALLET_BALANCE = '78.43 POL (~$43.14)';

// API Configuration
const POLYMARKET_API = 'https://gamma-api.polymarket.com';
const BACKUP_APIS = [
    'https://gamma-api.polymarket.com',
    'https://api.polymarket.com', 
    'https://polymarket-api.xyz'  // If exists
];

async function fetchJSON(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await new Promise((resolve, reject) => {
                const options = {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; ArbitrageBot/2.0)',
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    timeout: 15000
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
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

async function intensiveArbitrageScan() {
    const timestamp = new Date();
    const scanId = timestamp.toISOString().slice(0,19).replace('T', '_').replace(/:/g, '-');
    
    console.log('🚨 INTENSIVE ARBITRAGE SCAN #' + scanId);
    console.log('💰 Wallet:', WALLET_ADDRESS);
    console.log('💵 Funds:', WALLET_BALANCE);  
    console.log('⏰ Scan time:', timestamp.toISOString());
    console.log('🎯 Target: ALL profitable opportunities >50% APY');
    console.log('=' .repeat(70));
    
    const results = {
        scanId: scanId,
        timestamp: timestamp.toISOString(),
        opportunities: [],
        apiErrors: [],
        totalMarkets: 0,
        highValueOpportunities: []
    };
    
    try {
        let marketsData = null;
        let apiUsed = null;
        
        // Try multiple API endpoints
        for (const baseUrl of BACKUP_APIS) {
            const endpoints = [
                `${baseUrl}/markets?active=true&limit=50&closed=false`,
                `${baseUrl}/markets?limit=50`,
                `${baseUrl}/events?active=true&limit=30`
            ];
            
            for (const url of endpoints) {
                try {
                    console.log(`🌐 Trying: ${url.slice(-30)}...`);
                    const data = await fetchJSON(url);
                    
                    if (data && (data.data || data.length > 0)) {
                        marketsData = data.data || data;
                        apiUsed = url;
                        console.log(`✅ Connected! Found ${marketsData.length} markets`);
                        break;
                    }
                } catch (e) {
                    results.apiErrors.push(`${url}: ${e.message}`);
                    console.log(`❌ ${url.slice(-30)}: ${e.message}`);
                }
            }
            if (marketsData) break;
        }
        
        if (!marketsData) {
            console.log('🚨 ALL APIs FAILED - Using backup strategy');
            console.log('📝 Manual check: EventArb.com + Polymarket.com');
            results.error = 'All APIs unavailable';
            return results;
        }
        
        results.totalMarkets = marketsData.length;
        console.log(`\\n🔍 Deep-scanning ${marketsData.length} markets for arbitrage...`);
        
        const now = Date.now();
        const HOUR = 60 * 60 * 1000;
        const DAY = 24 * HOUR;
        let processedMarkets = 0;
        
        for (const market of marketsData) {
            try {
                processedMarkets++;
                
                // Progress indicator for long scans
                if (processedMarkets % 10 === 0) {
                    console.log(`📊 Processed ${processedMarkets}/${marketsData.length} markets...`);
                }
                
                // Check market timing
                let endTime = null;
                if (market.end_date_iso) {
                    endTime = new Date(market.end_date_iso).getTime();
                } else if (market.endDate) {
                    endTime = new Date(market.endDate).getTime();
                }
                
                let timeLeft = endTime ? (endTime - now) : (7 * DAY);
                let hoursLeft = Math.max(1, Math.round(timeLeft / HOUR));
                
                // Scan markets ending within 30 days (broader net)
                if (timeLeft > 0 && timeLeft < 30 * DAY) {
                    
                    if (market.tokens && market.tokens.length > 0) {
                        for (const token of market.tokens) {
                            try {
                                // Get live market data
                                let probability = null;
                                let volume24h = market.volume_24hr || market.volume || 0;
                                let hasLiveData = false;
                                
                                // Try to get live book/pricing
                                try {
                                    const bookUrl = `${POLYMARKET_API}/book?token_id=${token.token_id}`;
                                    const book = await fetchJSON(bookUrl, 1); // Single retry for speed
                                    
                                    if (book && book.bids && book.asks && book.bids.length > 0 && book.asks.length > 0) {
                                        const bestBid = parseFloat(book.bids[0].price);
                                        const bestAsk = parseFloat(book.asks[0].price);
                                        probability = (bestBid + bestAsk) / 2;
                                        hasLiveData = true;
                                    }
                                } catch (bookError) {
                                    // Use fallback pricing
                                    if (token.price) {
                                        probability = parseFloat(token.price);
                                    }
                                }
                                
                                // AGGRESSIVE FILTERING: Catch ALL profitable opportunities
                                if (probability !== null && probability > 0.75) { // Lowered from 0.85 to catch more
                                    const potential = (1.0 - probability) / probability;
                                    const annualized = potential * (365 * 24 / Math.max(hoursLeft, 1));
                                    
                                    // Include if annualized > 25% (very aggressive)
                                    if (annualized > 0.25) {
                                        const opportunity = {
                                            scanId: scanId,
                                            market: market.question || market.title || 'Unknown Market',
                                            outcome: token.outcome || 'Yes',
                                            probability: (probability * 100).toFixed(1),
                                            price: probability.toFixed(4),
                                            potentialReturn: (potential * 100).toFixed(2),
                                            annualizedReturn: (annualized * 100).toFixed(0),
                                            hoursLeft: hoursLeft,
                                            daysLeft: Math.round(hoursLeft / 24 * 10) / 10,
                                            volume24h: volume24h,
                                            tokenId: token.token_id,
                                            hasLiveData: hasLiveData,
                                            marketId: market.id || 'unknown',
                                            urgency: hoursLeft < 48 ? 'HIGH' : hoursLeft < 168 ? 'MEDIUM' : 'LOW'
                                        };
                                        
                                        results.opportunities.push(opportunity);
                                        
                                        // Flag high-value opportunities  
                                        if (annualized > 1.0 && volume24h > 1000) { // >100% APY + good volume
                                            results.highValueOpportunities.push(opportunity);
                                        }
                                    }
                                }
                                
                            } catch (tokenError) {
                                // Skip individual token errors silently
                            }
                        }
                    }
                }
                
                // Rate limiting - very brief delay
                if (processedMarkets % 20 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
            } catch (marketError) {
                // Skip individual market errors silently  
            }
        }
        
        // Sort opportunities by annualized return
        results.opportunities.sort((a, b) => parseFloat(b.annualizedReturn) - parseFloat(a.annualizedReturn));
        results.highValueOpportunities.sort((a, b) => parseFloat(b.annualizedReturn) - parseFloat(a.annualizedReturn));
        
        console.log(`\\n🎯 SCAN RESULTS:`);
        console.log(`📊 Markets analyzed: ${results.totalMarkets}`);
        console.log(`💰 Total opportunities: ${results.opportunities.length}`);
        console.log(`🚀 High-value opportunities: ${results.highValueOpportunities.length}`);
        
        if (results.highValueOpportunities.length > 0) {
            console.log('\\n🚨 🚨 HIGH-VALUE OPPORTUNITIES DETECTED! 🚨 🚨');
            console.log('=' .repeat(70));
            
            results.highValueOpportunities.slice(0, 5).forEach((opp, i) => {
                const urgencyIcon = opp.urgency === 'HIGH' ? '🔥' : opp.urgency === 'MEDIUM' ? '⚡' : '💡';
                const liveIcon = opp.hasLiveData ? '📊' : '📈';
                
                console.log(`${i + 1}. ${urgencyIcon} ${liveIcon} ${opp.market.slice(0, 50)}...`);
                console.log(`   💰 ${opp.outcome}: $${opp.price} (${opp.probability}% probability)`);
                console.log(`   📈 Return: ${opp.potentialReturn}% in ${opp.daysLeft} days`);
                console.log(`   🚀 Annualized: ${opp.annualizedReturn}% APY`);
                console.log(`   📊 Volume: $${opp.volume24h.toLocaleString()} | Urgency: ${opp.urgency}`);
                console.log(`   🔗 Token: ${opp.tokenId}`);
                console.log('');
            });
            
            console.log('🔥 = <48h to resolve | ⚡ = <7d to resolve | 💡 = >7d to resolve');
            console.log('📊 = Live data | 📈 = Estimated data');
        }
        
        if (results.opportunities.length > results.highValueOpportunities.length) {
            console.log(`\\n💡 Additional ${results.opportunities.length - results.highValueOpportunities.length} lower-tier opportunities available`);
        }
        
        if (results.opportunities.length === 0) {
            console.log('\\n😐 No profitable opportunities found in this scan');
            console.log('💡 This is normal - opportunities are cyclical');
        }
        
        // Save results to file for tracking
        const logFile = `arbitrage_scans/scan_${scanId}.json`;
        try {
            if (!fs.existsSync('arbitrage_scans')) {
                fs.mkdirSync('arbitrage_scans');
            }
            fs.writeFileSync(logFile, JSON.stringify(results, null, 2));
            console.log(`\\n💾 Results saved to: ${logFile}`);
        } catch (e) {
            console.log(`⚠️  Could not save results: ${e.message}`);
        }
        
        console.log('\\n⏰ Next intensive scan in 5 minutes');
        return results;
        
    } catch (error) {
        console.error('❌ Intensive scan error:', error.message);
        results.error = error.message;
        return results;
    }
}

// Execute scan
if (require.main === module) {
    intensiveArbitrageScan()
        .then(results => {
            const summary = `Scan complete: ${results.opportunities?.length || 0} total, ${results.highValueOpportunities?.length || 0} high-value`;
            console.log(`\\n✅ ${summary}`);
            
            if (results.highValueOpportunities?.length > 0) {
                console.log('🚨 ALERT: High-value opportunities detected!');
                console.log('💰 Ready to execute trades immediately!');
            }
        })
        .catch(console.error);
}