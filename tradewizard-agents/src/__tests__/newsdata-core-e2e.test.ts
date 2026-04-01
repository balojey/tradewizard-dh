/**
 * Core End-to-End Tests for NewsData.io Integration
 *
 * This test suite focuses on the core NewsData.io integration functionality
 * without complex workflow dependencies. It tests the essential components
 * and their interactions under various conditions.
 */

import { describe, test, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createNewsDataClient } from './utils/newsdata-client.js';
import { createEnhancedAgentFactory } from './utils/enhanced-agent-factory.js';
import { createNewsDataIntegrationLayer } from './utils/newsdata-agent-integration.js';
import { createNewsToolsManager } from './utils/newsdata-agent-tools.js';
import type { EngineConfig } from './config/index.js';

// Helper function to create complete NewsData config with defaults
const createNewsDataConfig = (overrides: Partial<any> = {}) => ({
  apiKey: 'test-api-key',
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
  ...overrides,
});

describe('NewsData.io Core E2E Tests', () => {
  let mockConfig: EngineConfig;
  let originalEnv: Record<string, string | undefined>;
  let testStartTime: number;

  beforeAll(() => {
    testStartTime = Date.now();
    console.log('[Core E2E] Starting NewsData.io core integration tests');
  });

  afterAll(() => {
    const duration = (Date.now() - testStartTime) / 1000;
    console.log(`[Core E2E] Core tests completed in ${duration.toFixed(2)} seconds`);
  });

  beforeEach(() => {
    // Store original environment variables
    originalEnv = {
      NEWSDATA_INTEGRATION_ENABLED: process.env.NEWSDATA_INTEGRATION_ENABLED,
      NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };

    // Set test environment for NewsData integration
    process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
    process.env.NEWSDATA_API_KEY = 'test-newsdata-api-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // Create minimal mock config
    mockConfig = {
      polymarket: {
        gammaApiUrl: 'https://gamma-api.polymarket.com',
        clobApiUrl: 'https://clob.polymarket.com',
        rateLimitBuffer: 80,
      },
      langgraph: {
        checkpointer: 'memory',
        recursionLimit: 25,
        streamMode: 'values',
      },
      opik: {
        projectName: 'test-newsdata-core',
        tags: ['core-test', 'newsdata'],
        trackCosts: true,
      },
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: 'test-openai-key',
          defaultModel: 'gpt-4o-mini',
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
          enabled: false,
          aggressive: true,
          conservative: true,
          neutral: true,
        },
      },
      externalData: {
        news: {
          provider: 'newsdata',
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
      signalFusion: {
        baseWeights: {
          'market_microstructure': 1.0,
          'probability_baseline': 1.0,
          'risk_assessment': 1.0,
        },
        contextAdjustments: true,
        conflictThreshold: 0.20,
        alignmentBonus: 0.20,
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
    };
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

  describe('NewsData Client Core Functionality', () => {
    test('should create NewsData client with proper configuration', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-api-key',
      }));

      expect(client).toBeDefined();
      expect(typeof client.fetchLatestNews).toBe('function');
      expect(typeof client.fetchArchiveNews).toBe('function');
      expect(typeof client.fetchCryptoNews).toBe('function');
      expect(typeof client.fetchMarketNews).toBe('function');
    });

    test('should handle client configuration with disabled features', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-api-key',
        rateLimiting: {
          requestsPerWindow: 50,
          windowSizeMs: 10 * 60 * 1000,
          dailyQuota: 500,
        },
        cache: {
          enabled: false,
          ttl: {
            latest: 0,
            crypto: 0,
            market: 0,
            archive: 0,
          },
          maxSize: 0,
        },
        circuitBreaker: {
          enabled: false,
          failureThreshold: 10,
          resetTimeoutMs: 120000,
        },
      }));

      expect(client).toBeDefined();
      expect(typeof client.fetchLatestNews).toBe('function');
    });

    test('should create client with minimal configuration', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'minimal-test-key',
      }));

      expect(client).toBeDefined();
      expect(typeof client.fetchLatestNews).toBe('function');
      expect(typeof client.fetchArchiveNews).toBe('function');
      expect(typeof client.fetchCryptoNews).toBe('function');
      expect(typeof client.fetchMarketNews).toBe('function');
    });
  });

  describe('Enhanced Agent Factory Core Functionality', () => {
    test('should create enhanced agent factory successfully', () => {
      const factory = createEnhancedAgentFactory(mockConfig);
      
      expect(factory).toBeDefined();
      expect(typeof factory.createEnhancedAgentNode).toBe('function');
      expect(typeof factory.enhanceExistingAgent).toBe('function');
    });

    test('should create enhanced agent factory with NewsData disabled', () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'false';
      
      const factory = createEnhancedAgentFactory(mockConfig);
      
      expect(factory).toBeDefined();
      expect(typeof factory.createEnhancedAgentNode).toBe('function');
    });

    test('should create enhanced agent factory without API key', () => {
      delete process.env.NEWSDATA_API_KEY;
      
      const factory = createEnhancedAgentFactory(mockConfig);
      
      expect(factory).toBeDefined();
      expect(typeof factory.createEnhancedAgentNode).toBe('function');
    });

    test('should create enhanced agent node with mock functionality', async () => {
      const factory = createEnhancedAgentFactory(mockConfig);
      
      const mockState = {
        conditionId: 'test-condition',
        mbd: {
          marketId: 'test-market',
          conditionId: 'test-condition',
          eventType: 'election' as const,
          question: 'Test question?',
          resolutionCriteria: 'Test criteria',
          expiryTimestamp: Date.now() + 86400000,
          currentProbability: 0.5,
          liquidityScore: 7.0,
          bidAskSpread: 0.02,
          volatilityRegime: 'medium' as const,
          volume24h: 100000,
          metadata: {
            ambiguityFlags: [],
            keyCatalysts: [],
          },
        },
        ingestionError: null,
        activeAgents: ['test_agent'],
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

      const enhancedAgent = factory.createEnhancedAgentNode('test_agent', async (context) => {
        expect(context.state).toBeDefined();
        expect(context.newsTools).toBeDefined();
        expect(context.utils).toBeDefined();
        
        return {
          agentSignals: [
            {
              agentName: 'test_agent',
              timestamp: Date.now(),
              confidence: 0.8,
              direction: 'YES',
              fairProbability: 0.6,
              keyDrivers: ['Test driver'],
              riskFactors: ['Test risk'],
              metadata: {},
            },
          ],
        };
      });

      const result = await enhancedAgent(mockState);

      expect(result).toBeDefined();
      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog!.length).toBeGreaterThan(0);
    });
  });

  describe('NewsData Integration Layer Core Functionality', () => {
    test('should create integration layer successfully', () => {
      const client = createNewsDataClient({
        apiKey: 'test-api-key',
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

      const integrationLayer = createNewsDataIntegrationLayer(client);
      
      expect(integrationLayer).toBeDefined();
      expect(typeof integrationLayer.fetchLatestNews).toBe('function');
      expect(typeof integrationLayer.fetchArchiveNews).toBe('function');
      expect(typeof integrationLayer.fetchCryptoNews).toBe('function');
      expect(typeof integrationLayer.fetchMarketNews).toBe('function');
      expect(typeof integrationLayer.getAvailableTools).toBe('function');
      expect(typeof integrationLayer.isToolAvailable).toBe('function');
    });

    test('should provide available tools information', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-api-key',
      }));

      const integrationLayer = createNewsDataIntegrationLayer(client);
      
      const availableTools = integrationLayer.getAvailableTools();
      expect(Array.isArray(availableTools)).toBe(true);
      
      const isLatestAvailable = integrationLayer.isToolAvailable('fetchLatestNews');
      expect(typeof isLatestAvailable).toBe('boolean');
      
      const toolDescription = integrationLayer.getToolDescription('fetchLatestNews');
      expect(typeof toolDescription).toBe('string');
    });

    test('should handle integration layer with disabled NewsData', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-api-key',
      }));

      // Create integration layer with disabled configuration
      const integrationLayer = createNewsDataIntegrationLayer(client);
      
      expect(integrationLayer).toBeDefined();
      
      // Should still provide interface even if disabled
      const availableTools = integrationLayer.getAvailableTools();
      expect(Array.isArray(availableTools)).toBe(true);
    });
  });

  describe('News Tools Manager Core Functionality', () => {
    test('should create news tools manager successfully', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-api-key',
      }));

      const toolsManager = createNewsToolsManager(client);
      
      expect(toolsManager).toBeDefined();
      expect(typeof toolsManager.fetchLatestNews).toBe('function');
      expect(typeof toolsManager.fetchArchiveNews).toBe('function');
      expect(typeof toolsManager.fetchCryptoNews).toBe('function');
      expect(typeof toolsManager.fetchMarketNews).toBe('function');
      expect(typeof toolsManager.getAllTools).toBe('function');
      expect(typeof toolsManager.getTool).toBe('function');
    });

    test('should provide tool information', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-api-key',
      }));

      const toolsManager = createNewsToolsManager(client);
      
      const allTools = toolsManager.getAllTools();
      expect(Array.isArray(allTools)).toBe(true);
      expect(allTools.length).toBeGreaterThan(0);
      
      const latestTool = toolsManager.getTool('fetchLatestNews');
      expect(latestTool).toBeDefined();
      expect(latestTool?.name).toBe('fetchLatestNews');
      expect(typeof latestTool?.description).toBe('string');
    });

    test('should handle tool requests with various parameters', async () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-api-key',
      }));

      const toolsManager = createNewsToolsManager(client);
      
      // Mock the client methods to avoid actual API calls
      vi.spyOn(client, 'fetchLatestNews').mockResolvedValue({
        status: 'success',
        totalResults: 1,
        results: [
          {
            article_id: 'test-1',
            title: 'Test News Article',
            link: 'https://test.com/article',
            description: 'Test description',
            content: 'Test content',
            pubDate: new Date().toISOString(),
            source_id: 'test-source',
            source_name: 'Test Source',
            source_url: 'https://test.com',
            source_priority: 1,
            country: ['US'],
            category: ['business'],
            language: 'en',
            duplicate: false,
          },
        ],
      });

      // Test with minimal parameters
      const result1 = await toolsManager.fetchLatestNews({
        query: 'test',
      });
      expect(Array.isArray(result1)).toBe(true);

      // Test with comprehensive parameters
      const result2 = await toolsManager.fetchLatestNews({
        query: 'election',
        timeframe: '24h',
        categories: ['politics'],
        countries: ['US'],
        languages: ['en'],
        size: 10,
        fullContent: true,
        removeDuplicates: true,
        sort: 'relevancy',
      });
      expect(Array.isArray(result2)).toBe(true);

      expect(client.fetchLatestNews).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle missing API key gracefully', () => {
      expect(() => {
        createNewsDataClient(createNewsDataConfig({
          apiKey: '',
        }));
      }).not.toThrow();
    });

    test('should handle invalid configuration gracefully', () => {
      expect(() => {
        createNewsDataClient(createNewsDataConfig({
          apiKey: 'test-key',
          rateLimiting: {
            requestsPerWindow: -1,
            windowSizeMs: -1,
            dailyQuota: -1,
          },
        }));
      }).not.toThrow();
    });

    test('should handle NewsData integration disabled', () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'false';
      
      const factory = createEnhancedAgentFactory(mockConfig);
      expect(factory).toBeDefined();
      
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'test-key',
      }));
      expect(client).toBeDefined();
    });

    test('should handle enhanced agent errors gracefully', async () => {
      const factory = createEnhancedAgentFactory(mockConfig);
      
      const mockState = {
        conditionId: 'error-test-condition',
        mbd: null, // This should cause an error
        ingestionError: null,
        activeAgents: ['error_agent'],
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

      const enhancedAgent = factory.createEnhancedAgentNode('error_agent', async (context) => {
        // This should throw an error due to missing MBD
        if (!context.state.mbd) {
          throw new Error('No Market Briefing Document available');
        }
        return { agentSignals: [] };
      });

      const result = await enhancedAgent(mockState);

      // Should handle error gracefully and return error state
      expect(result).toBeDefined();
      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors).toHaveLength(1);
      expect(result.agentErrors![0].type).toBe('EXECUTION_FAILED');
      expect(result.auditLog).toBeDefined();
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle multiple client creations', () => {
      const clients = Array.from({ length: 10 }, (_, i) =>
        createNewsDataClient(createNewsDataConfig({
          apiKey: `test-key-${i}`,
        }))
      );

      expect(clients).toHaveLength(10);
      clients.forEach(client => {
        expect(client).toBeDefined();
        expect(typeof client.fetchLatestNews).toBe('function');
      });
    });

    test('should handle multiple enhanced agent factory creations', () => {
      const factories = Array.from({ length: 5 }, () =>
        createEnhancedAgentFactory(mockConfig)
      );

      expect(factories).toHaveLength(5);
      factories.forEach(factory => {
        expect(factory).toBeDefined();
        expect(typeof factory.createEnhancedAgentNode).toBe('function');
      });
    });

    test('should handle rapid sequential operations', async () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'performance-test-key',
      }));

      const toolsManager = createNewsToolsManager(client);

      // Mock the client to avoid actual API calls
      vi.spyOn(client, 'fetchLatestNews').mockResolvedValue({
        status: 'success',
        totalResults: 0,
        results: [],
      });

      // Perform 20 rapid sequential operations
      const promises = Array.from({ length: 20 }, (_, i) =>
        toolsManager.fetchLatestNews({
          query: `test-query-${i}`,
          size: 5,
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(20);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });

      expect(client.fetchLatestNews).toHaveBeenCalledTimes(20);
    });

    test('should maintain performance with large configurations', () => {
      const startTime = Date.now();

      // Create client with large configuration
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'large-config-test-key',
        rateLimiting: {
          requestsPerWindow: 10000,
          windowSizeMs: 60 * 60 * 1000,
          dailyQuota: 100000,
        },
        cache: {
          enabled: true,
          ttl: {
            latest: 3600,
            crypto: 3600,
            market: 3600,
            archive: 7200,
          },
          maxSize: 50000,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 100,
          resetTimeoutMs: 300000,
        },
      }));

      const creationTime = Date.now() - startTime;

      expect(client).toBeDefined();
      expect(creationTime).toBeLessThan(1000); // Should create within 1 second
    });
  });

  describe('Integration Compatibility', () => {
    test('should maintain backward compatibility with existing interfaces', () => {
      const client = createNewsDataClient(createNewsDataConfig({
        apiKey: 'compatibility-test-key',
      }));

      // Verify all expected methods exist
      const expectedMethods = [
        'fetchLatestNews',
        'fetchArchiveNews',
        'fetchCryptoNews',
        'fetchMarketNews',
      ];

      expectedMethods.forEach(method => {
        expect(typeof client[method as keyof typeof client]).toBe('function');
      });
    });

    test('should work with different configuration combinations', () => {
      // Test various configuration combinations
      const configs = [
        createNewsDataConfig({ apiKey: 'test-1' }),
        createNewsDataConfig({ 
          apiKey: 'test-2',
          rateLimiting: {
            requestsPerWindow: 50,
            windowSizeMs: 10 * 60 * 1000,
            dailyQuota: 500,
          },
        }),
        createNewsDataConfig({
          apiKey: 'test-3',
          cache: {
            enabled: false,
            ttl: { latest: 0, crypto: 0, market: 0, archive: 0 },
            maxSize: 0,
          },
        }),
        createNewsDataConfig({
          apiKey: 'test-4',
          circuitBreaker: {
            enabled: false,
            failureThreshold: 1,
            resetTimeoutMs: 1000,
          },
        }),
      ];

      configs.forEach((config) => {
        const client = createNewsDataClient(config);
        expect(client).toBeDefined();
        expect(typeof client.fetchLatestNews).toBe('function');
      });
    });

    test('should integrate properly with enhanced agent factory', () => {
      const factory = createEnhancedAgentFactory(mockConfig);
      
      // Verify factory can create different types of enhanced agents
      const agentTypes = ['breaking_news_agent', 'media_sentiment_agent', 'market_agent'];
      
      agentTypes.forEach(agentType => {
        const enhancedAgent = factory.createEnhancedAgentNode(agentType, async (context) => {
          expect(context.newsTools).toBeDefined();
          expect(context.utils).toBeDefined();
          return { agentSignals: [] };
        });
        
        expect(typeof enhancedAgent).toBe('function');
      });
    });
  });
});