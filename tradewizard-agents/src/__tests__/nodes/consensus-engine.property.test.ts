/**
 * Property-Based Tests for Consensus Engine Node
 *
 * Feature: market-intelligence-engine
 * Property 9: Consensus probability structure
 * Validates: Requirements 6.1, 6.3
 *
 * This test verifies that for any completed cross-examination, the system
 * calculates a consensus probability that includes confidence band,
 * disagreement index, and probability regime classification.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { createConsensusEngineNode } from './consensus-engine.js';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type {
  AgentSignal,
  DebateRecord,
  Thesis,
  MarketBriefingDocument,
} from '../models/types.js';

/**
 * Create a minimal valid config for testing
 */
function createTestConfig(): EngineConfig {
  return {
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
      projectName: 'test',
      tags: [],
      trackCosts: true,
    },
    llm: {
      openai: {
        apiKey: 'test-key',
        defaultModel: 'gpt-4-turbo',
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
  };
}

/**
 * Generator for agent signals
 */
const agentSignalArb = fc.record({
  agentName: fc.constantFrom(
    'market_microstructure',
    'probability_baseline',
    'risk_assessment'
  ),
  timestamp: fc.integer({ min: Date.now() - 1000000, max: Date.now() }),
  confidence: fc.float({ min: 0, max: 1 }),
  direction: fc.constantFrom('YES', 'NO', 'NEUTRAL') as fc.Arbitrary<'YES' | 'NO' | 'NEUTRAL'>,
  fairProbability: fc.float({ min: 0, max: 1 }),
  keyDrivers: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
  riskFactors: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
  metadata: fc.constant({}),
});

/**
 * Generator for thesis
 */
const thesisArb = fc.record({
  direction: fc.constantFrom('YES', 'NO') as fc.Arbitrary<'YES' | 'NO'>,
  fairProbability: fc.float({ min: 0, max: 1 }),
  marketProbability: fc.float({ min: 0, max: 1 }),
  edge: fc.float({ min: 0, max: 1 }),
  coreArgument: fc.string({ minLength: 10 }),
  catalysts: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
  failureConditions: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
  supportingSignals: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
});

/**
 * Generator for debate record
 */
const debateRecordArb = fc.record({
  tests: fc.array(
    fc.record({
      testType: fc.constantFrom('evidence', 'causality', 'timing', 'liquidity', 'tail-risk') as fc.Arbitrary<
        'evidence' | 'causality' | 'timing' | 'liquidity' | 'tail-risk'
      >,
      claim: fc.string(),
      challenge: fc.string(),
      outcome: fc.constantFrom('survived', 'weakened', 'refuted') as fc.Arbitrary<
        'survived' | 'weakened' | 'refuted'
      >,
      score: fc.float({ min: -1, max: 1 }),
    }),
    { minLength: 2, maxLength: 10 }
  ),
  bullScore: fc.float({ min: -1, max: 1 }),
  bearScore: fc.float({ min: -1, max: 1 }),
  keyDisagreements: fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
});

/**
 * Generator for market briefing document
 */
const mbdArb = fc.record({
  marketId: fc.string(),
  conditionId: fc.string(),
  eventType: fc.constantFrom('election', 'policy', 'court', 'geopolitical', 'economic', 'other') as fc.Arbitrary<
    'election' | 'policy' | 'court' | 'geopolitical' | 'economic' | 'other'
  >,
  question: fc.string(),
  resolutionCriteria: fc.string(),
  expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
  currentProbability: fc.float({ min: 0, max: 1 }),
  liquidityScore: fc.float({ min: 0, max: 10 }),
  bidAskSpread: fc.float({ min: 0, max: 10 }),
  volatilityRegime: fc.constantFrom('low', 'medium', 'high') as fc.Arbitrary<'low' | 'medium' | 'high'>,
  volume24h: fc.float({ min: 0, max: 1000000 }),
  metadata: fc.record({
    ambiguityFlags: fc.array(fc.string(), { maxLength: 3 }),
    keyCatalysts: fc.array(
      fc.record({
        event: fc.string(),
        timestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
      }),
      { maxLength: 3 }
    ),
  }),
});

describe('Consensus Engine Property Tests', () => {
  // Feature: market-intelligence-engine, Property 9: Consensus probability structure
  // Validates: Requirements 6.1, 6.3
  test('Property 9: For any completed cross-examination, consensus includes all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(
            fc.array(agentSignalArb, { minLength: 2, maxLength: 5 }),
            thesisArb,
            thesisArb,
            debateRecordArb,
            mbdArb
          )
          .filter(([signals]) => {
            // Ensure we have at least 2 signals with valid probabilities
            return signals.length >= 2 && signals.every((s) => s.fairProbability >= 0 && s.fairProbability <= 1);
          }),
        async ([agentSignals, bullThesis, bearThesis, debateRecord, mbd]) => {
          // Ensure bull thesis is YES and bear thesis is NO
          const adjustedBullThesis: Thesis = { ...bullThesis, direction: 'YES' };
          const adjustedBearThesis: Thesis = { ...bearThesis, direction: 'NO' };

          // Create state with completed cross-examination
          const state: GraphStateType = {
            conditionId: 'test-condition',
            mbd,
            ingestionError: null,
            agentSignals,
            agentErrors: [],
            bullThesis: adjustedBullThesis,
            bearThesis: adjustedBearThesis,
            debateRecord,
            consensus: null,
            consensusError: null,
            recommendation: null,
            auditLog: [],
          };

          const config = createTestConfig();
          const consensusNode = createConsensusEngineNode(config);

          // Execute consensus calculation
          const result = await consensusNode(state);

          // If consensus was calculated (not failed due to high disagreement)
          if (result.consensus) {
            const consensus = result.consensus;

            // Verify consensus probability structure
            expect(consensus).toBeDefined();
            expect(typeof consensus.consensusProbability).toBe('number');
            expect(consensus.consensusProbability).toBeGreaterThanOrEqual(0);
            expect(consensus.consensusProbability).toBeLessThanOrEqual(1);

            // Verify confidence band exists and is valid
            expect(consensus.confidenceBand).toBeDefined();
            expect(Array.isArray(consensus.confidenceBand)).toBe(true);
            expect(consensus.confidenceBand.length).toBe(2);
            expect(consensus.confidenceBand[0]).toBeGreaterThanOrEqual(0);
            expect(consensus.confidenceBand[1]).toBeLessThanOrEqual(1);
            expect(consensus.confidenceBand[0]).toBeLessThanOrEqual(consensus.confidenceBand[1]);

            // Verify disagreement index exists and is valid
            expect(typeof consensus.disagreementIndex).toBe('number');
            expect(consensus.disagreementIndex).toBeGreaterThanOrEqual(0);
            expect(consensus.disagreementIndex).toBeLessThanOrEqual(1);

            // Verify probability regime classification exists
            expect(consensus.regime).toBeDefined();
            expect(['high-confidence', 'moderate-confidence', 'high-uncertainty']).toContain(
              consensus.regime
            );

            // Verify contributing signals are listed
            expect(Array.isArray(consensus.contributingSignals)).toBe(true);
            expect(consensus.contributingSignals.length).toBeGreaterThan(0);
          } else if (result.consensusError) {
            // If consensus failed, it should be due to high disagreement (> 0.30)
            expect(result.consensusError.type).toBe('CONSENSUS_FAILED');
            expect(result.consensusError.reason).toContain('disagreement');
          }

          // Verify audit log entry was created
          expect(result.auditLog).toBeDefined();
          expect(result.auditLog!.length).toBeGreaterThan(0);
          expect(result.auditLog![0].stage).toBe('consensus_engine');
        }
      ),
      { numRuns: 100 }
    );
  });
});
