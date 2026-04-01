/**
 * Property-Based Tests for Agent Performance Tracking
 *
 * Feature: advanced-agent-league, Property 7: Agent performance tracking accuracy
 * Validates: Requirements 10.2, 10.3
 *
 * Property: For any resolved market where agents produced signals, the system
 * should calculate accuracy metrics for each agent based on the actual outcome.
 *
 * This property test verifies that:
 * 1. Accuracy scores are always in the valid range [0, 1]
 * 2. Perfect predictions yield accuracy = 1.0
 * 3. Worst predictions yield accuracy = 0.0
 * 4. Accuracy calculation is consistent and deterministic
 * 5. Performance metrics are updated correctly on resolution
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  calculateAccuracyScore,
  evaluateOnResolution,
  type AgentPerformanceMetrics,
  type MarketResolution,
} from './performance-tracking.js';
import type { AgentSignal } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a valid agent signal
 */
const agentSignalGenerator = (agentName: string): fc.Arbitrary<AgentSignal> =>
  fc.record({
    agentName: fc.constant(agentName),
    timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    direction: fc.constantFrom('YES' as const, 'NO' as const, 'NEUTRAL' as const),
    fairProbability: fc.double({ min: 0, max: 1, noNaN: true }),
    keyDrivers: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
    riskFactors: fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
    metadata: fc.constant({}),
  });

/**
 * Generate a market resolution
 */
const marketResolutionGenerator = (marketId: string): fc.Arbitrary<MarketResolution> =>
  fc.record({
    marketId: fc.constant(marketId),
    conditionId: fc.constant(`condition_${marketId}`),
    outcome: fc.constantFrom('YES' as const, 'NO' as const),
    resolutionTimestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
  });

/**
 * Generate agent performance metrics
 */
const agentPerformanceMetricsGenerator = (
  agentName: string
): fc.Arbitrary<AgentPerformanceMetrics> =>
  fc.record({
    agentName: fc.constant(agentName),
    totalAnalyses: fc.integer({ min: 10, max: 1000 }), // Above minSampleSize
    averageConfidence: fc.double({ min: 0, max: 1, noNaN: true }),
    accuracyScore: fc.double({ min: 0, max: 1, noNaN: true }),
    averageExecutionTime: fc.integer({ min: 100, max: 10000 }),
    errorRate: fc.double({ min: 0, max: 1, noNaN: true }),
    lastUpdated: fc.integer({ min: 1000000000000, max: 9999999999999 }),
  });

/**
 * Generate a mock config
 */
const configGenerator = (): fc.Arbitrary<EngineConfig> =>
  fc.record({
    performanceTracking: fc.record({
      enabled: fc.constant(true),
      evaluateOnResolution: fc.constant(true),
      minSampleSize: fc.constant(10),
    }),
  }) as fc.Arbitrary<EngineConfig>;

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 7: Agent performance tracking accuracy', () => {
  it('should always produce accuracy scores in valid range [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }),
            agentSignalGenerator('test_agent')
          ),
          { minLength: 1, maxLength: 50 }
        ),
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }),
            marketResolutionGenerator('market')
          ),
          { minLength: 1, maxLength: 50 }
        ),
        (signalPairs, resolutionPairs) => {
          // Convert to expected format
          const signals = signalPairs.map(([marketId, signal]) => ({
            signal,
            marketId,
          }));
          const resolutions = resolutionPairs.map(([marketId, resolution]) => ({
            ...resolution,
            marketId,
          }));

          const accuracy = calculateAccuracyScore(signals, resolutions);

          // Accuracy must be in [0, 1]
          return accuracy >= 0 && accuracy <= 1 && !isNaN(accuracy);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce accuracy = 1.0 for perfect predictions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.constantFrom('YES' as const, 'NO' as const),
        (marketIds, outcome) => {
          // Create perfect predictions: probability matches outcome
          const perfectProb = outcome === 'YES' ? 1.0 : 0.0;

          const signals = marketIds.map((marketId) => ({
            signal: {
              agentName: 'perfect_agent',
              timestamp: Date.now(),
              confidence: 1.0,
              direction: outcome,
              fairProbability: perfectProb,
              keyDrivers: ['driver1'],
              riskFactors: [],
              metadata: {},
            } as AgentSignal,
            marketId,
          }));

          const resolutions = marketIds.map((marketId) => ({
            marketId,
            conditionId: `condition_${marketId}`,
            outcome,
            resolutionTimestamp: Date.now(),
          }));

          const accuracy = calculateAccuracyScore(signals, resolutions);

          // Perfect predictions should yield accuracy = 1.0
          return Math.abs(accuracy - 1.0) < 0.001;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce accuracy = 0.0 for worst predictions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.constantFrom('YES' as const, 'NO' as const),
        (marketIds, outcome) => {
          // Create worst predictions: probability is opposite of outcome
          const worstProb = outcome === 'YES' ? 0.0 : 1.0;

          const signals = marketIds.map((marketId) => ({
            signal: {
              agentName: 'worst_agent',
              timestamp: Date.now(),
              confidence: 1.0,
              direction: outcome === 'YES' ? ('NO' as const) : ('YES' as const),
              fairProbability: worstProb,
              keyDrivers: ['driver1'],
              riskFactors: [],
              metadata: {},
            } as AgentSignal,
            marketId,
          }));

          const resolutions = marketIds.map((marketId) => ({
            marketId,
            conditionId: `condition_${marketId}`,
            outcome,
            resolutionTimestamp: Date.now(),
          }));

          const accuracy = calculateAccuracyScore(signals, resolutions);

          // Worst predictions should yield accuracy = 0.0
          return Math.abs(accuracy - 0.0) < 0.001;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be deterministic: same inputs produce same accuracy', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }),
            agentSignalGenerator('test_agent'),
            marketResolutionGenerator('market')
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (triples) => {
          const signals = triples.map(([marketId, signal]) => ({
            signal,
            marketId,
          }));
          const resolutions = triples.map(([marketId, , resolution]) => ({
            ...resolution,
            marketId,
          }));

          // Calculate accuracy twice
          const accuracy1 = calculateAccuracyScore(signals, resolutions);
          const accuracy2 = calculateAccuracyScore(signals, resolutions);

          // Should be identical
          return accuracy1 === accuracy2;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update performance metrics correctly on resolution', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 10, max: 1000 }), // totalAnalyses
        fc.double({ min: 0, max: 1, noNaN: true }), // averageConfidence
        fc.double({ min: 0, max: 1, noNaN: true }), // accuracyScore
        fc.integer({ min: 100, max: 10000 }), // averageExecutionTime
        fc.double({ min: 0, max: 1, noNaN: true }), // errorRate
        agentSignalGenerator('test_agent'),
        marketResolutionGenerator('market1'),
        configGenerator(),
        (
          agentName,
          totalAnalyses,
          averageConfidence,
          accuracyScore,
          averageExecutionTime,
          errorRate,
          signal,
          resolution,
          config
        ) => {
          // Use current time for lastUpdated to avoid future timestamps
          const lastUpdated = Date.now() - 1000; // 1 second in the past
          
          // Create metrics with the generated agentName
          const initialMetrics: AgentPerformanceMetrics = {
            agentName,
            totalAnalyses,
            averageConfidence,
            accuracyScore,
            averageExecutionTime,
            errorRate,
            lastUpdated,
          };

          // Use the generated agentName consistently
          const currentPerformance = {
            [agentName]: initialMetrics,
          };

          // Update signal to use the generated agentName
          const signals = [{ ...signal, agentName }];
          const updatedPerformance = evaluateOnResolution(
            currentPerformance,
            signals,
            resolution,
            config
          );

          // Performance should be updated
          const updated = updatedPerformance[agentName];
          
          // Check if updated exists
          if (!updated) {
            return false;
          }

          // Accuracy should be in valid range
          const accuracyValid = updated.accuracyScore >= 0 && updated.accuracyScore <= 1;

          // Last updated should be more recent (since we set it to past time)
          const timestampUpdated = updated.lastUpdated >= initialMetrics.lastUpdated;

          // Other metrics should be preserved
          const metricsPreserved =
            updated.totalAnalyses === initialMetrics.totalAnalyses &&
            updated.averageConfidence === initialMetrics.averageConfidence &&
            updated.averageExecutionTime === initialMetrics.averageExecutionTime &&
            updated.errorRate === initialMetrics.errorRate;

          return accuracyValid && timestampUpdated && metricsPreserved;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty signal sets gracefully', () => {
    fc.assert(
      fc.property(
        fc.array(marketResolutionGenerator('market'), { minLength: 0, maxLength: 10 }),
        (resolutions) => {
          const accuracy = calculateAccuracyScore([], resolutions);

          // Empty signals should return neutral accuracy
          return accuracy === 0.5;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty resolution sets gracefully', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), agentSignalGenerator('agent')),
          { minLength: 1, maxLength: 10 }
        ),
        (signalPairs) => {
          const signals = signalPairs.map(([marketId, signal]) => ({
            signal,
            marketId,
          }));

          const accuracy = calculateAccuracyScore(signals, []);

          // No resolutions should return neutral accuracy
          return accuracy === 0.5;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate accuracy using Brier score correctly', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.double({ min: 0, max: 1, noNaN: true }),
            fc.constantFrom('YES' as const, 'NO' as const)
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (triples) => {
          const signals = triples.map(([marketId, prob, outcome]) => ({
            signal: {
              agentName: 'test_agent',
              timestamp: Date.now(),
              confidence: 0.8,
              direction: prob > 0.5 ? ('YES' as const) : ('NO' as const),
              fairProbability: prob,
              keyDrivers: ['driver1'],
              riskFactors: [],
              metadata: {},
            } as AgentSignal,
            marketId,
          }));

          const resolutions = triples.map(([marketId, , outcome]) => ({
            marketId,
            conditionId: `condition_${marketId}`,
            outcome,
            resolutionTimestamp: Date.now(),
          }));

          const accuracy = calculateAccuracyScore(signals, resolutions);

          // Calculate expected Brier score manually
          let totalSquaredError = 0;
          for (const [, prob, outcome] of triples) {
            const actualOutcome = outcome === 'YES' ? 1 : 0;
            const squaredError = Math.pow(prob - actualOutcome, 2);
            totalSquaredError += squaredError;
          }
          const expectedBrierScore = totalSquaredError / triples.length;
          const expectedAccuracy = 1 - expectedBrierScore;

          // Accuracy should match expected calculation
          return Math.abs(accuracy - expectedAccuracy) < 0.001;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should only evaluate agents with sufficient sample size', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 9 }), // Below minSampleSize of 10
        agentSignalGenerator('test_agent'),
        marketResolutionGenerator('market1'),
        configGenerator(),
        (agentName, totalAnalyses, signal, resolution, config) => {
          const initialMetrics: AgentPerformanceMetrics = {
            agentName,
            totalAnalyses,
            averageConfidence: 0.8,
            accuracyScore: 0.5,
            averageExecutionTime: 1500,
            errorRate: 0.1,
            lastUpdated: Date.now() - 1000,
          };

          const currentPerformance = { [agentName]: initialMetrics };
          const signals = [{ ...signal, agentName }];

          const updatedPerformance = evaluateOnResolution(
            currentPerformance,
            signals,
            resolution,
            config
          );

          // Accuracy should not change if below minSampleSize
          return updatedPerformance[agentName].accuracyScore === initialMetrics.accuracyScore;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve accuracy score symmetry: YES and NO outcomes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (marketIds, probability) => {
          // Test with YES outcome
          const signalsYes = marketIds.map((marketId) => ({
            signal: {
              agentName: 'test_agent',
              timestamp: Date.now(),
              confidence: 0.8,
              direction: 'YES' as const,
              fairProbability: probability,
              keyDrivers: ['driver1'],
              riskFactors: [],
              metadata: {},
            } as AgentSignal,
            marketId,
          }));

          const resolutionsYes = marketIds.map((marketId) => ({
            marketId,
            conditionId: `condition_${marketId}`,
            outcome: 'YES' as const,
            resolutionTimestamp: Date.now(),
          }));

          const accuracyYes = calculateAccuracyScore(signalsYes, resolutionsYes);

          // Test with NO outcome (inverted probability)
          const signalsNo = marketIds.map((marketId) => ({
            signal: {
              agentName: 'test_agent',
              timestamp: Date.now(),
              confidence: 0.8,
              direction: 'NO' as const,
              fairProbability: 1 - probability,
              keyDrivers: ['driver1'],
              riskFactors: [],
              metadata: {},
            } as AgentSignal,
            marketId,
          }));

          const resolutionsNo = marketIds.map((marketId) => ({
            marketId,
            conditionId: `condition_${marketId}`,
            outcome: 'NO' as const,
            resolutionTimestamp: Date.now(),
          }));

          const accuracyNo = calculateAccuracyScore(signalsNo, resolutionsNo);

          // Accuracy should be the same for symmetric predictions
          return Math.abs(accuracyYes - accuracyNo) < 0.001;
        }
      ),
      { numRuns: 100 }
    );
  });
});
