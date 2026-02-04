/**
 * Market Microstructure Analysis
 * 
 * Analyzes order book patterns, market maker behavior, and
 * liquidity dynamics to identify exploitable inefficiencies.
 */

export interface MarketMakerSignature {
  platform: string;
  pattern: 'spoofing' | 'layering' | 'momentum_ignition' | 'quote_stuffing' | 'normal';
  confidence: number;
  indicators: {
    rapidCancellationRate: number;
    quoteToTradeRatio: number;
    sizeAtBestQuote: number;
    quotePersistence: number;
  };
}

export interface LiquidityProfile {
  platform: string;
  timestamp: number;
  depth10bps: number;  // Depth within 10 bps of mid
  depth50bps: number;  // Depth within 50 bps of mid
  depth100bps: number; // Depth within 100 bps of mid
  spreadBps: number;
  imbalance: number;   // (bidVolume - askVolume) / totalVolume
  resilience: number;  // How quickly liquidity returns after trade
}

export interface OrderFlowImbalance {
  timestamp: number;
  aggressiveBuyVolume: number;
  aggressiveSellVolume: number;
  netFlow: number;
  pressure: 'buy' | 'sell' | 'neutral';
  strength: number;    // 0-1 scale
}

/**
 * Detect market maker manipulation patterns
 */
export function detectMarketMakerPattern(
  orderBookSnapshots: Array<{
    timestamp: number;
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
    trades: Array<{ side: 'buy' | 'sell'; size: number; price: number }>;
  }>,
  timeWindow: number = 60000 // 1 minute
): MarketMakerSignature {
  if (orderBookSnapshots.length < 10) {
    return {
      platform: 'unknown',
      pattern: 'normal',
      confidence: 0,
      indicators: {
        rapidCancellationRate: 0,
        quoteToTradeRatio: 0,
        sizeAtBestQuote: 0,
        quotePersistence: 0
      }
    };
  }

  // Calculate quote modifications
  let quoteChanges = 0;
  let cancellations = 0;
  let totalQuotes = 0;
  let quotePersistenceSum = 0;

  for (let i = 1; i < orderBookSnapshots.length; i++) {
    const prev = orderBookSnapshots[i - 1];
    const curr = orderBookSnapshots[i];
    
    // Count changes at best bid/ask
    const prevBestBid = prev.bids[0];
    const currBestBid = curr.bids[0];
    const prevBestAsk = prev.asks[0];
    const currBestAsk = curr.asks[0];

    if (prevBestBid && currBestBid) {
      if (prevBestBid.price !== currBestBid.price || prevBestBid.size !== currBestBid.size) {
        quoteChanges++;
      }
      totalQuotes++;
    }

    if (prevBestAsk && currBestAsk) {
      if (prevBestAsk.price !== currBestAsk.price || prevBestAsk.size !== currBestAsk.size) {
        quoteChanges++;
      }
      totalQuotes++;
    }
  }

  // Calculate cancellation rate
  const rapidCancellationRate = totalQuotes > 0 ? cancellations / totalQuotes : 0;
  
  // Calculate quote-to-trade ratio
  const totalTradeVolume = orderBookSnapshots.reduce((sum, snap) => 
    sum + snap.trades.reduce((t, trade) => t + trade.size, 0), 0
  );
  const quoteVolume = orderBookSnapshots.reduce((sum, snap) => 
    sum + (snap.bids[0]?.size || 0) + (snap.asks[0]?.size || 0), 0
  ) / orderBookSnapshots.length;
  
  const quoteToTradeRatio = totalTradeVolume > 0 ? quoteVolume / totalTradeVolume : 0;

  // Detect patterns
  let pattern: MarketMakerSignature['pattern'] = 'normal';
  let confidence = 0;

  // Spoofing: High quote-to-trade ratio, frequent cancellations
  if (quoteToTradeRatio > 10 && rapidCancellationRate > 0.3) {
    pattern = 'spoofing';
    confidence = Math.min(1, (quoteToTradeRatio / 20) * (rapidCancellationRate / 0.5));
  }
  // Layering: Multiple price levels with rapid changes
  else if (quoteChanges > orderBookSnapshots.length * 2) {
    pattern = 'layering';
    confidence = Math.min(1, quoteChanges / (orderBookSnapshots.length * 4));
  }
  // Quote stuffing: Extremely high message rate
  else if (orderBookSnapshots.length > 100) {
    pattern = 'quote_stuffing';
    confidence = Math.min(1, orderBookSnapshots.length / 200);
  }

  return {
    platform: orderBookSnapshots[0]?.timestamp ? 'detected' : 'unknown',
    pattern,
    confidence,
    indicators: {
      rapidCancellationRate,
      quoteToTradeRatio,
      sizeAtBestQuote: orderBookSnapshots[orderBookSnapshots.length - 1]?.bids[0]?.size || 0,
      quotePersistence: quotePersistenceSum / orderBookSnapshots.length
    }
  };
}

/**
 * Analyze liquidity profile from order book
 */
export function analyzeLiquidityProfile(
  orderBook: {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  },
  midPrice: number
): LiquidityProfile {
  const calculateDepth = (levels: typeof orderBook.bids, maxDeviation: number): number => {
    return levels
      .filter(level => Math.abs(level.price - midPrice) / midPrice <= maxDeviation)
      .reduce((sum, level) => sum + level.size, 0);
  };

  const bestBid = orderBook.bids[0]?.price || midPrice * 0.99;
  const bestAsk = orderBook.asks[0]?.price || midPrice * 1.01;
  const spreadBps = ((bestAsk - bestBid) / midPrice) * 10000;

  const bidVolume = orderBook.bids.reduce((sum, b) => sum + b.size, 0);
  const askVolume = orderBook.asks.reduce((sum, a) => sum + a.size, 0);
  const totalVolume = bidVolume + askVolume;

  return {
    platform: 'polymarket', // Parameterize as needed
    timestamp: Date.now(),
    depth10bps: calculateDepth(orderBook.bids, 0.001) + calculateDepth(orderBook.asks, 0.001),
    depth50bps: calculateDepth(orderBook.bids, 0.005) + calculateDepth(orderBook.asks, 0.005),
    depth100bps: calculateDepth(orderBook.bids, 0.01) + calculateDepth(orderBook.asks, 0.01),
    spreadBps,
    imbalance: totalVolume > 0 ? (bidVolume - askVolume) / totalVolume : 0,
    resilience: 0 // Would require time-series analysis
  };
}

/**
 * Calculate order flow imbalance
 */
export function calculateOrderFlowImbalance(
  trades: Array<{
    timestamp: number;
    side: 'buy' | 'sell';
    size: number;
    price: number;
    aggressor: 'maker' | 'taker';
  }>,
  windowMs: number = 60000
): OrderFlowImbalance {
  const now = Date.now();
  const recentTrades = trades.filter(t => now - t.timestamp <= windowMs);

  const aggressiveBuys = recentTrades
    .filter(t => t.side === 'buy' && t.aggressor === 'taker')
    .reduce((sum, t) => sum + t.size, 0);

  const aggressiveSells = recentTrades
    .filter(t => t.side === 'sell' && t.aggressor === 'taker')
    .reduce((sum, t) => sum + t.size, 0);

  const totalAggressive = aggressiveBuys + aggressiveSells;
  const netFlow = aggressiveBuys - aggressiveSells;

  let pressure: OrderFlowImbalance['pressure'] = 'neutral';
  if (netFlow > totalAggressive * 0.1) pressure = 'buy';
  else if (netFlow < -totalAggressive * 0.1) pressure = 'sell';

  return {
    timestamp: now,
    aggressiveBuyVolume: aggressiveBuys,
    aggressiveSellVolume: aggressiveSells,
    netFlow,
    pressure,
    strength: totalAggressive > 0 ? Math.abs(netFlow) / totalAggressive : 0
  };
}

/**
 * Identify support and resistance levels
 */
export function identifyKeyLevels(
  orderBook: {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  },
  threshold: number = 2.0 // Size multiplier vs average
): Array<{
  price: number;
  type: 'support' | 'resistance';
  strength: number;
  size: number;
}> {
  const avgBidSize = orderBook.bids.reduce((sum, b) => sum + b.size, 0) / orderBook.bids.length;
  const avgAskSize = orderBook.asks.reduce((sum, a) => sum + a.size, 0) / orderBook.asks.length;

  const levels: ReturnType<typeof identifyKeyLevels> = [];

  // Find support levels (large bids)
  for (const bid of orderBook.bids) {
    if (bid.size > avgBidSize * threshold) {
      levels.push({
        price: bid.price,
        type: 'support',
        strength: bid.size / avgBidSize,
        size: bid.size
      });
    }
  }

  // Find resistance levels (large asks)
  for (const ask of orderBook.asks) {
    if (ask.size > avgAskSize * threshold) {
      levels.push({
        price: ask.price,
        type: 'resistance',
        strength: ask.size / avgAskSize,
        size: ask.size
      });
    }
  }

  return levels.sort((a, b) => b.strength - a.strength);
}

/**
 * Estimate price impact of a trade
 */
export function estimatePriceImpact(
  orderBook: {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  },
  tradeSize: number,
  side: 'buy' | 'sell'
): {
  immediateImpact: number;
  totalImpact: number;
  avgExecutionPrice: number;
  slippageBps: number;
} {
  const levels = side === 'buy' ? orderBook.asks : orderBook.bids;
  const bestPrice = levels[0]?.price || 0;

  let remaining = tradeSize;
  let totalCost = 0;
  let lastPrice = bestPrice;

  for (const level of levels) {
    if (remaining <= 0) break;
    const fill = Math.min(remaining, level.size);
    totalCost += fill * level.price;
    remaining -= fill;
    lastPrice = level.price;
  }

  const filled = tradeSize - remaining;
  const avgPrice = filled > 0 ? totalCost / filled : bestPrice;
  
  const immediateImpact = (levels[1]?.price || bestPrice) - bestPrice;
  const totalImpact = lastPrice - bestPrice;
  const slippageBps = ((avgPrice - bestPrice) / bestPrice) * 10000;

  return {
    immediateImpact,
    totalImpact,
    avgExecutionPrice: avgPrice,
    slippageBps
  };
}

/**
 * Time-Weighted Average Liquidity (TWAL)
 */
export function calculateTWAL(
  snapshots: Array<{ timestamp: number; spreadBps: number; depth: number }>,
  duration: number
): {
  avgSpread: number;
  avgDepth: number;
  liquidityScore: number;
} {
  if (snapshots.length < 2) {
    return { avgSpread: 0, avgDepth: 0, liquidityScore: 0 };
  }

  let totalWeight = 0;
  let weightedSpread = 0;
  let weightedDepth = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const weight = (curr.timestamp - prev.timestamp) / duration;

    weightedSpread += curr.spreadBps * weight;
    weightedDepth += curr.depth * weight;
    totalWeight += weight;
  }

  const avgSpread = totalWeight > 0 ? weightedSpread / totalWeight : 0;
  const avgDepth = totalWeight > 0 ? weightedDepth / totalWeight : 0;

  // Liquidity score: higher depth, lower spread = better
  const liquidityScore = avgSpread > 0 ? avgDepth / avgSpread : 0;

  return { avgSpread, avgDepth, liquidityScore };
}
