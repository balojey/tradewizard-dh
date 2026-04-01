/**
 * Property-based tests for cross-examination node
 *
 * These tests verify universal properties that should hold across all inputs.
 *
 * Feature: market-intelligence-engine
 * Properties: 6, 7, 8
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { createCrossExaminationNode } from './cross-examination.js';
import type { GraphStateType } from '../models/state.js';
import type { Thesis, MarketBriefingDocument } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// Mock LangChain modules to avoid real API calls
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function() {
    return {
      invoke: vi.fn().mockResolvedValue({
        content: 'The claim is well-supported by evidence and survived scrutiny. The factual basis is strong.',
      }),
    };
  }),
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation(function() {
    return {
      invoke: vi.fn().mockResolvedValue({
        content: 'The claim is well-supported by evidence and survived scrutiny. The factual basis is strong.',
      }),
    };
  }),
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(function() {
    return {
      invoke: vi.fn().mockResolvedValue({
        content: 'The claim is well-supported by evidence and survived scrutiny. The factual basis is strong.',
      }),
    };
  }),
}));

// Mock configuration for testing
const mockConfig: EngineConfig = {
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
    tags: [],
    trackCosts: true,
  },
  llm: {
    singleProvider: 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
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

// ============================================================================
// Generators
// ============================================================================

/**
 * Generator for valid probabilities (0-1)
 */
const probabilityArb = fc.double({ min: 0, max: 1, noNaN: true });

/**
 * Generator for thesis direction
 */
const thesisDirectionArb = fc.constantFrom('YES' as const, 'NO' as const);

/**
 * Generator for valid thesis
 * Ensures minimum realistic content for LLM processing
 */
const thesisArb = fc.record({
  direction: thesisDirectionArb,
  fairProbability: probabilityArb,
  marketProbability: probabilityArb,
  edge: fc.double({ min: 0, max: 1, noNaN: true }),
  coreArgument: fc.string({ minLength: 20, maxLength: 200 }).filter(s => s.trim().length >= 20), // Ensure non-whitespace content
  catalysts: fc.array(fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length >= 10), { minLength: 1, maxLength: 5 }), // At least 1 catalyst
  failureConditions: fc.array(fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length >= 10), { minLength: 1, maxLength: 5 }), // At least 1 failure condition
  supportingSignals: fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
}) as fc.Arbitrary<Thesis>;

/**
 * Generator for thesis pair with opposite directions
 * Bull thesis is always YES, bear thesis is always NO
 */
const thesisPairArb = fc.tuple(thesisArb, thesisArb).map(([bull, bear]) => ({
  bullThesis: { ...bull, direction: 'YES' as const },
  bearThesis: { ...bear, direction: 'NO' as const },
}));

/**
 * Generator for Market Briefing Document
 */
const mbdArb = fc.record({
  marketId: fc.string({ minLength: 5, maxLength: 20 }),
  conditionId: fc.string({ minLength: 5, maxLength: 20 }),
  eventType: fc.constantFrom('election', 'policy', 'court', 'geopolitical', 'economic', 'other'),
  question: fc.string({ minLength: 10, maxLength: 100 }),
  resolutionCriteria: fc.string({ minLength: 10, maxLength: 200 }),
  expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
  currentProbability: probabilityArb,
  liquidityScore: fc.double({ min: 0, max: 10, noNaN: true }),
  bidAskSpread: fc.double({ min: 0, max: 10, noNaN: true }),
  volatilityRegime: fc.constantFrom('low', 'medium', 'high'),
  volume24h: fc.double({ min: 0, max: 1000000, noNaN: true }),
  metadata: fc.record({
    ambiguityFlags: fc.array(fc.string({ minLength: 5, maxLength: 30 }), { maxLength: 3 }),
    keyCatalysts: fc.array(
      fc.record({
        event: fc.string({ minLength: 5, maxLength: 50 }),
        timestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
      }),
      { maxLength: 5 }
    ),
  }),
}) as fc.Arbitrary<MarketBriefingDocument>;

// ============================================================================
// Property Tests
// ============================================================================

describe('Cross-Examination Node - Property Tests', () => {
  let crossExaminationNode: ReturnType<typeof createCrossExaminationNode>;

  beforeEach(() => {
    crossExaminationNode = createCrossExaminationNode(mockConfig);
  });

  /**
   * Feature: market-intelligence-engine, Property 6: Cross-examination execution
   * Validates: Requirements 5.1, 5.4
   *
   * For any pair of complete bull and bear theses, the system should execute
   * the cross-examination protocol and produce a scored debate record showing
   * which arguments survived scrutiny.
   */
  it(
    'Property 6: Cross-examination execution - for any thesis pair, produces scored debate record',
    { timeout: 30000 }, // 30 seconds timeout
    async () => {
      await fc.assert(
        fc.asyncProperty(
          thesisPairArb,
          mbdArb,
          async ({ bullThesis, bearThesis }, mbd) => {
            const state: Partial<GraphStateType> = {
              conditionId: mbd.conditionId,
              mbd,
              bullThesis,
              bearThesis,
              agentSignals: [],
              agentErrors: [],
              auditLog: [],
            };

            const result = await crossExaminationNode(state as GraphStateType);

            // Property: Should produce a debate record (no errors with mocked LLM)
            expect(result.debateRecord).toBeDefined();

            if (result.debateRecord) {
              // Property: Debate record should have tests
              expect(result.debateRecord.tests).toBeDefined();
              expect(Array.isArray(result.debateRecord.tests)).toBe(true);
              expect(result.debateRecord.tests.length).toBeGreaterThan(0);

              // Property: Debate record should have scores
              expect(result.debateRecord.bullScore).toBeDefined();
              expect(result.debateRecord.bearScore).toBeDefined();
              expect(typeof result.debateRecord.bullScore).toBe('number');
              expect(typeof result.debateRecord.bearScore).toBe('number');

              // Property: Scores should be in valid range (-1 to 1)
              expect(result.debateRecord.bullScore).toBeGreaterThanOrEqual(-1);
              expect(result.debateRecord.bullScore).toBeLessThanOrEqual(1);
              expect(result.debateRecord.bearScore).toBeGreaterThanOrEqual(-1);
              expect(result.debateRecord.bearScore).toBeLessThanOrEqual(1);

              // Property: Should have key disagreements array
              expect(result.debateRecord.keyDisagreements).toBeDefined();
              expect(Array.isArray(result.debateRecord.keyDisagreements)).toBe(true);

              // Property: Each test should have valid structure
              result.debateRecord.tests.forEach((test) => {
                expect(test.testType).toBeDefined();
                expect(['evidence', 'causality', 'timing', 'liquidity', 'tail-risk']).toContain(
                  test.testType
                );
                expect(test.claim).toBeDefined();
                expect(typeof test.claim).toBe('string');
                expect(test.challenge).toBeDefined();
                expect(typeof test.challenge).toBe('string');
                expect(test.outcome).toBeDefined();
                expect(['survived', 'weakened', 'refuted']).toContain(test.outcome);
                expect(test.score).toBeDefined();
                expect(typeof test.score).toBe('number');
                expect(test.score).toBeGreaterThanOrEqual(-1);
                expect(test.score).toBeLessThanOrEqual(1);
              });
            }
          }
        ),
        { numRuns: 5 } // Reduced runs since we're using mocked LLM
      );
    }
  );

  /**
   * Feature: market-intelligence-engine, Property 7: Factual claim verification
   * Validates: Requirements 5.2
   *
   * For any factual claim made in a thesis, the opposing agent should verify
   * the claim against available data during cross-examination.
   */
  it(
    'Property 7: Factual claim verification - for any thesis with claims, evidence test is executed',
    { timeout: 30000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          thesisPairArb,
          mbdArb,
          async ({ bullThesis, bearThesis }, mbd) => {
            const state: Partial<GraphStateType> = {
              conditionId: mbd.conditionId,
              mbd,
              bullThesis,
              bearThesis,
              agentSignals: [],
              agentErrors: [],
              auditLog: [],
            };

            const result = await crossExaminationNode(state as GraphStateType);

            // Property: Should execute evidence tests
            if (result.debateRecord) {
              const evidenceTests = result.debateRecord.tests.filter(
                (test) => test.testType === 'evidence'
              );

              // Property: At least one evidence test should be executed
              expect(evidenceTests.length).toBeGreaterThan(0);

              // Property: Evidence tests should verify factual claims
              evidenceTests.forEach((test) => {
                expect(test.claim).toBeDefined();
                expect(test.claim.length).toBeGreaterThan(0);
                expect(test.challenge).toBeDefined();
                expect(test.challenge.length).toBeGreaterThan(0);
                expect(test.outcome).toBeDefined();
                expect(['survived', 'weakened', 'refuted']).toContain(test.outcome);
              });
            }
          }
        ),
        { numRuns: 5 }
      );
    }
  );

  /**
   * Feature: market-intelligence-engine, Property 8: Causality testing
   * Validates: Requirements 5.3
   *
   * For any causal claim in a thesis, the opposing agent should test whether
   * the claimed correlation implies causation.
   */
  it(
    'Property 8: Causality testing - for any thesis with causal claims, causality test is executed',
    { timeout: 30000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          thesisPairArb,
          mbdArb,
          async ({ bullThesis, bearThesis }, mbd) => {
            const state: Partial<GraphStateType> = {
              conditionId: mbd.conditionId,
              mbd,
              bullThesis,
              bearThesis,
              agentSignals: [],
              agentErrors: [],
              auditLog: [],
            };

            const result = await crossExaminationNode(state as GraphStateType);

            // Property: Should execute causality tests
            if (result.debateRecord) {
              const causalityTests = result.debateRecord.tests.filter(
                (test) => test.testType === 'causality'
              );

              // Property: At least one causality test should be executed
              expect(causalityTests.length).toBeGreaterThan(0);

              // Property: Causality tests should test correlation vs causation
              causalityTests.forEach((test) => {
                expect(test.claim).toBeDefined();
                expect(test.claim.length).toBeGreaterThan(0);
                expect(test.challenge).toBeDefined();
                expect(test.challenge.length).toBeGreaterThan(0);
                expect(test.outcome).toBeDefined();
                expect(['survived', 'weakened', 'refuted']).toContain(test.outcome);
              });
            }
          }
        ),
        { numRuns: 5 }
      );
    }
  );
});
