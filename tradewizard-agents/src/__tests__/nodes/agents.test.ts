/**
 * Unit tests for intelligence agent nodes
 *
 * Tests agent node creation, execution, error handling, and LLM configuration modes.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentNode, createLLMInstances, createAgentNodes } from './agents.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

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
          keyDrivers: ['Strong order book depth', 'Positive momentum', 'Low spread'],
          riskFactors: ['Potential liquidity shock'],
          metadata: {},
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
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.70,
          direction: 'NO',
          fairProbability: 0.45,
          keyDrivers: ['Tail risk present', 'Resolution ambiguity', 'Historical base rate'],
          riskFactors: ['Black swan event possible'],
          metadata: {},
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
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.80,
          direction: 'NEUTRAL',
          fairProbability: 0.50,
          keyDrivers: ['Base rate analysis', 'Historical precedent', 'Time decay'],
          riskFactors: ['Information uncertainty'],
          metadata: {},
        }),
      };
    }
  },
}));

describe('Agent Nodes', () => {
  // Sample Market Briefing Document for testing
  const sampleMBD: MarketBriefingDocument = {
    marketId: 'test-market-123',
    conditionId: 'test-condition-456',
    eventType: 'election',
    question: 'Will candidate X win the election?',
    resolutionCriteria: 'Resolves YES if candidate X is declared winner by official sources',
    expiryTimestamp: Date.now() + 86400000,
    currentProbability: 0.55,
    liquidityScore: 7.5,
    bidAskSpread: 2.5,
    volatilityRegime: 'medium',
    volume24h: 50000,
    metadata: {
      ambiguityFlags: [],
      keyCatalysts: [{ event: 'Debate', timestamp: Date.now() + 3600000 }],
    },
  };

  // Sample graph state with MBD
  const sampleState: GraphStateType = {
    conditionId: 'test-condition-456',
    mbd: sampleMBD,
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

  describe('createAgentNode', () => {
    it('should create an agent node that processes MBD and returns signal', async () => {
      const mockLLM = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            confidence: 0.75,
            direction: 'YES',
            fairProbability: 0.65,
            keyDrivers: ['Factor 1', 'Factor 2'],
            riskFactors: ['Risk 1'],
            metadata: {},
          }),
        }),
      } as any;

      const agentNode = createAgentNode('test_agent', mockLLM, 'Test system prompt');
      const result = await agentNode(sampleState);

      // Verify signal was added
      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('test_agent');
      expect(result.agentSignals![0].direction).toBe('YES');
      expect(result.agentSignals![0].confidence).toBe(0.75);
      expect(result.agentSignals![0].fairProbability).toBe(0.65);

      // Verify audit log entry
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog).toHaveLength(1);
      expect(result.auditLog![0].stage).toBe('agent_test_agent');
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'test_agent',
        success: true,
      });
    });

    it('should handle missing MBD gracefully', async () => {
      const mockLLM = {
        withStructuredOutput: vi.fn(),
      } as any;

      const stateWithoutMBD: GraphStateType = {
        ...sampleState,
        mbd: null,
      };

      const agentNode = createAgentNode('test_agent', mockLLM, 'Test system prompt');
      const result = await agentNode(stateWithoutMBD);

      // Verify error was recorded
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors).toHaveLength(1);
      expect(result.agentErrors![0].type).toBe('EXECUTION_FAILED');
      expect(result.agentErrors![0].agentName).toBe('test_agent');

      // Verify audit log shows failure
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'test_agent',
        success: false,
      });
    });

    it('should handle LLM execution errors', async () => {
      const mockLLM = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockRejectedValue(new Error('LLM API error')),
        }),
      } as any;

      const agentNode = createAgentNode('test_agent', mockLLM, 'Test system prompt');
      const result = await agentNode(sampleState);

      // Verify error was recorded
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors).toHaveLength(1);
      expect(result.agentErrors![0].type).toBe('EXECUTION_FAILED');
      expect(result.agentErrors![0].agentName).toBe('test_agent');
      
      // Type guard to access error property
      if (result.agentErrors![0].type === 'EXECUTION_FAILED') {
        expect(result.agentErrors![0].error.message).toBe('LLM API error');
      }

      // Verify audit log shows failure
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'test_agent',
        success: false,
        error: 'LLM API error',
      });
    });

    it('should include timestamp in agent signal', async () => {
      const mockLLM = {
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            confidence: 0.75,
            direction: 'YES',
            fairProbability: 0.65,
            keyDrivers: ['Factor 1'],
            riskFactors: ['Risk 1'],
            metadata: {},
          }),
        }),
      } as any;

      const beforeTime = Date.now();
      const agentNode = createAgentNode('test_agent', mockLLM, 'Test system prompt');
      const result = await agentNode(sampleState);
      const afterTime = Date.now();

      expect(result.agentSignals![0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(result.agentSignals![0].timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('createLLMInstances', () => {
    it('should create LLM instances in single-provider mode (OpenAI)', () => {
      const config: EngineConfig = {
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
            apiKey: 'test-openai-key',
            defaultModel: 'gpt-4o-mini',
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

      const llms = createLLMInstances(config);

      // All agents should use the same LLM instance
      expect(llms.marketMicrostructure).toBeDefined();
      expect(llms.probabilityBaseline).toBeDefined();
      expect(llms.riskAssessment).toBeDefined();
      expect(llms.marketMicrostructure).toBe(llms.probabilityBaseline);
      expect(llms.probabilityBaseline).toBe(llms.riskAssessment);
    });

    it('should create LLM instances in single-provider mode (Anthropic)', () => {
      const config: EngineConfig = {
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
          singleProvider: 'anthropic',
          anthropic: {
            apiKey: 'test-anthropic-key',
            defaultModel: 'claude-3-haiku-20240307',
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

      const llms = createLLMInstances(config);

      // All agents should use the same LLM instance
      expect(llms.marketMicrostructure).toBe(llms.probabilityBaseline);
      expect(llms.probabilityBaseline).toBe(llms.riskAssessment);
    });

    it('should create LLM instances in single-provider mode (Google)', () => {
      const config: EngineConfig = {
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
          singleProvider: 'google',
          google: {
            apiKey: 'test-google-key',
            defaultModel: 'gemini-1.5-flash',
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

      const llms = createLLMInstances(config);

      // All agents should use the same LLM instance
      expect(llms.marketMicrostructure).toBe(llms.probabilityBaseline);
      expect(llms.probabilityBaseline).toBe(llms.riskAssessment);
    });

    it('should create different LLM instances in multi-provider mode', () => {
      const config: EngineConfig = {
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
          openai: {
            apiKey: 'test-openai-key',
            defaultModel: 'gpt-4-turbo',
          },
          anthropic: {
            apiKey: 'test-anthropic-key',
            defaultModel: 'claude-3-sonnet-20240229',
          },
          google: {
            apiKey: 'test-google-key',
            defaultModel: 'gemini-1.5-flash',
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

      const llms = createLLMInstances(config);

      // Each agent should have a different LLM instance
      expect(llms.marketMicrostructure).toBeDefined();
      expect(llms.probabilityBaseline).toBeDefined();
      expect(llms.riskAssessment).toBeDefined();
      // In multi-provider mode, instances should be different
      expect(llms.marketMicrostructure).not.toBe(llms.probabilityBaseline);
      expect(llms.probabilityBaseline).not.toBe(llms.riskAssessment);
    });

    it('should throw error for invalid single provider', () => {
      const config: EngineConfig = {
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
          // Missing openai config
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

      expect(() => createLLMInstances(config)).toThrow("Single provider mode configured for 'openai' but provider not available");
    });

    it('should not throw error for multi-provider mode with only one provider (Nova fallback available)', () => {
      const config: EngineConfig = {
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
          // Multi-provider mode with only OpenAI configured
          // Nova is now available as fallback, so this should not throw
          openai: {
            apiKey: 'test-openai-key',
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

      // Should not throw because Nova is available as fallback
      expect(() => createLLMInstances(config)).not.toThrow();
      
      // Verify LLM instances are created successfully
      const llms = createLLMInstances(config);
      expect(llms.marketMicrostructure).toBeDefined();
      expect(llms.probabilityBaseline).toBeDefined();
      expect(llms.riskAssessment).toBeDefined();
    });
  });

  describe('createAgentNodes', () => {
    it('should create all three agent nodes', () => {
      const config: EngineConfig = {
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
            apiKey: 'test-openai-key',
            defaultModel: 'gpt-4o-mini',
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

      const agents = createAgentNodes(config);

      expect(agents.marketMicrostructureAgent).toBeDefined();
      expect(agents.probabilityBaselineAgent).toBeDefined();
      expect(agents.riskAssessmentAgent).toBeDefined();
      expect(typeof agents.marketMicrostructureAgent).toBe('function');
      expect(typeof agents.probabilityBaselineAgent).toBe('function');
      expect(typeof agents.riskAssessmentAgent).toBe('function');
    });

    it('should execute market microstructure agent successfully', async () => {
      const config: EngineConfig = {
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
            apiKey: 'test-openai-key',
            defaultModel: 'gpt-4o-mini',
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

      const agents = createAgentNodes(config);
      const result = await agents.marketMicrostructureAgent(sampleState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('market_microstructure');
    });

    it('should execute probability baseline agent successfully', async () => {
      const config: EngineConfig = {
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
          singleProvider: 'google',
          google: {
            apiKey: 'test-google-key',
            defaultModel: 'gemini-1.5-flash',
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

      const agents = createAgentNodes(config);
      const result = await agents.probabilityBaselineAgent(sampleState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('probability_baseline');
    });

    it('should execute risk assessment agent successfully', async () => {
      const config: EngineConfig = {
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
          singleProvider: 'anthropic',
          anthropic: {
            apiKey: 'test-anthropic-key',
            defaultModel: 'claude-3-sonnet-20240229',
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

      const agents = createAgentNodes(config);
      const result = await agents.riskAssessmentAgent(sampleState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('risk_assessment');
    });
  });

  describe('Agent Signal Structure', () => {
    it('should produce valid agent signal structure', async () => {
      const mockLLM = {
        constructor: { name: 'MockLLM' }, // Add constructor name for type checking
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            confidence: 0.75,
            direction: 'YES',
            fairProbability: 0.65,
            keyDrivers: ['Driver 1', 'Driver 2', 'Driver 3'],
            riskFactors: ['Risk 1', 'Risk 2'],
            metadata: { additionalInfo: 'test' },
          }),
        }),
      } as any;

      const agentNode = createAgentNode('test_agent', mockLLM, 'Test prompt');
      const result = await agentNode(sampleState);

      const signal = result.agentSignals![0];

      // Verify all required fields are present
      expect(signal.agentName).toBe('test_agent');
      expect(signal.timestamp).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);
      expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
      expect(signal.fairProbability).toBeLessThanOrEqual(1);
      expect(Array.isArray(signal.keyDrivers)).toBe(true);
      expect(signal.keyDrivers.length).toBeGreaterThan(0);
      expect(Array.isArray(signal.riskFactors)).toBe(true);
      expect(typeof signal.metadata).toBe('object');
    });
  });
});
