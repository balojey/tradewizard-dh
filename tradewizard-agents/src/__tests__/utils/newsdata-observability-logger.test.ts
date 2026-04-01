/**
 * Unit tests for NewsData.io Observability Logger
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import type { MonitorLogger } from './logger.js';

// Mock logger
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

describe('NewsDataObservabilityLogger', () => {
  let logger: NewsDataObservabilityLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new NewsDataObservabilityLogger(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('News Request Logging', () => {
    it('should log successful news requests', () => {
      const requestLog = {
        timestamp: Date.now(),
        requestId: 'req_123',
        endpoint: 'latest' as const,
        agentName: 'test-agent',
        parameters: { q: 'test', size: 10 },
        success: true,
        responseTime: 1500,
        itemCount: 5,
        cached: false,
        stale: false,
        freshness: 0,
        quotaUsed: 1,
      };

      logger.logNewsRequest(requestLog);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData request completed',
        expect.objectContaining({
          component: 'newsdata',
          requestId: 'req_123',
          endpoint: 'latest',
          agentName: 'test-agent',
          success: true,
          responseTime: '1.50s',
          itemCount: 5,
          cached: false,
          stale: false,
          quotaUsed: 1,
        })
      );
    });

    it('should log failed news requests', () => {
      const requestLog = {
        timestamp: Date.now(),
        requestId: 'req_456',
        endpoint: 'crypto' as const,
        agentName: 'crypto-agent',
        parameters: { coin: ['btc'] },
        success: false,
        responseTime: 5000,
        itemCount: 0,
        cached: false,
        stale: false,
        freshness: 0,
        error: 'Rate limit exceeded',
        errorCode: 'RATE_LIMIT_ERROR',
        quotaUsed: 0,
      };

      logger.logNewsRequest(requestLog);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData request completed',
        expect.objectContaining({
          component: 'newsdata',
          requestId: 'req_456',
          endpoint: 'crypto',
          agentName: 'crypto-agent',
          success: false,
          error: 'Rate limit exceeded',
          errorCode: 'RATE_LIMIT_ERROR',
        })
      );
    });

    it('should sanitize sensitive parameters', () => {
      const requestLog = {
        timestamp: Date.now(),
        requestId: 'req_789',
        endpoint: 'latest' as const,
        parameters: { apikey: 'secret123', q: 'test' },
        success: true,
        responseTime: 1000,
        itemCount: 3,
        cached: false,
        stale: false,
        freshness: 0,
      };

      logger.logNewsRequest(requestLog);

      const recentLogs = logger.getRecentRequestLogs(1);
      expect(recentLogs[0].parameters.apikey).toBe('***REDACTED***');
      expect(recentLogs[0].parameters.q).toBe('test');
    });
  });

  describe('Performance Metrics Logging', () => {
    it('should log performance metrics', () => {
      const metricsLog = {
        timestamp: Date.now(),
        endpoint: 'latest' as const,
        averageResponseTime: 2000,
        p95ResponseTime: 3500,
        p99ResponseTime: 5000,
        cacheHitRate: 75.5,
        cacheMissRate: 24.5,
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        timeWindow: 300,
      };

      logger.logPerformanceMetrics(metricsLog);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData performance metrics',
        expect.objectContaining({
          component: 'newsdata',
          endpoint: 'latest',
          averageResponseTime: '2.00s',
          p95ResponseTime: '3.50s',
          p99ResponseTime: '5.00s',
          cacheHitRate: '75.5%',
          cacheMissRate: '24.5%',
          totalRequests: 100,
          successRate: '95.0%',
          timeWindow: '5.00m',
        })
      );
    });

    it('should calculate and log performance metrics from request history', () => {
      // Add some request logs
      const baseTime = Date.now();
      for (let i = 0; i < 10; i++) {
        logger.logNewsRequest({
          timestamp: baseTime - (i * 1000),
          requestId: `req_${i}`,
          endpoint: 'latest',
          parameters: {},
          success: i < 8, // 80% success rate
          responseTime: 1000 + (i * 100),
          itemCount: 5,
          cached: i % 3 === 0, // 33% cache hit rate
          stale: false,
          freshness: 0,
        });
      }

      logger.calculateAndLogPerformanceMetrics(300); // 5 minutes

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData performance metrics',
        expect.objectContaining({
          component: 'newsdata',
          endpoint: 'latest',
          totalRequests: 10,
        })
      );
    });
  });

  describe('Quota Usage Logging', () => {
    it('should log quota usage information', () => {
      const quotaLog = {
        timestamp: Date.now(),
        dailyQuotaLimit: 1000,
        dailyQuotaUsed: 750,
        dailyQuotaRemaining: 250,
        quotaUtilization: 75.0,
        rateLimitWindow: 900000, // 15 minutes
        rateLimitUsed: 45,
        rateLimitRemaining: 15,
        rateLimitUtilization: 75.0,
        estimatedTimeToReset: 3600000, // 1 hour
      };

      logger.logQuotaUsage(quotaLog);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData quota usage',
        expect.objectContaining({
          component: 'newsdata',
          dailyQuotaLimit: 1000,
          dailyQuotaUsed: 750,
          dailyQuotaRemaining: 250,
          quotaUtilization: '75.0%',
          rateLimitWindow: '15.00m',
          rateLimitUsed: 45,
          rateLimitRemaining: 15,
          rateLimitUtilization: '75.0%',
          estimatedTimeToReset: '1.00h',
        })
      );
    });

    it('should trigger quota exhaustion alert when threshold exceeded', () => {
      const quotaLog = {
        timestamp: Date.now(),
        dailyQuotaLimit: 1000,
        dailyQuotaUsed: 950,
        dailyQuotaRemaining: 50,
        quotaUtilization: 95.0,
        rateLimitWindow: 900000,
        rateLimitUsed: 45,
        rateLimitRemaining: 15,
        rateLimitUtilization: 75.0,
        estimatedTimeToReset: 3600000,
      };

      logger.logQuotaUsage(quotaLog);

      // Should trigger alert
      const alerts = logger.getAlertLogs();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].alertType).toBe('quota_exhaustion');
      expect(alerts[0].severity).toBe('critical');
    });
  });

  describe('Error Logging', () => {
    it('should log errors with detailed context', () => {
      const errorLog = {
        timestamp: Date.now(),
        requestId: 'req_error',
        endpoint: 'market' as const,
        agentName: 'market-agent',
        errorType: 'api' as const,
        errorCode: 'INVALID_API_KEY',
        errorMessage: 'API key is invalid',
        errorDetails: { status: 401, response: 'Unauthorized' },
        retryAttempt: 1,
        maxRetries: 3,
        fallbackUsed: false,
        impactLevel: 'critical' as const,
      };

      logger.logError(errorLog);

      expect(mockLogger.logError).toHaveBeenCalledWith(
        'NewsData error occurred',
        expect.objectContaining({
          component: 'newsdata',
          requestId: 'req_error',
          endpoint: 'market',
          agentName: 'market-agent',
          errorType: 'api',
          errorCode: 'INVALID_API_KEY',
          errorMessage: 'API key is invalid',
          impactLevel: 'critical',
          error: expect.any(Error),
        })
      );
    });

    it('should trigger alert for high impact errors', () => {
      const errorLog = {
        timestamp: Date.now(),
        errorType: 'api' as const,
        errorCode: 'CRITICAL_ERROR',
        errorMessage: 'Critical system failure',
        fallbackUsed: false,
        impactLevel: 'critical' as const,
      };

      logger.logError(errorLog);

      const alerts = logger.getAlertLogs();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].actionRequired).toBe(true);
    });
  });

  describe('Circuit Breaker Logging', () => {
    it('should log circuit breaker state changes', () => {
      const stateChangeLog = {
        timestamp: Date.now(),
        endpoint: 'crypto' as const,
        previousState: 'closed' as const,
        newState: 'open' as const,
        failureCount: 5,
        successCount: 0,
        failureThreshold: 5,
        resetTimeout: 60000,
        reason: 'Failure threshold exceeded',
      };

      logger.logCircuitBreakerStateChange(stateChangeLog);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData circuit breaker state change',
        expect.objectContaining({
          component: 'newsdata',
          endpoint: 'crypto',
          previousState: 'closed',
          newState: 'open',
          failureCount: 5,
          successCount: 0,
          failureThreshold: 5,
          resetTimeout: '1.00m',
          reason: 'Failure threshold exceeded',
        })
      );
    });

    it('should trigger alert when circuit breaker opens', () => {
      const stateChangeLog = {
        timestamp: Date.now(),
        endpoint: 'latest' as const,
        previousState: 'closed' as const,
        newState: 'open' as const,
        failureCount: 5,
        successCount: 0,
        failureThreshold: 5,
        resetTimeout: 60000,
        reason: 'Too many failures',
      };

      logger.logCircuitBreakerStateChange(stateChangeLog);

      const alerts = logger.getAlertLogs();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].alertType).toBe('circuit_breaker_open');
      expect(alerts[0].severity).toBe('error');
    });
  });

  describe('Cache Performance Logging', () => {
    it('should log cache operations', () => {
      const cacheLog = {
        timestamp: Date.now(),
        operation: 'get' as const,
        cacheKey: 'latest:test-query',
        hit: true,
        stale: false,
        ttl: 900,
        size: 1024,
        totalKeys: 50,
        memoryUsage: 1048576, // 1MB
        hitRate: 85.5,
        evictionCount: 2,
      };

      logger.logCachePerformance(cacheLog);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData cache performance',
        expect.objectContaining({
          component: 'newsdata',
          operation: 'get',
          cacheKey: 'latest:test-query',
          hit: true,
          stale: false,
          ttl: '15.00m',
          size: '1.0KB',
          totalKeys: 50,
          memoryUsage: '1.0MB',
          hitRate: '85.5%',
          evictionCount: 2,
        })
      );
    });

    it('should trigger alert for low cache hit rate', () => {
      const cacheLog = {
        timestamp: Date.now(),
        operation: 'get' as const,
        cacheKey: 'test-key',
        hit: false,
        stale: false,
        ttl: 900,
        totalKeys: 20,
        memoryUsage: 1048576,
        hitRate: 25.0, // Low hit rate
        evictionCount: 0,
      };

      logger.logCachePerformance(cacheLog);

      const alerts = logger.getAlertLogs();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].alertType).toBe('cache_failure');
      expect(alerts[0].severity).toBe('warning');
    });
  });

  describe('Agent Usage Logging', () => {
    it('should log agent usage statistics', () => {
      const usageLog = {
        timestamp: Date.now(),
        agentName: 'test-agent',
        endpoint: 'latest' as const,
        requestCount: 50,
        successfulRequests: 45,
        failedRequests: 5,
        averageResponseTime: 2000,
        totalQuotaUsed: 50,
        cacheHitRate: 60.0,
        preferredParameters: { size: 10, language: 'en' },
        usagePattern: 'moderate' as const,
      };

      logger.logAgentUsage(usageLog);

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'NewsData agent usage',
        expect.objectContaining({
          component: 'newsdata',
          agentName: 'test-agent',
          endpoint: 'latest',
          requestCount: 50,
          successRate: '90.0%',
          averageResponseTime: '2.00s',
          totalQuotaUsed: 50,
          cacheHitRate: '60.0%',
          usagePattern: 'moderate',
        })
      );
    });

    it('should calculate and log agent usage from request history', () => {
      // Add some requests from different agents
      const baseTime = Date.now();
      const agents = ['agent1', 'agent2', 'agent3'];
      
      agents.forEach((agentName, agentIndex) => {
        for (let i = 0; i < 5; i++) {
          logger.logNewsRequest({
            timestamp: baseTime - (i * 1000),
            requestId: `req_${agentIndex}_${i}`,
            endpoint: 'latest',
            agentName,
            parameters: { size: 10 },
            success: true,
            responseTime: 1000 + (agentIndex * 500),
            itemCount: 5,
            cached: i % 2 === 0,
            stale: false,
            freshness: 0,
            quotaUsed: 1,
          });
        }
      });

      logger.calculateAndLogAgentUsage(3600); // 1 hour

      // Should log usage for each agent
      expect(mockLogger.logConfig).toHaveBeenCalledTimes(agents.length);
    });
  });

  describe('Alert Management', () => {
    it('should log alerts with proper severity', () => {
      const alertLog = {
        timestamp: Date.now(),
        alertType: 'high_error_rate' as const,
        severity: 'warning' as const,
        message: 'Error rate is above threshold',
        details: { errorRate: 25, threshold: 20 },
        threshold: 20,
        currentValue: 25,
        actionRequired: false,
        autoResolved: false,
      };

      logger.logAlert(alertLog);

      expect(mockLogger.logWarning).toHaveBeenCalledWith(
        'NewsData alert: Error rate is above threshold',
        expect.objectContaining({
          component: 'newsdata',
          alertType: 'high_error_rate',
          severity: 'warning',
          details: { errorRate: 25, threshold: 20 },
          threshold: 20,
          currentValue: 25,
          actionRequired: false,
          autoResolved: false,
        })
      );
    });

    it('should use error logging for critical alerts', () => {
      const alertLog = {
        timestamp: Date.now(),
        alertType: 'quota_exhaustion' as const,
        severity: 'critical' as const,
        message: 'Daily quota exhausted',
        details: { quotaUsed: 1000, quotaLimit: 1000 },
        actionRequired: true,
        autoResolved: false,
      };

      logger.logAlert(alertLog);

      expect(mockLogger.logError).toHaveBeenCalledWith(
        'NewsData alert: Daily quota exhausted',
        expect.objectContaining({
          component: 'newsdata',
          alertType: 'quota_exhaustion',
          severity: 'critical',
          actionRequired: true,
          error: expect.any(Error),
        })
      );
    });
  });

  describe('Data Access Methods', () => {
    beforeEach(() => {
      // Add some test data
      logger.logNewsRequest({
        timestamp: Date.now(),
        requestId: 'req_1',
        endpoint: 'latest',
        parameters: {},
        success: true,
        responseTime: 1000,
        itemCount: 5,
        cached: false,
        stale: false,
        freshness: 0,
      });

      logger.logError({
        timestamp: Date.now(),
        errorType: 'api',
        errorCode: 'TEST_ERROR',
        errorMessage: 'Test error',
        fallbackUsed: false,
        impactLevel: 'low',
      });
    });

    it('should return recent request logs', () => {
      const logs = logger.getRecentRequestLogs(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].requestId).toBe('req_1');
    });

    it('should return error logs', () => {
      const logs = logger.getErrorLogs(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].errorCode).toBe('TEST_ERROR');
    });

    it('should return agent usage logs for specific agent', () => {
      logger.logAgentUsage({
        timestamp: Date.now(),
        agentName: 'test-agent',
        endpoint: 'latest',
        requestCount: 10,
        successfulRequests: 9,
        failedRequests: 1,
        averageResponseTime: 1500,
        totalQuotaUsed: 10,
        cacheHitRate: 50,
        preferredParameters: {},
        usagePattern: 'moderate',
      });

      const logs = logger.getAgentUsageLogs('test-agent');
      expect(logs).toHaveLength(1);
      expect(logs[0].agentName).toBe('test-agent');
    });

    it('should return alert logs filtered by severity', () => {
      logger.logAlert({
        timestamp: Date.now(),
        alertType: 'high_error_rate',
        severity: 'warning',
        message: 'Warning alert',
        details: {},
        actionRequired: false,
        autoResolved: false,
      });

      logger.logAlert({
        timestamp: Date.now(),
        alertType: 'quota_exhaustion',
        severity: 'critical',
        message: 'Critical alert',
        details: {},
        actionRequired: true,
        autoResolved: false,
      });

      const warningAlerts = logger.getAlertLogs('warning');
      const criticalAlerts = logger.getAlertLogs('critical');

      expect(warningAlerts).toHaveLength(1);
      expect(criticalAlerts).toHaveLength(1);
      expect(warningAlerts[0].severity).toBe('warning');
      expect(criticalAlerts[0].severity).toBe('critical');
    });
  });

  describe('Observability Summary', () => {
    beforeEach(() => {
      // Add test data for summary
      const baseTime = Date.now();
      
      // Add successful requests
      for (let i = 0; i < 8; i++) {
        logger.logNewsRequest({
          timestamp: baseTime - (i * 1000),
          requestId: `req_success_${i}`,
          endpoint: 'latest',
          agentName: `agent_${i % 3}`,
          parameters: {},
          success: true,
          responseTime: 1000 + (i * 100),
          itemCount: 5,
          cached: i % 2 === 0,
          stale: false,
          freshness: 0,
          quotaUsed: 1,
        });
      }

      // Add failed requests
      for (let i = 0; i < 2; i++) {
        logger.logNewsRequest({
          timestamp: baseTime - (i * 1000),
          requestId: `req_fail_${i}`,
          endpoint: 'crypto',
          agentName: 'agent_0',
          parameters: {},
          success: false,
          responseTime: 5000,
          itemCount: 0,
          cached: false,
          stale: false,
          freshness: 0,
          error: 'Test error',
        });
      }

      // Add quota usage
      logger.logQuotaUsage({
        timestamp: baseTime,
        dailyQuotaLimit: 1000,
        dailyQuotaUsed: 500,
        dailyQuotaRemaining: 500,
        quotaUtilization: 50.0,
        rateLimitWindow: 900000,
        rateLimitUsed: 30,
        rateLimitRemaining: 30,
        rateLimitUtilization: 50.0,
        estimatedTimeToReset: 3600000,
      });

      // Add alert
      logger.logAlert({
        timestamp: baseTime,
        alertType: 'high_error_rate',
        severity: 'warning',
        message: 'Test alert',
        details: {},
        actionRequired: false,
        autoResolved: false,
      });
    });

    it('should generate comprehensive observability summary', () => {
      const summary = logger.getObservabilitySummary(3600); // 1 hour

      expect(summary).toMatchObject({
        timeWindow: 3600,
        totalRequests: 10,
        successRate: 80, // 8 successful out of 10
        quotaUtilization: 50.0,
        activeAlerts: 1,
      });

      expect(summary.topAgents).toHaveLength(3);
      expect(summary.endpointStats).toHaveLength(2); // latest and crypto
      expect(summary.averageResponseTime).toBeGreaterThan(0);
      expect(summary.cacheHitRate).toBe(40); // 4 cached out of 10
    });
  });

  describe('Log Cleanup', () => {
    it('should clear old logs', () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const recentTime = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago

      // Add old log
      logger.logNewsRequest({
        timestamp: oldTime,
        requestId: 'old_req',
        endpoint: 'latest',
        parameters: {},
        success: true,
        responseTime: 1000,
        itemCount: 5,
        cached: false,
        stale: false,
        freshness: 0,
      });

      // Add recent log
      logger.logNewsRequest({
        timestamp: recentTime,
        requestId: 'recent_req',
        endpoint: 'latest',
        parameters: {},
        success: true,
        responseTime: 1000,
        itemCount: 5,
        cached: false,
        stale: false,
        freshness: 0,
      });

      expect(logger.getRecentRequestLogs()).toHaveLength(2);

      // Clear logs older than 24 hours
      logger.clearOldLogs(24 * 60 * 60 * 1000);

      const remainingLogs = logger.getRecentRequestLogs();
      expect(remainingLogs).toHaveLength(1);
      expect(remainingLogs[0].requestId).toBe('recent_req');
    });
  });
});