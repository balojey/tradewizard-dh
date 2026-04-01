/**
 * Unit tests for Event Scenario Agents
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCatalystAgentNode,
  createTailRiskAgentNode,
  CatalystSignalSchema,
  TailRiskSignalSchema,
} from './event-scenario.js';
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
  eventType: 'policy',
  question: 'Will the Federal Reserve raise interest rates in Q1 2024?',
  resolutionCriteria: 'Resolves YES if Fed raises rates by at least 25 basis points, NO otherwise',
  expiryTimestamp: Date.now() + 86400000 * 90, // 90 days from now
  currentProbability: 0.45,
  liquidityScore: 8.0,
  bidAskSpread: 0.015,
  volatilityRegime: 'high',
  volume24h: 75000,
  metadata: {
    ambiguityFlags: [],
    keyCatalysts: [
      {
        event: 'FOMC Meeting',
        timestamp: Date.now() + 86400000 * 30, // 30 days from now
      },
      {
        event: 'CPI Report Release',
        timestamp: Date.now() + 86400000 * 15, // 15 days from now
      },
    ],
  },
};

const mockNewsArticles = [
  {
    title: 'Fed Chair signals potential rate hike',
    source: 'Financial Times',
    publishedAt: Date.now() - 3600000,
    url: 'https://example.com/article1',
    summary: 'Federal Reserve Chair hints at upcoming rate increase',
    sentiment: 'positive' as const,
    relevanceScore: 0.95,
  },
  {
    title: 'Inflation data shows cooling trend',
    source: 'Wall Street Journal',
    publishedAt: Date.now() - 7200000,
    url: 'https://example.com/article2',
    summary: 'Latest inflation figures suggest economic cooling',
    sentiment: 'neutral' as const,
    relevanceScore: 0.85,
  },
];

// ============================================================================
// Catalyst Agent Tests
// ============================================================================

describe('Catalyst Agent', () => {
  let catalystAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    catalystAgent = createCatalystAgentNode(mockConfig);
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

    const result = await catalystAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('catalyst');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });

  it('should produce valid signal structure with upcoming events', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        news: mockNewsArticles,
        dataFreshness: { news: Date.now() },
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

    const result = await catalystAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('catalyst');
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
      expect(metadata.upcomingCatalysts).toBeDefined();
      expect(Array.isArray(metadata.upcomingCatalysts)).toBe(true);
      expect(typeof metadata.optimalEntryTiming).toBe('number');

      // Validate catalyst structure if any exist
      if (metadata.upcomingCatalysts.length > 0) {
        const catalyst = metadata.upcomingCatalysts[0];
        expect(typeof catalyst.event).toBe('string');
        expect(typeof catalyst.date).toBe('number');
        expect(['high', 'medium', 'low']).toContain(catalyst.expectedImpact);
        expect(['bullish', 'bearish', 'neutral']).toContain(catalyst.direction);
        expect(typeof catalyst.preEventStrategy).toBe('string');
        expect(Array.isArray(catalyst.postEventScenarios)).toBe(true);
      }

      // Validate schema compliance
      const parseResult = CatalystSignalSchema.safeParse(signal);
      expect(parseResult.success).toBe(true);
    } else {
      // If no signal, should have an error
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors?.length).toBeGreaterThan(0);
    }
  });

  it('should work without external news data', async () => {
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

    const result = await catalystAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    // Agent should work with just MBD catalysts
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];
      expect(signal.agentName).toBe('catalyst');
      expect(signal.metadata).toBeDefined();
    } else {
      expect(result.agentErrors).toBeDefined();
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

    const agent = createCatalystAgentNode(invalidConfig);

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
    expect(result.agentErrors?.[0].agentName).toBe('catalyst');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});

// ============================================================================
// Tail-Risk Agent Tests
// ============================================================================

describe('Tail-Risk Agent', () => {
  let tailRiskAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    tailRiskAgent = createTailRiskAgentNode(mockConfig);
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

    const result = await tailRiskAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('tail_risk');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });

  it('should produce valid signal structure with extreme scenarios', async () => {
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

    const result = await tailRiskAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('tail_risk');
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
      expect(metadata.tailScenarios).toBeDefined();
      expect(Array.isArray(metadata.tailScenarios)).toBe(true);
      expect(metadata.convexOpportunities).toBeDefined();
      expect(Array.isArray(metadata.convexOpportunities)).toBe(true);

      // Validate tail scenario structure if any exist
      if (metadata.tailScenarios.length > 0) {
        const scenario = metadata.tailScenarios[0];
        expect(typeof scenario.scenario).toBe('string');
        expect(typeof scenario.probability).toBe('number');
        expect(scenario.probability).toBeGreaterThanOrEqual(0);
        expect(scenario.probability).toBeLessThanOrEqual(1);
        expect(typeof scenario.marketPricing).toBe('number');
        expect(scenario.marketPricing).toBeGreaterThanOrEqual(0);
        expect(scenario.marketPricing).toBeLessThanOrEqual(1);
        expect(typeof scenario.mispricing).toBe('number');
        expect(typeof scenario.payoffRatio).toBe('number');
      }

      // Validate convex opportunity structure if any exist
      if (metadata.convexOpportunities.length > 0) {
        const opportunity = metadata.convexOpportunities[0];
        expect(typeof opportunity.setup).toBe('string');
        expect(typeof opportunity.maxLoss).toBe('number');
        expect(typeof opportunity.expectedGain).toBe('number');
        expect(typeof opportunity.probabilityOfProfit).toBe('number');
        expect(opportunity.probabilityOfProfit).toBeGreaterThanOrEqual(0);
        expect(opportunity.probabilityOfProfit).toBeLessThanOrEqual(1);
      }

      // Validate schema compliance
      const parseResult = TailRiskSignalSchema.safeParse(signal);
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

    const agent = createTailRiskAgentNode(invalidConfig);

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
    expect(result.agentErrors?.[0].agentName).toBe('tail_risk');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});
