/**
 * Enhanced Event Briefing Generator
 *
 * This module generates streamlined MarketBriefingDocument instances from Polymarket events
 * focused on single market analysis with essential event context.
 */

import type {
  PolymarketEvent,
  PolymarketMarket,
  MarketBriefingDocument,
  EventType,
  VolatilityRegime,
  MarketId,
  StreamlinedEventMetadata,
  Catalyst,
} from '../models/types.js';
import { getLogger } from './logger.js';

const logger = getLogger();

/**
 * Configuration for briefing generation
 */
export interface BriefingGenerationConfig {
  includeAllMarkets: boolean;
  maxMarketsToAnalyze: number;
  keywordExtractionMode: 'event_priority' | 'market_priority' | 'balanced';
  qualityThresholds: {
    minLiquidity: number;
    minCompetitive: number;
    minVolume: number;
  };
}

/**
 * Enhanced Event Briefing Generator
 * 
 * Transforms Polymarket events with multiple markets into streamlined MarketBriefingDocument
 * instances focused on single market analysis with essential event context.
 */
export class EnhancedEventBriefingGenerator {
  private readonly config: BriefingGenerationConfig;

  constructor(config: Partial<BriefingGenerationConfig> = {}) {
    this.config = {
      includeAllMarkets: true,
      maxMarketsToAnalyze: 50,
      keywordExtractionMode: 'event_priority',
      qualityThresholds: {
        minLiquidity: 100,
        minCompetitive: 0.1,
        minVolume: 10,
      },
      ...config,
    };
    
    logger.info('EnhancedEventBriefingGenerator initialized with streamlined approach');
  }

  /**
   * Generate streamlined MarketBriefingDocument from Polymarket event
   * Focuses on essential data for single market analysis
   */
  async generateEventBriefing(event: PolymarketEvent, primaryMarketId?: string): Promise<MarketBriefingDocument> {
    logger.info(`Generating streamlined event briefing for event: ${event.id} (${event.title})`);

    // Determine primary market (dominant by volume or specified)
    const primaryMarket = this.determinePrimaryMarket(event, primaryMarketId);
    
    // Extract focused keywords for this market
    const keywords = this.extractFocusedKeywords(primaryMarket, event);
    
    // Calculate essential event context
    const eventContext = this.calculateEventContext(event, primaryMarket);
    
    // Generate streamlined metadata
    const streamlinedMetadata = this.generateStreamlinedMetadata(event, primaryMarket);

    // Create the streamlined MarketBriefingDocument
    const briefing: MarketBriefingDocument = {
      // Core market data from primary market
      marketId: primaryMarket.id as MarketId,
      conditionId: primaryMarket.conditionId,
      eventType: this.classifyEventType(event),
      question: primaryMarket.question,
      resolutionCriteria: primaryMarket.description || event.description,
      expiryTimestamp: new Date(primaryMarket.endDate).getTime(),
      currentProbability: this.calculateCurrentProbability(primaryMarket),
      liquidityScore: this.calculateLiquidityScore(primaryMarket, event),
      bidAskSpread: this.estimateBidAskSpread(primaryMarket),
      volatilityRegime: this.determineVolatilityRegime(primaryMarket),
      volume24h: primaryMarket.volume24hr || 0,
      
      // Essential event context (streamlined)
      eventContext,
      
      // Focused keywords
      keywords,
      
      // Streamlined metadata
      metadata: streamlinedMetadata,
    };

    logger.info(`Generated streamlined briefing for market ${primaryMarket.id} in event with ${event.markets.length} total markets`);
    
    return briefing;
  }

  /**
   * Generate multiple briefings for all significant markets in an event
   */
  async generateMultiMarketBriefings(event: PolymarketEvent): Promise<MarketBriefingDocument[]> {
    logger.info(`Generating multi-market briefings for event: ${event.id}`);

    const briefings: MarketBriefingDocument[] = [];
    
    // Filter markets based on quality thresholds
    const qualifiedMarkets = this.filterQualifiedMarkets(event.markets);
    
    // Limit number of markets to analyze
    const marketsToAnalyze = qualifiedMarkets.slice(0, this.config.maxMarketsToAnalyze);
    
    for (const market of marketsToAnalyze) {
      try {
        const briefing = await this.generateEventBriefing(event, market.id);
        briefings.push(briefing);
      } catch (error) {
        logger.warn(`Failed to generate briefing for market ${market.id}: ${(error as Error).message}`);
      }
    }

    logger.info(`Generated ${briefings.length} multi-market briefings from ${marketsToAnalyze.length} qualified markets`);
    
    return briefings;
  }

  /**
   * Calculate liquidity score for the market (streamlined)
   */
  private calculateLiquidityScore(market: PolymarketMarket, event: PolymarketEvent): number {
    const liquidity = market.liquidityNum || 0;
    const eventAvgLiquidity = event.markets.reduce((sum, m) => sum + (m.liquidityNum || 0), 0) / event.markets.length;
    
    // Score relative to event average, normalized to 0-10 scale
    const relativeScore = eventAvgLiquidity > 0 ? (liquidity / eventAvgLiquidity) : 1;
    return Math.min(10, Math.log10(liquidity + 1) * 2 * relativeScore);
  }

  /**
   * Determine volatility regime from market data (streamlined)
   */
  private determineVolatilityRegime(market: PolymarketMarket): VolatilityRegime {
    const priceChanges = [
      Math.abs(market.oneDayPriceChange || 0),
      Math.abs(market.oneWeekPriceChange || 0),
      Math.abs(market.oneMonthPriceChange || 0),
    ];
    
    const avgVolatility = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
    
    if (avgVolatility > 0.15) return 'high';
    if (avgVolatility > 0.05) return 'medium';
    return 'low';
  }

  // ==========================================================================
  // Streamlined Helper Methods
  // ==========================================================================

  /**
   * Extract focused keywords for the primary market
   */
  private extractFocusedKeywords(market: PolymarketMarket, event: PolymarketEvent): string[] {
    const keywords = new Set<string>();
    
    // Extract from market question (most important)
    const questionWords = market.question.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word))
      .slice(0, 8); // Limit to 8 most relevant
    
    questionWords.forEach(word => keywords.add(word));
    
    // Add key event-level keywords (top 3)
    const eventWords = event.title.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word))
      .slice(0, 3);
    
    eventWords.forEach(word => keywords.add(word));
    
    return Array.from(keywords).slice(0, 10); // Max 10 keywords total
  }

  /**
   * Calculate essential event context for the primary market
   */
  private calculateEventContext(event: PolymarketEvent, primaryMarket: PolymarketMarket): {
    eventId: string;
    eventTitle: string;
    eventDescription: string;
    totalMarkets: number;
    totalVolume: number;
    totalLiquidity: number;
    marketRank: number;
    relatedMarketCount: number;
  } {
    // Calculate totals
    const totalVolume = event.markets.reduce((sum, m) => sum + (m.volumeNum || 0), 0);
    const totalLiquidity = event.markets.reduce((sum, m) => sum + (m.liquidityNum || 0), 0);
    
    // Calculate market rank by volume
    const sortedByVolume = [...event.markets].sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0));
    const marketRank = sortedByVolume.findIndex(m => m.id === primaryMarket.id) + 1;
    
    // Count related markets (simple similarity check)
    const relatedMarketCount = event.markets.filter(m => 
      m.id !== primaryMarket.id && 
      this.calculateQuestionSimilarity(m.question, primaryMarket.question) > 0.3
    ).length;

    return {
      eventId: event.id,
      eventTitle: event.title,
      eventDescription: event.description,
      totalMarkets: event.markets.length,
      totalVolume,
      totalLiquidity,
      marketRank,
      relatedMarketCount,
    };
  }

  /**
   * Generate streamlined metadata with only essential insights
   */
  private generateStreamlinedMetadata(event: PolymarketEvent, primaryMarket: PolymarketMarket): StreamlinedEventMetadata {
    // Extract key catalysts (top 3)
    const keyCatalysts = this.extractKeyCatalysts(event, primaryMarket).slice(0, 3);
    
    // Generate key insights (top 3)
    const keyInsights = this.generateKeyInsights(event, primaryMarket).slice(0, 3);
    
    // Identify primary risk factors (top 3)
    const primaryRiskFactors = this.identifyPrimaryRiskFactors(event, primaryMarket).slice(0, 3);
    
    // Find top opportunities (top 2)
    const topOpportunities = this.findTopOpportunities(event, primaryMarket).slice(0, 2);
    
    // Calculate market position
    const marketPosition = this.calculateMarketPosition(event, primaryMarket);

    return {
      ambiguityFlags: this.detectAmbiguityFlags(primaryMarket.description || event.description),
      keyCatalysts,
      eventId: event.id,
      eventTitle: event.title,
      eventDescription: event.description,
      keyInsights,
      primaryRiskFactors,
      topOpportunities,
      marketPosition,
    };
  }

  /**
   * Extract key catalysts for the market
   */
  private extractKeyCatalysts(event: PolymarketEvent, market: PolymarketMarket): Catalyst[] {
    const catalysts: Catalyst[] = [];
    
    // Market expiry as a catalyst
    catalysts.push({
      event: `Market expiry: ${market.question}`,
      timestamp: new Date(market.endDate).getTime(),
    });
    
    // Event-level catalysts based on event type
    const eventType = this.classifyEventType(event);
    if (eventType === 'election') {
      catalysts.push({
        event: 'Election day voting and results',
        timestamp: new Date(market.endDate).getTime() - (7 * 24 * 60 * 60 * 1000), // 7 days before
      });
    } else if (eventType === 'policy') {
      catalysts.push({
        event: 'Policy announcement or legislative action',
        timestamp: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days from now
      });
    }
    
    return catalysts;
  }

  /**
   * Generate key insights for the market
   */
  private generateKeyInsights(event: PolymarketEvent, market: PolymarketMarket): string[] {
    const insights: string[] = [];
    
    // Volume insight
    const marketVolume = market.volumeNum || 0;
    const eventTotalVolume = event.markets.reduce((sum, m) => sum + (m.volumeNum || 0), 0);
    const volumeShare = eventTotalVolume > 0 ? (marketVolume / eventTotalVolume) * 100 : 0;
    
    if (volumeShare > 50) {
      insights.push(`Dominant market with ${volumeShare.toFixed(0)}% of event volume`);
    } else if (volumeShare > 20) {
      insights.push(`Major market with ${volumeShare.toFixed(0)}% of event volume`);
    } else {
      insights.push(`Niche market with ${volumeShare.toFixed(0)}% of event volume`);
    }
    
    // Liquidity insight
    const liquidity = market.liquidityNum || 0;
    if (liquidity > 10000) {
      insights.push('High liquidity enables large position sizes');
    } else if (liquidity > 1000) {
      insights.push('Moderate liquidity suitable for medium positions');
    } else {
      insights.push('Low liquidity requires careful position sizing');
    }
    
    // Competitive insight
    const competitive = market.competitive || 0;
    if (competitive > 0.7) {
      insights.push('Highly competitive market with efficient pricing');
    } else if (competitive < 0.3) {
      insights.push('Low competition may indicate pricing inefficiencies');
    }
    
    return insights;
  }

  /**
   * Identify primary risk factors for the market
   */
  private identifyPrimaryRiskFactors(event: PolymarketEvent, market: PolymarketMarket): string[] {
    const riskFactors: string[] = [];
    
    // Time risk
    const timeToExpiry = new Date(market.endDate).getTime() - Date.now();
    const daysToExpiry = timeToExpiry / (24 * 60 * 60 * 1000);
    
    if (daysToExpiry < 7) {
      riskFactors.push('Short time horizon increases execution risk');
    } else if (daysToExpiry > 365) {
      riskFactors.push('Long time horizon increases uncertainty and opportunity cost');
    }
    
    // Liquidity risk
    const liquidity = market.liquidityNum || 0;
    if (liquidity < 500) {
      riskFactors.push('Low liquidity may cause slippage and exit difficulties');
    }
    
    // Resolution risk
    if (event.resolutionSource.toLowerCase().includes('subjective')) {
      riskFactors.push('Subjective resolution criteria increase dispute risk');
    }
    
    // Volatility risk
    const priceChanges = [
      market.oneDayPriceChange || 0,
      market.oneWeekPriceChange || 0,
      market.oneMonthPriceChange || 0,
    ];
    const avgVolatility = priceChanges.reduce((sum, change) => sum + Math.abs(change), 0) / priceChanges.length;
    
    if (avgVolatility > 0.1) {
      riskFactors.push('High price volatility increases timing risk');
    }
    
    return riskFactors;
  }

  /**
   * Find top opportunities for the market
   */
  private findTopOpportunities(_event: PolymarketEvent, market: PolymarketMarket): string[] {
    const opportunities: string[] = [];
    
    // Price opportunity
    try {
      const prices = JSON.parse(market.outcomePrices || '[]') as number[];
      if (prices.length >= 2) {
        const yesPrice = prices[0];
        
        if (yesPrice < 0.3 || yesPrice > 0.7) {
          opportunities.push(`Potential value in ${yesPrice < 0.3 ? 'YES' : 'NO'} outcome at ${(yesPrice * 100).toFixed(0)}¢`);
        }
        
        if (Math.abs(yesPrice - 0.5) > 0.2) {
          opportunities.push('Market shows strong directional bias, consider contrarian position');
        }
      }
    } catch {
      // Skip if price parsing fails
    }
    
    // Volume opportunity
    const recentVolume = market.volume24hr || 0;
    const totalVolume = market.volumeNum || 0;
    
    if (totalVolume > 0 && recentVolume / totalVolume > 0.1) {
      opportunities.push('High recent activity suggests momentum or new information');
    }
    
    return opportunities;
  }

  /**
   * Calculate market position within the event
   */
  private calculateMarketPosition(event: PolymarketEvent, market: PolymarketMarket): {
    volumeRank: number;
    liquidityRank: number;
    competitiveScore: number;
    isDominantMarket: boolean;
  } {
    // Sort markets by volume and liquidity
    const sortedByVolume = [...event.markets].sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0));
    const sortedByLiquidity = [...event.markets].sort((a, b) => (b.liquidityNum || 0) - (a.liquidityNum || 0));
    
    const volumeRank = sortedByVolume.findIndex(m => m.id === market.id) + 1;
    const liquidityRank = sortedByLiquidity.findIndex(m => m.id === market.id) + 1;
    
    // Check if dominant (top 20% by volume and liquidity)
    const isDominantMarket = volumeRank <= Math.max(1, Math.ceil(event.markets.length * 0.2)) &&
                            liquidityRank <= Math.max(1, Math.ceil(event.markets.length * 0.2));

    return {
      volumeRank,
      liquidityRank,
      competitiveScore: market.competitive || 0,
      isDominantMarket,
    };
  }

  /**
   * Detect ambiguity flags in market description
   */
  private detectAmbiguityFlags(description: string): string[] {
    const flags: string[] = [];
    const text = description.toLowerCase();
    
    if (text.includes('subjective') || text.includes('opinion')) {
      flags.push('subjective-resolution');
    }
    
    if (text.includes('approximately') || text.includes('around') || text.includes('about')) {
      flags.push('approximate-criteria');
    }
    
    if (text.includes('may') || text.includes('might') || text.includes('could')) {
      flags.push('conditional-language');
    }
    
    return flags;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Determine the primary market for the event
   */
  private determinePrimaryMarket(event: PolymarketEvent, primaryMarketId?: string): PolymarketMarket {
    if (primaryMarketId) {
      const specifiedMarket = event.markets.find(m => m.id === primaryMarketId);
      if (specifiedMarket) return specifiedMarket;
    }
    
    // Default to market with highest volume
    return event.markets.reduce((max, market) => 
      (market.volumeNum || 0) > (max.volumeNum || 0) ? market : max
    );
  }

  /**
   * Filter markets based on quality thresholds
   */
  private filterQualifiedMarkets(markets: PolymarketMarket[]): PolymarketMarket[] {
    return markets.filter(market => 
      (market.liquidityNum || 0) >= this.config.qualityThresholds.minLiquidity &&
      (market.competitive || 0) >= this.config.qualityThresholds.minCompetitive &&
      (market.volumeNum || 0) >= this.config.qualityThresholds.minVolume
    );
  }

  /**
   * Classify event type based on event data
   */
  private classifyEventType(event: PolymarketEvent): EventType {
    const title = event.title.toLowerCase();
    const description = event.description.toLowerCase();
    const text = `${title} ${description}`;

    if (text.includes('election') || text.includes('vote') || text.includes('presidential')) {
      return 'election';
    }
    if (text.includes('policy') || text.includes('law') || text.includes('legislation')) {
      return 'policy';
    }
    if (text.includes('court') || text.includes('ruling') || text.includes('supreme')) {
      return 'court';
    }
    if (text.includes('war') || text.includes('conflict') || text.includes('treaty')) {
      return 'geopolitical';
    }
    if (text.includes('gdp') || text.includes('inflation') || text.includes('economy') || 
        text.includes('bitcoin') || text.includes('stock') || text.includes('price')) {
      return 'economic';
    }

    return 'other';
  }

  /**
   * Calculate current probability from market data
   */
  private calculateCurrentProbability(market: PolymarketMarket): number {
    try {
      const prices = JSON.parse(market.outcomePrices || '[]') as number[];
      if (prices.length >= 2) {
        return prices[0]; // Assume first outcome is "YES"
      }
    } catch {
      // Fall back to last trade price or default
    }
    
    return market.lastTradePrice || 0.5;
  }

  /**
   * Estimate bid-ask spread from market data
   */
  private estimateBidAskSpread(market: PolymarketMarket): number {
    if (market.bestBid && market.bestAsk) {
      return (market.bestAsk - market.bestBid) * 100; // in cents
    }
    
    // Estimate based on competitive score
    const competitive = market.competitive || 0.5;
    return (1 - competitive) * 10; // Higher competitive = lower spread
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'will', 'be', 'is', 'are', 'was', 'were', 'been', 'have', 'has', 'had',
      'this', 'that', 'these', 'those', 'a', 'an', 'as', 'if', 'then', 'than',
    ]);
    
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Calculate question similarity between two markets
   */
  private calculateQuestionSimilarity(question1: string, question2: string): number {
    const words1 = new Set(question1.toLowerCase().split(/\s+/));
    const words2 = new Set(question2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // Jaccard similarity
  }
}