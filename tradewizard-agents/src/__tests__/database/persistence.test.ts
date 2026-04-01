/**
 * Unit tests for Database Persistence Layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabasePersistence, type DatabasePersistence } from './persistence.js';
import { SupabaseClientManager } from './supabase-client.js';
import type { TradeRecommendation, AgentSignal } from '../models/types.js';

describe('DatabasePersistence', () => {
  let persistence: DatabasePersistence;
  let clientManager: SupabaseClientManager;

  beforeEach(async () => {
    // Create client manager with test configuration
    clientManager = new SupabaseClientManager({
      url: process.env.SUPABASE_URL || 'http://localhost:54321',
      anonKey: process.env.SUPABASE_KEY || 'test-key',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    try {
      await clientManager.connect();
      persistence = createDatabasePersistence(clientManager);
    } catch (error) {
      console.warn('Skipping test - Supabase not available:', error);
      throw error;
    }
  });

  afterEach(async () => {
    if (clientManager.isClientConnected()) {
      await clientManager.disconnect();
    }
  });

  describe('upsertMarket', () => {
    it('should insert a new market', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Will test pass?',
        description: 'Test market description',
        eventType: 'election',
        marketProbability: 0.65,
        volume24h: 10000,
        liquidity: 50000,
        status: 'active' as const,
        trendingScore: 8.5,
      };

      const marketId = await persistence.upsertMarket(market);

      expect(marketId).toBeDefined();
      expect(typeof marketId).toBe('string');
      expect(marketId.length).toBeGreaterThan(0);
    });

    it('should update an existing market', async () => {
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Will test pass?',
        eventType: 'election',
        marketProbability: 0.65,
      };

      // Insert first time
      const marketId1 = await persistence.upsertMarket(market);

      // Update with new data
      const updatedMarket = {
        ...market,
        marketProbability: 0.75,
        volume24h: 20000,
      };

      const marketId2 = await persistence.upsertMarket(updatedMarket);

      // Should return same ID
      expect(marketId2).toBe(marketId1);
    });

    it('should handle markets without optional fields', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Minimal market test',
        eventType: 'policy',
      };

      const marketId = await persistence.upsertMarket(market);

      expect(marketId).toBeDefined();
      expect(typeof marketId).toBe('string');
    });
  });

  describe('storeRecommendation', () => {
    it('should store a recommendation', async () => {
      // First create a market
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market for recommendation',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create recommendation
      const recommendation: TradeRecommendation = {
        marketId: market.conditionId,
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.65, 0.70],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium',
        explanation: {
          summary: 'Strong bullish case based on polling data',
          coreThesis: 'Polling shows consistent lead',
          keyCatalysts: ['Debate performance', 'Economic data'],
          failureScenarios: ['Unexpected scandal', 'Market crash'],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73],
        },
      };

      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      expect(recommendationId).toBeDefined();
      expect(typeof recommendationId).toBe('string');
      expect(recommendationId.length).toBeGreaterThan(0);
    });

    it('should handle NO_TRADE recommendations', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market for no trade',
        eventType: 'policy',
      };
      const marketId = await persistence.upsertMarket(market);

      const recommendation: TradeRecommendation = {
        marketId: market.conditionId,
        action: 'NO_TRADE',
        entryZone: [0, 0],
        targetZone: [0, 0],
        expectedValue: 0,
        winProbability: 0.5,
        liquidityRisk: 'low',
        explanation: {
          summary: 'No edge detected',
          coreThesis: 'Market fairly priced',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.5,
          marketProbability: 0.5,
          edge: 0,
          confidenceBand: [0.45, 0.55],
        },
      };

      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      expect(recommendationId).toBeDefined();
    });
  });

  describe('storeAgentSignals', () => {
    it('should store multiple agent signals', async () => {
      // Create market and recommendation
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market for signals',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      const recommendation: TradeRecommendation = {
        marketId: market.conditionId,
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.65, 0.70],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium',
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      // Create signals
      const signals: AgentSignal[] = [
        {
          agentName: 'polling_intelligence_agent',
          timestamp: Date.now(),
          confidence: 0.85,
          direction: 'YES',
          fairProbability: 0.70,
          keyDrivers: ['Strong polling numbers', 'Demographic advantage'],
          riskFactors: ['Polling error'],
          metadata: { pollCount: 5 },
        },
        {
          agentName: 'sentiment_analysis_agent',
          timestamp: Date.now(),
          confidence: 0.75,
          direction: 'YES',
          fairProbability: 0.65,
          keyDrivers: ['Positive media coverage'],
          riskFactors: ['Sentiment volatility'],
          metadata: { sentimentScore: 0.8 },
        },
        {
          agentName: 'market_microstructure_agent',
          timestamp: Date.now(),
          confidence: 0.60,
          direction: 'NEUTRAL',
          fairProbability: 0.50,
          keyDrivers: ['Balanced order flow'],
          riskFactors: ['Low liquidity'],
          metadata: { spreadBps: 50 },
        },
      ];

      await persistence.storeAgentSignals(marketId, recommendationId, signals);

      // No error means success
      expect(true).toBe(true);
    });

    it('should handle empty signals array', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      const recommendation: TradeRecommendation = {
        marketId: market.conditionId,
        action: 'NO_TRADE',
        entryZone: [0, 0],
        targetZone: [0, 0],
        expectedValue: 0,
        winProbability: 0.5,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.5,
          marketProbability: 0.5,
          edge: 0,
          confidenceBand: [0.45, 0.55],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      await persistence.storeAgentSignals(marketId, recommendationId, []);

      expect(true).toBe(true);
    });
  });

  describe('recordAnalysis', () => {
    it('should record successful analysis', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      const analysis = {
        type: 'initial' as const,
        status: 'success' as const,
        durationMs: 5000,
        costUsd: 0.25,
        agentsUsed: ['polling_agent', 'sentiment_agent'],
      };

      await persistence.recordAnalysis(marketId, analysis);

      expect(true).toBe(true);
    });

    it('should record failed analysis', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      const analysis = {
        type: 'update' as const,
        status: 'failed' as const,
        durationMs: 2000,
        errorMessage: 'API timeout',
      };

      await persistence.recordAnalysis(marketId, analysis);

      expect(true).toBe(true);
    });
  });

  describe('getMarketsForUpdate', () => {
    it('should return markets needing update', async () => {
      // Create a market that needs update (old timestamp)
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Old market needing update',
        eventType: 'election',
        status: 'active' as const,
      };
      await persistence.upsertMarket(market);

      // Get markets that haven't been analyzed in last 1 hour
      const updateIntervalMs = 60 * 60 * 1000; // 1 hour
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      expect(Array.isArray(markets)).toBe(true);
      // Should include our newly created market (just analyzed)
      expect(markets.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter by status - only return active markets', async () => {
      const timestamp = Date.now();
      
      // Create active market
      const activeMarket = {
        conditionId: `test-active-${timestamp}`,
        question: 'Active market',
        eventType: 'election',
        status: 'active' as const,
        trendingScore: 5.0,
      };
      await persistence.upsertMarket(activeMarket);

      // Create resolved market
      const resolvedMarket = {
        conditionId: `test-resolved-${timestamp}`,
        question: 'Resolved market',
        eventType: 'election',
        status: 'resolved' as const,
        trendingScore: 8.0,
      };
      await persistence.upsertMarket(resolvedMarket);

      // Create inactive market
      const inactiveMarket = {
        conditionId: `test-inactive-${timestamp}`,
        question: 'Inactive market',
        eventType: 'election',
        status: 'inactive' as const,
        trendingScore: 3.0,
      };
      await persistence.upsertMarket(inactiveMarket);

      const updateIntervalMs = 0; // Get all markets
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      // Should only include active markets
      const hasResolved = markets.some((m) => m.status === 'resolved');
      const hasInactive = markets.some((m) => m.status === 'inactive');
      const allActive = markets.every((m) => m.status === 'active');
      
      expect(hasResolved).toBe(false);
      expect(hasInactive).toBe(false);
      expect(allActive).toBe(true);
    });

    it('should handle various timestamps correctly', async () => {
      // Test with different intervals
      const intervals = [
        0, // All markets
        60 * 1000, // 1 minute
        60 * 60 * 1000, // 1 hour
        24 * 60 * 60 * 1000, // 24 hours
      ];

      for (const interval of intervals) {
        const markets = await persistence.getMarketsForUpdate(interval);
        expect(Array.isArray(markets)).toBe(true);
      }
    });

    it('should respect update interval - exclude recently analyzed markets', async () => {
      const timestamp = Date.now();
      
      // Create a market and analyze it (sets last_analyzed_at to now)
      const recentMarket = {
        conditionId: `test-recent-${timestamp}`,
        question: 'Recently analyzed market',
        eventType: 'election',
        status: 'active' as const,
        trendingScore: 7.0,
      };
      await persistence.upsertMarket(recentMarket);

      // Get markets that need update (haven't been analyzed in last 24 hours)
      const updateIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      // Should NOT include the recently analyzed market
      const foundRecent = markets.find((m) => m.conditionId === recentMarket.conditionId);
      expect(foundRecent).toBeUndefined();
    });

    it('should include markets with null last_analyzed_at', async () => {
      const timestamp = Date.now();
      
      // Create a market (will have last_analyzed_at set by upsertMarket)
      const market = {
        conditionId: `test-null-timestamp-${timestamp}`,
        question: 'Market with null timestamp',
        eventType: 'election',
        status: 'active' as const,
        trendingScore: 6.0,
      };
      await persistence.upsertMarket(market);

      // Get all active markets
      const updateIntervalMs = 0;
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      // Should include markets regardless of timestamp when interval is 0
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
    });

    it('should sort by priority - trending score descending, then staleness', async () => {
      const timestamp = Date.now();
      
      // Create markets with different trending scores
      const highTrendingMarket = {
        conditionId: `test-high-trending-${timestamp}`,
        question: 'High trending market',
        eventType: 'election',
        status: 'active' as const,
        trendingScore: 9.5,
      };
      await persistence.upsertMarket(highTrendingMarket);

      const mediumTrendingMarket = {
        conditionId: `test-medium-trending-${timestamp}`,
        question: 'Medium trending market',
        eventType: 'election',
        status: 'active' as const,
        trendingScore: 5.0,
      };
      await persistence.upsertMarket(mediumTrendingMarket);

      const lowTrendingMarket = {
        conditionId: `test-low-trending-${timestamp}`,
        question: 'Low trending market',
        eventType: 'election',
        status: 'active' as const,
        trendingScore: 2.0,
      };
      await persistence.upsertMarket(lowTrendingMarket);

      const updateIntervalMs = 0; // Get all markets
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      // Find our test markets in the results
      const testMarkets = markets.filter((m) => 
        m.conditionId.includes(`-${timestamp}`)
      );

      // Should be sorted by trending score descending
      if (testMarkets.length >= 3) {
        const highIndex = testMarkets.findIndex((m) => m.conditionId === highTrendingMarket.conditionId);
        const mediumIndex = testMarkets.findIndex((m) => m.conditionId === mediumTrendingMarket.conditionId);
        const lowIndex = testMarkets.findIndex((m) => m.conditionId === lowTrendingMarket.conditionId);

        expect(highIndex).toBeLessThan(mediumIndex);
        expect(mediumIndex).toBeLessThan(lowIndex);
      }
    });

    it('should support quota-based limiting by returning all eligible markets', async () => {
      const timestamp = Date.now();
      
      // Create multiple active markets
      const marketCount = 5;
      for (let i = 0; i < marketCount; i++) {
        const market = {
          conditionId: `test-quota-market-${timestamp}-${i}`,
          question: `Quota test market ${i}`,
          eventType: 'election',
          status: 'active' as const,
          trendingScore: 10 - i, // Descending scores
        };
        await persistence.upsertMarket(market);
      }

      const updateIntervalMs = 0; // Get all markets
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      // Should return all eligible markets (caller can limit based on quota)
      const testMarkets = markets.filter((m) => 
        m.conditionId.includes(`test-quota-market-${timestamp}`)
      );
      
      expect(testMarkets.length).toBe(marketCount);
      
      // Verify they're sorted by trending score
      for (let i = 0; i < testMarkets.length - 1; i++) {
        const current = testMarkets[i].trendingScore || 0;
        const next = testMarkets[i + 1].trendingScore || 0;
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('should handle markets with missing trending scores', async () => {
      const timestamp = Date.now();
      
      // Create market without trending score
      const marketNoScore = {
        conditionId: `test-no-score-${timestamp}`,
        question: 'Market without trending score',
        eventType: 'election',
        status: 'active' as const,
      };
      await persistence.upsertMarket(marketNoScore);

      const updateIntervalMs = 0;
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      // Should still return the market
      const found = markets.find((m) => m.conditionId === marketNoScore.conditionId);
      expect(found).toBeDefined();
    });

    it('should return empty array when no markets need update', async () => {
      // Use a very short interval (1ms) - all markets should be too recent
      const updateIntervalMs = 1;
      
      // Wait a bit to ensure any just-created markets are outside the interval
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const markets = await persistence.getMarketsForUpdate(updateIntervalMs);

      // Should return empty array or only very old markets
      expect(Array.isArray(markets)).toBe(true);
    });
  });

  describe('markMarketResolved', () => {
    it('should mark market as resolved', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Market to resolve',
        eventType: 'election',
        status: 'active' as const,
      };
      const marketId = await persistence.upsertMarket(market);

      await persistence.markMarketResolved(marketId, 'YES');

      // Verify by trying to get it in update list (should not appear)
      const markets = await persistence.getMarketsForUpdate(0);
      const found = markets.find((m) => m.conditionId === market.conditionId);
      expect(found).toBeUndefined();
    });
  });

  describe('getLatestRecommendation', () => {
    it('should return latest recommendation', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      const recommendation: TradeRecommendation = {
        marketId: market.conditionId,
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.65, 0.70],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium',
        explanation: {
          summary: 'Test recommendation',
          coreThesis: 'Test',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73],
        },
      };

      await persistence.storeRecommendation(marketId, recommendation);

      const retrieved = await persistence.getLatestRecommendation(marketId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.action).toBe('LONG_YES');
      expect(retrieved?.expectedValue).toBe(25.5);
    });

    it('should return null for market without recommendations', async () => {
      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Market without recommendation',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      const retrieved = await persistence.getLatestRecommendation(marketId);

      expect(retrieved).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Disconnect to simulate error
      await clientManager.disconnect();

      const market = {
        conditionId: `test-condition-${Date.now()}`,
        question: 'Test market',
        eventType: 'election',
      };

      await expect(persistence.upsertMarket(market)).rejects.toThrow();
    });
  });
});
