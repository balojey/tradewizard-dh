/**
 * Retry Logic and Error Recovery Utilities
 *
 * Provides centralized retry logic with exponential backoff, jitter,
 * and circuit breaker pattern for resilient API calls and database operations.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Jitter factor (0-1, default: 0.3 for 30% jitter) */
  jitterFactor?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Timeout for each attempt in milliseconds (optional) */
  timeoutMs?: number;
  /** Function to determine if error is retryable (default: all errors retryable) */
  isRetryable?: (error: Error) => boolean;
  /** Callback for retry attempts */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Circuit breaker state
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in milliseconds before attempting to close circuit (default: 60000) */
  resetTimeoutMs?: number;
  /** Number of successful calls needed to close circuit from half-open (default: 2) */
  successThreshold?: number;
  /** Callback when circuit state changes */
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'timeoutMs' | 'isRetryable' | 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
  exponentialBackoff: true,
};

/**
 * Default circuit breaker options
 */
const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Required<Omit<CircuitBreakerOptions, 'onStateChange'>> = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  successThreshold: 2,
};

// ============================================================================
// Retry Logic with Exponential Backoff and Jitter
// ============================================================================

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the function
 * @throws Last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await fetch('https://api.example.com/data'),
 *   {
 *     maxRetries: 3,
 *     baseDelayMs: 1000,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Apply timeout if specified
      if (opts.timeoutMs) {
        return await withTimeout(fn, opts.timeoutMs);
      }
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (opts.isRetryable && !opts.isRetryable(lastError)) {
        throw lastError;
      }

      // If this was the last attempt, throw the error
      if (attempt === opts.maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = calculateBackoffDelay(attempt, opts);

      // Call retry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Calculate backoff delay with exponential backoff and jitter
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'jitterFactor' | 'exponentialBackoff'>
): number {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  // Calculate base delay
  let delay: number;
  if (opts.exponentialBackoff) {
    // Exponential: baseDelay * 2^attempt
    delay = opts.baseDelayMs * Math.pow(2, attempt);
  } else {
    // Linear: baseDelay * (attempt + 1)
    delay = opts.baseDelayMs * (attempt + 1);
  }

  // Add jitter (random variation to prevent thundering herd)
  const jitter = Math.random() * opts.jitterFactor * delay;
  delay = delay + jitter;

  // Cap at maximum delay
  return Math.min(delay, opts.maxDelayMs);
}

/**
 * Execute a function with a timeout
 *
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result of the function
 * @throws Error if timeout is exceeded
 */
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Circuit Breaker Pattern
// ============================================================================

/**
 * Circuit breaker for preventing cascading failures
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail immediately
 * - HALF_OPEN: Testing if service recovered, limited requests pass through
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeoutMs: 60000,
 * });
 *
 * const result = await breaker.execute(async () => {
 *   return await fetch('https://api.example.com/data');
 * });
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly options: Required<Omit<CircuitBreakerOptions, 'onStateChange'>>;
  private readonly onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function through the circuit breaker
   *
   * @param fn - Async function to execute
   * @returns Result of the function
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit allows request
    if (!this.canMakeRequest()) {
      throw new Error(
        `Circuit breaker is OPEN. Service unavailable. Will retry after ${this.options.resetTimeoutMs}ms`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if a request can be made based on circuit state
   */
  private canMakeRequest(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if enough time has passed to try again
        if (now - this.lastFailureTime >= this.options.resetTimeoutMs) {
          this.transitionTo('HALF_OPEN');
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   */
  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo('CLOSED');
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Immediately open circuit on failure in half-open state
      this.transitionTo('OPEN');
      this.successCount = 0;
    } else if (this.state === 'CLOSED') {
      // Open circuit if failure threshold exceeded
      if (this.failureCount >= this.options.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  /**
   * Transition to a new circuit state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (this.onStateChange && oldState !== newState) {
      this.onStateChange(oldState, newState);
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

// ============================================================================
// Common Retry Predicates
// ============================================================================

/**
 * Check if error is a network error (retryable)
 */
export function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('fetch failed')
  );
}

/**
 * Check if error is a rate limit error (retryable with backoff)
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('too many requests')
  );
}

/**
 * Check if error is a server error (5xx, retryable)
 */
export function isServerError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('internal server error') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable') ||
    message.includes('gateway timeout')
  );
}

/**
 * Check if error is a client error (4xx, not retryable except 429)
 */
export function isClientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('400') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('404') ||
    message.includes('bad request') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found')
  );
}

/**
 * Default retryable error predicate
 * Retries on network errors, rate limits, and server errors
 * Does not retry on client errors (except rate limits)
 */
export function isRetryableError(error: Error): boolean {
  return (
    isNetworkError(error) ||
    isRateLimitError(error) ||
    isServerError(error)
  );
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Retry with default options for API calls
 */
export async function retryApiCall<T>(
  fn: () => Promise<T>,
  operationName: string = 'API call'
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    isRetryable: isRetryableError,
    onRetry: (attempt, error, delay) => {
      console.warn(
        `[Retry] ${operationName} attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`
      );
    },
  });
}

/**
 * Retry with default options for database operations
 */
export async function retryDatabaseOperation<T>(
  fn: () => Promise<T>,
  operationName: string = 'Database operation'
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    isRetryable: (error) => {
      // Retry on connection errors, timeouts, and transient errors
      const message = error.message.toLowerCase();
      return (
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('deadlock') ||
        message.includes('lock') ||
        message.includes('busy')
      );
    },
    onRetry: (attempt, error, delay) => {
      console.warn(
        `[Retry] ${operationName} attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`
      );
    },
  });
}
