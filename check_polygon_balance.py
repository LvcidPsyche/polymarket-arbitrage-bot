#!/usr/bin/env python3
from web3 import Web3

# Test wallet from previous session
address = '0xBff2b13F6C63018a7BcFd5fB21427880270c7e0c'
private_key = '0xc0a0ec4764ed4809b0d5a7fed27a17b6ac02c7ba28bebb7c73266c699781fb20'

print('🟣 POLYGON WALLET STATUS CHECK')
print('=' * 40)

try:
    # Connect to Polygon mainnet
    polygon_rpc = 'https://polygon-rpc.com'
    w3 = Web3(Web3.HTTPProvider(polygon_rpc))
    
    if w3.is_connected():
        print('✅ Connected to Polygon mainnet')
        
        # Check POL balance (native token)
        balance = w3.eth.get_balance(address)
        pol_balance = w3.from_wei(balance, 'ether')
        
        print(f'📍 Address: {address}')
        print(f'💰 POL Balance: {pol_balance:.6f} POL')
        
        # Estimate USD value (POL ~$0.50)
        usd_value = float(pol_balance) * 0.50
        print(f'💵 Estimated value: ${usd_value:.2f} USD')
        
        if pol_balance >= 0.001:
            print('✅ Sufficient balance for Polymarket trading!')
            print('🎯 Ready to hunt for arbitrage opportunities')
            
            # Set environment variable for trading scripts
            import os
            os.environ['WALLET_ADDRESS'] = address
            os.environ['WALLET_PRIVATE_KEY'] = private_key
            
        else:
            print('⚠️  Balance too low for trading')
            
    else:
        print('❌ Failed to connect to Polygon network')
        
except Exception as e:
    print(f'❌ Error: {e}')

print('\n🚀 NEXT: Run opportunity scanner with funded wallet')