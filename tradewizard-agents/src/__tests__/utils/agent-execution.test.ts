/**
 * Unit tests for agent execution utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeAgentWithTimeout,
  executeAgentsInParallel,
  filterSuccessfulSignals,
  createAgentExecutionAuditEntry,
} from './agent-execution.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';

describe('Agent Execution Error Handling', () => {
  const mockState: GraphStateType = {
    mbd: {
      marketId: 'test-market',
      question: 'Test question?',
      description: 'Test description',
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

  const mockSignal: AgentSignal = {
    agentName: 'test_agent',
    confidence: 0.8,
    direction: 'bullish',
    fairProbability: 0.6,
    keyDrivers: ['Test driver'],
    reasoning: 'Test reasoning',
  };

  describe('executeAgentWithTimeout', () => {
    it('should execute agent successfully', async () => {
      const agentFn = vi.fn().mockResolvedValue({
        agentSignals: [mockSignal],
      });

      const result = await executeAgentWithTimeout('test_agent', agentFn, mockState);

      expect(result.success).toBe(true);
      expect(result.signal).toEqual(mockSignal);
      expect(result.timedOut).toBeUndefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle agent timeout', async () => {
      const agentFn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const result = await executeAgentWithTimeout('test_agent', agentFn, mockState, 50);

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('timed out');
    });

    it('should handle agent execution failure', async () => {
      const agentFn = vi.fn().mockRejectedValue(new Error('Agent failed'));

      const result = await executeAgentWithTimeout('test_agent', agentFn, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent failed');
      expect(result.timedOut).toBe(false);
    });

    it('should handle agent returning no signal', async () => {
      const agentFn = vi.fn().mockResolvedValue({});

      const result = await executeAgentWithTimeout('test_agent', agentFn, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('did not produce a valid signal');
    });
  });

  describe('executeAgentsInParallel', () => {
    it('should execute multiple agents successfully', async () => {
      const agents = [
        {
          name: 'agent1',
          fn: vi.fn().mockResolvedValue({ agentSignals: [{ ...mockSignal, agentName: 'agent1' }] }),
        },
        {
          name: 'agent2',
          fn: vi.fn().mockResolvedValue({ agentSignals: [{ ...mockSignal, agentName: 'agent2' }] }),
        },
      ];

      const results = await executeAgentsInParallel(agents, mockState);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should isolate agent failures', async () => {
      const agents = [
        {
          name: 'agent1',
          fn: vi.fn().mockResolvedValue({ agentSignals: [{ ...mockSignal, agentName: 'agent1' }] }),
        },
        {
          name: 'agent2',
          fn: vi.fn().mockRejectedValue(new Error('Agent 2 failed')),
        },
        {
          name: 'agent3',
          fn: vi.fn().mockResolvedValue({ agentSignals: [{ ...mockSignal, agentName: 'agent3' }] }),
        },
      ];

      const results = await executeAgentsInParallel(agents, mockState);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should isolate agent timeouts', async () => {
      const agents = [
        {
          name: 'agent1',
          fn: vi.fn().mockResolvedValue({ agentSignals: [{ ...mockSignal, agentName: 'agent1' }] }),
        },
        {
          name: 'agent2',
          fn: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
        },
      ];

      const results = await executeAgentsInParallel(agents, mockState, 50);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].timedOut).toBe(true);
    });
  });

  describe('filterSuccessfulSignals', () => {
    it('should filter successful signals', () => {
      const results = [
        { success: true, signal: { ...mockSignal, agentName: 'agent1' }, duration: 100 },
        { success: false, error: 'Failed', duration: 50 },
        { success: true, signal: { ...mockSignal, agentName: 'agent2' }, duration: 120 },
      ];

      const signals = filterSuccessfulSignals(results);

      expect(signals).toHaveLength(2);
      expect(signals[0].agentName).toBe('agent1');
      expect(signals[1].agentName).toBe('agent2');
    });

    it('should return empty array when no successful signals', () => {
      const results = [
        { success: false, error: 'Failed 1', duration: 50 },
        { success: false, error: 'Failed 2', duration: 60 },
      ];

      const signals = filterSuccessfulSignals(results);

      expect(signals).toHaveLength(0);
    });
  });

  describe('createAgentExecutionAuditEntry', () => {
    it('should create audit entry with execution statistics', () => {
      const results = [
        { success: true, signal: mockSignal, duration: 100 },
        { success: false, error: 'Agent test_agent failed', timedOut: false, duration: 50 },
        { success: false, error: 'Agent test_agent timed out', timedOut: true, duration: 200 },
      ];

      const auditEntry = createAgentExecutionAuditEntry(results);

      expect(auditEntry.totalAgents).toBe(3);
      expect(auditEntry.successfulAgents).toBe(1);
      expect(auditEntry.failedAgents).toBe(2);
      expect(auditEntry.timedOutAgents).toBe(1);
      expect(auditEntry.averageDuration).toBe((100 + 50 + 200) / 3);
      expect(auditEntry.failures).toHaveLength(2);
    });
  });
});
