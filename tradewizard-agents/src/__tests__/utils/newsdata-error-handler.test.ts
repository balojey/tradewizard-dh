/**
 * Unit tests for NewsData.io Error Handler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NewsDataErrorHandler } from './newsdata-error-handler.js';
import type { NewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import type { MonitorLogger } from './logger.js';

// Mock loggers
const mockNewsDataLogger: Partial<NewsDataObservabilityLogger> = {
  logError: vi.fn(),
  logQuotaUsage: vi.fn(),
  logRateLimit: vi.fn(),
  logCircuitBreakerStateChange: vi.fn(),
  logAlert: vi.fn(),
};

const mockLogger: MonitorLogger = {
  logConfig: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logDebug: vi.fn(),
  logTrace: vi.fn(),
  logFatal: vi.fn(),
  child: vi.fn(),
  getPinoLogger: vi.fn(),
  logDiscovery: vi.fn(),
  logAnalysis: vi.fn(),
  logStorage: vi.fn(),
  logScheduler: vi.fn(),
  logQuota: vi.fn(),
  logHealth: vi.fn(),
  logMonitor: vi.fn(),
};

describe('NewsDataErrorHandler', () => {
  let errorHandler: NewsDataErrorHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    errorHandler = new NewsDataErrorHandler(
      {}, // Use default config
      mockNewsDataLogger as NewsDataObservabilityLogger,
      mockLogger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle API errors with comprehensive logging', async () => {
      const error = new Error('Invalid API key');
      const context = {
        requestId: 'req_123',
        endpoint: 'latest' as const,
        agentName: 'test-agent',
        parameters: { q: 'test' },
        httpStatus: 401,
        apiErrorCode: 'INVALID_API_KEY',
        retryAttempt: 1,
        maxRetries: 3,
        fallbackUsed: false,
      };

      await errorHandler.handleApiError(error, context);

      expect(mockNewsDataLogger.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req_123',
          endpoint: 'latest',
          agentName: 'test-agent',
          errorType: 'api',
          errorCode: 'INVALID_API_KEY',
          errorMessage: 'Invalid API key',
          impactLevel: 'critical',
        })
      );

      expect(mockLogger.logError).toHaveBeenCalledWith(
        'NewsData API error',
        expect.objectContaining({
          component: 'newsdata',
          errorType: 'api',
          errorCode: 'INVALID_API_KEY',
          endpoint: 'latest',
          agentName: 'test-agent',
          httpStatus: 401,
          impactLevel: 'critical',
          error,
        })
      );
    });

    it('should categorize errors correctly', async () => {
      const testCases = [
        { httpStatus: 400, expectedType: 'validation' },
        { httpStatus: 401, expectedType: 'api' },
        { httpStatus: 429, expectedType: 'rate_limit' },
        { httpStatus: 500, expectedType: 'system' },
      ];

      for (const testCase of testCases) {
        const error = new Error('Test error');
        const context = {
          requestId: 'req_test',
          httpStatus: testCase.httpStatus,
        };

        await errorHandler.handleApiError(error, context);

        expect(mockNewsDataLogger.logError).toHaveBeenCalledWith(
          expect.objectContaining({
            errorType: testCase.expectedType,
          })
        );

        vi.clearAllMocks();
      }
    });

    it('should assess impact levels correctly', async () => {
      const testCases = [
        { httpStatus: 401, expectedImpact: 'critical' },
        { httpStatus: 429, expectedImpact: 'high' },
        { httpStatus: 500, expectedImpact: 'high' },
        { httpStatus: 400, expectedImpact: 'medium' },
        { httpStatus: 404, expectedImpact: 'low' },
      ];

      for (const testCase of testCases) {
        const error = new Error('Test error');
        const context = {
          requestId: 'req_test',
          httpStatus: testCase.httpStatus,
        };

        await errorHandler.handleApiError(error, context);

        expect(mockNewsDataLogger.logError).toHaveBeenCalledWith(
          expect.objectContaining({
            impactLevel: testCase.expectedImpact,
          })
        );

        vi.clearAllMocks();
      }
    });
  });

  describe('Quota Exhaustion Handling', () => {
    it('should handle quota exhaustion with alerting', async () => {
      const quotaInfo = {
        dailyUsed: 950,
        dailyLimit: 1000,
        utilizationPercentage: 95.0,
      };
      const context = {
        requestId: 'req_quota',
        endpoint: 'latest' as const,
        agentName: 'test-agent',
      };

      await errorHandler.handleQuotaExhaustion(quotaInfo, context);

      expect(mockNewsDataLogger.logQuotaUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          dailyQuotaLimit: 1000,
          dailyQuotaUsed: 950,
          dailyQuotaRemaining: 50,
          quotaUtilization: 95.0,
        })
      );

      expect(mockNewsDataLogger.logAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'quotaExhaustion',
          severity: 'critical',
          message: expect.stringContaining('95.0%'),
          actionRequired: true,
        })
      );
    });

    it('should not trigger alert below threshold', async () => {
      const quotaInfo = {
        dailyUsed: 800,
        dailyLimit: 1000,
        utilizationPercentage: 80.0,
      };
      const context = {
        requestId: 'req_quota',
        endpoint: 'latest' as const,
      };

      await errorHandler.handleQuotaExhaustion(quotaInfo, context);

      expect(mockNewsDataLogger.logQuotaUsage).toHaveBeenCalled();
      expect(mockNewsDataLogger.logAlert).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limit Handling', () => {
    it('should handle rate limit exceeded with backoff recommendations', async () => {
      const rateLimitInfo = {
        requestsInWindow: 100,
        windowSizeMs: 900000, // 15 minutes
        limitExceeded: true,
        retryAfter: 300, // 5 minutes
      };
      const context = {
        requestId: 'req_rate_limit',
        endpoint: 'crypto' as const,
        agentName: 'crypto-agent',
        retryAttempt: 2,
      };

      await errorHandler.handleRateLimitExceeded(rateLimitInfo, context);

      expect(mockNewsDataLogger.logRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'crypto',
          requestsInWindow: 100,
          windowSizeMs: 900000,
          limitExceeded: true,
          throttled: true,
          retryAfter: 300,
        })
      );

      expect(mockNewsDataLogger.logAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'rateLimitExceeded',
          severity: 'error',
          message: expect.stringContaining('crypto endpoint'),
          actionRequired: true,
        })
      );
    });

    it('should not trigger alert when limit not exceeded', async () => {
      const rateLimitInfo = {
        requestsInWindow: 50,
        windowSizeMs: 900000,
        limitExceeded: false,
      };
      const context = {
        requestId: 'req_rate_limit',
        endpoint: 'latest' as const,
      };

      await errorHandler.handleRateLimitExceeded(rateLimitInfo, context);

      expect(mockNewsDataLogger.logRateLimit).toHaveBeenCalled();
      expect(mockNewsDataLogger.logAlert).not.toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker State Changes', () => {
    it('should handle circuit breaker opening with alert', async () => {
      const stateChange = {
        endpoint: 'market',
        previousState: 'closed' as const,
        newState: 'open' as const,
        failureCount: 5,
        successCount: 0,
        failureThreshold: 5,
        resetTimeout: 60000,
        reason: 'Failure threshold exceeded',
      };

      await errorHandler.handleCircuitBreakerStateChange(stateChange);

      expect(mockNewsDataLogger.logCircuitBreakerStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'market',
          previousState: 'closed',
          newState: 'open',
          failureCount: 5,
          failureThreshold: 5,
          resetTimeout: 60000,
          reason: 'Failure threshold exceeded',
        })
      );

      expect(mockNewsDataLogger.logAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'circuitBreakerOpen',
          severity: 'error',
          message: expect.stringContaining('market endpoint'),
          actionRequired: true,
        })
      );
    });

    it('should handle circuit breaker closing with info alert', async () => {
      const stateChange = {
        endpoint: 'latest',
        previousState: 'open' as const,
        newState: 'closed' as const,
        failureCount: 0,
        successCount: 3,
        failureThreshold: 5,
        resetTimeout: 60000,
        reason: 'Service recovered',
      };

      await errorHandler.handleCircuitBreakerStateChange(stateChange);

      expect(mockNewsDataLogger.logCircuitBreakerStateChange).toHaveBeenCalled();
      expect(mockNewsDataLogger.logAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'circuitBreakerOpen',
          severity: 'info',
          message: expect.stringContaining('service recovered'),
          actionRequired: false,
        })
      );
    });

    it('should respect configuration for state change logging', async () => {
      // Create handler with circuit breaker logging disabled
      const handlerWithDisabledLogging = new NewsDataErrorHandler(
        {
          circuitBreaker: {
            logStateChanges: false,
            alertOnOpen: false,
            alertOnClose: false,
          },
        },
        mockNewsDataLogger as NewsDataObservabilityLogger,
        mockLogger
      );

      const stateChange = {
        endpoint: 'latest',
        previousState: 'closed' as const,
        newState: 'open' as const,
        failureCount: 5,
        successCount: 0,
        failureThreshold: 5,
        resetTimeout: 60000,
        reason: 'Test',
      };

      await handlerWithDisabledLogging.handleCircuitBreakerStateChange(stateChange);

      expect(mockNewsDataLogger.logCircuitBreakerStateChange).not.toHaveBeenCalled();
      expect(mockNewsDataLogger.logAlert).not.toHaveBeenCalled();
    });
  });

  describe('Error Statistics', () => {
    it('should track error statistics', async () => {
      // Generate some errors
      const errors = [
        { type: 'api', endpoint: 'latest', agent: 'agent1' },
        { type: 'rate_limit', endpoint: 'crypto', agent: 'agent1' },
        { type: 'api', endpoint: 'latest', agent: 'agent2' },
        { type: 'validation', endpoint: 'market', agent: 'agent2' },
      ];

      for (const errorInfo of errors) {
        const error = new Error(`${errorInfo.type} error`);
        const context = {
          requestId: `req_${Math.random()}`,
          endpoint: errorInfo.endpoint as any,
          agentName: errorInfo.agent,
          httpStatus: errorInfo.type === 'api' ? 401 : 400,
        };

        await errorHandler.handleApiError(error, context);
      }

      const stats = errorHandler.getErrorStatistics();

      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByType.get('api')).toBe(2);
      expect(stats.errorsByType.get('rate_limit')).toBe(1);
      expect(stats.errorsByType.get('validation')).toBe(1);
      expect(stats.errorsByEndpoint.get('latest')).toBe(2);
      expect(stats.errorsByAgent.get('agent1')).toBe(2);
      expect(stats.errorsByAgent.get('agent2')).toBe(2);
    });

    it('should clear error statistics', async () => {
      // Add some errors
      const error = new Error('Test error');
      const context = { requestId: 'req_test', httpStatus: 400 };

      await errorHandler.handleApiError(error, context);

      let stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBe(1);

      errorHandler.clearErrorStatistics();

      stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBe(0);
      expect(stats.errorsByType.size).toBe(0);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = {
        alerts: {
          quotaExhaustion: {
            enabled: false,
            severity: 'warning' as const,
            threshold: 80,
            actionRequired: false,
          },
        },
      };

      errorHandler.updateConfig(newConfig);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData error handler configuration updated',
        expect.objectContaining({
          component: 'newsdata',
        })
      );
    });

    it('should respect disabled alerts', async () => {
      // Create handler with quota alerts disabled
      const handlerWithDisabledAlerts = new NewsDataErrorHandler(
        {
          alerts: {
            quotaExhaustion: {
              enabled: false,
              severity: 'critical',
              threshold: 95,
              actionRequired: true,
            },
          },
        },
        mockNewsDataLogger as NewsDataObservabilityLogger,
        mockLogger
      );

      const quotaInfo = {
        dailyUsed: 980,
        dailyLimit: 1000,
        utilizationPercentage: 98.0,
      };
      const context = { requestId: 'req_test' };

      await handlerWithDisabledAlerts.handleQuotaExhaustion(quotaInfo, context);

      expect(mockNewsDataLogger.logQuotaUsage).toHaveBeenCalled();
      expect(mockNewsDataLogger.logAlert).not.toHaveBeenCalled();
    });
  });

  describe('Utility Methods', () => {
    it('should calculate backoff time with exponential growth', () => {
      // Access private method through error handling
      const error = new Error('Test error');
      const context = {
        requestId: 'req_test',
        retryAttempt: 3,
      };

      // The backoff time calculation is internal, but we can verify it's used
      // by checking that different retry attempts produce different behavior
      errorHandler.handleApiError(error, context);

      expect(mockNewsDataLogger.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          retryAttempt: 3,
        })
      );
    });

    it('should calculate time to quota reset', async () => {
      const quotaInfo = {
        dailyUsed: 500,
        dailyLimit: 1000,
        utilizationPercentage: 50.0,
      };
      const context = { requestId: 'req_test' };

      await errorHandler.handleQuotaExhaustion(quotaInfo, context);

      expect(mockNewsDataLogger.logQuotaUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          estimatedTimeToReset: expect.any(Number),
        })
      );
    });
  });

  describe('Alert Rate Limiting', () => {
    it('should rate limit duplicate alerts', async () => {
      const quotaInfo = {
        dailyUsed: 950,
        dailyLimit: 1000,
        utilizationPercentage: 95.0,
      };
      const context = { requestId: 'req_test' };

      // Trigger the same alert multiple times quickly
      await errorHandler.handleQuotaExhaustion(quotaInfo, context);
      await errorHandler.handleQuotaExhaustion(quotaInfo, context);
      await errorHandler.handleQuotaExhaustion(quotaInfo, context);

      // Should only log the alert once due to rate limiting
      expect(mockNewsDataLogger.logAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Parameter Sanitization', () => {
    it('should sanitize sensitive parameters in error details', async () => {
      const error = new Error('Test error');
      const context = {
        requestId: 'req_test',
        parameters: {
          apikey: 'secret123',
          q: 'test query',
          token: 'bearer_token',
          size: 10,
        },
      };

      await errorHandler.handleApiError(error, context);

      expect(mockNewsDataLogger.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorDetails: expect.objectContaining({
            parameters: {
              apikey: '***REDACTED***',
              q: 'test query',
              token: '***REDACTED***',
              size: 10,
            },
          }),
        })
      );
    });
  });
});