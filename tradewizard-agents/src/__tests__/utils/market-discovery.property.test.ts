/**
 * Property-based tests for Market Discovery Engine
 *
 * Property 1: Market selection count enforcement
 * **Validates: Requirements 1.4, 4.3**
 *
 * For any analysis cycle, the number of markets selected for analysis
 * should never exceed the configured maximum (default: 3).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  PolymarketDiscoveryEngine,
  type PolymarketMarket,
} from './market-discovery.js';
import type { EngineConfig } from '../config/index.js';

// Mock fetch globally
globalThis.fetch = vi.fn() as any;

describe('Market Discovery Engine - Property-Based Tests', () => {
  let engine: PolymarketDiscoveryEngine;
  let config: EngineConfig['polymarket'];

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      gammaApiUrl: 'https://test-gamma.polymarket.com',
      clobApiUrl: 'https://test-clob.polymarket.com',
      rateLimitBuffer: 80,
    };

    engine = new PolymarketDiscoveryEngine(config);
  });

  /**
   * Property 1: Market selection count enforcement
   * **Feature: automated-market-monitor, Property 1: Market selection count enforcement**
   * **Validates: Requirements 1.4, 4.3**
   *
   * For any analysis cycle, the number of markets selected for analysis
   * should never exceed the configured maximum.
   */
  it(
    'Property 1: should never return more markets than the specified limit',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random limit (1-10)
          fc.integer({ min: 1, max: 10 }),
          // Generate random number of markets (0-50)
          fc.integer({ min: 0, max: 50 }),
          async (limit, marketCount) => {
            // Generate random political markets
            const mockMarkets: PolymarketMarket[] = Array.from(
              { length: marketCount },
              (_, i) => ({
                condition_id: `market-${i}`,
                question: `Will the election happen? ${i}`,
                description: 'Political election market',
                end_date_iso: '2024-12-31T23:59:59Z',
                created_at: new Date(
                  Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
                ).toISOString(),
                market_slug: `market-${i}`,
                outcomes: ['YES', 'NO'],
                outcome_prices: ['0.50', '0.50'],
                volume: String(Math.random() * 10000000),
                volume_24h: String(Math.random() * 1000000),
                liquidity: String(Math.random() * 5000000),
                trades_24h: Math.floor(Math.random() * 1000),
                active: true,
                closed: false,
              })
            );

            // Mock API response
            (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              ok: true,
              json: async () => mockMarkets,
            });

            // Discover markets with the specified limit
            const result = await engine.discoverMarkets(limit);

            // Property: Result length should never exceed limit
            expect(result.length).toBeLessThanOrEqual(limit);

            // Additional invariant: Result length should be min(limit, available markets)
            expect(result.length).toBe(Math.min(limit, marketCount));
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  ); // 30 second timeout for property test

  /**
   * Additional property: Trending score monotonicity
   *
   * For any ranked list of markets, each market's trending score should be
   * greater than or equal to the next market's score (descending order).
   */
  it(
    'Property: Ranked markets should be in descending order by trending score',
    () => {
      fc.assert(
        fc.property(
          // Generate random array of markets with reasonable values
          fc.array(
            fc.record({
              condition_id: fc.string(),
              question: fc.string(),
              description: fc.string(),
              end_date_iso: fc.constant('2024-12-31T23:59:59Z'),
              created_at: fc.constant('2024-01-01T00:00:00Z'),
              market_slug: fc.string(),
              outcomes: fc.constant(['YES', 'NO'] as string[]),
              outcome_prices: fc.constant(['0.50', '0.50'] as string[]),
              volume: fc.float({ min: 0, max: 10000000, noNaN: true }).map(String),
              volume_24h: fc.float({ min: 0, max: 1000000, noNaN: true }).map(String),
              liquidity: fc.float({ min: 0, max: 5000000, noNaN: true }).map(String),
              trades_24h: fc.integer({ min: 0, max: 1000 }),
              active: fc.constant(true),
              closed: fc.constant(false),
            }),
            { minLength: 2, maxLength: 20 }
          ),
          (markets) => {
            const rankedMarkets = engine.rankMarkets(markets);

            // Property: Each score should be >= next score
            for (let i = 0; i < rankedMarkets.length - 1; i++) {
              expect(rankedMarkets[i].trendingScore).toBeGreaterThanOrEqual(
                rankedMarkets[i + 1].trendingScore
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );

  /**
   * Additional property: Non-negative trending scores
   *
   * For any market, the calculated trending score should always be
   * non-negative (>= 0).
   */
  it(
    'Property: Trending scores should always be non-negative',
    () => {
      fc.assert(
        fc.property(
          // Generate random market with reasonable values
          fc.record({
            condition_id: fc.string(),
            question: fc.string(),
            description: fc.string(),
            end_date_iso: fc.constant('2024-12-31T23:59:59Z'),
            created_at: fc.constant('2024-01-01T00:00:00Z'),
            market_slug: fc.string(),
            outcomes: fc.constant(['YES', 'NO'] as string[]),
            outcome_prices: fc.constant(['0.50', '0.50'] as string[]),
            volume: fc.float({ min: 0, max: 10000000, noNaN: true }).map(String),
            volume_24h: fc.float({ min: 0, max: 1000000, noNaN: true }).map(String),
            liquidity: fc.float({ min: 0, max: 5000000, noNaN: true }).map(String),
            trades_24h: fc.integer({ min: 0, max: 1000 }),
            active: fc.constant(true),
            closed: fc.constant(false),
          }),
          (market) => {
            const rankedMarkets = engine.rankMarkets([market]);

            // Property: Trending score should be non-negative
            expect(rankedMarkets[0].trendingScore).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );

  /**
   * Additional property: Market ranking consistency
   *
   * For any set of markets, the ranking should be deterministic and
   * consistent - running rankMarkets twice on the same input should
   * produce the same output.
   */
  it(
    'Property: Market ranking should be deterministic',
    () => {
      fc.assert(
        fc.property(
          // Generate random array of markets with reasonable values
          fc.array(
            fc.record({
              condition_id: fc.string(),
              question: fc.string(),
              description: fc.string(),
              end_date_iso: fc.constant('2024-12-31T23:59:59Z'),
              created_at: fc.constant('2024-01-01T00:00:00Z'),
              market_slug: fc.string(),
              outcomes: fc.constant(['YES', 'NO'] as string[]),
              outcome_prices: fc.constant(['0.50', '0.50'] as string[]),
              volume: fc.float({ min: 0, max: 10000000, noNaN: true }).map(String),
              volume_24h: fc.float({ min: 0, max: 1000000, noNaN: true }).map(String),
              liquidity: fc.float({ min: 0, max: 5000000, noNaN: true }).map(String),
              trades_24h: fc.integer({ min: 0, max: 1000 }),
              active: fc.constant(true),
              closed: fc.constant(false),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          (markets) => {
            // Rank markets twice
            const ranking1 = engine.rankMarkets(markets);
            const ranking2 = engine.rankMarkets(markets);

            // Property: Rankings should be identical
            expect(ranking1.length).toBe(ranking2.length);

            for (let i = 0; i < ranking1.length; i++) {
              expect(ranking1[i].conditionId).toBe(ranking2[i].conditionId);
              expect(ranking1[i].trendingScore).toBe(ranking2[i].trendingScore);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );

  /**
   * Additional property: Volume and liquidity preservation
   *
   * For any market, the volume and liquidity values in the ranked result
   * should match the original market data.
   */
  it(
    'Property: Volume and liquidity should be preserved in ranking',
    () => {
      fc.assert(
        fc.property(
          // Generate random market with specific volume and liquidity
          fc.record({
            condition_id: fc.string(),
            question: fc.string(),
            description: fc.string(),
            end_date_iso: fc.constant('2024-12-31T23:59:59Z'),
            created_at: fc.constant('2024-01-01T00:00:00Z'),
            market_slug: fc.string(),
            outcomes: fc.constant(['YES', 'NO'] as string[]),
            outcome_prices: fc.constant(['0.50', '0.50'] as string[]),
            volume: fc.float({ min: 0, max: 10000000, noNaN: true }).map(String),
            volume_24h: fc.float({ min: 0, max: 1000000, noNaN: true }).map(String),
            liquidity: fc.float({ min: 0, max: 5000000, noNaN: true }).map(String),
            trades_24h: fc.integer({ min: 0, max: 1000 }),
            active: fc.constant(true),
            closed: fc.constant(false),
          }),
          (market) => {
            const rankedMarkets = engine.rankMarkets([market]);

            // Property: Volume and liquidity should match
            expect(rankedMarkets[0].volume24h).toBe(
              parseFloat(market.volume_24h || market.volume)
            );
            expect(rankedMarkets[0].liquidity).toBe(parseFloat(market.liquidity));
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );
});
