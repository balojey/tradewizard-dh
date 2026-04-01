/**
 * NewsData.io Agent Integration Layer
 * 
 * Integrates NewsData.io agent tools with the existing agent framework,
 * workflow system, and data integration layer. Provides seamless access
 * to news tools for all agents in the system.
 */

import type { NewsDataClient } from './newsdata-client.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';
import { 
  NewsToolsManager, 
  createNewsToolsManager,
  type NewsArticle,
  type LatestNewsToolParams,
  type ArchiveNewsToolParams,
  type CryptoNewsToolParams,
  type MarketNewsToolParams
} from './newsdata-agent-tools.js';
import type { DataIntegrationLayer, NewsArticle as LegacyNewsArticle } from './data-integration.js';
import type { MarketBriefingDocument } from '../models/types.js';

// ============================================================================
// Integration Configuration
// ============================================================================

export interface NewsDataAgentIntegrationConfig {
  // Enable/disable NewsData.io integration
  enabled: boolean;
  
  // Fallback to legacy data integration layer
  fallbackToLegacy: boolean;
  
  // Agent-specific configurations
  agentConfigs: {
    [agentName: string]: {
      preferredTools: string[]; // Tool names to prefer for this agent
      defaultParams: Partial<LatestNewsToolParams>; // Default parameters
      maxArticles: number; // Maximum articles to return
    };
  };
  
  // Default configuration for all agents
  defaultConfig: {
    preferredTools: string[];
    defaultParams: Partial<LatestNewsToolParams>;
    maxArticles: number;
  };
}

// ============================================================================
// Agent News Interface
// ============================================================================

/**
 * Unified news interface for agents
 * Provides both new NewsData.io tools and legacy compatibility
 */
export interface AgentNewsInterface {
  // New NewsData.io tools
  fetchLatestNews(params: LatestNewsToolParams, agentName?: string): Promise<NewsArticle[]>;
  fetchArchiveNews(params: ArchiveNewsToolParams, agentName?: string): Promise<NewsArticle[]>;
  fetchCryptoNews(params: CryptoNewsToolParams, agentName?: string): Promise<NewsArticle[]>;
  fetchMarketNews(params: MarketNewsToolParams, agentName?: string): Promise<NewsArticle[]>;
  
  // Legacy compatibility methods
  fetchNewsForMarket(market: MarketBriefingDocument, timeWindow?: number, agentName?: string, enhancedKeywords?: import('../models/types.js').EventKeywords): Promise<NewsArticle[]>;
  
  // Utility methods
  getAvailableTools(): string[];
  getToolDescription(toolName: string): string;
  isToolAvailable(toolName: string): boolean;
}

// ============================================================================
// News Data Integration Layer
// ============================================================================

/**
 * Enhanced data integration layer with NewsData.io support
 */
export class NewsDataIntegrationLayer implements AgentNewsInterface {
  private newsToolsManager: NewsToolsManager;
  private legacyDataLayer?: DataIntegrationLayer;
  private config: NewsDataAgentIntegrationConfig;
  private logger?: AdvancedObservabilityLogger;

  constructor(
    newsDataClient: NewsDataClient,
    config: NewsDataAgentIntegrationConfig,
    legacyDataLayer?: DataIntegrationLayer,
    logger?: AdvancedObservabilityLogger
  ) {
    this.newsToolsManager = createNewsToolsManager(newsDataClient, logger);
    this.legacyDataLayer = legacyDataLayer;
    this.config = config;
    this.logger = logger;
  }

  // ============================================================================
  // NewsData.io Tool Methods
  // ============================================================================

  async fetchLatestNews(params: LatestNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    if (!this.config.enabled) {
      throw new Error('NewsData.io integration is disabled');
    }

    const startTime = Date.now();
    try {
      // Apply agent-specific configuration
      const enhancedParams = this.enhanceParamsForAgent(params, agentName);
      
      // Execute through NewsData.io tools
      const articles = await this.newsToolsManager.fetchLatestNews(enhancedParams, agentName);
      
      // Apply agent-specific filtering
      return this.filterArticlesForAgent(articles, agentName);
      
    } catch (error) {
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      
      // Fallback to legacy if configured
      if (this.config.fallbackToLegacy && this.legacyDataLayer) {
        return this.fallbackToLegacyNews(params, agentName);
      }
      
      throw error;
    }
  }

  async fetchArchiveNews(params: ArchiveNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    if (!this.config.enabled) {
      throw new Error('NewsData.io integration is disabled');
    }

    const startTime = Date.now();
    try {
      const enhancedParams = this.enhanceParamsForAgent(params, agentName);
      const articles = await this.newsToolsManager.fetchArchiveNews(enhancedParams, agentName);
      return this.filterArticlesForAgent(articles, agentName);
      
    } catch (error) {
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      
      if (this.config.fallbackToLegacy && this.legacyDataLayer) {
        return this.fallbackToLegacyNews(params, agentName);
      }
      
      throw error;
    }
  }

  async fetchCryptoNews(params: CryptoNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    if (!this.config.enabled) {
      throw new Error('NewsData.io integration is disabled');
    }

    const startTime = Date.now();
    try {
      const enhancedParams = this.enhanceParamsForAgent(params, agentName);
      const articles = await this.newsToolsManager.fetchCryptoNews(enhancedParams, agentName);
      return this.filterArticlesForAgent(articles, agentName);
      
    } catch (error) {
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      
      if (this.config.fallbackToLegacy && this.legacyDataLayer) {
        return this.fallbackToLegacyNews(params, agentName);
      }
      
      throw error;
    }
  }

  async fetchMarketNews(params: MarketNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    if (!this.config.enabled) {
      throw new Error('NewsData.io integration is disabled');
    }

    const startTime = Date.now();
    try {
      const enhancedParams = this.enhanceParamsForAgent(params, agentName);
      const articles = await this.newsToolsManager.fetchMarketNews(enhancedParams, agentName);
      return this.filterArticlesForAgent(articles, agentName);
      
    } catch (error) {
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      
      if (this.config.fallbackToLegacy && this.legacyDataLayer) {
        return this.fallbackToLegacyNews(params, agentName);
      }
      
      throw error;
    }
  }

  // ============================================================================
  // Legacy Compatibility Methods
  // ============================================================================

  async fetchNewsForMarket(
    market: MarketBriefingDocument, 
    timeWindow: number = 24, 
    agentName?: string,
    enhancedKeywords?: import('../models/types.js').EventKeywords
  ): Promise<NewsArticle[]> {
    if (!this.config.enabled) {
      if (this.legacyDataLayer) {
        const legacyArticles = await this.legacyDataLayer.fetchNews(market, timeWindow);
        return this.convertLegacyArticles(legacyArticles);
      }
      throw new Error('NewsData.io integration is disabled and no legacy layer available');
    }

    const startTime = Date.now();
    try {
      // Convert market briefing to NewsData.io parameters with enhanced keywords
      const params = this.convertMarketToLatestParams(market, timeWindow, agentName, enhancedKeywords);
      
      // Fetch using NewsData.io
      return await this.fetchLatestNews(params, agentName);
      
    } catch (error) {
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      
      // Fallback to legacy
      if (this.config.fallbackToLegacy && this.legacyDataLayer) {
        const legacyArticles = await this.legacyDataLayer.fetchNews(market, timeWindow);
        return this.convertLegacyArticles(legacyArticles);
      }
      
      throw error;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getAvailableTools(): string[] {
    if (!this.config.enabled) {
      return [];
    }
    
    return this.newsToolsManager.getAllTools().map(tool => tool.name);
  }

  getToolDescription(toolName: string): string {
    if (!this.config.enabled) {
      return 'NewsData.io integration is disabled';
    }
    
    const tool = this.newsToolsManager.getTool(toolName);
    return tool?.description || 'Tool not found';
  }

  isToolAvailable(toolName: string): boolean {
    if (!this.config.enabled) {
      return false;
    }
    
    return this.newsToolsManager.getTool(toolName) !== undefined;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private enhanceParamsForAgent<T extends Record<string, any>>(params: T, agentName?: string): T {
    if (!agentName) {
      return { ...this.config.defaultConfig.defaultParams, ...params };
    }

    const agentConfig = this.config.agentConfigs[agentName] || this.config.defaultConfig;
    return { ...agentConfig.defaultParams, ...params };
  }

  private filterArticlesForAgent(articles: NewsArticle[], agentName?: string): NewsArticle[] {
    if (!agentName) {
      return articles.slice(0, this.config.defaultConfig.maxArticles);
    }

    const agentConfig = this.config.agentConfigs[agentName] || this.config.defaultConfig;
    return articles.slice(0, agentConfig.maxArticles);
  }

  private async fallbackToLegacyNews(params: any, agentName?: string): Promise<NewsArticle[]> {
    if (!this.legacyDataLayer) {
      throw new Error('Legacy data layer not available for fallback');
    }

    console.warn('[NewsData Integration] Falling back to legacy news integration', {
      agentName,
      reason: 'NewsData.io request failed',
    });

    // Create a mock market briefing for legacy compatibility
    const mockMarket: MarketBriefingDocument = {
      marketId: 'fallback-market',
      conditionId: 'fallback-condition',
      eventType: 'ELECTION' as any, // Default event type
      question: params.query || params.queryInTitle || 'market news',
      resolutionCriteria: 'Fallback market for legacy news integration',
      expiryTimestamp: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
      currentProbability: 0.5,
      liquidityScore: 5,
      bidAskSpread: 0.02,
      volatilityRegime: 'NORMAL' as any,
      volume24h: 0,
      metadata: {
        ambiguityFlags: [],
        keyCatalysts: [],
      },
    };

    const timeWindow = this.extractTimeWindowFromParams(params);
    const legacyArticles = await this.legacyDataLayer.fetchNews(mockMarket, timeWindow);
    return this.convertLegacyArticles(legacyArticles);
  }

  private convertMarketToLatestParams(
    market: MarketBriefingDocument, 
    timeWindow: number, 
    agentName?: string,
    enhancedKeywords?: import('../models/types.js').EventKeywords
  ): LatestNewsToolParams {
    // Use AI-enhanced keywords if available, otherwise fall back to simple extraction
    let keywords: string[];
    if (enhancedKeywords) {
      // Use ALL ranked keywords (already limited to 10 and arranged by relevance)
      keywords = enhancedKeywords.ranked.map(rk => rk.keyword);
      
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: keywords.length,
        duration: 0,
      });
    } else {
      // Fallback to simple extraction (limit to 10)
      keywords = this.extractKeywordsFromMarket(market).slice(0, 10);
      
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: keywords.length,
        duration: 0,
        error: 'Using fallback keyword extraction - AI keywords not available',
      });
    }
    
    // Determine appropriate categories based on market content
    const categories = this.inferCategoriesFromMarket(market);
    
    // Build search query with top 5 keywords (query length limit: 100 chars)
    const query = keywords.length > 0 ? keywords.slice(0, 5).join(' OR ') : market.question;
    
    return {
      query,
      timeframe: `${timeWindow}h`,
      categories,
      size: this.config.agentConfigs[agentName || '']?.maxArticles || this.config.defaultConfig.maxArticles,
      fullContent: true,
      removeDuplicates: true,
      sort: 'relevancy',
    };
  }

  private extractKeywordsFromMarket(market: MarketBriefingDocument): string[] {
    const text = `${market.question} ${market.resolutionCriteria || ''}`.toLowerCase();
    const keywords: string[] = [];
    
    // Extract potential company names, political figures, etc.
    const patterns = [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Proper names
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\$[A-Z]{1,5}\b/g, // Stock symbols
    ];
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        keywords.push(...matches);
      }
    });
    
    return [...new Set(keywords)].slice(0, 5); // Limit to 5 keywords
  }

  private inferCategoriesFromMarket(market: MarketBriefingDocument): string[] {
    const text = `${market.question} ${market.resolutionCriteria || ''}`.toLowerCase();
    const categories: string[] = [];
    
    // Category inference based on keywords
    const categoryKeywords = {
      politics: ['election', 'vote', 'president', 'congress', 'senate', 'political', 'campaign'],
      business: ['stock', 'company', 'earnings', 'revenue', 'market', 'ipo', 'merger'],
      technology: ['tech', 'ai', 'software', 'apple', 'google', 'microsoft', 'tesla'],
      sports: ['game', 'team', 'player', 'championship', 'season', 'nfl', 'nba'],
      entertainment: ['movie', 'film', 'actor', 'music', 'album', 'concert', 'award'],
    };
    
    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
      if (keywords.some(keyword => text.includes(keyword))) {
        categories.push(category);
      }
    });
    
    return categories.length > 0 ? categories : ['business']; // Default to business
  }

  private extractTimeWindowFromParams(params: any): number {
    if (params.timeframe) {
      const match = params.timeframe.match(/^(\d+)([hm]?)$/);
      if (match) {
        const [, numberStr, unit] = match;
        const number = parseInt(numberStr, 10);
        return unit === 'm' ? Math.ceil(number / 60) : number;
      }
    }
    
    if (params.fromDate && params.toDate) {
      const from = new Date(params.fromDate);
      const to = new Date(params.toDate);
      const hours = (to.getTime() - from.getTime()) / (1000 * 60 * 60);
      return Math.ceil(hours);
    }
    
    return 24; // Default to 24 hours
  }

  private convertLegacyArticles(legacyArticles: LegacyNewsArticle[]): NewsArticle[] {
    return legacyArticles.map(legacy => ({
      id: `legacy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: legacy.title,
      url: legacy.url,
      source: {
        id: legacy.source.toLowerCase().replace(/\s+/g, '-'),
        name: legacy.source,
        url: legacy.url,
        priority: Math.round((1 - legacy.relevanceScore) * 100),
      },
      content: {
        description: legacy.summary,
        fullContent: legacy.summary,
      },
      metadata: {
        publishedAt: new Date(legacy.publishedAt).toISOString(),
        language: 'en',
        duplicate: false,
      },
      ai: {
        sentiment: legacy.sentiment,
      },
    }));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create NewsData integration layer with default configuration
 */
export function createNewsDataIntegrationLayer(
  newsDataClient: NewsDataClient,
  legacyDataLayer?: DataIntegrationLayer,
  logger?: AdvancedObservabilityLogger
): NewsDataIntegrationLayer {
  const defaultConfig: NewsDataAgentIntegrationConfig = {
    enabled: true,
    fallbackToLegacy: true,
    agentConfigs: {
      // Event Intelligence agents
      'breaking_news_agent': {
        preferredTools: ['fetchLatestNews'],
        defaultParams: {
          timeframe: '6h',
          categories: ['politics', 'business', 'world'],
          size: 20,
          fullContent: true,
        },
        maxArticles: 20,
      },
      'event_impact_agent': {
        preferredTools: ['fetchLatestNews', 'fetchArchiveNews'],
        defaultParams: {
          timeframe: '12h',
          categories: ['politics', 'business', 'world'],
          size: 15,
          fullContent: true,
        },
        maxArticles: 15,
      },
      
      // Sentiment & Narrative agents
      'media_sentiment_agent': {
        preferredTools: ['fetchLatestNews'],
        defaultParams: {
          timeframe: '24h',
          size: 30,
          fullContent: false,
        },
        maxArticles: 30,
      },
      'social_sentiment_agent': {
        preferredTools: ['fetchLatestNews'],
        defaultParams: {
          timeframe: '12h',
          size: 25,
          fullContent: false,
        },
        maxArticles: 25,
      },
      'narrative_velocity_agent': {
        preferredTools: ['fetchLatestNews'],
        defaultParams: {
          timeframe: '6h',
          size: 20,
          fullContent: false,
        },
        maxArticles: 20,
      },
      
      // Market-specific agents
      'market_microstructure_agent': {
        preferredTools: ['fetchMarketNews'],
        defaultParams: {
          timeframe: '24h',
          categories: ['business'],
          size: 15,
          fullContent: true,
        },
        maxArticles: 15,
      },
    },
    defaultConfig: {
      preferredTools: ['fetchLatestNews'],
      defaultParams: {
        timeframe: '24h',
        size: 10,
        fullContent: true,
        removeDuplicates: true,
        sort: 'relevancy',
      },
      maxArticles: 10,
    },
  };

  return new NewsDataIntegrationLayer(
    newsDataClient,
    defaultConfig,
    legacyDataLayer,
    logger
  );
}

/**
 * Create NewsData integration layer with custom configuration
 */
export function createCustomNewsDataIntegrationLayer(
  newsDataClient: NewsDataClient,
  config: NewsDataAgentIntegrationConfig,
  legacyDataLayer?: DataIntegrationLayer,
  logger?: AdvancedObservabilityLogger
): NewsDataIntegrationLayer {
  return new NewsDataIntegrationLayer(
    newsDataClient,
    config,
    legacyDataLayer,
    logger
  );
}