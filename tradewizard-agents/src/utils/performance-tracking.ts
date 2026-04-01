/**
 * Agent Performance Tracking Utility
 *
 * This module provides functions for tracking and evaluating agent performance
 * over time. Performance metrics are used to adjust signal fusion weights and
 * identify underperforming agents.
 *
 * Key features:
 * - Track agent execution metrics (confidence, execution time, errors)
 * - Calculate accuracy scores when markets resolve
 * - Provide performance-based weight adjustments for signal fusion
 * - Query performance dashboards and leaderboards
 */

import type { AgentSignal, MarketId } from '../models/types.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';

/**
 * Agent Performance Metrics
 *
 * Tracks cumulative performance data for each agent
 */
export interface AgentPerformanceMetrics {
  agentName: string;
  totalAnalyses: number;
  averageConfidence: number;
  accuracyScore: number; // 0-1, based on resolved markets
  averageExecutionTime: number; // milliseconds
  errorRate: number; // 0-1
  lastUpdated: number; // timestamp
}

/**
 * Market Resolution Data
 *
 * Data needed to evaluate agent accuracy when a market resolves
 */
export interface MarketResolution {
  marketId: MarketId;
  conditionId: string;
  outcome: 'YES' | 'NO';
  resolutionTimestamp: number;
}

/**
 * Update agent performance metrics after agent execution
 *
 * This function is called after each agent execution to update cumulative metrics.
 * It tracks:
 * - Total number of analyses
 * - Average confidence
 * - Average execution time
 * - Error rate
 *
 * @param currentMetrics - Current performance metrics for the agent
 * @param signal - Agent signal from this execution
 * @param executionTime - Time taken to execute agent (ms)
 * @param hadError - Whether the agent execution resulted in an error
 * @returns Updated performance metrics
 */
export function updateAgentMetrics(
  currentMetrics: AgentPerformanceMetrics | undefined,
  signal: AgentSignal,
  executionTime: number,
  hadError: boolean
): AgentPerformanceMetrics {
  // Initialize metrics if this is the first execution
  if (!currentMetrics) {
    return {
      agentName: signal.agentName,
      totalAnalyses: 1,
      averageConfidence: signal.confidence,
      accuracyScore: 0.5, // Start with neutral accuracy
      averageExecutionTime: executionTime,
      errorRate: hadError ? 1.0 : 0.0,
      lastUpdated: Date.now(),
    };
  }

  // Calculate new averages using incremental mean formula
  const n = currentMetrics.totalAnalyses;
  const newTotalAnalyses = n + 1;

  // Update average confidence: avg_new = (avg_old * n + new_value) / (n + 1)
  const newAverageConfidence =
    (currentMetrics.averageConfidence * n + signal.confidence) / newTotalAnalyses;

  // Update average execution time
  const newAverageExecutionTime =
    (currentMetrics.averageExecutionTime * n + executionTime) / newTotalAnalyses;

  // Update error rate
  const errorCount = currentMetrics.errorRate * n + (hadError ? 1 : 0);
  const newErrorRate = errorCount / newTotalAnalyses;

  return {
    agentName: signal.agentName,
    totalAnalyses: newTotalAnalyses,
    averageConfidence: newAverageConfidence,
    accuracyScore: currentMetrics.accuracyScore, // Unchanged until market resolves
    averageExecutionTime: newAverageExecutionTime,
    errorRate: newErrorRate,
    lastUpdated: Date.now(),
  };
}

/**
 * Calculate agent accuracy score based on market resolution
 *
 * Accuracy is calculated using Brier score:
 * - For each prediction, calculate squared error: (predicted_prob - actual_outcome)^2
 * - Accuracy = 1 - average_squared_error
 * - Perfect prediction: accuracy = 1.0
 * - Random prediction: accuracy ≈ 0.5
 * - Worst prediction: accuracy = 0.0
 *
 * @param agentSignals - Historical agent signals for resolved markets
 * @param resolutions - Market resolution outcomes
 * @returns Accuracy score (0-1)
 */
export function calculateAccuracyScore(
  agentSignals: Array<{ signal: AgentSignal; marketId: MarketId }>,
  resolutions: MarketResolution[]
): number {
  if (agentSignals.length === 0) {
    return 0.5; // Neutral accuracy if no data
  }

  // Create resolution lookup map
  const resolutionMap = new Map<string, 'YES' | 'NO'>();
  for (const resolution of resolutions) {
    resolutionMap.set(String(resolution.marketId), resolution.outcome);
  }

  // Calculate Brier score for each prediction
  let totalSquaredError = 0;
  let validPredictions = 0;

  for (const { signal, marketId } of agentSignals) {
    const outcome = resolutionMap.get(String(marketId));
    if (!outcome) continue; // Skip if market not resolved

    // Convert outcome to binary: YES = 1, NO = 0
    const actualOutcome = outcome === 'YES' ? 1 : 0;

    // Agent's predicted probability for YES outcome
    const predictedProb = signal.fairProbability;

    // Calculate squared error
    const squaredError = Math.pow(predictedProb - actualOutcome, 2);
    totalSquaredError += squaredError;
    validPredictions++;
  }

  if (validPredictions === 0) {
    return 0.5; // Neutral accuracy if no valid predictions
  }

  // Average squared error (Brier score)
  const brierScore = totalSquaredError / validPredictions;

  // Convert to accuracy: 1 - Brier score
  // Brier score ranges from 0 (perfect) to 1 (worst)
  // Accuracy ranges from 1 (perfect) to 0 (worst)
  const accuracy = 1 - brierScore;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, accuracy));
}

/**
 * Evaluate agent performance on market resolution
 *
 * When a market resolves, this function updates the accuracy score for all agents
 * that analyzed that market.
 *
 * @param currentPerformance - Current performance metrics for all agents
 * @param agentSignals - Agent signals from the resolved market
 * @param resolution - Market resolution data
 * @param config - Engine configuration
 * @returns Updated performance metrics
 */
export function evaluateOnResolution(
  currentPerformance: Record<string, AgentPerformanceMetrics>,
  agentSignals: AgentSignal[],
  resolution: MarketResolution,
  config: EngineConfig
): Record<string, AgentPerformanceMetrics> {
  if (!config.performanceTracking.enabled || !config.performanceTracking.evaluateOnResolution) {
    return currentPerformance;
  }

  const updatedPerformance = { ...currentPerformance };

  // For each agent that analyzed this market, update accuracy
  for (const signal of agentSignals) {
    const metrics = updatedPerformance[signal.agentName];
    if (!metrics) continue;

    // Only update accuracy if we have enough samples
    if (metrics.totalAnalyses < config.performanceTracking.minSampleSize) {
      continue;
    }

    // Calculate accuracy for this single prediction
    const actualOutcome = resolution.outcome === 'YES' ? 1 : 0;
    const predictedProb = signal.fairProbability;
    const squaredError = Math.pow(predictedProb - actualOutcome, 2);
    const singleAccuracy = 1 - squaredError;

    // Update running accuracy using exponential moving average
    // This gives more weight to recent predictions
    const alpha = 0.1; // Smoothing factor (0.1 = 10% weight to new data)
    const newAccuracy = alpha * singleAccuracy + (1 - alpha) * metrics.accuracyScore;

    updatedPerformance[signal.agentName] = {
      ...metrics,
      accuracyScore: newAccuracy,
      lastUpdated: Date.now(),
    };
  }

  return updatedPerformance;
}

/**
 * Calculate performance-based weight adjustment
 *
 * Adjusts signal fusion weights based on agent historical accuracy.
 * - High accuracy agents (>0.7) get weight boost up to 1.5x
 * - Low accuracy agents (<0.4) get weight penalty down to 0.5x
 * - Medium accuracy agents (0.4-0.7) get neutral weight (1.0x)
 *
 * @param agentName - Name of the agent
 * @param performance - Performance metrics for all agents
 * @param config - Engine configuration
 * @returns Weight multiplier (0.5x to 1.5x)
 */
export function getPerformanceWeightAdjustment(
  agentName: string,
  performance: Record<string, AgentPerformanceMetrics>,
  config: EngineConfig
): number {
  if (!config.performanceTracking.enabled) {
    return 1.0; // No adjustment if tracking disabled
  }

  const metrics = performance[agentName];
  if (!metrics) {
    return 1.0; // No adjustment if no metrics available
  }

  // Only apply adjustment if we have enough samples
  if (metrics.totalAnalyses < config.performanceTracking.minSampleSize) {
    return 1.0;
  }

  const accuracy = metrics.accuracyScore;

  // Calculate weight multiplier based on accuracy
  // Linear interpolation:
  // - accuracy 0.0 -> 0.5x weight
  // - accuracy 0.5 -> 1.0x weight (neutral)
  // - accuracy 1.0 -> 1.5x weight
  let multiplier: number;

  if (accuracy < 0.5) {
    // Below neutral: interpolate from 0.5x to 1.0x
    multiplier = 0.5 + accuracy; // 0.0 -> 0.5, 0.5 -> 1.0
  } else {
    // Above neutral: interpolate from 1.0x to 1.5x
    multiplier = 1.0 + (accuracy - 0.5); // 0.5 -> 1.0, 1.0 -> 1.5
  }

  // Clamp to [0.5, 1.5]
  return Math.max(0.5, Math.min(1.5, multiplier));
}

/**
 * Get performance leaderboard
 *
 * Returns agents sorted by accuracy score (highest first).
 *
 * @param performance - Performance metrics for all agents
 * @param minSampleSize - Minimum analyses required to be included
 * @returns Array of agents sorted by accuracy
 */
export function getPerformanceLeaderboard(
  performance: Record<string, AgentPerformanceMetrics>,
  minSampleSize: number = 10
): AgentPerformanceMetrics[] {
  return Object.values(performance)
    .filter((metrics) => metrics.totalAnalyses >= minSampleSize)
    .sort((a, b) => b.accuracyScore - a.accuracyScore);
}

/**
 * Get performance dashboard data
 *
 * Returns comprehensive performance statistics for all agents.
 *
 * @param performance - Performance metrics for all agents
 * @returns Dashboard data with aggregated statistics
 */
export function getPerformanceDashboard(performance: Record<string, AgentPerformanceMetrics>): {
  totalAgents: number;
  averageAccuracy: number;
  topPerformer: AgentPerformanceMetrics | null;
  bottomPerformer: AgentPerformanceMetrics | null;
  agentMetrics: AgentPerformanceMetrics[];
} {
  const metrics = Object.values(performance);

  if (metrics.length === 0) {
    return {
      totalAgents: 0,
      averageAccuracy: 0,
      topPerformer: null,
      bottomPerformer: null,
      agentMetrics: [],
    };
  }

  // Calculate average accuracy
  const totalAccuracy = metrics.reduce((sum, m) => sum + m.accuracyScore, 0);
  const averageAccuracy = totalAccuracy / metrics.length;

  // Find top and bottom performers
  const sortedByAccuracy = [...metrics].sort((a, b) => b.accuracyScore - a.accuracyScore);
  const topPerformer = sortedByAccuracy[0];
  const bottomPerformer = sortedByAccuracy[sortedByAccuracy.length - 1];

  return {
    totalAgents: metrics.length,
    averageAccuracy,
    topPerformer,
    bottomPerformer,
    agentMetrics: metrics,
  };
}

/**
 * Track agent execution in graph state
 *
 * Helper function to update agent performance metrics in the graph state
 * after an agent executes.
 *
 * @param state - Current graph state
 * @param signal - Agent signal from execution
 * @param executionTime - Time taken to execute agent (ms)
 * @param hadError - Whether execution resulted in error
 * @returns Updated agentPerformance record
 */
export function trackAgentExecution(
  state: GraphStateType,
  signal: AgentSignal,
  executionTime: number,
  hadError: boolean = false
): Record<string, AgentPerformanceMetrics> {
  const currentMetrics = state.agentPerformance[signal.agentName];
  const updatedMetrics = updateAgentMetrics(currentMetrics, signal, executionTime, hadError);

  return {
    ...state.agentPerformance,
    [signal.agentName]: updatedMetrics,
  };
}
