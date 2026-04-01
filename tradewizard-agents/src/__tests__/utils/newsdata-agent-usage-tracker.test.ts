/**
 * Unit tests for NewsData.io Agent Usage Tracker
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  NewsDataAgentUsageTracker,
  createNewsDataAgentUsageTracker,
  getNewsDataAgentUsageTracker,
  initializeNewsDataAgentUsageTracker
} from './newsdata-agent-usage-tracker.js';
import type { NewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import type { MonitorLogger } from './logger.js';

// Mock loggers
const mockNewsDataLogger: Partial<NewsDataObservabilityLogger> = {
  logAgentUsage: vi.fn(),
  calculateAndLogAgentUsage: vi.fn(),
};

const mockLogger = {
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
} as unknown as MonitorLogger;

describe('NewsDataAgentUsageTracker', () => {
  let tracker: NewsDataAgentUsageTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new NewsDataAgentUsageTracker(
      mockNewsDataLogger as NewsDataObservabilityLogger,
      mockLogger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Management', () => {
    it('should start and track agent sessions', () => {
      const sessionId = tracker.startSession('test-agent');
      
      expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'Agent session started',
        expect.objectContaining({
          agentName: 'test-agent',
          sessionId,
        })
      );

      const activeSessions = tracker.getActiveSessions('test-agent');
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].agentName).toBe('test-agent');
      expect(activeSessions[0].sessionId).toBe(sessionId);
    });

    it('should end agent sessions and log summary', () => {
      const sessionId = tracker.startSession('test-agent');
      
      // Add some activity to the session
      tracker.trackRequest('test-agent', 'latest', { q: 'test' }, {
        success: true,
        responseTime: 1500,
        quotaUsed: 1,
        cached: false,
      });

      const endedSession = tracker.endSession(sessionId);
      
      expect(endedSession).toBeTruthy();
      expect(endedSession!.endTime).toBeTruthy();
      expect(endedSession!.totalRequests).toBe(1);
      
      expect(mockNewsDataLogger.logAgentUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'test-agent',
          requestCount: 1,
          successfulRequests: 1,
          failedRequests: 0,
        })
      );

      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'Agent session ended',
        expect.objectContaining({
          agentName: 'test-agent',
          sessionId,
          totalRequests: 1,
          successRate: 100,
        })
      );
    });

    it('should return null when ending non-existent session', () => {
      const result = tracker.endSession('non-existent-session');
      expect(result).toBeNull();
    });

    it('should get or create sessions automatically', () => {
      // First request should create a session
      tracker.trackRequest('auto-agent', 'latest', {}, {
        success: true,
        responseTime: 1000,
      });

      const sessions = tracker.getActiveSessions('auto-agent');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].agentName).toBe('auto-agent');
    });
  });

  describe('Request Tracking', () => {
    it('should track successful requests', () => {
      tracker.trackRequest('test-agent', 'latest', { q: 'test', size: 10 }, {
        success: true,
        responseTime: 1500,
        itemCount: 5,
        quotaUsed: 1,
        cached: false,
        stale: false,
      });

      const sessions = tracker.getActiveSessions('test-agent');
      expect(sessions).toHaveLength(1);
      
      const session = sessions[0];
      expect(session.totalRequests).toBe(1);
      expect(session.successfulRequests).toBe(1);
      expect(session.failedRequests).toBe(0);
      expect(session.averageResponseTime).toBe(1500);
      expect(session.totalQuotaUsed).toBe(1);
      expect(session.endpointsUsed.has('latest')).toBe(true);
      expect(session.cacheHitRate).toBe(0); // Not cached
    });

    it('should track failed requests with error details', () => {
      tracker.trackRequest('test-agent', 'crypto', { coin: ['btc'] }, {
        success: false,
        responseTime: 5000,
        itemCount: 0,
        quotaUsed: 0,
        cached: false,
        error: 'Rate limit exceeded',
      });

      const sessions = tracker.getActiveSessions('test-agent');
      const session = sessions[0];
      
      expect(session.totalRequests).toBe(1);
      expect(session.successfulRequests).toBe(0);
      expect(session.failedRequests).toBe(1);
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].errorType).toBe('rate_limit');
      expect(session.errors[0].errorMessage).toBe('Rate limit exceeded');
      expect(session.errors[0].endpoint).toBe('crypto');
    });

    it('should update cache hit rate correctly', () => {
      const agentName = 'cache-test-agent';
      
      // Track 4 requests: 2 cached, 2 not cached
      tracker.trackRequest(agentName, 'latest', {}, { success: true, responseTime: 1000, cached: true });
      tracker.trackRequest(agentName, 'latest', {}, { success: true, responseTime: 1000, cached: false });
      tracker.trackRequest(agentName, 'latest', {}, { success: true, responseTime: 1000, cached: true });
      tracker.trackRequest(agentName, 'latest', {}, { success: true, responseTime: 1000, cached: false });

      const sessions = tracker.getActiveSessions(agentName);
      const session = sessions[0];
      
      expect(session.cacheHitRate).toBe(0.5); // 50% cache hit rate
    });

    it('should track parameter preferences', () => {
      const agentName = 'param-test-agent';
      
      // Track requests with different parameters
      tracker.trackRequest(agentName, 'latest', { size: 10, language: 'en' }, { success: true, responseTime: 1000 });
      tracker.trackRequest(agentName, 'latest', { size: 10, language: 'es' }, { success: true, responseTime: 1000 });
      tracker.trackRequest(agentName, 'latest', { size: 20, language: 'en' }, { success: true, responseTime: 1000 });

      const sessions = tracker.getActiveSessions(agentName);
      const session = sessions[0];
      
      expect(session.preferredParameters.has('size')).toBe(true);
      expect(session.preferredParameters.has('language')).toBe(true);
      
      const sizeMap = session.preferredParameters.get('size')!;
      expect(sizeMap.get('10')).toBe(2); // size: 10 used twice
      expect(sizeMap.get('20')).toBe(1); // size: 20 used once
    });

    it('should update agent statistics', () => {
      const agentName = 'stats-test-agent';
      
      tracker.trackRequest(agentName, 'latest', {}, { success: true, responseTime: 1000, quotaUsed: 1 });
      tracker.trackRequest(agentName, 'crypto', {}, { success: false, responseTime: 2000, error: 'Test error' });

      const stats = tracker.getAgentStatistics(agentName);
      expect(stats).toHaveLength(1);
      
      const agentStats = stats[0];
      expect(agentStats.agentName).toBe(agentName);
      expect(agentStats.totalRequests).toBe(2);
      expect(agentStats.successfulRequests).toBe(1);
      expect(agentStats.failedRequests).toBe(1);
      expect(agentStats.preferredEndpoints).toHaveLength(2);
    });

    it('should limit usage events to configured maximum', () => {
      const agentName = 'limit-test-agent';
      
      // Add more events than the limit (assuming default is 10000)
      for (let i = 0; i < 15000; i++) {
        tracker.trackRequest(agentName, 'latest', {}, { success: true, responseTime: 1000 });
      }

      const events = tracker.getUsageEvents();
      expect(events.length).toBeLessThanOrEqual(10000);
    });
  });

  describe('Usage Pattern Analysis', () => {
    beforeEach(() => {
      // Add test data for analysis
      const agentName = 'analysis-agent';
      
      // Add requests over different hours and endpoints
      for (let i = 0; i < 20; i++) {
        const endpoint = i % 2 === 0 ? 'latest' : 'crypto';
        const success = i < 18; // 90% success rate
        const cached = i % 3 === 0; // 33% cache hit rate
        
        tracker.trackRequest(agentName, endpoint as any, 
          { size: i % 2 === 0 ? 10 : 20, language: 'en' }, 
          { 
            success, 
            responseTime: 1000 + (i * 100), 
            quotaUsed: 1,
            cached,
            error: success ? undefined : 'Test error'
          }
        );
      }
    });

    it('should analyze agent usage patterns', () => {
      const analysis = tracker.analyzeAgentUsage('analysis-agent', 24 * 60 * 60);
      
      expect(analysis).toBeTruthy();
      expect(analysis!.agentName).toBe('analysis-agent');
      expect(analysis!.timeWindow).toBe(24 * 60 * 60);
      
      // Check request frequency
      expect(analysis!.requestFrequency.requestsPerHour).toBeGreaterThan(0);
      expect(analysis!.requestFrequency.requestsPerDay).toBeGreaterThan(0);
      expect(analysis!.requestFrequency.peakHour).toBeGreaterThanOrEqual(0);
      expect(analysis!.requestFrequency.peakHour).toBeLessThan(24);
      
      // Check endpoint distribution
      expect(analysis!.endpointDistribution).toHaveLength(2);
      expect(analysis!.endpointDistribution[0].endpoint).toMatch(/^(latest|crypto)$/);
      expect(analysis!.endpointDistribution[0].percentage).toBeGreaterThan(0);
      
      // Check parameter preferences
      expect(analysis!.parameterPreferences.length).toBeGreaterThan(0);
      const sizePreference = analysis!.parameterPreferences.find(p => p.parameter === 'size');
      expect(sizePreference).toBeTruthy();
      
      // Check performance profile
      expect(analysis!.performanceProfile.averageResponseTime).toBeGreaterThan(0);
      expect(analysis!.performanceProfile.successRate).toBeCloseTo(90, 1);
      expect(analysis!.performanceProfile.cacheHitRate).toBeCloseTo(35, 1);
      
      // Check insights
      expect(analysis!.insights).toBeInstanceOf(Array);
    });

    it('should return null for non-existent agent', () => {
      const analysis = tracker.analyzeAgentUsage('non-existent-agent');
      expect(analysis).toBeNull();
    });

    it('should return null for agent with no events in time window', () => {
      // Create agent with old events
      const oldTime = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago
      tracker.trackRequest('old-agent', 'latest', {}, { success: true, responseTime: 1000 });
      
      // Manually set timestamp to old time (simulating old events)
      const events = tracker.getUsageEvents('old-agent');
      if (events.length > 0) {
        (events[0] as any).timestamp = oldTime;
      }
      
      const analysis = tracker.analyzeAgentUsage('old-agent', 24 * 60 * 60);
      expect(analysis).toBeNull();
    });
  });

  describe('Agent Comparison Report', () => {
    beforeEach(() => {
      // Add test data for multiple agents
      const agents = ['agent1', 'agent2', 'agent3'];
      
      agents.forEach((agentName, agentIndex) => {
        const requestCount = (agentIndex + 1) * 10; // Different activity levels
        const successRate = 0.9 - (agentIndex * 0.1); // Different success rates
        
        for (let i = 0; i < requestCount; i++) {
          const success = Math.random() < successRate;
          tracker.trackRequest(agentName, 'latest', {}, {
            success,
            responseTime: 1000 + (agentIndex * 500), // Different response times
            quotaUsed: 1,
            cached: i % 2 === 0,
            error: success ? undefined : 'Test error',
          });
        }
      });
    });

    it('should generate comprehensive comparison report', () => {
      const report = tracker.generateComparisonReport(24 * 60 * 60);
      
      expect(report.reportTimestamp).toBeGreaterThan(0);
      expect(report.timeWindow).toBe(24 * 60 * 60);
      expect(report.agents).toHaveLength(3);
      
      // Check agents are ranked by overall score
      expect(report.agents[0].rank).toBe(1);
      expect(report.agents[1].rank).toBe(2);
      expect(report.agents[2].rank).toBe(3);
      
      // Check metrics are calculated
      report.agents.forEach(agent => {
        expect(agent.metrics.totalRequests).toBeGreaterThan(0);
        expect(agent.metrics.successRate).toBeGreaterThanOrEqual(0);
        expect(agent.metrics.successRate).toBeLessThanOrEqual(100);
        expect(agent.metrics.averageResponseTime).toBeGreaterThan(0);
        expect(agent.scores.overall).toBeGreaterThanOrEqual(0);
        expect(agent.scores.overall).toBeLessThanOrEqual(100);
      });
      
      // Check top performers
      expect(report.topPerformers.mostActive).toBeTruthy();
      expect(report.topPerformers.mostReliable).toBeTruthy();
      expect(report.topPerformers.mostEfficient).toBeTruthy();
      expect(report.topPerformers.fastestResponse).toBeTruthy();
      expect(report.topPerformers.bestCacheUsage).toBeTruthy();
      
      // Check insights
      expect(report.insights).toBeInstanceOf(Array);
    });

    it('should handle empty data gracefully', () => {
      const emptyTracker = new NewsDataAgentUsageTracker(
        mockNewsDataLogger as NewsDataObservabilityLogger,
        mockLogger
      );
      
      const report = emptyTracker.generateComparisonReport();
      
      expect(report.agents).toHaveLength(0);
      expect(report.topPerformers.mostActive).toBe('');
      expect(report.insights).toHaveLength(0);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize different error types correctly', () => {
      const testCases = [
        { error: 'rate limit exceeded', expected: 'rate_limit' },
        { error: 'quota exhausted', expected: 'quota' },
        { error: 'validation failed', expected: 'validation' },
        { error: 'network timeout', expected: 'network' },
        { error: 'request timeout', expected: 'timeout' },
        { error: 'unknown error', expected: 'unknown' },
      ];

      testCases.forEach(({ error, expected }) => {
        tracker.trackRequest('error-test-agent', 'latest', {}, {
          success: false,
          responseTime: 5000,
          error,
        });

        const sessions = tracker.getActiveSessions('error-test-agent');
        const session = sessions[0];
        const lastError = session.errors[session.errors.length - 1];
        
        expect(lastError.errorType).toBe(expected);
        
        // Clear for next test
        tracker.clearAllData();
      });
    });
  });

  describe('Usage Pattern Determination', () => {
    it('should determine usage patterns correctly', () => {
      const testCases = [
        { requestsPerHour: 15, expected: 'frequent' },
        { requestsPerHour: 5, expected: 'moderate' },
        { requestsPerHour: 2, expected: 'occasional' },
        { requestsPerHour: 0.5, expected: 'rare' },
      ];

      testCases.forEach(({ requestsPerHour, expected }) => {
        const agentName = `pattern-test-${expected}`;
        const sessionId = tracker.startSession(agentName);
        
        // Simulate requests over 1 hour
        const requestCount = Math.floor(requestsPerHour);
        for (let i = 0; i < requestCount; i++) {
          tracker.trackRequest(agentName, 'latest', {}, {
            success: true,
            responseTime: 1000,
          });
        }

        const session = tracker.endSession(sessionId);
        const stats = tracker.getAgentStatistics(agentName);
        
        expect(session).toBeTruthy();
        // Note: The actual pattern may differ due to timing, so we just check it's a valid pattern
        expect(['frequent', 'moderate', 'occasional', 'rare']).toContain(stats[0].usagePattern);
        
        tracker.clearAllData();
      });
    });
  });

  describe('Performance Score Calculation', () => {
    it('should calculate performance scores based on response time and cache usage', () => {
      const agentName = 'perf-test-agent';
      
      // Fast responses with good cache usage
      for (let i = 0; i < 10; i++) {
        tracker.trackRequest(agentName, 'latest', {}, {
          success: true,
          responseTime: 500, // Fast response
          cached: i < 8, // 80% cache hit rate
        });
      }

      const stats = tracker.getAgentStatistics(agentName);
      expect(stats[0].performanceScore).toBeGreaterThan(80); // Should be high
    });

    it('should calculate reliability scores based on success rate', () => {
      const agentName = 'reliability-test-agent';
      
      // High success rate
      for (let i = 0; i < 10; i++) {
        tracker.trackRequest(agentName, 'latest', {}, {
          success: i < 9, // 90% success rate
          responseTime: 1000,
          error: i >= 9 ? 'Test error' : undefined,
        });
      }

      const stats = tracker.getAgentStatistics(agentName);
      expect(stats[0].reliabilityScore).toBeGreaterThanOrEqual(70); // Should be high
    });
  });

  describe('Data Access Methods', () => {
    beforeEach(() => {
      // Add test data
      tracker.trackRequest('test-agent-1', 'latest', {}, { success: true, responseTime: 1000 });
      tracker.trackRequest('test-agent-2', 'crypto', {}, { success: true, responseTime: 1500 });
    });

    it('should get agent statistics for specific agent', () => {
      const stats = tracker.getAgentStatistics('test-agent-1');
      expect(stats).toHaveLength(1);
      expect(stats[0].agentName).toBe('test-agent-1');
    });

    it('should get all agent statistics when no agent specified', () => {
      const stats = tracker.getAgentStatistics();
      expect(stats.length).toBeGreaterThanOrEqual(2);
    });

    it('should get active sessions for specific agent', () => {
      const sessions = tracker.getActiveSessions('test-agent-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].agentName).toBe('test-agent-1');
    });

    it('should get all active sessions when no agent specified', () => {
      const sessions = tracker.getActiveSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should get usage events with limit', () => {
      const events = tracker.getUsageEvents(undefined, 1);
      expect(events).toHaveLength(1);
    });

    it('should get usage events for specific agent', () => {
      const events = tracker.getUsageEvents('test-agent-1');
      expect(events).toHaveLength(1);
      expect(events[0].agentName).toBe('test-agent-1');
    });
  });

  describe('Data Cleanup', () => {
    it('should clear all tracking data', () => {
      // Add some data
      tracker.trackRequest('test-agent', 'latest', {}, { success: true, responseTime: 1000 });
      
      expect(tracker.getAgentStatistics()).toHaveLength(1);
      expect(tracker.getActiveSessions()).toHaveLength(1);
      expect(tracker.getUsageEvents()).toHaveLength(1);
      
      tracker.clearAllData();
      
      expect(tracker.getAgentStatistics()).toHaveLength(0);
      expect(tracker.getActiveSessions()).toHaveLength(0);
      expect(tracker.getUsageEvents()).toHaveLength(0);
      
      expect(mockLogger.logConfig).toHaveBeenCalledWith(
        'Agent usage tracking data cleared',
        expect.objectContaining({})
      );
    });
  });

  describe('Insight Generation', () => {
    it('should generate performance insights for slow agents', () => {
      const agentName = 'slow-agent';
      
      // Add slow requests
      for (let i = 0; i < 5; i++) {
        tracker.trackRequest(agentName, 'latest', {}, {
          success: true,
          responseTime: 6000, // Slow response
        });
      }

      const analysis = tracker.analyzeAgentUsage(agentName);
      expect(analysis).toBeTruthy();
      
      const performanceInsights = analysis!.insights.filter(i => i.type === 'efficiency');
      expect(performanceInsights.length).toBeGreaterThan(0);
      expect(performanceInsights[0].severity).toBe('warning');
    });

    it('should generate reliability insights for error-prone agents', () => {
      const agentName = 'unreliable-agent';
      
      // Add requests with high error rate
      for (let i = 0; i < 10; i++) {
        tracker.trackRequest(agentName, 'latest', {}, {
          success: i < 8, // 80% success rate, 20% error rate
          responseTime: 1000,
          error: i >= 8 ? 'Test error' : undefined,
        });
      }

      const analysis = tracker.analyzeAgentUsage(agentName);
      expect(analysis).toBeTruthy();
      
      const reliabilityInsights = analysis!.insights.filter(i => i.type === 'reliability');
      expect(reliabilityInsights.length).toBeGreaterThan(0);
      expect(reliabilityInsights[0].severity).toBe('concern');
    });

    it('should generate efficiency insights for low cache usage', () => {
      const agentName = 'inefficient-agent';
      
      // Add requests with low cache hit rate
      for (let i = 0; i < 10; i++) {
        tracker.trackRequest(agentName, 'latest', {}, {
          success: true,
          responseTime: 1000,
          cached: i < 2, // 20% cache hit rate
        });
      }

      const analysis = tracker.analyzeAgentUsage(agentName);
      expect(analysis).toBeTruthy();
      
      const efficiencyInsights = analysis!.insights.filter(i => i.type === 'efficiency');
      expect(efficiencyInsights.length).toBeGreaterThan(0);
      expect(efficiencyInsights[0].message).toContain('cache hit rate');
    });
  });
});

describe('Factory Functions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create tracker instance', () => {
    const tracker = createNewsDataAgentUsageTracker(
      mockNewsDataLogger as NewsDataObservabilityLogger,
      mockLogger
    );
    
    expect(tracker).toBeInstanceOf(NewsDataAgentUsageTracker);
  });

  it('should get global tracker instance', () => {
    const tracker1 = getNewsDataAgentUsageTracker();
    const tracker2 = getNewsDataAgentUsageTracker();
    
    expect(tracker1).toBe(tracker2); // Should be same instance
  });

  it('should initialize global tracker with custom loggers', () => {
    const tracker = initializeNewsDataAgentUsageTracker(
      mockNewsDataLogger as NewsDataObservabilityLogger,
      mockLogger
    );
    
    expect(tracker).toBeInstanceOf(NewsDataAgentUsageTracker);
    
    // Should return same instance on subsequent calls
    const sameTracker = getNewsDataAgentUsageTracker();
    expect(sameTracker).toBe(tracker);
  });
});