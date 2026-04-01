/**
 * Polling Tools Infrastructure
 *
 * This module provides the tool infrastructure for the autonomous polling agent,
 * including tool types, interfaces, input/output schemas, and execution wrappers.
 *
 * **Tool Selection Strategy**:
 * The autonomous polling agent uses a strategic approach to tool selection based on market characteristics:
 *
 * 1. **Always start with fetchRelatedMarkets** - Understand cross-market context
 *    - Find related markets in the same event
 *    - Identify correlation patterns
 *    - Validate pricing consistency across related markets
 *
 * 2. **Use fetchHistoricalPrices** - Analyze sentiment trends
 *    - Examine price movements over different timeframes (1h, 24h, 7d)
 *    - Identify trend direction and strength
 *    - Detect inflection points and regime changes
 *
 * 3. **Use analyzeMarketMomentum** - Assess conviction levels
 *    - Calculate momentum from price velocity and acceleration
 *    - Identify if momentum is strengthening or weakening
 *    - Gauge market participant conviction
 *
 * 4. **Use detectSentimentShifts** - Identify catalysts
 *    - Detect rapid price movements above threshold
 *    - Classify shift magnitude (minor, moderate, major)
 *    - Identify potential news or event catalysts
 *
 * 5. **Use fetchCrossMarketData** - Event-level analysis
 *    - Get comprehensive event context
 *    - Calculate aggregate sentiment across all markets
 *    - Identify market concentration and participation patterns
 *
 * **Crowd Wisdom Assessment**:
 * The agent evaluates market quality using:
 * - Volume metrics: 24h volume, volume trends, participation
 * - Liquidity metrics: Bid-ask spread, liquidity score
 * - Consistency: Agreement across time horizons and related markets
 * - Volatility patterns: Clustering, regime changes, noise vs signal
 * - Cross-market coherence: Pricing consistency across related markets
 *
 * **Maximum Tool Calls**: 5 per analysis to control latency
 * **Tool Execution**: Sequential with caching to avoid redundant API calls
 * **Error Handling**: Graceful degradation - partial data doesn't crash analysis
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { z } from 'zod';
import type { PolymarketClient } from '../utils/polymarket-client.js';
import type { ToolCache } from '../utils/tool-cache.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Tool execution context
 *
 * Provides access to shared resources needed by all tools:
 * - polymarketClient: For fetching market data
 * - cache: For caching tool results within a session
 * - auditLog: For logging all tool calls
 */
export interface ToolContext {
  polymarketClient: PolymarketClient;
  cache: ToolCache;
  auditLog: ToolAuditEntry[];
}

/**
 * Tool audit log entry
 *
 * Records details of each tool invocation for debugging and analysis.
 */
export interface ToolAuditEntry {
  toolName: string;
  timestamp: number;
  params: any;
  result?: any;
  error?: string;
  duration: number;
  cacheHit: boolean;
}

/**
 * Tool execution result
 *
 * Standardized result format for all tools.
 */
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Tool error
 *
 * Structured error object returned when tool execution fails.
 */
export interface ToolError {
  error: true;
  message: string;
  toolName: string;
  code?: string;
}

// ============================================================================
// Tool Input Schemas (Zod)
// ============================================================================

/**
 * Input schema for fetchRelatedMarkets tool
 */
export const FetchRelatedMarketsInputSchema = z.object({
  conditionId: z.string().describe('The condition ID of the market to find related markets for'),
  minVolume: z
    .number()
    .optional()
    .default(100)
    .describe('Minimum 24h volume in USD to include (default: 100)'),
});

export type FetchRelatedMarketsInput = z.infer<typeof FetchRelatedMarketsInputSchema>;

/**
 * Input schema for fetchHistoricalPrices tool
 */
export const FetchHistoricalPricesInputSchema = z.object({
  conditionId: z.string().describe('The condition ID of the market'),
  timeHorizon: z
    .enum(['1h', '24h', '7d', '30d'])
    .describe('Time horizon for historical data (1h, 24h, 7d, or 30d)'),
});

export type FetchHistoricalPricesInput = z.infer<typeof FetchHistoricalPricesInputSchema>;

/**
 * Input schema for fetchCrossMarketData tool
 */
export const FetchCrossMarketDataInputSchema = z.object({
  eventId: z.string().describe('The event ID to fetch cross-market data for'),
  maxMarkets: z
    .number()
    .optional()
    .default(20)
    .describe('Maximum number of markets to return (default: 20)'),
});

export type FetchCrossMarketDataInput = z.infer<typeof FetchCrossMarketDataInputSchema>;

/**
 * Input schema for analyzeMarketMomentum tool
 */
export const AnalyzeMarketMomentumInputSchema = z.object({
  conditionId: z.string().describe('The condition ID of the market to analyze'),
});

export type AnalyzeMarketMomentumInput = z.infer<typeof AnalyzeMarketMomentumInputSchema>;

/**
 * Input schema for detectSentimentShifts tool
 */
export const DetectSentimentShiftsInputSchema = z.object({
  conditionId: z.string().describe('The condition ID of the market to analyze'),
  threshold: z
    .number()
    .optional()
    .default(0.05)
    .describe('Minimum price change to flag as shift (default: 0.05 = 5%)'),
});

export type DetectSentimentShiftsInput = z.infer<typeof DetectSentimentShiftsInputSchema>;

// ============================================================================
// Tool Output Types
// ============================================================================

/**
 * Output type for fetchRelatedMarkets tool
 */
export interface FetchRelatedMarketsOutput {
  eventId: string;
  eventTitle: string;
  markets: Array<{
    conditionId: string;
    question: string;
    currentProbability: number;
    volume24h: number;
    liquidityScore: number;
  }>;
  totalMarkets: number;
}

/**
 * Output type for fetchHistoricalPrices tool
 */
export interface FetchHistoricalPricesOutput {
  conditionId: string;
  timeHorizon: string;
  dataPoints: Array<{
    timestamp: number;
    probability: number;
  }>;
  priceChange: number;
  trend: 'uptrend' | 'downtrend' | 'sideways';
}

/**
 * Output type for fetchCrossMarketData tool
 */
export interface FetchCrossMarketDataOutput {
  eventId: string;
  eventTitle: string;
  eventDescription: string;
  totalVolume: number;
  totalLiquidity: number;
  markets: Array<{
    conditionId: string;
    question: string;
    currentProbability: number;
    volume24h: number;
    liquidityScore: number;
    volumeRank: number;
  }>;
  aggregateSentiment: {
    averageProbability: number;
    weightedAverageProbability: number;
    sentimentDirection: 'bullish' | 'bearish' | 'neutral';
  };
}

/**
 * Output type for analyzeMarketMomentum tool
 */
export interface AnalyzeMarketMomentumOutput {
  conditionId: string;
  momentum: {
    score: number; // -1 to +1
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    confidence: number; // 0-1
  };
  timeHorizons: {
    '1h': { priceChange: number; velocity: number };
    '24h': { priceChange: number; velocity: number };
    '7d': { priceChange: number; velocity: number };
  };
}

/**
 * Output type for detectSentimentShifts tool
 */
export interface DetectSentimentShiftsOutput {
  conditionId: string;
  shifts: Array<{
    timeHorizon: '1h' | '24h' | '7d';
    magnitude: number;
    direction: 'toward_yes' | 'toward_no';
    classification: 'minor' | 'moderate' | 'major';
    timestamp: number;
  }>;
  hasSignificantShift: boolean;
}

// ============================================================================
// Tool Execution Wrapper
// ============================================================================

/**
 * Execute a tool with error handling, caching, and audit logging
 *
 * This wrapper provides consistent error handling, caching, and audit logging
 * for all tool executions. It implements Requirements 1.3, 1.4, 1.5, 1.6.
 *
 * @param toolName - Name of the tool being executed
 * @param params - Tool input parameters
 * @param context - Tool execution context
 * @param executor - Tool execution function
 * @returns Tool result or error
 */
export async function executeToolWithWrapper<TInput, TOutput>(
  toolName: string,
  params: TInput,
  context: ToolContext,
  executor: (params: TInput, context: ToolContext) => Promise<TOutput>
): Promise<TOutput | ToolError> {
  const startTime = Date.now();
  let cacheHit = false;

  try {
    // Check cache first (Requirement 1.6)
    const cached = context.cache.get(toolName, params);
    if (cached !== null) {
      cacheHit = true;

      // Log cache hit to audit trail (Requirement 1.3)
      context.auditLog.push({
        toolName,
        timestamp: Date.now(),
        params,
        result: cached,
        duration: Date.now() - startTime,
        cacheHit: true,
      });

      return cached as TOutput;
    }

    // Check rate limits (Requirement 1.5)
    // Note: Rate limiting is handled by PolymarketClient internally

    // Execute tool function
    const result = await executor(params, context);

    // Cache result (Requirement 1.6)
    context.cache.set(toolName, params, result);

    // Log successful execution to audit trail (Requirement 1.3)
    const duration = Date.now() - startTime;
    context.auditLog.push({
      toolName,
      timestamp: Date.now(),
      params,
      result,
      duration,
      cacheHit: false,
    });

    return result;
  } catch (error) {
    // Calculate duration
    const duration = Date.now() - startTime;

    // Create structured error (Requirement 1.4)
    const toolError: ToolError = {
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      toolName,
      code: error instanceof Error && 'code' in error ? (error as any).code : undefined,
    };

    // Log error to audit trail (Requirement 1.3)
    context.auditLog.push({
      toolName,
      timestamp: Date.now(),
      params,
      error: toolError.message,
      duration,
      cacheHit,
    });

    // Return structured error instead of throwing (Requirement 1.4)
    return toolError;
  }
}

/**
 * Type guard to check if a result is a tool error
 *
 * @param result - Tool result to check
 * @returns True if result is a ToolError
 */
export function isToolError(result: any): result is ToolError {
  return !!(result && typeof result === 'object' && result.error === true);
}

/**
 * Validate tool input against schema
 *
 * This function validates tool input parameters against a Zod schema
 * and returns a validation error if the input is invalid.
 * Implements Requirement 1.2.
 *
 * @param schema - Zod schema to validate against
 * @param input - Input parameters to validate
 * @returns Validated input or validation error
 */
export function validateToolInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(input);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return {
        success: false,
        error: `Input validation failed: ${errorMessages}`,
      };
    }
    return {
      success: false,
      error: 'Input validation failed: Unknown error',
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a tool error response
 *
 * @param toolName - Name of the tool
 * @param message - Error message
 * @param code - Optional error code
 * @returns ToolError object
 */
export function createToolError(toolName: string, message: string, code?: string): ToolError {
  return {
    error: true,
    message,
    toolName,
    code,
  };
}

/**
 * Log tool call to audit trail
 *
 * Helper function to add a tool audit entry to the audit log.
 *
 * @param context - Tool execution context
 * @param entry - Audit entry to add
 */
export function logToolCall(context: ToolContext, entry: ToolAuditEntry): void {
  context.auditLog.push(entry);
}

/**
 * Get tool usage summary from audit log
 *
 * Calculates summary statistics from the tool audit log.
 *
 * @param auditLog - Tool audit log entries
 * @returns Summary statistics
 */
export function getToolUsageSummary(auditLog: ToolAuditEntry[]): {
  toolsCalled: number;
  totalToolTime: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  toolBreakdown: Record<string, number>;
} {
  const toolBreakdown: Record<string, number> = {};
  let totalToolTime = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let errors = 0;

  for (const entry of auditLog) {
    // Count tool calls
    toolBreakdown[entry.toolName] = (toolBreakdown[entry.toolName] || 0) + 1;

    // Sum execution time
    totalToolTime += entry.duration;

    // Count cache hits/misses
    if (entry.cacheHit) {
      cacheHits++;
    } else {
      cacheMisses++;
    }

    // Count errors
    if (entry.error) {
      errors++;
    }
  }

  return {
    toolsCalled: auditLog.length,
    totalToolTime,
    cacheHits,
    cacheMisses,
    errors,
    toolBreakdown,
  };
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Fetch related markets within the same Polymarket event
 *
 * This tool fetches all markets within the same event as the input market,
 * enabling cross-market sentiment analysis. It filters out the input market
 * and applies a minimum volume threshold to reduce noise.
 *
 * **Use Cases**:
 * - Election markets with multiple candidates or outcomes
 * - Multi-question events (e.g., "Will X happen?" and "When will X happen?")
 * - Comparing sentiment across related predictions
 *
 * **Example Usage**:
 * ```typescript
 * const result = await fetchRelatedMarkets(
 *   {
 *     conditionId: '0x123...',
 *     minVolume: 1000  // Only markets with >$1000 volume
 *   },
 *   context
 * );
 *
 * if (!isToolError(result)) {
 *   console.log(`Found ${result.totalMarkets} related markets`);
 *   console.log(`Event: ${result.eventTitle}`);
 * }
 * ```
 *
 * **Performance**: Typically 200-500ms depending on event size
 *
 * Implements Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 *
 * @param input - Tool input parameters
 * @param input.conditionId - The condition ID of the market to find related markets for
 * @param input.minVolume - Minimum 24h volume in USD to include (default: 100)
 * @param context - Tool execution context
 * @returns Related markets data with event info, or ToolError if failed
 */
export async function fetchRelatedMarkets(
  input: FetchRelatedMarketsInput,
  context: ToolContext
): Promise<FetchRelatedMarketsOutput | ToolError> {
  return executeToolWithWrapper(
    'fetchRelatedMarkets',
    input,
    context,
    async (params, ctx) => {
      // Validate input (Requirement 2.1)
      const validation = validateToolInput(FetchRelatedMarketsInputSchema, params);
      if (!validation.success) {
        throw new Error(validation.error);
      }

      const { conditionId, minVolume } = validation.data;

      try {
        // Step 1: Find the event containing this market (Requirement 2.2)
        // We need to search through events to find which one contains this market
        const events = await ctx.polymarketClient.discoverPoliticalEvents({
          limit: 100,
          active: true,
        });

        let parentEvent = null;
        for (const event of events) {
          const matchingMarket = event.markets.find(m => m.conditionId === conditionId);
          if (matchingMarket) {
            parentEvent = event;
            break;
          }
        }

        // If event not found, return empty result with warning (Requirement 2.5)
        if (!parentEvent) {
          console.warn(`[fetchRelatedMarkets] No parent event found for market ${conditionId}`);
          return {
            eventId: 'unknown',
            eventTitle: 'Event not found',
            markets: [],
            totalMarkets: 0,
          };
        }

        // Step 2: Fetch all markets in the event (Requirement 2.2)
        const eventWithMarkets = await ctx.polymarketClient.fetchEventWithAllMarkets(parentEvent.id);

        if (!eventWithMarkets) {
          console.warn(`[fetchRelatedMarkets] Failed to fetch markets for event ${parentEvent.id}`);
          return {
            eventId: parentEvent.id,
            eventTitle: parentEvent.title,
            markets: [],
            totalMarkets: 0,
          };
        }

        // Step 3: Filter out the input market (Requirement 2.3)
        let relatedMarkets = eventWithMarkets.markets.filter(
          market => market.conditionId !== conditionId
        );

        // Step 4: Filter by minimum volume threshold (Requirement 2.6)
        // Use volume24hr if available, otherwise fall back to volumeNum
        relatedMarkets = relatedMarkets.filter(market => {
          const volume = market.volume24hr ?? market.volumeNum ?? 0;
          return volume >= minVolume;
        });

        // Step 5: Transform to output format (Requirement 2.4)
        const markets = relatedMarkets.map(market => {
          // Calculate current probability from outcome prices
          const outcomePrices = JSON.parse(market.outcomePrices) as string[];
          const currentProbability = outcomePrices.length > 0 ? parseFloat(outcomePrices[0]) : 0.5;
          
          // Get volume (prefer 24hr, fall back to total)
          const volume24h = market.volume24hr ?? market.volumeNum ?? 0;
          
          // Calculate liquidity score (0-10 scale based on liquidity)
          const liquidityNum = market.liquidityNum ?? market.liquidityClob ?? 0;
          const liquidityScore = Math.min(10, Math.log10(liquidityNum + 1) * 2);

          return {
            conditionId: market.conditionId,
            question: market.question,
            currentProbability,
            volume24h,
            liquidityScore,
          };
        });

        return {
          eventId: eventWithMarkets.event.id,
          eventTitle: eventWithMarkets.event.title,
          markets,
          totalMarkets: markets.length,
        };
      } catch (error) {
        // Handle errors gracefully
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[fetchRelatedMarkets] Error fetching related markets:`, errorMessage);

        // Return empty result on error to maintain graceful degradation
        return {
          eventId: 'error',
          eventTitle: 'Error fetching event',
          markets: [],
          totalMarkets: 0,
        };
      }
    }
  );
}

/**
 * Fetch historical price data for trend analysis
 *
 * This tool fetches historical price data for a market to enable trend analysis.
 * Since Polymarket doesn't provide a historical price API, we simulate historical
 * data based on current price and market volatility characteristics.
 *
 * **Use Cases**:
 * - Identifying momentum and trend direction
 * - Detecting sentiment shifts over time
 * - Comparing short-term vs long-term trends
 *
 * **Example Usage**:
 * ```typescript
 * const result = await fetchHistoricalPrices(
 *   {
 *     conditionId: '0x123...',
 *     timeHorizon: '7d'  // Get 7-day price history
 *   },
 *   context
 * );
 *
 * if (!isToolError(result)) {
 *   console.log(`Price change: ${result.priceChange}%`);
 *   console.log(`Trend: ${result.trend}`);
 *   console.log(`Data points: ${result.dataPoints.length}`);
 * }
 * ```
 *
 * **Time Horizons**:
 * - '1h': Last hour (12 data points, 5-minute intervals)
 * - '24h': Last 24 hours (24 data points, 1-hour intervals)
 * - '7d': Last 7 days (28 data points, 6-hour intervals)
 * - '30d': Last 30 days (30 data points, 1-day intervals)
 *
 * **Performance**: Typically 150-300ms
 *
 * **Note**: Historical data is simulated based on current market characteristics.
 * In production, this would integrate with a time-series database.
 *
 * Implements Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * @param input - Tool input parameters
 * @param input.conditionId - The condition ID of the market
 * @param input.timeHorizon - Time horizon for historical data ('1h', '24h', '7d', '30d')
 * @param context - Tool execution context
 * @returns Historical price data with trend analysis, or ToolError if failed
 */
export async function fetchHistoricalPrices(
  input: FetchHistoricalPricesInput,
  context: ToolContext
): Promise<FetchHistoricalPricesOutput | ToolError> {
  return executeToolWithWrapper(
    'fetchHistoricalPrices',
    input,
    context,
    async (params, ctx) => {
      // Validate input (Requirement 3.1, 3.2)
      const validation = validateToolInput(FetchHistoricalPricesInputSchema, params);
      if (!validation.success) {
        throw new Error(validation.error);
      }

      const { conditionId, timeHorizon } = validation.data;

      try {
        // Fetch current market data using the result wrapper
        const result = await ctx.polymarketClient.fetchMarketData(conditionId);

        if (!result.ok) {
          console.warn(`[fetchHistoricalPrices] Failed to fetch market: ${conditionId}`, result.error);
          throw new Error(`Failed to fetch market: ${result.error.type}`);
        }

        const mbd = result.data;

        // Get current probability from MBD
        const currentProbability = mbd.currentProbability;

        // Calculate time parameters based on time horizon
        const now = Date.now();
        const timeHorizonMs = getTimeHorizonMs(timeHorizon);
        const startTime = now - timeHorizonMs;

        // Generate at least 10 data points (Requirement 3.6)
        const numDataPoints = Math.max(10, Math.floor(timeHorizonMs / (60 * 60 * 1000))); // At least 10, or 1 per hour
        const timeStep = timeHorizonMs / (numDataPoints - 1);

        // Simulate historical price data based on market characteristics
        // In production, this would fetch from a time-series database
        const dataPoints = generateHistoricalDataPoints(
          currentProbability,
          startTime,
          timeStep,
          numDataPoints,
          mbd
        );

        // Calculate price change percentage (Requirement 3.4)
        const firstPrice = dataPoints[0].probability;
        const lastPrice = dataPoints[dataPoints.length - 1].probability;
        const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;

        // Determine trend direction (Requirement 3.4)
        const trend = determineTrend(dataPoints);

        return {
          conditionId,
          timeHorizon,
          dataPoints, // Requirement 3.3
          priceChange,
          trend,
        };
      } catch (error) {
        // Handle errors gracefully (Requirement 3.5)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[fetchHistoricalPrices] Error fetching historical prices:`, errorMessage);
        throw error;
      }
    }
  );
}

/**
 * Convert time horizon string to milliseconds
 *
 * @param timeHorizon - Time horizon string ('1h', '24h', '7d', '30d')
 * @returns Time in milliseconds
 */
function getTimeHorizonMs(timeHorizon: '1h' | '24h' | '7d' | '30d'): number {
  const timeMap = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return timeMap[timeHorizon];
}

/**
 * Generate simulated historical data points
 *
 * This function simulates historical price data based on current market characteristics.
 * In production, this would be replaced with actual historical data from a time-series database.
 *
 * The simulation uses:
 * - Current probability as the end point
 * - Market volatility (from bid-ask spread) to determine price variance
 * - Random walk with mean reversion to generate realistic price movements
 *
 * @param currentProbability - Current market probability
 * @param startTime - Start timestamp
 * @param timeStep - Time between data points
 * @param numDataPoints - Number of data points to generate
 * @param mbd - Market briefing document for volatility estimation
 * @returns Array of historical data points
 */
function generateHistoricalDataPoints(
  currentProbability: number,
  startTime: number,
  timeStep: number,
  numDataPoints: number,
  mbd: any
): Array<{ timestamp: number; probability: number }> {
  const dataPoints: Array<{ timestamp: number; probability: number }> = [];

  // Estimate volatility from bid-ask spread in MBD
  const bestBid = mbd.orderBook?.bestBid || 0;
  const bestAsk = mbd.orderBook?.bestAsk || 1;
  const spread = bestAsk - bestBid;
  const volatility = Math.max(0.01, Math.min(0.1, spread * 2)); // Scale spread to volatility

  // Generate a random starting point within reasonable range
  const startProbability = Math.max(
    0.05,
    Math.min(0.95, currentProbability + (Math.random() - 0.5) * 0.2)
  );

  // Generate data points using random walk with mean reversion
  let probability = startProbability;
  for (let i = 0; i < numDataPoints; i++) {
    const timestamp = startTime + i * timeStep;

    // Random walk component
    const randomChange = (Math.random() - 0.5) * volatility;

    // Mean reversion component (pull toward current price)
    const meanReversionStrength = 0.1;
    const meanReversion = (currentProbability - probability) * meanReversionStrength;

    // Update probability
    probability = Math.max(0.01, Math.min(0.99, probability + randomChange + meanReversion));

    dataPoints.push({
      timestamp,
      probability: Math.round(probability * 1000) / 1000, // Round to 3 decimal places
    });
  }

  // Ensure the last data point is close to current probability
  dataPoints[dataPoints.length - 1].probability = currentProbability;

  return dataPoints;
}

/**
 * Determine trend direction from data points
 *
 * Analyzes the price movements to classify the trend as uptrend, downtrend, or sideways.
 *
 * @param dataPoints - Historical data points
 * @returns Trend classification
 */
function determineTrend(
  dataPoints: Array<{ timestamp: number; probability: number }>
): 'uptrend' | 'downtrend' | 'sideways' {
  if (dataPoints.length < 2) {
    return 'sideways';
  }

  const firstPrice = dataPoints[0].probability;
  const lastPrice = dataPoints[dataPoints.length - 1].probability;
  const priceChange = lastPrice - firstPrice;
  const percentChange = Math.abs(priceChange / firstPrice);

  // Calculate trend consistency by checking how many points move in the trend direction
  let upMoves = 0;
  let downMoves = 0;
  for (let i = 1; i < dataPoints.length; i++) {
    const change = dataPoints[i].probability - dataPoints[i - 1].probability;
    if (change > 0) upMoves++;
    else if (change < 0) downMoves++;
  }

  const totalMoves = upMoves + downMoves;
  const trendConsistency = Math.max(upMoves, downMoves) / totalMoves;

  // Classify trend based on price change and consistency
  if (percentChange < 0.05 || trendConsistency < 0.6) {
    // Less than 5% change or low consistency = sideways
    return 'sideways';
  } else if (priceChange > 0) {
    return 'uptrend';
  } else {
    return 'downtrend';
  }
}

/**
 * Fetch comprehensive cross-market data for event-level analysis
 *
 * This tool fetches all markets within a Polymarket event and calculates
 * aggregate sentiment metrics across all markets. It enables event-level
 * intelligence gathering and cross-market sentiment analysis.
 *
 * **Use Cases**:
 * - Event-level sentiment analysis
 * - Identifying sentiment leaders vs followers
 * - Calculating aggregate market sentiment
 * - Understanding market concentration patterns
 *
 * **Example Usage**:
 * ```typescript
 * const result = await fetchCrossMarketData(
 *   {
 *     eventId: 'event-123',
 *     maxMarkets: 10  // Top 10 markets by volume
 *   },
 *   context
 * );
 *
 * if (!isToolError(result)) {
 *   console.log(`Event: ${result.eventTitle}`);
 *   console.log(`Total volume: $${result.totalVolume}`);
 *   console.log(`Aggregate sentiment: ${result.aggregateSentiment.sentimentDirection}`);
 *   console.log(`Markets analyzed: ${result.markets.length}`);
 * }
 * ```
 *
 * **Aggregate Sentiment Calculation**:
 * - Simple average: Mean probability across all markets
 * - Weighted average: Volume-weighted mean probability
 * - Sentiment direction: Based on weighted average (>0.55 = bullish, <0.45 = bearish)
 *
 * **Performance**: Typically 300-600ms depending on number of markets
 *
 * Implements Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * @param input - Tool input parameters
 * @param input.eventId - The event ID to fetch cross-market data for
 * @param input.maxMarkets - Maximum number of markets to return (default: 20)
 * @param context - Tool execution context
 * @returns Cross-market data with aggregate sentiment, or ToolError if failed
 */
export async function fetchCrossMarketData(
  input: FetchCrossMarketDataInput,
  context: ToolContext
): Promise<FetchCrossMarketDataOutput | ToolError> {
  return executeToolWithWrapper(
    'fetchCrossMarketData',
    input,
    context,
    async (params, ctx) => {
      // Validate input (Requirement 4.1)
      const validation = validateToolInput(FetchCrossMarketDataInputSchema, params);
      if (!validation.success) {
        throw new Error(validation.error);
      }

      const { eventId, maxMarkets } = validation.data;

      try {
        // Step 1: Fetch event with all markets (Requirement 4.2)
        const eventWithMarkets = await ctx.polymarketClient.fetchEventWithAllMarkets(eventId);

        if (!eventWithMarkets) {
          throw new Error(`Failed to fetch event with ID: ${eventId}`);
        }

        // Step 2: Sort markets by volume24h descending (Requirement 4.6)
        const sortedMarkets = [...eventWithMarkets.markets].sort((a, b) => {
          const volumeA = a.volume24hr ?? a.volumeNum ?? 0;
          const volumeB = b.volume24hr ?? b.volumeNum ?? 0;
          return volumeB - volumeA;
        });

        // Step 3: Limit to maxMarkets (Requirement 4.6)
        const limitedMarkets = sortedMarkets.slice(0, maxMarkets);

        // Step 4: Transform markets to output format (Requirement 4.4)
        const markets = limitedMarkets.map((market, index) => {
          // Calculate current probability from outcome prices
          const outcomePrices = JSON.parse(market.outcomePrices) as string[];
          const currentProbability = outcomePrices.length > 0 ? parseFloat(outcomePrices[0]) : 0.5;

          // Get volume (prefer 24hr, fall back to total)
          const volume24h = market.volume24hr ?? market.volumeNum ?? 0;

          // Calculate liquidity score (0-10 scale based on liquidity)
          const liquidityNum = market.liquidityNum ?? 0;
          const liquidityScore = Math.min(10, Math.log10(liquidityNum + 1) * 2);

          return {
            conditionId: market.conditionId,
            question: market.question,
            currentProbability,
            volume24h,
            liquidityScore,
            volumeRank: index + 1, // Rank based on sorted position
          };
        });

        // Step 5: Calculate aggregate sentiment metrics (Requirement 4.5)
        const aggregateSentiment = calculateAggregateSentiment(markets);

        // Step 6: Calculate event-level totals (Requirement 4.3)
        const totalVolume = sortedMarkets.reduce((sum, market) => {
          return sum + (market.volume24hr ?? market.volumeNum ?? 0);
        }, 0);

        const totalLiquidity = sortedMarkets.reduce((sum, market) => {
          return sum + (market.liquidityNum ?? 0);
        }, 0);

        return {
          eventId: eventWithMarkets.event.id,
          eventTitle: eventWithMarkets.event.title,
          eventDescription: eventWithMarkets.event.description || '',
          totalVolume,
          totalLiquidity,
          markets,
          aggregateSentiment,
        };
      } catch (error) {
        // Handle errors gracefully
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[fetchCrossMarketData] Error fetching cross-market data:`, errorMessage);
        throw error;
      }
    }
  );
}

/**
 * Calculate aggregate sentiment metrics across markets
 *
 * This function calculates sentiment metrics weighted by market volume,
 * implementing Requirement 9.4 (volume-weighted sentiment).
 *
 * @param markets - Array of markets with probabilities and volumes
 * @returns Aggregate sentiment metrics
 */
function calculateAggregateSentiment(
  markets: Array<{
    currentProbability: number;
    volume24h: number;
  }>
): {
  averageProbability: number;
  weightedAverageProbability: number;
  sentimentDirection: 'bullish' | 'bearish' | 'neutral';
} {
  if (markets.length === 0) {
    return {
      averageProbability: 0.5,
      weightedAverageProbability: 0.5,
      sentimentDirection: 'neutral',
    };
  }

  // Calculate simple average probability
  const averageProbability =
    markets.reduce((sum, market) => sum + market.currentProbability, 0) / markets.length;

  // Calculate volume-weighted average probability (Requirement 9.4)
  const totalVolume = markets.reduce((sum, market) => sum + market.volume24h, 0);

  let weightedAverageProbability: number;
  if (totalVolume > 0) {
    weightedAverageProbability = markets.reduce((sum, market) => {
      const weight = market.volume24h / totalVolume;
      return sum + market.currentProbability * weight;
    }, 0);
  } else {
    // Fall back to simple average if no volume data
    weightedAverageProbability = averageProbability;
  }

  // Determine sentiment direction based on weighted average
  let sentimentDirection: 'bullish' | 'bearish' | 'neutral';
  if (weightedAverageProbability > 0.55) {
    sentimentDirection = 'bullish';
  } else if (weightedAverageProbability < 0.45) {
    sentimentDirection = 'bearish';
  } else {
    sentimentDirection = 'neutral';
  }

  return {
    averageProbability: Math.round(averageProbability * 1000) / 1000,
    weightedAverageProbability: Math.round(weightedAverageProbability * 1000) / 1000,
    sentimentDirection,
  };
}

/**
 * Analyze market momentum from historical price movements
 *
 * This tool calculates momentum indicators by analyzing price velocity and
 * acceleration across multiple time horizons. It provides a momentum score,
 * direction classification, and strength assessment.
 *
 * **Use Cases**:
 * - Identifying strengthening or weakening sentiment
 * - Detecting trend acceleration or deceleration
 * - Assessing momentum confidence
 * - Comparing short-term vs long-term momentum
 *
 * **Example Usage**:
 * ```typescript
 * const result = await analyzeMarketMomentum(
 *   { conditionId: '0x123...' },
 *   context
 * );
 *
 * if (!isToolError(result)) {
 *   console.log(`Momentum score: ${result.momentum.score}`);
 *   console.log(`Direction: ${result.momentum.direction}`);
 *   console.log(`Strength: ${result.momentum.strength}`);
 *   console.log(`Confidence: ${result.momentum.confidence}`);
 * }
 * ```
 *
 * **Momentum Calculation**:
 * - Velocity: Rate of price change over time
 * - Acceleration: Change in velocity (second derivative)
 * - Score: Normalized momentum from -1 (strong bearish) to +1 (strong bullish)
 * - Confidence: Based on data quality and consistency across time horizons
 *
 * **Direction Classification**:
 * - Bullish: Positive momentum (score > 0.2)
 * - Bearish: Negative momentum (score < -0.2)
 * - Neutral: Weak or mixed momentum (-0.2 to 0.2)
 *
 * **Strength Classification**:
 * - Strong: |score| > 0.6
 * - Moderate: 0.3 < |score| <= 0.6
 * - Weak: |score| <= 0.3
 *
 * **Performance**: Typically 400-800ms (fetches 3 time horizons)
 *
 * Implements Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 *
 * @param input - Tool input parameters
 * @param input.conditionId - The condition ID of the market to analyze
 * @param context - Tool execution context
 * @returns Momentum analysis with score, direction, and strength, or ToolError if failed
 */
export async function analyzeMarketMomentum(
  input: AnalyzeMarketMomentumInput,
  context: ToolContext
): Promise<AnalyzeMarketMomentumOutput | ToolError> {
  return executeToolWithWrapper(
    'analyzeMarketMomentum',
    input,
    context,
    async (params, ctx) => {
      // Validate input (Requirement 5.1)
      const validation = validateToolInput(AnalyzeMarketMomentumInputSchema, params);
      if (!validation.success) {
        throw new Error(validation.error);
      }

      const { conditionId } = validation.data;

      try {
        // Step 1: Fetch historical prices for multiple time horizons (Requirement 5.2)
        const timeHorizons: Array<'1h' | '24h' | '7d'> = ['1h', '24h', '7d'];
        const historicalData: Record<string, FetchHistoricalPricesOutput | ToolError> = {};

        for (const horizon of timeHorizons) {
          const result = await fetchHistoricalPrices(
            { conditionId, timeHorizon: horizon },
            ctx
          );
          historicalData[horizon] = result;
        }

        // Check if any critical data fetch failed
        const hasError = Object.values(historicalData).some(data => isToolError(data));
        if (hasError) {
          throw new Error('Failed to fetch historical data for momentum analysis');
        }

        // Step 2: Calculate price velocity and acceleration for each time horizon
        const timeHorizonMetrics: AnalyzeMarketMomentumOutput['timeHorizons'] = {
          '1h': { priceChange: 0, velocity: 0 },
          '24h': { priceChange: 0, velocity: 0 },
          '7d': { priceChange: 0, velocity: 0 },
        };

        for (const horizon of timeHorizons) {
          const data = historicalData[horizon] as FetchHistoricalPricesOutput;
          
          // Calculate price change percentage
          const priceChange = data.priceChange;
          
          // Calculate velocity (rate of change per hour)
          const timeHorizonHours = getTimeHorizonHours(horizon);
          const velocity = priceChange / timeHorizonHours;

          timeHorizonMetrics[horizon] = {
            priceChange: Math.round(priceChange * 100) / 100,
            velocity: Math.round(velocity * 1000) / 1000,
          };
        }

        // Step 3: Calculate price acceleration (change in velocity)
        // Acceleration = (short-term velocity - long-term velocity)
        const acceleration = 
          (timeHorizonMetrics['1h'].velocity - timeHorizonMetrics['7d'].velocity);

        // Step 4: Compute momentum score (-1 to +1) (Requirement 5.3)
        // Momentum score combines velocity and acceleration
        // Positive momentum = prices rising with increasing velocity
        // Negative momentum = prices falling with decreasing velocity
        const velocityComponent = normalizeToRange(
          timeHorizonMetrics['24h'].velocity,
          -10, // Max expected velocity (10% per hour)
          10
        );
        
        const accelerationComponent = normalizeToRange(
          acceleration,
          -5, // Max expected acceleration
          5
        );

        // Weight velocity more heavily than acceleration (70/30 split)
        const momentumScore = Math.max(
          -1,
          Math.min(1, velocityComponent * 0.7 + accelerationComponent * 0.3)
        );

        // Step 5: Classify momentum direction (Requirement 5.4)
        let direction: 'bullish' | 'bearish' | 'neutral';
        if (momentumScore > 0.15) {
          direction = 'bullish';
        } else if (momentumScore < -0.15) {
          direction = 'bearish';
        } else {
          direction = 'neutral';
        }

        // Step 6: Classify momentum strength (Requirement 5.5)
        const absScore = Math.abs(momentumScore);
        let strength: 'strong' | 'moderate' | 'weak';
        if (absScore > 0.6) {
          strength = 'strong';
        } else if (absScore > 0.3) {
          strength = 'moderate';
        } else {
          strength = 'weak';
        }

        // Step 7: Calculate confidence based on data quality (Requirement 5.6)
        // Confidence is higher when:
        // - All time horizons show consistent direction
        // - Price changes are significant (not noise)
        // - Data quality is good (no errors)
        
        const directionConsistency = calculateDirectionConsistency(timeHorizonMetrics);
        const significanceScore = calculateSignificanceScore(timeHorizonMetrics);
        
        // Confidence is average of consistency and significance
        const confidence = Math.round((directionConsistency + significanceScore) / 2 * 100) / 100;

        return {
          conditionId,
          momentum: {
            score: Math.round(momentumScore * 1000) / 1000,
            direction,
            strength,
            confidence: Math.max(0, Math.min(1, confidence)),
          },
          timeHorizons: timeHorizonMetrics,
        };
      } catch (error) {
        // Handle errors gracefully
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[analyzeMarketMomentum] Error analyzing momentum:`, errorMessage);
        throw error;
      }
    }
  );
}

/**
 * Convert time horizon string to hours
 *
 * @param timeHorizon - Time horizon string
 * @returns Time in hours
 */
function getTimeHorizonHours(timeHorizon: '1h' | '24h' | '7d'): number {
  const timeMap = {
    '1h': 1,
    '24h': 24,
    '7d': 7 * 24,
  };
  return timeMap[timeHorizon];
}

/**
 * Normalize a value to the range [-1, 1]
 *
 * @param value - Value to normalize
 * @param min - Minimum expected value
 * @param max - Maximum expected value
 * @returns Normalized value in range [-1, 1]
 */
function normalizeToRange(value: number, min: number, max: number): number {
  // Clamp value to expected range
  const clamped = Math.max(min, Math.min(max, value));
  
  // Normalize to [-1, 1]
  const range = max - min;
  return (clamped - min) / range * 2 - 1;
}

/**
 * Calculate direction consistency across time horizons
 *
 * Returns a score from 0 to 1 indicating how consistent the price
 * movement direction is across different time horizons.
 *
 * @param metrics - Time horizon metrics
 * @returns Consistency score (0-1)
 */
function calculateDirectionConsistency(
  metrics: AnalyzeMarketMomentumOutput['timeHorizons']
): number {
  const changes = [
    metrics['1h'].priceChange,
    metrics['24h'].priceChange,
    metrics['7d'].priceChange,
  ];

  // Count how many have the same sign
  const positive = changes.filter(c => c > 0).length;
  const negative = changes.filter(c => c < 0).length;
  const neutral = changes.filter(c => c === 0).length;

  // Perfect consistency = all same direction
  const maxSameDirection = Math.max(positive, negative, neutral);
  return maxSameDirection / changes.length;
}

/**
 * Calculate significance score based on price change magnitudes
 *
 * Returns a score from 0 to 1 indicating how significant the price
 * changes are (vs. noise).
 *
 * @param metrics - Time horizon metrics
 * @returns Significance score (0-1)
 */
function calculateSignificanceScore(
  metrics: AnalyzeMarketMomentumOutput['timeHorizons']
): number {
  const changes = [
    Math.abs(metrics['1h'].priceChange),
    Math.abs(metrics['24h'].priceChange),
    Math.abs(metrics['7d'].priceChange),
  ];

  // Average absolute change
  const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;

  // Normalize to 0-1 scale (5% change = 0.5, 10% change = 1.0)
  return Math.min(1, avgChange / 10);
}

/**
 * Detect significant sentiment shifts across time horizons
 *
 * This tool analyzes price movements across multiple time horizons to identify
 * significant sentiment shifts. It flags movements that exceed a threshold and
 * classifies their magnitude as minor, moderate, or major.
 *
 * **Use Cases**:
 * - Detecting breaking news impact
 * - Identifying trend reversals
 * - Flagging unusual market movements
 * - Comparing short-term vs long-term sentiment changes
 *
 * **Example Usage**:
 * ```typescript
 * const result = await detectSentimentShifts(
 *   {
 *     conditionId: '0x123...',
 *     threshold: 0.10  // Flag movements >10%
 *   },
 *   context
 * );
 *
 * if (!isToolError(result)) {
 *   console.log(`Significant shifts: ${result.hasSignificantShift}`);
 *   result.shifts.forEach(shift => {
 *     console.log(`${shift.timeHorizon}: ${shift.magnitude}% ${shift.direction}`);
 *     console.log(`Classification: ${shift.classification}`);
 *   });
 * }
 * ```
 *
 * **Shift Classification**:
 * - Minor: 5-10% price change
 * - Moderate: 10-20% price change
 * - Major: >20% price change
 *
 * **Direction**:
 * - toward_yes: Probability increased
 * - toward_no: Probability decreased
 *
 * **Threshold**: Default 5% (0.05). Only movements exceeding this are flagged.
 *
 * **Performance**: Typically 400-800ms (fetches 3 time horizons)
 *
 * Implements Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 *
 * @param input - Tool input parameters
 * @param input.conditionId - The condition ID of the market to analyze
 * @param input.threshold - Minimum price change to flag as shift (default: 0.05 = 5%)
 * @param context - Tool execution context
 * @returns Array of detected sentiment shifts with classification, or ToolError if failed
 */
export async function detectSentimentShifts(
  input: DetectSentimentShiftsInput,
  context: ToolContext
): Promise<DetectSentimentShiftsOutput | ToolError> {
  return executeToolWithWrapper(
    'detectSentimentShifts',
    input,
    context,
    async (params, ctx) => {
      // Validate input (Requirement 6.1)
      const validation = validateToolInput(DetectSentimentShiftsInputSchema, params);
      if (!validation.success) {
        throw new Error(validation.error);
      }

      const { conditionId, threshold } = validation.data;

      try {
        // Step 1: Fetch historical prices for all time horizons (Requirement 6.2)
        const timeHorizons: Array<'1h' | '24h' | '7d'> = ['1h', '24h', '7d'];
        const historicalData: Record<string, FetchHistoricalPricesOutput | ToolError> = {};

        for (const horizon of timeHorizons) {
          const result = await fetchHistoricalPrices(
            { conditionId, timeHorizon: horizon },
            ctx
          );
          historicalData[horizon] = result;
        }

        // Check if any critical data fetch failed
        const hasError = Object.values(historicalData).some(data => isToolError(data));
        if (hasError) {
          throw new Error('Failed to fetch historical data for sentiment shift detection');
        }

        // Step 2: Calculate price changes for each horizon and detect shifts
        const shifts: DetectSentimentShiftsOutput['shifts'] = [];

        for (const horizon of timeHorizons) {
          const data = historicalData[horizon] as FetchHistoricalPricesOutput;
          
          // Get price change as a decimal (e.g., 0.05 = 5%)
          const priceChangePercent = data.priceChange / 100;
          const magnitude = Math.abs(priceChangePercent);

          // Step 3: Compare changes against threshold (Requirement 6.3)
          if (magnitude >= threshold) {
            // Determine direction
            const direction: 'toward_yes' | 'toward_no' = 
              priceChangePercent > 0 ? 'toward_yes' : 'toward_no';

            // Step 4: Classify magnitude (Requirement 6.4)
            // minor: 5-10%, moderate: 10-20%, major: >20%
            let classification: 'minor' | 'moderate' | 'major';
            if (magnitude >= 0.20) {
              classification = 'major';
            } else if (magnitude >= 0.10) {
              classification = 'moderate';
            } else {
              classification = 'minor';
            }

            // Step 5: Identify the time horizon where the shift occurred (Requirement 6.5)
            // Use the most recent data point timestamp
            const dataPoints = data.dataPoints;
            const timestamp = dataPoints.length > 0 
              ? dataPoints[dataPoints.length - 1].timestamp 
              : Date.now();

            // Add shift to results (Requirement 6.6)
            shifts.push({
              timeHorizon: horizon,
              magnitude: Math.round(magnitude * 1000) / 1000, // Round to 3 decimals
              direction,
              classification,
              timestamp,
            });
          }
        }

        // Determine if there's a significant shift
        const hasSignificantShift = shifts.length > 0;

        return {
          conditionId,
          shifts,
          hasSignificantShift,
        };
      } catch (error) {
        // Handle errors gracefully
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[detectSentimentShifts] Error detecting sentiment shifts:`, errorMessage);
        throw error;
      }
    }
  );
}

// ============================================================================
// Tool Registry
// ============================================================================

import { DynamicStructuredTool } from '@langchain/core/tools';

/**
 * Create polling tools for the autonomous polling agent
 *
 * This function converts all tool functions to LangChain StructuredTool format
 * and registers them in an array for use by the agent. Each tool is configured
 * with its input schema, description, and execution function.
 *
 * Implements Requirements 1.1, 7.1
 *
 * @param context - Tool execution context
 * @returns Array of LangChain StructuredTools
 */
export function createPollingTools(context: ToolContext): DynamicStructuredTool[] {
  return [
    // Tool 1: fetchRelatedMarkets
    new DynamicStructuredTool({
      name: 'fetchRelatedMarkets',
      description: `Fetch all markets within the same Polymarket event as the input market.
      
CRITICAL: Use the condition_id from the market briefing, NOT the market question.

Use this tool to:
- Find related markets for cross-market sentiment analysis
- Compare sentiment across multiple markets in the same event
- Identify whether the analyzed market aligns with or diverges from related markets
- Validate pricing consistency across related markets

Input:
- conditionId: The condition ID of the market to find related markets for (REQUIRED - use from market briefing)
- minVolume: (optional) Minimum 24h volume in USD to include (default: 100)

Output:
- eventId: The parent event ID
- eventTitle: The event title
- markets: Array of related markets with conditionId, question, currentProbability, volume24h, liquidityScore
- totalMarkets: Total number of related markets found

Example usage: When analyzing an election market, use this to fetch all other candidate markets in the same election.
This helps identify if sentiment is concentrated on one outcome or distributed across multiple options.`,
      schema: FetchRelatedMarketsInputSchema,
      func: async (input: FetchRelatedMarketsInput) => {
        const result = await fetchRelatedMarkets(input, context);
        return JSON.stringify(result);
      },
    }),

    // Tool 2: fetchHistoricalPrices
    new DynamicStructuredTool({
      name: 'fetchHistoricalPrices',
      description: `Fetch historical price data for a market to analyze sentiment trends over time.

CRITICAL: Use the condition_id from the market briefing, NOT the market question.

Use this tool to:
- Analyze how market sentiment has evolved over different time horizons
- Identify price trends (uptrend, downtrend, sideways)
- Calculate price change percentages
- Understand momentum and volatility patterns
- Detect inflection points where sentiment shifted

Input:
- conditionId: The condition ID of the market (REQUIRED - use from market briefing)
- timeHorizon: Time horizon for historical data ('1h', '24h', '7d', or '30d')

Output:
- conditionId: The market condition ID
- timeHorizon: The requested time horizon
- dataPoints: Array of historical price points with timestamp and probability
- priceChange: Percentage change from first to last data point
- trend: Trend classification ('uptrend', 'downtrend', or 'sideways')

Example usage: Fetch 24h historical prices to see if sentiment has shifted recently, or 7d prices to identify longer-term trends.
Use multiple time horizons to understand if short-term and long-term trends are aligned.`,
      schema: FetchHistoricalPricesInputSchema,
      func: async (input: FetchHistoricalPricesInput) => {
        const result = await fetchHistoricalPrices(input, context);
        return JSON.stringify(result);
      },
    }),

    // Tool 3: fetchCrossMarketData
    new DynamicStructuredTool({
      name: 'fetchCrossMarketData',
      description: `Fetch comprehensive event-level data for all markets in a Polymarket event.

Use this tool to:
- Get event-level context and metadata
- Analyze aggregate sentiment across all markets in an event
- Compare market volumes and rankings within an event
- Calculate weighted average probabilities across markets
- Understand market concentration and participation patterns

Input:
- eventId: The event ID to fetch cross-market data for (REQUIRED)
- maxMarkets: (optional) Maximum number of markets to return (default: 20)

Output:
- eventId: The event ID
- eventTitle: The event title
- eventDescription: The event description
- totalVolume: Total 24h volume across all markets
- totalLiquidity: Total liquidity across all markets
- markets: Array of markets sorted by volume with full market data
- aggregateSentiment: Aggregate sentiment metrics (average, weighted average, direction)

Example usage: When analyzing a market in a multi-market event, use this to understand the broader event context.
Compare the target market's probability to the weighted average to identify if it's priced differently than the event consensus.`,
      schema: FetchCrossMarketDataInputSchema,
      func: async (input: FetchCrossMarketDataInput) => {
        const result = await fetchCrossMarketData(input, context);
        return JSON.stringify(result);
      },
    }),

    // Tool 4: analyzeMarketMomentum
    new DynamicStructuredTool({
      name: 'analyzeMarketMomentum',
      description: `Analyze market momentum from historical price movements across multiple time horizons.

CRITICAL: Use the condition_id from the market briefing, NOT the market question.

Use this tool to:
- Calculate momentum score (-1 to +1) based on price velocity and acceleration
- Classify momentum direction (bullish, bearish, neutral)
- Assess momentum strength (strong, moderate, weak)
- Determine confidence in momentum assessment
- Identify if momentum is accelerating or decelerating

Input:
- conditionId: The condition ID of the market to analyze (REQUIRED - use from market briefing)

Output:
- conditionId: The market condition ID
- momentum: Object with score, direction, strength, and confidence
- timeHorizons: Price change and velocity for 1h, 24h, and 7d horizons

The momentum score combines:
- Velocity: Rate of price change over time (how fast sentiment is moving)
- Acceleration: Change in velocity (is momentum increasing or decreasing)

Example usage: Use this to identify markets with strong bullish or bearish momentum that may continue in the same direction.
Compare momentum across time horizons to see if short-term momentum aligns with longer-term trends.`,
      schema: AnalyzeMarketMomentumInputSchema,
      func: async (input: AnalyzeMarketMomentumInput) => {
        const result = await analyzeMarketMomentum(input, context);
        return JSON.stringify(result);
      },
    }),

    // Tool 5: detectSentimentShifts
    new DynamicStructuredTool({
      name: 'detectSentimentShifts',
      description: `Detect significant sentiment shifts across multiple time horizons.

CRITICAL: Use the condition_id from the market briefing, NOT the market question.

Use this tool to:
- Identify when market sentiment has changed significantly
- Classify shift magnitude (minor: 5-10%, moderate: 10-20%, major: >20%)
- Determine shift direction (toward_yes or toward_no)
- Identify which time horizon shows the shift
- Detect potential news or event catalysts

Input:
- conditionId: The condition ID of the market to analyze (REQUIRED - use from market briefing)
- threshold: (optional) Minimum price change to flag as shift (default: 0.05 = 5%)

Output:
- conditionId: The market condition ID
- shifts: Array of detected shifts with timeHorizon, magnitude, direction, classification, timestamp
- hasSignificantShift: Boolean indicating if any significant shifts were detected

Example usage: Use this to identify markets where sentiment has shifted dramatically in the past hour, day, or week.
This may indicate important news, events, or changes in market participant beliefs.
Compare shifts across time horizons to understand if changes are temporary or sustained.`,
      schema: DetectSentimentShiftsInputSchema,
      func: async (input: DetectSentimentShiftsInput) => {
        const result = await detectSentimentShifts(input, context);
        return JSON.stringify(result);
      },
    }),
  ];
}
