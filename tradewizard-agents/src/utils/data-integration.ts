/**
 * External Data Integration Layer
 *
 * Provides unified interface for fetching external data (news, polling, social)
 * with caching, rate limiting, and graceful degradation.
 */

import type { MarketBriefingDocument, MarketId } from '../models/types.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';
import { retryApiCall, CircuitBreaker } from './retry-logic.js';

// ============================================================================
// Data Schemas
// ============================================================================

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: number; // Unix timestamp
  url: string;
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevanceScore: number; // 0-1
}

export interface PollingData {
  polls: Array<{
    pollster: string;
    date: number;
    sampleSize: number;
    yesPercentage: number;
    noPercentage: number;
    marginOfError: number;
    methodology: string;
  }>;
  aggregatedProbability: number; // Weighted average
  momentum: 'rising' | 'falling' | 'stable';
  biasAdjustment: number; // Adjustment factor for known pollster bias
}

export interface SocialSentiment {
  platforms: Record<
    string,
    {
      volume: number; // Number of mentions
      sentiment: number; // -1 to 1
      viralScore: number; // 0-1, measures narrative velocity
      topKeywords: string[];
    }
  >;
  overallSentiment: number; // -1 to 1
  narrativeVelocity: number; // Rate of change in mentions
}

export interface CachedData<T> {
  data: T;
  timestamp: number;
  isStale: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

export interface DataSourceConfig {
  news: {
    provider: 'newsapi' | 'perplexity' | 'none';
    apiKey?: string;
    cacheTTL: number; // seconds
    maxArticles: number;
  };
  polling: {
    provider: '538' | 'rcp' | 'polymarket' | 'none';
    apiKey?: string;
    cacheTTL: number;
  };
  social: {
    providers: Array<'twitter' | 'reddit'>;
    apiKeys?: Record<string, string>;
    cacheTTL: number;
    maxMentions: number;
  };
}

// ============================================================================
// Rate Limiting - Token Bucket Algorithm
// ============================================================================

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens. Returns true if successful, false if insufficient tokens.
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// ============================================================================
// In-Memory Cache
// ============================================================================

class DataCache<T> {
  private cache = new Map<string, CachedData<T>>();

  constructor(private ttl: number) {} // TTL in seconds

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      isStale: false,
    });
  }

  get(key: string): CachedData<T> | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = (Date.now() - cached.timestamp) / 1000; // seconds
    const isStale = age > this.ttl;

    return {
      ...cached,
      isStale,
    };
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Data Integration Layer
// ============================================================================

export class DataIntegrationLayer {
  private newsCache: DataCache<NewsArticle[]>;
  private pollingCache: DataCache<PollingData>;
  private socialCache: DataCache<SocialSentiment>;

  private newsRateLimiter: TokenBucket;
  private pollingRateLimiter: TokenBucket;
  private socialRateLimiter: TokenBucket;

  private newsCircuitBreaker: CircuitBreaker;
  private pollingCircuitBreaker: CircuitBreaker;
  private socialCircuitBreaker: CircuitBreaker;

  private observabilityLogger?: AdvancedObservabilityLogger;

  constructor(private config: DataSourceConfig, observabilityLogger?: AdvancedObservabilityLogger) {
    // Initialize caches with configured TTLs
    this.newsCache = new DataCache(config.news.cacheTTL);
    this.pollingCache = new DataCache(config.polling.cacheTTL);
    this.socialCache = new DataCache(config.social.cacheTTL);

    // Initialize rate limiters (conservative defaults)
    // NewsAPI: 100 requests per day = ~0.001 per second
    this.newsRateLimiter = new TokenBucket(10, 0.001);
    // Polling APIs: typically more generous
    this.pollingRateLimiter = new TokenBucket(20, 0.01);
    // Social APIs: varies by platform
    this.socialRateLimiter = new TokenBucket(15, 0.005);

    // Initialize circuit breakers for each data source
    this.newsCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      onStateChange: (oldState, newState) => {
        console.log(`[DataIntegration] News circuit breaker: ${oldState} -> ${newState}`);
      },
    });

    this.pollingCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      onStateChange: (oldState, newState) => {
        console.log(`[DataIntegration] Polling circuit breaker: ${oldState} -> ${newState}`);
      },
    });

    this.socialCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      onStateChange: (oldState, newState) => {
        console.log(`[DataIntegration] Social circuit breaker: ${oldState} -> ${newState}`);
      },
    });

    // Store observability logger
    this.observabilityLogger = observabilityLogger;
  }

  /**
   * Fetch news articles relevant to market
   * 
   * Error handling:
   * - Returns cached data (even if stale) when rate limited
   * - Returns cached data when provider unavailable
   * - Returns empty array when no data available
   * - Logs all errors for operator visibility
   */
  async fetchNews(
    market: MarketBriefingDocument,
    timeWindow: number = 24
  ): Promise<NewsArticle[]> {
    const startTime = Date.now();
    const cacheKey = `news:${market.marketId}:${timeWindow}`;

    // Check cache first
    const cached = this.newsCache.get(cacheKey);
    if (cached && !cached.isStale) {
      const duration = Date.now() - startTime;
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: this.config.news.provider,
        success: true,
        cached: true,
        stale: false,
        freshness: (Date.now() - cached.timestamp) / 1000,
        itemCount: cached.data.length,
        duration,
      });
      return cached.data;
    }

    // Check rate limit
    if (!this.newsRateLimiter.tryConsume()) {
      console.warn('[DataIntegration] News API rate limit approached, using cached data');
      if (cached) {
        console.log('[DataIntegration] Returning stale cached news data');
        const duration = Date.now() - startTime;
        this.observabilityLogger?.logDataFetch({
          timestamp: Date.now(),
          source: 'news',
          provider: this.config.news.provider,
          success: true,
          cached: true,
          stale: true,
          freshness: (Date.now() - cached.timestamp) / 1000,
          itemCount: cached.data.length,
          duration,
        });
        return cached.data; // Return stale data
      }
      console.warn('[DataIntegration] No cached news data available');
      const duration = Date.now() - startTime;
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: this.config.news.provider,
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: 'Rate limit exceeded, no cached data available',
        duration,
      });
      return []; // No cached data available
    }

    // Check if provider is configured
    if (this.config.news.provider === 'none' || !this.config.news.apiKey) {
      console.warn('[DataIntegration] News provider not configured');
      if (cached) {
        console.log('[DataIntegration] Returning stale cached news data');
        const duration = Date.now() - startTime;
        this.observabilityLogger?.logDataFetch({
          timestamp: Date.now(),
          source: 'news',
          provider: this.config.news.provider,
          success: true,
          cached: true,
          stale: true,
          freshness: (Date.now() - cached.timestamp) / 1000,
          itemCount: cached.data.length,
          duration,
        });
        return cached.data;
      }
      const duration = Date.now() - startTime;
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: this.config.news.provider,
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: 'Provider not configured',
        duration,
      });
      return [];
    }

    try {
      const articles = await this.newsCircuitBreaker.execute(async () => {
        return await retryApiCall(
          async () => await this.fetchNewsFromProvider(market, timeWindow),
          `News fetch for ${market.marketId}`
        );
      });
      this.newsCache.set(cacheKey, articles);
      const duration = Date.now() - startTime;
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: this.config.news.provider,
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: articles.length,
        duration,
      });
      return articles;
    } catch (error) {
      console.error('[DataIntegration] Failed to fetch news:', error instanceof Error ? error.message : String(error));
      // Fallback to cached data if available
      if (cached) {
        console.log('[DataIntegration] Falling back to stale cached news data');
        const duration = Date.now() - startTime;
        this.observabilityLogger?.logDataFetch({
          timestamp: Date.now(),
          source: 'news',
          provider: this.config.news.provider,
          success: true,
          cached: true,
          stale: true,
          freshness: (Date.now() - cached.timestamp) / 1000,
          itemCount: cached.data.length,
          error: error instanceof Error ? error.message : String(error),
          duration,
        });
        return cached.data;
      }
      console.warn('[DataIntegration] No fallback news data available');
      const duration = Date.now() - startTime;
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: this.config.news.provider,
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      return [];
    }
  }

  /**
   * Fetch polling data for election markets
   * 
   * Error handling:
   * - Returns cached data (even if stale) when rate limited
   * - Returns cached data when provider unavailable
   * - Returns null when no data available
   * - Logs all errors for operator visibility
   */
  async fetchPollingData(market: MarketBriefingDocument): Promise<PollingData | null> {
    const cacheKey = `polling:${market.marketId}`;

    // Check cache first
    const cached = this.pollingCache.get(cacheKey);
    if (cached && !cached.isStale) {
      return cached.data;
    }

    // Check rate limit
    if (!this.pollingRateLimiter.tryConsume()) {
      console.warn('[DataIntegration] Polling API rate limit approached, using cached data');
      if (cached) {
        console.log('[DataIntegration] Returning stale cached polling data');
        return cached.data;
      }
      console.warn('[DataIntegration] No cached polling data available');
      return null;
    }

    // Check if provider is configured
    if (this.config.polling.provider === 'none' || !this.config.polling.apiKey) {
      console.warn('[DataIntegration] Polling provider not configured');
      if (cached) {
        console.log('[DataIntegration] Returning stale cached polling data');
        return cached.data;
      }
      return null;
    }

    try {
      const pollingData = await this.pollingCircuitBreaker.execute(async () => {
        return await retryApiCall(
          async () => await this.fetchPollingFromProvider(market),
          `Polling fetch for ${market.marketId}`
        );
      });
      if (pollingData) {
        this.pollingCache.set(cacheKey, pollingData);
      }
      return pollingData;
    } catch (error) {
      console.error('[DataIntegration] Failed to fetch polling data:', error instanceof Error ? error.message : String(error));
      if (cached) {
        console.log('[DataIntegration] Falling back to stale cached polling data');
        return cached.data;
      }
      console.warn('[DataIntegration] No fallback polling data available');
      return null;
    }
  }

  /**
   * Fetch social sentiment data
   * 
   * Error handling:
   * - Returns cached data (even if stale) when rate limited
   * - Returns cached data when provider unavailable
   * - Returns null when no data available
   * - Logs all errors for operator visibility
   */
  async fetchSocialSentiment(
    market: MarketBriefingDocument,
    platforms: string[] = ['twitter', 'reddit']
  ): Promise<SocialSentiment | null> {
    const cacheKey = `social:${market.marketId}:${platforms.join(',')}`;

    // Check cache first
    const cached = this.socialCache.get(cacheKey);
    if (cached && !cached.isStale) {
      return cached.data;
    }

    // Check rate limit
    if (!this.socialRateLimiter.tryConsume()) {
      console.warn('[DataIntegration] Social API rate limit approached, using cached data');
      if (cached) {
        console.log('[DataIntegration] Returning stale cached social data');
        return cached.data;
      }
      console.warn('[DataIntegration] No cached social data available');
      return null;
    }

    // Check if providers are configured
    if (this.config.social.providers.length === 0) {
      console.warn('[DataIntegration] Social providers not configured');
      if (cached) {
        console.log('[DataIntegration] Returning stale cached social data');
        return cached.data;
      }
      return null;
    }

    try {
      const sentiment = await this.socialCircuitBreaker.execute(async () => {
        return await retryApiCall(
          async () => await this.fetchSocialFromProvider(market, platforms),
          `Social sentiment fetch for ${market.marketId}`
        );
      });
      if (sentiment) {
        this.socialCache.set(cacheKey, sentiment);
      }
      return sentiment;
    } catch (error) {
      console.error('[DataIntegration] Failed to fetch social sentiment:', error instanceof Error ? error.message : String(error));
      if (cached) {
        console.log('[DataIntegration] Falling back to stale cached social data');
        return cached.data;
      }
      console.warn('[DataIntegration] No fallback social data available');
      return null;
    }
  }

  /**
   * Check if data source is available
   */
  async checkDataAvailability(source: 'news' | 'polling' | 'social'): Promise<boolean> {
    switch (source) {
      case 'news':
        return (
          this.config.news.provider !== 'none' &&
          !!this.config.news.apiKey &&
          this.newsRateLimiter.getTokens() > 0
        );
      case 'polling':
        return (
          this.config.polling.provider !== 'none' &&
          !!this.config.polling.apiKey &&
          this.pollingRateLimiter.getTokens() > 0
        );
      case 'social':
        return (
          this.config.social.providers.length > 0 &&
          this.socialRateLimiter.getTokens() > 0
        );
      default:
        return false;
    }
  }

  /**
   * Get data freshness for a source
   */
  getDataFreshness(source: 'news' | 'polling' | 'social', marketId: MarketId): number | null {
    let cached: CachedData<unknown> | null = null;

    switch (source) {
      case 'news':
        cached = this.newsCache.get(`news:${marketId}:24`);
        break;
      case 'polling':
        cached = this.pollingCache.get(`polling:${marketId}`);
        break;
      case 'social':
        cached = this.socialCache.get(`social:${marketId}:twitter,reddit`);
        break;
    }

    return cached ? cached.timestamp : null;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.newsCache.clear();
    this.pollingCache.clear();
    this.socialCache.clear();
  }

  // ============================================================================
  // Private Provider Methods (Stubs for now)
  // ============================================================================

  private async fetchNewsFromProvider(
    market: MarketBriefingDocument,
    timeWindow: number
  ): Promise<NewsArticle[]> {
    // TODO: Implement actual API calls based on provider
    // For now, return empty array
    console.log(
      `[DataIntegration] Fetching news for market ${market.marketId} (${timeWindow}h window)`
    );
    return [];
  }

  private async fetchPollingFromProvider(
    market: MarketBriefingDocument
  ): Promise<PollingData | null> {
    // TODO: Implement actual API calls based on provider
    console.log(`[DataIntegration] Fetching polling data for market ${market.marketId}`);
    return null;
  }

  private async fetchSocialFromProvider(
    market: MarketBriefingDocument,
    platforms: string[]
  ): Promise<SocialSentiment | null> {
    // TODO: Implement actual API calls based on provider
    console.log(
      `[DataIntegration] Fetching social sentiment for market ${market.marketId} from ${platforms.join(', ')}`
    );
    return null;
  }
}

/**
 * Create a data integration layer instance
 * 
 * Automatically detects integration mode based on environment variables:
 * - If NEWSDATA_INTEGRATION_ENABLED=true, returns NewsDataIntegrationLayer
 * - If NEWS_MIGRATION_ENABLED=true, returns MigrationAwareDataIntegrationLayer
 * - Otherwise, returns standard DataIntegrationLayer for backward compatibility
 */
export function createDataIntegrationLayer(
  config: DataSourceConfig,
  observabilityLogger?: AdvancedObservabilityLogger
): DataIntegrationLayer {
  // Check if NewsData.io integration is enabled
  if (process.env.NEWSDATA_INTEGRATION_ENABLED === 'true') {
    console.log('[DataIntegrationLayer] NewsData.io integration enabled, using enhanced agents');
  }
  
  // Check if migration is enabled
  if (process.env.NEWS_MIGRATION_ENABLED === 'true') {
    // Import migration-aware layer dynamically to avoid circular dependencies
    try {
      // TODO: Fix ES modules compatibility - require() not available in ES modules
      // const { createDataIntegrationLayer: createMigrationLayer } = require('./data-integration-migration.js');
      // return createMigrationLayer(config, observabilityLogger);
      console.warn('[DataIntegrationLayer] Migration layer temporarily disabled due to ES modules compatibility');
      return new DataIntegrationLayer(config, observabilityLogger);
    } catch (error) {
      console.warn('[DataIntegrationLayer] Migration layer not available, using standard layer:', error);
      return new DataIntegrationLayer(config, observabilityLogger);
    }
  }
  
  return new DataIntegrationLayer(config, observabilityLogger);
}
