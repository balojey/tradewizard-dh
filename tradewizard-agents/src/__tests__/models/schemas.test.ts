/**
 * Property-Based Tests for Data Model Validation
 *
 * These tests verify that data models conform to their schemas across
 * randomly generated inputs using fast-check.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateMBD,
  validateAgentSignal,
  validateThesis,
  validateTradeRecommendation,
  MarketBriefingDocumentSchema,
} from './schemas.js';
import type {
  MarketBriefingDocument,
  AgentSignal,
  Thesis,
  TradeRecommendation,
  EventType,
  VolatilityRegime,
  SignalDirection,
  TradeAction,
  LiquidityRisk,
  ProbabilityRegime,
} from './types.js';

// ============================================================================
// Generators for Property-Based Testing
// ============================================================================

/**
 * Generator for valid EventType
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
 * Generator for valid VolatilityRegime
 */
const volatilityRegimeArb = fc.constantFrom<VolatilityRegime>('low', 'medium', 'high');

/**
 * Generator for valid SignalDirection
 */
const signalDirectionArb = fc.constantFrom<SignalDirection>('YES', 'NO', 'NEUTRAL');

/**
 * Generator for valid TradeAction
 */
const tradeActionArb = fc.constantFrom<TradeAction>('LONG_YES', 'LONG_NO', 'NO_TRADE');

/**
 * Generator for valid LiquidityRisk
 */
const liquidityRiskArb = fc.constantFrom<LiquidityRisk>('low', 'medium', 'high');

/**
 * Generator for valid ProbabilityRegime
 */
const probabilityRegimeArb = fc.constantFrom<ProbabilityRegime>(
  'high-confidence',
  'moderate-confidence',
  'high-uncertainty'
);

/**
 * Generator for valid Catalyst
 */
const catalystArb = fc.record({
  event: fc.string({ minLength: 1 }),
  timestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }), // Up to 1 year in future
});

/**
 * Generator for valid MarketBriefingDocument
 */
const mbdArb = fc.record({
  marketId: fc.string({ minLength: 1 }),
  conditionId: fc.string({ minLength: 1 }),
  eventType: eventTypeArb,
  question: fc.string({ minLength: 10 }),
  resolutionCriteria: fc.string({ minLength: 10 }),
  expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }), // Up to 1 year in future
  currentProbability: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  liquidityScore: fc.float({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
  bidAskSpread: fc.float({ min: 0, max: Math.fround(100), noNaN: true, noDefaultInfinity: true }), // Cap at 100 cents
  volatilityRegime: volatilityRegimeArb,
  volume24h: fc.float({ min: 0, max: Math.fround(1e9), noNaN: true, noDefaultInfinity: true }), // Cap at reasonable volume
  metadata: fc.record({
    ambiguityFlags: fc.array(fc.string()),
    keyCatalysts: fc.array(catalystArb),
  }),
});

/**
 * Generator for valid AgentSignal
 */
const agentSignalArb = fc.record({
  agentName: fc.string({ minLength: 1 }),
  timestamp: fc.integer({ min: 0 }),
  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  direction: signalDirectionArb,
  fairProbability: fc.float({ min: 0, max: 1, noNaN: true }),
  keyDrivers: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
  riskFactors: fc.array(fc.string()),
  metadata: fc.dictionary(fc.string(), fc.anything()),
});

/**
 * Generator for valid Thesis
 */
const thesisArb = fc.record({
  direction: fc.constantFrom<'YES' | 'NO'>('YES', 'NO'),
  fairProbability: fc.float({ min: 0, max: 1, noNaN: true }),
  marketProbability: fc.float({ min: 0, max: 1, noNaN: true }),
  edge: fc.float({ min: 0, max: 1, noNaN: true }),
  coreArgument: fc.string({ minLength: 10 }),
  catalysts: fc.array(fc.string()),
  failureConditions: fc.array(fc.string()),
  supportingSignals: fc.array(fc.string()),
});

/**
 * Generator for valid TradeRecommendation
 */
const tradeRecommendationArb = fc.record({
  marketId: fc.string({ minLength: 1 }),
  action: tradeActionArb,
  entryZone: fc.tuple(
    fc.float({ min: 0, max: Math.fround(100), noNaN: true, noDefaultInfinity: true }),
    fc.float({ min: 0, max: Math.fround(100), noNaN: true, noDefaultInfinity: true })
  ),
  targetZone: fc.tuple(
    fc.float({ min: 0, max: Math.fround(100), noNaN: true, noDefaultInfinity: true }),
    fc.float({ min: 0, max: Math.fround(100), noNaN: true, noDefaultInfinity: true })
  ),
  expectedValue: fc.float({ min: Math.fround(-100), max: Math.fround(100), noNaN: true, noDefaultInfinity: true }),
  winProbability: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  liquidityRisk: liquidityRiskArb,
  explanation: fc.record({
    summary: fc.string({ minLength: 20 }), // Schema checks actual length, not trimmed
    coreThesis: fc.string({ minLength: 10 }), // Schema checks actual length, not trimmed
    keyCatalysts: fc.array(fc.string()),
    failureScenarios: fc.array(fc.string()),
    uncertaintyNote: fc.option(fc.string(), { nil: undefined }), // Use undefined instead of null
  }),
  metadata: fc.record({
    consensusProbability: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    marketProbability: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    edge: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    confidenceBand: fc.tuple(
      fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
    ),
  }),
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Data Model Validation - Property Tests', () => {
  // Feature: market-intelligence-engine, Property 2: Market Briefing Document validity
  // Validates: Requirements 2.1, 2.3, 2.4
  test('Property 2: Market Briefing Document validity', () => {
    fc.assert(
      fc.property(mbdArb, (mbd: MarketBriefingDocument) => {
        const result = validateMBD(mbd);
        
        // The MBD should pass validation
        expect(result.isValid).toBe(true);
        
        // All required fields should be present
        expect(mbd.marketId).toBeDefined();
        expect(mbd.conditionId).toBeDefined();
        expect(mbd.eventType).toBeDefined();
        expect(mbd.question).toBeDefined();
        expect(mbd.resolutionCriteria).toBeDefined();
        expect(mbd.expiryTimestamp).toBeDefined();
        expect(mbd.currentProbability).toBeDefined();
        expect(mbd.liquidityScore).toBeDefined();
        expect(mbd.bidAskSpread).toBeDefined();
        expect(mbd.volatilityRegime).toBeDefined();
        expect(mbd.volume24h).toBeDefined();
        expect(mbd.metadata).toBeDefined();
        expect(mbd.metadata.ambiguityFlags).toBeDefined();
        expect(mbd.metadata.keyCatalysts).toBeDefined();
        
        // Fields should be properly typed
        expect(typeof mbd.marketId).toBe('string');
        expect(typeof mbd.conditionId).toBe('string');
        expect(typeof mbd.question).toBe('string');
        expect(typeof mbd.resolutionCriteria).toBe('string');
        expect(typeof mbd.expiryTimestamp).toBe('number');
        expect(typeof mbd.currentProbability).toBe('number');
        expect(typeof mbd.liquidityScore).toBe('number');
        expect(typeof mbd.bidAskSpread).toBe('number');
        expect(typeof mbd.volume24h).toBe('number');
        expect(Array.isArray(mbd.metadata.ambiguityFlags)).toBe(true);
        expect(Array.isArray(mbd.metadata.keyCatalysts)).toBe(true);
        
        // Probability should be in valid range [0, 1]
        expect(mbd.currentProbability).toBeGreaterThanOrEqual(0);
        expect(mbd.currentProbability).toBeLessThanOrEqual(1);
        
        // Liquidity score should be in valid range [0, 10]
        expect(mbd.liquidityScore).toBeGreaterThanOrEqual(0);
        expect(mbd.liquidityScore).toBeLessThanOrEqual(10);
        
        // Bid-ask spread should be non-negative
        expect(mbd.bidAskSpread).toBeGreaterThanOrEqual(0);
        
        // Volume should be non-negative
        expect(mbd.volume24h).toBeGreaterThanOrEqual(0);
        
        // Expiry timestamp should be positive
        expect(mbd.expiryTimestamp).toBeGreaterThan(0);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('Property: Agent Signal structure validity', () => {
    fc.assert(
      fc.property(agentSignalArb, (signal: AgentSignal) => {
        const result = validateAgentSignal(signal);
        
        // The signal should pass validation
        expect(result.isValid).toBe(true);
        
        // All required fields should be present
        expect(signal.agentName).toBeDefined();
        expect(signal.timestamp).toBeDefined();
        expect(signal.confidence).toBeDefined();
        expect(signal.direction).toBeDefined();
        expect(signal.fairProbability).toBeDefined();
        expect(signal.keyDrivers).toBeDefined();
        expect(signal.riskFactors).toBeDefined();
        
        // Confidence should be in valid range [0, 1]
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        
        // Fair probability should be in valid range [0, 1]
        expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
        expect(signal.fairProbability).toBeLessThanOrEqual(1);
        
        // Key drivers should have 1-5 items
        expect(signal.keyDrivers.length).toBeGreaterThanOrEqual(1);
        expect(signal.keyDrivers.length).toBeLessThanOrEqual(5);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('Property: Thesis structure validity', () => {
    fc.assert(
      fc.property(thesisArb, (thesis: Thesis) => {
        const result = validateThesis(thesis);
        
        // The thesis should pass validation
        expect(result.isValid).toBe(true);
        
        // All required fields should be present
        expect(thesis.direction).toBeDefined();
        expect(thesis.fairProbability).toBeDefined();
        expect(thesis.marketProbability).toBeDefined();
        expect(thesis.edge).toBeDefined();
        expect(thesis.coreArgument).toBeDefined();
        expect(thesis.catalysts).toBeDefined();
        expect(thesis.failureConditions).toBeDefined();
        expect(thesis.supportingSignals).toBeDefined();
        
        // Probabilities should be in valid range [0, 1]
        expect(thesis.fairProbability).toBeGreaterThanOrEqual(0);
        expect(thesis.fairProbability).toBeLessThanOrEqual(1);
        expect(thesis.marketProbability).toBeGreaterThanOrEqual(0);
        expect(thesis.marketProbability).toBeLessThanOrEqual(1);
        
        // Edge should be in valid range [0, 1]
        expect(thesis.edge).toBeGreaterThanOrEqual(0);
        expect(thesis.edge).toBeLessThanOrEqual(1);
        
        // Core argument should have minimum length
        expect(thesis.coreArgument.length).toBeGreaterThanOrEqual(10);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('Property: Trade Recommendation structure validity', () => {
    fc.assert(
      fc.property(tradeRecommendationArb, (recommendation: TradeRecommendation) => {
        const result = validateTradeRecommendation(recommendation);
        
        // The recommendation should pass validation
        expect(result.isValid).toBe(true);
        
        // All required fields should be present
        expect(recommendation.marketId).toBeDefined();
        expect(recommendation.action).toBeDefined();
        expect(recommendation.entryZone).toBeDefined();
        expect(recommendation.targetZone).toBeDefined();
        expect(recommendation.expectedValue).toBeDefined();
        expect(recommendation.winProbability).toBeDefined();
        expect(recommendation.liquidityRisk).toBeDefined();
        expect(recommendation.explanation).toBeDefined();
        expect(recommendation.metadata).toBeDefined();
        
        // Win probability should be in valid range [0, 1]
        expect(recommendation.winProbability).toBeGreaterThanOrEqual(0);
        expect(recommendation.winProbability).toBeLessThanOrEqual(1);
        
        // Explanation should have required fields
        expect(recommendation.explanation.summary.length).toBeGreaterThanOrEqual(20);
        expect(recommendation.explanation.coreThesis.length).toBeGreaterThanOrEqual(10);
        
        // Metadata probabilities should be in valid range [0, 1]
        expect(recommendation.metadata.consensusProbability).toBeGreaterThanOrEqual(0);
        expect(recommendation.metadata.consensusProbability).toBeLessThanOrEqual(1);
        expect(recommendation.metadata.marketProbability).toBeGreaterThanOrEqual(0);
        expect(recommendation.metadata.marketProbability).toBeLessThanOrEqual(1);
        expect(recommendation.metadata.edge).toBeGreaterThanOrEqual(0);
        expect(recommendation.metadata.edge).toBeLessThanOrEqual(1);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('Property: Invalid MBD should fail validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          marketId: fc.string(),
          // Missing required fields
        }),
        (invalidMbd) => {
          const result = validateMBD(invalidMbd);
          
          // Invalid MBD should fail validation
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property: MBD with invalid probability should fail validation', () => {
    fc.assert(
      fc.property(
        mbdArb,
        fc.oneof(
          fc.constant(-0.1),
          fc.constant(1.1),
          fc.constant(NaN),
          fc.constant(Infinity)
        ),
        (mbd, invalidProbability) => {
          const invalidMbd = { ...mbd, currentProbability: invalidProbability };
          const result = validateMBD(invalidMbd);
          
          // MBD with invalid probability should fail validation
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property: MBD with invalid liquidity score should fail validation', () => {
    fc.assert(
      fc.property(
        mbdArb,
        fc.oneof(
          fc.constant(-1),
          fc.constant(11),
          fc.constant(NaN)
        ),
        (mbd, invalidLiquidity) => {
          const invalidMbd = { ...mbd, liquidityScore: invalidLiquidity };
          const result = validateMBD(invalidMbd);
          
          // MBD with invalid liquidity should fail validation
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
