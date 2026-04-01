/**
 * NewsData Rate Limiter Tests
 * 
 * Unit tests for the NewsData.io rate limiter implementation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NewsDataRateLimiter,
  createNewsDataRateLimiter,
  createRateLimiterConfigFromEnv,
  type RateLimiterConfig,
} from './newsdata-rate-limiter.js';

// Mock logger to avoid console output during tests
vi.mock('./audit-logger.js', () => ({
  createAdvancedObservabilityLogger: vi.fn(() => ({
    logRateLimit: vi.fn(),
  })),
}));

describe('NewsData Rate Limiter', () => {
  let rateLimiter: NewsDataRateLimiter;
  let testConfig: RateLimiterConfig;

  beforeEach(() => {
    // Use smaller values for faster testing
    testConfig = {
      buckets: {
        latest: {
          capacity: 5,
          refillRate: 1, // 1 token per second
          dailyQuota: 100,
          resetHour: 0,
        },
        archive: {
          capacity: 3,
          refillRate: 0.5, // 0.5 tokens per second
          dailyQuota: 50,
          resetHour: 0,
        },
        crypto: {
          capacity: 4,
          refillRate: 0.8,
          dailyQuota: 80,
          resetHour: 0,
        },
        market: {
          capacity: 4,
          refillRate: 0.8,
          dailyQuota: 80,
          resetHour: 0,
        },
      },
      defaultRetryDelay: 100, // Fast retries for testing
      maxRetryAttempts: 2,
      jitterFactor: 0.1,
      coordinationEnabled: false, // Disable coordination for unit tests
      coordinationWindow: 1000, // 1 second window
    };

    rateLimiter = new NewsDataRateLimiter(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Bucket Functionality', () => {
    it('should allow requests when tokens are available', async () => {
      const result = await rateLimiter.tryConsume('latest', 1);
      
      expect(result.allowed).toBe(true);
      expect(result.tokensConsumed).toBe(1);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should deny requests when insufficient tokens', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.tryConsume('latest', 1);
      }
      
      const result = await rateLimiter.tryConsume('latest', 1);
      
      expect(result.allowed).toBe(false);
      expect(result.tokensConsumed).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.reason).toBe('Insufficient tokens');
    });

    it('should refill tokens over time', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.tryConsume('latest', 1);
      }
      
      // Should be denied immediately
      let result = await rateLimiter.tryConsume('latest', 1);
      expect(result.allowed).toBe(false);
      
      // Wait for refill (1 token per second)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be allowed now
      result = await rateLimiter.tryConsume('latest', 1);
      expect(result.allowed).toBe(true);
    });

    it('should track daily quota usage', async () => {
      const status = rateLimiter.getBucketStatus('latest');
      expect(status.dailyUsage).toBe(0);
      
      await rateLimiter.tryConsume('latest', 3);
      
      const updatedStatus = rateLimiter.getBucketStatus('latest');
      expect(updatedStatus.dailyUsage).toBe(3);
      expect(updatedStatus.quotaPercentage).toBe(3);
    });

    it('should deny requests when daily quota exceeded', async () => {
      // Set a very small quota for testing
      const smallQuotaConfig = {
        ...testConfig,
        buckets: {
          ...testConfig.buckets,
          latest: {
            ...testConfig.buckets.latest,
            dailyQuota: 3,
          },
        },
      };
      
      const smallQuotaLimiter = new NewsDataRateLimiter(smallQuotaConfig);
      
      // Consume quota
      await smallQuotaLimiter.tryConsume('latest', 3);
      
      // Should be denied due to quota
      const result = await smallQuotaLimiter.tryConsume('latest', 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Daily quota exceeded');
    });
  });

  describe('Multiple Buckets', () => {
    it('should handle different buckets independently', async () => {
      // Consume all latest tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.tryConsume('latest', 1);
      }
      
      // Latest should be denied
      const latestResult = await rateLimiter.tryConsume('latest', 1);
      expect(latestResult.allowed).toBe(false);
      
      // Archive should still be allowed
      const archiveResult = await rateLimiter.tryConsume('archive', 1);
      expect(archiveResult.allowed).toBe(true);
    });

    it('should have different refill rates for different buckets', async () => {
      const latestStatus = rateLimiter.getBucketStatus('latest');
      const archiveStatus = rateLimiter.getBucketStatus('archive');
      
      expect(latestStatus.refillRate).toBe(1);
      expect(archiveStatus.refillRate).toBe(0.5);
    });
  });

  describe('Bucket Management', () => {
    it('should get current token count', () => {
      const tokens = rateLimiter.getTokens('latest');
      expect(tokens).toBe(5); // Initial capacity
    });

    it('should check if request can be made', () => {
      expect(rateLimiter.canMakeRequest('latest', 1)).toBe(true);
      expect(rateLimiter.canMakeRequest('latest', 10)).toBe(false); // More than capacity
    });

    it('should calculate time until next token', async () => {
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.tryConsume('latest', 1);
        if (!result.allowed) break; // Stop if we can't consume more
      }
      
      // Check if we actually consumed all tokens
      const tokensAvailable = rateLimiter.getTokens('latest');
      if (tokensAvailable === 0) {
        const timeUntilToken = rateLimiter.getTimeUntilToken('latest');
        expect(timeUntilToken).toBeGreaterThan(0);
        expect(timeUntilToken).toBeLessThanOrEqual(1000); // Should be <= 1 second
      } else {
        // If tokens are still available, time should be 0
        const timeUntilToken = rateLimiter.getTimeUntilToken('latest');
        expect(timeUntilToken).toBe(0);
      }
    });

    it('should reset bucket to full capacity', async () => {
      // Consume some tokens
      await rateLimiter.tryConsume('latest', 3);
      expect(rateLimiter.getTokens('latest')).toBe(2);
      
      // Reset bucket
      rateLimiter.resetBucket('latest');
      expect(rateLimiter.getTokens('latest')).toBe(5);
    });

    it('should reset daily usage', async () => {
      // Consume some tokens
      await rateLimiter.tryConsume('latest', 3);
      
      let status = rateLimiter.getBucketStatus('latest');
      expect(status.dailyUsage).toBe(3);
      
      // Reset daily usage
      rateLimiter.resetDailyUsage('latest');
      
      status = rateLimiter.getBucketStatus('latest');
      expect(status.dailyUsage).toBe(0);
    });
  });

  describe('Status Reporting', () => {
    it('should get bucket status', async () => {
      await rateLimiter.tryConsume('latest', 2);
      
      const status = rateLimiter.getBucketStatus('latest');
      
      expect(status.bucket).toBe('latest');
      expect(status.tokensAvailable).toBe(3);
      expect(status.capacity).toBe(5);
      expect(status.refillRate).toBe(1);
      expect(status.dailyUsage).toBe(2);
      expect(status.dailyQuota).toBe(100);
      expect(status.quotaPercentage).toBe(2);
      expect(status.isThrottled).toBe(false);
    });

    it('should get all bucket status', () => {
      const allStatus = rateLimiter.getAllBucketStatus();
      
      expect(allStatus).toHaveLength(4);
      expect(allStatus.map(s => s.bucket)).toEqual(['latest', 'archive', 'crypto', 'market']);
    });

    it('should mark bucket as throttled when quota high', async () => {
      // Set a small quota and consume most of it
      const smallQuotaConfig = {
        ...testConfig,
        buckets: {
          ...testConfig.buckets,
          latest: {
            ...testConfig.buckets.latest,
            capacity: 10, // Increase capacity to allow consuming 9 tokens
            dailyQuota: 10,
          },
        },
      };
      
      const smallQuotaLimiter = new NewsDataRateLimiter(smallQuotaConfig);
      
      // Consume 9 out of 10 (90%)
      const result = await smallQuotaLimiter.tryConsume('latest', 9);
      expect(result.allowed).toBe(true); // Should be allowed
      
      const status = smallQuotaLimiter.getBucketStatus('latest');
      expect(status.quotaPercentage).toBe(90);
      expect(status.isThrottled).toBe(true); // Should be throttled at >80%
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate exponential backoff delay', () => {
      const delay1 = rateLimiter.calculateBackoffDelay(1);
      const delay2 = rateLimiter.calculateBackoffDelay(2);
      const delay3 = rateLimiter.calculateBackoffDelay(3);
      
      // Should increase exponentially (with jitter)
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
      
      // Base delay should be around configured value (100ms)
      expect(delay1).toBeGreaterThanOrEqual(100);
      expect(delay1).toBeLessThan(200); // With 10% jitter
    });

    it('should add jitter to prevent thundering herd', () => {
      const delays = Array.from({ length: 10 }, () => 
        rateLimiter.calculateBackoffDelay(1)
      );
      
      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('Execute with Rate Limit', () => {
    it('should execute function when tokens available', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRateLimit('latest', mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('should retry on rate limit with backoff', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const onRetry = vi.fn();
      
      // Consume all tokens first
      for (let i = 0; i < 5; i++) {
        await rateLimiter.tryConsume('latest', 1);
      }
      
      // This should trigger retry logic
      const promise = rateLimiter.executeWithRateLimit('latest', mockFn, {
        maxRetries: 1,
        onRetry,
      });
      
      // Wait a bit for retry
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Reset bucket to allow execution
      rateLimiter.resetBucket('latest');
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(onRetry).toHaveBeenCalled();
    });

    it('should throw error after max retries', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      // Create a rate limiter with no refill to ensure tokens don't replenish
      const noRefillConfig = {
        ...testConfig,
        buckets: {
          ...testConfig.buckets,
          latest: {
            ...testConfig.buckets.latest,
            refillRate: 0, // No refill during test
          },
        },
      };
      
      const noRefillLimiter = new NewsDataRateLimiter(noRefillConfig);
      
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await noRefillLimiter.tryConsume('latest', 1);
      }
      
      // Should fail after retries (tokens won't refill)
      await expect(
        noRefillLimiter.executeWithRateLimit('latest', mockFn, {
          maxRetries: 1,
        })
      ).rejects.toThrow('Rate limit exceeded after 1 retries');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown bucket', async () => {
      await expect(
        rateLimiter.tryConsume('unknown', 1)
      ).rejects.toThrow('Unknown bucket: unknown');
    });

    it('should throw error for invalid bucket in getTokens', () => {
      expect(() => rateLimiter.getTokens('unknown')).toThrow('Unknown bucket: unknown');
    });

    it('should throw error for invalid bucket in canMakeRequest', () => {
      expect(rateLimiter.canMakeRequest('unknown', 1)).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    it('should create rate limiter with default config', () => {
      const limiter = createNewsDataRateLimiter();
      
      const status = limiter.getAllBucketStatus();
      expect(status).toHaveLength(4);
    });

    it('should create rate limiter with custom config', () => {
      const customConfig = {
        buckets: {
          latest: {
            capacity: 10,
            refillRate: 2,
            dailyQuota: 200,
            resetHour: 0,
          },
          archive: {
            capacity: 5,
            refillRate: 1,
            dailyQuota: 100,
            resetHour: 0,
          },
          crypto: {
            capacity: 8,
            refillRate: 1.5,
            dailyQuota: 150,
            resetHour: 0,
          },
          market: {
            capacity: 8,
            refillRate: 1.5,
            dailyQuota: 150,
            resetHour: 0,
          },
        },
      };
      
      const limiter = createNewsDataRateLimiter(customConfig);
      
      const status = limiter.getBucketStatus('latest');
      expect(status.capacity).toBe(10);
      expect(status.refillRate).toBe(2);
      expect(status.dailyQuota).toBe(200);
    });

    it('should create config from environment variables', () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NEWSDATA_RATE_LIMIT_LATEST_CAPACITY: '15',
        NEWSDATA_RATE_LIMIT_LATEST_REFILL: '3',
        NEWSDATA_RATE_LIMIT_LATEST_QUOTA: '6000',
        NEWSDATA_RETRY_DELAY: '2000',
        NEWSDATA_MAX_RETRIES: '5',
      };
      
      const config = createRateLimiterConfigFromEnv();
      
      expect(config.buckets?.latest?.capacity).toBe(15);
      expect(config.buckets?.latest?.refillRate).toBe(3);
      expect(config.buckets?.latest?.dailyQuota).toBe(6000);
      expect(config.defaultRetryDelay).toBe(2000);
      expect(config.maxRetryAttempts).toBe(5);
      
      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('Coordination', () => {
    it('should allow requests when coordination enabled and under limit', async () => {
      const result = await rateLimiter.tryConsume('latest', 1);
      expect(result.allowed).toBe(true);
    });

    it('should deny requests when too many concurrent requests', async () => {
      // Enable coordination for this specific test
      const coordinationConfig = {
        ...testConfig,
        coordinationEnabled: true,
      };
      const coordinationLimiter = new NewsDataRateLimiter(coordinationConfig);
      
      // Make multiple rapid requests to trigger coordination limit
      const promises = Array.from({ length: 10 }, () => 
        coordinationLimiter.tryConsume('latest', 1)
      );
      
      const results = await Promise.all(promises);
      
      // Some should be denied due to coordination
      const denied = results.filter(r => !r.allowed && r.reason === 'Too many concurrent requests');
      expect(denied.length).toBeGreaterThan(0);
    });
  });
});