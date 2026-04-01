/**
 * NewsData.io Circuit Breaker
 * 
 * Implements circuit breaker pattern for resilience against API failures.
 * Provides automatic state transitions based on success/failure rates and
 * fallback mechanisms when the circuit is open.
 * 
 * Features:
 * - Circuit breaker states (closed, open, half-open)
 * - Failure rate tracking and threshold monitoring
 * - Automatic state transitions based on success/failure rates
 * - Cached data fallback when circuit is open
 * - Gradual service re-enabling during recovery
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';
import { getLogger } from './logger.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  resetTimeoutMs: number; // Time to wait before attempting half-open
  halfOpenMaxCalls: number; // Max calls allowed in half-open state
  monitoringPeriod: number; // Time window for failure rate calculation (ms)
  successThreshold: number; // Successes needed in half-open to close circuit
  volumeThreshold: number; // Minimum calls before failure rate is considered
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  failureRate: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  halfOpenCalls: number;
  halfOpenSuccesses: number;
  stateChangeTime: number;
  timeSinceLastStateChange: number;
}

export interface CircuitBreakerResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  fromFallback: boolean;
  circuitState: CircuitBreakerState;
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

export class NewsDataCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalCalls: number = 0;
  private lastFailureTime?: number;
  private stateChangeTime: number = Date.now();
  private halfOpenCalls: number = 0;
  private halfOpenSuccesses: number = 0;
  
  // Sliding window for failure rate calculation
  private callHistory: Array<{ timestamp: number; success: boolean }> = [];
  
  private logger;
  
  constructor(
    private config: CircuitBreakerConfig,
    private observabilityLogger?: AdvancedObservabilityLogger
  ) {
    this.logger = getLogger();
    
    this.logger.info({
      failureThreshold: config.failureThreshold,
      resetTimeoutMs: config.resetTimeoutMs,
      halfOpenMaxCalls: config.halfOpenMaxCalls,
      monitoringPeriod: config.monitoringPeriod,
      successThreshold: config.successThreshold,
      volumeThreshold: config.volumeThreshold,
    }, '[NewsDataCircuitBreaker] Initialized with config');
  }
  
  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallbackFn?: () => Promise<T>
  ): Promise<CircuitBreakerResult<T>> {
    const startTime = Date.now();
    
    // Check if circuit allows execution
    if (!this.canExecute()) {
      this.logger.warn(`[NewsDataCircuitBreaker] Circuit is ${this.state}, execution blocked`);
      
      // Try fallback if available
      if (fallbackFn) {
        try {
          const fallbackData = await fallbackFn();
          
          this.observabilityLogger?.logDataFetch({
            timestamp: Date.now(),
            source: 'news',
            provider: 'newsdata.io',
            success: true,
            cached: true,
            stale: true,
            freshness: 0,
            itemCount: 0,
            duration: Date.now() - startTime,
          });
          
          return {
            success: true,
            data: fallbackData,
            fromFallback: true,
            circuitState: this.state,
          };
        } catch (fallbackError) {
          this.logger.error({ error: fallbackError }, '[NewsDataCircuitBreaker] Fallback also failed');
          
          return {
            success: false,
            error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
            fromFallback: true,
            circuitState: this.state,
          };
        }
      }
      
      // No fallback available
      return {
        success: false,
        error: new Error(`Circuit breaker is ${this.state}`),
        fromFallback: false,
        circuitState: this.state,
      };
    }
    
    // Execute the function
    try {
      const result = await fn();
      
      // Record success
      this.recordSuccess();
      
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        duration: Date.now() - startTime,
      });
      
      return {
        success: true,
        data: result,
        fromFallback: false,
        circuitState: this.state,
      };
      
    } catch (error) {
      // Record failure
      this.recordFailure();
      
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: (error as Error)?.message || 'Unknown error',
        duration: Date.now() - startTime,
      });
      
      // Try fallback if available
      if (fallbackFn) {
        try {
          const fallbackData = await fallbackFn();
          
          this.logger.warn('[NewsDataCircuitBreaker] Primary function failed, using fallback');
          
          return {
            success: true,
            data: fallbackData,
            fromFallback: true,
            circuitState: this.state,
          };
        } catch (fallbackError) {
          this.logger.error('[NewsDataCircuitBreaker] Both primary and fallback failed');
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        fromFallback: false,
        circuitState: this.state,
      };
    }
  }
  
  /**
   * Check if circuit allows execution
   */
  private canExecute(): boolean {
    const now = Date.now();
    
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;
        
      case CircuitBreakerState.OPEN:
        // Check if reset timeout has passed
        if (now - this.stateChangeTime >= this.config.resetTimeoutMs) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;
        
      case CircuitBreakerState.HALF_OPEN:
        // Allow limited calls in half-open state
        return this.halfOpenCalls < this.config.halfOpenMaxCalls;
        
      default:
        return false;
    }
  }
  
  /**
   * Record successful execution
   */
  private recordSuccess(): void {
    const now = Date.now();
    
    this.successCount++;
    this.totalCalls++;
    this.addToCallHistory(now, true);
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCalls++;
      this.halfOpenSuccesses++;
      
      // Check if we have enough successes to close the circuit
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
    
    this.logger.debug(`[NewsDataCircuitBreaker] Recorded success (state: ${this.state})`);
  }
  
  /**
   * Record failed execution
   */
  private recordFailure(): void {
    const now = Date.now();
    
    this.failureCount++;
    this.totalCalls++;
    this.lastFailureTime = now;
    this.addToCallHistory(now, false);
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCalls++;
      // Any failure in half-open state opens the circuit
      this.transitionToOpen();
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Check if we should open the circuit
      this.checkFailureThreshold();
    }
    
    this.logger.debug(`[NewsDataCircuitBreaker] Recorded failure (state: ${this.state})`);
  }
  
  /**
   * Add call result to sliding window history
   */
  private addToCallHistory(timestamp: number, success: boolean): void {
    this.callHistory.push({ timestamp, success });
    
    // Remove old entries outside monitoring period
    const cutoff = timestamp - this.config.monitoringPeriod;
    this.callHistory = this.callHistory.filter(entry => entry.timestamp > cutoff);
  }
  
  /**
   * Check if failure threshold is exceeded
   */
  private checkFailureThreshold(): void {
    const now = Date.now();
    const cutoff = now - this.config.monitoringPeriod;
    
    // Get recent calls within monitoring period
    const recentCalls = this.callHistory.filter(entry => entry.timestamp > cutoff);
    
    // Check if we have enough volume to make a decision
    if (recentCalls.length < this.config.volumeThreshold) {
      return;
    }
    
    // Calculate failure rate
    const failures = recentCalls.filter(entry => !entry.success).length;
    const failureRate = failures / recentCalls.length;
    
    // Check if failure rate exceeds threshold
    if (failures >= this.config.failureThreshold || failureRate > 0.5) {
      this.transitionToOpen();
    }
  }
  
  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    
    this.logger.info(`[NewsDataCircuitBreaker] State transition: ${previousState} -> ${this.state}`);
    
    this.observabilityLogger?.logDataFetch({
      timestamp: Date.now(),
      source: 'news',
      provider: 'newsdata.io',
      success: true,
      cached: false,
      stale: false,
      freshness: 0,
      itemCount: 0,
      duration: 0,
    });
  }
  
  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.OPEN;
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    
    this.logger.warn(`[NewsDataCircuitBreaker] State transition: ${previousState} -> ${this.state}`);
    
    this.observabilityLogger?.logDataFetch({
      timestamp: Date.now(),
      source: 'news',
      provider: 'newsdata.io',
      success: false,
      cached: false,
      stale: false,
      freshness: 0,
      itemCount: 0,
      error: 'Circuit breaker opened due to failures',
      duration: 0,
    });
  }
  
  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.HALF_OPEN;
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    
    this.logger.info(`[NewsDataCircuitBreaker] State transition: ${previousState} -> ${this.state}`);
  }
  
  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }
  
  /**
   * Get comprehensive circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const now = Date.now();
    const cutoff = now - this.config.monitoringPeriod;
    
    // Calculate failure rate from recent calls
    const recentCalls = this.callHistory.filter(entry => entry.timestamp > cutoff);
    const recentFailures = recentCalls.filter(entry => !entry.success).length;
    const failureRate = recentCalls.length > 0 ? recentFailures / recentCalls.length : 0;
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      failureRate,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.state === CircuitBreakerState.OPEN 
        ? this.stateChangeTime + this.config.resetTimeoutMs 
        : undefined,
      halfOpenCalls: this.halfOpenCalls,
      halfOpenSuccesses: this.halfOpenSuccesses,
      stateChangeTime: this.stateChangeTime,
      timeSinceLastStateChange: now - this.stateChangeTime,
    };
  }
  
  /**
   * Get detailed statistics including call history
   */
  getDetailedStats(): CircuitBreakerStats & {
    recentCallsCount: number;
    recentFailuresCount: number;
    recentSuccessesCount: number;
    averageCallsPerMinute: number;
    timeInCurrentState: number;
    nextStateTransitionTime?: number;
  } {
    const baseStats = this.getStats();
    const now = Date.now();
    const cutoff = now - this.config.monitoringPeriod;
    
    const recentCalls = this.callHistory.filter(entry => entry.timestamp > cutoff);
    const recentFailures = recentCalls.filter(entry => !entry.success);
    const recentSuccesses = recentCalls.filter(entry => entry.success);
    
    const averageCallsPerMinute = recentCalls.length > 0 
      ? (recentCalls.length / (this.config.monitoringPeriod / 60000))
      : 0;
    
    const timeInCurrentState = now - this.stateChangeTime;
    
    let nextStateTransitionTime: number | undefined;
    if (this.state === CircuitBreakerState.OPEN) {
      nextStateTransitionTime = this.stateChangeTime + this.config.resetTimeoutMs;
    }
    
    return {
      ...baseStats,
      recentCallsCount: recentCalls.length,
      recentFailuresCount: recentFailures.length,
      recentSuccessesCount: recentSuccesses.length,
      averageCallsPerMinute,
      timeInCurrentState,
      nextStateTransitionTime,
    };
  }
  
  /**
   * Manually trip the circuit (force open state)
   */
  trip(): void {
    this.logger.warn('[NewsDataCircuitBreaker] Circuit manually tripped');
    this.transitionToOpen();
  }
  
  /**
   * Manually reset the circuit (force closed state)
   */
  reset(): void {
    this.logger.info('[NewsDataCircuitBreaker] Circuit manually reset');
    
    // Reset all counters and state
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.lastFailureTime = undefined;
    this.stateChangeTime = Date.now();
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    this.callHistory = [];
  }
  
  /**
   * Check if circuit is healthy (closed and low failure rate)
   */
  isHealthy(): boolean {
    if (this.state !== CircuitBreakerState.CLOSED) {
      return false;
    }
    
    const stats = this.getStats();
    return stats.failureRate < 0.1; // Less than 10% failure rate
  }
  
  /**
   * Get time until next state transition (for open state)
   */
  getTimeUntilNextAttempt(): number {
    if (this.state !== CircuitBreakerState.OPEN) {
      return 0;
    }
    
    const now = Date.now();
    const nextAttemptTime = this.stateChangeTime + this.config.resetTimeoutMs;
    
    return Math.max(0, nextAttemptTime - now);
  }
  
  /**
   * Update circuit breaker configuration
   */
  updateConfig(updates: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...updates };
    
    this.logger.info(updates, '[NewsDataCircuitBreaker] Configuration updated');
  }
  
  /**
   * Get current configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5, // Open after 5 failures
  resetTimeoutMs: 60000, // 1 minute timeout
  halfOpenMaxCalls: 3, // Allow 3 calls in half-open state
  monitoringPeriod: 60000, // 1 minute monitoring window
  successThreshold: 2, // Need 2 successes to close from half-open
  volumeThreshold: 10, // Need at least 10 calls before considering failure rate
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData circuit breaker instance
 */
export function createNewsDataCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>,
  observabilityLogger?: AdvancedObservabilityLogger
): NewsDataCircuitBreaker {
  const mergedConfig: CircuitBreakerConfig = {
    ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
    ...config,
  };
  
  return new NewsDataCircuitBreaker(mergedConfig, observabilityLogger);
}

/**
 * Create circuit breaker configuration from environment variables
 */
export function createCircuitBreakerConfigFromEnv(): Partial<CircuitBreakerConfig> {
  return {
    failureThreshold: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
    resetTimeoutMs: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_RESET_TIMEOUT || '60000'),
    halfOpenMaxCalls: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_HALF_OPEN_CALLS || '3'),
    monitoringPeriod: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_MONITORING_PERIOD || '60000'),
    successThreshold: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '2'),
    volumeThreshold: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_VOLUME_THRESHOLD || '10'),
  };
}