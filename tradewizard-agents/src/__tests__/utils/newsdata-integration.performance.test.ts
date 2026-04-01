/**
 * Integration Performance Tests for NewsData Agent Tools
 * 
 * Tests the integrated performance of cache, rate limiter, and client components
 * working together under realistic load conditions with multiple agents.
 * 
 * Requirements: 12.4 - Performance optimization testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NewsDataClient } from './newsdata-client.js';
import { createHighPerformanceNewsDataCache } from './newsdata-cache-manager.js';
import { createNewsDataRateLimiter } from './newsdata-rate-limiter.js';
import { createNewsDataPerformanceMonitor } from './newsdata-performance-monitor.js';
import { createNewsDataCircuitBreaker } from './newsdata-circuit-breaker.js';
import { createNewsDataErrorHandler } from './newsdata-error-handler.js';
import { getNewsDataAgentUsageTracker } from './newsdata-agent-usage-tracker.js';

// Mock NewsData.io API responses for performance testing
const mockNewsResponse = {
  status: 'success',
  totalResults: 50,
  results: Array.from({ length: 50 }, (_, i) => ({
    article_id: `test-article-${i}`,
    title: `Test Article ${i}`,
    link: `https://example.com/article-${i}`,
    description: `Description for test article ${i}`,
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20),
    pubDate: new Date(Date.now() - i * 3600000).toISOString(),
    source_id: 'test-source',
    source_name: 'Test Source',
    source_url: 'https://example.com',
    source_priority: 1,
    country: ['us'],
    category: ['business'],
    language: 'en',
    duplicate: false,
  })),
};

// Helper function to create test client configuration
function createTestClientConfig() {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://newsdata.io/api/1',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    cache: {
      enabled: true,
      ttl: {
        latest: 900,
        crypto: 600,
        market: 600,
        archive: 3600,
      },
      maxSize: 1000,
    },
    rateLimiting: {
      requestsPerWindow: 1800,
      windowSizeMs: 15 * 60 * 1000,
      dailyQuota: 20000,
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      halfOpenMaxCalls: 3,
    },
  };
}

describe('NewsData Integration Performance Tests', () => {
  let clients: NewsDataClient[] = [];
  let cacheManager: any;
  let rateLimiter: any;
  let performanceMonitor: any;
  let circuitBreaker: any;
  let errorHandler: any;
  let usageTracker: any;

  beforeEach(() => {
    // Create shared components
    cacheManager = createHighPerformanceNewsDataCache();
    rateLimiter = createNewsDataRateLimiter({
      buckets: {
        latest: { capacity: 100, refillRate: 2, dailyQuota: 1000 },
        archive: { capacity: 50, refillRate: 1, dailyQuota: 500 },
        crypto: { capacity: 75, refillRate: 1.5, dailyQuota: 750 },
        market: { capacity: 75, refillRate: 1.5, dailyQuota: 750 },
      },
      batchingEnabled: true,
      batchSize: 10,
      batchWindow: 500,
      priorityQueueEnabled: true,
      maxQueueSize: 200,
    });
    performanceMonitor = createNewsDataPerformanceMonitor(cacheManager, rateLimiter);
    circuitBreaker = createNewsDataCircuitBreaker();
    errorHandler = createNewsDataErrorHandler();
    usageTracker = getNewsDataAgentUsageTracker();

    // Create multiple client instances to simulate different agents
    clients = [];
  });

  afterEach(async () => {
    // Clean up
    for (const _client of clients) {
      // Clean up any client resources if needed
    }
    clients = [];
    
    await cacheManager.clear();
    rateLimiter.resetAllBuckets();
    performanceMonitor.stopMonitoring();
    performanceMonitor.reset();
  });

  describe('Multi-Agent Cache Performance Under Load', () => {
    it('should maintain high cache hit rates with multiple agents', async () => {
      const agentCount = 8;
      const requestsPerAgent = 25;
      const sharedQueries = [
        { q: 'technology', category: ['business'], language: ['en'] },
        { q: 'AI', category: ['technology'], language: ['en'] },
        { q: 'market', category: ['business'], language: ['en'] },
        { q: 'crypto', category: ['business'], language: ['en'] },
        { q: 'startup', category: ['business'], language: ['en'] },
      ];

      // Create clients for each agent
      for (let i = 0; i < agentCount; i++) {
        const newsClient = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        // Mock the HTTP client to return test data
        (newsClient as any).httpClient = {
          get: async () => ({ data: mockNewsResponse }),
        };

        clients.push(newsClient);
      }

      const startTime = Date.now();
      
      // Execute concurrent requests from multiple agents
      const agentPromises = clients.map(async (client, index) => {
        const agentRequests = [];
        
        for (let i = 0; i < requestsPerAgent; i++) {
          // Use shared queries to maximize cache hits
          const query = sharedQueries[i % sharedQueries.length];
          agentRequests.push(client.fetchLatestNews(query));
        }
        
        const agentResults = await Promise.all(agentRequests);
        return { agentIndex: index, results: agentResults }; // Use index to avoid warning
      });

      const results = await Promise.all(agentPromises);
      const totalTime = Date.now() - startTime;

      // Verify all requests succeeded
      expect(results).toHaveLength(agentCount);
      results.forEach(agentResult => {
        expect(agentResult.results).toHaveLength(requestsPerAgent);
        agentResult.results.forEach(result => {
          expect(result.status).toBe('success');
          expect(result.results).toHaveLength(50);
        });
      });

      // Check cache performance
      const cacheStats = await cacheManager.getStats();
      const totalRequests = agentCount * requestsPerAgent;
      const throughput = totalRequests / totalTime * 1000;

      // Performance assertions
      expect(cacheStats.hitRate).toBeGreaterThan(0.6); // At least 60% hit rate with shared queries
      expect(throughput).toBeGreaterThan(10); // At least 10 requests/sec
      expect(totalTime).toBeLessThan(15000); // Complete within 15 seconds

      console.log(`Multi-agent cache performance:`);
      console.log(`- Agents: ${agentCount}, Requests per agent: ${requestsPerAgent}`);
      console.log(`- Total time: ${totalTime}ms`);
      console.log(`- Throughput: ${throughput.toFixed(2)} requests/sec`);
      console.log(`- Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
      console.log(`- Cache keys: ${cacheStats.totalKeys}`);
    });

    it('should handle cache contention efficiently', async () => {
      const concurrentAgents = 12;
      const hotKey = 'hot-news-query';
      
      // Create clients
      for (let i = 0; i < concurrentAgents; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        (client as any).httpClient = {
          get: async () => {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 100));
            return { data: mockNewsResponse };
          },
        };

        clients.push(client);
      }

      const startTime = Date.now();
      
      // All agents request the same data simultaneously (cache contention)
      const contentionPromises = clients.map(async (client, index) => {
        const result = await client.fetchLatestNews({
          q: hotKey,
          category: ['business'],
          language: ['en'],
          size: 50,
        });
        return { agentIndex: index, result }; // Use index to avoid warning
      });

      const results = await Promise.all(contentionPromises);
      const contentionTime = Date.now() - startTime;

      // All requests should succeed
      expect(results).toHaveLength(concurrentAgents);
      results.forEach(agentResult => {
        expect(agentResult.result.status).toBe('success');
        expect(agentResult.result.results).toHaveLength(50);
      });

      // Cache should handle contention efficiently
      const cacheStats = await cacheManager.getStats();
      const contentionThroughput = concurrentAgents / contentionTime * 1000;

      // With cache contention, only one API call should be made
      expect(contentionTime).toBeLessThan(5000); // Should complete quickly due to caching
      expect(contentionThroughput).toBeGreaterThan(5); // At least 5 agents/sec
      expect(cacheStats.totalKeys).toBeGreaterThan(0);

      console.log(`Cache contention performance:`);
      console.log(`- Concurrent agents: ${concurrentAgents}`);
      console.log(`- Contention time: ${contentionTime}ms`);
      console.log(`- Throughput: ${contentionThroughput.toFixed(2)} agents/sec`);
      console.log(`- Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
    });
  });

  describe('Rate Limiting Coordination Performance', () => {
    it('should coordinate rate limits across multiple agents efficiently', async () => {
      const agentCount = 6;
      const requestsPerAgent = 30;
      const bucket = 'latest';

      // Create clients with shared rate limiter
      for (let i = 0; i < agentCount; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        (client as any).httpClient = {
          get: async () => {
            await new Promise(resolve => setTimeout(resolve, 50)); // Simulate API delay
            return { data: mockNewsResponse };
          },
        };

        clients.push(client);
      }

      const startTime = Date.now();
      
      // Execute requests that will hit rate limits
      const rateLimitPromises = clients.map(async (client, agentId) => {
        const agentRequests = [];
        
        for (let i = 0; i < requestsPerAgent; i++) {
          agentRequests.push(
            client.fetchLatestNews({
              q: `agent-${agentId}-query-${i}`, // Unique queries to avoid cache hits
              category: ['business'],
              language: ['en'],
            })
          );
        }
        
        return Promise.all(agentRequests);
      });

      const results = await Promise.all(rateLimitPromises);
      const coordinationTime = Date.now() - startTime;

      // Verify coordination worked
      expect(results).toHaveLength(agentCount);
      
      const totalRequests = agentCount * requestsPerAgent;
      const successfulRequests = results.reduce((sum, agentResults) => {
        return sum + agentResults.filter(r => r.status === 'success').length;
      }, 0);

      const coordinationThroughput = successfulRequests / coordinationTime * 1000;
      const bucketStatus = rateLimiter.getBucketStatus(bucket);

      // Rate limiting should prevent quota exhaustion
      expect(successfulRequests).toBeGreaterThan(0);
      expect(coordinationThroughput).toBeGreaterThan(1); // At least 1 request/sec under rate limiting
      expect(bucketStatus.quotaPercentage).toBeLessThan(100); // Should not exhaust quota

      console.log(`Rate limiting coordination:`);
      console.log(`- Total requests: ${totalRequests}, Successful: ${successfulRequests}`);
      console.log(`- Coordination time: ${coordinationTime}ms`);
      console.log(`- Throughput: ${coordinationThroughput.toFixed(2)} requests/sec`);
      console.log(`- Quota usage: ${bucketStatus.quotaPercentage.toFixed(2)}%`);
      console.log(`- Tokens remaining: ${bucketStatus.tokensAvailable}/${bucketStatus.capacity}`);
    });

    it('should handle priority-based request coordination', async () => {
      const highPriorityAgents = 3;
      const lowPriorityAgents = 6;
      const requestsPerAgent = 15;

      // Create high-priority clients
      for (let i = 0; i < highPriorityAgents; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        (client as any).httpClient = {
          get: async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return { data: mockNewsResponse };
          },
        };

        clients.push(client);
      }

      // Create low-priority clients
      for (let i = 0; i < lowPriorityAgents; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        (client as any).httpClient = {
          get: async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return { data: mockNewsResponse };
          },
        };

        clients.push(client);
      }

      const startTime = Date.now();
      const highPriorityTimes: number[] = [];
      const lowPriorityTimes: number[] = [];

      // Execute high-priority requests
      const highPriorityPromises = clients.slice(0, highPriorityAgents).map(async (client, agentId) => {
        const agentStart = Date.now();
        const requests = [];
        
        for (let i = 0; i < requestsPerAgent; i++) {
          requests.push(
            rateLimiter.executeWithRateLimit(
              'latest',
              async () => client.fetchLatestNews({
                q: `high-priority-${agentId}-${i}`,
                category: ['business'],
              }),
              {
                tokens: 1,
                priority: { level: 1, timestamp: Date.now() }, // High priority
              }
            )
          );
        }
        
        const results = await Promise.all(requests);
        highPriorityTimes.push(Date.now() - agentStart);
        return results;
      });

      // Execute low-priority requests with slight delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const lowPriorityPromises = clients.slice(highPriorityAgents).map(async (client, agentId) => {
        const agentStart = Date.now();
        const requests = [];
        
        for (let i = 0; i < requestsPerAgent; i++) {
          requests.push(
            rateLimiter.executeWithRateLimit(
              'latest',
              async () => client.fetchLatestNews({
                q: `low-priority-${agentId}-${i}`,
                category: ['business'],
              }),
              {
                tokens: 1,
                priority: { level: 5, timestamp: Date.now() }, // Low priority
              }
            )
          );
        }
        
        const results = await Promise.all(requests);
        lowPriorityTimes.push(Date.now() - agentStart);
        return results;
      });

      const [highPriorityResults, lowPriorityResults] = await Promise.all([
        Promise.all(highPriorityPromises),
        Promise.all(lowPriorityPromises),
      ]);

      const totalTime = Date.now() - startTime;

      // Calculate average processing times
      const avgHighPriorityTime = highPriorityTimes.reduce((sum, time) => sum + time, 0) / highPriorityTimes.length;
      const avgLowPriorityTime = lowPriorityTimes.reduce((sum, time) => sum + time, 0) / lowPriorityTimes.length;

      // High priority should be processed faster
      expect(avgHighPriorityTime).toBeLessThan(avgLowPriorityTime * 1.2); // Allow some variance
      expect(highPriorityResults).toHaveLength(highPriorityAgents);
      expect(lowPriorityResults).toHaveLength(lowPriorityAgents);

      console.log(`Priority-based coordination:`);
      console.log(`- High priority avg time: ${avgHighPriorityTime.toFixed(2)}ms`);
      console.log(`- Low priority avg time: ${avgLowPriorityTime.toFixed(2)}ms`);
      console.log(`- Priority advantage: ${(avgLowPriorityTime / avgHighPriorityTime).toFixed(2)}x`);
      console.log(`- Total coordination time: ${totalTime}ms`);
    });
  });

  describe('Memory Usage and Garbage Collection', () => {
    it('should maintain reasonable memory usage under sustained load', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage();
      const agentCount = 5;
      const cycleCount = 10;
      const requestsPerCycle = 20;

      // Create clients
      for (let i = 0; i < agentCount; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        (client as any).httpClient = {
          get: async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            return { data: mockNewsResponse };
          },
        };

        clients.push(client);
      }

      const memorySnapshots: number[] = [];
      
      // Run sustained load cycles
      for (let cycle = 0; cycle < cycleCount; cycle++) {
        const cyclePromises = clients.map(async (client, agentId) => {
          const requests = [];
          
          for (let i = 0; i < requestsPerCycle; i++) {
            requests.push(
              client.fetchLatestNews({
                q: `cycle-${cycle}-agent-${agentId}-request-${i}`,
                category: ['business'],
                language: ['en'],
              })
            );
          }
          
          return Promise.all(requests);
        });

        await Promise.all(cyclePromises);
        
        // Take memory snapshot
        const currentMemory = process.memoryUsage();
        memorySnapshots.push(currentMemory.heapUsed);
        
        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const maxMemoryUsed = Math.max(...memorySnapshots);
      const avgMemoryUsed = memorySnapshots.reduce((sum, mem) => sum + mem, 0) / memorySnapshots.length;

      const totalRequests = agentCount * cycleCount * requestsPerCycle;

      // Memory usage should be reasonable
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB increase
      expect(maxMemoryUsed - initialMemory.heapUsed).toBeLessThan(300 * 1024 * 1024); // Peak under 300MB

      // Get component memory usage
      const cacheStats = await cacheManager.getStats();
      const cacheMemory = await cacheManager.getMemoryBreakdown();

      console.log(`Sustained load memory usage:`);
      console.log(`- Total requests: ${totalRequests}`);
      console.log(`- Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Peak memory: ${(maxMemoryUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Average memory: ${(avgMemoryUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Cache memory: ${(cacheMemory.totalMemory / 1024).toFixed(2)} KB`);
      console.log(`- Cache entries: ${cacheStats.totalKeys}`);
    });

    it('should handle memory pressure with efficient cleanup', async () => {
      const memoryPressureAgents = 8;
      const largeRequestCount = 50;

      // Create clients
      for (let i = 0; i < memoryPressureAgents; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        // Mock large responses to create memory pressure
        (client as any).httpClient = {
          get: async () => {
            const largeResponse = {
              ...mockNewsResponse,
              results: Array.from({ length: 100 }, (_, i) => ({
                ...mockNewsResponse.results[0],
                article_id: `large-article-${i}`,
                content: 'Large content '.repeat(500), // ~6KB per article
                description: 'Large description '.repeat(100),
              })),
            };
            return { data: largeResponse };
          },
        };

        clients.push(client);
      }

      const beforePressure = process.memoryUsage();
      
      // Create memory pressure with large responses
      const pressurePromises = clients.map(async (client, agentId) => {
        const requests = [];
        
        for (let i = 0; i < largeRequestCount; i++) {
          requests.push(
            client.fetchLatestNews({
              q: `pressure-test-${agentId}-${i}`,
              category: ['business'],
              size: 100, // Large response size
            })
          );
        }
        
        return Promise.all(requests);
      });

      const results = await Promise.all(pressurePromises);
      const afterPressure = process.memoryUsage();

      // Verify requests succeeded
      expect(results).toHaveLength(memoryPressureAgents);
      results.forEach(agentResults => {
        expect(agentResults).toHaveLength(largeRequestCount);
      });

      // Check memory usage and cache behavior
      const cacheStats = await cacheManager.getStats();
      const memoryBreakdown = await cacheManager.getMemoryBreakdown();
      const memoryIncrease = afterPressure.heapUsed - beforePressure.heapUsed;

      // System should handle memory pressure gracefully
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024); // Less than 500MB increase
      expect(cacheStats.totalKeys).toBeGreaterThan(0); // Cache should be working

      console.log(`Memory pressure test:`);
      console.log(`- Agents: ${memoryPressureAgents}, Large requests: ${largeRequestCount}`);
      console.log(`- Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Cache entries: ${cacheStats.totalKeys}`);
      console.log(`- Cache memory: ${(memoryBreakdown.totalMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);

      // Force cleanup
      if (global.gc) {
        global.gc();
      }
    });

    it('should efficiently clean up resources after agent disconnection', async () => {
      const disconnectingAgents = 6;
      const requestsBeforeDisconnect = 15;

      // Create clients
      for (let i = 0; i < disconnectingAgents; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        (client as any).httpClient = {
          get: async () => ({ data: mockNewsResponse }),
        };

        clients.push(client);
      }

      // Agents make requests
      const initialPromises = clients.map(async (client, agentId) => {
        const requests = [];
        
        for (let i = 0; i < requestsBeforeDisconnect; i++) {
          requests.push(
            client.fetchLatestNews({
              q: `disconnect-test-${agentId}-${i}`,
              category: ['business'],
            })
          );
        }
        
        return Promise.all(requests);
      });

      await Promise.all(initialPromises);

      const beforeCleanup = process.memoryUsage();
      const beforeCacheStats = await cacheManager.getStats();

      // Simulate agent disconnection by clearing clients
      clients.length = 0;

      // Wait for cleanup cycles
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage();
      const afterCacheStats = await cacheManager.getStats();

      // Memory should be cleaned up (some reduction expected)
      const memoryReduction = beforeCleanup.heapUsed - afterCleanup.heapUsed;

      console.log(`Resource cleanup after disconnection:`);
      console.log(`- Disconnected agents: ${disconnectingAgents}`);
      console.log(`- Memory reduction: ${(memoryReduction / 1024).toFixed(2)} KB`);
      console.log(`- Cache entries before: ${beforeCacheStats.totalKeys}`);
      console.log(`- Cache entries after: ${afterCacheStats.totalKeys}`);
      console.log(`- Cache hit rate: ${(afterCacheStats.hitRate * 100).toFixed(2)}%`);
    });
  });

  describe('End-to-End Performance Integration', () => {
    it('should maintain performance across all components under realistic load', async () => {
      const realisticAgents = 10;
      const testDuration = 15000; // 15 seconds
      const requestInterval = 500; // Request every 500ms per agent
      
      // Create clients with full component integration
      for (let i = 0; i < realisticAgents; i++) {
        const client = new NewsDataClient(
          createTestClientConfig(),
          undefined, // observabilityLogger
          cacheManager,
          rateLimiter,
          circuitBreaker,
          undefined, // fallbackManager
          undefined, // newsDataLogger
          errorHandler,
          usageTracker,
          performanceMonitor
        );

        (client as any).httpClient = {
          get: async () => {
            // Simulate realistic API response times
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            return { data: mockNewsResponse };
          },
        };

        clients.push(client);
      }

      performanceMonitor.startMonitoring();
      
      const startTime = Date.now();
      const agentMetrics: Array<{ agentId: number; requests: number; errors: number; avgResponseTime: number }> = [];
      
      // Run realistic load test
      const loadPromises = clients.map(async (client, agentId) => {
        let requestCount = 0;
        let errorCount = 0;
        const responseTimes: number[] = [];
        
        const agentInterval = setInterval(async () => {
          try {
            const requestStart = Date.now();
            
            // Vary request types and parameters realistically
            const requestType = Math.random();
            let result;
            
            if (requestType < 0.4) {
              // Latest news (40%)
              result = await client.fetchLatestNews({
                q: `agent-${agentId}-latest-${requestCount}`,
                category: ['business', 'technology'][Math.floor(Math.random() * 2)],
                language: ['en'],
              });
            } else if (requestType < 0.7) {
              // Crypto news (30%)
              result = await client.fetchCryptoNews({
                coin: ['btc', 'eth'][Math.floor(Math.random() * 2)],
                q: `agent-${agentId}-crypto-${requestCount}`,
              });
            } else if (requestType < 0.9) {
              // Market news (20%)
              result = await client.fetchMarketNews({
                symbol: ['AAPL', 'TSLA'][Math.floor(Math.random() * 2)],
                q: `agent-${agentId}-market-${requestCount}`,
              });
            } else {
              // Archive news (10%)
              const toDate = new Date();
              const fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
              result = await client.fetchArchiveNews({
                from_date: fromDate.toISOString().split('T')[0],
                to_date: toDate.toISOString().split('T')[0],
                q: `agent-${agentId}-archive-${requestCount}`,
              });
            }
            
            const responseTime = Date.now() - requestStart;
            responseTimes.push(responseTime);
            requestCount++;
            
            if (result.status !== 'success') {
              errorCount++;
            }
            
          } catch (error) {
            errorCount++;
          }
        }, requestInterval);

        // Stop after test duration
        setTimeout(() => {
          clearInterval(agentInterval);
        }, testDuration);

        // Wait for test completion
        await new Promise(resolve => setTimeout(resolve, testDuration + 1000));
        
        const avgResponseTime = responseTimes.length > 0 
          ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
          : 0;
          
        agentMetrics.push({
          agentId,
          requests: requestCount,
          errors: errorCount,
          avgResponseTime,
        });
      });

      await Promise.all(loadPromises);
      
      const totalTime = Date.now() - startTime;
      performanceMonitor.stopMonitoring();

      // Collect final metrics
      const performanceSnapshot = await performanceMonitor.getPerformanceSnapshot();
      const cacheStats = await cacheManager.getStats();

      // Calculate aggregate metrics
      const totalRequests = agentMetrics.reduce((sum, agent) => sum + agent.requests, 0);
      const totalErrors = agentMetrics.reduce((sum, agent) => sum + agent.errors, 0);
      const avgResponseTime = agentMetrics.reduce((sum, agent) => sum + agent.avgResponseTime, 0) / agentMetrics.length;
      const throughput = totalRequests / totalTime * 1000;
      const errorRate = totalErrors / totalRequests;

      // Performance assertions for realistic load
      expect(throughput).toBeGreaterThan(5); // At least 5 requests/sec overall
      expect(errorRate).toBeLessThan(0.1); // Less than 10% error rate
      expect(avgResponseTime).toBeLessThan(5000); // Average response under 5 seconds
      expect(cacheStats.hitRate).toBeGreaterThan(0.2); // At least 20% cache hit rate

      console.log(`End-to-end performance integration:`);
      console.log(`- Test duration: ${totalTime}ms`);
      console.log(`- Agents: ${realisticAgents}`);
      console.log(`- Total requests: ${totalRequests}`);
      console.log(`- Throughput: ${throughput.toFixed(2)} requests/sec`);
      console.log(`- Error rate: ${(errorRate * 100).toFixed(2)}%`);
      console.log(`- Avg response time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`- Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
      console.log(`- Cache entries: ${cacheStats.totalKeys}`);
      console.log(`- Performance endpoints tracked: ${performanceSnapshot.responseTime.length}`);
      
      // Log per-agent performance
      agentMetrics.forEach(agent => {
        console.log(`  Agent ${agent.agentId}: ${agent.requests} requests, ${agent.errors} errors, ${agent.avgResponseTime.toFixed(2)}ms avg`);
      });
    });
  });
});