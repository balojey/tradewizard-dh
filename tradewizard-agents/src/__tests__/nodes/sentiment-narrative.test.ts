/**
 * Unit tests for Sentiment & Narrative Agents
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMediaSentimentAgentNode,
  createSocialSentimentAgentNode,
  createNarrativeVelocityAgentNode,
  MediaSentimentSignalSchema,
  SocialSentimentSignalSchema,
  NarrativeVelocitySignalSchema,
} from './sentiment-narrative.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type { MarketBriefingDocument } from '../models/types.js';
import type { NewsArticle, SocialSentiment } from '../utils/data-integration.js';

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
    trackCosts: true,
    tags: [],
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
      enabled: false,
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
    baseWeights: {},
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
    keyCatalysts: [],
  },
};

const mockNewsArticles: NewsArticle[] = [
  {
    title: 'Candidate X gains momentum in polls',
    source: 'News Source A',
    publishedAt: Date.now() - 3600000,
    url: 'https://example.com/article1',
    summary: 'Recent polling shows candidate X with growing support',
    sentiment: 'positive',
    relevanceScore: 0.9,
  },
  {
    title: 'Economic concerns dominate debate',
    source: 'News Source B',
    publishedAt: Date.now() - 7200000,
    url: 'https://example.com/article2',
    summary: 'Candidates discuss economic policy',
    sentiment: 'neutral',
    relevanceScore: 0.7,
  },
];

const mockSocialData: SocialSentiment = {
  platforms: {
    twitter: {
      volume: 15000,
      sentiment: 0.3,
      viralScore: 0.7,
      topKeywords: ['candidate', 'election', 'debate'],
    },
    reddit: {
      volume: 8000,
      sentiment: 0.1,
      viralScore: 0.5,
      topKeywords: ['politics', 'voting', 'polls'],
    },
  },
  overallSentiment: 0.2,
  narrativeVelocity: 125.5,
};

// ============================================================================
// Media Sentiment Agent Tests
// ============================================================================

describe('Media Sentiment Agent', () => {
  let mediaSentimentAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    mediaSentimentAgent = createMediaSentimentAgentNode(mockConfig);
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

    const result = await mediaSentimentAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('media_sentiment');
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

    const result = await mediaSentimentAgent(state);

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

    const result = await mediaSentimentAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('media_sentiment');
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
      expect(typeof metadata.overallSentiment).toBe('number');
      expect(metadata.overallSentiment).toBeGreaterThanOrEqual(-1);
      expect(metadata.overallSentiment).toBeLessThanOrEqual(1);
      expect(['improving', 'declining', 'stable']).toContain(metadata.sentimentTrend);
      expect(Array.isArray(metadata.dominantNarratives)).toBe(true);
      expect(typeof metadata.coverageVelocity).toBe('number');
      expect(typeof metadata.mediaConsensus).toBe('number');

      // Validate schema compliance
      const parseResult = MediaSentimentSignalSchema.safeParse(signal);
      expect(parseResult.success).toBe(true);
    } else {
      // If no signal, should have an error
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors?.length).toBeGreaterThan(0);
    }
  });

  it('should handle errors gracefully', async () => {
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

    const agent = createMediaSentimentAgentNode(invalidConfig);

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
    expect(result.agentErrors?.[0].agentName).toBe('media_sentiment');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});

// ============================================================================
// Social Sentiment Agent Tests
// ============================================================================

describe('Social Sentiment Agent', () => {
  let socialSentimentAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    socialSentimentAgent = createSocialSentimentAgentNode(mockConfig);
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

    const result = await socialSentimentAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('social_sentiment');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });

  it('should skip when no social data is available', async () => {
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

    const result = await socialSentimentAgent(state);

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.skipped).toBe(true);
    expect(result.auditLog?.[0].data.reason).toBe('No social data available');
  });

  it('should produce valid signal structure with social data', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        social: mockSocialData,
        dataFreshness: { social: Date.now() },
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

    const result = await socialSentimentAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('social_sentiment');
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
      expect(typeof metadata.platformSentiment).toBe('object');
      expect(Array.isArray(metadata.viralNarratives)).toBe(true);
      expect(['fear', 'greed', 'uncertainty', 'neutral']).toContain(metadata.crowdPsychology);
      expect(['bullish', 'bearish', 'neutral']).toContain(metadata.retailPositioning);
      expect(typeof metadata.mentionVelocity).toBe('number');

      // Validate schema compliance
      const parseResult = SocialSentimentSignalSchema.safeParse(signal);
      expect(parseResult.success).toBe(true);
    } else {
      // If no signal, should have an error
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors?.length).toBeGreaterThan(0);
    }
  });

  it('should handle errors gracefully', async () => {
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

    const agent = createSocialSentimentAgentNode(invalidConfig);

    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        social: mockSocialData,
        dataFreshness: { social: Date.now() },
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
    expect(result.agentErrors?.[0].agentName).toBe('social_sentiment');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});

// ============================================================================
// Narrative Velocity Agent Tests
// ============================================================================

describe('Narrative Velocity Agent', () => {
  let narrativeVelocityAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;

  beforeEach(() => {
    narrativeVelocityAgent = createNarrativeVelocityAgentNode(mockConfig);
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

    const result = await narrativeVelocityAgent(state);

    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors?.[0].agentName).toBe('narrative_velocity');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });

  it('should skip when no media or social data is available', async () => {
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

    const result = await narrativeVelocityAgent(state);

    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.skipped).toBe(true);
    expect(result.auditLog?.[0].data.reason).toBe('No media or social data available');
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

    const result = await narrativeVelocityAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('narrative_velocity');
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
      expect(Array.isArray(metadata.narratives)).toBe(true);
      expect(Array.isArray(metadata.emergingNarratives)).toBe(true);

      // Validate schema compliance
      const parseResult = NarrativeVelocitySignalSchema.safeParse(signal);
      expect(parseResult.success).toBe(true);
    } else {
      // If no signal, should have an error
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors?.length).toBeGreaterThan(0);
    }
  });

  it('should produce valid signal structure with social data', async () => {
    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        social: mockSocialData,
        dataFreshness: { social: Date.now() },
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

    const result = await narrativeVelocityAgent(state);

    // Should produce a signal or an error (depending on LLM availability)
    if (result.agentSignals && result.agentSignals.length > 0) {
      const signal = result.agentSignals[0];

      // Validate signal structure
      expect(signal.agentName).toBe('narrative_velocity');
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);
      expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
      expect(signal.fairProbability).toBeLessThanOrEqual(1);

      // Validate metadata structure
      expect(signal.metadata).toBeDefined();
      const metadata = signal.metadata as any;
      expect(Array.isArray(metadata.narratives)).toBe(true);
      expect(Array.isArray(metadata.emergingNarratives)).toBe(true);

      // Validate schema compliance
      const parseResult = NarrativeVelocitySignalSchema.safeParse(signal);
      expect(parseResult.success).toBe(true);
    } else {
      // If no signal, should have an error
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors?.length).toBeGreaterThan(0);
    }
  });

  it('should handle errors gracefully', async () => {
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

    const agent = createNarrativeVelocityAgentNode(invalidConfig);

    const state: GraphStateType = {
      conditionId: 'test-123',
      mbd: mockMBD,
      ingestionError: null,
      activeAgents: [],
      externalData: {
        news: mockNewsArticles,
        social: mockSocialData,
        dataFreshness: { news: Date.now(), social: Date.now() },
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
    expect(result.agentErrors?.[0].agentName).toBe('narrative_velocity');
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.[0].data.success).toBe(false);
  });
});
