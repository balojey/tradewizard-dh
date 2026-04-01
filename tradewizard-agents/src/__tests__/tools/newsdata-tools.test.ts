/**
 * NewsData Tools Infrastructure Tests
 *
 * Unit tests for the NewsData tools infrastructure including:
 * - Tool context interface
 * - Tool execution wrapper
 * - Input validation
 * - Error handling
 * - Caching integration
 * - Utility functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeToolWithWrapper,
  isToolError,
  validateToolInput,
  createToolError,
  getToolUsageSummary,
  transformNewsDataArticle,
  generateCacheKey,
  FetchLatestNewsInputSchema,
  FetchArchiveNewsInputSchema,
  type ToolContext,
  type ToolAuditEntry,
  type NewsArticle,
} from './newsdata-tools.js';
import { ToolCache } from '../utils/tool-cache.js';

describe('NewsData Tools Infrastructure', () => {
  let mockContext: ToolContext;
  let auditLog: ToolAuditEntry[];

  beforeEach(() => {
    auditLog = [];
    mockContext = {
      newsDataClient: {} as any,
      cache: new ToolCache('test-session'),
      auditLog,
      agentName: 'test-agent',
    };
  });

  describe('executeToolWithWrapper', () => {
    it('should execute tool and log to audit trail', async () => {
      const mockExecutor = async (params: any) => {
        return { data: 'test-result' };
      };

      const result = await executeToolWithWrapper(
        'testTool',
        { param: 'value' },
        mockContext,
        mockExecutor
      );

      expect(result).toEqual({ data: 'test-result' });
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].toolName).toBe('testTool');
      expect(auditLog[0].params).toEqual({ param: 'value' });
      expect(auditLog[0].cacheHit).toBe(false);
      expect(auditLog[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should return cached result on second call', async () => {
      const mockExecutor = async (params: any) => {
        return { data: 'test-result' };
      };

      // First call
      const result1 = await executeToolWithWrapper(
        'testTool',
        { param: 'value' },
        mockContext,
        mockExecutor
      );

      // Second call with same params
      const result2 = await executeToolWithWrapper(
        'testTool',
        { param: 'value' },
        mockContext,
        mockExecutor
      );

      expect(result1).toEqual(result2);
      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].cacheHit).toBe(false);
      expect(auditLog[1].cacheHit).toBe(true);
    });

    it('should handle tool errors gracefully', async () => {
      const mockExecutor = async (params: any) => {
        throw new Error('Tool execution failed');
      };

      const result = await executeToolWithWrapper(
        'testTool',
        { param: 'value' },
        mockContext,
        mockExecutor
      );

      expect(isToolError(result)).toBe(true);
      if (isToolError(result)) {
        expect(result.error).toBe(true);
        expect(result.message).toBe('Tool execution failed');
        expect(result.toolName).toBe('testTool');
      }

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].error).toBe('Tool execution failed');
    });

    it('should not throw uncaught exceptions', async () => {
      const mockExecutor = async (params: any) => {
        throw new Error('Unexpected error');
      };

      // Should not throw
      await expect(
        executeToolWithWrapper('testTool', { param: 'value' }, mockContext, mockExecutor)
      ).resolves.toBeDefined();
    });
  });

  describe('isToolError', () => {
    it('should identify tool errors correctly', () => {
      const toolError = { error: true, message: 'Error', toolName: 'test' };
      expect(isToolError(toolError)).toBe(true);
    });

    it('should return false for non-error results', () => {
      expect(isToolError({ data: 'result' })).toBe(false);
      expect(isToolError(null)).toBe(false);
      expect(isToolError(undefined)).toBe(false);
      expect(isToolError('string')).toBe(false);
    });
  });

  describe('validateToolInput', () => {
    it('should validate valid input', () => {
      const input = {
        query: 'test',
        timeframe: '24h',
        size: 10,
      };

      const result = validateToolInput(FetchLatestNewsInputSchema, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('test');
        expect(result.data.timeframe).toBe('24h');
        expect(result.data.size).toBe(10);
      }
    });

    it('should reject invalid timeframe', () => {
      const input = {
        timeframe: 'invalid',
      };

      const result = validateToolInput(FetchLatestNewsInputSchema, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timeframe');
      }
    });

    it('should reject size exceeding maximum', () => {
      const input = {
        size: 100, // Max is 50
      };

      const result = validateToolInput(FetchLatestNewsInputSchema, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('size');
      }
    });

    it('should apply default values', () => {
      const input = {};

      const result = validateToolInput(FetchLatestNewsInputSchema, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeframe).toBe('24h');
        expect(result.data.size).toBe(20);
        expect(result.data.languages).toEqual(['en']);
        expect(result.data.removeDuplicates).toBe(true);
      }
    });
  });

  describe('createToolError', () => {
    it('should create tool error with all fields', () => {
      const error = createToolError('testTool', 'Error message', 'ERROR_CODE');

      expect(error.error).toBe(true);
      expect(error.toolName).toBe('testTool');
      expect(error.message).toBe('Error message');
      expect(error.code).toBe('ERROR_CODE');
    });

    it('should create tool error without code', () => {
      const error = createToolError('testTool', 'Error message');

      expect(error.error).toBe(true);
      expect(error.toolName).toBe('testTool');
      expect(error.message).toBe('Error message');
      expect(error.code).toBeUndefined();
    });
  });

  describe('getToolUsageSummary', () => {
    it('should calculate summary statistics', () => {
      const auditLog: ToolAuditEntry[] = [
        {
          toolName: 'tool1',
          timestamp: Date.now(),
          params: {},
          result: [],
          duration: 100,
          cacheHit: false,
          articleCount: 10,
        },
        {
          toolName: 'tool1',
          timestamp: Date.now(),
          params: {},
          result: [],
          duration: 50,
          cacheHit: true,
          articleCount: 10,
        },
        {
          toolName: 'tool2',
          timestamp: Date.now(),
          params: {},
          error: 'Error',
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
      expect(summary.totalArticles).toBe(20);
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
      expect(summary.totalArticles).toBe(0);
      expect(summary.toolBreakdown).toEqual({});
    });
  });

  describe('transformNewsDataArticle', () => {
    it('should transform NewsData API article to standardized format', () => {
      const apiArticle = {
        article_id: 'abc123',
        title: 'Test Article',
        link: 'https://example.com/article',
        source_id: 'source1',
        source_name: 'Test Source',
        source_priority: 5,
        description: 'Article description',
        content: 'Full article content',
        keywords: ['keyword1', 'keyword2'],
        pubDate: '2024-01-01T12:00:00Z',
        language: 'en',
        country: ['us'],
        category: ['politics'],
        sentiment: 'positive',
        sentiment_stats: {
          positive: 0.8,
          negative: 0.1,
          neutral: 0.1,
        },
      };

      const result = transformNewsDataArticle(apiArticle);

      expect(result.id).toBe('abc123');
      expect(result.title).toBe('Test Article');
      expect(result.url).toBe('https://example.com/article');
      expect(result.source.id).toBe('source1');
      expect(result.source.name).toBe('Test Source');
      expect(result.source.priority).toBe(5);
      expect(result.content.description).toBe('Article description');
      expect(result.content.fullContent).toBe('Full article content');
      expect(result.content.keywords).toEqual(['keyword1', 'keyword2']);
      expect(result.metadata.publishedAt).toBe('2024-01-01T12:00:00Z');
      expect(result.metadata.language).toBe('en');
      expect(result.metadata.countries).toEqual(['us']);
      expect(result.metadata.categories).toEqual(['politics']);
      expect(result.ai?.sentiment).toBe('positive');
      expect(result.ai?.sentimentStats).toEqual({
        positive: 0.8,
        negative: 0.1,
        neutral: 0.1,
      });
    });

    it('should handle crypto-specific fields', () => {
      const apiArticle = {
        article_id: 'crypto123',
        title: 'Crypto News',
        link: 'https://example.com/crypto',
        source_id: 'source1',
        source_name: 'Crypto Source',
        source_priority: 3,
        pubDate: '2024-01-01T12:00:00Z',
        language: 'en',
        coin: ['btc', 'eth'],
      };

      const result = transformNewsDataArticle(apiArticle);

      expect(result.crypto?.coins).toEqual(['btc', 'eth']);
    });

    it('should handle market-specific fields', () => {
      const apiArticle = {
        article_id: 'market123',
        title: 'Market News',
        link: 'https://example.com/market',
        source_id: 'source1',
        source_name: 'Market Source',
        source_priority: 3,
        pubDate: '2024-01-01T12:00:00Z',
        language: 'en',
        symbol: ['AAPL', 'TSLA'],
        ai_org: ['Apple', 'Tesla'],
      };

      const result = transformNewsDataArticle(apiArticle);

      expect(result.market?.symbols).toEqual(['AAPL', 'TSLA']);
      expect(result.market?.organizations).toEqual(['Apple', 'Tesla']);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys for same parameters', () => {
      const params1 = { a: 1, b: 2 };
      const params2 = { b: 2, a: 1 }; // Different order

      const key1 = generateCacheKey('tool', params1);
      const key2 = generateCacheKey('tool', params2);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const params1 = { a: 1, b: 2 };
      const params2 = { a: 1, b: 3 };

      const key1 = generateCacheKey('tool', params1);
      const key2 = generateCacheKey('tool', params2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different tools', () => {
      const params = { a: 1 };

      const key1 = generateCacheKey('tool1', params);
      const key2 = generateCacheKey('tool2', params);

      expect(key1).not.toBe(key2);
    });

    it('should handle nested objects', () => {
      const params1 = { a: { b: 1, c: 2 } };
      const params2 = { a: { c: 2, b: 1 } }; // Different order

      const key1 = generateCacheKey('tool', params1);
      const key2 = generateCacheKey('tool', params2);

      expect(key1).toBe(key2);
    });

    it('should handle arrays', () => {
      const params1 = { arr: [1, 2, 3] };
      const params2 = { arr: [1, 2, 3] };

      const key1 = generateCacheKey('tool', params1);
      const key2 = generateCacheKey('tool', params2);

      expect(key1).toBe(key2);
    });
  });

  describe('FetchArchiveNewsInputSchema validation', () => {
    it('should validate valid date range', () => {
      const input = {
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
      };

      const result = validateToolInput(FetchArchiveNewsInputSchema, input);

      expect(result.success).toBe(true);
    });

    it('should require fromDate and toDate', () => {
      const input = {};

      const result = validateToolInput(FetchArchiveNewsInputSchema, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('fromDate');
        expect(result.error).toContain('toDate');
      }
    });
  });
});
