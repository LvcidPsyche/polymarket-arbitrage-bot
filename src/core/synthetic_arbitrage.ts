/**
 * Synthetic Arbitrage Engine - Cross-Platform Opportunity Detection
 * 
 * Mathematical Foundation:
 * Different prediction markets may price the same event differently.
 * By buying YES on the cheaper platform and NO on the other, we create
 * a synthetic position that guarantees $1.00 payout if total cost < $1.00.
 * 
 * Strategies:
 * 1. Direct Synthetic: Poly_YES + Kalshi_NO < $1.00
 * 2. Reverse Synthetic: Poly_NO + Kalshi_YES < $1.00
 * 3. Multi-leg Arbitrage: Combining multiple platforms
 */

export interface PlatformMarket {
  platform: 'polymarket' | 'kalshi' | 'other';
  marketId: string;
  eventName: string;
  outcomeName: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  expirationTime: number;
  fees: {
    taker: number;
    settlement?: number;
  };
}

export interface SyntheticArbitrageOpportunity {
  id: string;
  strategy: 'direct' | 'reverse';
  primaryPlatform: string;
  secondaryPlatform: string;
  eventName: string;
  
  // Position details
  buyPlatform: string;
  buyOutcome: 'YES' | 'NO';
  buyPrice: number;
  
  hedgePlatform: string;
  hedgeOutcome: 'YES' | 'NO';
  hedgePrice: number;
  
  // Economics
  totalCost: number;
  guaranteedPayout: number;
  grossProfit: number;
  totalFees: number;
  netProfit: number;
  roi: number;
  
  // Risk metrics
  executionRisk: number;
  timeToResolution: number;
  liquidityScore: number;
  
  timestamp: number;
}

/**
 * Calculate synthetic arbitrage between two platforms
 * @returns Opportunity if profitable, null otherwise
 */
export function calculateSyntheticArbitrage(
  polyMarket: PlatformMarket,
  kalshiMarket: PlatformMarket,
  eventName: string
): SyntheticArbitrageOpportunity | null {
  // Strategy 1: Buy YES on Polymarket, NO on Kalshi
  const directCost = polyMarket.yesPrice + kalshiMarket.noPrice;
  const directFees = polyMarket.fees.taker + kalshiMarket.fees.taker;
  const directNetCost = directCost + directFees;
  const directProfit = 1.0 - directNetCost;

  // Strategy 2: Buy NO on Polymarket, YES on Kalshi
  const reverseCost = polyMarket.noPrice + kalshiMarket.yesPrice;
  const reverseFees = polyMarket.fees.taker + kalshiMarket.fees.taker;
  const reverseNetCost = reverseCost + reverseFees;
  const reverseProfit = 1.0 - reverseNetCost;

  let bestStrategy: SyntheticArbitrageOpportunity | null = null;

  // Choose the more profitable strategy
  if (directProfit > 0 && directProfit >= reverseProfit) {
    bestStrategy = createOpportunityRecord(
      'direct',
      polyMarket,
      kalshiMarket,
      eventName,
      directCost,
      directFees,
      directProfit
    );
  } else if (reverseProfit > 0) {
    bestStrategy = createOpportunityRecord(
      'reverse',
      kalshiMarket,
      polyMarket,
      eventName,
      reverseCost,
      reverseFees,
      reverseProfit
    );
  }

  return bestStrategy;
}

function createOpportunityRecord(
  strategy: 'direct' | 'reverse',
  buyMarket: PlatformMarket,
  hedgeMarket: PlatformMarket,
  eventName: string,
  totalCost: number,
  fees: number,
  profit: number
): SyntheticArbitrageOpportunity {
  const isDirect = strategy === 'direct';
  
  return {
    id: `SYNTH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    strategy,
    primaryPlatform: buyMarket.platform,
    secondaryPlatform: hedgeMarket.platform,
    eventName,
    
    buyPlatform: buyMarket.platform,
    buyOutcome: isDirect ? 'YES' : 'NO',
    buyPrice: isDirect ? buyMarket.yesPrice : buyMarket.noPrice,
    
    hedgePlatform: hedgeMarket.platform,
    hedgeOutcome: isDirect ? 'NO' : 'YES',
    hedgePrice: isDirect ? hedgeMarket.noPrice : hedgeMarket.yesPrice,
    
    totalCost,
    guaranteedPayout: 1.0,
    grossProfit: profit + fees,
    totalFees: fees,
    netProfit: profit,
    roi: profit / totalCost,
    
    executionRisk: calculateExecutionRisk(buyMarket, hedgeMarket),
    timeToResolution: Math.min(buyMarket.expirationTime, hedgeMarket.expirationTime),
    liquidityScore: calculateLiquidityScore(buyMarket, hedgeMarket),
    
    timestamp: Date.now()
  };
}

/**
 * Calculate execution risk based on platform reliability and timing
 */
function calculateExecutionRisk(
  marketA: PlatformMarket,
  marketB: PlatformMarket
): number {
  const volumeRisk = Math.max(0, 1 - (marketA.volume24h + marketB.volume24h) / 100000);
  const feeRisk = (marketA.fees.taker + marketB.fees.taker) * 10; // Scale up
  const platformRisk = (marketA.platform !== marketB.platform) ? 0.1 : 0.05;
  
  return Math.min(1, (volumeRisk * 0.5) + (feeRisk * 0.3) + (platformRisk * 0.2));
}

/**
 * Calculate composite liquidity score
 */
function calculateLiquidityScore(
  marketA: PlatformMarket,
  marketB: PlatformMarket
): number {
  const totalVolume = marketA.volume24h + marketB.volume24h;
  const minVolume = Math.min(marketA.volume24h, marketB.volume24h);
  
  // Score based on absolute and relative liquidity
  const volumeScore = Math.min(totalVolume / 50000, 1) * 0.6;
  const balanceScore = (minVolume / Math.max(totalVolume / 2, 1)) * 0.4;
  
  return volumeScore + balanceScore;
}

/**
 * Batch scan for synthetic arbitrage across multiple market pairs
 */
export function scanSyntheticArbitrage(
  polymarketMarkets: PlatformMarket[],
  kalshiMarkets: PlatformMarket[],
  minProfitPercent: number = 0.001
): SyntheticArbitrageOpportunity[] {
  const opportunities: SyntheticArbitrageOpportunity[] = [];

  for (const poly of polymarketMarkets) {
    // Find matching Kalshi markets by event name similarity
    const matches = kalshiMarkets.filter(kalshi => 
      isMatchingEvent(poly.eventName, kalshi.eventName)
    );

    for (const kalshi of matches) {
      const opportunity = calculateSyntheticArbitrage(poly, kalshi, poly.eventName);
      
      if (opportunity && opportunity.netProfit >= minProfitPercent) {
        opportunities.push(opportunity);
      }
    }
  }

  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Simple event name matching (should be enhanced with NLP)
 */
function isMatchingEvent(nameA: string, nameB: string): boolean {
  const normalize = (s: string) => 
    s.toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(' ')
      .filter(w => w.length > 2)
      .sort()
      .join(' ');
  
  const normalizedA = normalize(nameA);
  const normalizedB = normalize(nameB);
  
  // Check for significant word overlap
  const wordsA = new Set(normalizedA.split(' '));
  const wordsB = normalizedB.split(' ');
  const overlap = wordsB.filter(w => wordsA.has(w)).length;
  
  return overlap >= 2 || normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA);
}

/**
 * Calculate optimal position sizing for synthetic arbitrage
 * Accounts for execution risk and capital efficiency
 */
export function calculateSyntheticPositionSize(
  opportunity: SyntheticArbitrageOpportunity,
  availableCapital: number,
  riskTolerance: number = 0.5
): {
  buyPosition: number;
  hedgePosition: number;
  totalInvestment: number;
  expectedNetProfit: number;
} {
  // Base position on available capital and opportunity quality
  const qualityMultiplier = opportunity.liquidityScore * (1 - opportunity.executionRisk);
  const baseAllocation = availableCapital * riskTolerance * qualityMultiplier;
  
  // Ensure minimum viable position ($10)
  const minPosition = 10;
  const maxPosition = availableCapital * 0.25; // Max 25% per trade
  
  const buyPosition = Math.max(minPosition, Math.min(baseAllocation, maxPosition));
  const hedgePosition = buyPosition * (opportunity.hedgePrice / opportunity.buyPrice);
  const totalInvestment = buyPosition + hedgePosition;
  
  return {
    buyPosition,
    hedgePosition,
    totalInvestment,
    expectedNetProfit: totalInvestment * opportunity.roi * (1 - opportunity.executionRisk)
  };
}
