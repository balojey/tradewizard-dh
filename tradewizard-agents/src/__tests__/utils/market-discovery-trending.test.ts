/**
 * Integration test for updated Market Discovery Engine with trending approach
 * 
 * This test verifies that the market discovery engine can fetch trending markets
 * using the same approach as the frontend (events API with proper filtering).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PolymarketDiscoveryEngine,
  type PolymarketMarket,
} from './market-discovery.js';
import type { EngineConfig } from '../config/index.js';

// Mock fetch globally
globalThis.fetch = vi.fn() as any;

describe('PolymarketDiscoveryEngine - Trending Approach', () => {
  let engine: PolymarketDiscoveryEngine;
  let config: EngineConfig['polymarket'];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create minimal test config to avoid validation errors
    config = {
      gammaApiUrl: 'https://gamma-api.polymarket.com',
      clobApiUrl: 'https://clob-api.polymarket.com',
      rateLimitBuffer: 80,
      politicsTagId: 2,
      includeRelatedTags: true,
      maxEventsPerDiscovery: 100,
      defaultSortBy: 'volume24hr',
      enableEventBasedKeywords: true,
      enableCrossMarketAnalysis: true,
      keywordExtractionMode: 'event_priority',
      environment: 'development', // Add required environment field
    };

    // Mock the enhanced event client to avoid complex initialization
    const mockEventClient = {
      discoverTrendingPoliticalEvents: vi.fn().mockResolvedValue([]),
      discoverPoliticalEvents: vi.fn().mockResolvedValue([]),
    };

    engine = new PolymarketDiscoveryEngine(config);
    // Replace the event client with our mock
    (engine as any).eventClient = mockEventClient;
  });

  describe('fetchTrendingMarketsFromEvents', () => {
    it('should fetch trending markets using events API (frontend approach)', async () => {
      // Mock events API response (matching frontend structure)
      const mockEventsResponse = [
        {
          id: 'event-1',
          title: '2024 Presidential Election',
          slug: 'presidential-election-2024',
          active: true,
          closed: false,
          ended: false,
          image: 'https://example.com/election.jpg',
          markets: [
            {
              id: 'market-1',
              conditionId: 'condition-123',
              question: 'Will Trump win the 2024 election?',
              slug: 'trump-2024-election',
              description: 'Presidential election market for Trump',
              active: true,
              closed: false,
              liquidity: '50000',
              volume24hr: 25000,
              volume: '100000',
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.45", "0.55"]',
              clobTokenIds: '["token-1", "token-2"]',
              acceptingOrders: true,
              endDate: '2024-11-05T23:59:59Z',
              createdAt: '2024-01-01T00:00:00Z',
              tags: [{ id: '2', label: 'Politics' }],
            },
            {
              id: 'market-2',
              conditionId: 'condition-456',
              question: 'Will Biden win the 2024 election?',
              slug: 'biden-2024-election',
              description: 'Presidential election market for Biden',
              active: true,
              closed: false,
              liquidity: '45000',
              volume24hr: 22000,
              volume: '90000',
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.35", "0.65"]',
              clobTokenIds: '["token-3", "token-4"]',
              acceptingOrders: true,
              endDate: '2024-11-05T23:59:59Z',
              createdAt: '2024-01-01T00:00:00Z',
              tags: [{ id: '2', label: 'Politics' }],
            },
          ],
        },
        {
          id: 'event-2',
          title: 'Supreme Court Decisions 2024',
          slug: 'scotus-2024',
          active: true,
          closed: false,
          ended: false,
          image: 'https://example.com/scotus.jpg',
          markets: [
            {
              id: 'market-3',
              conditionId: 'condition-789',
              question: 'Will SCOTUS overturn the abortion ruling?',
              slug: 'scotus-abortion-2024',
              description: 'Supreme Court abortion case',
              active: true,
              closed: false,
              liquidity: '30000',
              volume24hr: 15000,
              volume: '60000',
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.60", "0.40"]',
              clobTokenIds: '["token-5", "token-6"]',
              acceptingOrders: true,
              endDate: '2024-12-31T23:59:59Z',
              createdAt: '2024-02-01T00:00:00Z',
              tags: [{ id: '2', label: 'Politics' }],
            },
          ],
        },
      ];

      // Mock the fetch call to events API
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEventsResponse,
      });

      // Call the private method through the public interface
      const result = await engine.fetchPoliticalMarkets();

      // Verify the fetch was called with correct URL (events endpoint)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/events?closed=false&order=volume24hr&ascending=false'),
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Verify URL contains politics tag
      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toContain('tag_id=2');
      expect(fetchCall[0]).toContain('related_tags=true');

      // Verify results
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify market structure includes event context
      const firstMarket = result[0];
      expect(firstMarket).toHaveProperty('conditionId');
      expect(firstMarket).toHaveProperty('question');
      expect(firstMarket).toHaveProperty('eventTitle');
      expect(firstMarket).toHaveProperty('eventId');
      expect(firstMarket).toHaveProperty('liquidity');
      expect(firstMarket).toHaveProperty('volume24hr');
    });

    it('should filter markets based on liquidity and tradeable prices (frontend logic)', async () => {
      // Mock events with markets that should be filtered out
      const mockEventsResponse = [
        {
          id: 'event-1',
          title: 'Test Event',
          active: true,
          closed: false,
          ended: false,
          markets: [
            {
              id: 'market-low-liquidity',
              conditionId: 'condition-low',
              question: 'Low liquidity market?',
              active: true,
              closed: false,
              liquidity: '500', // Below minimum threshold
              volume24hr: 1000,
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.45", "0.55"]',
              clobTokenIds: '["token-1", "token-2"]',
              acceptingOrders: true,
              tags: [],
            },
            {
              id: 'market-non-tradeable',
              conditionId: 'condition-non-tradeable',
              question: 'Non-tradeable market?',
              active: true,
              closed: false,
              liquidity: '10000',
              volume24hr: 5000,
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.01", "0.99"]', // Not tradeable (too extreme)
              clobTokenIds: '["token-3", "token-4"]',
              acceptingOrders: true,
              tags: [],
            },
            {
              id: 'market-good',
              conditionId: 'condition-good',
              question: 'Good market?',
              active: true,
              closed: false,
              liquidity: '10000',
              volume24hr: 5000,
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.45", "0.55"]', // Tradeable prices
              clobTokenIds: '["token-5", "token-6"]',
              acceptingOrders: true,
              tags: [],
            },
          ],
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEventsResponse,
      });

      const result = await engine.fetchPoliticalMarkets();

      // Should only include the good market after filtering
      expect(result.length).toBe(1);
      expect(result[0].conditionId).toBe('condition-good');
    });

    it('should sort markets by combined liquidity + volume score (frontend logic)', async () => {
      const mockEventsResponse = [
        {
          id: 'event-1',
          title: 'Test Event',
          active: true,
          closed: false,
          ended: false,
          markets: [
            {
              id: 'market-low-score',
              conditionId: 'condition-low',
              question: 'Low score market?',
              active: true,
              closed: false,
              liquidity: '5000',
              volume24hr: 2000,
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.45", "0.55"]',
              clobTokenIds: '["token-1", "token-2"]',
              acceptingOrders: true,
              tags: [],
            },
            {
              id: 'market-high-score',
              conditionId: 'condition-high',
              question: 'High score market?',
              active: true,
              closed: false,
              liquidity: '20000',
              volume24hr: 15000,
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.45", "0.55"]',
              clobTokenIds: '["token-3", "token-4"]',
              acceptingOrders: true,
              tags: [],
            },
          ],
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEventsResponse,
      });

      const result = await engine.fetchPoliticalMarkets();

      // Should be sorted by combined score (liquidity + volume)
      expect(result.length).toBe(2);
      expect(result[0].conditionId).toBe('condition-high'); // Higher score first
      expect(result[1].conditionId).toBe('condition-low');
    });
  });

  describe('discoverMarkets', () => {
    it('should discover trending markets and return ranked results', async () => {
      const mockEventsResponse = [
        {
          id: 'event-1',
          title: 'Presidential Election 2024',
          active: true,
          closed: false,
          ended: false,
          markets: [
            {
              id: 'market-1',
              conditionId: 'condition-123',
              question: 'Will Trump win 2024?',
              active: true,
              closed: false,
              liquidity: '50000',
              volume24hr: 25000,
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.45", "0.55"]',
              clobTokenIds: '["token-1", "token-2"]',
              acceptingOrders: true,
              endDate: '2024-11-05T23:59:59Z',
              createdAt: '2024-01-01T00:00:00Z',
              tags: [],
            },
          ],
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEventsResponse,
      });

      const result = await engine.discoverMarkets(5);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify ranked market structure
      const rankedMarket = result[0];
      expect(rankedMarket).toHaveProperty('conditionId');
      expect(rankedMarket).toHaveProperty('question');
      expect(rankedMarket).toHaveProperty('trendingScore');
      expect(rankedMarket).toHaveProperty('volume24h');
      expect(rankedMarket).toHaveProperty('liquidity');
      expect(rankedMarket).toHaveProperty('marketSlug');

      // Verify trending score is calculated
      expect(typeof rankedMarket.trendingScore).toBe('number');
      expect(rankedMarket.trendingScore).toBeGreaterThan(0);
    });
  });
});