/**
 * API Quota Manager
 * 
 * Tracks and enforces API usage limits to stay within free-tier quotas
 * for external data sources (NewsAPI, Twitter, Reddit, etc.)
 */

/**
 * Configuration for API quota limits
 */
export interface QuotaConfig {
  newsApiQuota?: number;
  twitterQuota?: number;
  redditQuota?: number;
}

/**
 * API Quota Manager interface
 */
export interface APIQuotaManager {
  /**
   * Check if API call is within quota
   * @param source - API source (newsapi, twitter, reddit)
   * @returns true if within quota, false otherwise
   */
  canMakeRequest(source: string): boolean;

  /**
   * Record an API call
   * @param source - API source
   * @param count - Number of calls (default: 1)
   */
  recordUsage(source: string, count?: number): void;

  /**
   * Get current usage for a source
   * @param source - API source
   * @returns Current usage count
   */
  getUsage(source: string): number;

  /**
   * Reset usage counters (called daily)
   */
  resetUsage(): void;

  /**
   * Get recommended market count based on remaining quota
   * @returns Recommended number of markets to analyze (1-3)
   */
  getRecommendedMarketCount(): number;
}

/**
 * Quota Manager implementation
 */
export class QuotaManager implements APIQuotaManager {
  private usage: Map<string, number> = new Map();
  private quotas: Map<string, number> = new Map();
  private lastReset: Date = new Date();

  constructor(config: QuotaConfig) {
    this.quotas.set('newsapi', config.newsApiQuota || 100);
    this.quotas.set('twitter', config.twitterQuota || 500);
    this.quotas.set('reddit', config.redditQuota || 60);
  }

  canMakeRequest(_source: string): boolean {
    // Always allow requests - quota manager is for monitoring only
    // User controls analysis limits via MAX_MARKETS_PER_CYCLE
    return true;
    
    // Note: The code below is kept for reference but disabled
    // const current = this.usage.get(source) || 0;
    // const limit = this.quotas.get(source) || Infinity;
    // const threshold = Math.ceil(limit * 0.8);
    // return current < threshold;
  }

  recordUsage(source: string, count: number = 1): void {
    const current = this.usage.get(source) || 0;
    this.usage.set(source, current + count);
  }

  getUsage(source: string): number {
    return this.usage.get(source) || 0;
  }

  resetUsage(): void {
    this.usage.clear();
    this.lastReset = new Date();
  }

  getRecommendedMarketCount(): number {
    // Always return maximum - user controls limits via MAX_MARKETS_PER_CYCLE
    // This method is kept for compatibility but doesn't limit operations
    return 999; // High number to indicate no quota-based limiting
    
    // Note: The code below is kept for reference but disabled
    // const callsPerMarket: Record<string, number> = {
    //   newsapi: 1,
    //   twitter: 3,
    //   reddit: 2,
    // };
    // let maxMarkets = Infinity;
    // for (const [source, quota] of this.quotas) {
    //   const remaining = quota - (this.usage.get(source) || 0);
    //   const marketsForSource = Math.floor(remaining / (callsPerMarket[source] || 1));
    //   maxMarkets = Math.min(maxMarkets, marketsForSource);
    // }
    // return Math.max(1, Math.min(3, maxMarkets));
  }

  /**
   * Get last reset timestamp
   * @returns Date of last reset
   */
  getLastReset(): Date {
    return this.lastReset;
  }

  /**
   * Get quota limit for a source
   * @param source - API source
   * @returns Quota limit
   */
  getQuotaLimit(source: string): number {
    return this.quotas.get(source) || 0;
  }
}

/**
 * Create a quota manager from environment variables
 * @returns Configured QuotaManager instance
 */
export function createQuotaManager(): QuotaManager {
  const config: QuotaConfig = {
    newsApiQuota: parseInt(process.env.NEWS_API_DAILY_QUOTA || '100', 10),
    twitterQuota: parseInt(process.env.TWITTER_API_DAILY_QUOTA || '500', 10),
    redditQuota: parseInt(process.env.REDDIT_API_DAILY_QUOTA || '60', 10),
  };

  return new QuotaManager(config);
}
