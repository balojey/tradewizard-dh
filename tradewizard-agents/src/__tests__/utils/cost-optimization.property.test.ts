/**
 * Property-based tests for cost optimization
 * 
 * Feature: advanced-agent-league, Property 8: Cost optimization threshold enforcement
 * Validates: Requirements 13.3, 13.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  filterAgentsByCost,
  estimateAgentCost,
  AgentPriority,
  getAgentPriority,
} from './cost-optimization.js';

// All possible agent names
const ALL_AGENT_NAMES = [
  'market_microstructure',
  'probability_baseline',
  'risk_assessment',
  'breaking_news',
  'event_impact',
  'polling_intelligence',
  'historical_pattern',
  'media_sentiment',
  'social_sentiment',
  'narrative_velocity',
  'momentum',
  'mean_reversion',
  'catalyst',
  'tail_risk',
  'aggressive',
  'conservative',
  'neutral',
] as const;

/**
 * Generator for agent names
 */
const agentNameGenerator = fc.constantFrom(...ALL_AGENT_NAMES);

/**
 * Generator for agent lists (1-15 agents)
 */
const agentListGenerator = fc.array(agentNameGenerator, { minLength: 1, maxLength: 15 }).map(agents => {
  // Remove duplicates
  return Array.from(new Set(agents));
});

/**
 * Generator for cost budgets ($0.10 to $5.00)
 * Using fc.double with noNaN: true to avoid NaN, Infinity, -Infinity values
 */
const costBudgetGenerator = fc.double({ min: 0.10, max: 5.00, noNaN: true });

describe('Cost Optimization Property Tests', () => {
  /**
   * Property 8: Cost optimization threshold enforcement
   * 
   * For any market analysis with a configured maximum cost, when the estimated cost
   * exceeds the threshold, the system should skip optional agents to stay within budget.
   * 
   * Validates: Requirements 13.3, 13.4
   */
  describe('Property 8: Cost threshold enforcement', () => {
    it('should never exceed budget by more than critical agent costs when optimization is enabled', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          costBudgetGenerator,
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, true);

            // Calculate cost of critical agents
            const criticalAgents = agents.filter(
              agent => getAgentPriority(agent) === AgentPriority.CRITICAL
            );
            const criticalCost = estimateAgentCost(criticalAgents);

            // If we have critical agents, we may exceed budget to include them
            // Otherwise, we should stay within budget
            if (criticalAgents.length > 0) {
              // We can exceed budget by at most the cost of critical agents
              expect(result.estimatedCost).toBeLessThanOrEqual(maxCost + criticalCost);
            } else {
              // No critical agents, should stay within budget
              expect(result.estimatedCost).toBeLessThanOrEqual(maxCost);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include all critical priority agents regardless of budget', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          costBudgetGenerator,
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, true);

            // Find all critical agents in input
            const criticalAgents = agents.filter(
              agent => getAgentPriority(agent) === AgentPriority.CRITICAL
            );

            // All critical agents should be in selected agents
            for (const criticalAgent of criticalAgents) {
              expect(result.selectedAgents).toContain(criticalAgent);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should skip lower priority agents before higher priority agents when budget is tight', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          fc.double({ min: 0.10, max: 0.50, noNaN: true }), // Tight budget
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, true);

            // If any agents were skipped
            if (result.skippedAgents.length > 0 && result.selectedAgents.length > 0) {
              // The implementation processes agents in priority order (CRITICAL -> HIGH -> MEDIUM -> LOW)
              // and adds them until budget is exhausted. This means:
              // - All CRITICAL agents should be selected (never skipped)
              // - Within each priority level, some may be selected and some skipped based on budget
              // - But we should never skip a higher priority agent while selecting a lower priority one
              
              // Check that all CRITICAL agents are selected
              const criticalAgents = agents.filter(
                agent => getAgentPriority(agent) === AgentPriority.CRITICAL
              );
              for (const criticalAgent of criticalAgents) {
                expect(result.selectedAgents).toContain(criticalAgent);
              }

              // For each skipped agent, check if there are any selected agents with lower priority
              // (higher priority number)
              for (const skippedAgent of result.skippedAgents) {
                const skippedPriority = getAgentPriority(skippedAgent);
                
                // Find selected agents with lower priority (higher number)
                const lowerPrioritySelected = result.selectedAgents.filter(
                  agent => getAgentPriority(agent) > skippedPriority
                );

                // There should be no selected agents with lower priority than a skipped agent
                // (This would violate the priority ordering)
                expect(lowerPrioritySelected.length).toBe(0);
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return consistent results for the same input', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          costBudgetGenerator,
          (agents, maxCost) => {
            const result1 = filterAgentsByCost(agents, maxCost, true);
            const result2 = filterAgentsByCost(agents, maxCost, true);

            // Results should be identical
            expect(result1.selectedAgents).toEqual(result2.selectedAgents);
            expect(result1.skippedAgents).toEqual(result2.skippedAgents);
            expect(result1.estimatedCost).toEqual(result2.estimatedCost);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have selected + skipped agents equal to input agents', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          costBudgetGenerator,
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, true);

            // All input agents should be either selected or skipped
            const allOutputAgents = [...result.selectedAgents, ...result.skippedAgents];
            expect(allOutputAgents.sort()).toEqual(agents.sort());

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have non-negative estimated cost', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          costBudgetGenerator,
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, true);

            expect(result.estimatedCost).toBeGreaterThanOrEqual(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have cost breakdown sum equal to estimated cost', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          costBudgetGenerator,
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, true);

            const breakdownSum = Object.values(result.costBreakdown).reduce(
              (sum, cost) => sum + cost,
              0
            );

            expect(breakdownSum).toBeCloseTo(result.estimatedCost, 2);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have remaining budget equal to maxCost minus estimated cost (when under budget)', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          fc.double({ min: 2.0, max: 5.0, noNaN: true }), // Large budget
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, true);

            // If we're under budget, remaining should be exact
            if (result.estimatedCost <= maxCost) {
              expect(result.remainingBudget).toBeCloseTo(
                maxCost - result.estimatedCost,
                2
              );
            } else {
              // If over budget (due to critical agents), remaining should be 0
              expect(result.remainingBudget).toBe(0);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should select more agents with higher budget', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          (agents) => {
            // Test with low and high budget
            const lowBudget = 0.20;
            const highBudget = 5.00;

            const lowResult = filterAgentsByCost(agents, lowBudget, true);
            const highResult = filterAgentsByCost(agents, highBudget, true);

            // High budget should select at least as many agents as low budget
            expect(highResult.selectedAgents.length).toBeGreaterThanOrEqual(
              lowResult.selectedAgents.length
            );

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not skip any agents when skipLowImpact is false', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          costBudgetGenerator,
          (agents, maxCost) => {
            const result = filterAgentsByCost(agents, maxCost, false);

            // When skipLowImpact is false, all agents should be selected
            expect(result.selectedAgents.length).toBe(agents.length);
            expect(result.skippedAgents.length).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cost estimation properties', () => {
    it('should have monotonic cost estimation (more agents = more cost)', () => {
      fc.assert(
        fc.property(
          agentListGenerator,
          (agents) => {
            // Test with subset and full set
            if (agents.length > 1) {
              const subset = agents.slice(0, Math.floor(agents.length / 2));
              const fullSet = agents;

              const subsetCost = estimateAgentCost(subset);
              const fullSetCost = estimateAgentCost(fullSet);

              expect(fullSetCost).toBeGreaterThanOrEqual(subsetCost);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have additive cost estimation', () => {
      fc.assert(
        fc.property(
          agentNameGenerator,
          agentNameGenerator,
          (agent1, agent2) => {
            const cost1 = estimateAgentCost([agent1]);
            const cost2 = estimateAgentCost([agent2]);
            const combinedCost = estimateAgentCost([agent1, agent2]);

            // Combined cost should equal sum of individual costs
            expect(combinedCost).toBeCloseTo(cost1 + cost2, 2);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
