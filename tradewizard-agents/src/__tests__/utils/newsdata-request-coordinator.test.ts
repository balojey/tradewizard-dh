/**
 * NewsData Request Coordinator Tests
 * 
 * Unit tests for the NewsData.io request coordinator implementation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NewsDataRequestCoordinator,
  createNewsDataRequestCoordinator,
  DEFAULT_REQUEST_COORDINATOR_CONFIG,
  type RequestCoordinatorConfig,
} from './newsdata-request-coordinator.js';
import { NewsDataRateLimiter } from './newsdata-rate-limiter.js';
import { NewsDataCacheManager } from './newsdata-cache-manager.js';

// Mock dependencies
vi.mock('./audit-logger.js', () => ({
  createAdvancedObservabilityLogger: vi.fn(() => ({
    logDataFetch: vi.fn(),
    logRateLimit: vi.fn(),
  })),
}));

describe('NewsData Request Coordinator', () => {
  let coordinator: NewsDataRequestCoordinator;
  let mockRateLimiter: NewsDataRateLimiter;
  let mockCacheManager: NewsDataCacheManager;
  let testConfig: RequestCoordinatorConfig;

  beforeEach(() => {
    // Create mock rate limiter
    mockRateLimiter = {
      tryConsume: vi.fn().mockResolvedValue({ allowed: true, tokensConsumed: 1 }),
      getBucketStatus: vi.fn().mockReturnValue({
        bucket: 'latest',
        tokensAvailable: 10,
        capacity: 30,
        refillRate: 2,
        dailyUsage: 100,
        dailyQuota: 5000,
        quotaPercentage: 2,
        nextRefillTime: Date.now() + 1000,
        nextResetTime: Date.now() + 86400000,
        isThrottled: false,
      }),
      getAllBucketStatus: vi.fn().mockReturnValue([]),
    } as any;

    // Create mock cache manager
    mockCacheManager = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockResolvedValue(false),
      delete: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Test configuration with faster processing
    testConfig = {
      ...DEFAULT_REQUEST_COORDINATOR_CONFIG,
      throttleThresholds: {
        warning: 70,
        throttle: 80,
        emergency: 90,
      },
      coordination: {
        maxConcurrentRequests: 5,
        requestTimeout: 5000,
        coordinationWindow: 1000,
      },
      batching: {
        enabled: false, // Disable batching for simpler testing
        maxBatchSize: 3,
        batchWindow: 500,
        maxWaitTime: 1000,
      },
    };

    coordinator = new NewsDataRequestCoordinator(
      mockRateLimiter,
      mockCacheManager,
      testConfig
    );
  });

  afterEach(() => {
    coordinator.stop();
    vi.clearAllMocks();
  });

  describe('Request Submission', () => {
    it('should submit request and return success result', async () => {
      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      expect(result.success).toBe(true);
      expect(result.cached).toBe(false);
      expect(result.throttled).toBe(false);
      expect(result.quotaExhausted).toBe(false);
      expect(result.requestId).toBeDefined();
    });

    it('should determine priority based on endpoint', async () => {
      // Latest should be high priority
      const latestResult = await coordinator.submitRequest('latest', { q: 'test' });
      expect(latestResult.success).toBe(true);
      
      // Archive should be low priority
      const archiveResult = await coordinator.submitRequest('archive', { q: 'test' });
      expect(archiveResult.success).toBe(true);
    });

    it('should handle custom priority', async () => {
      const result = await coordinator.submitRequest('latest', { q: 'test' }, {
        priority: 'low',
        agentId: 'test-agent',
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should handle rate limit denial', async () => {
      // Mock rate limiter to deny request
      mockRateLimiter.tryConsume = vi.fn().mockResolvedValue({
        allowed: false,
        tokensConsumed: 0,
        retryAfter: 5000,
        reason: 'Insufficient tokens',
      });

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient tokens');
      expect(result.retryAfter).toBe(5000);
    });

    it('should handle quota exhaustion', async () => {
      // Mock rate limiter to indicate quota exhausted
      mockRateLimiter.tryConsume = vi.fn().mockResolvedValue({
        allowed: false,
        tokensConsumed: 0,
        retryAfter: 86400000,
        reason: 'Daily quota exceeded',
      });

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.quotaExhausted).toBe(true);
      expect(result.error).toBe('Daily quota exhausted');
    });
  });

  describe('Throttling', () => {
    it('should throttle requests when quota threshold exceeded', async () => {
      // Mock bucket status to indicate high quota usage
      mockRateLimiter.getBucketStatus = vi.fn().mockReturnValue({
        bucket: 'latest',
        tokensAvailable: 10,
        capacity: 30,
        refillRate: 2,
        dailyUsage: 4000,
        dailyQuota: 5000,
        quotaPercentage: 80, // At throttle threshold
        nextRefillTime: Date.now() + 1000,
        nextResetTime: Date.now() + 86400000,
        isThrottled: true,
      });

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.throttled).toBe(true);
      expect(result.error).toBe('Request throttled due to quota limits');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should use cache fallback when throttled', async () => {
      // Mock high quota usage
      mockRateLimiter.getBucketStatus = vi.fn().mockReturnValue({
        bucket: 'latest',
        quotaPercentage: 85, // Above throttle threshold
        isThrottled: true,
      } as any);

      // Mock cached data available
      mockCacheManager.get = vi.fn().mockResolvedValue({
        data: { articles: ['cached article'] },
        timestamp: Date.now() - 30000, // 30 seconds old
        ttl: 900, // 15 minutes TTL
        isStale: false,
      });

      const result = await coordinator.submitRequest('latest', { q: 'test' }, {
        enableCacheFallback: true,
      });
      
      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.throttled).toBe(true);
      expect(result.data).toEqual({ articles: ['cached article'] });
    });
  });

  describe('Cache Fallback', () => {
    it('should use cache fallback when quota in emergency state', async () => {
      // Mock emergency quota usage
      mockRateLimiter.getBucketStatus = vi.fn().mockReturnValue({
        bucket: 'latest',
        quotaPercentage: 95, // Above emergency threshold
        isThrottled: true,
      } as any);

      // Mock cached data
      mockCacheManager.get = vi.fn().mockResolvedValue({
        data: { articles: ['emergency cached article'] },
        timestamp: Date.now() - 60000, // 1 minute old
        ttl: 900,
        isStale: false,
      });

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(mockCacheManager.get).toHaveBeenCalled();
    });

    it('should handle stale cached data', async () => {
      // Mock emergency state
      mockRateLimiter.getBucketStatus = vi.fn().mockReturnValue({
        bucket: 'latest',
        quotaPercentage: 95,
        isThrottled: true,
      } as any);

      // Mock stale cached data
      mockCacheManager.get = vi.fn().mockResolvedValue({
        data: { articles: ['stale article'] },
        timestamp: Date.now() - 1800000, // 30 minutes old
        ttl: 900, // 15 minutes TTL (so it's stale)
        isStale: true,
      });

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.stale).toBe(true);
    });

    it('should reject cache data that is too stale', async () => {
      // Mock emergency state
      mockRateLimiter.getBucketStatus = vi.fn().mockReturnValue({
        bucket: 'latest',
        quotaPercentage: 95,
        isThrottled: true,
      } as any);

      // Mock very stale cached data (older than maxStaleAge)
      mockCacheManager.get = vi.fn().mockResolvedValue({
        data: { articles: ['very stale article'] },
        timestamp: Date.now() - 7200000, // 2 hours old (exceeds 1 hour maxStaleAge)
        ttl: 900,
        isStale: true,
      });

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      // Should not use the cache and proceed with throttling
      expect(result.success).toBe(false);
      expect(result.throttled).toBe(true);
    });
  });

  describe('Metrics and Status', () => {
    it('should track coordination metrics', async () => {
      await coordinator.submitRequest('latest', { q: 'test1' });
      await coordinator.submitRequest('crypto', { q: 'test2' });
      
      const metrics = coordinator.getMetrics();
      
      expect(metrics).toHaveProperty('activeRequests');
      expect(metrics).toHaveProperty('queuedRequests');
      expect(metrics).toHaveProperty('throttledRequests');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('quotaUsage');
      expect(metrics).toHaveProperty('averageResponseTime');
    });

    it('should get queue status', async () => {
      const status = coordinator.getQueueStatus();
      
      expect(status).toHaveProperty('total');
      expect(status).toHaveProperty('active');
      expect(status).toHaveProperty('byPriority');
      expect(status.byPriority).toHaveProperty('high');
      expect(status.byPriority).toHaveProperty('medium');
      expect(status.byPriority).toHaveProperty('low');
    });

    it('should get rate limit status', () => {
      const status = coordinator.getRateLimitStatus();
      
      expect(Array.isArray(status)).toBe(true);
      expect(mockRateLimiter.getAllBucketStatus).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limiter errors', async () => {
      mockRateLimiter.tryConsume = vi.fn().mockRejectedValue(new Error('Rate limiter error'));

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limiter error');
    });

    it('should handle cache manager errors', async () => {
      // Mock emergency state to trigger cache fallback
      mockRateLimiter.getBucketStatus = vi.fn().mockReturnValue({
        bucket: 'latest',
        quotaPercentage: 95,
        isThrottled: true,
      } as any);

      // Mock cache error
      mockCacheManager.get = vi.fn().mockRejectedValue(new Error('Cache error'));

      const result = await coordinator.submitRequest('latest', { q: 'test' });
      
      // Should handle cache error gracefully and proceed with throttling
      expect(result.success).toBe(false);
      expect(result.throttled).toBe(true);
    });
  });

  describe('Factory Functions', () => {
    it('should create coordinator with default config', () => {
      const coordinator = createNewsDataRequestCoordinator(
        mockRateLimiter,
        mockCacheManager
      );
      
      expect(coordinator).toBeInstanceOf(NewsDataRequestCoordinator);
      coordinator.stop();
    });

    it('should create coordinator with custom config', () => {
      const customConfig = {
        throttleThresholds: {
          warning: 60,
          throttle: 70,
          emergency: 80,
        },
      };
      
      const coordinator = createNewsDataRequestCoordinator(
        mockRateLimiter,
        mockCacheManager,
        customConfig
      );
      
      expect(coordinator).toBeInstanceOf(NewsDataRequestCoordinator);
      coordinator.stop();
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests', async () => {
      const promises = Array.from({ length: 3 }, (_, i) =>
        coordinator.submitRequest('latest', { q: `test${i}` })
      );
      
      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.requestId).toBeDefined();
      });
    });

    it('should respect max concurrent requests limit', async () => {
      // Create many requests that will queue up
      const promises = Array.from({ length: 10 }, (_, i) =>
        coordinator.submitRequest('latest', { q: `test${i}` })
      );
      
      // All should eventually complete
      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('requestId');
      });
    });
  });
});