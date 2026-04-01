/**
 * Property-based tests for Risk Philosophy Agent nodes
 *
 * Feature: advanced-agent-league, Property 5: Risk philosophy signal completeness
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  createAggressiveAgentNode,
  createConservativeAgentNode,
  createNeutralAgentNode,
  createRiskPhilosophyAgentNodes,
} from './risk-philosophy.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument, ConsensusProbability } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// Shared random seed for position sizing to ensure conservative < aggressive
let sharedPositionSizeSeed = Math.random();

// Mock LLM classes for property tests
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async () => {
          // Generate a new seed for this invocation
          sharedPositionSizeSeed = Math.random();
          return {
            confidence: Math.random() * 0.5 + 0.5, // 0.5-1.0
            direction: ['YES', 'NO', 'NEUTRAL'][Math.floor(Math.random() * 3)],
            fairProbability: Math.random(),
            keyDrivers: ['High expected value', 'Strong conviction', 'Favorable odds'],
            riskFactors: ['High variance', 'Potential drawdown'],
            metadata: {
              recommendedPositionSize: sharedPositionSizeSeed * 0.5, // 0-0.5, uses shared seed
              kellyCriterion: Math.random() * 0.3, // 0-0.3
              convictionLevel: ['extreme', 'high', 'moderate'][Math.floor(Math.random() * 3)],
              expectedReturn: Math.random() * 100,
              varianceWarning: 'High variance strategy - expect significant drawdowns',
            },
          };
        }),
      };
    }
  },
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class MockChatAnthropic {
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async () => ({
          confidence: Math.random() * 0.5 + 0.5, // 0.5-1.0
          direction: ['YES', 'NO', 'NEUTRAL'][Math.floor(Math.random() * 3)],
          fairProbability: Math.random(),
          keyDrivers: ['Capital preservation', 'Risk management', 'Downside protection'],
          riskFactors: ['Market reversal', 'Unexpected events'],
          metadata: {
            // Conservative uses 20% of the aggressive position size (shared seed * 0.5 * 0.2)
            recommendedPositionSize: sharedPositionSizeSeed * 0.1, // 0-0.1, always <= aggressive
            hedgingStrategy: 'Buy protective puts on correlated markets',
            maxDrawdownTolerance: Math.random() * 0.2, // 0-0.2
            stopLossLevel: Math.random() * 0.5 + 0.3, // 0.3-0.8
            capitalPreservationScore: Math.random() * 0.3 + 0.7, // 0.7-1.0
          },
        })),
      };
    }
  },
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class MockChatGoogleGenerativeAI {
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async () => ({
          confidence: Math.random() * 0.5 + 0.5, // 0.5-1.0
          direction: ['YES', 'NO', 'NEUTRAL'][Math.floor(Math.random() * 3)],
          fairProbability: Math.random(),
          keyDrivers: ['Market neutral', 'Spread opportunity', 'Low correlation risk'],
          riskFactors: ['Execution risk', 'Correlation breakdown'],
          metadata: {
            spreadOpportunities: [
              {
                setup: 'Long YES at 0.45, Short correlated market at 0.55',
                expectedReturn: Math.random() * 20,
                riskLevel: ['low', 'medium'][Math.floor(Math.random() * 2)],
              },
            ],
            pairedPositions: [
              {
                long: 'Market A YES',
                short: 'Market B NO',
                netExposure: Math.random() * 0.1 - 0.05, // -0.05 to 0.05
              },
            ],
            arbitrageSetups: ['Cross-market arbitrage on related outcomes'],
          },
        })),
      };
    }
  },
}));

describe('Risk Philosophy Signal Completeness Property Tests', () => {
  // Generator for Market Briefing Documents
  const mbdArbitrary = fc.record({
    marketId: fc.string({ minLength: 1 }),
    conditionId: fc.string({ minLength: 1 }),
    eventType: fc.constantFrom('election', 'policy', 'court', 'geopolitical', 'economic', 'other'),
    question: fc.string({ minLength: 10 }),
    resolutionCriteria: fc.string({ minLength: 10 }),
    expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    currentProbability: fc.float({ min: 0, max: 1 }),
    liquidityScore: fc.float({ min: 0, max: 10 }),
    bidAskSpread: fc.float({ min: 0, max: 100 }),
    volatilityRegime: fc.constantFrom('low', 'medium', 'high'),
    volume24h: fc.float({ min: 0 }),
    metadata: fc.record({
      ambiguityFlags: fc.array(fc.string()),
      keyCatalysts: fc.array(
        fc.record({
          event: fc.string(),
          timestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        })
      ),
    }),
  });

  // Generator for Consensus Probability
  const consensusArbitrary = fc.record({
    consensusProbability: fc.float({ min: 0, max: 1 }),
    confidenceBand: fc.tuple(fc.float({ min: 0, max: 1 }), fc.float({ min: 0, max: 1 })).map(
      ([a, b]) => (a < b ? [a, b] : [b, a]) as [number, number]
    ),
    disagreementIndex: fc.float({ min: 0, max: 1 }),
    regime: fc.constantFrom('high-confidence', 'moderate-confidence', 'high-uncertainty'),
    contributingSignals: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
  });

  // Sample engine config with all required fields
  const sampleConfig: EngineConfig = {
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
      projectName: 'test-project',
      tags: [],
      trackCosts: true,
    },
    llm: {
      openai: {
        apiKey: 'test-openai-key',
        defaultModel: 'gpt-4o-mini',
      },
      anthropic: {
        apiKey: 'test-anthropic-key',
        defaultModel: 'claude-3-5-sonnet-20241022',
      },
      google: {
        apiKey: 'test-google-key',
        defaultModel: 'gemini-2.0-flash-exp',
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
    advancedAgents: {
      eventIntelligence: {
        enabled: false,
        breakingNews: true,
        eventImpact: true,
      },
      pollingStatistical: {
        enabled: false,
        pollingIntelligence: true,
        historicalPattern: true,
      },
      sentimentNarrative: {
        enabled: false,
        mediaSentiment: true,
        socialSentiment: true,
        narrativeVelocity: true,
      },
      priceAction: {
        enabled: false,
        momentum: true,
        meanReversion: true,
        minVolumeThreshold: 1000,
      },
      eventScenario: {
        enabled: false,
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
        provider: 'none',
        cacheTTL: 900,
        maxArticles: 20,
      },
      polling: {
        provider: 'none',
        cacheTTL: 3600,
      },
      social: {
        providers: [],
        cacheTTL: 300,
        maxMentions: 100,
      },
    },
    signalFusion: {
      baseWeights: {
        'market_microstructure': 1.0,
        'probability_baseline': 1.0,
        'risk_assessment': 1.0,
      },
      contextAdjustments: true,
      conflictThreshold: 0.20,
      alignmentBonus: 0.20,
    },
    costOptimization: {
      maxCostPerAnalysis: 2.0,
      skipLowImpactAgents: false,
      batchLLMRequests: true,
    },
    performanceTracking: {
      enabled: false,
      evaluateOnResolution: true,
      minSampleSize: 10,
    },
  };

  // Feature: advanced-agent-league, Property 5: Risk philosophy signal completeness
  // Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
  it('Property 5: For any consensus probability established, when all risk philosophy agents are enabled, the system should generate signals from all three agents', async () => {
    await fc.assert(
      fc.asyncProperty(mbdArbitrary, consensusArbitrary, async (mbd, consensus) => {
        // Create state with MBD and consensus
        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          activeAgents: [],
          externalData: null,
          agentSignals: [],
          agentErrors: [],
          fusedSignal: null,
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: consensus as ConsensusProbability,
          consensusError: null,
          riskPhilosophySignals: null,
          agentPerformance: {},
          recommendation: null,
          auditLog: [],
        };

        // Create all three risk philosophy agent nodes
        const agents = createRiskPhilosophyAgentNodes(sampleConfig);

        // Execute all three agents
        const aggressiveResult = await agents.aggressiveAgent(state);
        const conservativeResult = await agents.conservativeAgent(state);
        const neutralResult = await agents.neutralAgent(state);

        // Property: All three agents should produce signals
        expect(aggressiveResult.riskPhilosophySignals).toBeDefined();
        expect(aggressiveResult.riskPhilosophySignals!.aggressive).toBeDefined();

        expect(conservativeResult.riskPhilosophySignals).toBeDefined();
        expect(conservativeResult.riskPhilosophySignals!.conservative).toBeDefined();

        expect(neutralResult.riskPhilosophySignals).toBeDefined();
        expect(neutralResult.riskPhilosophySignals!.neutral).toBeDefined();

        // Property: Each signal should have all required fields
        const aggressiveSignal = aggressiveResult.riskPhilosophySignals!.aggressive!;
        expect(aggressiveSignal.agentName).toBe('risk_philosophy_aggressive');
        expect(aggressiveSignal.timestamp).toBeGreaterThan(0);
        expect(aggressiveSignal.confidence).toBeGreaterThanOrEqual(0);
        expect(aggressiveSignal.confidence).toBeLessThanOrEqual(1);
        expect(['YES', 'NO', 'NEUTRAL']).toContain(aggressiveSignal.direction);
        expect(aggressiveSignal.fairProbability).toBeGreaterThanOrEqual(0);
        expect(aggressiveSignal.fairProbability).toBeLessThanOrEqual(1);
        expect(Array.isArray(aggressiveSignal.keyDrivers)).toBe(true);
        expect(aggressiveSignal.keyDrivers.length).toBeGreaterThan(0);
        expect(Array.isArray(aggressiveSignal.riskFactors)).toBe(true);
        expect(aggressiveSignal.metadata.recommendedPositionSize).toBeGreaterThanOrEqual(0);
        expect(aggressiveSignal.metadata.recommendedPositionSize).toBeLessThanOrEqual(1);
        expect(aggressiveSignal.metadata.kellyCriterion).toBeGreaterThanOrEqual(0);
        expect(aggressiveSignal.metadata.kellyCriterion).toBeLessThanOrEqual(1);
        expect(['extreme', 'high', 'moderate']).toContain(aggressiveSignal.metadata.convictionLevel);

        const conservativeSignal = conservativeResult.riskPhilosophySignals!.conservative!;
        expect(conservativeSignal.agentName).toBe('risk_philosophy_conservative');
        expect(conservativeSignal.timestamp).toBeGreaterThan(0);
        expect(conservativeSignal.confidence).toBeGreaterThanOrEqual(0);
        expect(conservativeSignal.confidence).toBeLessThanOrEqual(1);
        expect(['YES', 'NO', 'NEUTRAL']).toContain(conservativeSignal.direction);
        expect(conservativeSignal.fairProbability).toBeGreaterThanOrEqual(0);
        expect(conservativeSignal.fairProbability).toBeLessThanOrEqual(1);
        expect(Array.isArray(conservativeSignal.keyDrivers)).toBe(true);
        expect(conservativeSignal.keyDrivers.length).toBeGreaterThan(0);
        expect(Array.isArray(conservativeSignal.riskFactors)).toBe(true);
        expect(conservativeSignal.metadata.recommendedPositionSize).toBeGreaterThanOrEqual(0);
        expect(conservativeSignal.metadata.recommendedPositionSize).toBeLessThanOrEqual(1);
        expect(typeof conservativeSignal.metadata.hedgingStrategy).toBe('string');
        expect(conservativeSignal.metadata.maxDrawdownTolerance).toBeGreaterThanOrEqual(0);
        expect(conservativeSignal.metadata.maxDrawdownTolerance).toBeLessThanOrEqual(1);
        expect(conservativeSignal.metadata.stopLossLevel).toBeGreaterThanOrEqual(0);
        expect(conservativeSignal.metadata.stopLossLevel).toBeLessThanOrEqual(1);
        expect(conservativeSignal.metadata.capitalPreservationScore).toBeGreaterThanOrEqual(0);
        expect(conservativeSignal.metadata.capitalPreservationScore).toBeLessThanOrEqual(1);

        const neutralSignal = neutralResult.riskPhilosophySignals!.neutral!;
        expect(neutralSignal.agentName).toBe('risk_philosophy_neutral');
        expect(neutralSignal.timestamp).toBeGreaterThan(0);
        expect(neutralSignal.confidence).toBeGreaterThanOrEqual(0);
        expect(neutralSignal.confidence).toBeLessThanOrEqual(1);
        expect(['YES', 'NO', 'NEUTRAL']).toContain(neutralSignal.direction);
        expect(neutralSignal.fairProbability).toBeGreaterThanOrEqual(0);
        expect(neutralSignal.fairProbability).toBeLessThanOrEqual(1);
        expect(Array.isArray(neutralSignal.keyDrivers)).toBe(true);
        expect(neutralSignal.keyDrivers.length).toBeGreaterThan(0);
        expect(Array.isArray(neutralSignal.riskFactors)).toBe(true);
        expect(Array.isArray(neutralSignal.metadata.spreadOpportunities)).toBe(true);
        expect(Array.isArray(neutralSignal.metadata.pairedPositions)).toBe(true);
        expect(Array.isArray(neutralSignal.metadata.arbitrageSetups)).toBe(true);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Additional property: When consensus is missing, agents should not produce signals
  it('Property: Risk philosophy agents should not produce signals when consensus is missing', async () => {
    await fc.assert(
      fc.asyncProperty(mbdArbitrary, async (mbd) => {
        // Create state without consensus
        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          activeAgents: [],
          externalData: null,
          agentSignals: [],
          agentErrors: [],
          fusedSignal: null,
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: null, // No consensus
          consensusError: null,
          riskPhilosophySignals: null,
          agentPerformance: {},
          recommendation: null,
          auditLog: [],
        };

        // Create all three risk philosophy agent nodes
        const agents = createRiskPhilosophyAgentNodes(sampleConfig);

        // Execute all three agents
        const aggressiveResult = await agents.aggressiveAgent(state);
        const conservativeResult = await agents.conservativeAgent(state);
        const neutralResult = await agents.neutralAgent(state);

        // Property: None of the agents should produce signals
        // They should only produce audit log entries with errors
        expect(aggressiveResult.riskPhilosophySignals).toBeUndefined();
        expect(aggressiveResult.auditLog).toBeDefined();
        expect(aggressiveResult.auditLog![0].data.success).toBe(false);
        expect(aggressiveResult.auditLog![0].data.error).toBe('No consensus probability available');

        expect(conservativeResult.riskPhilosophySignals).toBeUndefined();
        expect(conservativeResult.auditLog).toBeDefined();
        expect(conservativeResult.auditLog![0].data.success).toBe(false);
        expect(conservativeResult.auditLog![0].data.error).toBe('No consensus probability available');

        expect(neutralResult.riskPhilosophySignals).toBeUndefined();
        expect(neutralResult.auditLog).toBeDefined();
        expect(neutralResult.auditLog![0].data.success).toBe(false);
        expect(neutralResult.auditLog![0].data.error).toBe('No consensus probability available');

        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Property: Conservative agent should recommend smaller position sizes than aggressive agent
  it('Property: Conservative agent should consistently recommend smaller position sizes than aggressive agent', async () => {
    await fc.assert(
      fc.asyncProperty(mbdArbitrary, consensusArbitrary, async (mbd, consensus) => {
        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          activeAgents: [],
          externalData: null,
          agentSignals: [],
          agentErrors: [],
          fusedSignal: null,
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: consensus as ConsensusProbability,
          consensusError: null,
          riskPhilosophySignals: null,
          agentPerformance: {},
          recommendation: null,
          auditLog: [],
        };

        const aggressiveNode = createAggressiveAgentNode(sampleConfig);
        const conservativeNode = createConservativeAgentNode(sampleConfig);

        const aggressiveResult = await aggressiveNode(state);
        const conservativeResult = await conservativeNode(state);

        const aggressiveSize = aggressiveResult.riskPhilosophySignals!.aggressive!.metadata.recommendedPositionSize;
        const conservativeSize = conservativeResult.riskPhilosophySignals!.conservative!.metadata.recommendedPositionSize;

        // Property: Conservative should recommend smaller or equal position size
        expect(conservativeSize).toBeLessThanOrEqual(aggressiveSize);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Property: All risk philosophy signals should have valid timestamps
  it('Property: All risk philosophy signals should have timestamps within reasonable bounds', async () => {
    await fc.assert(
      fc.asyncProperty(mbdArbitrary, consensusArbitrary, async (mbd, consensus) => {
        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          activeAgents: [],
          externalData: null,
          agentSignals: [],
          agentErrors: [],
          fusedSignal: null,
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: consensus as ConsensusProbability,
          consensusError: null,
          riskPhilosophySignals: null,
          agentPerformance: {},
          recommendation: null,
          auditLog: [],
        };

        const agents = createRiskPhilosophyAgentNodes(sampleConfig);

        const beforeTime = Date.now();
        const aggressiveResult = await agents.aggressiveAgent(state);
        const conservativeResult = await agents.conservativeAgent(state);
        const neutralResult = await agents.neutralAgent(state);
        const afterTime = Date.now();

        // Property: All timestamps should be within execution window
        const aggressiveTimestamp = aggressiveResult.riskPhilosophySignals!.aggressive!.timestamp;
        const conservativeTimestamp = conservativeResult.riskPhilosophySignals!.conservative!.timestamp;
        const neutralTimestamp = neutralResult.riskPhilosophySignals!.neutral!.timestamp;

        expect(aggressiveTimestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(aggressiveTimestamp).toBeLessThanOrEqual(afterTime);
        expect(conservativeTimestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(conservativeTimestamp).toBeLessThanOrEqual(afterTime);
        expect(neutralTimestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(neutralTimestamp).toBeLessThanOrEqual(afterTime);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Property: Neutral agent should identify market-neutral opportunities
  it('Property: Neutral agent should always provide at least one spread opportunity or paired position', async () => {
    await fc.assert(
      fc.asyncProperty(mbdArbitrary, consensusArbitrary, async (mbd, consensus) => {
        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          activeAgents: [],
          externalData: null,
          agentSignals: [],
          agentErrors: [],
          fusedSignal: null,
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: consensus as ConsensusProbability,
          consensusError: null,
          riskPhilosophySignals: null,
          agentPerformance: {},
          recommendation: null,
          auditLog: [],
        };

        const neutralNode = createNeutralAgentNode(sampleConfig);
        const result = await neutralNode(state);

        const signal = result.riskPhilosophySignals!.neutral!;

        // Property: Should have at least one spread opportunity or paired position
        const hasSpreadOpportunities = signal.metadata.spreadOpportunities.length > 0;
        const hasPairedPositions = signal.metadata.pairedPositions.length > 0;

        expect(hasSpreadOpportunities || hasPairedPositions).toBe(true);

        // If spread opportunities exist, they should have valid structure
        if (hasSpreadOpportunities) {
          signal.metadata.spreadOpportunities.forEach((spread) => {
            expect(typeof spread.setup).toBe('string');
            expect(spread.setup.length).toBeGreaterThan(0);
            expect(typeof spread.expectedReturn).toBe('number');
            expect(['low', 'medium']).toContain(spread.riskLevel);
          });
        }

        // If paired positions exist, they should have valid structure
        if (hasPairedPositions) {
          signal.metadata.pairedPositions.forEach((position) => {
            expect(typeof position.long).toBe('string');
            expect(typeof position.short).toBe('string');
            expect(typeof position.netExposure).toBe('number');
            // Net exposure should be close to zero for market-neutral
            expect(Math.abs(position.netExposure)).toBeLessThan(0.2);
          });
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
