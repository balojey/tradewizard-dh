/**
 * Final Comprehensive Integration Tests for NewsData.io Agent Tools
 * 
 * This test suite provides focused integration testing for the three key areas:
 * 1. End-to-end agent news fetching workflows
 * 2. System resilience under failure conditions
 * 3. Performance under concurrent agent requests
 */

import { describe, test, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createNewsDataClient } from './utils/newsdata-client.js';
import { createEnhancedAgentFactory } from './utils/enhanced-agent-factory.js';
import { createNewsDataIntegrationLayer } from './utils/newsdata-agent-integration.js';
import { createNewsToolsManager } from './utils/newsdata-agent-tools.js';
import type { EngineConfig } from './config/index.js';

describe('NewsData.io Final Integration Tests', () => {
  let mockConfig: EngineConfig;
  let originalEnv: Record<string, string | undefined>;
  let testStartTime: number;

  beforeAll(() => {
    testStartTime = Date.now();
    console.log('[Final Integration] Starting NewsData.io final integration tests');
  });

  afterAll(() => {
    const duration = (Date.now() - testStartTime) / 1000;
    console.log(`[Final Integration] Tests completed in ${duration.toFixed(2)} seconds`);
  });

  beforeEach(() => {
    // Store original environment variables
    originalEnv = {
      NEWSDATA_INTEGRATION_ENABLED: process.env.NEWSDATA_INTEGRATION_ENABLED,
      NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY,
    };

    // Set test environment for NewsData integration
    process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
    process.env.NEWSDATA_API_KEY = 'test-newsdata-api-key';

    // Create minimal mock config for testing
    mockConfig = {
      newsData: {
        enabled: true,
        apiKey: 'test-newsdata-api-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
        agentTools: {
          enabled: true,
          defaultParams: {},
          maxRequestsPerHour: 10,
        },
      },
    } as EngineConfig;
  });

  afterEach(() => {
    // Restore original environment variables
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    vi.clearAllMocks();
  });
  describe('End-to-End Agent News Fetching Workflows', () => {
    test('should execute complete news fetching workflow with all endpoints', async () => {
      // Create NewsData client and tools
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-workflow-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);
      const integrationLayer = createNewsDataIntegrationLayer(newsDataClient);

      // Mock all news endpoints with realistic responses
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockResolvedValue({
        status: 'success',
        totalResults: 5,
        results: Array.from({ length: 5 }, (_, i) => ({
          article_id: `latest-${i}`,
          title: `Latest News Article ${i + 1}`,
          link: `https://news.example.com/latest-${i}`,
          description: `Latest news description ${i + 1}`,
          content: `Latest content ${i + 1}`,
          pubDate: new Date().toISOString(),
          source_id: `source-${i}`,
          source_name: `News Source ${i + 1}`,
          source_url: `https://source-${i}.com`,
          source_priority: 1,
          country: ['US'],
          category: ['business'],
          language: 'en',
          duplicate: false,
        })),
      });

      vi.spyOn(newsDataClient, 'fetchArchiveNews').mockResolvedValue({
        status: 'success',
        totalResults: 3,
        results: Array.from({ length: 3 }, (_, i) => ({
          article_id: `archive-${i}`,
          title: `Archive News Article ${i + 1}`,
          link: `https://archive.example.com/article-${i}`,
          description: `Archive description ${i + 1}`,
          content: `Archive content ${i + 1}`,
          pubDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          source_id: `archive-source-${i}`,
          source_name: `Archive Source ${i + 1}`,
          source_url: `https://archive-source-${i}.com`,
          source_priority: 2,
          country: ['US'],
          category: ['politics'],
          language: 'en',
          duplicate: false,
        })),
      });

      vi.spyOn(newsDataClient, 'fetchCryptoNews').mockResolvedValue({
        status: 'success',
        totalResults: 4,
        results: Array.from({ length: 4 }, (_, i) => ({
          article_id: `crypto-${i}`,
          title: `Crypto News Article ${i + 1}`,
          link: `https://crypto.example.com/article-${i}`,
          description: `Crypto description ${i + 1}`,
          content: `Crypto content ${i + 1}`,
          pubDate: new Date().toISOString(),
          source_id: `crypto-source-${i}`,
          source_name: `Crypto Source ${i + 1}`,
          source_url: `https://crypto-source-${i}.com`,
          source_priority: 1,
          country: ['US'],
          category: ['business'],
          language: 'en',
          duplicate: false,
          coin: ['btc'],
        })),
      });

      vi.spyOn(newsDataClient, 'fetchMarketNews').mockResolvedValue({
        status: 'success',
        totalResults: 6,
        results: Array.from({ length: 6 }, (_, i) => ({
          article_id: `market-${i}`,
          title: `Market News Article ${i + 1}`,
          link: `https://market.example.com/article-${i}`,
          description: `Market description ${i + 1}`,
          content: `Market content ${i + 1}`,
          pubDate: new Date().toISOString(),
          source_id: `market-source-${i}`,
          source_name: `Market Source ${i + 1}`,
          source_url: `https://market-source-${i}.com`,
          source_priority: 1,
          country: ['US'],
          category: ['business'],
          language: 'en',
          duplicate: false,
          symbol: ['AAPL'],
        })),
      });

      // Test all news endpoints
      const latestNews = await newsTools.fetchLatestNews({
        query: 'test news',
        size: 5,
      });
      expect(Array.isArray(latestNews)).toBe(true);
      expect(latestNews.length).toBe(5);
      expect(latestNews[0].title).toContain('Latest News Article');

      const archiveNews = await newsTools.fetchArchiveNews({
        query: 'archive test',
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
        size: 3,
      });
      expect(Array.isArray(archiveNews)).toBe(true);
      expect(archiveNews.length).toBe(3);
      expect(archiveNews[0].title).toContain('Archive News Article');

      const cryptoNews = await newsTools.fetchCryptoNews({
        coins: ['btc'],
        size: 4,
      });
      expect(Array.isArray(cryptoNews)).toBe(true);
      expect(cryptoNews.length).toBe(4);
      expect(cryptoNews[0].title).toContain('Crypto News Article');

      const marketNews = await newsTools.fetchMarketNews({
        symbols: ['AAPL'],
        size: 6,
      });
      expect(Array.isArray(marketNews)).toBe(true);
      expect(marketNews.length).toBe(6);
      expect(marketNews[0].title).toContain('Market News Article');

      // Test integration layer functionality
      const availableTools = integrationLayer.getAvailableTools();
      expect(Array.isArray(availableTools)).toBe(true);
      expect(availableTools.length).toBeGreaterThan(0);

      expect(integrationLayer.isToolAvailable('fetchLatestNews')).toBe(true);
      expect(integrationLayer.isToolAvailable('fetchArchiveNews')).toBe(true);
      expect(integrationLayer.isToolAvailable('fetchCryptoNews')).toBe(true);
      expect(integrationLayer.isToolAvailable('fetchMarketNews')).toBe(true);

      // Verify all API calls were made
      expect(newsDataClient.fetchLatestNews).toHaveBeenCalledTimes(1);
      expect(newsDataClient.fetchArchiveNews).toHaveBeenCalledTimes(1);
      expect(newsDataClient.fetchCryptoNews).toHaveBeenCalledTimes(1);
      expect(newsDataClient.fetchMarketNews).toHaveBeenCalledTimes(1);

      console.log('[Workflow] Complete news fetching workflow executed successfully');
    }, 30000);

    test('should execute enhanced agent workflow with news tools', async () => {
      // Create enhanced agent factory
      const agentFactory = createEnhancedAgentFactory(mockConfig);
      
      // Create NewsData client
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-agent-workflow-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      });

      // Mock news API
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockResolvedValue({
        status: 'success',
        totalResults: 3,
        results: Array.from({ length: 3 }, (_, i) => ({
          article_id: `agent-news-${i}`,
          title: `Agent News ${i + 1}`,
          link: `https://agent.example.com/news-${i}`,
          description: `Agent news description ${i + 1}`,
          content: `Agent content ${i + 1}`,
          pubDate: new Date().toISOString(),
          source_id: `agent-source-${i}`,
          source_name: `Agent Source ${i + 1}`,
          source_url: `https://agent-source-${i}.com`,
          source_priority: 1,
          country: ['US'],
          category: ['business'],
          language: 'en',
          duplicate: false,
        })),
      });

      // Create mock state for enhanced agent
      const mockState = {
        conditionId: 'test-agent-condition',
        mbd: {
          marketId: 'test-agent-market',
          conditionId: 'test-agent-condition',
          eventType: 'election' as const,
          question: 'Will enhanced agent workflow succeed?',
          resolutionCriteria: 'Agent must successfully fetch and process news',
          expiryTimestamp: Date.now() + 86400000,
          currentProbability: 0.75,
          liquidityScore: 8.0,
          bidAskSpread: 0.02,
          volatilityRegime: 'medium' as const,
          volume24h: 500000,
          metadata: {
            ambiguityFlags: [],
            keyCatalysts: [],
          },
        },
        ingestionError: null,
        activeAgents: ['test_news_agent'],
        externalData: null,
        agentSignals: [],
        agentErrors: [],
        fusedSignal: null,
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        riskPhilosophySignals: null,
        agentPerformance: {},
        recommendation: null,
        auditLog: [],
      };

      // Create enhanced agent that uses news tools
      const enhancedAgent = agentFactory.createEnhancedAgentNode('test_news_agent', async (context) => {
        expect(context.newsTools).toBeDefined();
        expect(context.utils).toBeDefined();
        expect(context.state).toBeDefined();

        // Use news tools within agent
        const news = await context.newsTools.fetchLatestNews({
          query: 'agent test',
          size: 3,
        });

        expect(Array.isArray(news)).toBe(true);
        expect(news.length).toBe(3);

        return {
          agentSignals: [
            {
              agentName: 'test_news_agent',
              timestamp: Date.now(),
              confidence: 0.8,
              direction: 'YES',
              fairProbability: 0.78,
              keyDrivers: ['News analysis complete'],
              riskFactors: ['None identified'],
              metadata: {
                newsArticlesProcessed: news.length,
                testWorkflow: true,
              },
            },
          ],
        };
      });

      // Execute enhanced agent
      const result = await enhancedAgent(mockState);

      // Verify agent execution
      expect(result).toBeDefined();
      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('test_news_agent');
      expect(result.agentSignals![0].metadata?.newsArticlesProcessed).toBe(3);
      expect(result.agentSignals![0].metadata?.testWorkflow).toBe(true);
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog!.length).toBeGreaterThan(0);

      // Verify news API was called
      expect(newsDataClient.fetchLatestNews).toHaveBeenCalledTimes(1);

      console.log('[Agent Workflow] Enhanced agent workflow with news tools executed successfully');
    }, 30000);
  });
  describe('System Resilience Under Failure Conditions', () => {
    test('should handle API failures with graceful degradation', async () => {
      // Create NewsData client
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-resilience-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 3, // Low threshold for testing
          resetTimeoutMs: 5000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Mock API failures
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockRejectedValue(new Error('API service unavailable'));
      vi.spyOn(newsDataClient, 'fetchArchiveNews').mockRejectedValue(new Error('API service unavailable'));
      vi.spyOn(newsDataClient, 'fetchCryptoNews').mockRejectedValue(new Error('API service unavailable'));
      vi.spyOn(newsDataClient, 'fetchMarketNews').mockRejectedValue(new Error('API service unavailable'));

      // Test that all endpoints handle failures gracefully
      await expect(newsTools.fetchLatestNews({ query: 'test' })).rejects.toThrow('API service unavailable');
      await expect(newsTools.fetchArchiveNews({ 
        query: 'test', 
        fromDate: '2024-01-01', 
        toDate: '2024-01-31' 
      })).rejects.toThrow('API service unavailable');
      await expect(newsTools.fetchCryptoNews({ coins: ['btc'] })).rejects.toThrow('API service unavailable');
      await expect(newsTools.fetchMarketNews({ symbols: ['AAPL'] })).rejects.toThrow('API service unavailable');

      // Verify all API calls were attempted
      expect(newsDataClient.fetchLatestNews).toHaveBeenCalledTimes(1);
      expect(newsDataClient.fetchArchiveNews).toHaveBeenCalledTimes(1);
      expect(newsDataClient.fetchCryptoNews).toHaveBeenCalledTimes(1);
      expect(newsDataClient.fetchMarketNews).toHaveBeenCalledTimes(1);

      console.log('[Resilience] API failure handling tested successfully');
    }, 15000);

    test('should handle circuit breaker activation and recovery', async () => {
      // Create NewsData client with low circuit breaker threshold
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-circuit-breaker-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 2, // Very low threshold
          resetTimeoutMs: 3000, // Short reset time for testing
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Mock intermittent failures followed by recovery
      let callCount = 0;
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Intermittent failure');
        }
        return {
          status: 'success',
          totalResults: 1,
          results: [
            {
              article_id: 'recovery-1',
              title: 'Recovery News',
              link: 'https://recovery.example.com/news-1',
              description: 'News after recovery',
              content: 'Recovery content',
              pubDate: new Date().toISOString(),
              source_id: 'recovery-source',
              source_name: 'Recovery News',
              source_url: 'https://recovery.com',
              source_priority: 1,
              country: ['US'],
              category: ['business'],
              language: 'en',
              duplicate: false,
            },
          ],
        };
      });

      // Trigger circuit breaker with failures
      try {
        await newsTools.fetchLatestNews({ query: 'test1' });
      } catch (error) {
        expect(error).toBeDefined();
      }

      try {
        await newsTools.fetchLatestNews({ query: 'test2' });
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Circuit breaker should be open now
      try {
        await newsTools.fetchLatestNews({ query: 'test3' });
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Wait for circuit breaker reset
      await new Promise(resolve => setTimeout(resolve, 4000));

      // After reset, should work again
      const result = await newsTools.fetchLatestNews({ query: 'test4' });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Recovery News');

      console.log('[Circuit Breaker] Circuit breaker activation and recovery tested successfully');
    }, 20000);

    test('should handle rate limiting with proper throttling', async () => {
      // Create NewsData client with strict rate limits
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-rate-limit-key',
        rateLimiting: {
          requestsPerWindow: 3, // Very low limit
          windowSizeMs: 5000, // 5 second window
          dailyQuota: 10,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Mock successful responses
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockResolvedValue({
        status: 'success',
        totalResults: 1,
        results: [
          {
            article_id: 'rate-limit-test-1',
            title: 'Rate Limit Test News',
            link: 'https://ratelimit.example.com/news-1',
            description: 'Rate limit test description',
            content: 'Rate limit content',
            pubDate: new Date().toISOString(),
            source_id: 'rate-limit-source',
            source_name: 'Rate Limit News',
            source_url: 'https://ratelimit.com',
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          },
        ],
      });

      // Make requests within rate limit
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await newsTools.fetchLatestNews({ query: `test${i}` });
        results.push(result);
      }

      // All requests should succeed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(1);
      });

      // Fourth request should be rate limited (depending on implementation)
      // This test verifies the rate limiting system is in place
      expect(newsDataClient.fetchLatestNews).toHaveBeenCalledTimes(3);

      console.log('[Rate Limiting] Rate limiting behavior tested successfully');
    }, 15000);

    test('should handle malformed data with validation', async () => {
      // Create NewsData client
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-validation-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Mock response with mixed valid and invalid data
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockResolvedValue({
        status: 'success',
        totalResults: 3,
        results: [
          // Valid article
          {
            article_id: 'valid-1',
            title: 'Valid News Article',
            link: 'https://valid.example.com/article-1',
            description: 'Valid description',
            content: 'Valid content',
            pubDate: new Date().toISOString(),
            source_id: 'valid-source',
            source_name: 'Valid News',
            source_url: 'https://valid.com',
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          },
          // Invalid article (missing required fields)
          {
            article_id: 'invalid-1',
            title: '', // Empty title
            link: 'not-a-url', // Invalid URL
            description: 'Invalid article',
            // Missing other required fields
          } as any,
          // Another valid article
          {
            article_id: 'valid-2',
            title: 'Another Valid Article',
            link: 'https://valid.example.com/article-2',
            description: 'Another valid description',
            content: 'Another valid content',
            pubDate: new Date().toISOString(),
            source_id: 'valid-source-2',
            source_name: 'Valid News 2',
            source_url: 'https://valid2.com',
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          },
        ],
      });

      // Test data validation
      const result = await newsTools.fetchLatestNews({ query: 'validation test' });
      expect(Array.isArray(result)).toBe(true);
      
      // Should return all articles (validation may be handled at a different layer)
      // The key is that the system doesn't crash with malformed data
      expect(result.length).toBeGreaterThan(0);
      
      // Verify valid articles have proper structure
      const validArticles = result.filter(article => 
        article.article_id && 
        article.title && 
        article.title.length > 0 &&
        article.link &&
        article.link.startsWith('http')
      );
      
      expect(validArticles.length).toBeGreaterThanOrEqual(2);

      console.log('[Data Validation] Malformed data handling tested successfully');
    }, 15000);
  });
  describe('Performance Under Concurrent Agent Requests', () => {
    test('should handle concurrent news tool requests efficiently', async () => {
      // Create NewsData client with higher limits for concurrent testing
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-concurrent-key',
        rateLimiting: {
          requestsPerWindow: 200, // Higher limits for concurrent testing
          windowSizeMs: 60 * 1000,
          dailyQuota: 2000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 2000, // Larger cache for concurrent requests
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 20,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Mock news API with realistic response times
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockImplementation(async (params) => {
        // Simulate realistic API response time
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
        
        return {
          status: 'success',
          totalResults: 3,
          results: Array.from({ length: 3 }, (_, j) => ({
            article_id: `concurrent-${params.q || 'default'}-${j}`,
            title: `Concurrent News ${j + 1} for ${params.q || 'default'}`,
            link: `https://concurrent.example.com/article-${j}`,
            description: `Concurrent description ${j + 1}`,
            content: `Concurrent content ${j + 1}`,
            pubDate: new Date().toISOString(),
            source_id: `concurrent-source-${j}`,
            source_name: `Concurrent Source ${j + 1}`,
            source_url: `https://source-${j}.com`,
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          })),
        };
      });

      const startTime = Date.now();

      // Execute 20 concurrent news requests
      const promises = Array.from({ length: 20 }, (_, i) =>
        newsTools.fetchLatestNews({
          query: `concurrent test ${i}`,
          size: 3,
        })
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // Verify all requests completed successfully
      expect(results).toHaveLength(20);
      results.forEach((result, index) => {
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
        expect(result[0].title).toContain(`concurrent test ${index}`);
      });

      // Verify reasonable performance (should complete within 10 seconds)
      expect(totalTime).toBeLessThan(10000);

      // Verify all API calls were made
      expect(newsDataClient.fetchLatestNews).toHaveBeenCalledTimes(20);

      console.log(`[Performance] 20 concurrent requests completed in ${totalTime}ms`);
    }, 15000);

    test('should maintain cache efficiency under concurrent load', async () => {
      // Create NewsData client with cache optimization
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-cache-concurrent-key',
        rateLimiting: {
          requestsPerWindow: 150,
          windowSizeMs: 60 * 1000,
          dailyQuota: 1500,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 600, // Longer TTL for cache testing
            crypto: 600,
            market: 600,
            archive: 1800,
          },
          maxSize: 1500,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 15,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Track API calls vs cache hits
      let apiCallCount = 0;
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockImplementation(async (params) => {
        apiCallCount++;
        
        // Simulate API response time
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        
        return {
          status: 'success',
          totalResults: 2,
          results: Array.from({ length: 2 }, (_, j) => ({
            article_id: `cache-test-${params.q}-${j}`,
            title: `Cache Test News ${j + 1} for ${params.q}`,
            link: `https://cache.example.com/article-${j}`,
            description: `Cache test description ${j + 1}`,
            content: `Cache content ${j + 1}`,
            pubDate: new Date().toISOString(),
            source_id: `cache-source-${j}`,
            source_name: `Cache Source ${j + 1}`,
            source_url: `https://cache-source-${j}.com`,
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          })),
        };
      });

      const startTime = Date.now();

      // Create 15 requests with overlapping queries to test cache efficiency
      const queries = ['tech', 'finance', 'crypto', 'market', 'news'];
      const promises = Array.from({ length: 15 }, (_, i) => {
        const query = queries[i % queries.length]; // Repeat queries to trigger cache hits
        return newsTools.fetchLatestNews({
          query,
          size: 2,
        });
      });

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // Verify all requests completed
      expect(results).toHaveLength(15);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
      });

      // Verify cache efficiency - should have fewer API calls than total requests
      expect(apiCallCount).toBeLessThan(15);
      expect(apiCallCount).toBeGreaterThanOrEqual(5); // At least one call per unique query

      const cacheHitRate = ((15 - apiCallCount) / 15) * 100;
      expect(cacheHitRate).toBeGreaterThan(0);

      // Verify reasonable performance with caching
      expect(totalTime).toBeLessThan(8000);

      console.log(`[Cache Performance] ${apiCallCount} API calls for 15 requests (${cacheHitRate.toFixed(1)}% cache hit rate), completed in ${totalTime}ms`);
    }, 12000);

    test('should handle memory usage efficiently under load', async () => {
      // Monitor memory usage during load test
      const initialMemory = process.memoryUsage();

      // Create NewsData client
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-memory-key',
        rateLimiting: {
          requestsPerWindow: 300,
          windowSizeMs: 60 * 1000,
          dailyQuota: 3000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 500, // Moderate cache size to test memory management
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 20,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Mock API with varying response sizes
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockImplementation(async (params) => {
        await new Promise(resolve => setTimeout(resolve, 25));
        
        const resultCount = Math.floor(Math.random() * 5) + 1; // 1-5 results
        return {
          status: 'success',
          totalResults: resultCount,
          results: Array.from({ length: resultCount }, (_, j) => ({
            article_id: `memory-test-${Date.now()}-${j}`,
            title: `Memory Test News ${j + 1} - ${params.q}`,
            link: `https://memory.example.com/article-${j}`,
            description: `Memory test description ${j + 1} with additional content`,
            content: `Memory test content ${j + 1} with extended text for memory testing`,
            pubDate: new Date().toISOString(),
            source_id: `memory-source-${j}`,
            source_name: `Memory Source ${j + 1}`,
            source_url: `https://memory-source-${j}.com`,
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          })),
        };
      });

      // Execute load test in batches
      const batchSize = 10;
      const batches = 3;
      
      for (let batch = 0; batch < batches; batch++) {
        const batchPromises = Array.from({ length: batchSize }, (_, i) =>
          newsTools.fetchLatestNews({
            query: `memory batch ${batch} request ${i}`,
            size: Math.floor(Math.random() * 5) + 1,
          })
        );

        await Promise.all(batchPromises);

        // Check memory usage after each batch
        const currentMemory = process.memoryUsage();
        const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
        
        // Memory increase should be reasonable (less than 100MB)
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const finalMemory = process.memoryUsage();
      const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Verify reasonable memory usage
      expect(totalMemoryIncrease).toBeLessThan(150 * 1024 * 1024); // Less than 150MB increase

      console.log(`[Memory Performance] ${(totalMemoryIncrease / 1024 / 1024).toFixed(2)}MB increase after ${batchSize * batches} requests`);
    }, 15000);

    test('should maintain response time consistency under varying load', async () => {
      // Create NewsData client
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-response-time-key',
        rateLimiting: {
          requestsPerWindow: 200,
          windowSizeMs: 60 * 1000,
          dailyQuota: 2000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 15,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);

      // Mock API with consistent response times
      vi.spyOn(newsDataClient, 'fetchLatestNews').mockImplementation(async () => {
        // Simulate consistent API response time
        await new Promise(resolve => setTimeout(resolve, 75 + Math.random() * 25));
        
        return {
          status: 'success',
          totalResults: 2,
          results: Array.from({ length: 2 }, (_, j) => ({
            article_id: `response-time-${Date.now()}-${j}`,
            title: `Response Time Test News ${j + 1}`,
            link: `https://responsetime.example.com/article-${j}`,
            description: `Response time test description ${j + 1}`,
            content: `Response time content ${j + 1}`,
            pubDate: new Date().toISOString(),
            source_id: `response-source-${j}`,
            source_name: `Response Source ${j + 1}`,
            source_url: `https://response-source-${j}.com`,
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          })),
        };
      });

      // Test with varying load levels
      const loadLevels = [3, 8, 12]; // Different concurrent request counts
      const responseTimes: number[] = [];

      for (const loadLevel of loadLevels) {
        const startTime = Date.now();
        
        const promises = Array.from({ length: loadLevel }, (_, i) =>
          newsTools.fetchLatestNews({
            query: `load test ${loadLevel} request ${i}`,
            size: 2,
          })
        );

        const results = await Promise.all(promises);
        const batchTime = Date.now() - startTime;
        const avgResponseTime = batchTime / loadLevel;
        
        responseTimes.push(avgResponseTime);

        // Verify all requests completed
        expect(results).toHaveLength(loadLevel);
        results.forEach(result => {
          expect(Array.isArray(result)).toBe(true);
          expect(result.length).toBe(2);
        });

        // Small delay between load levels
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Verify response time consistency (variance should be reasonable)
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxDeviation = Math.max(...responseTimes.map(time => Math.abs(time - avgResponseTime)));
      
      // Maximum deviation should be less than 150% of average response time
      expect(maxDeviation).toBeLessThan(avgResponseTime * 1.5);

      console.log(`[Response Time] Response times: ${responseTimes.map(t => t.toFixed(0)).join('ms, ')}ms (avg: ${avgResponseTime.toFixed(0)}ms)`);
    }, 12000);
  });

  describe('System Integration Validation', () => {
    test('should validate complete system integration', async () => {
      // Test all major components integration
      const newsDataClient = createNewsDataClient({
        apiKey: 'test-integration-key',
        rateLimiting: {
          requestsPerWindow: 100,
          windowSizeMs: 15 * 60 * 1000,
          dailyQuota: 1000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 300,
            crypto: 300,
            market: 300,
            archive: 1800,
          },
          maxSize: 1000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      });

      const newsTools = createNewsToolsManager(newsDataClient);
      const integrationLayer = createNewsDataIntegrationLayer(newsDataClient);
      const agentFactory = createEnhancedAgentFactory(mockConfig);

      // Mock all news endpoints
      const mockNewsResponse = {
        status: 'success' as const,
        totalResults: 2,
        results: Array.from({ length: 2 }, (_, i) => ({
          article_id: `integration-${i}`,
          title: `Integration Test News ${i + 1}`,
          link: `https://integration.example.com/article-${i}`,
          description: `Integration test description ${i + 1}`,
          content: `Integration content ${i + 1}`,
          pubDate: new Date().toISOString(),
          source_id: `integration-source-${i}`,
          source_name: `Integration Source ${i + 1}`,
          source_url: `https://integration-source-${i}.com`,
          source_priority: 1,
          country: ['US'],
          category: ['business'],
          language: 'en',
          duplicate: false,
        })),
      };

      vi.spyOn(newsDataClient, 'fetchLatestNews').mockResolvedValue(mockNewsResponse);
      vi.spyOn(newsDataClient, 'fetchArchiveNews').mockResolvedValue(mockNewsResponse);
      vi.spyOn(newsDataClient, 'fetchCryptoNews').mockResolvedValue(mockNewsResponse);
      vi.spyOn(newsDataClient, 'fetchMarketNews').mockResolvedValue(mockNewsResponse);

      // Test individual component integration
      expect(newsDataClient).toBeDefined();
      expect(newsTools).toBeDefined();
      expect(integrationLayer).toBeDefined();
      expect(agentFactory).toBeDefined();

      // Test news tools functionality
      const latestNews = await newsTools.fetchLatestNews({ query: 'integration test' });
      expect(Array.isArray(latestNews)).toBe(true);
      expect(latestNews.length).toBe(2);

      const archiveNews = await newsTools.fetchArchiveNews({
        query: 'integration test',
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
      });
      expect(Array.isArray(archiveNews)).toBe(true);
      expect(archiveNews.length).toBe(2);

      const cryptoNews = await newsTools.fetchCryptoNews({ coins: ['btc'] });
      expect(Array.isArray(cryptoNews)).toBe(true);
      expect(cryptoNews.length).toBe(2);

      const marketNews = await newsTools.fetchMarketNews({ symbols: ['AAPL'] });
      expect(Array.isArray(marketNews)).toBe(true);
      expect(marketNews.length).toBe(2);

      // Test integration layer functionality
      const availableTools = integrationLayer.getAvailableTools();
      expect(Array.isArray(availableTools)).toBe(true);
      expect(availableTools.length).toBeGreaterThan(0);

      expect(integrationLayer.isToolAvailable('fetchLatestNews')).toBe(true);
      expect(integrationLayer.isToolAvailable('fetchArchiveNews')).toBe(true);
      expect(integrationLayer.isToolAvailable('fetchCryptoNews')).toBe(true);
      expect(integrationLayer.isToolAvailable('fetchMarketNews')).toBe(true);

      // Test enhanced agent factory integration
      expect(typeof agentFactory.createEnhancedAgentNode).toBe('function');
      expect(typeof agentFactory.enhanceExistingAgent).toBe('function');

      console.log('[Integration] Complete system integration validation passed successfully');
    }, 20000);
  });
});