#!/usr/bin/env node

const fs = require('fs');

console.log('🤖 SILENT ARBITRAGE SYSTEM STATUS');
console.log('=' .repeat(40));

try {
    // Check if trading state exists
    if (fs.existsSync('trading_state.json')) {
        const state = JSON.parse(fs.readFileSync('trading_state.json', 'utf8'));
        
        console.log(`💰 Current Balance: $${state.balance?.toFixed(2) || '8.00'}`);
        console.log(`📈 Total Profit: $${state.totalProfit?.toFixed(2) || '0.00'}`);
        console.log(`📊 Trades Executed: ${state.tradesExecuted || 0}`);
        console.log(`✅ Successful: ${state.successfulTrades || 0}`);
        
        if (state.tradesExecuted > 0) {
            const successRate = (state.successfulTrades / state.tradesExecuted * 100).toFixed(1);
            console.log(`📊 Success Rate: ${successRate}%`);
        }
        
        console.log(`🕐 Last Update: ${state.lastUpdate || 'Never'}`);
        
        // Check for growth
        const growth = (state.totalProfit / 8 * 100).toFixed(1);
        console.log(`🚀 Portfolio Growth: ${growth}%`);
        
    } else {
        console.log('📊 System Status: Ready to start (no trades yet)');
        console.log('💰 Starting Balance: $8.00 USDC');
    }
    
    // Check recent logs
    console.log('\\n📋 Recent Activity:');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const logFile = `trades/silent_log_${today}.log`;
    
    if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, 'utf8').split('\\n');
        const recentLogs = logs.slice(-5).filter(line => line.trim());
        recentLogs.forEach(log => console.log(`📝 ${log}`));
    } else {
        console.log('📝 No activity logs today');
    }
    
} catch (error) {
    console.error('❌ Status check error:', error.message);
}

console.log('\\n🔄 System running every 5 minutes automatically');
console.log('🤖 Building cash pile silently...');