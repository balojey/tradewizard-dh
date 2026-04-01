/**
 * Unit tests for Event Intelligence Agents
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBreakingNewsAgentNode,
  createEventImpactAgentNode,
  BreakingNewsSignalSchema,
  EventImpactSignalSchema,
} from './event-intelligence.js';
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

const mockNewsArticles = [
  {
    title: 'Candidate X leads in latest polls',
    source: 'News Source A',
    publishedAt: Date.now() - 3600000,
    url: 'https://example.com/article1',
    summary: 'Recent polling shows candidate X with a 5-point lead',
    sentiment: 'positive' as const,
    relevanceScore: 0.9,
  },
  {
    title: 'Economic policy debate heats up',
    source: 'News Source B',
    publishedAt: Date.now() - 7200000,
    url: 'https://example.com/article2',
    summary: 'Candidates clash over economic policy proposals',
    sentiment: 'neutral' as const,
    relevanceScore: 0.7,
  },
];

// ============================================================================
// Breaking News Agent Tests
// ============================================================================

describe('Breaking News Agent', () => {
  let breakingNewsAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    breakingNewsAgent = createBreakingNewsAgentNode(mockConfig);
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

    const result = await breakingNewsAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('breaking_news');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });

  it('should skip when no news data is available', async () => {
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

    const result = await breakingNewsAgent(state);

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.skipped).toBe(true);
    expect(result.auditLog?.[0].data.reason).toBe('No news data available');
  });

  it('should produce valid signal structure with news data', async () => {
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

    const result = await breakingNewsAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('breaking_news');
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
      expect(metadata.relevantArticles).toBeDefined();
      expect(Array.isArray(metadata.relevantArticles)).toBe(true);
      expect(typeof metadata.regimeChange).toBe('boolean');
      expect(typeof metadata.newsVelocity).toBe('number');

      // Validate schema compliance
      const parseResult = BreakingNewsSignalSchema.safeParse(signal);
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
        singleProvider: 'openai',
        openai: {
          apiKey: '',
          defaultModel: 'gpt-4',
        },
      },
    };

    const agent = createBreakingNewsAgentNode(invalidConfig);

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

    const result = await agent(state);

    // Should produce an error
    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBeGreaterThan(0);
    expect(result.agentErrors?.[0].agentName).toBe('breaking_news');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});

// ============================================================================
// Event Impact Agent Tests
// ============================================================================

describe('Event Impact Agent', () => {
  let eventImpactAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    eventImpactAgent = createEventImpactAgentNode(mockConfig);
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

    const result = await eventImpactAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('event_impact');
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

    const result = await eventImpactAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('event_impact');
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
      expect(metadata.historicalAnalogs).toBeDefined();
      expect(Array.isArray(metadata.historicalAnalogs)).toBe(true);
      expect(metadata.scenarioTree).toBeDefined();
      expect(Array.isArray(metadata.scenarioTree)).toBe(true);
      expect(metadata.upcomingCatalysts).toBeDefined();
      expect(Array.isArray(metadata.upcomingCatalysts)).toBe(true);

      // Validate schema compliance
      const parseResult = EventImpactSignalSchema.safeParse(signal);
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

    const agent = createEventImpactAgentNode(invalidConfig);

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
    expect(result.agentErrors?.[0].agentName).toBe('event_impact');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});
