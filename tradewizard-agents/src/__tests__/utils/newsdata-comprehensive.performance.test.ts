/**
 * Comprehensive Performance Tests for NewsData Agent Tools
 * 
 * Task 12.4: Write performance tests
 * - Test cache performance under load
 * - Test rate limiting coordination with multiple agents
 * - Test memory usage and garbage collection
 * 
 * Requirements: Performance optimization testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NewsDataCacheManager, createHighPerformanceNewsDataCache } from './newsdata-cache-manager.js';
import { NewsDataRateLimiter, createNewsDataRateLimiter, DEFAULT_RATE_LIMITER_CONFIG } from './newsdata-rate-limiter.js';
import { createNewsDataPerformanceMonitor } from './newsdata-performance-monitor.js';

describe('NewsData Comprehensive Performance Tests', () => {
  let cacheManager: NewsDataCacheManager;
  let rateLimiter: NewsDataRateLimiter;
  let performanceMonitor: any;

  beforeEach(() => {
    cacheManager = createHighPerformanceNewsDataCache();
    rateLimiter = createNewsDataRateLimiter({
      ...DEFAULT_RATE_LIMITER_CONFIG,
      batchingEnabled: true,
      batchSize: 5, // Smaller batch size for testing
      batchWindow: 100, // Shorter window for testing
      priorityQueueEnabled: true,
      maxQueueSize: 50, // Smaller queue for testing
      priorityLevels: 3,
    });
    performanceMonitor = createNewsDataPerformanceMonitor(cacheManager, rateLimiter);
  });

  afterEach(async () => {
    await cacheManager.clear();
    rateLimiter.resetAllBuckets();
    performanceMonitor.stopMonitoring();
    performanceMonitor.reset();
  });

  describe('Cache Performance Under Load', () => {
    it('should handle concurrent cache operations efficiently', async () => {
      const operations = 100; // Reasonable number for testing
      const concurrency = 5;
      const startTime = Date.now();

      // Generate test data
      const testData = Array.from({ length: operations }, (_, i) => ({
        key: `perf-test-${i}`,
        data: {
          id: i,
          title: `Performance Test Article ${i}`,
          content: 'Test content '.repeat(10), // ~130 bytes
          timestamp: Date.now(),
          metadata: {
            source: 'test',
            category: 'performance',
            tags: [`tag-${i % 5}`],
          },
        },
      }));

      // Concurrent write operations in batches
      const batches = [];
      for (let i = 0; i < testData.length; i += concurrency) {
        const batch = testData.slice(i, i + concurrency);
        batches.push(
          Promise.all(batch.map(item => cacheManager.set(item.key, item.data)))
        );
      }

      await Promise.all(batches);
      const writeTime = Date.now() - startTime;

      // Concurrent read operations
      const readStartTime = Date.now();
      const readBatches = [];
      for (let i = 0; i < testData.length; i += concurrency) {
        const batch = testData.slice(i, i + concurrency);
        readBatches.push(
          Promise.all(batch.map(item => cacheManager.get(item.key)))
        );
      }

      const results = await Promise.all(readBatches);
      const readTime = Date.now() - readStartTime;

      // Verify all operations succeeded
      const flatResults = results.flat();
      expect(flatResults.every(result => result !== null)).toBe(true);

      // Performance assertions
      expect(writeTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(readTime).toBeLessThan(1000); // Reads should be faster
      
      const stats = await cacheManager.getStats();
      expect(stats.hitRate).toBeGreaterThan(0.95); // 95% hit rate
      expect(stats.totalKeys).toBe(operations);

      console.log(`Cache Performance Test:`);
      console.log(`- Operations: ${operations}`);
      console.log(`- Write time: ${writeTime}ms (${(operations / writeTime * 1000).toFixed(2)} ops/sec)`);
      console.log(`- Read time: ${readTime}ms (${(operations / readTime * 1000).toFixed(2)} ops/sec)`);
      console.log(`- Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    });

    it('should maintain performance with cache eviction under memory pressure', async () => {
      // Configure small cache for testing eviction
      const smallCache = new NewsDataCacheManager({
        maxSize: 50, // Small size to trigger eviction
        defaultTTL: 60000,
        staleTTL: 120000,
        evictionPolicy: 'lru',
        enableCompression: false,
        warmingEnabled: false,
        warmingBatchSize: 5,
        keyOptimization: false,
      });

      const entries = 75; // More than max size
      const startTime = Date.now();

      // Fill cache beyond capacity
      for (let i = 0; i < entries; i++) {
        await smallCache.set(`eviction-test-${i}`, {
          id: i,
          data: `Entry ${i}`,
          timestamp: Date.now(),
        });
      }

      const evictionTime = Date.now() - startTime;
      const stats = await smallCache.getStats();
      
      // Cache should not exceed max size
      expect(stats.totalKeys).toBeLessThanOrEqual(50);
      expect(evictionTime).toBeLessThan(2000); // Should handle eviction quickly

      // Recent entries should still be present
      for (let i = entries - 25; i < entries; i++) {
        const result = await smallCache.get(`eviction-test-${i}`);
        expect(result).not.toBeNull();
      }

      console.log(`Cache Eviction Performance:`);
      console.log(`- Entries processed: ${entries}`);
      console.log(`- Final cache size: ${stats.totalKeys}`);
      console.log(`- Eviction time: ${evictionTime}ms`);
    });

    it('should efficiently compress and decompress large cache entries', async () => {
      const largeData = {
        articles: Array.from({ length: 20 }, (_, i) => ({
          id: i,
          title: `Large Article ${i}`,
          content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(25), // ~1.4KB per article
          metadata: {
            author: `Author ${i}`,
            tags: Array.from({ length: 5 }, (_, j) => `tag-${j}`),
            categories: ['news', 'technology'],
          },
        })),
        metadata: {
          totalCount: 20,
          fetchTime: Date.now(),
          source: 'newsdata.io',
        },
      };

      const compressionStartTime = Date.now();
      
      // Store large data entries
      const keys = Array.from({ length: 5 }, (_, i) => `large-data-${i}`);
      
      for (const key of keys) {
        await cacheManager.set(key, largeData);
      }

      const compressionTime = Date.now() - compressionStartTime;
      const memoryBreakdown = await cacheManager.getMemoryBreakdown();
      
      // Verify compression is working
      expect(memoryBreakdown.compressionStats.totalCompressed).toBeGreaterThan(0);
      expect(memoryBreakdown.compressionStats.compressionRatio).toBeLessThan(0.9); // At least 10% compression
      expect(compressionTime).toBeLessThan(1000); // Should compress quickly

      // Verify data integrity after compression
      const retrievalStartTime = Date.now();
      for (const key of keys) {
        const retrieved = await cacheManager.get(key);
        expect(retrieved).not.toBeNull();
        if (retrieved && retrieved.data && typeof retrieved.data === 'object') {
          const data = retrieved.data as typeof largeData;
          expect(data.articles).toHaveLength(20);
          expect(data.metadata.totalCount).toBe(20);
        }
      }
      const retrievalTime = Date.now() - retrievalStartTime;

      console.log(`Cache Compression Performance:`);
      console.log(`- Compression time: ${compressionTime}ms`);
      console.log(`- Retrieval time: ${retrievalTime}ms`);
      console.log(`- Compression ratio: ${(memoryBreakdown.compressionStats.compressionRatio * 100).toFixed(2)}%`);
      console.log(`- Space saved: ${(memoryBreakdown.compressionStats.spaceSaved / 1024).toFixed(2)} KB`);
    });
  });

  describe('Rate Limiting Coordination with Multiple Agents', () => {
    it('should coordinate requests from multiple simulated agents', async () => {
      const agentCount = 5;
      const requestsPerAgent = 10;
      const bucket = 'latest';
      
      const startTime = Date.now();
      
      // Simulate multiple agents making concurrent requests
      const agentPromises = Array.from({ length: agentCount }, async (_, agentId) => {
        const agentRequests = [];
        
        for (let i = 0; i < requestsPerAgent; i++) {
          agentRequests.push(
            rateLimiter.executeWithRateLimit(
              bucket,
              async () => {
                // Simulate API call processing time
                await new Promise(resolve => setTimeout(resolve, 5));
                return { agentId, requestId: i, data: `Response ${i}` };
              },
              {
                tokens: 1,
                agentId: `agent-${agentId}`,
                requestType: 'news-fetch',
              }
            )
          );
        }
        
        return Promise.all(agentRequests);
      });

      const results = await Promise.all(agentPromises);
      const totalTime = Date.now() - startTime;
      
      // Verify all requests succeeded
      expect(results).toHaveLength(agentCount);
      results.forEach((agentResults, agentId) => {
        expect(agentResults).toHaveLength(requestsPerAgent);
        agentResults.forEach((result, requestId) => {
          expect(result.agentId).toBe(agentId);
          expect(result.requestId).toBe(requestId);
        });
      });

      const totalRequests = agentCount * requestsPerAgent;
      const throughput = totalRequests / totalTime * 1000;
      
      // Performance assertions
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(throughput).toBeGreaterThan(2); // At least 2 requests/sec

      console.log(`Multi-Agent Coordination Performance:`);
      console.log(`- Agents: ${agentCount}, Requests per agent: ${requestsPerAgent}`);
      console.log(`- Total time: ${totalTime}ms`);
      console.log(`- Throughput: ${throughput.toFixed(2)} requests/sec`);
      
      const bucketStatus = rateLimiter.getBucketStatus(bucket);
      console.log(`- Final bucket status: ${bucketStatus.tokensAvailable}/${bucketStatus.capacity} tokens`);
    });

    it('should handle priority-based request coordination efficiently', async () => {
      const highPriorityRequests = 5;
      const lowPriorityRequests = 10;
      const bucket = 'latest';
      
      const startTime = Date.now();
      const highPriorityTimes: number[] = [];
      const lowPriorityTimes: number[] = [];

      // Execute high-priority requests
      const highPriorityPromises = Array.from({ length: highPriorityRequests }, async (_, i) => {
        const requestStart = Date.now();
        const result = await rateLimiter.executeWithRateLimit(
          bucket,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return { priority: 'high', requestId: i };
          },
          {
            tokens: 1,
            priority: { level: 1, timestamp: Date.now() }, // High priority
          }
        );
        highPriorityTimes.push(Date.now() - requestStart);
        return result;
      });

      // Execute low-priority requests with slight delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const lowPriorityPromises = Array.from({ length: lowPriorityRequests }, async (_, i) => {
        const requestStart = Date.now();
        const result = await rateLimiter.executeWithRateLimit(
          bucket,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return { priority: 'low', requestId: i };
          },
          {
            tokens: 1,
            priority: { level: 3, timestamp: Date.now() }, // Low priority
          }
        );
        lowPriorityTimes.push(Date.now() - requestStart);
        return result;
      });

      const [highPriorityResults, lowPriorityResults] = await Promise.all([
        Promise.all(highPriorityPromises),
        Promise.all(lowPriorityPromises),
      ]);

      const totalTime = Date.now() - startTime;

      // Calculate average processing times
      const avgHighPriorityTime = highPriorityTimes.reduce((sum, time) => sum + time, 0) / highPriorityTimes.length;
      const avgLowPriorityTime = lowPriorityTimes.reduce((sum, time) => sum + time, 0) / lowPriorityTimes.length;

      // Verify results
      expect(highPriorityResults).toHaveLength(highPriorityRequests);
      expect(lowPriorityResults).toHaveLength(lowPriorityRequests);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`Priority-Based Coordination Performance:`);
      console.log(`- High priority avg time: ${avgHighPriorityTime.toFixed(2)}ms`);
      console.log(`- Low priority avg time: ${avgLowPriorityTime.toFixed(2)}ms`);
      console.log(`- Total coordination time: ${totalTime}ms`);
    });

    it('should efficiently process batched requests', async () => {
      const bucket = 'latest';
      const batchRequests = Array.from({ length: 15 }, (_, i) => ({
        fn: async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return { batchId: i, data: `Batch result ${i}` };
        },
        tokens: 1,
        priority: { level: Math.floor(i / 5) + 1, timestamp: Date.now() },
        agentId: `batch-agent-${Math.floor(i / 3)}`,
      }));

      const startTime = Date.now();
      const results = await rateLimiter.executeBatch(bucket, batchRequests);
      const batchTime = Date.now() - startTime;
      
      // Verify all requests were processed
      expect(results).toHaveLength(batchRequests.length);
      
      const successful = results.filter(r => r.success);
      
      // Most requests should succeed
      expect(successful.length).toBeGreaterThan(batchRequests.length * 0.7);
      expect(batchTime).toBeLessThan(3000); // Should complete within 3 seconds
      
      const batchThroughput = batchRequests.length / batchTime * 1000;
      
      console.log(`Batch Processing Performance:`);
      console.log(`- Batch requests: ${batchRequests.length}`);
      console.log(`- Batch time: ${batchTime}ms`);
      console.log(`- Batch throughput: ${batchThroughput.toFixed(2)} requests/sec`);
      console.log(`- Success rate: ${(successful.length / results.length * 100).toFixed(2)}%`);
    });

    it('should handle queue overflow gracefully under load', async () => {
      const bucket = 'latest';
      const overflowRequests = 60; // Exceed maxQueueSize of 50
      
      const promises = Array.from({ length: overflowRequests }, async (_, i) => {
        try {
          return await rateLimiter.executeWithRateLimit(
            bucket,
            async () => ({ requestId: i }),
            {
              tokens: 1,
              priority: { level: 2, timestamp: Date.now() },
            }
          );
        } catch (error) {
          return { error: (error as Error).message, requestId: i };
        }
      });

      const results = await Promise.all(promises);
      
      const successful = results.filter(r => !('error' in r));
      const failed = results.filter(r => 'error' in r);
      
      // Some requests should succeed, some should fail due to queue overflow
      expect(successful.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
      expect(successful.length + failed.length).toBe(overflowRequests);
      
      // Queue should not exceed max size
      const queueStats = rateLimiter.getQueueStats(bucket);
      expect(queueStats?.queueSize || 0).toBeLessThanOrEqual(50);
      
      console.log(`Queue Overflow Performance:`);
      console.log(`- Total requests: ${overflowRequests}`);
      console.log(`- Successful: ${successful.length}, Failed: ${failed.length}`);
      console.log(`- Final queue size: ${queueStats?.queueSize || 0}`);
    });
  });

  describe('Memory Usage and Garbage Collection', () => {
    it('should maintain reasonable memory usage under sustained operations', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage();
      const operations = 200;
      const bucket = 'latest';
      
      // Perform sustained cache and rate limiting operations
      for (let i = 0; i < operations; i++) {
        // Cache operations
        const cacheData = {
          id: i,
          content: 'Sustained test content '.repeat(5),
          metadata: { timestamp: Date.now() },
        };
        
        await cacheManager.set(`sustained-test-${i}`, cacheData);
        
        // Rate limiting operations
        await rateLimiter.executeWithRateLimit(
          bucket,
          async () => ({ iteration: i }),
          {
            tokens: 1,
            agentId: `sustained-agent-${i % 3}`,
          }
        );
        
        // Occasionally read from cache and check stats
        if (i % 20 === 0) {
          await cacheManager.get(`sustained-test-${i - 10}`);
          rateLimiter.getBucketStatus(bucket);
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      const cacheStats = await cacheManager.getStats();
      const memoryBreakdown = await cacheManager.getMemoryBreakdown();
      
      console.log(`Sustained Operations Memory Usage:`);
      console.log(`- Operations: ${operations}`);
      console.log(`- Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Final heap used: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Cache entries: ${cacheStats.totalKeys}`);
      console.log(`- Cache memory: ${(memoryBreakdown.totalMemory / 1024).toFixed(2)} KB`);
    });

    it('should efficiently clean up expired cache entries', async () => {
      // Create cache with short TTL for testing cleanup
      const shortTTLCache = new NewsDataCacheManager({
        maxSize: 100,
        defaultTTL: 100, // Very short TTL (100ms)
        staleTTL: 200,
        evictionPolicy: 'lru',
        enableCompression: false,
        warmingEnabled: false,
        warmingBatchSize: 5,
        keyOptimization: false,
      });

      const entries = 30;
      
      // Fill cache with entries
      for (let i = 0; i < entries; i++) {
        await shortTTLCache.set(`cleanup-test-${i}`, {
          id: i,
          data: `Cleanup test entry ${i}`,
          timestamp: Date.now(),
        });
      }

      const initialStats = await shortTTLCache.getStats();
      expect(initialStats.totalKeys).toBe(entries);

      // Wait for entries to expire
      await new Promise(resolve => setTimeout(resolve, 300));

      // Access cache to trigger cleanup
      for (let i = 0; i < 5; i++) {
        await shortTTLCache.get(`cleanup-test-${i}`);
      }

      const finalStats = await shortTTLCache.getStats();
      
      // Most entries should be cleaned up
      expect(finalStats.totalKeys).toBeLessThan(initialStats.totalKeys);
      
      console.log(`Cache Cleanup Performance:`);
      console.log(`- Initial entries: ${initialStats.totalKeys}`);
      console.log(`- Final entries: ${finalStats.totalKeys}`);
      console.log(`- Cleanup efficiency: ${((initialStats.totalKeys - finalStats.totalKeys) / initialStats.totalKeys * 100).toFixed(2)}%`);
    });

    it('should handle memory pressure with large data sets', async () => {
      const initialMemory = process.memoryUsage();
      const largeDataSets = 10;
      
      // Create large data sets to test memory handling
      for (let i = 0; i < largeDataSets; i++) {
        const largeData = {
          id: i,
          articles: Array.from({ length: 50 }, (_, j) => ({
            id: j,
            title: `Large Article ${j}`,
            content: 'Large content data '.repeat(50), // ~1KB per article
          })),
          metadata: {
            setId: i,
            timestamp: Date.now(),
          },
        };
        
        await cacheManager.set(`large-dataset-${i}`, largeData);
      }

      const afterCaching = process.memoryUsage();
      const cachingMemoryIncrease = afterCaching.heapUsed - initialMemory.heapUsed;
      
      // Verify data can be retrieved
      for (let i = 0; i < largeDataSets; i++) {
        const retrieved = await cacheManager.get(`large-dataset-${i}`);
        expect(retrieved).not.toBeNull();
        if (retrieved && retrieved.data && typeof retrieved.data === 'object') {
          const data = retrieved.data as { articles: any[] };
          expect(data.articles).toHaveLength(50);
        }
      }

      const afterRetrieval = process.memoryUsage();
      const retrievalMemoryIncrease = afterRetrieval.heapUsed - afterCaching.heapUsed;
      
      // Memory increase should be manageable
      expect(cachingMemoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
      expect(retrievalMemoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB additional
      
      const memoryBreakdown = await cacheManager.getMemoryBreakdown();
      
      console.log(`Large Dataset Memory Performance:`);
      console.log(`- Datasets: ${largeDataSets}`);
      console.log(`- Caching memory increase: ${(cachingMemoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Retrieval memory increase: ${(retrievalMemoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Cache compression ratio: ${(memoryBreakdown.compressionStats.compressionRatio * 100).toFixed(2)}%`);
    });

    it('should efficiently handle concurrent memory operations', async () => {
      const concurrentOperations = 50;
      const operationsPerBatch = 5;
      
      const startTime = Date.now();
      const memorySnapshots: number[] = [];
      
      // Perform concurrent memory-intensive operations
      const batches = [];
      for (let i = 0; i < concurrentOperations; i += operationsPerBatch) {
        const batch = Array.from({ length: operationsPerBatch }, async (_, j) => {
          const index = i + j;
          
          // Cache operation
          await cacheManager.set(`concurrent-${index}`, {
            id: index,
            data: 'Concurrent test data '.repeat(20),
            timestamp: Date.now(),
          });
          
          // Rate limiting operation
          await rateLimiter.executeWithRateLimit(
            'latest',
            async () => ({ concurrentId: index }),
            { tokens: 1 }
          );
          
          // Take memory snapshot
          const currentMemory = process.memoryUsage();
          memorySnapshots.push(currentMemory.heapUsed);
          
          return index;
        });
        
        batches.push(Promise.all(batch));
      }

      const results = await Promise.all(batches);
      const totalTime = Date.now() - startTime;
      
      // Verify all operations completed
      const flatResults = results.flat();
      expect(flatResults).toHaveLength(concurrentOperations);
      
      // Analyze memory usage patterns
      const maxMemory = Math.max(...memorySnapshots);
      const minMemory = Math.min(...memorySnapshots);
      const avgMemory = memorySnapshots.reduce((sum, mem) => sum + mem, 0) / memorySnapshots.length;
      const memoryVariance = maxMemory - minMemory;
      
      // Performance assertions
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(memoryVariance).toBeLessThan(100 * 1024 * 1024); // Memory variance should be reasonable
      
      console.log(`Concurrent Memory Operations Performance:`);
      console.log(`- Concurrent operations: ${concurrentOperations}`);
      console.log(`- Total time: ${totalTime}ms`);
      console.log(`- Memory variance: ${(memoryVariance / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Average memory: ${(avgMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Peak memory: ${(maxMemory / 1024 / 1024).toFixed(2)} MB`);
    });
  });

  describe('Integrated Performance Scenarios', () => {
    it('should maintain performance across all components under realistic load', async () => {
      const agents = 3;
      const testDuration = 3000; // 3 seconds
      
      performanceMonitor.startMonitoring();
      
      const startTime = Date.now();
      const agentMetrics: Array<{ agentId: number; operations: number; errors: number }> = [];
      
      // Simulate realistic agent workload
      const agentPromises = Array.from({ length: agents }, async (_, agentId) => {
        let operations = 0;
        let errors = 0;
        
        const agentInterval = setInterval(async () => {
          try {
            // Vary operation types
            const operationType = Math.random();
            
            if (operationType < 0.5) {
              // Cache operation
              await cacheManager.set(`agent-${agentId}-op-${operations}`, {
                agentId,
                operation: operations,
                data: 'Agent operation data',
                timestamp: Date.now(),
              });
            } else {
              // Rate limited operation
              await rateLimiter.executeWithRateLimit(
                'latest',
                async () => ({ agentId, operation: operations }),
                { tokens: 1, agentId: `agent-${agentId}` }
              );
            }
            
            operations++;
          } catch (error) {
            errors++;
          }
        }, 150); // Operation every 150ms

        // Stop after test duration
        setTimeout(() => {
          clearInterval(agentInterval);
        }, testDuration);

        // Wait for test completion
        await new Promise(resolve => setTimeout(resolve, testDuration + 100));
        
        agentMetrics.push({ agentId, operations, errors });
      });

      await Promise.all(agentPromises);
      
      const totalTime = Date.now() - startTime;
      performanceMonitor.stopMonitoring();

      // Collect metrics
      const cacheStats = await cacheManager.getStats();

      // Calculate aggregate metrics
      const totalOperations = agentMetrics.reduce((sum, agent) => sum + agent.operations, 0);
      const totalErrors = agentMetrics.reduce((sum, agent) => sum + agent.errors, 0);
      const throughput = totalOperations / totalTime * 1000;
      const errorRate = totalErrors / totalOperations;

      // Performance assertions
      expect(throughput).toBeGreaterThan(3); // At least 3 operations/sec overall
      expect(errorRate).toBeLessThan(0.2); // Less than 20% error rate
      expect(cacheStats.totalKeys).toBeGreaterThan(0);

      console.log(`Integrated Performance Test:`);
      console.log(`- Test duration: ${totalTime}ms`);
      console.log(`- Agents: ${agents}`);
      console.log(`- Total operations: ${totalOperations}`);
      console.log(`- Throughput: ${throughput.toFixed(2)} operations/sec`);
      console.log(`- Error rate: ${(errorRate * 100).toFixed(2)}%`);
      console.log(`- Cache entries: ${cacheStats.totalKeys}`);
      console.log(`- Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
      
      // Log per-agent performance
      agentMetrics.forEach(agent => {
        console.log(`  Agent ${agent.agentId}: ${agent.operations} operations, ${agent.errors} errors`);
      });
    });
  });
});