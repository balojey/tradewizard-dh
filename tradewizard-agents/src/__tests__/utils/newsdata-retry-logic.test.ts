/**
 * NewsData Retry Logic Tests
 * 
 * Unit tests for the NewsData.io retry logic implementation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NewsDataRetryLogic,
  createNewsDataRetryLogic,
  createRetryConfigFromEnv,
  DEFAULT_RETRY_CONFIG,
  RetryableError,
  NonRetryableError,
  ErrorType,
  type RetryConfig,
} from './newsdata-retry-logic.js';

// Mock logger to avoid console output during tests
vi.mock('./audit-logger.js', () => ({
  createAdvancedObservabilityLogger: vi.fn(() => ({
    logRateLimit: vi.fn(),
  })),
}));

describe('NewsData Retry Logic', () => {
  let retryLogic: NewsDataRetryLogic;
  let testConfig: RetryConfig;

  beforeEach(() => {
    // Use faster config for testing
    testConfig = {
      ...DEFAULT_RETRY_CONFIG,
      maxAttempts: 3,
      baseDelay: 10, // Very fast for testing
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      circuitBreakerEnabled: true,
      failureThreshold: 2,
      circuitBreakerTimeout: 100,
    };

    retryLogic = new NewsDataRetryLogic(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful Execution', () => {
    it('should execute function successfully on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await retryLogic.executeWithRetry(mockFn);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDelay).toBe(0);
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('should execute function successfully after retries', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');
      
      const result = await retryLogic.executeWithRetry(mockFn);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(3);
      expect(result.totalDelay).toBeGreaterThan(0);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Classification', () => {
    it('should classify rate limit errors correctly', () => {
      const error = new Error('Rate limit exceeded');
      const errorType = retryLogic.classifyError(error);
      
      expect(errorType).toBe(ErrorType.RATE_LIMIT);
    });

    it('should classify network errors correctly', () => {
      const error = new Error('ECONNRESET: Connection reset');
      const errorType = retryLogic.classifyError(error);
      
      expect(errorType).toBe(ErrorType.NETWORK);
    });

    it('should classify timeout errors correctly', () => {
      const error = new Error('Request timeout');
      const errorType = retryLogic.classifyError(error);
      
      expect(errorType).toBe(ErrorType.TIMEOUT);
    });

    it('should classify server errors correctly', () => {
      const error = new Error('HTTP 500: Internal Server Error');
      const errorType = retryLogic.classifyError(error);
      
      expect(errorType).toBe(ErrorType.SERVER_ERROR);
    });

    it('should classify client errors correctly', () => {
      const error = new Error('HTTP 401: Unauthorized');
      const errorType = retryLogic.classifyError(error);
      
      expect(errorType).toBe(ErrorType.CLIENT_ERROR);
    });

    it('should classify quota exhausted errors correctly', () => {
      const error = new Error('Daily quota exceeded');
      const errorType = retryLogic.classifyError(error);
      
      expect(errorType).toBe(ErrorType.QUOTA_EXHAUSTED);
    });
  });

  describe('Retryable Error Detection', () => {
    it('should retry network errors', () => {
      const error = new Error('ECONNRESET');
      const errorType = ErrorType.NETWORK;
      
      const isRetryable = retryLogic.isRetryableError(error, errorType);
      
      expect(isRetryable).toBe(true);
    });

    it('should retry server errors', () => {
      const error = new Error('HTTP 500');
      const errorType = ErrorType.SERVER_ERROR;
      
      const isRetryable = retryLogic.isRetryableError(error, errorType);
      
      expect(isRetryable).toBe(true);
    });

    it('should not retry client errors', () => {
      const error = new Error('HTTP 401');
      const errorType = ErrorType.CLIENT_ERROR;
      
      const isRetryable = retryLogic.isRetryableError(error, errorType);
      
      expect(isRetryable).toBe(false);
    });

    it('should not retry quota exhausted errors', () => {
      const error = new Error('Daily quota exceeded');
      const errorType = ErrorType.QUOTA_EXHAUSTED;
      
      const isRetryable = retryLogic.isRetryableError(error, errorType);
      
      expect(isRetryable).toBe(false);
    });

    it('should handle RetryableError instances', () => {
      const error = new RetryableError('Custom retryable error', ErrorType.NETWORK);
      const errorType = ErrorType.CLIENT_ERROR; // Different type
      
      const isRetryable = retryLogic.isRetryableError(error, errorType);
      
      expect(isRetryable).toBe(true); // Should be retryable due to instance type
    });

    it('should handle NonRetryableError instances', () => {
      const error = new NonRetryableError('Custom non-retryable error', ErrorType.NETWORK);
      const errorType = ErrorType.NETWORK; // Normally retryable type
      
      const isRetryable = retryLogic.isRetryableError(error, errorType);
      
      expect(isRetryable).toBe(false); // Should not be retryable due to instance type
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate exponential backoff delay', () => {
      const delay1 = retryLogic.calculateDelay(1, ErrorType.NETWORK, new Error('test'), testConfig);
      const delay2 = retryLogic.calculateDelay(2, ErrorType.NETWORK, new Error('test'), testConfig);
      const delay3 = retryLogic.calculateDelay(3, ErrorType.NETWORK, new Error('test'), testConfig);
      
      // Should increase exponentially (accounting for jitter)
      expect(delay2).toBeGreaterThan(delay1 * 1.5); // Allow for jitter
      expect(delay3).toBeGreaterThan(delay2 * 1.5);
    });

    it('should respect maximum delay cap', () => {
      const delay = retryLogic.calculateDelay(10, ErrorType.NETWORK, new Error('test'), testConfig);
      
      expect(delay).toBeLessThanOrEqual(testConfig.maxDelay);
    });

    it('should use special delay for quota exhausted errors', () => {
      const delay = retryLogic.calculateDelay(1, ErrorType.QUOTA_EXHAUSTED, new Error('test'), testConfig);
      
      expect(delay).toBe(testConfig.quotaExhaustedDelay);
    });

    it('should use retry-after header for rate limit errors', () => {
      const retryAfter = 5000;
      const error = new RetryableError('Rate limited', ErrorType.RATE_LIMIT, retryAfter);
      
      const delay = retryLogic.calculateDelay(1, ErrorType.RATE_LIMIT, error, testConfig);
      
      expect(delay).toBe(Math.min(retryAfter, testConfig.maxDelay)); // Should be capped at maxDelay
    });

    it('should add jitter to prevent thundering herd', () => {
      const delays = Array.from({ length: 10 }, () =>
        retryLogic.calculateDelay(1, ErrorType.NETWORK, new Error('test'), testConfig)
      );
      
      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('Retry Execution', () => {
    it('should fail after max attempts', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const result = await retryLogic.executeWithRetry(mockFn);
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(testConfig.maxAttempts);
      expect(result.error?.message).toBe('Network error');
      expect(mockFn).toHaveBeenCalledTimes(testConfig.maxAttempts);
    });

    it('should not retry non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('HTTP 401: Unauthorized'));
      
      const result = await retryLogic.executeWithRetry(mockFn);
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Should not retry
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('should call onRetry callback', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');
      
      const onRetry = vi.fn();
      
      const result = await retryLogic.executeWithRetry(mockFn, { onRetry });
      
      expect(result.success).toBe(true);
      expect(onRetry).toHaveBeenCalledOnce();
      expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
        attempt: 1,
        totalAttempts: testConfig.maxAttempts,
        lastError: expect.any(Error),
        lastDelay: expect.any(Number),
      }));
    });

    it('should track total delay', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');
      
      const result = await retryLogic.executeWithRetry(mockFn);
      
      expect(result.success).toBe(true);
      expect(result.totalDelay).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker', () => {
    it('should trip circuit breaker after threshold failures', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Server error'));
      
      // First failure
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      
      // Second failure should trip circuit breaker
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      
      // Third attempt should be blocked by circuit breaker
      const result = await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.circuitBreakerTripped).toBe(true);
      expect(result.attempts).toBe(0);
    });

    it('should reset circuit breaker after timeout', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Server error'));
      
      // Trip circuit breaker
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      
      // Should be blocked
      let result = await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      expect(result.circuitBreakerTripped).toBe(true);
      
      // Wait for circuit breaker timeout
      await new Promise(resolve => setTimeout(resolve, testConfig.circuitBreakerTimeout + 10));
      
      // Should allow execution again (half-open state)
      mockFn.mockResolvedValueOnce('success');
      result = await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      expect(result.success).toBe(true);
    });

    it('should handle different endpoints independently', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Server error'));
      
      // Trip circuit breaker for endpoint1
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'endpoint1' });
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'endpoint1' });
      
      // endpoint1 should be blocked
      let result = await retryLogic.executeWithRetry(mockFn, { endpoint: 'endpoint1' });
      expect(result.circuitBreakerTripped).toBe(true);
      
      // endpoint2 should still work
      mockFn.mockResolvedValueOnce('success');
      result = await retryLogic.executeWithRetry(mockFn, { endpoint: 'endpoint2' });
      expect(result.success).toBe(true);
    });

    it('should reset circuit breaker manually', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Server error'));
      
      // Trip circuit breaker
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      
      // Should be blocked
      let result = await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      expect(result.circuitBreakerTripped).toBe(true);
      
      // Reset circuit breaker
      retryLogic.resetCircuitBreaker('test');
      
      // Should work again
      mockFn.mockResolvedValueOnce('success');
      result = await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('Metrics', () => {
    it('should track retry metrics', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');
      
      await retryLogic.executeWithRetry(mockFn);
      
      const metrics = retryLogic.getMetrics();
      
      expect(metrics.totalRetries).toBe(1);
      expect(metrics.successfulRetries).toBe(1);
      expect(metrics.failedRetries).toBe(0);
      expect(metrics.averageAttempts).toBe(2);
      expect(metrics.averageDelay).toBeGreaterThan(0);
    });

    it('should track error breakdown', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValue('success');
      
      await retryLogic.executeWithRetry(mockFn);
      
      const metrics = retryLogic.getMetrics();
      
      expect(metrics.errorBreakdown[ErrorType.NETWORK]).toBe(1);
      expect(metrics.errorBreakdown[ErrorType.SERVER_ERROR]).toBe(1);
    });

    it('should get circuit breaker status', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Server error'));
      
      // Trip circuit breaker
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      await retryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      
      const status = retryLogic.getCircuitBreakerStatus();
      
      expect(status.test).toBeDefined();
      expect(status.test.state).toBe('open');
      expect(status.test.failures).toBeGreaterThan(0);
    });

    it('should reset metrics', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      await retryLogic.executeWithRetry(mockFn);
      
      let metrics = retryLogic.getMetrics();
      expect(metrics.totalRetries).toBe(1);
      
      retryLogic.resetMetrics();
      
      metrics = retryLogic.getMetrics();
      expect(metrics.totalRetries).toBe(0);
      expect(metrics.successfulRetries).toBe(0);
      expect(metrics.failedRetries).toBe(0);
    });
  });

  describe('Factory Functions', () => {
    it('should create retry logic with default config', () => {
      const logic = createNewsDataRetryLogic();
      
      expect(logic).toBeInstanceOf(NewsDataRetryLogic);
    });

    it('should create retry logic with custom config', () => {
      const customConfig = {
        maxAttempts: 5,
        baseDelay: 2000,
      };
      
      const logic = createNewsDataRetryLogic(customConfig);
      
      expect(logic).toBeInstanceOf(NewsDataRetryLogic);
    });

    it('should create config from environment variables', () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NEWSDATA_RETRY_MAX_ATTEMPTS: '5',
        NEWSDATA_RETRY_BASE_DELAY: '2000',
        NEWSDATA_RETRY_MAX_DELAY: '120000',
        NEWSDATA_RETRY_BACKOFF_MULTIPLIER: '3',
        NEWSDATA_RETRY_JITTER_FACTOR: '0.2',
      };
      
      const config = createRetryConfigFromEnv();
      
      expect(config.maxAttempts).toBe(5);
      expect(config.baseDelay).toBe(2000);
      expect(config.maxDelay).toBe(120000);
      expect(config.backoffMultiplier).toBe(3);
      expect(config.jitterFactor).toBe(0.2);
      
      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('Custom Configuration', () => {
    it('should use custom retry config', async () => {
      const customConfig = {
        ...testConfig,
        maxAttempts: 1, // Only one attempt
      };
      
      const customRetryLogic = new NewsDataRetryLogic(customConfig);
      const mockFn = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const result = await customRetryLogic.executeWithRetry(mockFn);
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('should disable circuit breaker when configured', async () => {
      const customConfig = {
        ...testConfig,
        circuitBreakerEnabled: false,
      };
      
      const customRetryLogic = new NewsDataRetryLogic(customConfig);
      const mockFn = vi.fn().mockRejectedValue(new Error('Server error'));
      
      // Multiple failures should not trip circuit breaker
      await customRetryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      await customRetryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      const result = await customRetryLogic.executeWithRetry(mockFn, { endpoint: 'test' });
      
      expect(result.circuitBreakerTripped).toBeUndefined();
    });
  });
});