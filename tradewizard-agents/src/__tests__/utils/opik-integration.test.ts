/**
 * Unit tests for Opik Integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OpikMonitorIntegration,
  createOpikMonitorIntegration,
  formatCycleMetrics,
  formatAggregateMetrics,
  type AnalysisCycleMetrics,
} from './opik-integration.js';
import type { EngineConfig } from '../config/index.js';
import type { AgentSignal } from '../models/types.js';

describe('OpikMonitorIntegration', () => {
  let config: EngineConfig;
  let opikIntegration: OpikMonitorIntegration;

  beforeEach(() => {
    // Create minimal config for testing
    config = {
      opik: {
        projectName: 'test-project',
      },
    } as EngineConfig;

    opikIntegration = createOpikMonitorIntegration(config);
  });

  describe('createOpikHandler', () => {
    it('should create Opik callback handler with correct project name', () => {
      const handler = opikIntegration.createOpikHandler();
      expect(handler).toBeDefined();
    });
  });

  describe('cycle tracking', () => {
    it('should start a new cycle and return cycle ID', () => {
      const cycleId = opikIntegration.startCycle();
      expect(cycleId).toMatch(/^cycle_\d+$/);
    });

    it('should initialize cycle metrics when starting cycle', () => {
      opikIntegration.startCycle();
      const metrics = opikIntegration.getCurrentCycleMetrics();

      expect(metrics).toBeDefined();
      expect(metrics?.marketsDiscovered).toBe(0);
      expect(metrics?.marketsAnalyzed).toBe(0);
      expect(metrics?.marketsUpdated).toBe(0);
      expect(metrics?.totalDuration).toBe(0);
      expect(metrics?.totalCost).toBe(0);
      expect(metrics?.successCount).toBe(0);
      expect(metrics?.errorCount).toBe(0);
      expect(metrics?.agentMetrics).toEqual({});
    });

    it('should return null when getting current cycle metrics without active cycle', () => {
      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics).toBeNull();
    });

    it('should end cycle and return metrics', () => {
      opikIntegration.startCycle();
      const metrics = opikIntegration.endCycle();

      expect(metrics).toBeDefined();
      expect(metrics?.cycleId).toMatch(/^cycle_\d+$/);
    });

    it('should clear current cycle after ending', () => {
      opikIntegration.startCycle();
      opikIntegration.endCycle();

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics).toBeNull();
    });

    it('should add ended cycle to history', () => {
      opikIntegration.startCycle();
      opikIntegration.endCycle();

      const history = opikIntegration.getCycleHistory();
      expect(history).toHaveLength(1);
    });

    it('should limit cycle history to 100 entries', () => {
      // Create 105 cycles
      for (let i = 0; i < 105; i++) {
        opikIntegration.startCycle();
        opikIntegration.endCycle();
      }

      const history = opikIntegration.getCycleHistory();
      expect(history).toHaveLength(100);
    });
  });

  describe('recordDiscovery', () => {
    it('should record market discovery count', () => {
      opikIntegration.startCycle();
      opikIntegration.recordDiscovery(5);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.marketsDiscovered).toBe(5);
    });

    it('should not throw when recording discovery without active cycle', () => {
      expect(() => opikIntegration.recordDiscovery(5)).not.toThrow();
    });
  });

  describe('recordAnalysis', () => {
    it('should record successful analysis', () => {
      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('test-condition-id', 1000, 0.05, true);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.marketsAnalyzed).toBe(1);
      expect(metrics?.totalDuration).toBe(1000);
      expect(metrics?.totalCost).toBe(0.05);
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.errorCount).toBe(0);
    });

    it('should record failed analysis', () => {
      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('test-condition-id', 500, 0, false, [], 'Test error');

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.marketsAnalyzed).toBe(1);
      expect(metrics?.successCount).toBe(0);
      expect(metrics?.errorCount).toBe(1);
    });

    it('should accumulate multiple analyses', () => {
      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true);
      opikIntegration.recordAnalysis('market-2', 1500, 0.08, true);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.marketsAnalyzed).toBe(2);
      expect(metrics?.totalDuration).toBe(2500);
      expect(metrics?.totalCost).toBe(0.13);
      expect(metrics?.successCount).toBe(2);
    });

    it('should update agent metrics when agent signals provided', () => {
      const agentSignals: AgentSignal[] = [
        {
          agentName: 'test-agent',
          agentType: 'mvp',
          fairProbability: 0.6,
          confidence: 0.8,
          direction: 'LONG_YES',
          keyDrivers: [],
        },
      ];

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('test-condition-id', 1000, 0.05, true, agentSignals);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.agentMetrics['test-agent']).toBeDefined();
      expect(metrics?.agentMetrics['test-agent'].executionCount).toBe(1);
      expect(metrics?.agentMetrics['test-agent'].averageConfidence).toBe(0.8);
    });

    it('should not throw when recording analysis without active cycle', () => {
      expect(() =>
        opikIntegration.recordAnalysis('test-condition-id', 1000, 0.05, true)
      ).not.toThrow();
    });
  });

  describe('recordUpdate', () => {
    it('should record market update', () => {
      opikIntegration.startCycle();
      opikIntegration.recordUpdate('test-condition-id');

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.marketsUpdated).toBe(1);
    });

    it('should accumulate multiple updates', () => {
      opikIntegration.startCycle();
      opikIntegration.recordUpdate('market-1');
      opikIntegration.recordUpdate('market-2');
      opikIntegration.recordUpdate('market-3');

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.marketsUpdated).toBe(3);
    });

    it('should not throw when recording update without active cycle', () => {
      expect(() => opikIntegration.recordUpdate('test-condition-id')).not.toThrow();
    });
  });

  describe('agent metrics tracking', () => {
    it('should track agent execution count', () => {
      const agentSignal: AgentSignal = {
        agentName: 'test-agent',
        agentType: 'mvp',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true, [agentSignal]);
      opikIntegration.recordAnalysis('market-2', 1200, 0.06, true, [agentSignal]);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.agentMetrics['test-agent'].executionCount).toBe(2);
    });

    it('should calculate average duration correctly', () => {
      const agentSignal: AgentSignal = {
        agentName: 'test-agent',
        agentType: 'mvp',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true, [agentSignal]);
      opikIntegration.recordAnalysis('market-2', 2000, 0.06, true, [agentSignal]);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.agentMetrics['test-agent'].averageDuration).toBe(1500);
    });

    it('should calculate average cost correctly', () => {
      const agentSignal: AgentSignal = {
        agentName: 'test-agent',
        agentType: 'mvp',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true, [agentSignal]);
      opikIntegration.recordAnalysis('market-2', 1000, 0.07, true, [agentSignal]);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.agentMetrics['test-agent'].averageCost).toBeCloseTo(0.06, 2);
    });

    it('should calculate average confidence correctly', () => {
      const agentSignal1: AgentSignal = {
        agentName: 'test-agent',
        agentType: 'mvp',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      const agentSignal2: AgentSignal = {
        agentName: 'test-agent',
        agentType: 'mvp',
        fairProbability: 0.7,
        confidence: 0.6,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true, [agentSignal1]);
      opikIntegration.recordAnalysis('market-2', 1000, 0.05, true, [agentSignal2]);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.agentMetrics['test-agent'].averageConfidence).toBe(0.7);
    });

    it('should track success and error counts per agent', () => {
      const agentSignal: AgentSignal = {
        agentName: 'test-agent',
        agentType: 'mvp',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true, [agentSignal]);
      opikIntegration.recordAnalysis('market-2', 1000, 0.05, false, [agentSignal], 'Error');

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.agentMetrics['test-agent'].successCount).toBe(1);
      expect(metrics?.agentMetrics['test-agent'].errorCount).toBe(1);
    });

    it('should track multiple agents independently', () => {
      const agent1Signal: AgentSignal = {
        agentName: 'agent-1',
        agentType: 'mvp',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      const agent2Signal: AgentSignal = {
        agentName: 'agent-2',
        agentType: 'advanced',
        fairProbability: 0.7,
        confidence: 0.9,
        direction: 'LONG_NO',
        keyDrivers: [],
      };

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true, [agent1Signal, agent2Signal]);

      const metrics = opikIntegration.getCurrentCycleMetrics();
      expect(metrics?.agentMetrics['agent-1']).toBeDefined();
      expect(metrics?.agentMetrics['agent-2']).toBeDefined();
      expect(metrics?.agentMetrics['agent-1'].averageConfidence).toBe(0.8);
      expect(metrics?.agentMetrics['agent-2'].averageConfidence).toBe(0.9);
    });
  });

  describe('getAggregateMetrics', () => {
    it('should return zero metrics when no cycles recorded', () => {
      const metrics = opikIntegration.getAggregateMetrics();

      expect(metrics.totalCycles).toBe(0);
      expect(metrics.totalMarketsAnalyzed).toBe(0);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.averageCostPerMarket).toBe(0);
      expect(metrics.averageDurationPerMarket).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.topAgents).toEqual([]);
    });

    it('should calculate aggregate metrics across multiple cycles', () => {
      // Cycle 1
      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true);
      opikIntegration.recordAnalysis('market-2', 1500, 0.08, true);
      opikIntegration.endCycle();

      // Cycle 2
      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-3', 2000, 0.10, true);
      opikIntegration.endCycle();

      const metrics = opikIntegration.getAggregateMetrics();

      expect(metrics.totalCycles).toBe(2);
      expect(metrics.totalMarketsAnalyzed).toBe(3);
      expect(metrics.totalCost).toBeCloseTo(0.23, 2);
      expect(metrics.averageCostPerMarket).toBeCloseTo(0.0767, 3);
      expect(metrics.successRate).toBe(1.0);
    });

    it('should calculate success rate correctly with failures', () => {
      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.05, true);
      opikIntegration.recordAnalysis('market-2', 1000, 0.05, false, [], 'Error');
      opikIntegration.recordAnalysis('market-3', 1000, 0.05, true);
      opikIntegration.endCycle();

      const metrics = opikIntegration.getAggregateMetrics();
      expect(metrics.successRate).toBeCloseTo(0.667, 2);
    });

    it('should identify top agents by cost', () => {
      const expensiveAgent: AgentSignal = {
        agentName: 'expensive-agent',
        agentType: 'advanced',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      const cheapAgent: AgentSignal = {
        agentName: 'cheap-agent',
        agentType: 'mvp',
        fairProbability: 0.6,
        confidence: 0.8,
        direction: 'LONG_YES',
        keyDrivers: [],
      };

      opikIntegration.startCycle();
      opikIntegration.recordAnalysis('market-1', 1000, 0.10, true, [expensiveAgent]);
      opikIntegration.recordAnalysis('market-2', 500, 0.02, true, [cheapAgent]);
      opikIntegration.endCycle();

      const metrics = opikIntegration.getAggregateMetrics();
      expect(metrics.topAgents).toHaveLength(2);
      expect(metrics.topAgents[0].agentName).toBe('expensive-agent');
      expect(metrics.topAgents[1].agentName).toBe('cheap-agent');
    });
  });

  describe('getTraceUrl', () => {
    it('should generate correct trace URL with default settings', () => {
      const url = opikIntegration.getTraceUrl('test-condition-id');
      expect(url).toContain('test-project');
      expect(url).toContain('test-condition-id');
    });

    it('should include workspace in URL when set', () => {
      process.env.OPIK_WORKSPACE = 'test-workspace';
      const url = opikIntegration.getTraceUrl('test-condition-id');
      expect(url).toContain('test-workspace');
      delete process.env.OPIK_WORKSPACE;
    });

    it('should use custom base URL when set', () => {
      process.env.OPIK_BASE_URL = 'http://localhost:5000';
      const url = opikIntegration.getTraceUrl('test-condition-id');
      expect(url).toContain('localhost:5000');
      delete process.env.OPIK_BASE_URL;
    });
  });

  describe('createSpanMetadata', () => {
    it('should create span metadata with operation name', () => {
      const metadata = opikIntegration.createSpanMetadata('test-operation');

      expect(metadata.operation).toBe('test-operation');
      expect(metadata.status).toBe('in_progress');
      expect(metadata.timestamp).toBeGreaterThan(0);
    });

    it('should merge additional data into span metadata', () => {
      const metadata = opikIntegration.createSpanMetadata('test-operation', {
        conditionId: 'test-id',
        cost: 0.05,
      });

      expect(metadata.operation).toBe('test-operation');
      expect(metadata.conditionId).toBe('test-id');
      expect(metadata.cost).toBe(0.05);
    });
  });
});

describe('formatCycleMetrics', () => {
  it('should format cycle metrics as readable string', () => {
    const metrics: AnalysisCycleMetrics = {
      cycleId: 'cycle_123',
      timestamp: Date.now(),
      marketsDiscovered: 5,
      marketsAnalyzed: 3,
      marketsUpdated: 2,
      totalDuration: 10000,
      totalCost: 0.25,
      successCount: 2,
      errorCount: 1,
      agentMetrics: {},
    };

    const formatted = formatCycleMetrics(metrics);

    expect(formatted).toContain('cycle_123');
    expect(formatted).toContain('Markets Discovered: 5');
    expect(formatted).toContain('Markets Analyzed: 3');
    expect(formatted).toContain('Markets Updated: 2');
    expect(formatted).toContain('Total Cost: $0.2500');
    expect(formatted).toContain('Success: 2');
    expect(formatted).toContain('Errors: 1');
  });

  it('should include agent performance when present', () => {
    const metrics: AnalysisCycleMetrics = {
      cycleId: 'cycle_123',
      timestamp: Date.now(),
      marketsDiscovered: 5,
      marketsAnalyzed: 3,
      marketsUpdated: 2,
      totalDuration: 10000,
      totalCost: 0.25,
      successCount: 3,
      errorCount: 0,
      agentMetrics: {
        'test-agent': {
          agentName: 'test-agent',
          executionCount: 3,
          totalDuration: 3000,
          averageDuration: 1000,
          totalCost: 0.15,
          averageCost: 0.05,
          successCount: 3,
          errorCount: 0,
          averageConfidence: 0.8,
        },
      },
    };

    const formatted = formatCycleMetrics(metrics);

    expect(formatted).toContain('Agent Performance:');
    expect(formatted).toContain('test-agent');
    expect(formatted).toContain('3 executions');
  });
});

describe('formatAggregateMetrics', () => {
  it('should format aggregate metrics as readable string', () => {
    const metrics = {
      totalCycles: 10,
      totalMarketsAnalyzed: 30,
      totalCost: 2.5,
      averageCostPerMarket: 0.0833,
      averageDurationPerMarket: 5000,
      successRate: 0.95,
      topAgents: [
        { agentName: 'agent-1', averageCost: 0.10, averageDuration: 2000 },
        { agentName: 'agent-2', averageCost: 0.05, averageDuration: 1000 },
      ],
    };

    const formatted = formatAggregateMetrics(metrics);

    expect(formatted).toContain('Total Cycles: 10');
    expect(formatted).toContain('Total Markets Analyzed: 30');
    expect(formatted).toContain('Total Cost: $2.5000');
    expect(formatted).toContain('Success Rate: 95.0%');
    expect(formatted).toContain('Top Agents by Cost:');
    expect(formatted).toContain('agent-1');
    expect(formatted).toContain('agent-2');
  });
});
