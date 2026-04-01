/**
 * NewsData Performance Monitor
 * 
 * Comprehensive performance monitoring for NewsData.io integration including
 * response time tracking, memory usage monitoring, and throughput metrics.
 * 
 * Requirements: 8.1, 8.2
 */

import { getLogger } from './logger.js';
import type { NewsDataCacheManager } from './newsdata-cache-manager.js';
import type { NewsDataRateLimiter } from './newsdata-rate-limiter.js';

// ============================================================================
// Performance Metrics Types
// ============================================================================

export interface ResponseTimeMetrics {
  endpoint: string;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutRequests: number;
}

export interface MemoryMetrics {
  totalMemoryUsage: number; // bytes
  cacheMemoryUsage: number; // bytes
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  external: number; // bytes
  rss: number; // bytes (Resident Set Size)
  arrayBuffers: number; // bytes
  cacheHitRate: number; // percentage
  cacheMissRate: number; // percentage
  cacheCompressionRatio: number; // percentage
}

export interface ThroughputMetrics {
  endpoint: string;
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  bytesPerSecond: number;
  articlesPerSecond: number;
  peakThroughput: number;
  averageThroughput: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  responseTime: ResponseTimeMetrics[];
  memory: MemoryMetrics;
  throughput: ThroughputMetrics[];
  rateLimiting: {
    bucketsStatus: Array<{
      bucket: string;
      tokensAvailable: number;
      quotaUsage: number;
      queueSize: number;
      averageWaitTime: number;
    }>;
  };
  errors: {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorRate: number;
  };
}

export interface PerformanceAlert {
  type: 'response_time' | 'memory' | 'throughput' | 'error_rate' | 'cache_performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  endpoint?: string;
}

// ============================================================================
// Performance Thresholds Configuration
// ============================================================================

export interface PerformanceThresholds {
  responseTime: {
    warning: number; // ms
    critical: number; // ms
  };
  memory: {
    warning: number; // bytes
    critical: number; // bytes
  };
  throughput: {
    minimum: number; // requests per second
    warning: number; // requests per second
  };
  errorRate: {
    warning: number; // percentage
    critical: number; // percentage
  };
  cacheHitRate: {
    minimum: number; // percentage
    warning: number; // percentage
  };
}

// ============================================================================
// Performance Monitor Implementation
// ============================================================================

export class NewsDataPerformanceMonitor {
  private responseTimeSamples: Map<string, number[]> = new Map();
  private throughputCounters: Map<string, { count: number; bytes: number; articles: number; windowStart: number }> = new Map();
  private errorCounters: Map<string, number> = new Map();
  private totalRequests = 0;
  private totalErrors = 0;
  private logger;
  private monitoringInterval?: NodeJS.Timeout;
  private alertCallbacks: Array<(alert: PerformanceAlert) => void> = [];

  constructor(
    private cacheManager?: NewsDataCacheManager,
    private rateLimiter?: NewsDataRateLimiter,
    private thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS,
    private monitoringIntervalMs: number = 60000 // 1 minute
  ) {
    this.logger = getLogger();
    this.startMonitoring();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collectAndAnalyzeMetrics();
    }, this.monitoringIntervalMs);

    this.logger.info('NewsData performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.logger.info('NewsData performance monitoring stopped');
  }

  /**
   * Record response time for an endpoint
   */
  recordResponseTime(endpoint: string, responseTime: number, success: boolean, timeout: boolean = false): void {
    // Update response time samples
    if (!this.responseTimeSamples.has(endpoint)) {
      this.responseTimeSamples.set(endpoint, []);
    }

    const samples = this.responseTimeSamples.get(endpoint)!;
    samples.push(responseTime);

    // Keep only last 1000 samples to prevent memory bloat
    if (samples.length > 1000) {
      samples.splice(0, samples.length - 1000);
    }

    // Update counters
    this.totalRequests++;
    if (!success) {
      this.totalErrors++;
      const errorKey = timeout ? 'timeout' : 'error';
      this.errorCounters.set(errorKey, (this.errorCounters.get(errorKey) || 0) + 1);
    }

    // Check response time thresholds
    if (responseTime > this.thresholds.responseTime.critical) {
      this.emitAlert({
        type: 'response_time',
        severity: 'critical',
        message: `Critical response time detected for ${endpoint}`,
        value: responseTime,
        threshold: this.thresholds.responseTime.critical,
        timestamp: Date.now(),
        endpoint,
      });
    } else if (responseTime > this.thresholds.responseTime.warning) {
      this.emitAlert({
        type: 'response_time',
        severity: 'medium',
        message: `High response time detected for ${endpoint}`,
        value: responseTime,
        threshold: this.thresholds.responseTime.warning,
        timestamp: Date.now(),
        endpoint,
      });
    }
  }

  /**
   * Record throughput metrics
   */
  recordThroughput(endpoint: string, bytes: number, articleCount: number): void {
    const now = Date.now();
    
    if (!this.throughputCounters.has(endpoint)) {
      this.throughputCounters.set(endpoint, {
        count: 0,
        bytes: 0,
        articles: 0,
        windowStart: now,
      });
    }

    const counter = this.throughputCounters.get(endpoint)!;
    counter.count++;
    counter.bytes += bytes;
    counter.articles += articleCount;

    // Reset counter every minute
    if (now - counter.windowStart > 60000) {
      counter.count = 1;
      counter.bytes = bytes;
      counter.articles = articleCount;
      counter.windowStart = now;
    }
  }

  /**
   * Get current memory metrics
   */
  async getMemoryMetrics(): Promise<MemoryMetrics> {
    const memUsage = process.memoryUsage();
    
    let cacheMemoryUsage = 0;
    let cacheHitRate = 0;
    let cacheMissRate = 0;
    let cacheCompressionRatio = 0;

    if (this.cacheManager) {
      const cacheStats = await this.cacheManager.getStats();
      const memoryBreakdown = await this.cacheManager.getMemoryBreakdown();
      
      cacheMemoryUsage = memoryBreakdown.totalMemory;
      cacheHitRate = cacheStats.hitRate * 100;
      cacheMissRate = cacheStats.missRate * 100;
      
      if (memoryBreakdown.compressionStats) {
        cacheCompressionRatio = memoryBreakdown.compressionStats.compressionRatio * 100;
      }
    }

    const metrics: MemoryMetrics = {
      totalMemoryUsage: memUsage.rss,
      cacheMemoryUsage,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      cacheHitRate,
      cacheMissRate,
      cacheCompressionRatio,
    };

    // Check memory thresholds
    if (memUsage.rss > this.thresholds.memory.critical) {
      this.emitAlert({
        type: 'memory',
        severity: 'critical',
        message: 'Critical memory usage detected',
        value: memUsage.rss,
        threshold: this.thresholds.memory.critical,
        timestamp: Date.now(),
      });
    } else if (memUsage.rss > this.thresholds.memory.warning) {
      this.emitAlert({
        type: 'memory',
        severity: 'medium',
        message: 'High memory usage detected',
        value: memUsage.rss,
        threshold: this.thresholds.memory.warning,
        timestamp: Date.now(),
      });
    }

    // Check cache performance
    if (cacheHitRate < this.thresholds.cacheHitRate.minimum) {
      this.emitAlert({
        type: 'cache_performance',
        severity: 'high',
        message: 'Low cache hit rate detected',
        value: cacheHitRate,
        threshold: this.thresholds.cacheHitRate.minimum,
        timestamp: Date.now(),
      });
    }

    return metrics;
  }

  /**
   * Get response time metrics for an endpoint
   */
  getResponseTimeMetrics(endpoint: string): ResponseTimeMetrics | null {
    const samples = this.responseTimeSamples.get(endpoint);
    if (!samples || samples.length === 0) {
      return null;
    }

    const sortedSamples = [...samples].sort((a, b) => a - b);
    const totalRequests = samples.length;
    const successfulRequests = totalRequests; // Assuming all recorded samples are from successful requests
    const failedRequests = 0; // Would need separate tracking
    const timeoutRequests = 0; // Would need separate tracking

    return {
      endpoint,
      averageResponseTime: samples.reduce((sum, time) => sum + time, 0) / samples.length,
      minResponseTime: sortedSamples[0],
      maxResponseTime: sortedSamples[sortedSamples.length - 1],
      p50ResponseTime: sortedSamples[Math.floor(sortedSamples.length * 0.5)],
      p95ResponseTime: sortedSamples[Math.floor(sortedSamples.length * 0.95)],
      p99ResponseTime: sortedSamples[Math.floor(sortedSamples.length * 0.99)],
      totalRequests,
      successfulRequests,
      failedRequests,
      timeoutRequests,
    };
  }

  /**
   * Get throughput metrics for an endpoint
   */
  getThroughputMetrics(endpoint: string): ThroughputMetrics | null {
    const counter = this.throughputCounters.get(endpoint);
    if (!counter) {
      return null;
    }

    const now = Date.now();
    const windowDuration = (now - counter.windowStart) / 1000; // seconds

    if (windowDuration === 0) {
      return null;
    }

    const requestsPerSecond = counter.count / windowDuration;
    const bytesPerSecond = counter.bytes / windowDuration;
    const articlesPerSecond = counter.articles / windowDuration;

    return {
      endpoint,
      requestsPerSecond,
      requestsPerMinute: requestsPerSecond * 60,
      requestsPerHour: requestsPerSecond * 3600,
      bytesPerSecond,
      articlesPerSecond,
      peakThroughput: requestsPerSecond, // Would need historical tracking for actual peak
      averageThroughput: requestsPerSecond, // Would need historical tracking for actual average
    };
  }

  /**
   * Get comprehensive performance snapshot
   */
  async getPerformanceSnapshot(): Promise<PerformanceSnapshot> {
    const timestamp = Date.now();
    
    // Collect response time metrics for all endpoints
    const responseTimeMetrics: ResponseTimeMetrics[] = [];
    for (const endpoint of this.responseTimeSamples.keys()) {
      const metrics = this.getResponseTimeMetrics(endpoint);
      if (metrics) {
        responseTimeMetrics.push(metrics);
      }
    }

    // Collect throughput metrics for all endpoints
    const throughputMetrics: ThroughputMetrics[] = [];
    for (const endpoint of this.throughputCounters.keys()) {
      const metrics = this.getThroughputMetrics(endpoint);
      if (metrics) {
        throughputMetrics.push(metrics);
      }
    }

    // Get memory metrics
    const memoryMetrics = await this.getMemoryMetrics();

    // Get rate limiting status
    const rateLimitingStatus = {
      bucketsStatus: this.rateLimiter ? this.rateLimiter.getAllBucketStatus().map(status => ({
        bucket: status.bucket,
        tokensAvailable: status.tokensAvailable,
        quotaUsage: status.quotaPercentage,
        queueSize: this.rateLimiter!.getQueueStats(status.bucket)?.queueSize || 0,
        averageWaitTime: this.rateLimiter!.getQueueStats(status.bucket)?.averageWaitTime || 0,
      })) : [],
    };

    // Calculate error metrics
    const totalErrors = Array.from(this.errorCounters.values()).reduce((sum, count) => sum + count, 0);
    const errorRate = this.totalRequests > 0 ? (totalErrors / this.totalRequests) * 100 : 0;

    const errorsByType: Record<string, number> = {};
    this.errorCounters.forEach((count, type) => {
      errorsByType[type] = count;
    });

    return {
      timestamp,
      responseTime: responseTimeMetrics,
      memory: memoryMetrics,
      throughput: throughputMetrics,
      rateLimiting: rateLimitingStatus,
      errors: {
        totalErrors,
        errorsByType,
        errorRate,
      },
    };
  }

  /**
   * Collect and analyze metrics periodically
   */
  private async collectAndAnalyzeMetrics(): Promise<void> {
    try {
      const snapshot = await this.getPerformanceSnapshot();
      
      // Log performance summary
      this.logger.info({
        timestamp: snapshot.timestamp,
        totalRequests: this.totalRequests,
        errorRate: `${snapshot.errors.errorRate.toFixed(2)}%`,
        memoryUsage: `${(snapshot.memory.rss / 1024 / 1024).toFixed(2)} MB`,
        cacheHitRate: `${snapshot.memory.cacheHitRate.toFixed(2)}%`,
        avgResponseTime: snapshot.responseTime.length > 0 
          ? `${snapshot.responseTime[0].averageResponseTime.toFixed(2)}ms` 
          : 'N/A',
      }, 'NewsData Performance Summary');

      // Check for performance issues
      this.analyzePerformanceIssues(snapshot);

    } catch (error) {
      this.logger.error(`Error collecting performance metrics: ${error}`);
    }
  }

  /**
   * Analyze performance snapshot for issues
   */
  private analyzePerformanceIssues(snapshot: PerformanceSnapshot): void {
    // Check error rate
    if (snapshot.errors.errorRate > this.thresholds.errorRate.critical) {
      this.emitAlert({
        type: 'error_rate',
        severity: 'critical',
        message: 'Critical error rate detected',
        value: snapshot.errors.errorRate,
        threshold: this.thresholds.errorRate.critical,
        timestamp: snapshot.timestamp,
      });
    } else if (snapshot.errors.errorRate > this.thresholds.errorRate.warning) {
      this.emitAlert({
        type: 'error_rate',
        severity: 'medium',
        message: 'High error rate detected',
        value: snapshot.errors.errorRate,
        threshold: this.thresholds.errorRate.warning,
        timestamp: snapshot.timestamp,
      });
    }

    // Check throughput
    for (const throughput of snapshot.throughput) {
      if (throughput.requestsPerSecond < this.thresholds.throughput.minimum) {
        this.emitAlert({
          type: 'throughput',
          severity: 'medium',
          message: `Low throughput detected for ${throughput.endpoint}`,
          value: throughput.requestsPerSecond,
          threshold: this.thresholds.throughput.minimum,
          timestamp: snapshot.timestamp,
          endpoint: throughput.endpoint,
        });
      }
    }
  }

  /**
   * Add alert callback
   */
  onAlert(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Emit performance alert
   */
  private emitAlert(alert: PerformanceAlert): void {
    this.logger.warn({
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold,
      endpoint: alert.endpoint,
    }, 'Performance Alert');

    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        this.logger.error(`Error in alert callback: ${error}`);
      }
    });
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.responseTimeSamples.clear();
    this.throughputCounters.clear();
    this.errorCounters.clear();
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.logger.info('Performance metrics reset');
  }

  /**
   * Get performance report
   */
  async getPerformanceReport(): Promise<{
    summary: {
      totalRequests: number;
      totalErrors: number;
      errorRate: number;
      monitoringDuration: number;
    };
    endpoints: Array<{
      endpoint: string;
      responseTime: ResponseTimeMetrics;
      throughput: ThroughputMetrics;
    }>;
    memory: MemoryMetrics;
    alerts: PerformanceAlert[];
  }> {
    const snapshot = await this.getPerformanceSnapshot();
    
    const endpoints = [];
    for (const endpoint of this.responseTimeSamples.keys()) {
      const responseTime = this.getResponseTimeMetrics(endpoint);
      const throughput = this.getThroughputMetrics(endpoint);
      
      if (responseTime && throughput) {
        endpoints.push({
          endpoint,
          responseTime,
          throughput,
        });
      }
    }

    return {
      summary: {
        totalRequests: this.totalRequests,
        totalErrors: this.totalErrors,
        errorRate: snapshot.errors.errorRate,
        monitoringDuration: this.monitoringIntervalMs,
      },
      endpoints,
      memory: snapshot.memory,
      alerts: [], // Would need to store alerts for reporting
    };
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  responseTime: {
    warning: 2000, // 2 seconds
    critical: 5000, // 5 seconds
  },
  memory: {
    warning: 512 * 1024 * 1024, // 512 MB
    critical: 1024 * 1024 * 1024, // 1 GB
  },
  throughput: {
    minimum: 0.1, // 0.1 requests per second
    warning: 1, // 1 request per second
  },
  errorRate: {
    warning: 5, // 5%
    critical: 10, // 10%
  },
  cacheHitRate: {
    minimum: 50, // 50%
    warning: 70, // 70%
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData performance monitor instance
 */
export function createNewsDataPerformanceMonitor(
  cacheManager?: NewsDataCacheManager,
  rateLimiter?: NewsDataRateLimiter,
  thresholds?: Partial<PerformanceThresholds>,
  monitoringIntervalMs?: number
): NewsDataPerformanceMonitor {
  const mergedThresholds = {
    ...DEFAULT_PERFORMANCE_THRESHOLDS,
    ...thresholds,
  };

  return new NewsDataPerformanceMonitor(
    cacheManager,
    rateLimiter,
    mergedThresholds,
    monitoringIntervalMs
  );
}