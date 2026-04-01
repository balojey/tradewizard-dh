/**
 * Event-Based Multi-Market Keyword Extractor
 *
 * This module implements AI-powered keyword extraction for Polymarket events that prioritizes
 * event-level tags while incorporating keywords from all constituent markets.
 * It provides comprehensive keyword analysis for event-centric intelligence gathering.
 * 
 * Features:
 * - AI-powered intelligent keyword extraction and analysis
 * - Event-level keyword prioritization from tags, title, and description
 * - Multi-market keyword extraction and consolidation
 * - Cross-market theme identification and analysis
 * - Keyword ranking and relevance scoring for event-level analysis
 * - Political relevance filtering and concept extraction
 * - Semantic understanding and context-aware processing
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BedrockClient } from './bedrock-client.js';
import { config } from '../config/index.js';
import { z } from 'zod';
import type {
  PolymarketEvent,
  PolymarketMarket,
  PolymarketTag,
  EventKeywords,
  ThemeKeywords,
  ConceptKeywords,
  RankedKeyword,
} from '../models/types.js';
import { getLogger } from './logger.js';

const logger = getLogger();

/**
 * AI-powered keyword analysis response schema
 */
const AIKeywordAnalysisSchema = z.object({
  primaryKeywords: z.array(z.string()).describe('Most important keywords that capture the core essence of the event'),
  semanticKeywords: z.array(z.string()).describe('Related terms and concepts that provide semantic context'),
  politicalKeywords: z.array(z.string()).describe('Keywords specifically related to political events, elections, or governance'),
  thematicClusters: z.array(z.object({
    theme: z.string().describe('The main theme or topic'),
    keywords: z.array(z.string()).describe('Keywords belonging to this theme'),
    relevance: z.number().min(0).max(1).describe('Relevance score for this theme')
  })).describe('Thematic groupings of related keywords'),
  contextualInsights: z.array(z.string()).describe('Key insights about the event context and significance'),
  riskFactors: z.array(z.string()).describe('Potential risk factors or uncertainties identified from the text'),
  confidence: z.number().min(0).max(1).describe('Overall confidence in the keyword analysis')
});

type AIKeywordAnalysis = z.infer<typeof AIKeywordAnalysisSchema>;

/**
 * AI-powered concept extraction schema
 */
const AIConceptExtractionSchema = z.object({
  concepts: z.array(z.object({
    concept: z.string().describe('The main concept or entity'),
    keywords: z.array(z.string()).describe('Related keywords for this concept'),
    category: z.enum(['person', 'organization', 'event', 'policy', 'location', 'date', 'other']).describe('Category of the concept'),
    importance: z.number().min(0).max(1).describe('Importance score for this concept'),
    context: z.string().describe('Brief context about why this concept is relevant')
  })).describe('Extracted concepts with their associated keywords'),
  relationships: z.array(z.object({
    concept1: z.string(),
    concept2: z.string(),
    relationship: z.string().describe('Type of relationship between concepts'),
    strength: z.number().min(0).max(1).describe('Strength of the relationship')
  })).describe('Relationships between identified concepts')
});

type AIConceptExtraction = z.infer<typeof AIConceptExtractionSchema>;

/**
 * Keywords extracted from individual markets
 */
export interface MarketKeywords {
  marketId: string;
  primary: string[];      // From market question
  secondary: string[];    // From market description
  outcomes: string[];     // From outcome labels
}

/**
 * Processed event keywords with source tracking
 */
export interface ProcessedEventKeywords {
  eventTags: string[];
  eventTitle: string[];
  eventDescription: string[];
  marketQuestions: string[];
  marketOutcomes: string[];
  derived: string[];      // Processed variations
  political: string[];    // Politically relevant subset
}

/**
 * Configuration for keyword extraction modes
 */
export type KeywordExtractionMode = 'event_priority' | 'market_priority' | 'balanced';

/**
 * AI-Powered Event-Based Multi-Market Keyword Extractor
 * 
 * Extracts and processes keywords from Polymarket events with multiple markets,
 * prioritizing event-level information while incorporating market-specific terms.
 * Uses AI agents for intelligent semantic analysis and context understanding.
 */
export class EventMultiMarketKeywordExtractor {
  private readonly politicalKeywords = new Set([
    'election', 'vote', 'voting', 'president', 'presidential', 'congress', 'senate', 'house',
    'political', 'politics', 'campaign', 'candidate', 'policy', 'government', 'federal',
    'state', 'governor', 'mayor', 'democrat', 'republican', 'party', 'primary', 'general',
    'ballot', 'referendum', 'proposition', 'amendment', 'legislation', 'bill', 'law',
    'court', 'supreme', 'justice', 'judge', 'ruling', 'decision', 'case', 'legal',
    'impeachment', 'scandal', 'investigation', 'hearing', 'committee', 'testimony',
    'debate', 'poll', 'polling', 'approval', 'rating', 'endorsement', 'nomination',
    'cabinet', 'administration', 'executive', 'legislative', 'judicial', 'constitutional'
  ]);

  private readonly stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'will', 'be', 'is', 'are', 'was', 'were', 'been', 'have', 'has', 'had',
    'do', 'does', 'did', 'can', 'could', 'should', 'would', 'may', 'might', 'must',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
  ]);

  private readonly keywordAnalysisAgentBase: ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI;
  private readonly conceptExtractionAgentBase: ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI;

  constructor(
    private readonly extractionMode: KeywordExtractionMode = 'event_priority',
    llmConfig?: {
      keywordAgent?: any;
      conceptAgent?: any;
      opikHandler?: any; // Accept Opik handler from workflow (for logging purposes)
    }
  ) {
    // Note: We don't use the opikHandler directly anymore - the workflow-level handler manages all tracing
    // This parameter is kept for backward compatibility and logging
    const hasSharedOpikHandler = !!llmConfig?.opikHandler;

    // Initialize AI agents for intelligent keyword extraction
    // Create base LLM instances that will inherit tracing from the workflow context
    this.keywordAnalysisAgentBase = this.createBaseLLMInstance(config, 0.1);
    this.conceptExtractionAgentBase = this.createBaseLLMInstance(config, 0.2);

    logger.info({
      mode: this.extractionMode,
      opikProject: config.opik.projectName,
      opikTracking: config.opik.trackCosts,
      hasSharedOpikHandler,
      tracingStrategy: 'workflow-managed',
    }, `AI-Powered EventMultiMarketKeywordExtractor initialized with mode: ${this.extractionMode}`);
  }



  /**
   * Creates a base LLM instance based on the current configuration
   * Respects the LLM_SINGLE_PROVIDER setting
   */
  private createBaseLLMInstance(config: any, temperature: number): ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI | any {
    const singleProvider = config.llm.singleProvider;
    
    // If single provider is set, use only that provider
    if (singleProvider === 'nova' && config.llm.nova) {
      const bedrockClient = new BedrockClient({
        modelId: config.llm.nova.modelName,
        region: config.llm.nova.awsRegion,
        temperature,
        maxTokens: config.llm.nova.maxTokens,
        topP: config.llm.nova.topP,
        credentials: config.llm.nova.awsAccessKeyId && config.llm.nova.awsSecretAccessKey
          ? {
              accessKeyId: config.llm.nova.awsAccessKeyId,
              secretAccessKey: config.llm.nova.awsSecretAccessKey,
            }
          : undefined,
      });
      return bedrockClient.createChatModel();
    }
    
    if (singleProvider === 'google' && config.llm.google) {
      return new ChatGoogleGenerativeAI({
        apiKey: config.llm.google.apiKey,
        model: config.llm.google.defaultModel,
        temperature,
      });
    }
    
    if (singleProvider === 'openai' && config.llm.openai) {
      return new ChatOpenAI({
        apiKey: config.llm.openai.apiKey,
        model: config.llm.openai.defaultModel,
        temperature,
      });
    }
    
    if (singleProvider === 'anthropic' && config.llm.anthropic) {
      return new ChatAnthropic({
        apiKey: config.llm.anthropic.apiKey,
        model: config.llm.anthropic.defaultModel,
        temperature,
      });
    }
    
    // Fallback: try available providers in order of preference
    if (config.llm.google) {
      return new ChatGoogleGenerativeAI({
        apiKey: config.llm.google.apiKey,
        model: config.llm.google.defaultModel,
        temperature,
      });
    }
    
    if (config.llm.openai) {
      return new ChatOpenAI({
        apiKey: config.llm.openai.apiKey,
        model: config.llm.openai.defaultModel,
        temperature,
      });
    }
    
    if (config.llm.anthropic) {
      return new ChatAnthropic({
        apiKey: config.llm.anthropic.apiKey,
        model: config.llm.anthropic.defaultModel,
        temperature,
      });
    }
    
    throw new Error('No LLM provider configured. Please set up at least one LLM provider (OpenAI, Anthropic, Google, or Nova).');
  }

  /**
   * Extract comprehensive keywords from a Polymarket event using AI-powered analysis
   */
  async extractKeywordsFromEvent(event: PolymarketEvent): Promise<EventKeywords> {
    const startTime = Date.now();
    logger.info({
      eventId: event.id,
      eventTitle: event.title,
      marketCount: event.markets?.length || 0,
      opikProject: config.opik.projectName,
    }, `Extracting keywords from event: ${event.id} (${event.title})`);

    try {
      // Step 1: AI-powered keyword analysis
      const aiAnalysis = await this.performAIKeywordAnalysis(event);
      
      // Step 2: Traditional rule-based extraction (as fallback and validation)
      const traditionalKeywords = this.extractTraditionalKeywords(event);
      
      // Step 3: AI-powered concept extraction
      const aiConcepts = await this.performAIConceptExtraction(event);
      
      // Step 4: Combine and enhance with AI insights
      const enhanced = this.combineAIAndTraditionalAnalysis(aiAnalysis, traditionalKeywords, aiConcepts);
      
      // Step 5: Extract market-level keywords
      const marketKeywords = this.extractKeywordsFromAllMarkets(event.markets);

      // Step 6: Identify themes using AI-enhanced analysis
      const themes = await this.identifyAIEnhancedThemes(event.markets, aiAnalysis);
      
      // Step 7: Create final concepts combining AI and traditional approaches
      const concepts = this.createEnhancedConcepts(aiConcepts, event);

      // Step 8: Rank keywords using AI insights
      const combined = this.combineEventAndMarketKeywords(enhanced.eventLevel, marketKeywords);
      const ranked = this.rankKeywordsByEventRelevance(combined, event, aiAnalysis);

      const result: EventKeywords = {
        eventLevel: enhanced.eventLevel,
        marketLevel: marketKeywords.flatMap(mk => [...mk.primary, ...mk.secondary, ...mk.outcomes]),
        combined,
        themes,
        concepts,
        ranked
      };

      const duration = Date.now() - startTime;
      logger.info({
        eventId: event.id,
        duration,
        keywordCount: result.combined.length,
        themeCount: result.themes.length,
        conceptCount: result.concepts.length,
        opikProject: config.opik.projectName,
      }, `AI-enhanced extraction completed: ${result.combined.length} combined keywords, ${result.themes.length} themes, ${result.concepts.length} concepts`);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn({
        eventId: event.id,
        duration,
        error: error instanceof Error ? error.message : String(error),
        opikProject: config.opik.projectName,
      }, `AI keyword extraction failed, falling back to traditional method: ${error}`);

      return this.extractTraditionalKeywords(event);
    }
  }

  /**
   * Perform AI-powered keyword analysis on the event
   */
  private async performAIKeywordAnalysis(event: PolymarketEvent): Promise<AIKeywordAnalysis> {
    const eventContext = this.buildEventContext(event);
    
    const prompt = `Analyze the following prediction market event and extract comprehensive keywords:

EVENT CONTEXT:
${eventContext}

Please provide a thorough keyword analysis focusing on:
1. Primary keywords that capture the core essence of this event
2. Semantic keywords that provide related context and meaning
3. Political keywords if this is a political/governance event
4. Thematic clusters that group related concepts
5. Contextual insights about the event's significance
6. Risk factors or uncertainties you identify

Be precise and focus on terms that would be valuable for market intelligence and trading decisions.`;

    // Use structured output directly on the LLM instance
    const structuredAgent = this.keywordAnalysisAgentBase.withStructuredOutput(AIKeywordAnalysisSchema);
    
    const response = await structuredAgent.invoke([
      {
        role: 'system',
        content: 'You are an expert market intelligence analyst specializing in keyword extraction for prediction markets. Focus on identifying terms that are most relevant for trading decisions and market analysis.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);

    return response;
  }

  /**
   * Perform AI-powered concept extraction
   */
  private async performAIConceptExtraction(event: PolymarketEvent): Promise<AIConceptExtraction> {
    const eventContext = this.buildEventContext(event);
    
    const prompt = `Extract key concepts and entities from this prediction market event:

EVENT CONTEXT:
${eventContext}

Identify:
1. Important concepts/entities (people, organizations, events, policies, locations, dates)
2. Relationships between these concepts
3. Why each concept is relevant to the market outcome

Focus on concepts that could influence the market resolution or trading decisions.`;

    // Use structured output directly on the LLM instance
    const structuredAgent = this.conceptExtractionAgentBase.withStructuredOutput(AIConceptExtractionSchema);
    
    const response = await structuredAgent.invoke([
      {
        role: 'system',
        content: 'You are an expert in entity recognition and concept extraction for prediction markets. Focus on identifying concepts that are most relevant for understanding market dynamics and outcomes.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);

    return response;
  }

  /**
   * Build comprehensive event context for AI analysis
   */
  private buildEventContext(event: PolymarketEvent): string {
    const context = [
      `Title: ${event.title}`,
      `Description: ${event.description}`,
      `Tags: ${event.tags.map(tag => tag.label).join(', ')}`,
      `Markets (${event.markets.length}):`
    ];

    event.markets.forEach((market, index) => {
      context.push(`  ${index + 1}. ${market.question}`);
      if (market.description) {
        context.push(`     Description: ${market.description}`);
      }
      try {
        const outcomes = JSON.parse(market.outcomes);
        context.push(`     Outcomes: ${outcomes.join(', ')}`);
      } catch {
        context.push(`     Outcomes: ${market.outcomes}`);
      }
    });

    return context.join('\n');
  }

  /**
   * Combine AI analysis with traditional keyword extraction
   */
  private combineAIAndTraditionalAnalysis(
    aiAnalysis: AIKeywordAnalysis,
    traditional: EventKeywords,
    aiConcepts: AIConceptExtraction
  ): { eventLevel: string[]; enhanced: boolean } {
    const combined = new Set<string>();
    
    // Add AI-extracted keywords with high priority
    aiAnalysis.primaryKeywords.forEach(keyword => combined.add(keyword.toLowerCase()));
    aiAnalysis.semanticKeywords.forEach(keyword => combined.add(keyword.toLowerCase()));
    aiAnalysis.politicalKeywords.forEach(keyword => combined.add(keyword.toLowerCase()));
    
    // Add thematic keywords
    aiAnalysis.thematicClusters.forEach(cluster => {
      cluster.keywords.forEach(keyword => combined.add(keyword.toLowerCase()));
    });
    
    // Add concept keywords
    aiConcepts.concepts.forEach(concept => {
      combined.add(concept.concept.toLowerCase());
      concept.keywords.forEach(keyword => combined.add(keyword.toLowerCase()));
    });
    
    // Merge with traditional keywords (lower priority)
    traditional.eventLevel.forEach(keyword => combined.add(keyword.toLowerCase()));
    
    return {
      eventLevel: Array.from(combined),
      enhanced: true
    };
  }

  /**
   * Traditional keyword extraction (fallback method)
   */
  private extractTraditionalKeywords(event: PolymarketEvent): EventKeywords {
    // Extract event-level keywords
    const eventTags = this.extractKeywordsFromEventTags(event.tags);
    const eventTitle = this.extractKeywordsFromText(event.title, 'event_title');
    const eventDescription = this.extractKeywordsFromText(event.description, 'event_description');

    // Extract market-level keywords
    const marketKeywords = this.extractKeywordsFromAllMarkets(event.markets);

    // Process and combine keywords
    const combined = this.combineEventAndMarketKeywords(
      [...eventTags, ...eventTitle, ...eventDescription],
      marketKeywords
    );

    // Identify themes and concepts
    const themes = this.identifyCommonThemes(event.markets);
    const concepts = this.extractEventLevelConcepts(event);

    // Rank keywords by relevance
    const ranked = this.rankKeywordsByEventRelevance(combined, event);

    return {
      eventLevel: [...eventTags, ...eventTitle, ...eventDescription],
      marketLevel: marketKeywords.flatMap(mk => [...mk.primary, ...mk.secondary, ...mk.outcomes]),
      combined,
      themes,
      concepts,
      ranked
    };
  }

  /**
   * AI-enhanced theme identification across markets
   */
  private async identifyAIEnhancedThemes(
    markets: PolymarketMarket[], 
    aiAnalysis: AIKeywordAnalysis
  ): Promise<ThemeKeywords[]> {
    // Start with traditional theme identification
    const traditionalThemes = this.identifyCommonThemes(markets);
    
    // Enhance with AI-identified thematic clusters
    const aiThemes: ThemeKeywords[] = aiAnalysis.thematicClusters.map(cluster => ({
      theme: cluster.theme,
      keywords: cluster.keywords,
      marketIds: markets.map(m => m.id), // AI themes apply to all markets in the event
      relevanceScore: cluster.relevance
    }));

    // Combine and deduplicate themes
    const allThemes = [...traditionalThemes, ...aiThemes];
    const themeMap = new Map<string, ThemeKeywords>();

    for (const theme of allThemes) {
      const normalizedTheme = theme.theme.toLowerCase();
      if (themeMap.has(normalizedTheme)) {
        const existing = themeMap.get(normalizedTheme)!;
        // Merge keywords and market IDs
        existing.keywords = [...new Set([...existing.keywords, ...theme.keywords])];
        existing.marketIds = [...new Set([...existing.marketIds, ...theme.marketIds])];
        existing.relevanceScore = Math.max(existing.relevanceScore, theme.relevanceScore);
      } else {
        themeMap.set(normalizedTheme, theme);
      }
    }

    return Array.from(themeMap.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Create enhanced concepts combining AI and traditional extraction
   */
  private createEnhancedConcepts(
    aiConcepts: AIConceptExtraction, 
    event: PolymarketEvent
  ): ConceptKeywords[] {
    const concepts: ConceptKeywords[] = [];

    // Add AI-extracted concepts
    for (const concept of aiConcepts.concepts) {
      concepts.push({
        concept: concept.concept,
        keywords: concept.keywords,
        source: this.mapAICategoryToSource(concept.category),
        confidence: concept.importance
      });
    }

    // Add traditional concepts as backup
    const traditionalConcepts = this.extractEventLevelConcepts(event);
    for (const traditional of traditionalConcepts) {
      // Only add if not already covered by AI concepts
      const exists = concepts.some(c => 
        c.concept.toLowerCase() === traditional.concept.toLowerCase()
      );
      if (!exists) {
        concepts.push(traditional);
      }
    }

    return concepts.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Map AI concept categories to our source types
   */
  private mapAICategoryToSource(category: string): ConceptKeywords['source'] {
    switch (category) {
      case 'person':
      case 'organization':
      case 'location':
        return 'event_description';
      case 'event':
      case 'policy':
        return 'event_title';
      case 'date':
        return 'event_tags';
      default:
        return 'event_description';
    }
  }
  /**
   * Extract keywords from event tags
   */
  extractKeywordsFromEventTags(tags: PolymarketTag[]): string[] {
    const keywords: string[] = [];

    for (const tag of tags) {
      // Use tag label as primary keyword
      keywords.push(tag.label.toLowerCase());

      // Extract keywords from tag slug
      const slugKeywords = tag.slug
        .split('-')
        .filter(word => word.length > 2 && !this.stopWords.has(word));
      keywords.push(...slugKeywords);
    }

    return this.deduplicateAndFilter(keywords);
  }

  /**
   * Extract keywords from all markets within an event
   */
  extractKeywordsFromAllMarkets(markets: PolymarketMarket[]): MarketKeywords[] {
    return markets.map(market => ({
      marketId: market.id,
      primary: this.extractKeywordsFromText(market.question, 'market_question'),
      secondary: this.extractKeywordsFromText(market.description || '', 'market_description'),
      outcomes: this.extractOutcomeKeywords(market.outcomes)
    }));
  }

  /**
   * Process event metadata into structured keywords
   */
  processEventMetadata(event: PolymarketEvent): ProcessedEventKeywords {
    const eventTags = this.extractKeywordsFromEventTags(event.tags);
    const eventTitle = this.extractKeywordsFromText(event.title, 'event_title');
    const eventDescription = this.extractKeywordsFromText(event.description, 'event_description');
    
    const marketKeywords = this.extractKeywordsFromAllMarkets(event.markets);
    const marketQuestions = marketKeywords.flatMap(mk => mk.primary);
    const marketOutcomes = marketKeywords.flatMap(mk => mk.outcomes);

    // Generate derived keywords (variations, synonyms, etc.)
    const derived = this.generateDerivedKeywords([
      ...eventTags, ...eventTitle, ...eventDescription, ...marketQuestions
    ]);

    // Filter for political relevance
    const allKeywords = [...eventTags, ...eventTitle, ...eventDescription, ...marketQuestions, ...derived];
    const political = this.filterKeywordsByPoliticalRelevance(allKeywords);

    return {
      eventTags,
      eventTitle,
      eventDescription,
      marketQuestions,
      marketOutcomes,
      derived,
      political
    };
  }

  /**
   * Combine event and market keywords with proper prioritization
   */
  combineEventAndMarketKeywords(eventKeywords: string[], marketKeywords: MarketKeywords[]): string[] {
    return this.deduplicateAndRankCombinedKeywords(eventKeywords, marketKeywords);
  }

  /**
   * Implement comprehensive deduplication and ranking of combined event and market keywords
   * Requirement 3.4: Deduplication and ranking of combined event and market keywords
   */
  private deduplicateAndRankCombinedKeywords(eventKeywords: string[], marketKeywords: MarketKeywords[]): string[] {
    const keywordScores = new Map<string, {
      score: number;
      sources: Set<string>;
      marketIds: Set<string>;
      frequency: number;
    }>();

    // Process event keywords with highest priority
    for (const keyword of eventKeywords) {
      const normalized = this.normalizeKeyword(keyword);
      if (!keywordScores.has(normalized)) {
        keywordScores.set(normalized, {
          score: 0,
          sources: new Set(),
          marketIds: new Set(),
          frequency: 0
        });
      }
      
      const entry = keywordScores.get(normalized)!;
      entry.score += 5.0; // High priority for event-level keywords
      entry.sources.add('event');
      entry.frequency += 1;
    }

    // Process market keywords with context-aware scoring
    for (const mk of marketKeywords) {
      // Primary keywords (from questions) get higher weight
      for (const keyword of mk.primary) {
        const normalized = this.normalizeKeyword(keyword);
        if (!keywordScores.has(normalized)) {
          keywordScores.set(normalized, {
            score: 0,
            sources: new Set(),
            marketIds: new Set(),
            frequency: 0
          });
        }
        
        const entry = keywordScores.get(normalized)!;
        entry.score += 3.0; // Medium-high priority for market questions
        entry.sources.add('market_primary');
        entry.marketIds.add(mk.marketId);
        entry.frequency += 1;
      }

      // Secondary keywords (from descriptions) get medium weight
      for (const keyword of mk.secondary) {
        const normalized = this.normalizeKeyword(keyword);
        if (!keywordScores.has(normalized)) {
          keywordScores.set(normalized, {
            score: 0,
            sources: new Set(),
            marketIds: new Set(),
            frequency: 0
          });
        }
        
        const entry = keywordScores.get(normalized)!;
        entry.score += 2.0; // Medium priority for market descriptions
        entry.sources.add('market_secondary');
        entry.marketIds.add(mk.marketId);
        entry.frequency += 1;
      }

      // Outcome keywords get lower weight
      for (const keyword of mk.outcomes) {
        const normalized = this.normalizeKeyword(keyword);
        if (!keywordScores.has(normalized)) {
          keywordScores.set(normalized, {
            score: 0,
            sources: new Set(),
            marketIds: new Set(),
            frequency: 0
          });
        }
        
        const entry = keywordScores.get(normalized)!;
        entry.score += 1.0; // Lower priority for outcomes
        entry.sources.add('market_outcome');
        entry.marketIds.add(mk.marketId);
        entry.frequency += 1;
      }
    }

    // Apply cross-market bonus for keywords appearing in multiple markets
    for (const [, data] of keywordScores) {
      if (data.marketIds.size > 1) {
        data.score += data.marketIds.size * 0.5; // Bonus for cross-market presence
      }
    }

    // Sort by combined score and return deduplicated keywords
    return Array.from(keywordScores.entries())
      .sort((a, b) => {
        // Primary sort by score
        if (b[1].score !== a[1].score) {
          return b[1].score - a[1].score;
        }
        // Secondary sort by frequency
        if (b[1].frequency !== a[1].frequency) {
          return b[1].frequency - a[1].frequency;
        }
        // Tertiary sort by cross-market presence
        return b[1].marketIds.size - a[1].marketIds.size;
      })
      .map(([keyword]) => keyword)
      .slice(0, 50); // Limit to top 50 keywords
  }

  /**
   * Normalize keywords for deduplication (handle variations, case, etc.)
   */
  private normalizeKeyword(keyword: string): string {
    let normalized = keyword.toLowerCase().trim();
    
    // Remove common suffixes for better deduplication
    if (normalized.endsWith('ing')) {
      normalized = normalized.slice(0, -3);
    } else if (normalized.endsWith('ed')) {
      normalized = normalized.slice(0, -2);
    } else if (normalized.endsWith('s') && normalized.length > 4) {
      normalized = normalized.slice(0, -1);
    }
    
    // Handle common political term variations
    const politicalNormalizations: Record<string, string> = {
      'election': 'elect',
      'electoral': 'elect',
      'voting': 'vote',
      'voter': 'vote',
      'political': 'politic',
      'politics': 'politic',
      'presidential': 'president',
      'congressional': 'congress',
      'senatorial': 'senate'
    };
    
    return politicalNormalizations[normalized] || normalized;
  }

  /**
   * Identify common themes across markets within an event
   * Enhanced implementation for Requirement 3.5: Common theme identification
   */
  identifyCommonThemes(markets: PolymarketMarket[]): ThemeKeywords[] {
    const themeAnalysis = new Map<string, {
      keywords: Set<string>;
      marketIds: Set<string>;
      contexts: string[];
      semanticVariations: Set<string>;
    }>();

    // Extract potential themes from market questions and descriptions
    for (const market of markets) {
      const questionKeywords = this.extractKeywordsFromText(market.question, 'market_question');
      const descriptionKeywords = market.description ? 
        this.extractKeywordsFromText(market.description, 'market_description') : [];
      
      const allMarketKeywords = [...questionKeywords, ...descriptionKeywords];
      
      for (const keyword of allMarketKeywords) {
        const normalized = this.normalizeKeyword(keyword);
        
        if (!themeAnalysis.has(normalized)) {
          themeAnalysis.set(normalized, {
            keywords: new Set(),
            marketIds: new Set(),
            contexts: [],
            semanticVariations: new Set()
          });
        }
        
        const theme = themeAnalysis.get(normalized)!;
        theme.keywords.add(keyword);
        theme.marketIds.add(market.id);
        theme.semanticVariations.add(keyword.toLowerCase());
        
        // Store context for better theme understanding
        const context = this.extractKeywordContext(keyword, market.question);
        if (context) {
          theme.contexts.push(context);
        }
      }
    }

    // Identify semantic clusters and related themes
    const enhancedThemes = this.identifySemanticClusters(themeAnalysis, markets);

    // Filter themes that appear in multiple markets and calculate relevance
    const result: ThemeKeywords[] = [];
    for (const [theme, data] of enhancedThemes) {
      if (data.marketIds.size >= 2) { // Theme must appear in at least 2 markets
        const relevanceScore = this.calculateThemeRelevance(data, markets.length);
        
        result.push({
          theme,
          keywords: Array.from(data.keywords),
          marketIds: Array.from(data.marketIds),
          relevanceScore
        });
      }
    }

    // Sort by relevance score and cross-market presence
    return result.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return b.marketIds.length - a.marketIds.length;
    });
  }

  /**
   * Identify semantic clusters of related themes
   */
  private identifySemanticClusters(
    themeAnalysis: Map<string, {
      keywords: Set<string>;
      marketIds: Set<string>;
      contexts: string[];
      semanticVariations: Set<string>;
    }>,
    _markets: PolymarketMarket[]
  ): Map<string, {
    keywords: Set<string>;
    marketIds: Set<string>;
    contexts: string[];
    semanticVariations: Set<string>;
  }> {
    const clusters = new Map(themeAnalysis);
    
    // Define semantic relationships for political themes
    const semanticGroups = [
      ['elect', 'election', 'electoral', 'vote', 'voting', 'ballot'],
      ['president', 'presidential', 'executive', 'administration'],
      ['congress', 'congressional', 'senate', 'senatorial', 'house', 'legislative'],
      ['court', 'judicial', 'justice', 'judge', 'ruling', 'legal'],
      ['party', 'democrat', 'democratic', 'republican', 'gop'],
      ['campaign', 'candidate', 'nomination', 'primary', 'general'],
      ['policy', 'legislation', 'bill', 'law', 'amendment'],
      ['poll', 'polling', 'approval', 'rating', 'survey']
    ];

    // Merge semantically related themes
    for (const group of semanticGroups) {
      const groupThemes = group.filter(term => clusters.has(term));
      
      if (groupThemes.length > 1) {
        // Use the most frequent term as the cluster representative
        const representative = groupThemes.reduce((best, current) => {
          const bestData = clusters.get(best)!;
          const currentData = clusters.get(current)!;
          return currentData.marketIds.size > bestData.marketIds.size ? current : best;
        });

        // Merge other themes into the representative
        for (const theme of groupThemes) {
          if (theme !== representative) {
            const themeData = clusters.get(theme)!;
            const repData = clusters.get(representative)!;
            
            // Merge data
            themeData.keywords.forEach(k => repData.keywords.add(k));
            themeData.marketIds.forEach(id => repData.marketIds.add(id));
            repData.contexts.push(...themeData.contexts);
            themeData.semanticVariations.forEach(v => repData.semanticVariations.add(v));
            
            // Remove the merged theme
            clusters.delete(theme);
          }
        }
      }
    }

    return clusters;
  }

  /**
   * Calculate theme relevance score based on multiple factors
   */
  private calculateThemeRelevance(
    themeData: {
      keywords: Set<string>;
      marketIds: Set<string>;
      contexts: string[];
      semanticVariations: Set<string>;
    },
    totalMarkets: number
  ): number {
    // Base score from market coverage
    const marketCoverage = themeData.marketIds.size / totalMarkets;
    
    // Bonus for keyword diversity within theme
    const keywordDiversity = Math.min(themeData.keywords.size / 5, 1.0);
    
    // Bonus for political relevance
    const politicalBonus = Array.from(themeData.keywords).some(keyword => 
      this.isPoliticallyRelevant(keyword.toLowerCase())
    ) ? 0.2 : 0;
    
    // Context richness bonus
    const contextBonus = Math.min(themeData.contexts.length / 10, 0.1);
    
    return Math.min(
      marketCoverage * 0.6 + 
      keywordDiversity * 0.2 + 
      politicalBonus + 
      contextBonus,
      1.0
    );
  }

  /**
   * Extract context around a keyword for better theme understanding
   */
  private extractKeywordContext(keyword: string, text: string): string | null {
    const keywordIndex = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (keywordIndex === -1) return null;
    
    const start = Math.max(0, keywordIndex - 20);
    const end = Math.min(text.length, keywordIndex + keyword.length + 20);
    
    return text.substring(start, end).trim();
  }

  /**
   * Extract event-level concepts from event data
   */
  extractEventLevelConcepts(event: PolymarketEvent): ConceptKeywords[] {
    const concepts: ConceptKeywords[] = [];

    // Extract concepts from event title
    const titleConcepts = this.extractConceptsFromText(event.title, 'event_title');
    concepts.push(...titleConcepts);

    // Extract concepts from event description
    const descriptionConcepts = this.extractConceptsFromText(event.description, 'event_description');
    concepts.push(...descriptionConcepts);

    // Extract concepts from event tags
    for (const tag of event.tags) {
      concepts.push({
        concept: tag.label,
        keywords: [tag.label.toLowerCase(), ...tag.slug.split('-')],
        source: 'event_tags',
        confidence: 0.9
      });
    }

    // Identify market patterns
    const patternConcepts = this.identifyMarketPatterns(event.markets);
    concepts.push(...patternConcepts);

    return concepts;
  }

  /**
   * Rank keywords by relevance to the event using AI insights
   * Limited to top 10 most relevant keywords arranged by relevance
   */
  rankKeywordsByEventRelevance(
    keywords: string[], 
    event: PolymarketEvent, 
    aiAnalysis?: AIKeywordAnalysis
  ): RankedKeyword[] {
    const ranked: RankedKeyword[] = [];

    for (const keyword of keywords) {
      let relevanceScore = this.calculateKeywordRelevance(keyword, event);
      
      // Boost relevance based on AI analysis
      if (aiAnalysis) {
        if (aiAnalysis.primaryKeywords.includes(keyword)) {
          relevanceScore += 0.3; // High boost for AI-identified primary keywords
        } else if (aiAnalysis.semanticKeywords.includes(keyword)) {
          relevanceScore += 0.2; // Medium boost for semantic keywords
        } else if (aiAnalysis.politicalKeywords.includes(keyword)) {
          relevanceScore += 0.25; // High boost for political keywords
        }
        
        // Check thematic clusters
        for (const cluster of aiAnalysis.thematicClusters) {
          if (cluster.keywords.includes(keyword)) {
            relevanceScore += cluster.relevance * 0.15; // Boost based on theme relevance
          }
        }
      }

      const source = this.determineKeywordSource(keyword, event);
      const frequency = this.calculateKeywordFrequency(keyword, event);
      const marketIds = this.findKeywordMarkets(keyword, event);

      ranked.push({
        keyword,
        relevanceScore: Math.min(relevanceScore, 1.0), // Cap at 1.0
        source,
        frequency,
        marketIds: marketIds.length > 0 ? marketIds : undefined,
        tagId: this.findTagId(keyword, event.tags)
      });
    }

    // Sort by relevance score (highest first) and limit to top 10
    return ranked
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
  }

  /**
   * Filter keywords by political relevance
   * Enhanced implementation for Requirement 3.5: Political relevance filtering
   */
  filterKeywordsByPoliticalRelevance(keywords: string[]): string[] {
    const politicalKeywords: string[] = [];
    const politicalScores = new Map<string, number>();

    for (const keyword of keywords) {
      const score = this.calculatePoliticalRelevanceScore(keyword);
      if (score > 0.3) { // Threshold for political relevance
        politicalKeywords.push(keyword);
        politicalScores.set(keyword, score);
      }
    }

    // Sort by political relevance score
    return politicalKeywords.sort((a, b) => {
      const scoreA = politicalScores.get(a) || 0;
      const scoreB = politicalScores.get(b) || 0;
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate comprehensive political relevance score for a keyword
   */
  private calculatePoliticalRelevanceScore(keyword: string): number {
    const lowerKeyword = keyword.toLowerCase();
    let score = 0;

    // Direct match with political keywords
    if (this.politicalKeywords.has(lowerKeyword)) {
      score += 1.0;
    }

    // Partial match with political keywords
    for (const politicalTerm of this.politicalKeywords) {
      if (lowerKeyword.includes(politicalTerm) || politicalTerm.includes(lowerKeyword)) {
        score += 0.7;
        break;
      }
    }

    // Check for political context patterns
    score += this.checkPoliticalContextPatterns(lowerKeyword);

    // Check for government/institutional terms
    score += this.checkGovernmentTerms(lowerKeyword);

    // Check for electoral process terms
    score += this.checkElectoralTerms(lowerKeyword);

    return Math.min(score, 1.0);
  }

  /**
   * Check for political context patterns in keywords
   */
  private checkPoliticalContextPatterns(keyword: string): number {
    const politicalPatterns = [
      /\b(win|lose|lead|trail|ahead|behind)\b.*\b(election|race|campaign)\b/,
      /\b(support|oppose|endorse|back)\b.*\b(candidate|policy|bill)\b/,
      /\b(democrat|republican|liberal|conservative)\b.*\b(party|candidate|voter)\b/,
      /\b(poll|survey|approval|rating)\b.*\b(president|congress|governor)\b/,
      /\b(debate|speech|rally|convention)\b/,
      /\b(primary|general|midterm|presidential)\b.*\b(election|race)\b/
    ];

    for (const pattern of politicalPatterns) {
      if (pattern.test(keyword)) {
        return 0.5;
      }
    }

    return 0;
  }

  /**
   * Check for government and institutional terms
   */
  private checkGovernmentTerms(keyword: string): number {
    const governmentTerms = [
      'federal', 'state', 'local', 'municipal', 'county', 'city',
      'department', 'agency', 'bureau', 'commission', 'committee',
      'administration', 'cabinet', 'staff', 'advisor', 'secretary',
      'minister', 'official', 'representative', 'delegate', 'ambassador'
    ];

    for (const term of governmentTerms) {
      if (keyword.includes(term)) {
        return 0.4;
      }
    }

    return 0;
  }

  /**
   * Check for electoral process terms
   */
  private checkElectoralTerms(keyword: string): number {
    const electoralTerms = [
      'ballot', 'voting', 'voter', 'turnout', 'registration', 'absentee',
      'polling', 'precinct', 'district', 'constituency', 'electorate',
      'campaign', 'fundraising', 'donation', 'pac', 'super pac',
      'primary', 'caucus', 'convention', 'nomination', 'endorsement',
      'debate', 'town hall', 'rally', 'stump', 'canvassing'
    ];

    for (const term of electoralTerms) {
      if (keyword.includes(term)) {
        return 0.6;
      }
    }

    return 0;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private extractKeywordsFromText(text: string, sourceType: string): string[] {
    if (!text || text.trim().length === 0) return [];

    logger.debug(`Extracting keywords from ${sourceType}: ${text.substring(0, 100)}...`);

    const keywords: string[] = [];

    // Extract proper names (capitalized words)
    const properNames = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    keywords.push(...properNames.map(name => name.toLowerCase()));

    // Extract acronyms
    const acronyms = text.match(/\b[A-Z]{2,}\b/g) || [];
    keywords.push(...acronyms.map(acronym => acronym.toLowerCase()));

    // Extract quoted phrases
    const quotedPhrases = text.match(/"([^"]+)"/g) || [];
    keywords.push(...quotedPhrases.map(phrase => phrase.replace(/"/g, '').toLowerCase()));

    // Extract significant words (length > 3, not stop words)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.stopWords.has(word));
    keywords.push(...words);

    return this.deduplicateAndFilter(keywords);
  }

  private extractOutcomeKeywords(outcomes: string): string[] {
    try {
      const outcomeArray = JSON.parse(outcomes) as string[];
      return outcomeArray.flatMap(outcome => 
        this.extractKeywordsFromText(outcome, 'market_outcome')
      );
    } catch {
      // If outcomes is not valid JSON, treat as plain text
      return this.extractKeywordsFromText(outcomes, 'market_outcome');
    }
  }

  private extractConceptsFromText(text: string, source: ConceptKeywords['source']): ConceptKeywords[] {
    const concepts: ConceptKeywords[] = [];
    
    // Extract noun phrases (simple heuristic)
    const nounPhrases = text.match(/\b[A-Z][a-z]+(?:\s+[a-z]+)*\b/g) || [];
    
    for (const phrase of nounPhrases) {
      if (phrase.length > 5) { // Only consider longer phrases
        concepts.push({
          concept: phrase,
          keywords: phrase.toLowerCase().split(/\s+/),
          source,
          confidence: 0.7
        });
      }
    }

    return concepts;
  }

  private identifyMarketPatterns(markets: PolymarketMarket[]): ConceptKeywords[] {
    const patterns: ConceptKeywords[] = [];
    
    // Look for common question patterns
    const questionPatterns = new Map<string, number>();
    
    for (const market of markets) {
      // Extract question structure patterns
      const questionWords = market.question.toLowerCase().split(/\s+/).slice(0, 3);
      const pattern = questionWords.join(' ');
      questionPatterns.set(pattern, (questionPatterns.get(pattern) || 0) + 1);
    }

    // Add patterns that appear in multiple markets
    for (const [pattern, count] of questionPatterns) {
      if (count >= 2) {
        patterns.push({
          concept: `Question Pattern: ${pattern}`,
          keywords: pattern.split(/\s+/),
          source: 'market_pattern',
          confidence: Math.min(count / markets.length, 1.0)
        });
      }
    }

    return patterns;
  }

  private generateDerivedKeywords(baseKeywords: string[]): string[] {
    const derived: string[] = [];

    for (const keyword of baseKeywords) {
      // Add plural/singular variations
      if (keyword.endsWith('s') && keyword.length > 4) {
        derived.push(keyword.slice(0, -1)); // Remove 's'
      } else if (!keyword.endsWith('s')) {
        derived.push(keyword + 's'); // Add 's'
      }

      // Add common political variations
      if (keyword === 'elect') derived.push('election', 'electoral');
      if (keyword === 'vote') derived.push('voting', 'voter');
      if (keyword === 'politic') derived.push('political', 'politics');
    }

    return this.deduplicateAndFilter(derived);
  }

  private calculateKeywordRelevance(keyword: string, event: PolymarketEvent): number {
    let score = 0;

    // Higher score for event tags
    if (event.tags.some(tag => tag.label.toLowerCase().includes(keyword))) {
      score += 0.4;
    }

    // Medium score for event title
    if (event.title.toLowerCase().includes(keyword)) {
      score += 0.3;
    }

    // Lower score for event description
    if (event.description.toLowerCase().includes(keyword)) {
      score += 0.2;
    }

    // Score for market presence
    const marketCount = event.markets.filter(market => 
      market.question.toLowerCase().includes(keyword)
    ).length;
    score += (marketCount / event.markets.length) * 0.3;

    // Bonus for political relevance
    if (this.isPoliticallyRelevant(keyword)) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private determineKeywordSource(keyword: string, event: PolymarketEvent): RankedKeyword['source'] {
    if (event.tags.some(tag => tag.label.toLowerCase().includes(keyword))) {
      return 'event_tag';
    }
    if (event.title.toLowerCase().includes(keyword)) {
      return 'event_title';
    }
    if (event.description.toLowerCase().includes(keyword)) {
      return 'event_description';
    }
    if (event.markets.some(market => market.question.toLowerCase().includes(keyword))) {
      return 'market_question';
    }
    return 'derived';
  }

  private calculateKeywordFrequency(keyword: string, event: PolymarketEvent): number {
    let frequency = 0;

    // Count in event data
    frequency += (event.title.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
    frequency += (event.description.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;

    // Count in markets
    for (const market of event.markets) {
      frequency += (market.question.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
      if (market.description) {
        frequency += (market.description.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
      }
    }

    return frequency;
  }

  private findKeywordMarkets(keyword: string, event: PolymarketEvent): string[] {
    return event.markets
      .filter(market => market.question.toLowerCase().includes(keyword))
      .map(market => market.id);
  }

  private findTagId(keyword: string, tags: PolymarketTag[]): number | undefined {
    const tag = tags.find(tag => tag.label.toLowerCase().includes(keyword));
    return tag?.id;
  }

  private isPoliticallyRelevant(keyword: string): boolean {
    // Check if keyword contains political terms
    for (const politicalTerm of this.politicalKeywords) {
      if (keyword.includes(politicalTerm) || politicalTerm.includes(keyword)) {
        return true;
      }
    }
    return false;
  }

  private deduplicateAndFilter(keywords: string[]): string[] {
    return [...new Set(keywords)]
      .filter(keyword => keyword.length > 2 && !this.stopWords.has(keyword))
      .slice(0, 20); // Limit to top 20 per source
  }
}