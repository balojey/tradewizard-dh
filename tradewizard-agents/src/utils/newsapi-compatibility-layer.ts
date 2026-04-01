/**
 * NewsAPI Compatibility Layer
 * 
 * Provides backward compatibility for migrating from NewsAPI to NewsData.io
 * by mapping NewsData.io response format to NewsAPI format and maintaining
 * the existing DataIntegrationLayer interface.
 * 
 * Features:
 * - Response format mapping between APIs
 * - Configuration support for both APIs during transition
 * - Seamless interface compatibility
 * - Gradual migration support
 */

import type { NewsDataClient, NewsDataArticle, NewsDataResponse } from './newsdata-client.js';
import type { NewsArticle } from './data-integration.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';

// ============================================================================
// NewsAPI Types (for backward compatibility)
// ============================================================================

export interface NewsAPIArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string; // ISO 8601 format
  content: string | null;
}

export interface NewsAPIResponse {
  status: 'ok' | 'error';
  totalResults?: number;
  articles?: NewsAPIArticle[];
  code?: string;
  message?: string;
}

// ============================================================================
// Migration Configuration
// ============================================================================

export interface MigrationConfig {
  // Migration strategy
  strategy: 'newsapi-only' | 'newsdata-only' | 'dual-provider' | 'gradual-migration';
  
  // Provider configurations
  newsapi?: {
    apiKey: string;
    baseUrl?: string;
    enabled: boolean;
  };
  
  newsdata?: {
    apiKey: string;
    baseUrl?: string;
    enabled: boolean;
  };
  
  // Migration settings
  migration?: {
    // Percentage of requests to route to NewsData.io (0-100)
    newsDataPercentage: number;
    
    // Fallback behavior when primary provider fails
    fallbackEnabled: boolean;
    
    // Cache migration settings
    preserveCache: boolean;
    
    // Rollback capability
    rollbackEnabled: boolean;
  };
  
  // Compatibility settings
  compatibility: {
    // Whether to map NewsData.io responses to NewsAPI format
    mapToNewsAPIFormat: boolean;
    
    // Whether to include additional NewsData.io fields
    includeExtendedFields: boolean;
    
    // Default values for missing fields
    defaultValues: {
      author: string;
      source: string;
    };
  };
}

// ============================================================================
// Extended NewsArticle for Migration
// ============================================================================

export interface ExtendedNewsArticle extends NewsArticle {
  // Original NewsAPI fields
  author?: string;
  urlToImage?: string;
  content?: string;
  
  // Additional NewsData.io fields (when includeExtendedFields is true)
  article_id?: string;
  source_id?: string;
  source_priority?: number;
  keywords?: string[];
  creator?: string[];
  video_url?: string;
  pubDateTZ?: string;
  country?: string[];
  category?: string[];
  language?: string;
  ai_tag?: string[];
  ai_region?: string[];
  ai_org?: string[];
  ai_summary?: string;
  coin?: string[];
  symbol?: string[];
  duplicate?: boolean;
}

// ============================================================================
// Response Format Mappers
// ============================================================================

export class NewsAPICompatibilityMapper {
  private config: MigrationConfig;
  
  constructor(config: MigrationConfig, private observabilityLogger?: AdvancedObservabilityLogger) {
    this.config = config;
    // Log mapper initialization if logger is available
    this.observabilityLogger?.logDataFetch({
      timestamp: Date.now(),
      source: 'news',
      provider: 'compatibility-mapper',
      success: true,
      cached: false,
      stale: false,
      freshness: 0,
      itemCount: 0,
      duration: 0,
    });
  }
  
  /**
   * Map NewsData.io article to NewsAPI format
   */
  mapNewsDataToNewsAPI(article: NewsDataArticle): NewsAPIArticle {
    return {
      source: {
        id: article.source_id || null,
        name: article.source_name || this.config.compatibility.defaultValues.source,
      },
      author: article.creator?.[0] || this.config.compatibility.defaultValues.author,
      title: article.title,
      description: article.description || null,
      url: article.link,
      urlToImage: article.image_url || null,
      publishedAt: this.convertToISO8601(article.pubDate),
      content: article.content || null,
    };
  }
  
  /**
   * Map NewsData.io article to extended format (includes both APIs' fields)
   */
  mapNewsDataToExtended(article: NewsDataArticle): ExtendedNewsArticle {
    const baseArticle: NewsArticle = {
      title: article.title,
      source: article.source_name,
      publishedAt: this.convertToUnixTimestamp(article.pubDate),
      url: article.link,
      summary: article.description || '',
      sentiment: this.mapSentiment(article.sentiment),
      relevanceScore: this.calculateRelevanceScore(article),
    };
    
    const extended: ExtendedNewsArticle = {
      ...baseArticle,
      // NewsAPI compatibility fields
      author: article.creator?.[0] || this.config.compatibility.defaultValues.author,
      urlToImage: article.image_url || undefined,
      content: article.content || undefined,
    };
    
    // Add extended NewsData.io fields if enabled
    if (this.config.compatibility.includeExtendedFields) {
      extended.article_id = article.article_id;
      extended.source_id = article.source_id;
      extended.source_priority = article.source_priority;
      extended.keywords = article.keywords;
      extended.creator = article.creator;
      extended.video_url = article.video_url;
      extended.pubDateTZ = article.pubDateTZ;
      extended.country = article.country;
      extended.category = article.category;
      extended.language = article.language;
      extended.ai_tag = article.ai_tag;
      extended.ai_region = article.ai_region;
      extended.ai_org = article.ai_org;
      extended.ai_summary = article.ai_summary;
      extended.coin = article.coin;
      extended.symbol = article.symbol;
      extended.duplicate = article.duplicate;
    }
    
    return extended;
  }
  
  /**
   * Map NewsAPI article to DataIntegrationLayer format
   */
  mapNewsAPIToDataIntegration(article: NewsAPIArticle): NewsArticle {
    return {
      title: article.title,
      source: article.source.name,
      publishedAt: this.convertToUnixTimestamp(article.publishedAt),
      url: article.url,
      summary: article.description || '',
      sentiment: 'neutral', // NewsAPI doesn't provide sentiment
      relevanceScore: 0.5, // Default relevance score
    };
  }
  
  /**
   * Map NewsData.io response to NewsAPI format
   */
  mapResponseToNewsAPI(response: NewsDataResponse): NewsAPIResponse {
    if (response.status === 'error') {
      return {
        status: 'error',
        code: response.code,
        message: response.message,
      };
    }
    
    return {
      status: 'ok',
      totalResults: response.totalResults || 0,
      articles: response.results?.map(article => this.mapNewsDataToNewsAPI(article)) || [],
    };
  }
  
  /**
   * Convert NewsData.io date format to ISO 8601 (NewsAPI format)
   */
  private convertToISO8601(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toISOString();
    } catch {
      // Fallback to current time if date parsing fails
      return new Date().toISOString();
    }
  }
  
  /**
   * Convert date string to Unix timestamp (DataIntegrationLayer format)
   */
  private convertToUnixTimestamp(dateString: string): number {
    try {
      const date = new Date(dateString);
      return Math.floor(date.getTime() / 1000);
    } catch {
      // Fallback to current time if date parsing fails
      return Math.floor(Date.now() / 1000);
    }
  }
  
  /**
   * Map NewsData.io sentiment to DataIntegrationLayer format
   */
  private mapSentiment(sentiment?: 'positive' | 'negative' | 'neutral'): 'positive' | 'negative' | 'neutral' {
    return sentiment || 'neutral';
  }
  
  /**
   * Calculate relevance score based on NewsData.io article properties
   */
  private calculateRelevanceScore(article: NewsDataArticle): number {
    let score = 0.5; // Base score
    
    // Boost score based on source priority
    if (article.source_priority <= 100000) {
      score += 0.3; // High priority source
    } else if (article.source_priority <= 500000) {
      score += 0.2; // Medium priority source
    } else {
      score += 0.1; // Lower priority source
    }
    
    // Boost score if article has AI tags (indicates better processing)
    if (article.ai_tag && article.ai_tag.length > 0) {
      score += 0.1;
    }
    
    // Boost score if article has sentiment analysis
    if (article.sentiment) {
      score += 0.1;
    }
    
    // Ensure score is between 0 and 1
    return Math.min(Math.max(score, 0), 1);
  }
}

// ============================================================================
// Migration Manager
// ============================================================================

export class NewsMigrationManager {
  private config: MigrationConfig;
  private mapper: NewsAPICompatibilityMapper;
  private newsDataClient?: NewsDataClient;
  private observabilityLogger?: AdvancedObservabilityLogger;
  
  constructor(
    config: MigrationConfig,
    newsDataClient?: NewsDataClient,
    observabilityLogger?: AdvancedObservabilityLogger
  ) {
    this.config = config;
    this.mapper = new NewsAPICompatibilityMapper(config, observabilityLogger);
    this.newsDataClient = newsDataClient;
    this.observabilityLogger = observabilityLogger;
  }
  
  /**
   * Determine which provider to use for a request
   */
  shouldUseNewsData(): boolean {
    switch (this.config.strategy) {
      case 'newsapi-only':
        return false;
      case 'newsdata-only':
        return true;
      case 'dual-provider':
        // Use NewsData.io if available, fallback to NewsAPI
        return this.config.newsdata?.enabled || false;
      case 'gradual-migration':
        // Use percentage-based routing
        const random = Math.random() * 100;
        return random < (this.config.migration?.newsDataPercentage || 0);
      default:
        return false;
    }
  }
  
  /**
   * Fetch news with migration logic
   */
  async fetchNews(
    query: string,
    options: {
      endpoint?: 'latest' | 'crypto' | 'market' | 'archive';
      limit?: number;
      language?: string;
      country?: string;
      category?: string;
      timeframe?: string;
      from_date?: string;
      to_date?: string;
    } = {}
  ): Promise<ExtendedNewsArticle[]> {
    const startTime = Date.now();
    const useNewsData = this.shouldUseNewsData();
    
    try {
      if (useNewsData && this.newsDataClient) {
        // Use NewsData.io
        const articles = await this.newsDataClient.searchNews(query, options);
        const mappedArticles = articles.map(article => this.mapper.mapNewsDataToExtended(article));
        
        // Log successful NewsData.io request
        this.observabilityLogger?.logDataFetch({
          timestamp: Date.now(),
          source: 'news',
          provider: 'newsdata.io',
          success: true,
          cached: false,
          stale: false,
          freshness: 0,
          itemCount: mappedArticles.length,
          duration: Date.now() - startTime,
        });
        
        return mappedArticles;
      } else {
        // Use NewsAPI (legacy)
        const articles = await this.fetchFromNewsAPI(query, options);
        const mappedArticles = articles.map(article => this.mapper.mapNewsAPIToDataIntegration(article));
        
        // Convert to extended format
        const extendedArticles: ExtendedNewsArticle[] = mappedArticles.map(article => ({
          ...article,
          author: this.config.compatibility.defaultValues.author,
          urlToImage: undefined,
          content: undefined,
        }));
        
        // Log successful NewsAPI request
        this.observabilityLogger?.logDataFetch({
          timestamp: Date.now(),
          source: 'news',
          provider: 'newsapi',
          success: true,
          cached: false,
          stale: false,
          freshness: 0,
          itemCount: extendedArticles.length,
          duration: Date.now() - startTime,
        });
        
        return extendedArticles;
      }
    } catch (error) {
      // Handle fallback logic
      if (this.config.migration?.fallbackEnabled) {
        try {
          if (useNewsData) {
            // Fallback to NewsAPI
            console.warn('[NewsMigrationManager] NewsData.io failed, falling back to NewsAPI');
            const articles = await this.fetchFromNewsAPI(query, options);
            const mappedArticles = articles.map(article => this.mapper.mapNewsAPIToDataIntegration(article));
            
            const extendedArticles: ExtendedNewsArticle[] = mappedArticles.map(article => ({
              ...article,
              author: this.config.compatibility.defaultValues.author,
              urlToImage: undefined,
              content: undefined,
            }));
            
            // Log fallback request
            this.observabilityLogger?.logDataFetch({
              timestamp: Date.now(),
              source: 'news',
              provider: 'newsapi',
              success: true,
              cached: false,
              stale: false,
              freshness: 0,
              itemCount: extendedArticles.length,
              duration: Date.now() - startTime,
              error: 'Fallback from NewsData.io',
            });
            
            return extendedArticles;
          } else if (this.newsDataClient) {
            // Fallback to NewsData.io
            console.warn('[NewsMigrationManager] NewsAPI failed, falling back to NewsData.io');
            const articles = await this.newsDataClient.searchNews(query, options);
            const mappedArticles = articles.map(article => this.mapper.mapNewsDataToExtended(article));
            
            // Log fallback request
            this.observabilityLogger?.logDataFetch({
              timestamp: Date.now(),
              source: 'news',
              provider: 'newsdata.io',
              success: true,
              cached: false,
              stale: false,
              freshness: 0,
              itemCount: mappedArticles.length,
              duration: Date.now() - startTime,
              error: 'Fallback from NewsAPI',
            });
            
            return mappedArticles;
          }
        } catch (fallbackError) {
          console.error('[NewsMigrationManager] Both providers failed:', fallbackError);
        }
      }
      
      // Log failed request
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: useNewsData ? 'newsdata.io' : 'newsapi',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
  
  /**
   * Fetch from NewsAPI (stub implementation)
   */
  private async fetchFromNewsAPI(
    query: string,
    options: {
      endpoint?: string;
      limit?: number;
      language?: string;
      country?: string;
      category?: string;
      timeframe?: string;
      from_date?: string;
      to_date?: string;
    }
  ): Promise<NewsAPIArticle[]> {
    // TODO: Implement actual NewsAPI client
    // For now, return empty array to maintain interface compatibility
    console.log(`[NewsMigrationManager] NewsAPI request: ${query}`, options);
    return [];
  }
  
  /**
   * Get migration status and statistics
   */
  getMigrationStatus(): {
    strategy: string;
    newsDataEnabled: boolean;
    newsAPIEnabled: boolean;
    migrationPercentage: number;
    fallbackEnabled: boolean;
  } {
    return {
      strategy: this.config.strategy,
      newsDataEnabled: this.config.newsdata?.enabled || false,
      newsAPIEnabled: this.config.newsapi?.enabled || false,
      migrationPercentage: this.config.migration?.newsDataPercentage || 0,
      fallbackEnabled: this.config.migration?.fallbackEnabled || false,
    };
  }
  
  /**
   * Update migration configuration
   */
  updateMigrationConfig(updates: Partial<MigrationConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      migration: {
        newsDataPercentage: 0,
        fallbackEnabled: false,
        preserveCache: false,
        rollbackEnabled: false,
        ...this.config.migration,
        ...updates.migration,
      },
      compatibility: {
        ...this.config.compatibility,
        ...updates.compatibility,
      },
    };
    
    console.log('[NewsMigrationManager] Configuration updated:', this.getMigrationStatus());
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create migration configuration from environment variables
 */
export function createMigrationConfigFromEnv(): MigrationConfig {
  const strategy = (process.env.NEWS_MIGRATION_STRATEGY as any) || 'newsapi-only';
  
  return {
    strategy,
    
    newsapi: {
      apiKey: process.env.NEWS_API_KEY || '',
      baseUrl: process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2',
      enabled: process.env.NEWS_API_ENABLED !== 'false',
    },
    
    newsdata: {
      apiKey: process.env.NEWSDATA_API_KEY || '',
      baseUrl: process.env.NEWSDATA_BASE_URL || 'https://newsdata.io/api/1',
      enabled: process.env.NEWSDATA_ENABLED !== 'false',
    },
    
    migration: {
      newsDataPercentage: parseInt(process.env.NEWS_MIGRATION_PERCENTAGE || '0'),
      fallbackEnabled: process.env.NEWS_MIGRATION_FALLBACK_ENABLED !== 'false',
      preserveCache: process.env.NEWS_MIGRATION_PRESERVE_CACHE !== 'false',
      rollbackEnabled: process.env.NEWS_MIGRATION_ROLLBACK_ENABLED !== 'false',
    },
    
    compatibility: {
      mapToNewsAPIFormat: process.env.NEWS_COMPATIBILITY_MAP_FORMAT !== 'false',
      includeExtendedFields: process.env.NEWS_COMPATIBILITY_EXTENDED_FIELDS === 'true',
      defaultValues: {
        author: process.env.NEWS_COMPATIBILITY_DEFAULT_AUTHOR || 'Unknown',
        source: process.env.NEWS_COMPATIBILITY_DEFAULT_SOURCE || 'Unknown Source',
      },
    },
  };
}

/**
 * Create migration manager instance
 */
export function createNewsMigrationManager(
  config: MigrationConfig,
  newsDataClient?: NewsDataClient,
  observabilityLogger?: AdvancedObservabilityLogger
): NewsMigrationManager {
  return new NewsMigrationManager(config, newsDataClient, observabilityLogger);
}