/**
 * Unit tests for Price Action & Timing Agents
 *
 * Tests the Momentum and Mean Reversion agent nodes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMomentumAgentNode, createMeanReversionAgentNode } from './price-action.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument } from '../models/types.js';

// Mock LLM classes
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.75,
          direction: 'YES',
          fairProbability: 0.65,
          keyDrivers: ['Strong momentum', 'Breakout pattern', 'Volume surge'],
          riskFactors: ['Potential reversal'],
          metadata: {
            momentumScore: 0.6,
            breakoutProbability: 0.7,
            orderFlowImbalance: 0.3,
            timingWindow: { optimal: 2, duration: 4 },
            priceTarget: 0.70,
          },
        }),
      };
    }
  },
}));

// ============================================================================
// Test Fixtures
// ============================================================================

const mockMBDHighVolume: MarketBriefingDocument = {
  marketId: 'test-market-1',
  conditionId: 'test-condition-1',
  eventType: 'election',
  question: 'Will candidate X win the election?',
  resolutionCriteria: 'Resolves YES if candidate X wins',
  expiryTimestamp: Date.now() + 86400000,
  currentProbability: 0.65,
  liquidityScore: 7.5,
  bidAskSpread: 0.02,
  volatilityRegime: 'medium',
  volume24h: 5000, // Above threshold
  metadata: {
    ambiguityFlags: [],
    keyCatalysts: [],
  },
};

const mockMBDLowVolume: MarketBriefingDocument = {
  ...mockMBDHighVolume,
  volume24h: 500, // Below threshold
};

const mockMBDOverextended: MarketBriefingDocument = {
  ...mockMBDHighVolume,
  currentProbability: 0.85, // Far from mean (0.5)
  volatilityRegime: 'high',
};

const createMockLLM = (metadata: any) => ({
  withStructuredOutput: vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      confidence: 0.75,
      direction: 'YES',
      fairProbability: 0.65,
      keyDrivers: ['Factor 1', 'Factor 2', 'Factor 3'],
      riskFactors: ['Risk 1'],
      metadata,
    }),
  }),
}) as any;

// ============================================================================
// Momentum Agent Tests
// ============================================================================

describe('Momentum Agent', () => {
  let momentumAgent: ReturnType<typeof createMomentumAgentNode>;
  let mockLLM: any;

  beforeEach(() => {
    mockLLM = createMockLLM({
      momentumScore: 0.6,
      breakoutProbability: 0.7,
      orderFlowImbalance: 0.3,
      timingWindow: { optimal: 2, duration: 4 },
      priceTarget: 0.70,
    });
    momentumAgent = createMomentumAgentNode(mockLLM);
  });

  it('should skip analysis when MBD is missing', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: null,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await momentumAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('momentum');
    expect(result.auditLog).toBeDefined();
  });

  it('should skip analysis when volume is below threshold', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDLowVolume,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await momentumAgent(state);

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.length).toBe(1);
    expect(result.auditLog?.[0].data.skipped).toBe(true);
    expect(result.auditLog?.[0].data.reason).toBe('Insufficient price history');
  });

  it('should generate momentum signal with sufficient volume', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDHighVolume,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await momentumAgent(state);

    // Should have a signal
    expect(result.agentSignals).toBeDefined();
    expect(result.agentSignals?.length).toBe(1);

    const signal = result.agentSignals?.[0];
    expect(signal?.agentName).toBe('momentum');
    expect(signal?.confidence).toBeGreaterThanOrEqual(0);
    expect(signal?.confidence).toBeLessThanOrEqual(1);
    expect(signal?.fairProbability).toBeGreaterThanOrEqual(0);
    expect(signal?.fairProbability).toBeLessThanOrEqual(1);
    expect(['YES', 'NO', 'NEUTRAL']).toContain(signal?.direction);
    expect(signal?.keyDrivers.length).toBeGreaterThan(0);

    // Check momentum-specific metadata
    expect(signal?.metadata).toBeDefined();
    const metadata = signal?.metadata as any;
    expect(metadata.momentumScore).toBeDefined();
    expect(metadata.breakoutProbability).toBeDefined();
    expect(metadata.orderFlowImbalance).toBeDefined();
    expect(metadata.timingWindow).toBeDefined();
    expect(metadata.priceTarget).toBeDefined();

    // Audit log should show success
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(true);
  });

  it('should include momentum indicators in signal metadata', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDHighVolume,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await momentumAgent(state);

    const signal = result.agentSignals?.[0];
    const metadata = signal?.metadata as any;

    // Validate momentum score range
    expect(metadata.momentumScore).toBeGreaterThanOrEqual(-1);
    expect(metadata.momentumScore).toBeLessThanOrEqual(1);

    // Validate breakout probability range
    expect(metadata.breakoutProbability).toBeGreaterThanOrEqual(0);
    expect(metadata.breakoutProbability).toBeLessThanOrEqual(1);

    // Validate order flow imbalance range
    expect(metadata.orderFlowImbalance).toBeGreaterThanOrEqual(-1);
    expect(metadata.orderFlowImbalance).toBeLessThanOrEqual(1);

    // Validate timing window structure
    expect(metadata.timingWindow.optimal).toBeGreaterThanOrEqual(0);
    expect(metadata.timingWindow.duration).toBeGreaterThanOrEqual(0);

    // Validate price target
    expect(metadata.priceTarget).toBeGreaterThanOrEqual(0);
    expect(metadata.priceTarget).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Mean Reversion Agent Tests
// ============================================================================

describe('Mean Reversion Agent', () => {
  let meanReversionAgent: ReturnType<typeof createMeanReversionAgentNode>;
  let mockLLM: any;

  beforeEach(() => {
    mockLLM = createMockLLM({
      overextensionScore: 0.8,
      reversionProbability: 0.75,
      reversionTarget: 0.60,
      timingEstimate: 6,
      crowdOverreaction: true,
    });
    meanReversionAgent = createMeanReversionAgentNode(mockLLM);
  });

  it('should skip analysis when MBD is missing', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: null,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await meanReversionAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('mean_reversion');
    expect(result.auditLog).toBeDefined();
  });

  it('should skip analysis when volume is below threshold', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDLowVolume,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await meanReversionAgent(state);

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.length).toBe(1);
    expect(result.auditLog?.[0].data.skipped).toBe(true);
    expect(result.auditLog?.[0].data.reason).toBe('Insufficient price history');
  });

  it('should generate mean reversion signal with overextended prices', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDOverextended,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await meanReversionAgent(state);

    // Should have a signal
    expect(result.agentSignals).toBeDefined();
    expect(result.agentSignals?.length).toBe(1);

    const signal = result.agentSignals?.[0];
    expect(signal?.agentName).toBe('mean_reversion');
    expect(signal?.confidence).toBeGreaterThanOrEqual(0);
    expect(signal?.confidence).toBeLessThanOrEqual(1);
    expect(signal?.fairProbability).toBeGreaterThanOrEqual(0);
    expect(signal?.fairProbability).toBeLessThanOrEqual(1);
    expect(['YES', 'NO', 'NEUTRAL']).toContain(signal?.direction);
    expect(signal?.keyDrivers.length).toBeGreaterThan(0);

    // Check mean reversion-specific metadata
    expect(signal?.metadata).toBeDefined();
    const metadata = signal?.metadata as any;
    expect(metadata.overextensionScore).toBeDefined();
    expect(metadata.reversionProbability).toBeDefined();
    expect(metadata.reversionTarget).toBeDefined();
    expect(metadata.timingEstimate).toBeDefined();
    expect(metadata.crowdOverreaction).toBeDefined();

    // Audit log should show success
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(true);
  });

  it('should include reversion indicators in signal metadata', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDOverextended,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await meanReversionAgent(state);

    const signal = result.agentSignals?.[0];
    const metadata = signal?.metadata as any;

    // Validate overextension score range
    expect(metadata.overextensionScore).toBeGreaterThanOrEqual(0);
    expect(metadata.overextensionScore).toBeLessThanOrEqual(1);

    // Validate reversion probability range
    expect(metadata.reversionProbability).toBeGreaterThanOrEqual(0);
    expect(metadata.reversionProbability).toBeLessThanOrEqual(1);

    // Validate reversion target range
    expect(metadata.reversionTarget).toBeGreaterThanOrEqual(0);
    expect(metadata.reversionTarget).toBeLessThanOrEqual(1);

    // Validate timing estimate
    expect(metadata.timingEstimate).toBeGreaterThanOrEqual(0);

    // Validate crowd overreaction flag
    expect(typeof metadata.crowdOverreaction).toBe('boolean');
  });

  it('should detect higher overextension for prices far from mean', async () => {
    const state: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDOverextended,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    const result = await meanReversionAgent(state);

    const signal = result.agentSignals?.[0];
    const metadata = signal?.metadata as any;

    // With probability at 0.85 (far from 0.5 mean), overextension should be significant
    expect(metadata.overextensionScore).toBeGreaterThan(0.3);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Price Action Agents Integration', () => {
  it('should handle both agents in sequence', async () => {
    const momentumLLM = createMockLLM({
      momentumScore: 0.6,
      breakoutProbability: 0.7,
      orderFlowImbalance: 0.3,
      timingWindow: { optimal: 2, duration: 4 },
      priceTarget: 0.70,
    });
    const reversionLLM = createMockLLM({
      overextensionScore: 0.8,
      reversionProbability: 0.75,
      reversionTarget: 0.60,
      timingEstimate: 6,
      crowdOverreaction: true,
    });

    const momentumAgent = createMomentumAgentNode(momentumLLM);
    const meanReversionAgent = createMeanReversionAgentNode(reversionLLM);

    const initialState: GraphStateType = {
      conditionId: 'test',
      mbd: mockMBDHighVolume,
      ingestionError: null,
      activeAgents: [],
      externalData: null,
      agentSignals: [],
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

    // Run momentum agent
    const momentumResult = await momentumAgent(initialState);
    expect(momentumResult.agentSignals?.length).toBe(1);

    // Merge state
    const stateAfterMomentum: GraphStateType = {
      ...initialState,
      agentSignals: [...initialState.agentSignals, ...(momentumResult.agentSignals || [])],
      auditLog: [...initialState.auditLog, ...(momentumResult.auditLog || [])],
    };

    // Run mean reversion agent
    const reversionResult = await meanReversionAgent(stateAfterMomentum);
    expect(reversionResult.agentSignals?.length).toBe(1);

    // Final state should have both signals
    const finalSignals = [
      ...stateAfterMomentum.agentSignals,
      ...(reversionResult.agentSignals || []),
    ];
    expect(finalSignals.length).toBe(2);
    expect(finalSignals[0].agentName).toBe('momentum');
    expect(finalSignals[1].agentName).toBe('mean_reversion');
  });
});
