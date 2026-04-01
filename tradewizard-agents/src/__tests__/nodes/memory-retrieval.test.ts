/**
 * Unit tests for Memory Retrieval Node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryRetrievalNode, createMemoryRetrievalNode } from './memory-retrieval.js';
import type { GraphStateType } from '../models/state.js';
import type {
  MemoryRetrievalService,
  AgentMemoryContext,
  HistoricalSignal,
} from '../database/memory-retrieval.js';

describe('Memory Retrieval Node', () => {
  // Mock memory retrieval service
  let mockMemoryService: MemoryRetrievalService;

  // Test agent names
  const agentNames = [
    'Market Microstructure Agent',
    'Polling Intelligence Agent',
    'Probability Baseline Agent',
    'Risk Assessment Agent',
  ];

  // Mock config with memory system enabled
  const mockConfig = {
    memorySystem: {
      enabled: true,
      maxSignalsPerAgent: 3,
      queryTimeoutMs: 5000,
      retryAttempts: 3,
    },
  } as any;

  beforeEach(() => {
    // Create a mock memory service
    mockMemoryService = {
      getAgentMemory: vi.fn(),
      getAllAgentMemories: vi.fn(),
    } as unknown as MemoryRetrievalService;
  });

  describe('Successful memory retrieval', () => {
    it('should retrieve memory context for all agents', async () => {
      // Arrange
      const conditionId = 'test-market-123';
      const mockMemoryContext = new Map<string, AgentMemoryContext>();

      // Create mock historical signals
      const mockSignals: HistoricalSignal[] = [
        {
          agentName: 'Market Microstructure Agent',
          marketId: conditionId,
          timestamp: new Date('2025-01-15T10:00:00Z'),
          direction: 'YES',
          fairProbability: 0.65,
          confidence: 0.8,
          keyDrivers: ['Strong buying pressure', 'High liquidity'],
          metadata: {},
        },
        {
          agentName: 'Market Microstructure Agent',
          marketId: conditionId,
          timestamp: new Date('2025-01-14T10:00:00Z'),
          direction: 'YES',
          fairProbability: 0.62,
          confidence: 0.75,
          keyDrivers: ['Moderate buying pressure'],
          metadata: {},
        },
      ];

      mockMemoryContext.set('Market Microstructure Agent', {
        agentName: 'Market Microstructure Agent',
        marketId: conditionId,
        historicalSignals: mockSignals,
        hasHistory: true,
      });

      // Other agents have no history
      agentNames.slice(1).forEach((agentName) => {
        mockMemoryContext.set(agentName, {
          agentName,
          marketId: conditionId,
          historicalSignals: [],
          hasHistory: false,
        });
      });

      vi.mocked(mockMemoryService.getAllAgentMemories).mockResolvedValue(mockMemoryContext);

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext?.size).toBe(4);
      expect(result.memoryContext?.get('Market Microstructure Agent')?.hasHistory).toBe(true);
      expect(
        result.memoryContext?.get('Market Microstructure Agent')?.historicalSignals.length
      ).toBe(2);
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog?.[0].stage).toBe('memory_retrieval');
      expect(result.auditLog?.[0].data).toMatchObject({
        success: true,
        marketId: conditionId,
        totalAgents: 4,
        agentsWithHistory: 1,
        totalSignals: 2,
      });
    });

    it('should handle empty memory context for all agents', async () => {
      // Arrange
      const conditionId = 'new-market-456';
      const mockMemoryContext = new Map<string, AgentMemoryContext>();

      // All agents have no history
      agentNames.forEach((agentName) => {
        mockMemoryContext.set(agentName, {
          agentName,
          marketId: conditionId,
          historicalSignals: [],
          hasHistory: false,
        });
      });

      vi.mocked(mockMemoryService.getAllAgentMemories).mockResolvedValue(mockMemoryContext);

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext?.size).toBe(4);
      expect(result.auditLog?.[0].data).toMatchObject({
        success: true,
        agentsWithHistory: 0,
        totalSignals: 0,
      });
    });

    it('should retrieve memory for multiple agents with history', async () => {
      // Arrange
      const conditionId = 'test-market-789';
      const mockMemoryContext = new Map<string, AgentMemoryContext>();

      // Two agents have history
      mockMemoryContext.set('Market Microstructure Agent', {
        agentName: 'Market Microstructure Agent',
        marketId: conditionId,
        historicalSignals: [
          {
            agentName: 'Market Microstructure Agent',
            marketId: conditionId,
            timestamp: new Date('2025-01-15T10:00:00Z'),
            direction: 'YES',
            fairProbability: 0.65,
            confidence: 0.8,
            keyDrivers: ['Strong buying pressure'],
            metadata: {},
          },
        ],
        hasHistory: true,
      });

      mockMemoryContext.set('Polling Intelligence Agent', {
        agentName: 'Polling Intelligence Agent',
        marketId: conditionId,
        historicalSignals: [
          {
            agentName: 'Polling Intelligence Agent',
            marketId: conditionId,
            timestamp: new Date('2025-01-15T10:00:00Z'),
            direction: 'NO',
            fairProbability: 0.45,
            confidence: 0.7,
            keyDrivers: ['Recent polls show decline'],
            metadata: {},
          },
        ],
        hasHistory: true,
      });

      // Other agents have no history
      agentNames.slice(2).forEach((agentName) => {
        mockMemoryContext.set(agentName, {
          agentName,
          marketId: conditionId,
          historicalSignals: [],
          hasHistory: false,
        });
      });

      vi.mocked(mockMemoryService.getAllAgentMemories).mockResolvedValue(mockMemoryContext);

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.memoryContext?.size).toBe(4);
      expect(result.auditLog?.[0].data).toMatchObject({
        success: true,
        agentsWithHistory: 2,
        totalSignals: 2,
      });
    });
  });

  describe('Error handling', () => {
    it('should handle missing market ID gracefully', async () => {
      // Arrange
      const state: Partial<GraphStateType> = {
        conditionId: '',
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext?.size).toBe(0);
      expect(result.auditLog?.[0].data).toMatchObject({
        success: false,
        reason: 'No market ID',
      });
      expect(mockMemoryService.getAllAgentMemories).not.toHaveBeenCalled();
    });

    it('should handle database connection errors gracefully', async () => {
      // Arrange
      const conditionId = 'test-market-123';

      vi.mocked(mockMemoryService.getAllAgentMemories).mockRejectedValue(
        new Error('Database connection failed')
      );

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext?.size).toBe(0); // Empty map allows agents to continue
      expect(result.auditLog?.[0].data).toMatchObject({
        success: false,
        marketId: conditionId,
        error: 'Database connection failed',
      });
    });

    it('should handle timeout errors gracefully', async () => {
      // Arrange
      const conditionId = 'test-market-456';

      // Simulate a slow query that exceeds timeout
      vi.mocked(mockMemoryService.getAllAgentMemories).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(new Map()), 10000); // 10 seconds (exceeds 5s timeout)
          })
      );

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext?.size).toBe(0);
      expect(result.auditLog?.[0].data).toMatchObject({
        success: false,
        error: 'Memory retrieval timeout',
      });
    });

    it('should handle query errors gracefully', async () => {
      // Arrange
      const conditionId = 'test-market-789';

      vi.mocked(mockMemoryService.getAllAgentMemories).mockRejectedValue(
        new Error('Query execution failed')
      );

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.memoryContext?.size).toBe(0);
      expect(result.auditLog?.[0].data).toMatchObject({
        success: false,
        error: 'Query execution failed',
      });
    });
  });

  describe('Audit logging', () => {
    it('should log successful retrieval with metrics', async () => {
      // Arrange
      const conditionId = 'test-market-123';
      const mockMemoryContext = new Map<string, AgentMemoryContext>();

      mockMemoryContext.set('Market Microstructure Agent', {
        agentName: 'Market Microstructure Agent',
        marketId: conditionId,
        historicalSignals: [
          {
            agentName: 'Market Microstructure Agent',
            marketId: conditionId,
            timestamp: new Date(),
            direction: 'YES',
            fairProbability: 0.65,
            confidence: 0.8,
            keyDrivers: [],
            metadata: {},
          },
        ],
        hasHistory: true,
      });

      agentNames.slice(1).forEach((agentName) => {
        mockMemoryContext.set(agentName, {
          agentName,
          marketId: conditionId,
          historicalSignals: [],
          hasHistory: false,
        });
      });

      vi.mocked(mockMemoryService.getAllAgentMemories).mockResolvedValue(mockMemoryContext);

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog?.length).toBe(1);
      expect(result.auditLog?.[0].stage).toBe('memory_retrieval');
      expect(result.auditLog?.[0].timestamp).toBeDefined();
      expect(result.auditLog?.[0].data).toMatchObject({
        success: true,
        marketId: conditionId,
        totalAgents: 4,
        agentsWithHistory: 1,
        totalSignals: 1,
      });
      expect(result.auditLog?.[0].data.duration).toBeDefined();
    });

    it('should log failed retrieval with error details', async () => {
      // Arrange
      const conditionId = 'test-market-456';

      vi.mocked(mockMemoryService.getAllAgentMemories).mockRejectedValue(
        new Error('Connection timeout')
      );

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );

      // Assert
      expect(result.auditLog?.[0].data).toMatchObject({
        success: false,
        marketId: conditionId,
        error: 'Connection timeout',
      });
      expect(result.auditLog?.[0].data.duration).toBeDefined();
    });
  });

  describe('Factory function', () => {
    it('should create a node function with bound dependencies', async () => {
      // Arrange
      const conditionId = 'test-market-123';
      const mockMemoryContext = new Map<string, AgentMemoryContext>();

      agentNames.forEach((agentName) => {
        mockMemoryContext.set(agentName, {
          agentName,
          marketId: conditionId,
          historicalSignals: [],
          hasHistory: false,
        });
      });

      vi.mocked(mockMemoryService.getAllAgentMemories).mockResolvedValue(mockMemoryContext);

      const nodeFunction = createMemoryRetrievalNode(mockMemoryService, agentNames, mockConfig);

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const result = await nodeFunction(state as GraphStateType);

      // Assert
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext?.size).toBe(4);
      expect(mockMemoryService.getAllAgentMemories).toHaveBeenCalledWith(
        conditionId,
        agentNames,
        3
      );
    });
  });

  describe('Performance', () => {
    it('should complete retrieval within reasonable time', async () => {
      // Arrange
      const conditionId = 'test-market-123';
      const mockMemoryContext = new Map<string, AgentMemoryContext>();

      agentNames.forEach((agentName) => {
        mockMemoryContext.set(agentName, {
          agentName,
          marketId: conditionId,
          historicalSignals: [],
          hasHistory: false,
        });
      });

      vi.mocked(mockMemoryService.getAllAgentMemories).mockResolvedValue(mockMemoryContext);

      const state: Partial<GraphStateType> = {
        conditionId,
        memoryContext: new Map(),
        auditLog: [],
      };

      // Act
      const startTime = Date.now();
      const result = await memoryRetrievalNode(
        state as GraphStateType,
        mockMemoryService,
        agentNames,
        mockConfig
      );
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
      expect(result.auditLog?.[0].data.duration).toBeLessThan(100);
    });
  });
});
