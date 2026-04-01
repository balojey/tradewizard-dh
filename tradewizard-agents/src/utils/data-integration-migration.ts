/**
 * Enhanced Data Integration Layer with Migration Support
 * 
 * Extends the existing DataIntegrationLayer to support migration from NewsAPI
 * to NewsData.io while maintaining backward compatibility.
 * 
 * Features:
 * - Maintains existing DataIntegrationLayer interface
 * - Supports both NewsAPI and NewsData.io during transition
 * - Gradual migration with percentage-based routing
 * - Fallback mechanisms between providers
 * - Cache preservation during migration
 * - Rollback capability
 */

import type { MarketBriefingDocument } from '../models/types.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';
import { DataIntegrationLayer, type DataSourceConfig, type NewsArticle } from './data-integration.js';
import type { NewsDataClient } from './newsdata-client.js';
import { NewsMigrationManager, type MigrationConfig, createMigrationConfigFromEnv } from './newsapi-compatibility-layer.js';

// ============================================================================
// Enhanced Configuration
// ============================================================================

export interface EnhancedDataSourceConfig extends DataSourceConfig {
  // Migration-specific configuration
  migration?: MigrationConfig;
  
  // NewsData.io client configuration
  newsDataClient?: {
    enabled: boolean;
    config: any; // NewsDataConfig from newsdata-client.ts
  };
}

// ============================================================================
// Migration-Aware Data Integration Layer
// ============================================================================

export class MigrationAwareDataIntegrationLayer extends DataIntegrationLayer {
  private migrationManager?: NewsMigrationManager;
  private newsDataClient?: NewsDataClient;
  private migrationConfig?: MigrationConfig;
  
  constructor(
    config: EnhancedDataSourceConfig, 
    observabilityLogger?: AdvancedObservabilityLogger,
    newsDataClient?: NewsDataClient
  ) {
    // Initialize base DataIntegrationLayer
    super(config, observabilityLogger);
    
    this.newsDataClient = newsDataClient;
    
    // Initialize migration components if migration config is provided
    if (config.migration) {
      this.migrationConfig = config.migration;
      this.migrationManager = new NewsMigrationManager(
        config.migration,
        newsDataClient,
        observabilityLogger
      );
      
      console.log('[MigrationAwareDataIntegrationLayer] Migration support enabled:', {
        strategy: config.migration.strategy,
        newsDataEnabled: config.migration.newsdata?.enabled,
        newsAPIEnabled: config.migration.newsapi?.enabled,
      });
    }
  }
  
  /**
   * Enhanced fetchNews method with migration support
   * 
   * Overrides the base implementation to support both NewsAPI and NewsData.io
   * during the migration period while maintaining the same interface.
   */
  async fetchNews(
    market: MarketBriefingDocument,
    timeWindow: number = 24
  ): Promise<NewsArticle[]> {
    const startTime = Date.now();
    
    // If migration is not configured, use the base implementation
    if (!this.migrationManager || !this.migrationConfig) {
      return super.fetchNews(market, timeWindow);
    }
    
    try {
      // Build search query from market information
      const query = this.buildSearchQuery(market);
      
      // Use migration manager to fetch news
      const extendedArticles = await this.migrationManager.fetchNews(query, {
        endpoint: 'latest',
        limit: 50, // Match the maxArticles from config
        timeframe: `${timeWindow}h`,
      });
      
      // Convert extended articles back to base NewsArticle format
      const articles: NewsArticle[] = extendedArticles.map(article => ({
        title: article.title,
        source: article.source,
        publishedAt: article.publishedAt,
        url: article.url,
        summary: article.summary,
        sentiment: article.sentiment,
        relevanceScore: article.relevanceScore,
      }));
      
      const duration = Date.now() - startTime;
      console.log(`[MigrationAwareDataIntegrationLayer] Fetched ${articles.length} articles in ${duration}ms via migration manager`);
      
      return articles;
      
    } catch (error) {
      console.error('[MigrationAwareDataIntegrationLayer] Migration fetch failed, falling back to base implementation:', error);
      
      // Fallback to base implementation if migration fails
      return super.fetchNews(market, timeWindow);
    }
  }
  
  /**
   * Build search query from market briefing document
   */
  private buildSearchQuery(market: MarketBriefingDocument): string {
    const queryParts: string[] = [];
    
    // Add market question
    if (market.question) {
      queryParts.push(market.question);
    }
    
    // Add market resolution criteria keywords
    if (market.resolutionCriteria) {
      // Extract key terms from resolution criteria (simple keyword extraction)
      const keywords = this.extractKeywords(market.resolutionCriteria);
      queryParts.push(...keywords.slice(0, 3)); // Limit to top 3 keywords
    }
    
    // Add event type as a search term
    if (market.eventType) {
      queryParts.push(market.eventType);
    }
    
    // Join with OR operator for broader search
    return queryParts.join(' OR ');
  }
  
  /**
   * Simple keyword extraction from text
   */
  private extractKeywords(text: string): string[] {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'will', 'be', 'is', 'are', 'was', 'were']);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 5); // Return top 5 keywords
  }
  
  /**
   * Get migration status and statistics
   */
  getMigrationStatus(): {
    enabled: boolean;
    strategy?: string;
    newsDataEnabled?: boolean;
    newsAPIEnabled?: boolean;
    migrationPercentage?: number;
    fallbackEnabled?: boolean;
  } {
    if (!this.migrationManager) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      ...this.migrationManager.getMigrationStatus(),
    };
  }
  
  /**
   * Update migration configuration
   */
  updateMigrationConfig(updates: Partial<MigrationConfig>): void {
    if (this.migrationManager) {
      this.migrationManager.updateMigrationConfig(updates);
      console.log('[MigrationAwareDataIntegrationLayer] Migration configuration updated');
    } else {
      console.warn('[MigrationAwareDataIntegrationLayer] Migration not enabled, cannot update configuration');
    }
  }
  
  /**
   * Enable NewsData.io migration
   */
  enableNewsDataMigration(percentage: number = 10): void {
    if (this.migrationManager) {
      this.migrationManager.updateMigrationConfig({
        strategy: 'gradual-migration',
        migration: {
          newsDataPercentage: Math.max(0, Math.min(100, percentage)),
          fallbackEnabled: true,
          preserveCache: true,
          rollbackEnabled: true,
        },
      });
      console.log(`[MigrationAwareDataIntegrationLayer] NewsData.io migration enabled at ${percentage}%`);
    } else {
      console.warn('[MigrationAwareDataIntegrationLayer] Migration not configured, cannot enable NewsData.io migration');
    }
  }
  
  /**
   * Complete migration to NewsData.io
   */
  completeMigrationToNewsData(): void {
    if (this.migrationManager) {
      this.migrationManager.updateMigrationConfig({
        strategy: 'newsdata-only',
        newsdata: {
          apiKey: this.migrationConfig?.newsdata?.apiKey || '',
          enabled: true,
        },
        newsapi: {
          apiKey: this.migrationConfig?.newsapi?.apiKey || '',
          enabled: false,
        },
      });
      console.log('[MigrationAwareDataIntegrationLayer] Migration to NewsData.io completed');
    } else {
      console.warn('[MigrationAwareDataIntegrationLayer] Migration not configured, cannot complete migration');
    }
  }
  
  /**
   * Rollback to NewsAPI
   */
  rollbackToNewsAPI(): void {
    if (this.migrationManager) {
      this.migrationManager.updateMigrationConfig({
        strategy: 'newsapi-only',
        newsapi: {
          apiKey: this.migrationConfig?.newsapi?.apiKey || '',
          enabled: true,
        },
        newsdata: {
          apiKey: this.migrationConfig?.newsdata?.apiKey || '',
          enabled: false,
        },
      });
      console.log('[MigrationAwareDataIntegrationLayer] Rolled back to NewsAPI');
    } else {
      console.warn('[MigrationAwareDataIntegrationLayer] Migration not configured, cannot rollback');
    }
  }
  
  /**
   * Check if NewsData.io is available and working
   */
  async testNewsDataConnection(): Promise<boolean> {
    if (!this.newsDataClient) {
      return false;
    }
    
    try {
      await this.newsDataClient.testConnection();
      return true;
    } catch (error) {
      console.error('[MigrationAwareDataIntegrationLayer] NewsData.io connection test failed:', error);
      return false;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create enhanced data integration layer with migration support
 */
export function createMigrationAwareDataIntegrationLayer(
  config: EnhancedDataSourceConfig,
  observabilityLogger?: AdvancedObservabilityLogger,
  newsDataClient?: NewsDataClient
): MigrationAwareDataIntegrationLayer {
  return new MigrationAwareDataIntegrationLayer(config, observabilityLogger, newsDataClient);
}

/**
 * Create enhanced configuration with migration support from environment
 */
export function createEnhancedDataSourceConfigFromEnv(): EnhancedDataSourceConfig {
  // Get base configuration (existing DataSourceConfig)
  const baseConfig: DataSourceConfig = {
    news: {
      provider: (process.env.NEWS_API_PROVIDER as any) || 'newsapi',
      apiKey: process.env.NEWS_API_KEY,
      cacheTTL: parseInt(process.env.NEWS_API_CACHE_TTL || '900'),
      maxArticles: parseInt(process.env.NEWS_API_MAX_ARTICLES || '50'),
    },
    polling: {
      provider: (process.env.POLLING_API_PROVIDER as any) || 'none',
      apiKey: process.env.POLLING_API_KEY,
      cacheTTL: parseInt(process.env.POLLING_API_CACHE_TTL || '3600'),
    },
    social: {
      providers: (process.env.SOCIAL_API_PROVIDERS?.split(',') as any) || [],
      apiKeys: {
        ...(process.env.TWITTER_API_KEY && { twitter: process.env.TWITTER_API_KEY }),
        ...(process.env.REDDIT_API_KEY && { reddit: process.env.REDDIT_API_KEY }),
      },
      cacheTTL: parseInt(process.env.SOCIAL_API_CACHE_TTL || '1800'),
      maxMentions: parseInt(process.env.SOCIAL_API_MAX_MENTIONS || '100'),
    },
  };
  
  // Add migration configuration if migration is enabled
  let migrationConfig: MigrationConfig | undefined;
  
  if (process.env.NEWS_MIGRATION_ENABLED === 'true') {
    migrationConfig = createMigrationConfigFromEnv();
  }
  
  return {
    ...baseConfig,
    migration: migrationConfig,
    newsDataClient: {
      enabled: process.env.NEWSDATA_ENABLED === 'true',
      config: {
        apiKey: process.env.NEWSDATA_API_KEY,
        // Add other NewsData.io config as needed
      },
    },
  };
}

/**
 * Migrate existing DataIntegrationLayer to migration-aware version
 */
export function migrateDataIntegrationLayer(
  _existingLayer: DataIntegrationLayer,
  migrationConfig: MigrationConfig,
  newsDataClient?: NewsDataClient,
  observabilityLogger?: AdvancedObservabilityLogger
): MigrationAwareDataIntegrationLayer {
  // Extract configuration from existing layer (this is a simplified approach)
  // In a real implementation, you might need to expose the config from DataIntegrationLayer
  const enhancedConfig: EnhancedDataSourceConfig = {
    news: {
      provider: 'newsapi', // Assume existing is NewsAPI
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
    migration: migrationConfig,
  };
  
  return new MigrationAwareDataIntegrationLayer(enhancedConfig, observabilityLogger, newsDataClient);
}

// ============================================================================
// Backward Compatibility Export
// ============================================================================

/**
 * Create data integration layer with automatic migration detection
 * 
 * This function maintains backward compatibility by automatically detecting
 * if migration should be enabled based on environment variables.
 */
export function createDataIntegrationLayer(
  config: DataSourceConfig,
  observabilityLogger?: AdvancedObservabilityLogger
): DataIntegrationLayer | MigrationAwareDataIntegrationLayer {
  // Check if migration is enabled
  if (process.env.NEWS_MIGRATION_ENABLED === 'true') {
    // Create enhanced configuration with migration support
    const enhancedConfig: EnhancedDataSourceConfig = {
      ...config,
      migration: createMigrationConfigFromEnv(),
    };
    
    // TODO: Create NewsData.io client if needed
    // const newsDataClient = createNewsDataClient(...);
    
    return new MigrationAwareDataIntegrationLayer(enhancedConfig, observabilityLogger);
  } else {
    // Return standard DataIntegrationLayer for backward compatibility
    return new DataIntegrationLayer(config, observabilityLogger);
  }
}