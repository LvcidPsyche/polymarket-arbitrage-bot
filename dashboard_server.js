#!/usr/bin/env node

/**
 * Real-time Dashboard Server for Arbitrage Trading Bot
 * Provides web-based monitoring and control interface
 */

const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class ArbitrageDashboard {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.wss = null;
        this.clients = new Set();
        
        this.setupExpress();
        this.setupWebSocket();
        this.setupRoutes();
        
        // Data refresh intervals
        this.refreshIntervals = {
            balance: 30000,      // 30 seconds
            opportunities: 10000, // 10 seconds
            performance: 60000,   // 1 minute
            logs: 5000           // 5 seconds
        };
        
        this.startDataRefresh();
    }
    
    setupExpress() {
        this.app.use(express.json());
        this.app.use(express.static('dashboard_public'));
        
        // CORS for development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            next();
        });
    }
    
    setupWebSocket() {
        this.server = require('http').createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.wss.on('connection', (ws) => {
            console.log('📱 Dashboard client connected');
            this.clients.add(ws);
            
            // Send initial data
            this.sendInitialData(ws);
            
            ws.on('close', () => {
                console.log('📱 Dashboard client disconnected');
                this.clients.delete(ws);
            });
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleClientMessage(data, ws);
                } catch (error) {
                    console.error('📛 Error parsing client message:', error);
                }
            });
        });
    }
    
    setupRoutes() {
        // System status
        this.app.get('/api/status', (req, res) => {
            res.json(this.getSystemStatus());
        });
        
        // Balance information
        this.app.get('/api/balance', async (req, res) => {
            try {
                const balance = await this.getBalanceData();
                res.json(balance);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Current opportunities
        this.app.get('/api/opportunities', (req, res) => {
            res.json(this.getCurrentOpportunities());
        });
        
        // Trading history
        this.app.get('/api/history', (req, res) => {
            res.json(this.getTradingHistory());
        });
        
        // Performance metrics
        this.app.get('/api/performance', (req, res) => {
            res.json(this.getPerformanceMetrics());
        });
        
        // Risk management
        this.app.get('/api/risk', (req, res) => {
            res.json(this.getRiskData());
        });
        
        // ML insights
        this.app.get('/api/insights', (req, res) => {
            res.json(this.getMLInsights());
        });
        
        // Control endpoints
        this.app.post('/api/control/:action', (req, res) => {
            this.handleControlAction(req.params.action, req.body, res);
        });
        
        // Logs
        this.app.get('/api/logs', (req, res) => {
            res.json(this.getRecentLogs());
        });
        
        // Dashboard HTML
        this.app.get('/', (req, res) => {
            res.send(this.getDashboardHTML());
        });
    }
    
    async sendInitialData(ws) {
        try {
            const initialData = {
                type: 'initial',
                data: {
                    status: this.getSystemStatus(),
                    balance: await this.getBalanceData(),
                    opportunities: this.getCurrentOpportunities(),
                    performance: this.getPerformanceMetrics(),
                    risk: this.getRiskData()
                }
            };
            
            ws.send(JSON.stringify(initialData));
        } catch (error) {
            console.error('📛 Error sending initial data:', error);
        }
    }
    
    broadcastUpdate(type, data) {
        const message = JSON.stringify({ type, data, timestamp: Date.now() });
        
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
    
    getSystemStatus() {
        try {
            // Check if various components are running
            const status = {
                timestamp: Date.now(),
                uptime: process.uptime(),
                arbitrage_scanner: this.checkProcessRunning('node.*arbitrage'),
                risk_manager: fs.existsSync('risk_config.json'),
                ml_predictor: fs.existsSync('training_data.json'),
                wallet_connected: fs.existsSync('metamask_wallet.json'),
                api_connectivity: this.checkAPIConnectivity()
            };
            
            // Overall health score
            const components = Object.values(status).filter(v => typeof v === 'boolean');
            status.health_score = components.filter(Boolean).length / components.length;
            
            return status;
        } catch (error) {
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    async getBalanceData() {
        return new Promise((resolve) => {
            const python = spawn('python3', ['check_all_balances.py'], {
                cwd: __dirname,
                env: { ...process.env, PYTHONPATH: './polymarket-env/lib/python3.8/site-packages' }
            });
            
            let output = '';
            python.stdout.on('data', (data) => output += data.toString());
            
            python.on('close', () => {
                try {
                    // Parse balance information from output
                    const lines = output.split('\n');
                    const balance = {
                        timestamp: Date.now(),
                        networks: {},
                        total_usd: 0
                    };
                    
                    lines.forEach(line => {
                        if (line.includes('POL/MATIC:') || line.includes('USDC:')) {
                            // Parse balance lines
                            const match = line.match(/(POL|USDC).*?(\d+\.?\d*)/);
                            if (match) {
                                balance.networks[match[1]] = parseFloat(match[2]);
                            }
                        }
                    });
                    
                    resolve(balance);
                } catch (error) {
                    resolve({ error: error.message, timestamp: Date.now() });
                }
            });
        });
    }
    
    getCurrentOpportunities() {
        try {
            // Read latest opportunities from scanner
            const opportunitiesFile = 'arbitrage_scans/latest_opportunities.json';
            if (fs.existsSync(opportunitiesFile)) {
                const data = JSON.parse(fs.readFileSync(opportunitiesFile, 'utf8'));
                return {
                    timestamp: Date.now(),
                    opportunities: data.opportunities || [],
                    scan_time: data.timestamp,
                    total_found: data.total_found || 0
                };
            }
            
            return {
                timestamp: Date.now(),
                opportunities: [],
                scan_time: null,
                total_found: 0
            };
        } catch (error) {
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    getTradingHistory() {
        try {
            if (fs.existsSync('trading_history.json')) {
                const data = JSON.parse(fs.readFileSync('trading_history.json', 'utf8'));
                return {
                    timestamp: Date.now(),
                    trades: data.trades || [],
                    performance: data.performance || {}
                };
            }
            
            return { timestamp: Date.now(), trades: [], performance: {} };
        } catch (error) {
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    getPerformanceMetrics() {
        try {
            const history = this.getTradingHistory();
            const trades = history.trades || [];
            
            if (trades.length === 0) {
                return {
                    timestamp: Date.now(),
                    total_trades: 0,
                    win_rate: 0,
                    total_pnl: 0,
                    avg_return: 0,
                    sharpe_ratio: 0
                };
            }
            
            const successful_trades = trades.filter(t => t.success);
            const total_pnl = trades.reduce((sum, t) => sum + (t.actualReturn || 0), 0);
            const returns = trades.map(t => t.actualReturn || 0);
            
            // Calculate Sharpe ratio
            const avg_return = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg_return, 2), 0) / returns.length;
            const sharpe_ratio = variance > 0 ? avg_return / Math.sqrt(variance) : 0;
            
            return {
                timestamp: Date.now(),
                total_trades: trades.length,
                win_rate: successful_trades.length / trades.length,
                total_pnl: total_pnl,
                avg_return: avg_return,
                sharpe_ratio: sharpe_ratio,
                best_trade: Math.max(...returns),
                worst_trade: Math.min(...returns),
                current_streak: this.calculateCurrentStreak(trades)
            };
        } catch (error) {
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    getRiskData() {
        try {
            if (fs.existsSync('risk_config.json')) {
                const config = JSON.parse(fs.readFileSync('risk_config.json', 'utf8'));
                return {
                    timestamp: Date.now(),
                    config: config,
                    emergency_stop: config.emergencyStop || false,
                    max_position_size: config.maxPositionSize || 0.1,
                    current_drawdown: this.calculateCurrentDrawdown()
                };
            }
            
            return { timestamp: Date.now(), config: {}, emergency_stop: false };
        } catch (error) {
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    getMLInsights() {
        return new Promise((resolve) => {
            const python = spawn('python3', ['ml_opportunity_predictor.py', 'insights'], {
                cwd: __dirname
            });
            
            let output = '';
            python.stdout.on('data', (data) => output += data.toString());
            
            python.on('close', () => {
                try {
                    const insights = JSON.parse(output);
                    resolve({ timestamp: Date.now(), ...insights });
                } catch (error) {
                    resolve({ error: error.message, timestamp: Date.now() });
                }
            });
        });
    }
    
    handleControlAction(action, body, res) {
        try {
            switch (action) {
                case 'start':
                    this.startTradingSystem();
                    res.json({ success: true, message: 'Trading system started' });
                    break;
                    
                case 'stop':
                    this.stopTradingSystem();
                    res.json({ success: true, message: 'Trading system stopped' });
                    break;
                    
                case 'emergency_stop':
                    this.emergencyStop();
                    res.json({ success: true, message: 'Emergency stop activated' });
                    break;
                    
                case 'scan':
                    this.triggerManualScan();
                    res.json({ success: true, message: 'Manual scan triggered' });
                    break;
                    
                default:
                    res.status(400).json({ error: 'Unknown action' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    
    getRecentLogs() {
        try {
            const logFiles = ['arbitrage_scans/recent_activity.log'];
            const logs = [];
            
            logFiles.forEach(file => {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');
                    const lines = content.split('\n').filter(line => line.trim());
                    logs.push(...lines.slice(-50)); // Last 50 lines
                }
            });
            
            return {
                timestamp: Date.now(),
                logs: logs.slice(-100) // Keep last 100 total
            };
        } catch (error) {
            return { error: error.message, timestamp: Date.now() };
        }
    }
    
    startDataRefresh() {
        // Balance updates
        setInterval(async () => {
            const balance = await this.getBalanceData();
            this.broadcastUpdate('balance', balance);
        }, this.refreshIntervals.balance);
        
        // Opportunities updates
        setInterval(() => {
            const opportunities = this.getCurrentOpportunities();
            this.broadcastUpdate('opportunities', opportunities);
        }, this.refreshIntervals.opportunities);
        
        // Performance updates
        setInterval(() => {
            const performance = this.getPerformanceMetrics();
            this.broadcastUpdate('performance', performance);
        }, this.refreshIntervals.performance);
        
        // Logs updates
        setInterval(() => {
            const logs = this.getRecentLogs();
            this.broadcastUpdate('logs', logs);
        }, this.refreshIntervals.logs);
    }
    
    // Utility functions
    checkProcessRunning(pattern) {
        try {
            const { execSync } = require('child_process');
            const result = execSync(`ps aux | grep -E "${pattern}" | grep -v grep`, { encoding: 'utf8' });
            return result.trim().length > 0;
        } catch {
            return false;
        }
    }
    
    checkAPIConnectivity() {
        // Simple API connectivity check
        return fs.existsSync('api_status.json');
    }
    
    calculateCurrentStreak(trades) {
        if (trades.length === 0) return 0;
        
        let streak = 0;
        for (let i = trades.length - 1; i >= 0; i--) {
            if (trades[i].success) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }
    
    calculateCurrentDrawdown() {
        const history = this.getTradingHistory();
        return history.performance?.maxDrawdown || 0;
    }
    
    startTradingSystem() {
        spawn('bash', ['execute_silent_trading.sh'], { detached: true, stdio: 'ignore' });
    }
    
    stopTradingSystem() {
        // Kill trading processes
        spawn('pkill', ['-f', 'silent_arbitrage_executor']);
    }
    
    emergencyStop() {
        spawn('node', ['advanced_risk_manager.js', 'stop']);
        this.stopTradingSystem();
    }
    
    triggerManualScan() {
        spawn('node', ['arbitrage_detector.js'], { detached: true, stdio: 'ignore' });
    }
    
    getDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Arbitrage Bot Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0e27; color: #fff; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #00d4ff; font-size: 2.5rem; margin-bottom: 10px; }
        .status-bar { display: flex; justify-content: space-around; margin-bottom: 30px; flex-wrap: wrap; gap: 15px; }
        .status-item { background: linear-gradient(135deg, #1a1f3a, #2d3748); padding: 20px; border-radius: 12px; text-align: center; min-width: 180px; border: 1px solid #4a5568; }
        .status-value { font-size: 1.8rem; font-weight: bold; color: #00d4ff; margin-bottom: 5px; }
        .status-label { color: #a0aec0; font-size: 0.9rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
        .card { background: linear-gradient(135deg, #1a1f3a, #2d3748); border-radius: 12px; padding: 25px; border: 1px solid #4a5568; }
        .card h3 { color: #00d4ff; margin-bottom: 15px; font-size: 1.3rem; }
        .opportunities-list { max-height: 300px; overflow-y: auto; }
        .opportunity { background: #2d3748; padding: 12px; margin: 8px 0; border-radius: 8px; border-left: 4px solid #00d4ff; }
        .logs { font-family: 'Courier New', monospace; font-size: 0.85rem; max-height: 250px; overflow-y: auto; background: #1a202c; padding: 15px; border-radius: 8px; }
        .control-buttons { display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap; }
        .btn { background: linear-gradient(135deg, #00d4ff, #0080ff); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.3s; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,212,255,0.4); }
        .btn.danger { background: linear-gradient(135deg, #ff4757, #ff3838); }
        .performance-chart { height: 200px; background: #2d3748; border-radius: 8px; margin: 15px 0; display: flex; align-items: center; justify-content: center; color: #a0aec0; }
        .health-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
        .health-good { background: #48bb78; }
        .health-warning { background: #ed8936; }
        .health-error { background: #f56565; }
        .loading { text-align: center; color: #a0aec0; padding: 40px; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .pulse { animation: pulse 2s infinite; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🦀 Arbitrage Bot Dashboard</h1>
            <p>Real-time monitoring and control for autonomous trading system</p>
        </div>
        
        <div class="status-bar" id="statusBar">
            <div class="status-item loading pulse">Loading...</div>
        </div>
        
        <div class="control-buttons">
            <button class="btn" onclick="controlSystem('start')">🚀 Start Trading</button>
            <button class="btn" onclick="controlSystem('scan')">🔍 Manual Scan</button>
            <button class="btn" onclick="controlSystem('stop')">⏹️ Stop System</button>
            <button class="btn danger" onclick="controlSystem('emergency_stop')">🚨 Emergency Stop</button>
        </div>
        
        <div class="grid">
            <div class="card">
                <h3>📊 Performance Metrics</h3>
                <div id="performanceData" class="loading">Loading performance data...</div>
                <div class="performance-chart">Performance Chart Placeholder</div>
            </div>
            
            <div class="card">
                <h3>💰 Portfolio Balance</h3>
                <div id="balanceData" class="loading">Loading balance...</div>
            </div>
            
            <div class="card">
                <h3>🎯 Current Opportunities</h3>
                <div id="opportunitiesData" class="opportunities-list loading">Scanning for opportunities...</div>
            </div>
            
            <div class="card">
                <h3>⚖️ Risk Management</h3>
                <div id="riskData" class="loading">Loading risk data...</div>
            </div>
            
            <div class="card">
                <h3>🧠 ML Insights</h3>
                <div id="insightsData" class="loading">Generating insights...</div>
            </div>
            
            <div class="card">
                <h3>📝 System Logs</h3>
                <div id="logsData" class="logs loading">Loading logs...</div>
            </div>
        </div>
    </div>
    
    <script>
        let ws;
        let reconnectInterval;
        
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            ws = new WebSocket(protocol + '//' + host);
            
            ws.onopen = function() {
                console.log('Dashboard connected');
                clearInterval(reconnectInterval);
            };
            
            ws.onmessage = function(event) {
                const message = JSON.parse(event.data);
                handleUpdate(message);
            };
            
            ws.onclose = function() {
                console.log('Dashboard disconnected, attempting reconnection...');
                reconnectInterval = setInterval(connectWebSocket, 5000);
            };
        }
        
        function handleUpdate(message) {
            switch(message.type) {
                case 'initial':
                    updateAllData(message.data);
                    break;
                case 'balance':
                    updateBalance(message.data);
                    break;
                case 'opportunities':
                    updateOpportunities(message.data);
                    break;
                case 'performance':
                    updatePerformance(message.data);
                    break;
                case 'logs':
                    updateLogs(message.data);
                    break;
            }
        }
        
        function updateAllData(data) {
            updateStatusBar(data.status);
            updateBalance(data.balance);
            updateOpportunities(data.opportunities);
            updatePerformance(data.performance);
            updateRisk(data.risk);
        }
        
        function updateStatusBar(status) {
            const statusBar = document.getElementById('statusBar');
            const healthScore = Math.round((status.health_score || 0) * 100);
            const healthClass = healthScore > 80 ? 'health-good' : healthScore > 50 ? 'health-warning' : 'health-error';
            
            statusBar.innerHTML = \`
                <div class="status-item">
                    <div class="status-value"><span class="health-indicator \${healthClass}"></span>\${healthScore}%</div>
                    <div class="status-label">System Health</div>
                </div>
                <div class="status-item">
                    <div class="status-value">\${Math.round(status.uptime || 0)}s</div>
                    <div class="status-label">Uptime</div>
                </div>
                <div class="status-item">
                    <div class="status-value">\${status.arbitrage_scanner ? '🟢' : '🔴'}</div>
                    <div class="status-label">Scanner</div>
                </div>
                <div class="status-item">
                    <div class="status-value">\${status.wallet_connected ? '🟢' : '🔴'}</div>
                    <div class="status-label">Wallet</div>
                </div>
            \`;
        }
        
        function updateBalance(balance) {
            const balanceEl = document.getElementById('balanceData');
            if (balance.error) {
                balanceEl.innerHTML = \`<div style="color: #f56565;">Error: \${balance.error}</div>\`;
                return;
            }
            
            const networks = balance.networks || {};
            let html = '';
            Object.entries(networks).forEach(([token, amount]) => {
                html += \`<div style="margin: 10px 0;"><strong>\${token}:</strong> \${amount.toFixed(4)}</div>\`;
            });
            
            balanceEl.innerHTML = html || 'No balance data available';
        }
        
        function updateOpportunities(opportunities) {
            const oppEl = document.getElementById('opportunitiesData');
            const opps = opportunities.opportunities || [];
            
            if (opps.length === 0) {
                oppEl.innerHTML = '<div style="color: #a0aec0;">No opportunities found</div>';
                return;
            }
            
            let html = '';
            opps.slice(0, 5).forEach(opp => {
                html += \`
                    <div class="opportunity">
                        <div><strong>\${opp.title || 'Unknown Market'}</strong></div>
                        <div>Expected Return: \${((opp.expected_return || 0) * 100).toFixed(2)}%</div>
                        <div>Confidence: \${((opp.confidence || 0) * 100).toFixed(0)}%</div>
                    </div>
                \`;
            });
            
            oppEl.innerHTML = html;
        }
        
        function updatePerformance(performance) {
            const perfEl = document.getElementById('performanceData');
            if (performance.error) {
                perfEl.innerHTML = \`<div style="color: #f56565;">Error: \${performance.error}</div>\`;
                return;
            }
            
            perfEl.innerHTML = \`
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div><strong>Total Trades:</strong> \${performance.total_trades || 0}</div>
                    <div><strong>Win Rate:</strong> \${((performance.win_rate || 0) * 100).toFixed(1)}%</div>
                    <div><strong>Total P&L:</strong> \${(performance.total_pnl || 0).toFixed(4)}</div>
                    <div><strong>Avg Return:</strong> \${((performance.avg_return || 0) * 100).toFixed(2)}%</div>
                    <div><strong>Sharpe Ratio:</strong> \${(performance.sharpe_ratio || 0).toFixed(2)}</div>
                    <div><strong>Current Streak:</strong> \${performance.current_streak || 0}</div>
                </div>
            \`;
        }
        
        function updateRisk(risk) {
            const riskEl = document.getElementById('riskData');
            if (risk.error) {
                riskEl.innerHTML = \`<div style="color: #f56565;">Error: \${risk.error}</div>\`;
                return;
            }
            
            const emergencyStatus = risk.emergency_stop ? '🚨 ACTIVE' : '✅ Normal';
            const emergencyColor = risk.emergency_stop ? '#f56565' : '#48bb78';
            
            riskEl.innerHTML = \`
                <div style="margin: 10px 0;"><strong>Emergency Stop:</strong> <span style="color: \${emergencyColor};">\${emergencyStatus}</span></div>
                <div style="margin: 10px 0;"><strong>Max Position:</strong> \${((risk.max_position_size || 0) * 100).toFixed(1)}%</div>
                <div style="margin: 10px 0;"><strong>Current Drawdown:</strong> \${((risk.current_drawdown || 0) * 100).toFixed(2)}%</div>
            \`;
        }
        
        function updateLogs(logs) {
            const logsEl = document.getElementById('logsData');
            const logLines = logs.logs || [];
            logsEl.innerHTML = logLines.slice(-20).join('<br>') || 'No logs available';
            logsEl.scrollTop = logsEl.scrollHeight;
        }
        
        function controlSystem(action) {
            fetch(\`/api/control/\${action}\`, { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(\`✅ \${data.message}\`);
                    } else {
                        alert(\`❌ Error: \${data.error}\`);
                    }
                })
                .catch(error => {
                    alert(\`❌ Network error: \${error.message}\`);
                });
        }
        
        // Initialize
        connectWebSocket();
        
        // Refresh data periodically as backup
        setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                fetch('/api/status')
                    .then(response => response.json())
                    .then(status => updateStatusBar(status))
                    .catch(console.error);
            }
        }, 30000);
    </script>
</body>
</html>`;
    }
    
    start() {
        this.server.listen(this.port, () => {
            console.log(\`🖥️  Dashboard server running on http://localhost:\${this.port}\`);
            console.log(\`📊 WebSocket ready for real-time updates\`);
        });
    }
}

// Start the dashboard if run directly
if (require.main === module) {
    const dashboard = new ArbitrageDashboard(3000);
    dashboard.start();
}

module.exports = ArbitrageDashboard;