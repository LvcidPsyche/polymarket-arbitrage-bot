/**
 * Dutch Book Arbitrage Engine
 * 
 * Mathematical Foundation:
 * In a binary prediction market, YES + NO should always equal $1.00
 * If YES_price + NO_price < $1.00, a risk-free profit opportunity exists
 * by buying both outcomes and holding to resolution.
 * 
 * Formula: Profit = $1.00 - (YES_price + NO_price)
 * ROI = Profit / Investment
 */

export interface DutchBookOpportunity {
  marketId: string;
  marketName: string;
  yesPrice: number;
  noPrice: number;
  totalCost: number;
  guaranteedPayout: number;
  profit: number;
  roi: number;
  confidence: number;
  timestamp: number;
}

export interface MarketPrices {
  tokenId: string;
  outcome: 'YES' | 'NO';
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  volume24h: number;
}

/**
 * Calculate Dutch Book arbitrage opportunity
 * @param yesPrices - YES token market data
 * @param noPrices - NO token market data
 * @returns Opportunity details or null if no arb exists
 */
export function calculateDutchBookArbitrage(
  marketId: string,
  marketName: string,
  yesPrices: MarketPrices,
  noPrices: MarketPrices
): DutchBookOpportunity | null {
  // Use ask prices (what we pay to buy)
  const yesCost = yesPrices.bestAsk;
  const noCost = noPrices.bestAsk;
  const totalCost = yesCost + noCost;

  // Dutch Book condition: Total cost < $1.00
  if (totalCost >= 1.0) {
    return null;
  }

  const profit = 1.0 - totalCost;
  const roi = profit / totalCost;

  // Confidence based on liquidity and spread
  const liquidityScore = Math.min(
    (yesPrices.volume24h + noPrices.volume24h) / 10000,
    1.0
  );
  const spreadScore = 1.0 - Math.abs(yesPrices.bestAsk - yesPrices.bestBid);
  const confidence = (liquidityScore * 0.6) + (spreadScore * 0.4);

  return {
    marketId,
    marketName,
    yesPrice: yesCost,
    noPrice: noCost,
    totalCost,
    guaranteedPayout: 1.0,
    profit,
    roi,
    confidence,
    timestamp: Date.now()
  };
}

/**
 * Batch scan multiple markets for Dutch Book opportunities
 */
export async function scanDutchBookOpportunities(
  markets: Array<{ id: string; name: string; tokens: MarketPrices[] }>
): Promise<DutchBookOpportunity[]> {
  const opportunities: DutchBookOpportunity[] = [];

  for (const market of markets) {
    const yesToken = market.tokens.find(t => t.outcome === 'YES');
    const noToken = market.tokens.find(t => t.outcome === 'NO');

    if (yesToken && noToken) {
      const opportunity = calculateDutchBookArbitrage(
        market.id,
        market.name,
        yesToken,
        noToken
      );

      if (opportunity && opportunity.profit > 0.001) { // Minimum 0.1% profit
        opportunities.push(opportunity);
      }
    }
  }

  // Sort by ROI descending
  return opportunities.sort((a, b) => b.roi - a.roi);
}

/**
 * Calculate position sizing for Dutch Book arbitrage
 * Uses fixed return target rather than Kelly (guaranteed profit)
 */
export function calculateDutchBookPosition(
  opportunity: DutchBookOpportunity,
  availableCapital: number,
  maxPositionPercent: number = 0.25
): { yesAmount: number; noAmount: number; totalInvestment: number } {
  const maxInvestment = availableCapital * maxPositionPercent;
  
  // Scale position to achieve meaningful profit while staying within limits
  const targetProfit = 0.50; // Target $0.50 minimum profit
  const sharesNeeded = Math.ceil(targetProfit / opportunity.profit);
  const calculatedInvestment = sharesNeeded * opportunity.totalCost;
  
  const totalInvestment = Math.min(calculatedInvestment, maxInvestment);
  const positionScale = totalInvestment / opportunity.totalCost;
  
  return {
    yesAmount: positionScale * opportunity.yesPrice,
    noAmount: positionScale * opportunity.noPrice,
    totalInvestment
  };
}

/**
 * Validate opportunity is still available
 * Re-checks prices and confirms arbitrage still exists
 */
export async function validateDutchBookOpportunity(
  opportunity: DutchBookOpportunity,
  fetchPrices: (marketId: string) => Promise<{ yes: number; no: number }>
): Promise<{ valid: boolean; updatedOpportunity?: DutchBookOpportunity }> {
  try {
    const prices = await fetchPrices(opportunity.marketId);
    const totalCost = prices.yes + prices.no;
    
    if (totalCost >= 1.0) {
      return { valid: false };
    }

    const updatedProfit = 1.0 - totalCost;
    
    // Only valid if still profitable after accounting for potential slippage
    if (updatedProfit < opportunity.profit * 0.8) {
      return { valid: false };
    }

    return {
      valid: true,
      updatedOpportunity: {
        ...opportunity,
        yesPrice: prices.yes,
        noPrice: prices.no,
        totalCost,
        profit: updatedProfit,
        roi: updatedProfit / totalCost,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Calculate expected holding period return
 * Annualizes the return based on time to resolution
 */
export function calculateAnnualizedReturn(
  roi: number,
  hoursToResolution: number
): number {
  if (hoursToResolution <= 0) return 0;
  
  const periodsPerYear = (365 * 24) / hoursToResolution;
  return roi * periodsPerYear;
}
