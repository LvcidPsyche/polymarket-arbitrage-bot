#!/bin/bash

# Silent Autonomous Arbitrage Trader
# Executes trades automatically without notifications

cd /home/botuser/.openclaw/workspace

# Run silent arbitrage executor
node silent_arbitrage_executor.js >> "trades/silent_log_$(date '+%Y%m%d').log" 2>&1

# Update HEARTBEAT.md with latest status if major profit made
if [ -f "silent_trading_summary.json" ]; then
    PROFIT=$(grep -o '"totalProfit":[0-9.]*' silent_trading_summary.json | cut -d':' -f2)
    if (( $(echo "$PROFIT > 5" | bc -l) )); then
        echo "💰 Major profit milestone reached: \$$PROFIT" > /tmp/trading_milestone.txt
    fi
fi