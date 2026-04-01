/**
 * Comprehensive End-to-End Tests for NewsData.io Integration
 *
 * This test suite verifies the complete workflow from agent request to news response,
 * including all error handling and fallback scenarios, and system behavior under
 * various load conditions. It tests the entire NewsData.io integration stack.
 */

import { describe, test, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { analyzeMarket, createWorkflow } from './workflow.js';
import type { EngineConfig } from './config/index.js';
import type { PolymarketClient } from './utils/polymarket-client.js';
import type { MarketBriefingDocument } from './models/types.js';
import { createNewsDataClient } from './utils/newsdata-client.js';
import { createEnhancedAgentFactory } from './utils/enhanced-agent-factory.js';
import { createNewsDataIntegrationLayer } from './utils/newsdata-agent-integration.js';

describe('NewsData.io Comprehensive E2E Tests', () => {
  let mockConfig: EngineConfig;
  let mockPolymarketClient: PolymarketClient;
  let originalEnv: Record<string, string | undefined>;
  let testStartTime: number;

  beforeAll(() => {
    testStartTime = Date.now();
    console.log('[E2E] Starting comprehensive NewsData.io integration tests');
  });

  afterAll(() => {
    const duration = (Date.now() - testStartTime) / 1000;
    console.log(`[E2E] Comprehensive tests completed in ${duration.toFixed(2)} seconds`);
  });

  beforeEach(() => {
    // Store original environment variables
    originalEnv = {
      NEWSDATA_INTEGRATION_ENABLED: process.env.NEWSDATA_INTEGRATION_ENABLED,
      NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };

    // Set test environment for NewsData integration
    process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
    process.env.NEWSDATA_API_KEY = 'test-newsdata-api-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // Create comprehensive mock config
    mockConfig = {
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
        projectName: 'test-newsdata-e2e',
        tags: ['e2e-test', 'newsdata', 'comprehensive'],
        trackCosts: true,
      },
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: 'test-openai-key',
          defaultModel: 'gpt-4o-mini',
        },
      },
      agents: {
        timeoutMs: 30000, // Extended timeout for E2E tests
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
          enabled: false, // Disable to avoid LLM dependencies in tests
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
          enabled: false, // Disable to avoid Anthropic API dependency
          aggressive: true,
          conservative: true,
          neutral: true,
        },
      },
      externalData: {
        news: {
          provider: 'newsdata', // Use NewsData.io
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
      newsData: {
        enabled: true,
        apiKey: 'test-newsdata-api-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
        agentTools: {
          enabled: true,
          defaultParams: {},
          maxRequestsPerHour: 10,
        },
      },
      signalFusion: {
        baseWeights: {
          'market_microstructure': 1.0,
          'probability_baseline': 1.0,
          'risk_assessment': 1.0,
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
        enabled: true,
        evaluateOnResolution: true,
        minSampleSize: 10,
      },
    };

    // Create mock Polymarket client with various market scenarios
    mockPolymarketClient = {
      fetchMarketData: vi.fn(),
    } as any;
  });

  afterEach(() => {
    // Restore original environment variables
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    vi.clearAllMocks();
  });

  describe('Complete Workflow Integration Tests', () => {
    test('should execute complete workflow with NewsData integration for election market', async () => {
      // Create election market scenario
      const electionMBD: MarketBriefingDocument = {
        marketId: 'election-market-001',
        conditionId: 'election-condition-001',
        eventType: 'election',
        question: 'Will Donald Trump win the 2024 US Presidential Election?',
        resolutionCriteria: 'This market will resolve to "Yes" if Donald Trump is declared the winner of the 2024 US Presidential Election by major news outlets.',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
        currentProbability: 0.52,
        liquidityScore: 8.5,
        bidAskSpread: 0.02,
        volatilityRegime: 'medium',
        volume24h: 2500000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [
            { event: 'Election Day', timestamp: Date.now() + 7 * 24 * 60 * 60 * 1000 },
            { event: 'Final Debate', timestamp: Date.now() + 3 * 24 * 60 * 60 * 1000 },
          ],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(electionMBD);

      // Execute the complete workflow
      const result = await analyzeMarket('election-condition-001', mockConfig, mockPolymarketClient);

      // Verify workflow execution
      expect(result).toBeDefined();
      expect(result?.marketId).toBe('election-market-001');
      expect(result?.action).toBeDefined();
      expect(result?.explanation).toBeDefined();

      // Verify Polymarket client was called
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('election-condition-001');
    }, 60000);

    test('should execute complete workflow with NewsData integration for crypto market', async () => {
      // Create crypto market scenario
      const cryptoMBD: MarketBriefingDocument = {
        marketId: 'crypto-market-002',
        conditionId: 'crypto-condition-002',
        eventType: 'economic',
        question: 'Will Bitcoin reach $100,000 by end of 2024?',
        resolutionCriteria: 'This market will resolve to "Yes" if Bitcoin (BTC) reaches or exceeds $100,000 USD on any major exchange by December 31, 2024.',
        expiryTimestamp: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days from now
        currentProbability: 0.35,
        liquidityScore: 9.2,
        bidAskSpread: 0.015,
        volatilityRegime: 'high',
        volume24h: 1800000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [
            { event: 'Bitcoin ETF Decision', timestamp: Date.now() + 14 * 24 * 60 * 60 * 1000 },
            { event: 'Fed Rate Decision', timestamp: Date.now() + 21 * 24 * 60 * 60 * 1000 },
          ],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(cryptoMBD);

      // Execute the workflow
      const result = await analyzeMarket('crypto-condition-002', mockConfig, mockPolymarketClient);

      // Verify workflow execution
      expect(result).toBeDefined();
      expect(result?.marketId).toBe('crypto-market-002');
      expect(result?.action).toBeDefined();
      expect(result?.explanation).toBeDefined();

      // Verify Polymarket client was called
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('crypto-condition-002');
    }, 60000);

    test('should execute complete workflow with NewsData integration for business market', async () => {
      // Create business market scenario
      const businessMBD: MarketBriefingDocument = {
        marketId: 'business-market-003',
        conditionId: 'business-condition-003',
        eventType: 'economic',
        question: 'Will Tesla stock (TSLA) close above $300 by end of Q1 2024?',
        resolutionCriteria: 'This market will resolve to "Yes" if Tesla Inc. (TSLA) stock closes above $300 on the last trading day of Q1 2024.',
        expiryTimestamp: Date.now() + 45 * 24 * 60 * 60 * 1000, // 45 days from now
        currentProbability: 0.68,
        liquidityScore: 7.8,
        bidAskSpread: 0.025,
        volatilityRegime: 'medium',
        volume24h: 950000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [
            { event: 'Tesla Earnings Report', timestamp: Date.now() + 10 * 24 * 60 * 60 * 1000 },
            { event: 'Model Y Production Update', timestamp: Date.now() + 20 * 24 * 60 * 60 * 1000 },
          ],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(businessMBD);

      // Execute the workflow
      const result = await analyzeMarket('business-condition-003', mockConfig, mockPolymarketClient);

      // Verify workflow execution
      expect(result).toBeDefined();
      expect(result?.marketId).toBe('business-market-003');
      expect(result?.action).toBeDefined();
      expect(result?.explanation).toBeDefined();

      // Verify Polymarket client was called
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('business-condition-003');
    }, 60000);
  });

  describe('Error Handling and Fallback Scenarios', () => {
    test('should handle NewsData API failures gracefully', async () => {
      // Create market with NewsData API failure scenario
      const mockMBD: MarketBriefingDocument = {
        marketId: 'error-market-001',
        conditionId: 'error-condition-001',
        eventType: 'election',
        question: 'Will candidate X win the election?',
        resolutionCriteria: 'Candidate X must be declared winner by official sources',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.55,
        liquidityScore: 8.0,
        bidAskSpread: 0.02,
        volatilityRegime: 'medium',
        volume24h: 500000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Simulate NewsData API failure by setting invalid API key
      process.env.NEWSDATA_API_KEY = 'invalid-api-key';

      // Execute workflow - should handle API failure gracefully
      await analyzeMarket('error-condition-001', mockConfig, mockPolymarketClient);

      // Workflow should still complete (may return null or degraded result)
      // The key is that it doesn't crash
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('error-condition-001');
    }, 60000);

    test('should handle NewsData integration disabled gracefully', async () => {
      // Disable NewsData integration
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'false';

      const mockMBD: MarketBriefingDocument = {
        marketId: 'disabled-market-001',
        conditionId: 'disabled-condition-001',
        eventType: 'election',
        question: 'Will candidate Y win the election?',
        resolutionCriteria: 'Candidate Y must be declared winner by official sources',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.45,
        liquidityScore: 7.5,
        bidAskSpread: 0.025,
        volatilityRegime: 'medium',
        volume24h: 400000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Execute workflow with NewsData disabled
      const result = await analyzeMarket('disabled-condition-001', mockConfig, mockPolymarketClient);

      // Workflow should still complete using standard agents
      expect(result).toBeDefined();
      expect(result?.marketId).toBe('disabled-market-001');
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('disabled-condition-001');
    }, 60000);

    test('should handle missing NewsData API key gracefully', async () => {
      // Remove API key
      delete process.env.NEWSDATA_API_KEY;

      const mockMBD: MarketBriefingDocument = {
        marketId: 'no-key-market-001',
        conditionId: 'no-key-condition-001',
        eventType: 'economic',
        question: 'Will company Z announce merger?',
        resolutionCriteria: 'Company Z must officially announce merger',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.30,
        liquidityScore: 6.5,
        bidAskSpread: 0.03,
        volatilityRegime: 'low',
        volume24h: 200000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Execute workflow without API key
      await analyzeMarket('no-key-condition-001', mockConfig, mockPolymarketClient);

      // Workflow should handle missing API key gracefully
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('no-key-condition-001');
    }, 60000);

    test('should handle Polymarket API failures', async () => {
      // Mock Polymarket failure
      mockPolymarketClient.fetchMarketData = vi.fn().mockRejectedValue(new Error('Polymarket API unavailable'));

      // Execute workflow - should handle the error gracefully
      const result = await analyzeMarket('polymarket-error-condition', mockConfig, mockPolymarketClient);

      // Workflow should return null on critical failures
      expect(result).toBeNull();
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('polymarket-error-condition');
    }, 60000);

    test('should handle invalid condition ID', async () => {
      // Mock invalid condition response
      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(null);

      // Execute workflow
      const result = await analyzeMarket('invalid-condition-id', mockConfig, mockPolymarketClient);

      // Should handle gracefully
      expect(result).toBeNull();
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('invalid-condition-id');
    }, 60000);

    test('should handle circuit breaker activation', async () => {
      // Create config with very low circuit breaker threshold
      const circuitBreakerConfig = {
        ...mockConfig,
        newsData: {
          ...mockConfig.newsData,
          enabled: true,
          rateLimiting: {
            requestsPerWindow: 100,
            windowSizeMs: 15 * 60 * 1000,
            dailyQuota: 1000,
          },
          cache: {
            enabled: true,
            ttl: {
              latest: 300,
              crypto: 300,
              market: 300,
              archive: 1800,
            },
            maxSize: 1000,
          },
          circuitBreaker: {
            enabled: true,
            failureThreshold: 1, // Very low threshold
            resetTimeoutMs: 5000,
          },
        },
      };

      const mockMBD: MarketBriefingDocument = {
        marketId: 'circuit-breaker-market',
        conditionId: 'circuit-breaker-condition',
        eventType: 'election',
        question: 'Will circuit breaker test pass?',
        resolutionCriteria: 'Test must complete successfully',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.50,
        liquidityScore: 7.0,
        bidAskSpread: 0.02,
        volatilityRegime: 'medium',
        volume24h: 300000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Execute workflow with circuit breaker config
      await analyzeMarket('circuit-breaker-condition', circuitBreakerConfig, mockPolymarketClient);

      // Should handle circuit breaker gracefully
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('circuit-breaker-condition');
    }, 60000);
  });

  describe('System Behavior Under Load', () => {
    test('should handle concurrent workflow executions', async () => {
      // Create multiple market scenarios
      const markets = [
        {
          id: 'concurrent-1',
          mbd: {
            marketId: 'concurrent-market-1',
            conditionId: 'concurrent-condition-1',
            eventType: 'election' as const,
            question: 'Will candidate A win election 1?',
            resolutionCriteria: 'Candidate A must be declared winner',
            expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
            currentProbability: 0.55,
            liquidityScore: 8.0,
            bidAskSpread: 0.02,
            volatilityRegime: 'medium' as const,
            volume24h: 500000,
            metadata: { ambiguityFlags: [], keyCatalysts: [] },
          },
        },
        {
          id: 'concurrent-2',
          mbd: {
            marketId: 'concurrent-market-2',
            conditionId: 'concurrent-condition-2',
            eventType: 'economic' as const,
            question: 'Will stock B reach target price?',
            resolutionCriteria: 'Stock B must reach $500',
            expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
            currentProbability: 0.40,
            liquidityScore: 7.5,
            bidAskSpread: 0.025,
            volatilityRegime: 'high' as const,
            volume24h: 750000,
            metadata: { ambiguityFlags: [], keyCatalysts: [] },
          },
        },
        {
          id: 'concurrent-3',
          mbd: {
            marketId: 'concurrent-market-3',
            conditionId: 'concurrent-condition-3',
            eventType: 'economic' as const,
            question: 'Will crypto C reach new ATH?',
            resolutionCriteria: 'Crypto C must exceed previous all-time high',
            expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
            currentProbability: 0.25,
            liquidityScore: 6.8,
            bidAskSpread: 0.03,
            volatilityRegime: 'high' as const,
            volume24h: 1200000,
            metadata: { ambiguityFlags: [], keyCatalysts: [] },
          },
        },
      ];

      // Mock Polymarket client to return appropriate market data
      mockPolymarketClient.fetchMarketData = vi.fn().mockImplementation((conditionId: string) => {
        const market = markets.find(m => m.id === conditionId.split('-')[1]);
        return Promise.resolve(market?.mbd || null);
      });

      // Execute 3 concurrent workflows
      const promises = markets.map(market =>
        analyzeMarket(market.id, mockConfig, mockPolymarketClient)
      );

      const results = await Promise.all(promises);

      // Verify all workflows completed
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result?.marketId).toBe(markets[index].mbd.marketId);
      });

      // Verify Polymarket was called for each workflow
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledTimes(3);
    }, 90000); // Extended timeout for concurrent execution

    test('should handle rapid sequential requests', async () => {
      const mockMBD: MarketBriefingDocument = {
        marketId: 'rapid-market',
        conditionId: 'rapid-condition',
        eventType: 'election',
        question: 'Will rapid test succeed?',
        resolutionCriteria: 'Test must complete all requests successfully',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.60,
        liquidityScore: 8.2,
        bidAskSpread: 0.018,
        volatilityRegime: 'medium',
        volume24h: 600000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Execute 5 rapid sequential requests
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await analyzeMarket(`rapid-condition-${i}`, mockConfig, mockPolymarketClient);
        results.push(result);
      }

      // Verify all requests completed
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result?.marketId).toBe('rapid-market');
      });

      // Verify Polymarket was called for each request
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledTimes(5);
    }, 120000); // Extended timeout for sequential execution

    test('should maintain performance with large market datasets', async () => {
      // Create market with extensive metadata
      const largeMBD: MarketBriefingDocument = {
        marketId: 'large-dataset-market',
        conditionId: 'large-dataset-condition',
        eventType: 'election',
        question: 'Will large dataset processing complete efficiently? This is a very long question with lots of details about the market conditions, various factors that might influence the outcome, and comprehensive information about the resolution criteria and timing.',
        resolutionCriteria: 'This market has extensive resolution criteria that includes multiple conditions, various edge cases, detailed timing requirements, specific data sources that must be consulted, and comprehensive validation procedures that must be followed to ensure accurate resolution.',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.48,
        liquidityScore: 9.1,
        bidAskSpread: 0.012,
        volatilityRegime: 'medium',
        volume24h: 3500000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: Array.from({ length: 20 }, (_, i) => ({
            event: `Catalyst Event ${i + 1}: Detailed description of a significant event that could impact market resolution`,
            timestamp: Date.now() + (i + 1) * 24 * 60 * 60 * 1000,
          })),
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(largeMBD);

      const startTime = Date.now();
      
      // Execute workflow with large dataset
      const result = await analyzeMarket('large-dataset-condition', mockConfig, mockPolymarketClient);
      
      const processingTime = Date.now() - startTime;

      // Verify workflow completed successfully
      expect(result).toBeDefined();
      expect(result?.marketId).toBe('large-dataset-market');
      
      // Verify reasonable performance (should complete within 60 seconds)
      expect(processingTime).toBeLessThan(60000);
      
      console.log(`[E2E] Large dataset processing completed in ${processingTime}ms`);
    }, 90000);

    test('should handle memory-intensive operations', async () => {
      // Create config that might use more memory
      const memoryIntensiveConfig = {
        ...mockConfig,
        newsData: {
          ...mockConfig.newsData,
          enabled: true,
          rateLimiting: {
            requestsPerWindow: 100,
            windowSizeMs: 15 * 60 * 1000,
            dailyQuota: 1000,
          },
          circuitBreaker: {
            enabled: true,
            failureThreshold: 5,
            resetTimeoutMs: 60000,
          },
          cache: {
            enabled: true,
            ttl: {
              latest: 300,
              crypto: 300,
              market: 300,
              archive: 1800,
            },
            maxSize: 10000, // Large cache size
          },
        },
      };

      const mockMBD: MarketBriefingDocument = {
        marketId: 'memory-intensive-market',
        conditionId: 'memory-intensive-condition',
        eventType: 'economic',
        question: 'Will memory-intensive processing complete successfully?',
        resolutionCriteria: 'Processing must complete without memory issues',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.72,
        liquidityScore: 8.8,
        bidAskSpread: 0.015,
        volatilityRegime: 'low',
        volume24h: 800000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Monitor memory usage (basic check)
      const initialMemory = process.memoryUsage();
      
      // Execute workflow
      const result = await analyzeMarket('memory-intensive-condition', memoryIntensiveConfig, mockPolymarketClient);
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Verify workflow completed
      expect(result).toBeDefined();
      expect(result?.marketId).toBe('memory-intensive-market');
      
      // Verify reasonable memory usage (increase should be less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      
      console.log(`[E2E] Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    }, 60000);
  });

  describe('Integration Component Tests', () => {
    test('should verify NewsData client integration', async () => {
      // Test NewsData client creation and basic functionality
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-api-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      });

      expect(newsDataClient).toBeDefined();
      expect(typeof newsDataClient.fetchLatestNews).toBe('function');
      expect(typeof newsDataClient.fetchArchiveNews).toBe('function');
      expect(typeof newsDataClient.fetchCryptoNews).toBe('function');
      expect(typeof newsDataClient.fetchMarketNews).toBe('function');
    });

    test('should verify enhanced agent factory integration', async () => {
      // Test enhanced agent factory creation
      const factory = createEnhancedAgentFactory(mockConfig);
      
      expect(factory).toBeDefined();
      expect(typeof factory.createEnhancedAgentNode).toBe('function');
      expect(typeof factory.enhanceExistingAgent).toBe('function');
    });

    test('should verify NewsData integration layer', async () => {
      // Create NewsData client
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-api-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      });

      // Create integration layer
      const integrationLayer = createNewsDataIntegrationLayer(newsDataClient);
      
      expect(integrationLayer).toBeDefined();
      expect(typeof integrationLayer.fetchLatestNews).toBe('function');
      expect(typeof integrationLayer.fetchArchiveNews).toBe('function');
      expect(typeof integrationLayer.fetchCryptoNews).toBe('function');
      expect(typeof integrationLayer.fetchMarketNews).toBe('function');
      expect(typeof integrationLayer.getAvailableTools).toBe('function');
    });

    test('should verify workflow creation with NewsData integration', async () => {
      const mockMBD: MarketBriefingDocument = {
        marketId: 'workflow-test-market',
        conditionId: 'workflow-test-condition',
        eventType: 'election',
        question: 'Will workflow creation test pass?',
        resolutionCriteria: 'Test must complete successfully',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.85,
        liquidityScore: 9.0,
        bidAskSpread: 0.01,
        volatilityRegime: 'low',
        volume24h: 1000000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Create workflow
      const { app, opikHandler } = await createWorkflow(mockConfig, mockPolymarketClient);
      
      expect(app).toBeDefined();
      expect(opikHandler).toBeDefined();
      
      // Test workflow execution
      const result = await app.invoke(
        { conditionId: 'workflow-test-condition' },
        {
          configurable: {
            thread_id: 'workflow-test-condition',
          },
        }
      );

      expect(result).toBeDefined();
      expect(result.conditionId).toBe('workflow-test-condition');
      expect(result.mbd).toBeDefined();
    }, 60000);
  });

  describe('Performance and Reliability Tests', () => {
    test('should complete workflow within reasonable time limits', async () => {
      const mockMBD: MarketBriefingDocument = {
        marketId: 'performance-test-market',
        conditionId: 'performance-test-condition',
        eventType: 'economic',
        question: 'Will performance test complete within time limit?',
        resolutionCriteria: 'Test must complete within 45 seconds',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.78,
        liquidityScore: 8.6,
        bidAskSpread: 0.016,
        volatilityRegime: 'medium',
        volume24h: 650000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      const startTime = Date.now();
      
      // Execute workflow
      const result = await analyzeMarket('performance-test-condition', mockConfig, mockPolymarketClient);
      
      const executionTime = Date.now() - startTime;

      // Verify workflow completed
      expect(result).toBeDefined();
      expect(result?.marketId).toBe('performance-test-market');
      
      // Verify reasonable performance (should complete within 45 seconds)
      expect(executionTime).toBeLessThan(45000);
      
      console.log(`[E2E] Performance test completed in ${executionTime}ms`);
    }, 60000);

    test('should handle system stress with multiple rapid requests', async () => {
      const mockMBD: MarketBriefingDocument = {
        marketId: 'stress-test-market',
        conditionId: 'stress-test-condition',
        eventType: 'election',
        question: 'Will stress test handle multiple rapid requests?',
        resolutionCriteria: 'All requests must complete successfully',
        expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        currentProbability: 0.42,
        liquidityScore: 7.3,
        bidAskSpread: 0.028,
        volatilityRegime: 'high',
        volume24h: 1500000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(mockMBD);

      // Execute 10 rapid requests with minimal delay
      const promises = Array.from({ length: 10 }, (_, i) =>
        analyzeMarket(`stress-test-condition-${i}`, mockConfig, mockPolymarketClient)
      );

      const results = await Promise.all(promises);

      // Verify all requests completed successfully
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result?.marketId).toBe('stress-test-market');
      });

      // Verify all Polymarket calls were made
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledTimes(10);
    }, 120000); // Extended timeout for stress test
  });
});