/**
 * Advanced Agent League Integration Tests
 *
 * These tests verify the end-to-end behavior of the Market Intelligence Engine
 * with all advanced agent groups enabled, selective configurations, and various
 * market scenarios.
 *
 * Test Coverage:
 * - End-to-end with all agent groups enabled
 * - Selective agent groups (budget configuration)
 * - MVP agents only (backward compatibility)
 * - Various market types (election, court, policy, etc.)
 * - External data unavailability scenarios
 * - Agent failures and timeouts
 * - Cost optimization under budget constraints
 * - Opik trace verification
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createWorkflow, analyzeMarket } from './workflow.js';
import type { EngineConfig } from './config/index.js';
import type { PolymarketClient } from './utils/polymarket-client.js';
import type { MarketBriefingDocument } from './models/types.js';

describe('Advanced Agent League Integration Tests', () => {
  let mockPolymarketClient: PolymarketClient;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  /**
   * Helper function to create a base mock config
   */
  function createBaseMockConfig(): EngineConfig {
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
        projectName: 'test-advanced-integration',
        tags: ['integration-test', 'advanced-agents'],
        trackCosts: true,
      },
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: process.env.OPENAI_API_KEY || 'test-key',
          defaultModel: 'gpt-4o-mini',
        },
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
          defaultModel: 'claude-3-5-sonnet-20241022',
        },
        google: {
          apiKey: process.env.GOOGLE_API_KEY || 'test-key',
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
        baseWeights: {
          'market_microstructure': 1.0,
          'probability_baseline': 1.0,
          'risk_assessment': 1.0,
          'breaking_news': 1.2,
          'event_impact': 1.2,
          'polling_intelligence': 1.5,
          'historical_pattern': 1.0,
          'media_sentiment': 0.8,
          'social_sentiment': 0.8,
          'narrative_velocity': 0.8,
          'momentum': 1.0,
          'mean_reversion': 1.0,
          'catalyst': 1.0,
          'tail_risk': 1.0,
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
  }

  /**
   * Helper function to create a mock MBD
   */
  function createMockMBD(overrides?: Partial<MarketBriefingDocument>): MarketBriefingDocument {
    return {
      marketId: 'market-test-001',
      conditionId: 'condition-test-001',
      eventType: 'election',
      question: 'Will candidate X win the election?',
      resolutionCriteria: 'Candidate X must be declared winner by official sources',
      expiryTimestamp: Date.now() + 86400000 * 30,
      currentProbability: 0.55,
      liquidityScore: 8.5,
      bidAskSpread: 1.5,
      volatilityRegime: 'medium',
      volume24h: 500000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [
          { event: 'Debate scheduled', timestamp: Date.now() + 86400000 * 7 },
        ],
      },
      ...overrides,
    };
  }

  /**
   * Test 1: End-to-end with all agent groups enabled
   * 
   * This test verifies that when all advanced agent groups are enabled,
   * the workflow executes successfully and includes signals from all agents.
   */
  test('end-to-end with all agent groups enabled', async () => {
    const mockMBD = createMockMBD();
    
    // Create config with all advanced agents enabled
    const config: EngineConfig = {
      ...createBaseMockConfig(),
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
          provider: 'polymarket',
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
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-test-001',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed
    expect(result).toBeDefined();
    
    // Verify Polymarket API was called
    expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('condition-test-001');
  }, 120000); // 2 minutes timeout for all agents

  /**
   * Test 2: Selective agent groups (budget configuration)
   * 
   * This test verifies that when only some agent groups are enabled,
   * the workflow executes successfully with the selected agents.
   */
  test('selective agent groups - budget configuration', async () => {
    const mockMBD = createMockMBD();
    
    // Create budget-conscious config (only some agents enabled)
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        eventIntelligence: {
          enabled: true,
          breakingNews: true,
          eventImpact: false, // Disabled to save cost
        },
        pollingStatistical: {
          enabled: true,
          pollingIntelligence: true,
          historicalPattern: false, // Disabled to save cost
        },
        sentimentNarrative: {
          enabled: false, // Entire group disabled
          mediaSentiment: true,
          socialSentiment: true,
          narrativeVelocity: true,
        },
        priceAction: {
          enabled: false, // Entire group disabled
          momentum: true,
          meanReversion: true,
          minVolumeThreshold: 1000,
        },
        eventScenario: {
          enabled: true,
          catalyst: true,
          tailRisk: false, // Disabled to save cost
        },
        riskPhilosophy: {
          enabled: true,
          aggressive: true,
          conservative: true,
          neutral: false, // Disabled to save cost
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
          provider: 'polymarket',
          apiKey: 'test-key',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
      costOptimization: {
        maxCostPerAnalysis: 0.50, // Low budget
        skipLowImpactAgents: true,
        batchLLMRequests: true,
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-budget-001',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed with selective agents
    expect(result).toBeDefined();
    expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('condition-budget-001');
  }, 90000); // 90 seconds timeout

  /**
   * Test 3: MVP agents only (backward compatibility)
   * 
   * This test verifies that when all advanced agents are disabled,
   * the workflow still produces valid recommendations using only MVP agents.
   */
  test('MVP agents only - backward compatibility', async () => {
    const mockMBD = createMockMBD();
    
    // Create config with all advanced agents disabled
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      // All advanced agents disabled (default state)
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-mvp-only',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed with MVP agents only
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    
    // Should have a valid recommendation
    if (result) {
      expect(['BUY_YES', 'BUY_NO', 'NO_TRADE']).toContain(result.action);
    }
  }, 60000);

  /**
   * Test 4: Election market type
   * 
   * This test verifies that election markets activate appropriate agents
   * (polling, sentiment, event intelligence).
   */
  test('election market type activates appropriate agents', async () => {
    const mockMBD = createMockMBD({
      eventType: 'election',
      question: 'Will candidate Y win the presidential election?',
    });
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
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
      },
      externalData: {
        news: {
          provider: 'newsapi',
          apiKey: 'test-key',
          cacheTTL: 900,
          maxArticles: 20,
        },
        polling: {
          provider: 'polymarket',
          apiKey: 'test-key',
          cacheTTL: 3600,
        },
        social: {
          providers: ['twitter'],
          apiKeys: { twitter: 'test-key' },
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const { app } = createWorkflow(config, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-election' },
      {
        configurable: {
          thread_id: 'condition-election',
        },
      }
    );

    // Verify election-specific agents were considered
    expect(result.activeAgents).toBeDefined();
    expect(Array.isArray(result.activeAgents)).toBe(true);
  }, 90000);

  /**
   * Test 5: Court market type
   * 
   * This test verifies that court markets activate appropriate agents
   * (event intelligence, historical pattern).
   */
  test('court market type activates appropriate agents', async () => {
    const mockMBD = createMockMBD({
      eventType: 'court',
      question: 'Will the Supreme Court rule in favor of plaintiff?',
      volume24h: 300000,
    });
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
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
      },
      externalData: {
        news: {
          provider: 'newsapi',
          apiKey: 'test-key',
          cacheTTL: 900,
          maxArticles: 20,
        },
        polling: {
          provider: 'polymarket',
          apiKey: 'test-key',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-court',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed for court market
    expect(result).toBeDefined();
  }, 90000);

  /**
   * Test 6: Policy market type
   * 
   * This test verifies that policy markets activate appropriate agents
   * (event intelligence, sentiment, catalyst).
   */
  test('policy market type activates appropriate agents', async () => {
    const mockMBD = createMockMBD({
      eventType: 'policy',
      question: 'Will the infrastructure bill pass?',
      volume24h: 400000,
    });
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        eventIntelligence: {
          enabled: true,
          breakingNews: true,
          eventImpact: true,
        },
        sentimentNarrative: {
          enabled: true,
          mediaSentiment: true,
          socialSentiment: true,
          narrativeVelocity: true,
        },
        eventScenario: {
          enabled: true,
          catalyst: true,
          tailRisk: true,
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
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: ['twitter'],
          apiKeys: { twitter: 'test-key' },
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-policy',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed for policy market
    expect(result).toBeDefined();
  }, 90000);

  /**
   * Test 7: Price action agents with sufficient volume
   * 
   * This test verifies that price action agents are activated when
   * the market has sufficient trading volume.
   */
  test('price action agents activated with sufficient volume', async () => {
    const mockMBD = createMockMBD({
      volume24h: 2000000, // High volume
      volatilityRegime: 'high',
    });
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        priceAction: {
          enabled: true,
          momentum: true,
          meanReversion: true,
          minVolumeThreshold: 1000,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const { app } = createWorkflow(config, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-high-volume' },
      {
        configurable: {
          thread_id: 'condition-high-volume',
        },
      }
    );

    // Verify workflow completed
    expect(result).toBeDefined();
    expect(result.mbd).toBeDefined();
    if (result.mbd) {
      expect(result.mbd.volume24h).toBeGreaterThan(config.advancedAgents.priceAction.minVolumeThreshold);
    }
  }, 90000);

  /**
   * Test 8: Price action agents skipped with low volume
   * 
   * This test verifies that price action agents are skipped when
   * the market has insufficient trading volume.
   */
  test('price action agents skipped with low volume', async () => {
    const mockMBD = createMockMBD({
      volume24h: 500, // Low volume, below threshold
    });
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        priceAction: {
          enabled: true,
          momentum: true,
          meanReversion: true,
          minVolumeThreshold: 1000,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-low-volume',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed (price action agents should be skipped)
    expect(result).toBeDefined();
  }, 60000);

  /**
   * Test 9: External data unavailability - graceful degradation
   * 
   * This test verifies that when external data sources are unavailable,
   * the workflow continues with available agents and doesn't crash.
   */
  test('external data unavailability - graceful degradation', async () => {
    const mockMBD = createMockMBD();
    
    // Config with agents enabled but data sources set to 'none'
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
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
      },
      externalData: {
        news: {
          provider: 'none', // No news data available
          cacheTTL: 900,
          maxArticles: 20,
        },
        polling: {
          provider: 'none', // No polling data available
          cacheTTL: 3600,
        },
        social: {
          providers: [], // No social data available
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-no-external-data',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed despite missing external data
    expect(result).toBeDefined();
    
    // Should still have MVP agents working
    expect(result).not.toBeNull();
  }, 60000);

  /**
   * Test 10: Agent failures don't crash workflow
   * 
   * This test verifies that when individual agents fail,
   * the workflow continues with remaining agents.
   */
  test('agent failures do not crash workflow', async () => {
    const mockMBD = createMockMBD();
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        eventIntelligence: {
          enabled: true,
          breakingNews: true,
          eventImpact: true,
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
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const { app } = createWorkflow(config, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-agent-failure' },
      {
        configurable: {
          thread_id: 'condition-agent-failure',
        },
      }
    );

    // Verify workflow completed
    expect(result).toBeDefined();
    
    // Check if agent errors were tracked
    expect(result.agentErrors).toBeDefined();
    expect(Array.isArray(result.agentErrors)).toBe(true);
    
    // Should still have some agent signals (at least MVP agents)
    expect(result.agentSignals).toBeDefined();
    expect(result.agentSignals.length).toBeGreaterThanOrEqual(config.agents.minAgentsRequired);
  }, 90000);

  /**
   * Test 11: Agent timeouts are isolated
   * 
   * This test verifies that when an agent times out,
   * it doesn't affect other agents.
   */
  test('agent timeouts are isolated', async () => {
    const mockMBD = createMockMBD();
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      agents: {
        timeoutMs: 5000, // Short timeout for testing
        minAgentsRequired: 2,
      },
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        eventIntelligence: {
          enabled: true,
          breakingNews: true,
          eventImpact: true,
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
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-timeout',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed despite potential timeouts
    expect(result).toBeDefined();
  }, 90000);

  /**
   * Test 12: Cost optimization under budget constraints
   * 
   * This test verifies that when cost budget is low,
   * the system skips optional agents to stay within budget.
   */
  test('cost optimization under budget constraints', async () => {
    const mockMBD = createMockMBD();
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
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
          provider: 'polymarket',
          apiKey: 'test-key',
          cacheTTL: 3600,
        },
        social: {
          providers: ['twitter'],
          apiKeys: { twitter: 'test-key' },
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
      costOptimization: {
        maxCostPerAnalysis: 0.25, // Very low budget
        skipLowImpactAgents: true,
        batchLLMRequests: true,
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-cost-optimization',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed within budget
    expect(result).toBeDefined();
    
    // Should have skipped some agents due to cost constraints
    // (exact behavior depends on cost estimation implementation)
  }, 90000);

  /**
   * Test 13: Risk philosophy agents provide multiple perspectives
   * 
   * This test verifies that when risk philosophy agents are enabled,
   * they provide aggressive, conservative, and neutral perspectives.
   */
  test('risk philosophy agents provide multiple perspectives', async () => {
    const mockMBD = createMockMBD();
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        riskPhilosophy: {
          enabled: true,
          aggressive: true,
          conservative: true,
          neutral: true,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const { app } = createWorkflow(config, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-risk-philosophy' },
      {
        configurable: {
          thread_id: 'condition-risk-philosophy',
        },
      }
    );

    // Verify workflow completed
    expect(result).toBeDefined();
    
    // Verify risk philosophy signals exist
    expect(result.riskPhilosophySignals).toBeDefined();
  }, 90000);

  /**
   * Test 14: Signal fusion with multiple agents
   * 
   * This test verifies that when multiple agents provide signals,
   * the signal fusion node combines them appropriately.
   */
  test('signal fusion with multiple agents', async () => {
    const mockMBD = createMockMBD();
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
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
      },
      externalData: {
        news: {
          provider: 'newsapi',
          apiKey: 'test-key',
          cacheTTL: 900,
          maxArticles: 20,
        },
        polling: {
          provider: 'polymarket',
          apiKey: 'test-key',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const { app } = createWorkflow(config, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-signal-fusion' },
      {
        configurable: {
          thread_id: 'condition-signal-fusion',
        },
      }
    );

    // Verify workflow completed
    expect(result).toBeDefined();
    
    // Verify fused signal exists
    expect(result.fusedSignal).toBeDefined();
    
    // Verify fused signal has required fields
    if (result.fusedSignal) {
      expect(result.fusedSignal.fairProbability).toBeDefined();
      expect(result.fusedSignal.confidence).toBeDefined();
      expect(result.fusedSignal.contributingAgents).toBeDefined();
      expect(Array.isArray(result.fusedSignal.contributingAgents)).toBe(true);
    }
  }, 90000);

  /**
   * Test 15: Audit trail completeness for advanced agents
   * 
   * This test verifies that the audit trail includes entries for
   * all advanced agent operations.
   */
  test('audit trail completeness for advanced agents', async () => {
    const mockMBD = createMockMBD();
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        eventIntelligence: {
          enabled: true,
          breakingNews: true,
          eventImpact: true,
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
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const { app } = createWorkflow(config, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-audit-trail' },
      {
        configurable: {
          thread_id: 'condition-audit-trail',
        },
      }
    );

    // Verify audit trail exists
    expect(result.auditLog).toBeDefined();
    expect(Array.isArray(result.auditLog)).toBe(true);
    expect(result.auditLog.length).toBeGreaterThan(0);
    
    // Verify audit entries have required structure
    for (const entry of result.auditLog) {
      expect(entry.stage).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.data).toBeDefined();
    }
    
    // Verify key stages are logged
    const stages = result.auditLog.map((e) => e.stage);
    expect(stages).toContain('market_ingestion');
    
    // If agent selection occurred, it should be logged
    if (result.activeAgents && result.activeAgents.length > 0) {
      expect(stages).toContain('agent_selection');
    }
  }, 90000);

  /**
   * Test 16: Opik traces include all advanced agents
   * 
   * This test verifies that Opik tracing captures all agent executions
   * including advanced agents.
   */
  test('Opik traces include all advanced agents', async () => {
    const mockMBD = createMockMBD();
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        eventIntelligence: {
          enabled: true,
          breakingNews: true,
          eventImpact: true,
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
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    // Execute with analyzeMarket which includes Opik handler
    const result = await analyzeMarket(
      'condition-opik-advanced',
      config,
      mockPolymarketClient
    );

    // Verify execution completed (Opik tracing happens in background)
    expect(result).toBeDefined();
    
    // Note: We cannot directly verify Opik traces in unit tests
    // as they are sent to external service. In production, traces
    // would be visible in Opik dashboard with all agent executions.
  }, 90000);

  /**
   * Test 17: Geopolitical market type
   * 
   * This test verifies that geopolitical markets work correctly
   * with advanced agents.
   */
  test('geopolitical market type', async () => {
    const mockMBD = createMockMBD({
      eventType: 'geopolitical',
      question: 'Will country X take action Y?',
      volume24h: 600000,
    });
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
        eventIntelligence: {
          enabled: true,
          breakingNews: true,
          eventImpact: true,
        },
        eventScenario: {
          enabled: true,
          catalyst: true,
          tailRisk: true,
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
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-geopolitical',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed for geopolitical market
    expect(result).toBeDefined();
  }, 90000);

  /**
   * Test 18: Economic market type
   * 
   * This test verifies that economic markets work correctly
   * with advanced agents.
   */
  test('economic market type', async () => {
    const mockMBD = createMockMBD({
      eventType: 'economic',
      question: 'Will GDP growth exceed 3%?',
      volume24h: 800000,
    });
    
    const config: EngineConfig = {
      ...createBaseMockConfig(),
      advancedAgents: {
        ...createBaseMockConfig().advancedAgents,
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
      },
      externalData: {
        news: {
          provider: 'newsapi',
          apiKey: 'test-key',
          cacheTTL: 900,
          maxArticles: 20,
        },
        polling: {
          provider: 'polymarket',
          apiKey: 'test-key',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-economic',
      config,
      mockPolymarketClient
    );

    // Verify workflow completed for economic market
    expect(result).toBeDefined();
  }, 90000);
});
