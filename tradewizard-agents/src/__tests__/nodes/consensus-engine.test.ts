/**
 * Unit Tests for Consensus Engine Node
 *
 * Tests consensus calculation with sample debate outcomes, high disagreement
 * confidence band widening, efficient market classification, consensus failure
 * handling, and state updates.
 *
 * Requirements: 6.2, 6.4, 10.4, 11.2
 */

import { describe, test, expect } from 'vitest';
import { createConsensusEngineNode } from './consensus-engine.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type {
  AgentSignal,
  DebateRecord,
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
        apiKey: 'test-key',
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
 * Create sample agent signals
 */
function createSampleAgentSignals(probabilities: number[]): AgentSignal[] {
  const agentNames = ['market_microstructure', 'probability_baseline', 'risk_assessment'];
  return probabilities.map((prob, index) => ({
    agentName: agentNames[index] || `agent_${index}`,
    timestamp: Date.now(),
    confidence: 0.8,
    direction: prob > 0.5 ? ('YES' as const) : ('NO' as const),
    fairProbability: prob,
    keyDrivers: ['Driver 1', 'Driver 2'],
    riskFactors: ['Risk 1'],
    metadata: {},
  }));
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
    coreArgument: `This is a ${direction} thesis`,
    catalysts: ['Catalyst 1', 'Catalyst 2'],
    failureConditions: ['Failure 1'],
    supportingSignals: ['agent_1', 'agent_2'],
  };
}

/**
 * Create sample debate record
 */
function createSampleDebateRecord(bullScore: number, bearScore: number): DebateRecord {
  return {
    tests: [
      {
        testType: 'evidence',
        claim: 'Bull claim',
        challenge: 'Bull challenge',
        outcome: 'survived',
        score: 0.7,
      },
      {
        testType: 'evidence',
        claim: 'Bear claim',
        challenge: 'Bear challenge',
        outcome: 'weakened',
        score: 0,
      },
    ],
    bullScore,
    bearScore,
    keyDisagreements: [],
  };
}

/**
 * Create sample market briefing document
 */
function createSampleMBD(currentProbability: number): MarketBriefingDocument {
  return {
    marketId: 'test-market',
    conditionId: 'test-condition',
    eventType: 'election',
    question: 'Will X happen?',
    resolutionCriteria: 'X happens',
    expiryTimestamp: Date.now() + 86400000,
    currentProbability,
    liquidityScore: 7.5,
    bidAskSpread: 2,
    volatilityRegime: 'medium',
    volume24h: 100000,
    metadata: {
      ambiguityFlags: [],
      keyCatalysts: [],
    },
  };
}

describe('Consensus Engine Unit Tests', () => {
  test('should calculate consensus with sample debate outcomes', async () => {
    // Requirement 6.1: Calculate consensus probability from debate outcomes
    const agentSignals = createSampleAgentSignals([0.6, 0.65, 0.7]);
    const bullThesis = createSampleThesis('YES', 0.65, 0.5);
    const bearThesis = createSampleThesis('NO', 0.35, 0.5);
    const debateRecord = createSampleDebateRecord(0.6, 0.4);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    expect(result.consensus).toBeDefined();
    expect(result.consensus!.consensusProbability).toBeGreaterThan(0);
    expect(result.consensus!.consensusProbability).toBeLessThan(1);
    expect(result.consensus!.contributingSignals).toHaveLength(3);
    expect(result.consensusError).toBeUndefined();
  });

  test('should widen confidence band for high disagreement', async () => {
    // Requirement 6.2: Widen confidence band when disagreement is high
    // Create signals with high disagreement (std dev > 0.15)
    const agentSignals = createSampleAgentSignals([0.3, 0.7, 0.5]);
    const bullThesis = createSampleThesis('YES', 0.7, 0.5);
    const bearThesis = createSampleThesis('NO', 0.3, 0.5);
    const debateRecord = createSampleDebateRecord(0.5, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    expect(result.consensus).toBeDefined();
    
    // Calculate expected standard deviation
    const probs = [0.3, 0.7, 0.5];
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    const variance = probs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probs.length;
    const stdDev = Math.sqrt(variance);
    
    expect(result.consensus!.disagreementIndex).toBeCloseTo(stdDev, 2);
    
    // High disagreement should result in wider confidence band
    const bandWidth = result.consensus!.confidenceBand[1] - result.consensus!.confidenceBand[0];
    expect(bandWidth).toBeGreaterThan(0.1); // Should be wider than base 5%
    
    // Should be classified as moderate or high uncertainty
    expect(['moderate-confidence', 'high-uncertainty']).toContain(result.consensus!.regime);
  });

  test('should classify efficiently priced markets (edge < 3%)', async () => {
    // Requirement 6.4: Detect efficiently priced markets
    const agentSignals = createSampleAgentSignals([0.51, 0.52, 0.53]);
    const bullThesis = createSampleThesis('YES', 0.52, 0.5);
    const bearThesis = createSampleThesis('NO', 0.48, 0.5);
    const debateRecord = createSampleDebateRecord(0.5, 0.5);
    const mbd = createSampleMBD(0.5); // Market probability = 0.5

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    expect(result.consensus).toBeDefined();
    
    // Calculate edge
    const edge = Math.abs(result.consensus!.consensusProbability - 0.5);
    
    // Edge should be small (< 3%)
    expect(edge).toBeLessThan(0.03);
    
    // Audit log should indicate efficiently priced market
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data).toHaveProperty('efficientlyPriced');
    expect(result.auditLog![0].data.efficientlyPriced).toBe(true);
  });

  test('should handle consensus failure for high disagreement (> 0.30)', async () => {
    // Requirement 10.4: Handle consensus failure
    // Create signals with very high disagreement (std dev > 0.30)
    // For [0.1, 0.9, 0.5]: mean=0.5, variance=((0.4)²+(0.4)²+0²)/3=0.1067, stdDev≈0.327
    const agentSignals = createSampleAgentSignals([0.1, 0.9, 0.5]);
    const bullThesis = createSampleThesis('YES', 0.9, 0.5);
    const bearThesis = createSampleThesis('NO', 0.1, 0.5);
    const debateRecord = createSampleDebateRecord(0.5, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    // Should fail consensus due to high disagreement
    expect(result.consensusError).toBeDefined();
    if (result.consensusError) {
      expect(result.consensusError.type).toBe('CONSENSUS_FAILED');
      if (result.consensusError.type === 'CONSENSUS_FAILED') {
        expect(result.consensusError.reason).toContain('disagreement');
      }
    }
    expect(result.consensus).toBeUndefined();
  });

  test('should update state correctly', async () => {
    // Requirement 11.2: Write consensus to state and add audit log entry
    const agentSignals = createSampleAgentSignals([0.6, 0.65, 0.7]);
    const bullThesis = createSampleThesis('YES', 0.65, 0.5);
    const bearThesis = createSampleThesis('NO', 0.35, 0.5);
    const debateRecord = createSampleDebateRecord(0.6, 0.4);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    // Verify consensus is written to state
    expect(result.consensus).toBeDefined();
    expect(result.consensus!.consensusProbability).toBeDefined();
    expect(result.consensus!.confidenceBand).toBeDefined();
    expect(result.consensus!.disagreementIndex).toBeDefined();
    expect(result.consensus!.regime).toBeDefined();
    expect(result.consensus!.contributingSignals).toBeDefined();

    // Verify audit log entry is added
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog!.length).toBe(1);
    expect(result.auditLog![0].stage).toBe('consensus_engine');
    expect(result.auditLog![0].timestamp).toBeDefined();
    expect(result.auditLog![0].data).toBeDefined();
    expect(result.auditLog![0].data.success).toBe(true);
    expect(result.auditLog![0].data.consensusProbability).toBeDefined();
    expect(result.auditLog![0].data.edge).toBeDefined();
    expect(result.auditLog![0].data.disagreementIndex).toBeDefined();
  });

  test('should handle missing debate record', async () => {
    const agentSignals = createSampleAgentSignals([0.6, 0.65, 0.7]);
    const bullThesis = createSampleThesis('YES', 0.65, 0.5);
    const bearThesis = createSampleThesis('NO', 0.35, 0.5);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord: null, // Missing debate record
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    expect(result.consensusError).toBeDefined();
    if (result.consensusError) {
      expect(result.consensusError.type).toBe('INSUFFICIENT_DATA');
      if (result.consensusError.type === 'INSUFFICIENT_DATA') {
        expect(result.consensusError.reason).toContain('Debate record');
      }
    }
  });

  test('should handle insufficient agent signals', async () => {
    const agentSignals = createSampleAgentSignals([0.6]); // Only 1 signal
    const bullThesis = createSampleThesis('YES', 0.65, 0.5);
    const bearThesis = createSampleThesis('NO', 0.35, 0.5);
    const debateRecord = createSampleDebateRecord(0.6, 0.4);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    expect(result.consensusError).toBeDefined();
    if (result.consensusError) {
      expect(result.consensusError.type).toBe('INSUFFICIENT_DATA');
      if (result.consensusError.type === 'INSUFFICIENT_DATA') {
        expect(result.consensusError.reason).toContain('agent signals');
      }
    }
  });

  test('should handle missing theses', async () => {
    const agentSignals = createSampleAgentSignals([0.6, 0.65, 0.7]);
    const debateRecord = createSampleDebateRecord(0.6, 0.4);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals,
      agentErrors: [],
      bullThesis: null, // Missing bull thesis
      bearThesis: null, // Missing bear thesis
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    expect(result.consensusError).toBeDefined();
    if (result.consensusError) {
      expect(result.consensusError.type).toBe('INSUFFICIENT_DATA');
      if (result.consensusError.type === 'INSUFFICIENT_DATA') {
        expect(result.consensusError.reason).toContain('theses');
      }
    }
  });

  test('should classify probability regimes correctly', async () => {
    // Test high-confidence regime (disagreement < 0.10)
    const lowDisagreementSignals = createSampleAgentSignals([0.6, 0.61, 0.62]);
    const bullThesis = createSampleThesis('YES', 0.61, 0.5);
    const bearThesis = createSampleThesis('NO', 0.39, 0.5);
    const debateRecord = createSampleDebateRecord(0.6, 0.4);
    const mbd = createSampleMBD(0.5);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd,
      ingestionError: null,
      agentSignals: lowDisagreementSignals,
      agentErrors: [],
      bullThesis,
      bearThesis,
      debateRecord,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const config = createTestConfig();
    const consensusNode = createConsensusEngineNode(config);
    const result = await consensusNode(state);

    expect(result.consensus).toBeDefined();
    expect(result.consensus!.regime).toBe('high-confidence');
  });
});
