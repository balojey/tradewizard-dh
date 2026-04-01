/**
 * Unit tests for Agent Performance Tracking
 *
 * Tests cover:
 * - Performance metric calculation
 * - Accuracy evaluation on resolution
 * - Performance-based weight adjustments
 * - Performance dashboard queries
 */

import { describe, it, expect } from 'vitest';
import {
  updateAgentMetrics,
  calculateAccuracyScore,
  evaluateOnResolution,
  getPerformanceWeightAdjustment,
  getPerformanceLeaderboard,
  getPerformanceDashboard,
  trackAgentExecution,
  type AgentPerformanceMetrics,
  type MarketResolution,
} from './performance-tracking.js';
import type { AgentSignal } from '../models/types.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockSignal(
  agentName: string,
  confidence: number,
  fairProbability: number
): AgentSignal {
  return {
    agentName,
    timestamp: Date.now(),
    confidence,
    direction: fairProbability > 0.5 ? 'YES' : 'NO',
    fairProbability,
    keyDrivers: ['driver1', 'driver2'],
    riskFactors: ['risk1'],
    metadata: {},
  };
}

function createMockConfig(performanceEnabled: boolean = true): EngineConfig {
  return {
    performanceTracking: {
      enabled: performanceEnabled,
      evaluateOnResolution: true,
      minSampleSize: 10,
    },
  } as EngineConfig;
}

function createMockResolution(
  marketId: string,
  outcome: 'YES' | 'NO'
): MarketResolution {
  return {
    marketId,
    conditionId: `condition_${marketId}`,
    outcome,
    resolutionTimestamp: Date.now(),
  };
}

// ============================================================================
// updateAgentMetrics Tests
// ============================================================================

describe('updateAgentMetrics', () => {
  it('should initialize metrics for first execution', () => {
    const signal = createMockSignal('test_agent', 0.8, 0.65);
    const executionTime = 1500;

    const metrics = updateAgentMetrics(undefined, signal, executionTime, false);

    expect(metrics.agentName).toBe('test_agent');
    expect(metrics.totalAnalyses).toBe(1);
    expect(metrics.averageConfidence).toBe(0.8);
    expect(metrics.accuracyScore).toBe(0.5); // Neutral start
    expect(metrics.averageExecutionTime).toBe(1500);
    expect(metrics.errorRate).toBe(0.0);
    expect(metrics.lastUpdated).toBeGreaterThan(0);
  });

  it('should initialize metrics with error on first execution', () => {
    const signal = createMockSignal('test_agent', 0.7, 0.55);
    const executionTime = 2000;

    const metrics = updateAgentMetrics(undefined, signal, executionTime, true);

    expect(metrics.errorRate).toBe(1.0);
  });

  it('should update metrics incrementally', () => {
    const signal1 = createMockSignal('test_agent', 0.8, 0.65);
    const metrics1 = updateAgentMetrics(undefined, signal1, 1500, false);

    const signal2 = createMockSignal('test_agent', 0.6, 0.55);
    const metrics2 = updateAgentMetrics(metrics1, signal2, 2000, false);

    expect(metrics2.totalAnalyses).toBe(2);
    expect(metrics2.averageConfidence).toBe(0.7); // (0.8 + 0.6) / 2
    expect(metrics2.averageExecutionTime).toBe(1750); // (1500 + 2000) / 2
    expect(metrics2.errorRate).toBe(0.0);
  });

  it('should calculate error rate correctly', () => {
    const signal1 = createMockSignal('test_agent', 0.8, 0.65);
    const metrics1 = updateAgentMetrics(undefined, signal1, 1500, false);

    const signal2 = createMockSignal('test_agent', 0.6, 0.55);
    const metrics2 = updateAgentMetrics(metrics1, signal2, 2000, true);

    const signal3 = createMockSignal('test_agent', 0.7, 0.60);
    const metrics3 = updateAgentMetrics(metrics2, signal3, 1800, false);

    expect(metrics3.totalAnalyses).toBe(3);
    expect(metrics3.errorRate).toBeCloseTo(1 / 3, 5); // 1 error out of 3
  });

  it('should preserve accuracy score until market resolves', () => {
    const signal1 = createMockSignal('test_agent', 0.8, 0.65);
    const metrics1 = updateAgentMetrics(undefined, signal1, 1500, false);

    // Manually set accuracy
    metrics1.accuracyScore = 0.75;

    const signal2 = createMockSignal('test_agent', 0.6, 0.55);
    const metrics2 = updateAgentMetrics(metrics1, signal2, 2000, false);

    expect(metrics2.accuracyScore).toBe(0.75); // Unchanged
  });
});

// ============================================================================
// calculateAccuracyScore Tests
// ============================================================================

describe('calculateAccuracyScore', () => {
  it('should return neutral accuracy for no data', () => {
    const accuracy = calculateAccuracyScore([], []);
    expect(accuracy).toBe(0.5);
  });

  it('should calculate perfect accuracy for perfect predictions', () => {
    const signals = [
      { signal: createMockSignal('agent1', 0.9, 1.0), marketId: 'market1' },
      { signal: createMockSignal('agent1', 0.9, 0.0), marketId: 'market2' },
    ];

    const resolutions = [
      createMockResolution('market1', 'YES'),
      createMockResolution('market2', 'NO'),
    ];

    const accuracy = calculateAccuracyScore(signals, resolutions);
    expect(accuracy).toBe(1.0);
  });

  it('should calculate worst accuracy for worst predictions', () => {
    const signals = [
      { signal: createMockSignal('agent1', 0.9, 0.0), marketId: 'market1' },
      { signal: createMockSignal('agent1', 0.9, 1.0), marketId: 'market2' },
    ];

    const resolutions = [
      createMockResolution('market1', 'YES'),
      createMockResolution('market2', 'NO'),
    ];

    const accuracy = calculateAccuracyScore(signals, resolutions);
    expect(accuracy).toBe(0.0);
  });

  it('should calculate accuracy using Brier score', () => {
    const signals = [
      { signal: createMockSignal('agent1', 0.8, 0.7), marketId: 'market1' },
      { signal: createMockSignal('agent1', 0.8, 0.3), marketId: 'market2' },
    ];

    const resolutions = [
      createMockResolution('market1', 'YES'), // Predicted 0.7, actual 1.0
      createMockResolution('market2', 'NO'),  // Predicted 0.3, actual 0.0
    ];

    // Brier score = ((0.7-1)^2 + (0.3-0)^2) / 2 = (0.09 + 0.09) / 2 = 0.09
    // Accuracy = 1 - 0.09 = 0.91
    const accuracy = calculateAccuracyScore(signals, resolutions);
    expect(accuracy).toBeCloseTo(0.91, 2);
  });

  it('should skip unresolved markets', () => {
    const signals = [
      { signal: createMockSignal('agent1', 0.8, 0.7), marketId: 'market1' },
      { signal: createMockSignal('agent1', 0.8, 0.3), marketId: 'market2' },
      { signal: createMockSignal('agent1', 0.8, 0.5), marketId: 'market3' },
    ];

    const resolutions = [
      createMockResolution('market1', 'YES'),
      // market2 not resolved
      createMockResolution('market3', 'NO'),
    ];

    // Only market1 and market3 should be included
    const accuracy = calculateAccuracyScore(signals, resolutions);
    expect(accuracy).toBeGreaterThan(0);
  });

  it('should return neutral accuracy if no valid predictions', () => {
    const signals = [
      { signal: createMockSignal('agent1', 0.8, 0.7), marketId: 'market1' },
    ];

    const resolutions = [
      createMockResolution('market2', 'YES'), // Different market
    ];

    const accuracy = calculateAccuracyScore(signals, resolutions);
    expect(accuracy).toBe(0.5);
  });
});

// ============================================================================
// evaluateOnResolution Tests
// ============================================================================

describe('evaluateOnResolution', () => {
  it('should not update if performance tracking disabled', () => {
    const config = createMockConfig(false);
    const currentPerformance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.6,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const signals = [createMockSignal('agent1', 0.8, 0.7)];
    const resolution = createMockResolution('market1', 'YES');

    const updated = evaluateOnResolution(currentPerformance, signals, resolution, config);

    expect(updated.agent1.accuracyScore).toBe(0.6); // Unchanged
  });

  it('should not update if below minimum sample size', () => {
    const config = createMockConfig(true);
    const currentPerformance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 5, // Below minSampleSize of 10
        averageConfidence: 0.8,
        accuracyScore: 0.5,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const signals = [createMockSignal('agent1', 0.8, 0.7)];
    const resolution = createMockResolution('market1', 'YES');

    const updated = evaluateOnResolution(currentPerformance, signals, resolution, config);

    expect(updated.agent1.accuracyScore).toBe(0.5); // Unchanged
  });

  it('should update accuracy using exponential moving average', () => {
    const config = createMockConfig(true);
    const currentPerformance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.6,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now() - 1000,
      },
    };

    const signals = [createMockSignal('agent1', 0.8, 0.9)];
    const resolution = createMockResolution('market1', 'YES');

    const updated = evaluateOnResolution(currentPerformance, signals, resolution, config);

    // Single accuracy for this prediction: 1 - (0.9 - 1)^2 = 1 - 0.01 = 0.99
    // EMA: 0.1 * 0.99 + 0.9 * 0.6 = 0.099 + 0.54 = 0.639
    expect(updated.agent1.accuracyScore).toBeCloseTo(0.639, 2);
    expect(updated.agent1.lastUpdated).toBeGreaterThan(currentPerformance.agent1.lastUpdated);
  });

  it('should handle multiple agents', () => {
    const config = createMockConfig(true);
    const currentPerformance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.6,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
      agent2: {
        agentName: 'agent2',
        totalAnalyses: 20,
        averageConfidence: 0.7,
        accuracyScore: 0.7,
        averageExecutionTime: 2000,
        errorRate: 0.05,
        lastUpdated: Date.now(),
      },
    };

    const signals = [
      createMockSignal('agent1', 0.8, 0.9),
      createMockSignal('agent2', 0.7, 0.8),
    ];
    const resolution = createMockResolution('market1', 'YES');

    const updated = evaluateOnResolution(currentPerformance, signals, resolution, config);

    expect(updated.agent1.accuracyScore).not.toBe(0.6);
    expect(updated.agent2.accuracyScore).not.toBe(0.7);
  });
});

// ============================================================================
// getPerformanceWeightAdjustment Tests
// ============================================================================

describe('getPerformanceWeightAdjustment', () => {
  it('should return 1.0 if performance tracking disabled', () => {
    const config = createMockConfig(false);
    const performance: Record<string, AgentPerformanceMetrics> = {};

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    expect(adjustment).toBe(1.0);
  });

  it('should return 1.0 if no metrics available', () => {
    const config = createMockConfig(true);
    const performance: Record<string, AgentPerformanceMetrics> = {};

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    expect(adjustment).toBe(1.0);
  });

  it('should return 1.0 if below minimum sample size', () => {
    const config = createMockConfig(true);
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 5,
        averageConfidence: 0.8,
        accuracyScore: 0.9,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    expect(adjustment).toBe(1.0);
  });

  it('should return 1.0 for neutral accuracy (0.5)', () => {
    const config = createMockConfig(true);
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.5,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    expect(adjustment).toBe(1.0);
  });

  it('should return 1.5 for perfect accuracy (1.0)', () => {
    const config = createMockConfig(true);
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 1.0,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    expect(adjustment).toBe(1.5);
  });

  it('should return 0.5 for worst accuracy (0.0)', () => {
    const config = createMockConfig(true);
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.0,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    expect(adjustment).toBe(0.5);
  });

  it('should interpolate correctly for high accuracy', () => {
    const config = createMockConfig(true);
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.75, // Above neutral
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    // 1.0 + (0.75 - 0.5) = 1.25
    expect(adjustment).toBe(1.25);
  });

  it('should interpolate correctly for low accuracy', () => {
    const config = createMockConfig(true);
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.3, // Below neutral
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
    };

    const adjustment = getPerformanceWeightAdjustment('agent1', performance, config);
    // 0.5 + 0.3 = 0.8
    expect(adjustment).toBe(0.8);
  });
});

// ============================================================================
// getPerformanceLeaderboard Tests
// ============================================================================

describe('getPerformanceLeaderboard', () => {
  it('should return empty array for no metrics', () => {
    const leaderboard = getPerformanceLeaderboard({}, 10);
    expect(leaderboard).toEqual([]);
  });

  it('should filter by minimum sample size', () => {
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 5,
        averageConfidence: 0.8,
        accuracyScore: 0.9,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
      agent2: {
        agentName: 'agent2',
        totalAnalyses: 15,
        averageConfidence: 0.7,
        accuracyScore: 0.7,
        averageExecutionTime: 2000,
        errorRate: 0.05,
        lastUpdated: Date.now(),
      },
    };

    const leaderboard = getPerformanceLeaderboard(performance, 10);
    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].agentName).toBe('agent2');
  });

  it('should sort by accuracy descending', () => {
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.6,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
      agent2: {
        agentName: 'agent2',
        totalAnalyses: 20,
        averageConfidence: 0.7,
        accuracyScore: 0.9,
        averageExecutionTime: 2000,
        errorRate: 0.05,
        lastUpdated: Date.now(),
      },
      agent3: {
        agentName: 'agent3',
        totalAnalyses: 12,
        averageConfidence: 0.75,
        accuracyScore: 0.75,
        averageExecutionTime: 1800,
        errorRate: 0.08,
        lastUpdated: Date.now(),
      },
    };

    const leaderboard = getPerformanceLeaderboard(performance, 10);
    expect(leaderboard).toHaveLength(3);
    expect(leaderboard[0].agentName).toBe('agent2'); // 0.9
    expect(leaderboard[1].agentName).toBe('agent3'); // 0.75
    expect(leaderboard[2].agentName).toBe('agent1'); // 0.6
  });
});

// ============================================================================
// getPerformanceDashboard Tests
// ============================================================================

describe('getPerformanceDashboard', () => {
  it('should return empty dashboard for no metrics', () => {
    const dashboard = getPerformanceDashboard({});
    expect(dashboard.totalAgents).toBe(0);
    expect(dashboard.averageAccuracy).toBe(0);
    expect(dashboard.topPerformer).toBeNull();
    expect(dashboard.bottomPerformer).toBeNull();
    expect(dashboard.agentMetrics).toEqual([]);
  });

  it('should calculate dashboard statistics', () => {
    const performance: Record<string, AgentPerformanceMetrics> = {
      agent1: {
        agentName: 'agent1',
        totalAnalyses: 15,
        averageConfidence: 0.8,
        accuracyScore: 0.6,
        averageExecutionTime: 1500,
        errorRate: 0.1,
        lastUpdated: Date.now(),
      },
      agent2: {
        agentName: 'agent2',
        totalAnalyses: 20,
        averageConfidence: 0.7,
        accuracyScore: 0.9,
        averageExecutionTime: 2000,
        errorRate: 0.05,
        lastUpdated: Date.now(),
      },
      agent3: {
        agentName: 'agent3',
        totalAnalyses: 12,
        averageConfidence: 0.75,
        accuracyScore: 0.75,
        averageExecutionTime: 1800,
        errorRate: 0.08,
        lastUpdated: Date.now(),
      },
    };

    const dashboard = getPerformanceDashboard(performance);
    expect(dashboard.totalAgents).toBe(3);
    expect(dashboard.averageAccuracy).toBeCloseTo((0.6 + 0.9 + 0.75) / 3, 2);
    expect(dashboard.topPerformer?.agentName).toBe('agent2');
    expect(dashboard.bottomPerformer?.agentName).toBe('agent1');
    expect(dashboard.agentMetrics).toHaveLength(3);
  });
});

// ============================================================================
// trackAgentExecution Tests
// ============================================================================

describe('trackAgentExecution', () => {
  it('should track agent execution in graph state', () => {
    const state = {
      agentPerformance: {},
    } as unknown as GraphStateType;

    const signal = createMockSignal('agent1', 0.8, 0.65);
    const executionTime = 1500;

    const updated = trackAgentExecution(state, signal, executionTime, false);

    expect(updated.agent1).toBeDefined();
    expect(updated.agent1.agentName).toBe('agent1');
    expect(updated.agent1.totalAnalyses).toBe(1);
    expect(updated.agent1.averageConfidence).toBe(0.8);
  });

  it('should preserve existing agent metrics', () => {
    const existingMetrics: AgentPerformanceMetrics = {
      agentName: 'agent2',
      totalAnalyses: 10,
      averageConfidence: 0.7,
      accuracyScore: 0.65,
      averageExecutionTime: 2000,
      errorRate: 0.05,
      lastUpdated: Date.now(),
    };

    const state = {
      agentPerformance: {
        agent2: existingMetrics,
      },
    } as unknown as GraphStateType;

    const signal = createMockSignal('agent1', 0.8, 0.65);
    const executionTime = 1500;

    const updated = trackAgentExecution(state, signal, executionTime, false);

    expect(updated.agent1).toBeDefined();
    expect(updated.agent2).toEqual(existingMetrics);
  });
});
