/**
 * Unit tests for audit logging and Opik integration
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import {
  getAuditTrail,
  getStateAtCheckpoint,
  listCheckpoints,
  getOpikTraceUrl,
  GraphExecutionLogger,
} from './audit-logger.js';
import type { GraphStateType } from '../models/state.js';

describe('Audit Logger Unit Tests', () => {
  let checkpointer: MemorySaver;
  const testMarketId = 'test-market-123';

  beforeEach(() => {
    checkpointer = new MemorySaver();
  });

  describe('getAuditTrail', () => {
    test('should retrieve audit trail with multiple checkpoints', async () => {
      // Create multiple checkpoints simulating workflow progression
      const states: Partial<GraphStateType>[] = [
        {
          conditionId: testMarketId,
          mbd: {
            marketId: testMarketId,
            conditionId: testMarketId,
            eventType: 'election',
            question: 'Will X win?',
            resolutionCriteria: 'Based on official results',
            expiryTimestamp: Date.now() + 86400000,
            currentProbability: 0.5,
            liquidityScore: 7.5,
            bidAskSpread: 0.02,
            volatilityRegime: 'medium',
            volume24h: 100000,
            metadata: {
              ambiguityFlags: [],
              keyCatalysts: [],
            },
          },
          ingestionError: null,
          agentSignals: [],
          agentErrors: [],
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: null,
          consensusError: null,
          recommendation: null,
          auditLog: [
            {
              stage: 'market_ingestion',
              timestamp: Date.now(),
              data: { success: true },
            },
          ],
        },
        {
          conditionId: testMarketId,
          mbd: {
            marketId: testMarketId,
            conditionId: testMarketId,
            eventType: 'election',
            question: 'Will X win?',
            resolutionCriteria: 'Based on official results',
            expiryTimestamp: Date.now() + 86400000,
            currentProbability: 0.5,
            liquidityScore: 7.5,
            bidAskSpread: 0.02,
            volatilityRegime: 'medium',
            volume24h: 100000,
            metadata: {
              ambiguityFlags: [],
              keyCatalysts: [],
            },
          },
          ingestionError: null,
          agentSignals: [
            {
              agentName: 'market_microstructure',
              timestamp: Date.now(),
              confidence: 0.8,
              direction: 'YES',
              fairProbability: 0.6,
              keyDrivers: ['momentum', 'liquidity'],
              riskFactors: ['volatility'],
              metadata: {},
            },
          ],
          agentErrors: [],
          bullThesis: null,
          bearThesis: null,
          debateRecord: null,
          consensus: null,
          consensusError: null,
          recommendation: null,
          auditLog: [
            {
              stage: 'market_ingestion',
              timestamp: Date.now(),
              data: { success: true },
            },
            {
              stage: 'agent_market_microstructure',
              timestamp: Date.now(),
              data: { success: true },
            },
          ],
        },
      ];

      // Save checkpoints
      for (let i = 0; i < states.length; i++) {
        await checkpointer.put(
          {
            configurable: {
              thread_id: testMarketId,
              checkpoint_id: `checkpoint-${i}`,
            },
          },
          {
            v: 1,
            id: `checkpoint-${i}`,
            ts: (Date.now() + i * 1000).toString(),
            channel_values: states[i],
            channel_versions: {},
            versions_seen: {},
          },
          { source: 'update', step: i, writes: {} } as any
        );
      }

      // Retrieve audit trail
      const auditTrail = await getAuditTrail(checkpointer, testMarketId);

      // Assertions
      expect(auditTrail).toBeDefined();
      expect(auditTrail.marketId).toBe(testMarketId);
      expect(auditTrail.timestamp).toBeGreaterThan(0);
      expect(auditTrail.stages.length).toBe(states.length);

      // Verify stages are in chronological order
      for (let i = 1; i < auditTrail.stages.length; i++) {
        expect(auditTrail.stages[i].timestamp).toBeGreaterThanOrEqual(auditTrail.stages[i - 1].timestamp);
      }
    });

    test('should handle empty checkpoint list', async () => {
      const auditTrail = await getAuditTrail(checkpointer, 'non-existent-market');

      expect(auditTrail).toBeDefined();
      expect(auditTrail.marketId).toBe('non-existent-market');
      expect(auditTrail.stages.length).toBe(0);
    });

    test('should extract errors from state', async () => {
      const stateWithError: Partial<GraphStateType> = {
        conditionId: testMarketId,
        mbd: null,
        ingestionError: {
          type: 'API_UNAVAILABLE',
          message: 'Polymarket API is down',
        },
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

      await checkpointer.put(
        {
          configurable: {
            thread_id: testMarketId,
            checkpoint_id: 'error-checkpoint',
          },
        },
        {
          v: 1,
          id: 'error-checkpoint',
          ts: Date.now().toString(),
          channel_values: stateWithError,
          channel_versions: {},
          versions_seen: {},
        },
        { source: 'update', step: 1, writes: {} } as any
      );

      const auditTrail = await getAuditTrail(checkpointer, testMarketId);

      expect(auditTrail.stages.length).toBeGreaterThan(0);
      const stageWithError = auditTrail.stages.find((s) => s.errors && s.errors.length > 0);
      expect(stageWithError).toBeDefined();
      expect(stageWithError!.errors).toBeDefined();
      expect(stageWithError!.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('getStateAtCheckpoint', () => {
    test('should retrieve state at specific checkpoint', async () => {
      const testState: Partial<GraphStateType> = {
        conditionId: testMarketId,
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
      };

      await checkpointer.put(
        {
          configurable: {
            thread_id: testMarketId,
            checkpoint_id: 'test-checkpoint',
          },
        },
        {
          v: 1,
          id: 'test-checkpoint',
          ts: Date.now().toString(),
          channel_values: testState,
          channel_versions: {},
          versions_seen: {},
        },
        { source: 'update', step: 1, writes: {} } as any
      );

      const retrievedState = await getStateAtCheckpoint(checkpointer, testMarketId, 'test-checkpoint');

      expect(retrievedState).toBeDefined();
      expect(retrievedState?.conditionId).toBe(testMarketId);
    });

    test('should return null for non-existent checkpoint', async () => {
      const retrievedState = await getStateAtCheckpoint(checkpointer, 'non-existent', 'non-existent-checkpoint');

      expect(retrievedState).toBeNull();
    });
  });

  describe('listCheckpoints', () => {
    test('should list all checkpoints for a market', async () => {
      const numCheckpoints = 3;

      for (let i = 0; i < numCheckpoints; i++) {
        await checkpointer.put(
          {
            configurable: {
              thread_id: testMarketId,
              checkpoint_id: `checkpoint-${i}`,
            },
          },
          {
            v: 1,
            id: `checkpoint-${i}`,
            ts: (Date.now() + i * 1000).toString(),
            channel_values: { conditionId: testMarketId },
            channel_versions: {},
            versions_seen: {},
          },
          { source: 'update', step: i, writes: {} } as any
        );
      }

      const checkpoints = await listCheckpoints(checkpointer, testMarketId);

      expect(checkpoints.length).toBe(numCheckpoints);

      for (const checkpoint of checkpoints) {
        expect(checkpoint.thread_id).toBe(testMarketId);
        expect(checkpoint.checkpoint_id).toBeDefined();
        expect(checkpoint.timestamp).toBeGreaterThan(0);
        expect(checkpoint.step).toBeGreaterThanOrEqual(0);
        expect(checkpoint.writes).toBeDefined();
      }
    });

    test('should return empty array for market with no checkpoints', async () => {
      const checkpoints = await listCheckpoints(checkpointer, 'non-existent-market');

      expect(checkpoints).toBeDefined();
      expect(checkpoints.length).toBe(0);
    });
  });

  describe('getOpikTraceUrl', () => {
    test('should generate correct Opik cloud URL', () => {
      const url = getOpikTraceUrl('test-project', 'market-123', 'my-workspace');

      expect(url).toBe('https://www.comet.com/opik/my-workspace/projects/test-project/traces?thread_id=market-123');
    });

    test('should generate correct Opik cloud URL without workspace', () => {
      const url = getOpikTraceUrl('test-project', 'market-123');

      expect(url).toBe('https://www.comet.com/opik/projects/test-project/traces?thread_id=market-123');
    });

    test('should generate correct self-hosted Opik URL', () => {
      const url = getOpikTraceUrl('test-project', 'market-123', undefined, 'https://opik.example.com');

      expect(url).toBe('https://opik.example.com/projects/test-project/traces?thread_id=market-123');
    });
  });

  describe('GraphExecutionLogger', () => {
    let logger: GraphExecutionLogger;

    beforeEach(() => {
      logger = new GraphExecutionLogger();
    });

    test('should log messages at different levels', () => {
      logger.debug('test-stage', 'Debug message', { detail: 'test' });
      logger.info('test-stage', 'Info message');
      logger.warn('test-stage', 'Warning message');
      logger.error('test-stage', 'Error message', { error: 'test error' });

      const logs = logger.getLogs();

      expect(logs.length).toBe(4);
      expect(logs[0].level).toBe('debug');
      expect(logs[1].level).toBe('info');
      expect(logs[2].level).toBe('warn');
      expect(logs[3].level).toBe('error');
    });

    test('should filter logs by level', () => {
      logger.info('stage1', 'Info 1');
      logger.error('stage2', 'Error 1');
      logger.info('stage3', 'Info 2');
      logger.error('stage4', 'Error 2');

      const infoLogs = logger.getLogsByLevel('info');
      const errorLogs = logger.getLogsByLevel('error');

      expect(infoLogs.length).toBe(2);
      expect(errorLogs.length).toBe(2);
    });

    test('should filter logs by stage', () => {
      logger.info('stage1', 'Message 1');
      logger.info('stage2', 'Message 2');
      logger.info('stage1', 'Message 3');

      const stage1Logs = logger.getLogsByStage('stage1');
      const stage2Logs = logger.getLogsByStage('stage2');

      expect(stage1Logs.length).toBe(2);
      expect(stage2Logs.length).toBe(1);
    });

    test('should clear logs', () => {
      logger.info('stage1', 'Message 1');
      logger.info('stage2', 'Message 2');

      expect(logger.getLogs().length).toBe(2);

      logger.clear();

      expect(logger.getLogs().length).toBe(0);
    });

    test('should include timestamp and data in log entries', () => {
      const testData = { key: 'value' };
      logger.info('test-stage', 'Test message', testData);

      const logs = logger.getLogs();

      expect(logs.length).toBe(1);
      expect(logs[0].timestamp).toBeGreaterThan(0);
      expect(logs[0].stage).toBe('test-stage');
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].data).toEqual(testData);
    });
  });
});
