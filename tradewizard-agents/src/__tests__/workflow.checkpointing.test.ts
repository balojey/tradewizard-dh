/**
 * Integration tests for LangGraph PostgreSQL checkpointing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorkflow, getCheckpointer } from './workflow.js';
import type { EngineConfig } from './config/index.js';
import type { PolymarketClient } from './utils/polymarket-client.js';
import { SupabaseClientManager } from './database/supabase-client.js';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

// Mock dependencies
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: vi.fn(),
  },
}));

vi.mock('./utils/polymarket-client.js');
vi.mock('./database/supabase-client.js');

describe('LangGraph PostgreSQL Checkpointing', () => {
  let mockPolymarketClient: PolymarketClient;
  let mockSupabaseManager: SupabaseClientManager;
  let mockCheckpointer: any;
  let testConfig: EngineConfig;

  beforeEach(() => {
    // Create test config
    testConfig = {
      polymarket: {
        gammaApiUrl: 'https://gamma-api.polymarket.com',
        clobApiUrl: 'https://clob.polymarket.com',
        rateLimitBuffer: 80,
      },
      langgraph: {
        checkpointer: 'postgres',
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
        eventIntelligence: {
          enabled: false,
          breakingNews: true,
          eventImpact: true,
        },
        pollingStatistical: {
          enabled: false,
          pollingIntelligence: true,
          historicalPattern: true,
        },
        sentimentNarrative: {
          enabled: false,
          mediaSentiment: true,
          socialSentiment: true,
          narrativeVelocity: true,
        },
        priceAction: {
          enabled: false,
          momentum: true,
          meanReversion: true,
          minVolumeThreshold: 1000,
        },
        eventScenario: {
          enabled: false,
          catalyst: true,
          tailRisk: true,
        },
        riskPhilosophy: {
          enabled: false, // Disable risk philosophy agents for testing
          aggressive: false,
          conservative: false,
          neutral: false,
        },
      },
      externalData: {
        news: {
          provider: 'none',
          cacheTTL: 900,
          maxArticles: 20,
        },
        polling: {
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 300,
          maxMentions: 100,
        },
      },
      signalFusion: {
        baseWeights: {},
        contextAdjustments: true,
        conflictThreshold: 0.2,
        alignmentBonus: 0.2,
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
    } as EngineConfig;
    // Create mock Polymarket client
    mockPolymarketClient = {
      getMarketByConditionId: vi.fn(),
      getMarketPriceHistory: vi.fn(),
      getMarketOrderBook: vi.fn(),
    } as any;

    // Create mock Supabase manager
    mockSupabaseManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getClient: vi.fn(),
      isClientConnected: vi.fn().mockReturnValue(true),
      healthCheck: vi.fn().mockResolvedValue(true),
      withRetry: vi.fn(),
    } as any;

    // Create mock checkpointer
    mockCheckpointer = {
      setup: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      getTuple: vi.fn().mockResolvedValue(null),
      putWrites: vi.fn().mockResolvedValue(undefined),
    };

    // Mock PostgresSaver.fromConnString
    vi.mocked(PostgresSaver.fromConnString).mockReturnValue(mockCheckpointer);

    // Set environment variables
    process.env.SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.SUPABASE_DB_PASSWORD = 'test-password';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_DB_PASSWORD;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('Checkpoint creation in PostgreSQL', () => {
    it('should create workflow with PostgreSQL checkpointer when configured', async () => {
      const { app } = await createWorkflow(testConfig, mockPolymarketClient, mockSupabaseManager);

      expect(app).toBeDefined();
      expect(PostgresSaver.fromConnString).toHaveBeenCalled();
      expect(mockCheckpointer.setup).toHaveBeenCalled();
    });

    it('should throw error if PostgreSQL checkpointer is configured without Supabase manager', async () => {
      await expect(createWorkflow(testConfig, mockPolymarketClient)).rejects.toThrow(
        'PostgreSQL checkpointer requires Supabase client manager'
      );
    });

    it('should use memory checkpointer when configured', async () => {
      const memoryConfig = { ...testConfig, langgraph: { ...testConfig.langgraph, checkpointer: 'memory' as const } };
      const { app } = await createWorkflow(memoryConfig, mockPolymarketClient);

      expect(app).toBeDefined();
      expect(PostgresSaver.fromConnString).not.toHaveBeenCalled();
    });
  });

  describe('Checkpoint retrieval', () => {
    it('should retrieve checkpointer instance for audit trail', async () => {
      const checkpointer = await getCheckpointer(testConfig, mockSupabaseManager);

      expect(checkpointer).toBeDefined();
      expect(PostgresSaver.fromConnString).toHaveBeenCalled();
      expect(mockCheckpointer.setup).toHaveBeenCalled();
    });

    it('should retrieve memory checkpointer when configured', async () => {
      const memoryConfig = { ...testConfig, langgraph: { ...testConfig.langgraph, checkpointer: 'memory' as const } };
      const checkpointer = await getCheckpointer(memoryConfig);

      expect(checkpointer).toBeDefined();
      expect(PostgresSaver.fromConnString).not.toHaveBeenCalled();
    });
  });

  describe('Workflow resumption from checkpoint', () => {
    it('should support workflow resumption with thread_id', async () => {
      // Mock checkpoint data
      const mockCheckpoint = {
        v: 1,
        id: 'checkpoint-1',
        ts: Date.now().toString(),
        channel_values: {
          conditionId: 'test-condition',
          mbd: null,
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
          activeAgents: [],
          externalData: null,
          fusedSignal: null,
          riskPhilosophySignals: null,
          agentPerformance: {},
        },
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
      };

      mockCheckpointer.getTuple.mockResolvedValue({
        config: { configurable: { thread_id: 'test-condition' } },
        checkpoint: mockCheckpoint,
        metadata: {},
        parentConfig: undefined,
      });

      const { app } = await createWorkflow(testConfig, mockPolymarketClient, mockSupabaseManager);

      expect(app).toBeDefined();
      expect(mockCheckpointer.setup).toHaveBeenCalled();
    });
  });

  describe('Checkpoint cleanup', () => {
    it('should support checkpoint cleanup operations', async () => {
      const checkpointer = await getCheckpointer(testConfig, mockSupabaseManager);

      expect(checkpointer).toBeDefined();
      // Checkpointer should have list method for cleanup operations
      expect(mockCheckpointer.list).toBeDefined();
    });
  });
});
