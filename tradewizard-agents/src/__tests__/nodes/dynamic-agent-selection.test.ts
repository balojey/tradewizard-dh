/**
 * Unit Tests for Dynamic Agent Selection Node
 *
 * Tests agent selection logic for different market types, data availability,
 * configuration filtering, and cost optimization.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  dynamicAgentSelectionNode,
  MVP_AGENTS
} from './dynamic-agent-selection.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type { DataIntegrationLayer } from '../utils/data-integration.js';
import type { MarketBriefingDocument } from '../models/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockMBD(overrides: Partial<MarketBriefingDocument> = {}): MarketBriefingDocument {
  return {
    marketId: 'test-market-123',
    conditionId: 'test-condition-456',
    eventType: 'election',
    question: 'Will candidate X win the election?',
    resolutionCriteria: 'Resolves YES if candidate X wins',
    expiryTimestamp: Date.now() + 86400000,
    currentProbability: 0.55,
    liquidityScore: 7,
    bidAskSpread: 2,
    volatilityRegime: 'medium',
    volume24h: 5000,
    metadata: {
      ambiguityFlags: [],
      keyCatalysts: [],
    },
    ...overrides,
  };
}

function createMockState(mbd: MarketBriefingDocument | null = null): GraphStateType {
  return {
    conditionId: 'test-condition-456',
    mbd,
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
}

function createMockConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
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
      projectName: 'test-project',
      trackCosts: true,
      tags: [],
    },
    llm: {
      openai: {
        apiKey: 'test-key',
        defaultModel: 'gpt-4',
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
        apiKey: 'test-key',
        cacheTTL: 900,
        maxArticles: 20,
      },
      polling: {
        provider: '538',
        apiKey: 'test-key',
        cacheTTL: 3600,
      },
      social: {
        providers: ['twitter', 'reddit'],
        apiKeys: { twitter: 'test-key', reddit: 'test-key' },
        cacheTTL: 300,
        maxMentions: 100,
      },
    },
    signalFusion: {
      baseWeights: {},
      contextAdjustments: true,
      conflictThreshold: 0.2,
      alignmentBonus: 0.2,
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
    ...overrides,
  } as EngineConfig;
}

function createMockDataLayer(
  newsAvailable = true,
  pollingAvailable = true,
  socialAvailable = true
): DataIntegrationLayer {
  return {
    checkDataAvailability: vi.fn(async (source: string) => {
      if (source === 'news') return newsAvailable;
      if (source === 'polling') return pollingAvailable;
      if (source === 'social') return socialAvailable;
      return false;
    }),
  } as any;
}

// ============================================================================
// Tests
// ============================================================================

describe('Dynamic Agent Selection Node', () => {
  describe('Basic Functionality', () => {
    it('should return empty agents when no MBD is available', async () => {
      const state = createMockState(null);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toEqual([]);
      expect(result.auditLog).toHaveLength(1);
      expect(result.auditLog![0].data.success).toBe(false);
    });

    it('should always include MVP agents', async () => {
      const mbd = createMockMBD();
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toEqual(
        expect.arrayContaining([...MVP_AGENTS])
      );
    });

    it('should log selection decisions in audit trail', async () => {
      const mbd = createMockMBD();
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.auditLog).toHaveLength(1);
      expect(result.auditLog![0].stage).toBe('dynamic_agent_selection');
      expect(result.auditLog![0].data.success).toBe(true);
      expect(result.auditLog![0].data.selectionDecisions).toBeDefined();
    });
  });

  describe('Market Type-Based Selection', () => {
    it('should select polling and sentiment agents for election markets', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toEqual(
        expect.arrayContaining([
          'polling_intelligence',
          'media_sentiment',
          'social_sentiment',
        ])
      );
    });

    it('should select event intelligence agents for court markets', async () => {
      const mbd = createMockMBD({ eventType: 'court' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toEqual(
        expect.arrayContaining(['breaking_news', 'event_impact'])
      );
    });

    it('should select event intelligence and sentiment agents for policy markets', async () => {
      const mbd = createMockMBD({ eventType: 'policy' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toEqual(
        expect.arrayContaining([
          'breaking_news',
          'event_impact',
          'media_sentiment',
          'catalyst',
        ])
      );
    });

    it('should select event intelligence agents for economic markets', async () => {
      const mbd = createMockMBD({ eventType: 'economic' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toEqual(
        expect.arrayContaining(['breaking_news', 'historical_pattern'])
      );
    });

    it('should select event intelligence and sentiment agents for geopolitical markets', async () => {
      const mbd = createMockMBD({ eventType: 'geopolitical' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toEqual(
        expect.arrayContaining([
          'breaking_news',
          'media_sentiment',
          'catalyst',
        ])
      );
    });

    it('should select all available agents for unknown market types', async () => {
      const mbd = createMockMBD({ eventType: 'other' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      // Should include agents from multiple groups
      expect(result.activeAgents!.length).toBeGreaterThan(MVP_AGENTS.length + 5);
    });
  });

  describe('Configuration-Based Filtering', () => {
    it('should exclude disabled agent groups', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig({
        advancedAgents: {
          eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: true, pollingIntelligence: true, historicalPattern: true },
          sentimentNarrative: { enabled: true, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: true, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: true, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: true, aggressive: true, conservative: true, neutral: true },
        },
      });
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).not.toContain('breaking_news');
      expect(result.activeAgents).not.toContain('event_impact');
    });

    it('should exclude specific disabled agents within enabled groups', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig({
        advancedAgents: {
          eventIntelligence: { enabled: true, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: true, pollingIntelligence: false, historicalPattern: true },
          sentimentNarrative: { enabled: true, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: true, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: true, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: true, aggressive: true, conservative: true, neutral: true },
        },
      });
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).not.toContain('polling_intelligence');
      expect(result.activeAgents).toContain('historical_pattern');
    });

    it('should work with all agent groups disabled', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig({
        advancedAgents: {
          eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: false, pollingIntelligence: true, historicalPattern: true },
          sentimentNarrative: { enabled: false, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: false, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: false, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: false, aggressive: true, conservative: true, neutral: true },
        },
      });
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      // Should only have MVP agents
      expect(result.activeAgents).toEqual([...MVP_AGENTS]);
    });
  });

  describe('Data Availability Filtering', () => {
    it('should exclude event intelligence agents when news data unavailable', async () => {
      const mbd = createMockMBD({ eventType: 'court' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer(false, true, true); // news unavailable

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).not.toContain('breaking_news');
      expect(result.activeAgents).not.toContain('event_impact');
    });

    it('should exclude historical_pattern when polling data unavailable', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer(true, false, true); // polling unavailable

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      // polling_intelligence is autonomous and should still be included
      expect(result.activeAgents).toContain('polling_intelligence');
      // historical_pattern requires pre-fetched polling data
      expect(result.activeAgents).not.toContain('historical_pattern');
    });

    it('should exclude sentiment agents when both news and social data unavailable', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer(false, true, false); // news and social unavailable

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).not.toContain('media_sentiment');
      expect(result.activeAgents).not.toContain('social_sentiment');
      expect(result.activeAgents).not.toContain('narrative_velocity');
    });

    it('should exclude price action agents when volume is too low', async () => {
      const mbd = createMockMBD({ volume24h: 500 }); // Below threshold
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).not.toContain('momentum');
      expect(result.activeAgents).not.toContain('mean_reversion');
    });

    it('should include price action agents when volume is sufficient', async () => {
      const mbd = createMockMBD({ volume24h: 5000, eventType: 'other' }); // Above threshold
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.activeAgents).toContain('momentum');
      expect(result.activeAgents).toContain('mean_reversion');
    });
  });

  describe('Cost Optimization Filtering', () => {
    it('should not filter agents when cost optimization is disabled', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig({
        costOptimization: {
          maxCostPerAnalysis: 0.5, // Very low budget
          skipLowImpactAgents: false, // But optimization disabled
          batchLLMRequests: true,
        },
      });
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      // Should include many agents despite low budget
      expect(result.activeAgents!.length).toBeGreaterThan(MVP_AGENTS.length + 3);
    });

    it('should prioritize high-impact agents when budget is constrained', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig({
        costOptimization: {
          maxCostPerAnalysis: 0.5, // Very low budget
          skipLowImpactAgents: true, // Optimization enabled
          batchLLMRequests: true,
        },
      });
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      // Should prioritize breaking_news and polling_intelligence
      if (result.activeAgents!.length > MVP_AGENTS.length) {
        const advancedAgents = result.activeAgents!.filter(
          (a) => !MVP_AGENTS.includes(a as any)
        );
        // High priority agents should be included first
        const hasHighPriority =
          advancedAgents.includes('breaking_news') ||
          advancedAgents.includes('polling_intelligence');
        expect(hasHighPriority).toBe(true);
      }
    });

    it('should include all agents when budget is sufficient', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig({
        costOptimization: {
          maxCostPerAnalysis: 10.0, // High budget
          skipLowImpactAgents: true,
          batchLLMRequests: true,
        },
      });
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      // Should include many agents
      expect(result.activeAgents!.length).toBeGreaterThan(MVP_AGENTS.length + 5);
    });
  });

  describe('Audit Logging', () => {
    it('should log all selection decisions', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      expect(result.auditLog).toHaveLength(1);
      const auditEntry = result.auditLog![0];
      expect(auditEntry.data.selectionDecisions).toHaveProperty('mvp_agents');
      expect(auditEntry.data.selectionDecisions).toHaveProperty('market_type');
      expect(auditEntry.data.selectionDecisions).toHaveProperty('configuration_filter');
      expect(auditEntry.data.selectionDecisions).toHaveProperty('data_availability');
      expect(auditEntry.data.selectionDecisions).toHaveProperty('cost_optimization');
    });

    it('should log agent counts', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      const auditEntry = result.auditLog![0];
      expect(auditEntry.data.agentCount).toBeDefined();
      expect(auditEntry.data.mvpAgentCount).toBe(MVP_AGENTS.length);
      expect(auditEntry.data.advancedAgentCount).toBeDefined();
    });

    it('should log execution duration', async () => {
      const mbd = createMockMBD({ eventType: 'election' });
      const state = createMockState(mbd);
      const config = createMockConfig();
      const dataLayer = createMockDataLayer();

      const result = await dynamicAgentSelectionNode(state, config, dataLayer);

      const auditEntry = result.auditLog![0];
      expect(auditEntry.data.duration).toBeDefined();
      expect(typeof auditEntry.data.duration).toBe('number');
      expect(auditEntry.data.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
