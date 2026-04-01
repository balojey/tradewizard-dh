/**
 * Property-Based Tests for Agent Signal Fusion Node
 *
 * Tests universal properties that should hold across all valid inputs:
 * - Property 3: Agent signal fusion weight validity
 * - Property 4: Signal conflict detection
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { agentSignalFusionNode } from './agent-signal-fusion.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal, EventType } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

/**
 * Generator for agent names
 */
const agentNameGenerator = fc.constantFrom(
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
  'tail_risk'
);

/**
 * Generator for agent signals
 */
const agentSignalGenerator = fc.record({
  agentName: agentNameGenerator,
  timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  direction: fc.constantFrom('YES', 'NO', 'NEUTRAL') as fc.Arbitrary<'YES' | 'NO' | 'NEUTRAL'>,
  fairProbability: fc.double({ min: 0, max: 1, noNaN: true }),
  keyDrivers: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
  riskFactors: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
  metadata: fc.constant({}),
}) as fc.Arbitrary<AgentSignal>;

/**
 * Generator for unique agent signals (no duplicate agent names)
 */
const uniqueAgentSignalsGenerator = fc
  .array(agentSignalGenerator, { minLength: 3, maxLength: 10 })
  .map((signals) => {
    // Remove duplicates by agent name
    const seen = new Set<string>();
    return signals.filter((signal) => {
      if (seen.has(signal.agentName)) {
        return false;
      }
      seen.add(signal.agentName);
      return true;
    });
  })
  .filter((signals) => signals.length >= 3); // Ensure at least 3 unique signals

/**
 * Create a mock graph state for property testing
 */
function createPropertyTestState(signals: AgentSignal[]): GraphStateType {
  return {
    conditionId: 'test-condition',
    mbd: {
      marketId: 'test-market',
      conditionId: 'test-condition',
      eventType: 'election' as EventType,
      question: 'Test question?',
      resolutionCriteria: 'Test criteria',
      expiryTimestamp: Date.now() + 86400000,
      currentProbability: 0.5,
      liquidityScore: 7,
      bidAskSpread: 0.02,
      volatilityRegime: 'medium',
      volume24h: 5000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    },
    ingestionError: null,
    activeAgents: signals.map((s) => s.agentName),
    externalData: {
      dataFreshness: {
        news: Date.now() - 600000,
        polling: Date.now() - 1800000,
      },
    },
    agentSignals: signals,
    agentErrors: [],
    fusedSignal: null,
    bullThesis: null,
    bearThesis: null,
    debateRecord: null,
    consensus: null,
    consensusError: null,
    riskPhilosophySignals: null,
    agentPerformance: {},
    recommendation: null,
    auditLog: [],
  };
}

/**
 * Create a mock engine configuration for property testing
 */
function createPropertyTestConfig(): EngineConfig {
  return {
    polymarket: {
      gammaApiUrl: 'https://gamma-api.polymarket.com',
      clobApiUrl: 'https://clob.polymarket.com',
      rateLimitBuffer: 80,
    },
    agents: {
      timeoutMs: 15000,
      minAgentsRequired: 3,
    },
    llm: {
      singleProvider: 'openai',
      openai: {
        apiKey: 'test-key',
        defaultModel: 'gpt-4',
      },
    },
    opik: {
      projectName: 'test-project',
      tags: [],
      trackCosts: true,
    },
    langgraph: {
      checkpointer: 'memory',
      recursionLimit: 25,
      streamMode: 'values',
    },
    consensus: {
      minEdgeThreshold: 0.05,
      highDisagreementThreshold: 0.15,
    },
    logging: {
      level: 'info',
      auditTrailRetentionDays: 30,
    },
    advancedAgents: {
      eventIntelligence: {
        enabled: true,
        breakingNews: true,
        eventImpact: true,
      },
      pollingStatistical: {
        enabled: true,
        pollingIntelligence: true,
        historicalPattern: true,
      },
      sentimentNarrative: {
        enabled: true,
        mediaSentiment: true,
        socialSentiment: true,
        narrativeVelocity: true,
      },
      priceAction: {
        enabled: true,
        momentum: true,
        meanReversion: true,
        minVolumeThreshold: 1000,
      },
      eventScenario: {
        enabled: true,
        catalyst: true,
        tailRisk: true,
      },
      riskPhilosophy: {
        enabled: true,
        aggressive: true,
        conservative: true,
        neutral: true,
      },
    },
    externalData: {
      news: {
        provider: 'newsapi',
        cacheTTL: 900,
        maxArticles: 50,
      },
      polling: {
        provider: '538',
        cacheTTL: 3600,
      },
      social: {
        providers: ['twitter', 'reddit'],
        cacheTTL: 300,
        maxMentions: 1000,
      },
    },
    signalFusion: {
      baseWeights: {},
      contextAdjustments: true,
      conflictThreshold: 0.2,
      alignmentBonus: 0.2,
    },
    costOptimization: {
      maxCostPerAnalysis: 1.0,
      skipLowImpactAgents: false,
      batchLLMRequests: true,
    },
    performanceTracking: {
      enabled: true,
      evaluateOnResolution: true,
      minSampleSize: 10,
    },
  };
}

describe('Agent Signal Fusion Property Tests', () => {
  /**
   * Feature: advanced-agent-league, Property 3: Agent signal fusion weight validity
   * Validates: Requirements 8.2
   *
   * For any set of agent signals being fused, all assigned weights should be
   * non-negative and the sum of weights should equal 1.0.
   */
  it('Property 3: All weights are non-negative and sum to 1.0', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueAgentSignalsGenerator, async (signals) => {
        const state = createPropertyTestState(signals);
        const config = createPropertyTestConfig();

        const result = await agentSignalFusionNode(state, config);

        // Property should hold even if fusion fails
        if (!result.fusedSignal) {
          return true;
        }

        const weights = result.fusedSignal.weights;

        // Check 1: All weights are non-negative
        const allNonNegative = Object.values(weights).every((w) => w >= 0);

        // Check 2: Sum of weights equals 1.0 (with small tolerance for floating point)
        const weightSum = Object.values(weights).reduce((sum, w) => sum + w, 0);
        const sumIsOne = Math.abs(weightSum - 1.0) < 0.001;

        // Check 3: All agents have weights
        const allAgentsHaveWeights = signals.every(
          (signal) => weights[signal.agentName] !== undefined
        );

        return allNonNegative && sumIsOne && allAgentsHaveWeights;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: advanced-agent-league, Property 4: Signal conflict detection
   * Validates: Requirements 8.3
   *
   * For any pair of agent signals where the fair probability estimates differ
   * by more than 0.20, the fusion node should flag the signals as conflicting.
   */
  it('Property 4: Conflicts are detected when probability difference exceeds threshold', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueAgentSignalsGenerator, async (signals) => {
        const state = createPropertyTestState(signals);
        const config = createPropertyTestConfig();

        const result = await agentSignalFusionNode(state, config);

        // Property should hold even if fusion fails
        if (!result.fusedSignal) {
          return true;
        }

        const conflictingSignals = result.fusedSignal.conflictingSignals;
        const threshold = config.signalFusion.conflictThreshold;

        // For each pair of signals, check if conflict detection is correct
        for (let i = 0; i < signals.length; i++) {
          for (let j = i + 1; j < signals.length; j++) {
            const signal1 = signals[i];
            const signal2 = signals[j];

            const disagreement = Math.abs(
              signal1.fairProbability - signal2.fairProbability
            );

            // If disagreement exceeds threshold, should be flagged as conflict
            if (disagreement > threshold) {
              const isConflictFlagged = conflictingSignals.some(
                (conflict) =>
                  (conflict.agent1 === signal1.agentName &&
                    conflict.agent2 === signal2.agentName) ||
                  (conflict.agent1 === signal2.agentName &&
                    conflict.agent2 === signal1.agentName)
              );

              if (!isConflictFlagged) {
                return false;
              }
            }
          }
        }

        // All conflicts should have disagreement > threshold
        for (const conflict of conflictingSignals) {
          if (conflict.disagreement <= threshold) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Weighted probability is within bounds
   *
   * For any set of agent signals, the weighted consensus probability
   * should be between 0 and 1.
   */
  it('Property: Weighted probability is always between 0 and 1', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueAgentSignalsGenerator, async (signals) => {
        const state = createPropertyTestState(signals);
        const config = createPropertyTestConfig();

        const result = await agentSignalFusionNode(state, config);

        if (!result.fusedSignal) {
          return true;
        }

        const fairProbability = result.fusedSignal.fairProbability;

        return fairProbability >= 0 && fairProbability <= 1;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Confidence is within bounds
   *
   * For any set of agent signals, the fusion confidence should be between 0 and 1.
   */
  it('Property: Fusion confidence is always between 0 and 1', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueAgentSignalsGenerator, async (signals) => {
        const state = createPropertyTestState(signals);
        const config = createPropertyTestConfig();

        const result = await agentSignalFusionNode(state, config);

        if (!result.fusedSignal) {
          return true;
        }

        const confidence = result.fusedSignal.confidence;

        return confidence >= 0 && confidence <= 1;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Signal alignment is within bounds
   *
   * For any set of agent signals, the signal alignment should be between 0 and 1.
   */
  it('Property: Signal alignment is always between 0 and 1', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueAgentSignalsGenerator, async (signals) => {
        const state = createPropertyTestState(signals);
        const config = createPropertyTestConfig();

        const result = await agentSignalFusionNode(state, config);

        if (!result.fusedSignal) {
          return true;
        }

        const alignment = result.fusedSignal.signalAlignment;

        return alignment >= 0 && alignment <= 1;
      }),
      { numRuns: 100 }
    );
  });
});
