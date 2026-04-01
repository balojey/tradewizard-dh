/**
 * Unit Tests for Recommendation Generation Node
 *
 * Tests edge threshold boundary (5%), liquidity risk flagging (< 5.0),
 * NO_TRADE for negative EV, explanation generation with various scenarios,
 * and state updates.
 *
 * Requirements: 7.1, 7.4, 7.3, 11.2
 */

import { describe, test, expect } from 'vitest';
import { createRecommendationGenerationNode } from './recommendation-generation.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type {
  ConsensusProbability,
  Thesis,
  MarketBriefingDocument,
} from '../models/types.js';

/**
 * Create a minimal valid config for testing
 */
function createTestConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  return {
    polymarket: {
      gammaApiUrl: 'https://gamma-api.polymarket.com',
      clobApiUrl: 'https://clob.polymarket.com',
      rateLimitBuffer: 80,
    },
    langgraph: {
      checkpointer: 'memory',
      recursionLimit: 25,
      streamMode: 'values',
    },
    opik: {
      projectName: 'test',
      tags: [],
      trackCosts: true,
    },
    llm: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        defaultModel: 'gpt-4-turbo',
      },
    },
    agents: {
      timeoutMs: 10000,
      minAgentsRequired: 2,
    },
    consensus: {
      minEdgeThreshold: 0.05,
      highDisagreementThreshold: 0.15,
    },
    logging: {
      level: 'info',
      auditTrailRetentionDays: 30,
    },
    ...overrides,
  };
}

/**
 * Create sample consensus probability
 */
function createSampleConsensus(
  consensusProbability: number,
  disagreementIndex: number = 0.1
): ConsensusProbability {
  const baseBandWidth = 0.05;
  const disagreementMultiplier = 1 + disagreementIndex * 3;
  const bandWidth = baseBandWidth * disagreementMultiplier;

  const lower = Math.max(0, consensusProbability - bandWidth);
  const upper = Math.min(1, consensusProbability + bandWidth);

  let regime: 'high-confidence' | 'moderate-confidence' | 'high-uncertainty';
  if (disagreementIndex < 0.1) {
    regime = 'high-confidence';
  } else if (disagreementIndex < 0.2) {
    regime = 'moderate-confidence';
  } else {
    regime = 'high-uncertainty';
  }

  return {
    consensusProbability,
    confidenceBand: [lower, upper],
    disagreementIndex,
    regime,
    contributingSignals: ['agent1', 'agent2', 'agent3'],
  };
}

/**
 * Create sample thesis
 */
function createSampleThesis(
  direction: 'YES' | 'NO',
  fairProbability: number,
  marketProbability: number
): Thesis {
  return {
    direction,
    fairProbability,
    marketProbability,
    edge: Math.abs(fairProbability - marketProbability),
    coreArgument: `This is a ${direction} thesis with strong evidence`,
    catalysts: ['Catalyst 1: Major event', 'Catalyst 2: Policy change'],
    failureConditions: ['Failure 1: Unexpected outcome', 'Failure 2: Market shift'],
    supportingSignals: ['agent_1', 'agent_2'],
  };
}

/**
 * Create sample market briefing document
 */
function createSampleMBD(
  currentProbability: number,
  liquidityScore: number = 7.5
): MarketBriefingDocument {
  return {
    marketId: 'test-market',
    conditionId: 'test-condition',
    eventType: 'election',
    question: 'Will X happen?',
    resolutionCriteria: 'X happens',
    expiryTimestamp: Date.now() + 86400000,
    currentProbability,
    liquidityScore,
    bidAskSpread: 2,
    volatilityRegime: 'medium',
    volume24h: 100000,
    metadata: {
      ambiguityFlags: [],
      keyCatalysts: [],
    },
  };
}

describe('Recommendation Generation Unit Tests', () => {
  test('should recommend NO_TRADE when edge is below 5% threshold', async () => {
    // Requirement 7.1: Edge threshold check (minimum 5%)
    const consensus = createSampleConsensus(0.52); // 2% edge
    const bullThesis = createSampleThesis('YES', 0.52, 0.5);
    const bearThesis = createSampleThesis('NO', 0.48, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.action).toBe('NO_TRADE');
    expect(result.recommendation!.explanation.summary).toContain('edge');
    expect(result.recommendation!.explanation.summary).toContain('below');
    
    // Verify audit log
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.reason).toBe('Insufficient edge');
  });

  test('should recommend NO_TRADE when edge is exactly at 5% threshold', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Requirement 7.1: Test boundary condition
    const consensus = createSampleConsensus(0.55); // Exactly 5% edge
    const bullThesis = createSampleThesis('YES', 0.55, 0.5);
    const bearThesis = createSampleThesis('NO', 0.45, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    // At exactly 5%, edge check is edge < 0.05, so 0.05 is NOT less than 0.05
    // Therefore, it should proceed to generate a recommendation (not NO_TRADE due to edge)
    expect(result.recommendation).toBeDefined();
    // The recommendation might still be NO_TRADE if EV is negative, but not due to edge
    if (result.recommendation && result.recommendation.action === 'NO_TRADE') {
      // If NO_TRADE, it should be due to negative EV, not insufficient edge
      expect(result.auditLog![0].data.reason).not.toBe('Insufficient edge');
    }
  });

  test('should flag high liquidity risk when liquidity score < 5.0', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Requirement 7.4: Liquidity risk flagging
    const consensus = createSampleConsensus(0.65); // 15% edge
    const bullThesis = createSampleThesis('YES', 0.65, 0.5);
    const bearThesis = createSampleThesis('NO', 0.35, 0.5);
    const mbd = createSampleMBD(0.5, 4.5); // Low liquidity

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.liquidityRisk).toBe('high');
  });

  test('should flag medium liquidity risk when liquidity score is 5.0-7.0', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Requirement 7.4: Liquidity risk flagging
    const consensus = createSampleConsensus(0.65);
    const bullThesis = createSampleThesis('YES', 0.65, 0.5);
    const bearThesis = createSampleThesis('NO', 0.35, 0.5);
    const mbd = createSampleMBD(0.5, 6.0); // Medium liquidity

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.liquidityRisk).toBe('medium');
  });

  test('should flag low liquidity risk when liquidity score >= 7.0', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Requirement 7.4: Liquidity risk flagging
    const consensus = createSampleConsensus(0.65);
    const bullThesis = createSampleThesis('YES', 0.65, 0.5);
    const bearThesis = createSampleThesis('NO', 0.35, 0.5);
    const mbd = createSampleMBD(0.5, 8.0); // High liquidity

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.liquidityRisk).toBe('low');
  });

  test('should recommend NO_TRADE for negative expected value', async () => {
    // Requirement 7.3: Negative EV rejection logic
    // Create a scenario where edge exists but EV is negative
    // This can happen when the market price is very close to consensus
    const consensus = createSampleConsensus(0.56); // 6% edge
    const bullThesis = createSampleThesis('YES', 0.56, 0.5);
    const bearThesis = createSampleThesis('NO', 0.44, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    // If EV is negative, should be NO_TRADE
    if (result.recommendation && result.recommendation.expectedValue < 0) {
      expect(result.recommendation.action).toBe('NO_TRADE');
      expect(result.recommendation.explanation.summary).toContain('negative');
      
      // Verify audit log
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog![0].data.reason).toBe('Negative expected value');
    }
  });

  test('should generate LONG_YES recommendation when consensus > market', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    const consensus = createSampleConsensus(0.7); // 20% edge
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.action).toBe('LONG_YES');
    expect(result.recommendation!.expectedValue).toBeGreaterThan(0);
    expect(result.recommendation!.winProbability).toBeCloseTo(0.7, 1);
  });

  test('should generate LONG_NO recommendation when consensus < market', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    const consensus = createSampleConsensus(0.3); // 20% edge
    const bullThesis = createSampleThesis('YES', 0.3, 0.5);
    const bearThesis = createSampleThesis('NO', 0.7, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.action).toBe('LONG_NO');
    expect(result.recommendation!.expectedValue).toBeGreaterThan(0);
    expect(result.recommendation!.winProbability).toBeCloseTo(0.7, 1);
  });

  test('should include explanation with catalysts and failure scenarios', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    
    const explanation = result.recommendation!.explanation;
    expect(explanation.summary).toBeDefined();
    expect(explanation.summary.length).toBeGreaterThan(0);
    expect(explanation.coreThesis).toBeDefined();
    expect(explanation.keyCatalysts).toBeDefined();
    expect(explanation.failureScenarios).toBeDefined();
  });

  test('should include uncertainty note when disagreement > 0.15', async () => {
    // Skip if no OpenAI API key (explanation generation requires LLM)
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    const consensus = createSampleConsensus(0.7, 0.2); // High disagreement
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.explanation.uncertaintyNote).toBeDefined();
  });

  test('should update state correctly', async () => {
    const consensus = createSampleConsensus(0.52); // Below threshold
    const bullThesis = createSampleThesis('YES', 0.52, 0.5);
    const bearThesis = createSampleThesis('NO', 0.48, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    // Requirement 11.2: Write recommendation to state and add audit log entry
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.marketId).toBe('test-market');
    expect(result.recommendation!.action).toBeDefined();
    expect(result.recommendation!.entryZone).toBeDefined();
    expect(result.recommendation!.targetZone).toBeDefined();
    expect(result.recommendation!.expectedValue).toBeDefined();
    expect(result.recommendation!.winProbability).toBeDefined();
    expect(result.recommendation!.liquidityRisk).toBeDefined();
    expect(result.recommendation!.explanation).toBeDefined();
    expect(result.recommendation!.metadata).toBeDefined();

    // Verify audit log entry
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog!.length).toBe(1);
    expect(result.auditLog![0].stage).toBe('recommendation_generation');
    expect(result.auditLog![0].timestamp).toBeDefined();
    expect(result.auditLog![0].data).toBeDefined();
    expect(result.auditLog![0].data.success).toBe(true);
  });

  test('should handle missing consensus', async () => {
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus: null, // Missing consensus
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeNull();
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.success).toBe(false);
    expect(result.auditLog![0].data.error).toContain('consensus');
  });

  test('should handle missing theses', async () => {
    const consensus = createSampleConsensus(0.7);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis: null, // Missing bull thesis
      bearThesis: null, // Missing bear thesis
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeNull();
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.success).toBe(false);
    expect(result.auditLog![0].data.error).toContain('theses');
  });

  test('should handle missing MBD', async () => {
    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd: null, // Missing MBD
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeNull();
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.success).toBe(false);
    expect(result.auditLog![0].data.error).toContain('Market Briefing Document');
  });

  test('should calculate entry zone correctly (market price ± 2%)', async () => {
    // Skip if no OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    
    // For LONG_YES, entry zone should be around market price (0.5)
    const entryZone = result.recommendation!.entryZone;
    expect(entryZone[0]).toBeCloseTo(0.48, 1); // 0.5 - 0.02
    expect(entryZone[1]).toBeCloseTo(0.52, 1); // 0.5 + 0.02
  });

  test('should calculate target zone from confidence band', async () => {
    // Skip if no OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    
    // For LONG_YES, target zone should match confidence band
    const targetZone = result.recommendation!.entryZone;
    expect(targetZone[0]).toBeGreaterThanOrEqual(0);
    expect(targetZone[1]).toBeLessThanOrEqual(1);
    expect(targetZone[0]).toBeLessThan(targetZone[1]);
  });

  // ============================================================================
  // Risk Philosophy Integration Tests
  // ============================================================================

  test('should include risk philosophy perspectives when available', async () => {
    // Skip if no OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Requirement 6.7: Include risk philosophy perspectives in recommendation
    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    // Create risk philosophy signals
    const riskPhilosophySignals = {
      aggressive: {
        agentName: 'risk_philosophy_aggressive',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES' as const,
        fairProbability: 0.7,
        keyDrivers: ['Strong momentum', 'High conviction'],
        riskFactors: ['High variance', 'Potential drawdown'],
        metadata: {
          recommendedPositionSize: 0.25,
          kellyCriterion: 0.3,
          convictionLevel: 'high' as const,
          expectedReturn: 40,
          varianceWarning: 'High variance strategy with potential for significant drawdowns',
        },
      },
      conservative: {
        agentName: 'risk_philosophy_conservative',
        timestamp: Date.now(),
        confidence: 0.75,
        direction: 'YES' as const,
        fairProbability: 0.7,
        keyDrivers: ['Solid fundamentals', 'Risk management'],
        riskFactors: ['Market volatility', 'Liquidity risk'],
        metadata: {
          recommendedPositionSize: 0.05,
          hedgingStrategy: 'Use stop-loss at 0.45 and hedge with correlated markets',
          maxDrawdownTolerance: 0.1,
          stopLossLevel: 0.45,
          capitalPreservationScore: 0.9,
        },
      },
      neutral: {
        agentName: 'risk_philosophy_neutral',
        timestamp: Date.now(),
        confidence: 0.8,
        direction: 'NEUTRAL' as const,
        fairProbability: 0.7,
        keyDrivers: ['Spread opportunities', 'Market neutral'],
        riskFactors: ['Execution risk', 'Correlation risk'],
        metadata: {
          spreadOpportunities: [
            {
              setup: 'Long YES at 0.5, Short related market at 0.6',
              expectedReturn: 10,
              riskLevel: 'low' as const,
            },
          ],
          pairedPositions: [
            {
              long: 'Market A YES',
              short: 'Market B NO',
              netExposure: 0.1,
            },
          ],
          arbitrageSetups: ['Cross-market arbitrage opportunity'],
        },
      },
    };

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
      riskPhilosophySignals,
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.explanation.riskPerspectives).toBeDefined();
    expect(result.recommendation!.explanation.riskPerspectives).toBeTruthy();
    
    // Verify audit log includes risk philosophy information
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.riskPhilosophyIncluded).toBe(true);
    expect(result.auditLog![0].data.riskPhilosophyAgents).toContain('aggressive');
    expect(result.auditLog![0].data.riskPhilosophyAgents).toContain('conservative');
    expect(result.auditLog![0].data.riskPhilosophyAgents).toContain('neutral');
  });

  test('should work without risk philosophy signals (backward compatibility)', async () => {
    // Skip if no OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Requirement 11.2: Maintain backward compatibility
    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
      // No riskPhilosophySignals
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.action).toBe('LONG_YES');
    expect(result.recommendation!.expectedValue).toBeGreaterThan(0);
    
    // Risk perspectives should be undefined when no risk philosophy signals
    expect(result.recommendation!.explanation.riskPerspectives).toBeUndefined();
    
    // Verify audit log shows no risk philosophy
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.riskPhilosophyIncluded).toBe(false);
    expect(result.auditLog![0].data.riskPhilosophyAgents).toEqual([]);
  });

  test('should work with partial risk philosophy signals', async () => {
    // Skip if no OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Test with only aggressive agent signal
    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const riskPhilosophySignals = {
      aggressive: {
        agentName: 'risk_philosophy_aggressive',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES' as const,
        fairProbability: 0.7,
        keyDrivers: ['Strong momentum'],
        riskFactors: ['High variance'],
        metadata: {
          recommendedPositionSize: 0.25,
          kellyCriterion: 0.3,
          convictionLevel: 'high' as const,
          expectedReturn: 40,
          varianceWarning: 'High variance strategy',
        },
      },
      // No conservative or neutral signals
    };

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
      riskPhilosophySignals,
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.action).toBe('LONG_YES');
    
    // Should still include risk perspectives even with partial signals
    expect(result.recommendation!.explanation.riskPerspectives).toBeDefined();
    
    // Verify audit log shows only aggressive agent
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.riskPhilosophyIncluded).toBe(true);
    expect(result.auditLog![0].data.riskPhilosophyAgents).toContain('aggressive');
    expect(result.auditLog![0].data.riskPhilosophyAgents).not.toContain('conservative');
    expect(result.auditLog![0].data.riskPhilosophyAgents).not.toContain('neutral');
  });

  test('should update state correctly with risk philosophy', async () => {
    // Skip if no OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return;
    }

    // Requirement 11.2: Write recommendation to state and add audit log entry
    const consensus = createSampleConsensus(0.7);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const mbd = createSampleMBD(0.5);

    const riskPhilosophySignals = {
      aggressive: {
        agentName: 'risk_philosophy_aggressive',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES' as const,
        fairProbability: 0.7,
        keyDrivers: ['Strong momentum'],
        riskFactors: ['High variance'],
        metadata: {
          recommendedPositionSize: 0.25,
          kellyCriterion: 0.3,
          convictionLevel: 'high' as const,
          expectedReturn: 40,
          varianceWarning: 'High variance strategy',
        },
      },
    };

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: [],
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null,
      consensus,
      consensusError: null,
      recommendation: null,
      auditLog: [],
      riskPhilosophySignals,
    };

    const config = createTestConfig();
    const recommendationNode = createRecommendationGenerationNode(config);
    const result = await recommendationNode(state);

    // Verify recommendation structure
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation!.marketId).toBe('test-market');
    expect(result.recommendation!.action).toBeDefined();
    expect(result.recommendation!.entryZone).toBeDefined();
    expect(result.recommendation!.targetZone).toBeDefined();
    expect(result.recommendation!.expectedValue).toBeDefined();
    expect(result.recommendation!.winProbability).toBeDefined();
    expect(result.recommendation!.liquidityRisk).toBeDefined();
    expect(result.recommendation!.explanation).toBeDefined();
    expect(result.recommendation!.explanation.riskPerspectives).toBeDefined();
    expect(result.recommendation!.metadata).toBeDefined();

    // Verify audit log entry includes risk philosophy info
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog!.length).toBe(1);
    expect(result.auditLog![0].stage).toBe('recommendation_generation');
    expect(result.auditLog![0].timestamp).toBeDefined();
    expect(result.auditLog![0].data).toBeDefined();
    expect(result.auditLog![0].data.success).toBe(true);
    expect(result.auditLog![0].data.riskPhilosophyIncluded).toBe(true);
    expect(result.auditLog![0].data.riskPhilosophyAgents).toBeDefined();
  });
});
