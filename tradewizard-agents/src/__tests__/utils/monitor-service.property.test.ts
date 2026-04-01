/**
 * Property-Based Tests for Monitor Service - Quota Reset Timing
 * 
 * Feature: automated-market-monitor, Property 8: Quota reset timing
 * Validates: Requirements 4.5
 * 
 * Property: For any 24-hour period, the API quota counters should reset
 * exactly once at the configured reset time (midnight UTC).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { AutomatedMarketMonitor } from './monitor-service.js';
import type { EngineConfig } from '../config/index.js';
import type { SupabaseClientManager } from '../database/supabase-client.js';
import type { DatabasePersistence } from '../database/persistence.js';
import type { APIQuotaManager } from './api-quota-manager.js';
import type { MarketDiscoveryEngine } from './market-discovery.js';
import type { PolymarketClient } from './polymarket-client.js';

// Mock the workflow module
vi.mock('../workflow.js', () => ({
  analyzeMarket: vi.fn(),
}));

describe('Monitor Service Property Tests - Quota Reset', () => {
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
      discoverMarkets: vi.fn().mockResolvedValue([]),
      fetchPoliticalMarkets: vi.fn().mockResolvedValue([]),
      rankMarkets: vi.fn().mockReturnValue([]),
    } as any;

    // Create mock Polymarket client
    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      healthCheck: vi.fn().mockResolvedValue(true),
    } as any;
  });

  /**
   * Generator for random times within a day (0-23 hours, 0-59 minutes, 0-59 seconds)
   */
  const timeOfDayGen = fc.record({
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
  });

  /**
   * Property 8: Quota reset timing
   * 
   * For any starting time within a 24-hour period, the quota should reset
   * exactly once when advancing to the next midnight UTC.
   */
  it('should reset quota exactly once per 24-hour period at midnight UTC', async () => {
    await fc.assert(
      fc.asyncProperty(
        timeOfDayGen,
        async (timeOfDay) => {
          vi.useFakeTimers();

          // Create a start time on a specific day
          const startDate = new Date('2024-01-15T00:00:00.000Z');
          startDate.setUTCHours(timeOfDay.hour, timeOfDay.minute, timeOfDay.second, 0);

          vi.setSystemTime(startDate);

          // Create monitor instance
          const monitor = new AutomatedMarketMonitor(
            mockConfig,
            mockSupabaseManager,
            mockDatabase,
            mockQuotaManager,
            mockDiscovery,
            mockPolymarketClient
          );

          await monitor.initialize();
          await monitor.start();

          // Calculate time until next midnight
          const nextMidnight = new Date(startDate);
          nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
          nextMidnight.setUTCHours(0, 0, 0, 0);
          const msUntilMidnight = nextMidnight.getTime() - startDate.getTime();

          // Reset call count before advancing time
          vi.mocked(mockQuotaManager.resetUsage).mockClear();

          // Advance to just before midnight
          await vi.advanceTimersByTimeAsync(msUntilMidnight - 1000);

          // Should not have reset yet
          const resetCountBeforeMidnight = vi.mocked(mockQuotaManager.resetUsage).mock.calls.length;
          expect(resetCountBeforeMidnight).toBe(0);

          // Advance past midnight
          await vi.advanceTimersByTimeAsync(1000);

          // Should have reset exactly once
          const resetCountAfterMidnight = vi.mocked(mockQuotaManager.resetUsage).mock.calls.length;
          expect(resetCountAfterMidnight).toBe(1);

          await monitor.stop();
          vi.useRealTimers();
        }
      ),
      { numRuns: 20, timeout: 10000 } // Reduced runs for faster execution
    );
  }, 300000); // 5 minute timeout for property test

  /**
   * Property: Daily reset consistency
   * 
   * For any number of days, the quota should reset exactly N times
   * for N complete 24-hour periods.
   */
  it('should reset quota consistently across multiple days', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }), // Test 1-3 days
        async (numDays) => {
          vi.useFakeTimers();

          const startDate = new Date('2024-01-15T12:00:00.000Z');
          vi.setSystemTime(startDate);

          const monitor = new AutomatedMarketMonitor(
            mockConfig,
            mockSupabaseManager,
            mockDatabase,
            mockQuotaManager,
            mockDiscovery,
            mockPolymarketClient
          );

          await monitor.initialize();
          await monitor.start();

          // Clear initial calls
          vi.mocked(mockQuotaManager.resetUsage).mockClear();

          // Advance through N complete days
          for (let day = 0; day < numDays; day++) {
            // Advance to next midnight
            const currentTime = new Date(vi.getMockedSystemTime() || Date.now());
            const nextMidnight = new Date(currentTime);
            nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
            nextMidnight.setUTCHours(0, 0, 0, 0);
            const msUntilMidnight = nextMidnight.getTime() - currentTime.getTime();

            await vi.advanceTimersByTimeAsync(msUntilMidnight);
          }

          // Should have reset exactly numDays times
          const resetCount = vi.mocked(mockQuotaManager.resetUsage).mock.calls.length;
          expect(resetCount).toBe(numDays);

          await monitor.stop();
          vi.useRealTimers();
        }
      ),
      { numRuns: 10, timeout: 10000 }
    );
  }, 300000);

  /**
   * Property: Reset timing precision
   * 
   * For any starting time, the reset should occur at exactly midnight UTC,
   * not before or significantly after.
   */
  it('should reset at exactly midnight UTC with minimal delay', async () => {
    await fc.assert(
      fc.asyncProperty(
        timeOfDayGen,
        async (timeOfDay) => {
          vi.useFakeTimers();

          const startDate = new Date('2024-01-15T00:00:00.000Z');
          startDate.setUTCHours(timeOfDay.hour, timeOfDay.minute, timeOfDay.second, 0);

          vi.setSystemTime(startDate);

          const monitor = new AutomatedMarketMonitor(
            mockConfig,
            mockSupabaseManager,
            mockDatabase,
            mockQuotaManager,
            mockDiscovery,
            mockPolymarketClient
          );

          await monitor.initialize();
          await monitor.start();

          // Calculate time until next midnight
          const nextMidnight = new Date(startDate);
          nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
          nextMidnight.setUTCHours(0, 0, 0, 0);
          const msUntilMidnight = nextMidnight.getTime() - startDate.getTime();

          vi.mocked(mockQuotaManager.resetUsage).mockClear();

          // Advance to exactly midnight
          await vi.advanceTimersByTimeAsync(msUntilMidnight);

          // Should have reset by now (allowing for minimal setTimeout delay)
          const resetCount = vi.mocked(mockQuotaManager.resetUsage).mock.calls.length;
          expect(resetCount).toBeGreaterThanOrEqual(1);
          expect(resetCount).toBeLessThanOrEqual(1); // Should be exactly 1

          await monitor.stop();
          vi.useRealTimers();
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  }, 300000);
});
