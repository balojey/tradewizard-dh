/**
 * Unit tests for Polymarket API Client
 *
 * Tests cover:
 * - Successful market data fetch with mocked APIs
 * - Invalid market ID handling
 * - Rate limit detection and backoff behavior
 * - API unavailability scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PolymarketClient } from './polymarket-client.js';
import type { EngineConfig } from '../config/index.js';

// Mock fetch globally
globalThis.fetch = vi.fn() as any;

describe('PolymarketClient', () => {
  let client: PolymarketClient;
  let config: EngineConfig['polymarket'];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create test config
    config = {
      gammaApiUrl: 'https://test-gamma.polymarket.com',
      clobApiUrl: 'https://test-clob.polymarket.com',
      rateLimitBuffer: 80,
      politicsTagId: 2,
    };

    client = new PolymarketClient(config);
  });

  describe('fetchMarketData', () => {
    it('should successfully fetch and transform market data', async () => {
      // Mock successful API responses
      const mockMarketData = {
        condition_id: 'test-condition-123',
        question: 'Will Bitcoin reach $100k by end of 2024?',
        description: 'Market resolves YES if Bitcoin reaches $100,000 by December 31, 2024',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'bitcoin-100k-2024',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.45', '0.55'],
        volume: '1000000',
        liquidity: '500000',
      };

      const mockOrderBook = {
        market: 'test-condition-123',
        asset_id: 'asset-123',
        bids: [
          { price: '0.44', size: '1000' },
          { price: '0.43', size: '2000' },
        ],
        asks: [
          { price: '0.46', size: '1500' },
          { price: '0.47', size: '2500' },
        ],
        timestamp: Date.now(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMarketData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrderBook,
        });

      const result = await client.fetchMarketData('test-condition-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.conditionId).toBe('test-condition-123');
        expect(result.data.question).toBe('Will Bitcoin reach $100k by end of 2024?');
        expect(result.data.currentProbability).toBeCloseTo(0.45, 2);
        expect(result.data.bidAskSpread).toBeCloseTo(2, 1); // (0.46 - 0.44) * 100
        expect(result.data.eventType).toBe('economic');
        expect(result.data.metadata.keyCatalysts).toHaveLength(2);
      }
    });

    it('should handle invalid market ID (404 error)', async () => {
      // Mock 404 response
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await client.fetchMarketData('invalid-market-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_MARKET_ID');
        expect(result.error).toHaveProperty('marketId', 'invalid-market-id');
      }
    });

    it('should handle API unavailability', async () => {
      // Mock network error
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error: Connection refused')
      );

      const result = await client.fetchMarketData('test-condition-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('API_UNAVAILABLE');
        if (result.error.type === 'API_UNAVAILABLE') {
          expect(result.error).toHaveProperty('message');
        }
      }
    }, 10000); // 10 second timeout for retry logic

    it('should detect rate limit errors', async () => {
      // Mock rate limit response
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('HTTP 429: Too Many Requests - rate limit exceeded')
      );

      const result = await client.fetchMarketData('test-condition-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('RATE_LIMIT_EXCEEDED');
        expect(result.error).toHaveProperty('retryAfter');
      }
    }, 10000); // 10 second timeout for retry logic

    it('should retry on transient failures', async () => {
      // Mock: first call fails, second call succeeds
      const mockMarketData = {
        condition_id: 'test-condition-123',
        question: 'Test question',
        description: 'Test description',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test-market',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.5', '0.5'],
        volume: '100000',
        liquidity: '50000',
      };

      const mockOrderBook = {
        market: 'test-condition-123',
        asset_id: 'asset-123',
        bids: [{ price: '0.49', size: '1000' }],
        asks: [{ price: '0.51', size: '1000' }],
        timestamp: Date.now(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMarketData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrderBook,
        });

      const result = await client.fetchMarketData('test-condition-123');

      expect(result.ok).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3); // 1 failed + 1 retry + 1 order book
    });

    it('should open circuit breaker after multiple failures', async () => {
      // Mock 5 consecutive failures
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('HTTP 500: Internal Server Error')
      );

      // Make 5 requests to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await client.fetchMarketData('test-condition-123');
      }

      // 6th request should be blocked by circuit breaker
      const result = await client.fetchMarketData('test-condition-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('API_UNAVAILABLE');
        if (result.error.type === 'API_UNAVAILABLE') {
          expect(result.error.message).toContain('Circuit breaker is OPEN');
        }
      }
    }, 60000); // 60 second timeout for multiple retries with exponential backoff
  });

  describe('healthCheck', () => {
    it('should return true when both APIs are healthy', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true });

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return false when Gamma API is unhealthy', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should return false when CLOB API is unhealthy', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false });

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should return false on network error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('event type classification', () => {
    it('should classify election markets correctly', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Will Biden win the 2024 election?',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.5', '0.5'],
        volume: '100000',
        liquidity: '50000',
      };

      const mockOrderBook = {
        market: 'test-123',
        asset_id: 'asset-123',
        bids: [{ price: '0.49', size: '1000' }],
        asks: [{ price: '0.51', size: '1000' }],
        timestamp: Date.now(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => mockMarketData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockOrderBook });

      const result = await client.fetchMarketData('test-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.eventType).toBe('election');
      }
    });

    it('should classify geopolitical markets correctly', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Will there be a war between X and Y?',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.5', '0.5'],
        volume: '100000',
        liquidity: '50000',
      };

      const mockOrderBook = {
        market: 'test-123',
        asset_id: 'asset-123',
        bids: [{ price: '0.49', size: '1000' }],
        asks: [{ price: '0.51', size: '1000' }],
        timestamp: Date.now(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => mockMarketData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockOrderBook });

      const result = await client.fetchMarketData('test-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.eventType).toBe('geopolitical');
      }
    });
  });

  describe('ambiguity detection', () => {
    it('should detect ambiguous terms in resolution criteria', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'This market may resolve based on unclear criteria',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.5', '0.5'],
        volume: '100000',
        liquidity: '50000',
      };

      const mockOrderBook = {
        market: 'test-123',
        asset_id: 'asset-123',
        bids: [{ price: '0.49', size: '1000' }],
        asks: [{ price: '0.51', size: '1000' }],
        timestamp: Date.now(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => mockMarketData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockOrderBook });

      const result = await client.fetchMarketData('test-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.ambiguityFlags.length).toBeGreaterThan(0);
        expect(result.data.metadata.ambiguityFlags.some((flag) => flag.includes('may'))).toBe(
          true
        );
        expect(result.data.metadata.ambiguityFlags.some((flag) => flag.includes('unclear'))).toBe(
          true
        );
      }
    });
  });

  describe('volatility regime calculation', () => {
    it('should classify low volatility correctly', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.5', '0.5'],
        volume: '100000',
        liquidity: '50000',
      };

      const mockOrderBook = {
        market: 'test-123',
        asset_id: 'asset-123',
        bids: [{ price: '0.495', size: '1000' }],
        asks: [{ price: '0.505', size: '1000' }],
        timestamp: Date.now(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => mockMarketData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockOrderBook });

      const result = await client.fetchMarketData('test-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.volatilityRegime).toBe('low');
      }
    });

    it('should classify high volatility correctly', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.5', '0.5'],
        volume: '100000',
        liquidity: '50000',
      };

      const mockOrderBook = {
        market: 'test-123',
        asset_id: 'asset-123',
        bids: [{ price: '0.40', size: '1000' }],
        asks: [{ price: '0.50', size: '1000' }],
        timestamp: Date.now(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => mockMarketData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockOrderBook });

      const result = await client.fetchMarketData('test-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.volatilityRegime).toBe('high');
      }
    });
  });

  describe('checkMarketResolution', () => {
    it('should detect resolved market with YES outcome', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['1.0', '0.0'],
        volume: '100000',
        liquidity: '50000',
        closed: true,
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarketData,
      });

      const result = await client.checkMarketResolution('test-123');

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.outcome).toBe('YES');
        expect(result.resolvedAt).toBeDefined();
      }
    });

    it('should detect resolved market with NO outcome', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.0', '1.0'],
        volume: '100000',
        liquidity: '50000',
        resolved: true,
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarketData,
      });

      const result = await client.checkMarketResolution('test-123');

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.outcome).toBe('NO');
        expect(result.resolvedAt).toBeDefined();
      }
    });

    it('should detect active market as not resolved', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.55', '0.45'],
        volume: '100000',
        liquidity: '50000',
        closed: false,
        active: true,
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarketData,
      });

      const result = await client.checkMarketResolution('test-123');

      expect(result.resolved).toBe(false);
    });

    it('should detect market with active=false as resolved', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.98', '0.02'],
        volume: '100000',
        liquidity: '50000',
        active: false,
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarketData,
      });

      const result = await client.checkMarketResolution('test-123');

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.outcome).toBe('YES');
      }
    });

    it('should handle API errors gracefully', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await client.checkMarketResolution('test-123');

      expect(result.resolved).toBe(false);
    });

    it('should detect resolved market with near-1.0 prices (0.95+)', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.96', '0.04'],
        volume: '100000',
        liquidity: '50000',
        closed: true,
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarketData,
      });

      const result = await client.checkMarketResolution('test-123');

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.outcome).toBe('YES');
      }
    });

    it('should return UNKNOWN outcome when prices are ambiguous', async () => {
      const mockMarketData = {
        condition_id: 'test-123',
        question: 'Test question',
        description: 'Test',
        end_date_iso: '2024-12-31T23:59:59Z',
        game_start_time: '2024-01-01T00:00:00Z',
        question_id: 'q123',
        market_slug: 'test',
        outcomes: ['YES', 'NO'],
        outcome_prices: ['0.50', '0.50'],
        volume: '100000',
        liquidity: '50000',
        closed: true,
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarketData,
      });

      const result = await client.checkMarketResolution('test-123');

      expect(result.resolved).toBe(true);
      if (result.resolved) {
        expect(result.outcome).toBe('UNKNOWN');
      }
    });
  });
});
