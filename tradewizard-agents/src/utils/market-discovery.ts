/**
 * Market Discovery Engine
 *
 * This module discovers and ranks trending political markets from Polymarket.
 * Enhanced to use event-based discovery with proper Gamma API events endpoint,
 * while maintaining backward compatibility with existing interfaces.
 * 
 * Features:
 * - Event-based discovery using Polymarket's events API with nested markets
 * - Event-level tag discovery replacing hardcoded political keywords
 * - Cross-market analysis and correlation detection within events
 * - Backward compatibility with existing MarketDiscoveryEngine interface
 * - Enhanced ranking algorithm incorporating event-level metrics
 */

import type { EngineConfig } from '../config/index.js';
import { 
  createEnhancedEventPolymarketClient,
  type EnhancedEventPolymarketClient,
  type PolymarketEvent,
  type RankedEvent,
} from './enhanced-event-polymarket-client.js';
import { 
  EventMultiMarketKeywordExtractor,
} from './event-multi-market-keyword-extractor.js';
import type { EventKeywords } from '../models/types.js';
import { getLogger } from './logger.js';

const logger = getLogger();

// ============================================================================
// Types - Maintaining Backward Compatibility
// ============================================================================

/**
 * Raw market data from Polymarket API (backward compatibility)
 * Enhanced to support both individual markets and markets within events
 */
export interface PolymarketMarket {
  conditionId: string;
  question: string;
  description: string;
  endDate: string;
  createdAt?: string;
  slug?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  volume?: string;
  volume24hr?: number;
  liquidity: string;
  trades24h?: number;
  active: boolean;
  closed: boolean;
  // Enhanced fields for event-based analysis
  id?: string;
  volumeNum?: number;
  liquidityNum?: number;
  competitive?: number;
  eventId?: string;
  eventTitle?: string;
  eventSlug?: string;
  eventIcon?: string;
  // Frontend-style fields for consistency
  acceptingOrders?: boolean;
  clobTokenIds?: string;
  tags?: Array<{ id: string; label: string }>;
  // Legacy snake_case fields for backward compatibility
  condition_id?: string;
  end_date_iso?: string;
  created_at?: string;
  market_slug?: string;
  outcome_prices?: string[];
  volume_24h?: number | string;
  trades_24h?: number;
  // Internal context for enhanced processing
  _eventContext?: {
    event: PolymarketEvent;
    marketAnalysis: any;
    eventKeywords: EventKeywords | null;
    eventTags: string[];
    totalEventVolume: number;
    totalEventLiquidity: number;
    marketCount: number;
    crossMarketCorrelations: number;
  };
  [key: string]: unknown;
}

/**
 * Market with calculated ranking score (backward compatibility)
 * Enhanced with event-level context and cross-market analysis
 */
export interface RankedMarket {
  conditionId: string;
  question: string;
  description: string;
  trendingScore: number;
  volume24h: number;
  liquidity: number;
  marketSlug: string;
  // Enhanced fields for event-based analysis
  eventId?: string;
  eventTitle?: string;
  eventContext?: {
    totalEventVolume: number;
    totalEventLiquidity: number;
    marketCount: number;
    eventTags: string[];
    crossMarketCorrelations: number;
  };
}

// ============================================================================
// Market Discovery Engine Interface - Maintaining Backward Compatibility
// ============================================================================

export interface MarketDiscoveryEngine {
  /**
   * Discover and select top trending markets
   * @param limit - Maximum number of markets to select
   * @returns Selected markets with ranking scores
   */
  discoverMarkets(limit: number): Promise<RankedMarket[]>;

  /**
   * Fetch all active political markets from Polymarket
   * Enhanced to use event-based discovery while maintaining interface
   */
  fetchPoliticalMarkets(): Promise<PolymarketMarket[]>;

  /**
   * Rank markets by trending score
   * Enhanced with event-level context and cross-market analysis
   */
  rankMarkets(markets: PolymarketMarket[]): RankedMarket[];
}

/**
 * Enhanced Market Discovery Engine Implementation
 * 
 * Replaces hardcoded political keywords with event-based tag discovery
 * while maintaining backward compatibility with existing interfaces.
 * 
 * Key enhancements:
 * - Uses Polymarket events API with tag_id=2 for political events
 * - Leverages event-level metadata and cross-market analysis
 * - Maintains existing interface for seamless integration
 * - Enhanced ranking algorithm with event-level metrics
 */
export class PolymarketDiscoveryEngine implements MarketDiscoveryEngine {
  private readonly eventClient: EnhancedEventPolymarketClient;
  private readonly keywordExtractor: EventMultiMarketKeywordExtractor;
  private readonly config: EngineConfig['polymarket'];

  constructor(config: EngineConfig['polymarket'], opikHandler?: any) {
    this.config = config;
    this.eventClient = createEnhancedEventPolymarketClient(config);
    this.keywordExtractor = new EventMultiMarketKeywordExtractor(config.keywordExtractionMode, {
      opikHandler,
    });
    
    logger.info({
      politicsTagId: config.politicsTagId,
      enableEventBasedKeywords: config.enableEventBasedKeywords,
      enableCrossMarketAnalysis: config.enableCrossMarketAnalysis,
    }, '[PolymarketDiscoveryEngine] Initialized with enhanced event-based discovery');
  }

  /**
   * Discover and select top trending markets using frontend-matching approach
   * Enhanced to use the same trending logic as frontend for consistency
   * Implements Requirements 1.1, 1.2, 1.3 with backward compatibility
   */
  async discoverMarkets(limit: number): Promise<RankedMarket[]> {
    logger.info({ limit }, '[PolymarketDiscoveryEngine] Starting trending market discovery (frontend-matching approach)');

    try {
      // Use the same trending markets approach as frontend
      const trendingMarkets = await this.fetchTrendingMarketsFromEvents(limit * 2); // Fetch more for better selection

      // Rank markets using enhanced algorithm with event context
      const rankedMarkets = this.rankMarkets(trendingMarkets);

      // Select top N markets
      const selectedMarkets = rankedMarkets.slice(0, limit);

      logger.info({
        marketsProcessed: trendingMarkets.length,
        finalSelection: selectedMarkets.length,
      }, '[PolymarketDiscoveryEngine] Trending market discovery completed (frontend-matching approach)');

      return selectedMarkets;
    } catch (error) {
      logger.error({ error: (error as Error).message }, 
        '[PolymarketDiscoveryEngine] Trending approach failed, falling back to enhanced event-based discovery');
      
      try {
        // Fallback to enhanced event-based discovery
        const rankedEvents = await this.eventClient.discoverTrendingPoliticalEvents(
          Math.ceil(limit * 1.5) // Fetch more events to ensure enough markets after filtering
        );

        // Convert events to markets while preserving event context
        const marketsWithEventContext = await this.convertEventsToMarkets(rankedEvents);

        // Rank markets using enhanced algorithm with event context
        const rankedMarkets = this.rankMarketsWithEventContext(marketsWithEventContext);

        // Select top N markets
        const selectedMarkets = rankedMarkets.slice(0, limit);

        logger.info({
          eventsProcessed: rankedEvents.length,
          marketsGenerated: marketsWithEventContext.length,
          finalSelection: selectedMarkets.length,
        }, '[PolymarketDiscoveryEngine] Enhanced event-based discovery completed');

        return selectedMarkets;
      } catch (enhancedError) {
        logger.error({ error: (enhancedError as Error).message }, 
          '[PolymarketDiscoveryEngine] Enhanced discovery failed, falling back to legacy approach');
        
        // Final fallback to legacy approach for backward compatibility
        return this.discoverMarketsLegacy(limit);
      }
    }
  }

  /**
   * Fetch all active political markets using trending events approach
   * Enhanced to use the same approach as frontend for consistency
   * Implements Requirements 1.1, 1.2, 1.3 while maintaining interface compatibility
   */
  /**
     * Fetch all active political markets using direct /markets endpoint
     * Enhanced to use direct market fetching instead of event-based approach
     * Implements Requirements 1.1, 9.1, 9.2 while maintaining interface compatibility
     */
    async fetchPoliticalMarkets(): Promise<PolymarketMarket[]> {
      logger.info('[PolymarketDiscoveryEngine] Fetching political markets using direct /markets endpoint');

      try {
        // Use the new direct markets approach
        const markets = await this.fetchTrendingMarketsDirectly(this.config.maxEventsPerDiscovery || 100);

        logger.info({
          marketsFound: markets.length,
        }, '[PolymarketDiscoveryEngine] Political markets fetched using direct /markets endpoint');

        return markets;
      } catch (error) {
        logger.error({ error: (error as Error).message }, 
          '[PolymarketDiscoveryEngine] Direct markets approach failed, falling back to events-based approach');

        try {
          // Fallback to events-based discovery
          const markets = await this.fetchTrendingMarketsFromEvents(this.config.maxEventsPerDiscovery || 100);

          logger.info({
            marketsFound: markets.length,
          }, '[PolymarketDiscoveryEngine] Political markets fetched using fallback events approach');

          return markets;
        } catch (eventsError) {
          logger.error({ error: (eventsError as Error).message }, 
            '[PolymarketDiscoveryEngine] Events approach failed, falling back to enhanced event-based approach');

          try {
            // Second fallback to enhanced event-based discovery
            const events = await this.eventClient.discoverPoliticalEvents({
              tagId: this.config.politicsTagId,
              relatedTags: this.config.includeRelatedTags,
              active: true,
              closed: false,
              limit: this.config.maxEventsPerDiscovery,
              sortBy: this.config.defaultSortBy,
              sortOrder: 'desc',
            });

            // Extract all markets from events
            const markets = this.extractMarketsFromEvents(events);

            logger.info({
              eventsFound: events.length,
              marketsExtracted: markets.length,
            }, '[PolymarketDiscoveryEngine] Political markets fetched using enhanced event-based discovery');

            return markets;
          } catch (enhancedError) {
            logger.error({ error: (enhancedError as Error).message }, 
              '[PolymarketDiscoveryEngine] Enhanced event-based fetch failed, falling back to legacy approach');

            // Final fallback to legacy approach for backward compatibility
            return this.fetchPoliticalMarketsLegacy();
          }
        }
      }
    }

  /**
   * Rank markets by trending score with enhanced event-level analysis
   * Implements Requirements 5.1, 5.2, 5.3 with backward compatibility
   */
  rankMarkets(markets: PolymarketMarket[]): RankedMarket[] {
    logger.debug({ marketCount: markets.length }, 
      '[PolymarketDiscoveryEngine] Ranking markets with enhanced algorithm');

    // Enhanced ranking with event context when available
    const rankedMarkets = markets.map((market) => {
      const trendingScore = this.calculateEnhancedTrendingScore(market);
      // Handle both camelCase and snake_case for backward compatibility
      const volume24h = market.volume24hr || 
                       parseFloat(market.volume_24h as string || '0') || 
                       parseFloat(market.volume || '0');
      const liquidity = parseFloat(market.liquidity || '0');

      const rankedMarket: RankedMarket = {
        conditionId: market.conditionId || market.condition_id || '',
        question: market.question,
        description: market.description,
        trendingScore,
        volume24h,
        liquidity,
        marketSlug: market.slug || market.market_slug || market.conditionId || market.condition_id || '',
      };

      // Add event context if available
      if (market.eventId && market.eventTitle) {
        rankedMarket.eventId = market.eventId;
        rankedMarket.eventTitle = market.eventTitle;
        rankedMarket.eventContext = this.buildEventContext(market);
      }

      return rankedMarket;
    });

    // Sort by trending score (descending)
    const sorted = rankedMarkets.sort((a, b) => b.trendingScore - a.trendingScore);

    logger.debug({ 
      topScore: sorted[0]?.trendingScore,
      bottomScore: sorted[sorted.length - 1]?.trendingScore,
    }, '[PolymarketDiscoveryEngine] Market ranking completed');

    return sorted;
  }

  // ==========================================================================
  // Enhanced Event-Based Methods
  // ==========================================================================

  /**
   * Convert ranked events to markets with event context
   * Implements Requirements 1.2, 1.4 - event metadata extraction and market relationships
   * Enhanced with event-level deduplication to ensure diverse market selection
   */
  private async convertEventsToMarkets(rankedEvents: RankedEvent[]): Promise<PolymarketMarket[]> {
    const markets: PolymarketMarket[] = [];
    const seenEvents = new Set<string>();

    for (const rankedEvent of rankedEvents) {
      const { event, marketAnalysis } = rankedEvent;
      
      // Skip if we've already processed this event (deduplication)
      if (seenEvents.has(event.id)) {
        logger.debug({ eventId: event.id, eventTitle: event.title }, 
          '[PolymarketDiscoveryEngine] Skipping duplicate event');
        continue;
      }
      
      seenEvents.add(event.id);
      
      // Select the best market from this event (highest volume/liquidity)
      const bestMarket = this.selectBestMarketFromEvent(event);
      
      if (bestMarket) {
        const enhancedMarket: PolymarketMarket = {
          // Backward compatibility fields
          conditionId: bestMarket.conditionId || bestMarket.id,
          question: bestMarket.question,
          description: bestMarket.description || '',
          endDate: bestMarket.endDate,
          createdAt: bestMarket.createdAt,
          slug: bestMarket.slug,
          outcomes: this.parseOutcomes(bestMarket.outcomes),
          outcomePrices: this.parseOutcomePrices(bestMarket.outcomePrices),
          volume: bestMarket.volume,
          volume24hr: bestMarket.volume24hr,
          liquidity: bestMarket.liquidity || '0',
          trades24h: undefined, // Not available in events API
          active: bestMarket.active,
          closed: bestMarket.closed,
          
          // Enhanced fields for event-based analysis
          id: bestMarket.id,
          volumeNum: bestMarket.volumeNum,
          liquidityNum: bestMarket.liquidityNum,
          competitive: bestMarket.competitive,
          eventId: event.id,
          eventTitle: event.title,
          
          // Additional context for enhanced ranking (no keywords here - will be extracted in workflow)
          _eventContext: {
            event,
            marketAnalysis,
            eventKeywords: null, // Will be populated by workflow node
            eventTags: event.tags.map(tag => tag.label),
            totalEventVolume: marketAnalysis.totalVolume,
            totalEventLiquidity: marketAnalysis.totalLiquidity,
            marketCount: marketAnalysis.marketCount,
            crossMarketCorrelations: marketAnalysis.correlations.length,
          }
        };

        markets.push(enhancedMarket);
        
        logger.debug({ 
          eventId: event.id, 
          eventTitle: event.title,
          selectedMarketId: bestMarket.id,
          totalMarketsInEvent: event.markets.length 
        }, '[PolymarketDiscoveryEngine] Selected best market from event');
      }
    }

    logger.info({
      totalEvents: rankedEvents.length,
      uniqueEvents: seenEvents.size,
      marketsSelected: markets.length,
    }, '[PolymarketDiscoveryEngine] Event-level deduplication completed');

    return markets;
  }

  /**
   * Select the best market from an event based on volume and liquidity
   * Prioritizes markets with highest trading activity and liquidity
   */
  private selectBestMarketFromEvent(event: any): any | null {
    if (!event.markets || event.markets.length === 0) {
      return null;
    }
    
    // If only one market, return it
    if (event.markets.length === 1) {
      return event.markets[0];
    }
    
    // Sort markets by volume24hr (descending), then by liquidity (descending)
    const sortedMarkets = event.markets
      .filter((market: any) => market.active && !market.closed)
      .sort((a: any, b: any) => {
        // Primary sort: volume24hr
        const volumeA = a.volume24hr || 0;
        const volumeB = b.volume24hr || 0;
        if (volumeB !== volumeA) {
          return volumeB - volumeA;
        }
        
        // Secondary sort: liquidity
        const liquidityA = parseFloat(a.liquidity || '0');
        const liquidityB = parseFloat(b.liquidity || '0');
        return liquidityB - liquidityA;
      });
    
    return sortedMarkets[0] || null;
  }

  /**
   * Extract markets from events for backward compatibility (DEPRECATED - Legacy Helper)
   * 
   * @deprecated This method is deprecated and kept only for the legacy fallback mechanism.
   * It is used by fetchTrendingMarketsFromEvents() which itself is deprecated.
   * 
   * Once the direct markets approach is proven stable, both this method and
   * fetchTrendingMarketsFromEvents() should be removed.
   * 
   * Implements Requirements 1.2, 2.1 - event structure parsing and market extraction
   */
  private extractMarketsFromEvents(events: PolymarketEvent[]): PolymarketMarket[] {
    const markets: PolymarketMarket[] = [];

    for (const event of events) {
      for (const market of event.markets) {
        const compatibleMarket: PolymarketMarket = {
          // Backward compatibility mapping - support both snake_case and camelCase
          conditionId: market.conditionId || market.id,
          condition_id: market.conditionId || market.id, // Legacy field
          question: market.question,
          description: market.description || '',
          endDate: market.endDate,
          end_date_iso: market.endDate, // Legacy field
          createdAt: market.createdAt,
          created_at: market.createdAt, // Legacy field
          slug: market.slug,
          market_slug: market.slug, // Legacy field
          outcomes: this.parseOutcomes(market.outcomes),
          outcomePrices: this.parseOutcomePrices(market.outcomePrices),
          outcome_prices: this.parseOutcomePrices(market.outcomePrices), // Legacy field
          volume: market.volume,
          volume24hr: market.volume24hr,
          volume_24h: market.volume24hr, // Legacy field
          liquidity: market.liquidity || '0',
          trades24h: undefined, // Not available in events API
          trades_24h: undefined, // Legacy field
          active: market.active,
          closed: market.closed,
          
          // Enhanced fields
          id: market.id,
          volumeNum: market.volumeNum,
          liquidityNum: market.liquidityNum,
          competitive: market.competitive,
          eventId: event.id,
          eventTitle: event.title,
        };

        markets.push(compatibleMarket);
      }
    }

    return markets;
  }

  /**
   * Rank markets with enhanced event context
   * Implements Requirements 5.1, 5.2, 5.3 - comprehensive ranking with event-level metrics
   */
  private rankMarketsWithEventContext(markets: PolymarketMarket[]): RankedMarket[] {
    return markets.map((market) => {
      const trendingScore = this.calculateEnhancedTrendingScore(market);
      // Handle both camelCase and snake_case for backward compatibility
      const volume24h = market.volume24hr || 
                       parseFloat(market.volume_24h as string || '0') || 
                       parseFloat(market.volume || '0');
      const liquidity = parseFloat(market.liquidity || '0');

      const rankedMarket: RankedMarket = {
        conditionId: market.conditionId || market.condition_id || '',
        question: market.question,
        description: market.description,
        trendingScore,
        volume24h,
        liquidity,
        marketSlug: market.slug || market.market_slug || market.conditionId || market.condition_id || '',
        eventId: market.eventId,
        eventTitle: market.eventTitle,
        eventContext: this.buildEventContext(market),
      };

      return rankedMarket;
    }).sort((a, b) => b.trendingScore - a.trendingScore);
  }

  /**
   * Calculate enhanced trending score with event-level context
   * Implements Requirements 5.1, 5.2, 5.3 - enhanced ranking algorithm
   */
  private calculateEnhancedTrendingScore(market: PolymarketMarket): number {
    // Base scoring factors - handle both camelCase and snake_case for compatibility
    const volume24h = market.volume24hr || 
                     parseFloat(market.volume_24h as string || '0') || 
                     parseFloat(market.volume || '0');
    const liquidity = parseFloat(market.liquidity || '0');
    const competitive = market.competitive || 0;

    // Calculate base component scores
    const volumeScore = this.calculateVolumeScore(volume24h);
    const liquidityScore = this.calculateLiquidityScore(liquidity);
    const competitiveScore = competitive;
    const recencyScore = this.calculateRecencyScore(
      market.createdAt || market.created_at || market.endDate || market.end_date_iso || ''
    );

    // Enhanced event-level scoring
    let eventBonus = 0;
    let crossMarketBonus = 0;
    let keywordBonus = 0;

    if (market._eventContext && this.config.enableCrossMarketAnalysis) {
      const eventContext = market._eventContext;
      
      // Event volume bonus (markets in high-volume events get boost)
      if (eventContext.totalEventVolume > 10000) {
        eventBonus += 0.2;
      }
      
      // Multi-market bonus (markets in events with multiple markets get boost)
      if (eventContext.marketCount > 1) {
        crossMarketBonus += Math.min(0.3, eventContext.marketCount * 0.05);
      }
      
      // Cross-market correlation bonus
      if (eventContext.crossMarketCorrelations > 0) {
        crossMarketBonus += Math.min(0.2, eventContext.crossMarketCorrelations * 0.02);
      }
      
      // Event keyword relevance bonus
      if (eventContext.eventKeywords && this.config.enableEventBasedKeywords) {
        const politicalKeywords = eventContext.eventKeywords.ranked
          .filter((kw: any) => kw.source === 'event_tag' || kw.relevanceScore > 0.7)
          .length;
        keywordBonus += Math.min(0.15, politicalKeywords * 0.03);
      }
    }

    // Enhanced weighted scoring formula
    const baseScore = (
      volumeScore * 0.35 +           // Volume remains important
      liquidityScore * 0.25 +        // Liquidity indicates market health
      competitiveScore * 0.20 +      // Competitive markets are more interesting
      recencyScore * 0.20            // Recent markets are more relevant
    );

    const enhancedScore = baseScore + eventBonus + crossMarketBonus + keywordBonus;

    return Math.min(enhancedScore, 10.0); // Cap at 10.0
  }

  /**
   * Build event context for ranked market
   */
  private buildEventContext(market: PolymarketMarket): RankedMarket['eventContext'] | undefined {
    if (!market._eventContext) return undefined;

    const eventContext = market._eventContext;
    return {
      totalEventVolume: eventContext.totalEventVolume,
      totalEventLiquidity: eventContext.totalEventLiquidity,
      marketCount: eventContext.marketCount,
      eventTags: eventContext.eventTags,
      crossMarketCorrelations: eventContext.crossMarketCorrelations,
    };
  }

  /**
   * Parse outcomes string to array for backward compatibility
   */
  private parseOutcomes(outcomes: string): string[] | undefined {
    if (!outcomes) return undefined;
    try {
      return JSON.parse(outcomes);
    } catch {
      return [outcomes]; // Fallback to single outcome
    }
  }

  /**
   * Parse outcome prices string to array for backward compatibility
   */
  private parseOutcomePrices(outcomePrices: string): string[] | undefined {
    if (!outcomePrices) return undefined;
    try {
      return JSON.parse(outcomePrices);
    } catch {
      return [outcomePrices]; // Fallback to single price
    }
  }

  // ==========================================================================
  // DEPRECATED: Legacy Fallback Methods
  // ==========================================================================
  // 
  // These methods are deprecated and maintained only for backward compatibility
  // and as fallback mechanisms. They should be removed once the direct markets
  // approach is proven stable in production.
  //
  // Migration path:
  // 1. Monitor direct markets approach in production
  // 2. Verify fallback is rarely/never triggered
  // 3. Remove all legacy methods in next major version
  // ==========================================================================

  /**
   * Legacy market discovery fallback for backward compatibility (DEPRECATED)
   * 
   * @deprecated Use discoverMarkets() which calls fetchTrendingMarketsDirectly()
   * This method is kept as a fallback mechanism only.
   * 
   * Now uses the same trending markets approach as frontend
   */
  private async discoverMarketsLegacy(limit: number): Promise<RankedMarket[]> {
    logger.warn('[PolymarketDiscoveryEngine] Using legacy market discovery fallback with trending approach');
    
    try {
      // Use the new trending markets approach
      const markets = await this.fetchTrendingMarketsFromEvents(limit * 2); // Fetch more for ranking
      
      // Rank markets by trending score using enhanced algorithm
      const rankedMarkets = this.rankMarkets(markets);

      // Select top N markets
      return rankedMarkets.slice(0, limit);
    } catch (error) {
      logger.error({ error: (error as Error).message }, 
        '[PolymarketDiscoveryEngine] Trending markets approach failed, falling back to legacy keywords');
      
      // Final fallback to legacy keyword-based approach
      const markets = await this.fetchPoliticalMarketsLegacy();
      const rankedMarkets = this.rankMarketsLegacy(markets);
      return rankedMarkets.slice(0, limit);
    }
  }

  /**
   * Legacy political markets fetch for backward compatibility (DEPRECATED)
   * 
   * @deprecated Use fetchPoliticalMarkets() which calls fetchTrendingMarketsDirectly()
   * This method is kept as a fallback mechanism only.
   * 
   * Now uses trending markets approach first, then falls back to keyword filtering
   */
  private async fetchPoliticalMarketsLegacy(): Promise<PolymarketMarket[]> {
    try {
      // Try the new trending markets approach first
      return await this.fetchTrendingMarketsFromEvents(100);
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 
        '[PolymarketDiscoveryEngine] Trending markets failed, using legacy keyword filtering');
      
      // Fallback to legacy keyword-based filtering
      const allMarkets = await this.fetchMarketsWithRetry();
      return this.filterPoliticalMarketsLegacy(allMarkets);
    }
  }

  /**
   * Legacy market ranking for backward compatibility (DEPRECATED)
   * 
   * @deprecated Use rankMarkets() instead
   * This method is kept as a fallback mechanism only.
   */
  private rankMarketsLegacy(markets: PolymarketMarket[]): RankedMarket[] {
    // Calculate trending score for each market using legacy algorithm
    const rankedMarkets = markets.map((market) => {
      const trendingScore = this.calculateTrendingScoreLegacy(market);
      // Handle both camelCase and snake_case for backward compatibility
      const volume24h = market.volume24hr || 
                       parseFloat(market.volume_24h as string || '0') || 
                       parseFloat(market.volume || '0');
      const liquidity = parseFloat(market.liquidity || '0');

      return {
        conditionId: market.conditionId || market.condition_id || '',
        question: market.question,
        description: market.description,
        trendingScore,
        volume24h,
        liquidity,
        marketSlug: market.slug || market.market_slug || market.conditionId || market.condition_id || '',
      };
    });

    // Sort by trending score (descending)
    return rankedMarkets.sort((a, b) => b.trendingScore - a.trendingScore);
  }

  /**
   * Fetch trending markets from Polymarket events endpoint (DEPRECATED - Legacy Fallback)
   * 
   * @deprecated This method is deprecated and kept only as a fallback mechanism.
   * Use fetchTrendingMarketsDirectly() instead for better performance and simpler code.
   * 
   * This implementation fetches events and extracts markets from nested structures.
   * It is maintained as a fallback in case the direct markets endpoint fails.
   * 
   * Migration: Once the direct markets approach is proven stable in production,
   * this method should be removed entirely.
   * 
   * Uses the same filtering and sorting logic as the frontend for consistency
   */
  private async fetchTrendingMarketsFromEvents(limit: number = 100): Promise<PolymarketMarket[]> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    // Constants matching frontend implementation
    const MIN_LIQUIDITY_USD = 1000;
    const MIN_LIQUIDITY_NON_EVERGREEN_USD = 5000;
    const EVERGREEN_TAG_IDS = [2, 21, 120, 596, 1401, 100265, 100639];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Fetch more than requested to account for filtering (matching frontend logic)
        const fetchLimit = Math.max(limit * 3, 100);
        
        // Use events endpoint with politics tag and volume-based sorting (matching frontend)
        let url = `${this.config.gammaApiUrl}/events?closed=false&order=volume24hr&ascending=false&limit=${fetchLimit}&offset=0`;
        url += `&tag_id=${this.config.politicsTagId}&related_tags=true`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000), // 15 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const events = await response.json();

        if (!Array.isArray(events)) {
          throw new Error('Invalid API response: expected array of events');
        }

        // Extract markets from events (matching frontend logic)
        const allMarkets: PolymarketMarket[] = [];

        for (const event of events) {
          if (event.ended || event.closed || !event.active) continue;

          const markets = event.markets || [];

          for (const market of markets) {
            // Add event context to market (matching frontend)
            const enhancedMarket: PolymarketMarket = {
              ...market,
              eventTitle: event.title,
              eventSlug: event.slug,
              eventId: event.id,
              eventIcon: event.image || event.icon,
              // Map frontend fields to backend expected fields
              conditionId: market.conditionId || market.id,
              condition_id: market.conditionId || market.id,
              slug: market.slug,
              market_slug: market.slug,
              volume24hr: market.volume24hr,
              volume_24h: market.volume24hr,
              liquidity: market.liquidity || '0',
              active: market.active !== false,
              closed: market.closed === true,
              endDate: market.endDate,
              end_date_iso: market.endDate,
              createdAt: market.createdAt,
              created_at: market.createdAt,
              outcomes: market.outcomes,
              outcomePrices: market.outcomePrices,
              outcome_prices: market.outcomePrices,
            };

            allMarkets.push(enhancedMarket);
          }
        }

        // Apply same filtering logic as frontend
        const validMarkets = allMarkets.filter((market: PolymarketMarket) => {
          if (market.acceptingOrders === false) return false;
          if (market.closed === true) return false;
          if (!market.clobTokenIds) return false;

          // Check tradeable prices
          if (market.outcomePrices || market.outcome_prices) {
            try {
              const pricesStr = market.outcomePrices || market.outcome_prices;
              const prices = typeof pricesStr === 'string' ? JSON.parse(pricesStr) : pricesStr;
              const hasTradeablePrice = prices.some((price: string) => {
                const priceNum = parseFloat(price);
                return priceNum >= 0.05 && priceNum <= 0.95;
              });
              if (!hasTradeablePrice) return false;
            } catch {
              return false;
            }
          }

          // Apply liquidity filtering (matching frontend logic)
          const marketTagIds = market.tags?.map((t: any) => parseInt(t.id)) || [];
          const hasEvergreenTag = EVERGREEN_TAG_IDS.some((id) =>
            marketTagIds.includes(id)
          );

          const liquidity = parseFloat(market.liquidity || '0');

          if (!hasEvergreenTag && liquidity < MIN_LIQUIDITY_NON_EVERGREEN_USD) {
            return false;
          }
          if (liquidity < MIN_LIQUIDITY_USD) return false;

          return true;
        });

        // Sort by combined liquidity + volume score (matching frontend)
        const sortedMarkets = validMarkets.sort((a: PolymarketMarket, b: PolymarketMarket) => {
          const aScore =
            parseFloat(a.liquidity || '0') +
            parseFloat(a.volume24hr?.toString() || a.volume_24h?.toString() || a.volume || '0');
          const bScore =
            parseFloat(b.liquidity || '0') +
            parseFloat(b.volume24hr?.toString() || b.volume_24h?.toString() || b.volume || '0');
          return bScore - aScore;
        });

        logger.info({
          eventsProcessed: events.length,
          marketsExtracted: allMarkets.length,
          validMarkets: validMarkets.length,
          finalSorted: sortedMarkets.length,
        }, '[PolymarketDiscoveryEngine] Trending markets fetched from events API');

        return sortedMarkets;
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
  /**
   * Fetch trending markets directly from /markets endpoint (NEW IMPLEMENTATION)
   * Replaces event-based fetching with direct market API calls
   * Implements Requirements 1.1, 1.2, 1.5, 5.1-5.6, 6.1-6.3, 7.1-7.5
   */
  /**
   * Fetch trending markets directly from /markets endpoint
   * 
   * This method replaces the event-based fetching approach with direct market queries.
   * It implements comprehensive filtering, sorting, and retry logic with exponential backoff.
   * 
   * Implements Requirements: 1.1, 1.2, 1.5, 5.1-5.6, 6.1, 7.1-7.5
   * 
   * @param limit - Maximum number of markets to return (default: 100)
   * @returns Promise resolving to array of filtered and sorted markets
   * 
   * Filtering thresholds:
   * - MIN_LIQUIDITY_USD: $1,000 minimum for evergreen tag markets
   * - MIN_LIQUIDITY_NON_EVERGREEN_USD: $5,000 minimum for non-evergreen markets
   * - Tradeable price range: 0.05 to 0.95 (5% to 95%)
   * - Evergreen tags: [2, 21, 120, 596, 1401, 100265, 100639] (politics, elections, etc.)
   * 
   * Retry strategy:
   * - Max retries: 3 attempts
   * - Exponential backoff: 2^attempt * 1000ms base delay
   * - Jitter: Random 0-1000ms added to prevent thundering herd
   * - No retry on 400/404 errors (client errors)
   * 
   * Pagination over-fetching:
   * - Fetches 3x requested limit to account for filtering
   * - Minimum fetch limit: 100 markets
   */
  private async fetchTrendingMarketsDirectly(limit: number = 100): Promise<PolymarketMarket[]> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    // Filtering thresholds - see method documentation for details
    const MIN_LIQUIDITY_USD = 1000;
    const MIN_LIQUIDITY_NON_EVERGREEN_USD = 5000;
    const EVERGREEN_TAG_IDS = [2, 21, 120, 596, 1401, 100265, 100639];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Over-fetching strategy: Fetch 3x requested limit to account for filtering
        // This ensures we have enough valid markets after applying quality filters
        const fetchLimit = Math.max(limit * 3, 100);

        // Build URL with direct /markets endpoint
        // Query parameters:
        // - closed=false: Only active markets
        // - order=volume24hr: Sort by 24-hour trading volume
        // - ascending=false: Descending order (highest volume first)
        // - limit: Number of markets to fetch
        // - offset: Pagination offset (currently 0)
        // - tag_id: Filter by category (e.g., politics)
        let url = `${this.config.gammaApiUrl}/markets?closed=false&order=volume24hr&ascending=false&limit=${fetchLimit}&offset=0`;
        url += `&tag_id=${this.config.politicsTagId}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000), // 15 second timeout to prevent hanging requests
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const markets = await response.json();

        // Validate response structure
        if (!Array.isArray(markets)) {
          throw new Error('Invalid API response: expected array of markets');
        }

        // Event context enrichment: Add event metadata to markets when available
        const enrichedMarkets = markets.map(market => this.enrichMarketWithEventContext(market));

        // Apply comprehensive filtering logic to ensure market quality
        const validMarkets = enrichedMarkets.filter((market: PolymarketMarket) => {
          // Filter 1: Exclude markets not accepting orders (trading disabled)
          if (market.acceptingOrders === false) return false;

          // Filter 2: Exclude closed markets (already resolved)
          if (market.closed === true) return false;

          // Filter 3: Exclude markets without CLOB token IDs (not tradeable)
          if (!market.clobTokenIds) return false;

          // Filter 4: Validate tradeable prices
          // Markets must have at least one outcome price between 0.05 and 0.95
          // This ensures there's meaningful trading opportunity (not too certain)
          if (market.outcomePrices || market.outcome_prices) {
            try {
              const pricesStr = market.outcomePrices || market.outcome_prices;
              const prices = typeof pricesStr === 'string' ? JSON.parse(pricesStr) : pricesStr;
              const hasTradeablePrice = prices.some((price: string) => {
                const priceNum = parseFloat(price);
                return priceNum >= 0.05 && priceNum <= 0.95;
              });
              if (!hasTradeablePrice) return false;
            } catch {
              // Skip markets with invalid JSON in outcomePrices, continue processing
              return false;
            }
          }

          // Filter 5: Apply liquidity thresholds based on market tags
          // Evergreen tags (politics, elections) get lower threshold ($1,000)
          // Other markets require higher liquidity ($5,000) for quality
          const marketTagIds = market.tags?.map((t: any) => parseInt(t.id)) || [];
          const hasEvergreenTag = EVERGREEN_TAG_IDS.some((id) => marketTagIds.includes(id));
          const liquidity = parseFloat(market.liquidity || '0');

          // Apply different thresholds based on evergreen tags
          if (!hasEvergreenTag && liquidity < MIN_LIQUIDITY_NON_EVERGREEN_USD) {
            return false;
          }
          if (liquidity < MIN_LIQUIDITY_USD) return false;

          return true;
        });

        // Sort markets by 24h volume (trending activity)
        // This preserves the API's volume-based ordering while ensuring quality through filters
        const sortedMarkets = validMarkets.sort((a: PolymarketMarket, b: PolymarketMarket) => {
          const aVolume = parseFloat(a.volume24hr?.toString() || a.volume_24h?.toString() || a.volume || '0');
          const bVolume = parseFloat(b.volume24hr?.toString() || b.volume_24h?.toString() || b.volume || '0');
          return bVolume - aVolume; // Descending order by volume
        });

        logger.info({
          marketsReceived: markets.length,
          validMarkets: validMarkets.length,
          finalSorted: sortedMarkets.length,
        }, '[PolymarketDiscoveryEngine] Markets fetched directly from /markets API');

        return sortedMarkets;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on client errors (400, 404) - these won't succeed on retry
        if (lastError.message.includes('404') || lastError.message.includes('400')) {
          throw lastError;
        }

        if (attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff with jitter to prevent thundering herd
        // Formula: delay = (2^attempt * 1000ms) + random(0-1000ms)
        // Attempt 0: 1s + jitter, Attempt 1: 2s + jitter, Attempt 2: 4s + jitter
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Enrich market with event context if available
   * 
   * Markets from the /markets endpoint may include an optional 'events' array
   * containing parent event metadata. This method extracts that context and
   * adds it to the market object for display purposes.
   * 
   * Event context includes:
   * - eventTitle: Human-readable event name
   * - eventSlug: URL-friendly event identifier
   * - eventId: Unique event identifier
   * - eventIcon: Event image/icon URL
   * 
   * The method also normalizes field names for backend compatibility,
   * mapping between different naming conventions (camelCase vs snake_case).
   * 
   * Implements Requirements: 1.4, 3.1, 3.2, 3.3
   * 
   * @param market - Raw market object from API
   * @returns Enriched market with event context and normalized field names
   */
  private enrichMarketWithEventContext(market: any): PolymarketMarket {
    // Check if market has events array with at least one event
    if (market.events && Array.isArray(market.events) && market.events.length > 0) {
      // Extract event metadata from first event in array
      const event = market.events[0];

      return {
        ...market,
        // Event context fields - populated from parent event
        eventTitle: event.title,
        eventSlug: event.slug,
        eventId: event.id,
        eventIcon: event.image || event.icon,
        
        // Field name normalization for backend compatibility
        // Maps between camelCase (API) and snake_case (database) conventions
        conditionId: market.conditionId || market.id,
        condition_id: market.conditionId || market.id,
        slug: market.slug,
        market_slug: market.slug,
        volume24hr: market.volume24hr,
        volume_24h: market.volume24hr,
        liquidity: market.liquidity || '0',
        active: market.active !== false,
        closed: market.closed === true,
        endDate: market.endDate,
        end_date_iso: market.endDate,
        createdAt: market.createdAt,
        created_at: market.createdAt,
        outcomes: market.outcomes,
        outcomePrices: market.outcomePrices,
        outcome_prices: market.outcomePrices,
      };
    }

    // No event context available - gracefully handle markets without parent events
    // Event context fields (eventTitle, eventSlug, etc.) will be undefined
    return {
      ...market,
      // Field name normalization only (no event context)
      conditionId: market.conditionId || market.id,
      condition_id: market.conditionId || market.id,
      slug: market.slug,
      market_slug: market.slug,
      volume24hr: market.volume24hr,
      volume_24h: market.volume24hr,
      liquidity: market.liquidity || '0',
      active: market.active !== false,
      closed: market.closed === true,
      endDate: market.endDate,
      end_date_iso: market.endDate,
      createdAt: market.createdAt,
      created_at: market.createdAt,
      outcomes: market.outcomes,
      outcomePrices: market.outcomePrices,
      outcome_prices: market.outcomePrices,
    };
  }

  /**
   * Fetch markets from Polymarket API with retry logic (legacy fallback)
   */
  private async fetchMarketsWithRetry(): Promise<PolymarketMarket[]> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Fetch markets from Gamma API
        // Note: This endpoint may vary based on Polymarket's actual API
        const response = await fetch(`${this.config.gammaApiUrl}/markets?active=true&closed=false&limit=100`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000), // 15 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as PolymarketMarket[] | { markets: PolymarketMarket[] };

        // Handle different response formats
        const markets = Array.isArray(data) ? data : data.markets || [];

        return markets;
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

  /**
   * Filter markets for political event types using legacy keywords (fallback)
   */
  private filterPoliticalMarketsLegacy(markets: PolymarketMarket[]): PolymarketMarket[] {
    // Legacy political keywords for fallback
    const POLITICAL_KEYWORDS = [
      'election', 'president', 'trump', 'biden', 'harris', 'senate', 'congress', 'governor',
      'court', 'supreme court', 'ruling', 'verdict', 'policy', 'legislation', 'bill', 'law',
      'geopolitical', 'war', 'conflict', 'treaty', 'vote', 'ballot', 'referendum', 'impeachment',
      'cabinet', 'minister', 'parliament', 'immigration', 'deport', 'deportation', 'border',
      'tariff', 'trade war', 'sanctions', 'nato', 'ukraine', 'russia', 'china',
    ];

    return markets.filter((market) => {
      // Skip closed or inactive markets
      if (market.closed || !market.active) {
        return false;
      }

      // Check if question or description contains political keywords
      const text = `${market.question} ${market.description}`.toLowerCase();
      return POLITICAL_KEYWORDS.some((keyword) => text.includes(keyword));
    });
  }

  /**
   * Calculate trending score for a market using legacy algorithm (fallback)
   */
  private calculateTrendingScoreLegacy(market: PolymarketMarket): number {
    // Extract metrics - handle both camelCase and snake_case
    const volume24h = market.volume24hr || 
                     parseFloat(market.volume_24h as string || '0') || 
                     parseFloat(market.volume || '0');
    const liquidity = parseFloat(market.liquidity || '0');
    const trades24h = market.trades24h || market.trades_24h || 0;
    const createdAt = market.createdAt || market.created_at || market.endDate || market.end_date_iso || '';

    // Calculate component scores
    const volumeScore = this.calculateVolumeScore(volume24h);
    const liquidityScore = this.calculateLiquidityScore(liquidity);
    const recencyScore = this.calculateRecencyScore(createdAt);
    const activityScore = this.calculateActivityScore(trades24h);

    // Weighted scoring formula
    const trendingScore =
      volumeScore * 0.4 + liquidityScore * 0.3 + recencyScore * 0.2 + activityScore * 0.1;

    return trendingScore;
  }

  // ==========================================================================
  // Shared Helper Methods
  // ==========================================================================

  /**
   * Calculate volume score (log scale)
   */
  private calculateVolumeScore(volume24h: number): number {
    if (volume24h <= 0) return 0;
    return Math.log10(volume24h + 1);
  }

  /**
   * Calculate liquidity score (log scale)
   */
  private calculateLiquidityScore(liquidity: number): number {
    if (liquidity <= 0) return 0;
    return Math.log10(liquidity + 1);
  }

  /**
   * Calculate recency score (exponential decay)
   */
  private calculateRecencyScore(createdAt: string): number {
    try {
      const createdTimestamp = new Date(createdAt).getTime();
      const ageInDays = (Date.now() - createdTimestamp) / (1000 * 60 * 60 * 24);

      // Newer markets get higher scores (exponential decay with 30-day half-life)
      return Math.exp(-ageInDays / 30);
    } catch {
      // If date parsing fails, return neutral score
      return 0.5;
    }
  }

  /**
   * Calculate activity score based on 24h trades
   */
  private calculateActivityScore(trades24h: number): number {
    if (trades24h <= 0) return 0;
    // Normalize to 0-1 scale (100 trades = score of 1)
    return Math.min(1, trades24h / 100);
  }
}

/**
 * Create a market discovery engine instance with enhanced event-based capabilities
 * Maintains backward compatibility while providing enhanced event-based discovery
 */
export function createMarketDiscoveryEngine(
  config: EngineConfig['polymarket'],
  opikHandler?: any
): MarketDiscoveryEngine {
  return new PolymarketDiscoveryEngine(config, opikHandler);
}
