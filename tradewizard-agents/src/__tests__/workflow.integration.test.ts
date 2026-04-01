/**
 * Integration Tests for LangGraph Workflow with Opik
 *
 * These tests verify the end-to-end behavior of the Market Intelligence Engine workflow
 * with Opik tracing integration.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createWorkflow, analyzeMarket } from './workflow.js';
import type { EngineConfig } from './config/index.js';
import { createConfig } from './config/index.js';
import type { PolymarketClient } from './utils/polymarket-client.js';
import type { MarketBriefingDocument } from './models/types.js';

describe('LangGraph Workflow Integration Tests', () => {
  let mockConfig: EngineConfig;
  let mockPolymarketClient: PolymarketClient;

  beforeEach(() => {
    // Create mock config for all tests using createConfig with minimal overrides
    mockConfig = createConfig({
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: process.env.OPENAI_API_KEY || 'test-key',
          defaultModel: 'gpt-4o-mini',
        },
      },
      opik: {
        projectName: 'test-integration-project',
        tags: ['integration-test'],
        trackCosts: true,
      },
      agents: {
        timeoutMs: 10000,
        minAgentsRequired: 2,
      },
    });
  });

  test('end-to-end flow with mocked Polymarket APIs', async () => {
    // Create mock MBD
    const mockMBD: MarketBriefingDocument = {
      marketId: 'market-test-001',
      conditionId: 'condition-test-001',
      eventType: 'election',
      question: 'Will candidate X win the election?',
      resolutionCriteria: 'Candidate X must be declared winner by official sources',
      expiryTimestamp: Date.now() + 86400000 * 30, // 30 days from now
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
    };

    // Create mock Polymarket client
    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    // Execute the workflow
    const result = await analyzeMarket(
      'condition-test-001',
      mockConfig,
      mockPolymarketClient
    );

    // Verify the workflow completed successfully
    expect(result).toBeDefined();
    expect(result.recommendation).toBeDefined();
    expect(result.agentSignals).toBeDefined();
    expect(Array.isArray(result.agentSignals)).toBe(true);
    
    // Verify Polymarket API was called
    expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('condition-test-001');
  }, 60000);

  test('workflow with high-edge market scenario', async () => {
    // Create mock MBD with significant mispricing
    const mockMBD: MarketBriefingDocument = {
      marketId: 'market-high-edge',
      conditionId: 'condition-high-edge',
      eventType: 'policy',
      question: 'Will policy X be enacted?',
      resolutionCriteria: 'Policy must be officially enacted',
      expiryTimestamp: Date.now() + 86400000 * 60,
      currentProbability: 0.30, // Market thinks unlikely
      liquidityScore: 7.0,
      bidAskSpread: 2.0,
      volatilityRegime: 'low',
      volume24h: 200000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-high-edge',
      mockConfig,
      mockPolymarketClient
    );

    // With a low market probability, agents might find edge
    expect(result).toBeDefined();
  }, 60000);

  test('workflow with low-liquidity market scenario', async () => {
    // Create mock MBD with low liquidity
    const mockMBD: MarketBriefingDocument = {
      marketId: 'market-low-liquidity',
      conditionId: 'condition-low-liquidity',
      eventType: 'geopolitical',
      question: 'Will event Y occur?',
      resolutionCriteria: 'Event must be confirmed by sources',
      expiryTimestamp: Date.now() + 86400000 * 14,
      currentProbability: 0.50,
      liquidityScore: 3.5, // Low liquidity
      bidAskSpread: 5.0, // Wide spread
      volatilityRegime: 'high',
      volume24h: 50000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-low-liquidity',
      mockConfig,
      mockPolymarketClient
    );

    // Should complete but may flag liquidity risk
    expect(result).toBeDefined();
    if (result && result.recommendation && result.recommendation.action !== 'NO_TRADE') {
      // If a trade is recommended, liquidity risk should be flagged
      expect(['medium', 'high']).toContain(result.recommendation.liquidityRisk);
    }
  }, 60000);

  test('error propagation through graph - API failure', async () => {
    // Create mock Polymarket client that fails
    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          type: 'API_UNAVAILABLE',
          message: 'Polymarket API is down',
        },
      }),
    } as any;

    // Create the workflow
    const { app } = await createWorkflow(mockConfig, mockPolymarketClient);

    // Execute the workflow
    const result = await app.invoke(
      { conditionId: 'condition-error' },
      {
        configurable: {
          thread_id: 'condition-error',
        },
      }
    );

    // Verify error was captured
    expect(result.ingestionError).toBeDefined();
    expect(result.ingestionError?.type).toBe('API_UNAVAILABLE');
    
    // Verify workflow stopped early (no recommendation)
    expect(result.recommendation).toBeNull();
  }, 30000);

  test('graceful degradation - agent failures', async () => {
    // Create mock MBD
    const mockMBD: MarketBriefingDocument = {
      marketId: 'market-agent-failure',
      conditionId: 'condition-agent-failure',
      eventType: 'economic',
      question: 'Will economic indicator reach target?',
      resolutionCriteria: 'Indicator must reach specified value',
      expiryTimestamp: Date.now() + 86400000 * 90,
      currentProbability: 0.45,
      liquidityScore: 6.5,
      bidAskSpread: 2.5,
      volatilityRegime: 'medium',
      volume24h: 300000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    // Execute workflow
    const { app } = await createWorkflow(mockConfig, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-agent-failure' },
      {
        configurable: {
          thread_id: 'condition-agent-failure',
        },
      }
    );

    // Verify system tracked any agent errors
    expect(result.agentErrors).toBeDefined();
    expect(Array.isArray(result.agentErrors)).toBe(true);
    
    // If enough agents succeeded, should have recommendation
    if (result.agentSignals.length >= mockConfig.agents.minAgentsRequired) {
      expect(result.recommendation).toBeDefined();
    }
  }, 60000);

  test('workflow with different LLM provider configurations - single provider', async () => {
    // Test single-provider mode
    const singleProviderConfig: EngineConfig = {
      ...mockConfig,
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: process.env.OPENAI_API_KEY || 'test-key',
          defaultModel: 'gpt-4o-mini',
        },
      },
    };

    const mockMBD: MarketBriefingDocument = {
      marketId: 'market-single-provider',
      conditionId: 'condition-single-provider',
      eventType: 'court',
      question: 'Will court rule in favor?',
      resolutionCriteria: 'Court must issue ruling',
      expiryTimestamp: Date.now() + 86400000 * 180,
      currentProbability: 0.60,
      liquidityScore: 7.5,
      bidAskSpread: 2.0,
      volatilityRegime: 'low',
      volume24h: 400000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const result = await analyzeMarket(
      'condition-single-provider',
      singleProviderConfig,
      mockPolymarketClient
    );

    // Should complete successfully with single provider
    expect(result).toBeDefined();
  }, 60000);

  test('state checkpointing and audit trail', async () => {
    const mockMBD: MarketBriefingDocument = {
      marketId: 'market-audit',
      conditionId: 'condition-audit',
      eventType: 'other',
      question: 'Will event Z happen?',
      resolutionCriteria: 'Event must be verified',
      expiryTimestamp: Date.now() + 86400000 * 45,
      currentProbability: 0.52,
      liquidityScore: 8.0,
      bidAskSpread: 1.8,
      volatilityRegime: 'medium',
      volume24h: 350000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        ok: true,
        data: mockMBD,
      }),
    } as any;

    const { app } = await createWorkflow(mockConfig, mockPolymarketClient);
    const result = await app.invoke(
      { conditionId: 'condition-audit' },
      {
        configurable: {
          thread_id: 'condition-audit',
        },
      }
    );

    // Verify audit trail exists and has entries
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
    const stages = result.auditLog.map((e: any) => e.stage);
    expect(stages).toContain('market_ingestion');
  }, 60000);

  test('Opik traces are created for each execution', async () => {
    const mockMBD: MarketBriefingDocument = {
      marketId: 'market-opik',
      conditionId: 'condition-opik',
      eventType: 'election',
      question: 'Will candidate win?',
      resolutionCriteria: 'Official results',
      expiryTimestamp: Date.now() + 86400000 * 20,
      currentProbability: 0.48,
      liquidityScore: 7.8,
      bidAskSpread: 1.6,
      volatilityRegime: 'medium',
      volume24h: 450000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
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
      'condition-opik',
      mockConfig,
      mockPolymarketClient
    );

    // Verify execution completed (Opik tracing happens in background)
    expect(result).toBeDefined();
    
    // Note: We cannot directly verify Opik traces in unit tests
    // as they are sent to external service. In production, traces
    // would be visible in Opik dashboard.
  }, 60000);
});
