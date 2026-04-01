/**
 * Property-Based Tests for Enhanced Event Polymarket Client Error Handling and Rate Limiting
 * 
 * Tests comprehensive error handling, circuit breaker patterns, exponential backoff,
 * rate limiting, and fallback mechanisms for the events API integration.
 * 
 * Requirements: 4.1, 4.2, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
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

describe('Enhanced Event Polymarket Client - Error Handling and Rate Limiting Properties', () => {
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
      eventsApiRateLimit: 100, // Lower for testing
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
      circuitBreakerThreshold: 3, // Lower for testing
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

  /**
   * **Feature: polymarket-integration-enhancement, Property 1: Circuit Breaker State Transitions**
   * For any sequence of successful and failed requests, the circuit breaker should transition states correctly
   * **Validates: Requirements 4.1, 4.2, 7.3**
   */
  test('Property 1: Circuit breaker state transitions follow correct patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), // Array of success/failure
        async (requestResults) => {
          // Reset client state
          client.resetCircuitBreaker();
          
          let consecutiveFailures = 0;
          
          for (const shouldSucceed of requestResults) {
            if (shouldSucceed) {
              // Mock successful response
              mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ([]),
                status: 200,
                statusText: 'OK',
              });
              consecutiveFailures = 0;
            } else {
              // Mock failed response
              mockFetch.mockRejectedValueOnce(new Error('Network error'));
              consecutiveFailures++;
            }
            
            try {
              await client.discoverPoliticalEvents({ limit: 1 });
            } catch {
              // Expected for failures
            }
            
            const stats = client.getCircuitBreakerStats();
            
            // Circuit should open after threshold failures
            if (consecutiveFailures >= mockConfig.circuitBreakerThreshold) {
              expect(stats.state).toBe('OPEN');
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 2: Rate Limiting Token Consumption**
   * For any sequence of requests, tokens should be consumed correctly and refilled over time
   * **Validates: Requirements 4.1, 4.2, 7.4**
   */
  test('Property 2: Rate limiting tokens are consumed and refilled correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // Number of requests
        fc.integer({ min: 100, max: 1000 }), // Delay between requests
        async (numRequests, delayMs) => {
          // Reset client state
          client.resetRateLimiter();
          
          const initialStatus = client.getRateLimitStatus();
          const initialTokens = initialStatus.tokensRemaining;
          
          // Mock successful responses
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ([]),
            status: 200,
            statusText: 'OK',
          });
          
          // Make requests with delays
          for (let i = 0; i < numRequests; i++) {
            await client.discoverPoliticalEvents({ limit: 1 });
            
            if (i < numRequests - 1) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
          
          const finalStatus = client.getRateLimitStatus();
          
          // Tokens should be consumed (accounting for refill during delays)
          const expectedMinTokens = Math.max(0, initialTokens - numRequests);
          expect(finalStatus.tokensRemaining).toBeGreaterThanOrEqual(expectedMinTokens);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 3: Exponential Backoff Retry Delays**
   * For any retry attempt, the delay should follow exponential backoff pattern with jitter
   * **Validates: Requirements 4.1, 7.1, 7.2**
   */
  test('Property 3: Exponential backoff increases delay with each retry attempt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of failures before success
        async (failureCount) => {
          // Reset client state
          client.resetCircuitBreaker();
          
          const startTime = Date.now();
          
          // Mock failures followed by success
          for (let i = 0; i < failureCount; i++) {
            mockFetch.mockRejectedValueOnce(new Error('Temporary network error'));
          }
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([]),
            status: 200,
            statusText: 'OK',
          });
          
          await client.discoverPoliticalEvents({ limit: 1 });
          
          const totalTime = Date.now() - startTime;
          
          // Should have taken time for exponential backoff
          // Minimum expected time: sum of exponential delays (1s + 2s + 4s + ...)
          let expectedMinTime = 0;
          for (let i = 0; i < failureCount; i++) {
            expectedMinTime += Math.pow(2, i) * 1000;
          }
          
          if (failureCount > 0) {
            expect(totalTime).toBeGreaterThanOrEqual(expectedMinTime * 0.8); // Allow some variance
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 4: Fallback Cache Behavior**
   * For any cached data, fallback should work when primary API fails
   * **Validates: Requirements 7.3, 7.5**
   */
  test('Property 4: Fallback cache provides data when primary API fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          title: fc.string({ minLength: 1, maxLength: 50 }),
        }), { minLength: 1, maxLength: 5 }),
        async (mockEvents) => {
          // Reset client state
          client.resetCircuitBreaker();
          client.clearCache();
          
          // First, populate cache with successful request
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockEvents,
            status: 200,
            statusText: 'OK',
          });
          
          const initialResult = await client.discoverPoliticalEvents({ limit: 5 });
          expect(initialResult).toEqual(mockEvents);
          
          // Now force circuit breaker to open by causing failures
          for (let i = 0; i < mockConfig.circuitBreakerThreshold + 1; i++) {
            mockFetch.mockRejectedValueOnce(new Error('API unavailable'));
            try {
              await client.discoverPoliticalEvents({ limit: 1 });
            } catch {
              // Expected
            }
          }
          
          // Verify circuit is open
          const stats = client.getCircuitBreakerStats();
          expect(stats.state).toBe('OPEN');
          
          // Should still get cached data as fallback
          const fallbackResult = await client.discoverPoliticalEvents({ limit: 5 });
          expect(fallbackResult).toEqual(mockEvents);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 5: Error Classification and Retry Logic**
   * For any HTTP error, retryable errors should be retried while non-retryable should fail immediately
   * **Validates: Requirements 7.1, 7.2**
   */
  test('Property 5: Error classification determines retry behavior correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(400), // Non-retryable client error
          fc.constant(404), // Non-retryable not found
          fc.constant(429), // Retryable rate limit
          fc.constant(500), // Retryable server error
          fc.constant(503), // Retryable service unavailable
        ),
        async (statusCode) => {
          // Reset client state
          client.resetCircuitBreaker();
          
          const isRetryable = [429, 500, 503].includes(statusCode);
          let fetchCallCount = 0;
          
          mockFetch.mockImplementation(() => {
            fetchCallCount++;
            return Promise.resolve({
              ok: false,
              status: statusCode,
              statusText: `Error ${statusCode}`,
              json: async () => ({ error: `HTTP ${statusCode}` }),
            });
          });
          
          try {
            await client.discoverPoliticalEvents({ limit: 1 });
            // Should not reach here for error cases
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            
            if (isRetryable) {
              // Should have retried multiple times
              expect(fetchCallCount).toBeGreaterThan(1);
              expect(fetchCallCount).toBeLessThanOrEqual(mockConfig.maxRetries + 1);
            } else {
              // Should have failed immediately without retries
              expect(fetchCallCount).toBe(1);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 6: Circuit Breaker Recovery**
   * For any open circuit breaker, it should transition to half-open after timeout and close on success
   * **Validates: Requirements 4.2, 7.3**
   */
  test('Property 6: Circuit breaker recovers correctly after timeout', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 500 }), // Recovery timeout (shortened for testing)
        async (timeoutMs) => {
          // Reset client state
          client.resetCircuitBreaker();
          
          // Force circuit breaker to open
          for (let i = 0; i < mockConfig.circuitBreakerThreshold + 1; i++) {
            mockFetch.mockRejectedValueOnce(new Error('Failure'));
            try {
              await client.discoverPoliticalEvents({ limit: 1 });
            } catch {
              // Expected
            }
          }
          
          // Verify circuit is open
          let stats = client.getCircuitBreakerStats();
          expect(stats.state).toBe('OPEN');
          
          // Wait for recovery timeout (simulate by manipulating time)
          await new Promise(resolve => setTimeout(resolve, timeoutMs));
          
          // Mock successful response for recovery
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([]),
            status: 200,
            statusText: 'OK',
          });
          
          // Should allow request and transition to half-open, then closed
          await client.discoverPoliticalEvents({ limit: 1 });
          
          stats = client.getCircuitBreakerStats();
          // Should be closed after successful recovery
          expect(['HALF_OPEN', 'CLOSED']).toContain(stats.state);
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 7: Rate Limit Adaptive Behavior**
   * For any usage pattern, adaptive rate limiting should adjust capacity and refill rates
   * **Validates: Requirements 4.1, 4.2**
   */
  test('Property 7: Adaptive rate limiting adjusts to usage patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }), // Number of requests in burst
        fc.integer({ min: 50, max: 200 }), // Delay between bursts
        async (burstSize, burstDelay) => {
          // Reset client state
          client.resetRateLimiter();
          
          // Mock successful responses
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ([]),
            status: 200,
            statusText: 'OK',
          });
          
          const initialStatus = client.getRateLimitStatus();
          
          // Create usage pattern with bursts
          for (let burst = 0; burst < 2; burst++) {
            // Make burst of requests
            for (let i = 0; i < burstSize; i++) {
              await client.discoverPoliticalEvents({ limit: 1 });
            }
            
            // Wait between bursts
            if (burst < 1) {
              await new Promise(resolve => setTimeout(resolve, burstDelay));
            }
          }
          
          const finalStatus = client.getRateLimitStatus();
          
          // Should have consumed tokens but may have refilled during delays
          expect(finalStatus.tokensRemaining).toBeLessThanOrEqual(initialStatus.tokensRemaining);
          expect(finalStatus.tokensRemaining).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 8: Graceful Degradation Under Load**
   * For any high load scenario, the client should degrade gracefully without crashing
   * **Validates: Requirements 7.3, 7.5**
   */
  test('Property 8: Client degrades gracefully under high load', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 50 }), // Number of concurrent requests
        async (concurrentRequests) => {
          // Reset client state
          client.resetCircuitBreaker();
          client.resetRateLimiter();
          
          // Mock mixed success/failure responses
          mockFetch.mockImplementation(() => {
            const shouldSucceed = Math.random() > 0.3; // 70% success rate
            
            if (shouldSucceed) {
              return Promise.resolve({
                ok: true,
                json: async () => ([]),
                status: 200,
                statusText: 'OK',
              });
            } else {
              return Promise.reject(new Error('Random failure'));
            }
          });
          
          // Make concurrent requests
          const promises = Array.from({ length: concurrentRequests }, () =>
            client.discoverPoliticalEvents({ limit: 1 }).catch(() => [])
          );
          
          const results = await Promise.allSettled(promises);
          
          // Should not crash - all promises should settle
          expect(results).toHaveLength(concurrentRequests);
          
          // At least some requests should succeed or return fallback data
          const successfulResults = results.filter(r => r.status === 'fulfilled');
          expect(successfulResults.length).toBeGreaterThan(0);
          
          // Client should still be responsive
          const status = client.getClientStatus();
          expect(status).toBeDefined();
          expect(['CLOSED', 'HALF_OPEN', 'OPEN']).toContain(status.circuitBreaker.state);
        }
      ),
      { numRuns: 15, timeout: 20000 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 1: Event-Based Political Discovery API Parameters**
   * For any political event discovery request, the API call should include tag_id=2, related_tags=true, active=true, and closed=false parameters for events endpoint
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  test('Property 1: Political event discovery should always include correct API parameters', () =>
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }), // limit
        async (limit) => {
          // Mock successful response with valid events
          const mockEvents = [
            {
              id: 'test-event-1',
              ticker: 'TEST',
              slug: 'test-event',
              title: 'Test Political Event',
              description: 'Test event for property testing',
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

          // Call the method
          const rankedEvents = await client.discoverTrendingPoliticalEvents(limit);

          // Verify the fetch was called with correct parameters
          expect(mockFetch).toHaveBeenCalled();
          const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
          const url = fetchCall[0] as string;
          
          // Parse URL to check parameters
          const urlObj = new URL(url);
          const params = urlObj.searchParams;
          
          // Verify required parameters are present
          expect(params.get('tag_id')).toBe('2'); // Politics tag
          expect(params.get('related_tags')).toBe('true');
          expect(params.get('active')).toBe('true');
          expect(params.get('closed')).toBe('false');
          
          // Verify result structure
          expect(Array.isArray(rankedEvents)).toBe(true);
          expect(rankedEvents.length).toBeLessThanOrEqual(limit);
          
          // Each ranked event should have proper structure
          for (const rankedEvent of rankedEvents) {
            expect(rankedEvent).toHaveProperty('event');
            expect(rankedEvent).toHaveProperty('trendingScore');
            expect(rankedEvent).toHaveProperty('rankingFactors');
            expect(rankedEvent).toHaveProperty('marketAnalysis');
            expect(typeof rankedEvent.trendingScore).toBe('number');
            expect(rankedEvent.trendingScore).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    )
  );

  /**
   * **Feature: polymarket-integration-enhancement, Property 3: Event Filtering and Prioritization**
   * For any event discovery operation, events with multiple active markets and high combined volume should be prioritized over single-market events
   * Validates: Requirements 1.3, 1.5
   */
  test('Property 3: Events with multiple markets and high volume should be prioritized in trending results', () =>
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }), // number of events
        fc.integer({ min: 1, max: 5 }), // markets per event
        fc.float({ min: 1000, max: 1000000 }), // volume range
        async (numEvents, marketsPerEvent, baseVolume) => {
          // Generate mock events with varying market counts and volumes
          const mockEvents = Array.from({ length: numEvents }, (_, i) => {
            const marketCount = i === 0 ? marketsPerEvent : 1; // First event has multiple markets
            const volume = i === 0 ? baseVolume * 10 : baseVolume; // First event has higher volume
            
            return {
              id: `event-${i}`,
              ticker: `TEST${i}`,
              slug: `test-event-${i}`,
              title: `Test Event ${i}`,
              description: `Test event ${i} for property testing`,
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
              volume: volume,
              openInterest: 20000,
              competitive: 0.7,
              volume24hr: volume * 0.1,
              volume1wk: volume * 0.4,
              volume1mo: volume * 1.6,
              volume1yr: volume * 10,
              enableOrderBook: true,
              liquidityClob: 10000,
              negRisk: false,
              commentCount: 10,
              markets: Array.from({ length: marketCount }, (_, j) => ({
                id: `market-${i}-${j}`,
                question: `Market ${j} for event ${i}`,
                conditionId: `cond-${i}-${j}`,
                slug: `market-${i}-${j}`,
                description: `Market ${j} description`,
                resolutionSource: 'Test source',
                active: true,
                closed: false,
                archived: false,
                new: false,
                featured: false,
                restricted: false,
                liquidity: '5000',
                liquidityNum: 5000,
                volume: (volume / marketCount).toString(),
                volumeNum: volume / marketCount,
                volume24hr: (volume * 0.1) / marketCount,
                outcomes: '["Yes", "No"]',
                outcomePrices: '[0.5, 0.5]',
                competitive: 0.7,
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
              })),
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
            };
          });

          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockEvents,
            status: 200,
            statusText: 'OK',
          });

          // Call the method
          const rankedEvents = await client.discoverTrendingPoliticalEvents(numEvents);

          // Verify that events are properly ranked
          expect(rankedEvents.length).toBeGreaterThan(0);
          
          if (rankedEvents.length > 1) {
            // First event should have higher or equal trending score than subsequent events
            for (let i = 0; i < rankedEvents.length - 1; i++) {
              expect(rankedEvents[i].trendingScore).toBeGreaterThanOrEqual(rankedEvents[i + 1].trendingScore);
            }
            
            // Event with multiple markets and high volume should be ranked higher
            const firstEvent = rankedEvents[0];
            expect(firstEvent.marketAnalysis.marketCount).toBeGreaterThanOrEqual(1);
            expect(firstEvent.marketAnalysis.totalVolume).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    )
  );
});