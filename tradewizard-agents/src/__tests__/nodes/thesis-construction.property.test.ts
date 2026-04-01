/**
 * Property-based tests for thesis construction node
 *
 * Feature: market-intelligence-engine, Property 5: Thesis generation completeness
 * Validates: Requirements 4.1, 4.2, 4.3
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { createThesisConstructionNode } from './thesis-construction.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument, AgentSignal, Thesis } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// Mock LLM classes for property tests
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async (messages: any[]) => {
          // Determine if this is bull or bear thesis based on system prompt
          const systemPrompt = messages[0]?.content || '';
          const isBull = systemPrompt.includes('bull') || systemPrompt.includes('YES');
          
          return {
            direction: isBull ? 'YES' : 'NO',
            fairProbability: isBull ? 0.6 + Math.random() * 0.2 : 0.3 + Math.random() * 0.2,
            marketProbability: 0.5,
            edge: Math.abs(0.6 - 0.5),
            coreArgument: `This is a ${isBull ? 'bull' : 'bear'} thesis based on agent analysis`,
            catalysts: ['Catalyst 1', 'Catalyst 2'],
            failureConditions: ['Failure 1', 'Failure 2'],
            supportingSignals: ['agent1', 'agent2'],
          };
        }),
      };
    }
  },
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class MockChatAnthropic {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async (messages: any[]) => {
          const systemPrompt = messages[0]?.content || '';
          const isBull = systemPrompt.includes('bull') || systemPrompt.includes('YES');
          
          return {
            direction: isBull ? 'YES' : 'NO',
            fairProbability: isBull ? 0.6 + Math.random() * 0.2 : 0.3 + Math.random() * 0.2,
            marketProbability: 0.5,
            edge: Math.abs(0.6 - 0.5),
            coreArgument: `This is a ${isBull ? 'bull' : 'bear'} thesis based on agent analysis`,
            catalysts: ['Catalyst 1', 'Catalyst 2'],
            failureConditions: ['Failure 1', 'Failure 2'],
            supportingSignals: ['agent1', 'agent2'],
          };
        }),
      };
    }
  },
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class MockChatGoogleGenerativeAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockImplementation(async (messages: any[]) => {
          const systemPrompt = messages[0]?.content || '';
          const isBull = systemPrompt.includes('bull') || systemPrompt.includes('YES');
          
          return {
            direction: isBull ? 'YES' : 'NO',
            fairProbability: isBull ? 0.6 + Math.random() * 0.2 : 0.3 + Math.random() * 0.2,
            marketProbability: 0.5,
            edge: Math.abs(0.6 - 0.5),
            coreArgument: `This is a ${isBull ? 'bull' : 'bear'} thesis based on agent analysis`,
            catalysts: ['Catalyst 1', 'Catalyst 2'],
            failureConditions: ['Failure 1', 'Failure 2'],
            supportingSignals: ['agent1', 'agent2'],
          };
        }),
      };
    }
  },
}));

describe('Thesis Generation Property Tests', () => {
  // Generator for Market Briefing Documents
  const mbdArbitrary = fc.record({
    marketId: fc.string({ minLength: 1 }),
    conditionId: fc.string({ minLength: 1 }),
    eventType: fc.constantFrom('election', 'policy', 'court', 'geopolitical', 'economic', 'other'),
    question: fc.string({ minLength: 10 }),
    resolutionCriteria: fc.string({ minLength: 10 }),
    expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    currentProbability: fc.float({ min: 0, max: 1, noNaN: true }), // Explicitly exclude NaN
    liquidityScore: fc.float({ min: 0, max: 10, noNaN: true }),
    bidAskSpread: fc.float({ min: 0, max: 100, noNaN: true }),
    volatilityRegime: fc.constantFrom('low', 'medium', 'high'),
    volume24h: fc.float({ min: 0, noNaN: true }),
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

  // Generator for Agent Signals
  const agentSignalArbitrary = fc.record({
    agentName: fc.string({ minLength: 1 }),
    timestamp: fc.integer({ min: Date.now() - 1000, max: Date.now() }),
    confidence: fc.float({ min: Math.fround(0.01), max: 1, noNaN: true }), // Exclude 0 to avoid division by zero, exclude NaN
    direction: fc.constantFrom('YES', 'NO', 'NEUTRAL'),
    fairProbability: fc.float({ min: 0, max: 1, noNaN: true }), // Explicitly exclude NaN
    keyDrivers: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
    riskFactors: fc.array(fc.string({ minLength: 1 })),
    metadata: fc.record({}),
  });

  // Generator for array of agent signals (minimum 2 for thesis construction)
  const agentSignalsArbitrary = fc.array(agentSignalArbitrary, { minLength: 2, maxLength: 5 });

  // Mock config generator
  const configArbitrary = fc.record({
    polymarket: fc.record({
      gammaApiUrl: fc.constant('https://gamma-api.polymarket.com'),
      clobApiUrl: fc.constant('https://clob.polymarket.com'),
      rateLimitBuffer: fc.constant(80),
    }),
    langgraph: fc.record({
      checkpointer: fc.constant('memory' as const),
      recursionLimit: fc.constant(25),
      streamMode: fc.constant('values' as const),
    }),
    opik: fc.record({
      apiKey: fc.constant(undefined),
      projectName: fc.constant('test-project'),
      workspace: fc.constant(undefined),
      baseUrl: fc.constant(undefined),
      tags: fc.constant([]),
      trackCosts: fc.constant(true),
    }),
    llm: fc.oneof(
      // Single-provider mode
      fc.record({
        singleProvider: fc.constantFrom('openai', 'anthropic', 'google'),
        openai: fc.record({
          apiKey: fc.constant('test-key'),
          defaultModel: fc.constant('gpt-4-turbo'),
        }),
        anthropic: fc.record({
          apiKey: fc.constant('test-key'),
          defaultModel: fc.constant('claude-3-sonnet-20240229'),
        }),
        google: fc.record({
          apiKey: fc.constant('test-key'),
          defaultModel: fc.constant('gemini-1.5-flash'),
        }),
      }),
      // Multi-provider mode
      fc.record({
        singleProvider: fc.constant(undefined),
        openai: fc.record({
          apiKey: fc.constant('test-key'),
          defaultModel: fc.constant('gpt-4-turbo'),
        }),
        anthropic: fc.record({
          apiKey: fc.constant('test-key'),
          defaultModel: fc.constant('claude-3-sonnet-20240229'),
        }),
        google: fc.record({
          apiKey: fc.constant('test-key'),
          defaultModel: fc.constant('gemini-1.5-flash'),
        }),
      })
    ),
    agents: fc.record({
      timeoutMs: fc.constant(10000),
      minAgentsRequired: fc.integer({ min: 1, max: 3 }),
    }),
    consensus: fc.record({
      minEdgeThreshold: fc.constant(0.05),
      highDisagreementThreshold: fc.constant(0.15),
    }),
    logging: fc.record({
      level: fc.constant('info' as const),
      auditTrailRetentionDays: fc.constant(30),
    }),
  });

  // Feature: market-intelligence-engine, Property 5: Thesis generation completeness
  // Validates: Requirements 4.1, 4.2, 4.3
  it('Property 5: For any aggregated agent signals, the system should generate both bull and bear theses with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        mbdArbitrary,
        agentSignalsArbitrary,
        configArbitrary,
        async (mbd, agentSignals, config) => {
          // Ensure we have enough agents for the config
          const minRequired = config.agents.minAgentsRequired;
          if (agentSignals.length < minRequired) {
            agentSignals = agentSignals.concat(
              Array(minRequired - agentSignals.length).fill(agentSignals[0])
            );
          }

          // Create thesis construction node
          const thesisNode = createThesisConstructionNode(config as EngineConfig);

          // Create state with MBD and agent signals
          const state: GraphStateType = {
            conditionId: mbd.conditionId,
            mbd: mbd as MarketBriefingDocument,
            ingestionError: null,
            agentSignals: agentSignals as AgentSignal[],
            agentErrors: [],
            bullThesis: null,
            bearThesis: null,
            debateRecord: null,
            consensus: null,
            consensusError: null,
            recommendation: null,
            auditLog: [],
          };

          // Execute thesis construction node
          const result = await thesisNode(state);

          // Property: Both bull and bear theses should be generated
          expect(result.bullThesis).toBeDefined();
          expect(result.bearThesis).toBeDefined();

          const bullThesis = result.bullThesis as Thesis;
          const bearThesis = result.bearThesis as Thesis;

          // Property: Bull thesis should have direction YES
          expect(bullThesis.direction).toBe('YES');

          // Property: Bear thesis should have direction NO
          expect(bearThesis.direction).toBe('NO');

          // Property: Both theses should have fair probability estimate (0-1)
          expect(bullThesis.fairProbability).toBeGreaterThanOrEqual(0);
          expect(bullThesis.fairProbability).toBeLessThanOrEqual(1);
          expect(bearThesis.fairProbability).toBeGreaterThanOrEqual(0);
          expect(bearThesis.fairProbability).toBeLessThanOrEqual(1);

          // Property: Both theses should have market probability
          expect(bullThesis.marketProbability).toBeDefined();
          expect(bearThesis.marketProbability).toBeDefined();
          expect(bullThesis.marketProbability).toBe(mbd.currentProbability);
          expect(bearThesis.marketProbability).toBe(mbd.currentProbability);

          // Property: Both theses should have edge calculation
          expect(bullThesis.edge).toBeDefined();
          expect(bearThesis.edge).toBeDefined();
          expect(bullThesis.edge).toBeGreaterThanOrEqual(0);
          expect(bearThesis.edge).toBeGreaterThanOrEqual(0);
          expect(bullThesis.edge).toBeLessThanOrEqual(1);
          expect(bearThesis.edge).toBeLessThanOrEqual(1);

          // Property: Edge should equal |fairProbability - marketProbability|
          expect(bullThesis.edge).toBeCloseTo(
            Math.abs(bullThesis.fairProbability - bullThesis.marketProbability),
            5
          );
          expect(bearThesis.edge).toBeCloseTo(
            Math.abs(bearThesis.fairProbability - bearThesis.marketProbability),
            5
          );

          // Property: Both theses should have core argument
          expect(bullThesis.coreArgument).toBeDefined();
          expect(typeof bullThesis.coreArgument).toBe('string');
          expect(bullThesis.coreArgument.length).toBeGreaterThan(0);
          expect(bearThesis.coreArgument).toBeDefined();
          expect(typeof bearThesis.coreArgument).toBe('string');
          expect(bearThesis.coreArgument.length).toBeGreaterThan(0);

          // Property: Both theses should have catalysts array
          expect(Array.isArray(bullThesis.catalysts)).toBe(true);
          expect(Array.isArray(bearThesis.catalysts)).toBe(true);

          // Property: Both theses should have failure conditions array
          expect(Array.isArray(bullThesis.failureConditions)).toBe(true);
          expect(Array.isArray(bearThesis.failureConditions)).toBe(true);

          // Property: Both theses should have supporting signals array
          expect(Array.isArray(bullThesis.supportingSignals)).toBe(true);
          expect(Array.isArray(bearThesis.supportingSignals)).toBe(true);

          // Property: Audit log should be updated
          expect(result.auditLog).toBeDefined();
          expect(result.auditLog!.length).toBeGreaterThan(0);
          const auditEntry = result.auditLog![0];
          expect(auditEntry.stage).toBe('thesis_construction');
          expect(auditEntry.timestamp).toBeGreaterThan(0);
          expect(auditEntry.data).toBeDefined();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Additional property: Thesis generation should handle edge cases
  it('Property: Thesis generation should handle edge case probabilities', async () => {
    // Create edge case signal generator that respects minimum agent requirement
    const createEdgeCaseSignals = (minRequired: number) => {
      const baseSignals = [
        {
          agentName: 'agent1',
          timestamp: Date.now(),
          confidence: 0.9,
          direction: 'YES' as const,
          fairProbability: 0.9,
          keyDrivers: ['Strong signal'],
          riskFactors: [],
          metadata: {},
        },
        {
          agentName: 'agent2',
          timestamp: Date.now(),
          confidence: 0.85,
          direction: 'YES' as const,
          fairProbability: 0.88,
          keyDrivers: ['Strong signal'],
          riskFactors: [],
          metadata: {},
        },
      ];

      // Add extra agents if needed to meet minimum requirement
      const extraAgents = Array.from({ length: Math.max(0, minRequired - 2) }, (_, i) => ({
        agentName: `agent${i + 3}`,
        timestamp: Date.now(),
        confidence: 0.8,
        direction: 'YES' as const,
        fairProbability: 0.85,
        keyDrivers: ['Additional signal'],
        riskFactors: [],
        metadata: {},
      }));

      return [...baseSignals, ...extraAgents];
    };

    const edgeCaseSignals = fc.oneof(
      // All agents agree on YES with high confidence
      fc.nat({ max: 3 }).map((extra) => {
        const signals = createEdgeCaseSignals(2 + extra);
        return signals.map((s) => ({
          ...s,
          direction: 'YES' as const,
          fairProbability: 0.9 - Math.random() * 0.05,
        }));
      }),
      // All agents agree on NO with high confidence
      fc.nat({ max: 3 }).map((extra) => {
        const signals = createEdgeCaseSignals(2 + extra);
        return signals.map((s) => ({
          ...s,
          direction: 'NO' as const,
          fairProbability: 0.1 + Math.random() * 0.05,
        }));
      }),
      // Agents are neutral/uncertain
      fc.nat({ max: 3 }).map((extra) => {
        const signals = createEdgeCaseSignals(2 + extra);
        return signals.map((s) => ({
          ...s,
          confidence: 0.3 + Math.random() * 0.2,
          direction: 'NEUTRAL' as const,
          fairProbability: 0.45 + Math.random() * 0.1,
          keyDrivers: ['Uncertain'],
          riskFactors: ['High uncertainty'],
        }));
      })
    );

    await fc.assert(
      fc.asyncProperty(mbdArbitrary, edgeCaseSignals, configArbitrary, async (mbd, signals, config) => {
        // Ensure we have enough agents for the config
        const minRequired = config.agents.minAgentsRequired;
        let adjustedSignals = signals;
        
        // If we don't have enough signals, duplicate some to meet minimum
        if (signals.length < minRequired) {
          const additionalSignals = Array.from(
            { length: minRequired - signals.length },
            (_, i) => ({
              ...signals[0],
              agentName: `additional_agent_${i}`,
            })
          );
          adjustedSignals = [...signals, ...additionalSignals];
        }

        const thesisNode = createThesisConstructionNode(config as EngineConfig);

        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          agentSignals: adjustedSignals as AgentSignal[],
          agentErrors: [],
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: null,
          consensusError: null,
          recommendation: null,
          auditLog: [],
        };

        const result = await thesisNode(state);

        // Should generate both theses (since we ensured enough agents)
        expect(result.bullThesis).toBeDefined();
        expect(result.bearThesis).toBeDefined();

        // Theses should have valid structure
        const bullThesis = result.bullThesis as Thesis;
        const bearThesis = result.bearThesis as Thesis;

        expect(bullThesis.direction).toBe('YES');
        expect(bearThesis.direction).toBe('NO');
        expect(bullThesis.fairProbability).toBeGreaterThanOrEqual(0);
        expect(bullThesis.fairProbability).toBeLessThanOrEqual(1);
        expect(bearThesis.fairProbability).toBeGreaterThanOrEqual(0);
        expect(bearThesis.fairProbability).toBeLessThanOrEqual(1);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Property: Insufficient agent signals should return error
  it('Property: Thesis generation should fail gracefully with insufficient agent signals', async () => {
    await fc.assert(
      fc.asyncProperty(mbdArbitrary, configArbitrary, async (mbd, config) => {
        const thesisNode = createThesisConstructionNode(config as EngineConfig);

        // Create state with fewer agents than required
        const state: GraphStateType = {
          conditionId: mbd.conditionId,
          mbd: mbd as MarketBriefingDocument,
          ingestionError: null,
          agentSignals: [], // No agent signals
          agentErrors: [],
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: null,
          consensusError: null,
          recommendation: null,
          auditLog: [],
        };

        const result = await thesisNode(state);

        // Should return error
        expect(result.consensusError).toBeDefined();
        expect(result.consensusError!.type).toBe('INSUFFICIENT_DATA');

        // Should not generate theses
        expect(result.bullThesis).toBeUndefined();
        expect(result.bearThesis).toBeUndefined();

        return true;
      }),
      { numRuns: 50 }
    );
  });
});
