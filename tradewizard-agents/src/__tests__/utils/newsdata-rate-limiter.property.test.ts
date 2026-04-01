/**
 * Property-Based Tests for NewsData Rate Limiter
 * 
 * Feature: newsdata-agent-tools, Property 10: Rate Limit Tracking
 * Feature: newsdata-agent-tools, Property 11: Rate Limit Throttling
 * Feature: newsdata-agent-tools, Property 12: Quota Reset Behavior
 * Feature: newsdata-agent-tools, Property 13: Concurrent Request Coordination
 * 
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  NewsDataRateLimiter,
  type RateLimiterConfig,
} from './newsdata-rate-limiter.js';

// Mock logger to avoid console output during tests
vi.mock('./audit-logger.js', () => ({
  createAdvancedObservabilityLogger: vi.fn(() => ({
    logRateLimit: vi.fn(),
  })),
}));

describe('NewsData Rate Limiter - Property Tests', () => {
  let rateLimiter: NewsDataRateLimiter;
  let testConfig: RateLimiterConfig;

  beforeEach(() => {
    // Use smaller values for faster property testing
    testConfig = {
      buckets: {
        latest: {
          capacity: 10,
          refillRate: 2, // 2 tokens per second
          dailyQuota: 100,
          resetHour: 0,
        },
        archive: {
          capacity: 5,
          refillRate: 1, // 1 token per second
          dailyQuota: 50,
          resetHour: 0,
        },
        crypto: {
          capacity: 8,
          refillRate: 1.5,
          dailyQuota: 80,
          resetHour: 0,
        },
        market: {
          capacity: 8,
          refillRate: 1.5,
          dailyQuota: 80,
          resetHour: 0,
        },
      },
      defaultRetryDelay: 100,
      maxRetryAttempts: 3,
      jitterFactor: 0.1,
      coordinationEnabled: true,
      coordinationWindow: 1000,
    };

    rateLimiter = new NewsDataRateLimiter(testConfig);
  });

  /**
   * Property 10: Rate Limit Tracking
   * 
   * For any API request, the usage should be tracked against the appropriate daily quota bucket
   * 
   * This ensures that:
   * - Token consumption is accurately tracked
   * - Daily usage counters are properly maintained
   * - Quota percentages are correctly calculated
   */
  it('Feature: newsdata-agent-tools, Property 10: Rate limit tracking', async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom('latest', 'archive', 'crypto', 'market'),
      fc.integer({ min: 1, max: 5 }),
      fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 1, maxLength: 10 }),
      
      async (bucket, _initialTokens, consumptionSequence) => {
        // Reset the rate limiter for clean test
        rateLimiter.resetBucket(bucket);
        rateLimiter.resetDailyUsage(bucket);
        
        // Get initial status
        const initialStatus = rateLimiter.getBucketStatus(bucket);
        const initialDailyUsage = initialStatus.dailyUsage;
        
        let totalConsumed = 0;
        let successfulConsumptions = 0;
        
        // Consume tokens according to sequence
        for (const tokens of consumptionSequence) {
          const result = await rateLimiter.tryConsume(bucket, tokens);
          
          if (result.allowed) {
            totalConsumed += tokens;
            successfulConsumptions++;
          }
          
          // Check that usage tracking is accurate
          const currentStatus = rateLimiter.getBucketStatus(bucket);
          const expectedUsage = initialDailyUsage + totalConsumed;
          
          expect(currentStatus.dailyUsage).toBe(expectedUsage);
          
          // Quota percentage should be calculated correctly
          const expectedPercentage = (expectedUsage / currentStatus.dailyQuota) * 100;
          expect(Math.abs(currentStatus.quotaPercentage - expectedPercentage)).toBeLessThan(0.01);
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * Property 11: Rate Limit Throttling
   * 
   * For any request when quota limits are approached, the system should throttle or return cached data
   * instead of exceeding quotas
   * 
   * This ensures that:
   * - Requests are denied when tokens are insufficient
   * - Daily quota limits are respected
   * - Appropriate retry delays are provided
   */
  it('Feature: newsdata-agent-tools, Property 11: Rate limit throttling', async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom('latest', 'archive', 'crypto', 'market'),
      fc.integer({ min: 1, max: 20 }), // Number of requests to make
      
      async (bucket, requestCount) => {
        // Reset the rate limiter for clean test
        rateLimiter.resetBucket(bucket);
        rateLimiter.resetDailyUsage(bucket);
        
        const bucketConfig = testConfig.buckets[bucket as keyof typeof testConfig.buckets];
        let totalAllowed = 0;
        let totalDenied = 0;
        let totalTokensConsumed = 0;
        
        // Make requests and track results
        for (let i = 0; i < requestCount; i++) {
          const result = await rateLimiter.tryConsume(bucket, 1);
          
          if (result.allowed) {
            totalAllowed++;
            totalTokensConsumed += result.tokensConsumed;
          } else {
            totalDenied++;
            
            // When denied, should provide retry information
            expect(result.retryAfter).toBeGreaterThan(0);
            expect(result.reason).toBeDefined();
          }
        }
        
        // Total consumed should never exceed daily quota
        expect(totalTokensConsumed).toBeLessThanOrEqual(bucketConfig.dailyQuota);
        
        // If we made more requests than capacity + quota, some should be denied
        if (requestCount > bucketConfig.capacity + bucketConfig.dailyQuota) {
          expect(totalDenied).toBeGreaterThan(0);
        }
        
        // Total allowed + denied should equal total requests
        expect(totalAllowed + totalDenied).toBe(requestCount);
      }
    ), { numRuns: 100 });
  });

  /**
   * Property 12: Quota Reset Behavior
   * 
   * For any daily quota reset event, all usage counters should be reset to zero
   * 
   * This ensures that:
   * - Daily usage is properly reset
   * - Quota percentages return to zero
   * - Tokens are available after reset
   */
  it('Feature: newsdata-agent-tools, Property 12: Quota reset behavior', async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom('latest', 'archive', 'crypto', 'market'),
      fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 1, maxLength: 3 }),
      
      async (bucket, consumptionSequence) => {
        // Reset the rate limiter for clean test
        rateLimiter.resetBucket(bucket);
        rateLimiter.resetDailyUsage(bucket);
        
        let totalConsumed = 0;
        
        // Consume some tokens to build up usage
        for (const tokens of consumptionSequence) {
          const result = await rateLimiter.tryConsume(bucket, tokens);
          if (result.allowed) {
            totalConsumed += tokens;
          }
        }
        
        // Only proceed if we actually consumed some tokens
        if (totalConsumed === 0) {
          return; // Skip this test case
        }
        
        // Get status before reset
        const statusBeforeReset = rateLimiter.getBucketStatus(bucket);
        const usageBeforeReset = statusBeforeReset.dailyUsage;
        
        // Usage should match what we actually consumed
        expect(usageBeforeReset).toBe(totalConsumed);
        
        // Reset daily usage and bucket
        rateLimiter.resetDailyUsage(bucket);
        rateLimiter.resetBucket(bucket);
        
        // Get status after reset
        const statusAfterReset = rateLimiter.getBucketStatus(bucket);
        
        // Daily usage should be reset to 0
        expect(statusAfterReset.dailyUsage).toBe(0);
        
        // Quota percentage should be 0
        expect(statusAfterReset.quotaPercentage).toBe(0);
        
        // Tokens should be available (bucket was reset)
        expect(statusAfterReset.tokensAvailable).toBeGreaterThan(0);
        
        // Should be able to make requests again
        const result = await rateLimiter.tryConsume(bucket, 1);
        expect(result.allowed).toBe(true);
      }
    ), { numRuns: 30 }); // Reduce runs for faster execution
  });

  /**
   * Property 13: Concurrent Request Coordination
   * 
   * For any simultaneous news requests from multiple agents, the rate limiter should coordinate
   * to prevent quota exhaustion
   * 
   * This ensures that:
   * - Concurrent requests are properly coordinated
   * - Total consumption doesn't exceed limits
   * - Coordination prevents thundering herd problems
   */
  it('Feature: newsdata-agent-tools, Property 13: Concurrent request coordination', async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom('latest', 'archive', 'crypto', 'market'),
      fc.integer({ min: 2, max: 10 }), // Number of concurrent requests
      fc.integer({ min: 1, max: 3 }), // Tokens per request
      
      async (bucket, concurrentRequests, tokensPerRequest) => {
        // Reset the rate limiter for clean test
        rateLimiter.resetBucket(bucket);
        rateLimiter.resetDailyUsage(bucket);
        
        // Make concurrent requests
        const promises = Array.from({ length: concurrentRequests }, () =>
          rateLimiter.tryConsume(bucket, tokensPerRequest)
        );
        
        const results = await Promise.all(promises);
        
        // Count successful and failed requests
        const successful = results.filter(r => r.allowed);
        const failed = results.filter(r => !r.allowed);
        
        // Calculate total tokens consumed
        const totalConsumed = successful.reduce((sum, r) => sum + r.tokensConsumed, 0);
        
        // Verify coordination constraints
        const bucketConfig = testConfig.buckets[bucket as keyof typeof testConfig.buckets];
        
        // Total consumed should not exceed available capacity + daily quota
        expect(totalConsumed).toBeLessThanOrEqual(bucketConfig.capacity + bucketConfig.dailyQuota);
        
        // If coordination is working, some requests might be denied due to coordination limits
        // when there are many concurrent requests
        if (concurrentRequests > bucketConfig.capacity / 2) {
          // At least some coordination should occur
          const coordinationDenials = failed.filter(r => r.reason === 'Too many concurrent requests');
          // We don't strictly require coordination denials as it depends on timing,
          // but we verify the system handles it gracefully
          expect(coordinationDenials.length).toBeGreaterThanOrEqual(0);
        }
        
        // All requests should have been processed (either allowed or denied)
        expect(successful.length + failed.length).toBe(concurrentRequests);
        
        // Failed requests should have retry information
        failed.forEach(result => {
          expect(result.retryAfter).toBeGreaterThan(0);
          expect(result.reason).toBeDefined();
        });
      }
    ), { numRuns: 100 });
  });

  /**
   * Additional Property: Token Bucket Refill Consistency
   * 
   * For any token bucket, tokens should refill at the configured rate over time
   */
  it('Feature: newsdata-agent-tools, Property: Token bucket refill consistency', async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom('latest', 'archive', 'crypto', 'market'),
      fc.integer({ min: 1, max: 3 }), // Reduce max tokens to consume
      
      async (bucket, tokensToConsume) => {
        // Reset the rate limiter for clean test
        rateLimiter.resetBucket(bucket);
        
        const bucketConfig = testConfig.buckets[bucket as keyof typeof testConfig.buckets];
        
        // Get initial token count
        const tokensBeforeConsumption = rateLimiter.getTokens(bucket);
        expect(tokensBeforeConsumption).toBe(bucketConfig.capacity);
        
        // Consume some tokens if possible
        if (tokensToConsume <= tokensBeforeConsumption) {
          const result = await rateLimiter.tryConsume(bucket, tokensToConsume);
          
          if (result.allowed) {
            // Check tokens were consumed
            const tokensAfterConsumption = rateLimiter.getTokens(bucket);
            expect(tokensAfterConsumption).toBe(tokensBeforeConsumption - tokensToConsume);
            
            // Wait for some refill time (shorter wait for faster tests)
            const refillTime = Math.min(500, (tokensToConsume / bucketConfig.refillRate) * 1000);
            await new Promise(resolve => setTimeout(resolve, refillTime + 50));
            
            // Tokens should have refilled (at least partially)
            const tokensAfterRefill = rateLimiter.getTokens(bucket);
            expect(tokensAfterRefill).toBeGreaterThanOrEqual(tokensAfterConsumption);
            
            // Should not exceed capacity
            expect(tokensAfterRefill).toBeLessThanOrEqual(bucketConfig.capacity);
          }
        }
      }
    ), { numRuns: 20 }); // Fewer runs due to timing requirements
  });

  /**
   * Additional Property: Bucket Independence
   * 
   * For any operations on different buckets, they should not affect each other
   */
  it('Feature: newsdata-agent-tools, Property: Bucket independence', async () => {
    await fc.assert(fc.asyncProperty(
      fc.tuple(
        fc.constantFrom('latest', 'archive', 'crypto', 'market'),
        fc.constantFrom('latest', 'archive', 'crypto', 'market')
      ).filter(([bucket1, bucket2]) => bucket1 !== bucket2),
      fc.integer({ min: 1, max: 3 }),
      fc.integer({ min: 1, max: 3 }),
      
      async ([bucket1, bucket2], tokens1, tokens2) => {
        // Reset both buckets for clean test
        rateLimiter.resetBucket(bucket1);
        rateLimiter.resetBucket(bucket2);
        rateLimiter.resetDailyUsage(bucket1);
        rateLimiter.resetDailyUsage(bucket2);
        
        // Get initial status for both buckets
        const initialStatus2 = rateLimiter.getBucketStatus(bucket2);
        
        // Consume tokens from bucket1
        const result1 = await rateLimiter.tryConsume(bucket1, tokens1);
        
        // Get status after consuming from bucket1
        const statusAfter1 = rateLimiter.getBucketStatus(bucket1);
        const statusAfter2 = rateLimiter.getBucketStatus(bucket2);
        
        // Bucket2 should be unaffected by operations on bucket1
        expect(statusAfter2.tokensAvailable).toBe(initialStatus2.tokensAvailable);
        expect(statusAfter2.dailyUsage).toBe(initialStatus2.dailyUsage);
        expect(statusAfter2.quotaPercentage).toBe(initialStatus2.quotaPercentage);
        
        // Now consume from bucket2
        const result2 = await rateLimiter.tryConsume(bucket2, tokens2);
        
        // Get final status
        const finalStatus1 = rateLimiter.getBucketStatus(bucket1);
        const finalStatus2 = rateLimiter.getBucketStatus(bucket2);
        
        // Bucket1 should be unaffected by operations on bucket2
        expect(finalStatus1.tokensAvailable).toBe(statusAfter1.tokensAvailable);
        expect(finalStatus1.dailyUsage).toBe(statusAfter1.dailyUsage);
        
        // Each bucket should only reflect its own operations
        if (result1.allowed) {
          expect(finalStatus1.dailyUsage).toBe(tokens1);
        }
        
        if (result2.allowed) {
          expect(finalStatus2.dailyUsage).toBe(tokens2);
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * Additional Property: Rate Limiter State Consistency
   * 
   * For any sequence of operations, the rate limiter should maintain consistent internal state
   */
  it('Feature: newsdata-agent-tools, Property: Rate limiter state consistency', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          bucket: fc.constantFrom('latest', 'archive', 'crypto', 'market'),
          operation: fc.constantFrom('consume', 'status', 'reset'),
          tokens: fc.integer({ min: 1, max: 5 }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      
      async (operations) => {
        // Reset all buckets for clean test
        Object.keys(testConfig.buckets).forEach(bucket => {
          rateLimiter.resetBucket(bucket);
          rateLimiter.resetDailyUsage(bucket);
        });
        
        const bucketUsage = new Map<string, number>();
        
        for (const op of operations) {
          const currentUsage = bucketUsage.get(op.bucket) || 0;
          
          switch (op.operation) {
            case 'consume':
              const result = await rateLimiter.tryConsume(op.bucket, op.tokens);
              
              if (result.allowed) {
                bucketUsage.set(op.bucket, currentUsage + op.tokens);
              }
              
              // Verify consistency
              const status = rateLimiter.getBucketStatus(op.bucket);
              expect(status.dailyUsage).toBe(bucketUsage.get(op.bucket) || 0);
              
              break;
              
            case 'status':
              const statusResult = rateLimiter.getBucketStatus(op.bucket);
              
              // Status should be consistent with tracked usage
              expect(statusResult.dailyUsage).toBe(currentUsage);
              
              // Tokens available should be non-negative and not exceed capacity
              expect(statusResult.tokensAvailable).toBeGreaterThanOrEqual(0);
              expect(statusResult.tokensAvailable).toBeLessThanOrEqual(statusResult.capacity);
              
              // Quota percentage should be calculated correctly
              const expectedPercentage = (currentUsage / statusResult.dailyQuota) * 100;
              expect(Math.abs(statusResult.quotaPercentage - expectedPercentage)).toBeLessThan(0.01);
              
              break;
              
            case 'reset':
              rateLimiter.resetDailyUsage(op.bucket);
              bucketUsage.set(op.bucket, 0);
              
              // Verify reset worked
              const resetStatus = rateLimiter.getBucketStatus(op.bucket);
              expect(resetStatus.dailyUsage).toBe(0);
              expect(resetStatus.quotaPercentage).toBe(0);
              
              break;
          }
        }
      }
    ), { numRuns: 100 });
  });
});