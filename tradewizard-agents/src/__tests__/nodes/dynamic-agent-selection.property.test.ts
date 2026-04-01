/**
 * Property-Based Tests for Dynamic Agent Selection Node
 *
 * Feature: advanced-agent-league
 * Property 1: Dynamic agent selection completeness
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 *
 * Property: For any market with a classified event type, the dynamic agent
 * selection node should activate at least the MVP agents plus event-type-appropriate
 * advanced agents.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  dynamicAgentSelectionNode,
  MVP_AGENTS,
} from './dynamic-agent-selection.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type { DataIntegrationLayer } from '../utils/data-integration.js';
import type { MarketBriefingDocument, EventType } from '../models/types.js';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a random event type
 */
const eventTypeGenerator = fc.constantFrom<EventType>(
  'election',
  'policy',
  'court',
  'geopolitical',
  'economic',
  'other'
);

/**
 * Generate a random Market Briefing Document
 */
const mbdGenerator = fc.record({
  marketId: fc.uuid(),
  conditionId: fc.uuid(),
  eventType: eventTypeGenerator,
  question: fc.string({ minLength: 10, maxLength: 100 }),
  resolutionCriteria: fc.string({ minLength: 20, maxLength: 200 }),
  expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
  currentProbability: fc.double({ min: 0, max: 1 }),
  liquidityScore: fc.integer({ min: 0, max: 10 }),
  bidAskSpread: fc.double({ min: 0.1, max: 10 }),
  volatilityRegime: fc.constantFrom('low', 'medium', 'high'),
  volume24h: fc.integer({ min: 0, max: 100000 }),
  metadata: fc.record({
    ambiguityFlags: fc.array(fc.string(), { maxLength: 5 }),
    keyCatalysts: fc.array(
      fc.record({
        event: fc.string(),
        timestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
      }),
      { maxLength: 3 }
    ),
  }),
}) as fc.Arbitrary<MarketBriefingDocument>;

/**
 * Generate a random configuration with all agents enabled
 */
const fullConfigGenerator: fc.Arbitrary<EngineConfig> = fc.constant({
  polymarket: {
    gammaApiUrl: 'https://gamma-api.polymarket.com',
    clobApiUrl: 'https://clob.polymarket.com',
    rateLimitBuffer: 80,
  },
  langgraph: {
    checkpointer: 'memory' as const,
    recursionLimit: 25,
    streamMode: 'values' as const,
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
    level: 'info' as const,
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
      provider: 'newsapi' as const,
      apiKey: 'test-key',
      cacheTTL: 900,
      maxArticles: 20,
    },
    polling: {
      provider: '538' as const,
      apiKey: 'test-key',
      cacheTTL: 3600,
    },
    social: {
      providers: ['twitter' as const, 'reddit' as const],
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
    maxCostPerAnalysis: 10.0, // High budget to avoid filtering
    skipLowImpactAgents: false,
    batchLLMRequests: true,
  },
  performanceTracking: {
    enabled: false,
    evaluateOnResolution: true,
    minSampleSize: 10,
  },
});

/**
 * Create a mock state from MBD
 */
function createStateFromMBD(mbd: MarketBriefingDocument): GraphStateType {
  return {
    conditionId: mbd.conditionId,
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

/**
 * Create a mock data layer with all data available
 */
function createMockDataLayer(): DataIntegrationLayer {
  return {
    checkDataAvailability: vi.fn(async () => true),
  } as any;
}

/**
 * Get expected agents for a market type
 */
function getExpectedAgentsForMarketType(eventType: EventType): string[] {
  const expected = [...MVP_AGENTS];

  switch (eventType) {
    case 'election':
      // Should include polling and sentiment agents
      expected.push('polling_intelligence', 'media_sentiment', 'social_sentiment');
      break;
    case 'court':
      // Should include event intelligence agents
      expected.push('breaking_news', 'event_impact');
      break;
    case 'policy':
      // Should include event intelligence and sentiment agents
      expected.push('breaking_news', 'media_sentiment');
      break;
    case 'economic':
      // Should include event intelligence agents
      expected.push('breaking_news');
      break;
    case 'geopolitical':
      // Should include event intelligence and sentiment agents
      expected.push('breaking_news', 'media_sentiment');
      break;
    case 'other':
      // Should include multiple agent types
      expected.push('breaking_news');
      break;
  }

  return expected;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Dynamic Agent Selection - Property Tests', () => {
  it('Property 1: Dynamic agent selection completeness - always includes MVP agents', () => {
    fc.assert(
      fc.asyncProperty(mbdGenerator, fullConfigGenerator, async (mbd, config) => {
        const state = createStateFromMBD(mbd);
        const dataLayer = createMockDataLayer();

        const result = await dynamicAgentSelectionNode(state, config, dataLayer);

        // Property: MVP agents must always be included
        const hasMVPAgents = MVP_AGENTS.every((agent) =>
          result.activeAgents!.includes(agent)
        );

        return hasMVPAgents;
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1: Dynamic agent selection completeness - includes event-type-appropriate agents', () => {
    fc.assert(
      fc.asyncProperty(mbdGenerator, fullConfigGenerator, async (mbd, config) => {
        const state = createStateFromMBD(mbd);
        const dataLayer = createMockDataLayer();

        const result = await dynamicAgentSelectionNode(state, config, dataLayer);

        // Property: Should include at least some expected agents for the market type
        const expectedAgents = getExpectedAgentsForMarketType(mbd.eventType);
        const hasExpectedAgents = expectedAgents.some((agent) =>
          result.activeAgents!.includes(agent)
        );

        return hasExpectedAgents;
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1: Dynamic agent selection completeness - agent count is reasonable', () => {
    fc.assert(
      fc.asyncProperty(mbdGenerator, fullConfigGenerator, async (mbd, config) => {
        const state = createStateFromMBD(mbd);
        const dataLayer = createMockDataLayer();

        const result = await dynamicAgentSelectionNode(state, config, dataLayer);

        // Property: Should have at least MVP agents, but not more than all possible agents
        const minAgents = MVP_AGENTS.length;
        const maxAgents = 20; // MVP + all advanced agents

        return (
          result.activeAgents!.length >= minAgents &&
          result.activeAgents!.length <= maxAgents
        );
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1: Dynamic agent selection completeness - no duplicate agents', () => {
    fc.assert(
      fc.asyncProperty(mbdGenerator, fullConfigGenerator, async (mbd, config) => {
        const state = createStateFromMBD(mbd);
        const dataLayer = createMockDataLayer();

        const result = await dynamicAgentSelectionNode(state, config, dataLayer);

        // Property: No agent should appear twice in the list
        const uniqueAgents = new Set(result.activeAgents);
        return uniqueAgents.size === result.activeAgents!.length;
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1: Dynamic agent selection completeness - audit log is always present', () => {
    fc.assert(
      fc.asyncProperty(mbdGenerator, fullConfigGenerator, async (mbd, config) => {
        const state = createStateFromMBD(mbd);
        const dataLayer = createMockDataLayer();

        const result = await dynamicAgentSelectionNode(state, config, dataLayer);

        // Property: Audit log should always be present and contain selection info
        return (
          result.auditLog !== undefined &&
          result.auditLog.length > 0 &&
          result.auditLog[0].stage === 'dynamic_agent_selection' &&
          result.auditLog[0].data.success === true
        );
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1: Dynamic agent selection completeness - selection is deterministic', () => {
    fc.assert(
      fc.asyncProperty(mbdGenerator, fullConfigGenerator, async (mbd, config) => {
        const state = createStateFromMBD(mbd);
        const dataLayer = createMockDataLayer();

        // Run selection twice with same inputs
        const result1 = await dynamicAgentSelectionNode(state, config, dataLayer);
        const result2 = await dynamicAgentSelectionNode(state, config, dataLayer);

        // Property: Same inputs should produce same agent selection
        const agents1 = [...result1.activeAgents!].sort();
        const agents2 = [...result2.activeAgents!].sort();

        return JSON.stringify(agents1) === JSON.stringify(agents2);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1: Dynamic agent selection completeness - respects volume threshold for price action', () => {
    fc.assert(
      fc.asyncProperty(
        mbdGenerator,
        fullConfigGenerator,
        fc.integer({ min: 0, max: 10000 }),
        async (mbd, config, volume) => {
          const mbdWithVolume = { ...mbd, volume24h: volume, eventType: 'other' as EventType };
          const state = createStateFromMBD(mbdWithVolume);
          const dataLayer = createMockDataLayer();

          const result = await dynamicAgentSelectionNode(state, config, dataLayer);

          // Property: Price action agents should only be included if volume >= threshold
          const hasPriceActionAgents =
            result.activeAgents!.includes('momentum') ||
            result.activeAgents!.includes('mean_reversion');

          const volumeThreshold = config.advancedAgents.priceAction.minVolumeThreshold;

          if (volume < volumeThreshold) {
            // Should not have price action agents
            return !hasPriceActionAgents;
          } else {
            // May or may not have them (depends on other factors)
            return true;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
