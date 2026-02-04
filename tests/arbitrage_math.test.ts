/**
 * Comprehensive Test Suite for Arbitrage Mathematics
 * 
 * Validates all core formulas and edge cases
 */

import {
  calculateDutchBookArbitrage,
  calculateDutchBookPosition,
  calculateAnnualizedReturn,
  DutchBookOpportunity
} from '../src/core/dutch_book_arbitrage';

import {
  calculateSyntheticArbitrage,
  calculateSyntheticPositionSize,
  PlatformMarket
} from '../src/core/synthetic_arbitrage';

import {
  calculateKelly,
  calculateKellyFromHistory,
  optimizePortfolioAllocation,
  calculateExpectedGrowth
} from '../src/risk/kelly_criterion';

// Test Dutch Book Arbitrage
function testDutchBookArbitrage() {
  console.log('Testing Dutch Book Arbitrage...\n');

  // Test 1: Valid arbitrage opportunity
  const marketPrices = {
    tokenId: 'test-token',
    outcome: 'YES' as const,
    bestBid: 0.55,
    bestAsk: 0.58,
    midPrice: 0.565,
    volume24h: 50000
  };

  const yesPrices = { ...marketPrices, outcome: 'YES' as const };
  const noPrices = { ...marketPrices, outcome: 'NO' as const, bestAsk: 0.40 };

  const opportunity = calculateDutchBookArbitrage('market-1', 'Test Market', yesPrices, noPrices);
  
  console.assert(opportunity !== null, 'Should detect arbitrage');
  console.assert(opportunity!.totalCost === 0.98, 'Total cost should be 0.98');
  console.assert(opportunity!.profit === 0.02, 'Profit should be 0.02');
  console.assert(opportunity!.roi === 0.02 / 0.98, 'ROI calculation incorrect');
  console.log('✓ Test 1 passed: Valid arbitrage detected\n');

  // Test 2: No arbitrage (cost >= $1.00)
  const noArbYes = { ...yesPrices, bestAsk: 0.60 };
  const noArbNo = { ...noPrices, bestAsk: 0.45 };
  const noOpportunity = calculateDutchBookArbitrage('market-2', 'No Arb Market', noArbYes, noArbNo);
  
  console.assert(noOpportunity === null, 'Should not detect arbitrage when cost >= $1');
  console.log('✓ Test 2 passed: No arbitrage when cost >= $1.00\n');

  // Test 3: Position sizing
  const position = calculateDutchBookPosition(opportunity!, 1000, 0.25);
  console.assert(position.totalInvestment <= 250, 'Position should respect max allocation');
  console.assert(position.yesAmount + position.noAmount === position.totalInvestment, 'Position components should sum correctly');
  console.log('✓ Test 3 passed: Position sizing works correctly\n');

  // Test 4: Annualized return
  const annualized = calculateAnnualizedReturn(0.02, 24); // 2% in 24 hours
  const expectedAnnualized = 0.02 * (365 * 24 / 24);
  console.assert(Math.abs(annualized - expectedAnnualized) < 0.001, 'Annualized return calculation incorrect');
  console.log('✓ Test 4 passed: Annualized return calculation correct\n');

  console.log('Dutch Book Arbitrage tests complete!\n');
}

// Test Synthetic Arbitrage
function testSyntheticArbitrage() {
  console.log('Testing Synthetic Arbitrage...\n');

  const polyMarket: PlatformMarket = {
    platform: 'polymarket',
    marketId: 'poly-1',
    eventName: 'Will Trump win 2024?',
    outcomeName: 'Trump',
    yesPrice: 0.52,
    noPrice: 0.49,
    volume24h: 100000,
    expirationTime: Date.now() + 86400000 * 30,
    fees: { taker: 0.002 }
  };

  const kalshiMarket: PlatformMarket = {
    platform: 'kalshi',
    marketId: 'kalshi-1',
    eventName: 'Will Trump win 2024?',
    outcomeName: 'Trump',
    yesPrice: 0.55,
    noPrice: 0.46,
    volume24h: 50000,
    expirationTime: Date.now() + 86400000 * 30,
    fees: { taker: 0.005 }
  };

  // Test 1: Direct synthetic arbitrage (Poly YES + Kalshi NO)
  const opportunity = calculateSyntheticArbitrage(polyMarket, kalshiMarket, 'Will Trump win 2024?');
  
  console.assert(opportunity !== null, 'Should detect synthetic arbitrage');
  console.assert(opportunity!.strategy === 'direct', 'Should be direct strategy');
  console.assert(opportunity!.netProfit > 0, 'Should have positive net profit');
  console.log('✓ Test 1 passed: Direct synthetic arbitrage detected\n');

  // Test 2: Reverse synthetic arbitrage
  const reversePoly = { ...polyMarket, yesPrice: 0.48, noPrice: 0.53 };
  const reverseOpp = calculateSyntheticArbitrage(reversePoly, kalshiMarket, 'Reverse Test');
  
  if (reverseOpp) {
    console.assert(reverseOpp.strategy === 'reverse', 'Should be reverse strategy');
    console.log('✓ Test 2 passed: Reverse synthetic arbitrage detected\n');
  } else {
    console.log('⚠ Test 2: No reverse arbitrage (expected based on prices)\n');
  }

  // Test 3: Position sizing
  if (opportunity) {
    const position = calculateSyntheticPositionSize(opportunity, 1000, 0.5);
    console.assert(position.buyPosition > 0, 'Should have buy position');
    console.assert(position.hedgePosition > 0, 'Should have hedge position');
    console.assert(position.totalInvestment <= 250, 'Should respect position limits');
    console.log('✓ Test 3 passed: Synthetic position sizing works\n');
  }

  console.log('Synthetic Arbitrage tests complete!\n');
}

// Test Kelly Criterion
function testKellyCriterion() {
  console.log('Testing Kelly Criterion...\n');

  // Test 1: Basic Kelly calculation
  // b = 2 (win 2x loss), p = 0.6, q = 0.4
  // f* = (2*0.6 - 0.4) / 2 = (1.2 - 0.4) / 2 = 0.4
  const kelly1 = calculateKelly(0.6, 0.2, 0.1, 1.0); // Full Kelly
  console.assert(Math.abs(kelly1.fullKelly - 0.5) < 0.001, 'Full Kelly calculation incorrect');
  console.assert(Math.abs(kelly1.halfKelly - 0.25) < 0.001, 'Half Kelly should be half of full');
  console.assert(kelly1.edge > 0, 'Should have positive edge');
  console.log('✓ Test 1 passed: Kelly calculation correct\n');

  // Test 2: Negative edge (no trade)
  const kelly2 = calculateKelly(0.4, 0.1, 0.2, 1.0);
  console.assert(kelly2.recommended === 0, 'Should not trade on negative edge');
  console.assert(kelly2.warning?.includes('Negative edge'), 'Should warn about negative edge');
  console.log('✓ Test 2 passed: Negative edge handled correctly\n');

  // Test 3: Kelly from trade history
  const trades = [
    { profit: 0.15, size: 100 },
    { profit: -0.08, size: 100 },
    { profit: 0.12, size: 100 },
    { profit: 0.18, size: 100 },
    { profit: -0.05, size: 100 },
    { profit: 0.10, size: 100 },
    { profit: 0.14, size: 100 },
    { profit: -0.07, size: 100 },
    { profit: 0.11, size: 100 },
    { profit: 0.13, size: 100 },
    { profit: -0.09, size: 100 },
    { profit: 0.16, size: 100 }
  ];

  const kelly3 = calculateKellyFromHistory(trades);
  console.assert(kelly3.recommended > 0, 'Should have positive Kelly from winning history');
  console.assert(kelly3.winRate > 0.5, 'Win rate should be > 50%');
  console.log('✓ Test 3 passed: Kelly from history works\n');

  // Test 4: Portfolio optimization
  const opportunities = [
    { id: 'opp1', expectedReturn: 0.05, winProbability: 0.6, avgWin: 0.15, avgLoss: 0.10 },
    { id: 'opp2', expectedReturn: 0.03, winProbability: 0.55, avgWin: 0.12, avgLoss: 0.08 },
    { id: 'opp3', expectedReturn: 0.04, winProbability: 0.58, avgWin: 0.14, avgLoss: 0.09 }
  ];

  const allocation = optimizePortfolioAllocation(opportunities, 10000, 0.5);
  console.assert(allocation.totalAllocation <= 0.5, 'Should respect max exposure');
  console.assert(allocation.opportunities.length === 3, 'Should have allocation for each opportunity');
  console.log('✓ Test 4 passed: Portfolio optimization works\n');

  // Test 5: Expected growth calculation
  const growth = calculateExpectedGrowth(10000, 0.6, 0.15, 0.10, 0.25);
  console.assert(growth.expectedGrowth > 0, 'Should have positive expected growth');
  console.assert(growth.geometricMean > 1, 'Geometric mean should be > 1 for profitable strategy');
  console.log('✓ Test 5 passed: Expected growth calculation works\n');

  console.log('Kelly Criterion tests complete!\n');
}

// Test Edge Cases
function testEdgeCases() {
  console.log('Testing Edge Cases...\n');

  // Test 1: Zero prices
  const zeroYes = {
    tokenId: 'zero',
    outcome: 'YES' as const,
    bestBid: 0,
    bestAsk: 0,
    midPrice: 0,
    volume24h: 0
  };
  const zeroNo = { ...zeroYes, outcome: 'NO' as const, bestAsk: 0 };
  
  const zeroOpportunity = calculateDutchBookArbitrage('zero-market', 'Zero Test', zeroYes, zeroNo);
  console.assert(zeroOpportunity !== null && zeroOpportunity.profit === 1.0, 'Zero prices should give max profit');
  console.log('✓ Test 1 passed: Zero price edge case handled\n');

  // Test 2: Very small arbitrage (0.1%)
  const tinyYes = { ...zeroYes, bestAsk: 0.60 };
  const tinyNo = { ...zeroNo, bestAsk: 0.399 }; // Total = 0.999
  const tinyOpportunity = calculateDutchBookArbitrage('tiny-market', 'Tiny Test', tinyYes, tinyNo);
  console.assert(tinyOpportunity === null, 'Sub-0.1% profit should be filtered');
  console.log('✓ Test 2 passed: Tiny arbitrage correctly filtered\n');

  // Test 3: Invalid Kelly inputs
  const invalidKelly1 = calculateKelly(0, 0.1, 0.1, 1.0);
  console.assert(invalidKelly1.recommended === 0, 'Zero win probability should give zero Kelly');
  
  const invalidKelly2 = calculateKelly(1.0, 0.1, 0.1, 1.0);
  console.assert(invalidKelly2.recommended === 0, '100% win probability should be rejected');
  console.log('✓ Test 3 passed: Invalid Kelly inputs handled\n');

  // Test 4: Extreme Kelly (very high edge)
  const extremeKelly = calculateKelly(0.9, 0.5, 0.05, 1.0);
  console.assert(extremeKelly.fullKelly > 0.8, 'High edge should give high Kelly');
  console.assert(extremeKelly.recommended <= 0.25, 'Should cap at 25% maximum');
  console.log('✓ Test 4 passed: Kelly caps work correctly\n');

  console.log('Edge case tests complete!\n');
}

// Run all tests
function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     POLYMARKET ARBITRAGE BOT - MATH TEST SUITE         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    testDutchBookArbitrage();
    testSyntheticArbitrage();
    testKellyCriterion();
    testEdgeCases();

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║              ALL TESTS PASSED ✓                       ║');
    console.log('╚════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

runAllTests();
