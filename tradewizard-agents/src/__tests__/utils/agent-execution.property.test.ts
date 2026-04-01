/**
 * Property-based tests for agent execution error handling
 * 
 * Feature: advanced-agent-league
 * Property 10: Agent timeout isolation
 * Validates: Requirements 14.3
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  executeAgentWithTimeout,
  executeAgentsInParallel,
  filterSuccessfulSignals,
} from './agent-execution.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';

describe('Agent Execution Property Tests', () => {
  const mockState: GraphStateType = {
    mbd: {
      marketId: 'test-market',
      conditionId: 'test-condition',
      question: 'Test question?',
      resolutionCriteria: 'Test criteria',
      expiryTimestamp: Date.now() + 86400000,
      volume24h: 10000,
      liquidityScore: 8,
      bidAskSpread: 0.01,
      currentProbability: 0.5,
      eventType: 'election',
      volatilityRegime: 'medium',
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    },
    agentSignals: [],
    auditLog: [],
  };

  const createMockSignal = (agentName: string): AgentSignal => ({
    agentName,
    timestamp: Date.now(),
    confidence: 0.8,
    direction: 'YES',
    fairProbability: 0.6,
    keyDrivers: ['Test driver'],
    riskFactors: ['Test risk'],
    reasoning: 'Test reasoning',
  });

  describe('Property 10: Agent timeout isolation', () => {
    it('should isolate timeout in single agent execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }), // timeout in ms
          fc.integer({ min: 60, max: 200 }), // agent delay in ms
          async (timeout, delay) => {
            const agentFn = vi.fn().mockImplementation(
              () => new Promise((resolve) => setTimeout(resolve, delay))
            );

            const result = await executeAgentWithTimeout('test_agent', agentFn, mockState, timeout);

            // Agent should timeout
            expect(result.success).toBe(false);
            expect(result.timedOut).toBe(true);
            expect(result.error).toContain('timed out');
            // Duration should be close to timeout (within 20ms tolerance)
            expect(result.duration).toBeGreaterThanOrEqual(timeout);
            expect(result.duration).toBeLessThan(timeout + 50);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should isolate timeouts in parallel agent execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // number of agents
          fc.integer({ min: 10, max: 30 }), // timeout in ms
          async (agentCount, timeout) => {
            // Create mix of fast and slow agents
            const agents = [];
            for (let i = 0; i < agentCount; i++) {
              const isSlow = i % 2 === 0; // Every other agent is slow
              const delay = isSlow ? timeout + 50 : timeout - 10;
              
              agents.push({
                name: `agent${i}`,
                fn: vi.fn().mockImplementation(() => {
                  if (isSlow) {
                    return new Promise((resolve) => setTimeout(resolve, delay));
                  } else {
                    return Promise.resolve({
                      agentSignals: [createMockSignal(`agent${i}`)],
                    });
                  }
                }),
              });
            }

            const results = await executeAgentsInParallel(agents, mockState, timeout);

            // Should have results for all agents
            expect(results.length).toBe(agentCount);

            // Fast agents should succeed
            const successfulResults = results.filter((r) => r.success);
            expect(successfulResults.length).toBeGreaterThan(0);

            // Slow agents should timeout
            const timedOutResults = results.filter((r) => r.timedOut);
            expect(timedOutResults.length).toBeGreaterThan(0);

            // All results should be present (no crashes)
            expect(results.every((r) => r.duration >= 0)).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should allow successful agents to complete despite other timeouts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 8 }), // number of agents
          fc.integer({ min: 20, max: 40 }), // timeout in ms
          async (agentCount, timeout) => {
            // Create agents: some fast, some slow
            const agents = [];
            let expectedSuccessful = 0;

            for (let i = 0; i < agentCount; i++) {
              const willTimeout = i < Math.floor(agentCount / 2);
              
              if (willTimeout) {
                agents.push({
                  name: `slow_agent${i}`,
                  fn: vi.fn().mockImplementation(
                    () => new Promise((resolve) => setTimeout(resolve, timeout + 100))
                  ),
                });
              } else {
                expectedSuccessful++;
                agents.push({
                  name: `fast_agent${i}`,
                  fn: vi.fn().mockResolvedValue({
                    agentSignals: [createMockSignal(`fast_agent${i}`)],
                  }),
                });
              }
            }

            const results = await executeAgentsInParallel(agents, mockState, timeout);

            // Filter successful signals
            const signals = filterSuccessfulSignals(results);

            // Should have signals from fast agents
            expect(signals.length).toBe(expectedSuccessful);

            // All successful signals should be valid
            signals.forEach((signal) => {
              expect(signal.agentName).toMatch(/fast_agent/);
              expect(signal.confidence).toBeGreaterThan(0);
              expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
              expect(signal.fairProbability).toBeLessThanOrEqual(1);
            });
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should not crash when all agents timeout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // number of agents
          fc.integer({ min: 10, max: 30 }), // timeout in ms
          async (agentCount, timeout) => {
            // Create all slow agents
            const agents = [];
            for (let i = 0; i < agentCount; i++) {
              agents.push({
                name: `agent${i}`,
                fn: vi.fn().mockImplementation(
                  () => new Promise((resolve) => setTimeout(resolve, timeout + 100))
                ),
              });
            }

            const results = await executeAgentsInParallel(agents, mockState, timeout);

            // Should have results for all agents
            expect(results.length).toBe(agentCount);

            // All should have timed out
            expect(results.every((r) => r.timedOut)).toBe(true);
            expect(results.every((r) => !r.success)).toBe(true);

            // No signals should be returned
            const signals = filterSuccessfulSignals(results);
            expect(signals.length).toBe(0);

            // System should not crash (test completes successfully)
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle varying timeout durations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 100 }), // timeout in ms
          fc.integer({ min: 5, max: 50 }), // agent delay in ms
          async (timeout, delay) => {
            const agentFn = vi.fn().mockImplementation(
              () => new Promise((resolve) => {
                setTimeout(() => {
                  resolve({ agentSignals: [createMockSignal('test_agent')] });
                }, delay);
              })
            );

            const result = await executeAgentWithTimeout('test_agent', agentFn, mockState, timeout);

            if (delay < timeout) {
              // Agent should complete successfully
              expect(result.success).toBe(true);
              expect(result.timedOut).toBeUndefined();
              expect(result.signal).toBeDefined();
            } else {
              // Agent should timeout
              expect(result.success).toBe(false);
              expect(result.timedOut).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
