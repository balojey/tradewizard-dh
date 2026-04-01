/**
 * Unit tests for Risk Philosophy Agent nodes
 *
 * Tests aggressive, conservative, and neutral risk philosophy agents
 * including position sizing, hedging strategies, and spread identification.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createAggressiveAgentNode,
  createConservativeAgentNode,
  createNeutralAgentNode,
  createRiskPhilosophyAgentNodes,
} from './risk-philosophy.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument, ConsensusProbability } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// Mock LLM classes
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    withStructuredOutput() {
      return {
        invoke: async () => ({
          confidence: 0.85,
          direction: 'YES',
          fairProbability: 0.70,
          keyDrivers: ['High expected value', 'Strong conviction', 'Favorable odds'],
          riskFactors: ['High variance', 'Potential drawdown'],
          metadata: {
            recommendedPositionSize: 0.25,
            kellyCriterion: 0.20,
            convictionLevel: 'high',
            expectedReturn: 45.5,
            varianceWarning: 'High variance strategy - expect significant drawdowns',
          },
        }),
      };
    }
  },
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class MockChatAnthropic {
    withStructuredOutput() {
      return {
        invoke: async () => ({
          confidence: 0.75,
          direction: 'YES',
          fairProbability: 0.60,
          keyDrivers: ['Capital preservation', 'Risk management', 'Downside protection'],
          riskFactors: ['Market reversal', 'Unexpected events'],
          metadata: {
            recommendedPositionSize: 0.05,
            hedgingStrategy: 'Buy protective puts on correlated markets',
            maxDrawdownTolerance: 0.10,
            stopLossLevel: 0.45,
            capitalPreservationScore: 0.90,
          },
        }),
      };
    }
  },
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class MockChatGoogleGenerativeAI {
    withStructuredOutput() {
      return {
        invoke: async () => ({
          confidence: 0.70,
          direction: 'NEUTRAL',
          fairProbability: 0.50,
          keyDrivers: ['Market neutral', 'Spread opportunity', 'Low correlation risk'],
          riskFactors: ['Execution risk', 'Correlation breakdown'],
          metadata: {
            spreadOpportunities: [
              {
                setup: 'Long YES at 0.45, Short correlated market at 0.55',
                expectedReturn: 8.5,
                riskLevel: 'low',
              },
            ],
            pairedPositions: [
              {
                long: 'Market A YES',
                short: 'Market B NO',
                netExposure: 0.02,
              },
            ],
            arbitrageSetups: ['Cross-market arbitrage on related outcomes'],
          },
        }),
      };
    }
  },
}));

describe('Risk Philosophy Agent Nodes', () => {
  // Sample Market Briefing Document
  const sampleMBD: MarketBriefingDocument = {
    marketId: 'test-market-123',
    conditionId: 'test-condition-456',
    eventType: 'election',
    question: 'Will candidate X win the election?',
    resolutionCriteria: 'Resolves YES if candidate X is declared winner',
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

  // Sample consensus probability
  const sampleConsensus: ConsensusProbability = {
    fairProbability: 0.62,
    confidence: 0.80,
    recommendation: 'YES',
    edge: 0.07,
    disagreementLevel: 'low',
    timestamp: Date.now(),
  };

  // Sample graph state with consensus
  const sampleState: GraphStateType = {
    conditionId: 'test-condition-456',
    mbd: sampleMBD,
    ingestionError: null,
    activeAgents: [],
    externalData: null,
    agentSignals: [],
    agentErrors: [],
    fusedSignal: null,
    bullThesis: null,
    bearThesis: null,
    debateRecord: null,
    consensus: sampleConsensus,
    consensusError: null,
    riskPhilosophySignals: null,
    agentPerformance: {},
    recommendation: null,
    auditLog: [],
  };

  // Sample engine config
  const sampleConfig: EngineConfig = {
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
        defaultModel: 'gpt-4o-mini',
      },
      anthropic: {
        apiKey: 'test-anthropic-key',
        defaultModel: 'claude-3-5-sonnet-20241022',
      },
      google: {
        apiKey: 'test-google-key',
        defaultModel: 'gemini-2.0-flash-exp',
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

  describe('createAggressiveAgentNode', () => {
    it('should create aggressive agent node and produce valid signal', async () => {
      const agentNode = createAggressiveAgentNode(sampleConfig);
      const result = await agentNode(sampleState);

      console.log('Aggressive result:', JSON.stringify(result, null, 2));

      // Verify signal was added to riskPhilosophySignals
      expect(result.riskPhilosophySignals).toBeDefined();
      expect(result.riskPhilosophySignals!.aggressive).toBeDefined();

      const signal = result.riskPhilosophySignals!.aggressive!;

      // Verify basic signal structure
      expect(signal.agentName).toBe('risk_philosophy_aggressive');
      expect(signal.timestamp).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(['YES', 'NO', 'NEUTRAL']).toContain(signal.direction);
      expect(signal.fairProbability).toBeGreaterThanOrEqual(0);
      expect(signal.fairProbability).toBeLessThanOrEqual(1);

      // Verify aggressive-specific metadata
      expect(signal.metadata.recommendedPositionSize).toBeGreaterThanOrEqual(0);
      expect(signal.metadata.recommendedPositionSize).toBeLessThanOrEqual(1);
      expect(signal.metadata.kellyCriterion).toBeGreaterThanOrEqual(0);
      expect(signal.metadata.kellyCriterion).toBeLessThanOrEqual(1);
      expect(['extreme', 'high', 'moderate']).toContain(signal.metadata.convictionLevel);
      expect(typeof signal.metadata.expectedReturn).toBe('number');
      expect(typeof signal.metadata.varianceWarning).toBe('string');

      // Verify audit log
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog).toHaveLength(1);
      expect(result.auditLog![0].stage).toBe('agent_risk_philosophy_aggressive');
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'risk_philosophy_aggressive',
        success: true,
      });
    });

    it('should handle missing consensus gracefully', async () => {
      const stateWithoutConsensus: GraphStateType = {
        ...sampleState,
        consensus: null,
      };

      const agentNode = createAggressiveAgentNode(sampleConfig);
      const result = await agentNode(stateWithoutConsensus);

      // Verify error was logged
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'risk_philosophy_aggressive',
        success: false,
        error: 'No consensus probability available',
      });
    });

    it('should handle missing MBD gracefully', async () => {
      const stateWithoutMBD: GraphStateType = {
        ...sampleState,
        mbd: null,
      };

      const agentNode = createAggressiveAgentNode(sampleConfig);
      const result = await agentNode(stateWithoutMBD);

      // Verify error was logged
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'risk_philosophy_aggressive',
        success: false,
        error: 'No Market Briefing Document available',
      });
    });
  });

  describe('createConservativeAgentNode', () => {
    it('should create conservative agent node and produce valid signal', async () => {
      const agentNode = createConservativeAgentNode(sampleConfig);
      const result = await agentNode(sampleState);

      // Verify signal was added to riskPhilosophySignals
      expect(result.riskPhilosophySignals).toBeDefined();
      expect(result.riskPhilosophySignals!.conservative).toBeDefined();

      const signal = result.riskPhilosophySignals!.conservative!;

      // Verify basic signal structure
      expect(signal.agentName).toBe('risk_philosophy_conservative');
      expect(signal.timestamp).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);

      // Verify conservative-specific metadata
      expect(signal.metadata.recommendedPositionSize).toBeGreaterThanOrEqual(0);
      expect(signal.metadata.recommendedPositionSize).toBeLessThanOrEqual(1);
      expect(typeof signal.metadata.hedgingStrategy).toBe('string');
      expect(signal.metadata.hedgingStrategy.length).toBeGreaterThan(0);
      expect(signal.metadata.maxDrawdownTolerance).toBeGreaterThanOrEqual(0);
      expect(signal.metadata.maxDrawdownTolerance).toBeLessThanOrEqual(1);
      expect(signal.metadata.stopLossLevel).toBeGreaterThanOrEqual(0);
      expect(signal.metadata.stopLossLevel).toBeLessThanOrEqual(1);
      expect(signal.metadata.capitalPreservationScore).toBeGreaterThanOrEqual(0);
      expect(signal.metadata.capitalPreservationScore).toBeLessThanOrEqual(1);

      // Verify audit log
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'risk_philosophy_conservative',
        success: true,
      });
    });

    it('should recommend smaller position sizes than aggressive agent', async () => {
      const aggressiveNode = createAggressiveAgentNode(sampleConfig);
      const conservativeNode = createConservativeAgentNode(sampleConfig);

      const aggressiveResult = await aggressiveNode(sampleState);
      const conservativeResult = await conservativeNode(sampleState);

      const aggressiveSize = aggressiveResult.riskPhilosophySignals!.aggressive!.metadata.recommendedPositionSize;
      const conservativeSize = conservativeResult.riskPhilosophySignals!.conservative!.metadata.recommendedPositionSize;

      // Conservative should recommend smaller position
      expect(conservativeSize).toBeLessThan(aggressiveSize);
    });
  });

  describe('createNeutralAgentNode', () => {
    it('should create neutral agent node and produce valid signal', async () => {
      const agentNode = createNeutralAgentNode(sampleConfig);
      const result = await agentNode(sampleState);

      // Verify signal was added to riskPhilosophySignals
      expect(result.riskPhilosophySignals).toBeDefined();
      expect(result.riskPhilosophySignals!.neutral).toBeDefined();

      const signal = result.riskPhilosophySignals!.neutral!;

      // Verify basic signal structure
      expect(signal.agentName).toBe('risk_philosophy_neutral');
      expect(signal.timestamp).toBeGreaterThan(0);

      // Verify neutral-specific metadata
      expect(Array.isArray(signal.metadata.spreadOpportunities)).toBe(true);
      signal.metadata.spreadOpportunities.forEach((opp) => {
        expect(typeof opp.setup).toBe('string');
        expect(typeof opp.expectedReturn).toBe('number');
        expect(['low', 'medium']).toContain(opp.riskLevel);
      });

      expect(Array.isArray(signal.metadata.pairedPositions)).toBe(true);
      signal.metadata.pairedPositions.forEach((pos) => {
        expect(typeof pos.long).toBe('string');
        expect(typeof pos.short).toBe('string');
        expect(typeof pos.netExposure).toBe('number');
      });

      expect(Array.isArray(signal.metadata.arbitrageSetups)).toBe(true);

      // Verify audit log
      expect(result.auditLog![0].data).toMatchObject({
        agentName: 'risk_philosophy_neutral',
        success: true,
      });
    });

    it('should identify spread trade opportunities', async () => {
      const agentNode = createNeutralAgentNode(sampleConfig);
      const result = await agentNode(sampleState);

      const signal = result.riskPhilosophySignals!.neutral!;

      // Should have at least one spread opportunity
      expect(signal.metadata.spreadOpportunities.length).toBeGreaterThan(0);

      // Each spread should have valid structure
      signal.metadata.spreadOpportunities.forEach((spread) => {
        expect(spread.setup.length).toBeGreaterThan(0);
        expect(spread.expectedReturn).toBeDefined();
        expect(['low', 'medium']).toContain(spread.riskLevel);
      });
    });
  });

  describe('createRiskPhilosophyAgentNodes', () => {
    it('should create all three risk philosophy agent nodes', () => {
      const agents = createRiskPhilosophyAgentNodes(sampleConfig);

      expect(agents.aggressiveAgent).toBeDefined();
      expect(agents.conservativeAgent).toBeDefined();
      expect(agents.neutralAgent).toBeDefined();
      expect(typeof agents.aggressiveAgent).toBe('function');
      expect(typeof agents.conservativeAgent).toBe('function');
      expect(typeof agents.neutralAgent).toBe('function');
    });

    it('should execute all three agents successfully', async () => {
      const agents = createRiskPhilosophyAgentNodes(sampleConfig);

      const aggressiveResult = await agents.aggressiveAgent(sampleState);
      const conservativeResult = await agents.conservativeAgent(sampleState);
      const neutralResult = await agents.neutralAgent(sampleState);

      // All should produce valid signals
      expect(aggressiveResult.riskPhilosophySignals!.aggressive).toBeDefined();
      expect(conservativeResult.riskPhilosophySignals!.conservative).toBeDefined();
      expect(neutralResult.riskPhilosophySignals!.neutral).toBeDefined();
    });
  });

  describe('Signal Structure Validation', () => {
    it('should produce signals with all required fields', async () => {
      const agents = createRiskPhilosophyAgentNodes(sampleConfig);

      const aggressiveResult = await agents.aggressiveAgent(sampleState);
      const signal = aggressiveResult.riskPhilosophySignals!.aggressive!;

      // Verify all required fields
      expect(signal.agentName).toBeDefined();
      expect(signal.timestamp).toBeDefined();
      expect(signal.confidence).toBeDefined();
      expect(signal.direction).toBeDefined();
      expect(signal.fairProbability).toBeDefined();
      expect(signal.keyDrivers).toBeDefined();
      expect(signal.riskFactors).toBeDefined();
      expect(signal.metadata).toBeDefined();

      // Verify arrays have content
      expect(signal.keyDrivers.length).toBeGreaterThan(0);
      expect(signal.riskFactors.length).toBeGreaterThan(0);
    });

    it('should include timestamp in all signals', async () => {
      const agents = createRiskPhilosophyAgentNodes(sampleConfig);

      const beforeTime = Date.now();
      const aggressiveResult = await agents.aggressiveAgent(sampleState);
      const conservativeResult = await agents.conservativeAgent(sampleState);
      const neutralResult = await agents.neutralAgent(sampleState);
      const afterTime = Date.now();

      const aggressiveTimestamp = aggressiveResult.riskPhilosophySignals!.aggressive!.timestamp;
      const conservativeTimestamp = conservativeResult.riskPhilosophySignals!.conservative!.timestamp;
      const neutralTimestamp = neutralResult.riskPhilosophySignals!.neutral!.timestamp;

      expect(aggressiveTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(aggressiveTimestamp).toBeLessThanOrEqual(afterTime);
      expect(conservativeTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(conservativeTimestamp).toBeLessThanOrEqual(afterTime);
      expect(neutralTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(neutralTimestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing consensus gracefully', async () => {
      const stateWithoutConsensus: GraphStateType = {
        ...sampleState,
        consensus: null,
      };

      const agentNode = createAggressiveAgentNode(sampleConfig);
      const result = await agentNode(stateWithoutConsensus);

      // Should log error in audit trail
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog![0].data.success).toBe(false);
      expect(result.auditLog![0].data.error).toBe('No consensus probability available');
    });

    it('should handle missing MBD gracefully', async () => {
      const stateWithoutMBD: GraphStateType = {
        ...sampleState,
        mbd: null,
      };

      const agentNode = createConservativeAgentNode(sampleConfig);
      const result = await agentNode(stateWithoutMBD);

      // Should log error in audit trail
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog![0].data.success).toBe(false);
      expect(result.auditLog![0].data.error).toBe('No Market Briefing Document available');
    });
  });
});
