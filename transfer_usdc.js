const { ethers } = require('ethers');

// Polymarket bot wallet
const WALLET_ADDRESS = '0x4365F3339e8Aef1EdD95916DBF57949012E8B6f2';
const WALLET_PRIVATE_KEY = '0xead4bbc4064e59e6acf4291e3e933dd69b8c669f7369d5342f072c7f1a1f220e';

// Target: ClawTasks wallet on Base L2
const CLAWTASKS_WALLET = '0xD9676dfD4A6Db0a7f30513C8d8bD43Ac2C495c13';

// USDC on Polygon mainnet
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Polygon RPC
const POLYGON_RPC = 'https://polygon-rpc.com/';

async function transferUSDP() {
  try {
    const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
    const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);
    
    console.log('Source wallet:', wallet.address);
    console.log('Target wallet:', CLAWTASKS_WALLET);
    
    // Get balance
    const usdc = new ethers.Contract(
      USDC_ADDRESS,
      ['function balanceOf(address) returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)', 'function decimals() returns (uint8)'],
      wallet
    );
    
    const decimals = await usdc.decimals();
    const balance = await usdc.balanceOf(wallet.address);
    console.log(`\nCurrent balance: ${ethers.utils.formatUnits(balance, decimals)} USDC`);
    
    if (balance.isZero()) {
      console.log('❌ No USDC found to transfer');
      return;
    }
    
    // Transfer all USDC to ClawTasks wallet
    console.log(`\n📤 Transferring ${ethers.utils.formatUnits(balance, decimals)} USDC to ClawTasks...`);
    const tx = await usdc.transfer(CLAWTASKS_WALLET, balance);
    console.log('Transaction hash:', tx.hash);
    
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      console.log('✅ Transfer successful!');
      console.log(`Amount: ${ethers.utils.formatUnits(balance, decimals)} USDC`);
      console.log(`To: ${CLAWTASKS_WALLET}`);
      console.log(`\n⚠️  NOTE: This is on Polygon. You'll need to bridge it to Base L2.`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

transferUSDP();
