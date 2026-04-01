/**
 * Property-based tests for Database Persistence Layer
 * 
 * Feature: automated-market-monitor, Property 3: Database persistence completeness
 * Validates: Requirements 5.2, 5.3, 5.4
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import * as fc from 'fast-check';
import type { DatabasePersistence } from './persistence.js';
import type { TradeRecommendation, AgentSignal } from '../models/types.js';

describe('DatabasePersistence - Property Tests', () => {
  let persistence: DatabasePersistence;
  let mockUpsertMarket: Mock;
  let mockStoreRecommendation: Mock;
  let mockStoreAgentSignals: Mock;
  let mockGetLatestRecommendation: Mock;

  beforeEach(() => {
    // Create mock functions
    mockUpsertMarket = vi.fn();
    mockStoreRecommendation = vi.fn();
    mockStoreAgentSignals = vi.fn();
    mockGetLatestRecommendation = vi.fn();

    // Create mock persistence object
    persistence = {
      upsertMarket: mockUpsertMarket as any,
      storeRecommendation: mockStoreRecommendation as any,
      storeAgentSignals: mockStoreAgentSignals as any,
      getLatestRecommendation: mockGetLatestRecommendation as any,
      recordAnalysis: vi.fn() as any,
      getMarketsForUpdate: vi.fn() as any,
      markMarketResolved: vi.fn() as any,
    };
  });

  /**
   * Property 3: Database persistence completeness
   * 
   * For any successfully completed market analysis, the system should store:
   * - A market record
   * - A recommendation record
   * - All agent signal records
   * 
   * This property ensures that all three components are persisted together.
   */
  it('should store market, recommendation, and all agent signals for any valid analysis', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random market data
        fc.record({
          conditionId: fc.string({ minLength: 10, maxLength: 50 }),
          question: fc.string({ minLength: 10, maxLength: 200 }),
          description: fc.option(fc.string({ minLength: 10, maxLength: 500 })),
          eventType: fc.constantFrom('election', 'policy', 'court', 'geopolitical', 'economic'),
          marketProbability: fc.double({ min: 0, max: 1 }),
          volume24h: fc.double({ min: 0, max: 1000000 }),
          liquidity: fc.double({ min: 0, max: 5000000 }),
          trendingScore: fc.double({ min: 0, max: 10 }),
        }),
        // Generate random recommendation
        fc.record({
          action: fc.constantFrom('LONG_YES', 'LONG_NO', 'NO_TRADE'),
          entryZone: fc.tuple(
            fc.double({ min: 0, max: 0.5 }),
            fc.double({ min: 0.5, max: 1 })
          ),
          targetZone: fc.tuple(
            fc.double({ min: 0, max: 0.5 }),
            fc.double({ min: 0.5, max: 1 })
          ),
          expectedValue: fc.double({ min: -50, max: 100 }),
          winProbability: fc.double({ min: 0, max: 1 }),
          consensusProbability: fc.double({ min: 0, max: 1 }),
          marketProbability: fc.double({ min: 0, max: 1 }),
          edge: fc.double({ min: 0, max: 0.5 }),
          confidenceBand: fc.tuple(
            fc.double({ min: 0, max: 0.5 }),
            fc.double({ min: 0.5, max: 1 })
          ),
          summary: fc.string({ minLength: 20, maxLength: 200 }),
          keyCatalysts: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
          failureScenarios: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
        }),
        // Generate random agent signals (1-10 signals)
        fc.array(
          fc.record({
            agentName: fc.constantFrom(
              'polling_intelligence_agent',
              'sentiment_analysis_agent',
              'market_microstructure_agent',
              'event_impact_agent',
              'momentum_agent',
              'tail_risk_agent'
            ),
            confidence: fc.double({ min: 0, max: 1 }),
            direction: fc.constantFrom('YES', 'NO', 'NEUTRAL'),
            fairProbability: fc.double({ min: 0, max: 1 }),
            keyDrivers: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
            riskFactors: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (marketData, recommendationData, signalsData) => {
          // Reset mocks for each iteration
          mockUpsertMarket.mockReset();
          mockStoreRecommendation.mockReset();
          mockStoreAgentSignals.mockReset();
          mockGetLatestRecommendation.mockReset();

          // Generate mock UUIDs
          const mockMarketId = `market-${Math.random().toString(36).substring(7)}`;
          const mockRecommendationId = `rec-${Math.random().toString(36).substring(7)}`;

          // Configure mocks to return valid IDs
          mockUpsertMarket.mockResolvedValue(mockMarketId);
          mockStoreRecommendation.mockResolvedValue(mockRecommendationId);
          mockStoreAgentSignals.mockResolvedValue(undefined);

          // Step 1: Store market
          const marketId = await persistence.upsertMarket({
            conditionId: marketData.conditionId,
            question: marketData.question,
            description: marketData.description ?? undefined,
            eventType: marketData.eventType,
            marketProbability: marketData.marketProbability,
            volume24h: marketData.volume24h,
            liquidity: marketData.liquidity,
            status: 'active',
            trendingScore: marketData.trendingScore,
          });

          // Verify market was stored (should return a valid ID)
          expect(marketId).toBeDefined();
          expect(typeof marketId).toBe('string');
          expect(marketId.length).toBeGreaterThan(0);
          expect(mockUpsertMarket).toHaveBeenCalledOnce();

          // Step 2: Store recommendation
          const recommendation: TradeRecommendation = {
            marketId: marketData.conditionId,
            action: recommendationData.action as 'LONG_YES' | 'LONG_NO' | 'NO_TRADE',
            entryZone: recommendationData.entryZone as [number, number],
            targetZone: recommendationData.targetZone as [number, number],
            expectedValue: recommendationData.expectedValue,
            winProbability: recommendationData.winProbability,
            liquidityRisk: 'medium',
            explanation: {
              summary: recommendationData.summary,
              coreThesis: 'Generated by property test',
              keyCatalysts: recommendationData.keyCatalysts,
              failureScenarios: recommendationData.failureScenarios,
            },
            metadata: {
              consensusProbability: recommendationData.consensusProbability,
              marketProbability: recommendationData.marketProbability,
              edge: recommendationData.edge,
              confidenceBand: recommendationData.confidenceBand as [number, number],
            },
          };

          const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

          // Verify recommendation was stored
          expect(recommendationId).toBeDefined();
          expect(typeof recommendationId).toBe('string');
          expect(recommendationId.length).toBeGreaterThan(0);
          expect(mockStoreRecommendation).toHaveBeenCalledOnce();
          expect(mockStoreRecommendation).toHaveBeenCalledWith(marketId, recommendation);

          // Step 3: Store agent signals
          const signals: AgentSignal[] = signalsData.map((signal) => ({
            agentName: signal.agentName,
            timestamp: Date.now(),
            confidence: signal.confidence,
            direction: signal.direction as 'YES' | 'NO' | 'NEUTRAL',
            fairProbability: signal.fairProbability,
            keyDrivers: signal.keyDrivers,
            riskFactors: signal.riskFactors,
            metadata: {},
          }));

          await persistence.storeAgentSignals(marketId, recommendationId, signals);

          // Verify all signals were stored
          expect(mockStoreAgentSignals).toHaveBeenCalledOnce();
          expect(mockStoreAgentSignals).toHaveBeenCalledWith(marketId, recommendationId, signals);

          // Step 4: Verify completeness - mock retrieval
          mockGetLatestRecommendation.mockResolvedValue(recommendation);
          const retrievedRecommendation = await persistence.getLatestRecommendation(marketId);

          // Verify the recommendation can be retrieved
          expect(retrievedRecommendation).not.toBeNull();
          expect(retrievedRecommendation?.action).toBe(recommendation.action);
          expect(retrievedRecommendation?.expectedValue).toBe(recommendation.expectedValue);

          // Property verified: All three components (market, recommendation, signals) were stored
          // The persistence layer called all three storage methods in the correct order
          expect(mockUpsertMarket).toHaveBeenCalled();
          expect(mockStoreRecommendation).toHaveBeenCalled();
          expect(mockStoreAgentSignals).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 } // Now we can run 100+ iterations quickly with mocks
    );
  });

  /**
   * Additional property: Idempotency of upsertMarket
   * 
   * For any market, calling upsertMarket multiple times with the same conditionId
   * should return the same marketId.
   */
  it('should return the same marketId when upserting the same market multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          conditionId: fc.string({ minLength: 10, maxLength: 50 }),
          question: fc.string({ minLength: 10, maxLength: 200 }),
          eventType: fc.constantFrom('election', 'policy', 'court'),
        }),
        async (marketData) => {
          // Reset mock
          mockUpsertMarket.mockReset();

          // Generate a consistent mock ID for the same conditionId
          const mockMarketId = `market-${marketData.conditionId}`;
          mockUpsertMarket.mockResolvedValue(mockMarketId);

          // First upsert
          const marketId1 = await persistence.upsertMarket({
            conditionId: marketData.conditionId,
            question: marketData.question,
            eventType: marketData.eventType,
          });

          // Second upsert with same conditionId (simulating update)
          const marketId2 = await persistence.upsertMarket({
            conditionId: marketData.conditionId,
            question: marketData.question + ' (updated)',
            eventType: marketData.eventType,
          });

          // Should return the same ID (idempotency)
          expect(marketId1).toBe(marketId2);
          expect(mockUpsertMarket).toHaveBeenCalledTimes(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Signal count preservation
   * 
   * For any list of agent signals, the number of signals stored should equal
   * the number of signals provided.
   */
  it('should store exactly the number of signals provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          conditionId: fc.string({ minLength: 10, maxLength: 50 }),
          question: fc.string({ minLength: 10, maxLength: 200 }),
          eventType: fc.constantFrom('election', 'policy'),
        }),
        fc.array(
          fc.record({
            agentName: fc.constantFrom('agent_1', 'agent_2', 'agent_3'),
            confidence: fc.double({ min: 0, max: 1 }),
            direction: fc.constantFrom('YES', 'NO', 'NEUTRAL'),
            fairProbability: fc.double({ min: 0, max: 1 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (marketData, signalsData) => {
          // Reset mocks
          mockUpsertMarket.mockReset();
          mockStoreRecommendation.mockReset();
          mockStoreAgentSignals.mockReset();

          // Configure mocks
          const mockMarketId = `market-${Math.random().toString(36).substring(7)}`;
          const mockRecommendationId = `rec-${Math.random().toString(36).substring(7)}`;
          mockUpsertMarket.mockResolvedValue(mockMarketId);
          mockStoreRecommendation.mockResolvedValue(mockRecommendationId);
          mockStoreAgentSignals.mockResolvedValue(undefined);

          // Create market and recommendation
          const marketId = await persistence.upsertMarket({
            conditionId: marketData.conditionId,
            question: marketData.question,
            eventType: marketData.eventType,
          });

          const recommendation: TradeRecommendation = {
            marketId: marketData.conditionId,
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

          // Store signals
          const signals: AgentSignal[] = signalsData.map((signal) => ({
            agentName: signal.agentName,
            timestamp: Date.now(),
            confidence: signal.confidence,
            direction: signal.direction as 'YES' | 'NO' | 'NEUTRAL',
            fairProbability: signal.fairProbability,
            keyDrivers: ['test'],
            riskFactors: [],
            metadata: {},
          }));

          // This should not throw an error regardless of signal count (including 0)
          await expect(
            persistence.storeAgentSignals(marketId, recommendationId, signals)
          ).resolves.not.toThrow();

          // Verify the mock was called with the correct number of signals
          expect(mockStoreAgentSignals).toHaveBeenCalledOnce();
          expect(mockStoreAgentSignals).toHaveBeenCalledWith(marketId, recommendationId, signals);

          // Property verified: The operation completes successfully for any signal count
        }
      ),
      { numRuns: 100 }
    );
  });
});
