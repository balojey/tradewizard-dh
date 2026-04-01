/**
 * News Migration Integration Tests
 * 
 * Tests the complete migration process from NewsAPI to NewsData.io
 * including backward compatibility, cache migration, and rollback functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DataSourceConfig } from './data-integration.js';
import { MigrationAwareDataIntegrationLayer, createEnhancedDataSourceConfigFromEnv } from './data-integration-migration.js';
import { NewsMigrationManager, NewsAPICompatibilityMapper, type MigrationConfig } from './newsapi-compatibility-layer.js';
import { NewsMigrationUtilities, CacheMigrationTool, ConfigMigrationTool } from './news-migration-utilities.js';
import type { NewsDataClient, NewsDataArticle } from './newsdata-client.js';
import type { MarketBriefingDocument } from '../models/types.js';

// ============================================================================
// Test Setup and Mocks
// ============================================================================

// Mock NewsData.io client
const mockNewsDataClient: Partial<NewsDataClient> = {
  searchNews: vi.fn(),
  testConnection: vi.fn(),
  fetchLatestNews: vi.fn(),
};

// Mock market briefing document
const mockMarket: MarketBriefingDocument = {
  marketId: 'test-market-123',
  conditionId: 'condition-123',
  eventType: 'economic',
  question: 'Will Bitcoin reach $100,000 by end of 2024?',
  resolutionCriteria: 'Bitcoin price must reach $100,000 on CoinGecko',
  expiryTimestamp: new Date('2024-12-31').getTime(),
  currentProbability: 0.65,
  liquidityScore: 8.5,
  bidAskSpread: 2.5,
  volatilityRegime: 'high',
  volume24h: 50000,
  metadata: {
    ambiguityFlags: [],
    keyCatalysts: [
      {
        event: 'Bitcoin ETF approval',
        timestamp: new Date('2024-03-31').getTime(),
      },
    ],
  },
};

// Mock NewsData.io articles
const mockNewsDataArticles: NewsDataArticle[] = [
  {
    article_id: 'nd_123',
    title: 'Bitcoin Surges Past $90,000 as Institutional Adoption Grows',
    link: 'https://example.com/bitcoin-news-1',
    source_name: 'CryptoNews',
    source_id: 'cryptonews',
    source_url: 'https://cryptonews.com',
    source_priority: 50000,
    description: 'Bitcoin reaches new all-time high as major institutions announce adoption plans.',
    pubDate: '2024-01-15 10:30:00',
    content: 'Full article content about Bitcoin surge...',
    country: ['us'],
    category: ['business'],
    language: 'en',
    duplicate: false,
    keywords: ['bitcoin', 'cryptocurrency', 'institutional'],
    creator: ['John Doe'],
    image_url: 'https://example.com/bitcoin-image.jpg',
    sentiment: 'positive' as const,
    ai_tag: ['finance', 'cryptocurrency'],
  },
  {
    article_id: 'nd_124',
    title: 'Crypto Market Analysis: Bitcoin Price Predictions for 2024',
    link: 'https://example.com/bitcoin-news-2',
    source_name: 'Financial Times',
    source_id: 'ft',
    source_url: 'https://ft.com',
    source_priority: 10000,
    description: 'Expert analysis on Bitcoin price movements and future predictions.',
    pubDate: '2024-01-15 14:20:00',
    content: 'Detailed analysis of Bitcoin market trends...',
    country: ['uk'],
    category: ['business'],
    language: 'en',
    duplicate: false,
    keywords: ['bitcoin', 'analysis', 'prediction'],
    creator: ['Jane Smith'],
    sentiment: 'neutral' as const,
    symbol: ['BTC'],
  },
];

// ============================================================================
// Migration Configuration Tests
// ============================================================================

describe('Migration Configuration', () => {
  beforeEach(() => {
    // Reset environment variables
    vi.resetModules();
    process.env = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create migration config from environment variables', () => {
    // Set up environment variables
    process.env.NEWS_MIGRATION_ENABLED = 'true'; // This is required for migration config to be created
    process.env.NEWS_MIGRATION_STRATEGY = 'gradual-migration';
    process.env.NEWS_API_KEY = 'newsapi-test-key';
    process.env.NEWSDATA_API_KEY = 'newsdata-test-key';
    process.env.NEWS_MIGRATION_PERCENTAGE = '25';
    process.env.NEWS_MIGRATION_FALLBACK_ENABLED = 'true';

    const config = createEnhancedDataSourceConfigFromEnv();

    expect(config.migration).toBeDefined();
    expect(config.migration?.strategy).toBe('gradual-migration');
    expect(config.migration?.newsapi?.apiKey).toBe('newsapi-test-key');
    expect(config.migration?.newsdata?.apiKey).toBe('newsdata-test-key');
    expect(config.migration?.migration?.newsDataPercentage).toBe(25);
    expect(config.migration?.migration?.fallbackEnabled).toBe(true);
  });

  it('should handle missing migration configuration gracefully', () => {
    // No migration environment variables set
    const config = createEnhancedDataSourceConfigFromEnv();

    expect(config.migration).toBeUndefined();
    expect(config.news.provider).toBe('newsapi'); // Default to NewsAPI
  });

  it('should validate migration configuration', () => {
    const migrationConfig: MigrationConfig = {
      strategy: 'gradual-migration',
      newsapi: {
        apiKey: 'test-key',
        enabled: true,
      },
      newsdata: {
        apiKey: 'test-key',
        enabled: true,
      },
      migration: {
        newsDataPercentage: 50,
        fallbackEnabled: true,
        preserveCache: true,
        rollbackEnabled: true,
      },
      compatibility: {
        mapToNewsAPIFormat: true,
        includeExtendedFields: false,
        defaultValues: {
          author: 'Unknown',
          source: 'Unknown Source',
        },
      },
    };

    const mapper = new NewsAPICompatibilityMapper(migrationConfig);
    expect(mapper).toBeDefined();
  });
});

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

describe('Backward Compatibility', () => {
  let migrationConfig: MigrationConfig;
  let mapper: NewsAPICompatibilityMapper;

  beforeEach(() => {
    migrationConfig = {
      strategy: 'dual-provider',
      newsapi: { apiKey: 'test-key', enabled: true },
      newsdata: { apiKey: 'test-key', enabled: true },
      migration: {
        newsDataPercentage: 50,
        fallbackEnabled: true,
        preserveCache: true,
        rollbackEnabled: true,
      },
      compatibility: {
        mapToNewsAPIFormat: true,
        includeExtendedFields: false,
        defaultValues: {
          author: 'Unknown',
          source: 'Unknown Source',
        },
      },
    };

    mapper = new NewsAPICompatibilityMapper(migrationConfig);
  });

  it('should map NewsData.io article to NewsAPI format', () => {
    const newsDataArticle = mockNewsDataArticles[0];
    const newsApiArticle = mapper.mapNewsDataToNewsAPI(newsDataArticle);

    expect(newsApiArticle).toEqual({
      source: {
        id: 'cryptonews',
        name: 'CryptoNews',
      },
      author: 'John Doe',
      title: 'Bitcoin Surges Past $90,000 as Institutional Adoption Grows',
      description: 'Bitcoin reaches new all-time high as major institutions announce adoption plans.',
      url: 'https://example.com/bitcoin-news-1',
      urlToImage: 'https://example.com/bitcoin-image.jpg',
      publishedAt: expect.any(String), // ISO 8601 format
      content: 'Full article content about Bitcoin surge...',
    });

    // Verify ISO 8601 date format
    expect(new Date(newsApiArticle.publishedAt).toISOString()).toBe(newsApiArticle.publishedAt);
  });

  it('should map NewsData.io article to extended format with additional fields', () => {
    migrationConfig.compatibility.includeExtendedFields = true;
    mapper = new NewsAPICompatibilityMapper(migrationConfig);

    const newsDataArticle = mockNewsDataArticles[0];
    const extendedArticle = mapper.mapNewsDataToExtended(newsDataArticle);

    // Check base NewsArticle fields
    expect(extendedArticle.title).toBe(newsDataArticle.title);
    expect(extendedArticle.source).toBe(newsDataArticle.source_name);
    expect(extendedArticle.url).toBe(newsDataArticle.link);
    expect(extendedArticle.sentiment).toBe('positive');

    // Check NewsAPI compatibility fields
    expect(extendedArticle.author).toBe('John Doe');
    expect(extendedArticle.urlToImage).toBe(newsDataArticle.image_url);
    expect(extendedArticle.content).toBe(newsDataArticle.content);

    // Check extended NewsData.io fields
    expect(extendedArticle.article_id).toBe(newsDataArticle.article_id);
    expect(extendedArticle.source_id).toBe(newsDataArticle.source_id);
    expect(extendedArticle.keywords).toEqual(newsDataArticle.keywords);
    expect(extendedArticle.ai_tag).toEqual(newsDataArticle.ai_tag);
  });

  it('should handle missing fields gracefully with default values', () => {
    const incompleteArticle: NewsDataArticle = {
      article_id: 'test-123',
      title: 'Test Article',
      link: 'https://example.com/test',
      source_name: 'Test Source',
      source_id: 'test',
      source_url: 'https://test.com',
      source_priority: 100000,
      pubDate: '2024-01-15 10:00:00',
      language: 'en',
      duplicate: false,
      // Missing: description, content, creator, image_url, etc.
    };

    const newsApiArticle = mapper.mapNewsDataToNewsAPI(incompleteArticle);

    expect(newsApiArticle.author).toBe('Unknown'); // Default value
    expect(newsApiArticle.description).toBeNull();
    expect(newsApiArticle.content).toBeNull();
    expect(newsApiArticle.urlToImage).toBeNull();
  });
});

// ============================================================================
// Migration Manager Tests
// ============================================================================

describe('Migration Manager', () => {
  let migrationManager: NewsMigrationManager;
  let migrationConfig: MigrationConfig;

  beforeEach(() => {
    migrationConfig = {
      strategy: 'gradual-migration',
      newsapi: { apiKey: 'newsapi-key', enabled: true },
      newsdata: { apiKey: 'newsdata-key', enabled: true },
      migration: {
        newsDataPercentage: 25,
        fallbackEnabled: true,
        preserveCache: true,
        rollbackEnabled: true,
      },
      compatibility: {
        mapToNewsAPIFormat: true,
        includeExtendedFields: false,
        defaultValues: {
          author: 'Unknown',
          source: 'Unknown Source',
        },
      },
    };

    migrationManager = new NewsMigrationManager(
      migrationConfig,
      mockNewsDataClient as NewsDataClient
    );
  });

  it('should determine provider based on migration strategy', () => {
    // Test gradual migration with 25% to NewsData.io
    const results = Array.from({ length: 100 }, () => migrationManager.shouldUseNewsData());
    const newsDataCount = results.filter(Boolean).length;
    
    // Should be approximately 25% (allow some variance due to randomness)
    expect(newsDataCount).toBeGreaterThan(15);
    expect(newsDataCount).toBeLessThan(35);
  });

  it('should use NewsData.io only when strategy is newsdata-only', () => {
    migrationManager.updateMigrationConfig({
      strategy: 'newsdata-only',
    });

    for (let i = 0; i < 10; i++) {
      expect(migrationManager.shouldUseNewsData()).toBe(true);
    }
  });

  it('should use NewsAPI only when strategy is newsapi-only', () => {
    migrationManager.updateMigrationConfig({
      strategy: 'newsapi-only',
    });

    for (let i = 0; i < 10; i++) {
      expect(migrationManager.shouldUseNewsData()).toBe(false);
    }
  });

  it('should fetch news using NewsData.io when selected', async () => {
    // Mock NewsData.io client to return test articles
    vi.mocked(mockNewsDataClient.searchNews!).mockResolvedValue(mockNewsDataArticles);

    // Force NewsData.io usage
    migrationManager.updateMigrationConfig({
      strategy: 'newsdata-only',
    });

    const articles = await migrationManager.fetchNews('bitcoin price prediction', {
      endpoint: 'latest',
      limit: 10,
    });

    expect(mockNewsDataClient.searchNews).toHaveBeenCalledWith('bitcoin price prediction', {
      endpoint: 'latest',
      limit: 10,
    });

    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('Bitcoin Surges Past $90,000 as Institutional Adoption Grows');
    expect(articles[0].sentiment).toBe('positive');
  });

  it('should get migration status correctly', () => {
    const status = migrationManager.getMigrationStatus();

    expect(status).toEqual({
      strategy: 'gradual-migration',
      newsDataEnabled: true,
      newsAPIEnabled: true,
      migrationPercentage: 25,
      fallbackEnabled: true,
    });
  });
});

// ============================================================================
// Data Integration Layer Migration Tests
// ============================================================================

describe('Migration-Aware Data Integration Layer', () => {
  let dataLayer: MigrationAwareDataIntegrationLayer;
  let enhancedConfig: any;

  beforeEach(() => {
    enhancedConfig = {
      news: {
        provider: 'newsapi',
        apiKey: 'test-key',
        cacheTTL: 900,
        maxArticles: 50,
      },
      polling: {
        provider: 'none',
        cacheTTL: 3600,
      },
      social: {
        providers: [],
        cacheTTL: 1800,
        maxMentions: 100,
      },
      migration: {
        strategy: 'gradual-migration',
        newsapi: { apiKey: 'newsapi-key', enabled: true },
        newsdata: { apiKey: 'newsdata-key', enabled: true },
        migration: {
          newsDataPercentage: 50,
          fallbackEnabled: true,
          preserveCache: true,
          rollbackEnabled: true,
        },
        compatibility: {
          mapToNewsAPIFormat: true,
          includeExtendedFields: false,
          defaultValues: {
            author: 'Unknown',
            source: 'Unknown Source',
          },
        },
      },
    };

    dataLayer = new MigrationAwareDataIntegrationLayer(
      enhancedConfig,
      undefined,
      mockNewsDataClient as NewsDataClient
    );
  });

  it('should maintain existing DataIntegrationLayer interface', async () => {
    // Mock the migration manager's fetchNews method
    const mockFetchNews = vi.fn().mockResolvedValue([
      {
        title: 'Test Article',
        source: 'Test Source',
        publishedAt: Math.floor(Date.now() / 1000),
        url: 'https://example.com/test',
        summary: 'Test summary',
        sentiment: 'neutral' as const,
        relevanceScore: 0.8,
      },
    ]);

    // Replace the migration manager's fetchNews method
    (dataLayer as any).migrationManager = {
      fetchNews: mockFetchNews,
    };

    const articles = await dataLayer.fetchNews(mockMarket, 24);

    expect(articles).toHaveLength(1);
    expect(articles[0]).toEqual({
      title: 'Test Article',
      source: 'Test Source',
      publishedAt: expect.any(Number),
      url: 'https://example.com/test',
      summary: 'Test summary',
      sentiment: 'neutral',
      relevanceScore: 0.8,
    });

    expect(mockFetchNews).toHaveBeenCalledWith(
      expect.stringContaining('Bitcoin'),
      {
        endpoint: 'latest',
        limit: 50,
        timeframe: '24h',
      }
    );
  });

  it('should get migration status', () => {
    const status = dataLayer.getMigrationStatus();

    expect(status.enabled).toBe(true);
    expect(status.strategy).toBe('gradual-migration');
    expect(status.newsDataEnabled).toBe(true);
    expect(status.newsAPIEnabled).toBe(true);
  });

  it('should enable NewsData.io migration', () => {
    dataLayer.enableNewsDataMigration(75);

    const status = dataLayer.getMigrationStatus();
    expect(status.migrationPercentage).toBe(75);
    expect(status.strategy).toBe('gradual-migration');
  });

  it('should complete migration to NewsData.io', () => {
    dataLayer.completeMigrationToNewsData();

    const status = dataLayer.getMigrationStatus();
    expect(status.strategy).toBe('newsdata-only');
    expect(status.newsDataEnabled).toBe(true);
    expect(status.newsAPIEnabled).toBe(false);
  });

  it('should rollback to NewsAPI', () => {
    dataLayer.rollbackToNewsAPI();

    const status = dataLayer.getMigrationStatus();
    expect(status.strategy).toBe('newsapi-only');
    expect(status.newsAPIEnabled).toBe(true);
    expect(status.newsDataEnabled).toBe(false);
  });

  it('should test NewsData.io connection', async () => {
    vi.mocked(mockNewsDataClient.testConnection!).mockResolvedValue(true);

    const result = await dataLayer.testNewsDataConnection();
    expect(result).toBe(true);
    expect(mockNewsDataClient.testConnection).toHaveBeenCalled();
  });
});

// ============================================================================
// Cache Migration Tests
// ============================================================================

describe('Cache Migration', () => {
  let cacheMigrationTool: CacheMigrationTool;

  beforeEach(() => {
    cacheMigrationTool = new CacheMigrationTool();
  });

  it('should migrate cache data successfully', async () => {
    const result = await cacheMigrationTool.migrateCacheData(
      'test-source-cache',
      'test-target-cache',
      true
    );

    expect(result.success).toBe(true);
    expect(result.entriesMigrated).toBe(0); // No actual cache data in test
    expect(result.errors).toEqual([]);
  });

  it('should validate migrated cache data', async () => {
    const validation = await cacheMigrationTool.validateMigratedCache('test-cache-path');

    expect(validation.valid).toBe(true); // Empty cache is valid
    expect(validation.issues).toEqual([]);
    expect(validation.stats.totalEntries).toBe(0);
  });
});

// ============================================================================
// Configuration Migration Tests
// ============================================================================

describe('Configuration Migration', () => {
  let configMigrationTool: ConfigMigrationTool;

  beforeEach(() => {
    configMigrationTool = new ConfigMigrationTool();
  });

  it('should migrate configuration from NewsAPI to NewsData.io', async () => {
    const sourceConfig: DataSourceConfig = {
      news: {
        provider: 'newsapi',
        apiKey: 'newsapi-test-key',
        cacheTTL: 900,
        maxArticles: 50,
      },
      polling: {
        provider: 'none',
        cacheTTL: 3600,
      },
      social: {
        providers: [],
        cacheTTL: 1800,
        maxMentions: 100,
      },
    };

    const result = await configMigrationTool.migrateConfiguration(sourceConfig);

    expect(result.success).toBe(true);
    expect(result.migratedConfig.strategy).toBe('gradual-migration');
    expect(result.migratedConfig.newsapi?.enabled).toBe(true);
    expect(result.migratedConfig.newsapi?.apiKey).toBe('newsapi-test-key');
    expect(result.migratedConfig.migration?.newsDataPercentage).toBe(0);
    expect(result.migratedConfig.migration?.fallbackEnabled).toBe(true);
  });

  it('should generate environment migration script', () => {
    const { script, instructions } = configMigrationTool.generateEnvironmentMigrationScript();

    expect(script).toContain('NEWS_MIGRATION_ENABLED=true');
    expect(script).toContain('NEWS_MIGRATION_STRATEGY=gradual-migration');
    expect(script).toContain('NEWSDATA_ENABLED=true');

    expect(instructions).toHaveLength(7);
    expect(instructions[0]).toContain('Run this script');
    expect(instructions[1]).toContain('NEWSDATA_API_KEY');
  });
});

// ============================================================================
// Complete Migration Process Tests
// ============================================================================

describe('Complete Migration Process', () => {
  let migrationUtilities: NewsMigrationUtilities;

  beforeEach(() => {
    migrationUtilities = new NewsMigrationUtilities();
  });

  it('should execute complete migration process in dry run mode', async () => {
    const sourceConfig: DataSourceConfig = {
      news: {
        provider: 'newsapi',
        apiKey: 'test-key',
        cacheTTL: 900,
        maxArticles: 50,
      },
      polling: {
        provider: 'none',
        cacheTTL: 3600,
      },
      social: {
        providers: [],
        cacheTTL: 1800,
        maxMentions: 100,
      },
    };

    const result = await migrationUtilities.executeMigration({
      sourceConfig,
      sourceCachePath: 'test-source-cache',
      targetCachePath: 'test-target-cache',
      targetConfigPath: 'test-config.json',
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.state.phase).toBe('completed');
    expect(result.state.progress).toBe(100);
    expect(result.state.stats.errorsEncountered).toBe(0);
  });

  it('should get migration state', () => {
    const state = migrationUtilities.getMigrationState();

    expect(state.version).toBe('1.0.0');
    expect(state.phase).toBe('preparation');
    expect(state.progress).toBe(0);
    expect(state.stats.cacheEntriesMigrated).toBe(0);
    expect(state.errors).toEqual([]);
  });

  it('should rollback migration', async () => {
    const rollbackInfo = {
      configBackupPath: 'test-config-backup',
      cacheBackupPath: 'test-cache-backup',
    };

    const result = await migrationUtilities.rollbackMigration(rollbackInfo);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ============================================================================
// Error Handling and Edge Cases
// ============================================================================

describe('Error Handling and Edge Cases', () => {
  it('should handle missing NewsData.io client gracefully', async () => {
    const enhancedConfig = {
      news: { provider: 'newsapi' as const, cacheTTL: 900, maxArticles: 50 },
      polling: { provider: 'none' as const, cacheTTL: 3600 },
      social: { providers: [], cacheTTL: 1800, maxMentions: 100 },
      migration: {
        strategy: 'newsdata-only' as const,
        newsdata: { apiKey: 'test-key', enabled: true },
        compatibility: {
          mapToNewsAPIFormat: true,
          includeExtendedFields: false,
          defaultValues: { author: 'Unknown', source: 'Unknown Source' },
        },
      },
    };

    const dataLayer = new MigrationAwareDataIntegrationLayer(enhancedConfig);

    // Should fallback to base implementation when NewsData.io client is not available
    const articles = await dataLayer.fetchNews(mockMarket, 24);
    expect(articles).toEqual([]); // Base implementation returns empty array
  });

  it('should handle invalid migration percentage', () => {
    const migrationConfig: MigrationConfig = {
      strategy: 'gradual-migration',
      newsapi: { apiKey: 'test-key', enabled: true },
      newsdata: { apiKey: 'test-key', enabled: true },
      migration: {
        newsDataPercentage: 150, // Invalid percentage
        fallbackEnabled: true,
        preserveCache: true,
        rollbackEnabled: true,
      },
      compatibility: {
        mapToNewsAPIFormat: true,
        includeExtendedFields: false,
        defaultValues: { author: 'Unknown', source: 'Unknown Source' },
      },
    };

    const migrationManager = new NewsMigrationManager(migrationConfig);

    // Should handle invalid percentage gracefully
    expect(() => migrationManager.getMigrationStatus()).not.toThrow();
  });

  it('should handle date parsing errors in compatibility mapper', () => {
    const migrationConfig: MigrationConfig = {
      strategy: 'dual-provider',
      compatibility: {
        mapToNewsAPIFormat: true,
        includeExtendedFields: false,
        defaultValues: { author: 'Unknown', source: 'Unknown Source' },
      },
    };

    const mapper = new NewsAPICompatibilityMapper(migrationConfig);

    const articleWithInvalidDate: NewsDataArticle = {
      ...mockNewsDataArticles[0],
      pubDate: 'invalid-date-format',
    };

    const newsApiArticle = mapper.mapNewsDataToNewsAPI(articleWithInvalidDate);

    // Should fallback to current time for invalid dates
    expect(new Date(newsApiArticle.publishedAt).getTime()).toBeGreaterThan(Date.now() - 10000);
  });
});

// ============================================================================
// Performance and Load Tests
// ============================================================================

describe('Performance and Load Tests', () => {
  it('should handle multiple concurrent migration requests', async () => {
    const migrationConfig: MigrationConfig = {
      strategy: 'newsdata-only', // Force NewsData.io usage
      newsapi: { apiKey: 'test-key', enabled: false },
      newsdata: { apiKey: 'test-key', enabled: true },
      migration: {
        newsDataPercentage: 100, // 100% to NewsData.io
        fallbackEnabled: true,
        preserveCache: true,
        rollbackEnabled: true,
      },
      compatibility: {
        mapToNewsAPIFormat: true,
        includeExtendedFields: false,
        defaultValues: { author: 'Unknown', source: 'Unknown Source' },
      },
    };

    const migrationManager = new NewsMigrationManager(
      migrationConfig,
      mockNewsDataClient as NewsDataClient
    );

    // Mock successful responses
    vi.mocked(mockNewsDataClient.searchNews!).mockResolvedValue(mockNewsDataArticles);

    // Make multiple concurrent requests
    const promises = Array.from({ length: 10 }, () =>
      migrationManager.fetchNews('test query', { endpoint: 'latest', limit: 10 })
    );

    const results = await Promise.all(promises);

    // All requests should complete successfully
    expect(results).toHaveLength(10);
    results.forEach(articles => {
      expect(articles).toHaveLength(2);
    });
  });

  it('should handle large article datasets efficiently', () => {
    const migrationConfig: MigrationConfig = {
      strategy: 'dual-provider',
      compatibility: {
        mapToNewsAPIFormat: true,
        includeExtendedFields: true,
        defaultValues: { author: 'Unknown', source: 'Unknown Source' },
      },
    };

    const mapper = new NewsAPICompatibilityMapper(migrationConfig);

    // Create large dataset
    const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
      ...mockNewsDataArticles[0],
      article_id: `article_${i}`,
      title: `Test Article ${i}`,
    }));

    const startTime = Date.now();

    // Map all articles
    const mappedArticles = largeDataset.map(article => mapper.mapNewsDataToExtended(article));

    const duration = Date.now() - startTime;

    expect(mappedArticles).toHaveLength(1000);
    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });
});