/**
 * Unit tests for retry logic and error recovery utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  calculateBackoffDelay,
  withTimeout,
  sleep,
  CircuitBreaker,
  isNetworkError,
  isRateLimitError,
  isServerError,
  isClientError,
  isRetryableError,
  retryApiCall,
  retryDatabaseOperation,
} from './retry-logic.js';

describe('Retry Logic', () => {

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow('Persistent failure');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry if error is not retryable', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('404 Not Found'));
      const isRetryable = (error: Error) => !error.message.includes('404');

      await expect(
        withRetry(fn, { maxRetries: 3, isRetryable })
      ).rejects.toThrow('404 Not Found');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback on each retry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Error),
        expect.any(Number)
      );
    });

    it('should apply timeout if specified', async () => {
      const fn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      await expect(
        withRetry(fn, { timeoutMs: 100, maxRetries: 0 })
      ).rejects.toThrow('Operation timed out');
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const options = {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterFactor: 0,
        exponentialBackoff: true,
      };

      expect(calculateBackoffDelay(0, options)).toBe(1000); // 1000 * 2^0
      expect(calculateBackoffDelay(1, options)).toBe(2000); // 1000 * 2^1
      expect(calculateBackoffDelay(2, options)).toBe(4000); // 1000 * 2^2
      expect(calculateBackoffDelay(3, options)).toBe(8000); // 1000 * 2^3
    });

    it('should calculate linear backoff correctly', () => {
      const options = {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterFactor: 0,
        exponentialBackoff: false,
      };

      expect(calculateBackoffDelay(0, options)).toBe(1000); // 1000 * 1
      expect(calculateBackoffDelay(1, options)).toBe(2000); // 1000 * 2
      expect(calculateBackoffDelay(2, options)).toBe(3000); // 1000 * 3
      expect(calculateBackoffDelay(3, options)).toBe(4000); // 1000 * 4
    });

    it('should cap delay at maxDelayMs', () => {
      const options = {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        jitterFactor: 0,
        exponentialBackoff: true,
      };

      expect(calculateBackoffDelay(10, options)).toBe(5000); // Capped at max
    });

    it('should add jitter to delay', () => {
      const options = {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterFactor: 0.3,
        exponentialBackoff: true,
      };

      const delay = calculateBackoffDelay(1, options);

      // With 30% jitter, delay should be between 2000 and 2600
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(2600);
    });
  });

  describe('withTimeout', () => {
    it('should resolve if function completes within timeout', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withTimeout(fn, 1000);

      expect(result).toBe('success');
    });

    it('should reject if function exceeds timeout', async () => {
      const fn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      await expect(withTimeout(fn, 100)).rejects.toThrow('Operation timed out after 100ms');
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('CircuitBreaker', () => {
    it('should allow requests when circuit is closed', async () => {
      const breaker = new CircuitBreaker();
      const fn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open circuit after failure threshold', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const fn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      }

      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.getFailureCount()).toBe(3);
    });

    it('should reject requests when circuit is open', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const fn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger failures to open circuit
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');

      expect(breaker.getState()).toBe('OPEN');

      // Next request should be rejected immediately
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(fn).toHaveBeenCalledTimes(2); // Not called for third attempt
    });

    it('should transition to half-open after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
        successThreshold: 1,
      });
      const fn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open circuit
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await sleep(150);

      // Next request should transition to half-open and succeed
      fn.mockResolvedValue('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED'); // Closed after success threshold met
    });

    it('should close circuit after success threshold in half-open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
        successThreshold: 2,
      });
      const fn = vi.fn();

      // Open circuit
      fn.mockRejectedValue(new Error('Failure'));
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await sleep(150);

      // Succeed in half-open state
      fn.mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getState()).toBe('HALF_OPEN');

      await breaker.execute(fn);
      expect(breaker.getState()).toBe('CLOSED'); // Closed after 2 successes
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
      });
      const fn = vi.fn();

      // Open circuit
      fn.mockRejectedValue(new Error('Failure'));
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await sleep(150);

      // Fail in half-open state
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('OPEN'); // Reopened
    });

    it('should call onStateChange callback', async () => {
      const onStateChange = vi.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        onStateChange,
      });
      const fn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger state change
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');

      expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');
    });

    it('should reset circuit breaker', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const fn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open circuit
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      await expect(breaker.execute(fn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('OPEN');

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('Error Predicates', () => {
    describe('isNetworkError', () => {
      it('should identify network errors', () => {
        expect(isNetworkError(new Error('Network error occurred'))).toBe(true);
        expect(isNetworkError(new Error('Connection timeout'))).toBe(true);
        expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
        expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true);
        expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true);
        expect(isNetworkError(new Error('fetch failed'))).toBe(true);
      });

      it('should not identify non-network errors', () => {
        expect(isNetworkError(new Error('Invalid input'))).toBe(false);
        expect(isNetworkError(new Error('404 Not Found'))).toBe(false);
      });
    });

    describe('isRateLimitError', () => {
      it('should identify rate limit errors', () => {
        expect(isRateLimitError(new Error('Rate limit exceeded'))).toBe(true);
        expect(isRateLimitError(new Error('HTTP 429: Too Many Requests'))).toBe(true);
        expect(isRateLimitError(new Error('too many requests'))).toBe(true);
      });

      it('should not identify non-rate-limit errors', () => {
        expect(isRateLimitError(new Error('Invalid input'))).toBe(false);
        expect(isRateLimitError(new Error('500 Internal Server Error'))).toBe(false);
      });
    });

    describe('isServerError', () => {
      it('should identify server errors', () => {
        expect(isServerError(new Error('HTTP 500: Internal Server Error'))).toBe(true);
        expect(isServerError(new Error('502 Bad Gateway'))).toBe(true);
        expect(isServerError(new Error('503 Service Unavailable'))).toBe(true);
        expect(isServerError(new Error('504 Gateway Timeout'))).toBe(true);
      });

      it('should not identify non-server errors', () => {
        expect(isServerError(new Error('404 Not Found'))).toBe(false);
        expect(isServerError(new Error('Invalid input'))).toBe(false);
      });
    });

    describe('isClientError', () => {
      it('should identify client errors', () => {
        expect(isClientError(new Error('400 Bad Request'))).toBe(true);
        expect(isClientError(new Error('401 Unauthorized'))).toBe(true);
        expect(isClientError(new Error('403 Forbidden'))).toBe(true);
        expect(isClientError(new Error('404 Not Found'))).toBe(true);
      });

      it('should not identify non-client errors', () => {
        expect(isClientError(new Error('500 Internal Server Error'))).toBe(false);
        expect(isClientError(new Error('Network error'))).toBe(false);
      });
    });

    describe('isRetryableError', () => {
      it('should identify retryable errors', () => {
        expect(isRetryableError(new Error('Network error'))).toBe(true);
        expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
        expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
      });

      it('should not identify non-retryable errors', () => {
        expect(isRetryableError(new Error('404 Not Found'))).toBe(false);
        expect(isRetryableError(new Error('400 Bad Request'))).toBe(false);
      });
    });
  });

  describe('Convenience Functions', () => {
    describe('retryApiCall', () => {
      it('should retry API calls with default options', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('500 Internal Server Error'))
          .mockResolvedValue('success');

        const result = await retryApiCall(fn, 'Test API');

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should not retry non-retryable errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('404 Not Found'));

        await expect(retryApiCall(fn, 'Test API')).rejects.toThrow('404 Not Found');
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('retryDatabaseOperation', () => {
      it('should retry database operations with default options', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Connection timeout'))
          .mockResolvedValue('success');

        const result = await retryDatabaseOperation(fn, 'Test DB Operation');

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry on connection errors', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Connection lost'))
          .mockResolvedValue('success');

        const result = await retryDatabaseOperation(fn);

        expect(result).toBe('success');
      });

      it('should retry on deadlock errors', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Deadlock detected'))
          .mockResolvedValue('success');

        const result = await retryDatabaseOperation(fn);

        expect(result).toBe('success');
      });
    });
  });
});
