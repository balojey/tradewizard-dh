/**
 * Unit tests for Polling & Statistical Agents
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPollingIntelligenceAgentNode,
  createHistoricalPatternAgentNode,
  PollingIntelligenceSignalSchema,
  HistoricalPatternSignalSchema,
} from './polling-statistical.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type { MarketBriefingDocument } from '../models/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockConfig: EngineConfig = {
  llm: {
    singleProvider: 'openai',
    openai: {
      apiKey: 'test-key',
      defaultModel: 'gpt-4',
    },
    anthropic: {
      apiKey: 'test-key',
      defaultModel: 'claude-3-5-sonnet-20241022',
    },
    google: {
      apiKey: 'test-key',
      defaultModel: 'gemini-2.0-flash-exp',
    },
  },
  polymarket: {
    apiKey: 'test-key',
    clob: {
      host: 'https://clob.polymarket.com',
      chainId: 137,
    },
    gamma: {
      apiUrl: 'https://gamma-api.polymarket.com',
    },
  },
};

const mockMBD: MarketBriefingDocument = {
  marketId: 'test-market-123',
  conditionId: 'test-condition-456',
  eventType: 'election',
  question: 'Will candidate X win the 2024 election?',
  resolutionCriteria: 'Resolves YES if candidate X wins, NO otherwise',
  expiryTimestamp: Date.now() + 86400000,
  currentProbability: 0.55,
  liquidityScore: 7.5,
  bidAskSpread: 0.02,
  volatilityRegime: 'medium',
  volume24h: 50000,
  metadata: {
    ambiguityFlags: [],
    keyCatalysts: [
      {
        event: 'Presidential Debate',
        timestamp: Date.now() + 3600000,
      },
    ],
  },
};

const mockPollingData = {
  polls: [
    {
      pollster: 'Pollster A',
      date: Date.now() - 86400000,
      sampleSize: 1000,
      yesPercentage: 52,
      noPercentage: 48,
      marginOfError: 3,
      methodology: 'Phone survey',
    },
    {
      pollster: 'Pollster B',
      date: Date.now() - 172800000,
      sampleSize: 1500,
      yesPercentage: 54,
      noPercentage: 46,
      marginOfError: 2.5,
      methodology: 'Online panel',
    },
    {
      pollster: 'Pollster C',
      date: Date.now() - 259200000,
      sampleSize: 800,
      yesPercentage: 50,
      noPercentage: 50,
      marginOfError: 3.5,
      methodology: 'Mixed mode',
    },
  ],
  aggregatedProbability: 0.52,
  momentum: 'rising' as const,
  biasAdjustment: 0.02,
};

// ============================================================================
// Polling Intelligence Agent Tests
// ============================================================================

describe('Polling Intelligence Agent', () => {
  let pollingAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    pollingAgent = createPollingIntelligenceAgentNode(mockConfig);
  });

  it('should skip when no MBD is available', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
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

    const result = await pollingAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('polling_intelligence');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });

  it('should skip when no polling data is available', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
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

    const result = await pollingAgent(state);

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.skipped).toBe(true);
    expect(result.auditLog?.[0].data.reason).toBe('No polling data available');
  });

  it('should skip when polling data has empty polls array', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        polling: {
          polls: [],
          aggregatedProbability: 0.5,
          momentum: 'stable',
          biasAdjustment: 0,
        },
        dataFreshness: { polling: Date.now() },
      },
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

    const result = await pollingAgent(state);

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.skipped).toBe(true);
    expect(result.auditLog?.[0].data.reason).toBe('No polling data available');
  });

  it('should produce valid signal structure with polling data', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        polling: mockPollingData,
        dataFreshness: { polling: Date.now() },
      },
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

    const result = await pollingAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('polling_intelligence');
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);
      expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
      expect(signal.fairProbability).toBeLessThanOrEqual(1);
      expect(signal.keyDrivers.length).toBeGreaterThan(0);
      expect(signal.keyDrivers.length).toBeLessThanOrEqual(5);

      // Validate metadata structure
      expect(signal.metadata).toBeDefined();
      const metadata = signal.metadata as any;
      expect(typeof metadata.aggregatedProbability).toBe('number');
      expect(metadata.aggregatedProbability).toBeGreaterThanOrEqual(0);
      expect(metadata.aggregatedProbability).toBeLessThanOrEqual(1);
      expect(['rising', 'falling', 'stable']).toContain(metadata.momentum);
      expect(typeof metadata.pollCount).toBe('number');
      expect(metadata.pollCount).toBeGreaterThanOrEqual(0);
      expect(typeof metadata.averageSampleSize).toBe('number');
      expect(metadata.biasAdjustments).toBeDefined();
      expect(typeof metadata.biasAdjustments).toBe('object');
      expect(Array.isArray(metadata.outlierPolls)).toBe(true);
      expect(Array.isArray(metadata.methodologyConcerns)).toBe(true);

      // Validate schema compliance
      const parseResult = PollingIntelligenceSignalSchema.safeParse(signal);
      expect(parseResult.success).toBe(true);
    } else {
      // If no signal, should have an error
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors?.length).toBeGreaterThan(0);
    }
  });

  it('should handle bias adjustment logic', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        polling: mockPollingData,
        dataFreshness: { polling: Date.now() },
      },
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

    const result = await pollingAgent(state);

    // If signal produced, verify bias adjustments are present
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];
      const metadata = signal.metadata as any;

      // Bias adjustments should be a record (object)
      expect(typeof metadata.biasAdjustments).toBe('object');
      expect(metadata.biasAdjustments).not.toBeNull();
    }
  });

  it('should handle errors gracefully', async () => {
    // Create a config with invalid API key to trigger error
    const invalidConfig: EngineConfig = {
      ...mockConfig,
      llm: {
        singleProvider: 'google',
        google: {
          apiKey: 'invalid-key-12345',
          defaultModel: 'gemini-2.0-flash-exp',
        },
      },
    };

    const agent = createPollingIntelligenceAgentNode(invalidConfig);

    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        polling: mockPollingData,
        dataFreshness: { polling: Date.now() },
      },
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

    const result = await agent(state);

    // Should produce an error
    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBeGreaterThan(0);
    expect(result.agentErrors?.[0].agentName).toBe('polling_intelligence');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});

// ============================================================================
// Historical Pattern Agent Tests
// ============================================================================

describe('Historical Pattern Agent', () => {
  let historicalAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    historicalAgent = createHistoricalPatternAgentNode(mockConfig);
  });

  it('should skip when no MBD is available', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
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

    const result = await historicalAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('historical_pattern');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });

  it('should produce valid signal structure with historical data', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
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

    const result = await historicalAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('historical_pattern');
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);
      expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
      expect(signal.fairProbability).toBeLessThanOrEqual(1);
      expect(signal.keyDrivers.length).toBeGreaterThan(0);
      expect(signal.keyDrivers.length).toBeLessThanOrEqual(5);

      // Validate metadata structure
      expect(signal.metadata).toBeDefined();
      const metadata = signal.metadata as any;
      expect(metadata.analogs).toBeDefined();
      expect(Array.isArray(metadata.analogs)).toBe(true);
      expect(typeof metadata.patternSuccessRate).toBe('number');
      expect(metadata.patternSuccessRate).toBeGreaterThanOrEqual(0);
      expect(metadata.patternSuccessRate).toBeLessThanOrEqual(1);
      expect(typeof metadata.applicabilityScore).toBe('number');
      expect(metadata.applicabilityScore).toBeGreaterThanOrEqual(0);
      expect(metadata.applicabilityScore).toBeLessThanOrEqual(1);

      // Validate analog structure if any exist
      if (metadata.analogs.length > 0) {
        const analog = metadata.analogs[0];
        expect(typeof analog.event).toBe('string');
        expect(typeof analog.date).toBe('number');
        expect(['YES', 'NO']).toContain(analog.outcome);
        expect(typeof analog.similarity).toBe('number');
        expect(analog.similarity).toBeGreaterThanOrEqual(0);
        expect(analog.similarity).toBeLessThanOrEqual(1);
        expect(Array.isArray(analog.keyFactors)).toBe(true);
      }

      // Validate schema compliance
      const parseResult = HistoricalPatternSignalSchema.safeParse(signal);
      expect(parseResult.success).toBe(true);
    } else {
      // If no signal, should have an error
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors?.length).toBeGreaterThan(0);
    }
  });

  it('should handle errors gracefully', async () => {
    // Create a config with invalid API key to trigger error
    const invalidConfig: EngineConfig = {
      ...mockConfig,
      llm: {
        singleProvider: 'anthropic',
        anthropic: {
          apiKey: 'sk-ant-invalid-key-12345',
          defaultModel: 'claude-3-5-sonnet-20241022',
        },
      },
    };

    const agent = createHistoricalPatternAgentNode(invalidConfig);

    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
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

    const result = await agent(state);

    // Should produce an error
    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBeGreaterThan(0);
    expect(result.agentErrors?.[0].agentName).toBe('historical_pattern');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});
