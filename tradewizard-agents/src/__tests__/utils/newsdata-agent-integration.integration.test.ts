/**
 * Integration Tests for NewsData.io Agent Tools Integration
 *
 * These tests verify the end-to-end behavior of the NewsData.io integration
 * with the agent framework, including error handling, fallback scenarios,
 * and system resilience under various conditions.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EngineConfig } from '../config/index.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument } from '../models/types.js';
import { 
  EnhancedAgentFactory,
  createEnhancedAgentFactory,
} from './enhanced-agent-factory.js';
import { 
  createNewsDataIntegrationLayer 
} from './newsdata-agent-integration.js';
import { createNewsDataClient } from './newsdata-client.js';

describe('NewsData.io Agent Integration Tests', () => {
  let mockConfig: EngineConfig;
  let mockState: GraphStateType;
  let mockMbd: MarketBriefingDocument;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Store original environment variables
    originalEnv = {
      NEWSDATA_INTEGRATION_ENABLED: process.env.NEWSDATA_INTEGRATION_ENABLED,
      NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY,
    };

    // Create mock config
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
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: 'test-key',
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
      opik: {
        projectName: 'test-integration-project',
        tags: ['integration-test'],
        trackCosts: true,
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
      newsData: {
        enabled: true,
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
        agentTools: {
          enabled: true,
          defaultParams: {},
          maxRequestsPerHour: 10,
        },
      },
    };

    // Create mock Market Briefing Document
    mockMbd = {
      marketId: 'test-market-123',
      conditionId: 'test-condition-456',
      eventType: 'election',
      question: 'Will the 2024 US Presidential Election be decided by November 15, 2024?',
      resolutionCriteria: 'This market will resolve to "Yes" if major news outlets declare a winner of the 2024 US Presidential Election by November 15, 2024, 11:59 PM ET.',
      expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
      currentProbability: 0.75,
      liquidityScore: 8.5,
      bidAskSpread: 0.02,
      volatilityRegime: 'medium',
      volume24h: 150000,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [
          { event: 'Election Day', timestamp: Date.now() + 7 * 24 * 60 * 60 * 1000 },
        ],
      },
    };

    // Create mock state
    mockState = {
      conditionId: 'test-condition-456',
      mbd: mockMbd,
      ingestionError: null,
      activeAgents: ['breaking_news_agent', 'media_sentiment_agent'],
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

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Enhanced Agent Factory Integration', () => {
    test('should create enhanced agent factory with NewsData integration enabled', () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      expect(factory).toBeInstanceOf(EnhancedAgentFactory);
    });

    test('should create enhanced agent factory with NewsData integration disabled', () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'false';

      const factory = createEnhancedAgentFactory(mockConfig);
      expect(factory).toBeInstanceOf(EnhancedAgentFactory);
    });

    test('should handle missing NewsData API key gracefully', () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      delete process.env.NEWSDATA_API_KEY;

      expect(() => createEnhancedAgentFactory(mockConfig)).not.toThrow();
    });
  });

  describe('Enhanced Breaking News Agent', () => {
    test('should execute enhanced breaking news agent with mock news data', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      // Mock the news tools to return test data
      const mockNewsTools = {
        fetchLatestNews: vi.fn().mockResolvedValue([
          {
            title: 'Election Update: Polling Shows Tight Race',
            source: { name: 'Test News' },
            url: 'https://test.com/news/1',
            content: {
              description: 'Latest polling data shows a competitive race',
              fullContent: 'Detailed analysis of recent polling trends...',
            },
            metadata: {
              publishedAt: new Date().toISOString(),
            },
            ai: {
              sentiment: 'neutral',
            },
          },
        ]),
      };

      // Create enhanced agent with mocked tools
      const enhancedAgent = factory.createEnhancedAgentNode(
        'breaking_news_agent',
        async (context) => {
          // Mock the news tools in context
          context.newsTools = mockNewsTools as any;
          
          const newsArticles = await context.newsTools.fetchLatestNews({
            query: 'election',
            timeframe: '24h',
            size: 20,
          });

          return {
            agentSignals: [
              {
                agentName: 'breaking_news_agent',
                timestamp: Date.now(),
                confidence: 0.8,
                direction: 'YES',
                fairProbability: 0.75,
                keyDrivers: ['Recent polling data', 'Media coverage'],
                riskFactors: ['Polling uncertainty'],
                metadata: { newsCount: newsArticles.length },
              },
            ],
          };
        }
      );

      const result = await enhancedAgent(mockState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('breaking_news_agent');
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog!.length).toBeGreaterThan(0);
    });

    test('should handle news fetching errors gracefully', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      const enhancedAgent = factory.createEnhancedAgentNode(
        'breaking_news_agent',
        async (context) => {
          // Mock news tools to throw an error
          context.newsTools.fetchLatestNews = vi.fn().mockRejectedValue(
            new Error('API rate limit exceeded')
          );
          
          // This should throw and be caught by the factory
          await context.newsTools.fetchLatestNews({});
          
          return { agentSignals: [] };
        }
      );

      const result = await enhancedAgent(mockState);

      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors).toHaveLength(1);
      expect(result.agentErrors![0].type).toBe('EXECUTION_FAILED');
      expect(result.agentErrors![0].agentName).toBe('breaking_news_agent');
    });
  });

  describe('Enhanced Media Sentiment Agent', () => {
    test('should execute enhanced media sentiment agent successfully', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      const mockNewsTools = {
        fetchLatestNews: vi.fn().mockResolvedValue([
          {
            title: 'Positive Election Coverage Increases',
            source: { name: 'Sentiment News' },
            url: 'https://test.com/sentiment/1',
            content: {
              description: 'Analysis shows positive sentiment trending',
            },
            metadata: {
              publishedAt: new Date().toISOString(),
            },
            ai: {
              sentiment: 'positive',
            },
          },
        ]),
      };

      const enhancedAgent = factory.createEnhancedAgentNode(
        'media_sentiment_agent',
        async (context) => {
          context.newsTools = mockNewsTools as any;
          
          const newsArticles = await context.newsTools.fetchLatestNews({
            query: 'election sentiment',
            timeframe: '24h',
            size: 30,
          });

          return {
            agentSignals: [
              {
                agentName: 'media_sentiment_agent',
                timestamp: Date.now(),
                confidence: 0.7,
                direction: 'YES',
                fairProbability: 0.72,
                keyDrivers: ['Positive media sentiment'],
                riskFactors: ['Sentiment volatility'],
                metadata: { 
                  sentimentScore: 0.6,
                  newsCount: newsArticles.length 
                },
              },
            ],
          };
        }
      );

      const result = await enhancedAgent(mockState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('media_sentiment_agent');
      expect(mockNewsTools.fetchLatestNews).toHaveBeenCalledWith({
        query: 'election sentiment',
        timeframe: '24h',
        size: 30,
      });
    });
  });

  describe('Enhanced Market Microstructure Agent', () => {
    test('should execute enhanced market microstructure agent successfully', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      const mockNewsTools = {
        fetchMarketNews: vi.fn().mockResolvedValue([
          {
            title: 'Market Analysis: Election Betting Trends',
            source: { name: 'Market News' },
            url: 'https://test.com/market/1',
            content: {
              description: 'Analysis of prediction market trends',
              fullContent: 'Detailed market microstructure analysis...',
            },
            metadata: {
              publishedAt: new Date().toISOString(),
            },
            ai: {
              sentiment: 'neutral',
            },
          },
        ]),
      };

      const enhancedAgent = factory.createEnhancedAgentNode(
        'market_microstructure_agent',
        async (context) => {
          context.newsTools = mockNewsTools as any;
          
          const marketNews = await context.newsTools.fetchMarketNews({
            query: 'election market',
            timeframe: '24h',
            size: 15,
          });

          return {
            agentSignals: [
              {
                agentName: 'market_microstructure_agent',
                timestamp: Date.now(),
                confidence: 0.85,
                direction: 'YES',
                fairProbability: 0.78,
                keyDrivers: ['Market liquidity patterns', 'Trading volume'],
                riskFactors: ['Market manipulation risk'],
                metadata: { 
                  marketNewsCount: marketNews.length,
                  liquidityScore: 8.5 
                },
              },
            ],
          };
        }
      );

      const result = await enhancedAgent(mockState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].agentName).toBe('market_microstructure_agent');
      expect(mockNewsTools.fetchMarketNews).toHaveBeenCalledWith({
        query: 'election market',
        timeframe: '24h',
        size: 15,
      });
    });
  });

  describe('Agent News Integration Layer', () => {
    test('should create agent news integration successfully', () => {
      const newsDataClient = createNewsDataClient({
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

      const integration = createNewsDataIntegrationLayer(
        newsDataClient
      );

      expect(integration).toBeDefined();
    });

    test('should fetch latest news through integration layer', async () => {
      const mockNewsDataClient = {
        fetchLatestNews: vi.fn().mockResolvedValue({
          results: [
            {
              title: 'Test News Article',
              source_name: 'Test Source',
              link: 'https://test.com/article',
              description: 'Test description',
              pubDate: new Date().toISOString(),
              ai_tag: 'neutral',
            },
          ],
          totalResults: 1,
        }),
      };

      const integration = createNewsDataIntegrationLayer(
        mockNewsDataClient as any
      );

      const result = await integration.fetchLatestNews({
        query: 'test query',
        size: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test News Article');
      expect(mockNewsDataClient.fetchLatestNews).toHaveBeenCalledWith({
        query: 'test query',
        size: 10,
      });
    });

    test('should handle API errors in integration layer', async () => {
      const mockNewsDataClient = {
        fetchLatestNews: vi.fn().mockRejectedValue(
          new Error('API service unavailable')
        ),
      };

      const integration = createNewsDataIntegrationLayer(
        mockNewsDataClient as any
      );

      await expect(
        integration.fetchLatestNews({ query: 'test' })
      ).rejects.toThrow('API service unavailable');
    });
  });

  describe('System Resilience Tests', () => {
    test('should handle NewsData integration disabled gracefully', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'false';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      const enhancedAgent = factory.createEnhancedAgentNode(
        'breaking_news_agent',
        async (_context) => {
          // Should still work without news tools
          return {
            agentSignals: [
              {
                agentName: 'breaking_news_agent',
                timestamp: Date.now(),
                confidence: 0.5,
                direction: 'NEUTRAL',
                fairProbability: 0.5,
                keyDrivers: ['No external data'],
                riskFactors: ['Limited information'],
                metadata: {},
              },
            ],
          };
        }
      );

      const result = await enhancedAgent(mockState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals).toHaveLength(1);
      expect(result.agentSignals![0].direction).toBe('NEUTRAL');
    });

    test('should handle concurrent agent requests', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      const mockNewsTools = {
        fetchLatestNews: vi.fn().mockResolvedValue([]),
        fetchMarketNews: vi.fn().mockResolvedValue([]),
      };

      // Create multiple enhanced agents
      const agents = [
        factory.createEnhancedAgentNode('agent1', async (context) => {
          context.newsTools = mockNewsTools as any;
          await context.newsTools.fetchLatestNews({});
          return { agentSignals: [] };
        }),
        factory.createEnhancedAgentNode('agent2', async (context) => {
          context.newsTools = mockNewsTools as any;
          await context.newsTools.fetchMarketNews({});
          return { agentSignals: [] };
        }),
        factory.createEnhancedAgentNode('agent3', async (context) => {
          context.newsTools = mockNewsTools as any;
          await context.newsTools.fetchLatestNews({});
          return { agentSignals: [] };
        }),
      ];

      // Execute all agents concurrently
      const results = await Promise.all(
        agents.map(agent => agent(mockState))
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.auditLog).toBeDefined();
      });
    });

    test('should handle rate limiting scenarios', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      const mockNewsTools = {
        fetchLatestNews: vi.fn()
          .mockRejectedValueOnce(new Error('Rate limit exceeded'))
          .mockResolvedValueOnce([]),
      };

      const enhancedAgent = factory.createEnhancedAgentNode(
        'rate_limited_agent',
        async (context) => {
          context.newsTools = mockNewsTools as any;
          
          try {
            await context.newsTools.fetchLatestNews({});
            return { agentSignals: [] };
          } catch (error) {
            // Should handle rate limiting gracefully
            throw error;
          }
        }
      );

      const result = await enhancedAgent(mockState);

      expect(result.agentErrors).toBeDefined();
      expect(result.agentErrors).toHaveLength(1);
      expect(result.agentErrors![0].type).toBe('EXECUTION_FAILED');
      if (result.agentErrors![0].type === 'EXECUTION_FAILED') {
        expect(result.agentErrors![0].error.message).toContain('Rate limit exceeded');
      }
    });
  });

  describe('Performance Under Load', () => {
    test('should handle multiple rapid requests', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      const mockNewsTools = {
        fetchLatestNews: vi.fn().mockResolvedValue([]),
      };

      const enhancedAgent = factory.createEnhancedAgentNode(
        'load_test_agent',
        async (context) => {
          context.newsTools = mockNewsTools as any;
          await context.newsTools.fetchLatestNews({});
          return { agentSignals: [] };
        }
      );

      // Execute 10 rapid requests
      const promises = Array(10).fill(null).map(() => enhancedAgent(mockState));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(mockNewsTools.fetchLatestNews).toHaveBeenCalledTimes(10);
    });

    test('should maintain performance with large news datasets', async () => {
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
      process.env.NEWSDATA_API_KEY = 'test-api-key';

      const factory = createEnhancedAgentFactory(mockConfig);
      
      // Create large mock dataset
      const largeNewsDataset = Array(100).fill(null).map((_, index) => ({
        title: `News Article ${index}`,
        source: { name: `Source ${index}` },
        url: `https://test.com/article/${index}`,
        content: {
          description: `Description for article ${index}`,
        },
        metadata: {
          publishedAt: new Date().toISOString(),
        },
        ai: {
          sentiment: 'neutral',
        },
      }));

      const mockNewsTools = {
        fetchLatestNews: vi.fn().mockResolvedValue(largeNewsDataset),
      };

      const enhancedAgent = factory.createEnhancedAgentNode(
        'large_dataset_agent',
        async (context) => {
          context.newsTools = mockNewsTools as any;
          
          const startTime = Date.now();
          const newsArticles = await context.newsTools.fetchLatestNews({});
          const processingTime = Date.now() - startTime;

          return {
            agentSignals: [
              {
                agentName: 'large_dataset_agent',
                timestamp: Date.now(),
                confidence: 0.8,
                direction: 'YES',
                fairProbability: 0.75,
                keyDrivers: ['Large dataset analysis'],
                riskFactors: ['Processing time'],
                metadata: { 
                  newsCount: newsArticles.length,
                  processingTime 
                },
              },
            ],
          };
        }
      );

      const result = await enhancedAgent(mockState);

      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals![0].metadata.newsCount).toBe(100);
      expect(result.agentSignals![0].metadata.processingTime).toBeLessThan(5000); // Should process within 5 seconds
    });
  });
});