/**
 * Core data models for the Market Intelligence Engine
 *
 * This module defines all TypeScript interfaces and types used throughout
 * the multi-agent debate protocol.
 */

// ============================================================================
// Result Type for Error Handling
// ============================================================================

/**
 * Result type for functional error handling
 * Represents either a success (Ok) or failure (Err)
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// ============================================================================
// Polymarket Event-Based Data Models
// ============================================================================

/**
 * Polymarket Tag - represents event categorization and filtering
 */
export interface PolymarketTag {
  id: number;
  label: string;
  slug: string;
  forceShow?: boolean;
  forceHide?: boolean;
  publishedAt?: string;
  updatedBy?: number;
  createdAt: string;
  updatedAt: string;
  isCarousel?: boolean;
  requiresTranslation: boolean;
}

/**
 * Polymarket Market - individual market within an event
 */
export interface PolymarketMarket {
  // Core Market Data
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description: string;
  resolutionSource: string;
  
  // Market Status
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  
  // Financial Data
  liquidity?: string;
  liquidityNum?: number;
  volume: string;
  volumeNum: number;
  volume24hr?: number;
  volume1wk?: number;
  volume1mo?: number;
  volume1yr?: number;
  
  // Pricing Data
  outcomes: string;  // JSON array as string
  outcomePrices: string;  // JSON array as string
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  
  // Price Changes
  oneDayPriceChange?: number;
  oneHourPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
  oneYearPriceChange?: number;
  
  // Market Quality Metrics
  competitive?: number;
  
  // Temporal Data
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  closedTime?: string;
  
  // Market Maker and Trading
  marketMakerAddress: string;
  submitted_by: string;
  resolvedBy?: string;
  
  // Group/Series Information (for event context)
  groupItemTitle?: string;
  groupItemThreshold?: string;
  
  // UMA Resolution
  questionID?: string;
  umaEndDate?: string;
  umaResolutionStatus?: string;
  umaResolutionStatuses?: string;
  umaBond?: string;
  umaReward?: string;
  
  // Trading Configuration
  enableOrderBook: boolean;
  orderPriceMinTickSize?: number;
  orderMinSize?: number;
  acceptingOrders?: boolean;
  acceptingOrdersTimestamp?: string;
  
  // CLOB Token Information
  clobTokenIds?: string;
  liquidityClob?: number;
  volumeClob?: number;
  volume24hrClob?: number;
  volume1wkClob?: number;
  volume1moClob?: number;
  volume1yrClob?: number;
  
  // Additional Configuration
  customLiveness?: number;
  negRisk: boolean;
  negRiskRequestID?: string;
  negRiskMarketID?: string;
  ready: boolean;
  funded: boolean;
  cyom: boolean;
  pagerDutyNotificationEnabled: boolean;
  approved: boolean;
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
  automaticallyResolved?: boolean;
  automaticallyActive: boolean;
  clearBookOnStart: boolean;
  seriesColor: string;
  showGmpSeries: boolean;
  showGmpOutcome: boolean;
  manualActivation: boolean;
  negRiskOther: boolean;
  pendingDeployment: boolean;
  deploying: boolean;
  deployingTimestamp?: string;
  rfqEnabled: boolean;
  holdingRewardsEnabled: boolean;
  feesEnabled: boolean;
  requiresTranslation: boolean;
  
  // Visual Elements
  image?: string;
  icon?: string;
  
  // Date Helpers
  endDateIso?: string;
  startDateIso?: string;
  hasReviewedDates?: boolean;
}

/**
 * Polymarket Event - contains multiple related markets with shared context
 */
export interface PolymarketEvent {
  // Core Event Data
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  resolutionSource: string;
  
  // Event Status
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  
  // Temporal Data
  startDate: string;
  creationDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  
  // Event Metrics (aggregated from all markets)
  liquidity: number;
  volume: number;
  openInterest: number;
  competitive: number;
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  volume1yr: number;
  
  // Event Configuration
  enableOrderBook: boolean;
  liquidityClob: number;
  negRisk: boolean;
  negRiskMarketID?: string;
  commentCount: number;
  
  // Visual Elements
  image?: string;
  icon?: string;
  
  // Nested Markets (key difference from individual market approach)
  markets: PolymarketMarket[];
  
  // Event Tags and Classification
  tags: PolymarketTag[];
  
  // Event-Specific Configuration
  cyom: boolean;
  showAllOutcomes: boolean;
  showMarketImages: boolean;
  enableNegRisk: boolean;
  automaticallyActive: boolean;
  gmpChartMode: string;
  negRiskAugmented: boolean;
  cumulativeMarkets: boolean;
  pendingDeployment: boolean;
  deploying: boolean;
  requiresTranslation: boolean;
}

/**
 * Event Discovery Options for API queries
 */
export interface EventDiscoveryOptions {
  tagId?: number;
  relatedTags?: boolean;
  active?: boolean;
  closed?: boolean;
  limit?: number;
  offset?: number;
  startDateMin?: string;
  startDateMax?: string;
  endDateMin?: string;
  endDateMax?: string;
  sortBy?: 'volume24hr' | 'liquidity' | 'competitive' | 'createdAt' | 'id' | 'marketCount' | 'totalVolume';
  sortOrder?: 'asc' | 'desc';
  archived?: boolean;
  featured?: boolean;
  order?: string;
  ascending?: boolean;
  minMarkets?: number;
  maxMarkets?: number;
}

/**
 * Event with enhanced analysis data
 */
export interface EventWithMarkets {
  event: PolymarketEvent;
  markets: PolymarketMarket[];
  crossMarketCorrelations: MarketCorrelation[];
  eventLevelMetrics: EventMetrics;
}

/**
 * Market correlation analysis
 */
export interface MarketCorrelation {
  market1Id: string;
  market2Id: string;
  correlationCoefficient: number;
  correlationType: 'positive' | 'negative' | 'neutral';
}

/**
 * Event-level aggregated metrics
 */
export interface EventMetrics {
  totalVolume: number;
  totalLiquidity: number;
  averageCompetitive: number;
  marketCount: number;
  activeMarketCount: number;
  volumeDistribution: MarketVolumeDistribution[];
  priceCorrelations: MarketCorrelation[];
}

/**
 * Market volume distribution within an event
 */
export interface MarketVolumeDistribution {
  marketId: string;
  volumePercentage: number;
  liquidityPercentage: number;
}

/**
 * Event-based keywords extracted from event and market data
 */
export interface EventKeywords {
  eventLevel: string[];      // From event title, description, tags
  marketLevel: string[];     // From all constituent markets
  combined: string[];        // Merged and deduplicated
  themes: ThemeKeywords[];   // Cross-market themes
  concepts: ConceptKeywords[]; // Event-level concepts
  ranked: RankedKeyword[];
}

/**
 * Keywords grouped by theme across markets
 */
export interface ThemeKeywords {
  theme: string;
  keywords: string[];
  marketIds: string[];    // Markets that share this theme
  relevanceScore: number;
}

/**
 * Conceptual keywords derived from event analysis
 */
export interface ConceptKeywords {
  concept: string;
  keywords: string[];
  source: 'event_title' | 'event_description' | 'event_tags' | 'market_pattern';
  confidence: number;
}

/**
 * Ranked keyword with relevance scoring
 */
export interface RankedKeyword {
  keyword: string;
  relevanceScore: number;
  source: 'event_tag' | 'event_title' | 'event_description' | 'market_question' | 'market_outcome' | 'derived';
  tagId?: number;
  marketIds?: string[];   // Markets where this keyword appears
  frequency: number;      // How often it appears across markets
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Errors that can occur during market data ingestion
 */
export type IngestionError =
  | { type: 'API_UNAVAILABLE'; message: string }
  | { type: 'RATE_LIMIT_EXCEEDED'; retryAfter: number }
  | { type: 'INVALID_MARKET_ID'; marketId: MarketId }
  | { type: 'INVALID_EVENT_ID'; eventId: string }
  | { type: 'VALIDATION_FAILED'; field: string; reason: string };

/**
 * Errors that can occur during agent execution
 */
export type AgentError =
  | { type: 'TIMEOUT'; agentName: string; timeoutMs: number }
  | { type: 'EXECUTION_FAILED'; agentName: string; error: Error; fallbackRecommended?: boolean };

/**
 * Errors that can occur during recommendation generation
 */
export type RecommendationError =
  | { type: 'INSUFFICIENT_DATA'; reason: string }
  | { type: 'CONSENSUS_FAILED'; reason: string }
  | { type: 'NO_EDGE'; edge: number };

// ============================================================================
// Market Briefing Document (MBD) - Enhanced for Event-Based Analysis
// ============================================================================

/**
 * Event type classification for prediction markets
 */
export type EventType =
  | 'election'
  | 'policy'
  | 'court'
  | 'geopolitical'
  | 'economic'
  | 'other';

/**
 * Volatility regime classification
 */
export type VolatilityRegime = 'low' | 'medium' | 'high';

/**
 * Catalyst event with timing
 */
export interface Catalyst {
  event: string;
  timestamp: number;
}

/**
 * Market ID type - supports both string and number formats
 * String format: for external market identifiers (e.g., Polymarket condition IDs)
 * Number format: for internal numeric market identifiers
 */
export type MarketId = string | number;

/**
 * Enhanced Market Briefing Document - streamlined for single market analysis
 * This is the primary input to all intelligence agents, focused on the core market
 */
export interface MarketBriefingDocument {
  // Core Market Data
  marketId: MarketId;
  conditionId: string;
  eventType: EventType;
  question: string;
  resolutionCriteria: string;
  expiryTimestamp: number;
  currentProbability: number; // Market-implied probability (0-1)
  liquidityScore: number; // 0-10 scale
  bidAskSpread: number; // In cents
  volatilityRegime: VolatilityRegime;
  volume24h: number;
  
  // Essential Event Context (streamlined)
  eventContext?: {
    eventId: string;
    eventTitle: string;
    eventDescription: string;
    totalMarkets: number;
    totalVolume: number;
    totalLiquidity: number;
    marketRank: number; // This market's rank by volume within the event
    relatedMarketCount: number; // Number of closely related markets
  };
  
  // Essential Keywords (focused on this market)
  keywords?: string[];
  
  // Streamlined Metadata
  metadata: StreamlinedEventMetadata;
}

/**
 * Market relationship within an event
 */
export interface MarketRelationship {
  market1: PolymarketMarket;
  market2: PolymarketMarket;
  relationshipType: 'complementary' | 'competitive' | 'independent' | 'correlated';
  strength: number;
  description: string;
}

/**
 * Cross-market opportunity detection
 */
export interface CrossMarketOpportunity {
  type: 'arbitrage' | 'hedge' | 'correlation_play';
  markets: PolymarketMarket[];
  expectedReturn: number;
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Market group for theme-based analysis
 */
export interface MarketGroup {
  theme: string;
  markets: PolymarketMarket[];
  dominantKeywords: string[];
}

/**
 * Enhanced arbitrage opportunity with detailed analysis
 */
export interface ArbitrageAnalysis {
  priceDiscrepancy: number;
  expectedReturn: number;
  riskFactors: string[];
  executionComplexity: 'low' | 'medium' | 'high';
  timeWindow: string;
  liquidityRequirement: number;
}

/**
 * Cross-market correlation analysis result
 */
export interface CorrelationAnalysis {
  correlationCoefficient: number;
  correlationType: 'positive' | 'negative' | 'neutral';
  confidenceLevel: number;
  timeHorizon: string;
  drivingFactors: string[];
}

/**
 * Event-level intelligence integration
 */
export interface EventIntelligence {
  eventLevelInsights: string[];
  crossMarketPatterns: string[];
  riskFactors: string[];
  opportunityAreas: string[];
  marketInteractions: MarketInteraction[];
}

/**
 * Market interaction within an event
 */
export interface MarketInteraction {
  markets: string[]; // Market IDs
  interactionType: 'substitution' | 'complementarity' | 'independence' | 'causality';
  strength: number;
  description: string;
  implications: string[];
}

/**
 * Streamlined metadata for single market analysis
 */
export interface StreamlinedEventMetadata {
  // Original metadata
  ambiguityFlags: string[];
  keyCatalysts: Catalyst[];
  
  // Essential event information
  eventId?: string;
  eventTitle?: string;
  eventDescription?: string;
  
  // Key insights (top 3 most important)
  keyInsights?: string[];
  
  // Primary risk factors (top 3)
  primaryRiskFactors?: string[];
  
  // Best opportunities (top 2)
  topOpportunities?: string[];
  
  // Market position within event
  marketPosition?: {
    volumeRank: number;
    liquidityRank: number;
    competitiveScore: number;
    isDominantMarket: boolean;
  };
}

/**
 * Event-level catalyst
 */
export interface EventCatalyst {
  event: string;
  timestamp: number;
  source: 'polymarket_event' | 'news' | 'market_activity' | 'external';
  impact: 'high' | 'medium' | 'low';
  affectedMarkets: string[];
  eventId?: string;
}

/**
 * Market-specific catalyst
 */
export interface MarketCatalyst {
  marketId: string;
  catalyst: string;
  timestamp: number;
  source: 'market_specific' | 'event_level' | 'external';
  impact: 'high' | 'medium' | 'low';
}

// ============================================================================
// Agent Signal
// ============================================================================

/**
 * Agent signal direction
 */
export type SignalDirection = 'YES' | 'NO' | 'NEUTRAL';

/**
 * Agent Signal - output from individual intelligence agents
 */
export interface AgentSignal {
  agentName: string;
  timestamp: number;
  confidence: number; // 0-1, agent's confidence in its analysis
  direction: SignalDirection;
  fairProbability: number; // Agent's estimate of true probability (0-1)
  keyDrivers: string[]; // Top 3-5 factors influencing the signal
  riskFactors: string[]; // Identified risks or uncertainties
  metadata: Record<string, unknown>; // Agent-specific data
}

// ============================================================================
// Thesis
// ============================================================================

/**
 * Thesis - structured argument for or against a market outcome
 */
export interface Thesis {
  direction: 'YES' | 'NO';
  fairProbability: number;
  marketProbability: number;
  edge: number; // |fairProbability - marketProbability|
  coreArgument: string;
  catalysts: string[];
  failureConditions: string[];
  supportingSignals: string[]; // Agent names that support this thesis
}

// ============================================================================
// Debate Record
// ============================================================================

/**
 * Test type for cross-examination
 */
export type DebateTestType =
  | 'evidence'
  | 'causality'
  | 'timing'
  | 'liquidity'
  | 'tail-risk';

/**
 * Outcome of a debate test
 */
export type DebateTestOutcome = 'survived' | 'weakened' | 'refuted';

/**
 * Individual debate test result
 */
export interface DebateTest {
  testType: DebateTestType;
  claim: string;
  challenge: string;
  outcome: DebateTestOutcome;
  score: number; // -1 to 1
}

/**
 * Debate Record - result of cross-examination between theses
 */
export interface DebateRecord {
  tests: DebateTest[];
  bullScore: number; // Aggregate score for bull thesis
  bearScore: number; // Aggregate score for bear thesis
  keyDisagreements: string[];
}

// ============================================================================
// Consensus Probability
// ============================================================================

/**
 * Probability regime classification
 */
export type ProbabilityRegime =
  | 'high-confidence'
  | 'moderate-confidence'
  | 'high-uncertainty';

/**
 * Consensus Probability - final probability estimate with uncertainty
 */
export interface ConsensusProbability {
  consensusProbability: number; // 0-1
  confidenceBand: [number, number]; // [lower, upper]
  disagreementIndex: number; // 0-1, higher = more agent disagreement
  regime: ProbabilityRegime;
  contributingSignals: string[]; // Agent names
}

// ============================================================================
// Trade Recommendation
// ============================================================================

/**
 * Trade action
 */
export type TradeAction = 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';

/**
 * Liquidity risk level
 */
export type LiquidityRisk = 'low' | 'medium' | 'high';

/**
 * Trade recommendation explanation
 */
export interface TradeExplanation {
  summary: string; // 2-3 sentence plain language explanation
  coreThesis: string;
  keyCatalysts: string[];
  failureScenarios: string[];
  uncertaintyNote?: string; // Present if disagreementIndex > 0.15
  riskPerspectives?: string; // Risk philosophy perspectives on position sizing and risk management
}

/**
 * Trade recommendation metadata
 */
export interface TradeMetadata {
  consensusProbability: number;
  marketProbability: number;
  edge: number;
  confidenceBand: [number, number];
}

/**
 * Trade Recommendation - final actionable output
 */
export interface TradeRecommendation {
  marketId: MarketId;
  action: TradeAction;
  entryZone: [number, number]; // [min, max] price
  targetZone: [number, number];
  stopLoss: number; // Stop-loss price below entry zone for risk management
  expectedValue: number; // In dollars per $100 invested
  winProbability: number;
  liquidityRisk: LiquidityRisk;
  explanation: TradeExplanation;
  metadata: TradeMetadata;
}

// ============================================================================
// Audit Trail
// ============================================================================

/**
 * Audit log entry for pipeline stage
 */
export interface AuditEntry {
  stage: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Complete audit trail for a market analysis
 */
export interface AuditTrail {
  marketId: MarketId;
  timestamp: number;
  stages: Array<{
    name: string;
    timestamp: number;
    duration: number;
    data: unknown;
    errors?: unknown[];
  }>;
}

// ============================================================================
// Serper API Types (Web Research Agent)
// ============================================================================

/**
 * Serper search result
 */
export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position: number;
}

/**
 * Serper scrape result
 */
export interface SerperScrapeResult {
  url: string;
  title?: string;
  text?: string;
  metadata?: {
    description?: string;
    keywords?: string;
    author?: string;
    publishedDate?: string;
  };
}

/**
 * Web Research configuration
 */
export interface WebResearchConfig {
  enabled: boolean;
  maxToolCalls: number;
  timeout: number;
}

/**
 * Serper API configuration
 */
export interface SerperConfig {
  apiKey: string;
  searchUrl?: string;
  scrapeUrl?: string;
  timeout?: number;
}
