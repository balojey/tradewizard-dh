/**
 * Smoke tests for polling tools
 * 
 * These tests verify that the basic tool infrastructure works correctly
 * without requiring external API calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCache } from '../utils/tool-cache.js';
import {
  validateToolInput,
  executeToolWithWrapper,
  isToolError,
  createToolError,
  getToolUsageSummary,
  FetchRelatedMarketsInputSchema,
  FetchHistoricalPricesInputSchema,
  type ToolContext,
  type ToolAuditEntry,
} from './polling-tools.js';

describe('Polling Tools Infrastructure - Smoke Tests', () => {
  let cache: ToolCache;
  let auditLog: ToolAuditEntry[];
  let mockContext: ToolContext;

  beforeEach(() => {
    cache = new ToolCache('test-session');
    auditLog = [];
    mockContext = {
      polymarketClient: {} as any, // Mock client
      cache,
      auditLog,
    };
  });

  describe('ToolCache', () => {
    it('should create a cache instance with session ID', () => {
      expect(cache.getSessionId()).toBe('test-session');
      expect(cache.size()).toBe(0);
    });

    it('should cache and retrieve tool results', () => {
      const toolName = 'testTool';
      const params = { id: '123' };
      const result = { data: 'test' };

      // First call should be a miss
      expect(cache.get(toolName, params)).toBeNull();
      expect(cache.getStats().misses).toBe(1);

      // Set the result
      cache.set(toolName, params, result);
      expect(cache.size()).toBe(1);

      // Second call should be a hit
      const cached = cache.get(toolName, params);
      expect(cached).toEqual(result);
      expect(cache.getStats().hits).toBe(1);
    });

    it('should handle parameter order independence', () => {
      const toolName = 'testTool';
      const params1 = { a: 1, b: 2 };
      const params2 = { b: 2, a: 1 }; // Different order
      const result = { data: 'test' };

      cache.set(toolName, params1, result);
      
      // Should retrieve with different parameter order
      const cached = cache.get(toolName, params2);
      expect(cached).toEqual(result);
    });

    it('should clear cache and reset stats', () => {
      cache.set('tool1', { id: '1' }, { data: 'test1' });
      cache.set('tool2', { id: '2' }, { data: 'test2' });
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.getStats()).toEqual({ hits: 0, misses: 0 });
    });
  });

  describe('Input Validation', () => {
    it('should validate correct fetchRelatedMarkets input', () => {
      const input = { conditionId: '0x123', minVolume: 100 };
      const result = validateToolInput(FetchRelatedMarketsInputSchema, input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conditionId).toBe('0x123');
        expect(result.data.minVolume).toBe(100);
      }
    });

    it('should apply default minVolume for fetchRelatedMarkets', () => {
      const input = { conditionId: '0x123' };
      const result = validateToolInput(FetchRelatedMarketsInputSchema, input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.minVolume).toBe(100); // Default value
      }
    });

    it('should reject invalid fetchRelatedMarkets input', () => {
      const input = { minVolume: 100 }; // Missing conditionId
      const result = validateToolInput(FetchRelatedMarketsInputSchema, input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('conditionId');
      }
    });

    it('should validate correct fetchHistoricalPrices input', () => {
      const input = { conditionId: '0x123', timeHorizon: '24h' as const };
      const result = validateToolInput(FetchHistoricalPricesInputSchema, input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeHorizon).toBe('24h');
      }
    });

    it('should reject invalid time horizon', () => {
      const input = { conditionId: '0x123', timeHorizon: '48h' }; // Invalid
      const result = validateToolInput(FetchHistoricalPricesInputSchema, input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timeHorizon');
      }
    });
  });

  describe('Tool Execution Wrapper', () => {
    it('should execute tool and log to audit trail', async () => {
      const mockExecutor = async (params: any) => {
        return { success: true, data: 'test-result' };
      };

      const result = await executeToolWithWrapper(
        'testTool',
        { id: '123' },
        mockContext,
        mockExecutor
      );

      expect(result).toEqual({ success: true, data: 'test-result' });
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].toolName).toBe('testTool');
      expect(auditLog[0].cacheHit).toBe(false);
    });

    it('should cache tool results', async () => {
      const mockExecutor = async (params: any) => {
        return { success: true, data: 'test-result' };
      };

      // First call
      await executeToolWithWrapper('testTool', { id: '123' }, mockContext, mockExecutor);
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].cacheHit).toBe(false);

      // Second call should use cache
      await executeToolWithWrapper('testTool', { id: '123' }, mockContext, mockExecutor);
      expect(auditLog.length).toBe(2);
      expect(auditLog[1].cacheHit).toBe(true);
    });

    it('should handle tool errors gracefully', async () => {
      const mockExecutor = async (params: any) => {
        throw new Error('Test error');
      };

      const result = await executeToolWithWrapper(
        'testTool',
        { id: '123' },
        mockContext,
        mockExecutor
      );

      expect(isToolError(result)).toBe(true);
      if (isToolError(result)) {
        expect(result.error).toBe(true);
        expect(result.message).toBe('Test error');
        expect(result.toolName).toBe('testTool');
      }

      // Error should be logged
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].error).toBe('Test error');
    });
  });

  describe('Tool Error Utilities', () => {
    it('should create tool error', () => {
      const error = createToolError('testTool', 'Test error message', 'TEST_CODE');
      
      expect(error.error).toBe(true);
      expect(error.toolName).toBe('testTool');
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_CODE');
    });

    it('should identify tool errors', () => {
      const error = createToolError('testTool', 'Test error');
      const success = { data: 'test' };

      expect(isToolError(error)).toBe(true);
      expect(isToolError(success)).toBe(false);
      expect(isToolError(null)).toBe(false);
      expect(isToolError(undefined)).toBe(false);
    });
  });

  describe('Tool Usage Summary', () => {
    it('should calculate usage summary from audit log', () => {
      const auditLog: ToolAuditEntry[] = [
        {
          toolName: 'tool1',
          timestamp: Date.now(),
          params: {},
          result: {},
          duration: 100,
          cacheHit: false,
        },
        {
          toolName: 'tool1',
          timestamp: Date.now(),
          params: {},
          result: {},
          duration: 50,
          cacheHit: true,
        },
        {
          toolName: 'tool2',
          timestamp: Date.now(),
          params: {},
          error: 'Test error',
          duration: 200,
          cacheHit: false,
        },
      ];

      const summary = getToolUsageSummary(auditLog);

      expect(summary.toolsCalled).toBe(3);
      expect(summary.totalToolTime).toBe(350);
      expect(summary.cacheHits).toBe(1);
      expect(summary.cacheMisses).toBe(2);
      expect(summary.errors).toBe(1);
      expect(summary.toolBreakdown).toEqual({
        tool1: 2,
        tool2: 1,
      });
    });

    it('should handle empty audit log', () => {
      const summary = getToolUsageSummary([]);

      expect(summary.toolsCalled).toBe(0);
      expect(summary.totalToolTime).toBe(0);
      expect(summary.cacheHits).toBe(0);
      expect(summary.cacheMisses).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.toolBreakdown).toEqual({});
    });
  });
});
