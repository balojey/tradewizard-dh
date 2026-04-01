/**
 * NewsData.io Core Functionality Integration Test
 * 
 * This test validates that all core components work together:
 * - NewsData Client
 * - Cache Manager
 * - Rate Limiter
 * - Circuit Breaker
 * - Fallback Manager
 * - Agent Tools
 * 
 * Tests end-to-end news fetching with all four endpoints and verifies
 * error handling and fallback mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  NewsDataClient, 
  createNewsDataClient,
  createNewsDataConfigFromEnv,
  type NewsDataConfig,
  type NewsDataResponse 
} from './newsdata-client.js';
import { 
  NewsDataCacheManager, 
  createNewsDataCacheManager 
} from './newsdata-cache-manager.js';
import { 
  NewsDataRateLimiter, 
  createNewsDataRateLimiter 
} from './newsdata-rate-limiter.js';
import { 
  NewsDataCircuitBreaker, 
  createNewsDataCircuitBreaker,
  CircuitBreakerState 
} from './newsdata-circuit-breaker.js';
import { 
  NewsDataFallbackManager, 
  createNewsDataFallbackManager,
  FallbackStrategy 
} from './newsdata-fallback-manager.js';
import { 
  NewsToolsManager, 
  createNewsToolsManager
} from './newsdata-agent-tools.js';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
const mockLogger = {
  logAgentSelection: vi.fn(),
  logDataFetch: vi.fn(),
  logSignalFusion: vi.fn(),
  logCostOptimization: vi.fn(),
  logPerformanceTracking: vi.fn(),
  
  getAgentSelectionLogs: vi.fn(() => []),
  getDataFetchLogs: vi.fn(() => []),
  getSignalFusionLogs: vi.fn(() => []),
  getCostOptimizationLogs: vi.fn(() => []),
  getPerformanceTrackingLogs: vi.fn(() => []),
  
  getCompleteAuditTrail: vi.fn(() => ({
    agentSelection: [],
    dataFetching: [],
    signalFusion: [],
    costOptimization: [],
    performanceTracking: [],
  })),
  
  clear: vi.fn(),
  validateAuditTrailCompleteness: vi.fn(() => ({ complete: true, missing: [] })),
} as any; // Use 'as any' to bypass TypeScript strict checking for mock

describe('NewsData.io Core Functionality Integration', () => {
  let config: NewsDataConfig;
  let cacheManager: NewsDataCacheManager;
  let rateLimiter: NewsDataRateLimiter;
  let circuitBreaker: NewsDataCircuitBreaker;
  let fallbackManager: NewsDataFallbackManager;
  let newsDataClient: NewsDataClient;
  let newsToolsManager: NewsToolsManager;

  // Sample response data
  const sampleNewsResponse: NewsDataResponse = {
    status: 'success',
    totalResults: 2,
    results: [
      {
        article_id: 'test-article-1',
        title: 'Test Article 1',
        link: 'https://example.com/article1',
        source_id: 'test-source',
        source_name: 'Test Source',
        source_url: 'https://example.com',
        source_priority: 1,
        description: 'Test article description',
        pubDate: '2024-01-15 10:00:00',
        language: 'en',
        country: ['us'],
        category: ['technology'],
        duplicate: false,
      },
      {
        article_id: 'test-article-2',
        title: 'Test Article 2',
        link: 'https://example.com/article2',
        source_id: 'test-source-2',
        source_name: 'Test Source 2',
        source_url: 'https://example.com',
        source_priority: 2,
        description: 'Another test article',
        pubDate: '2024-01-15 11:00:00',
        language: 'en',
        country: ['us'],
        category: ['business'],
        duplicate: false,
      },
    ],
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockFetch.mockClear();

    // Create test configuration
    config = {
      apiKey: 'test-api-key',
      baseUrl: 'https://newsdata.io/api/1',
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100,
      rateLimiting: {
        requestsPerWindow: 10,
        windowSizeMs: 60000,
        dailyQuota: 100,
      },
      cache: {
        enabled: true,
        ttl: {
          latest: 900,
          crypto: 600,
          market: 600,
          archive: 3600,
        },
        maxSize: 100,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 3,
        resetTimeoutMs: 5000,
        halfOpenMaxCalls: 2,
      },
    };

    // Initialize components
    cacheManager = createNewsDataCacheManager({
      maxSize: 100,
      defaultTTL: 900000, // 15 minutes
      evictionPolicy: 'lru',
    });

    rateLimiter = createNewsDataRateLimiter({
      buckets: {
        latest: { capacity: 10, refillRate: 1, dailyQuota: 50 },
        archive: { capacity: 5, refillRate: 0.5, dailyQuota: 25 },
        crypto: { capacity: 8, refillRate: 0.8, dailyQuota: 40 },
        market: { capacity: 8, refillRate: 0.8, dailyQuota: 40 },
      },
      defaultRetryDelay: 100,
      maxRetryAttempts: 2,
      jitterFactor: 0.1,
      coordinationEnabled: false, // Disable for testing
      coordinationWindow: 1000,
    }, mockLogger);

    circuitBreaker = createNewsDataCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxCalls: 2,
      monitoringPeriod: 10000,
      successThreshold: 2,
      volumeThreshold: 5,
    }, mockLogger);

    fallbackManager = createNewsDataFallbackManager(
      {
        enableCachedFallback: true,
        enableStaleFallback: true,
        maxStalenessMs: 3600000, // 1 hour
        fallbackPriority: [
          FallbackStrategy.FRESH_CACHE,
          FallbackStrategy.STALE_CACHE,
          FallbackStrategy.EMPTY_RESULTS,
        ],
      },
      cacheManager,
      circuitBreaker,
      mockLogger
    );

    newsDataClient = createNewsDataClient(
      config,
      mockLogger,
      cacheManager,
      rateLimiter,
      circuitBreaker,
      fallbackManager
    );

    newsToolsManager = createNewsToolsManager(newsDataClient, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Core Component Integration', () => {
    it('should initialize all components successfully', () => {
      expect(cacheManager).toBeDefined();
      expect(rateLimiter).toBeDefined();
      expect(circuitBreaker).toBeDefined();
      expect(fallbackManager).toBeDefined();
      expect(newsDataClient).toBeDefined();
      expect(newsToolsManager).toBeDefined();
    });

    it('should have correct initial states', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(rateLimiter.getTokens('latest')).toBeGreaterThan(0);
      expect(rateLimiter.getTokens('crypto')).toBeGreaterThan(0);
      expect(rateLimiter.getTokens('market')).toBeGreaterThan(0);
      expect(rateLimiter.getTokens('archive')).toBeGreaterThan(0);
    });
  });

  describe('End-to-End News Fetching', () => {
    beforeEach(() => {
      // Mock successful API response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleNewsResponse,
      });
    });

    it('should fetch latest news successfully', async () => {
      const result = await newsToolsManager.fetchLatestNews({
        query: 'technology',
        size: 10,
        countries: ['us'],
        languages: ['en'],
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('id', 'test-article-1');
      expect(result[0]).toHaveProperty('title', 'Test Article 1');
      expect(result[0]).toHaveProperty('url', 'https://example.com/article1');
      expect(result[0].source).toHaveProperty('name', 'Test Source');
      expect(result[0].metadata).toHaveProperty('language', 'en');
    });

    it('should fetch crypto news successfully', async () => {
      const result = await newsToolsManager.fetchCryptoNews({
        coins: ['btc', 'eth'],
        size: 5,
        languages: ['en'],
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/crypto'),
        expect.any(Object)
      );
    });

    it('should fetch market news successfully', async () => {
      const result = await newsToolsManager.fetchMarketNews({
        symbols: ['AAPL', 'TSLA'],
        size: 5,
        languages: ['en'],
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/market'),
        expect.any(Object)
      );
    });

    it('should fetch archive news successfully', async () => {
      const result = await newsToolsManager.fetchArchiveNews({
        fromDate: '2024-01-01',
        toDate: '2024-01-15',
        query: 'technology',
        size: 5,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/archive'),
        expect.any(Object)
      );
    });
  });

  describe('Caching Integration', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleNewsResponse,
      });
    });

    it('should cache responses and serve from cache on subsequent requests', async () => {
      const params = {
        query: 'technology',
        size: 5,
        countries: ['us'],
      };

      // First request - should hit API
      const result1 = await newsToolsManager.fetchLatestNews(params);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request - should serve from cache
      const result2 = await newsToolsManager.fetchLatestNews(params);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional API call

      expect(result1).toEqual(result2);
    });

    it('should handle cache misses correctly', async () => {
      // Different parameters should result in cache miss
      await newsToolsManager.fetchLatestNews({ query: 'tech', size: 5 });
      await newsToolsManager.fetchLatestNews({ query: 'business', size: 5 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate Limiting Integration', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleNewsResponse,
      });
    });

    it('should respect rate limits across different endpoints', async () => {
      // Make multiple requests to test rate limiting
      const promises = [];
      
      for (let i = 0; i < 15; i++) {
        promises.push(
          newsToolsManager.fetchLatestNews({ 
            query: `test-${i}`, 
            size: 1 
          })
        );
      }

      const results = await Promise.allSettled(promises);
      
      // Some requests should succeed, others might be rate limited
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(successful.length).toBeGreaterThan(0);
      // Rate limiting might cause some failures or delays
      expect(successful.length + failed.length).toBe(15);
    });

    it('should track rate limit usage correctly', async () => {
      const initialTokens = rateLimiter.getTokens('latest');
      
      await newsToolsManager.fetchLatestNews({ query: 'test', size: 1 });
      
      const tokensAfter = rateLimiter.getTokens('latest');
      expect(tokensAfter).toBeLessThan(initialTokens);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit after consecutive failures', async () => {
      // Mock API failures
      mockFetch.mockRejectedValue(new Error('API Error'));

      // Make multiple failing requests
      for (let i = 0; i < 5; i++) {
        try {
          await newsToolsManager.fetchLatestNews({ query: 'test', size: 1 });
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should be open now
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should use fallback when circuit is open', async () => {
      // First, cache some data
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleNewsResponse,
      });

      await newsToolsManager.fetchLatestNews({ query: 'test', size: 1 });

      // Now simulate failures to open circuit
      mockFetch.mockRejectedValue(new Error('API Error'));

      for (let i = 0; i < 5; i++) {
        try {
          await newsToolsManager.fetchLatestNews({ query: 'fail', size: 1 });
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should be open
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Request with cached data should still work via fallback
      const result = await newsToolsManager.fetchLatestNews({ query: 'test', size: 1 });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Error Handling and Fallback Mechanisms', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error',
      });

      await expect(
        newsToolsManager.fetchLatestNews({ query: 'test', size: 1 })
      ).rejects.toThrow();
    });

    it('should handle rate limit errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ message: 'Rate limit exceeded' }),
      });

      await expect(
        newsToolsManager.fetchLatestNews({ query: 'test', size: 1 })
      ).rejects.toThrow();
    });

    it('should handle network errors with retries', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Network Error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => sampleNewsResponse,
        });
      });

      const result = await newsToolsManager.fetchLatestNews({ query: 'test', size: 1 });
      
      expect(result).toBeDefined();
      expect(callCount).toBe(3); // Should retry twice before succeeding
    });

    it('should validate parameters correctly', async () => {
      // Test invalid parameters
      await expect(
        newsToolsManager.fetchLatestNews({ 
          size: 100, // Invalid: exceeds maximum
        })
      ).rejects.toThrow();

      await expect(
        newsToolsManager.fetchArchiveNews({
          fromDate: 'invalid-date',
          toDate: '2024-01-15',
        })
      ).rejects.toThrow();

      await expect(
        newsToolsManager.fetchCryptoNews({
          coins: [''], // Invalid: empty coin symbol
        })
      ).rejects.toThrow();
    });
  });

  describe('Performance and Monitoring', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleNewsResponse,
      });
    });

    it('should log performance metrics', async () => {
      await newsToolsManager.fetchLatestNews({ query: 'test', size: 1 });

      expect(mockLogger.logDataFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'news',
          provider: 'newsdata.io',
          success: true,
          itemCount: 2,
          duration: expect.any(Number),
        })
      );
    });

    it('should track cache performance', async () => {
      const params = { query: 'test', size: 1 };

      // First request
      await newsToolsManager.fetchLatestNews(params);
      
      // Second request (should be cached)
      await newsToolsManager.fetchLatestNews(params);

      const stats = await cacheManager.getStats();
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.totalKeys).toBeGreaterThan(0);
    });

    it('should provide circuit breaker statistics', async () => {
      const stats = circuitBreaker.getStats();
      
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('successCount');
      expect(stats).toHaveProperty('totalCalls');
    });

    it('should provide rate limiter status', async () => {
      const status = rateLimiter.getAllBucketStatus();
      
      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBe(4); // latest, archive, crypto, market
      
      status.forEach(bucketStatus => {
        expect(bucketStatus).toHaveProperty('bucket');
        expect(bucketStatus).toHaveProperty('tokensAvailable');
        expect(bucketStatus).toHaveProperty('dailyUsage');
        expect(bucketStatus).toHaveProperty('quotaPercentage');
      });
    });
  });

  describe('Configuration and Environment', () => {
    it('should create configuration from environment variables', () => {
      // Mock environment variables
      process.env.NEWSDATA_API_KEY = 'test-env-key';
      process.env.NEWSDATA_CACHE_ENABLED = 'true';
      process.env.NEWSDATA_RATE_LIMIT_REQUESTS = '20';

      const envConfig = createNewsDataConfigFromEnv();
      
      expect(envConfig.apiKey).toBe('test-env-key');
      expect(envConfig.cache?.enabled).toBe(true);
      expect(envConfig.rateLimiting?.requestsPerWindow).toBe(20);

      // Clean up
      delete process.env.NEWSDATA_API_KEY;
      delete process.env.NEWSDATA_CACHE_ENABLED;
      delete process.env.NEWSDATA_RATE_LIMIT_REQUESTS;
    });

    it('should validate API key format', () => {
      expect(() => {
        createNewsDataClient({
          ...config,
          apiKey: '', // Invalid: empty
        });
      }).toThrow();

      expect(() => {
        createNewsDataClient({
          ...config,
          apiKey: 'invalid key with spaces', // Invalid: contains spaces
        });
      }).toThrow();
    });
  });

  describe('Tool Interface Completeness', () => {
    it('should provide all four news tools', () => {
      const tools = newsToolsManager.getAllTools();
      
      expect(tools).toHaveLength(4);
      
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('fetchLatestNews');
      expect(toolNames).toContain('fetchArchiveNews');
      expect(toolNames).toContain('fetchCryptoNews');
      expect(toolNames).toContain('fetchMarketNews');
    });

    it('should allow tool execution by name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleNewsResponse,
      });

      const result = await newsToolsManager.executeTool('fetchLatestNews', {
        query: 'test',
        size: 1,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle unknown tool names', async () => {
      await expect(
        newsToolsManager.executeTool('unknownTool', {})
      ).rejects.toThrow('Tool not found: unknownTool');
    });
  });

  describe('Data Validation and Sanitization', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          totalResults: 1,
          results: [
            {
              article_id: 'test-article',
              title: 'Test Article\x00\x01', // Contains control characters
              link: 'https://example.com/article',
              source_id: 'test-source',
              source_name: 'Test Source',
              source_url: 'https://example.com',
              source_priority: 1,
              description: 'Test description',
              pubDate: '2024-01-15 10:00:00',
              language: 'en',
              country: ['us'],
              category: ['technology'],
              duplicate: false,
            },
          ],
        }),
      });
    });

    it('should sanitize article content', async () => {
      const result = await newsToolsManager.fetchLatestNews({
        query: 'test',
        size: 1,
      });

      expect(result[0].title).toBe('Test Article'); // Control characters removed
      expect(result[0].url).toBe('https://example.com/article');
      expect(result[0].source.name).toBe('Test Source');
    });

    it('should validate response structure', async () => {
      const result = await newsToolsManager.fetchLatestNews({
        query: 'test',
        size: 1,
      });

      // Validate required fields
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('url');
      expect(result[0]).toHaveProperty('source');
      expect(result[0]).toHaveProperty('content');
      expect(result[0]).toHaveProperty('metadata');

      // Validate source structure
      expect(result[0].source).toHaveProperty('id');
      expect(result[0].source).toHaveProperty('name');
      expect(result[0].source).toHaveProperty('url');
      expect(result[0].source).toHaveProperty('priority');

      // Validate metadata structure
      expect(result[0].metadata).toHaveProperty('publishedAt');
      expect(result[0].metadata).toHaveProperty('language');
      expect(result[0].metadata).toHaveProperty('duplicate');
    });
  });
});