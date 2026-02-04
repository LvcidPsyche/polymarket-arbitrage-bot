/**
 * Kelly Criterion Position Sizing
 * 
 * Mathematical Foundation:
 * Kelly Criterion maximizes long-term growth by optimizing bet size based on
 * edge and odds. Formula: f* = (bp - q) / b
 * 
 * Where:
 * - f* = optimal fraction of bankroll to bet
 * - b = average win / average loss (reward-to-risk ratio)
 * - p = probability of win
 * - q = probability of loss (1 - p)
 * 
 * Implementation uses Half-Kelly for safety margin
 */

export interface TradeStatistics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  winRate: number;
  lossRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface KellyResult {
  fullKelly: number;
  halfKelly: number;
  quarterKelly: number;
  recommended: number;
  edge: number;
  confidence: number;
  warning?: string;
}

export interface PortfolioAllocation {
  opportunities: Array<{
    id: string;
    expectedReturn: number;
    winProbability: number;
    kellyFraction: number;
    allocation: number;
  }>;
  totalAllocation: number;
  riskAdjusted: boolean;
}

/**
 * Calculate Kelly Criterion for a single opportunity
 */
export function calculateKelly(
  winProbability: number,
  avgWin: number,
  avgLoss: number,
  safetyMultiplier: number = 0.5
): KellyResult {
  // Validate inputs
  if (winProbability <= 0 || winProbability >= 1) {
    return {
      fullKelly: 0,
      halfKelly: 0,
      quarterKelly: 0,
      recommended: 0,
      edge: 0,
      confidence: 0,
      warning: 'Invalid win probability'
    };
  }

  if (avgWin <= 0 || avgLoss <= 0) {
    return {
      fullKelly: 0,
      halfKelly: 0,
      quarterKelly: 0,
      recommended: 0,
      edge: 0,
      confidence: 0,
      warning: 'Average win/loss must be positive'
    };
  }

  // Calculate reward-to-risk ratio
  const b = avgWin / avgLoss;
  const p = winProbability;
  const q = 1 - p;

  // Kelly formula: f* = (bp - q) / b
  const fullKelly = (b * p - q) / b;
  
  // Edge calculation
  const edge = b * p - q;
  
  // If negative edge, don't trade
  if (fullKelly <= 0 || edge <= 0) {
    return {
      fullKelly: 0,
      halfKelly: 0,
      quarterKelly: 0,
      recommended: 0,
      edge,
      confidence: 0,
      warning: 'Negative edge - do not trade'
    };
  }

  // Conservative fractions
  const halfKelly = fullKelly * 0.5;
  const quarterKelly = fullKelly * 0.25;
  
  // Recommended uses safety multiplier
  let recommended = fullKelly * safetyMultiplier;
  
  // Cap at reasonable maximum (25% of bankroll per trade)
  recommended = Math.min(recommended, 0.25);
  
  // Confidence based on sample size and edge magnitude
  const sampleConfidence = Math.min(1, winProbability * 10); // More trades = more confidence
  const edgeConfidence = Math.min(1, edge * 5); // Larger edge = more confidence
  const confidence = (sampleConfidence * 0.4) + (edgeConfidence * 0.6);

  return {
    fullKelly,
    halfKelly,
    quarterKelly,
    recommended,
    edge,
    confidence
  };
}

/**
 * Calculate Kelly from historical trade data
 */
export function calculateKellyFromHistory(
  trades: Array<{ profit: number; size: number }>,
  safetyMultiplier: number = 0.5
): KellyResult {
  if (trades.length < 10) {
    return {
      fullKelly: 0,
      halfKelly: 0,
      quarterKelly: 0,
      recommended: 0,
      edge: 0,
      confidence: 0,
      warning: 'Insufficient trade history (minimum 10 trades)'
    };
  }

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  
  const winProbability = wins.length / trades.length;
  
  const avgWin = wins.length > 0
    ? wins.reduce((sum, t) => sum + t.profit, 0) / wins.length
    : 0;
    
  const avgLoss = losses.length > 0
    ? Math.abs(losses.reduce((sum, t) => sum + t.profit, 0)) / losses.length
    : 0;

  if (avgWin === 0 || avgLoss === 0) {
    return {
      fullKelly: 0,
      halfKelly: 0,
      quarterKelly: 0,
      recommended: 0,
      edge: 0,
      confidence: 0,
      warning: 'Cannot calculate Kelly - no wins or losses recorded'
    };
  }

  return calculateKelly(winProbability, avgWin, avgLoss, safetyMultiplier);
}

/**
 * Optimize portfolio allocation across multiple opportunities
 * Uses fractional Kelly with diversification constraints
 */
export function optimizePortfolioAllocation(
  opportunities: Array<{
    id: string;
    expectedReturn: number;
    winProbability: number;
    avgWin: number;
    avgLoss: number;
    correlation?: number; // Correlation with other opportunities
  }>,
  totalBankroll: number,
  maxTotalExposure: number = 0.5
): PortfolioAllocation {
  const allocations: PortfolioAllocation['opportunities'] = [];
  
  for (const opp of opportunities) {
    const kelly = calculateKelly(opp.winProbability, opp.avgWin, opp.avgLoss);
    
    // Reduce allocation for correlated opportunities
    const correlationPenalty = opp.correlation ? 1 - (opp.correlation * 0.5) : 1;
    const adjustedKelly = kelly.recommended * correlationPenalty;
    
    allocations.push({
      id: opp.id,
      expectedReturn: opp.expectedReturn,
      winProbability: opp.winProbability,
      kellyFraction: kelly.recommended,
      allocation: adjustedKelly
    });
  }

  // Normalize if total exceeds max exposure
  const totalKelly = allocations.reduce((sum, a) => sum + a.allocation, 0);
  
  if (totalKelly > maxTotalExposure) {
    const scaleFactor = maxTotalExposure / totalKelly;
    for (const alloc of allocations) {
      alloc.allocation *= scaleFactor;
    }
  }

  return {
    opportunities: allocations,
    totalAllocation: allocations.reduce((sum, a) => sum + a.allocation, 0),
    riskAdjusted: totalKelly > maxTotalExposure
  };
}

/**
 * Dynamic Kelly adjustment based on recent performance
 */
export function adaptiveKellyAdjustment(
  baseKelly: number,
  recentPerformance: {
    winRate: number;
    avgReturn: number;
    consecutiveLosses: number;
  },
  adjustmentParams: {
    winRateThreshold: number;
    drawdownThreshold: number;
    recoveryFactor: number;
  } = {
    winRateThreshold: 0.45,
    drawdownThreshold: 0.20,
    recoveryFactor: 0.8
  }
): { adjustedKelly: number; adjustmentReason: string } {
  let adjustment = 1.0;
  let reasons: string[] = [];

  // Reduce on poor win rate
  if (recentPerformance.winRate < adjustmentParams.winRateThreshold) {
    adjustment *= 0.7;
    reasons.push('Low win rate');
  }

  // Reduce on consecutive losses
  if (recentPerformance.consecutiveLosses >= 3) {
    adjustment *= Math.pow(adjustmentParams.recoveryFactor, recentPerformance.consecutiveLosses - 2);
    reasons.push(`${recentPerformance.consecutiveLosses} consecutive losses`);
  }

  // Reduce on negative returns
  if (recentPerformance.avgReturn < 0) {
    adjustment *= 0.5;
    reasons.push('Negative recent returns');
  }

  // Increase on strong performance
  if (recentPerformance.winRate > 0.6 && recentPerformance.avgReturn > 0.05) {
    adjustment = Math.min(1.2, adjustment * 1.1);
    reasons.push('Strong performance - slight increase');
  }

  const adjustedKelly = baseKelly * adjustment;
  
  return {
    adjustedKelly: Math.max(0, adjustedKelly),
    adjustmentReason: reasons.join(', ') || 'No adjustment needed'
  };
}

/**
 * Calculate expected growth rate given Kelly fraction
 * Used to compare different position sizing strategies
 */
export function calculateExpectedGrowth(
  bankroll: number,
  winProbability: number,
  avgWin: number,
  avgLoss: number,
  kellyFraction: number
): {
  expectedGrowth: number;
  geometricMean: number;
  variance: number;
} {
  const p = winProbability;
  const q = 1 - p;
  const b = avgWin / avgLoss;
  
  // Expected value of log wealth
  const winScenario = Math.log(1 + kellyFraction * b);
  const lossScenario = Math.log(1 - kellyFraction);
  
  const expectedLogWealth = p * winScenario + q * lossScenario;
  
  // Variance of log wealth
  const variance = p * Math.pow(winScenario - expectedLogWealth, 2) +
                   q * Math.pow(lossScenario - expectedLogWealth, 2);

  return {
    expectedGrowth: Math.exp(expectedLogWealth) - 1,
    geometricMean: Math.exp(expectedLogWealth),
    variance
  };
}

/**
 * Calculate maximum drawdown probability
 * Based on Monte Carlo simulation
 */
export function estimateMaxDrawdown(
  winProbability: number,
  avgWin: number,
  avgLoss: number,
  kellyFraction: number,
  simulations: number = 10000,
  tradesPerSimulation: number = 100
): {
  medianDrawdown: number;
  maxDrawdown: number;
  p95Drawdown: number;
} {
  const drawdowns: number[] = [];
  
  for (let sim = 0; sim < simulations; sim++) {
    let peak = 1;
    let current = 1;
    let maxDD = 0;
    
    for (let trade = 0; trade < tradesPerSimulation; trade++) {
      const win = Math.random() < winProbability;
      const outcome = win ? kellyFraction * (avgWin / avgLoss) : -kellyFraction;
      current *= (1 + outcome);
      
      if (current > peak) {
        peak = current;
      }
      
      const dd = (peak - current) / peak;
      if (dd > maxDD) {
        maxDD = dd;
      }
    }
    
    drawdowns.push(maxDD);
  }
  
  drawdowns.sort((a, b) => a - b);
  
  return {
    medianDrawdown: drawdowns[Math.floor(simulations * 0.5)],
    maxDrawdown: drawdowns[drawdowns.length - 1],
    p95Drawdown: drawdowns[Math.floor(simulations * 0.95)]
  };
}
