/**
 * Zod schemas for structured LLM outputs
 *
 * These schemas are used with LangChain's withStructuredOutput() to ensure
 * type-safe LLM responses that conform to our data models.
 */

import { z } from 'zod';

// ============================================================================
// Agent Signal Schema
// ============================================================================

/**
 * Zod schema for LLM output (without agentName and timestamp which are added by the node)
 * Used by intelligence agents to validate LLM structured output
 */
export const AgentSignalLLMOutputSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

/**
 * Zod schema for AgentSignal
 * Used by intelligence agents to structure their analysis output
 */
export const AgentSignalSchema = z.object({
  agentName: z.string(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

// ============================================================================
// Thesis Schema
// ============================================================================

/**
 * Zod schema for Thesis
 * Used by thesis construction node to structure bull/bear arguments
 */
export const ThesisSchema = z.object({
  direction: z.enum(['YES', 'NO']),
  fairProbability: z.number().min(0).max(1),
  marketProbability: z.number().min(0).max(1),
  edge: z.number().min(0).max(1),
  coreArgument: z.string().min(10),
  catalysts: z.array(z.string()),
  failureConditions: z.array(z.string()),
  supportingSignals: z.array(z.string()),
});

// ============================================================================
// Debate Test Schema
// ============================================================================

/**
 * Zod schema for individual debate test
 */
export const DebateTestSchema = z.object({
  testType: z.enum(['evidence', 'causality', 'timing', 'liquidity', 'tail-risk']),
  claim: z.string(),
  challenge: z.string(),
  outcome: z.enum(['survived', 'weakened', 'refuted']),
  score: z.number().min(-1).max(1),
});

/**
 * Zod schema for DebateRecord
 * Used by cross-examination node to structure debate results
 */
export const DebateRecordSchema = z.object({
  tests: z.array(DebateTestSchema),
  bullScore: z.number(),
  bearScore: z.number(),
  keyDisagreements: z.array(z.string()),
});

// ============================================================================
// Consensus Probability Schema
// ============================================================================

/**
 * Zod schema for ConsensusProbability
 * Used by consensus engine to structure final probability estimate
 */
export const ConsensusProbabilitySchema = z.object({
  consensusProbability: z.number().min(0).max(1),
  confidenceBand: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  disagreementIndex: z.number().min(0).max(1),
  regime: z.enum(['high-confidence', 'moderate-confidence', 'high-uncertainty']),
  contributingSignals: z.array(z.string()),
});

// ============================================================================
// Trade Recommendation Schema
// ============================================================================

/**
 * Zod schema for TradeExplanation
 */
export const TradeExplanationSchema = z.object({
  summary: z.string().min(20),
  coreThesis: z.string().min(10),
  keyCatalysts: z.array(z.string()),
  failureScenarios: z.array(z.string()),
  uncertaintyNote: z.string().optional(),
});

/**
 * Zod schema for TradeMetadata
 */
export const TradeMetadataSchema = z.object({
  consensusProbability: z.number().min(0).max(1),
  marketProbability: z.number().min(0).max(1),
  edge: z.number().min(0).max(1),
  confidenceBand: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
});

/**
 * Zod schema for TradeRecommendation
 * Used by recommendation generator to structure final output
 */
export const TradeRecommendationSchema = z.object({
  marketId: z.union([z.string(), z.number()]),
  action: z.enum(['LONG_YES', 'LONG_NO', 'NO_TRADE']),
  entryZone: z.tuple([z.number(), z.number()]),
  targetZone: z.tuple([z.number(), z.number()]),
  expectedValue: z.number(),
  winProbability: z.number().min(0).max(1),
  liquidityRisk: z.enum(['low', 'medium', 'high']),
  explanation: TradeExplanationSchema,
  metadata: TradeMetadataSchema,
});

// ============================================================================
// Market Briefing Document Schema
// ============================================================================

/**
 * Zod schema for Catalyst
 */
export const CatalystSchema = z.object({
  event: z.string(),
  timestamp: z.number(),
});

/**
 * Zod schema for MarketBriefingDocument (streamlined)
 * Used to validate market data after ingestion
 */
export const MarketBriefingDocumentSchema = z.object({
  marketId: z.union([z.string(), z.number()]),
  conditionId: z.string(),
  eventType: z.enum(['election', 'policy', 'court', 'geopolitical', 'economic', 'other']),
  question: z.string().min(10),
  resolutionCriteria: z.string().min(10),
  expiryTimestamp: z.number().positive(),
  currentProbability: z.number().min(0).max(1),
  liquidityScore: z.number().min(0).max(10),
  bidAskSpread: z.number().min(0),
  volatilityRegime: z.enum(['low', 'medium', 'high']),
  volume24h: z.number().min(0),
  
  // Essential event context (optional)
  eventContext: z.object({
    eventId: z.string(),
    eventTitle: z.string(),
    eventDescription: z.string(),
    totalMarkets: z.number().min(1),
    totalVolume: z.number().min(0),
    totalLiquidity: z.number().min(0),
    marketRank: z.number().min(1),
    relatedMarketCount: z.number().min(0),
  }).optional(),
  
  // Focused keywords (optional)
  keywords: z.array(z.string()).optional(),
  
  // Streamlined metadata
  metadata: z.object({
    ambiguityFlags: z.array(z.string()),
    keyCatalysts: z.array(CatalystSchema),
    eventId: z.string().optional(),
    eventTitle: z.string().optional(),
    eventDescription: z.string().optional(),
    keyInsights: z.array(z.string()).optional(),
    primaryRiskFactors: z.array(z.string()).optional(),
    topOpportunities: z.array(z.string()).optional(),
    marketPosition: z.object({
      volumeRank: z.number().min(1),
      liquidityRank: z.number().min(1),
      competitiveScore: z.number().min(0).max(1),
      isDominantMarket: z.boolean(),
    }).optional(),
  }),
});

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validate a Market Briefing Document
 */
export function validateMBD(mbd: unknown): { isValid: boolean; error?: string } {
  try {
    MarketBriefingDocumentSchema.parse(mbd);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.issues[0].message };
    }
    return { isValid: false, error: 'Unknown validation error' };
  }
}

/**
 * Validate an Agent Signal
 */
export function validateAgentSignal(signal: unknown): { isValid: boolean; error?: string } {
  try {
    AgentSignalSchema.parse(signal);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.issues[0].message };
    }
    return { isValid: false, error: 'Unknown validation error' };
  }
}

/**
 * Validate a Thesis
 */
export function validateThesis(thesis: unknown): { isValid: boolean; error?: string } {
  try {
    ThesisSchema.parse(thesis);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.issues[0].message };
    }
    return { isValid: false, error: 'Unknown validation error' };
  }
}

/**
 * Validate a Trade Recommendation
 */
export function validateTradeRecommendation(
  recommendation: unknown
): { isValid: boolean; error?: string } {
  try {
    TradeRecommendationSchema.parse(recommendation);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.issues[0].message };
    }
    return { isValid: false, error: 'Unknown validation error' };
  }
}
