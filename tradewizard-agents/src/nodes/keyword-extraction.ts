/**
 * Keyword Extraction Node
 *
 * This LangGraph node extracts keywords from the market data using AI-powered analysis.
 * It operates on the Market Briefing Document and adds keywords to the workflow state.
 */

import type { GraphStateType } from '../models/state.js';
import type { EventKeywords } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';
import { EventMultiMarketKeywordExtractor } from '../utils/event-multi-market-keyword-extractor.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/**
 * Keyword Extraction Node
 *
 * Reads MBD from state, extracts keywords using AI analysis, and writes keywords to state.
 * This node integrates with the workflow's Opik tracing and uses the same market data
 * that other agents analyze.
 *
 * @param state - Current graph state
 * @param config - Engine configuration
 * @param opikHandler - Shared Opik handler for unified tracing
 * @returns Partial state update with keywords or error
 */
export async function keywordExtractionNode(
  state: GraphStateType,
  config: EngineConfig,
  opikHandler?: any
): Promise<Partial<GraphStateType>> {
  const startTime = Date.now();

  try {
    // Check if MBD is available
    if (!state.mbd) {
      return {
        auditLog: [
          {
            stage: 'keyword_extraction',
            timestamp: Date.now(),
            data: {
              conditionId: state.conditionId,
              success: false,
              error: 'No Market Briefing Document available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    // Create keyword extractor with shared Opik handler
    const keywordExtractor = new EventMultiMarketKeywordExtractor(
      config.polymarket.keywordExtractionMode,
      {
        opikHandler,
      }
    );

    // Create a focused event from the MBD for keyword extraction
    // This ensures we extract keywords for the exact market being analyzed
    const focusedEvent = createEventFromMBD(state.mbd);

    // Extract keywords for this specific market
    const keywords = await keywordExtractor.extractKeywordsFromEvent(focusedEvent);

    logger.info({
      conditionId: state.conditionId,
      marketId: state.mbd.marketId,
      keywordCount: keywords.combined.length,
      eventLevel: keywords.eventLevel.length,
      marketLevel: keywords.marketLevel.length,
      themes: keywords.themes.length,
      concepts: keywords.concepts.length,
    }, '[KeywordExtraction] Successfully extracted keywords for market');

    // Return successful keyword extraction
    return {
      marketKeywords: keywords,
      auditLog: [
        {
          stage: 'keyword_extraction',
          timestamp: Date.now(),
          data: {
            conditionId: state.conditionId,
            marketId: state.mbd.marketId,
            success: true,
            keywordCount: keywords.combined.length,
            eventLevelCount: keywords.eventLevel.length,
            marketLevelCount: keywords.marketLevel.length,
            themesCount: keywords.themes.length,
            conceptsCount: keywords.concepts.length,
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  } catch (error) {
    logger.error({
      conditionId: state.conditionId,
      error: error instanceof Error ? error.message : String(error),
    }, '[KeywordExtraction] Failed to extract keywords');

    // Return error state
    return {
      auditLog: [
        {
          stage: 'keyword_extraction',
          timestamp: Date.now(),
          data: {
            conditionId: state.conditionId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  }
}

/**
 * Create a focused event from Market Briefing Document
 *
 * This function converts the MBD back into an event structure that the
 * keyword extractor can process, ensuring we extract keywords for the
 * exact market being analyzed by the workflow.
 *
 * @param mbd - Market Briefing Document
 * @returns Focused event for keyword extraction
 */
function createEventFromMBD(mbd: any): any {
  // Create a focused event containing only the current market
  return {
    id: mbd.eventContext?.eventId || `synthetic-${mbd.marketId}`,
    title: mbd.question, // Use market question as primary focus
    description: mbd.resolutionCriteria || mbd.question,
    slug: mbd.marketSlug || mbd.marketId,
    startDate: new Date().toISOString(),
    endDate: mbd.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    creationDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: mbd.eventContext?.eventTags?.map((tag: string) => ({
      id: Math.random(),
      label: tag,
      slug: tag.toLowerCase().replace(/\s+/g, '-'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      requiresTranslation: false,
    })) || [
      {
        id: 2,
        label: 'Politics',
        slug: 'politics',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        requiresTranslation: false,
      }
    ],
    markets: [
      {
        id: mbd.marketId,
        conditionId: mbd.marketId,
        question: mbd.question,
        description: mbd.resolutionCriteria || '',
        slug: mbd.marketSlug || mbd.marketId,
        outcomes: '["Yes", "No"]',
        outcomePrices: `[${mbd.currentProbability}, ${1 - mbd.currentProbability}]`,
        volume: mbd.volume24h?.toString() || '0',
        volume24hr: mbd.volume24h || 0,
        liquidity: mbd.liquidityScore?.toString() || '0',
        volumeNum: mbd.volume24h || 0,
        liquidityNum: mbd.liquidityScore || 0,
        competitive: 0.5, // Default competitive score
        active: true,
        closed: false,
        archived: false,
        new: false,
        featured: false,
        restricted: false,
        enableOrderBook: true,
        negRisk: false,
        ready: true,
        funded: true,
        cyom: false,
        pagerDutyNotificationEnabled: false,
        approved: true,
        automaticallyActive: true,
        clearBookOnStart: false,
        seriesColor: '#FF0000',
        showGmpSeries: false,
        showGmpOutcome: false,
        manualActivation: false,
        negRiskOther: false,
        pendingDeployment: false,
        deploying: false,
        rfqEnabled: false,
        holdingRewardsEnabled: false,
        feesEnabled: false,
        requiresTranslation: false,
        startDate: new Date().toISOString(),
        endDate: mbd.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolutionSource: mbd.resolutionCriteria || 'Official sources',
        marketMakerAddress: '0x0000000000000000000000000000000000000000',
        submitted_by: 'system',
      }
    ],
    active: true,
    closed: false,
    archived: false,
    new: false,
    featured: false,
    restricted: false,
    enableOrderBook: true,
    liquidity: mbd.liquidityScore || 0,
    volume: mbd.volume24h || 0,
    openInterest: 0,
    competitive: 0.5,
    volume24hr: mbd.volume24h || 0,
    volume1wk: 0,
    volume1mo: 0,
    volume1yr: 0,
    liquidityClob: mbd.liquidityScore || 0,
    negRisk: false,
    commentCount: 0,
    cyom: false,
    showAllOutcomes: true,
    showMarketImages: true,
    enableNegRisk: false,
    automaticallyActive: true,
    gmpChartMode: 'default',
    negRiskAugmented: false,
    cumulativeMarkets: false,
    pendingDeployment: false,
    deploying: false,
    requiresTranslation: false,
    resolutionSource: mbd.resolutionCriteria || 'Official sources',
  };
}

/**
 * Create a keyword extraction node with bound configuration
 *
 * This factory function creates a node function that can be added to the LangGraph.
 * It follows the same pattern as other agent nodes.
 *
 * @param config - Engine configuration
 * @param opikHandler - Shared Opik handler for unified tracing
 * @returns Node function for LangGraph
 */
export function createKeywordExtractionNode(
  config: EngineConfig,
  opikHandler?: any
) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    return keywordExtractionNode(state, config, opikHandler);
  };
}