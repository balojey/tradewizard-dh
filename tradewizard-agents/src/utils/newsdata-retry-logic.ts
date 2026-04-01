/**
 * NewsData Retry Logic
 * 
 * Implements exponential backoff retry logic with jitter to prevent
 * thundering herd problems for NewsData.io API requests.
 * 
 * Features:
 * - Exponential backoff with configurable base delay and multiplier
 * - Jitter to prevent thundering herd problems
 * - Configurable maximum retry attempts and delay caps
 * - Different retry strategies for different error types
 * - Circuit breaker integration for persistent failures
 * - Integration with comprehensive error handling framework
 * 
 * Requirements: 6.5
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { 
  NewsDataErrorHandlerManager, 
  ErrorHandlingResult, 
  DegradationLevel 
} from './newsdata-error-handler.js';

// ============================================================================
// Configuration Types
// ============================================================================

export interface RetryConfig {
  // Basic retry settings
  maxAttempts: number; // Maximum number of retry attempts
  baseDelay: number; // Base delay in milliseconds
  maxDelay: number; // Maximum delay cap in milliseconds
  
  // Exponential backoff settings
  backoffMultiplier: number; // Multiplier for exponential backoff (default: 2)
  jitterFactor: number; // Jitter factor (0-1, default: 0.1 for 10% jitter)
  
  // Error-specific settings
  retryableErrors: string[]; // Error patterns that should trigger retries
  nonRetryableErrors: string[]; // Error patterns that should not trigger retries
  
  // Rate limit specific settings
  rateLimitBackoffMultiplier: number; // Special multiplier for rate limit errors
  quotaExhaustedDelay: number; // Fixed delay when quota is exhausted
  
  // Circuit breaker integration
  circuitBreakerEnabled: boolean;
  failureThreshold: number; // Number of failures to trigger circuit breaker
  circuitBreakerTimeout: number; // Time to wait before trying again (ms)
}

export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError?: Error;
  lastDelay?: number;
  startTime: number;
  endpoint?: string;
  operation?: string;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
  circuitBreakerTripped?: boolean;
  degradationLevel?: DegradationLevel;
  fallbackUsed?: boolean;
  errorHandlingResult?: ErrorHandlingResult;
}

export interface RetryMetrics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
  averageDelay: number;
  circuitBreakerTrips: number;
  errorBreakdown: Record<string, number>;
}

// ============================================================================
// Error Classification
// ============================================================================

export enum ErrorType {
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXHAUSTED = 'quota_exhausted',
  SERVER_ERROR = 'server_error',
  CLIENT_ERROR = 'client_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public errorType: ErrorType,
    public retryAfter?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class NonRetryableError extends Error {
  constructor(
    message: string,
    public errorType: ErrorType,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number,
    private timeout: number
  ) {}
  
  canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }
    
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    
    // half-open state
    return true;
  }
  
  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
  
  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }
  
  reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }
}

// ============================================================================
// Retry Logic Implementation
// ============================================================================

export class NewsDataRetryLogic {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private metrics: RetryMetrics = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    averageAttempts: 0,
    averageDelay: 0,
    circuitBreakerTrips: 0,
    errorBreakdown: {},
  };
  
  private attemptHistory: number[] = [];
  private delayHistory: number[] = [];
  private readonly maxHistorySize = 1000;
  
  constructor(
    private config: RetryConfig,
    private observabilityLogger?: AdvancedObservabilityLogger,
    private errorHandler?: NewsDataErrorHandlerManager
  ) {
    console.log('[NewsDataRetryLogic] Initialized with config:', {
      maxAttempts: config.maxAttempts,
      baseDelay: config.baseDelay,
      maxDelay: config.maxDelay,
      circuitBreakerEnabled: config.circuitBreakerEnabled,
      errorHandlerEnabled: !!errorHandler,
    });
  }
  
  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: {
      endpoint?: string;
      operation?: string;
      customConfig?: Partial<RetryConfig>;
      onRetry?: (context: RetryContext) => void;
    } = {}
  ): Promise<RetryResult<T>> {
    const { endpoint = 'unknown', operation = 'request', customConfig, onRetry } = options;
    const config = { ...this.config, ...customConfig };
    
    const startTime = Date.now();
    let lastError: Error | null = null;
    let totalDelay = 0;
    
    // Check circuit breaker
    if (config.circuitBreakerEnabled) {
      const circuitBreaker = this.getCircuitBreaker(endpoint);
      
      if (!circuitBreaker.canExecute()) {
        this.metrics.circuitBreakerTrips++;
        
        return {
          success: false,
          error: new Error(`Circuit breaker is open for endpoint: ${endpoint}`),
          attempts: 0,
          totalDelay: 0,
          circuitBreakerTripped: true,
        };
      }
    }
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await fn();
        
        // Success - record metrics and reset circuit breaker
        this.recordSuccess(endpoint, attempt, totalDelay);
        
        return {
          success: true,
          data: result,
          attempts: attempt,
          totalDelay,
        };
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Classify error
        const errorType = this.classifyError(lastError);
        const isRetryable = this.isRetryableError(lastError, errorType);
        
        // Record error in metrics
        this.recordError(errorType);
        
        // Don't retry on non-retryable errors or if this is the last attempt
        if (!isRetryable || attempt >= config.maxAttempts) {
          this.recordFailure(endpoint, attempt, totalDelay, lastError);
          
          // Use error handler if available for final error processing
          let errorHandlingResult: ErrorHandlingResult | undefined;
          if (this.errorHandler) {
            try {
              errorHandlingResult = await this.errorHandler.handleError(lastError, {
                endpoint,
                operation,
                parameters: { attempt, totalAttempts: config.maxAttempts }
              });
            } catch (handlerError) {
              console.warn('[NewsDataRetryLogic] Error handler failed:', handlerError);
            }
          }
          
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalDelay,
            errorHandlingResult
          };
        }
        
        // Calculate retry delay
        const delay = this.calculateDelay(attempt, errorType, lastError, config);
        totalDelay += delay;
        
        // Create retry context
        const context: RetryContext = {
          attempt,
          totalAttempts: config.maxAttempts,
          lastError,
          lastDelay: delay,
          startTime,
          endpoint,
          operation,
        };
        
        // Call retry callback
        onRetry?.(context);
        
        // Log retry attempt
        this.observabilityLogger?.logDataFetch({
          timestamp: Date.now(),
          source: 'news',
          provider: endpoint,
          success: false,
          cached: false,
          stale: false,
          freshness: 0,
          itemCount: 0,
          error: `Retry attempt ${attempt}/${config.maxAttempts}: ${lastError.message}`,
          duration: delay,
        });
        
        console.log(`[NewsDataRetryLogic] Retrying ${operation} for ${endpoint} in ${delay}ms (attempt ${attempt}/${config.maxAttempts}): ${lastError.message}`);
        
        // Wait before retry
        await this.sleep(delay);
      }
    }
    
    // All retries exhausted
    this.recordFailure(endpoint, config.maxAttempts, totalDelay, lastError!);
    
    // Use error handler if available for final error processing
    let errorHandlingResult: ErrorHandlingResult | undefined;
    if (this.errorHandler) {
      try {
        errorHandlingResult = await this.errorHandler.handleError(lastError!, {
          endpoint,
          operation,
          parameters: { attempt: config.maxAttempts, totalAttempts: config.maxAttempts }
        });
      } catch (handlerError) {
        console.warn('[NewsDataRetryLogic] Error handler failed:', handlerError);
      }
    }
    
    return {
      success: false,
      error: lastError!,
      attempts: config.maxAttempts,
      totalDelay,
      errorHandlingResult
    };
  }
  
  /**
   * Calculate exponential backoff delay with jitter
   */
  calculateDelay(
    attempt: number,
    errorType: ErrorType,
    error: Error,
    config: RetryConfig
  ): number {
    let baseDelay = config.baseDelay;
    let multiplier = config.backoffMultiplier;
    
    // Special handling for different error types
    switch (errorType) {
      case ErrorType.RATE_LIMIT:
        // Check if error contains retry-after header
        if (error instanceof RetryableError && error.retryAfter) {
          return Math.min(error.retryAfter, config.maxDelay);
        }
        // For rate limit errors, use a longer base delay
        baseDelay = Math.max(baseDelay, 1000);
        multiplier = config.rateLimitBackoffMultiplier;
        break;
        
      case ErrorType.QUOTA_EXHAUSTED:
        return config.quotaExhaustedDelay;
        
      case ErrorType.SERVER_ERROR:
        // Longer delays for server errors
        baseDelay = Math.max(baseDelay, 5000);
        break;
        
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
        // Standard exponential backoff for network issues
        break;
        
      default:
        // Use standard backoff for unknown errors
        break;
    }
    
    // Calculate exponential delay
    const exponentialDelay = baseDelay * Math.pow(multiplier, attempt - 1);
    
    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * config.jitterFactor * (Math.random() - 0.5) * 2;
    const delayWithJitter = exponentialDelay + jitter;
    
    // Apply maximum delay cap
    return Math.min(Math.max(delayWithJitter, 0), config.maxDelay);
  }
  
  /**
   * Classify error type for appropriate retry strategy
   */
  classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    
    // Check for specific error types
    if (message.includes('rate limit') || message.includes('429')) {
      return ErrorType.RATE_LIMIT;
    }
    
    if (message.includes('quota') || message.includes('exceeded')) {
      return ErrorType.QUOTA_EXHAUSTED;
    }
    
    if (message.includes('timeout') || message.includes('etimedout')) {
      return ErrorType.TIMEOUT;
    }
    
    if (message.includes('network') || message.includes('econnreset') || 
        message.includes('enotfound') || message.includes('econnrefused') ||
        message.includes('connection reset')) {
      return ErrorType.NETWORK;
    }
    
    // Check HTTP status codes
    if (message.includes('500') || message.includes('502') || 
        message.includes('503') || message.includes('504')) {
      return ErrorType.SERVER_ERROR;
    }
    
    if (message.includes('400') || message.includes('401') || 
        message.includes('403') || message.includes('404')) {
      return ErrorType.CLIENT_ERROR;
    }
    
    return ErrorType.UNKNOWN;
  }
  
  /**
   * Check if error is retryable
   */
  isRetryableError(error: Error, errorType: ErrorType): boolean {
    // Non-retryable error types
    if (error instanceof NonRetryableError) {
      return false;
    }
    
    // Explicitly retryable errors
    if (error instanceof RetryableError) {
      return true;
    }
    
    // Check against configured patterns
    const message = error.message;
    
    // Check non-retryable patterns first
    for (const pattern of this.config.nonRetryableErrors) {
      if (message.includes(pattern)) {
        return false;
      }
    }
    
    // Check retryable patterns
    for (const pattern of this.config.retryableErrors) {
      if (message.includes(pattern)) {
        return true;
      }
    }
    
    // Default retryability based on error type
    switch (errorType) {
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
      case ErrorType.SERVER_ERROR:
      case ErrorType.RATE_LIMIT:
        return true;
        
      case ErrorType.QUOTA_EXHAUSTED:
        return false; // Don't retry quota exhaustion
        
      case ErrorType.CLIENT_ERROR:
        return false; // Don't retry client errors (4xx)
        
      default:
        return false; // Don't retry unknown errors by default
    }
  }
  
  /**
   * Get or create circuit breaker for endpoint
   */
  private getCircuitBreaker(endpoint: string): CircuitBreaker {
    if (!this.circuitBreakers.has(endpoint)) {
      this.circuitBreakers.set(
        endpoint,
        new CircuitBreaker(this.config.failureThreshold, this.config.circuitBreakerTimeout)
      );
    }
    
    return this.circuitBreakers.get(endpoint)!;
  }
  
  /**
   * Record successful execution
   */
  private recordSuccess(endpoint: string, attempts: number, totalDelay: number): void {
    if (this.config.circuitBreakerEnabled) {
      this.getCircuitBreaker(endpoint).recordSuccess();
    }
    
    this.metrics.successfulRetries++;
    this.updateMetricsHistory(attempts, totalDelay);
  }
  
  /**
   * Record failed execution
   */
  private recordFailure(endpoint: string, attempts: number, totalDelay: number, _error: Error): void {
    if (this.config.circuitBreakerEnabled) {
      this.getCircuitBreaker(endpoint).recordFailure();
    }
    
    this.metrics.failedRetries++;
    this.updateMetricsHistory(attempts, totalDelay);
  }
  
  /**
   * Record error in metrics
   */
  private recordError(errorType: ErrorType): void {
    this.metrics.errorBreakdown[errorType] = (this.metrics.errorBreakdown[errorType] || 0) + 1;
  }
  
  /**
   * Update metrics history
   */
  private updateMetricsHistory(attempts: number, totalDelay: number): void {
    this.attemptHistory.push(attempts);
    this.delayHistory.push(totalDelay);
    
    // Trim history to max size
    if (this.attemptHistory.length > this.maxHistorySize) {
      this.attemptHistory.shift();
      this.delayHistory.shift();
    }
    
    // Update averages
    this.metrics.totalRetries++;
    this.metrics.averageAttempts = this.attemptHistory.reduce((a, b) => a + b, 0) / this.attemptHistory.length;
    this.metrics.averageDelay = this.delayHistory.reduce((a, b) => a + b, 0) / this.delayHistory.length;
  }
  
  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get current retry metrics
   */
  getMetrics(): RetryMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get circuit breaker status for all endpoints
   */
  getCircuitBreakerStatus(): Record<string, { state: string; failures: number }> {
    const status: Record<string, { state: string; failures: number }> = {};
    
    this.circuitBreakers.forEach((breaker, endpoint) => {
      status[endpoint] = {
        state: breaker.getState(),
        failures: (breaker as any).failures || 0,
      };
    });
    
    return status;
  }
  
  /**
   * Reset circuit breaker for endpoint
   */
  resetCircuitBreaker(endpoint: string): void {
    const breaker = this.circuitBreakers.get(endpoint);
    if (breaker) {
      breaker.reset();
      console.log(`[NewsDataRetryLogic] Reset circuit breaker for endpoint: ${endpoint}`);
    }
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.forEach((breaker) => {
      breaker.reset();
    });
    
    console.log('[NewsDataRetryLogic] Reset all circuit breakers');
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
      averageDelay: 0,
      circuitBreakerTrips: 0,
      errorBreakdown: {},
    };
    
    this.attemptHistory = [];
    this.delayHistory = [];
    
    console.log('[NewsDataRetryLogic] Reset metrics');
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 60000, // 1 minute
  
  backoffMultiplier: 2,
  jitterFactor: 0.1, // 10% jitter
  
  retryableErrors: [
    'network',
    'timeout',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    '500',
    '502',
    '503',
    '504',
    'rate limit',
  ],
  
  nonRetryableErrors: [
    '400',
    '401',
    '403',
    '404',
    'invalid api key',
    'unauthorized',
    'forbidden',
    'not found',
  ],
  
  rateLimitBackoffMultiplier: 1.5, // Gentler backoff for rate limits
  quotaExhaustedDelay: 3600000, // 1 hour for quota exhaustion
  
  circuitBreakerEnabled: true,
  failureThreshold: 5,
  circuitBreakerTimeout: 60000, // 1 minute
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData retry logic instance
 */
export function createNewsDataRetryLogic(
  config?: Partial<RetryConfig>,
  observabilityLogger?: AdvancedObservabilityLogger,
  errorHandler?: NewsDataErrorHandlerManager
): NewsDataRetryLogic {
  const mergedConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };
  
  return new NewsDataRetryLogic(mergedConfig, observabilityLogger, errorHandler);
}

/**
 * Create retry configuration from environment variables
 */
export function createRetryConfigFromEnv(): Partial<RetryConfig> {
  return {
    maxAttempts: parseInt(process.env.NEWSDATA_RETRY_MAX_ATTEMPTS || '3'),
    baseDelay: parseInt(process.env.NEWSDATA_RETRY_BASE_DELAY || '1000'),
    maxDelay: parseInt(process.env.NEWSDATA_RETRY_MAX_DELAY || '60000'),
    
    backoffMultiplier: parseFloat(process.env.NEWSDATA_RETRY_BACKOFF_MULTIPLIER || '2'),
    jitterFactor: parseFloat(process.env.NEWSDATA_RETRY_JITTER_FACTOR || '0.1'),
    
    rateLimitBackoffMultiplier: parseFloat(process.env.NEWSDATA_RETRY_RATE_LIMIT_MULTIPLIER || '1.5'),
    quotaExhaustedDelay: parseInt(process.env.NEWSDATA_RETRY_QUOTA_DELAY || '3600000'),
    
    circuitBreakerEnabled: process.env.NEWSDATA_RETRY_CIRCUIT_BREAKER_ENABLED !== 'false',
    failureThreshold: parseInt(process.env.NEWSDATA_RETRY_FAILURE_THRESHOLD || '5'),
    circuitBreakerTimeout: parseInt(process.env.NEWSDATA_RETRY_CIRCUIT_BREAKER_TIMEOUT || '60000'),
  };
}