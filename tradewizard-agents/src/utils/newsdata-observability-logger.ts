/**
 * NewsData.io Observability Logger
 * 
 * Provides comprehensive logging for NewsData.io operations including:
 * - Structured logging for all news requests
 * - Performance metrics logging (response times, cache hit rates)
 * - Quota usage and rate limit logging
 * - Error and alert logging with detailed context
 * - Agent usage tracking
 */

import type { MonitorLogger } from './logger.js';
import { getMonitorLogger, sanitizeLogData, formatDuration, formatCost } from './logger.js';

// ============================================================================
// Logging Event Types
// ============================================================================

/**
 * News request log entry
 */
export interface NewsRequestLog {
  timestamp: number;
  requestId: string;
  endpoint: 'latest' | 'archive' | 'crypto' | 'market' | 'sources';
  agentName?: string;
  parameters: Record<string, any>;
  success: boolean;
  responseTime: number; // milliseconds
  itemCount?: number;
  cached: boolean;
  stale: boolean;
  freshness: number; // age in seconds
  error?: string;
  errorCode?: string;
  quotaUsed?: number;
  rateLimitRemaining?: number;
}

/**
 * Performance metrics log entry
 */
export interface PerformanceMetricsLog {
  timestamp: number;
  endpoint: 'latest' | 'archive' | 'crypto' | 'market' | 'sources';
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  cacheHitRate: number;
  cacheMissRate: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeWindow: number; // seconds
}

/**
 * Quota usage log entry
 */
export interface QuotaUsageLog {
  timestamp: number;
  dailyQuotaLimit: number;
  dailyQuotaUsed: number;
  dailyQuotaRemaining: number;
  quotaUtilization: number; // percentage
  rateLimitWindow: number; // milliseconds
  rateLimitUsed: number;
  rateLimitRemaining: number;
  rateLimitUtilization: number; // percentage
  estimatedTimeToReset: number; // milliseconds
}

/**
 * Rate limit log entry
 */
export interface RateLimitLog {
  timestamp: number;
  endpoint: 'latest' | 'archive' | 'crypto' | 'market' | 'sources';
  requestsInWindow: number;
  windowSizeMs: number;
  limitExceeded: boolean;
  throttled: boolean;
  backoffTime?: number; // milliseconds
  retryAfter?: number; // milliseconds
}

/**
 * Cache performance log entry
 */
export interface CachePerformanceLog {
  timestamp: number;
  operation: 'get' | 'set' | 'delete' | 'clear' | 'evict';
  cacheKey: string;
  hit: boolean;
  stale: boolean;
  ttl: number; // seconds
  size?: number; // bytes
  totalKeys: number;
  memoryUsage: number; // bytes
  hitRate: number; // percentage
  evictionCount: number;
}

/**
 * Error log entry with detailed context
 */
export interface ErrorLog {
  timestamp: number;
  requestId?: string;
  endpoint?: 'latest' | 'archive' | 'crypto' | 'market' | 'sources';
  agentName?: string;
  errorType: 'api' | 'network' | 'validation' | 'rate_limit' | 'quota' | 'cache' | 'circuit_breaker' | 'system';
  errorCode: string;
  errorMessage: string;
  errorDetails?: any;
  stackTrace?: string;
  retryAttempt?: number;
  maxRetries?: number;
  fallbackUsed: boolean;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Circuit breaker state change log entry
 */
export interface CircuitBreakerLog {
  timestamp: number;
  endpoint: 'latest' | 'archive' | 'crypto' | 'market' | 'sources';
  previousState: 'closed' | 'open' | 'half_open';
  newState: 'closed' | 'open' | 'half_open';
  failureCount: number;
  successCount: number;
  failureThreshold: number;
  resetTimeout: number; // milliseconds
  reason: string;
}

/**
 * Agent usage tracking log entry
 */
export interface AgentUsageLog {
  timestamp: number;
  agentName: string;
  endpoint: 'latest' | 'archive' | 'crypto' | 'market' | 'sources';
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalQuotaUsed: number;
  cacheHitRate: number;
  preferredParameters: Record<string, any>;
  usagePattern: 'frequent' | 'moderate' | 'occasional' | 'rare';
}

/**
 * Alert log entry
 */
export interface AlertLog {
  timestamp: number;
  alertType: 'quota_exhaustion' | 'rate_limit_exceeded' | 'high_error_rate' | 'circuit_breaker_open' | 'cache_failure' | 'performance_degradation';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details: Record<string, any>;
  threshold?: number;
  currentValue?: number;
  actionRequired: boolean;
  autoResolved: boolean;
}

/**
 * Key rotation log entry
 */
export interface KeyRotationLog {
  timestamp: number;
  eventType: 'rate_limit_detected' | 'key_rotated' | 'all_keys_exhausted' | 'key_available' | 'graceful_degradation';
  keyId?: string;
  oldKeyId?: string;
  newKeyId?: string;
  expiryTime?: string;
  earliestExpiry?: string;
  retryAfterSeconds?: number;
  totalKeys?: number;
  endpoint?: string;
  agentName?: string;
  parameters?: Record<string, any>;
  reason?: string;
  message?: string;
}

// ============================================================================
// NewsData Observability Logger Class
// ============================================================================

/**
 * Comprehensive observability logger for NewsData.io operations
 */
export class NewsDataObservabilityLogger {
  private logger: MonitorLogger;
  private requestLogs: NewsRequestLog[] = [];
  private performanceMetrics: PerformanceMetricsLog[] = [];
  private quotaUsageLogs: QuotaUsageLog[] = [];
  private rateLimitLogs: RateLimitLog[] = [];
  private cachePerformanceLogs: CachePerformanceLog[] = [];
  private errorLogs: ErrorLog[] = [];
  private circuitBreakerLogs: CircuitBreakerLog[] = [];
  private agentUsageLogs: AgentUsageLog[] = [];
  private alertLogs: AlertLog[] = [];
  private keyRotationLogs: KeyRotationLog[] = [];

  // Performance tracking
  private responseTimesByEndpoint: Map<string, number[]> = new Map();
  private requestCountsByEndpoint: Map<string, number> = new Map();
  private successCountsByEndpoint: Map<string, number> = new Map();
  private failureCountsByEndpoint: Map<string, number> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  // Agent usage tracking
  private agentRequestCounts: Map<string, Map<string, number>> = new Map(); // agentName -> endpoint -> count
  private agentResponseTimes: Map<string, number[]> = new Map();
  private agentQuotaUsage: Map<string, number> = new Map();

  constructor(logger?: MonitorLogger) {
    this.logger = logger || getMonitorLogger();
  }

  // ============================================================================
  // News Request Logging
  // ============================================================================

  /**
   * Log a news request with comprehensive details
   */
  logNewsRequest(log: NewsRequestLog): void {
    // Sanitize parameters to remove sensitive data
    const sanitizedLog = {
      ...log,
      parameters: sanitizeLogData(log.parameters),
    };

    this.requestLogs.push(sanitizedLog);

    // Update performance tracking
    this.updatePerformanceTracking(log);

    // Update agent usage tracking
    if (log.agentName) {
      this.updateAgentUsageTracking(log);
    }

    // Log to structured logger
    this.logger.logConfig('NewsData request completed', {
      component: 'newsdata',
      requestId: log.requestId,
      endpoint: log.endpoint,
      agentName: log.agentName,
      success: log.success,
      responseTime: formatDuration(log.responseTime),
      itemCount: log.itemCount,
      cached: log.cached,
      stale: log.stale,
      freshness: formatDuration(log.freshness * 1000),
      error: log.error,
      errorCode: log.errorCode,
      quotaUsed: log.quotaUsed,
      rateLimitRemaining: log.rateLimitRemaining,
    });

    // Check for alert conditions
    this.checkRequestAlerts(log);
  }

  /**
   * Update performance tracking metrics
   */
  private updatePerformanceTracking(log: NewsRequestLog): void {
    const endpoint = log.endpoint;

    // Update response times
    if (!this.responseTimesByEndpoint.has(endpoint)) {
      this.responseTimesByEndpoint.set(endpoint, []);
    }
    this.responseTimesByEndpoint.get(endpoint)!.push(log.responseTime);

    // Update request counts
    this.requestCountsByEndpoint.set(endpoint, (this.requestCountsByEndpoint.get(endpoint) || 0) + 1);

    if (log.success) {
      this.successCountsByEndpoint.set(endpoint, (this.successCountsByEndpoint.get(endpoint) || 0) + 1);
    } else {
      this.failureCountsByEndpoint.set(endpoint, (this.failureCountsByEndpoint.get(endpoint) || 0) + 1);
    }

    // Update cache metrics
    if (log.cached) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /**
   * Update agent usage tracking
   */
  private updateAgentUsageTracking(log: NewsRequestLog): void {
    const agentName = log.agentName!;
    const endpoint = log.endpoint;

    // Initialize agent tracking if needed
    if (!this.agentRequestCounts.has(agentName)) {
      this.agentRequestCounts.set(agentName, new Map());
      this.agentResponseTimes.set(agentName, []);
      this.agentQuotaUsage.set(agentName, 0);
    }

    // Update request counts by endpoint
    const agentEndpointCounts = this.agentRequestCounts.get(agentName)!;
    agentEndpointCounts.set(endpoint, (agentEndpointCounts.get(endpoint) || 0) + 1);

    // Update response times
    this.agentResponseTimes.get(agentName)!.push(log.responseTime);

    // Update quota usage
    if (log.quotaUsed) {
      this.agentQuotaUsage.set(agentName, this.agentQuotaUsage.get(agentName)! + log.quotaUsed);
    }
  }

  /**
   * Check for alert conditions based on request
   */
  private checkRequestAlerts(log: NewsRequestLog): void {
    // High error rate alert
    const endpoint = log.endpoint;
    const totalRequests = this.requestCountsByEndpoint.get(endpoint) || 0;
    const failedRequests = this.failureCountsByEndpoint.get(endpoint) || 0;
    
    if (totalRequests >= 10) { // Only check after minimum requests
      const errorRate = failedRequests / totalRequests;
      if (errorRate > 0.2) { // 20% error rate threshold
        this.logAlert({
          timestamp: Date.now(),
          alertType: 'high_error_rate',
          severity: 'warning',
          message: `High error rate detected for ${endpoint} endpoint`,
          details: {
            endpoint,
            errorRate: Math.round(errorRate * 100),
            totalRequests,
            failedRequests,
          },
          threshold: 20,
          currentValue: Math.round(errorRate * 100),
          actionRequired: true,
          autoResolved: false,
        });
      }
    }

    // Performance degradation alert
    const responseTimes = this.responseTimesByEndpoint.get(endpoint) || [];
    if (responseTimes.length >= 5) {
      const recentTimes = responseTimes.slice(-5);
      const averageTime = recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length;
      
      if (averageTime > 10000) { // 10 second threshold
        this.logAlert({
          timestamp: Date.now(),
          alertType: 'performance_degradation',
          severity: 'warning',
          message: `Performance degradation detected for ${endpoint} endpoint`,
          details: {
            endpoint,
            averageResponseTime: Math.round(averageTime),
            recentRequests: recentTimes.length,
          },
          threshold: 10000,
          currentValue: Math.round(averageTime),
          actionRequired: false,
          autoResolved: false,
        });
      }
    }
  }

  // ============================================================================
  // Performance Metrics Logging
  // ============================================================================

  /**
   * Log performance metrics for a time window
   */
  logPerformanceMetrics(log: PerformanceMetricsLog): void {
    this.performanceMetrics.push(log);

    this.logger.logConfig('NewsData performance metrics', {
      component: 'newsdata',
      endpoint: log.endpoint,
      averageResponseTime: formatDuration(log.averageResponseTime),
      p95ResponseTime: formatDuration(log.p95ResponseTime),
      p99ResponseTime: formatDuration(log.p99ResponseTime),
      cacheHitRate: `${log.cacheHitRate.toFixed(1)}%`,
      cacheMissRate: `${log.cacheMissRate.toFixed(1)}%`,
      totalRequests: log.totalRequests,
      successRate: `${((log.successfulRequests / log.totalRequests) * 100).toFixed(1)}%`,
      timeWindow: formatDuration(log.timeWindow * 1000),
    });
  }

  /**
   * Calculate and log performance metrics for all endpoints
   */
  calculateAndLogPerformanceMetrics(timeWindowSeconds: number = 300): void {
    const now = Date.now();
    const windowStart = now - (timeWindowSeconds * 1000);

    // Filter recent requests
    const recentRequests = this.requestLogs.filter(log => log.timestamp >= windowStart);

    // Group by endpoint
    const endpointGroups = new Map<string, NewsRequestLog[]>();
    recentRequests.forEach(log => {
      if (!endpointGroups.has(log.endpoint)) {
        endpointGroups.set(log.endpoint, []);
      }
      endpointGroups.get(log.endpoint)!.push(log);
    });

    // Calculate metrics for each endpoint
    endpointGroups.forEach((requests, endpoint) => {
      if (requests.length === 0) return;

      const responseTimes = requests.map(r => r.responseTime).sort((a, b) => a - b);
      const successfulRequests = requests.filter(r => r.success).length;
      const cachedRequests = requests.filter(r => r.cached).length;

      const metrics: PerformanceMetricsLog = {
        timestamp: now,
        endpoint: endpoint as any,
        averageResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
        p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
        p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
        cacheHitRate: (cachedRequests / requests.length) * 100,
        cacheMissRate: ((requests.length - cachedRequests) / requests.length) * 100,
        totalRequests: requests.length,
        successfulRequests,
        failedRequests: requests.length - successfulRequests,
        timeWindow: timeWindowSeconds,
      };

      this.logPerformanceMetrics(metrics);
    });
  }

  // ============================================================================
  // Quota Usage Logging
  // ============================================================================

  /**
   * Log quota usage information
   */
  logQuotaUsage(log: QuotaUsageLog): void {
    this.quotaUsageLogs.push(log);

    this.logger.logConfig('NewsData quota usage', {
      component: 'newsdata',
      dailyQuotaLimit: log.dailyQuotaLimit,
      dailyQuotaUsed: log.dailyQuotaUsed,
      dailyQuotaRemaining: log.dailyQuotaRemaining,
      quotaUtilization: `${log.quotaUtilization.toFixed(1)}%`,
      rateLimitWindow: formatDuration(log.rateLimitWindow),
      rateLimitUsed: log.rateLimitUsed,
      rateLimitRemaining: log.rateLimitRemaining,
      rateLimitUtilization: `${log.rateLimitUtilization.toFixed(1)}%`,
      estimatedTimeToReset: formatDuration(log.estimatedTimeToReset),
    });

    // Check for quota alerts
    this.checkQuotaAlerts(log);
  }

  /**
   * Check for quota-related alerts
   */
  private checkQuotaAlerts(log: QuotaUsageLog): void {
    // Daily quota exhaustion warning
    if (log.quotaUtilization >= 90) {
      this.logAlert({
        timestamp: Date.now(),
        alertType: 'quota_exhaustion',
        severity: log.quotaUtilization >= 95 ? 'critical' : 'warning',
        message: `Daily quota utilization is ${log.quotaUtilization.toFixed(1)}%`,
        details: {
          dailyQuotaLimit: log.dailyQuotaLimit,
          dailyQuotaUsed: log.dailyQuotaUsed,
          dailyQuotaRemaining: log.dailyQuotaRemaining,
          quotaUtilization: log.quotaUtilization,
        },
        threshold: 90,
        currentValue: log.quotaUtilization,
        actionRequired: log.quotaUtilization >= 95,
        autoResolved: false,
      });
    }

    // Rate limit warning
    if (log.rateLimitUtilization >= 80) {
      this.logAlert({
        timestamp: Date.now(),
        alertType: 'rate_limit_exceeded',
        severity: log.rateLimitUtilization >= 90 ? 'error' : 'warning',
        message: `Rate limit utilization is ${log.rateLimitUtilization.toFixed(1)}%`,
        details: {
          rateLimitWindow: log.rateLimitWindow,
          rateLimitUsed: log.rateLimitUsed,
          rateLimitRemaining: log.rateLimitRemaining,
          rateLimitUtilization: log.rateLimitUtilization,
          estimatedTimeToReset: log.estimatedTimeToReset,
        },
        threshold: 80,
        currentValue: log.rateLimitUtilization,
        actionRequired: log.rateLimitUtilization >= 90,
        autoResolved: false,
      });
    }
  }

  // ============================================================================
  // Rate Limit Logging
  // ============================================================================

  /**
   * Log rate limit information
   */
  logRateLimit(log: RateLimitLog): void {
    this.rateLimitLogs.push(log);

    this.logger.logConfig('NewsData rate limit', {
      component: 'newsdata',
      endpoint: log.endpoint,
      requestsInWindow: log.requestsInWindow,
      windowSize: formatDuration(log.windowSizeMs),
      limitExceeded: log.limitExceeded,
      throttled: log.throttled,
      backoffTime: log.backoffTime ? formatDuration(log.backoffTime) : undefined,
      retryAfter: log.retryAfter ? formatDuration(log.retryAfter) : undefined,
    });

    // Log alert if rate limit exceeded
    if (log.limitExceeded) {
      this.logAlert({
        timestamp: Date.now(),
        alertType: 'rate_limit_exceeded',
        severity: 'error',
        message: `Rate limit exceeded for ${log.endpoint} endpoint`,
        details: {
          endpoint: log.endpoint,
          requestsInWindow: log.requestsInWindow,
          windowSizeMs: log.windowSizeMs,
          throttled: log.throttled,
          backoffTime: log.backoffTime,
          retryAfter: log.retryAfter,
        },
        actionRequired: true,
        autoResolved: false,
      });
    }
  }

  // ============================================================================
  // Cache Performance Logging
  // ============================================================================

  /**
   * Log cache performance information
   */
  logCachePerformance(log: CachePerformanceLog): void {
    this.cachePerformanceLogs.push(log);

    this.logger.logConfig('NewsData cache performance', {
      component: 'newsdata',
      operation: log.operation,
      cacheKey: log.cacheKey,
      hit: log.hit,
      stale: log.stale,
      ttl: formatDuration(log.ttl * 1000),
      size: log.size ? `${(log.size / 1024).toFixed(1)}KB` : undefined,
      totalKeys: log.totalKeys,
      memoryUsage: `${(log.memoryUsage / 1024 / 1024).toFixed(1)}MB`,
      hitRate: `${log.hitRate.toFixed(1)}%`,
      evictionCount: log.evictionCount,
    });

    // Check for cache performance alerts
    if (log.hitRate < 50 && log.totalKeys > 10) {
      this.logAlert({
        timestamp: Date.now(),
        alertType: 'cache_failure',
        severity: 'warning',
        message: `Low cache hit rate detected: ${log.hitRate.toFixed(1)}%`,
        details: {
          hitRate: log.hitRate,
          totalKeys: log.totalKeys,
          memoryUsage: log.memoryUsage,
          evictionCount: log.evictionCount,
        },
        threshold: 50,
        currentValue: log.hitRate,
        actionRequired: false,
        autoResolved: false,
      });
    }
  }

  // ============================================================================
  // Error Logging
  // ============================================================================

  /**
   * Log error with detailed context
   */
  logError(log: ErrorLog): void {
    this.errorLogs.push(log);

    this.logger.logError('NewsData error occurred', {
      component: 'newsdata',
      requestId: log.requestId,
      endpoint: log.endpoint,
      agentName: log.agentName,
      errorType: log.errorType,
      errorCode: log.errorCode,
      errorMessage: log.errorMessage,
      errorDetails: log.errorDetails,
      retryAttempt: log.retryAttempt,
      maxRetries: log.maxRetries,
      fallbackUsed: log.fallbackUsed,
      impactLevel: log.impactLevel,
      error: new Error(log.errorMessage),
    });

    // Log alert for high impact errors
    if (log.impactLevel === 'high' || log.impactLevel === 'critical') {
      this.logAlert({
        timestamp: Date.now(),
        alertType: log.errorType === 'circuit_breaker' ? 'circuit_breaker_open' : 'high_error_rate',
        severity: log.impactLevel === 'critical' ? 'critical' : 'error',
        message: `${log.impactLevel} impact error: ${log.errorMessage}`,
        details: {
          errorType: log.errorType,
          errorCode: log.errorCode,
          endpoint: log.endpoint,
          agentName: log.agentName,
          fallbackUsed: log.fallbackUsed,
        },
        actionRequired: log.impactLevel === 'critical',
        autoResolved: false,
      });
    }
  }

  // ============================================================================
  // Circuit Breaker Logging
  // ============================================================================

  /**
   * Log circuit breaker state change
   */
  logCircuitBreakerStateChange(log: CircuitBreakerLog): void {
    this.circuitBreakerLogs.push(log);

    this.logger.logConfig('NewsData circuit breaker state change', {
      component: 'newsdata',
      endpoint: log.endpoint,
      previousState: log.previousState,
      newState: log.newState,
      failureCount: log.failureCount,
      successCount: log.successCount,
      failureThreshold: log.failureThreshold,
      resetTimeout: formatDuration(log.resetTimeout),
      reason: log.reason,
    });

    // Log alert for circuit breaker opening
    if (log.newState === 'open') {
      this.logAlert({
        timestamp: Date.now(),
        alertType: 'circuit_breaker_open',
        severity: 'error',
        message: `Circuit breaker opened for ${log.endpoint} endpoint`,
        details: {
          endpoint: log.endpoint,
          failureCount: log.failureCount,
          failureThreshold: log.failureThreshold,
          resetTimeout: log.resetTimeout,
          reason: log.reason,
        },
        actionRequired: true,
        autoResolved: false,
      });
    }
  }

  // ============================================================================
  // Agent Usage Tracking
  // ============================================================================

  /**
   * Log agent usage statistics
   */
  logAgentUsage(log: AgentUsageLog): void {
    this.agentUsageLogs.push(log);

    this.logger.logConfig('NewsData agent usage', {
      component: 'newsdata',
      agentName: log.agentName,
      endpoint: log.endpoint,
      requestCount: log.requestCount,
      successRate: `${((log.successfulRequests / log.requestCount) * 100).toFixed(1)}%`,
      averageResponseTime: formatDuration(log.averageResponseTime),
      totalQuotaUsed: log.totalQuotaUsed,
      cacheHitRate: `${log.cacheHitRate.toFixed(1)}%`,
      usagePattern: log.usagePattern,
      preferredParameters: sanitizeLogData(log.preferredParameters),
    });
  }

  /**
   * Calculate and log agent usage statistics
   */
  calculateAndLogAgentUsage(timeWindowSeconds: number = 3600): void {
    const now = Date.now();
    const windowStart = now - (timeWindowSeconds * 1000);

    // Filter recent requests by agent
    const recentRequests = this.requestLogs.filter(log => 
      log.timestamp >= windowStart && log.agentName
    );

    // Group by agent and endpoint
    const agentEndpointGroups = new Map<string, Map<string, NewsRequestLog[]>>();
    recentRequests.forEach(log => {
      const agentName = log.agentName!;
      if (!agentEndpointGroups.has(agentName)) {
        agentEndpointGroups.set(agentName, new Map());
      }
      
      const agentEndpoints = agentEndpointGroups.get(agentName)!;
      if (!agentEndpoints.has(log.endpoint)) {
        agentEndpoints.set(log.endpoint, []);
      }
      
      agentEndpoints.get(log.endpoint)!.push(log);
    });

    // Calculate usage statistics for each agent-endpoint combination
    agentEndpointGroups.forEach((endpointGroups, agentName) => {
      endpointGroups.forEach((requests, endpoint) => {
        if (requests.length === 0) return;

        const successfulRequests = requests.filter(r => r.success).length;
        const cachedRequests = requests.filter(r => r.cached).length;
        const totalQuotaUsed = requests.reduce((sum, r) => sum + (r.quotaUsed || 0), 0);
        const averageResponseTime = requests.reduce((sum, r) => sum + r.responseTime, 0) / requests.length;

        // Determine usage pattern
        let usagePattern: 'frequent' | 'moderate' | 'occasional' | 'rare';
        const requestsPerHour = requests.length / (timeWindowSeconds / 3600);
        if (requestsPerHour >= 10) {
          usagePattern = 'frequent';
        } else if (requestsPerHour >= 3) {
          usagePattern = 'moderate';
        } else if (requestsPerHour >= 1) {
          usagePattern = 'occasional';
        } else {
          usagePattern = 'rare';
        }

        // Extract preferred parameters
        const parameterCounts = new Map<string, Map<any, number>>();
        requests.forEach(request => {
          Object.entries(request.parameters).forEach(([key, value]) => {
            if (!parameterCounts.has(key)) {
              parameterCounts.set(key, new Map());
            }
            const valueCounts = parameterCounts.get(key)!;
            const valueKey = JSON.stringify(value);
            valueCounts.set(valueKey, (valueCounts.get(valueKey) || 0) + 1);
          });
        });

        const preferredParameters: Record<string, any> = {};
        parameterCounts.forEach((valueCounts, key) => {
          let maxCount = 0;
          let mostUsedValue: any;
          valueCounts.forEach((count, valueKey) => {
            if (count > maxCount) {
              maxCount = count;
              mostUsedValue = JSON.parse(valueKey);
            }
          });
          if (maxCount > requests.length * 0.3) { // Used in >30% of requests
            preferredParameters[key] = mostUsedValue;
          }
        });

        const usageLog: AgentUsageLog = {
          timestamp: now,
          agentName,
          endpoint: endpoint as any,
          requestCount: requests.length,
          successfulRequests,
          failedRequests: requests.length - successfulRequests,
          averageResponseTime,
          totalQuotaUsed,
          cacheHitRate: (cachedRequests / requests.length) * 100,
          preferredParameters,
          usagePattern,
        };

        this.logAgentUsage(usageLog);
      });
    });
  }

  // ============================================================================
  // Alert Logging
  // ============================================================================

  /**
   * Log alert
   */
  logAlert(log: AlertLog): void {
    this.alertLogs.push(log);

    const logMethod = log.severity === 'critical' || log.severity === 'error' 
      ? this.logger.logError.bind(this.logger)
      : log.severity === 'warning'
      ? this.logger.logWarning.bind(this.logger)
      : this.logger.logConfig.bind(this.logger);

    logMethod(`NewsData alert: ${log.message}`, {
      component: 'newsdata',
      alertType: log.alertType,
      severity: log.severity,
      details: log.details,
      threshold: log.threshold,
      currentValue: log.currentValue,
      actionRequired: log.actionRequired,
      autoResolved: log.autoResolved,
      ...(log.severity === 'critical' || log.severity === 'error' ? { error: new Error(log.message) } : {}),
    });
  }

  // ============================================================================
  // Key Rotation Logging
  // ============================================================================

  /**
   * Log key rotation events
   */
  logKeyRotation(log: KeyRotationLog): void {
    this.keyRotationLogs.push(log);

    // Determine log level based on event type
    const logMethod = log.eventType === 'all_keys_exhausted' || log.eventType === 'graceful_degradation'
      ? this.logger.logError.bind(this.logger)
      : log.eventType === 'rate_limit_detected'
      ? this.logger.logWarning.bind(this.logger)
      : this.logger.logConfig.bind(this.logger);

    // Create log message
    let message = '';
    switch (log.eventType) {
      case 'rate_limit_detected':
        message = `Rate limit detected for key ${log.keyId}`;
        break;
      case 'key_rotated':
        message = `API key rotated: ${log.oldKeyId} -> ${log.newKeyId}`;
        break;
      case 'all_keys_exhausted':
        message = `All API keys exhausted`;
        break;
      case 'key_available':
        message = `Key ${log.keyId} rate limit expired, now available`;
        break;
      case 'graceful_degradation':
        message = `Graceful degradation: returning empty result set`;
        break;
    }

    logMethod(`NewsData key rotation: ${message}`, {
      component: 'newsdata',
      eventType: log.eventType,
      keyId: log.keyId,
      oldKeyId: log.oldKeyId,
      newKeyId: log.newKeyId,
      expiryTime: log.expiryTime,
      earliestExpiry: log.earliestExpiry,
      retryAfterSeconds: log.retryAfterSeconds,
      totalKeys: log.totalKeys,
      endpoint: log.endpoint,
      agentName: log.agentName,
      parameters: log.parameters ? sanitizeLogData(log.parameters) : undefined,
      reason: log.reason,
      message: log.message,
      ...(log.eventType === 'all_keys_exhausted' || log.eventType === 'graceful_degradation' 
        ? { error: new Error(message) } 
        : {}),
    });
  }

  /**
   * Get key rotation logs
   */
  getKeyRotationLogs(limit: number = 100): KeyRotationLog[] {
    return this.keyRotationLogs.slice(-limit);
  }

  // ============================================================================
  // Data Access Methods
  // ============================================================================

  /**
   * Get recent request logs
   */
  getRecentRequestLogs(limit: number = 100): NewsRequestLog[] {
    return this.requestLogs.slice(-limit);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(limit: number = 50): PerformanceMetricsLog[] {
    return this.performanceMetrics.slice(-limit);
  }

  /**
   * Get quota usage logs
   */
  getQuotaUsageLogs(limit: number = 50): QuotaUsageLog[] {
    return this.quotaUsageLogs.slice(-limit);
  }

  /**
   * Get error logs
   */
  getErrorLogs(limit: number = 100): ErrorLog[] {
    return this.errorLogs.slice(-limit);
  }

  /**
   * Get agent usage logs
   */
  getAgentUsageLogs(agentName?: string, limit: number = 50): AgentUsageLog[] {
    const logs = agentName 
      ? this.agentUsageLogs.filter(log => log.agentName === agentName)
      : this.agentUsageLogs;
    return logs.slice(-limit);
  }

  /**
   * Get alert logs
   */
  getAlertLogs(severity?: 'info' | 'warning' | 'error' | 'critical', limit: number = 50): AlertLog[] {
    const logs = severity 
      ? this.alertLogs.filter(log => log.severity === severity)
      : this.alertLogs;
    return logs.slice(-limit);
  }

  /**
   * Get comprehensive observability summary
   */
  getObservabilitySummary(timeWindowSeconds: number = 3600): {
    timeWindow: number;
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    cacheHitRate: number;
    quotaUtilization: number;
    activeAlerts: number;
    topAgents: Array<{ agentName: string; requestCount: number }>;
    endpointStats: Array<{ endpoint: string; requests: number; successRate: number }>;
  } {
    const now = Date.now();
    const windowStart = now - (timeWindowSeconds * 1000);

    // Filter recent data
    const recentRequests = this.requestLogs.filter(log => log.timestamp >= windowStart);
    const recentAlerts = this.alertLogs.filter(log => log.timestamp >= windowStart && !log.autoResolved);
    const latestQuotaLog = this.quotaUsageLogs[this.quotaUsageLogs.length - 1];

    // Calculate summary statistics
    const totalRequests = recentRequests.length;
    const successfulRequests = recentRequests.filter(r => r.success).length;
    const cachedRequests = recentRequests.filter(r => r.cached).length;
    const totalResponseTime = recentRequests.reduce((sum, r) => sum + r.responseTime, 0);

    // Agent statistics
    const agentCounts = new Map<string, number>();
    recentRequests.forEach(request => {
      if (request.agentName) {
        agentCounts.set(request.agentName, (agentCounts.get(request.agentName) || 0) + 1);
      }
    });
    const topAgents = Array.from(agentCounts.entries())
      .map(([agentName, requestCount]) => ({ agentName, requestCount }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 5);

    // Endpoint statistics
    const endpointCounts = new Map<string, { total: number; successful: number }>();
    recentRequests.forEach(request => {
      if (!endpointCounts.has(request.endpoint)) {
        endpointCounts.set(request.endpoint, { total: 0, successful: 0 });
      }
      const stats = endpointCounts.get(request.endpoint)!;
      stats.total++;
      if (request.success) {
        stats.successful++;
      }
    });
    const endpointStats = Array.from(endpointCounts.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        requests: stats.total,
        successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
      }))
      .sort((a, b) => b.requests - a.requests);

    return {
      timeWindow: timeWindowSeconds,
      totalRequests,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      cacheHitRate: totalRequests > 0 ? (cachedRequests / totalRequests) * 100 : 0,
      quotaUtilization: latestQuotaLog?.quotaUtilization || 0,
      activeAlerts: recentAlerts.length,
      topAgents,
      endpointStats,
    };
  }

  /**
   * Clear old logs to prevent memory leaks
   */
  clearOldLogs(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;

    this.requestLogs = this.requestLogs.filter(log => log.timestamp >= cutoff);
    this.performanceMetrics = this.performanceMetrics.filter(log => log.timestamp >= cutoff);
    this.quotaUsageLogs = this.quotaUsageLogs.filter(log => log.timestamp >= cutoff);
    this.rateLimitLogs = this.rateLimitLogs.filter(log => log.timestamp >= cutoff);
    this.cachePerformanceLogs = this.cachePerformanceLogs.filter(log => log.timestamp >= cutoff);
    this.errorLogs = this.errorLogs.filter(log => log.timestamp >= cutoff);
    this.circuitBreakerLogs = this.circuitBreakerLogs.filter(log => log.timestamp >= cutoff);
    this.agentUsageLogs = this.agentUsageLogs.filter(log => log.timestamp >= cutoff);
    this.alertLogs = this.alertLogs.filter(log => log.timestamp >= cutoff);
    this.keyRotationLogs = this.keyRotationLogs.filter(log => log.timestamp >= cutoff);

    this.logger.logConfig('NewsData observability logs cleaned up', {
      component: 'newsdata',
      cutoffTime: new Date(cutoff).toISOString(),
      maxAge: formatDuration(maxAge),
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData observability logger instance
 */
export function createNewsDataObservabilityLogger(logger?: MonitorLogger): NewsDataObservabilityLogger {
  return new NewsDataObservabilityLogger(logger);
}

/**
 * Global instance for convenience
 */
let globalNewsDataLogger: NewsDataObservabilityLogger | null = null;

/**
 * Get the global NewsData observability logger
 */
export function getNewsDataObservabilityLogger(): NewsDataObservabilityLogger {
  if (!globalNewsDataLogger) {
    globalNewsDataLogger = createNewsDataObservabilityLogger();
  }
  return globalNewsDataLogger;
}

/**
 * Initialize the global NewsData observability logger
 */
export function initializeNewsDataObservabilityLogger(logger?: MonitorLogger): NewsDataObservabilityLogger {
  globalNewsDataLogger = createNewsDataObservabilityLogger(logger);
  return globalNewsDataLogger;
}