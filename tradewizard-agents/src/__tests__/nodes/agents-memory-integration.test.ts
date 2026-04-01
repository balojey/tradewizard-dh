/**
 * Agent Memory Integration Tests
 *
 * Tests that verify the agent node factory correctly integrates memory context
 * into agent prompts according to requirements 2.1, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentNode } from './agents.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentMemoryContext } from '../database/memory-retrieval.js';

describe('Agent Memory Integration', () => {
  describe('Memory Context Injection', () => {
    it('should inject memory context into agent prompt when history exists', async () => {
      // Requirement 2.1: Memory context should be provided as part of agent input
      const mockLLM = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            direction: 'YES',
            fairProbability: 0.65,
            confidence: 0.8,
            keyDrivers: ['Test driver'],
            riskFactors: ['Test risk'],
          }),
        }),
      };

      const agentNode = createAgentNode(
        'test_agent',
        mockLLM as any,
        'You are a test agent.'
      );

      const memoryContext: AgentMemoryContext = {
        agentName: 'test_agent',
        marketId: 'test_market',
        historicalSignals: [
          {
            agentName: 'test_agent',
            marketId: 'test_market',
            timestamp: new Date('2024-01-01'),
            direction: 'NO',
            fairProbability: 0.45,
            confidence: 0.7,
            keyDrivers: ['Previous driver'],
            metadata: {},
          },
        ],
        hasHistory: true,
      };

      const state: Partial<GraphStateType> = {
        conditionId: 'test_market',
        mbd: {
          conditionId: 'test_market',
          question: 'Test question?',
          description: 'Test description',
          endDate: Date.now() + 86400000,
          outcomes: ['YES', 'NO'],
          currentProbabilities: { YES: 0.5, NO: 0.5 },
          volume24h: 1000,
          liquidity: 5000,
          createdAt: Date.now(),
        },
        memoryContext: new Map([['test_agent', memoryContext]]),
      };

      await agentNode(state as GraphStateType);

      // Verify that the LLM was invoked with enhanced prompt
      const structuredLLM = mockLLM.withStructuredOutput.mock.results[0].value;
      const invokeCall = structuredLLM.invoke.mock.calls[0][0];
      const systemPrompt = invokeCall[0].content;

      // Requirement 2.1: Memory context should be included
      expect(systemPrompt).toContain('Previous Analysis History');
      expect(systemPrompt).toContain('Analysis from');
      expect(systemPrompt).toContain('Direction: NO');
      expect(systemPrompt).toContain('Fair Probability: 45.0%');
      expect(systemPrompt).toContain('Confidence: 70.0%');
      expect(systemPrompt).toContain('Previous driver');

      // Requirement 3.1: Instructions to review previous analysis
      expect(systemPrompt).toContain('Review your previous analysis before generating new analysis');

      // Requirement 3.2: Instructions to identify changes
      expect(systemPrompt).toContain('Identify what has changed since your last analysis');

      // Requirement 3.3: Instructions to explain significant changes
      expect(systemPrompt).toContain('If your view has changed significantly, explain the reasoning for the change');

      // Requirement 3.4: Instructions to acknowledge continuity
      expect(systemPrompt).toContain('If your view remains consistent, acknowledge the continuity and reinforce your reasoning');

      // Requirement 3.5: Instructions to reference specific changes
      expect(systemPrompt).toContain('Reference specific changes from previous analysis when relevant');
    });

    it('should handle empty memory context gracefully', async () => {
      // Requirement 2.4: Handle empty memory context
      const mockLLM = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            direction: 'YES',
            fairProbability: 0.65,
            confidence: 0.8,
            keyDrivers: ['Test driver'],
            riskFactors: ['Test risk'],
          }),
        }),
      };

      const agentNode = createAgentNode(
        'test_agent',
        mockLLM as any,
        'You are a test agent.'
      );

      const state: Partial<GraphStateType> = {
        conditionId: 'test_market',
        mbd: {
          conditionId: 'test_market',
          question: 'Test question?',
          description: 'Test description',
          endDate: Date.now() + 86400000,
          outcomes: ['YES', 'NO'],
          currentProbabilities: { YES: 0.5, NO: 0.5 },
          volume24h: 1000,
          liquidity: 5000,
          createdAt: Date.now(),
        },
        memoryContext: new Map(),
      };

      await agentNode(state as GraphStateType);

      // Verify that the LLM was invoked with empty memory message
      const structuredLLM = mockLLM.withStructuredOutput.mock.results[0].value;
      const invokeCall = structuredLLM.invoke.mock.calls[0][0];
      const systemPrompt = invokeCall[0].content;

      // Should indicate no previous analysis
      expect(systemPrompt).toContain('No previous analysis available for this market');

      // Should still include instructions (for consistency)
      expect(systemPrompt).toContain('Instructions for Using Memory Context');
    });

    it('should work when memoryContext is undefined (backward compatibility)', async () => {
      // Requirement 6.4: Backward compatibility with existing agent implementations
      const mockLLM = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            direction: 'YES',
            fairProbability: 0.65,
            confidence: 0.8,
            keyDrivers: ['Test driver'],
            riskFactors: ['Test risk'],
          }),
        }),
      };

      const agentNode = createAgentNode(
        'test_agent',
        mockLLM as any,
        'You are a test agent.'
      );

      const state: Partial<GraphStateType> = {
        conditionId: 'test_market',
        mbd: {
          conditionId: 'test_market',
          question: 'Test question?',
          description: 'Test description',
          endDate: Date.now() + 86400000,
          outcomes: ['YES', 'NO'],
          currentProbabilities: { YES: 0.5, NO: 0.5 },
          volume24h: 1000,
          liquidity: 5000,
          createdAt: Date.now(),
        },
        // memoryContext is undefined (not set)
      };

      const result = await agentNode(state as GraphStateType);

      // Should not throw error and should return valid signal
      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals?.[0]).toMatchObject({
        agentName: 'test_agent',
        direction: 'YES',
        fairProbability: 0.65,
        confidence: 0.8,
      });
    });
  });
});
