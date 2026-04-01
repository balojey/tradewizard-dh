/**
 * Property-based tests for intelligence agent nodes
 *
 * Feature: market-intelligence-engine, Property 4: Agent signal structure validity
 * Validates: Requirements 3.2, 3.4
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { createAgentNode } from './agents.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument, AgentSignal } from '../models/types.js';

// Mock LLM classes for property tests
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async () => {
          // Return a valid agent signal structure
          return {
            confidence: Math.random(),
            direction: ['YES', 'NO', 'NEUTRAL'][Math.floor(Math.random() * 3)],
            fairProbability: Math.random(),
            keyDrivers: ['Driver 1', 'Driver 2', 'Driver 3'],
            riskFactors: ['Risk 1', 'Risk 2'],
            metadata: {},
          };
        }),
      };
    }
  },
}));

describe('Agent Signal Structure Property Tests', () => {
  // Generator for Market Briefing Documents
  const mbdArbitrary = fc.record({
    marketId: fc.string({ minLength: 1 }),
    conditionId: fc.string({ minLength: 1 }),
    eventType: fc.constantFrom('election', 'policy', 'court', 'geopolitical', 'economic', 'other'),
    question: fc.string({ minLength: 10 }),
    resolutionCriteria: fc.string({ minLength: 10 }),
    expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    currentProbability: fc.float({ min: 0, max: 1 }),
    liquidityScore: fc.float({ min: 0, max: 10 }),
    bidAskSpread: fc.float({ min: 0, max: 100 }),
    volatilityRegime: fc.constantFrom('low', 'medium', 'high'),
    volume24h: fc.float({ min: 0 }),
    metadata: fc.record({
      ambiguityFlags: fc.array(fc.string()),
      keyCatalysts: fc.array(
        fc.record({
          event: fc.string(),
          timestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        })
      ),
    }),
  });

  // Generator for agent names
  const agentNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });

  // Generator for system prompts
  const systemPromptArbitrary = fc.string({ minLength: 10, maxLength: 500 });

  // Feature: market-intelligence-engine, Property 4: Agent signal structure validity
  // Validates: Requirements 3.2, 3.4
  it('Property 4: For any agent execution with valid MBD, the resulting signal should contain all required fields with valid types', async () => {
    await fc.assert(
      fc.asyncProperty(
        mbdArbitrary,
        agentNameArbitrary,
        systemPromptArbitrary,
        async (mbd, agentName, systemPrompt) => {
          // Create a mock LLM
          const mockLLM = {
            withStructuredOutput: vi.fn().mockReturnValue({
              invoke: vi.fn().mockResolvedValue({
                confidence: Math.random(),
                direction: ['YES', 'NO', 'NEUTRAL'][Math.floor(Math.random() * 3)],
                fairProbability: Math.random(),
                keyDrivers: ['Driver 1', 'Driver 2', 'Driver 3'],
                riskFactors: ['Risk 1', 'Risk 2'],
                metadata: {},
              }),
            }),
          } as any;

          // Create agent node
          const agentNode = createAgentNode(agentName, mockLLM, systemPrompt);

          // Create state with MBD
          const state: GraphStateType = {
            conditionId: mbd.conditionId,
            mbd: mbd as MarketBriefingDocument,
            ingestionError: null,
            agentSignals: [],
            agentErrors: [],
            bullThesis: null,
            bearThesis: null,
            debateRecord: null,
            consensus: null,
            consensusError: null,
            recommendation: null,
            auditLog: [],
          };

          // Execute agent node
          const result = await agentNode(state);

          // Verify signal structure
          expect(result.agentSignals).toBeDefined();
          expect(result.agentSignals).toHaveLength(1);

          const signal = result.agentSignals![0];

          // Property: Each signal should contain all required fields
          expect(signal.agentName).toBeDefined();
          expect(typeof signal.agentName).toBe('string');
          expect(signal.agentName).toBe(agentName);

          expect(signal.timestamp).toBeDefined();
          expect(typeof signal.timestamp).toBe('number');
          expect(signal.timestamp).toBeGreaterThan(0);

          expect(signal.confidence).toBeDefined();
          expect(typeof signal.confidence).toBe('number');
          expect(signal.confidence).toBeGreaterThanOrEqual(0);
          expect(signal.confidence).toBeLessThanOrEqual(1);

          expect(signal.direction).toBeDefined();
          expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);

          expect(signal.fairProbability).toBeDefined();
          expect(typeof signal.fairProbability).toBe('number');
          expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
          expect(signal.fairProbability).toBeLessThanOrEqual(1);

          expect(signal.keyDrivers).toBeDefined();
          expect(Array.isArray(signal.keyDrivers)).toBe(true);
          expect(signal.keyDrivers.length).toBeGreaterThan(0);
          signal.keyDrivers.forEach((driver) => {
            expect(typeof driver).toBe('string');
          });

          expect(signal.riskFactors).toBeDefined();
          expect(Array.isArray(signal.riskFactors)).toBe(true);
          signal.riskFactors.forEach((risk) => {
            expect(typeof risk).toBe('string');
          });

          expect(signal.metadata).toBeDefined();
          expect(typeof signal.metadata).toBe('object');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Additional property: Agent signals should be consistent across multiple executions with same input
  it('Property: Agent signal structure should be consistent across multiple executions', async () => {
    await fc.assert(
      fc.asyncProperty(mbdArbitrary, async (mbd) => {
        const mockLLM = {
          withStructuredOutput: vi.fn().mockReturnValue({
            invoke: vi.fn().mockResolvedValue({
              confidence: 0.75,
              direction: 'YES',
              fairProbability: 0.65,
              keyDrivers: ['Driver 1', 'Driver 2'],
              riskFactors: ['Risk 1'],
              metadata: {},
            }),
          }),
        } as any;

        const agentNode = createAgentNode('test_agent', mockLLM, 'Test prompt');

        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          agentSignals: [],
          agentErrors: [],
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: null,
          consensusError: null,
          recommendation: null,
          auditLog: [],
        };

        // Execute multiple times
        const result1 = await agentNode(state);
        const result2 = await agentNode(state);

        // Both should produce valid signals
        expect(result1.agentSignals).toHaveLength(1);
        expect(result2.agentSignals).toHaveLength(1);

        // Structure should be consistent
        const signal1 = result1.agentSignals![0];
        const signal2 = result2.agentSignals![0];

        expect(typeof signal1.confidence).toBe(typeof signal2.confidence);
        expect(typeof signal1.direction).toBe(typeof signal2.direction);
        expect(typeof signal1.fairProbability).toBe(typeof signal2.fairProbability);
        expect(Array.isArray(signal1.keyDrivers)).toBe(Array.isArray(signal2.keyDrivers));
        expect(Array.isArray(signal1.riskFactors)).toBe(Array.isArray(signal2.riskFactors));

        return true;
      }),
      { numRuns: 50 }
    );
  });

  // Property: Agent signals should handle edge case MBDs
  it('Property: Agent signals should be valid for edge case market data', async () => {
    // Edge case generators
    const edgeCaseMBD = fc.oneof(
      // Minimum probability
      fc.record({
        ...mbdArbitrary.value,
        currentProbability: fc.constant(0),
      }),
      // Maximum probability
      fc.record({
        ...mbdArbitrary.value,
        currentProbability: fc.constant(1),
      }),
      // Minimum liquidity
      fc.record({
        ...mbdArbitrary.value,
        liquidityScore: fc.constant(0),
      }),
      // Maximum liquidity
      fc.record({
        ...mbdArbitrary.value,
        liquidityScore: fc.constant(10),
      }),
      // Empty catalysts
      fc.record({
        ...mbdArbitrary.value,
        metadata: fc.record({
          ambiguityFlags: fc.constant([]),
          keyCatalysts: fc.constant([]),
        }),
      })
    );

    await fc.assert(
      fc.asyncProperty(edgeCaseMBD, async (mbd) => {
        const mockLLM = {
          withStructuredOutput: vi.fn().mockReturnValue({
            invoke: vi.fn().mockResolvedValue({
              confidence: 0.5,
              direction: 'NEUTRAL',
              fairProbability: 0.5,
              keyDrivers: ['Edge case analysis'],
              riskFactors: ['High uncertainty'],
              metadata: {},
            }),
          }),
        } as any;

        const agentNode = createAgentNode('edge_case_agent', mockLLM, 'Test prompt');

        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          agentSignals: [],
          agentErrors: [],
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: null,
          consensusError: null,
          recommendation: null,
          auditLog: [],
        };

        const result = await agentNode(state);

        // Should still produce valid signal
        expect(result.agentSignals).toBeDefined();
        expect(result.agentSignals).toHaveLength(1);

        const signal = result.agentSignals![0];
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
