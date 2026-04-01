/**
 * NewsData.io Client Tests
 * 
 * Unit tests for the NewsData.io API client implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NewsDataClient,
  createNewsDataClient,
  createNewsDataConfigFromEnv,
  NewsDataValidationError,
  NewsDataError,
  DEFAULT_NEWSDATA_CONFIG,
  type NewsDataConfig,
} from '../newsdata-client.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('NewsDataClient', () => {
  let mockConfig: NewsDataConfig;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-api-key-123',
      ...DEFAULT_NEWSDATA_CONFIG,
    } as NewsDataConfig;

    vi.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create client with valid configuration', () => {
      const client = new NewsDataClient(mockConfig);
      expect(client).toBeInstanceOf(NewsDataClient);
      
      const config = client.getConfig();
      expect(config.apiKey).toBe('test-api-key-123');
      expect(config.baseUrl).toBe('https://newsdata.io/api/1');
    });

    it('should throw error for missing API key', () => {
      const invalidConfig = { ...mockConfig, apiKey: '' };
      expect(() => new NewsDataClient(invalidConfig)).toThrow(NewsDataValidationError);
    });

    it('should merge configuration with defaults', () => {
      const customConfig: NewsDataConfig = {
        apiKey: 'test-key',
        timeout: 5000,
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 60000,
        },
        cache: {
          enabled: false,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 300,
          },
        },
        circuitBreaker: {
          enabled: false,
          failureThreshold: 3,
          resetTimeoutMs: 30000,
        },
      };

      const client = new NewsDataClient(customConfig);
      const config = client.getConfig();

      expect(config.timeout).toBe(5000);
      expect(config.rateLimiting.requestsPerWindow).toBe(100);
      expect(config.cache.enabled).toBe(false);
      expect(config.circuitBreaker.enabled).toBe(false);
    });

    it('should update configuration', () => {
      const client = new NewsDataClient(mockConfig);
      
      client.updateConfig({
        timeout: 10000,
        rateLimiting: {
          requestsPerWindow: 500,
          windowSizeMs: 30000,
        },
      });

      const config = client.getConfig();
      expect(config.timeout).toBe(10000);
      expect(config.rateLimiting.requestsPerWindow).toBe(500);
    });
  });

  describe('API Key Validation', () => {
    it('should validate API key format', async () => {
      // Test empty API key at constructor level
      expect(() => new NewsDataClient({ ...mockConfig, apiKey: '' })).toThrow(NewsDataValidationError);
      
      // Test invalid API key formats during testConnection
      const invalidApiKeys = [
        'invalid key with spaces',
        'invalid@key#with$symbols',
        'invalid.key.with.dots',
        'invalid+key+with+plus',
      ];

      for (const apiKey of invalidApiKeys) {
        const client = new NewsDataClient({ ...mockConfig, apiKey });
        
        // The validation should happen before the HTTP call, so we expect it to throw immediately
        await expect(client.testConnection()).rejects.toThrow(NewsDataValidationError);
      }
    });

    it('should accept valid API key format', async () => {
      const validApiKeys = ['validApiKey123', 'valid-api-key', 'valid_api_key', 'ABC123def456'];
      
      for (const apiKey of validApiKeys) {
        const config = { ...mockConfig, apiKey };
        const client = new NewsDataClient(config);

        // Mock successful response
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'success', results: [] }),
        });

        await expect(client.testConnection()).resolves.toBe(true);
      }
    });
  });

  describe('Parameter Validation', () => {
    let client: NewsDataClient;

    beforeEach(() => {
      client = new NewsDataClient(mockConfig);
    });

    it('should validate size parameter', async () => {
      // Mock successful response for valid sizes
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', results: [] }),
      });

      // Valid sizes
      await expect(client.fetchLatestNews({ size: 1 })).resolves.toBeDefined();
      await expect(client.fetchLatestNews({ size: 25 })).resolves.toBeDefined();
      await expect(client.fetchLatestNews({ size: 50 })).resolves.toBeDefined();

      // Invalid sizes should be caught by validation before making HTTP request
      await expect(client.fetchLatestNews({ size: 0 })).rejects.toThrow(NewsDataValidationError);
      await expect(client.fetchLatestNews({ size: 51 })).rejects.toThrow(NewsDataValidationError);
    });

    it('should validate query parameter length', async () => {
      const longQuery = 'a'.repeat(513); // Exceeds 512 character limit

      await expect(client.fetchLatestNews({ q: longQuery })).rejects.toThrow(NewsDataValidationError);
      await expect(client.fetchLatestNews({ qInTitle: longQuery })).rejects.toThrow(NewsDataValidationError);
      await expect(client.fetchLatestNews({ qInMeta: longQuery })).rejects.toThrow(NewsDataValidationError);
    });

    it('should validate mutual exclusivity of query parameters', async () => {
      await expect(client.fetchLatestNews({ 
        q: 'test', 
        qInTitle: 'test' 
      })).rejects.toThrow(NewsDataValidationError);

      await expect(client.fetchLatestNews({ 
        q: 'test', 
        qInMeta: 'test' 
      })).rejects.toThrow(NewsDataValidationError);

      await expect(client.fetchLatestNews({ 
        qInTitle: 'test', 
        qInMeta: 'test' 
      })).rejects.toThrow(NewsDataValidationError);
    });

    it('should validate date format', async () => {
      const validDates = ['2024-01-01', '2024-12-31', '2024-01-01 12:30:45'];
      const invalidDates = ['2024-1-1', '24-01-01', '2024/01/01', 'invalid-date'];

      for (const date of validDates) {
        await expect(client.fetchArchiveNews({ 
          from_date: date,
          category: 'technology' // Required for archive
        })).resolves.toBeDefined();
      }

      for (const date of invalidDates) {
        await expect(client.fetchArchiveNews({ 
          from_date: date,
          category: 'technology'
        })).rejects.toThrow(NewsDataValidationError);
      }
    });

    it('should validate archive endpoint required parameters', async () => {
      // Should fail without required parameters
      await expect(client.fetchArchiveNews({})).rejects.toThrow(NewsDataValidationError);

      // Should succeed with required parameters
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', results: [] }),
      });

      await expect(client.fetchArchiveNews({ category: 'technology' })).resolves.toBeDefined();
      await expect(client.fetchArchiveNews({ q: 'test' })).resolves.toBeDefined();
      await expect(client.fetchArchiveNews({ domain: 'bbc' })).resolves.toBeDefined();
    });
  });

  describe('HTTP Error Handling', () => {
    let client: NewsDataClient;

    beforeEach(() => {
      client = new NewsDataClient(mockConfig);
    });

    it('should handle 401 Unauthorized error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ message: 'Invalid API key' }),
      });

      await expect(client.fetchLatestNews()).rejects.toThrow(NewsDataError);
      await expect(client.fetchLatestNews()).rejects.toThrow('Unauthorized - invalid API key');
    });

    it('should handle 429 Rate Limit error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '900' }),
        text: async () => JSON.stringify({ message: 'Rate limit exceeded' }),
        json: async () => ({ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' }),
      });

      // With single key, should return empty result set (graceful degradation)
      const result = await client.fetchLatestNews();
      expect(result.status).toBe('success');
      expect(result.totalResults).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should handle 500 Server Error', async () => {
      // Mock server error for all retry attempts
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => JSON.stringify({ message: 'Server error' }),
      });

      await expect(client.fetchLatestNews()).rejects.toThrow(NewsDataError);
    });

    it('should handle API-level errors', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'error',
          code: 'INVALID_PARAMETER',
          message: 'Invalid parameter value',
        }),
      });

      await expect(client.fetchLatestNews()).rejects.toThrow('Invalid parameter value');
    });
  });

  describe('Convenience Methods', () => {
    let client: NewsDataClient;

    beforeEach(() => {
      client = new NewsDataClient(mockConfig);
      
      // Mock successful response
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          totalResults: 2,
          results: [
            {
              article_id: '1',
              title: 'Test Article 1',
              link: 'https://example.com/1',
              source_name: 'Test Source',
              pubDate: '2024-01-01 12:00:00',
              language: 'english',
              duplicate: false,
            },
            {
              article_id: '2',
              title: 'Test Article 2',
              link: 'https://example.com/2',
              source_name: 'Test Source',
              pubDate: '2024-01-01 13:00:00',
              language: 'english',
              duplicate: false,
            },
          ],
        }),
      });
    });

    it('should search news with simple query', async () => {
      const articles = await client.searchNews('bitcoin', {
        endpoint: 'crypto',
        limit: 10,
        language: 'en',
      });

      expect(articles).toHaveLength(2);
      expect(articles[0].title).toBe('Test Article 1');
    });

    it('should get crypto news for specific coin', async () => {
      const articles = await client.getCryptoNews('btc', {
        limit: 5,
        timeframe: '24',
      });

      expect(articles).toHaveLength(2);
    });

    it('should get market news for specific symbols', async () => {
      const articles = await client.getMarketNews(['AAPL', 'TSLA'], {
        limit: 10,
        sentiment: 'positive',
      });

      expect(articles).toHaveLength(2);
    });

    it('should get news by category', async () => {
      const articles = await client.getNewsByCategory('technology', {
        limit: 15,
        country: 'us',
      });

      expect(articles).toHaveLength(2);
    });

    it('should get breaking news', async () => {
      const articles = await client.getBreakingNews({
        limit: 5,
        country: 'us',
        category: 'politics',
      });

      expect(articles).toHaveLength(2);
    });
  });

  describe('Factory Functions', () => {
    it('should create client using factory function', () => {
      const client = createNewsDataClient(mockConfig);
      expect(client).toBeInstanceOf(NewsDataClient);
    });

    it('should create config from environment variables', () => {
      // Mock environment variables
      process.env.NEWSDATA_API_KEY = 'env-api-key';
      process.env.NEWSDATA_RATE_LIMIT_REQUESTS = '500';
      process.env.NEWSDATA_DAILY_QUOTA = '10000';
      process.env.NEWSDATA_CACHE_ENABLED = 'true';

      const config = createNewsDataConfigFromEnv();

      expect(config.apiKey).toBe('env-api-key');
      expect(config.rateLimiting?.requestsPerWindow).toBe(500);
      expect(config.rateLimiting?.dailyQuota).toBe(10000);
      expect(config.cache?.enabled).toBe(true);

      // Clean up
      delete process.env.NEWSDATA_API_KEY;
      delete process.env.NEWSDATA_RATE_LIMIT_REQUESTS;
      delete process.env.NEWSDATA_DAILY_QUOTA;
      delete process.env.NEWSDATA_CACHE_ENABLED;
    });

    it('should throw error when API key missing from environment', () => {
      delete process.env.NEWSDATA_API_KEY;
      expect(() => createNewsDataConfigFromEnv()).toThrow(NewsDataValidationError);
    });
  });
});