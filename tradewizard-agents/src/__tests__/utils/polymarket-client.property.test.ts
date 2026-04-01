/**
 * Property-based tests for Polymarket API Client
 *
 * Feature: market-intelligence-engine, Property 1: Market data retrieval completeness
 * Validates: Requirements 1.2
 *
 * Property: For any valid market contract ID, when market data is requested,
 * the system should return a response containing market probability, liquidity score,
 * bid/ask spread, and contract metadata.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { PolymarketClient } from './polymarket-client.js';
import type { EngineConfig } from '../config/index.js';

// Mock fetch globally
globalThis.fetch = vi.fn() as any;

describe('PolymarketClient - Property-Based Tests', () => {
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

  // Feature: market-intelligence-engine, Property 1: Market data retrieval completeness
  // Validates: Requirements 1.2
  it(
    'Property 1: Market data retrieval completeness - For any valid market ID, response should contain all required fields',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generator for valid condition IDs
          fc.string({ minLength: 10, maxLength: 50 }),
          // Generator for market questions
          fc.string({ minLength: 20, maxLength: 200 }),
          // Generator for probabilities (0-1)
          fc.double({ min: 0, max: 1, noNaN: true }),
          // Generator for volumes
          fc.double({ min: 0, max: 10000000, noNaN: true }),
          // Generator for liquidity
          fc.double({ min: 0, max: 5000000, noNaN: true }),
          // Generator for bid/ask prices
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          async (conditionId, question, probability, volume, liquidity, bidPrice, askPrice) => {
            // Ensure bid < ask
            const [bid, ask] = bidPrice < askPrice ? [bidPrice, askPrice] : [askPrice, bidPrice];

            // Mock API responses with generated data
            const mockMarketData = {
              condition_id: conditionId,
              question,
              description: 'Test market description',
              end_date_iso: '2024-12-31T23:59:59Z',
              game_start_time: '2024-01-01T00:00:00Z',
              question_id: `q-${conditionId}`,
              market_slug: `market-${conditionId}`,
              outcomes: ['YES', 'NO'],
              outcome_prices: [probability.toString(), (1 - probability).toString()],
              volume: volume.toString(),
              liquidity: liquidity.toString(),
            };

            const mockOrderBook = {
              market: conditionId,
              asset_id: `asset-${conditionId}`,
              bids: [
                { price: bid.toString(), size: '1000' },
                { price: (bid * 0.99).toString(), size: '2000' },
              ],
              asks: [
                { price: ask.toString(), size: '1500' },
                { price: (ask * 1.01).toString(), size: '2500' },
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

            const result = await client.fetchMarketData(conditionId);

            // Property: Response should always be successful for valid inputs
            expect(result.ok).toBe(true);

            if (result.ok) {
              const mbd = result.data;

              // Property: All required fields must be present
              expect(mbd.conditionId).toBeDefined();
              expect(mbd.marketId).toBeDefined();
              expect(mbd.question).toBeDefined();
              expect(mbd.resolutionCriteria).toBeDefined();
              expect(mbd.expiryTimestamp).toBeDefined();

              // Property: Market probability must be in valid range [0, 1]
              expect(mbd.currentProbability).toBeGreaterThanOrEqual(0);
              expect(mbd.currentProbability).toBeLessThanOrEqual(1);

              // Property: Liquidity score must be in valid range [0, 10]
              expect(mbd.liquidityScore).toBeGreaterThanOrEqual(0);
              expect(mbd.liquidityScore).toBeLessThanOrEqual(10);

              // Property: Bid-ask spread must be non-negative
              expect(mbd.bidAskSpread).toBeGreaterThanOrEqual(0);

              // Property: Volume must be non-negative
              expect(mbd.volume24h).toBeGreaterThanOrEqual(0);

              // Property: Volatility regime must be one of the valid values
              expect(['low', 'medium', 'high']).toContain(mbd.volatilityRegime);

              // Property: Event type must be one of the valid values
              expect([
                'election',
                'policy',
                'court',
                'geopolitical',
                'economic',
                'other',
              ]).toContain(mbd.eventType);

              // Property: Metadata must contain required fields
              expect(mbd.metadata).toBeDefined();
              expect(Array.isArray(mbd.metadata.ambiguityFlags)).toBe(true);
              expect(Array.isArray(mbd.metadata.keyCatalysts)).toBe(true);

              // Property: Expiry timestamp must be a valid future timestamp
              expect(mbd.expiryTimestamp).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 } // Run 100 iterations as specified in design
      );
    },
    120000 // 2 minute timeout for 100 iterations
  );

  // Additional property: Market data structure consistency
  it(
    'Property: Market data structure should be consistent across different market types',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 50 }),
          fc.constantFrom('election', 'policy', 'court', 'geopolitical', 'economic', 'other'),
          async (conditionId, eventKeyword) => {
            // Create question that matches event type
            const questionMap: Record<string, string> = {
              election: 'Will candidate X win the election?',
              policy: 'Will the new policy be enacted?',
              court: 'Will the court rule in favor?',
              geopolitical: 'Will there be a war?',
              economic: 'Will Bitcoin reach $100k?',
              other: 'Will this event happen?',
            };

            const mockMarketData = {
              condition_id: conditionId,
              question: questionMap[eventKeyword],
              description: 'Test description',
              end_date_iso: '2024-12-31T23:59:59Z',
              game_start_time: '2024-01-01T00:00:00Z',
              question_id: `q-${conditionId}`,
              market_slug: `market-${conditionId}`,
              outcomes: ['YES', 'NO'],
              outcome_prices: ['0.5', '0.5'],
              volume: '100000',
              liquidity: '50000',
            };

            const mockOrderBook = {
              market: conditionId,
              asset_id: `asset-${conditionId}`,
              bids: [{ price: '0.49', size: '1000' }],
              asks: [{ price: '0.51', size: '1000' }],
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

            const result = await client.fetchMarketData(conditionId);

            expect(result.ok).toBe(true);

            if (result.ok) {
              // Property: Event type should be correctly classified
              expect(result.data.eventType).toBe(eventKeyword);

              // Property: All market types should have the same structure
              expect(result.data).toHaveProperty('conditionId');
              expect(result.data).toHaveProperty('marketId');
              expect(result.data).toHaveProperty('question');
              expect(result.data).toHaveProperty('currentProbability');
              expect(result.data).toHaveProperty('liquidityScore');
              expect(result.data).toHaveProperty('bidAskSpread');
              expect(result.data).toHaveProperty('volatilityRegime');
              expect(result.data).toHaveProperty('metadata');
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    120000
  );

  // Property: Bid-ask spread calculation correctness
  it(
    'Property: Bid-ask spread should always equal (ask - bid) * 100',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 50 }),
          fc.double({ min: 0.01, max: 0.99, noNaN: true }),
          fc.double({ min: 0.01, max: 0.1, noNaN: true }),
          async (conditionId, midPrice, spreadWidth) => {
            const bid = Math.max(0, midPrice - spreadWidth / 2);
            const ask = Math.min(1, midPrice + spreadWidth / 2);

            const mockMarketData = {
              condition_id: conditionId,
              question: 'Test question',
              description: 'Test',
              end_date_iso: '2024-12-31T23:59:59Z',
              game_start_time: '2024-01-01T00:00:00Z',
              question_id: `q-${conditionId}`,
              market_slug: `market-${conditionId}`,
              outcomes: ['YES', 'NO'],
              outcome_prices: ['0.5', '0.5'],
              volume: '100000',
              liquidity: '50000',
            };

            const mockOrderBook = {
              market: conditionId,
              asset_id: `asset-${conditionId}`,
              bids: [{ price: bid.toString(), size: '1000' }],
              asks: [{ price: ask.toString(), size: '1000' }],
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

            const result = await client.fetchMarketData(conditionId);

            expect(result.ok).toBe(true);

            if (result.ok) {
              const expectedSpread = (ask - bid) * 100;
              // Property: Spread calculation should be accurate within floating point precision
              expect(result.data.bidAskSpread).toBeCloseTo(expectedSpread, 2);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    120000
  );
});
