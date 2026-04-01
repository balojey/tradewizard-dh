/**
 * Property-Based Tests for Price Action Agents
 *
 * Feature: advanced-agent-league, Property 13: Price action agent activation condition
 * Validates: Requirements 4.5
 *
 * Property: For any market with insufficient trading history (volume24h below threshold),
 * the system should skip price action agents.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { createMomentumAgentNode, createMeanReversionAgentNode } from './price-action.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument, EventType, VolatilityRegime } from '../models/types.js';

// Mock LLM classes
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.75,
          direction: 'YES',
          fairProbability: 0.65,
          keyDrivers: ['Factor 1', 'Factor 2', 'Factor 3'],
          riskFactors: ['Risk 1'],
          metadata: {
            momentumScore: 0.6,
            breakoutProbability: 0.7,
            orderFlowImbalance: 0.3,
            timingWindow: { optimal: 2, duration: 4 },
            priceTarget: 0.70,
            overextensionScore: 0.8,
            reversionProbability: 0.75,
            reversionTarget: 0.60,
            timingEstimate: 6,
            crowdOverreaction: true,
          },
        }),
      };
    }
  },
}));

// ============================================================================
// Generators
// ============================================================================

/**
 * Generator for EventType
 */
const eventTypeArb = fc.constantFrom<EventType>(
  'election',
  'policy',
  'court',
  'geopolitical',
  'economic',
  'other'
);

/**
 * Generator for VolatilityRegime
 */
const volatilityRegimeArb = fc.constantFrom<VolatilityRegime>('low', 'medium', 'high');

/**
 * Generator for MarketBriefingDocument with configurable volume
 */
const marketBriefingDocumentArb = (volumeArb: fc.Arbitrary<number>) =>
  fc.record({
    marketId: fc.uuid(),
    conditionId: fc.uuid(),
    eventType: eventTypeArb,
    question: fc.string({ minLength: 10, maxLength: 200 }),
    resolutionCriteria: fc.string({ minLength: 10, maxLength: 500 }),
    expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    currentProbability: fc.double({ min: 0, max: 1 }),
    liquidityScore: fc.double({ min: 0, max: 10 }),
    bidAskSpread: fc.double({ min: 0, max: 0.1 }),
    volatilityRegime: volatilityRegimeArb,
    volume24h: volumeArb,
    metadata: fc.record({
      ambiguityFlags: fc.array(fc.string(), { maxLength: 5 }),
      keyCatalysts: fc.array(
        fc.record({
          event: fc.string(),
          timestamp: fc.integer({ min: Date.now(), max: Date.now() + 30 * 24 * 60 * 60 * 1000 }),
        }),
        { maxLength: 3 }
      ),
    }),
  }) as fc.Arbitrary<MarketBriefingDocument>;

/**
 * Generator for GraphStateType with configurable MBD
 */
const graphStateArb = (mbdArb: fc.Arbitrary<MarketBriefingDocument | null>) =>
  fc.record({
    conditionId: fc.uuid(),
    mbd: mbdArb,
    ingestionError: fc.constant(null),
    activeAgents: fc.constant([]),
    externalData: fc.constant(null),
    agentSignals: fc.constant([]),
    agentErrors: fc.constant([]),
    fusedSignal: fc.constant(null),
    bullThesis: fc.constant(null),
    bearThesis: fc.constant(null),
    debateRecord: fc.constant(null),
    consensus: fc.constant(null),
    consensusError: fc.constant(null),
    riskPhilosophySignals: fc.constant(null),
    agentPerformance: fc.constant({}),
    recommendation: fc.constant(null),
    auditLog: fc.constant([]),
  }) as fc.Arbitrary<GraphStateType>;

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 13: Price action agent activation condition', () => {
  const mockLLM = {
    withStructuredOutput: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        confidence: 0.75,
        direction: 'YES',
        fairProbability: 0.65,
        keyDrivers: ['Factor 1', 'Factor 2', 'Factor 3'],
        riskFactors: ['Risk 1'],
        metadata: {
          momentumScore: 0.6,
          breakoutProbability: 0.7,
          orderFlowImbalance: 0.3,
          timingWindow: { optimal: 2, duration: 4 },
          priceTarget: 0.70,
        },
      }),
    }),
  } as any;

  it('should skip momentum agent when volume is below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate markets with volume below 1000 (the threshold)
        graphStateArb(marketBriefingDocumentArb(fc.integer({ min: 0, max: 999 }))),
        async (state) => {
          const momentumAgent = createMomentumAgentNode(mockLLM);
          const result = await momentumAgent(state);

          // Agent should be skipped (no signal generated)
          const wasSkipped =
            result.auditLog &&
            result.auditLog.length > 0 &&
            result.auditLog[0].data.skipped === true;

          // Either skipped or no signals generated
          return wasSkipped || !result.agentSignals || result.agentSignals.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should skip mean reversion agent when volume is below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate markets with volume below 1000 (the threshold)
        graphStateArb(marketBriefingDocumentArb(fc.integer({ min: 0, max: 999 }))),
        async (state) => {
          const meanReversionAgent = createMeanReversionAgentNode(mockLLM);
          const result = await meanReversionAgent(state);

          // Agent should be skipped (no signal generated)
          const wasSkipped =
            result.auditLog &&
            result.auditLog.length > 0 &&
            result.auditLog[0].data.skipped === true;

          // Either skipped or no signals generated
          return wasSkipped || !result.agentSignals || result.agentSignals.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should activate momentum agent when volume is above threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate markets with volume above 1000 (the threshold)
        graphStateArb(marketBriefingDocumentArb(fc.integer({ min: 1000, max: 1000000 }))),
        async (state) => {
          const momentumAgent = createMomentumAgentNode(mockLLM);
          const result = await momentumAgent(state);

          // Agent should generate a signal
          const hasSignal = result.agentSignals && result.agentSignals.length > 0;
          const wasSuccessful =
            result.auditLog &&
            result.auditLog.length > 0 &&
            result.auditLog[0].data.success === true &&
            !result.auditLog[0].data.skipped;

          return hasSignal && wasSuccessful;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should activate mean reversion agent when volume is above threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate markets with volume above 1000 (the threshold)
        graphStateArb(marketBriefingDocumentArb(fc.integer({ min: 1000, max: 1000000 }))),
        async (state) => {
          const meanReversionAgent = createMeanReversionAgentNode(mockLLM);
          const result = await meanReversionAgent(state);

          // Agent should generate a signal
          const hasSignal = result.agentSignals && result.agentSignals.length > 0;
          const wasSuccessful =
            result.auditLog &&
            result.auditLog.length > 0 &&
            result.auditLog[0].data.success === true &&
            !result.auditLog[0].data.skipped;

          return hasSignal && wasSuccessful;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle boundary case at exactly threshold volume', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate markets with volume exactly at 1000 (the threshold)
        graphStateArb(marketBriefingDocumentArb(fc.constant(1000))),
        async (state) => {
          const momentumAgent = createMomentumAgentNode(mockLLM);
          const result = await momentumAgent(state);

          // At exactly threshold, agent should activate (>= threshold)
          const hasSignal = result.agentSignals && result.agentSignals.length > 0;
          const wasSuccessful =
            result.auditLog &&
            result.auditLog.length > 0 &&
            result.auditLog[0].data.success === true &&
            !result.auditLog[0].data.skipped;

          return hasSignal && wasSuccessful;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should skip both agents when MBD is null regardless of volume', async () => {
    await fc.assert(
      fc.asyncProperty(graphStateArb(fc.constant(null)), async (state) => {
        const momentumAgent = createMomentumAgentNode(mockLLM);
        const meanReversionAgent = createMeanReversionAgentNode(mockLLM);

        const momentumResult = await momentumAgent(state);
        const reversionResult = await meanReversionAgent(state);

        // Both should have errors (no MBD)
        const momentumHasError =
          momentumResult.agentErrors && momentumResult.agentErrors.length > 0;
        const reversionHasError =
          reversionResult.agentErrors && reversionResult.agentErrors.length > 0;

        return momentumHasError && reversionHasError;
      }),
      { numRuns: 100 }
    );
  });

  it('should consistently apply volume threshold across all market types', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventTypeArb,
        fc.integer({ min: 0, max: 2000 }),
        async (eventType, volume) => {
          // Create MBD with specific event type and volume
          const mbd: MarketBriefingDocument = {
            marketId: 'test-market',
            conditionId: 'test-condition',
            eventType,
            question: 'Test question?',
            resolutionCriteria: 'Test criteria',
            expiryTimestamp: Date.now() + 86400000,
            currentProbability: 0.5,
            liquidityScore: 5,
            bidAskSpread: 0.02,
            volatilityRegime: 'medium',
            volume24h: volume,
            metadata: {
              ambiguityFlags: [],
              keyCatalysts: [],
            },
          };

          const state: GraphStateType = {
            conditionId: 'test',
            mbd,
            ingestionError: null,
            activeAgents: [],
            externalData: null,
            agentSignals: [],
            agentErrors: [],
            fusedSignal: null,
            bullThesis: null,
            bearThesis: null,
            debateRecord: null,
            consensus: null,
            consensusError: null,
            riskPhilosophySignals: null,
            agentPerformance: {},
            recommendation: null,
            auditLog: [],
          };

          const momentumAgent = createMomentumAgentNode(mockLLM);
          const result = await momentumAgent(state);

          // Check if behavior matches volume threshold
          const shouldSkip = volume < 1000;
          const wasSkipped =
            result.auditLog &&
            result.auditLog.length > 0 &&
            result.auditLog[0].data.skipped === true;
          const hasSignal = result.agentSignals && result.agentSignals.length > 0;

          // Verify consistent behavior
          if (shouldSkip) {
            return wasSkipped || !hasSignal;
          } else {
            return hasSignal && !wasSkipped;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
