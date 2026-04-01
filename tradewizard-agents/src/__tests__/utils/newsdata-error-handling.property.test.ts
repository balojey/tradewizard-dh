/**
 * Property-Based Tests for NewsData Error Handling
 * 
 * Tests universal properties of error handling behavior including:
 * - Property 5: Error Handling Consistency
 * - Property 16: Retry Logic with Backoff
 * 
 * Validates: Requirements 1.6, 2.7, 6.5, 6.6
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { 
  NewsDataErrorHandlerManager,
  ErrorCategory,
  ErrorSeverity,
  DegradationLevel,
  NewsDataApiError,
  NewsDataNetworkError,
  NewsDataValidationError,
  NewsDataSystemError,
  NewsDataDataError,
  NewsDataRateLimitError,
  NewsDataQuotaError,
  createNewsDataErrorHandler,
  classifyError,
  createErrorContext,
  type ErrorContext,
  type ErrorHandlingResult
} from './newsdata-error-handler.js';
import { 
  createNewsDataRetryLogic,
  DEFAULT_RETRY_CONFIG,
  ErrorType,
  RetryableError,
  type RetryConfig,
  type RetryResult
} from './newsdata-retry-logic.js';
import { createNewsDataCacheManager } from './newsdata-cache-manager.js';
import type { NewsDataResponse } from './newsdata-client.js';

describe('NewsData Error Handling Property Tests', () => {
  let errorHandler: NewsDataErrorHandlerManager;
  let cacheManager: ReturnType<typeof createNewsDataCacheManager>;

  beforeEach(() => {
    cacheManager = createNewsDataCacheManager();
    errorHandler = createNewsDataErrorHandler(cacheManager);
  });

  /**
   * Property 5: Error Handling Consistency
   * For any news tool error condition, meaningful error messages should be returned without system crashes
   */
  test('Feature: newsdata-agent-tools, Property 5: Error Handling Consistency', async () => {
    await fc.assert(fc.asyncProperty(
      fc.oneof(
        // API errors with various status codes
        fc.record({
          type: fc.constant('api'),
          statusCode: fc.integer({ min: 400, max: 599 }),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          apiCode: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
        }),
        // Network errors
        fc.record({
          type: fc.constant('network'),
          message: fc.oneof(
            fc.constant('ECONNRESET: Connection reset by peer'),
            fc.constant('ENOTFOUND: DNS lookup failed'),
            fc.constant('ETIMEDOUT: Request timeout'),
            fc.constant('Network error occurred'),
            fc.constant('Connection refused')
          )
        }),
        // Validation errors
        fc.record({
          type: fc.constant('validation'),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          validationErrors: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 })
        }),
        // System errors
        fc.record({
          type: fc.constant('system'),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          component: fc.oneof(
            fc.constant('cache'),
            fc.constant('database'),
            fc.constant('config'),
            fc.constant('unknown')
          )
        }),
        // Data errors
        fc.record({
          type: fc.constant('data'),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          invalidCount: fc.integer({ min: 0, max: 50 })
        }),
        // Rate limit errors
        fc.record({
          type: fc.constant('rate_limit'),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          retryAfter: fc.option(fc.integer({ min: 1, max: 3600 }))
        }),
        // Quota errors
        fc.record({
          type: fc.constant('quota'),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          quotaType: fc.oneof(fc.constant('daily'), fc.constant('monthly')),
          resetTime: fc.option(fc.integer({ min: Date.now(), max: Date.now() + 86400000 }))
        })
      ),
      fc.record({
        endpoint: fc.oneof(
          fc.constant('latest'),
          fc.constant('crypto'),
          fc.constant('market'),
          fc.constant('archive')
        ),
        operation: fc.string({ minLength: 1, maxLength: 50 }),
        parameters: fc.option(fc.record({
          q: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
          size: fc.option(fc.integer({ min: 1, max: 50 })),
          language: fc.option(fc.string({ minLength: 2, maxLength: 5 }))
        }))
      }),
      async (errorSpec, contextSpec) => {
        // Create appropriate error based on specification
        let error: Error;
        
        switch (errorSpec.type) {
          case 'api':
            error = new NewsDataApiError(
              errorSpec.message,
              errorSpec.statusCode,
              errorSpec.apiCode
            );
            break;
          case 'network':
            error = new NewsDataNetworkError(errorSpec.message);
            break;
          case 'validation':
            error = new NewsDataValidationError(
              errorSpec.message,
              errorSpec.validationErrors
            );
            break;
          case 'system':
            error = new NewsDataSystemError(
              errorSpec.message,
              errorSpec.component
            );
            break;
          case 'data':
            error = new NewsDataDataError(
              errorSpec.message,
              [], // Empty valid articles for testing
              errorSpec.invalidCount
            );
            break;
          case 'rate_limit':
            error = new NewsDataRateLimitError(
              errorSpec.message,
              errorSpec.retryAfter ?? undefined
            );
            break;
          case 'quota':
            error = new NewsDataQuotaError(
              errorSpec.message,
              errorSpec.quotaType,
              errorSpec.resetTime ?? undefined
            );
            break;
          default:
            error = new Error('Unknown error type');
        }
        
        // Create error context
        const context: Partial<ErrorContext> = {
          endpoint: contextSpec.endpoint,
          operation: contextSpec.operation,
          parameters: contextSpec.parameters || {}
        };
        
        // Handle the error
        let result: ErrorHandlingResult;
        let threwException = false;
        
        try {
          result = await errorHandler.handleError(error, context);
        } catch (handlerError) {
          threwException = true;
          // If handler throws, create a minimal result for testing
          result = {
            success: false,
            error: {
              category: ErrorCategory.SYSTEM,
              severity: ErrorSeverity.HIGH,
              message: handlerError instanceof Error ? handlerError.message : 'Handler error',
              retryable: false,
              degradationLevel: DegradationLevel.UNAVAILABLE,
              context: createErrorContext(),
              recoveryStrategy: { type: 'fail' }
            },
            fallbackUsed: false,
            degradationLevel: DegradationLevel.UNAVAILABLE,
            retryable: false
          };
        }
        
        // Property 1: Error handler should never crash (throw unhandled exceptions)
        expect(threwException).toBe(false);
        
        // Property 2: Result should always be defined and have required fields
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.fallbackUsed).toBe('boolean');
        expect(typeof result.retryable).toBe('boolean');
        expect(result.degradationLevel).toBeDefined();
        
        // Property 3: Error information should be meaningful when success is false
        if (!result.success && result.error) {
          expect(result.error.message).toBeDefined();
          expect(result.error.message.length).toBeGreaterThan(0);
          expect(result.error.category).toBeDefined();
          expect(result.error.severity).toBeDefined();
          expect(result.error.context).toBeDefined();
          expect(result.error.recoveryStrategy).toBeDefined();
        }
        
        // Property 4: Successful results should have data when appropriate
        if (result.success && result.data) {
          expect(result.data.status).toBeDefined();
          expect(['success', 'error']).toContain(result.data.status);
        }
        
        // Property 5: Fallback usage should be consistent with degradation level
        if (result.fallbackUsed) {
          expect([
            DegradationLevel.CACHED_ONLY,
            DegradationLevel.PARTIAL,
            DegradationLevel.MINIMAL
          ]).toContain(result.degradationLevel);
        }
        
        // Property 6: Retry information should be consistent
        if (result.retryable && result.retryAfter) {
          expect(result.retryAfter).toBeGreaterThan(0);
        }
        
        // Property 7: Error classification should be consistent
        if (result.error) {
          const classifiedCategory = classifyError(error);
          // The classified category should be reasonable (not necessarily exact due to handler logic)
          expect(Object.values(ErrorCategory)).toContain(classifiedCategory);
        }
      }
    ), { numRuns: 2 });
  });

  /**
   * Property 16: Retry Logic with Backoff
   * For any transient network error, the system should implement exponential backoff retry logic
   */
  test('Feature: newsdata-agent-tools, Property 16: Retry Logic with Backoff', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        // Error configuration
        errorType: fc.oneof(
          fc.constant(ErrorType.NETWORK),
          fc.constant(ErrorType.TIMEOUT),
          fc.constant(ErrorType.SERVER_ERROR),
          fc.constant(ErrorType.RATE_LIMIT)
        ),
        failureCount: fc.integer({ min: 1, max: 5 }), // Number of failures before success
        
        // Retry configuration
        maxAttempts: fc.integer({ min: 2, max: 6 }),
        baseDelay: fc.integer({ min: 100, max: 2000 }),
        backoffMultiplier: fc.float({ min: Math.fround(1.5), max: Math.fround(3.0) }),
        jitterFactor: fc.float({ min: Math.fround(0.0), max: Math.fround(0.3) })
      }),
      fc.record({
        endpoint: fc.oneof(
          fc.constant('latest'),
          fc.constant('crypto'),
          fc.constant('market'),
          fc.constant('archive')
        ),
        operation: fc.string({ minLength: 1, maxLength: 50 })
      }),
      async (config, context) => {
        // Create custom retry configuration
        const retryConfig: RetryConfig = {
          ...DEFAULT_RETRY_CONFIG,
          maxAttempts: config.maxAttempts,
          baseDelay: config.baseDelay,
          backoffMultiplier: config.backoffMultiplier,
          jitterFactor: config.jitterFactor,
          maxDelay: 30000, // 30 seconds max for testing
        };
        
        const customRetryLogic = createNewsDataRetryLogic(retryConfig);
        
        // Create mock function that fails specified number of times then succeeds
        let attemptCount = 0;
        const delays: number[] = [];
        const startTime = Date.now();
        
        const mockFunction = vi.fn().mockImplementation(async () => {
          attemptCount++;
          
          if (attemptCount <= config.failureCount) {
            // Create appropriate error based on type
            let errorMessage: string;
            switch (config.errorType) {
              case ErrorType.NETWORK:
                errorMessage = 'ECONNRESET: Connection reset by peer';
                break;
              case ErrorType.TIMEOUT:
                errorMessage = 'Request timeout after 30 seconds';
                break;
              case ErrorType.SERVER_ERROR:
                errorMessage = 'HTTP 500: Internal server error';
                break;
              case ErrorType.RATE_LIMIT:
                errorMessage = 'Rate limit exceeded';
                break;
              default:
                errorMessage = 'Unknown error';
            }
            
            throw new RetryableError(errorMessage, config.errorType);
          }
          
          return 'success';
        });
        
        // Track retry delays
        const onRetry = (retryContext: any) => {
          if (retryContext.lastDelay) {
            delays.push(retryContext.lastDelay);
          }
        };
        
        // Execute with retry logic
        const result: RetryResult<string> = await customRetryLogic.executeWithRetry(
          mockFunction,
          {
            endpoint: context.endpoint,
            operation: context.operation,
            onRetry
          }
        );
        
        const totalTime = Date.now() - startTime;
        
        // Property 1: Retry logic should handle transient errors appropriately
        if (config.failureCount < config.maxAttempts) {
          // Should eventually succeed
          expect(result.success).toBe(true);
          expect(result.data).toBe('success');
          expect(result.attempts).toBe(config.failureCount + 1);
        } else {
          // Should fail after max attempts
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.attempts).toBe(config.maxAttempts);
        }
        
        // Property 2: Number of function calls should match expected attempts
        expect(mockFunction).toHaveBeenCalledTimes(Math.min(config.failureCount + 1, config.maxAttempts));
        
        // Property 3: Delays should follow exponential backoff pattern
        if (delays.length > 0) {
          for (let i = 0; i < delays.length; i++) {
            const expectedMinDelay = config.baseDelay * Math.pow(config.backoffMultiplier, i);
            const expectedMaxDelay = expectedMinDelay * (1 + config.jitterFactor * 2);
            
            // Allow some tolerance for timing variations
            expect(delays[i]).toBeGreaterThanOrEqual(expectedMinDelay * 0.8);
            expect(delays[i]).toBeLessThanOrEqual(Math.min(expectedMaxDelay * 1.2, retryConfig.maxDelay));
          }
          
          // Property 4: Each delay should generally be larger than the previous (exponential growth)
          // Allow for jitter variations
          if (delays.length > 1) {
            let increasingTrend = 0;
            for (let i = 1; i < delays.length; i++) {
              if (delays[i] > delays[i - 1] * 0.8) { // Allow for jitter
                increasingTrend++;
              }
            }
            // At least half of the delays should show increasing trend
            expect(increasingTrend).toBeGreaterThanOrEqual(Math.floor(delays.length / 2));
          }
        }
        
        // Property 5: Total delay should be reasonable
        const expectedMinTotalDelay = delays.reduce((sum, delay) => sum + delay, 0);
        expect(result.totalDelay).toBeGreaterThanOrEqual(expectedMinTotalDelay * 0.8);
        expect(result.totalDelay).toBeLessThanOrEqual(expectedMinTotalDelay * 1.2 + 1000); // Allow 1s tolerance
        
        // Property 6: Total execution time should include delays
        if (delays.length > 0) {
          expect(totalTime).toBeGreaterThanOrEqual(result.totalDelay * 0.8);
        }
        
        // Property 7: Error classification should be consistent
        if (!result.success && result.error) {
          const classifiedType = customRetryLogic.classifyError(result.error);
          // Should classify as retryable error type for transient errors
          expect([
            ErrorType.NETWORK,
            ErrorType.TIMEOUT,
            ErrorType.SERVER_ERROR,
            ErrorType.RATE_LIMIT,
            ErrorType.UNKNOWN
          ]).toContain(classifiedType);
        }
      }
    ), { numRuns: 2 });
  });

  /**
   * Additional Property: Error Recovery Consistency
   * For any error with fallback available, recovery should be consistent
   */
  test('Feature: newsdata-agent-tools, Property: Error Recovery Consistency', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        errorType: fc.oneof(
          fc.constant('api_500'),
          fc.constant('api_429'),
          fc.constant('network'),
          fc.constant('system')
        ),
        hasCachedData: fc.boolean(),
        cacheAge: fc.integer({ min: 0, max: 7200 }) // 0-2 hours in seconds
      }),
      async (scenario) => {
        // Setup cache with data if specified
        if (scenario.hasCachedData) {
          const cacheKey = cacheManager.generateCacheKey('latest', { q: 'test' });
          const mockResponse: NewsDataResponse = {
            status: 'success',
            totalResults: 5,
            results: [
              {
                article_id: 'test-1',
                title: 'Test Article',
                link: 'https://example.com/test',
                source_id: 'test-source',
                source_name: 'Test Source',
                source_url: 'https://example.com',
                source_priority: 1,
                description: 'Test description',
                pubDate: new Date().toISOString(),
                language: 'en',
                country: ['us'],
                category: ['technology'],
                duplicate: false
              }
            ]
          };
          
          await cacheManager.set(cacheKey, mockResponse, 3600);
          
          // Age the cache if specified
          if (scenario.cacheAge > 0) {
            // Simulate cache aging by manipulating timestamp
            const cachedData = await cacheManager.get(cacheKey);
            if (cachedData) {
              (cachedData as any).timestamp = Date.now() - (scenario.cacheAge * 1000);
              await cacheManager.set(cacheKey, cachedData.data, 3600);
            }
          }
        }
        
        // Create appropriate error
        let error: Error;
        switch (scenario.errorType) {
          case 'api_500':
            error = new NewsDataApiError('Internal server error', 500);
            break;
          case 'api_429':
            error = new NewsDataRateLimitError('Rate limit exceeded');
            break;
          case 'network':
            error = new NewsDataNetworkError('Connection timeout');
            break;
          case 'system':
            error = new NewsDataSystemError('Cache failure', 'cache');
            break;
          default:
            error = new Error('Unknown error');
        }
        
        // Handle error with context
        const context: Partial<ErrorContext> = {
          endpoint: 'latest',
          operation: 'fetchLatestNews',
          parameters: { q: 'test' }
        };
        
        const result = await errorHandler.handleError(error, context);
        
        // Property 1: Recovery should be consistent with error type and cache availability
        if (scenario.hasCachedData && (
          scenario.errorType === 'api_500' ||
          scenario.errorType === 'api_429' ||
          scenario.errorType === 'network'
        )) {
          // Should use fallback for these error types when cache is available
          expect(result.fallbackUsed || result.success).toBe(true);
          
          if (result.success && result.data) {
            expect(result.data.status).toBe('success');
            expect(result.data.results).toBeDefined();
          }
        }
        
        // Property 2: Degradation level should be appropriate for error type
        switch (scenario.errorType) {
          case 'api_429':
            expect([
              DegradationLevel.CACHED_ONLY,
              DegradationLevel.PARTIAL
            ]).toContain(result.degradationLevel);
            break;
          case 'api_500':
          case 'network':
            if (scenario.hasCachedData) {
              expect([
                DegradationLevel.CACHED_ONLY,
                DegradationLevel.PARTIAL,
                DegradationLevel.MINIMAL
              ]).toContain(result.degradationLevel);
            }
            break;
        }
        
        // Property 3: Retry information should be consistent with error type
        if (scenario.errorType === 'api_429' || scenario.errorType === 'network') {
          expect(result.retryable).toBe(true);
          if (result.retryAfter) {
            expect(result.retryAfter).toBeGreaterThan(0);
          }
        }
      }
    ), { numRuns: 2 });
  });

  /**
   * Additional Property: Error Message Quality
   * For any error, the error message should be informative and safe
   */
  test('Feature: newsdata-agent-tools, Property: Error Message Quality', async () => {
    await fc.assert(fc.asyncProperty(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string().filter(s => s.includes('API key')),
        fc.string().filter(s => s.includes('rate limit')),
        fc.string().filter(s => s.includes('network')),
        fc.string().filter(s => s.includes('timeout'))
      ),
      async (errorMessage) => {
        const error = new Error(errorMessage);
        const context: Partial<ErrorContext> = {
          endpoint: 'latest',
          operation: 'test'
        };
        
        const result = await errorHandler.handleError(error, context);
        
        // Property 1: Error messages should be non-empty and informative
        if (!result.success && result.error) {
          expect(result.error.message).toBeDefined();
          expect(result.error.message.length).toBeGreaterThan(0);
          expect(result.error.message.trim()).toBe(result.error.message); // No leading/trailing whitespace
        }
        
        // Property 2: Error messages should not contain sensitive information
        if (!result.success && result.error) {
          const message = result.error.message.toLowerCase();
          
          // Should not contain API keys or sensitive tokens
          expect(message).not.toMatch(/[a-f0-9]{32,}/); // No long hex strings (potential API keys)
          expect(message).not.toMatch(/bearer\s+[a-z0-9]+/); // No bearer tokens
          expect(message).not.toMatch(/password/); // No password references
        }
        
        // Property 3: Error context should be preserved appropriately
        if (!result.success && result.error) {
          expect(result.error.context).toBeDefined();
          expect(result.error.context.timestamp).toBeGreaterThan(0);
          
          if (result.error.context.endpoint) {
            expect(['latest', 'crypto', 'market', 'archive', 'sources']).toContain(result.error.context.endpoint);
          }
        }
      }
    ), { numRuns: 2 });
  });
});