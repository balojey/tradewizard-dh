/**
 * Unit tests for Autonomous Polling Agent Node
 *
 * These tests verify the basic functionality of the autonomous polling agent,
 * including agent creation, execution, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutonomousPollingAgentNode } from './autonomous-polling-agent.js';
import type { EngineConfig } from '../config/index.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument } from '../models/types.js';

// Mock the dependencies
vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn(() => ({
    invoke: vi.fn(async () => ({
      messages: [
        {
          role: 'assistant',
          content: JSON.stringify({
            confidence: 0.75,
            direction: 'YES',
            fairProbability: 0.65,
            keyDrivers: [
              'Strong crowd wisdom signal with high liquidity',
              'Consistent bullish momentum across time horizons',
              'Cross-market sentiment aligns with this market',
            ],
            riskFactors: [
              'Limited historical data for long-term trends',
              'Potential volatility near resolution date',
            ],
            metadata: {
              crowdWisdomScore: 0.8,
              pollingBaseline: 0.6,
              marketDeviation: 0.05,
            },
          }),
        },
      ],
    })),
  })),
}));

vi.mock('../utils/llm-factory.js', () => ({
  createLLMInstance: vi.fn(() => ({
    invoke: vi.fn(),
  })),
}));

vi.mock('../utils/polymarket-client.js', () => ({
  createPolymarketClient: vi.fn(() => ({
    fetchMarketData: vi.fn(),
    fetchEventWithAllMarkets: vi.fn(),
    discoverPoliticalEvents: vi.fn(),
  })),
}));

vi.mock('../tools/polling-tools.js', () => ({
  createPollingTools: vi.fn(() => []),
  getToolUsageSummary: vi.fn(() => ({
    toolsCalled: 2,
    totalToolTime: 500,
    cacheHits: 1,
    cacheMisses: 1,
    errors: 0,
    toolBreakdown: {
      fetchRelatedMarkets: 1,
      analyzeMarketMomentum: 1,
    },
  })),
}));

describe('Autonomous Polling Agent Node', () => {
  let mockConfig: EngineConfig;
  let mockState: GraphStateType;
  let mockMBD: MarketBriefingDocument;

  beforeEach(() => {
    // Create mock configuration
    mockConfig = {
      polymarket: {
        gammaApiUrl: 'https://gamma-api.polymarket.com',
        clobApiUrl: 'https://clob.polymarket.com',
        rateLimitBuffer: 80,
        politicsTagId: 2,
      },
      llm: {
        google: {
          apiKey: 'test-key',
          defaultModel: 'gemini-1.5-flash',
        },
      },
      agents: {
        timeoutMs: 10000,
        minAgentsRequired: 2,
      },
    } as any;

    // Create mock MBD
    mockMBD = {
      marketId: 'test-market-123',
      conditionId: '0x1234567890abcdef',
      eventType: 'election',
      question: 'Will candidate X win the election?',
      resolutionCriteria: 'Resolves YES if candidate X wins',
      expiryTimestamp: Date.now() + 86400000,
      currentProbability: 0.6,
      liquidityScore: 8.5,
      bidAskSpread: 0.012,
      volatilityRegime: 'low',
      volume24h: 50000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    // Create mock state
    mockState = {
      mbd: mockMBD,
      marketKeywords: ['election', 'politics', 'candidate'],
      agentSignals: [],
      auditLog: [],
    } as any;
  });

  it('should create agent node successfully', () => {
    const agentNode = createAutonomousPollingAgentNode(mockConfig);
    expect(agentNode).toBeDefined();
    expect(typeof agentNode).toBe('function');
  });

  it('should execute agent and return valid signal', async () => {
    const agentNode = createAutonomousPollingAgentNode(mockConfig);
    const result = await agentNode(mockState);

    // Verify result structure
    expect(result).toBeDefined();
    expect(result.agentSignals).toBeDefined();
    expect(result.agentSignals?.length).toBe(1);

    // Verify signal structure
    const signal = result.agentSignals![0];
    expect(signal.agentName).toBe('autonomous_polling');
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(1);
    expect(signal.direction).toMatch(/^(YES|NO|NEUTRAL)$/);
    expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
    expect(signal.fairProbability).toBeLessThanOrEqual(1);
    expect(signal.keyDrivers).toBeDefined();
    expect(signal.riskFactors).toBeDefined();

    // Verify tool usage metadata
    expect(signal.metadata.toolUsage).toBeDefined();
    expect(signal.metadata.toolUsage.toolsCalled).toBeDefined();
    expect(signal.metadata.toolUsage.totalToolTime).toBeDefined();
    expect(signal.metadata.toolUsage.cacheHits).toBeDefined();
    expect(signal.metadata.toolUsage.cacheMisses).toBeDefined();

    // Verify audit log
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog?.length).toBe(1);
    expect(result.auditLog![0].stage).toBe('agent_autonomous_polling');
    expect(result.auditLog![0].data.success).toBe(true);
  });

  it('should handle missing MBD gracefully', async () => {
    const agentNode = createAutonomousPollingAgentNode(mockConfig);
    const stateWithoutMBD = { ...mockState, mbd: undefined };

    const result = await agentNode(stateWithoutMBD);

    // Verify error handling
    expect(result.agentErrors).toBeDefined();
    expect(result.agentErrors?.length).toBe(1);
    expect(result.agentErrors![0].type).toBe('EXECUTION_FAILED');
    expect(result.agentErrors![0].agentName).toBe('autonomous_polling');

    // Verify audit log contains error
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog![0].data.success).toBe(false);
    expect(result.auditLog![0].data.error).toContain('No Market Briefing Document');
  });

  it('should include tool usage metadata in signal', async () => {
    const agentNode = createAutonomousPollingAgentNode(mockConfig);
    const result = await agentNode(mockState);

    const signal = result.agentSignals![0];
    const toolUsage = signal.metadata.toolUsage;

    expect(toolUsage).toBeDefined();
    expect(toolUsage.toolsCalled).toBe(2);
    expect(toolUsage.totalToolTime).toBe(500);
    expect(toolUsage.cacheHits).toBeGreaterThanOrEqual(0);
    expect(toolUsage.cacheMisses).toBeGreaterThanOrEqual(0);
    expect(toolUsage.toolBreakdown).toBeDefined();
    expect(toolUsage.toolBreakdown.fetchRelatedMarkets).toBe(1);
    expect(toolUsage.toolBreakdown.analyzeMarketMomentum).toBe(1);
  });

  it('should include tool audit in audit log', async () => {
    const agentNode = createAutonomousPollingAgentNode(mockConfig);
    const result = await agentNode(mockState);

    const auditEntry = result.auditLog![0];
    expect(auditEntry.data.toolsCalled).toBe(2);
    expect(auditEntry.data.totalToolTime).toBe(500);
    expect(auditEntry.data.cacheHits).toBeGreaterThanOrEqual(0);
    expect(auditEntry.data.cacheMisses).toBeGreaterThanOrEqual(0);
  });
});
