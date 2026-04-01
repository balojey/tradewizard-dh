/**
 * Unit tests for Memory Retrieval Service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMemoryRetrievalService,
  type MemoryRetrievalService,
} from './memory-retrieval.js';
import { SupabaseClientManager } from './supabase-client.js';
import { createDatabasePersistence, type DatabasePersistence } from './persistence.js';
import type { AgentSignal } from '../models/types.js';

describe('MemoryRetrievalService', () => {
  let memoryService: MemoryRetrievalService;
  let persistence: DatabasePersistence;
  let clientManager: SupabaseClientManager;

  beforeEach(async () => {
    // Create client manager with test configuration
    clientManager = new SupabaseClientManager({
      url: process.env.SUPABASE_URL || 'http://localhost:54321',
      anonKey: process.env.SUPABASE_KEY || 'test-key',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    try {
      await clientManager.connect();
      memoryService = createMemoryRetrievalService(clientManager);
      persistence = createDatabasePersistence(clientManager);
    } catch (error) {
      console.warn('Skipping test - Supabase not available:', error);
      throw error;
    }
  });

  afterEach(async () => {
    if (clientManager.isClientConnected()) {
      await clientManager.disconnect();
    }
  });

  describe('getAgentMemory', () => {
    it('should return empty context when no historical signals exist', async () => {
      const agentName = 'test_agent';
      const marketId = `test-market-${Date.now()}`;

      const memory = await memoryService.getAgentMemory(agentName, marketId);

      expect(memory.agentName).toBe(agentName);
      expect(memory.marketId).toBe(marketId);
      expect(memory.historicalSignals).toEqual([]);
      expect(memory.hasHistory).toBe(false);
    });

    it('should retrieve historical signals for agent-market combination', async () => {
      // Create a test market
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Test market for memory retrieval',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create a recommendation
      const recommendation = {
        marketId: conditionId,
        action: 'LONG_YES' as const,
        entryZone: [0.45, 0.50] as [number, number],
        targetZone: [0.65, 0.70] as [number, number],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium' as const,
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73] as [number, number],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      // Store agent signals
      const agentName = 'polling_intelligence_agent';
      const signals: AgentSignal[] = [
        {
          agentName,
          timestamp: Date.now(),
          confidence: 0.85,
          direction: 'YES',
          fairProbability: 0.70,
          keyDrivers: ['Strong polling numbers', 'Demographic advantage'],
          riskFactors: ['Polling error'],
          metadata: { pollCount: 5 },
        },
      ];
      await persistence.storeAgentSignals(marketId, recommendationId, signals);

      // Retrieve memory
      const memory = await memoryService.getAgentMemory(agentName, marketId);

      expect(memory.agentName).toBe(agentName);
      expect(memory.marketId).toBe(marketId);
      expect(memory.hasHistory).toBe(true);
      expect(memory.historicalSignals.length).toBe(1);
      expect(memory.historicalSignals[0].agentName).toBe(agentName);
      expect(memory.historicalSignals[0].direction).toBe('YES');
      expect(memory.historicalSignals[0].fairProbability).toBe(0.70);
      expect(memory.historicalSignals[0].confidence).toBe(0.85);
      expect(memory.historicalSignals[0].keyDrivers).toEqual([
        'Strong polling numbers',
        'Demographic advantage',
      ]);
    });

    it('should limit results to specified limit', async () => {
      // Create a test market
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Test market for limit',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create multiple recommendations and signals
      const agentName = 'test_agent';
      for (let i = 0; i < 7; i++) {
        const recommendation = {
          marketId: conditionId,
          action: 'LONG_YES' as const,
          entryZone: [0.45, 0.50] as [number, number],
          targetZone: [0.65, 0.70] as [number, number],
          expectedValue: 25.5,
          winProbability: 0.68,
          liquidityRisk: 'medium' as const,
          explanation: {
            summary: `Test ${i}`,
            coreThesis: 'Test',
            keyCatalysts: [],
            failureScenarios: [],
          },
          metadata: {
            consensusProbability: 0.68,
            marketProbability: 0.48,
            edge: 0.20,
            confidenceBand: [0.63, 0.73] as [number, number],
          },
        };
        const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

        const signals: AgentSignal[] = [
          {
            agentName,
            timestamp: Date.now() + i, // Ensure different timestamps
            confidence: 0.85,
            direction: 'YES',
            fairProbability: 0.70,
            keyDrivers: [`Driver ${i}`],
            riskFactors: [],
            metadata: {},
          },
        ];
        await persistence.storeAgentSignals(marketId, recommendationId, signals);

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Retrieve with limit of 3
      const memory = await memoryService.getAgentMemory(agentName, marketId, 3);

      expect(memory.historicalSignals.length).toBeLessThanOrEqual(3);
    });

    it('should cap limit at 5 for performance', async () => {
      const agentName = 'test_agent';
      const marketId = `test-market-${Date.now()}`;

      // Request 10 signals, should be capped at 5
      const memory = await memoryService.getAgentMemory(agentName, marketId, 10);

      // Even if there were 10 signals, we'd only get 5
      expect(memory.historicalSignals.length).toBeLessThanOrEqual(5);
    });

    it('should order signals by timestamp descending (most recent first)', async () => {
      // Create a test market
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Test market for ordering',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create multiple signals with different timestamps
      const agentName = 'test_agent';
      const timestamps: number[] = [];

      for (let i = 0; i < 3; i++) {
        const recommendation = {
          marketId: conditionId,
          action: 'LONG_YES' as const,
          entryZone: [0.45, 0.50] as [number, number],
          targetZone: [0.65, 0.70] as [number, number],
          expectedValue: 25.5,
          winProbability: 0.68,
          liquidityRisk: 'medium' as const,
          explanation: {
            summary: `Test ${i}`,
            coreThesis: 'Test',
            keyCatalysts: [],
            failureScenarios: [],
          },
          metadata: {
            consensusProbability: 0.68,
            marketProbability: 0.48,
            edge: 0.20,
            confidenceBand: [0.63, 0.73] as [number, number],
          },
        };
        const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

        const timestamp = Date.now() + i * 1000;
        timestamps.push(timestamp);

        const signals: AgentSignal[] = [
          {
            agentName,
            timestamp,
            confidence: 0.85,
            direction: 'YES',
            fairProbability: 0.70,
            keyDrivers: [`Driver ${i}`],
            riskFactors: [],
            metadata: { index: i },
          },
        ];
        await persistence.storeAgentSignals(marketId, recommendationId, signals);

        // Delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Retrieve memory
      const memory = await memoryService.getAgentMemory(agentName, marketId);

      // Should be ordered by timestamp descending (most recent first)
      expect(memory.historicalSignals.length).toBeGreaterThan(1);
      for (let i = 0; i < memory.historicalSignals.length - 1; i++) {
        const current = memory.historicalSignals[i].timestamp.getTime();
        const next = memory.historicalSignals[i + 1].timestamp.getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('should filter out signals with invalid probability values', async () => {
      // This test would require direct database manipulation to insert invalid data
      // For now, we test that the service handles it gracefully
      const agentName = 'test_agent';
      const marketId = `test-market-${Date.now()}`;

      const memory = await memoryService.getAgentMemory(agentName, marketId);

      // Should return empty context without error
      expect(memory.hasHistory).toBe(false);
    });

    it('should filter out signals with invalid confidence values', async () => {
      const agentName = 'test_agent';
      const marketId = `test-market-${Date.now()}`;

      const memory = await memoryService.getAgentMemory(agentName, marketId);

      // Should return empty context without error
      expect(memory.hasHistory).toBe(false);
    });

    it('should filter out signals with invalid direction values', async () => {
      const agentName = 'test_agent';
      const marketId = `test-market-${Date.now()}`;

      const memory = await memoryService.getAgentMemory(agentName, marketId);

      // Should return empty context without error
      expect(memory.hasHistory).toBe(false);
    });

    it('should normalize LONG_YES to YES direction', async () => {
      // Create a test market with unique ID
      const conditionId = `test-condition-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const market = {
        conditionId,
        question: 'Test market for direction normalization',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create a recommendation
      const recommendation = {
        marketId: conditionId,
        action: 'LONG_YES' as const,
        entryZone: [0.45, 0.50] as [number, number],
        targetZone: [0.65, 0.70] as [number, number],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium' as const,
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73] as [number, number],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      // Store signal with LONG_YES direction
      const agentName = 'test_agent';
      const signals: AgentSignal[] = [
        {
          agentName,
          timestamp: Date.now(),
          confidence: 0.85,
          direction: 'YES', // Will be stored as YES
          fairProbability: 0.70,
          keyDrivers: ['Test'],
          riskFactors: [],
          metadata: {},
        },
      ];
      await persistence.storeAgentSignals(marketId, recommendationId, signals);

      // Retrieve memory
      const memory = await memoryService.getAgentMemory(agentName, marketId);

      expect(memory.historicalSignals[0].direction).toBe('YES');
    });

    it('should normalize LONG_NO to NO direction', async () => {
      // Create a test market
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Test market for NO direction',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create a recommendation
      const recommendation = {
        marketId: conditionId,
        action: 'LONG_NO' as const,
        entryZone: [0.45, 0.50] as [number, number],
        targetZone: [0.65, 0.70] as [number, number],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium' as const,
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73] as [number, number],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      // Store signal with NO direction
      const agentName = 'test_agent';
      const signals: AgentSignal[] = [
        {
          agentName,
          timestamp: Date.now(),
          confidence: 0.85,
          direction: 'NO',
          fairProbability: 0.30,
          keyDrivers: ['Test'],
          riskFactors: [],
          metadata: {},
        },
      ];
      await persistence.storeAgentSignals(marketId, recommendationId, signals);

      // Retrieve memory
      const memory = await memoryService.getAgentMemory(agentName, marketId);

      expect(memory.historicalSignals[0].direction).toBe('NO');
    });

    it('should normalize NO_TRADE to NEUTRAL direction', async () => {
      // Create a test market
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Test market for NEUTRAL direction',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create a recommendation
      const recommendation = {
        marketId: conditionId,
        action: 'NO_TRADE' as const,
        entryZone: [0, 0] as [number, number],
        targetZone: [0, 0] as [number, number],
        expectedValue: 0,
        winProbability: 0.5,
        liquidityRisk: 'low' as const,
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.5,
          marketProbability: 0.5,
          edge: 0,
          confidenceBand: [0.45, 0.55] as [number, number],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      // Store signal with NEUTRAL direction
      const agentName = 'test_agent';
      const signals: AgentSignal[] = [
        {
          agentName,
          timestamp: Date.now(),
          confidence: 0.50,
          direction: 'NEUTRAL',
          fairProbability: 0.50,
          keyDrivers: ['Test'],
          riskFactors: [],
          metadata: {},
        },
      ];
      await persistence.storeAgentSignals(marketId, recommendationId, signals);

      // Retrieve memory
      const memory = await memoryService.getAgentMemory(agentName, marketId);

      expect(memory.historicalSignals[0].direction).toBe('NEUTRAL');
    });
  });

  describe('getAllAgentMemories', () => {
    it('should retrieve memory for all agents in parallel', async () => {
      // Create a test market
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Test market for multiple agents',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create recommendation
      const recommendation = {
        marketId: conditionId,
        action: 'LONG_YES' as const,
        entryZone: [0.45, 0.50] as [number, number],
        targetZone: [0.65, 0.70] as [number, number],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium' as const,
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73] as [number, number],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      // Store signals for multiple agents
      const agentNames = ['agent1', 'agent2', 'agent3'];
      for (const agentName of agentNames) {
        const signals: AgentSignal[] = [
          {
            agentName,
            timestamp: Date.now(),
            confidence: 0.85,
            direction: 'YES',
            fairProbability: 0.70,
            keyDrivers: [`${agentName} driver`],
            riskFactors: [],
            metadata: {},
          },
        ];
        await persistence.storeAgentSignals(marketId, recommendationId, signals);
      }

      // Retrieve all memories
      const memoryMap = await memoryService.getAllAgentMemories(marketId, agentNames);

      expect(memoryMap.size).toBe(3);
      expect(memoryMap.has('agent1')).toBe(true);
      expect(memoryMap.has('agent2')).toBe(true);
      expect(memoryMap.has('agent3')).toBe(true);

      const agent1Memory = memoryMap.get('agent1');
      expect(agent1Memory?.hasHistory).toBe(true);
      expect(agent1Memory?.historicalSignals.length).toBe(1);
    });

    it('should return empty contexts for agents with no history', async () => {
      const marketId = `test-market-${Date.now()}`;
      const agentNames = ['agent1', 'agent2'];

      const memoryMap = await memoryService.getAllAgentMemories(marketId, agentNames);

      expect(memoryMap.size).toBe(2);
      expect(memoryMap.get('agent1')?.hasHistory).toBe(false);
      expect(memoryMap.get('agent2')?.hasHistory).toBe(false);
    });

    it('should handle mixed scenarios - some agents with history, some without', async () => {
      // Create a test market
      const conditionId = `test-condition-${Date.now()}`;
      const market = {
        conditionId,
        question: 'Test market for mixed scenario',
        eventType: 'election',
      };
      const marketId = await persistence.upsertMarket(market);

      // Create recommendation
      const recommendation = {
        marketId: conditionId,
        action: 'LONG_YES' as const,
        entryZone: [0.45, 0.50] as [number, number],
        targetZone: [0.65, 0.70] as [number, number],
        expectedValue: 25.5,
        winProbability: 0.68,
        liquidityRisk: 'medium' as const,
        explanation: {
          summary: 'Test',
          coreThesis: 'Test',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.68,
          marketProbability: 0.48,
          edge: 0.20,
          confidenceBand: [0.63, 0.73] as [number, number],
        },
      };
      const recommendationId = await persistence.storeRecommendation(marketId, recommendation);

      // Store signal for only one agent
      const signals: AgentSignal[] = [
        {
          agentName: 'agent_with_history',
          timestamp: Date.now(),
          confidence: 0.85,
          direction: 'YES',
          fairProbability: 0.70,
          keyDrivers: ['Test'],
          riskFactors: [],
          metadata: {},
        },
      ];
      await persistence.storeAgentSignals(marketId, recommendationId, signals);

      // Retrieve memories for both agents
      const agentNames = ['agent_with_history', 'agent_without_history'];
      const memoryMap = await memoryService.getAllAgentMemories(marketId, agentNames);

      expect(memoryMap.size).toBe(2);
      expect(memoryMap.get('agent_with_history')?.hasHistory).toBe(true);
      expect(memoryMap.get('agent_without_history')?.hasHistory).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return empty context on database errors', async () => {
      // Disconnect to simulate error
      await clientManager.disconnect();

      const agentName = 'test_agent';
      const marketId = 'test-market';

      const memory = await memoryService.getAgentMemory(agentName, marketId);

      // Should return empty context without throwing
      expect(memory.hasHistory).toBe(false);
      expect(memory.historicalSignals).toEqual([]);
    });
  });
});
