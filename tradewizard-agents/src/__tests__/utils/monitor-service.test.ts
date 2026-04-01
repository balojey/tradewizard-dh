/**
 * Unit tests for Monitor Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutomatedMarketMonitor, type MonitorService } from './monitor-service.js';
import type { EngineConfig } from '../config/index.js';
import type { SupabaseClientManager } from '../database/supabase-client.js';
import type { DatabasePersistence, MarketData } from '../database/persistence.js';
import type { APIQuotaManager } from './api-quota-manager.js';
import type { MarketDiscoveryEngine, RankedMarket } from './market-discovery.js';
import type { PolymarketClient } from './polymarket-client.js';
import type { TradeRecommendation, MarketBriefingDocument } from '../models/types.js';

// Mock the workflow module
vi.mock('../workflow.js', () => ({
  analyzeMarket: vi.fn(),
}));

describe('MonitorService', () => {
  let monitor: MonitorService;
  let mockConfig: EngineConfig;
  let mockSupabaseManager: SupabaseClientManager;
  let mockDatabase: DatabasePersistence;
  let mockQuotaManager: APIQuotaManager;
  let mockDiscovery: MarketDiscoveryEngine;
  let mockPolymarketClient: PolymarketClient;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock config
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
        eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
        pollingStatistical: { enabled: false, pollingIntelligence: true, historicalPattern: true },
        sentimentNarrative: { enabled: false, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
        priceAction: { enabled: false, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
        eventScenario: { enabled: false, catalyst: true, tailRisk: true },
        riskPhilosophy: { enabled: false, aggressive: true, conservative: true, neutral: true },
      },
      externalData: {
        news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
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
    } as EngineConfig;

    // Create mock Supabase manager
    mockSupabaseManager = {
      getClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any;

    // Create mock database
    mockDatabase = {
      upsertMarket: vi.fn().mockResolvedValue('market-id-123'),
      storeRecommendation: vi.fn().mockResolvedValue('rec-id-123'),
      storeAgentSignals: vi.fn().mockResolvedValue(undefined),
      recordAnalysis: vi.fn().mockResolvedValue(undefined),
      getMarketsForUpdate: vi.fn().mockResolvedValue([]),
      markMarketResolved: vi.fn().mockResolvedValue(undefined),
      getLatestRecommendation: vi.fn().mockResolvedValue(null),
    } as any;

    // Create mock quota manager
    mockQuotaManager = {
      canMakeRequest: vi.fn().mockReturnValue(true),
      recordUsage: vi.fn(),
      getUsage: vi.fn().mockReturnValue(0),
      resetUsage: vi.fn(),
      getRecommendedMarketCount: vi.fn().mockReturnValue(3),
      getQuotaLimit: vi.fn().mockReturnValue(100),
    } as any;

    // Create mock discovery engine
    mockDiscovery = {
      discoverMarkets: vi.fn().mockResolvedValue([
        {
          conditionId: 'test-condition-1',
          question: 'Test market 1',
          description: 'Test description',
          trendingScore: 10.5,
          volume24h: 10000,
          liquidity: 5000,
          marketSlug: 'test-market-1',
        },
      ] as RankedMarket[]),
      fetchPoliticalMarkets: vi.fn().mockResolvedValue([]),
      rankMarkets: vi.fn().mockReturnValue([]),
    } as any;

    // Create mock Polymarket client
    const mockMBD: MarketBriefingDocument = {
      marketId: 'test-market',
      conditionId: 'test-condition-1',
      eventType: 'election',
      question: 'Test market 1',
      resolutionCriteria: 'Test criteria',
      expiryTimestamp: Date.now() + 86400000,
      currentProbability: 0.5,
      liquidityScore: 7.5,
      bidAskSpread: 2.5,
      volatilityRegime: 'medium',
      volume24h: 10000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({ ok: true, data: mockMBD }),
      healthCheck: vi.fn().mockResolvedValue(true),
      checkMarketResolution: vi.fn().mockResolvedValue({ resolved: false }),
    } as any;

    // Create monitor instance
    monitor = new AutomatedMarketMonitor(
      mockConfig,
      mockSupabaseManager,
      mockDatabase,
      mockQuotaManager,
      mockDiscovery,
      mockPolymarketClient
    );
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(monitor.initialize()).resolves.not.toThrow();
    });

    it('should check database connection during initialization', async () => {
      await monitor.initialize();
      expect(mockSupabaseManager.getClient).toHaveBeenCalled();
    });
  });

  describe('start and stop', () => {
    it('should start the monitor', async () => {
      await monitor.initialize();
      await monitor.start();

      const health = monitor.getHealth();
      expect(health.scheduler.running).toBe(true);
    });

    it('should stop the monitor gracefully', async () => {
      await monitor.initialize();
      await monitor.start();
      await monitor.stop();

      const health = monitor.getHealth();
      expect(health.scheduler.running).toBe(false);
    });

    it('should not start if already running', async () => {
      await monitor.initialize();
      await monitor.start();
      await monitor.start(); // Second start should be ignored

      const health = monitor.getHealth();
      expect(health.scheduler.running).toBe(true);
    });
  });

  describe('analyzeMarket', () => {
    it('should analyze a market successfully', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      const mockRecommendation: TradeRecommendation = {
        marketId: 'test-market',
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.60, 0.65],
        expectedValue: 15.5,
        winProbability: 0.65,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test summary',
          coreThesis: 'Test thesis',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.65,
          marketProbability: 0.50,
          edge: 0.15,
          confidenceBand: [0.60, 0.70],
        },
      };

      vi.mocked(mockAnalyzeMarket).mockResolvedValue(mockRecommendation);

      await monitor.initialize();
      const result = await monitor.analyzeMarket('test-condition-1');

      expect(result).toEqual(mockRecommendation);
      expect(mockAnalyzeMarket).toHaveBeenCalledWith(
        'test-condition-1',
        mockConfig,
        mockPolymarketClient,
        mockSupabaseManager
      );
    });

    it('should store analysis results in database', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      const mockRecommendation: TradeRecommendation = {
        marketId: 'test-market',
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.60, 0.65],
        expectedValue: 15.5,
        winProbability: 0.65,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test summary',
          coreThesis: 'Test thesis',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.65,
          marketProbability: 0.50,
          edge: 0.15,
          confidenceBand: [0.60, 0.70],
        },
      };

      vi.mocked(mockAnalyzeMarket).mockResolvedValue(mockRecommendation);

      await monitor.initialize();
      await monitor.analyzeMarket('test-condition-1');

      expect(mockDatabase.upsertMarket).toHaveBeenCalled();
      expect(mockDatabase.storeRecommendation).toHaveBeenCalled();
      expect(mockDatabase.recordAnalysis).toHaveBeenCalled();
    });

    it('should handle analysis errors', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      vi.mocked(mockAnalyzeMarket).mockRejectedValue(new Error('Analysis failed'));

      await monitor.initialize();
      await expect(monitor.analyzeMarket('test-condition-1')).rejects.toThrow('Analysis failed');
    });
  });

  describe('discoverAndAnalyze', () => {
    it('should discover and analyze markets', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      const mockRecommendation: TradeRecommendation = {
        marketId: 'test-market',
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.60, 0.65],
        expectedValue: 15.5,
        winProbability: 0.65,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test summary',
          coreThesis: 'Test thesis',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.65,
          marketProbability: 0.50,
          edge: 0.15,
          confidenceBand: [0.60, 0.70],
        },
      };

      vi.mocked(mockAnalyzeMarket).mockResolvedValue(mockRecommendation);

      await monitor.initialize();
      await (monitor as any).discoverAndAnalyze();

      // Now uses full quota for discovery (updates disabled)
      expect(mockDiscovery.discoverMarkets).toHaveBeenCalledWith(5);
      expect(mockAnalyzeMarket).toHaveBeenCalled();
    });

    it('should continue on individual market failure (error isolation)', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      
      // Mock discovery to return 2 markets
      vi.mocked(mockDiscovery.discoverMarkets).mockResolvedValue([
        {
          conditionId: 'market-1',
          question: 'Market 1',
          description: 'Desc 1',
          trendingScore: 10,
          volume24h: 1000,
          liquidity: 500,
          marketSlug: 'market-1',
        },
        {
          conditionId: 'market-2',
          question: 'Market 2',
          description: 'Desc 2',
          trendingScore: 9,
          volume24h: 900,
          liquidity: 450,
          marketSlug: 'market-2',
        },
      ]);

      // First market fails, second succeeds
      vi.mocked(mockAnalyzeMarket)
        .mockRejectedValueOnce(new Error('Market 1 failed'))
        .mockResolvedValueOnce({
          marketId: 'market-2',
          action: 'LONG_YES',
          entryZone: [0.45, 0.50],
          targetZone: [0.60, 0.65],
          expectedValue: 15.5,
          winProbability: 0.65,
          liquidityRisk: 'low',
          explanation: {
            summary: 'Test summary',
            coreThesis: 'Test thesis',
            keyCatalysts: ['Catalyst 1'],
            failureScenarios: ['Risk 1'],
          },
          metadata: {
            consensusProbability: 0.65,
            marketProbability: 0.50,
            edge: 0.15,
            confidenceBand: [0.60, 0.70],
          },
        });

      await monitor.initialize();
      await (monitor as any).discoverAndAnalyze();

      // Both markets should have been attempted
      expect(mockAnalyzeMarket).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateExistingMarkets', () => {
    it('should update existing markets', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      const mockRecommendation: TradeRecommendation = {
        marketId: 'test-market',
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.60, 0.65],
        expectedValue: 15.5,
        winProbability: 0.65,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test summary',
          coreThesis: 'Test thesis',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.65,
          marketProbability: 0.50,
          edge: 0.15,
          confidenceBand: [0.60, 0.70],
        },
      };

      vi.mocked(mockAnalyzeMarket).mockResolvedValue(mockRecommendation);

      const marketsToUpdate: MarketData[] = [
        {
          conditionId: 'old-market-1',
          question: 'Old market',
          eventType: 'election',
        },
      ];

      vi.mocked(mockDatabase.getMarketsForUpdate).mockResolvedValue(marketsToUpdate);

      await monitor.initialize();
      await (monitor as any).updateExistingMarkets(3);

      expect(mockDatabase.getMarketsForUpdate).toHaveBeenCalled();
      expect(mockAnalyzeMarket).toHaveBeenCalledWith(
        'old-market-1',
        mockConfig,
        mockPolymarketClient,
        mockSupabaseManager
      );
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      await monitor.initialize();
      const health = monitor.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('database');
      expect(health).toHaveProperty('scheduler');
      expect(health).toHaveProperty('quota');
    });

    it('should report unhealthy when database is disconnected', async () => {
      // Mock database connection failure
      vi.mocked(mockSupabaseManager.getClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: new Error('Connection failed') }),
          }),
        }),
      } as any);

      await monitor.initialize();
      const health = monitor.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.database.connected).toBe(false);
    });

    it('should report degraded when scheduler is not running', async () => {
      await monitor.initialize();
      await monitor.start();
      await monitor.stop();

      const health = monitor.getHealth();
      expect(health.status).toBe('degraded');
    });
  });

  describe('graceful shutdown', () => {
    it('should complete current analysis before shutdown', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      
      let analysisStarted = false;
      let analysisCompleted = false;

      vi.mocked(mockAnalyzeMarket).mockImplementation(async () => {
        analysisStarted = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        analysisCompleted = true;
        return {
          marketId: 'test-market',
          action: 'LONG_YES',
          entryZone: [0.45, 0.50],
          targetZone: [0.60, 0.65],
          expectedValue: 15.5,
          winProbability: 0.65,
          liquidityRisk: 'low',
          explanation: {
            summary: 'Test summary',
            coreThesis: 'Test thesis',
            keyCatalysts: ['Catalyst 1'],
            failureScenarios: ['Risk 1'],
          },
          metadata: {
            consensusProbability: 0.65,
            marketProbability: 0.50,
            edge: 0.15,
            confidenceBand: [0.60, 0.70],
          },
        };
      });

      await monitor.initialize();
      await monitor.start();

      // Trigger analysis
      const analysisPromise = monitor.analyzeMarket('test-condition-1');

      // Wait for analysis to start
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(analysisStarted).toBe(true);

      // Stop monitor (should wait for analysis to complete)
      await monitor.stop();

      // Analysis should have completed
      expect(analysisCompleted).toBe(true);
      await analysisPromise;
    });
  });

  describe('quota reset', () => {
    it('should schedule quota reset at midnight UTC', async () => {
      vi.useFakeTimers();
      const now = new Date('2024-01-15T18:30:00.000Z');
      vi.setSystemTime(now);

      await monitor.initialize();
      await monitor.start();

      // Quota should not be reset immediately
      expect(mockQuotaManager.resetUsage).not.toHaveBeenCalled();

      // Fast forward to just before midnight
      const tomorrow = new Date('2024-01-16T00:00:00.000Z');
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      await vi.advanceTimersByTimeAsync(msUntilMidnight - 1000);

      // Still should not have reset
      expect(mockQuotaManager.resetUsage).not.toHaveBeenCalled();

      // Fast forward past midnight
      await vi.advanceTimersByTimeAsync(1000);

      // Should have reset once
      expect(mockQuotaManager.resetUsage).toHaveBeenCalledTimes(1);

      await monitor.stop();
      vi.useRealTimers();
    }, 60000);

    it('should reset quota daily after initial reset', async () => {
      vi.useFakeTimers();
      const now = new Date('2024-01-15T18:30:00.000Z');
      vi.setSystemTime(now);

      await monitor.initialize();
      await monitor.start();

      // Fast forward to first midnight
      const tomorrow = new Date('2024-01-16T00:00:00.000Z');
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      await vi.advanceTimersByTimeAsync(msUntilMidnight);

      expect(mockQuotaManager.resetUsage).toHaveBeenCalledTimes(1);

      // Fast forward 24 hours to next midnight
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

      expect(mockQuotaManager.resetUsage).toHaveBeenCalledTimes(2);

      // Fast forward another 24 hours
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

      expect(mockQuotaManager.resetUsage).toHaveBeenCalledTimes(3);

      await monitor.stop();
      vi.useRealTimers();
    }, 60000);

    it('should log quota reset events', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.useFakeTimers();
      const now = new Date('2024-01-15T18:30:00.000Z');
      vi.setSystemTime(now);

      await monitor.initialize();
      await monitor.start();

      // Fast forward to midnight
      const tomorrow = new Date('2024-01-16T00:00:00.000Z');
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      await vi.advanceTimersByTimeAsync(msUntilMidnight);

      // Should have logged the reset
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Daily quota reset executed')
      );

      await monitor.stop();
      vi.useRealTimers();
      consoleLogSpy.mockRestore();
    }, 60000);

    it('should calculate correct time until midnight UTC', async () => {
      vi.useFakeTimers();
      
      // Test at noon - should reset at next midnight
      const now = new Date('2024-01-15T12:00:00.000Z');
      const expectedMidnight = new Date('2024-01-16T00:00:00.000Z');
      vi.setSystemTime(now);

      const testMonitor = new AutomatedMarketMonitor(
        mockConfig,
        mockSupabaseManager,
        mockDatabase,
        mockQuotaManager,
        mockDiscovery,
        mockPolymarketClient
      );

      await testMonitor.initialize();
      await testMonitor.start();

      // Fast forward to expected midnight
      const msUntilMidnight = expectedMidnight.getTime() - now.getTime();
      await vi.advanceTimersByTimeAsync(msUntilMidnight);

      // Should have reset
      expect(mockQuotaManager.resetUsage).toHaveBeenCalled();

      await testMonitor.stop();
      vi.useRealTimers();
    }, 60000);
  });

  describe('market resolution detection', () => {
    it('should detect and mark resolved markets during update', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      
      // Mock markets for update
      const marketsForUpdate: MarketData[] = [
        {
          conditionId: 'resolved-market',
          question: 'Resolved market?',
          eventType: 'election',
          status: 'active',
        },
        {
          conditionId: 'active-market',
          question: 'Active market?',
          eventType: 'election',
          status: 'active',
        },
      ];

      vi.mocked(mockDatabase.getMarketsForUpdate).mockResolvedValue(marketsForUpdate);

      // Mock Polymarket client to return resolved for first market, active for second
      vi.mocked(mockPolymarketClient.checkMarketResolution as any)
        .mockResolvedValueOnce({ resolved: true, outcome: 'YES', resolvedAt: Date.now() })
        .mockResolvedValueOnce({ resolved: false });

      // Mock Supabase client to return market ID
      vi.mocked(mockSupabaseManager.getClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'market-uuid-123' },
                error: null,
              }),
            }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      // Mock analyzeMarket for the active market
      vi.mocked(mockAnalyzeMarket).mockResolvedValue({
        marketId: 'active-market',
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.60, 0.65],
        expectedValue: 15.5,
        winProbability: 0.65,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test summary',
          coreThesis: 'Test thesis',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.65,
          marketProbability: 0.50,
          edge: 0.15,
          confidenceBand: [0.60, 0.70],
        },
      });

      await monitor.initialize();
      await (monitor as any).updateExistingMarkets(3);

      // Should have checked resolution for both markets
      expect(mockPolymarketClient.checkMarketResolution).toHaveBeenCalledTimes(2);
      
      // Should have marked first market as resolved
      expect(mockDatabase.markMarketResolved).toHaveBeenCalledWith('market-uuid-123', 'YES');
      
      // Should have analyzed only the active market (not the resolved one)
      expect(mockAnalyzeMarket).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeMarket).toHaveBeenCalledWith(
        'active-market',
        mockConfig,
        mockPolymarketClient,
        mockSupabaseManager
      );
    });

    it('should log resolution events', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const marketsForUpdate: MarketData[] = [
        {
          conditionId: 'resolved-market',
          question: 'Resolved market?',
          eventType: 'election',
          status: 'active',
        },
      ];

      vi.mocked(mockDatabase.getMarketsForUpdate).mockResolvedValue(marketsForUpdate);
      vi.mocked(mockPolymarketClient.checkMarketResolution as any).mockResolvedValue({
        resolved: true,
        outcome: 'NO',
        resolvedAt: Date.now(),
      });

      vi.mocked(mockSupabaseManager.getClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'market-uuid-456' },
                error: null,
              }),
            }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      await monitor.initialize();
      await (monitor as any).updateExistingMarkets(3);

      // Should log resolution detection
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MonitorService] Market resolved-market is resolved with outcome: NO')
      );
      
      // Should log marking as resolved
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MonitorService] Market resolved-market marked as resolved')
      );

      consoleLogSpy.mockRestore();
    });

    it('should continue updating other markets if resolution check fails', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      
      const marketsForUpdate: MarketData[] = [
        {
          conditionId: 'error-market',
          question: 'Error market?',
          eventType: 'election',
          status: 'active',
        },
        {
          conditionId: 'good-market',
          question: 'Good market?',
          eventType: 'election',
          status: 'active',
        },
      ];

      vi.mocked(mockDatabase.getMarketsForUpdate).mockResolvedValue(marketsForUpdate);

      // First market resolution check fails, second succeeds
      vi.mocked(mockPolymarketClient.checkMarketResolution as any)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ resolved: false });

      vi.mocked(mockAnalyzeMarket).mockResolvedValue({
        marketId: 'good-market',
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.60, 0.65],
        expectedValue: 15.5,
        winProbability: 0.65,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test summary',
          coreThesis: 'Test thesis',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.65,
          marketProbability: 0.50,
          edge: 0.15,
          confidenceBand: [0.60, 0.70],
        },
      });

      await monitor.initialize();
      await (monitor as any).updateExistingMarkets(3);

      // Should have attempted both markets
      expect(mockPolymarketClient.checkMarketResolution).toHaveBeenCalledTimes(2);
      
      // Should have analyzed the second market despite first failing
      expect(mockAnalyzeMarket).toHaveBeenCalledTimes(1);
    });

    it('should skip analysis for resolved markets', async () => {
      const { analyzeMarket: mockAnalyzeMarket } = await import('../workflow.js');
      
      const marketsForUpdate: MarketData[] = [
        {
          conditionId: 'resolved-market-1',
          question: 'Resolved market 1?',
          eventType: 'election',
          status: 'active',
        },
        {
          conditionId: 'resolved-market-2',
          question: 'Resolved market 2?',
          eventType: 'election',
          status: 'active',
        },
      ];

      vi.mocked(mockDatabase.getMarketsForUpdate).mockResolvedValue(marketsForUpdate);

      // Both markets are resolved
      vi.mocked(mockPolymarketClient.checkMarketResolution as any)
        .mockResolvedValueOnce({ resolved: true, outcome: 'YES', resolvedAt: Date.now() })
        .mockResolvedValueOnce({ resolved: true, outcome: 'NO', resolvedAt: Date.now() });

      vi.mocked(mockSupabaseManager.getClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn()
                .mockResolvedValueOnce({ data: { id: 'market-uuid-1' }, error: null })
                .mockResolvedValueOnce({ data: { id: 'market-uuid-2' }, error: null }),
            }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      await monitor.initialize();
      await (monitor as any).updateExistingMarkets(3);

      // Should have marked both as resolved
      expect(mockDatabase.markMarketResolved).toHaveBeenCalledTimes(2);
      
      // Should NOT have analyzed any markets
      expect(mockAnalyzeMarket).not.toHaveBeenCalled();
    });

    it('should store resolution outcome correctly', async () => {
      const marketsForUpdate: MarketData[] = [
        {
          conditionId: 'test-market',
          question: 'Test market?',
          eventType: 'election',
          status: 'active',
        },
      ];

      vi.mocked(mockDatabase.getMarketsForUpdate).mockResolvedValue(marketsForUpdate);
      vi.mocked(mockPolymarketClient.checkMarketResolution as any).mockResolvedValue({
        resolved: true,
        outcome: 'YES',
        resolvedAt: 1234567890,
      });

      vi.mocked(mockSupabaseManager.getClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'market-uuid-789' },
                error: null,
              }),
            }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      await monitor.initialize();
      await (monitor as any).updateExistingMarkets(3);

      // Should store the exact outcome
      expect(mockDatabase.markMarketResolved).toHaveBeenCalledWith('market-uuid-789', 'YES');
    });
  });
});
