/**
 * Unit Tests for Enhanced Event Polymarket Client Error Handling and Rate Limiting
 * 
 * Tests specific error handling scenarios, circuit breaker behavior, rate limiting,
 * and fallback mechanisms for the events API integration.
 * 
 * Requirements: 4.1, 4.2, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { EnhancedEventPolymarketClient, type PolymarketEvent } from './enhanced-event-polymarket-client.js';
import type { EngineConfig } from '../config/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
vi.mock('./logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Enhanced Event Polymarket Client - Error Handling and Rate Limiting', () => {
  let client: EnhancedEventPolymarketClient;
  let mockConfig: EngineConfig['polymarket'];

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      gammaApiUrl: 'https://gamma-api.polymarket.com',
      clobApiUrl: 'https://clob.polymarket.com',
      rateLimitBuffer: 80,
      politicsTagId: 2,
      eventsApiEndpoint: '/events',
      includeRelatedTags: true,
      maxEventsPerDiscovery: 20,
      maxMarketsPerEvent: 50,
      defaultSortBy: 'volume24hr' as const,
      enableCrossMarketAnalysis: true,
      correlationThreshold: 0.3,
      arbitrageThreshold: 0.05,
      eventsApiRateLimit: 100,
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
      circuitBreakerThreshold: 3,
      fallbackToCache: true,
      enableGracefulDegradation: true,
      keywordExtractionMode: 'event_priority' as const,
      correlationAnalysisDepth: 'basic' as const,
      riskAssessmentLevel: 'moderate' as const,
    };

    client = new EnhancedEventPolymarketClient(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Circuit Breaker Functionality', () => {
    test('should start in CLOSED state', () => {
      const stats = client.getCircuitBreakerStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    test('should transition to OPEN after threshold failures', async () => {
      // Mock failures
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Cause failures to exceed threshold
      for (let i = 0; i < mockConfig.circuitBreakerThreshold + 1; i++) {
        try {
          await client.discoverPoliticalEvents({ limit: 1 });
        } catch {
          // Expected
        }
      }

      const stats = client.getCircuitBreakerStats();
      expect(stats.state).toBe('OPEN');
      expect(stats.failureCount).toBeGreaterThanOrEqual(mockConfig.circuitBreakerThreshold);
    });

    test('should block requests when circuit is OPEN', async () => {
      // Force circuit to open
      mockFetch.mockRejectedValue(new Error('Network error'));
      for (let i = 0; i < mockConfig.circuitBreakerThreshold + 1; i++) {
        try {
          await client.discoverPoliticalEvents({ limit: 1 });
        } catch {
          // Expected
        }
      }

      // Verify circuit is open
      const stats = client.getCircuitBreakerStats();
      expect(stats.state).toBe('OPEN');

      // Should block new requests
      await expect(client.discoverPoliticalEvents({ limit: 1 })).rejects.toThrow('Circuit breaker is OPEN');
    });

    test('should use fallback when circuit is OPEN and fallback is available', async () => {
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'test-event-1',
          title: 'Test Event',
          description: 'Test Description',
          markets: [],
          tags: [],
        } as PolymarketEvent,
      ];

      // First, populate cache with successful request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
        status: 200,
        statusText: 'OK',
      });

      const initialResult = await client.discoverPoliticalEvents({ limit: 1 });
      expect(initialResult).toEqual(mockEvents);

      // Force circuit to open
      mockFetch.mockRejectedValue(new Error('Network error'));
      for (let i = 0; i < mockConfig.circuitBreakerThreshold + 1; i++) {
        try {
          await client.discoverPoliticalEvents({ limit: 1 });
        } catch {
          // Expected
        }
      }

      // Should use cached fallback data
      const fallbackResult = await client.discoverPoliticalEvents({ limit: 1 });
      expect(fallbackResult).toEqual(mockEvents);
    });

    test('should reset circuit breaker manually', () => {
      // Force some failures
      const stats1 = client.getCircuitBreakerStats();
      
      // Manually add some failure history (simulate failures)
      for (let i = 0; i < 5; i++) {
        (client as any).recordFailure();
      }

      const stats2 = client.getCircuitBreakerStats();
      expect(stats2.failureCount).toBeGreaterThan(stats1.failureCount);

      // Reset circuit breaker
      client.resetCircuitBreaker();

      const stats3 = client.getCircuitBreakerStats();
      expect(stats3.state).toBe('CLOSED');
      expect(stats3.failureCount).toBe(0);
      expect(stats3.successCount).toBe(0);
    });
  });

  describe('Rate Limiting Functionality', () => {
    test('should start with full token capacity', () => {
      const status = client.getRateLimitStatus();
      expect(status.tokensRemaining).toBe(mockConfig.eventsApiRateLimit);
    });

    test('should consume tokens on requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ([]),
        status: 200,
        statusText: 'OK',
      });

      const initialStatus = client.getRateLimitStatus();
      
      await client.discoverPoliticalEvents({ limit: 1 });
      
      const finalStatus = client.getRateLimitStatus();
      expect(finalStatus.tokensRemaining).toBeLessThan(initialStatus.tokensRemaining);
    });

    test('should refill tokens over time', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ([]),
        status: 200,
        statusText: 'OK',
      });

      // Consume some tokens
      await client.discoverPoliticalEvents({ limit: 1 });
      const statusAfterRequest = client.getRateLimitStatus();

      // Wait for refill (simulate time passage)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusAfterWait = client.getRateLimitStatus();
      expect(statusAfterWait.tokensRemaining).toBeGreaterThanOrEqual(statusAfterRequest.tokensRemaining);
    });

    test('should reset rate limiter manually', () => {
      // Consume some tokens (simulate)
      (client as any).rateLimiter.tokens = 50;

      const statusBefore = client.getRateLimitStatus();
      expect(statusBefore.tokensRemaining).toBe(50);

      client.resetRateLimiter();

      const statusAfter = client.getRateLimitStatus();
      expect(statusAfter.tokensRemaining).toBe(mockConfig.eventsApiRateLimit);
    });
  });

  describe('Retry Logic and Exponential Backoff', () => {
    test('should retry on retryable errors', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([]),
          status: 200,
          statusText: 'OK',
        });
      });

      const result = await client.discoverPoliticalEvents({ limit: 1 });
      expect(result).toEqual([]);
      expect(callCount).toBe(3); // 2 failures + 1 success
    });

    test('should not retry on non-retryable errors', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({ error: 'Not found' }),
        });
      });

      await expect(client.discoverPoliticalEvents({ limit: 1 })).rejects.toThrow('HTTP 404');
      expect(callCount).toBe(1); // Should not retry 404 errors
    });

    test('should apply exponential backoff between retries', async () => {
      const startTime = Date.now();
      let callCount = 0;

      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([]),
          status: 200,
          statusText: 'OK',
        });
      });

      await client.discoverPoliticalEvents({ limit: 1 });
      
      const totalTime = Date.now() - startTime;
      // Should have taken time for exponential backoff (at least 1s + 2s = 3s with jitter)
      expect(totalTime).toBeGreaterThan(2000); // Allow some variance
    }, 10000);
  });

  describe('Fallback and Cache Mechanisms', () => {
    test('should cache successful responses', async () => {
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'cached-event',
          title: 'Cached Event',
          description: 'This should be cached',
          markets: [],
          tags: [],
        } as PolymarketEvent,
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
        status: 200,
        statusText: 'OK',
      });

      const result = await client.discoverPoliticalEvents({ limit: 1 });
      expect(result).toEqual(mockEvents);

      // Verify cache contains the data
      const clientStatus = client.getClientStatus();
      expect(clientStatus.cache.size).toBeGreaterThan(0);
    });

    test('should clear cache manually', async () => {
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'test-event',
          title: 'Test Event',
          description: 'Test',
          markets: [],
          tags: [],
        } as PolymarketEvent,
      ];

      // Populate cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
        status: 200,
        statusText: 'OK',
      });

      await client.discoverPoliticalEvents({ limit: 1 });

      let clientStatus = client.getClientStatus();
      expect(clientStatus.cache.size).toBeGreaterThan(0);

      // Clear cache
      client.clearCache();

      clientStatus = client.getClientStatus();
      expect(clientStatus.cache.size).toBe(0);
    });
  });

  describe('Health Check and Status', () => {
    test('should perform health check successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const health = await client.checkEventsApiHealth();
      expect(health.healthy).toBe(true);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.timestamp).toBeGreaterThan(0);
    });

    test('should detect unhealthy API', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const health = await client.checkEventsApiHealth();
      expect(health.healthy).toBe(false);
      expect(health.responseTime).toBeGreaterThan(0);
    });

    test('should provide comprehensive client status', () => {
      const status = client.getClientStatus();
      
      expect(status).toHaveProperty('circuitBreaker');
      expect(status).toHaveProperty('rateLimiter');
      expect(status).toHaveProperty('cache');
      expect(status).toHaveProperty('health');
      
      expect(status.circuitBreaker.state).toBe('CLOSED');
      expect(status.rateLimiter.tokensRemaining).toBeGreaterThan(0);
      expect(status.cache.size).toBeGreaterThanOrEqual(0);
      expect(status.health.isHealthy).toBe(true);
    });
  });

  describe('Error Classification', () => {
    test('should classify network errors as retryable', async () => {
      const networkErrors = [
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'network error',
        'timeout',
      ];

      for (const errorMessage of networkErrors) {
        let callCount = 0;
        mockFetch.mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            return Promise.reject(new Error(errorMessage));
          }
          return Promise.resolve({
            ok: true,
            json: async () => ([]),
            status: 200,
            statusText: 'OK',
          });
        });

        await client.discoverPoliticalEvents({ limit: 1 });
        expect(callCount).toBeGreaterThan(1); // Should have retried
        
        // Reset for next iteration
        client.resetCircuitBreaker();
        vi.clearAllMocks();
      }
    });

    test('should classify HTTP server errors as retryable', async () => {
      const serverErrors = [500, 502, 503, 504];

      for (const statusCode of serverErrors) {
        let callCount = 0;
        mockFetch.mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            return Promise.resolve({
              ok: false,
              status: statusCode,
              statusText: `Server Error ${statusCode}`,
              json: async () => ({ error: `HTTP ${statusCode}` }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ([]),
            status: 200,
            statusText: 'OK',
          });
        });

        await client.discoverPoliticalEvents({ limit: 1 });
        expect(callCount).toBeGreaterThan(1); // Should have retried
        
        // Reset for next iteration
        client.resetCircuitBreaker();
        vi.clearAllMocks();
      }
    });

    test('should not retry client errors (4xx except 429)', async () => {
      const clientErrors = [400, 401, 403, 404];

      for (const statusCode of clientErrors) {
        let callCount = 0;
        mockFetch.mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            ok: false,
            status: statusCode,
            statusText: `Client Error ${statusCode}`,
            json: async () => ({ error: `HTTP ${statusCode}` }),
          });
        });

        await expect(client.discoverPoliticalEvents({ limit: 1 })).rejects.toThrow(`HTTP ${statusCode}`);
        expect(callCount).toBe(1); // Should not retry
        
        // Reset for next iteration
        client.resetCircuitBreaker();
        vi.clearAllMocks();
      }
    });
  });

  describe('Batch Operations', () => {
    test('should handle batch operations with partial failures', async () => {
      const eventIds = ['event1', 'event2', 'event3'];
      let callCount = 0;

      mockFetch.mockImplementation(() => {
        callCount++;
        // Fail on second event
        if (callCount === 2) {
          return Promise.reject(new Error('Event not found'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: `event${callCount}`,
            title: `Event ${callCount}`,
            markets: [],
            tags: [],
          }),
          status: 200,
          statusText: 'OK',
        });
      });

      const results = await client.fetchEventsBatch(eventIds);
      
      // Should get 2 successful results (event1 and event3)
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('event1');
      expect(results[1].id).toBe('event3');
    });
  });

  describe('Trending Political Events Discovery', () => {
    test('should discover and rank trending political events', async () => {
      const mockEvents = [
        {
          id: 'event1',
          ticker: 'TRUMP2024',
          slug: 'trump-2024-election',
          title: 'Trump 2024 Election',
          description: 'Will Trump win the 2024 election?',
          resolutionSource: 'Official results',
          active: true,
          closed: false,
          archived: false,
          new: false,
          featured: true,
          restricted: false,
          startDate: '2024-01-01T00:00:00Z',
          creationDate: '2024-01-01T00:00:00Z',
          endDate: '2024-11-05T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z',
          liquidity: 100000,
          volume: 500000,
          openInterest: 200000,
          competitive: 0.85,
          volume24hr: 50000,
          volume1wk: 200000,
          volume1mo: 800000,
          volume1yr: 5000000,
          enableOrderBook: true,
          liquidityClob: 100000,
          negRisk: false,
          commentCount: 150,
          markets: [
            {
              id: 'market1',
              question: 'Will Trump win the 2024 election?',
              conditionId: 'cond1',
              slug: 'trump-win-2024',
              description: 'Market for Trump winning 2024 election',
              resolutionSource: 'Official results',
              active: true,
              closed: false,
              archived: false,
              new: false,
              featured: false,
              restricted: false,
              liquidity: '50000',
              liquidityNum: 50000,
              volume: '250000',
              volumeNum: 250000,
              volume24hr: 25000,
              outcomes: '["Yes", "No"]',
              outcomePrices: '[0.65, 0.35]',
              competitive: 0.85,
              startDate: '2024-01-01T00:00:00Z',
              endDate: '2024-11-05T00:00:00Z',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-15T00:00:00Z',
              marketMakerAddress: '0x123',
              submitted_by: 'user1',
              enableOrderBook: true,
              negRisk: false,
              ready: true,
              funded: true,
              cyom: false,
              pagerDutyNotificationEnabled: false,
              approved: true,
              automaticallyActive: true,
              clearBookOnStart: false,
              seriesColor: '#FF0000',
              showGmpSeries: true,
              showGmpOutcome: true,
              manualActivation: false,
              negRiskOther: false,
              pendingDeployment: false,
              deploying: false,
              rfqEnabled: false,
              holdingRewardsEnabled: false,
              feesEnabled: true,
              requiresTranslation: false,
            },
          ],
          tags: [
            {
              id: 2,
              label: 'Politics',
              slug: 'politics',
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z',
              requiresTranslation: false,
            },
          ],
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
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
        status: 200,
        statusText: 'OK',
      });

      const rankedEvents = await client.discoverTrendingPoliticalEvents(5);

      expect(rankedEvents).toBeDefined();
      expect(Array.isArray(rankedEvents)).toBe(true);
      expect(rankedEvents.length).toBeGreaterThan(0);
      
      // Check that each ranked event has the required structure
      const firstEvent = rankedEvents[0];
      expect(firstEvent).toHaveProperty('event');
      expect(firstEvent).toHaveProperty('trendingScore');
      expect(firstEvent).toHaveProperty('rankingFactors');
      expect(firstEvent).toHaveProperty('marketAnalysis');
      
      // Check ranking factors structure
      expect(firstEvent.rankingFactors).toHaveProperty('totalVolumeScore');
      expect(firstEvent.rankingFactors).toHaveProperty('totalLiquidityScore');
      expect(firstEvent.rankingFactors).toHaveProperty('averageCompetitiveScore');
      expect(firstEvent.rankingFactors).toHaveProperty('marketCountScore');
      expect(firstEvent.rankingFactors).toHaveProperty('recencyScore');
      expect(firstEvent.rankingFactors).toHaveProperty('activityScore');
      
      // Check market analysis structure
      expect(firstEvent.marketAnalysis).toHaveProperty('marketCount');
      expect(firstEvent.marketAnalysis).toHaveProperty('activeMarketCount');
      expect(firstEvent.marketAnalysis).toHaveProperty('totalVolume');
      expect(firstEvent.marketAnalysis).toHaveProperty('totalLiquidity');
      expect(firstEvent.marketAnalysis).toHaveProperty('averageCompetitive');
      
      // Verify trending score is a number
      expect(typeof firstEvent.trendingScore).toBe('number');
      expect(firstEvent.trendingScore).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty events list for trending discovery', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
        status: 200,
        statusText: 'OK',
      });

      const rankedEvents = await client.discoverTrendingPoliticalEvents(5);

      expect(rankedEvents).toBeDefined();
      expect(Array.isArray(rankedEvents)).toBe(true);
      expect(rankedEvents).toHaveLength(0);
    });

    test('should use fallback for trending events when API fails', async () => {
      // First call succeeds to populate cache
      const mockEvents = [
        {
          id: 'cached-event',
          ticker: 'CACHED',
          slug: 'cached-event',
          title: 'Cached Event',
          description: 'Cached event for fallback test',
          resolutionSource: 'Test source',
          active: true,
          closed: false,
          archived: false,
          new: false,
          featured: false,
          restricted: false,
          startDate: '2024-01-01T00:00:00Z',
          creationDate: '2024-01-01T00:00:00Z',
          endDate: '2024-11-05T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z',
          liquidity: 10000,
          volume: 50000,
          openInterest: 20000,
          competitive: 0.7,
          volume24hr: 5000,
          volume1wk: 20000,
          volume1mo: 80000,
          volume1yr: 500000,
          enableOrderBook: true,
          liquidityClob: 10000,
          negRisk: false,
          commentCount: 10,
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
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
        status: 200,
        statusText: 'OK',
      });

      // First call to populate cache
      await client.discoverTrendingPoliticalEvents(1);

      // Second call fails
      mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

      // Should use fallback
      const fallbackEvents = await client.discoverTrendingPoliticalEvents(1);

      expect(fallbackEvents).toBeDefined();
      expect(Array.isArray(fallbackEvents)).toBe(true);
      // Should get fallback data (empty array or cached data)
    });
  });
});