#!/usr/bin/env python3
from web3 import Web3
import json

# Test wallet
address = '0xBff2b13F6C63018a7BcFd5fB21427880270c7e0c'
private_key = '0xc0a0ec4764ed4809b0d5a7fed27a17b6ac02c7ba28bebb7c73266c699781fb20'

# USDC contract on Polygon
USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
USDC_ABI = [{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]

print('🔍 COMPREHENSIVE WALLET CHECK')
print('=' * 50)
print(f'📍 Address: {address}')

rpcs = [
    ('Polygon RPC', 'https://polygon-rpc.com'),
    ('Alchemy Polygon', 'https://polygon-mainnet.g.alchemy.com/v2/demo'),
    ('Ankr Polygon', 'https://rpc.ankr.com/polygon')
]

for name, rpc_url in rpcs:
    try:
        print(f'\n🌐 Trying {name}...')
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        
        if w3.is_connected():
            print('✅ Connected')
            
            # Check POL/MATIC balance
            pol_balance = w3.eth.get_balance(address)
            pol_eth = w3.from_wei(pol_balance, 'ether')
            print(f'💰 POL/MATIC: {pol_eth:.6f}')
            
            # Check USDC balance
            try:
                usdc_contract = w3.eth.contract(address=USDC_CONTRACT, abi=USDC_ABI)
                usdc_balance_raw = usdc_contract.functions.balanceOf(address).call()
                decimals = usdc_contract.functions.decimals().call()
                usdc_balance = usdc_balance_raw / (10 ** decimals)
                print(f'💵 USDC: ${usdc_balance:.2f}')
                
                if usdc_balance > 0 or pol_eth > 0:
                    print('🎯 FOUND FUNDS! This wallet is ready')
                    break
                    
            except Exception as e:
                print(f'⚠️  USDC check failed: {str(e)[:30]}...')
                
        else:
            print('❌ Connection failed')
            
    except Exception as e:
        print(f'❌ {name} error: {str(e)[:30]}...')

print('\n📊 SUMMARY:')
if pol_eth > 0.001 or usdc_balance > 1:
    print('✅ Wallet has funds - ready for arbitrage')
    print('🚀 Can proceed with opportunity scanning')
else:
    print('⚠️  No significant funds found')
    print('💡 May need to:')
    print('   1. Wait for transaction confirmation')
    print('   2. Check if funds sent to different address')  
    print('   3. Verify transaction on polygonscan.com')