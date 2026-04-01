/**
 * Unit tests for agent signal fusion error handling
 */

import { describe, it, expect } from 'vitest';
import { agentSignalFusionNode } from './agent-signal-fusion.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

describe('Agent Signal Fusion Error Handling', () => {
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
      projectName: 'test',
      trackCosts: true,
      tags: [],
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
    advancedAgents: {
      eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
      pollingStatistical: { enabled: false, pollingIntelligence: true, historicalPattern: true },
      sentimentNarrative: { enabled: false, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
      priceAction: { enabled: false, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
      eventScenario: { enabled: false, catalyst: true, tailRisk: true },
      riskPhilosophy: { enabled: false, aggressive: true, conservative: true, neutral: true },
    },
    externalData: {
      news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
      polling: { provider: 'none', cacheTTL: 3600 },
      social: { providers: [], cacheTTL: 300, maxMentions: 100 },
    },
    signalFusion: {
      baseWeights: {},
      contextAdjustments: true,
      conflictThreshold: 0.20,
      alignmentBonus: 0.20,
    },
    costOptimization: {
      maxCostPerAnalysis: 2.0,
      skipLowImpactAgents: false,
      batchLLMRequests: true,
    },
    performanceTracking: {
      enabled: false,
      evaluateOnResolution: true,
      minSampleSize: 10,
    },
  };

  const createMockSignal = (agentName: string, fairProbability: number): AgentSignal => ({
    agentName,
    confidence: 0.8,
    direction: fairProbability > 0.5 ? 'bullish' : 'bearish',
    fairProbability,
    keyDrivers: ['Test driver'],
    reasoning: 'Test reasoning',
  });

  describe('Signal fusion failure handling', () => {
    it('should handle empty agent signals', async () => {
      const state: GraphStateType = {
        mbd: {
          marketId: 'test-market',
          question: 'Test?',
          description: 'Test',
          endDate: Date.now() + 86400000,
          volume24h: 10000,
          liquidityScore: 8,
          currentProbability: 0.5,
          eventType: 'election',
          tags: [],
          outcomes: ['YES', 'NO'],
        },
        agentSignals: [],
        auditLog: [],
      };

      const result = await agentSignalFusionNode(state, mockConfig);

      expect(result.fusedSignal).toBeNull();
      expect(result.auditLog).toHaveLength(1);
      expect(result.auditLog![0].data.success).toBe(false);
    });

    it('should handle extreme signal divergence', async () => {
      const state: GraphStateType = {
        mbd: {
          marketId: 'test-market',
          question: 'Test?',
          description: 'Test',
          endDate: Date.now() + 86400000,
          volume24h: 10000,
          liquidityScore: 8,
          currentProbability: 0.5,
          eventType: 'election',
          tags: [],
          outcomes: ['YES', 'NO'],
        },
        agentSignals: [
          createMockSignal('agent1', 0.1),
          createMockSignal('agent2', 0.9),
        ],
        activeAgents: ['agent1', 'agent2'],
        auditLog: [],
      };

      const result = await agentSignalFusionNode(state, mockConfig);

      expect(result.fusedSignal).not.toBeNull();
      expect(result.fusedSignal!.metadata.extremeDivergence).toBe(true);
      expect(result.fusedSignal!.metadata.probabilityRange).toBeGreaterThan(0.7);
      // Confidence should be reduced due to extreme divergence
      expect(result.fusedSignal!.confidence).toBeLessThan(0.5);
    });

    it('should detect conflicting signals', async () => {
      const state: GraphStateType = {
        mbd: {
          marketId: 'test-market',
          question: 'Test?',
          description: 'Test',
          endDate: Date.now() + 86400000,
          volume24h: 10000,
          liquidityScore: 8,
          currentProbability: 0.5,
          eventType: 'election',
          tags: [],
          outcomes: ['YES', 'NO'],
        },
        agentSignals: [
          createMockSignal('agent1', 0.3),
          createMockSignal('agent2', 0.7),
        ],
        activeAgents: ['agent1', 'agent2'],
        auditLog: [],
      };

      const result = await agentSignalFusionNode(state, mockConfig);

      expect(result.fusedSignal).not.toBeNull();
      expect(result.fusedSignal!.conflictingSignals.length).toBeGreaterThan(0);
      expect(result.fusedSignal!.conflictingSignals[0].disagreement).toBeGreaterThan(0.2);
    });

    it('should handle weight calculation failure gracefully', async () => {
      const state: GraphStateType = {
        mbd: {
          marketId: 'test-market',
          question: 'Test?',
          description: 'Test',
          endDate: Date.now() + 86400000,
          volume24h: 10000,
          liquidityScore: 8,
          currentProbability: 0.5,
          eventType: 'election',
          tags: [],
          outcomes: ['YES', 'NO'],
        },
        agentSignals: [
          createMockSignal('agent1', 0.5),
          createMockSignal('agent2', 0.6),
        ],
        activeAgents: ['agent1', 'agent2'],
        auditLog: [],
      };

      // Even with invalid config, should fall back to equal weights
      const invalidConfig = {
        ...mockConfig,
        signalFusion: {
          ...mockConfig.signalFusion,
          baseWeights: null as any, // Invalid
        },
      };

      const result = await agentSignalFusionNode(state, invalidConfig);

      expect(result.fusedSignal).not.toBeNull();
      expect(result.fusedSignal!.fairProbability).toBeGreaterThan(0);
      expect(result.fusedSignal!.fairProbability).toBeLessThan(1);
    });
  });

  describe('Configuration error handling', () => {
    it('should use default weights when base weights not configured', async () => {
      const state: GraphStateType = {
        mbd: {
          marketId: 'test-market',
          question: 'Test?',
          description: 'Test',
          endDate: Date.now() + 86400000,
          volume24h: 10000,
          liquidityScore: 8,
          currentProbability: 0.5,
          eventType: 'election',
          tags: [],
          outcomes: ['YES', 'NO'],
        },
        agentSignals: [
          createMockSignal('market_microstructure', 0.5),
          createMockSignal('probability_baseline', 0.6),
        ],
        activeAgents: ['market_microstructure', 'probability_baseline'],
        auditLog: [],
      };

      const configWithoutWeights = {
        ...mockConfig,
        signalFusion: {
          ...mockConfig.signalFusion,
          baseWeights: {},
        },
      };

      const result = await agentSignalFusionNode(state, configWithoutWeights);

      expect(result.fusedSignal).not.toBeNull();
      expect(result.fusedSignal!.weights).toBeDefined();
      expect(Object.keys(result.fusedSignal!.weights).length).toBe(2);
    });
  });
});
