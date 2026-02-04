/**
 * Latency Arbitrage Detection
 * 
 * Exploits price discrepancies caused by:
 * 1. Cross-platform latency differences
 * 2. Market data propagation delays
 * 3. Order processing speed variations
 * 
 * Strategy: Detect price leadership and predict follower movements
 */

export interface LatencyMeasurement {
  timestamp: number;
  platformA: string;
  platformB: string;
  latencyDelta: number; // A - B in milliseconds
  priceDelta: number;   // Price difference
  correlation: number;  // Lead-lag correlation
}

export interface PriceLeadership {
  leader: string;
  follower: string;
  leadTimeMs: number;
  correlation: number;
  confidence: number;
}

export interface LatencyArbitrageOpportunity {
  id: string;
  detectedAt: number;
  expiresAt: number;
  leader: string;
  follower: string;
  leaderPrice: number;
  followerPrice: number;
  predictedMove: 'up' | 'down';
  confidence: number;
  expectedProfit: number;
  executionWindow: number;
}

/**
 * Measure round-trip latency to each platform
 */
export async function measureLatency(
  platformUrl: string,
  samples: number = 10
): Promise<{
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  stdDev: number;
}> {
  const latencies: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      // Placeholder: Would make actual API call
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    } catch (error) {
      // Retry on failure
      continue;
    }
    const end = performance.now();
    latencies.push(end - start);
  }

  if (latencies.length === 0) {
    return { avgLatency: Infinity, minLatency: Infinity, maxLatency: Infinity, stdDev: 0 };
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const variance = latencies.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / latencies.length;

  return {
    avgLatency: avg,
    minLatency: min,
    maxLatency: max,
    stdDev: Math.sqrt(variance)
  };
}

/**
 * Calculate cross-correlation between two price series
 * to determine lead-lag relationship
 */
export function calculateLeadLagCorrelation(
  seriesA: Array<{ timestamp: number; price: number }>,
  seriesB: Array<{ timestamp: number; price: number }>,
  maxLag: number = 10
): PriceLeadership {
  // Normalize series
  const normalize = (series: typeof seriesA) => {
    const prices = series.map(s => s.price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const std = Math.sqrt(prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length);
    return prices.map(p => (p - mean) / std);
  };

  const normA = normalize(seriesA);
  const normB = normalize(seriesB);

  // Calculate correlation at different lags
  const correlations: Array<{ lag: number; correlation: number }> = [];

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let correlation = 0;
    let count = 0;

    for (let i = 0; i < normA.length; i++) {
      const j = i + lag;
      if (j >= 0 && j < normB.length) {
        correlation += normA[i] * normB[j];
        count++;
      }
    }

    if (count > 0) {
      correlations.push({ lag, correlation: correlation / count });
    }
  }

  // Find optimal lag
  const best = correlations.reduce((max, curr) => 
    curr.correlation > max.correlation ? curr : max
  );

  // Determine leader/follower
  if (best.lag < 0) {
    return {
      leader: 'B',
      follower: 'A',
      leadTimeMs: Math.abs(best.lag) * 1000, // Assume 1s intervals
      correlation: best.correlation,
      confidence: Math.min(1, best.correlation)
    };
  } else {
    return {
      leader: 'A',
      follower: 'B',
      leadTimeMs: best.lag * 1000,
      correlation: best.correlation,
      confidence: Math.min(1, best.correlation)
    };
  }
}

/**
 * Detect latency arbitrage opportunity
 */
export function detectLatencyArbitrage(
  leaderPrice: number,
  followerPrice: number,
  priceHistory: Array<{
    timestamp: number;
    leaderPrice: number;
    followerPrice: number;
  }>,
  leadership: PriceLeadership
): LatencyArbitrageOpportunity | null {
  const priceDiff = leaderPrice - followerPrice;
  const threshold = leaderPrice * 0.001; // 0.1% threshold

  // Check if price difference is significant
  if (Math.abs(priceDiff) < threshold) {
    return null;
  }

  // Predict follower movement based on historical correlation
  const recentChanges = priceHistory.slice(-5);
  const leaderMomentum = recentChanges.length > 1
    ? (recentChanges[recentChanges.length - 1].leaderPrice - recentChanges[0].leaderPrice) / recentChanges[0].leaderPrice
    : 0;

  const predictedMove: 'up' | 'down' = leaderMomentum > 0 ? 'up' : 'down';
  
  // Calculate confidence based on historical accuracy
  let correctPredictions = 0;
  for (let i = 5; i < priceHistory.length; i++) {
    const pastLeaderChange = priceHistory[i].leaderPrice - priceHistory[i - 1].leaderPrice;
    const pastFollowerChange = priceHistory[i].followerPrice - priceHistory[i - 1].followerPrice;
    
    if ((pastLeaderChange > 0 && pastFollowerChange > 0) || 
        (pastLeaderChange < 0 && pastFollowerChange < 0)) {
      correctPredictions++;
    }
  }
  
  const accuracy = priceHistory.length > 5 ? correctPredictions / (priceHistory.length - 5) : 0.5;
  const confidence = accuracy * leadership.confidence;

  // Only trade on high confidence
  if (confidence < 0.7) {
    return null;
  }

  const expectedProfit = Math.abs(priceDiff) * confidence;
  const executionWindow = leadership.leadTimeMs * 0.8; // 80% of lead time

  return {
    id: `LAT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    detectedAt: Date.now(),
    expiresAt: Date.now() + executionWindow,
    leader: leadership.leader,
    follower: leadership.follower,
    leaderPrice,
    followerPrice,
    predictedMove,
    confidence,
    expectedProfit,
    executionWindow
  };
}

/**
 * Monitor for latency-based opportunities in real-time
 */
export class LatencyArbitrageMonitor {
  private priceHistory: Map<string, Array<{ timestamp: number; price: number }>> = new Map();
  private leadership: PriceLeadership | null = null;
  private callbacks: Array<(opportunity: LatencyArbitrageOpportunity) => void> = [];

  addPriceUpdate(platform: string, price: number): void {
    if (!this.priceHistory.has(platform)) {
      this.priceHistory.set(platform, []);
    }

    const history = this.priceHistory.get(platform)!;
    history.push({ timestamp: Date.now(), price });

    // Keep last 100 samples
    if (history.length > 100) {
      history.shift();
    }

    // Check for opportunities if we have data from multiple platforms
    this.checkForOpportunities();
  }

  private checkForOpportunities(): void {
    const platforms = Array.from(this.priceHistory.keys());
    if (platforms.length < 2) return;

    const [platformA, platformB] = platforms;
    const historyA = this.priceHistory.get(platformA)!;
    const historyB = this.priceHistory.get(platformB)!;

    if (historyA.length < 20 || historyB.length < 20) return;

    // Update leadership detection periodically
    if (!this.leadership || Date.now() % 30000 < 1000) {
      this.leadership = calculateLeadLagCorrelation(historyA, historyB);
    }

    const latestA = historyA[historyA.length - 1];
    const latestB = historyB[historyB.length - 1];

    // Build combined history for prediction
    const combinedHistory: Array<{ timestamp: number; leaderPrice: number; followerPrice: number }> = [];
    for (let i = 0; i < Math.min(historyA.length, historyB.length); i++) {
      combinedHistory.push({
        timestamp: historyA[i].timestamp,
        leaderPrice: this.leadership?.leader === 'A' ? historyA[i].price : historyB[i].price,
        followerPrice: this.leadership?.leader === 'A' ? historyB[i].price : historyA[i].price
      });
    }

    const opportunity = detectLatencyArbitrage(
      this.leadership?.leader === 'A' ? latestA.price : latestB.price,
      this.leadership?.follower === 'A' ? latestA.price : latestB.price,
      combinedHistory,
      this.leadership!
    );

    if (opportunity) {
      this.callbacks.forEach(cb => cb(opportunity));
    }
  }

  onOpportunity(callback: (opportunity: LatencyArbitrageOpportunity) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) this.callbacks.splice(index, 1);
    };
  }
}

/**
 * Calculate optimal pre-positioning strategy
 */
export function calculatePrePosition(
  opportunity: LatencyArbitrageOpportunity,
  availableCapital: number,
  riskFactor: number = 0.5
): {
  position: 'long' | 'short';
  size: number;
  entryPrice: number;
  exitPrice: number;
  expectedProfit: number;
} {
  const position = opportunity.predictedMove === 'up' ? 'long' : 'short';
  
  // Size based on confidence and risk factor
  const baseSize = availableCapital * riskFactor * opportunity.confidence;
  
  // Account for execution risk (may not get the predicted move)
  const executionRisk = 0.3;
  const size = baseSize * (1 - executionRisk);

  return {
    position,
    size,
    entryPrice: opportunity.followerPrice,
    exitPrice: opportunity.leaderPrice,
    expectedProfit: size * opportunity.expectedProfit * opportunity.confidence
  };
}
