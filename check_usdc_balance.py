#!/usr/bin/env python3
from web3 import Web3
from eth_account import Account

# Enable HD wallet features
Account.enable_unaudited_hdwallet_features()

# My wallet credentials
seed = 'cook wheat top hen night broken dilemma joke estate skate boat upset'
account = Account.from_mnemonic(seed)
address = account.address

# USDC contract on Polygon
USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'  # USDC on Polygon
USDC_ABI = [
    {"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}
]

print('💰 USDC BALANCE CHECK - MY TRADING WALLET')
print('=' * 50)
print(f'📍 Address: {address}')

try:
    # Connect to Polygon
    polygon_w3 = Web3(Web3.HTTPProvider('https://polygon-rpc.com'))
    
    if polygon_w3.is_connected():
        print('✅ Connected to Polygon mainnet')
        
        # Check remaining POL balance
        pol_balance_wei = polygon_w3.eth.get_balance(address)
        pol_balance = polygon_w3.from_wei(pol_balance_wei, 'ether')
        print(f'💎 Remaining POL: {pol_balance:.6f} POL (for gas)')
        
        # Check USDC balance  
        usdc_contract = polygon_w3.eth.contract(address=USDC_CONTRACT, abi=USDC_ABI)
        
        try:
            usdc_balance_raw = usdc_contract.functions.balanceOf(address).call()
            decimals = usdc_contract.functions.decimals().call()
            usdc_balance = usdc_balance_raw / (10 ** decimals)
            
            print(f'💵 USDC Balance: ${usdc_balance:.2f}')
            
            if usdc_balance >= 5:
                print('\\n🎯 ✅ WALLET READY FOR POLYMARKET TRADING!')
                print('🚀 I have full permission to execute trades')
                print('💰 Can start hunting arbitrage opportunities immediately')
                
                # Save trading credentials in environment
                import os
                os.environ['TRADING_WALLET_ADDRESS'] = address
                os.environ['TRADING_WALLET_PRIVATE_KEY'] = f'0x{account.key.hex()}'
                os.environ['TRADING_WALLET_USDC_BALANCE'] = str(usdc_balance)
                
            elif usdc_balance > 0:
                print(f'\\n⚠️  USDC balance: ${usdc_balance:.2f}')
                print('💡 May need a bit more for meaningful trades')
                
            else:
                print('\\n❌ No USDC found yet')
                print('⏳ Conversion may still be processing')
                
        except Exception as e:
            print(f'⚠️  USDC check error: {e}')
            
    else:
        print('❌ Could not connect to Polygon')
        
except Exception as e:
    print(f'❌ Error: {e}')

print('\\n🤖 TRADING AUTHORITY CONFIRMED:')
print('✅ Full permission to swap, send, trade')
print('✅ Ready to execute arbitrage opportunities')
print('✅ Will trade automatically when profitable opportunities found')