/**
 * NewsData.io Error Handler
 * 
 * Provides comprehensive error handling with detailed context logging,
 * circuit breaker state change logging, and quota exhaustion alerts.
 */

import type { NewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import { getNewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import type { MonitorLogger } from './logger.js';
import { getMonitorLogger } from './logger.js';

// ============================================================================
// Error Types and Interfaces
// ============================================================================

/**
 * Enhanced error context for detailed logging
 */
export interface EnhancedErrorContext {
  requestId?: string;
  endpoint?: 'latest' | 'archive' | 'crypto' | 'market' | 'sources';
  agentName?: string;
  parameters?: Record<string, any>;
  url?: string;
  httpStatus?: number;
  apiErrorCode?: string;
  retryAttempt?: number;
  maxRetries?: number;
  fallbackUsed?: boolean;
  circuitBreakerState?: 'closed' | 'open' | 'half_open';
  quotaInfo?: {
    dailyUsed: number;
    dailyLimit: number;
    rateLimitUsed: number;
    rateLimitLimit: number;
  };
  cacheInfo?: {
    cacheKey?: string;
    cacheHit?: boolean;
    cacheStale?: boolean;
  };
  performanceInfo?: {
    responseTime?: number;
    requestStartTime?: number;
  };
  additionalContext?: Record<string, any>;
}

/**
 * Alert configuration for different error types
 */
export interface AlertConfiguration {
  enabled: boolean;
  severity: 'info' | 'warning' | 'error' | 'critical';
  threshold?: number;
  timeWindow?: number; // seconds
  actionRequired: boolean;
  notificationChannels?: string[];
  escalationRules?: {
    escalateAfter: number; // seconds
    escalateTo: 'warning' | 'error' | 'critical';
  };
}

/**
 * Error handling configuration
 */
export interface ErrorHandlingConfig {
  alerts: {
    quotaExhaustion: AlertConfiguration;
    rateLimitExceeded: AlertConfiguration;
    highErrorRate: AlertConfiguration;
    circuitBreakerOpen: AlertConfiguration;
    apiKeyInvalid: AlertConfiguration;
    serverErrors: AlertConfiguration;
    networkErrors: AlertConfiguration;
    validationErrors: AlertConfiguration;
  };
  errorTracking: {
    maxErrorHistory: number;
    errorAggregationWindow: number; // seconds
    enableStackTraces: boolean;
    sanitizeParameters: boolean;
  };
  circuitBreaker: {
    logStateChanges: boolean;
    alertOnOpen: boolean;
    alertOnHalfOpen: boolean;
    alertOnClose: boolean;
  };
}

/**
 * Default error handling configuration
 */
export const DEFAULT_ERROR_HANDLING_CONFIG: ErrorHandlingConfig = {
  alerts: {
    quotaExhaustion: {
      enabled: true,
      severity: 'critical',
      threshold: 95, // 95% quota utilization
      timeWindow: 300, // 5 minutes
      actionRequired: true,
      escalationRules: {
        escalateAfter: 300, // 5 minutes
        escalateTo: 'critical',
      },
    },
    rateLimitExceeded: {
      enabled: true,
      severity: 'error',
      threshold: 90, // 90% rate limit utilization
      timeWindow: 900, // 15 minutes
      actionRequired: true,
    },
    highErrorRate: {
      enabled: true,
      severity: 'warning',
      threshold: 20, // 20% error rate
      timeWindow: 600, // 10 minutes
      actionRequired: false,
      escalationRules: {
        escalateAfter: 1800, // 30 minutes
        escalateTo: 'error',
      },
    },
    circuitBreakerOpen: {
      enabled: true,
      severity: 'error',
      actionRequired: true,
    },
    apiKeyInvalid: {
      enabled: true,
      severity: 'critical',
      actionRequired: true,
    },
    serverErrors: {
      enabled: true,
      severity: 'error',
      threshold: 5, // 5 server errors
      timeWindow: 300, // 5 minutes
      actionRequired: false,
    },
    networkErrors: {
      enabled: true,
      severity: 'warning',
      threshold: 10, // 10 network errors
      timeWindow: 600, // 10 minutes
      actionRequired: false,
    },
    validationErrors: {
      enabled: true,
      severity: 'info',
      threshold: 20, // 20 validation errors
      timeWindow: 3600, // 1 hour
      actionRequired: false,
    },
  },
  errorTracking: {
    maxErrorHistory: 1000,
    errorAggregationWindow: 300, // 5 minutes
    enableStackTraces: true,
    sanitizeParameters: true,
  },
  circuitBreaker: {
    logStateChanges: true,
    alertOnOpen: true,
    alertOnHalfOpen: false,
    alertOnClose: true,
  },
};

// ============================================================================
// Error Statistics Tracking
// ============================================================================

/**
 * Error statistics for tracking patterns
 */
export interface ErrorStatistics {
  totalErrors: number;
  errorsByType: Map<string, number>;
  errorsByEndpoint: Map<string, number>;
  errorsByAgent: Map<string, number>;
  errorsByTimeWindow: Array<{ timestamp: number; count: number }>;
  recentErrors: Array<{
    timestamp: number;
    type: string;
    endpoint?: string;
    agentName?: string;
    message: string;
  }>;
}

// ============================================================================
// NewsData Error Handler Class
// ============================================================================

/**
 * Comprehensive error handler for NewsData.io operations
 */
export class NewsDataErrorHandler {
  private config: ErrorHandlingConfig;
  private newsDataLogger: NewsDataObservabilityLogger;
  private logger: MonitorLogger;
  private errorStatistics: ErrorStatistics;
  private alertHistory: Map<string, number> = new Map(); // alertType -> lastAlertTime

  constructor(
    config: Partial<ErrorHandlingConfig> = {},
    newsDataLogger?: NewsDataObservabilityLogger,
    logger?: MonitorLogger
  ) {
    this.config = this.mergeConfig(DEFAULT_ERROR_HANDLING_CONFIG, config);
    this.newsDataLogger = newsDataLogger || getNewsDataObservabilityLogger();
    this.logger = logger || getMonitorLogger();
    
    this.errorStatistics = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsByEndpoint: new Map(),
      errorsByAgent: new Map(),
      errorsByTimeWindow: [],
      recentErrors: [],
    };

    this.logger.logConfig('NewsData error handler initialized', {
      alertsEnabled: Object.values(this.config.alerts).filter(a => a.enabled).length,
      errorTrackingEnabled: true,
      circuitBreakerLoggingEnabled: this.config.circuitBreaker.logStateChanges,
    });
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(
    defaultConfig: ErrorHandlingConfig, 
    userConfig: Partial<ErrorHandlingConfig>
  ): ErrorHandlingConfig {
    return {
      alerts: { ...defaultConfig.alerts, ...userConfig.alerts },
      errorTracking: { ...defaultConfig.errorTracking, ...userConfig.errorTracking },
      circuitBreaker: { ...defaultConfig.circuitBreaker, ...userConfig.circuitBreaker },
    };
  }

  // ============================================================================
  // Error Handling Methods
  // ============================================================================

  /**
   * Handle API errors with comprehensive logging and alerting
   */
  async handleApiError(
    error: Error, 
    context: EnhancedErrorContext
  ): Promise<void> {
    const errorType = this.categorizeError(error, context);
    const impactLevel = this.assessImpactLevel(error, context);
    
    // Update error statistics
    this.updateErrorStatistics(errorType, context);
    
    // Log error with detailed context
    this.newsDataLogger.logError({
      timestamp: Date.now(),
      requestId: context.requestId,
      endpoint: context.endpoint,
      agentName: context.agentName,
      errorType,
      errorCode: this.extractErrorCode(error, context),
      errorMessage: error.message,
      errorDetails: this.buildErrorDetails(error, context),
      stackTrace: this.config.errorTracking.enableStackTraces ? error.stack : undefined,
      retryAttempt: context.retryAttempt,
      maxRetries: context.maxRetries,
      fallbackUsed: context.fallbackUsed || false,
      impactLevel,
    });

    // Check for alert conditions
    await this.checkAndTriggerAlerts(errorType, error, context);

    // Log to structured logger
    this.logger.logError('NewsData API error', {
      errorType,
      errorCode: this.extractErrorCode(error, context),
      endpoint: context.endpoint,
      agentName: context.agentName,
      httpStatus: context.httpStatus,
      retryAttempt: context.retryAttempt,
      fallbackUsed: context.fallbackUsed,
      impactLevel,
      error,
    });
  }

  /**
   * Handle quota exhaustion with immediate alerting
   */
  async handleQuotaExhaustion(
    quotaInfo: {
      dailyUsed: number;
      dailyLimit: number;
      utilizationPercentage: number;
    },
    context: EnhancedErrorContext
  ): Promise<void> {
    const alertConfig = this.config.alerts.quotaExhaustion;
    
    if (!alertConfig.enabled) return;

    // Log quota usage
    this.newsDataLogger.logQuotaUsage({
      timestamp: Date.now(),
      dailyQuotaLimit: quotaInfo.dailyLimit,
      dailyQuotaUsed: quotaInfo.dailyUsed,
      dailyQuotaRemaining: quotaInfo.dailyLimit - quotaInfo.dailyUsed,
      quotaUtilization: quotaInfo.utilizationPercentage,
      rateLimitWindow: 15 * 60 * 1000, // 15 minutes
      rateLimitUsed: context.quotaInfo?.rateLimitUsed || 0,
      rateLimitRemaining: context.quotaInfo?.rateLimitLimit || 0,
      rateLimitUtilization: context.quotaInfo ? 
        (context.quotaInfo.rateLimitUsed / context.quotaInfo.rateLimitLimit) * 100 : 0,
      estimatedTimeToReset: this.calculateTimeToQuotaReset(),
    });

    // Check if alert threshold is met
    if (quotaInfo.utilizationPercentage >= (alertConfig.threshold || 95)) {
      await this.triggerAlert('quotaExhaustion', {
        message: `Daily quota utilization is ${quotaInfo.utilizationPercentage.toFixed(1)}%`,
        severity: quotaInfo.utilizationPercentage >= 98 ? 'critical' : alertConfig.severity,
        details: {
          dailyUsed: quotaInfo.dailyUsed,
          dailyLimit: quotaInfo.dailyLimit,
          utilizationPercentage: quotaInfo.utilizationPercentage,
          estimatedTimeToReset: this.calculateTimeToQuotaReset(),
          endpoint: context.endpoint,
          agentName: context.agentName,
        },
        actionRequired: quotaInfo.utilizationPercentage >= 98,
      });
    }
  }

  /**
   * Handle rate limit exceeded with backoff recommendations
   */
  async handleRateLimitExceeded(
    rateLimitInfo: {
      requestsInWindow: number;
      windowSizeMs: number;
      limitExceeded: boolean;
      retryAfter?: number;
    },
    context: EnhancedErrorContext
  ): Promise<void> {
    // Log rate limit information
    this.newsDataLogger.logRateLimit({
      timestamp: Date.now(),
      endpoint: (context.endpoint as 'latest' | 'archive' | 'crypto' | 'market' | 'sources') || 'latest',
      requestsInWindow: rateLimitInfo.requestsInWindow,
      windowSizeMs: rateLimitInfo.windowSizeMs,
      limitExceeded: rateLimitInfo.limitExceeded,
      throttled: true,
      retryAfter: rateLimitInfo.retryAfter,
      backoffTime: this.calculateBackoffTime(context.retryAttempt || 1),
    });

    if (rateLimitInfo.limitExceeded) {
      await this.triggerAlert('rateLimitExceeded', {
        message: `Rate limit exceeded for ${context.endpoint} endpoint`,
        severity: 'error',
        details: {
          endpoint: context.endpoint,
          requestsInWindow: rateLimitInfo.requestsInWindow,
          windowSizeMs: rateLimitInfo.windowSizeMs,
          retryAfter: rateLimitInfo.retryAfter,
          recommendedBackoff: this.calculateBackoffTime(context.retryAttempt || 1),
          agentName: context.agentName,
        },
        actionRequired: true,
      });
    }
  }

  /**
   * Handle circuit breaker state changes
   */
  async handleCircuitBreakerStateChange(
    stateChange: {
      endpoint: string;
      previousState: 'closed' | 'open' | 'half_open';
      newState: 'closed' | 'open' | 'half_open';
      failureCount: number;
      successCount: number;
      failureThreshold: number;
      resetTimeout: number;
      reason: string;
    }
  ): Promise<void> {
    if (!this.config.circuitBreaker.logStateChanges) return;

    // Log circuit breaker state change
    this.newsDataLogger.logCircuitBreakerStateChange({
      timestamp: Date.now(),
      endpoint: stateChange.endpoint as any,
      previousState: stateChange.previousState,
      newState: stateChange.newState,
      failureCount: stateChange.failureCount,
      successCount: stateChange.successCount,
      failureThreshold: stateChange.failureThreshold,
      resetTimeout: stateChange.resetTimeout,
      reason: stateChange.reason,
    });

    // Check for alerts based on state change
    const alertConfig = this.config.alerts.circuitBreakerOpen;
    
    if (stateChange.newState === 'open' && this.config.circuitBreaker.alertOnOpen && alertConfig.enabled) {
      await this.triggerAlert('circuitBreakerOpen', {
        message: `Circuit breaker opened for ${stateChange.endpoint} endpoint`,
        severity: alertConfig.severity,
        details: {
          endpoint: stateChange.endpoint,
          failureCount: stateChange.failureCount,
          failureThreshold: stateChange.failureThreshold,
          resetTimeout: stateChange.resetTimeout,
          reason: stateChange.reason,
        },
        actionRequired: alertConfig.actionRequired,
      });
    }

    if (stateChange.newState === 'closed' && this.config.circuitBreaker.alertOnClose) {
      await this.triggerAlert('circuitBreakerOpen', {
        message: `Circuit breaker closed for ${stateChange.endpoint} endpoint - service recovered`,
        severity: 'info',
        details: {
          endpoint: stateChange.endpoint,
          successCount: stateChange.successCount,
          previousFailureCount: stateChange.failureCount,
        },
        actionRequired: false,
      });
    }
  }

  // ============================================================================
  // Error Analysis and Categorization
  // ============================================================================

  /**
   * Categorize error for proper handling
   */
  private categorizeError(error: Error, context: EnhancedErrorContext): 'api' | 'network' | 'validation' | 'rate_limit' | 'quota' | 'system' {
    // Check HTTP status codes
    if (context.httpStatus) {
      if (context.httpStatus === 401) return 'api';
      if (context.httpStatus === 429) return 'rate_limit';
      if (context.httpStatus === 400 || context.httpStatus === 422) return 'validation';
      if (context.httpStatus >= 500) return 'system';
    }

    // Check error types
    if (error.name === 'NewsDataRateLimitError') return 'rate_limit';
    if (error.name === 'NewsDataQuotaExceededError') return 'quota';
    if (error.name === 'NewsDataValidationError') return 'validation';
    if (error.name === 'NewsDataError') return 'api';

    // Check error messages
    if (error.message.includes('quota') || error.message.includes('limit exceeded')) return 'quota';
    if (error.message.includes('rate limit')) return 'rate_limit';
    if (error.message.includes('validation') || error.message.includes('parameter')) return 'validation';
    if (error.message.includes('network') || error.message.includes('timeout')) return 'network';
    if (error.message.includes('cache')) return 'system';
    if (error.message.includes('circuit breaker')) return 'system';

    return 'system';
  }

  /**
   * Assess impact level of error
   */
  private assessImpactLevel(error: Error, context: EnhancedErrorContext): 'low' | 'medium' | 'high' | 'critical' {
    // Critical: API key issues, quota exhaustion
    if (context.httpStatus === 401 || error.name === 'NewsDataQuotaExceededError') {
      return 'critical';
    }

    // High: Rate limits, server errors, circuit breaker open
    if (context.httpStatus === 429 || 
        (context.httpStatus && context.httpStatus >= 500) ||
        context.circuitBreakerState === 'open') {
      return 'high';
    }

    // Medium: Validation errors, client errors
    if (context.httpStatus === 400 || 
        context.httpStatus === 422 || 
        error.name === 'NewsDataValidationError') {
      return 'medium';
    }

    // Low: Network timeouts, cache misses
    return 'low';
  }

  /**
   * Extract error code from error and context
   */
  private extractErrorCode(error: Error, context: EnhancedErrorContext): string {
    if (context.apiErrorCode) return context.apiErrorCode;
    if (context.httpStatus) return `HTTP_${context.httpStatus}`;
    if (error.name !== 'Error') return error.name.replace('Error', '').toUpperCase();
    return 'UNKNOWN_ERROR';
  }

  /**
   * Build detailed error context for logging
   */
  private buildErrorDetails(error: Error, context: EnhancedErrorContext): Record<string, any> {
    const details: Record<string, any> = {
      errorName: error.name,
      errorMessage: error.message,
    };

    if (context.httpStatus) details.httpStatus = context.httpStatus;
    if (context.apiErrorCode) details.apiErrorCode = context.apiErrorCode;
    if (context.url) details.url = context.url.replace(/apikey=[^&]+/, 'apikey=***');
    if (context.parameters && this.config.errorTracking.sanitizeParameters) {
      details.parameters = this.sanitizeParameters(context.parameters);
    }
    if (context.quotaInfo) details.quotaInfo = context.quotaInfo;
    if (context.cacheInfo) details.cacheInfo = context.cacheInfo;
    if (context.performanceInfo) details.performanceInfo = context.performanceInfo;
    if (context.circuitBreakerState) details.circuitBreakerState = context.circuitBreakerState;
    if (context.additionalContext) details.additionalContext = context.additionalContext;

    return details;
  }

  /**
   * Sanitize parameters for logging (remove sensitive data)
   */
  private sanitizeParameters(params: Record<string, any>): Record<string, any> {
    const sanitized = { ...params };
    const sensitiveKeys = ['apikey', 'api_key', 'token', 'password', 'secret'];
    
    sensitiveKeys.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = '***REDACTED***';
      }
    });

    return sanitized;
  }

  // ============================================================================
  // Alert Management
  // ============================================================================

  /**
   * Trigger alert with rate limiting and escalation
   */
  private async triggerAlert(
    alertType: string,
    alertData: {
      message: string;
      severity: 'info' | 'warning' | 'error' | 'critical';
      details: Record<string, any>;
      actionRequired: boolean;
    }
  ): Promise<void> {
    const now = Date.now();
    const lastAlertTime = this.alertHistory.get(alertType) || 0;
    const alertConfig = this.config.alerts[alertType as keyof typeof this.config.alerts];
    
    if (!alertConfig?.enabled) return;

    // Rate limit alerts (don't spam)
    const minInterval = alertConfig.timeWindow ? alertConfig.timeWindow * 1000 : 300000; // 5 minutes default
    if (now - lastAlertTime < minInterval) return;

    // Check for escalation
    let finalSeverity = alertData.severity;
    if (alertConfig.escalationRules && 
        now - lastAlertTime > alertConfig.escalationRules.escalateAfter * 1000) {
      finalSeverity = alertConfig.escalationRules.escalateTo;
    }

    // Log alert
    this.newsDataLogger.logAlert({
      timestamp: now,
      alertType: alertType as any,
      severity: finalSeverity,
      message: alertData.message,
      details: alertData.details,
      threshold: alertConfig.threshold,
      currentValue: this.extractCurrentValue(alertType, alertData.details),
      actionRequired: alertData.actionRequired,
      autoResolved: false,
    });

    // Update alert history
    this.alertHistory.set(alertType, now);

    // Log to structured logger
    const logMethod = finalSeverity === 'critical' || finalSeverity === 'error' 
      ? this.logger.logError.bind(this.logger)
      : finalSeverity === 'warning'
      ? this.logger.logWarning.bind(this.logger)
      : this.logger.logConfig.bind(this.logger);

    logMethod(`NewsData alert: ${alertData.message}`, {
      alertType,
      severity: finalSeverity,
      details: alertData.details,
      actionRequired: alertData.actionRequired,
      ...(finalSeverity === 'critical' || finalSeverity === 'error' ? { error: new Error(alertData.message) } : {}),
    });
  }

  /**
   * Extract current value for alert threshold comparison
   */
  private extractCurrentValue(alertType: string, details: Record<string, any>): number | undefined {
    switch (alertType) {
      case 'quotaExhaustion':
        return details.utilizationPercentage;
      case 'rateLimitExceeded':
        return details.requestsInWindow;
      case 'highErrorRate':
        return details.errorRate;
      default:
        return undefined;
    }
  }

  // ============================================================================
  // Error Statistics and Analysis
  // ============================================================================

  /**
   * Update error statistics for pattern analysis
   */
  private updateErrorStatistics(errorType: string, context: EnhancedErrorContext): void {
    this.errorStatistics.totalErrors++;
    
    // Update error counts by type
    this.errorStatistics.errorsByType.set(
      errorType, 
      (this.errorStatistics.errorsByType.get(errorType) || 0) + 1
    );

    // Update error counts by endpoint
    if (context.endpoint) {
      this.errorStatistics.errorsByEndpoint.set(
        context.endpoint, 
        (this.errorStatistics.errorsByEndpoint.get(context.endpoint) || 0) + 1
      );
    }

    // Update error counts by agent
    if (context.agentName) {
      this.errorStatistics.errorsByAgent.set(
        context.agentName, 
        (this.errorStatistics.errorsByAgent.get(context.agentName) || 0) + 1
      );
    }

    // Update time window statistics
    const now = Date.now();
    const windowStart = now - (this.config.errorTracking.errorAggregationWindow * 1000);
    
    // Remove old entries
    this.errorStatistics.errorsByTimeWindow = this.errorStatistics.errorsByTimeWindow
      .filter(entry => entry.timestamp >= windowStart);
    
    // Add current error
    this.errorStatistics.errorsByTimeWindow.push({ timestamp: now, count: 1 });

    // Update recent errors list
    this.errorStatistics.recentErrors.push({
      timestamp: now,
      type: errorType,
      endpoint: context.endpoint,
      agentName: context.agentName,
      message: context.additionalContext?.errorMessage || 'Unknown error',
    });

    // Limit recent errors list size
    if (this.errorStatistics.recentErrors.length > this.config.errorTracking.maxErrorHistory) {
      this.errorStatistics.recentErrors = this.errorStatistics.recentErrors
        .slice(-this.config.errorTracking.maxErrorHistory);
    }

    // Check for high error rate alert
    this.checkHighErrorRateAlert();
  }

  /**
   * Check for high error rate alert condition
   */
  private checkHighErrorRateAlert(): void {
    const alertConfig = this.config.alerts.highErrorRate;
    if (!alertConfig.enabled || !alertConfig.threshold) return;

    const now = Date.now();
    const windowStart = now - (alertConfig.timeWindow || 600) * 1000; // Default 10 minutes
    
    // Count errors in time window
    const errorsInWindow = this.errorStatistics.errorsByTimeWindow
      .filter(entry => entry.timestamp >= windowStart)
      .reduce((sum, entry) => sum + entry.count, 0);

    // Calculate error rate (assuming some baseline request rate)
    // This is a simplified calculation - in practice, you'd want to track total requests too
    const errorRate = errorsInWindow; // Simplified: just count errors

    if (errorRate >= alertConfig.threshold) {
      this.triggerAlert('highErrorRate', {
        message: `High error rate detected: ${errorRate} errors in ${alertConfig.timeWindow || 600} seconds`,
        severity: alertConfig.severity,
        details: {
          errorCount: errorRate,
          timeWindow: alertConfig.timeWindow || 600,
          threshold: alertConfig.threshold,
          topErrorTypes: this.getTopErrorTypes(5),
          topErrorEndpoints: this.getTopErrorEndpoints(5),
        },
        actionRequired: alertConfig.actionRequired,
      });
    }
  }

  /**
   * Get top error types for analysis
   */
  private getTopErrorTypes(limit: number = 5): Array<{ type: string; count: number }> {
    return Array.from(this.errorStatistics.errorsByType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get top error endpoints for analysis
   */
  private getTopErrorEndpoints(limit: number = 5): Array<{ endpoint: string; count: number }> {
    return Array.from(this.errorStatistics.errorsByEndpoint.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Calculate time to quota reset (simplified - assumes daily reset at midnight UTC)
   */
  private calculateTimeToQuotaReset(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Calculate exponential backoff time
   */
  private calculateBackoffTime(retryAttempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 1 minute
    const delay = Math.min(baseDelay * Math.pow(2, retryAttempt - 1), maxDelay);
    
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() - 0.5);
    return Math.round(delay + jitter);
  }

  /**
   * Get error statistics summary
   */
  getErrorStatistics(): ErrorStatistics {
    return {
      totalErrors: this.errorStatistics.totalErrors,
      errorsByType: new Map(this.errorStatistics.errorsByType),
      errorsByEndpoint: new Map(this.errorStatistics.errorsByEndpoint),
      errorsByAgent: new Map(this.errorStatistics.errorsByAgent),
      errorsByTimeWindow: [...this.errorStatistics.errorsByTimeWindow],
      recentErrors: [...this.errorStatistics.recentErrors],
    };
  }

  /**
   * Clear error statistics (for testing or reset)
   */
  clearErrorStatistics(): void {
    this.errorStatistics = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsByEndpoint: new Map(),
      errorsByAgent: new Map(),
      errorsByTimeWindow: [],
      recentErrors: [],
    };
    this.alertHistory.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorHandlingConfig>): void {
    this.config = this.mergeConfig(this.config, newConfig);
    
    this.logger.logConfig('NewsData error handler configuration updated', {
      alertsEnabled: Object.values(this.config.alerts).filter(a => a.enabled).length,
    });
  }

  /**
   * Check and trigger alerts based on error conditions
   */
  private async checkAndTriggerAlerts(
    errorType: 'api' | 'network' | 'validation' | 'system' | 'rate_limit' | 'quota',
    _error: Error,
    context: any
  ): Promise<void> {
    // This method can be implemented to check specific alert conditions
    // For now, it's a placeholder to resolve the compilation error
    if (errorType === 'api' && context?.httpStatus === 401) {
      // Could trigger specific alerts for authentication errors
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData error handler instance
 */
export function createNewsDataErrorHandler(
  config: Partial<ErrorHandlingConfig> = {},
  newsDataLogger?: NewsDataObservabilityLogger,
  logger?: MonitorLogger
): NewsDataErrorHandler {
  return new NewsDataErrorHandler(config, newsDataLogger, logger);
}

/**
 * Global instance for convenience
 */
let globalErrorHandler: NewsDataErrorHandler | null = null;

/**
 * Get the global NewsData error handler
 */
export function getNewsDataErrorHandler(): NewsDataErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = createNewsDataErrorHandler();
  }
  return globalErrorHandler;
}

/**
 * Initialize the global NewsData error handler
 */
export function initializeNewsDataErrorHandler(
  config: Partial<ErrorHandlingConfig> = {},
  newsDataLogger?: NewsDataObservabilityLogger,
  logger?: MonitorLogger
): NewsDataErrorHandler {
  globalErrorHandler = createNewsDataErrorHandler(config, newsDataLogger, logger);
  return globalErrorHandler;
}