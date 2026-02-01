#!/bin/bash

# Intensive Arbitrage Scanner Executor
# Runs every 5 minutes at :04, :09, :14, :19, :24, :29, :34, :39, :44, :49, :54, :59

cd /home/botuser/.openclaw/workspace

echo "🚨 EXECUTING INTENSIVE ARBITRAGE SCAN"
echo "📅 $(date)"
echo "🎯 Scanning for opportunities >25% APY"

# Run the intensive scanner
node intensive_arbitrage_scanner.js > "arbitrage_scans/scan_$(date '+%Y%m%d_%H%M').log" 2>&1

# Check if high-value opportunities were found
if grep -q "HIGH-VALUE OPPORTUNITIES DETECTED" "arbitrage_scans/scan_$(date '+%Y%m%d_%H%M').log"; then
    echo "🚨 HIGH-VALUE OPPORTUNITY ALERT!"
    echo "💰 Profitable arbitrage opportunities detected!"
    
    # Extract the opportunity details for notification
    grep -A 20 "HIGH-VALUE OPPORTUNITIES DETECTED" "arbitrage_scans/scan_$(date '+%Y%m%d_%H%M').log" | head -30 > /tmp/opportunity_alert.txt
    
    echo "🔔 Alert saved to opportunity_alert.txt"
    echo "💡 Check the full log for complete details"
else
    echo "📊 Scan complete - no high-value opportunities this round"
fi

echo "⏰ Next scan in 5 minutes"