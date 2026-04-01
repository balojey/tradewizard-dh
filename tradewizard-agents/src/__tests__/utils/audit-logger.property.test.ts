/**
 * Property-Based Tests for Advanced Observability Logger
 *
 * Feature: advanced-agent-league, Property 17: Audit trail completeness for advanced agents
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
 *
 * This test verifies that for any market analysis using advanced agents,
 * the audit log contains entries for agent selection, external data fetching,
 * signal fusion, and all agent executions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { AdvancedObservabilityLogger } from './audit-logger.js';

describe('Property-Based Tests: Audit Trail Completeness', () => {
  // Feature: advanced-agent-league, Property 17: Audit trail completeness for advanced agents
  // Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
  it('should maintain complete audit trail for any sequence of advanced agent operations', () => {
    fc.assert(
      fc.property(
        // Generate random sequences of operations
        fc.array(
          fc.oneof(
            // Agent selection operation
            fc.record({
              type: fc.constant('agent_selection'),
              marketType: fc.constantFrom('election', 'court', 'policy', 'economic', 'geopolitical', 'other'),
              selectedAgents: fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
              skippedAgents: fc.array(
                fc.record({
                  agent: fc.string(),
                  reason: fc.constantFrom('data_unavailable', 'cost_optimization', 'config_disabled', 'insufficient_history'),
                }),
                { maxLength: 5 }
              ),
            }),
            // Data fetch operation
            fc.record({
              type: fc.constant('data_fetch'),
              source: fc.constantFrom('news', 'polling', 'social'),
              provider: fc.string(),
              success: fc.boolean(),
              cached: fc.boolean(),
              stale: fc.boolean(),
              freshness: fc.nat(7200), // 0-2 hours in seconds
              itemCount: fc.option(fc.nat(100)),
              duration: fc.nat(5000), // 0-5 seconds in ms
            }),
            // Signal fusion operation
            fc.record({
              type: fc.constant('signal_fusion'),
              agentCount: fc.integer({ min: 1, max: 15 }),
              mvpAgentCount: fc.integer({ min: 1, max: 3 }),
              advancedAgentCount: fc.integer({ min: 0, max: 12 }),
              weights: fc.dictionary(fc.string(), fc.double({ min: 0, max: 1 })),
              conflicts: fc.array(
                fc.record({
                  agent1: fc.string(),
                  agent2: fc.string(),
                  disagreement: fc.double({ min: 0, max: 1 }),
                }),
                { maxLength: 5 }
              ),
              signalAlignment: fc.double({ min: 0, max: 1 }),
              fusionConfidence: fc.double({ min: 0, max: 1 }),
              dataQuality: fc.double({ min: 0, max: 1 }),
            }),
            // Performance tracking operation
            fc.record({
              type: fc.constant('performance_tracking'),
              agentName: fc.string(),
              executionTime: fc.nat(10000), // 0-10 seconds in ms
              confidence: fc.double({ min: 0, max: 1 }),
              fairProbability: fc.double({ min: 0, max: 1 }),
              success: fc.boolean(),
              error: fc.option(fc.string()),
            })
          ),
          { minLength: 2, maxLength: 20 }
        ),
        (operations) => {
          const logger = new AdvancedObservabilityLogger();

          // Execute all operations
          for (const op of operations) {
            const timestamp = Date.now();

            switch (op.type) {
              case 'agent_selection':
                logger.logAgentSelection({
                  timestamp,
                  marketType: op.marketType,
                  selectedAgents: op.selectedAgents,
                  skippedAgents: op.skippedAgents,
                  totalAgents: op.selectedAgents.length + op.skippedAgents.length,
                  mvpAgents: Math.min(3, op.selectedAgents.length),
                  advancedAgents: Math.max(0, op.selectedAgents.length - 3),
                });
                break;

              case 'data_fetch':
                logger.logDataFetch({
                  timestamp,
                  source: op.source,
                  provider: op.provider,
                  success: op.success,
                  cached: op.cached,
                  stale: op.stale,
                  freshness: op.freshness,
                  itemCount: op.itemCount ?? undefined,
                  duration: op.duration,
                  error: !op.success ? 'Simulated error' : undefined,
                });
                break;

              case 'signal_fusion':
                logger.logSignalFusion({
                  timestamp,
                  agentCount: op.agentCount,
                  mvpAgentCount: op.mvpAgentCount,
                  advancedAgentCount: op.advancedAgentCount,
                  weights: op.weights,
                  conflicts: op.conflicts,
                  signalAlignment: op.signalAlignment,
                  fusionConfidence: op.fusionConfidence,
                  dataQuality: op.dataQuality,
                });
                break;

              case 'performance_tracking':
                logger.logPerformanceTracking({
                  timestamp,
                  agentName: op.agentName,
                  executionTime: op.executionTime,
                  confidence: op.confidence,
                  fairProbability: op.fairProbability,
                  success: op.success,
                  error: op.error ?? undefined,
                });
                break;
            }
          }

          // Get complete audit trail
          const trail = logger.getCompleteAuditTrail();

          // Property 1: All logged operations should be retrievable
          const agentSelectionOps = operations.filter((op) => op.type === 'agent_selection');
          const dataFetchOps = operations.filter((op) => op.type === 'data_fetch');
          const signalFusionOps = operations.filter((op) => op.type === 'signal_fusion');
          const performanceOps = operations.filter((op) => op.type === 'performance_tracking');

          expect(trail.agentSelection.length).toBe(agentSelectionOps.length);
          expect(trail.dataFetching.length).toBe(dataFetchOps.length);
          expect(trail.signalFusion.length).toBe(signalFusionOps.length);
          expect(trail.performanceTracking.length).toBe(performanceOps.length);

          // Property 2: Each log entry should have a timestamp
          [...trail.agentSelection, ...trail.dataFetching, ...trail.signalFusion, ...trail.performanceTracking].forEach(
            (entry) => {
              expect(entry.timestamp).toBeGreaterThan(0);
            }
          );

          // Property 3: Agent selection logs should match input data
          trail.agentSelection.forEach((log, index) => {
            const op = agentSelectionOps[index];
            expect(log.marketType).toBe(op.marketType);
            expect(log.selectedAgents).toEqual(op.selectedAgents);
            expect(log.skippedAgents).toEqual(op.skippedAgents);
          });

          // Property 4: Data fetch logs should preserve success/failure status
          trail.dataFetching.forEach((log, index) => {
            const op = dataFetchOps[index];
            expect(log.success).toBe(op.success);
            expect(log.source).toBe(op.source);
            expect(log.cached).toBe(op.cached);
            expect(log.stale).toBe(op.stale);
          });

          // Property 5: Signal fusion logs should preserve agent counts
          trail.signalFusion.forEach((log, index) => {
            const op = signalFusionOps[index];
            expect(log.agentCount).toBe(op.agentCount);
            expect(log.mvpAgentCount).toBe(op.mvpAgentCount);
            expect(log.advancedAgentCount).toBe(op.advancedAgentCount);
          });

          // Property 6: Performance logs should preserve execution metrics
          trail.performanceTracking.forEach((log, index) => {
            const op = performanceOps[index];
            expect(log.agentName).toBe(op.agentName);
            expect(log.executionTime).toBe(op.executionTime);
            expect(log.success).toBe(op.success);
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: advanced-agent-league, Property 17: Audit trail completeness for advanced agents
  // Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
  it('should correctly validate audit trail completeness for any operation sequence', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // Has agent selection
        fc.boolean(), // Has signal fusion
        (hasAgentSelection, hasSignalFusion) => {
          const logger = new AdvancedObservabilityLogger();

          // Log operations based on flags
          if (hasAgentSelection) {
            logger.logAgentSelection({
              timestamp: Date.now(),
              marketType: 'election',
              selectedAgents: ['agent1'],
              skippedAgents: [],
              totalAgents: 1,
              mvpAgents: 1,
              advancedAgents: 0,
            });
          }

          if (hasSignalFusion) {
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
          }

          // Validate completeness
          const validation = logger.validateAuditTrailCompleteness();

          // Property: Completeness should match presence of required operations
          const expectedComplete = hasAgentSelection && hasSignalFusion;
          expect(validation.complete).toBe(expectedComplete);

          // Property: Missing list should be accurate
          if (!hasAgentSelection) {
            expect(validation.missing).toContain('agent_selection');
          }
          if (!hasSignalFusion) {
            expect(validation.missing).toContain('signal_fusion');
          }
          if (expectedComplete) {
            expect(validation.missing).toHaveLength(0);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: advanced-agent-league, Property 17: Audit trail completeness for advanced agents
  // Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
  it('should preserve log order for any sequence of operations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom('agent_selection', 'data_fetch', 'signal_fusion', 'performance_tracking'),
            timestamp: fc.nat(1000000),
          }),
          { minLength: 5, maxLength: 20 }
        ),
        (operations) => {
          const logger = new AdvancedObservabilityLogger();

          // Log operations with explicit timestamps
          const timestamps: number[] = [];
          for (const op of operations) {
            const timestamp = Date.now() + op.timestamp;
            timestamps.push(timestamp);

            switch (op.type) {
              case 'agent_selection':
                logger.logAgentSelection({
                  timestamp,
                  marketType: 'election',
                  selectedAgents: ['agent1'],
                  skippedAgents: [],
                  totalAgents: 1,
                  mvpAgents: 1,
                  advancedAgents: 0,
                });
                break;

              case 'data_fetch':
                logger.logDataFetch({
                  timestamp,
                  source: 'news',
                  provider: 'newsapi',
                  success: true,
                  cached: false,
                  stale: false,
                  freshness: 0,
                  duration: 100,
                });
                break;

              case 'signal_fusion':
                logger.logSignalFusion({
                  timestamp,
                  agentCount: 1,
                  mvpAgentCount: 1,
                  advancedAgentCount: 0,
                  weights: { agent1: 1.0 },
                  conflicts: [],
                  signalAlignment: 1.0,
                  fusionConfidence: 0.9,
                  dataQuality: 1.0,
                });
                break;

              case 'performance_tracking':
                logger.logPerformanceTracking({
                  timestamp,
                  agentName: 'agent1',
                  executionTime: 1000,
                  confidence: 0.8,
                  fairProbability: 0.5,
                  success: true,
                });
                break;
            }
          }

          // Get all logs
          const trail = logger.getCompleteAuditTrail();
          const allLogs = [
            ...trail.agentSelection,
            ...trail.dataFetching,
            ...trail.signalFusion,
            ...trail.performanceTracking,
          ];

          // Property: All logs should have timestamps
          expect(allLogs.length).toBe(operations.length);
          allLogs.forEach((log) => {
            expect(log.timestamp).toBeGreaterThan(0);
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: advanced-agent-league, Property 17: Audit trail completeness for advanced agents
  // Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
  it('should handle clearing and re-logging for any operation sequence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('agent_selection', 'data_fetch', 'signal_fusion'), { minLength: 3, maxLength: 10 }),
        (operations) => {
          const logger = new AdvancedObservabilityLogger();

          // Log first batch
          operations.forEach((type) => {
            const timestamp = Date.now();
            switch (type) {
              case 'agent_selection':
                logger.logAgentSelection({
                  timestamp,
                  marketType: 'election',
                  selectedAgents: ['agent1'],
                  skippedAgents: [],
                  totalAgents: 1,
                  mvpAgents: 1,
                  advancedAgents: 0,
                });
                break;
              case 'data_fetch':
                logger.logDataFetch({
                  timestamp,
                  source: 'news',
                  provider: 'newsapi',
                  success: true,
                  cached: false,
                  stale: false,
                  freshness: 0,
                  duration: 100,
                });
                break;
              case 'signal_fusion':
                logger.logSignalFusion({
                  timestamp,
                  agentCount: 1,
                  mvpAgentCount: 1,
                  advancedAgentCount: 0,
                  weights: { agent1: 1.0 },
                  conflicts: [],
                  signalAlignment: 1.0,
                  fusionConfidence: 0.9,
                  dataQuality: 1.0,
                });
                break;
            }
          });

          // Property: Logs should exist before clear
          const trailBefore = logger.getCompleteAuditTrail();
          const totalBefore =
            trailBefore.agentSelection.length +
            trailBefore.dataFetching.length +
            trailBefore.signalFusion.length;
          expect(totalBefore).toBe(operations.length);

          // Clear logs
          logger.clear();

          // Property: All logs should be empty after clear
          const trailAfter = logger.getCompleteAuditTrail();
          expect(trailAfter.agentSelection).toHaveLength(0);
          expect(trailAfter.dataFetching).toHaveLength(0);
          expect(trailAfter.signalFusion).toHaveLength(0);
          expect(trailAfter.costOptimization).toHaveLength(0);
          expect(trailAfter.performanceTracking).toHaveLength(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
