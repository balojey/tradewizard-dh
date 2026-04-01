/**
 * NewsData.io Integration Wrapper
 * 
 * Provides backward compatibility by wrapping NewsData.io integration
 * in the legacy DataIntegrationLayer interface. This allows existing
 * code to use NewsData.io without modification.
 */

import { createNewsDataClient } from './newsdata-client.js';
import { createNewsDataIntegrationLayer } from './newsdata-agent-integration.js';
import { 
  DataIntegrationLayer, 
  type DataSourceConfig, 
  type NewsArticle as LegacyNewsArticle,
  type PollingData,
  type SocialSentiment,
} from './data-integration.js';
import type { MarketBriefingDocument } from '../models/types.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { NewsArticle } from './newsdata-agent-tools.js';
import type { AgentNewsInterface } from './newsdata-agent-integration.js';

// ============================================================================
// NewsData Integration Wrapper
// ============================================================================

/**
 * Wrapper that extends DataIntegrationLayer to provide NewsData.io integration
 * while maintaining backward compatibility with existing code.
 */
export class NewsDataIntegrationWrapper extends DataIntegrationLayer {
  private newsDataLayer: AgentNewsInterface;

  constructor(
    config: DataSourceConfig,
    observabilityLogger?: AdvancedObservabilityLogger
  ) {
    // Call parent constructor with modified config (set news provider to 'none' to avoid conflicts)
    const modifiedConfig = {
      ...config,
      news: {
        ...config.news,
        provider: 'none' as const, // Disable legacy news provider
      },
    };
    super(modifiedConfig, observabilityLogger);
    
    // Create NewsData client from configuration
    const newsDataClient = createNewsDataClient({
      apiKey: process.env.NEWSDATA_API_KEY || '',
      isFreeTier: process.env.NEWSDATA_FREE_TIER === 'true',
      rateLimiting: {
        requestsPerWindow: 100, // Default NewsData.io limit
        windowSizeMs: 15 * 60 * 1000, // 15 minutes
        dailyQuota: 1000, // Default daily quota
      },
      cache: {
        enabled: true,
        ttl: {
          latest: config.news.cacheTTL || 300,
          crypto: config.news.cacheTTL || 300,
          market: config.news.cacheTTL || 300,
          archive: config.news.cacheTTL || 1800,
        },
        maxSize: 1000,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 60000,
      },
    });

    // Create NewsData integration layer
    this.newsDataLayer = createNewsDataIntegrationLayer(
      newsDataClient,
      undefined, // No legacy data layer
      observabilityLogger
    );
  }

  /**
   * Override fetchNews to use NewsData.io integration
   */
  async fetchNews(
    market: MarketBriefingDocument,
    timeWindow: number = 24
  ): Promise<LegacyNewsArticle[]> {
    try {
      // Use NewsData integration layer
      const articles = await this.newsDataLayer.fetchNewsForMarket(market, timeWindow);
      
      // Convert to legacy format
      return this.convertToLegacyFormat(articles);
      
    } catch (error) {
      console.error('[NewsDataWrapper] NewsData wrapper error', {
        method: 'fetchNews',
        marketId: market.marketId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return empty array on error (consistent with legacy behavior)
      return [];
    }
  }

  /**
   * Override fetchPollingData - not supported by NewsData.io
   */
  async fetchPollingData(market: MarketBriefingDocument): Promise<PollingData | null> {
    // NewsData.io doesn't provide polling data
    // Fall back to parent implementation or return null
    console.warn('[NewsDataWrapper] Polling data not supported by NewsData.io integration', {
      marketId: market.marketId,
    });
    
    return super.fetchPollingData(market);
  }

  /**
   * Override fetchSocialSentiment - not supported by NewsData.io
   */
  async fetchSocialSentiment(
    market: MarketBriefingDocument,
    platforms: string[] = ['twitter', 'reddit']
  ): Promise<SocialSentiment | null> {
    // NewsData.io doesn't provide social sentiment data
    // Fall back to parent implementation or return null
    console.warn('[NewsDataWrapper] Social sentiment data not supported by NewsData.io integration', {
      marketId: market.marketId,
      platforms,
    });
    
    return super.fetchSocialSentiment(market, platforms);
  }

  /**
   * Convert NewsData articles to legacy format
   */
  private convertToLegacyFormat(articles: NewsArticle[]): LegacyNewsArticle[] {
    return articles.map(article => ({
      title: article.title,
      source: article.source.name,
      publishedAt: new Date(article.metadata.publishedAt).getTime(),
      url: article.url,
      summary: article.content.description || article.content.fullContent || article.title,
      sentiment: article.ai?.sentiment || 'neutral',
      relevanceScore: 0.8, // Default relevance score
    }));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a NewsData integration wrapper that provides backward compatibility
 */
export function createNewsDataIntegrationWrapper(
  config: DataSourceConfig,
  observabilityLogger?: AdvancedObservabilityLogger
): DataIntegrationLayer {
  return new NewsDataIntegrationWrapper(config, observabilityLogger);
}