/**
 * Polymarket API Client
 *
 * This module provides a wrapper around Polymarket's Gamma API and CLOB API
 * with built-in rate limiting, retry logic, exponential backoff, and circuit breaker.
 * Enhanced with event-based analysis using proper Gamma API events endpoint integration.
 */

import type { EngineConfig } from '../config/index.js';
import type { IngestionError, MarketBriefingDocument } from '../models/types.js';
import { 
  EnhancedEventPolymarketClient,
  type PolymarketEvent,
  type EventDiscoveryOptions,
  type RankedEvent,
  type EventWithMarkets,
  type ApiHealthStatus,
  type RateLimitStatus
} from './enhanced-event-polymarket-client.js';
import { EnhancedEventBriefingGenerator } from './enhanced-event-briefing-generator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw market data from Polymarket Gamma API
 */
interface GammaMarketData {
  condition_id: string;
  question: string;
  description: string;
  end_date_iso: string;
  game_start_time: string;
  question_id: string;
  market_slug: string;
  outcomes: string[];
  outcome_prices: string[];
  volume: string;
  liquidity: string;
  [key: string]: unknown;
}

/**
 * Order book data from Polymarket CLOB API
 */
interface OrderBookData {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: number;
  [key: string]: unknown;
}

/**
 * Circuit breaker state
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Rate limiter state
 */
interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

// ============================================================================
// Polymarket API Client
// ============================================================================

export class PolymarketClient {
  private readonly gammaApiUrl: string;
  private readonly clobApiUrl: string;
  private readonly rateLimitBuffer: number;
  private readonly enhancedEventClient: EnhancedEventPolymarketClient;
  private readonly eventBriefingGenerator: EnhancedEventBriefingGenerator;

  // Circuit breaker state
  private circuitState: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private totalCalls = 0; // Track total calls for enhanced status
  private readonly failureThreshold = 5;
  private readonly resetTimeout = 60000; // 60 seconds

  // Rate limiter state (token bucket algorithm)
  private rateLimiter: RateLimiterState = {
    tokens: 100,
    lastRefill: Date.now(),
    maxTokens: 100,
    refillRate: 10, // 10 requests per second
  };

  constructor(config: EngineConfig['polymarket']) {
    this.gammaApiUrl = config.gammaApiUrl;
    this.clobApiUrl = config.clobApiUrl;
    this.rateLimitBuffer = config.rateLimitBuffer;
    
    // Initialize enhanced event client and briefing generator
    this.enhancedEventClient = new EnhancedEventPolymarketClient(config);
    this.eventBriefingGenerator = new EnhancedEventBriefingGenerator({
      keywordExtractionMode: config.keywordExtractionMode || 'event_priority',
    });
  }

  // ==========================================================================
  // Enhanced Event-Based API Methods
  // ==========================================================================

  /**
   * Discover trending political events using enhanced event-based analysis
   * Implements Requirements 4.1, 4.2 with comprehensive event discovery and ranking
   * @param limit - Maximum number of events to return
   * @returns Array of ranked events with trending scores and analysis
   */
  async discoverTrendingPoliticalEvents(limit: number = 20): Promise<RankedEvent[]> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return [];
    }

    // Wait for rate limit
    await this.waitForRateLimit();

    try {
      const rankedEvents = await this.enhancedEventClient.discoverTrendingPoliticalEvents(limit);
      
      // Reset circuit breaker on success
      this.onSuccess();
      
      return rankedEvents;
    } catch (error) {
      // Record failure for circuit breaker
      this.onFailure();
      
      // Return empty array on error to maintain graceful degradation
      return [];
    }
  }

  /**
   * Discover political events with enhanced filtering options
   * Implements Requirements 4.1, 4.2 with comprehensive event discovery
   * @param options - Event discovery options including date ranges and filtering
   * @returns Array of political events matching criteria
   */
  async discoverPoliticalEvents(options: EventDiscoveryOptions = {}): Promise<PolymarketEvent[]> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return [];
    }

    // Wait for rate limit
    await this.waitForRateLimit();

    try {
      const events = await this.enhancedEventClient.discoverPoliticalEvents(options);
      
      // Reset circuit breaker on success
      this.onSuccess();
      
      return events;
    } catch (error) {
      // Record failure for circuit breaker
      this.onFailure();
      
      // Return empty array on error to maintain graceful degradation
      return [];
    }
  }

  /**
   * Fetch event details with all nested markets using enhanced event client
   * Implements Requirements 4.1, 4.2 with comprehensive event data retrieval
   * @param eventId - Polymarket event ID
   * @returns Event with all nested markets and metadata
   */
  async fetchEventDetails(eventId: string): Promise<PolymarketEvent | null> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return null;
    }

    // Wait for rate limit
    await this.waitForRateLimit();

    try {
      const event = await this.enhancedEventClient.fetchEventDetails(eventId);
      
      // Reset circuit breaker on success
      this.onSuccess();
      
      return event;
    } catch (error) {
      // Record failure for circuit breaker
      this.onFailure();
      
      // Return null on error to maintain graceful degradation
      return null;
    }
  }

  /**
   * Fetch event with enhanced market analysis including correlations
   * Implements Requirements 4.1, 4.2 with cross-market analysis
   * @param eventId - Polymarket event ID
   * @returns Event with enhanced market analysis
   */
  async fetchEventWithAllMarkets(eventId: string): Promise<EventWithMarkets | null> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return null;
    }

    // Wait for rate limit
    await this.waitForRateLimit();

    try {
      const eventWithMarkets = await this.enhancedEventClient.fetchEventWithAllMarkets(eventId);
      
      // Reset circuit breaker on success
      this.onSuccess();
      
      return eventWithMarkets;
    } catch (error) {
      // Record failure for circuit breaker
      this.onFailure();
      
      // Return null on error to maintain graceful degradation
      return null;
    }
  }

  /**
   * Fetch multiple events in batch with enhanced error handling
   * Implements Requirements 4.3, 4.4 with batch processing and resilience
   * @param eventIds - Array of event IDs to fetch
   * @param options - Batch processing options
   * @returns Array of successfully fetched events
   */
  async fetchEventsBatch(
    eventIds: string[], 
    options: {
      includeMarkets?: boolean;
      batchSize?: number;
      maxConcurrency?: number;
      includeAnalysis?: boolean;
    } = {}
  ): Promise<PolymarketEvent[]> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return [];
    }

    try {
      const events = await this.enhancedEventClient.fetchEventsBatch(eventIds, options);
      
      // Reset circuit breaker on success
      this.onSuccess();
      
      return events;
    } catch (error) {
      // Record failure for circuit breaker
      this.onFailure();
      
      // Return empty array on error to maintain graceful degradation
      return [];
    }
  }

  /**
   * Check enhanced events API health with comprehensive diagnostics
   * Implements Requirements 4.3, 4.4 with health monitoring
   * @returns API health status with response time and availability
   */
  async checkEventsApiHealth(): Promise<ApiHealthStatus> {
    try {
      return await this.enhancedEventClient.checkEventsApiHealth();
    } catch (error) {
      return {
        healthy: false,
        responseTime: 0,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get enhanced rate limit status from event client
   * Implements Requirements 4.3, 4.4 with rate limit monitoring
   * @returns Current rate limit status and usage metrics
   */
  getEventsApiRateLimitStatus(): RateLimitStatus {
    return this.enhancedEventClient.getRateLimitStatus();
  }

  /**
   * Fetch market data for a given condition ID with enhanced event-based analysis
   * Enhanced to use event-based analysis when available, falling back to traditional market analysis
   * Implements Requirements 4.1, 4.2 with event-centric approach
   * @param conditionId - Polymarket condition ID
   * @returns Market briefing document or error
   */
  async fetchMarketData(
    conditionId: string
  ): Promise<{ ok: true; data: MarketBriefingDocument } | { ok: false; error: IngestionError }> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return {
        ok: false,
        error: {
          type: 'API_UNAVAILABLE',
          message: 'Circuit breaker is OPEN. API is temporarily unavailable.',
        },
      };
    }

    // Wait for rate limit
    await this.waitForRateLimit();

    try {
      // First, try to find the event containing this market for enhanced analysis
      const event = await this.findEventByMarketCondition(conditionId);
      
      if (event) {
        // Use enhanced event-based briefing generation
        const enhancedBriefing = await this.eventBriefingGenerator.generateEventBriefing(event, conditionId);
        
        // Reset circuit breaker on success
        this.onSuccess();
        
        return { ok: true, data: enhancedBriefing };
      } else {
        // Fall back to traditional market analysis if event not found
        return this.fetchTraditionalMarketData(conditionId);
      }
    } catch (error) {
      // Record failure for circuit breaker
      this.onFailure();

      // Try fallback to traditional market analysis
      try {
        return this.fetchTraditionalMarketData(conditionId);
      } catch (fallbackError) {
        // Determine error type
        if (error instanceof Error) {
          if (error.message.includes('rate limit')) {
            return {
              ok: false,
              error: {
                type: 'RATE_LIMIT_EXCEEDED',
                retryAfter: 60, // seconds
              },
            };
          }
          if (error.message.includes('404') || error.message.includes('not found')) {
            return {
              ok: false,
              error: {
                type: 'INVALID_MARKET_ID',
                marketId: conditionId,
              },
            };
          }
          return {
            ok: false,
            error: {
              type: 'API_UNAVAILABLE',
              message: error.message,
            },
          };
        }

        return {
          ok: false,
          error: {
            type: 'API_UNAVAILABLE',
            message: 'Unknown error occurred',
          },
        };
      }
    }
  }

  /**
   * Traditional market data fetching (fallback method)
   * Maintains backward compatibility with existing market-only approach
   * @param conditionId - Polymarket condition ID
   * @returns Market briefing document or error
   */
  private async fetchTraditionalMarketData(
    conditionId: string
  ): Promise<{ ok: true; data: MarketBriefingDocument } | { ok: false; error: IngestionError }> {
    try {
      // Fetch market data with retry logic from CLOB API (supports condition ID)
      const marketData = await this.fetchWithRetry<any>(
        `${this.clobApiUrl}/markets/${conditionId}`,
        3
      );

      // Create a mock order book from token prices (CLOB API provides current prices)
      const yesToken = marketData.tokens?.find((t: any) => t.outcome === 'Yes');
      const noToken = marketData.tokens?.find((t: any) => t.outcome === 'No');
      
      if (!yesToken || !noToken) {
        throw new Error('Market tokens not found');
      }

      // Create mock order book with current prices
      const orderBook = {
        market: conditionId,
        asset_id: yesToken.token_id,
        bids: [{ price: (yesToken.price * 0.99).toString(), size: '100' }], // Slightly below current price
        asks: [{ price: (yesToken.price * 1.01).toString(), size: '100' }], // Slightly above current price
        timestamp: Date.now(),
      };

      // Transform to MBD
      const mbd = this.transformToMBD(conditionId, marketData, orderBook);

      // Reset circuit breaker on success
      this.onSuccess();

      return { ok: true, data: mbd };
    } catch (error) {
      throw error; // Re-throw to be handled by caller
    }
  }

  /**
   * Fetch enhanced market data using event-based analysis
   * Implements Requirements 5.1, 5.2, 5.3 for event-based market briefing generation
   * @param conditionId - Polymarket condition ID
   * @param useEventAnalysis - Whether to use event-based analysis (default: true)
   * @returns Enhanced market briefing document with event-level analysis or error
   */
  async fetchEnhancedMarketData(
    conditionId: string,
    useEventAnalysis: boolean = true
  ): Promise<{ ok: true; data: MarketBriefingDocument } | { ok: false; error: IngestionError }> {
    if (!useEventAnalysis) {
      // Fall back to traditional market-only analysis
      return this.fetchMarketData(conditionId);
    }

    try {
      // First, try to find the event containing this market
      const event = await this.findEventByMarketCondition(conditionId);
      
      if (event) {
        // Generate enhanced event-based briefing
        const enhancedBriefing = await this.eventBriefingGenerator.generateEventBriefing(event, conditionId);
        return { ok: true, data: enhancedBriefing };
      } else {
        // Fall back to traditional market analysis if event not found
        return this.fetchMarketData(conditionId);
      }
    } catch (error) {
      // Fall back to traditional analysis on error
      console.warn(`Event-based analysis failed for ${conditionId}, falling back to traditional analysis:`, error);
      return this.fetchMarketData(conditionId);
    }
  }

  /**
   * Fetch multiple enhanced market briefings from a single event
   * @param eventId - Polymarket event ID
   * @returns Array of enhanced market briefing documents
   */
  async fetchEventMarketBriefings(
    eventId: string
  ): Promise<{ ok: true; data: MarketBriefingDocument[] } | { ok: false; error: IngestionError }> {
    try {
      const event = await this.enhancedEventClient.fetchEventDetails(eventId);
      const briefings = await this.eventBriefingGenerator.generateMultiMarketBriefings(event);
      
      return { ok: true, data: briefings };
    } catch (error) {
      return {
        ok: false,
        error: {
          type: 'INVALID_EVENT_ID',
          eventId,
        },
      };
    }
  }

  /**
   * Discover trending political events and generate briefings
   * @param limit - Maximum number of events to analyze
   * @returns Array of enhanced market briefing documents from trending events
   */
  async fetchTrendingPoliticalBriefings(
    limit: number = 10
  ): Promise<{ ok: true; data: MarketBriefingDocument[] } | { ok: false; error: IngestionError }> {
    try {
      const rankedEvents = await this.enhancedEventClient.discoverTrendingPoliticalEvents(limit);
      const allBriefings: MarketBriefingDocument[] = [];
      
      for (const rankedEvent of rankedEvents) {
        try {
          // Generate briefing for the dominant market in each event
          const briefing = await this.eventBriefingGenerator.generateEventBriefing(rankedEvent.event);
          allBriefings.push(briefing);
        } catch (error) {
          console.warn(`Failed to generate briefing for event ${rankedEvent.event.id}:`, error);
        }
      }
      
      return { ok: true, data: allBriefings };
    } catch (error) {
      return {
        ok: false,
        error: {
          type: 'API_UNAVAILABLE',
          message: `Failed to fetch trending political briefings: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * Find event containing a specific market by condition ID using enhanced event client
   * Enhanced to use the event-based discovery capabilities
   * @param conditionId - Market condition ID to search for
   * @returns Event containing the market, or null if not found
   */
  private async findEventByMarketCondition(conditionId: string): Promise<PolymarketEvent | null> {
    try {
      // Search for political events that might contain this market using enhanced client
      const events = await this.enhancedEventClient.discoverPoliticalEvents({
        limit: 100, // Search more events to find the right one
        active: true,
      });
      
      // Find event containing market with matching condition ID
      for (const event of events) {
        const matchingMarket = event.markets.find(market => market.conditionId === conditionId);
        if (matchingMarket) {
          return event;
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to find event for market ${conditionId}:`, error);
      return null;
    }
  }

  /**
   * Check if a market is resolved
   * @param conditionId - Polymarket condition ID
   * @returns Resolution status and outcome if resolved
   */
  async checkMarketResolution(
    conditionId: string
  ): Promise<
    | { resolved: false }
    | { resolved: true; outcome: string; resolvedAt: number }
  > {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return { resolved: false };
    }

    // Wait for rate limit
    await this.waitForRateLimit();

    try {
      // Fetch market data with retry logic from CLOB API
      const marketData = await this.fetchWithRetry<any>(
        `${this.clobApiUrl}/markets/${conditionId}`,
        3
      );

      // Check if market has a closed/resolved status
      // Polymarket markets are resolved when they have a definitive outcome
      const closed = (marketData as any).closed === true || (marketData as any).closed === 'true';
      const resolved = (marketData as any).resolved === true || (marketData as any).resolved === 'true';
      const active = (marketData as any).active;
      
      // Check if market is closed/resolved
      // Market is resolved if: closed=true, resolved=true, or active=false (but not active=true)
      const isResolved = closed || resolved || (active !== undefined && active === false);
      
      if (isResolved) {
        // Determine the outcome based on outcome prices
        // If YES price is 1.0 or very close, market resolved YES
        // If NO price is 1.0 or very close, market resolved NO
        const yesPrice = parseFloat(marketData.outcome_prices[0] || '0');
        const noPrice = parseFloat(marketData.outcome_prices[1] || '0');
        
        let outcome = 'UNKNOWN';
        if (yesPrice >= 0.99) {
          outcome = 'YES';
        } else if (noPrice >= 0.99) {
          outcome = 'NO';
        } else if (yesPrice >= 0.95) {
          outcome = 'YES';
        } else if (noPrice >= 0.95) {
          outcome = 'NO';
        }

        // Get resolution timestamp (use end_date_iso or current time)
        const resolvedAt = marketData.end_date_iso
          ? new Date(marketData.end_date_iso).getTime()
          : Date.now();

        // Reset circuit breaker on success
        this.onSuccess();

        return {
          resolved: true,
          outcome,
          resolvedAt,
        };
      }

      // Market is still active
      this.onSuccess();
      return { resolved: false };
    } catch (error) {
      // Record failure for circuit breaker
      this.onFailure();

      // On error, assume market is not resolved
      return { resolved: false };
    }
  }

  /**
   * Health check endpoint with enhanced events API monitoring
   * Enhanced to check both traditional APIs and events API health
   * Implements Requirements 4.3, 4.4 with comprehensive health monitoring
   * @returns true if APIs are reachable, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check enhanced events API health first
      const eventsApiHealth = await this.checkEventsApiHealth();
      
      // Check traditional Gamma API
      const gammaResponse = await fetch(`${this.gammaApiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      // Check CLOB API
      const clobResponse = await fetch(`${this.clobApiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      // Return true if events API and at least one traditional API is healthy
      return eventsApiHealth.healthy && (gammaResponse.ok || clobResponse.ok);
    } catch {
      return false;
    }
  }

  /**
   * Get comprehensive client status including enhanced event client metrics
   * Implements Requirements 4.3, 4.4 with comprehensive monitoring
   * @returns Combined status from both traditional and enhanced event clients
   */
  getClientStatus(): {
    traditional: {
      circuitBreaker: {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        lastFailureTime?: number;
      };
      rateLimiter: {
        tokensRemaining: number;
        maxTokens: number;
        refillRate: number;
      };
    };
    enhanced: {
      eventsApi: ApiHealthStatus | null;
      rateLimiter: RateLimitStatus;
    };
  } {
    // Get traditional client status
    const traditionalStatus = {
      circuitBreaker: {
        state: this.circuitState,
        failureCount: this.failureCount,
        successCount: this.totalCalls - this.failureCount,
        lastFailureTime: this.lastFailureTime || undefined,
      },
      rateLimiter: {
        tokensRemaining: Math.floor(this.rateLimiter.tokens),
        maxTokens: this.rateLimiter.maxTokens,
        refillRate: this.rateLimiter.refillRate,
      },
    };

    // Get enhanced client status
    let eventsApiHealth: ApiHealthStatus | null = null;
    try {
      // Don't await to avoid blocking - just get cached status if available
      eventsApiHealth = {
        healthy: this.circuitState === 'CLOSED',
        responseTime: 0,
        timestamp: Date.now(),
      };
    } catch {
      eventsApiHealth = null;
    }

    const enhancedStatus = {
      eventsApi: eventsApiHealth,
      rateLimiter: this.enhancedEventClient.getRateLimitStatus(),
    };

    return {
      traditional: traditionalStatus,
      enhanced: enhancedStatus,
    };
  }

  /**
   * Get enhanced event client instance for direct access
   * Provides access to the underlying enhanced event client for advanced operations
   * @returns Enhanced event client instance
   */
  getEnhancedEventClient(): EnhancedEventPolymarketClient {
    return this.enhancedEventClient;
  }

  /**
   * Get event briefing generator instance for direct access
   * Provides access to the briefing generator for custom briefing operations
   * @returns Event briefing generator instance
   */
  getEventBriefingGenerator(): EnhancedEventBriefingGenerator {
    return this.eventBriefingGenerator;
  }

  // ==========================================================================
  // Enhanced Data Transformation Methods
  // ==========================================================================

  // ==========================================================================
  // Circuit Breaker Logic
  // ==========================================================================

  /**
   * Check if a request can be made based on circuit breaker state
   */
  private canMakeRequest(): boolean {
    const now = Date.now();

    switch (this.circuitState) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if enough time has passed to try again
        if (now - this.lastFailureTime >= this.resetTimeout) {
          this.circuitState = 'HALF_OPEN';
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   */
  private onSuccess(): void {
    this.totalCalls++;
    this.failureCount = 0;
    this.circuitState = 'CLOSED';
  }

  /**
   * Record a failed request
   */
  private onFailure(): void {
    this.totalCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = 'OPEN';
    }
  }

  // ==========================================================================
  // Rate Limiting (Token Bucket Algorithm)
  // ==========================================================================

  /**
   * Wait for rate limit token to be available
   */
  private async waitForRateLimit(): Promise<void> {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = (now - this.rateLimiter.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.rateLimiter.refillRate;

    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.maxTokens,
      this.rateLimiter.tokens + tokensToAdd
    );
    this.rateLimiter.lastRefill = now;

    // Check if we're within the rate limit buffer
    const bufferThreshold = (this.rateLimitBuffer / 100) * this.rateLimiter.maxTokens;

    if (this.rateLimiter.tokens < 1) {
      // Wait for a token to be available
      const waitTime = (1 / this.rateLimiter.refillRate) * 1000; // milliseconds
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.rateLimiter.tokens = 1;
    } else if (this.rateLimiter.tokens < bufferThreshold) {
      // Slow down requests when approaching limit
      const slowdownDelay = 100; // milliseconds
      await new Promise((resolve) => setTimeout(resolve, slowdownDelay));
    }

    // Consume a token
    this.rateLimiter.tokens--;
  }

  // ==========================================================================
  // Retry Logic with Exponential Backoff
  // ==========================================================================

  /**
   * Fetch with exponential backoff and jitter
   * @param url - URL to fetch
   * @param maxRetries - Maximum number of retries
   * @returns Response data
   */
  private async fetchWithRetry<T>(url: string, maxRetries: number): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as T;
        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on 404 or 400 errors
        if (lastError.message.includes('404') || lastError.message.includes('400')) {
          throw lastError;
        }

        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Calculate backoff with jitter
        const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        const jitter = Math.random() * 1000; // 0-1s random jitter
        const delay = baseDelay + jitter;

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  // ==========================================================================
  // Data Transformation
  // ==========================================================================

  /**
   * Transform raw Polymarket data into Market Briefing Document
   */
  private transformToMBD(
    conditionId: string,
    marketData: any, // CLOB API format
    orderBook: OrderBookData
  ): MarketBriefingDocument {
    // Calculate bid-ask spread
    const bestBid = orderBook.bids[0] ? parseFloat(orderBook.bids[0].price) : 0;
    const bestAsk = orderBook.asks[0] ? parseFloat(orderBook.asks[0].price) : 1;
    const bidAskSpread = (bestAsk - bestBid) * 100; // in cents

    // Calculate current probability (midpoint)
    const currentProbability = (bestBid + bestAsk) / 2;

    // Calculate liquidity score (0-10 scale based on order book depth)
    const totalBidSize = orderBook.bids.reduce((sum, bid) => sum + parseFloat(bid.size), 0);
    const totalAskSize = orderBook.asks.reduce((sum, ask) => sum + parseFloat(ask.size), 0);
    const totalLiquidity = totalBidSize + totalAskSize;
    const liquidityScore = Math.min(10, Math.log10(totalLiquidity + 1) * 2);

    // Determine volatility regime (simplified - would need historical data)
    const volatilityRegime = this.calculateVolatilityRegime(bidAskSpread);

    // Parse expiry timestamp - CLOB API uses end_date_iso
    const expiryTimestamp = new Date(marketData.end_date_iso).getTime();

    // Detect ambiguity flags (simplified)
    const ambiguityFlags = this.detectAmbiguityFlags(marketData.description);

    // Extract catalysts (simplified)
    const keyCatalysts = this.extractCatalysts(marketData);

    // Determine event type
    const eventType = this.classifyEventType(marketData.question);

    return {
      marketId: marketData.market_slug || conditionId,
      conditionId,
      eventType,
      question: marketData.question,
      resolutionCriteria: marketData.description || 'No resolution criteria provided',
      expiryTimestamp,
      currentProbability,
      liquidityScore,
      bidAskSpread,
      volatilityRegime,
      volume24h: 0, // CLOB API doesn't provide volume, would need separate call
      metadata: {
        ambiguityFlags,
        keyCatalysts,
      },
    };
  }

  /**
   * Calculate volatility regime based on bid-ask spread
   */
  private calculateVolatilityRegime(bidAskSpread: number): 'low' | 'medium' | 'high' {
    if (bidAskSpread < 2) return 'low';
    if (bidAskSpread < 5) return 'medium';
    return 'high';
  }

  /**
   * Detect ambiguity in resolution criteria
   */
  private detectAmbiguityFlags(description: string): string[] {
    const flags: string[] = [];

    const ambiguousTerms = [
      'may',
      'might',
      'could',
      'possibly',
      'unclear',
      'ambiguous',
      'subjective',
    ];

    for (const term of ambiguousTerms) {
      if (description.toLowerCase().includes(term)) {
        flags.push(`Contains ambiguous term: "${term}"`);
      }
    }

    return flags;
  }

  /**
   * Extract key catalysts from market data
   */
  private extractCatalysts(marketData: GammaMarketData): Array<{ event: string; timestamp: number }> {
    const catalysts: Array<{ event: string; timestamp: number }> = [];

    // Add game start time as a catalyst if available
    if (marketData.game_start_time) {
      catalysts.push({
        event: 'Market event start',
        timestamp: new Date(marketData.game_start_time).getTime(),
      });
    }

    // Add expiry as a catalyst
    if (marketData.end_date_iso) {
      catalysts.push({
        event: 'Market expiry',
        timestamp: new Date(marketData.end_date_iso).getTime(),
      });
    }

    return catalysts;
  }

  /**
   * Classify event type based on question text
   */
  private classifyEventType(question: string): MarketBriefingDocument['eventType'] {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('election') || lowerQuestion.includes('vote')) {
      return 'election';
    }
    if (lowerQuestion.includes('policy') || lowerQuestion.includes('law')) {
      return 'policy';
    }
    if (lowerQuestion.includes('court') || lowerQuestion.includes('ruling')) {
      return 'court';
    }
    if (
      lowerQuestion.includes('war') ||
      lowerQuestion.includes('conflict') ||
      lowerQuestion.includes('treaty')
    ) {
      return 'geopolitical';
    }
    if (
      lowerQuestion.includes('gdp') ||
      lowerQuestion.includes('inflation') ||
      lowerQuestion.includes('economy') ||
      lowerQuestion.includes('bitcoin') ||
      lowerQuestion.includes('stock') ||
      lowerQuestion.includes('market') ||
      lowerQuestion.includes('price')
    ) {
      return 'economic';
    }

    return 'other';
  }
}

/**
 * Create a Polymarket client instance
 */
export function createPolymarketClient(config: EngineConfig['polymarket']): PolymarketClient {
  return new PolymarketClient(config);
}
