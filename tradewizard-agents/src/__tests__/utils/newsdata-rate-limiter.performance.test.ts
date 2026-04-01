/**
 * Performance Tests for NewsData Rate Limiter
 * 
 * Tests rate limiting coordination with multiple agents, batching performance,
 * and priority queue efficiency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NewsDataRateLimiter, createNewsDataRateLimiter, DEFAULT_RATE_LIMITER_CONFIG } from './newsdata-rate-limiter.js';

describe('NewsData Rate Limiter Performance Tests', () => {
  let rateLimiter: NewsDataRateLimiter;
  let enhancedRateLimiter: NewsDataRateLimiter;

  beforeEach(() => {
    rateLimiter = createNewsDataRateLimiter();
    
    // Create enhanced rate limiter with optimized settings
    enhancedRateLimiter = createNewsDataRateLimiter({
      ...DEFAULT_RATE_LIMITER_CONFIG,
      batchingEnabled: true,
      batchSize: 10,
      batchWindow: 500,
      priorityQueueEnabled: true,
      maxQueueSize: 200,
      priorityLevels: 5,
      adaptiveRefill: true,
      burstMultiplier: 2.0,
      throttleThreshold: 0.7,
    });
  });

  afterEach(() => {
    rateLimiter.resetAllBuckets();
    enhancedRateLimiter.resetAllBuckets();
  });

  describe('Multi-Agent Coordination Performance', () => {
    it('should efficiently coordinate requests from multiple agents', async () => {
      const agentCount = 10;
      const requestsPerAgent = 20;
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
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 10));
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
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(throughput).toBeGreaterThan(5); // At least 5 requests/sec

      console.log(`Multi-agent coordination: ${agentCount} agents, ${requestsPerAgent} requests each`);
      console.log(`Total time: ${totalTime}ms`);
      console.log(`Throughput: ${throughput.toFixed(2)} requests/sec`);
      
      const bucketStatus = rateLimiter.getBucketStatus(bucket);
      console.log(`Final bucket status: ${bucketStatus.tokensAvailable}/${bucketStatus.capacity} tokens`);
    });

    it('should handle burst traffic with adaptive refill', async () => {
      const bucket = 'latest';
      const burstSize = 50;
      
      // First, establish low usage pattern
      for (let i = 0; i < 5; i++) {
        await enhancedRateLimiter.tryConsume(bucket, 1);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Then simulate burst traffic
      const startTime = Date.now();
      const burstPromises = Array.from({ length: burstSize }, async (_, i) => {
        return enhancedRateLimiter.executeWithRateLimit(
          bucket,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return { requestId: i };
          },
          { tokens: 1 }
        );
      });

      const results = await Promise.all(burstPromises);
      const burstTime = Date.now() - startTime;
      
      // Verify all burst requests succeeded
      expect(results).toHaveLength(burstSize);
      
      const burstThroughput = burstSize / burstTime * 1000;
      
      // Adaptive refill should handle burst better than standard rate limiter
      expect(burstTime).toBeLessThan(15000); // Should handle burst within 15 seconds
      expect(burstThroughput).toBeGreaterThan(3); // At least 3 requests/sec during burst

      console.log(`Burst traffic: ${burstSize} requests in ${burstTime}ms`);
      console.log(`Burst throughput: ${burstThroughput.toFixed(2)} requests/sec`);
    });
  });

  describe('Priority Queue Performance', () => {
    it('should process high-priority requests faster', async () => {
      const bucket = 'latest';
      const lowPriorityCount = 50;
      const highPriorityCount = 10;
      
      const allPromises: Array<Promise<{ priority: number; timestamp: number; processed: number }>> = [];
      const startTime = Date.now();
      
      // Add low priority requests first
      for (let i = 0; i < lowPriorityCount; i++) {
        allPromises.push(
          enhancedRateLimiter.executeWithRateLimit(
            bucket,
            async () => {
              const processed = Date.now();
              return { priority: 8, timestamp: startTime, processed };
            },
            {
              tokens: 1,
              priority: { level: 8, timestamp: Date.now() },
            }
          )
        );
      }

      // Add high priority requests after a delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      for (let i = 0; i < highPriorityCount; i++) {
        allPromises.push(
          enhancedRateLimiter.executeWithRateLimit(
            bucket,
            async () => {
              const processed = Date.now();
              return { priority: 1, timestamp: startTime, processed };
            },
            {
              tokens: 1,
              priority: { level: 1, timestamp: Date.now() },
            }
          )
        );
      }

      const results = await Promise.all(allPromises);
      
      // Separate results by priority
      const highPriorityResults = results.filter(r => r.priority === 1);
      const lowPriorityResults = results.filter(r => r.priority === 8);
      
      // Calculate average processing times
      const avgHighPriorityTime = highPriorityResults.reduce((sum, r) => sum + (r.processed - r.timestamp), 0) / highPriorityResults.length;
      const avgLowPriorityTime = lowPriorityResults.reduce((sum, r) => sum + (r.processed - r.timestamp), 0) / lowPriorityResults.length;
      
      // High priority requests should be processed faster on average
      expect(avgHighPriorityTime).toBeLessThan(avgLowPriorityTime);
      
      console.log(`Priority queue performance:`);
      console.log(`High priority avg time: ${avgHighPriorityTime.toFixed(2)}ms`);
      console.log(`Low priority avg time: ${avgLowPriorityTime.toFixed(2)}ms`);
      console.log(`Priority advantage: ${(avgLowPriorityTime / avgHighPriorityTime).toFixed(2)}x faster`);
    });

    it('should handle queue overflow gracefully', async () => {
      const bucket = 'latest';
      const overflowRequests = 250; // Exceed maxQueueSize of 200
      
      const promises = Array.from({ length: overflowRequests }, async (_, i) => {
        try {
          return await enhancedRateLimiter.executeWithRateLimit(
            bucket,
            async () => ({ requestId: i }),
            {
              tokens: 1,
              priority: { level: 5, timestamp: Date.now() },
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
      const queueStats = enhancedRateLimiter.getQueueStats(bucket);
      expect(queueStats?.queueSize || 0).toBeLessThanOrEqual(200);
      
      console.log(`Queue overflow test: ${successful.length} successful, ${failed.length} failed`);
      console.log(`Final queue size: ${queueStats?.queueSize || 0}`);
    });
  });

  describe('Batch Processing Performance', () => {
    it('should efficiently process batched requests', async () => {
      const bucket = 'latest';
      const batchRequests = Array.from({ length: 30 }, (_, i) => ({
        fn: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { batchId: i, data: `Batch result ${i}` };
        },
        tokens: 1,
        priority: { level: Math.floor(i / 10) + 1, timestamp: Date.now() },
        agentId: `batch-agent-${Math.floor(i / 5)}`,
      }));

      const startTime = Date.now();
      const results = await enhancedRateLimiter.executeBatch(bucket, batchRequests);
      const batchTime = Date.now() - startTime;
      
      // Verify all requests were processed
      expect(results).toHaveLength(batchRequests.length);
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      // Most requests should succeed
      expect(successful.length).toBeGreaterThan(batchRequests.length * 0.8);
      
      const batchThroughput = batchRequests.length / batchTime * 1000;
      
      // Batching should provide reasonable throughput
      expect(batchThroughput).toBeGreaterThan(2); // At least 2 requests/sec
      
      console.log(`Batch processing: ${batchRequests.length} requests in ${batchTime}ms`);
      console.log(`Batch throughput: ${batchThroughput.toFixed(2)} requests/sec`);
      console.log(`Success rate: ${(successful.length / results.length * 100).toFixed(2)}%`);
      console.log(`Failed requests: ${failed.length}`);
    });

    it('should optimize batch sizes based on available tokens', async () => {
      const bucket = 'crypto'; // Smaller capacity bucket
      const largeRequestCount = 100;
      
      // Fill up most of the bucket capacity first
      const initialStatus = enhancedRateLimiter.getBucketStatus(bucket);
      const tokensToConsume = Math.floor(initialStatus.tokensAvailable * 0.8);
      
      for (let i = 0; i < tokensToConsume; i++) {
        await enhancedRateLimiter.tryConsume(bucket, 1);
      }

      // Now try to process a large batch with limited tokens
      const batchRequests = Array.from({ length: largeRequestCount }, (_, i) => ({
        fn: async () => ({ id: i }),
        tokens: 1,
      }));

      const startTime = Date.now();
      const results = await enhancedRateLimiter.executeBatch(bucket, batchRequests);
      const processingTime = Date.now() - startTime;
      
      const successful = results.filter(r => r.success);
      
      // Should process some requests immediately, queue others
      expect(successful.length).toBeGreaterThan(0);
      expect(successful.length).toBeLessThan(largeRequestCount); // Not all at once due to token limits
      
      console.log(`Token-limited batch: ${successful.length}/${largeRequestCount} processed immediately`);
      console.log(`Processing time: ${processingTime}ms`);
      
      const finalStatus = enhancedRateLimiter.getBucketStatus(bucket);
      console.log(`Remaining tokens: ${finalStatus.tokensAvailable}/${finalStatus.capacity}`);
    });
  });

  describe('Memory Usage and Garbage Collection', () => {
    it('should maintain reasonable memory usage under load', async () => {
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage();
      const bucket = 'latest';
      const iterations = 1000;
      
      // Perform many rate limiting operations
      for (let i = 0; i < iterations; i++) {
        await enhancedRateLimiter.executeWithRateLimit(
          bucket,
          async () => ({ iteration: i }),
          {
            tokens: 1,
            priority: { level: (i % 5) + 1, timestamp: Date.now() },
            agentId: `load-test-agent-${i % 10}`,
          }
        );
        
        // Occasionally check queue stats to exercise monitoring
        if (i % 100 === 0) {
          enhancedRateLimiter.getQueueStats(bucket);
          enhancedRateLimiter.getAllQueueStats();
        }
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      console.log(`Memory usage after ${iterations} operations:`);
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Final heap used: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    });

    it('should clean up coordination queues efficiently', async () => {
      const bucket = 'market';
      const requestCount = 500;
      
      // Generate many requests to populate coordination queues
      const promises = Array.from({ length: requestCount }, async (_, i) => {
        return enhancedRateLimiter.executeWithRateLimit(
          bucket,
          async () => ({ id: i }),
          { tokens: 1 }
        );
      });

      await Promise.all(promises);
      
      // Wait for coordination cleanup to run
      await new Promise(resolve => setTimeout(resolve, 6000)); // Wait longer than coordination window
      
      // Check that coordination queues are cleaned up
      const queueStats = enhancedRateLimiter.getQueueStats(bucket);
      
      // Queue should be empty or very small after cleanup
      expect(queueStats?.queueSize || 0).toBeLessThan(10);
      
      console.log(`Coordination cleanup: queue size after ${requestCount} requests: ${queueStats?.queueSize || 0}`);
    });
  });

  describe('Throttling Performance', () => {
    it('should apply intelligent throttling under quota pressure', async () => {
      const bucket = 'archive'; // Smaller quota bucket
      const bucketStatus = enhancedRateLimiter.getBucketStatus(bucket);
      
      // Consume quota to trigger throttling
      const quotaToConsume = Math.floor(bucketStatus.dailyQuota * 0.75); // 75% of quota
      
      for (let i = 0; i < quotaToConsume; i++) {
        await enhancedRateLimiter.tryConsume(bucket, 1);
      }

      // Now make requests that should be throttled
      const throttledRequests = 20;
      const startTime = Date.now();
      
      const promises = Array.from({ length: throttledRequests }, async (_, i) => {
        return enhancedRateLimiter.executeWithRateLimit(
          bucket,
          async () => ({ id: i }),
          { tokens: 1 }
        );
      });

      const results = await Promise.all(promises);
      const throttledTime = Date.now() - startTime;
      
      // Requests should succeed but take longer due to throttling
      expect(results).toHaveLength(throttledRequests);
      expect(throttledTime).toBeGreaterThan(1000); // Should take at least 1 second due to throttling
      
      const throttledThroughput = throttledRequests / throttledTime * 1000;
      
      console.log(`Throttled performance: ${throttledRequests} requests in ${throttledTime}ms`);
      console.log(`Throttled throughput: ${throttledThroughput.toFixed(2)} requests/sec`);
      
      const finalStatus = enhancedRateLimiter.getBucketStatus(bucket);
      console.log(`Final quota usage: ${finalStatus.quotaPercentage.toFixed(2)}%`);
    });
  });
});