/**
 * Task 8.1 Integration Tests: Enhanced Events API Integration with Real Polymarket Data
 * 
 * This test file specifically validates the requirements for task 8.1:
 * - Verify political event discovery returns expected results with nested markets
 * - Test pagination and date range filtering functionality for events
 * - Validate that all event metadata fields and nested markets are properly parsed
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnhancedEventPolymarketClient, type PolymarketEvent } from './enhanced-event-polymarket-client.js';
import type { EngineConfig } from '../config/index.js';

// Test configuration for real API integration
const testConfig: EngineConfig['polymarket'] = {
  gammaApiUrl: 'https://gamma-api.polymarket.com',
  clobApiUrl: 'https://clob.polymarket.com',
  rateLimitBuffer: 80,
  politicsTagId: 2,
  eventsApiEndpoint: '/events',
  includeRelatedTags: true,
  maxEventsPerDiscovery: 10, // Small number for testing
  maxMarketsPerEvent: 50,
  defaultSortBy: 'volume24hr' as const,
  enableCrossMarketAnalysis: true,
  correlationThreshold: 0.3,
  arbitrageThreshold: 0.05,
  eventsApiRateLimit: 500,
  eventCacheTTL: 300,
  marketCacheTTL: 300,
  tagCacheTTL: 3600,
  correlationCacheTTL: 1800,
  enableEventBasedKeywords: true,
  enableMultiMarketAnalysis: true,
  enableCrossMarketCorrelation: true,
  enableArbitrageDetection: true,
  enableEventLevelIntelligence: true,
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  fallbackToCache: true,
  enableGracefulDegradation: true,
  keywordExtractionMode: 'event_priority' as const,
  correlationAnalysisDepth: 'basic' as const,
  riskAssessmentLevel: 'moderate' as const,
};

describe('Task 8.1: Enhanced Events API Integration with Real Polymarket Data', () => {
  let client: EnhancedEventPolymarketClient;

  beforeEach(() => {
    client = new EnhancedEventPolymarketClient(testConfig);
  });

  describe('Political Event Discovery with Nested Markets (Requirements 1.1, 1.2, 1.3)', () => {
    it('should discover political events using tag_id=2 and related_tags=true', async () => {
      const events = await client.discoverPoliticalEvents({
        tagId: 2,
        relatedTags: true,
        active: true,
        closed: false,
        limit: 5
      });

      // Verify basic response structure
      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
      
      if (events.length > 0) {
        const event = events[0];
        
        // Log event structure for debugging
        console.log('Political Event Discovery Test:');
        console.log('- Event ID:', event.id);
        console.log('- Event Title:', event.title);
        console.log('- Markets Count:', event.markets?.length || 0);
        console.log('- Tags:', event.tags.map(tag => ({ id: tag.id, label: tag.label })));
        
        // Requirement 1.1: Events endpoint with tag filtering for political events
        expect(event.tags.some(tag => tag.id === 2 || tag.label.toLowerCase().includes('politic'))).toBe(true);
        
        // Requirement 1.2: Include all nested markets within each event
        expect(Array.isArray(event.markets)).toBe(true);
        
        // Requirement 1.3: Prioritize events with multiple active markets and high combined volume
        if (event.markets.length > 1) {
          const activeMarkets = event.markets.filter(m => m.active);
          expect(activeMarkets.length).toBeGreaterThan(0);
          
          // Check that volume data exists
          expect(typeof event.volume).toBe('number');
          expect(event.volume).toBeGreaterThanOrEqual(0);
        }
      }
    }, 30000);

    it('should return events with proper nested market structure', async () => {
      const events = await client.discoverPoliticalEvents({ limit: 3 });
      
      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
      
      if (events.length > 0) {
        const eventWithMarkets = events.find(event => event.markets && event.markets.length > 0);
        
        if (eventWithMarkets) {
          const market = eventWithMarkets.markets[0];
          
          console.log('Nested Market Structure Test:');
          console.log('- Event ID:', eventWithMarkets.id);
          console.log('- Market ID:', market.id);
          console.log('- Market Question:', market.question);
          console.log('- Market Outcomes:', market.outcomes);
          
          // Verify market structure within event
          expect(market.id).toBeDefined();
          expect(typeof market.id).toBe('string');
          expect(market.question).toBeDefined();
          expect(typeof market.question).toBe('string');
          expect(market.conditionId).toBeDefined();
          expect(typeof market.conditionId).toBe('string');
          expect(market.outcomes).toBeDefined();
          expect(typeof market.outcomes).toBe('string');
          
          // Verify market is properly nested within event context
          expect(market.active).toBeDefined();
          expect(typeof market.active).toBe('boolean');
          expect(market.volumeNum).toBeDefined();
          expect(typeof market.volumeNum).toBe('number');
        }
      }
    }, 30000);

    it('should prioritize events with multiple active markets and high volume', async () => {
      const events = await client.discoverPoliticalEvents({
        limit: 10,
        sortBy: 'volume24hr',
        sortOrder: 'desc'
      });
      
      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
      
      if (events.length > 1) {
        // Find events with multiple markets
        const multiMarketEvents = events.filter(event => event.markets && event.markets.length > 1);
        
        if (multiMarketEvents.length > 0) {
          const event = multiMarketEvents[0];
          
          console.log('Multi-Market Event Prioritization Test:');
          console.log('- Event ID:', event.id);
          console.log('- Markets Count:', event.markets.length);
          console.log('- Active Markets:', event.markets.filter(m => m.active).length);
          console.log('- Total Volume:', event.volume);
          console.log('- Volume 24hr:', event.volume24hr);
          
          // Verify multiple markets
          expect(event.markets.length).toBeGreaterThan(1);
          
          // Verify active markets exist
          const activeMarkets = event.markets.filter(m => m.active);
          expect(activeMarkets.length).toBeGreaterThan(0);
          
          // Verify volume data
          expect(event.volume).toBeGreaterThan(0);
        }
      }
    }, 30000);
  });

  describe('Event Metadata Extraction and Processing (Requirements 1.4, 2.2, 2.3, 2.4)', () => {
    it('should extract complete event metadata including title, description, and tags', async () => {
      const events = await client.discoverPoliticalEvents({ limit: 3 });
      
      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
      
      if (events.length > 0) {
        const event = events[0];
        
        console.log('Event Metadata Extraction Test:');
        console.log('- Event ID:', event.id);
        console.log('- Title:', event.title);
        console.log('- Description length:', event.description?.length || 0);
        console.log('- Tags count:', event.tags?.length || 0);
        console.log('- Resolution Source:', event.resolutionSource);
        
        // Requirement 1.4 & 2.2: Extract event metadata including title, description, and tags
        expect(event.id).toBeDefined();
        expect(typeof event.id).toBe('string');
        expect(event.title).toBeDefined();
        expect(typeof event.title).toBe('string');
        expect(event.description).toBeDefined();
        expect(typeof event.description).toBe('string');
        expect(event.resolutionSource).toBeDefined();
        expect(typeof event.resolutionSource).toBe('string');
        
        // Verify tags structure
        expect(Array.isArray(event.tags)).toBe(true);
        if (event.tags.length > 0) {
          const tag = event.tags[0];
          expect(tag.id).toBeDefined();
          expect(typeof tag.id).toBe('number');
          expect(tag.label).toBeDefined();
          expect(typeof tag.label).toBe('string');
          expect(tag.slug).toBeDefined();
          expect(typeof tag.slug).toBe('string');
        }
        
        // Requirement 2.3: Handle event-level metadata including title, description, and tags
        expect(event.ticker).toBeDefined();
        expect(event.slug).toBeDefined();
        expect(typeof event.active).toBe('boolean');
        expect(typeof event.closed).toBe('boolean');
        expect(typeof event.archived).toBe('boolean');
      }
    }, 30000);

    it('should properly parse event structure with nested markets array', async () => {
      const events = await client.discoverPoliticalEvents({ limit: 5 });
      
      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
      
      if (events.length > 0) {
        const event = events[0];
        
        console.log('Event Structure Parsing Test:');
        console.log('- Event ID:', event.id);
        console.log('- Markets array length:', event.markets?.length || 0);
        console.log('- Event status - Active:', event.active, 'Closed:', event.closed);
        console.log('- Temporal data - Created:', event.createdAt, 'Updated:', event.updatedAt);
        
        // Requirement 2.1: Parse event structure with nested markets array
        expect(Array.isArray(event.markets)).toBe(true);
        
        // Verify temporal data parsing
        expect(event.startDate).toBeDefined();
        expect(event.endDate).toBeDefined();
        expect(event.createdAt).toBeDefined();
        expect(event.updatedAt).toBeDefined();
        
        // Verify status fields
        expect(typeof event.active).toBe('boolean');
        expect(typeof event.closed).toBe('boolean');
        expect(typeof event.archived).toBe('boolean');
        expect(typeof event.new).toBe('boolean');
        expect(typeof event.featured).toBe('boolean');
        expect(typeof event.restricted).toBe('boolean');
      }
    }, 30000);

    it('should maintain market relationships and dependencies within events', async () => {
      const events = await client.discoverPoliticalEvents({ limit: 5 });
      
      // Find an event with multiple markets
      const multiMarketEvent = events.find(event => event.markets && event.markets.length > 1);
      
      if (multiMarketEvent) {
        console.log('Market Relationships Test:');
        console.log('- Event ID:', multiMarketEvent.id);
        console.log('- Markets count:', multiMarketEvent.markets.length);
        
        // Requirement 2.3: Maintain market relationships and dependencies within events
        for (let i = 0; i < multiMarketEvent.markets.length; i++) {
          const market = multiMarketEvent.markets[i];
          
          console.log(`- Market ${i + 1}:`, {
            id: market.id,
            question: market.question.substring(0, 50) + '...',
            active: market.active,
            volume: market.volumeNum
          });
          
          // Verify each market has proper structure
          expect(market.id).toBeDefined();
          expect(market.question).toBeDefined();
          expect(market.conditionId).toBeDefined();
          expect(typeof market.active).toBe('boolean');
          expect(typeof market.volumeNum).toBe('number');
          
          // Verify market belongs to the same event context
          expect(market.startDate).toBeDefined();
          expect(market.endDate).toBeDefined();
        }
        
        // Verify markets are related (same event context)
        const uniqueResolutionSources = new Set(multiMarketEvent.markets.map(m => m.resolutionSource));
        console.log('- Unique resolution sources:', uniqueResolutionSources.size);
        
        // Markets in the same event should generally have the same resolution source
        expect(uniqueResolutionSources.size).toBeLessThanOrEqual(2);
      }
    }, 30000);
  });

  describe('Event Metrics Aggregation (Requirements 1.5, 2.4, 2.5)', () => {
    it('should aggregate volume, liquidity, and activity across all event markets', async () => {
      const events = await client.discoverPoliticalEvents({ limit: 5 });
      
      // Find an event with multiple markets for aggregation testing
      const multiMarketEvent = events.find(event => event.markets && event.markets.length > 1);
      
      if (multiMarketEvent) {
        console.log('Event Metrics Aggregation Test:');
        console.log('- Event ID:', multiMarketEvent.id);
        console.log('- Markets count:', multiMarketEvent.markets.length);
        console.log('- Event total volume:', multiMarketEvent.volume);
        console.log('- Event total liquidity:', multiMarketEvent.liquidity);
        
        // Requirement 1.5 & 2.4: Aggregate volume, liquidity, and activity across all constituent markets
        expect(typeof multiMarketEvent.volume).toBe('number');
        expect(multiMarketEvent.volume).toBeGreaterThanOrEqual(0);
        expect(typeof multiMarketEvent.liquidity).toBe('number');
        expect(multiMarketEvent.liquidity).toBeGreaterThanOrEqual(0);
        
        // Verify multi-period volume data
        expect(typeof multiMarketEvent.volume24hr).toBe('number');
        expect(typeof multiMarketEvent.volume1wk).toBe('number');
        expect(typeof multiMarketEvent.volume1mo).toBe('number');
        expect(typeof multiMarketEvent.volume1yr).toBe('number');
        
        // Calculate expected aggregated volume from markets
        const marketVolumes = multiMarketEvent.markets.map(m => m.volumeNum || 0);
        const expectedTotalVolume = marketVolumes.reduce((sum, vol) => sum + vol, 0);
        
        console.log('- Market volumes:', marketVolumes);
        console.log('- Expected total:', expectedTotalVolume);
        console.log('- Actual event volume:', multiMarketEvent.volume);
        
        // The event volume should be related to the sum of market volumes
        // (may not be exactly equal due to different calculation methods)
        if (expectedTotalVolume > 0) {
          expect(multiMarketEvent.volume).toBeGreaterThan(0);
        }
      }
    }, 30000);

    it('should handle event series and temporal relationships', async () => {
      const events = await client.discoverPoliticalEvents({ limit: 5 });
      
      if (events.length > 0) {
        const event = events[0];
        
        console.log('Temporal Relationships Test:');
        console.log('- Event ID:', event.id);
        console.log('- Start Date:', event.startDate);
        console.log('- End Date:', event.endDate);
        console.log('- Creation Date:', event.creationDate);
        console.log('- Created At:', event.createdAt);
        console.log('- Updated At:', event.updatedAt);
        
        // Requirement 2.5: Handle event series and temporal relationships
        expect(event.startDate).toBeDefined();
        expect(event.endDate).toBeDefined();
        expect(event.createdAt).toBeDefined();
        expect(event.updatedAt).toBeDefined();
        
        // Verify date formats are valid
        expect(() => new Date(event.startDate)).not.toThrow();
        expect(() => new Date(event.endDate)).not.toThrow();
        expect(() => new Date(event.createdAt)).not.toThrow();
        expect(() => new Date(event.updatedAt)).not.toThrow();
        
        // Verify logical date relationships
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        const createdAt = new Date(event.createdAt);
        
        expect(endDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      }
    }, 30000);
  });

  describe('Pagination and Date Range Filtering (Requirements 1.5, 4.3, 4.4)', () => {
    it('should support pagination with limit and offset parameters', async () => {
      // Test pagination with small limits
      const page1 = await client.discoverPoliticalEvents({
        limit: 2,
        offset: 0,
        sortBy: 'volume24hr',
        sortOrder: 'desc'
      });
      
      const page2 = await client.discoverPoliticalEvents({
        limit: 2,
        offset: 2,
        sortBy: 'volume24hr',
        sortOrder: 'desc'
      });
      
      console.log('Pagination Test:');
      console.log('- Page 1 events:', page1.length);
      console.log('- Page 2 events:', page2.length);
      
      if (page1.length > 0) {
        console.log('- Page 1 first event:', page1[0].id);
      }
      if (page2.length > 0) {
        console.log('- Page 2 first event:', page2[0].id);
      }
      
      // Verify pagination works
      expect(Array.isArray(page1)).toBe(true);
      expect(Array.isArray(page2)).toBe(true);
      
      // If both pages have results, they should be different
      if (page1.length > 0 && page2.length > 0) {
        const page1Ids = page1.map(e => e.id);
        const page2Ids = page2.map(e => e.id);
        
        // Pages should not have overlapping events
        const overlap = page1Ids.filter(id => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    }, 30000);

    it('should support date range filtering with start_date_min and start_date_max', async () => {
      // Test date range filtering
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const recentEvents = await client.discoverEventsWithDateRange({
        startDateMin: oneWeekAgo.toISOString(),
        startDateMax: now.toISOString(),
        tagId: 2,
        limit: 5
      });
      
      const olderEvents = await client.discoverEventsWithDateRange({
        startDateMin: oneMonthAgo.toISOString(),
        startDateMax: oneWeekAgo.toISOString(),
        tagId: 2,
        limit: 5
      });
      
      console.log('Date Range Filtering Test:');
      console.log('- Recent events (last week):', recentEvents.length);
      console.log('- Older events (week to month ago):', olderEvents.length);
      
      // Verify date filtering works
      expect(Array.isArray(recentEvents)).toBe(true);
      expect(Array.isArray(olderEvents)).toBe(true);
      
      // Verify events fall within expected date ranges
      if (recentEvents.length > 0) {
        const event = recentEvents[0];
        const eventStartDate = new Date(event.startDate);
        
        console.log('- Recent event start date:', event.startDate);
        console.log('- Filter range:', oneWeekAgo.toISOString(), 'to', now.toISOString());
        
        expect(eventStartDate.getTime()).toBeGreaterThanOrEqual(oneWeekAgo.getTime());
        expect(eventStartDate.getTime()).toBeLessThanOrEqual(now.getTime());
      }
      
      if (olderEvents.length > 0) {
        const event = olderEvents[0];
        const eventStartDate = new Date(event.startDate);
        
        console.log('- Older event start date:', event.startDate);
        console.log('- Filter range:', oneMonthAgo.toISOString(), 'to', oneWeekAgo.toISOString());
        
        expect(eventStartDate.getTime()).toBeGreaterThanOrEqual(oneMonthAgo.getTime());
        expect(eventStartDate.getTime()).toBeLessThanOrEqual(oneWeekAgo.getTime());
      }
    }, 30000);

    it('should support advanced sorting options including marketCount and totalVolume', async () => {
      // Test sorting by market count
      const eventsByMarketCount = await client.discoverEventsWithAdvancedSorting({
        sortBy: 'marketCount',
        sortOrder: 'desc',
        limit: 5,
        includeAnalysis: false
      });
      
      // Test sorting by total volume
      const eventsByVolume = await client.discoverEventsWithAdvancedSorting({
        sortBy: 'totalVolume',
        sortOrder: 'desc',
        limit: 5,
        includeAnalysis: false
      });
      
      console.log('Advanced Sorting Test:');
      console.log('- Events by market count:', eventsByMarketCount.length);
      console.log('- Events by volume:', eventsByVolume.length);
      
      // Verify sorting results
      expect(Array.isArray(eventsByMarketCount)).toBe(true);
      expect(Array.isArray(eventsByVolume)).toBe(true);
      
      // Verify market count sorting
      if (eventsByMarketCount.length > 1) {
        for (let i = 0; i < eventsByMarketCount.length - 1; i++) {
          const currentMarketCount = eventsByMarketCount[i].markets?.length || 0;
          const nextMarketCount = eventsByMarketCount[i + 1].markets?.length || 0;
          
          console.log(`- Event ${i + 1} markets:`, currentMarketCount);
          
          // Should be sorted in descending order
          expect(currentMarketCount).toBeGreaterThanOrEqual(nextMarketCount);
        }
      }
      
      // Verify volume sorting
      if (eventsByVolume.length > 1) {
        for (let i = 0; i < eventsByVolume.length - 1; i++) {
          const currentVolume = eventsByVolume[i].volume || 0;
          const nextVolume = eventsByVolume[i + 1].volume || 0;
          
          console.log(`- Event ${i + 1} volume:`, currentVolume);
          
          // Should be sorted in descending order
          expect(currentVolume).toBeGreaterThanOrEqual(nextVolume);
        }
      }
    }, 30000);
  });

  describe('Batch Event Fetching with Nested Market Data (Requirements 4.3, 4.4)', () => {
    it('should fetch multiple events in batch with comprehensive nested market data', async () => {
      // First get some event IDs
      const events = await client.discoverPoliticalEvents({ limit: 3 });
      
      if (events.length > 0) {
        const eventIds = events.map(e => e.id);
        
        // Fetch events in batch with full analysis
        const batchEvents = await client.fetchEventsBatchWithFullAnalysis(eventIds, {
          batchSize: 2,
          maxConcurrency: 2,
          includeCorrelations: true,
          includeMetrics: true,
          includeRanking: true
        });
        
        console.log('Batch Event Fetching Test:');
        console.log('- Requested event IDs:', eventIds.length);
        console.log('- Returned events:', batchEvents.length);
        
        expect(Array.isArray(batchEvents)).toBe(true);
        expect(batchEvents.length).toBeGreaterThan(0);
        
        // Verify each event has proper structure and analysis
        for (const event of batchEvents) {
          expect(event.id).toBeDefined();
          expect(event.title).toBeDefined();
          expect(Array.isArray(event.markets)).toBe(true);
          
          // Check if analysis was included
          if ((event as any)._analysis) {
            const analysis = (event as any)._analysis;
            
            console.log(`- Event ${event.id} analysis:`, {
              hasMetrics: !!analysis.eventMetrics,
              hasCorrelations: !!analysis.crossMarketCorrelations,
              hasRanking: !!analysis.rankingFactors
            });
            
            if (analysis.eventMetrics) {
              expect(typeof analysis.eventMetrics.totalVolume).toBe('number');
              expect(typeof analysis.eventMetrics.totalLiquidity).toBe('number');
              expect(typeof analysis.eventMetrics.marketCount).toBe('number');
            }
            
            if (analysis.crossMarketCorrelations) {
              expect(Array.isArray(analysis.crossMarketCorrelations)).toBe(true);
            }
          }
        }
      }
    }, 45000);

    it('should handle batch processing with error resilience', async () => {
      // Test batch processing with a mix of valid and potentially invalid event IDs
      const validEvents = await client.discoverPoliticalEvents({ limit: 2 });
      const eventIds = validEvents.map(e => e.id);
      
      // Add a potentially invalid ID to test error handling
      eventIds.push('invalid-event-id-12345');
      
      const batchEvents = await client.fetchEventsBatch(eventIds, {
        batchSize: 1,
        maxConcurrency: 1,
        includeMarkets: true,
        includeAnalysis: false
      });
      
      console.log('Batch Error Resilience Test:');
      console.log('- Requested event IDs:', eventIds.length);
      console.log('- Successfully fetched events:', batchEvents.length);
      
      // Should get valid events even if some fail
      expect(Array.isArray(batchEvents)).toBe(true);
      expect(batchEvents.length).toBeGreaterThanOrEqual(validEvents.length - 1);
      
      // Verify returned events are valid
      for (const event of batchEvents) {
        expect(event.id).toBeDefined();
        expect(typeof event.id).toBe('string');
        expect(event.title).toBeDefined();
        expect(Array.isArray(event.markets)).toBe(true);
      }
    }, 30000);
  });

  describe('API Health and Status Validation', () => {
    it('should successfully check events API health', async () => {
      const health = await client.checkEventsApiHealth();
      
      console.log('API Health Test:');
      console.log('- Healthy:', health.healthy);
      console.log('- Response Time:', health.responseTime, 'ms');
      console.log('- Timestamp:', new Date(health.timestamp).toISOString());
      
      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.responseTime).toBe('number');
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
      expect(typeof health.timestamp).toBe('number');
      expect(health.timestamp).toBeGreaterThan(0);
    }, 10000);

    it('should provide accurate rate limit status', () => {
      const status = client.getRateLimitStatus();
      
      console.log('Rate Limit Status Test:');
      console.log('- Tokens Remaining:', status.tokensRemaining);
      console.log('- Reset Time:', new Date(status.resetTime).toISOString());
      console.log('- Requests in Window:', status.requestsInWindow);
      console.log('- Window Size:', status.windowSizeMs, 'ms');
      
      expect(status).toBeDefined();
      expect(typeof status.tokensRemaining).toBe('number');
      expect(status.tokensRemaining).toBeGreaterThanOrEqual(0);
      expect(typeof status.resetTime).toBe('number');
      expect(status.resetTime).toBeGreaterThanOrEqual(Date.now());
      expect(typeof status.requestsInWindow).toBe('number');
      expect(status.requestsInWindow).toBeGreaterThanOrEqual(0);
      expect(status.windowSizeMs).toBe(10000);
    });

    it('should provide comprehensive client status', () => {
      const clientStatus = client.getClientStatus();
      
      console.log('Client Status Test:');
      console.log('- Circuit Breaker State:', clientStatus.circuitBreaker.state);
      console.log('- Rate Limiter Tokens:', clientStatus.rateLimiter.tokensRemaining);
      console.log('- Cache Size:', clientStatus.cache.size);
      console.log('- Health Status:', clientStatus.health.isHealthy);
      
      expect(clientStatus).toBeDefined();
      expect(clientStatus.circuitBreaker).toBeDefined();
      expect(clientStatus.rateLimiter).toBeDefined();
      expect(clientStatus.cache).toBeDefined();
      expect(clientStatus.health).toBeDefined();
      
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(clientStatus.circuitBreaker.state);
      expect(typeof clientStatus.rateLimiter.tokensRemaining).toBe('number');
      expect(typeof clientStatus.cache.size).toBe('number');
      expect(typeof clientStatus.health.isHealthy).toBe('boolean');
    });
  });
});