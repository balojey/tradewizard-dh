/**
 * NewsData.io Agent Usage Tracker
 * 
 * Provides comprehensive tracking of which agents use which news sources,
 * usage pattern analysis, and reporting capabilities.
 */

import type { NewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import { getNewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import type { MonitorLogger } from './logger.js';
import { getMonitorLogger } from './logger.js';

// ============================================================================
// Usage Tracking Types
// ============================================================================

/**
 * Agent usage session information
 */
export interface AgentUsageSession {
  sessionId: string;
  agentName: string;
  startTime: number;
  endTime?: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  endpointsUsed: Set<string>;
  totalQuotaUsed: number;
  averageResponseTime: number;
  cacheHitRate: number;
  preferredParameters: Map<string, Map<any, number>>; // parameter -> value -> count
  errors: Array<{
    timestamp: number;
    errorType: string;
    errorMessage: string;
    endpoint?: string;
  }>;
}

/**
 * Agent usage statistics over time
 */
export interface AgentUsageStatistics {
  agentName: string;
  firstSeen: number;
  lastSeen: number;
  totalSessions: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalQuotaUsed: number;
  averageResponseTime: number;
  cacheHitRate: number;
  
  // Usage patterns
  usagePattern: 'frequent' | 'moderate' | 'occasional' | 'rare';
  peakUsageHours: number[]; // Hours of day (0-23) when agent is most active
  preferredEndpoints: Array<{ endpoint: string; count: number; percentage: number }>;
  commonParameters: Record<string, any>;
  
  // Performance metrics
  performanceScore: number; // 0-100 based on success rate, response time, etc.
  reliabilityScore: number; // 0-100 based on error rate and consistency
  
  // Trends
  requestTrend: 'increasing' | 'decreasing' | 'stable';
  errorTrend: 'improving' | 'degrading' | 'stable';
  
  // Time-based statistics
  dailyStats: Array<{
    date: string; // YYYY-MM-DD
    requests: number;
    successRate: number;
    quotaUsed: number;
    averageResponseTime: number;
  }>;
  
  hourlyStats: Array<{
    hour: number; // 0-23
    requests: number;
    successRate: number;
  }>;
}

/**
 * Usage pattern analysis result
 */
export interface UsagePatternAnalysis {
  agentName: string;
  analysisTimestamp: number;
  timeWindow: number; // seconds
  
  // Request patterns
  requestFrequency: {
    requestsPerHour: number;
    requestsPerDay: number;
    peakHour: number;
    quietHour: number;
  };
  
  // Endpoint preferences
  endpointDistribution: Array<{
    endpoint: string;
    count: number;
    percentage: number;
    averageResponseTime: number;
    successRate: number;
  }>;
  
  // Parameter preferences
  parameterPreferences: Array<{
    parameter: string;
    mostUsedValue: any;
    usagePercentage: number;
    valueDistribution: Array<{ value: any; count: number }>;
  }>;
  
  // Performance characteristics
  performanceProfile: {
    averageResponseTime: number;
    p95ResponseTime: number;
    successRate: number;
    errorRate: number;
    cacheHitRate: number;
  };
  
  // Behavioral insights
  insights: Array<{
    type: 'efficiency' | 'reliability' | 'optimization' | 'anomaly';
    severity: 'info' | 'warning' | 'concern';
    message: string;
    recommendation?: string;
  }>;
}

/**
 * Agent comparison report
 */
export interface AgentComparisonReport {
  reportTimestamp: number;
  timeWindow: number;
  agents: Array<{
    agentName: string;
    rank: number;
    metrics: {
      totalRequests: number;
      successRate: number;
      averageResponseTime: number;
      quotaEfficiency: number; // requests per quota unit
      cacheHitRate: number;
      errorRate: number;
    };
    scores: {
      performance: number;
      reliability: number;
      efficiency: number;
      overall: number;
    };
  }>;
  
  topPerformers: {
    mostActive: string;
    mostReliable: string;
    mostEfficient: string;
    fastestResponse: string;
    bestCacheUsage: string;
  };
  
  insights: Array<{
    type: 'performance' | 'usage' | 'efficiency' | 'reliability';
    message: string;
    affectedAgents: string[];
  }>;
}

// ============================================================================
// NewsData Agent Usage Tracker Class
// ============================================================================

/**
 * Comprehensive agent usage tracker for NewsData.io operations
 */
export class NewsDataAgentUsageTracker {
  private newsDataLogger: NewsDataObservabilityLogger;
  private logger: MonitorLogger;
  
  // Active sessions
  private activeSessions: Map<string, AgentUsageSession> = new Map();
  
  // Historical statistics
  private agentStatistics: Map<string, AgentUsageStatistics> = new Map();
  
  // Usage events for pattern analysis
  private usageEvents: Array<{
    timestamp: number;
    agentName: string;
    endpoint: string;
    success: boolean;
    responseTime: number;
    quotaUsed: number;
    cached: boolean;
    parameters: Record<string, any>;
  }> = [];
  
  // Configuration
  private config = {
    maxUsageEvents: 10000,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    analysisWindow: 24 * 60 * 60 * 1000, // 24 hours
    reportingInterval: 60 * 60 * 1000, // 1 hour
  };

  constructor(
    newsDataLogger?: NewsDataObservabilityLogger,
    logger?: MonitorLogger
  ) {
    this.newsDataLogger = newsDataLogger || getNewsDataObservabilityLogger();
    this.logger = logger || getMonitorLogger();
    
    // Start periodic reporting
    this.startPeriodicReporting();
    
    this.logger.logConfig('NewsData agent usage tracker initialized', {
      maxUsageEvents: this.config.maxUsageEvents,
      sessionTimeout: this.config.sessionTimeout,
      analysisWindow: this.config.analysisWindow,
    });
  }

  // ============================================================================
  // Usage Tracking Methods
  // ============================================================================

  /**
   * Track a news request from an agent
   */
  trackRequest(
    agentName: string,
    endpoint: 'latest' | 'archive' | 'crypto' | 'market' | 'sources',
    parameters: Record<string, any>,
    result: {
      success: boolean;
      responseTime: number;
      itemCount?: number;
      quotaUsed?: number;
      cached?: boolean;
      stale?: boolean;
      error?: string;
    }
  ): void {
    const timestamp = Date.now();
    
    // Get or create session
    const session = this.getOrCreateSession(agentName);
    
    // Update session
    session.totalRequests++;
    if (result.success) {
      session.successfulRequests++;
    } else {
      session.failedRequests++;
      if (result.error) {
        session.errors.push({
          timestamp,
          errorType: this.categorizeError(result.error),
          errorMessage: result.error,
          endpoint,
        });
      }
    }
    
    session.endpointsUsed.add(endpoint);
    session.totalQuotaUsed += result.quotaUsed || 1;
    
    // Update average response time
    const totalTime = session.averageResponseTime * (session.totalRequests - 1) + result.responseTime;
    session.averageResponseTime = totalTime / session.totalRequests;
    
    // Update cache hit rate
    if (result.cached !== undefined) {
      const totalCacheEvents = session.totalRequests;
      const cacheHits = session.cacheHitRate * (totalCacheEvents - 1) + (result.cached ? 1 : 0);
      session.cacheHitRate = cacheHits / totalCacheEvents;
    }
    
    // Track parameter usage
    Object.entries(parameters).forEach(([key, value]) => {
      if (!session.preferredParameters.has(key)) {
        session.preferredParameters.set(key, new Map());
      }
      const valueMap = session.preferredParameters.get(key)!;
      const valueKey = String(value); // Use string instead of JSON.stringify for simpler keys
      valueMap.set(valueKey, (valueMap.get(valueKey) || 0) + 1);
    });
    
    // Add to usage events for pattern analysis
    this.usageEvents.push({
      timestamp,
      agentName,
      endpoint,
      success: result.success,
      responseTime: result.responseTime,
      quotaUsed: result.quotaUsed || 1,
      cached: result.cached || false,
      parameters: { ...parameters },
    });
    
    // Limit usage events size
    if (this.usageEvents.length > this.config.maxUsageEvents) {
      this.usageEvents = this.usageEvents.slice(-this.config.maxUsageEvents);
    }
    
    // Update agent statistics
    this.updateAgentStatistics(agentName, session);
    
    this.logger.logDebug('Agent request tracked', {
      agentName,
      endpoint,
      success: result.success,
      responseTime: result.responseTime,
      quotaUsed: result.quotaUsed,
      cached: result.cached,
    });
  }

  /**
   * Start an agent session
   */
  startSession(agentName: string): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: AgentUsageSession = {
      sessionId,
      agentName,
      startTime: Date.now(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      endpointsUsed: new Set(),
      totalQuotaUsed: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      preferredParameters: new Map(),
      errors: [],
    };
    
    this.activeSessions.set(sessionId, session);
    
    this.logger.logConfig('Agent session started', {
      agentName,
      sessionId,
    });
    
    return sessionId;
  }

  /**
   * End an agent session
   */
  endSession(sessionId: string): AgentUsageSession | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;
    
    session.endTime = Date.now();
    this.activeSessions.delete(sessionId);
    
    // Log session summary
    this.newsDataLogger.logAgentUsage({
      timestamp: session.endTime,
      agentName: session.agentName,
      endpoint: 'latest', // Default for session summary
      requestCount: session.totalRequests,
      successfulRequests: session.successfulRequests,
      failedRequests: session.failedRequests,
      averageResponseTime: session.averageResponseTime,
      totalQuotaUsed: session.totalQuotaUsed,
      cacheHitRate: session.cacheHitRate * 100,
      preferredParameters: this.extractPreferredParameters(session.preferredParameters),
      usagePattern: this.determineUsagePattern(session),
    });
    
    this.logger.logConfig('Agent session ended', {
      agentName: session.agentName,
      sessionId,
      duration: session.endTime - session.startTime,
      totalRequests: session.totalRequests,
      successRate: session.totalRequests > 0 ? (session.successfulRequests / session.totalRequests) * 100 : 0,
    });
    
    return session;
  }

  /**
   * Get or create an active session for an agent
   */
  private getOrCreateSession(agentName: string): AgentUsageSession {
    // Look for existing active session
    for (const session of this.activeSessions.values()) {
      if (session.agentName === agentName) {
        return session;
      }
    }
    
    // Create new session
    const sessionId = this.startSession(agentName);
    return this.activeSessions.get(sessionId)!;
  }

  /**
   * Update agent statistics based on session data
   */
  private updateAgentStatistics(agentName: string, session: AgentUsageSession): void {
    let stats = this.agentStatistics.get(agentName);
    
    if (!stats) {
      stats = {
        agentName,
        firstSeen: session.startTime,
        lastSeen: Date.now(),
        totalSessions: 1,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalQuotaUsed: 0,
        averageResponseTime: 0,
        cacheHitRate: 0,
        usagePattern: 'rare',
        peakUsageHours: [],
        preferredEndpoints: [],
        commonParameters: {},
        performanceScore: 50,
        reliabilityScore: 50,
        requestTrend: 'stable',
        errorTrend: 'stable',
        dailyStats: [],
        hourlyStats: Array.from({ length: 24 }, (_, i) => ({ hour: i, requests: 0, successRate: 0 })),
      };
      this.agentStatistics.set(agentName, stats);
    }
    
    // Update basic statistics
    stats.lastSeen = Date.now();
    stats.totalRequests = session.totalRequests;
    stats.successfulRequests = session.successfulRequests;
    stats.failedRequests = session.failedRequests;
    stats.totalQuotaUsed = session.totalQuotaUsed;
    stats.averageResponseTime = session.averageResponseTime;
    stats.cacheHitRate = session.cacheHitRate;
    
    // Update usage pattern
    stats.usagePattern = this.determineUsagePattern(session);
    
    // Update preferred endpoints
    stats.preferredEndpoints = Array.from(session.endpointsUsed).map(endpoint => ({
      endpoint,
      count: 1, // Simplified for now
      percentage: 100 / session.endpointsUsed.size,
    }));
    
    // Update common parameters
    stats.commonParameters = this.extractPreferredParameters(session.preferredParameters);
    
    // Calculate performance scores
    stats.performanceScore = this.calculatePerformanceScore(session);
    stats.reliabilityScore = this.calculateReliabilityScore(session);
    
    // Update hourly statistics
    const currentHour = new Date().getHours();
    const hourlyStats = stats.hourlyStats[currentHour];
    hourlyStats.requests++;
    hourlyStats.successRate = session.totalRequests > 0 ? 
      (session.successfulRequests / session.totalRequests) * 100 : 0;
  }

  // ============================================================================
  // Analysis Methods
  // ============================================================================

  /**
   * Analyze usage patterns for a specific agent
   */
  analyzeAgentUsage(agentName: string, timeWindowSeconds: number = 24 * 60 * 60): UsagePatternAnalysis | null {
    const stats = this.agentStatistics.get(agentName);
    if (!stats) return null;
    
    const now = Date.now();
    const windowStart = now - (timeWindowSeconds * 1000);
    
    // Filter events for this agent and time window
    const agentEvents = this.usageEvents.filter(event => 
      event.agentName === agentName && event.timestamp >= windowStart
    );
    
    if (agentEvents.length === 0) return null;
    
    // Calculate request frequency
    const requestsPerHour = agentEvents.length / (timeWindowSeconds / 3600);
    const requestsPerDay = requestsPerHour * 24;
    
    // Find peak and quiet hours
    const hourlyDistribution = new Array(24).fill(0);
    agentEvents.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourlyDistribution[hour]++;
    });
    const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));
    const quietHour = hourlyDistribution.indexOf(Math.min(...hourlyDistribution));
    
    // Analyze endpoint distribution
    const endpointCounts = new Map<string, { count: number; totalTime: number; successes: number }>();
    agentEvents.forEach(event => {
      if (!endpointCounts.has(event.endpoint)) {
        endpointCounts.set(event.endpoint, { count: 0, totalTime: 0, successes: 0 });
      }
      const stats = endpointCounts.get(event.endpoint)!;
      stats.count++;
      stats.totalTime += event.responseTime;
      if (event.success) stats.successes++;
    });
    
    const endpointDistribution = Array.from(endpointCounts.entries()).map(([endpoint, stats]) => ({
      endpoint,
      count: stats.count,
      percentage: (stats.count / agentEvents.length) * 100,
      averageResponseTime: stats.totalTime / stats.count,
      successRate: (stats.successes / stats.count) * 100,
    })).sort((a, b) => b.count - a.count);
    
    // Analyze parameter preferences
    const parameterCounts = new Map<string, Map<string, number>>();
    agentEvents.forEach(event => {
      Object.entries(event.parameters).forEach(([key, value]) => {
        if (!parameterCounts.has(key)) {
          parameterCounts.set(key, new Map());
        }
        const valueKey = JSON.stringify(value);
        const valueMap = parameterCounts.get(key)!;
        valueMap.set(valueKey, (valueMap.get(valueKey) || 0) + 1);
      });
    });
    
    const parameterPreferences = Array.from(parameterCounts.entries()).map(([parameter, valueMap]) => {
      const sortedValues = Array.from(valueMap.entries()).sort((a, b) => b[1] - a[1]);
      const mostUsedValue = sortedValues[0] ? JSON.parse(sortedValues[0][0]) : null;
      const totalUsage = Array.from(valueMap.values()).reduce((sum, count) => sum + count, 0);
      
      return {
        parameter,
        mostUsedValue,
        usagePercentage: sortedValues[0] ? (sortedValues[0][1] / totalUsage) * 100 : 0,
        valueDistribution: sortedValues.slice(0, 5).map(([valueKey, count]) => ({
          value: JSON.parse(valueKey),
          count,
        })),
      };
    }).filter(pref => pref.usagePercentage > 10); // Only include preferences used >10% of the time
    
    // Calculate performance profile
    const responseTimes = agentEvents.map(e => e.responseTime).sort((a, b) => a - b);
    const successfulEvents = agentEvents.filter(e => e.success);
    const cachedEvents = agentEvents.filter(e => e.cached);
    
    const performanceProfile = {
      averageResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
      successRate: (successfulEvents.length / agentEvents.length) * 100,
      errorRate: ((agentEvents.length - successfulEvents.length) / agentEvents.length) * 100,
      cacheHitRate: (cachedEvents.length / agentEvents.length) * 100,
    };
    
    // Generate insights
    const insights = this.generateUsageInsights(agentName, {
      requestFrequency: { requestsPerHour, requestsPerDay, peakHour, quietHour },
      endpointDistribution,
      parameterPreferences,
      performanceProfile,
    });
    
    return {
      agentName,
      analysisTimestamp: now,
      timeWindow: timeWindowSeconds,
      requestFrequency: { requestsPerHour, requestsPerDay, peakHour, quietHour },
      endpointDistribution,
      parameterPreferences,
      performanceProfile,
      insights,
    };
  }

  /**
   * Generate agent comparison report
   */
  generateComparisonReport(timeWindowSeconds: number = 24 * 60 * 60): AgentComparisonReport {
    const now = Date.now();
    const windowStart = now - (timeWindowSeconds * 1000);
    
    // Filter events for time window
    const recentEvents = this.usageEvents.filter(event => event.timestamp >= windowStart);
    
    // Group by agent
    const agentGroups = new Map<string, typeof recentEvents>();
    recentEvents.forEach(event => {
      if (!agentGroups.has(event.agentName)) {
        agentGroups.set(event.agentName, []);
      }
      agentGroups.get(event.agentName)!.push(event);
    });
    
    // Calculate metrics for each agent
    const agents = Array.from(agentGroups.entries()).map(([agentName, events]) => {
      const totalRequests = events.length;
      const successfulRequests = events.filter(e => e.success).length;
      const totalResponseTime = events.reduce((sum, e) => sum + e.responseTime, 0);
      const totalQuotaUsed = events.reduce((sum, e) => sum + e.quotaUsed, 0);
      const cachedRequests = events.filter(e => e.cached).length;
      
      const metrics = {
        totalRequests,
        successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
        averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
        quotaEfficiency: totalQuotaUsed > 0 ? totalRequests / totalQuotaUsed : 0,
        cacheHitRate: totalRequests > 0 ? (cachedRequests / totalRequests) * 100 : 0,
        errorRate: totalRequests > 0 ? ((totalRequests - successfulRequests) / totalRequests) * 100 : 0,
      };
      
      const scores = {
        performance: this.calculatePerformanceScore({ averageResponseTime: metrics.averageResponseTime } as any),
        reliability: Math.max(0, 100 - metrics.errorRate),
        efficiency: Math.min(100, metrics.quotaEfficiency * 10), // Scale quota efficiency
        overall: 0,
      };
      scores.overall = (scores.performance + scores.reliability + scores.efficiency) / 3;
      
      return {
        agentName,
        rank: 0, // Will be set after sorting
        metrics,
        scores,
      };
    }).sort((a, b) => b.scores.overall - a.scores.overall);
    
    // Set ranks
    agents.forEach((agent, index) => {
      agent.rank = index + 1;
    });
    
    // Find top performers (handle empty arrays)
    const topPerformers = agents.length > 0 ? {
      mostActive: agents.reduce((prev, curr) => 
        curr.metrics.totalRequests > prev.metrics.totalRequests ? curr : prev
      ).agentName,
      mostReliable: agents.reduce((prev, curr) => 
        curr.scores.reliability > prev.scores.reliability ? curr : prev
      ).agentName,
      mostEfficient: agents.reduce((prev, curr) => 
        curr.scores.efficiency > prev.scores.efficiency ? curr : prev
      ).agentName,
      fastestResponse: agents.reduce((prev, curr) => 
        curr.metrics.averageResponseTime < prev.metrics.averageResponseTime ? curr : prev
      ).agentName,
      bestCacheUsage: agents.reduce((prev, curr) => 
        curr.metrics.cacheHitRate > prev.metrics.cacheHitRate ? curr : prev
      ).agentName,
    } : {
      mostActive: '',
      mostReliable: '',
      mostEfficient: '',
      fastestResponse: '',
      bestCacheUsage: '',
    };
    
    // Generate insights
    const insights = this.generateComparisonInsights(agents);
    
    return {
      reportTimestamp: now,
      timeWindow: timeWindowSeconds,
      agents,
      topPerformers,
      insights,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Categorize error for tracking
   */
  private categorizeError(errorMessage: string): string {
    const message = errorMessage.toLowerCase();
    if (message.includes('rate limit')) return 'rate_limit';
    if (message.includes('quota')) return 'quota';
    if (message.includes('validation')) return 'validation';
    if (message.includes('network')) return 'network';
    if (message.includes('timeout')) return 'timeout';
    return 'unknown';
  }

  /**
   * Determine usage pattern based on session data
   */
  private determineUsagePattern(session: AgentUsageSession): 'frequent' | 'moderate' | 'occasional' | 'rare' {
    const duration = Date.now() - session.startTime;
    const requestsPerHour = session.totalRequests / (duration / (60 * 60 * 1000));
    
    if (requestsPerHour >= 10) return 'frequent';
    if (requestsPerHour >= 3) return 'moderate';
    if (requestsPerHour >= 1) return 'occasional';
    return 'rare';
  }

  /**
   * Extract preferred parameters from session data
   */
  private extractPreferredParameters(parameterMap: Map<string, Map<any, number>>): Record<string, any> {
    const preferred: Record<string, any> = {};
    
    parameterMap.forEach((valueMap, parameter) => {
      let maxCount = 0;
      let mostUsedValue: any;
      
      valueMap.forEach((count, valueKey) => {
        if (count > maxCount) {
          maxCount = count;
          // Since we're now using string keys, just use the key directly
          mostUsedValue = valueKey;
        }
      });
      
      // Only include if used in >30% of requests
      const totalUsage = Array.from(valueMap.values()).reduce((sum, count) => sum + count, 0);
      if (maxCount / totalUsage > 0.3) {
        preferred[parameter] = mostUsedValue;
      }
    });
    
    return preferred;
  }

  /**
   * Calculate performance score (0-100)
   */
  private calculatePerformanceScore(session: AgentUsageSession): number {
    // Base score on response time (lower is better)
    let score = Math.max(0, 100 - (session.averageResponseTime / 100)); // 100ms = 1 point deduction
    
    // Adjust for cache hit rate (higher is better)
    score += session.cacheHitRate * 20; // Up to 20 bonus points
    
    // Cap at 100
    return Math.min(100, score);
  }

  /**
   * Calculate reliability score (0-100)
   */
  private calculateReliabilityScore(session: AgentUsageSession): number {
    if (session.totalRequests === 0) return 50; // Neutral score for no data
    
    const successRate = (session.successfulRequests / session.totalRequests) * 100;
    const errorRate = (session.errors.length / session.totalRequests) * 100;
    
    // Base score on success rate
    let score = successRate;
    
    // Penalize for errors
    score -= errorRate * 2; // Double penalty for errors
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate usage insights for an agent
   */
  private generateUsageInsights(
    agentName: string, 
    analysis: {
      requestFrequency: any;
      endpointDistribution: any[];
      parameterPreferences: any[];
      performanceProfile: any;
    }
  ): Array<{ type: 'efficiency' | 'reliability' | 'optimization' | 'anomaly'; severity: 'info' | 'warning' | 'concern'; message: string; recommendation?: string }> {
    const insights: Array<{ type: 'efficiency' | 'reliability' | 'optimization' | 'anomaly'; severity: 'info' | 'warning' | 'concern'; message: string; recommendation?: string }> = [];
    
    // Performance insights
    if (analysis.performanceProfile.averageResponseTime > 5000) {
      insights.push({
        type: 'efficiency',
        severity: 'warning',
        message: `${agentName} has slow average response time (${analysis.performanceProfile.averageResponseTime.toFixed(0)}ms)`,
        recommendation: 'Consider optimizing request parameters or using cache more effectively',
      });
    }
    
    // Reliability insights
    if (analysis.performanceProfile.errorRate > 10) {
      insights.push({
        type: 'reliability',
        severity: 'concern',
        message: `${agentName} has high error rate (${analysis.performanceProfile.errorRate.toFixed(1)}%)`,
        recommendation: 'Review error patterns and implement better error handling',
      });
    }
    
    // Efficiency insights
    if (analysis.performanceProfile.cacheHitRate < 30) {
      insights.push({
        type: 'efficiency',
        severity: 'info',
        message: `${agentName} has low cache hit rate (${analysis.performanceProfile.cacheHitRate.toFixed(1)}%)`,
        recommendation: 'Consider adjusting request patterns to improve cache utilization',
      });
    }
    
    // Usage pattern insights
    if (analysis.requestFrequency.requestsPerHour > 50) {
      insights.push({
        type: 'efficiency',
        severity: 'info',
        message: `${agentName} is very active (${analysis.requestFrequency.requestsPerHour.toFixed(1)} requests/hour)`,
        recommendation: 'Monitor quota usage to ensure sustainable operation',
      });
    }
    
    return insights;
  }

  /**
   * Generate comparison insights
   */
  private generateComparisonInsights(agents: any[]): Array<{ type: 'performance' | 'reliability' | 'usage' | 'efficiency'; message: string; affectedAgents: string[] }> {
    const insights: Array<{ type: 'performance' | 'reliability' | 'usage' | 'efficiency'; message: string; affectedAgents: string[] }> = [];
    
    // Performance insights
    const slowAgents = agents.filter(a => a.metrics.averageResponseTime > 5000);
    if (slowAgents.length > 0) {
      insights.push({
        type: 'performance',
        message: `${slowAgents.length} agents have slow response times (>5s)`,
        affectedAgents: slowAgents.map(a => a.agentName),
      });
    }
    
    // Reliability insights
    const unreliableAgents = agents.filter(a => a.metrics.errorRate > 10);
    if (unreliableAgents.length > 0) {
      insights.push({
        type: 'reliability',
        message: `${unreliableAgents.length} agents have high error rates (>10%)`,
        affectedAgents: unreliableAgents.map(a => a.agentName),
      });
    }
    
    // Efficiency insights
    const activeAgents = agents.filter(a => a.metrics.totalRequests > 100);
    if (activeAgents.length > 0) {
      insights.push({
        type: 'efficiency',
        message: `${activeAgents.length} agents are highly active (>100 requests)`,
        affectedAgents: activeAgents.map(a => a.agentName),
      });
    }
    
    return insights;
  }

  /**
   * Start periodic reporting
   */
  private startPeriodicReporting(): void {
    setInterval(() => {
      // Calculate and log agent usage statistics
      this.newsDataLogger.calculateAndLogAgentUsage(3600); // 1 hour window
      
      // Clean up old sessions
      this.cleanupOldSessions();
      
      // Clean up old usage events
      this.cleanupOldUsageEvents();
      
    }, this.config.reportingInterval);
  }

  /**
   * Clean up old sessions
   */
  private cleanupOldSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];
    
    this.activeSessions.forEach((session, sessionId) => {
      if (now - session.startTime > this.config.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    });
    
    expiredSessions.forEach(sessionId => {
      this.endSession(sessionId);
    });
    
    if (expiredSessions.length > 0) {
      this.logger.logConfig('Cleaned up expired sessions', {
        expiredSessions: expiredSessions.length,
      });
    }
  }

  /**
   * Clean up old usage events
   */
  private cleanupOldUsageEvents(): void {
    const cutoff = Date.now() - this.config.analysisWindow;
    const originalLength = this.usageEvents.length;
    
    this.usageEvents = this.usageEvents.filter(event => event.timestamp >= cutoff);
    
    const removed = originalLength - this.usageEvents.length;
    if (removed > 0) {
      this.logger.logConfig('Cleaned up old usage events', {
        removedEvents: removed,
        remainingEvents: this.usageEvents.length,
      });
    }
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Get agent statistics
   */
  getAgentStatistics(agentName?: string): AgentUsageStatistics[] {
    if (agentName) {
      const stats = this.agentStatistics.get(agentName);
      return stats ? [stats] : [];
    }
    return Array.from(this.agentStatistics.values());
  }

  /**
   * Get active sessions
   */
  getActiveSessions(agentName?: string): AgentUsageSession[] {
    const sessions = Array.from(this.activeSessions.values());
    return agentName ? sessions.filter(s => s.agentName === agentName) : sessions;
  }

  /**
   * Get usage events
   */
  getUsageEvents(agentName?: string, limit: number = 1000): typeof this.usageEvents {
    let events = agentName ? 
      this.usageEvents.filter(e => e.agentName === agentName) : 
      this.usageEvents;
    
    return events.slice(-limit);
  }

  /**
   * Clear all tracking data (for testing)
   */
  clearAllData(): void {
    this.activeSessions.clear();
    this.agentStatistics.clear();
    this.usageEvents = [];
    
    this.logger.logConfig('Agent usage tracking data cleared', {
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData agent usage tracker instance
 */
export function createNewsDataAgentUsageTracker(
  newsDataLogger?: NewsDataObservabilityLogger,
  logger?: MonitorLogger
): NewsDataAgentUsageTracker {
  return new NewsDataAgentUsageTracker(newsDataLogger, logger);
}

/**
 * Global instance for convenience
 */
let globalUsageTracker: NewsDataAgentUsageTracker | null = null;

/**
 * Get the global NewsData agent usage tracker
 */
export function getNewsDataAgentUsageTracker(): NewsDataAgentUsageTracker {
  if (!globalUsageTracker) {
    globalUsageTracker = createNewsDataAgentUsageTracker();
  }
  return globalUsageTracker;
}

/**
 * Initialize the global NewsData agent usage tracker
 */
export function initializeNewsDataAgentUsageTracker(
  newsDataLogger?: NewsDataObservabilityLogger,
  logger?: MonitorLogger
): NewsDataAgentUsageTracker {
  globalUsageTracker = createNewsDataAgentUsageTracker(newsDataLogger, logger);
  return globalUsageTracker;
}