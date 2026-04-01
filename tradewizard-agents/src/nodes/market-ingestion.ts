/**
 * Market Ingestion Node
 *
 * This LangGraph node fetches market data from Polymarket and transforms it
 * into a Market Briefing Document (MBD) for agent consumption.
 */

import type { GraphStateType } from '../models/state.js';
import type { PolymarketClient } from '../utils/polymarket-client.js';
import type { MarketBriefingDocument, VolatilityRegime } from '../models/types.js';
import { MarketBriefingDocumentSchema } from '../models/schemas.js';

/**
 * Market Ingestion Node
 *
 * Reads conditionId from state, fetches market data from Polymarket,
 * transforms it into an MBD with enhanced event-based analysis, and writes to state.
 * Implements Requirements 5.1, 5.2, 5.3 for event-based market briefing generation.
 *
 * @param state - Current graph state
 * @param polymarketClient - Polymarket API client instance
 * @param useEventAnalysis - Whether to use enhanced event-based analysis (default: true)
 * @returns Partial state update with MBD or ingestionError
 */
export async function marketIngestionNode(
  state: GraphStateType,
  polymarketClient: PolymarketClient,
  useEventAnalysis: boolean = true
): Promise<Partial<GraphStateType>> {
  const startTime = Date.now();

  try {
    // Fetch market data using enhanced event-based analysis if available
    const result = useEventAnalysis 
      ? await polymarketClient.fetchEnhancedMarketData(state.conditionId, true)
      : await polymarketClient.fetchMarketData(state.conditionId);

    if (!result.ok) {
      // Return ingestion error
      return {
        ingestionError: result.error,
        auditLog: [
          {
            stage: 'market_ingestion',
            timestamp: Date.now(),
            data: {
              conditionId: state.conditionId,
              success: false,
              error: result.error,
              duration: Date.now() - startTime,
              eventAnalysisUsed: useEventAnalysis,
            },
          },
        ],
      };
    }

    const mbd = result.data;

    // Enhance MBD with additional analysis (only if not already enhanced by event analysis)
    const enhancedMBD = mbd.eventContext ? mbd : await enhanceMBD(mbd);
    
    // Ensure currentProbability is a number (fix for schema validation)
    if (typeof enhancedMBD.currentProbability === 'string') {
      enhancedMBD.currentProbability = parseFloat(enhancedMBD.currentProbability);
    }

    // Validate MBD schema
    const validation = MarketBriefingDocumentSchema.safeParse(enhancedMBD);
    if (!validation.success) {
      return {
        ingestionError: {
          type: 'VALIDATION_FAILED',
          field: validation.error.issues[0].path.join('.'),
          reason: validation.error.issues[0].message,
        },
        auditLog: [
          {
            stage: 'market_ingestion',
            timestamp: Date.now(),
            data: {
              conditionId: state.conditionId,
              success: false,
              validationError: validation.error.issues[0].message,
              duration: Date.now() - startTime,
              eventAnalysisUsed: useEventAnalysis,
            },
          },
        ],
      };
    }

    // Return successful MBD with enhanced audit information
    return {
      mbd: enhancedMBD,
      auditLog: [
        {
          stage: 'market_ingestion',
          timestamp: Date.now(),
          data: {
            conditionId: state.conditionId,
            success: true,
            marketId: enhancedMBD.marketId,
            currentProbability: enhancedMBD.currentProbability,
            liquidityScore: enhancedMBD.liquidityScore,
            volatilityRegime: enhancedMBD.volatilityRegime,
            ambiguityFlags: enhancedMBD.metadata.ambiguityFlags,
            duration: Date.now() - startTime,
            eventAnalysisUsed: useEventAnalysis,
            hasEventContext: !!enhancedMBD.eventContext,
            eventId: enhancedMBD.eventContext?.eventId,
            totalMarkets: enhancedMBD.eventContext?.totalMarkets,
            marketRank: enhancedMBD.eventContext?.marketRank,
          },
        },
      ],
    };
  } catch (error) {
    // Catch any unexpected errors
    return {
      ingestionError: {
        type: 'API_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      auditLog: [
        {
          stage: 'market_ingestion',
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
 * Enhance MBD with additional analysis
 *
 * This function adds:
 * - Improved volatility regime calculation
 * - Enhanced ambiguity detection
 *
 * @param mbd - Base Market Briefing Document
 * @returns Enhanced MBD
 */
async function enhanceMBD(mbd: MarketBriefingDocument): Promise<MarketBriefingDocument> {
  // Calculate volatility regime with more sophisticated logic
  const volatilityRegime = calculateVolatilityRegime(mbd);

  // Detect additional ambiguity flags
  const enhancedAmbiguityFlags = detectAmbiguityFlags(mbd);

  return {
    ...mbd,
    volatilityRegime,
    metadata: {
      ...mbd.metadata,
      ambiguityFlags: [...mbd.metadata.ambiguityFlags, ...enhancedAmbiguityFlags],
    },
  };
}

/**
 * Calculate volatility regime from market data
 *
 * Uses multiple factors:
 * - Bid-ask spread (primary indicator)
 * - Liquidity score (secondary indicator)
 * - Current probability (extreme probabilities are more volatile)
 *
 * @param mbd - Market Briefing Document
 * @returns Volatility regime classification
 */
function calculateVolatilityRegime(mbd: MarketBriefingDocument): VolatilityRegime {
  const { bidAskSpread, liquidityScore, currentProbability } = mbd;

  // Calculate volatility score (0-100)
  let volatilityScore = 0;

  // Factor 1: Bid-ask spread (0-40 points)
  // Wide spreads indicate high volatility
  if (bidAskSpread < 2) {
    volatilityScore += 0;
  } else if (bidAskSpread < 5) {
    volatilityScore += 20;
  } else {
    volatilityScore += 40;
  }

  // Factor 2: Liquidity score (0-30 points, inverse)
  // Low liquidity indicates high volatility
  if (liquidityScore >= 7) {
    volatilityScore += 0;
  } else if (liquidityScore >= 4) {
    volatilityScore += 15;
  } else {
    volatilityScore += 30;
  }

  // Factor 3: Probability extremes (0-30 points)
  // Probabilities near 0 or 1 are more volatile
  const distanceFromMiddle = Math.abs(currentProbability - 0.5);
  if (distanceFromMiddle > 0.4) {
    volatilityScore += 30;
  } else if (distanceFromMiddle > 0.3) {
    volatilityScore += 15;
  } else {
    volatilityScore += 0;
  }

  // Classify based on total score
  if (volatilityScore < 30) {
    return 'low';
  } else if (volatilityScore < 60) {
    return 'medium';
  } else {
    return 'high';
  }
}

/**
 * Detect ambiguity in resolution criteria
 *
 * Checks for:
 * - Vague temporal language ("soon", "eventually")
 * - Subjective terms ("significant", "major")
 * - Conditional language ("if", "unless")
 * - Missing specificity ("approximately", "around")
 *
 * @param mbd - Market Briefing Document
 * @returns Array of ambiguity flags
 */
function detectAmbiguityFlags(mbd: MarketBriefingDocument): string[] {
  const flags: string[] = [];
  const { question, resolutionCriteria } = mbd;
  const combinedText = `${question} ${resolutionCriteria}`.toLowerCase();

  // Vague temporal terms
  const temporalTerms = ['soon', 'eventually', 'shortly', 'in the near future', 'imminent'];
  for (const term of temporalTerms) {
    if (combinedText.includes(term)) {
      flags.push(`Vague temporal language: "${term}"`);
    }
  }

  // Subjective quantifiers
  const subjectiveTerms = [
    'significant',
    'major',
    'substantial',
    'considerable',
    'meaningful',
    'notable',
  ];
  for (const term of subjectiveTerms) {
    if (combinedText.includes(term)) {
      flags.push(`Subjective quantifier: "${term}"`);
    }
  }

  // Approximation terms
  const approximationTerms = [
    'approximately',
    'around',
    'roughly',
    'about',
    'nearly',
    'close to',
  ];
  for (const term of approximationTerms) {
    if (combinedText.includes(term)) {
      flags.push(`Approximation term: "${term}"`);
    }
  }

  // Check for missing specific dates
  if (!combinedText.match(/\d{4}/) && !combinedText.match(/\d{1,2}\/\d{1,2}/)) {
    if (
      combinedText.includes('by') ||
      combinedText.includes('before') ||
      combinedText.includes('after')
    ) {
      flags.push('Temporal reference without specific date');
    }
  }

  // Check for conditional resolution
  const conditionalCount = (combinedText.match(/\bif\b/g) || []).length;
  if (conditionalCount > 2) {
    flags.push(`Multiple conditional clauses (${conditionalCount})`);
  }

  return flags;
}

/**
 * Create a market ingestion node with bound Polymarket client
 *
 * This factory function creates a node function that can be added to the LangGraph.
 * Supports both traditional market-only analysis and enhanced event-based analysis.
 *
 * @param polymarketClient - Polymarket API client instance
 * @param useEventAnalysis - Whether to use enhanced event-based analysis (default: true)
 * @returns Node function for LangGraph
 */
export function createMarketIngestionNode(
  polymarketClient: PolymarketClient, 
  useEventAnalysis: boolean = true
) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    return marketIngestionNode(state, polymarketClient, useEventAnalysis);
  };
}

/**
 * Create an enhanced event-based market ingestion node
 * 
 * This is a convenience function that creates a market ingestion node
 * specifically configured for enhanced event-based analysis.
 *
 * @param polymarketClient - Polymarket API client instance
 * @returns Node function for LangGraph with event-based analysis enabled
 */
export function createEnhancedMarketIngestionNode(polymarketClient: PolymarketClient) {
  return createMarketIngestionNode(polymarketClient, true);
}
