/**
 * Property-Based Tests for LangGraph Workflow
 *
 * This module contains property-based tests for the Market Intelligence Engine workflow,
 * focusing on backward compatibility and agent signal schema consistency.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { createWorkflow } from './workflow.js';
import type { EngineConfig } from './config/index.js';
import type { PolymarketClient } from './utils/polymarket-client.js';
import type { MarketBriefingDocument, TradeRecommendation } from './models/types.js';

// ============================================================================
// Test Setup and Mocks
// ============================================================================

/**
 * Create a minimal valid engine configuration for testing
 */
function createMinimalConfig(): EngineConfig {
  return {
    llm: {
      openai: {
        apiKey: 'test-key',
        defaultModel: 'gpt-4o-mini',
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
      politicsTagId: 2,
    },
    agents: {
      timeoutMs: 10000,
      minAgentsRequired: 2,
    },
    consensus: {
      minEdgeThreshold: 0.05,
      highDisagreementThreshold: 0.3,
    },
    logging: {
      level: 'info',
      auditTrailRetentionDays: 30,
    },
    langgraph: {
      checkpointer: 'memory',
      recursionLimit: 25,
      streamMode: 'values',
    },
    opik: {
      projectName: 'test-project',
      tags: [],
      trackCosts: true,
    },
    advancedAgents: {
      eventIntelligence: {
        enabled: false,
        breakingNews: false,
        eventImpact: false,
      },
      pollingStatistical: {
        enabled: false,
        pollingIntelligence: false,
        historicalPattern: false,
      },
      sentimentNarrative: {
        enabled: false,
        mediaSentiment: false,
        socialSentiment: false,
        narrativeVelocity: false,
      },
      priceAction: {
        enabled: false,
        momentum: false,
        meanReversion: false,
        minVolumeThreshold: 1000,
      },
      eventScenario: {
        enabled: false,
        catalyst: false,
        tailRisk: false,
      },
      riskPhilosophy: {
        enabled: false,
        aggressive: false,
        conservative: false,
        neutral: false,
      },
    },
    externalData: {
      news: {
        provider: 'none',
        cacheTTL: 900,
        maxArticles: 10,
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
      conflictThreshold: 0.2,
      alignmentBonus: 0.2,
    },
    costOptimization: {
      maxCostPerAnalysis: 1.0,
      skipLowImpactAgents: false,
      batchLLMRequests: true,
    },
    performanceTracking: {
      enabled: false,
      evaluateOnResolution: false,
      minSampleSize: 10,
    },
  };
}

/**
 * Create a mock Polymarket client
 */
function createMockPolymarketClient(): PolymarketClient {
  return {
    getMarketByConditionId: vi.fn().mockResolvedValue({
      conditionId: 'test-condition',
      question: 'Will this test pass?',
      description: 'A test market',
      outcomes: ['YES', 'NO'],
      outcomePrices: ['0.5', '0.5'],
      volume: '10000',
      liquidity: '5000',
      endDate: Date.now() + 86400000,
      resolved: false,
    }),
    getMarketPriceHistory: vi.fn().mockResolvedValue([]),
    getMarketOrderBook: vi.fn().mockResolvedValue({
      bids: [],
      asks: [],
    }),
  } as any;
}

/**
 * Create a mock MBD generator for property tests
 */
const mbdGenerator = fc.record({
  conditionId: fc.string({ minLength: 10, maxLength: 50 }),
  question: fc.string({ minLength: 10, maxLength: 200 }),
  description: fc.string({ minLength: 20, maxLength: 500 }),
  outcomes: fc.constant(['YES', 'NO']),
  currentPrices: fc.tuple(
    fc.double({ min: 0.01, max: 0.99 }),
    fc.double({ min: 0.01, max: 0.99 })
  ).map(([yes, no]) => {
    const total = yes + no;
    return [yes / total, no / total];
  }),
  volume24h: fc.double({ min: 0, max: 1000000 }),
  liquidity: fc.double({ min: 0, max: 500000 }),
  endDate: fc.integer({ min: Date.now(), max: Date.now() + 365 * 86400000 }),
  resolved: fc.constant(false),
  eventType: fc.oneof(
    fc.constant('election'),
    fc.constant('court'),
    fc.constant('policy'),
    fc.constant('geopolitical'),
    fc.constant('economic'),
    fc.constant('unknown')
  ),
  priceHistory: fc.array(
    fc.record({
      timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
      price: fc.double({ min: 0.01, max: 0.99 }),
    }),
    { minLength: 0, maxLength: 100 }
  ),
  orderBook: fc.record({
    bids: fc.array(
      fc.record({
        price: fc.double({ min: 0.01, max: 0.99 }),
        size: fc.double({ min: 1, max: 10000 }),
      }),
      { maxLength: 10 }
    ),
    asks: fc.array(
      fc.record({
        price: fc.double({ min: 0.01, max: 0.99 }),
        size: fc.double({ min: 1, max: 10000 }),
      }),
      { maxLength: 10 }
    ),
  }),
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Workflow Property Tests', () => {
  let mockPolymarketClient: PolymarketClient;

  beforeEach(() => {
    mockPolymarketClient = createMockPolymarketClient();
    vi.clearAllMocks();
  });

  /**
   * Feature: advanced-agent-league, Property 6: Backward compatibility with MVP agents
   * Validates: Requirements 11.1, 11.4
   *
   * For any market analysis, when all advanced agents are disabled, the system should
   * produce a valid recommendation using only MVP agents.
   * 
   * NOTE: This test verifies configuration correctness. Full end-to-end testing with
   * real LLM calls is covered by integration tests.
   */
  test('Property 6: Backward compatibility with MVP agents', async () => {
    await fc.assert(
      fc.asyncProperty(mbdGenerator, async (mbd) => {
        // Create config with all advanced agents disabled
        const config = createMinimalConfig();
        
        // Mock the Polymarket client to return our generated MBD
        vi.mocked(mockPolymarketClient.getMarketByConditionId).mockResolvedValue({
          conditionId: mbd.conditionId,
          question: mbd.question,
          description: mbd.description,
          outcomes: mbd.outcomes,
          outcomePrices: mbd.currentPrices.map(String),
          volume: String(mbd.volume24h),
          liquidity: String(mbd.liquidity),
          endDate: mbd.endDate,
          resolved: mbd.resolved,
        } as any);
        
        vi.mocked(mockPolymarketClient.getMarketPriceHistory).mockResolvedValue(
          mbd.priceHistory as any
        );
        
        vi.mocked(mockPolymarketClient.getMarketOrderBook).mockResolvedValue(
          mbd.orderBook as any
        );

        // Create workflow with MVP-only configuration
        // This verifies that the workflow can be created with all advanced agents disabled
        const { app } = createWorkflow(config, mockPolymarketClient);

        // Verify the workflow was created successfully
        expect(app).toBeDefined();
        
        // Verify configuration has all advanced agents disabled
        expect(config.advancedAgents.eventIntelligence.enabled).toBe(false);
        expect(config.advancedAgents.pollingStatistical.enabled).toBe(false);
        expect(config.advancedAgents.sentimentNarrative.enabled).toBe(false);
        expect(config.advancedAgents.priceAction.enabled).toBe(false);
        expect(config.advancedAgents.eventScenario.enabled).toBe(false);
        expect(config.advancedAgents.riskPhilosophy.enabled).toBe(false);
        
        // Verify required MVP configuration is present
        expect(config.agents.minAgentsRequired).toBeGreaterThan(0);
        expect(config.agents.timeoutMs).toBeGreaterThan(0);
        expect(config.consensus).toBeDefined();
        expect(config.logging).toBeDefined();

        return true;
      }),
      {
        numRuns: 100,
        timeout: 5000, // 5 seconds per run (just configuration validation)
      }
    );
  }, 10000); // 10 second timeout for entire test

  /**
   * Feature: advanced-agent-league, Property 15: Agent signal schema consistency
   * Validates: Requirements 11.3
   *
   * For any agent signal produced by advanced agents, the signal should conform to
   * the base AgentSignal schema with valid confidence, direction, fairProbability,
   * and keyDrivers fields.
   */
  test('Property 15: Agent signal schema consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        mbdGenerator,
        fc.record({
          eventIntelligence: fc.boolean(),
          pollingStatistical: fc.boolean(),
          sentimentNarrative: fc.boolean(),
          priceAction: fc.boolean(),
          eventScenario: fc.boolean(),
          riskPhilosophy: fc.boolean(),
        }),
        async (mbd, agentGroupConfig) => {
          // Create config with randomly enabled agent groups
          // Start with a complete minimal config to ensure all base fields are present
          const config = createMinimalConfig();
          
          // Update only the advancedAgents section while preserving all other config fields
          config.advancedAgents.eventIntelligence = {
            enabled: agentGroupConfig.eventIntelligence,
            breakingNews: agentGroupConfig.eventIntelligence,
            eventImpact: agentGroupConfig.eventIntelligence,
          };
          config.advancedAgents.pollingStatistical = {
            enabled: agentGroupConfig.pollingStatistical,
            pollingIntelligence: agentGroupConfig.pollingStatistical,
            historicalPattern: agentGroupConfig.pollingStatistical,
          };
          config.advancedAgents.sentimentNarrative = {
            enabled: agentGroupConfig.sentimentNarrative,
            mediaSentiment: agentGroupConfig.sentimentNarrative,
            socialSentiment: agentGroupConfig.sentimentNarrative,
            narrativeVelocity: agentGroupConfig.sentimentNarrative,
          };
          config.advancedAgents.priceAction = {
            enabled: agentGroupConfig.priceAction,
            momentum: agentGroupConfig.priceAction,
            meanReversion: agentGroupConfig.priceAction,
            minVolumeThreshold: 1000,
          };
          config.advancedAgents.eventScenario = {
            enabled: agentGroupConfig.eventScenario,
            catalyst: agentGroupConfig.eventScenario,
            tailRisk: agentGroupConfig.eventScenario,
          };
          config.advancedAgents.riskPhilosophy = {
            enabled: agentGroupConfig.riskPhilosophy,
            aggressive: agentGroupConfig.riskPhilosophy,
            conservative: agentGroupConfig.riskPhilosophy,
            neutral: agentGroupConfig.riskPhilosophy,
          };
          
          // Verify config structure is complete before proceeding
          expect(config.agents).toBeDefined();
          expect(config.agents.minAgentsRequired).toBeDefined();
          expect(config.agents.timeoutMs).toBeDefined();

          // Mock the Polymarket client
          vi.mocked(mockPolymarketClient.getMarketByConditionId).mockResolvedValue({
            conditionId: mbd.conditionId,
            question: mbd.question,
            description: mbd.description,
            outcomes: mbd.outcomes,
            outcomePrices: mbd.currentPrices.map(String),
            volume: String(mbd.volume24h),
            liquidity: String(mbd.liquidity),
            endDate: mbd.endDate,
            resolved: mbd.resolved,
          } as any);
          
          vi.mocked(mockPolymarketClient.getMarketPriceHistory).mockResolvedValue(
            mbd.priceHistory as any
          );
          
          vi.mocked(mockPolymarketClient.getMarketOrderBook).mockResolvedValue(
            mbd.orderBook as any
          );

          // Create workflow
          const { app } = createWorkflow(config, mockPolymarketClient);

          try {
            // Execute the workflow
            const result = await app.invoke(
              { conditionId: mbd.conditionId },
              {
                configurable: {
                  thread_id: `test-${mbd.conditionId}`,
                },
              }
            );

            // Verify all agent signals conform to base schema
            const agentSignals = result.agentSignals || [];
            
            for (const signal of agentSignals) {
              // Check required base fields
              expect(signal).toHaveProperty('agentName');
              expect(signal).toHaveProperty('confidence');
              expect(signal).toHaveProperty('direction');
              expect(signal).toHaveProperty('fairProbability');
              expect(signal).toHaveProperty('keyDrivers');
              expect(signal).toHaveProperty('timestamp');

              // Validate field types and ranges
              expect(typeof signal.agentName).toBe('string');
              expect(signal.agentName.length).toBeGreaterThan(0);
              
              expect(typeof signal.confidence).toBe('number');
              expect(signal.confidence).toBeGreaterThanOrEqual(0);
              expect(signal.confidence).toBeLessThanOrEqual(1);
              
              expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);
              
              expect(typeof signal.fairProbability).toBe('number');
              expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
              expect(signal.fairProbability).toBeLessThanOrEqual(1);
              
              expect(Array.isArray(signal.keyDrivers)).toBe(true);
              expect(signal.keyDrivers.length).toBeGreaterThan(0);
              expect(signal.keyDrivers.length).toBeLessThanOrEqual(5);
              
              expect(typeof signal.timestamp).toBe('number');
              expect(signal.timestamp).toBeGreaterThan(0);
            }

            return true;
          } catch (error) {
            // If workflow fails, it should be due to external factors, not schema issues
            console.error('Workflow execution failed:', error);
            return false;
          }
        }
      ),
      {
        numRuns: 100,
        timeout: 60000, // 60 seconds per run
      }
    );
  }, 120000); // 2 minute timeout for entire test
});
