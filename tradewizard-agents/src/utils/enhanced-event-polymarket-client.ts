/**
 * Enhanced Event-Based Polymarket Client
 *
 * This module provides comprehensive Polymarket events API integration with proper
 * endpoint usage, multi-market data handling, and event-centric analysis capabilities.
 * It replaces the market-centric approach with event-based discovery that leverages
 * Polymarket's event structure containing multiple related markets.
 * 
 * Features:
 * - Comprehensive error handling with circuit breaker pattern
 * - Advanced rate limiting with token bucket algorithm
 * - Exponential backoff with jitter for retries
 * - Fallback mechanisms for API unavailability
 * - Graceful degradation and cached data fallback
 */

import type { EngineConfig } from '../config/index.js';
import { getLogger } from './logger.js';
import {
  validatePolymarketEvent,
  validatePolymarketEvents,
  validatePolymarketMarket,
  type EventValidationResult,
  type EventParsingOptions,
  type ValidatedPolymarketEvent,
  type ValidatedEventsApiResponse,
} from './enhanced-event-validation.js';

// ============================================================================
// Enhanced Event Data Models
// ============================================================================

/**
 * Polymarket Event with nested markets (matches actual API response structure)
 */
export interface PolymarketEvent {
  // Core Event Data
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  resolutionSource: string;
  
  // Event Status
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  
  // Temporal Data
  startDate: string;
  creationDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  
  // Event Metrics (aggregated from all markets)
  liquidity: number;
  volume: number;
  openInterest: number;
  competitive: number;
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  volume1yr: number;
  
  // Event Configuration
  enableOrderBook: boolean;
  liquidityClob: number;
  negRisk: boolean;
  negRiskMarketID?: string;
  commentCount: number;
  
  // Visual Elements
  image?: string;
  icon?: string;
  
  // Nested Markets (key difference from individual market approach)
  markets: PolymarketMarket[];
  
  // Event Tags and Classification
  tags: PolymarketTag[];
  
  // Event-Specific Configuration
  cyom: boolean;
  showAllOutcomes: boolean;
  showMarketImages: boolean;
  enableNegRisk: boolean;
  automaticallyActive: boolean;
  gmpChartMode: string;
  negRiskAugmented: boolean;
  cumulativeMarkets: boolean;
  pendingDeployment: boolean;
  deploying: boolean;
  requiresTranslation: boolean;
}

/**
 * Polymarket Market within event context
 */
export interface PolymarketMarket {
  // Core Market Data
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description: string;
  resolutionSource: string;
  
  // Market Status
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  
  // Financial Data
  liquidity?: string;
  liquidityNum?: number;
  volume: string;
  volumeNum: number;
  volume24hr?: number;
  volume1wk?: number;
  volume1mo?: number;
  volume1yr?: number;
  
  // Pricing Data
  outcomes: string;  // JSON array as string
  outcomePrices: string;  // JSON array as string
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  
  // Price Changes
  oneDayPriceChange?: number;
  oneHourPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
  oneYearPriceChange?: number;
  
  // Market Quality Metrics
  competitive?: number;
  
  // Temporal Data
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  closedTime?: string;
  
  // Market Maker and Trading
  marketMakerAddress: string;
  submitted_by: string;
  resolvedBy?: string;
  
  // Group/Series Information (for event context)
  groupItemTitle?: string;
  groupItemThreshold?: string;
  
  // UMA Resolution
  questionID?: string;
  umaEndDate?: string;
  umaResolutionStatus?: string;
  umaResolutionStatuses?: string;
  umaBond?: string;
  umaReward?: string;
  
  // Trading Configuration
  enableOrderBook: boolean;
  orderPriceMinTickSize?: number;
  orderMinSize?: number;
  acceptingOrders?: boolean;
  acceptingOrdersTimestamp?: string;
  
  // CLOB Token Information
  clobTokenIds?: string;
  liquidityClob?: number;
  volumeClob?: number;
  volume24hrClob?: number;
  volume1wkClob?: number;
  volume1moClob?: number;
  volume1yrClob?: number;
  
  // Additional Configuration
  customLiveness?: number;
  negRisk: boolean;
  negRiskRequestID?: string;
  negRiskMarketID?: string;
  ready: boolean;
  funded: boolean;
  cyom: boolean;
  pagerDutyNotificationEnabled: boolean;
  approved: boolean;
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
  automaticallyResolved?: boolean;
  automaticallyActive: boolean;
  clearBookOnStart: boolean;
  seriesColor: string;
  showGmpSeries: boolean;
  showGmpOutcome: boolean;
  manualActivation: boolean;
  negRiskOther: boolean;
  pendingDeployment: boolean;
  deploying: boolean;
  deployingTimestamp?: string;
  rfqEnabled: boolean;
  holdingRewardsEnabled: boolean;
  feesEnabled: boolean;
  requiresTranslation: boolean;
  
  // Visual Elements
  image?: string;
  icon?: string;
  
  // Date Helpers
  endDateIso?: string;
  startDateIso?: string;
  hasReviewedDates?: boolean;
}

/**
 * Polymarket Tag for event classification
 */
export interface PolymarketTag {
  id: number;
  label: string;
  slug: string;
  forceShow?: boolean;
  forceHide?: boolean;
  publishedAt?: string;
  updatedBy?: number;
  createdAt: string;
  updatedAt: string;
  isCarousel?: boolean;
  requiresTranslation: boolean;
}

/**
 * Event discovery options for API calls
 */
export interface EventDiscoveryOptions {
  tagId?: number;
  relatedTags?: boolean;
  active?: boolean;
  closed?: boolean;
  limit?: number;
  offset?: number;
  startDateMin?: string;
  startDateMax?: string;
  endDateMin?: string;
  endDateMax?: string;
  sortBy?: 'volume24hr' | 'liquidity' | 'competitive' | 'createdAt' | 'id' | 'marketCount' | 'totalVolume';
  sortOrder?: 'asc' | 'desc';
  archived?: boolean;
  featured?: boolean;
  order?: string;
  ascending?: boolean;
  minMarkets?: number;
  maxMarkets?: number;
}

/**
 * Tag filtering options
 */
export interface TagFilterOptions {
  relatedTags?: boolean;
  excludeTagId?: number;
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
}

/**
 * Event with enhanced market analysis
 */
export interface EventWithMarkets {
  event: PolymarketEvent;
  markets: PolymarketMarket[];
  crossMarketCorrelations: MarketCorrelation[];
  eventLevelMetrics: EventMetrics;
}

/**
 * Ranked event with trending score and analysis
 */
export interface RankedEvent {
  event: PolymarketEvent;
  trendingScore: number;
  rankingFactors: {
    totalVolumeScore: number;
    totalLiquidityScore: number;
    averageCompetitiveScore: number;
    marketCountScore: number;
    recencyScore: number;
    activityScore: number;
    // Enhanced factors for comprehensive analysis
    multiPeriodVolumeScore: number;
    eventQualityScore: number;
    crossMarketCorrelationScore: number;
    marketDiversityScore: number;
    liquidityDistributionScore: number;
  };
  marketAnalysis: EventMarketAnalysis;
  // Enhanced analysis for comprehensive ranking
  multiPeriodAnalysis: MultiPeriodAnalysis;
  eventQualityMetrics: EventQualityMetrics;
}

/**
 * Event market analysis for ranking
 */
export interface EventMarketAnalysis {
  marketCount: number;
  activeMarketCount: number;
  totalVolume: number;
  totalLiquidity: number;
  averageCompetitive: number;
  volumeDistribution: MarketVolumeDistribution[];
  correlations: MarketCorrelation[];
  dominantMarket: PolymarketMarket | null;
  opportunityMarkets: PolymarketMarket[];
}

/**
 * Multi-period analysis for comprehensive event ranking
 */
export interface MultiPeriodAnalysis {
  volume24hr: TimePeriodMetrics;
  volume1wk: TimePeriodMetrics;
  volume1mo: TimePeriodMetrics;
  volume1yr: TimePeriodMetrics;
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  momentumScore: number;
  consistencyScore: number;
  growthRate: number;
}

/**
 * Time period metrics for multi-period analysis
 */
export interface TimePeriodMetrics {
  totalVolume: number;
  averageVolume: number;
  marketCount: number;
  activeMarketCount: number;
  dominantMarketVolume: number;
  volumeDistribution: number; // Gini coefficient for volume distribution
  correlationStrength: number;
}

/**
 * Event quality metrics for comprehensive assessment
 */
export interface EventQualityMetrics {
  overallQualityScore: number;
  liquidityQuality: LiquidityQualityMetrics;
  marketQuality: MarketQualityMetrics;
  competitiveBalance: CompetitiveBalanceMetrics;
  diversityMetrics: DiversityMetrics;
  riskMetrics: RiskMetrics;
}

/**
 * Liquidity quality assessment
 */
export interface LiquidityQualityMetrics {
  totalLiquidity: number;
  averageLiquidity: number;
  liquidityDistribution: number; // How evenly distributed liquidity is
  liquidityDepth: number; // Depth of liquidity across markets
  liquidityStability: number; // Consistency of liquidity levels
}

/**
 * Market quality assessment
 */
export interface MarketQualityMetrics {
  averageCompetitive: number;
  competitiveConsistency: number; // How consistent competitive scores are
  marketMaturity: number; // Based on age and activity
  resolutionReliability: number; // Based on resolution source quality
  tradingActivity: number; // Recent trading activity levels
}

/**
 * Competitive balance assessment
 */
export interface CompetitiveBalanceMetrics {
  priceBalance: number; // How balanced outcome prices are
  volumeBalance: number; // How balanced volume is across outcomes
  liquidityBalance: number; // How balanced liquidity is across outcomes
  overallBalance: number; // Combined balance score
}

/**
 * Diversity metrics for event assessment
 */
export interface DiversityMetrics {
  marketTypeDiversity: number; // Variety of market types
  outcomeDiversity: number; // Variety of outcomes across markets
  participantDiversity: number; // Estimated participant diversity
  topicDiversity: number; // Diversity of topics within event
}

/**
 * Risk metrics for event assessment
 */
export interface RiskMetrics {
  concentrationRisk: number; // Risk from volume/liquidity concentration
  correlationRisk: number; // Risk from high market correlations
  liquidityRisk: number; // Risk from low liquidity
  resolutionRisk: number; // Risk related to resolution uncertainty
  overallRisk: number; // Combined risk score
}

/**
 * Event with enhanced market analysis
 */
export interface EventWithMarkets {
  event: PolymarketEvent;
  markets: PolymarketMarket[];
  crossMarketCorrelations: MarketCorrelation[];
  eventLevelMetrics: EventMetrics;
}

/**
 * Market correlation analysis
 */
export interface MarketCorrelation {
  market1Id: string;
  market2Id: string;
  correlationCoefficient: number;
  correlationType: 'positive' | 'negative' | 'neutral';
}

/**
 * Event-level aggregated metrics
 */
export interface EventMetrics {
  totalVolume: number;
  totalLiquidity: number;
  averageCompetitive: number;
  marketCount: number;
  activeMarketCount: number;
  volumeDistribution: MarketVolumeDistribution[];
  priceCorrelations: MarketCorrelation[];
}

/**
 * Market volume distribution within event
 */
export interface MarketVolumeDistribution {
  marketId: string;
  volumePercentage: number;
  liquidityPercentage: number;
}

/**
 * API health status
 */
export interface ApiHealthStatus {
  healthy: boolean;
  responseTime: number;
  timestamp: number;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  tokensRemaining: number;
  resetTime: number;
  requestsInWindow: number;
  windowSizeMs: number;
}

/**
 * Circuit breaker state
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
  monitoringPeriod: number;
  successThreshold: number;
  volumeThreshold: number;
}

/**
 * Circuit breaker statistics
 */
interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  failureRate: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  halfOpenCalls: number;
  halfOpenSuccesses: number;
  stateChangeTime: number;
  timeSinceLastStateChange: number;
}

/**
 * Rate limiter state using token bucket algorithm
 */
interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

/**
 * Enhanced rate limiter configuration
 */
interface EnhancedRateLimiterConfig {
  capacity: number;
  refillRate: number;
  burstMultiplier: number;
  adaptiveRefill: boolean;
  throttleThreshold: number;
}

/**
 * Request execution result
 */
interface RequestResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  fromFallback: boolean;
  circuitState: CircuitState;
  retryAfter?: number;
}

/**
 * Fallback data provider function type
 */
type FallbackProvider<T> = () => Promise<T>;

/**
 * Call history entry for failure rate calculation
 */
interface CallHistoryEntry {
  timestamp: number;
  success: boolean;
}

// ============================================================================
// Enhanced Event-Based Polymarket Client
// ============================================================================

export class EnhancedEventPolymarketClient {
  private readonly gammaApiUrl: string;
  private readonly clobApiUrl: string;
  private readonly rateLimitBuffer: number;
  private readonly politicsTagId: number;
  private readonly logger;

  // Enhanced circuit breaker state
  private circuitState: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private lastFailureTime = 0;
  private stateChangeTime = Date.now();
  private halfOpenCalls = 0;
  private halfOpenSuccesses = 0;
  private callHistory: CallHistoryEntry[] = [];

  // Circuit breaker configuration
  private readonly circuitBreakerConfig: CircuitBreakerConfig;

  // Enhanced rate limiter state (token bucket algorithm)
  private rateLimiter: RateLimiterState;
  private readonly rateLimiterConfig: EnhancedRateLimiterConfig;
  private usageHistory: number[] = [];
  private adaptiveRefillRate: number;
  private burstCapacity: number;

  // Fallback cache for graceful degradation
  private fallbackCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly cacheTTL: number;

  constructor(config: EngineConfig['polymarket']) {
    this.gammaApiUrl = config.gammaApiUrl;
    this.clobApiUrl = config.clobApiUrl;
    this.rateLimitBuffer = config.rateLimitBuffer;
    this.politicsTagId = config.politicsTagId;
    this.cacheTTL = config.eventCacheTTL * 1000; // Convert to milliseconds
    this.logger = getLogger();

    // Initialize circuit breaker configuration
    this.circuitBreakerConfig = {
      failureThreshold: config.circuitBreakerThreshold,
      resetTimeoutMs: 60000, // 1 minute
      halfOpenMaxCalls: 3,
      monitoringPeriod: 60000, // 1 minute
      successThreshold: 2,
      volumeThreshold: 5,
    };

    // Initialize enhanced rate limiter configuration
    this.rateLimiterConfig = {
      capacity: config.eventsApiRateLimit,
      refillRate: config.eventsApiRateLimit / 10, // 10-second window
      burstMultiplier: 1.5,
      adaptiveRefill: true,
      throttleThreshold: 0.8,
    };

    // Initialize rate limiter state
    this.rateLimiter = {
      tokens: this.rateLimiterConfig.capacity,
      lastRefill: Date.now(),
      maxTokens: this.rateLimiterConfig.capacity,
      refillRate: this.rateLimiterConfig.refillRate,
    };

    this.adaptiveRefillRate = this.rateLimiterConfig.refillRate;
    this.burstCapacity = Math.floor(this.rateLimiterConfig.capacity * this.rateLimiterConfig.burstMultiplier);

    this.logger.info({
      circuitBreakerConfig: this.circuitBreakerConfig,
      rateLimiterConfig: this.rateLimiterConfig,
    }, '[EnhancedEventPolymarketClient] Initialized with comprehensive error handling');
  }

  // ==========================================================================
  // Event Discovery Methods
  // ==========================================================================

  /**
   * Discover trending political events with proper filtering and multi-market support
   * Implements Requirements 1.1, 1.2, 1.3, 1.4 with comprehensive ranking and pagination
   */
  async discoverTrendingPoliticalEvents(limit: number = 20): Promise<RankedEvent[]> {
    return this.executeWithErrorHandling(
      async () => {
        // Discover political events with enhanced options for trending analysis
        const events = await this.discoverPoliticalEvents({
          tagId: this.politicsTagId,
          relatedTags: false,
          active: true,
          closed: false,
          limit: Math.min(limit * 3, 100), // Fetch more to allow for better ranking
          sortBy: 'volume24hr',
          sortOrder: 'desc',
        });

        // Rank events by trending score with multi-market analysis
        const rankedEvents = this.rankEventsByTrendingScore(events);

        // Return top N events
        return rankedEvents.slice(0, limit);
      },
      () => this.getFallbackRankedEvents('trending_political', limit),
      'discoverTrendingPoliticalEvents'
    );
  }

  /**
   * Discover political events using events endpoint with tag_id=2 and related_tags=true
   * Enhanced with comprehensive date range filtering and advanced discovery options
   * Implements Requirements 1.1, 1.2, 1.3, 1.5, 4.3, 4.4 with comprehensive error handling and validation
   */
  async discoverPoliticalEvents(options: EventDiscoveryOptions = {}): Promise<PolymarketEvent[]> {
    return this.executeWithErrorHandling(
      async () => {
        // Build query parameters for political event discovery with enhanced filtering
        const params = new URLSearchParams({
          tag_id: (options.tagId || this.politicsTagId).toString(),
          related_tags: (options.relatedTags !== false).toString(),
          active: (options.active !== false).toString(),
          closed: (options.closed === true).toString(),
          limit: (options.limit || 20).toString(),
          offset: (options.offset || 0).toString(),
        });

        // Add enhanced date range filtering parameters
        if (options.startDateMin) {
          params.append('start_date_min', this.formatDateForApi(options.startDateMin));
        }
        if (options.startDateMax) {
          params.append('start_date_max', this.formatDateForApi(options.startDateMax));
        }
        if (options.endDateMin) {
          params.append('end_date_min', this.formatDateForApi(options.endDateMin));
        }
        if (options.endDateMax) {
          params.append('end_date_max', this.formatDateForApi(options.endDateMax));
        }

        // Add optional filtering parameters
        if (options.archived !== undefined) params.append('archived', options.archived.toString());
        if (options.featured !== undefined) params.append('featured', options.featured.toString());
        
        // Add market count filtering for multi-market analysis
        if (options.minMarkets !== undefined) params.append('min_markets', options.minMarkets.toString());
        if (options.maxMarkets !== undefined) params.append('max_markets', options.maxMarkets.toString());
        
        // Handle enhanced sorting parameters with market count and total volume support
        if (options.order) {
          params.append('order', options.order);
          if (options.ascending !== undefined) {
            params.append('ascending', options.ascending.toString());
          }
        } else if (options.sortBy) {
          // Map enhanced sort options to API parameters
          const sortMapping = this.mapSortByToApiParameter(options.sortBy);
          params.append('order', sortMapping);
          params.append('ascending', (options.sortOrder === 'asc').toString());
        }

        const url = `${this.gammaApiUrl}/events?${params.toString()}`;
        
        this.logger.debug({
          url,
          options,
          params: Object.fromEntries(params.entries()),
        }, '[EnhancedEventPolymarketClient] Discovering political events with enhanced filtering');
        
        const rawData = await this.fetchWithRetry<unknown>(url);
        
        // Validate and parse the response using enhanced validation
        const validationResult = validatePolymarketEvents(rawData, {
          strict: false,
          allowPartialData: true,
          skipMalformedMarkets: true,
          logWarnings: true,
        });

        if (!validationResult.success) {
          throw new Error(`Event validation failed: ${validationResult.error?.message}`);
        }

        if (validationResult.warnings && validationResult.warnings.length > 0) {
          this.logger.warn({
            warnings: validationResult.warnings,
            url,
          }, '[EnhancedEventPolymarketClient] Event validation completed with warnings');
        }

        const events = validationResult.data || [];
        
        // Apply client-side filtering for enhanced options not supported by API
        const filteredEvents = this.applyClientSideFiltering(events, options);
        
        this.logger.info({
          totalEvents: events.length,
          filteredEvents: filteredEvents.length,
          options,
        }, '[EnhancedEventPolymarketClient] Political events discovery completed');

        return filteredEvents;
      },
      () => this.getFallbackEvents('political'),
      'discoverPoliticalEvents'
    );
  }

  /**
   * Fetch events by tag with comprehensive filtering options and validation
   * Implements Requirements 1.1, 1.4 with enhanced error handling and validation
   */
  async fetchEventsByTag(tagId: number, options: TagFilterOptions = {}): Promise<PolymarketEvent[]> {
    return this.executeWithErrorHandling(
      async () => {
        // Build query parameters
        const params = new URLSearchParams({
          tag_id: tagId.toString(),
          related_tags: (options.relatedTags !== false).toString(),
          active: (options.active !== false).toString(),
          closed: (options.closed === true).toString(),
          limit: (options.limit || 50).toString(),
          offset: (options.offset || 0).toString(),
        });

        // Add exclude tag if specified
        if (options.excludeTagId) {
          params.append('exclude_tag_id', options.excludeTagId.toString());
        }

        const url = `${this.gammaApiUrl}/events?${params.toString()}`;
        const rawData = await this.fetchWithRetry<unknown>(url);
        
        // Validate and parse the response using enhanced validation
        const validationResult = validatePolymarketEvents(rawData, {
          strict: false,
          allowPartialData: true,
          skipMalformedMarkets: true,
          logWarnings: true,
        });

        if (!validationResult.success) {
          throw new Error(`Event validation failed for tag ${tagId}: ${validationResult.error?.message}`);
        }

        if (validationResult.warnings && validationResult.warnings.length > 0) {
          this.logger.warn({
            warnings: validationResult.warnings,
            tagId,
            url,
          }, '[EnhancedEventPolymarketClient] Tag-based event validation completed with warnings');
        }

        return validationResult.data || [];
      },
      () => this.getFallbackEvents(`tag_${tagId}`),
      'fetchEventsByTag'
    );
  }

  /**
   * Fetch individual event details with all nested markets and validation
   * Implements Requirements 1.2, 1.4 with comprehensive error handling and validation
   */
  async fetchEventDetails(eventId: string): Promise<PolymarketEvent> {
    return this.executeWithErrorHandling(
      async () => {
        const url = `${this.gammaApiUrl}/events/${eventId}`;
        const rawData = await this.fetchWithRetry<unknown>(url);
        
        // Validate and parse the single event response
        const validationResult = validatePolymarketEvent(rawData, {
          strict: false,
          allowPartialData: true,
          skipMalformedMarkets: true,
          logWarnings: true,
        });

        if (!validationResult.success) {
          throw new Error(`Event validation failed for event ${eventId}: ${validationResult.error?.message}`);
        }

        if (validationResult.warnings && validationResult.warnings.length > 0) {
          this.logger.warn({
            warnings: validationResult.warnings,
            eventId,
            url,
          }, '[EnhancedEventPolymarketClient] Single event validation completed with warnings');
        }

        if (!validationResult.data) {
          throw new Error(`No valid event data returned for event ${eventId}`);
        }

        return validationResult.data;
      },
      () => this.getFallbackEvent(eventId),
      'fetchEventDetails'
    );
  }

  /**
   * Fetch event with enhanced market analysis
   * Implements Requirements 1.2, 1.5
   */
  async fetchEventWithAllMarkets(eventId: string): Promise<EventWithMarkets> {
    const event = await this.fetchEventDetails(eventId);
    
    // Calculate cross-market correlations
    const crossMarketCorrelations = this.calculateCrossMarketCorrelations(event.markets);
    
    // Calculate event-level metrics
    const eventLevelMetrics = this.calculateEventMetrics(event);

    return {
      event,
      markets: event.markets,
      crossMarketCorrelations,
      eventLevelMetrics,
    };
  }

  /**
   * Fetch multiple events in batch with enhanced error handling and nested market data
   * Enhanced with comprehensive batch processing capabilities and market data inclusion
   * Implements Requirements 4.3, 4.4 with comprehensive resilience and nested market support
   */
  async fetchEventsBatch(eventIds: string[], options: {
    includeMarkets?: boolean;
    batchSize?: number;
    maxConcurrency?: number;
    includeAnalysis?: boolean;
  } = {}): Promise<PolymarketEvent[]> {
    const {
      includeMarkets = true,
      batchSize = 10,
      maxConcurrency = 5,
      includeAnalysis = false,
    } = options;

    const events: PolymarketEvent[] = [];
    
    this.logger.info({
      totalEventIds: eventIds.length,
      batchSize,
      maxConcurrency,
      includeMarkets,
      includeAnalysis,
    }, '[EnhancedEventPolymarketClient] Starting enhanced batch event fetching');
    
    // Process in batches to respect rate limits and manage concurrency
    for (let i = 0; i < eventIds.length; i += batchSize) {
      const batch = eventIds.slice(i, i + batchSize);
      
      this.logger.debug({
        batchIndex: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(eventIds.length / batchSize),
        batchSize: batch.length,
      }, '[EnhancedEventPolymarketClient] Processing batch');
      
      // Fetch batch with enhanced error handling for each event
      const batchPromises = batch.map(async (eventId) => {
        try {
          const event = await this.fetchEventDetails(eventId);
          
          // Optionally include enhanced market analysis
          if (includeAnalysis && event.markets && event.markets.length > 0) {
            // Add cross-market correlations and event metrics
            const correlations = this.calculateCrossMarketCorrelations(event.markets);
            const eventMetrics = this.calculateEventMetrics(event);
            
            // Enhance event with analysis data (non-mutating)
            return {
              ...event,
              _analysis: {
                crossMarketCorrelations: correlations,
                eventMetrics,
                marketAnalysis: this.analyzeEventMarkets(event),
              },
            } as PolymarketEvent & { _analysis?: any };
          }
          
          return event;
        } catch (error) {
          this.logger.warn({ 
            eventId, 
            error: (error as Error).message,
            batchIndex: Math.floor(i / batchSize) + 1,
          }, '[EnhancedEventPolymarketClient] Failed to fetch event in batch');
          return null;
        }
      });
      
      // Use Promise.allSettled for better error handling
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect successful results
      let successCount = 0;
      let failureCount = 0;
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          events.push(result.value);
          successCount++;
        } else {
          failureCount++;
        }
      }
      
      this.logger.debug({
        batchIndex: Math.floor(i / batchSize) + 1,
        successCount,
        failureCount,
        totalEventsCollected: events.length,
      }, '[EnhancedEventPolymarketClient] Batch processing completed');
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < eventIds.length) {
        await this.delay(100); // 100ms delay between batches
      }
    }

    this.logger.info({
      requestedEvents: eventIds.length,
      successfulEvents: events.length,
      failureRate: ((eventIds.length - events.length) / eventIds.length * 100).toFixed(2) + '%',
    }, '[EnhancedEventPolymarketClient] Enhanced batch event fetching completed');

    return events;
  }

  // ==========================================================================
  // Event Ranking and Analysis Methods
  // ==========================================================================

  /**
   * Rank events by trending score with comprehensive multi-market analysis
   * Implements Requirements 5.1, 5.2, 5.3, 5.5 with enhanced cross-market analysis
   */
  private rankEventsByTrendingScore(events: PolymarketEvent[]): RankedEvent[] {
    const rankedEvents = events.map((event) => {
      const marketAnalysis = this.analyzeEventMarkets(event);
      const multiPeriodAnalysis = this.calculateMultiPeriodAnalysis(event);
      const eventQualityMetrics = this.calculateEventQualityMetrics(event, marketAnalysis);
      const rankingFactors = this.calculateEnhancedRankingFactors(event, marketAnalysis, multiPeriodAnalysis, eventQualityMetrics);
      const trendingScore = this.calculateComprehensiveEventTrendingScore(rankingFactors);

      return {
        event,
        trendingScore,
        rankingFactors,
        marketAnalysis,
        multiPeriodAnalysis,
        eventQualityMetrics,
      };
    });

    // Sort by trending score (descending)
    return rankedEvents.sort((a, b) => b.trendingScore - a.trendingScore);
  }

  /**
   * Analyze markets within an event for ranking purposes
   */
  private analyzeEventMarkets(event: PolymarketEvent): EventMarketAnalysis {
    const markets = event.markets || [];
    
    // Calculate totals
    const totalVolume = markets.reduce((sum, market) => sum + (market.volumeNum || 0), 0);
    const totalLiquidity = markets.reduce((sum, market) => sum + (market.liquidityNum || 0), 0);
    
    // Calculate average competitive score
    const competitiveScores = markets.filter(m => m.competitive !== undefined).map(m => m.competitive!);
    const averageCompetitive = competitiveScores.length > 0 
      ? competitiveScores.reduce((sum, score) => sum + score, 0) / competitiveScores.length 
      : 0;
    
    // Count markets
    const marketCount = markets.length;
    const activeMarketCount = markets.filter(m => m.active).length;
    
    // Calculate volume distribution
    const volumeDistribution: MarketVolumeDistribution[] = markets.map(market => ({
      marketId: market.id,
      volumePercentage: totalVolume > 0 ? ((market.volumeNum || 0) / totalVolume) * 100 : 0,
      liquidityPercentage: totalLiquidity > 0 ? ((market.liquidityNum || 0) / totalLiquidity) * 100 : 0,
    }));
    
    // Calculate correlations
    const correlations = this.calculateCrossMarketCorrelations(markets);
    
    // Find dominant market (highest volume)
    const dominantMarket = markets.length > 0 
      ? markets.reduce((max, market) => 
          (market.volumeNum || 0) > (max.volumeNum || 0) ? market : max
        )
      : null;
    
    // Find opportunity markets (high liquidity, low volume)
    const opportunityMarkets = markets.filter(market => {
      const volume = market.volumeNum || 0;
      const liquidity = market.liquidityNum || 0;
      return liquidity > 1000 && volume < liquidity * 0.1; // High liquidity, low volume ratio
    });

    return {
      marketCount,
      activeMarketCount,
      totalVolume,
      totalLiquidity,
      averageCompetitive,
      volumeDistribution,
      correlations,
      dominantMarket,
      opportunityMarkets,
    };
  }

  /**
   * Calculate multi-period analysis for comprehensive event ranking
   * Implements Requirements 5.2 - multiple time period analysis (24hr, 1wk, 1mo, 1yr)
   */
  private calculateMultiPeriodAnalysis(event: PolymarketEvent): MultiPeriodAnalysis {
    const markets = event.markets || [];
    
    // Calculate metrics for each time period
    const volume24hr = this.calculateTimePeriodMetrics(markets, '24hr');
    const volume1wk = this.calculateTimePeriodMetrics(markets, '1wk');
    const volume1mo = this.calculateTimePeriodMetrics(markets, '1mo');
    const volume1yr = this.calculateTimePeriodMetrics(markets, '1yr');
    
    // Calculate volume trend
    const volumeTrend = this.calculateVolumeTrend([
      volume24hr.totalVolume,
      volume1wk.totalVolume / 7, // Daily average
      volume1mo.totalVolume / 30, // Daily average
      volume1yr.totalVolume / 365 // Daily average
    ]);
    
    // Calculate momentum score (recent activity vs historical)
    const momentumScore = this.calculateMomentumScore(volume24hr, volume1wk, volume1mo);
    
    // Calculate consistency score (how consistent volume is across periods)
    const consistencyScore = this.calculateConsistencyScore([
      volume24hr.totalVolume,
      volume1wk.totalVolume,
      volume1mo.totalVolume,
      volume1yr.totalVolume
    ]);
    
    // Calculate growth rate (trend strength)
    const growthRate = this.calculateGrowthRate([
      volume24hr.totalVolume,
      volume1wk.totalVolume,
      volume1mo.totalVolume,
      volume1yr.totalVolume
    ]);
    
    return {
      volume24hr,
      volume1wk,
      volume1mo,
      volume1yr,
      volumeTrend,
      momentumScore,
      consistencyScore,
      growthRate,
    };
  }

  /**
   * Calculate time period metrics for a specific period
   */
  private calculateTimePeriodMetrics(markets: PolymarketMarket[], period: '24hr' | '1wk' | '1mo' | '1yr'): TimePeriodMetrics {
    const volumeField = `volume${period}` as keyof PolymarketMarket;
    
    // Get volumes for the period
    const volumes = markets.map(market => {
      const volume = market[volumeField];
      return typeof volume === 'number' ? volume : 0;
    });
    
    const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
    const averageVolume = volumes.length > 0 ? totalVolume / volumes.length : 0;
    const marketCount = markets.length;
    const activeMarketCount = markets.filter(m => m.active).length;
    
    // Find dominant market volume for this period
    const dominantMarketVolume = Math.max(...volumes);
    
    // Calculate volume distribution (Gini coefficient)
    const volumeDistribution = this.calculateGiniCoefficient(volumes);
    
    // Calculate correlation strength for this period
    const correlationStrength = this.calculateAverageCorrelationStrength(markets);
    
    return {
      totalVolume,
      averageVolume,
      marketCount,
      activeMarketCount,
      dominantMarketVolume,
      volumeDistribution,
      correlationStrength,
    };
  }

  /**
   * Calculate event quality metrics incorporating all constituent markets
   * Implements Requirements 5.3 - event quality assessment
   */
  private calculateEventQualityMetrics(event: PolymarketEvent, marketAnalysis: EventMarketAnalysis): EventQualityMetrics {
    const markets = event.markets || [];
    
    // Calculate liquidity quality
    const liquidityQuality = this.calculateLiquidityQuality(markets);
    
    // Calculate market quality
    const marketQuality = this.calculateMarketQuality(markets, event);
    
    // Calculate competitive balance
    const competitiveBalance = this.calculateCompetitiveBalance(markets);
    
    // Calculate diversity metrics
    const diversityMetrics = this.calculateDiversityMetrics(markets, event);
    
    // Calculate risk metrics
    const riskMetrics = this.calculateRiskMetrics(markets, marketAnalysis);
    
    // Calculate overall quality score
    const overallQualityScore = this.calculateOverallQualityScore(
      liquidityQuality,
      marketQuality,
      competitiveBalance,
      diversityMetrics,
      riskMetrics
    );
    
    return {
      overallQualityScore,
      liquidityQuality,
      marketQuality,
      competitiveBalance,
      diversityMetrics,
      riskMetrics,
    };
  }

  /**
   * Calculate enhanced ranking factors for comprehensive event analysis
   * Implements Requirements 5.1, 5.2, 5.3 with multi-period and quality assessment
   */
  private calculateEnhancedRankingFactors(
    event: PolymarketEvent, 
    marketAnalysis: EventMarketAnalysis,
    multiPeriodAnalysis: MultiPeriodAnalysis,
    eventQualityMetrics: EventQualityMetrics
  ): RankedEvent['rankingFactors'] {
    // Original factors (enhanced)
    const totalVolumeScore = marketAnalysis.totalVolume > 0 
      ? Math.log10(marketAnalysis.totalVolume + 1) / 6 // Normalize to ~0-1 range
      : 0;

    const totalLiquidityScore = marketAnalysis.totalLiquidity > 0 
      ? Math.log10(marketAnalysis.totalLiquidity + 1) / 6 // Normalize to ~0-1 range
      : 0;

    const averageCompetitiveScore = marketAnalysis.averageCompetitive;
    const marketCountScore = Math.min(1, marketAnalysis.marketCount / 10);
    const recencyScore = this.calculateRecencyScore(event.createdAt);
    
    const activityScore = event.volume24hr > 0 
      ? Math.min(1, Math.log10(event.volume24hr + 1) / 5) // Normalize to 0-1
      : 0;

    // New enhanced factors
    const multiPeriodVolumeScore = this.calculateMultiPeriodVolumeScore(multiPeriodAnalysis);
    const eventQualityScore = eventQualityMetrics.overallQualityScore;
    const crossMarketCorrelationScore = this.calculateCrossMarketCorrelationScore(marketAnalysis.correlations);
    const marketDiversityScore = eventQualityMetrics.diversityMetrics.marketTypeDiversity;
    const liquidityDistributionScore = eventQualityMetrics.liquidityQuality.liquidityDistribution;

    return {
      totalVolumeScore,
      totalLiquidityScore,
      averageCompetitiveScore,
      marketCountScore,
      recencyScore,
      activityScore,
      multiPeriodVolumeScore,
      eventQualityScore,
      crossMarketCorrelationScore,
      marketDiversityScore,
      liquidityDistributionScore,
    };
  }

  /**
   * Calculate comprehensive trending score with enhanced factors
   * Implements Requirements 5.1, 5.2, 5.3, 5.5
   */
  private calculateComprehensiveEventTrendingScore(factors: RankedEvent['rankingFactors']): number {
    // Enhanced weighted scoring formula for comprehensive event analysis
    return (
      factors.totalVolumeScore * 0.18 +           // Volume remains important
      factors.totalLiquidityScore * 0.15 +        // Liquidity indicates market health
      factors.averageCompetitiveScore * 0.12 +    // Competitive markets are more interesting
      factors.marketCountScore * 0.10 +           // Multi-market events are more complex
      factors.recencyScore * 0.10 +               // Recent events are more relevant
      factors.activityScore * 0.08 +              // Recent activity indicates trending
      factors.multiPeriodVolumeScore * 0.12 +     // Multi-period consistency is valuable
      factors.eventQualityScore * 0.08 +          // Overall quality matters
      factors.crossMarketCorrelationScore * 0.04 + // Correlation insights are valuable
      factors.marketDiversityScore * 0.02 +       // Diversity adds interest
      factors.liquidityDistributionScore * 0.01   // Distribution quality
    );
  }

  // ==========================================================================
  // Helper Methods for Multi-Period Analysis
  // ==========================================================================

  /**
   * Calculate volume trend from time series data
   */
  private calculateVolumeTrend(volumes: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (volumes.length < 2) return 'stable';
    
    let increasing = 0;
    let decreasing = 0;
    
    for (let i = 1; i < volumes.length; i++) {
      if (volumes[i] > volumes[i - 1]) increasing++;
      else if (volumes[i] < volumes[i - 1]) decreasing++;
    }
    
    if (increasing > decreasing) return 'increasing';
    if (decreasing > increasing) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate momentum score based on recent vs historical activity
   */
  private calculateMomentumScore(volume24hr: TimePeriodMetrics, volume1wk: TimePeriodMetrics, volume1mo: TimePeriodMetrics): number {
    const recent = volume24hr.totalVolume;
    const weeklyAvg = volume1wk.totalVolume / 7;
    const monthlyAvg = volume1mo.totalVolume / 30;
    
    if (weeklyAvg === 0 && monthlyAvg === 0) return 0.5; // Neutral if no historical data
    
    const weeklyMomentum = weeklyAvg > 0 ? Math.min(2, recent / weeklyAvg) : 1;
    const monthlyMomentum = monthlyAvg > 0 ? Math.min(2, recent / monthlyAvg) : 1;
    
    // Combine and normalize to 0-1
    return Math.min(1, (weeklyMomentum + monthlyMomentum) / 4);
  }

  /**
   * Calculate consistency score across time periods
   */
  private calculateConsistencyScore(volumes: number[]): number {
    if (volumes.length < 2) return 1;
    
    const mean = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    if (mean === 0) return 1; // Perfect consistency if all zeros
    
    const variance = volumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / volumes.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;
    
    // Convert to 0-1 score (lower variation = higher consistency)
    return Math.max(0, 1 - Math.min(1, coefficientOfVariation));
  }

  /**
   * Calculate growth rate from time series
   */
  private calculateGrowthRate(volumes: number[]): number {
    if (volumes.length < 2) return 0;
    
    // Simple linear regression slope
    const n = volumes.length;
    const sumX = (n * (n - 1)) / 2; // Sum of indices 0, 1, 2, ...
    const sumY = volumes.reduce((sum, vol) => sum + vol, 0);
    const sumXY = volumes.reduce((sum, vol, i) => sum + i * vol, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares of indices
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Normalize slope to reasonable range
    return Math.max(-1, Math.min(1, slope / 1000));
  }

  /**
   * Calculate Gini coefficient for volume distribution
   */
  private calculateGiniCoefficient(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sortedValues = [...values].sort((a, b) => a - b);
    const n = sortedValues.length;
    const sum = sortedValues.reduce((acc, val) => acc + val, 0);
    
    if (sum === 0) return 0; // Perfect equality if all zeros
    
    let gini = 0;
    for (let i = 0; i < n; i++) {
      gini += (2 * (i + 1) - n - 1) * sortedValues[i];
    }
    
    return gini / (n * sum);
  }

  /**
   * Calculate average correlation strength
   */
  private calculateAverageCorrelationStrength(markets: PolymarketMarket[]): number {
    if (markets.length < 2) return 0;
    
    const correlations = this.calculateCrossMarketCorrelations(markets);
    if (correlations.length === 0) return 0;
    
    const avgCorrelation = correlations.reduce((sum, corr) => sum + Math.abs(corr.correlationCoefficient), 0) / correlations.length;
    return avgCorrelation;
  }

  /**
   * Calculate multi-period volume score
   */
  private calculateMultiPeriodVolumeScore(multiPeriodAnalysis: MultiPeriodAnalysis): number {
    const { momentumScore, consistencyScore, growthRate } = multiPeriodAnalysis;
    
    // Combine momentum, consistency, and growth
    return (
      momentumScore * 0.4 +           // Recent momentum is important
      consistencyScore * 0.3 +        // Consistency indicates reliability
      Math.max(0, growthRate) * 0.3   // Positive growth is valuable
    );
  }

  /**
   * Calculate cross-market correlation score
   */
  private calculateCrossMarketCorrelationScore(correlations: MarketCorrelation[]): number {
    if (correlations.length === 0) return 0.5; // Neutral if no correlations
    
    // Moderate correlation is ideal (not too high, not too low)
    const avgCorrelation = correlations.reduce((sum, corr) => sum + Math.abs(corr.correlationCoefficient), 0) / correlations.length;
    
    // Optimal correlation is around 0.3-0.7 (related but not identical)
    const optimal = 0.5;
    const distance = Math.abs(avgCorrelation - optimal);
    
    return Math.max(0, 1 - distance * 2); // Penalize deviation from optimal
  }

  // ==========================================================================
  // Helper Methods for Event Quality Assessment
  // ==========================================================================

  /**
   * Calculate liquidity quality metrics
   */
  private calculateLiquidityQuality(markets: PolymarketMarket[]): LiquidityQualityMetrics {
    const liquidities = markets.map(m => m.liquidityNum || 0);
    const totalLiquidity = liquidities.reduce((sum, liq) => sum + liq, 0);
    const averageLiquidity = liquidities.length > 0 ? totalLiquidity / liquidities.length : 0;
    
    // Calculate liquidity distribution (Gini coefficient)
    const liquidityDistribution = 1 - this.calculateGiniCoefficient(liquidities); // Invert for better distribution
    
    // Calculate liquidity depth (how many markets have substantial liquidity)
    const substantialLiquidityCount = liquidities.filter(liq => liq > 1000).length;
    const liquidityDepth = markets.length > 0 ? substantialLiquidityCount / markets.length : 0;
    
    // Calculate liquidity stability (coefficient of variation)
    const liquidityStability = this.calculateConsistencyScore(liquidities);
    
    return {
      totalLiquidity,
      averageLiquidity,
      liquidityDistribution,
      liquidityDepth,
      liquidityStability,
    };
  }

  /**
   * Calculate market quality metrics
   */
  private calculateMarketQuality(markets: PolymarketMarket[], event: PolymarketEvent): MarketQualityMetrics {
    const competitiveScores = markets.filter(m => m.competitive !== undefined).map(m => m.competitive!);
    const averageCompetitive = competitiveScores.length > 0 
      ? competitiveScores.reduce((sum, score) => sum + score, 0) / competitiveScores.length 
      : 0;
    
    // Calculate competitive consistency
    const competitiveConsistency = this.calculateConsistencyScore(competitiveScores);
    
    // Calculate market maturity based on age and activity
    const eventAge = this.calculateEventAge(event.createdAt);
    const activityLevel = event.volume24hr / Math.max(1, event.volume);
    const marketMaturity = Math.min(1, (eventAge * 0.3 + activityLevel * 0.7));
    
    // Resolution reliability (simplified - based on resolution source)
    const resolutionReliability = this.assessResolutionReliability(event.resolutionSource);
    
    // Trading activity (recent volume vs total volume)
    const tradingActivity = event.volume > 0 ? Math.min(1, event.volume24hr / event.volume) : 0;
    
    return {
      averageCompetitive,
      competitiveConsistency,
      marketMaturity,
      resolutionReliability,
      tradingActivity,
    };
  }

  /**
   * Calculate competitive balance metrics
   */
  private calculateCompetitiveBalance(markets: PolymarketMarket[]): CompetitiveBalanceMetrics {
    let totalPriceBalance = 0;
    let totalVolumeBalance = 0;
    let totalLiquidityBalance = 0;
    let validMarkets = 0;
    
    for (const market of markets) {
      try {
        const outcomes = JSON.parse(market.outcomes || '[]');
        const prices = JSON.parse(market.outcomePrices || '[]');
        
        if (outcomes.length > 1 && prices.length === outcomes.length) {
          // Calculate price balance (how close prices are to being evenly distributed)
          const priceBalance = this.calculateDistributionBalance(prices);
          totalPriceBalance += priceBalance;
          
          // Volume and liquidity balance (simplified)
          totalVolumeBalance += 0.5; // Placeholder - would need more detailed data
          totalLiquidityBalance += 0.5; // Placeholder - would need more detailed data
          
          validMarkets++;
        }
      } catch {
        // Skip markets with invalid outcome data
      }
    }
    
    const priceBalance = validMarkets > 0 ? totalPriceBalance / validMarkets : 0.5;
    const volumeBalance = validMarkets > 0 ? totalVolumeBalance / validMarkets : 0.5;
    const liquidityBalance = validMarkets > 0 ? totalLiquidityBalance / validMarkets : 0.5;
    const overallBalance = (priceBalance + volumeBalance + liquidityBalance) / 3;
    
    return {
      priceBalance,
      volumeBalance,
      liquidityBalance,
      overallBalance,
    };
  }

  /**
   * Calculate diversity metrics
   */
  private calculateDiversityMetrics(markets: PolymarketMarket[], event: PolymarketEvent): DiversityMetrics {
    // Market type diversity (based on question patterns)
    const questionTypes = new Set<string>();
    markets.forEach(market => {
      const question = market.question.toLowerCase();
      if (question.includes('will') || question.includes('happen')) questionTypes.add('prediction');
      if (question.includes('who') || question.includes('which')) questionTypes.add('selection');
      if (question.includes('when') || question.includes('date')) questionTypes.add('timing');
      if (question.includes('how many') || question.includes('number')) questionTypes.add('quantity');
    });
    const marketTypeDiversity = Math.min(1, questionTypes.size / 4);
    
    // Outcome diversity (average number of outcomes per market)
    let totalOutcomes = 0;
    let validMarkets = 0;
    markets.forEach(market => {
      try {
        const outcomes = JSON.parse(market.outcomes || '[]');
        totalOutcomes += outcomes.length;
        validMarkets++;
      } catch {
        // Skip invalid markets
      }
    });
    const avgOutcomes = validMarkets > 0 ? totalOutcomes / validMarkets : 2;
    const outcomeDiversity = Math.min(1, (avgOutcomes - 2) / 3); // Normalize assuming 2-5 outcomes
    
    // Participant diversity (estimated from volume distribution)
    const volumes = markets.map(m => m.volumeNum || 0);
    const participantDiversity = 1 - this.calculateGiniCoefficient(volumes);
    
    // Topic diversity (based on event tags and market questions)
    const topicWords = new Set<string>();
    event.tags.forEach(tag => topicWords.add(tag.label.toLowerCase()));
    markets.forEach(market => {
      const words = market.question.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4) topicWords.add(word); // Only significant words
      });
    });
    const topicDiversity = Math.min(1, topicWords.size / 20); // Normalize to reasonable range
    
    return {
      marketTypeDiversity,
      outcomeDiversity,
      participantDiversity,
      topicDiversity,
    };
  }

  /**
   * Calculate risk metrics
   */
  private calculateRiskMetrics(markets: PolymarketMarket[], marketAnalysis: EventMarketAnalysis): RiskMetrics {
    // Concentration risk (based on volume/liquidity distribution)
    const volumes = markets.map(m => m.volumeNum || 0);
    const liquidities = markets.map(m => m.liquidityNum || 0);
    const concentrationRisk = (this.calculateGiniCoefficient(volumes) + this.calculateGiniCoefficient(liquidities)) / 2;
    
    // Correlation risk (high correlations increase risk)
    const avgCorrelation = marketAnalysis.correlations.length > 0
      ? marketAnalysis.correlations.reduce((sum, corr) => sum + Math.abs(corr.correlationCoefficient), 0) / marketAnalysis.correlations.length
      : 0;
    const correlationRisk = avgCorrelation;
    
    // Liquidity risk (low liquidity increases risk)
    const avgLiquidity = marketAnalysis.totalLiquidity / Math.max(1, marketAnalysis.marketCount);
    const liquidityRisk = avgLiquidity > 0 ? Math.max(0, 1 - Math.log10(avgLiquidity + 1) / 5) : 1;
    
    // Resolution risk (based on resolution source reliability)
    const resolutionRisk = 1 - this.assessResolutionReliability(markets[0]?.resolutionSource || '');
    
    // Overall risk (weighted combination)
    const overallRisk = (
      concentrationRisk * 0.3 +
      correlationRisk * 0.25 +
      liquidityRisk * 0.25 +
      resolutionRisk * 0.2
    );
    
    return {
      concentrationRisk,
      correlationRisk,
      liquidityRisk,
      resolutionRisk,
      overallRisk,
    };
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallQualityScore(
    liquidityQuality: LiquidityQualityMetrics,
    marketQuality: MarketQualityMetrics,
    competitiveBalance: CompetitiveBalanceMetrics,
    diversityMetrics: DiversityMetrics,
    riskMetrics: RiskMetrics
  ): number {
    // Combine all quality metrics with appropriate weights
    const liquidityScore = (
      Math.min(1, Math.log10(liquidityQuality.totalLiquidity + 1) / 6) * 0.3 +
      liquidityQuality.liquidityDistribution * 0.3 +
      liquidityQuality.liquidityDepth * 0.2 +
      liquidityQuality.liquidityStability * 0.2
    );
    
    const marketScore = (
      marketQuality.averageCompetitive * 0.3 +
      marketQuality.competitiveConsistency * 0.2 +
      marketQuality.marketMaturity * 0.2 +
      marketQuality.resolutionReliability * 0.15 +
      marketQuality.tradingActivity * 0.15
    );
    
    const balanceScore = competitiveBalance.overallBalance;
    
    const diversityScore = (
      diversityMetrics.marketTypeDiversity * 0.3 +
      diversityMetrics.outcomeDiversity * 0.25 +
      diversityMetrics.participantDiversity * 0.25 +
      diversityMetrics.topicDiversity * 0.2
    );
    
    const riskScore = 1 - riskMetrics.overallRisk; // Invert risk to quality
    
    // Weighted combination of all quality aspects
    return (
      liquidityScore * 0.25 +
      marketScore * 0.25 +
      balanceScore * 0.2 +
      diversityScore * 0.15 +
      riskScore * 0.15
    );
  }

  // ==========================================================================
  // Utility Helper Methods
  // ==========================================================================

  /**
   * Calculate event age in normalized form
   */
  private calculateEventAge(createdAt: string): number {
    try {
      const createdTimestamp = new Date(createdAt).getTime();
      const ageInDays = (Date.now() - createdTimestamp) / (1000 * 60 * 60 * 24);
      
      // Normalize age to 0-1 (30 days = 1.0)
      return Math.min(1, ageInDays / 30);
    } catch {
      return 0.5; // Default if parsing fails
    }
  }

  /**
   * Assess resolution source reliability
   */
  private assessResolutionReliability(resolutionSource: string): number {
    const source = resolutionSource.toLowerCase();
    
    // High reliability sources
    if (source.includes('official') || source.includes('government') || source.includes('reuters') || source.includes('ap news')) {
      return 0.9;
    }
    
    // Medium reliability sources
    if (source.includes('news') || source.includes('media') || source.includes('press')) {
      return 0.7;
    }
    
    // Lower reliability or unknown sources
    return 0.5;
  }

  /**
   * Calculate distribution balance (how evenly distributed values are)
   */
  private calculateDistributionBalance(values: number[]): number {
    if (values.length <= 1) return 1;
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    if (sum === 0) return 1;
    
    const expectedValue = sum / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - expectedValue, 2), 0) / values.length;
    const coefficientOfVariation = Math.sqrt(variance) / expectedValue;
    
    // Convert to balance score (lower variation = better balance)
    return Math.max(0, 1 - Math.min(1, coefficientOfVariation));
  }

  /**
   * Calculate recency score with exponential decay
   */
  private calculateRecencyScore(createdAt: string): number {
    try {
      const createdTimestamp = new Date(createdAt).getTime();
      const ageInDays = (Date.now() - createdTimestamp) / (1000 * 60 * 60 * 24);

      // Exponential decay with 14-day half-life for trending events
      return Math.exp(-ageInDays / 14);
    } catch {
      // If date parsing fails, return neutral score
      return 0.5;
    }
  }

  // ==========================================================================
  // Enhanced Health and Status Methods
  // ==========================================================================

  /**
   * Check events API health with comprehensive diagnostics
   * Implements Requirements 4.3, 4.4
   */
  async checkEventsApiHealth(): Promise<ApiHealthStatus> {
    const startTime = Date.now();
    
    try {
      // Simple health check using events endpoint with minimal parameters
      const response = await fetch(`${this.gammaApiUrl}/events?limit=1`, {
        method: 'GET',
        headers: {
          'User-Agent': 'TradeWizard-EventClient/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });

      const responseTime = Date.now() - startTime;
      const healthy = response.ok;
      
      if (healthy) {
        this.logger.debug(`[EnhancedEventPolymarketClient] Health check passed in ${responseTime}ms`);
      } else {
        this.logger.warn(`[EnhancedEventPolymarketClient] Health check failed: ${response.status} ${response.statusText}`);
      }
      
      return {
        healthy,
        responseTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error({ error: (error as Error).message, responseTime }, 
        '[EnhancedEventPolymarketClient] Health check failed with exception');
      
      return {
        healthy: false,
        responseTime,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get current rate limit status with enhanced metrics
   */
  getRateLimitStatus(): RateLimitStatus {
    // Refill tokens based on time elapsed
    this.refillTokens();

    const currentUsage = this.rateLimiter.maxTokens - this.rateLimiter.tokens;
    const usagePercentage = (currentUsage / this.rateLimiter.maxTokens) * 100;

    return {
      tokensRemaining: Math.floor(this.rateLimiter.tokens),
      resetTime: Date.now() + ((this.rateLimiter.maxTokens - this.rateLimiter.tokens) / this.adaptiveRefillRate) * 1000,
      requestsInWindow: Math.floor(currentUsage),
      windowSizeMs: 10000, // 10 seconds for events API
    };
  }

  /**
   * Get comprehensive client status including circuit breaker and rate limiter
   */
  getClientStatus(): {
    circuitBreaker: CircuitBreakerStats;
    rateLimiter: RateLimitStatus;
    cache: {
      size: number;
      entries: string[];
    };
    health: {
      isHealthy: boolean;
      lastHealthCheck?: number;
    };
    validation: {
      enabled: boolean;
      strictMode: boolean;
      partialDataSupport: boolean;
    };
  } {
    return {
      circuitBreaker: this.getCircuitBreakerStats(),
      rateLimiter: this.getRateLimitStatus(),
      cache: {
        size: this.fallbackCache.size,
        entries: Array.from(this.fallbackCache.keys()),
      },
      health: {
        isHealthy: this.circuitState === 'CLOSED',
        lastHealthCheck: Date.now(),
      },
      validation: {
        enabled: true,
        strictMode: false,
        partialDataSupport: true,
      },
    };
  }

  /**
   * Reset circuit breaker manually (for testing/recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.lastFailureTime = 0;
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    this.callHistory = [];
    
    this.logger.info('[EnhancedEventPolymarketClient] Circuit breaker manually reset');
  }

  /**
   * Reset rate limiter manually (for testing/recovery)
   */
  resetRateLimiter(): void {
    this.rateLimiter.tokens = this.rateLimiter.maxTokens;
    this.rateLimiter.lastRefill = Date.now();
    this.usageHistory = [];
    
    this.logger.info('[EnhancedEventPolymarketClient] Rate limiter manually reset');
  }

  /**
   * Clear fallback cache
   */
  clearCache(): void {
    this.fallbackCache.clear();
    this.logger.info('[EnhancedEventPolymarketClient] Fallback cache cleared');
  }

  // ==========================================================================
  // Event Validation Methods
  // ==========================================================================

  /**
   * Validate event data using enhanced validation schemas
   * Implements Requirements 2.1, 2.2, 2.3, 7.1, 7.2, 7.5
   */
  validateEventData(
    data: unknown,
    options: Partial<EventParsingOptions> = {}
  ): EventValidationResult<ValidatedPolymarketEvent> {
    return validatePolymarketEvent(data, {
      strict: false,
      allowPartialData: true,
      skipMalformedMarkets: true,
      logWarnings: true,
      ...options,
    });
  }

  /**
   * Validate multiple events data using enhanced validation schemas
   * Implements Requirements 2.1, 2.2, 2.4, 7.1, 7.2, 7.5
   */
  validateEventsData(
    data: unknown,
    options: Partial<EventParsingOptions> = {}
  ): EventValidationResult<ValidatedEventsApiResponse> {
    return validatePolymarketEvents(data, {
      strict: false,
      allowPartialData: true,
      skipMalformedMarkets: true,
      logWarnings: true,
      ...options,
    });
  }

  /**
   * Test event validation with sample data
   * Useful for debugging and monitoring validation health
   */
  async testEventValidation(): Promise<{
    success: boolean;
    message: string;
    details?: {
      sampleEventValid: boolean;
      sampleEventsValid: boolean;
      validationErrors?: string[];
    };
  }> {
    try {
      // Test with minimal valid event structure
      const sampleEvent = {
        id: 'test-event-1',
        ticker: 'TEST',
        slug: 'test-event',
        title: 'Test Event',
        description: 'Test event for validation',
        resolutionSource: 'Test source',
        active: true,
        closed: false,
        archived: false,
        new: false,
        featured: false,
        restricted: false,
        startDate: new Date().toISOString(),
        creationDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        liquidity: 1000,
        volume: 5000,
        openInterest: 2000,
        competitive: 0.8,
        volume24hr: 500,
        volume1wk: 2000,
        volume1mo: 8000,
        volume1yr: 50000,
        enableOrderBook: true,
        liquidityClob: 1000,
        negRisk: false,
        commentCount: 5,
        markets: [],
        tags: [],
        cyom: false,
        showAllOutcomes: true,
        showMarketImages: false,
        enableNegRisk: false,
        automaticallyActive: true,
        gmpChartMode: 'default',
        negRiskAugmented: false,
        cumulativeMarkets: false,
        pendingDeployment: false,
        deploying: false,
        requiresTranslation: false,
      };

      const sampleEvents = [sampleEvent];

      // Test single event validation
      const singleEventResult = this.validateEventData(sampleEvent);
      
      // Test multiple events validation
      const multipleEventsResult = this.validateEventsData(sampleEvents);

      const validationErrors: string[] = [];
      
      if (!singleEventResult.success) {
        validationErrors.push(`Single event validation failed: ${singleEventResult.error?.message}`);
      }
      
      if (!multipleEventsResult.success) {
        validationErrors.push(`Multiple events validation failed: ${multipleEventsResult.error?.message}`);
      }

      const allValid = singleEventResult.success && multipleEventsResult.success;

      return {
        success: allValid,
        message: allValid 
          ? 'Event validation is working correctly' 
          : 'Event validation has issues',
        details: {
          sampleEventValid: singleEventResult.success,
          sampleEventsValid: multipleEventsResult.success,
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        },
      };

    } catch (error) {
      return {
        success: false,
        message: `Event validation test failed: ${(error as Error).message}`,
      };
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Calculate cross-market correlations within an event
   */
  private calculateCrossMarketCorrelations(markets: PolymarketMarket[]): MarketCorrelation[] {
    const correlations: MarketCorrelation[] = [];
    
    // Calculate correlations between all market pairs
    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const market1 = markets[i];
        const market2 = markets[j];
        
        // Simple correlation based on price movements (would need historical data for real correlation)
        const correlation = this.calculateSimpleCorrelation(market1, market2);
        
        correlations.push({
          market1Id: market1.id,
          market2Id: market2.id,
          correlationCoefficient: correlation,
          correlationType: correlation > 0.3 ? 'positive' : correlation < -0.3 ? 'negative' : 'neutral',
        });
      }
    }
    
    return correlations;
  }

  /**
   * Calculate simple correlation between two markets (placeholder implementation)
   */
  private calculateSimpleCorrelation(market1: PolymarketMarket, market2: PolymarketMarket): number {
    // This is a simplified correlation calculation
    // In a real implementation, this would use historical price data
    const price1 = parseFloat(market1.outcomePrices?.split(',')[0] || '0.5');
    const price2 = parseFloat(market2.outcomePrices?.split(',')[0] || '0.5');
    
    // Simple correlation based on price similarity
    return 1 - Math.abs(price1 - price2);
  }

  /**
   * Calculate event-level metrics from constituent markets
   */
  private calculateEventMetrics(event: PolymarketEvent): EventMetrics {
    const markets = event.markets;
    
    // Aggregate volume and liquidity
    const totalVolume = markets.reduce((sum, market) => sum + (market.volumeNum || 0), 0);
    const totalLiquidity = markets.reduce((sum, market) => sum + (market.liquidityNum || 0), 0);
    
    // Calculate average competitive score
    const competitiveScores = markets.filter(m => m.competitive !== undefined).map(m => m.competitive!);
    const averageCompetitive = competitiveScores.length > 0 
      ? competitiveScores.reduce((sum, score) => sum + score, 0) / competitiveScores.length 
      : 0;
    
    // Count markets
    const marketCount = markets.length;
    const activeMarketCount = markets.filter(m => m.active).length;
    
    // Calculate volume distribution
    const volumeDistribution: MarketVolumeDistribution[] = markets.map(market => ({
      marketId: market.id,
      volumePercentage: totalVolume > 0 ? ((market.volumeNum || 0) / totalVolume) * 100 : 0,
      liquidityPercentage: totalLiquidity > 0 ? ((market.liquidityNum || 0) / totalLiquidity) * 100 : 0,
    }));
    
    // Calculate price correlations
    const priceCorrelations = this.calculateCrossMarketCorrelations(markets);
    
    return {
      totalVolume,
      totalLiquidity,
      averageCompetitive,
      marketCount,
      activeMarketCount,
      volumeDistribution,
      priceCorrelations,
    };
  }

  // ==========================================================================
  // Enhanced Error Handling and Resilience
  // ==========================================================================

  /**
   * Execute function with comprehensive error handling, circuit breaker, and fallback
   * Implements Requirements 4.1, 4.2, 7.1, 7.2, 7.3, 7.4, 7.5
   */
  private async executeWithErrorHandling<T>(
    fn: () => Promise<T>,
    fallbackFn?: FallbackProvider<T>,
    operationName?: string
  ): Promise<T> {
    const startTime = Date.now();
    
    // Check if circuit allows execution
    if (!this.canMakeRequest()) {
      this.logger.warn(`[EnhancedEventPolymarketClient] Circuit is ${this.circuitState}, execution blocked for ${operationName}`);
      
      // Try fallback if available
      if (fallbackFn) {
        try {
          const fallbackData = await fallbackFn();
          this.logger.info(`[EnhancedEventPolymarketClient] Using fallback data for ${operationName}`);
          return fallbackData;
        } catch (fallbackError) {
          this.logger.error({ error: fallbackError }, `[EnhancedEventPolymarketClient] Fallback also failed for ${operationName}`);
          throw new Error(`Circuit breaker is ${this.circuitState} and fallback failed`);
        }
      }
      
      throw new Error(`Circuit breaker is ${this.circuitState}`);
    }

    // Wait for rate limit
    await this.waitForRateLimit();

    try {
      const result = await fn();
      
      // Record success
      this.recordSuccess();
      
      // Cache successful result for fallback
      if (operationName) {
        this.cacheResult(operationName, result);
        
        // For trending political events, also cache the ranked results
        if (operationName === 'discoverTrendingPoliticalEvents' && Array.isArray(result)) {
          this.cacheResult('trending_political', result);
        }
      }
      
      return result;
      
    } catch (error) {
      // Record failure
      this.recordFailure();
      
      const duration = Date.now() - startTime;
      this.logger.error({ 
        error: (error as Error).message, 
        operationName, 
        duration,
        circuitState: this.circuitState 
      }, '[EnhancedEventPolymarketClient] Operation failed');
      
      // Only try fallback if circuit is OPEN or if this is a retryable error
      const isRetryableError = this.isRetryableError(error as Error);
      
      if (fallbackFn && (this.circuitState === 'OPEN' || isRetryableError)) {
        try {
          const fallbackData = await fallbackFn();
          this.logger.warn(`[EnhancedEventPolymarketClient] Primary function failed, using fallback for ${operationName}`);
          return fallbackData;
        } catch (fallbackError) {
          this.logger.error(`[EnhancedEventPolymarketClient] Both primary and fallback failed for ${operationName}`);
        }
      }
      
      // Re-throw the original error to maintain proper error propagation
      throw error;
    }
  }

  // ==========================================================================
  // Enhanced Circuit Breaker Logic
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
        if (now - this.stateChangeTime >= this.circuitBreakerConfig.resetTimeoutMs) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return this.halfOpenCalls < this.circuitBreakerConfig.halfOpenMaxCalls;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   */
  private recordSuccess(): void {
    const now = Date.now();
    
    this.successCount++;
    this.totalCalls++;
    this.addToCallHistory(now, true);
    
    if (this.circuitState === 'HALF_OPEN') {
      this.halfOpenCalls++;
      this.halfOpenSuccesses++;
      
      // Check if we have enough successes to close the circuit
      if (this.halfOpenSuccesses >= this.circuitBreakerConfig.successThreshold) {
        this.transitionToClosed();
      }
    }
    
    this.logger.debug(`[EnhancedEventPolymarketClient] Recorded success (state: ${this.circuitState})`);
  }

  /**
   * Record a failed request
   */
  private recordFailure(): void {
    const now = Date.now();
    
    this.failureCount++;
    this.totalCalls++;
    this.lastFailureTime = now;
    this.addToCallHistory(now, false);
    
    if (this.circuitState === 'HALF_OPEN') {
      this.halfOpenCalls++;
      // Any failure in half-open state opens the circuit
      this.transitionToOpen();
    } else if (this.circuitState === 'CLOSED') {
      // Check if we should open the circuit
      this.checkFailureThreshold();
    }
    
    this.logger.debug(`[EnhancedEventPolymarketClient] Recorded failure (state: ${this.circuitState})`);
  }

  /**
   * Add call result to sliding window history
   */
  private addToCallHistory(timestamp: number, success: boolean): void {
    this.callHistory.push({ timestamp, success });
    
    // Remove old entries outside monitoring period
    const cutoff = timestamp - this.circuitBreakerConfig.monitoringPeriod;
    this.callHistory = this.callHistory.filter(entry => entry.timestamp > cutoff);
  }

  /**
   * Check if failure threshold is exceeded
   */
  private checkFailureThreshold(): void {
    const now = Date.now();
    const cutoff = now - this.circuitBreakerConfig.monitoringPeriod;
    
    // Get recent calls within monitoring period
    const recentCalls = this.callHistory.filter(entry => entry.timestamp > cutoff);
    
    // Check if we have enough volume to make a decision
    if (recentCalls.length < this.circuitBreakerConfig.volumeThreshold) {
      // For low volume, use simple failure count threshold
      if (this.failureCount >= this.circuitBreakerConfig.failureThreshold) {
        this.transitionToOpen();
      }
      return;
    }
    
    // Calculate failure rate
    const failures = recentCalls.filter(entry => !entry.success).length;
    const failureRate = failures / recentCalls.length;
    
    // Check if failure rate exceeds threshold
    if (failures >= this.circuitBreakerConfig.failureThreshold || failureRate > 0.5) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.circuitState;
    this.circuitState = 'CLOSED';
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    
    this.logger.info(`[EnhancedEventPolymarketClient] Circuit breaker state transition: ${previousState} -> ${this.circuitState}`);
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.circuitState;
    this.circuitState = 'OPEN';
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    
    this.logger.warn(`[EnhancedEventPolymarketClient] Circuit breaker state transition: ${previousState} -> ${this.circuitState}`);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.circuitState;
    this.circuitState = 'HALF_OPEN';
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    
    this.logger.info(`[EnhancedEventPolymarketClient] Circuit breaker state transition: ${previousState} -> ${this.circuitState}`);
  }

  /**
   * Get comprehensive circuit breaker statistics
   */
  getCircuitBreakerStats(): CircuitBreakerStats {
    const now = Date.now();
    const cutoff = now - this.circuitBreakerConfig.monitoringPeriod;
    
    // Calculate failure rate from recent calls
    const recentCalls = this.callHistory.filter(entry => entry.timestamp > cutoff);
    const recentFailures = recentCalls.filter(entry => !entry.success).length;
    const failureRate = recentCalls.length > 0 ? recentFailures / recentCalls.length : 0;
    
    return {
      state: this.circuitState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      failureRate,
      lastFailureTime: this.lastFailureTime || undefined,
      nextAttemptTime: this.circuitState === 'OPEN' 
        ? this.stateChangeTime + this.circuitBreakerConfig.resetTimeoutMs 
        : undefined,
      halfOpenCalls: this.halfOpenCalls,
      halfOpenSuccesses: this.halfOpenSuccesses,
      stateChangeTime: this.stateChangeTime,
      timeSinceLastStateChange: now - this.stateChangeTime,
    };
  }

  // ==========================================================================
  // Enhanced Rate Limiting (Token Bucket Algorithm with Adaptive Features)
  // ==========================================================================

  /**
   * Update adaptive refill rate based on usage patterns
   */
  private updateAdaptiveRefillRate(): void {
    if (!this.rateLimiterConfig.adaptiveRefill || this.usageHistory.length < 10) {
      return;
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // Filter usage to last hour
    this.usageHistory = this.usageHistory.filter(timestamp => timestamp > oneHourAgo);
    
    const recentUsage = this.usageHistory.length;
    const expectedUsage = this.rateLimiterConfig.refillRate * 3600; // Expected usage per hour
    
    // Adjust refill rate based on usage patterns
    if (recentUsage < expectedUsage * 0.5) {
      // Low usage - increase burst capacity, maintain refill rate
      this.burstCapacity = Math.floor(this.rateLimiterConfig.capacity * this.rateLimiterConfig.burstMultiplier);
    } else if (recentUsage > expectedUsage * 0.8) {
      // High usage - optimize for steady flow
      this.adaptiveRefillRate = Math.min(this.rateLimiterConfig.refillRate * 1.2, this.rateLimiterConfig.refillRate * 2);
      this.burstCapacity = this.rateLimiterConfig.capacity;
    } else {
      // Normal usage - use default settings
      this.adaptiveRefillRate = this.rateLimiterConfig.refillRate;
      this.burstCapacity = this.rateLimiterConfig.capacity;
    }
  }

  /**
   * Refill tokens based on elapsed time with adaptive rate
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.rateLimiter.lastRefill) / 1000; // Convert to seconds
    
    if (elapsed > 0) {
      this.updateAdaptiveRefillRate();
      
      const tokensToAdd = elapsed * this.adaptiveRefillRate;
      const maxCapacity = Math.max(this.rateLimiterConfig.capacity, this.burstCapacity);
      this.rateLimiter.tokens = Math.min(maxCapacity, this.rateLimiter.tokens + tokensToAdd);
      this.rateLimiter.lastRefill = now;
    }
  }

  /**
   * Wait for rate limit token to be available with intelligent throttling
   */
  private async waitForRateLimit(): Promise<void> {
    // Refill tokens based on time elapsed
    this.refillTokens();

    // Check if we're within the rate limit buffer
    const bufferThreshold = (this.rateLimitBuffer / 100) * this.rateLimiter.maxTokens;
    const currentUsage = (this.rateLimiter.maxTokens - this.rateLimiter.tokens) / this.rateLimiter.maxTokens;

    // Apply intelligent throttling based on usage
    if (currentUsage > this.rateLimiterConfig.throttleThreshold) {
      const throttleIntensity = (currentUsage - this.rateLimiterConfig.throttleThreshold) / (1 - this.rateLimiterConfig.throttleThreshold);
      const throttleDelay = Math.floor(throttleIntensity * 2000); // Up to 2 seconds
      
      if (throttleDelay > 0) {
        this.logger.debug(`[EnhancedEventPolymarketClient] Applying throttle delay: ${throttleDelay}ms`);
        await new Promise((resolve) => setTimeout(resolve, throttleDelay));
      }
    }

    if (this.rateLimiter.tokens < 1) {
      // Wait for a token to be available
      const waitTime = (1 / this.adaptiveRefillRate) * 1000; // milliseconds
      this.logger.debug(`[EnhancedEventPolymarketClient] Rate limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.rateLimiter.tokens = 1;
    } else if (this.rateLimiter.tokens < bufferThreshold) {
      // Slow down requests when approaching limit
      const slowdownDelay = 200; // milliseconds
      await new Promise((resolve) => setTimeout(resolve, slowdownDelay));
    }

    // Consume a token
    this.rateLimiter.tokens--;
    
    // Track usage for adaptive refill
    if (this.rateLimiterConfig.adaptiveRefill) {
      this.usageHistory.push(Date.now());
      // Keep only last 1000 entries to prevent memory bloat
      if (this.usageHistory.length > 1000) {
        this.usageHistory = this.usageHistory.slice(-1000);
      }
    }
  }

  // ==========================================================================
  // Enhanced Retry Logic with Exponential Backoff and Jitter
  // ==========================================================================

  /**
   * Fetch with exponential backoff, jitter, and comprehensive error handling
   * @param url - URL to fetch
   * @param maxRetries - Maximum number of retries (default from config)
   * @returns Response data (unvalidated)
   */
  private async fetchWithRetry<T = unknown>(url: string, maxRetries?: number): Promise<T> {
    const retries = maxRetries || this.circuitBreakerConfig.failureThreshold - 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TradeWizard-EventClient/1.0',
          },
          signal: AbortSignal.timeout(15000), // 15 second timeout
        });

        if (!response.ok) {
          const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          const error = new Error(errorMessage);
          
          // Don't retry on client errors (4xx) except 429 (rate limit)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw error;
          }
          
          throw error;
        }

        const data = (await response.json()) as T;
        return data;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        // If this was the last attempt, throw the error
        if (attempt === retries) {
          throw lastError;
        }

        // Calculate backoff with jitter
        const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s
        const jitter = Math.random() * 1000; // 0-1s random jitter
        const delay = baseDelay + jitter;

        this.logger.warn({ 
          attempt: attempt + 1, 
          maxRetries: retries + 1, 
          delay, 
          error: lastError.message,
          url 
        }, '[EnhancedEventPolymarketClient] Request failed, retrying with backoff');

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Retry on network errors, timeouts, and server errors
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /ETIMEDOUT/i,
      /500/,
      /502/,
      /503/,
      /504/,
      /429/, // Rate limit
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  // ==========================================================================
  // Fallback Mechanisms and Graceful Degradation
  // ==========================================================================

  /**
   * Cache successful results for fallback
   */
  private cacheResult(key: string, data: any): void {
    this.fallbackCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });
    
    // Clean up old cache entries
    this.cleanupCache();
  }

  /**
   * Get cached result for fallback
   */
  private getCachedResult<T>(key: string): T | null {
    const cached = this.fallbackCache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.fallbackCache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    
    for (const [key, cached] of this.fallbackCache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.fallbackCache.delete(key);
      }
    }
  }

  /**
   * Get fallback events from cache with validation
   */
  private async getFallbackEvents(cacheKey: string): Promise<PolymarketEvent[]> {
    const cached = this.getCachedResult<unknown>(cacheKey);
    
    if (cached) {
      // Validate cached data before returning
      const validationResult = validatePolymarketEvents(cached, {
        strict: false,
        allowPartialData: true,
        skipMalformedMarkets: true,
        logWarnings: false, // Don't log warnings for cached data
      });

      if (validationResult.success && validationResult.data) {
        this.logger.info(`[EnhancedEventPolymarketClient] Using validated cached fallback events for ${cacheKey}`);
        return validationResult.data;
      } else {
        this.logger.warn({
          cacheKey,
          validationError: validationResult.error?.message,
        }, '[EnhancedEventPolymarketClient] Cached fallback data failed validation');
      }
    }
    
    // Return empty array as last resort
    this.logger.warn(`[EnhancedEventPolymarketClient] No valid cached fallback available for ${cacheKey}`);
    return [];
  }

  /**
   * Get fallback event from cache with validation
   */
  private async getFallbackEvent(eventId: string): Promise<PolymarketEvent> {
    const cached = this.getCachedResult<unknown>(`event_${eventId}`);
    
    if (cached) {
      // Validate cached data before returning
      const validationResult = validatePolymarketEvent(cached, {
        strict: false,
        allowPartialData: true,
        skipMalformedMarkets: true,
        logWarnings: false, // Don't log warnings for cached data
      });

      if (validationResult.success && validationResult.data) {
        this.logger.info(`[EnhancedEventPolymarketClient] Using validated cached fallback event for ${eventId}`);
        return validationResult.data;
      } else {
        this.logger.warn({
          eventId,
          validationError: validationResult.error?.message,
        }, '[EnhancedEventPolymarketClient] Cached fallback event failed validation');
      }
    }
    
    throw new Error(`No valid fallback data available for event ${eventId}`);
  }

  /**
   * Get fallback ranked events from cache with validation
   */
  private async getFallbackRankedEvents(cacheKey: string, limit: number): Promise<RankedEvent[]> {
    const cached = this.getCachedResult<unknown>(cacheKey);
    
    if (cached) {
      // Validate cached data structure
      if (Array.isArray(cached)) {
        const validRankedEvents: RankedEvent[] = [];
        
        for (const item of cached) {
          if (this.isValidRankedEvent(item)) {
            validRankedEvents.push(item as RankedEvent);
          }
        }
        
        if (validRankedEvents.length > 0) {
          this.logger.info(`[EnhancedEventPolymarketClient] Using cached fallback ranked events for ${cacheKey}`);
          return validRankedEvents.slice(0, limit);
        }
      }
    }
    
    // Fallback to regular events and rank them
    try {
      const events = await this.getFallbackEvents(cacheKey.replace('trending_', ''));
      if (events.length > 0) {
        const rankedEvents = this.rankEventsByTrendingScore(events);
        return rankedEvents.slice(0, limit);
      }
    } catch (error) {
      this.logger.warn({ error: (error as Error).message }, 
        `[EnhancedEventPolymarketClient] Failed to create ranked events from fallback for ${cacheKey}`);
    }
    
    // Return empty array as last resort
    this.logger.warn(`[EnhancedEventPolymarketClient] No valid cached fallback available for ranked events ${cacheKey}`);
    return [];
  }

  /**
   * Validate if an object is a valid RankedEvent
   */
  private isValidRankedEvent(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    const rankedEvent = obj as any;
    return (
      rankedEvent.event &&
      typeof rankedEvent.trendingScore === 'number' &&
      rankedEvent.rankingFactors &&
      rankedEvent.marketAnalysis &&
      rankedEvent.multiPeriodAnalysis &&
      rankedEvent.eventQualityMetrics &&
      typeof rankedEvent.event.id === 'string' &&
      // Validate enhanced ranking factors
      typeof rankedEvent.rankingFactors.multiPeriodVolumeScore === 'number' &&
      typeof rankedEvent.rankingFactors.eventQualityScore === 'number' &&
      typeof rankedEvent.rankingFactors.crossMarketCorrelationScore === 'number'
    );
  }

  // ==========================================================================
  // Enhanced Discovery Helper Methods for Task 3.3
  // ==========================================================================

  /**
   * Format date string for API compatibility
   * Ensures dates are in the correct format for the Polymarket API
   */
  private formatDateForApi(dateString: string): string {
    try {
      // Try to parse the date and format it as ISO string
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      return date.toISOString();
    } catch {
      // If parsing fails, return the original string (assume it's already formatted)
      return dateString;
    }
  }

  /**
   * Map enhanced sortBy options to API parameters
   * Handles new sorting options like marketCount and totalVolume
   */
  private mapSortByToApiParameter(sortBy: string): string {
    const sortMapping: Record<string, string> = {
      'volume24hr': 'volume24hr',
      'liquidity': 'liquidity',
      'competitive': 'competitive',
      'createdAt': 'createdAt',
      'id': 'id',
      'marketCount': 'market_count', // Map to API parameter
      'totalVolume': 'volume', // Map to total volume
    };

    return sortMapping[sortBy] || sortBy;
  }

  /**
   * Apply client-side filtering for enhanced options not supported by API
   * Handles advanced filtering that the API doesn't support natively
   */
  private applyClientSideFiltering(events: PolymarketEvent[], options: EventDiscoveryOptions): PolymarketEvent[] {
    let filteredEvents = [...events];

    // Filter by market count if specified
    if (options.minMarkets !== undefined) {
      filteredEvents = filteredEvents.filter(event => 
        (event.markets?.length || 0) >= options.minMarkets!
      );
    }

    if (options.maxMarkets !== undefined) {
      filteredEvents = filteredEvents.filter(event => 
        (event.markets?.length || 0) <= options.maxMarkets!
      );
    }

    // Apply enhanced sorting if needed (for options not handled by API)
    if (options.sortBy === 'marketCount' || options.sortBy === 'totalVolume') {
      filteredEvents = this.applySortingClientSide(filteredEvents, options.sortBy, options.sortOrder);
    }

    return filteredEvents;
  }

  /**
   * Apply client-side sorting for enhanced sort options
   */
  private applySortingClientSide(events: PolymarketEvent[], sortBy: string, sortOrder?: 'asc' | 'desc'): PolymarketEvent[] {
    const sortedEvents = [...events];
    const isAscending = sortOrder === 'asc';

    sortedEvents.sort((a, b) => {
      let valueA: number;
      let valueB: number;

      switch (sortBy) {
        case 'marketCount':
          valueA = a.markets?.length || 0;
          valueB = b.markets?.length || 0;
          break;
        case 'totalVolume':
          valueA = a.volume || 0;
          valueB = b.volume || 0;
          break;
        default:
          return 0; // No sorting for unknown options
      }

      if (isAscending) {
        return valueA - valueB;
      } else {
        return valueB - valueA;
      }
    });

    return sortedEvents;
  }

  /**
   * Add delay utility for batch processing
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Discover events with advanced date range filtering
   * Enhanced method specifically for date range filtering with comprehensive validation
   * Implements Requirements 1.5, 4.3, 4.4
   */
  async discoverEventsWithDateRange(options: {
    startDateMin?: string;
    startDateMax?: string;
    endDateMin?: string;
    endDateMax?: string;
    tagId?: number;
    sortBy?: 'volume24hr' | 'liquidity' | 'competitive' | 'marketCount' | 'totalVolume';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    minMarkets?: number;
    maxMarkets?: number;
  } = {}): Promise<PolymarketEvent[]> {
    return this.executeWithErrorHandling(
      async () => {
        this.logger.info({
          dateRange: {
            startMin: options.startDateMin,
            startMax: options.startDateMax,
            endMin: options.endDateMin,
            endMax: options.endDateMax,
          },
          filters: {
            tagId: options.tagId,
            minMarkets: options.minMarkets,
            maxMarkets: options.maxMarkets,
          },
          sorting: {
            sortBy: options.sortBy,
            sortOrder: options.sortOrder,
          },
        }, '[EnhancedEventPolymarketClient] Discovering events with advanced date range filtering');

        // Use the enhanced discoverPoliticalEvents method with date range options
        const events = await this.discoverPoliticalEvents({
          tagId: options.tagId || this.politicsTagId,
          startDateMin: options.startDateMin,
          startDateMax: options.startDateMax,
          endDateMin: options.endDateMin,
          endDateMax: options.endDateMax,
          sortBy: options.sortBy || 'volume24hr',
          sortOrder: options.sortOrder || 'desc',
          limit: options.limit || 50,
          offset: options.offset || 0,
          minMarkets: options.minMarkets,
          maxMarkets: options.maxMarkets,
          relatedTags: true,
          active: true,
          closed: false,
        });

        this.logger.info({
          totalEvents: events.length,
          dateRangeApplied: !!(options.startDateMin || options.startDateMax || options.endDateMin || options.endDateMax),
          marketCountFiltered: !!(options.minMarkets || options.maxMarkets),
        }, '[EnhancedEventPolymarketClient] Date range discovery completed');

        return events;
      },
      () => this.getFallbackEvents('date_range_discovery'),
      'discoverEventsWithDateRange'
    );
  }

  /**
   * Discover events with advanced sorting options
   * Enhanced method for comprehensive sorting by volume, liquidity, competitive scores, and market count
   * Implements Requirements 1.5, 4.3, 4.4
   */
  async discoverEventsWithAdvancedSorting(options: {
    sortBy: 'volume24hr' | 'liquidity' | 'competitive' | 'marketCount' | 'totalVolume';
    sortOrder?: 'asc' | 'desc';
    tagId?: number;
    limit?: number;
    offset?: number;
    includeAnalysis?: boolean;
  }): Promise<PolymarketEvent[]> {
    return this.executeWithErrorHandling(
      async () => {
        this.logger.info({
          sortBy: options.sortBy,
          sortOrder: options.sortOrder,
          tagId: options.tagId,
          includeAnalysis: options.includeAnalysis,
        }, '[EnhancedEventPolymarketClient] Discovering events with advanced sorting');

        // Fetch events with enhanced sorting
        const events = await this.discoverPoliticalEvents({
          tagId: options.tagId || this.politicsTagId,
          sortBy: options.sortBy,
          sortOrder: options.sortOrder || 'desc',
          limit: options.limit || 50,
          offset: options.offset || 0,
          relatedTags: true,
          active: true,
          closed: false,
        });

        // If analysis is requested, enhance events with market analysis
        if (options.includeAnalysis) {
          const enhancedEvents = events.map(event => {
            if (event.markets && event.markets.length > 0) {
              const marketAnalysis = this.analyzeEventMarkets(event);
              const eventMetrics = this.calculateEventMetrics(event);
              
              return {
                ...event,
                _analysis: {
                  marketAnalysis,
                  eventMetrics,
                  crossMarketCorrelations: this.calculateCrossMarketCorrelations(event.markets),
                },
              } as PolymarketEvent & { _analysis?: any };
            }
            return event;
          });

          this.logger.info({
            totalEvents: enhancedEvents.length,
            eventsWithAnalysis: enhancedEvents.filter(e => (e as any)._analysis).length,
          }, '[EnhancedEventPolymarketClient] Advanced sorting with analysis completed');

          return enhancedEvents;
        }

        this.logger.info({
          totalEvents: events.length,
          sortBy: options.sortBy,
        }, '[EnhancedEventPolymarketClient] Advanced sorting completed');

        return events;
      },
      () => this.getFallbackEvents('advanced_sorting'),
      'discoverEventsWithAdvancedSorting'
    );
  }

  /**
   * Batch fetch events with comprehensive nested market data
   * Enhanced batch fetching with full market analysis and correlation data
   * Implements Requirements 4.3, 4.4
   */
  async fetchEventsBatchWithFullAnalysis(eventIds: string[], options: {
    batchSize?: number;
    maxConcurrency?: number;
    includeCorrelations?: boolean;
    includeMetrics?: boolean;
    includeRanking?: boolean;
  } = {}): Promise<Array<PolymarketEvent & {
    _analysis?: {
      marketAnalysis?: EventMarketAnalysis;
      eventMetrics?: EventMetrics;
      crossMarketCorrelations?: MarketCorrelation[];
      rankingFactors?: any;
    };
  }>> {
    const {
      batchSize = 10,
      maxConcurrency = 5,
      includeCorrelations = true,
      includeMetrics = true,
      includeRanking = false,
    } = options;

    this.logger.info({
      totalEventIds: eventIds.length,
      batchSize,
      maxConcurrency,
      analysisOptions: {
        includeCorrelations,
        includeMetrics,
        includeRanking,
      },
    }, '[EnhancedEventPolymarketClient] Starting batch fetch with full analysis');

    // Use the enhanced fetchEventsBatch method
    const events = await this.fetchEventsBatch(eventIds, {
      batchSize,
      maxConcurrency,
      includeMarkets: true,
      includeAnalysis: true,
    });

    // Enhance with additional analysis if requested
    const enhancedEvents = events.map(event => {
      if (!event.markets || event.markets.length === 0) {
        return event;
      }

      const analysis: any = {};

      if (includeMetrics) {
        analysis.eventMetrics = this.calculateEventMetrics(event);
      }

      if (includeCorrelations) {
        analysis.crossMarketCorrelations = this.calculateCrossMarketCorrelations(event.markets);
      }

      if (includeRanking) {
        const marketAnalysis = this.analyzeEventMarkets(event);
        analysis.marketAnalysis = marketAnalysis;
        
        // Calculate ranking factors for comprehensive analysis
        const multiPeriodAnalysis = this.calculateMultiPeriodAnalysis(event);
        const eventQualityMetrics = this.calculateEventQualityMetrics(event, marketAnalysis);
        analysis.rankingFactors = this.calculateEnhancedRankingFactors(
          event,
          marketAnalysis,
          multiPeriodAnalysis,
          eventQualityMetrics
        );
      }

      return {
        ...event,
        _analysis: analysis,
      };
    });

    this.logger.info({
      totalEvents: enhancedEvents.length,
      eventsWithAnalysis: enhancedEvents.filter(e => (e as any)._analysis).length,
    }, '[EnhancedEventPolymarketClient] Batch fetch with full analysis completed');

    return enhancedEvents;
  }
}

/**
 * Create an enhanced event-based Polymarket client instance
 */
export function createEnhancedEventPolymarketClient(
  config: EngineConfig['polymarket']
): EnhancedEventPolymarketClient {
  return new EnhancedEventPolymarketClient(config);
}