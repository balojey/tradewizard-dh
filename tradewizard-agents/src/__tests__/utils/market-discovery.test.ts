/**
 * Unit tests for Market Discovery Engine
 *
 * Tests cover:
 * - Fetching political markets with mocked Polymarket API
 * - Filtering markets by political keywords
 * - Calculating trending scores with different market metrics
 * - Ranking markets by trending score
 * - End-to-end market discovery
 * - Error handling and retry logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PolymarketDiscoveryEngine,
  type PolymarketMarket,
} from './market-discovery.js';
import type { EngineConfig } from '../config/index.js';

// Mock fetch globally
globalThis.fetch = vi.fn() as any;

describe('PolymarketDiscoveryEngine', () => {
  let engine: PolymarketDiscoveryEngine;
  let config: EngineConfig['polymarket'];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create test config
    config = {
      gammaApiUrl: 'https://test-gamma.polymarket.com',
      clobApiUrl: 'https://test-clob.polymarket.com',
      rateLimitBuffer: 80,
    };

    engine = new PolymarketDiscoveryEngine(config);
  });

  describe('fetchPoliticalMarkets', () => {
    it('should fetch and filter political markets', async () => {
      // Mock API response with mixed markets
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: 'election-123',
          question: 'Will Biden win the 2024 election?',
          description: 'Presidential election market',
          end_date_iso: '2024-11-05T23:59:59Z',
          created_at: '2024-01-01T00:00:00Z',
          market_slug: 'biden-2024',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.45', '0.55'],
          volume: '1000000',
          volume_24h: '50000',
          liquidity: '500000',
          trades_24h: 150,
          active: true,
          closed: false,
        },
        {
          condition_id: 'sports-456',
          question: 'Will the Lakers win the championship?',
          description: 'NBA championship market',
          end_date_iso: '2024-06-30T23:59:59Z',
          created_at: '2024-01-01T00:00:00Z',
          market_slug: 'lakers-championship',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.30', '0.70'],
          volume: '500000',
          volume_24h: '25000',
          liquidity: '250000',
          trades_24h: 80,
          active: true,
          closed: false,
        },
        {
          condition_id: 'court-789',
          question: 'Will the Supreme Court overturn the ruling?',
          description: 'Supreme Court decision market',
          end_date_iso: '2024-12-31T23:59:59Z',
          created_at: '2024-02-01T00:00:00Z',
          market_slug: 'scotus-ruling',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.60', '0.40'],
          volume: '750000',
          volume_24h: '40000',
          liquidity: '400000',
          trades_24h: 120,
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarkets,
      });

      const result = await engine.fetchPoliticalMarkets();

      // Should only return political markets (election and court)
      expect(result).toHaveLength(2);
      expect(result.some((m) => m.condition_id === 'election-123')).toBe(true);
      expect(result.some((m) => m.condition_id === 'court-789')).toBe(true);
      expect(result.some((m) => m.condition_id === 'sports-456')).toBe(false);
    });

    it('should filter out closed markets', async () => {
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: 'election-123',
          question: 'Will Biden win the 2024 election?',
          description: 'Presidential election market',
          end_date_iso: '2024-11-05T23:59:59Z',
          market_slug: 'biden-2024',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.45', '0.55'],
          volume: '1000000',
          liquidity: '500000',
          active: true,
          closed: false,
        },
        {
          condition_id: 'election-456',
          question: 'Will Trump win the 2020 election?',
          description: 'Past presidential election',
          end_date_iso: '2020-11-03T23:59:59Z',
          market_slug: 'trump-2020',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.00', '1.00'],
          volume: '5000000',
          liquidity: '0',
          active: false,
          closed: true,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarkets,
      });

      const result = await engine.fetchPoliticalMarkets();

      // Should only return active market
      expect(result).toHaveLength(1);
      expect(result[0].condition_id).toBe('election-123');
    });

    it('should handle API response with markets wrapper', async () => {
      const mockResponse = {
        markets: [
          {
            condition_id: 'policy-123',
            question: 'Will the bill pass?',
            description: 'Legislation market',
            end_date_iso: '2024-12-31T23:59:59Z',
            market_slug: 'bill-pass',
            outcomes: ['YES', 'NO'],
            outcome_prices: ['0.50', '0.50'],
            volume: '100000',
            liquidity: '50000',
            active: true,
            closed: false,
          },
        ],
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await engine.fetchPoliticalMarkets();

      expect(result).toHaveLength(1);
      expect(result[0].condition_id).toBe('policy-123');
    });

    it('should retry on transient failures', async () => {
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: 'election-123',
          question: 'Will Biden win the election?',
          description: 'Election market',
          end_date_iso: '2024-11-05T23:59:59Z',
          market_slug: 'biden-2024',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.45', '0.55'],
          volume: '1000000',
          liquidity: '500000',
          active: true,
          closed: false,
        },
      ];

      // First call fails, second succeeds
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMarkets,
        });

      const result = await engine.fetchPoliticalMarkets();

      expect(result).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      // All calls fail
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('HTTP 500: Internal Server Error')
      );

      await expect(engine.fetchPoliticalMarkets()).rejects.toThrow();
      expect(globalThis.fetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    }, 15000); // Longer timeout for retries
  });

  describe('filterPoliticalMarkets', () => {
    it('should filter markets with election keywords', () => {
      const markets: PolymarketMarket[] = [
        {
          condition_id: 'election-123',
          question: 'Will Biden win the election?',
          description: 'Presidential election',
          end_date_iso: '2024-11-05T23:59:59Z',
          market_slug: 'biden-2024',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.45', '0.55'],
          volume: '1000000',
          liquidity: '500000',
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => markets,
      });

      return engine.fetchPoliticalMarkets().then((result) => {
        expect(result).toHaveLength(1);
      });
    });

    it('should filter markets with court keywords', () => {
      const markets: PolymarketMarket[] = [
        {
          condition_id: 'court-123',
          question: 'Will the Supreme Court rule in favor?',
          description: 'Court ruling',
          end_date_iso: '2024-12-31T23:59:59Z',
          market_slug: 'scotus-ruling',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.60', '0.40'],
          volume: '750000',
          liquidity: '400000',
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => markets,
      });

      return engine.fetchPoliticalMarkets().then((result) => {
        expect(result).toHaveLength(1);
      });
    });

    it('should filter markets with geopolitical keywords', () => {
      const markets: PolymarketMarket[] = [
        {
          condition_id: 'geo-123',
          question: 'Will there be a war?',
          description: 'Geopolitical conflict',
          end_date_iso: '2024-12-31T23:59:59Z',
          market_slug: 'war-prediction',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.20', '0.80'],
          volume: '500000',
          liquidity: '300000',
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => markets,
      });

      return engine.fetchPoliticalMarkets().then((result) => {
        expect(result).toHaveLength(1);
      });
    });

    it('should filter markets with policy keywords', () => {
      const markets: PolymarketMarket[] = [
        {
          condition_id: 'policy-123',
          question: 'Will the legislation pass?',
          description: 'Policy bill',
          end_date_iso: '2024-12-31T23:59:59Z',
          market_slug: 'bill-pass',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '100000',
          liquidity: '50000',
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => markets,
      });

      return engine.fetchPoliticalMarkets().then((result) => {
        expect(result).toHaveLength(1);
      });
    });
  });

  describe('calculateTrendingScore', () => {
    it('should calculate higher score for high volume markets', () => {
      const highVolumeMarket: PolymarketMarket = {
        condition_id: 'high-vol',
        question: 'High volume election',
        description: 'Election',
        end_date_iso: '2024-12-31T23:59:59Z',
        created_at: '2024-01-01T00:00:00Z',
        market_slug: 'high-vol',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '10000000',
        volume_24h: '1000000',
        liquidity: '500000',
        trades_24h: 100,
        active: true,
        closed: false,
      };

      const lowVolumeMarket: PolymarketMarket = {
        condition_id: 'low-vol',
        question: 'Low volume election',
        description: 'Election',
        end_date_iso: '2024-12-31T23:59:59Z',
        created_at: '2024-01-01T00:00:00Z',
        market_slug: 'low-vol',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '10000',
        volume_24h: '1000',
        liquidity: '5000',
        trades_24h: 10,
        active: true,
        closed: false,
      };

      const rankedMarkets = engine.rankMarkets([highVolumeMarket, lowVolumeMarket]);

      expect(rankedMarkets[0].conditionId).toBe('high-vol');
      expect(rankedMarkets[0].trendingScore).toBeGreaterThan(rankedMarkets[1].trendingScore);
    });

    it('should calculate higher score for high liquidity markets', () => {
      const highLiquidityMarket: PolymarketMarket = {
        condition_id: 'high-liq',
        question: 'High liquidity election',
        description: 'Election',
        end_date_iso: '2024-12-31T23:59:59Z',
        created_at: '2024-01-01T00:00:00Z',
        market_slug: 'high-liq',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '100000',
        volume_24h: '10000',
        liquidity: '1000000',
        trades_24h: 50,
        active: true,
        closed: false,
      };

      const lowLiquidityMarket: PolymarketMarket = {
        condition_id: 'low-liq',
        question: 'Low liquidity election',
        description: 'Election',
        end_date_iso: '2024-12-31T23:59:59Z',
        created_at: '2024-01-01T00:00:00Z',
        market_slug: 'low-liq',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '100000',
        volume_24h: '10000',
        liquidity: '10000',
        trades_24h: 50,
        active: true,
        closed: false,
      };

      const rankedMarkets = engine.rankMarkets([highLiquidityMarket, lowLiquidityMarket]);

      expect(rankedMarkets[0].conditionId).toBe('high-liq');
      expect(rankedMarkets[0].trendingScore).toBeGreaterThan(rankedMarkets[1].trendingScore);
    });

    it('should calculate higher score for newer markets', () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      const newMarket: PolymarketMarket = {
        condition_id: 'new-market',
        question: 'New election',
        description: 'Election',
        end_date_iso: '2024-12-31T23:59:59Z',
        created_at: recentDate.toISOString(),
        market_slug: 'new-market',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '100000',
        volume_24h: '10000',
        liquidity: '50000',
        trades_24h: 50,
        active: true,
        closed: false,
      };

      const oldMarket: PolymarketMarket = {
        condition_id: 'old-market',
        question: 'Old election',
        description: 'Election',
        end_date_iso: '2024-12-31T23:59:59Z',
        created_at: oldDate.toISOString(),
        market_slug: 'old-market',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '100000',
        volume_24h: '10000',
        liquidity: '50000',
        trades_24h: 50,
        active: true,
        closed: false,
      };

      const rankedMarkets = engine.rankMarkets([newMarket, oldMarket]);

      expect(rankedMarkets[0].conditionId).toBe('new-market');
      expect(rankedMarkets[0].trendingScore).toBeGreaterThan(rankedMarkets[1].trendingScore);
    });

    it('should handle markets with missing metrics', () => {
      const incompleteMarket: PolymarketMarket = {
        condition_id: 'incomplete',
        question: 'Incomplete election',
        description: 'Election',
        end_date_iso: '2024-12-31T23:59:59Z',
        market_slug: 'incomplete',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '0',
        liquidity: '0',
        active: true,
        closed: false,
      };

      const rankedMarkets = engine.rankMarkets([incompleteMarket]);

      expect(rankedMarkets).toHaveLength(1);
      expect(rankedMarkets[0].trendingScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rankMarkets', () => {
    it('should rank markets in descending order by trending score', () => {
      const markets: PolymarketMarket[] = [
        {
          condition_id: 'low-score',
          question: 'Low score election',
          description: 'Election',
          end_date_iso: '2024-12-31T23:59:59Z',
          created_at: '2023-01-01T00:00:00Z',
          market_slug: 'low-score',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '1000',
          volume_24h: '100',
          liquidity: '500',
          trades_24h: 5,
          active: true,
          closed: false,
        },
        {
          condition_id: 'high-score',
          question: 'High score election',
          description: 'Election',
          end_date_iso: '2024-12-31T23:59:59Z',
          created_at: new Date().toISOString(),
          market_slug: 'high-score',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '10000000',
          volume_24h: '1000000',
          liquidity: '5000000',
          trades_24h: 500,
          active: true,
          closed: false,
        },
        {
          condition_id: 'mid-score',
          question: 'Mid score election',
          description: 'Election',
          end_date_iso: '2024-12-31T23:59:59Z',
          created_at: '2024-01-01T00:00:00Z',
          market_slug: 'mid-score',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '100000',
          volume_24h: '10000',
          liquidity: '50000',
          trades_24h: 50,
          active: true,
          closed: false,
        },
      ];

      const rankedMarkets = engine.rankMarkets(markets);

      expect(rankedMarkets).toHaveLength(3);
      expect(rankedMarkets[0].conditionId).toBe('high-score');
      expect(rankedMarkets[1].conditionId).toBe('mid-score');
      expect(rankedMarkets[2].conditionId).toBe('low-score');
      expect(rankedMarkets[0].trendingScore).toBeGreaterThan(rankedMarkets[1].trendingScore);
      expect(rankedMarkets[1].trendingScore).toBeGreaterThan(rankedMarkets[2].trendingScore);
    });

    it('should include all market metadata in ranked results', () => {
      const market: PolymarketMarket = {
        condition_id: 'test-123',
        question: 'Test election',
        description: 'Test description',
        end_date_iso: '2024-12-31T23:59:59Z',
        market_slug: 'test-market',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '100000',
        volume_24h: '10000',
        liquidity: '50000',
        active: true,
        closed: false,
      };

      const rankedMarkets = engine.rankMarkets([market]);

      expect(rankedMarkets[0]).toMatchObject({
        conditionId: 'test-123',
        question: 'Test election',
        description: 'Test description',
        marketSlug: 'test-market',
        volume24h: 10000,
        liquidity: 50000,
      });
      expect(rankedMarkets[0].trendingScore).toBeGreaterThan(0);
    });
  });

  describe('discoverMarkets', () => {
    it('should discover and return top N markets', async () => {
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: 'market-1',
          question: 'Election 1',
          description: 'Election',
          end_date_iso: '2024-12-31T23:59:59Z',
          created_at: new Date().toISOString(),
          market_slug: 'market-1',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '10000000',
          volume_24h: '1000000',
          liquidity: '5000000',
          trades_24h: 500,
          active: true,
          closed: false,
        },
        {
          condition_id: 'market-2',
          question: 'Election 2',
          description: 'Election',
          end_date_iso: '2024-12-31T23:59:59Z',
          created_at: '2024-01-01T00:00:00Z',
          market_slug: 'market-2',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '100000',
          volume_24h: '10000',
          liquidity: '50000',
          trades_24h: 50,
          active: true,
          closed: false,
        },
        {
          condition_id: 'market-3',
          question: 'Election 3',
          description: 'Election',
          end_date_iso: '2024-12-31T23:59:59Z',
          created_at: '2023-01-01T00:00:00Z',
          market_slug: 'market-3',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '1000',
          volume_24h: '100',
          liquidity: '500',
          trades_24h: 5,
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarkets,
      });

      const result = await engine.discoverMarkets(2);

      expect(result).toHaveLength(2);
      expect(result[0].conditionId).toBe('market-1');
      expect(result[1].conditionId).toBe('market-2');
    });

    it('should return all markets if limit exceeds available markets', async () => {
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: 'market-1',
          question: 'Election 1',
          description: 'Election',
          end_date_iso: '2024-12-31T23:59:59Z',
          market_slug: 'market-1',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '100000',
          liquidity: '50000',
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarkets,
      });

      const result = await engine.discoverMarkets(10);

      expect(result).toHaveLength(1);
    });

    it('should return empty array if no political markets found', async () => {
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: 'sports-1',
          question: 'Will the Lakers win?',
          description: 'Sports market',
          end_date_iso: '2024-12-31T23:59:59Z',
          market_slug: 'sports-1',
          outcomes: ['YES', 'NO'],
          outcome_prices: ['0.50', '0.50'],
          volume: '100000',
          liquidity: '50000',
          active: true,
          closed: false,
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarkets,
      });

      const result = await engine.discoverMarkets(3);

      expect(result).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error: Connection refused')
      );

      await expect(engine.fetchPoliticalMarkets()).rejects.toThrow();
    }, 15000);

    it('should handle invalid JSON responses', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(engine.fetchPoliticalMarkets()).rejects.toThrow();
    });

    it('should handle HTTP error responses', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(engine.fetchPoliticalMarkets()).rejects.toThrow();
    }, 15000);
  });
});
