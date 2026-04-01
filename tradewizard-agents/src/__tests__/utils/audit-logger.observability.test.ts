/**
 * Unit Tests for Advanced Observability Logger
 *
 * Tests the AdvancedObservabilityLogger class and its logging capabilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AdvancedObservabilityLogger } from './audit-logger.js';

describe('AdvancedObservabilityLogger', () => {
  let logger: AdvancedObservabilityLogger;

  beforeEach(() => {
    logger = new AdvancedObservabilityLogger();
  });

  describe('Agent Selection Logging', () => {
    it('should log agent selection decisions', () => {
      logger.logAgentSelection({
        timestamp: Date.now(),
        marketType: 'election',
        selectedAgents: ['market_microstructure', 'probability_baseline', 'polling_intelligence'],
        skippedAgents: [
          { agent: 'breaking_news', reason: 'data_unavailable' },
          { agent: 'momentum', reason: 'insufficient_history' },
        ],
        totalAgents: 5,
        mvpAgents: 3,
        advancedAgents: 2,
      });

      const logs = logger.getAgentSelectionLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].marketType).toBe('election');
      expect(logs[0].selectedAgents).toHaveLength(3);
      expect(logs[0].skippedAgents).toHaveLength(2);
      expect(logs[0].mvpAgents).toBe(3);
      expect(logs[0].advancedAgents).toBe(2);
    });

    it('should track multiple agent selection decisions', () => {
      logger.logAgentSelection({
        timestamp: Date.now(),
        marketType: 'election',
        selectedAgents: ['market_microstructure'],
        skippedAgents: [],
        totalAgents: 1,
        mvpAgents: 1,
        advancedAgents: 0,
      });

      logger.logAgentSelection({
        timestamp: Date.now(),
        marketType: 'court',
        selectedAgents: ['market_microstructure', 'breaking_news'],
        skippedAgents: [],
        totalAgents: 2,
        mvpAgents: 1,
        advancedAgents: 1,
      });

      const logs = logger.getAgentSelectionLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].marketType).toBe('election');
      expect(logs[1].marketType).toBe('court');
    });
  });

  describe('Data Fetch Logging', () => {
    it('should log successful data fetch with cache hit', () => {
      logger.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsapi',
        success: true,
        cached: true,
        stale: false,
        freshness: 300, // 5 minutes
        itemCount: 10,
        duration: 50,
      });

      const logs = logger.getDataFetchLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].source).toBe('news');
      expect(logs[0].success).toBe(true);
      expect(logs[0].cached).toBe(true);
      expect(logs[0].stale).toBe(false);
      expect(logs[0].itemCount).toBe(10);
    });

    it('should log failed data fetch with error', () => {
      logger.logDataFetch({
        timestamp: Date.now(),
        source: 'polling',
        provider: '538',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        error: 'API rate limit exceeded',
        duration: 100,
      });

      const logs = logger.getDataFetchLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBe('API rate limit exceeded');
    });

    it('should log stale cache usage', () => {
      logger.logDataFetch({
        timestamp: Date.now(),
        source: 'social',
        provider: 'twitter',
        success: true,
        cached: true,
        stale: true,
        freshness: 3600, // 1 hour
        itemCount: 50,
        duration: 10,
      });

      const logs = logger.getDataFetchLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].cached).toBe(true);
      expect(logs[0].stale).toBe(true);
      expect(logs[0].freshness).toBe(3600);
    });
  });

  describe('Signal Fusion Logging', () => {
    it('should log signal fusion process', () => {
      logger.logSignalFusion({
        timestamp: Date.now(),
        agentCount: 5,
        mvpAgentCount: 3,
        advancedAgentCount: 2,
        weights: {
          market_microstructure: 0.3,
          probability_baseline: 0.3,
          risk_assessment: 0.2,
          polling_intelligence: 0.15,
          breaking_news: 0.05,
        },
        conflicts: [
          {
            agent1: 'probability_baseline',
            agent2: 'polling_intelligence',
            disagreement: 0.25,
          },
        ],
        signalAlignment: 0.75,
        fusionConfidence: 0.82,
        dataQuality: 0.9,
      });

      const logs = logger.getSignalFusionLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].agentCount).toBe(5);
      expect(logs[0].mvpAgentCount).toBe(3);
      expect(logs[0].advancedAgentCount).toBe(2);
      expect(logs[0].conflicts).toHaveLength(1);
      expect(logs[0].signalAlignment).toBe(0.75);
      expect(logs[0].fusionConfidence).toBe(0.82);
    });

    it('should track weight distribution', () => {
      const weights = {
        agent1: 0.5,
        agent2: 0.3,
        agent3: 0.2,
      };

      logger.logSignalFusion({
        timestamp: Date.now(),
        agentCount: 3,
        mvpAgentCount: 3,
        advancedAgentCount: 0,
        weights,
        conflicts: [],
        signalAlignment: 1.0,
        fusionConfidence: 0.95,
        dataQuality: 1.0,
      });

      const logs = logger.getSignalFusionLogs();
      expect(logs[0].weights).toEqual(weights);
      const weightSum = Object.values(logs[0].weights).reduce((a, b) => a + b, 0);
      expect(weightSum).toBeCloseTo(1.0, 5);
    });
  });

  describe('Cost Optimization Logging', () => {
    it('should log cost optimization decisions', () => {
      logger.logCostOptimization({
        timestamp: Date.now(),
        estimatedCost: 0.75,
        maxCost: 0.50,
        skippedAgents: ['narrative_velocity', 'tail_risk'],
        totalAgents: 8,
        activeAgents: 6,
        costSavings: 0.25,
      });

      const logs = logger.getCostOptimizationLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].estimatedCost).toBe(0.75);
      expect(logs[0].maxCost).toBe(0.50);
      expect(logs[0].skippedAgents).toHaveLength(2);
      expect(logs[0].costSavings).toBe(0.25);
    });

    it('should track cost savings accurately', () => {
      logger.logCostOptimization({
        timestamp: Date.now(),
        estimatedCost: 1.20,
        maxCost: 0.80,
        skippedAgents: ['agent1', 'agent2', 'agent3'],
        totalAgents: 10,
        activeAgents: 7,
        costSavings: 0.40,
      });

      const logs = logger.getCostOptimizationLogs();
      expect(logs[0].costSavings).toBe(0.40);
      expect(logs[0].activeAgents).toBe(7);
      expect(logs[0].skippedAgents).toHaveLength(3);
    });
  });

  describe('Performance Tracking Logging', () => {
    it('should log successful agent execution', () => {
      logger.logPerformanceTracking({
        timestamp: Date.now(),
        agentName: 'polling_intelligence',
        executionTime: 1500,
        confidence: 0.85,
        fairProbability: 0.62,
        success: true,
      });

      const logs = logger.getPerformanceTrackingLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].agentName).toBe('polling_intelligence');
      expect(logs[0].executionTime).toBe(1500);
      expect(logs[0].confidence).toBe(0.85);
      expect(logs[0].success).toBe(true);
    });

    it('should log failed agent execution', () => {
      logger.logPerformanceTracking({
        timestamp: Date.now(),
        agentName: 'breaking_news',
        executionTime: 500,
        confidence: 0,
        fairProbability: 0,
        success: false,
        error: 'API timeout',
      });

      const logs = logger.getPerformanceTrackingLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBe('API timeout');
    });

    it('should track multiple agent executions', () => {
      const agents = ['agent1', 'agent2', 'agent3'];
      agents.forEach((agent) => {
        logger.logPerformanceTracking({
          timestamp: Date.now(),
          agentName: agent,
          executionTime: 1000,
          confidence: 0.8,
          fairProbability: 0.5,
          success: true,
        });
      });

      const logs = logger.getPerformanceTrackingLogs();
      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.agentName)).toEqual(agents);
    });
  });

  describe('Complete Audit Trail', () => {
    it('should provide complete audit trail', () => {
      // Log various events
      logger.logAgentSelection({
        timestamp: Date.now(),
        marketType: 'election',
        selectedAgents: ['agent1', 'agent2'],
        skippedAgents: [],
        totalAgents: 2,
        mvpAgents: 2,
        advancedAgents: 0,
      });

      logger.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsapi',
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 5,
        duration: 200,
      });

      logger.logSignalFusion({
        timestamp: Date.now(),
        agentCount: 2,
        mvpAgentCount: 2,
        advancedAgentCount: 0,
        weights: { agent1: 0.5, agent2: 0.5 },
        conflicts: [],
        signalAlignment: 1.0,
        fusionConfidence: 0.9,
        dataQuality: 1.0,
      });

      const trail = logger.getCompleteAuditTrail();
      expect(trail.agentSelection).toHaveLength(1);
      expect(trail.dataFetching).toHaveLength(1);
      expect(trail.signalFusion).toHaveLength(1);
      expect(trail.costOptimization).toHaveLength(0);
      expect(trail.performanceTracking).toHaveLength(0);
    });

    it('should clear all logs', () => {
      logger.logAgentSelection({
        timestamp: Date.now(),
        marketType: 'election',
        selectedAgents: [],
        skippedAgents: [],
        totalAgents: 0,
        mvpAgents: 0,
        advancedAgents: 0,
      });

      logger.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsapi',
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        duration: 100,
      });

      logger.clear();

      expect(logger.getAgentSelectionLogs()).toHaveLength(0);
      expect(logger.getDataFetchLogs()).toHaveLength(0);
      expect(logger.getSignalFusionLogs()).toHaveLength(0);
      expect(logger.getCostOptimizationLogs()).toHaveLength(0);
      expect(logger.getPerformanceTrackingLogs()).toHaveLength(0);
    });
  });

  describe('Audit Trail Completeness Validation', () => {
    it('should validate complete audit trail', () => {
      logger.logAgentSelection({
        timestamp: Date.now(),
        marketType: 'election',
        selectedAgents: ['agent1'],
        skippedAgents: [],
        totalAgents: 1,
        mvpAgents: 1,
        advancedAgents: 0,
      });

      logger.logSignalFusion({
        timestamp: Date.now(),
        agentCount: 1,
        mvpAgentCount: 1,
        advancedAgentCount: 0,
        weights: { agent1: 1.0 },
        conflicts: [],
        signalAlignment: 1.0,
        fusionConfidence: 0.9,
        dataQuality: 1.0,
      });

      const validation = logger.validateAuditTrailCompleteness();
      expect(validation.complete).toBe(true);
      expect(validation.missing).toHaveLength(0);
    });

    it('should detect missing agent selection', () => {
      logger.logSignalFusion({
        timestamp: Date.now(),
        agentCount: 1,
        mvpAgentCount: 1,
        advancedAgentCount: 0,
        weights: { agent1: 1.0 },
        conflicts: [],
        signalAlignment: 1.0,
        fusionConfidence: 0.9,
        dataQuality: 1.0,
      });

      const validation = logger.validateAuditTrailCompleteness();
      expect(validation.complete).toBe(false);
      expect(validation.missing).toContain('agent_selection');
    });

    it('should detect missing signal fusion', () => {
      logger.logAgentSelection({
        timestamp: Date.now(),
        marketType: 'election',
        selectedAgents: ['agent1'],
        skippedAgents: [],
        totalAgents: 1,
        mvpAgents: 1,
        advancedAgents: 0,
      });

      const validation = logger.validateAuditTrailCompleteness();
      expect(validation.complete).toBe(false);
      expect(validation.missing).toContain('signal_fusion');
    });

    it('should handle empty audit trail', () => {
      const validation = logger.validateAuditTrailCompleteness();
      expect(validation.complete).toBe(false);
      expect(validation.missing).toContain('agent_selection');
      expect(validation.missing).toContain('signal_fusion');
    });
  });
});
