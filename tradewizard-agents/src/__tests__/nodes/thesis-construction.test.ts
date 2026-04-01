/**
 * Unit tests for thesis construction node
 *
 * Tests thesis generation from sample agent signals, fairly priced market detection,
 * edge calculation accuracy, and state updates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createThesisConstructionNode } from './thesis-construction.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument, AgentSignal, Thesis } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// Mock LLM classes
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async (messages: any[]) => {
          const systemPrompt = messages[0]?.content || '';
          const isBull = systemPrompt.includes('bull') || systemPrompt.includes('YES');
          
          return {
            direction: isBull ? 'YES' : 'NO',
            fairProbability: isBull ? 0.65 : 0.35,
            marketProbability: 0.5,
            edge: 0.15,
            coreArgument: `This is a ${isBull ? 'bull' : 'bear'} thesis based on comprehensive agent analysis`,
            catalysts: ['Catalyst A', 'Catalyst B', 'Catalyst C'],
            failureConditions: ['Failure scenario 1', 'Failure scenario 2'],
            supportingSignals: ['market_microstructure', 'probability_baseline'],
          };
        }),
      };
    }
  },
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class MockChatAnthropic {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async (messages: any[]) => {
          const systemPrompt = messages[0]?.content || '';
          const isBull = systemPrompt.includes('bull') || systemPrompt.includes('YES');
          
          return {
            direction: isBull ? 'YES' : 'NO',
            fairProbability: isBull ? 0.65 : 0.35,
            marketProbability: 0.5,
            edge: 0.15,
            coreArgument: `This is a ${isBull ? 'bull' : 'bear'} thesis based on comprehensive agent analysis`,
            catalysts: ['Catalyst A', 'Catalyst B', 'Catalyst C'],
            failureConditions: ['Failure scenario 1', 'Failure scenario 2'],
            supportingSignals: ['market_microstructure', 'probability_baseline'],
          };
        }),
      };
    }
  },
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class MockChatGoogleGenerativeAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async (messages: any[]) => {
          const systemPrompt = messages[0]?.content || '';
          const isBull = systemPrompt.includes('bull') || systemPrompt.includes('YES');
          
          return {
            direction: isBull ? 'YES' : 'NO',
            fairProbability: isBull ? 0.65 : 0.35,
            marketProbability: 0.5,
            edge: 0.15,
            coreArgument: `This is a ${isBull ? 'bull' : 'bear'} thesis based on comprehensive agent analysis`,
            catalysts: ['Catalyst A', 'Catalyst B', 'Catalyst C'],
            failureConditions: ['Failure scenario 1', 'Failure scenario 2'],
            supportingSignals: ['market_microstructure', 'probability_baseline'],
          };
        }),
      };
    }
  },
}));

describe('Thesis Construction Node Unit Tests', () => {
  let mockConfig: EngineConfig;
  let mockMBD: MarketBriefingDocument;
  let mockAgentSignals: AgentSignal[];

  beforeEach(() => {
    // Setup mock configuration
    mockConfig = {
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
        apiKey: undefined,
        projectName: 'test-project',
        workspace: undefined,
        baseUrl: undefined,
        tags: [],
        trackCosts: true,
      },
      llm: {
        singleProvider: undefined,
        openai: {
          apiKey: 'test-openai-key',
          defaultModel: 'gpt-4-turbo',
        },
        anthropic: {
          apiKey: 'test-anthropic-key',
          defaultModel: 'claude-3-sonnet-20240229',
        },
        google: {
          apiKey: 'test-google-key',
          defaultModel: 'gemini-1.5-flash',
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
    };

    // Setup mock Market Briefing Document
    mockMBD = {
      marketId: 'test-market-123',
      conditionId: 'test-condition-456',
      eventType: 'election',
      question: 'Will candidate X win the election?',
      resolutionCriteria: 'Resolves YES if candidate X wins, NO otherwise',
      expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      currentProbability: 0.5,
      liquidityScore: 7.5,
      bidAskSpread: 2.5,
      volatilityRegime: 'medium',
      volume24h: 50000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [
          { event: 'Debate', timestamp: Date.now() + 7 * 24 * 60 * 60 * 1000 },
        ],
      },
    };

    // Setup mock agent signals
    mockAgentSignals = [
      {
        agentName: 'market_microstructure',
        timestamp: Date.now(),
        confidence: 0.8,
        direction: 'YES',
        fairProbability: 0.65,
        keyDrivers: ['Strong order book', 'High volume', 'Positive momentum'],
        riskFactors: ['Liquidity risk'],
        metadata: {},
      },
      {
        agentName: 'probability_baseline',
        timestamp: Date.now(),
        confidence: 0.75,
        direction: 'YES',
        fairProbability: 0.6,
        keyDrivers: ['Historical base rates', 'Polling data'],
        riskFactors: ['Polling uncertainty'],
        metadata: {},
      },
      {
        agentName: 'risk_assessment',
        timestamp: Date.now(),
        confidence: 0.7,
        direction: 'NEUTRAL',
        fairProbability: 0.55,
        keyDrivers: ['Moderate risk'],
        riskFactors: ['Black swan events', 'Unexpected developments'],
        metadata: {},
      },
    ];
  });

  // Test: Thesis generation from sample agent signals
  it('should generate bull and bear theses from sample agent signals', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Should generate both theses
    expect(result.bullThesis).toBeDefined();
    expect(result.bearThesis).toBeDefined();

    const bullThesis = result.bullThesis as Thesis;
    const bearThesis = result.bearThesis as Thesis;

    // Verify thesis structure
    expect(bullThesis.direction).toBe('YES');
    expect(bearThesis.direction).toBe('NO');
    expect(bullThesis.coreArgument).toBeTruthy();
    expect(bearThesis.coreArgument).toBeTruthy();
    expect(bullThesis.catalysts.length).toBeGreaterThan(0);
    expect(bearThesis.catalysts.length).toBeGreaterThan(0);
    expect(bullThesis.failureConditions.length).toBeGreaterThan(0);
    expect(bearThesis.failureConditions.length).toBeGreaterThan(0);
  });

  // Test: Fairly priced market detection (edge < 2%)
  it('should detect fairly priced markets when edge < 2%', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    // Create signals that result in fair probability close to market probability
    const fairlyPricedSignals: AgentSignal[] = [
      {
        agentName: 'agent1',
        timestamp: Date.now(),
        confidence: 0.8,
        direction: 'YES',
        fairProbability: 0.505, // Very close to market probability of 0.5
        keyDrivers: ['Balanced signals'],
        riskFactors: [],
        metadata: {},
      },
      {
        agentName: 'agent2',
        timestamp: Date.now(),
        confidence: 0.75,
        direction: 'NEUTRAL',
        fairProbability: 0.495, // Very close to market probability of 0.5
        keyDrivers: ['Balanced signals'],
        riskFactors: [],
        metadata: {},
      },
    ];

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: fairlyPricedSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Check audit log for fairly priced flag
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog!.length).toBeGreaterThan(0);
    const auditEntry = result.auditLog![0];
    expect(auditEntry.data.isFairlyPriced).toBe(true);
    expect(auditEntry.data.edge).toBeLessThan(0.02);
  });

  // Test: Edge calculation accuracy
  it('should calculate edge accurately as |fairProbability - marketProbability|', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    const bullThesis = result.bullThesis as Thesis;
    const bearThesis = result.bearThesis as Thesis;

    // Verify edge calculation
    const expectedBullEdge = Math.abs(bullThesis.fairProbability - mockMBD.currentProbability);
    const expectedBearEdge = Math.abs(bearThesis.fairProbability - mockMBD.currentProbability);

    expect(bullThesis.edge).toBeCloseTo(expectedBullEdge, 5);
    expect(bearThesis.edge).toBeCloseTo(expectedBearEdge, 5);

    // Verify market probability is set correctly
    expect(bullThesis.marketProbability).toBe(mockMBD.currentProbability);
    expect(bearThesis.marketProbability).toBe(mockMBD.currentProbability);
  });

  // Test: State updates (theses written to state)
  it('should write bull and bear theses to state', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Verify state updates
    expect(result.bullThesis).toBeDefined();
    expect(result.bearThesis).toBeDefined();
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog!.length).toBeGreaterThan(0);

    // Verify audit log entry
    const auditEntry = result.auditLog![0];
    expect(auditEntry.stage).toBe('thesis_construction');
    expect(auditEntry.timestamp).toBeGreaterThan(0);
    expect(auditEntry.data.success).toBe(true);
    expect(auditEntry.data.agentCount).toBe(mockAgentSignals.length);
  });

  // Test: Single-provider mode (one LLM for thesis generation)
  it('should work with single-provider mode using one LLM', async () => {
    const singleProviderConfig: EngineConfig = {
      ...mockConfig,
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: 'test-openai-key',
          defaultModel: 'gpt-4-turbo',
        },
        anthropic: undefined,
        google: undefined,
      },
    };

    const thesisNode = createThesisConstructionNode(singleProviderConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Should still generate both theses
    expect(result.bullThesis).toBeDefined();
    expect(result.bearThesis).toBeDefined();
    expect(result.bullThesis!.direction).toBe('YES');
    expect(result.bearThesis!.direction).toBe('NO');
  });

  // Test: Multi-provider mode (default LLM for thesis generation)
  it('should work with multi-provider mode using default LLM', async () => {
    // Multi-provider mode is the default (no singleProvider set)
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Should generate both theses using default LLM (OpenAI)
    expect(result.bullThesis).toBeDefined();
    expect(result.bearThesis).toBeDefined();
    expect(result.bullThesis!.direction).toBe('YES');
    expect(result.bearThesis!.direction).toBe('NO');
  });

  // Test: Insufficient agent signals
  it('should return error when agent signals are below minimum threshold', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: [mockAgentSignals[0]], // Only 1 agent, but minimum is 2
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Should return error
    expect(result.consensusError).toBeDefined();
    expect(result.consensusError!.type).toBe('INSUFFICIENT_DATA');
    expect(result.consensusError!.reason).toContain('minimum');

    // Should not generate theses
    expect(result.bullThesis).toBeUndefined();
    expect(result.bearThesis).toBeUndefined();
  });

  // Test: Missing MBD
  it('should return error when MBD is not available', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: 'test-condition',
      mbd: null, // No MBD
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Should return error
    expect(result.consensusError).toBeDefined();
    expect(result.consensusError!.type).toBe('INSUFFICIENT_DATA');
    expect(result.consensusError!.reason).toContain('Market Briefing Document');

    // Should not generate theses
    expect(result.bullThesis).toBeUndefined();
    expect(result.bearThesis).toBeUndefined();
  });

  // Test: Weighted fair probability calculation
  it('should calculate weighted fair probability from agent signals', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Calculate expected weighted fair probability
    const totalWeight = mockAgentSignals.reduce((sum, s) => sum + s.confidence, 0);
    const weightedSum = mockAgentSignals.reduce(
      (sum, s) => sum + s.fairProbability * s.confidence,
      0
    );
    const expectedWeightedFairProb = weightedSum / totalWeight;

    // Check audit log for weighted fair probability
    const auditEntry = result.auditLog![0];
    expect(auditEntry.data.weightedFairProbability).toBeCloseTo(expectedWeightedFairProb, 5);
  });

  // Test: Thesis generation with fused signals
  it('should use fused signal when available for thesis generation', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const mockFusedSignal = {
      fairProbability: 0.62,
      confidence: 0.85,
      signalAlignment: 0.9,
      conflictingSignals: [],
      contributingAgents: ['market_microstructure', 'probability_baseline', 'risk_assessment'],
      weights: {
        market_microstructure: 0.35,
        probability_baseline: 0.35,
        risk_assessment: 0.3,
      },
      metadata: {
        mvpAgentCount: 3,
        advancedAgentCount: 0,
        dataQuality: 0.95,
      },
    };

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      fusedSignal: mockFusedSignal,
      activeAgents: ['market_microstructure', 'probability_baseline', 'risk_assessment'],
      externalData: null,
      riskPhilosophySignals: null,
      agentPerformance: {},
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Should generate both theses
    expect(result.bullThesis).toBeDefined();
    expect(result.bearThesis).toBeDefined();

    // Check audit log for fused signal usage
    const auditEntry = result.auditLog![0];
    expect(auditEntry.data.signalSource).toBe('fused');
    expect(auditEntry.data.fusedSignalUsed).toBe(true);
    expect(auditEntry.data.fusedSignalConfidence).toBe(0.85);
    expect(auditEntry.data.weightedFairProbability).toBe(0.62);
    expect(auditEntry.data.contributingAgents).toEqual(mockFusedSignal.contributingAgents);
  });

  // Test: Backward compatibility with raw signals
  it('should fall back to raw agent signals when fused signal is not available', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      fusedSignal: null, // No fused signal
      activeAgents: [],
      externalData: null,
      riskPhilosophySignals: null,
      agentPerformance: {},
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Should generate both theses
    expect(result.bullThesis).toBeDefined();
    expect(result.bearThesis).toBeDefined();

    // Check audit log for raw signal usage
    const auditEntry = result.auditLog![0];
    expect(auditEntry.data.signalSource).toBe('raw');
    expect(auditEntry.data.fusedSignalUsed).toBe(false);
    expect(auditEntry.data.contributingAgents).toEqual(mockAgentSignals.map(s => s.agentName));

    // Calculate expected weighted fair probability from raw signals
    const totalWeight = mockAgentSignals.reduce((sum, s) => sum + s.confidence, 0);
    const weightedSum = mockAgentSignals.reduce(
      (sum, s) => sum + s.fairProbability * s.confidence,
      0
    );
    const expectedWeightedFairProb = weightedSum / totalWeight;

    expect(auditEntry.data.weightedFairProbability).toBeCloseTo(expectedWeightedFairProb, 5);
  });

  // Test: State updates with fused signal
  it('should write theses to state when using fused signal', async () => {
    const thesisNode = createThesisConstructionNode(mockConfig);

    const mockFusedSignal = {
      fairProbability: 0.68,
      confidence: 0.88,
      signalAlignment: 0.92,
      conflictingSignals: [],
      contributingAgents: ['market_microstructure', 'probability_baseline'],
      weights: {
        market_microstructure: 0.5,
        probability_baseline: 0.5,
      },
      metadata: {
        mvpAgentCount: 2,
        advancedAgentCount: 0,
        dataQuality: 0.9,
      },
    };

    const state: GraphStateType = {
      conditionId: mockMBD.conditionId,
      mbd: mockMBD,
      ingestionError: null,
      agentSignals: mockAgentSignals,
      agentErrors: [],
      fusedSignal: mockFusedSignal,
      activeAgents: ['market_microstructure', 'probability_baseline'],
      externalData: null,
      riskPhilosophySignals: null,
      agentPerformance: {},
      bullThesis: null,
      bearThesis: null,
      debateRecord: null,
      consensus: null,
      consensusError: null,
      recommendation: null,
      auditLog: [],
    };

    const result = await thesisNode(state);

    // Verify state updates
    expect(result.bullThesis).toBeDefined();
    expect(result.bearThesis).toBeDefined();
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog!.length).toBeGreaterThan(0);

    // Verify audit log entry
    const auditEntry = result.auditLog![0];
    expect(auditEntry.stage).toBe('thesis_construction');
    expect(auditEntry.timestamp).toBeGreaterThan(0);
    expect(auditEntry.data.success).toBe(true);
    expect(auditEntry.data.signalSource).toBe('fused');
    expect(auditEntry.data.fusedSignalUsed).toBe(true);
  });
});
