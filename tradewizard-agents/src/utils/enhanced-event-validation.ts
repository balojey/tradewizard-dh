/**
 * Enhanced Event Data Validation and Response Parsing
 *
 * This module provides comprehensive Zod schemas for validating Polymarket events API responses
 * and parsing event metadata fields with nested markets. It implements graceful error handling
 * for malformed event data with detailed error reporting.
 * 
 * Features:
 * - Complete Zod schemas matching actual Polymarket events API response structure
 * - Comprehensive validation for all event metadata fields and nested markets
 * - Graceful error handling with detailed error reporting
 * - Type-safe parsing with fallback mechanisms
 * - Support for partial validation and error recovery
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.5
 */

import { z } from 'zod';
import { getLogger } from './logger.js';

// ============================================================================
// Core Event Validation Schemas
// ============================================================================

/**
 * Zod schema for PolymarketTag validation
 * Validates event tags and classification data
 */
export const PolymarketTagSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
  slug: z.string().min(1),
  forceShow: z.boolean().optional(),
  forceHide: z.boolean().optional(),
  publishedAt: z.string().optional(),
  updatedBy: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isCarousel: z.boolean().optional(),
  requiresTranslation: z.boolean(),
}).strict();

/**
 * Zod schema for PolymarketMarket validation within event context
 * Validates all market fields including financial data, pricing, and configuration
 */
export const PolymarketMarketSchema = z.object({
  // Core Market Data
  id: z.string().min(1),
  question: z.string().min(1),
  conditionId: z.string().min(1),
  slug: z.string().min(1),
  description: z.string(),
  resolutionSource: z.string(),
  
  // Market Status
  active: z.boolean(),
  closed: z.boolean(),
  archived: z.boolean(),
  new: z.boolean(),
  featured: z.boolean(),
  restricted: z.boolean(),
  
  // Financial Data - handle both string and number formats
  liquidity: z.string().optional(),
  liquidityNum: z.number().min(0).optional(),
  volume: z.string(),
  volumeNum: z.number().min(0),
  volume24hr: z.number().min(0).optional(),
  volume1wk: z.number().min(0).optional(),
  volume1mo: z.number().min(0).optional(),
  volume1yr: z.number().min(0).optional(),
  
  // Pricing Data - outcomes stored as JSON strings
  outcomes: z.string(),
  outcomePrices: z.string(),
  lastTradePrice: z.number().min(0).max(1).optional(),
  bestBid: z.number().min(0).max(1).optional(),
  bestAsk: z.number().min(0).max(1).optional(),
  spread: z.number().min(0).optional(),
  
  // Price Changes
  oneDayPriceChange: z.number().optional(),
  oneHourPriceChange: z.number().optional(),
  oneWeekPriceChange: z.number().optional(),
  oneMonthPriceChange: z.number().optional(),
  oneYearPriceChange: z.number().optional(),
  
  // Market Quality Metrics
  competitive: z.number().min(0).optional(),
  
  // Temporal Data
  startDate: z.string(),
  endDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedTime: z.string().optional(),
  
  // Market Maker and Trading
  marketMakerAddress: z.string(),
  submitted_by: z.string(),
  resolvedBy: z.string().optional(),
  
  // Group/Series Information (for event context)
  groupItemTitle: z.string().optional(),
  groupItemThreshold: z.string().optional(),
  
  // UMA Resolution
  questionID: z.string().optional(),
  umaEndDate: z.string().optional(),
  umaResolutionStatus: z.string().optional(),
  umaResolutionStatuses: z.string().optional(),
  umaBond: z.string().optional(),
  umaReward: z.string().optional(),
  
  // Trading Configuration
  enableOrderBook: z.boolean(),
  orderPriceMinTickSize: z.number().min(0).optional(),
  orderMinSize: z.number().min(0).optional(),
  acceptingOrders: z.boolean().optional(),
  acceptingOrdersTimestamp: z.string().optional(),
  
  // CLOB Token Information
  clobTokenIds: z.string().optional(),
  liquidityClob: z.number().min(0).optional(),
  volumeClob: z.number().min(0).optional(),
  volume24hrClob: z.number().min(0).optional(),
  volume1wkClob: z.number().min(0).optional(),
  volume1moClob: z.number().min(0).optional(),
  volume1yrClob: z.number().min(0).optional(),
  
  // Additional Configuration
  customLiveness: z.number().optional(),
  negRisk: z.boolean(),
  negRiskRequestID: z.string().optional(),
  negRiskMarketID: z.string().optional(),
  ready: z.boolean(),
  funded: z.boolean(),
  cyom: z.boolean(),
  pagerDutyNotificationEnabled: z.boolean(),
  approved: z.boolean(),
  rewardsMinSize: z.number().min(0).optional(),
  rewardsMaxSpread: z.number().min(0).optional(),
  automaticallyResolved: z.boolean().optional(),
  automaticallyActive: z.boolean(),
  clearBookOnStart: z.boolean(),
  seriesColor: z.string(),
  showGmpSeries: z.boolean(),
  showGmpOutcome: z.boolean(),
  manualActivation: z.boolean(),
  negRiskOther: z.boolean(),
  pendingDeployment: z.boolean(),
  deploying: z.boolean(),
  deployingTimestamp: z.string().optional(),
  rfqEnabled: z.boolean(),
  holdingRewardsEnabled: z.boolean(),
  feesEnabled: z.boolean(),
  requiresTranslation: z.boolean(),
  
  // Visual Elements
  image: z.string().optional(),
  icon: z.string().optional(),
  
  // Date Helpers
  endDateIso: z.string().optional(),
  startDateIso: z.string().optional(),
  hasReviewedDates: z.boolean().optional(),
}).strict();

/**
 * Zod schema for PolymarketEvent validation
 * Validates complete event structure with nested markets and metadata
 */
export const PolymarketEventSchema = z.object({
  // Core Event Data
  id: z.string().min(1),
  ticker: z.string(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  resolutionSource: z.string(),
  
  // Event Status
  active: z.boolean(),
  closed: z.boolean(),
  archived: z.boolean(),
  new: z.boolean(),
  featured: z.boolean(),
  restricted: z.boolean(),
  
  // Temporal Data
  startDate: z.string(),
  creationDate: z.string(),
  endDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  
  // Event Metrics (aggregated from all markets)
  liquidity: z.number().min(0),
  volume: z.number().min(0),
  openInterest: z.number().min(0),
  competitive: z.number().min(0),
  volume24hr: z.number().min(0),
  volume1wk: z.number().min(0),
  volume1mo: z.number().min(0),
  volume1yr: z.number().min(0),
  
  // Event Configuration
  enableOrderBook: z.boolean(),
  liquidityClob: z.number().min(0),
  negRisk: z.boolean(),
  negRiskMarketID: z.string().optional(),
  commentCount: z.number().int().min(0),
  
  // Visual Elements
  image: z.string().optional(),
  icon: z.string().optional(),
  
  // Nested Markets (key difference from individual market approach)
  markets: z.array(PolymarketMarketSchema).min(0),
  
  // Event Tags and Classification
  tags: z.array(PolymarketTagSchema).min(0),
  
  // Event-Specific Configuration
  cyom: z.boolean(),
  showAllOutcomes: z.boolean(),
  showMarketImages: z.boolean(),
  enableNegRisk: z.boolean(),
  automaticallyActive: z.boolean(),
  gmpChartMode: z.string(),
  negRiskAugmented: z.boolean(),
  cumulativeMarkets: z.boolean(),
  pendingDeployment: z.boolean(),
  deploying: z.boolean(),
  requiresTranslation: z.boolean(),
}).strict();

/**
 * Zod schema for Events API response (array of events)
 */
export const EventsApiResponseSchema = z.array(PolymarketEventSchema);

/**
 * Zod schema for single Event API response
 */
export const SingleEventApiResponseSchema = PolymarketEventSchema;

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Validation result for event data
 */
export interface EventValidationResult<T> {
  success: boolean;
  data?: T;
  error?: EventValidationError;
  warnings?: string[];
  partialData?: Partial<T>;
}

/**
 * Detailed validation error information
 */
export interface EventValidationError {
  type: 'schema_validation' | 'parsing_error' | 'malformed_data' | 'missing_required_fields';
  message: string;
  field?: string;
  path?: string[];
  originalError?: unknown;
  suggestions?: string[];
}

/**
 * Parsing options for event validation
 */
export interface EventParsingOptions {
  strict: boolean;
  allowPartialData: boolean;
  skipMalformedMarkets: boolean;
  logWarnings: boolean;
  maxMarkets?: number;
  requiredFields?: string[];
}

// ============================================================================
// Enhanced Event Validation and Parsing Functions
// ============================================================================

/**
 * Validate and parse a single Polymarket event with comprehensive error handling
 * Implements Requirements 2.1, 2.2, 2.3, 7.1, 7.2
 */
export function validatePolymarketEvent(
  data: unknown,
  options: Partial<EventParsingOptions> = {}
): EventValidationResult<z.infer<typeof PolymarketEventSchema>> {
  const logger = getLogger();
  const opts: EventParsingOptions = {
    strict: false,
    allowPartialData: true,
    skipMalformedMarkets: true,
    logWarnings: true,
    ...options,
  };

  try {
    // First attempt: strict validation
    if (opts.strict) {
      const validatedEvent = PolymarketEventSchema.parse(data);
      return {
        success: true,
        data: validatedEvent,
      };
    }

    // Second attempt: lenient validation with error recovery
    const result = PolymarketEventSchema.safeParse(data);
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    // Handle validation errors with graceful degradation
    if (opts.allowPartialData) {
      const partialResult = attemptPartialEventValidation(data, result.error, opts);
      if (partialResult.success) {
        return partialResult;
      }
    }

    // Create detailed error information
    const validationError = createEventValidationError(result.error, 'event');
    
    if (opts.logWarnings) {
      logger.warn({
        error: validationError,
        dataType: typeof data,
        hasId: typeof data === 'object' && data !== null && 'id' in data,
      }, '[EventValidation] Event validation failed');
    }

    return {
      success: false,
      error: validationError,
    };

  } catch (error) {
    const validationError: EventValidationError = {
      type: 'parsing_error',
      message: `Unexpected error during event validation: ${(error as Error).message}`,
      originalError: error,
      suggestions: [
        'Check if the input data is valid JSON',
        'Verify the event structure matches the expected format',
        'Enable partial data parsing for better error recovery',
      ],
    };

    if (opts.logWarnings) {
      logger.error({ error: validationError }, '[EventValidation] Unexpected validation error');
    }

    return {
      success: false,
      error: validationError,
    };
  }
}

/**
 * Validate and parse multiple Polymarket events with batch error handling
 * Implements Requirements 2.1, 2.2, 2.4, 7.1, 7.2
 */
export function validatePolymarketEvents(
  data: unknown,
  options: Partial<EventParsingOptions> = {}
): EventValidationResult<z.infer<typeof EventsApiResponseSchema>> {
  const logger = getLogger();
  const opts: EventParsingOptions = {
    strict: false,
    allowPartialData: true,
    skipMalformedMarkets: true,
    logWarnings: true,
    ...options,
  };

  try {
    // Ensure data is an array
    if (!Array.isArray(data)) {
      return {
        success: false,
        error: {
          type: 'malformed_data',
          message: 'Expected array of events, received: ' + typeof data,
          suggestions: ['Ensure the API response contains an array of events'],
        },
      };
    }

    // First attempt: strict validation of entire array
    if (opts.strict) {
      const validatedEvents = EventsApiResponseSchema.parse(data);
      return {
        success: true,
        data: validatedEvents,
      };
    }

    // Second attempt: validate each event individually with error recovery
    const validEvents: z.infer<typeof PolymarketEventSchema>[] = [];
    const warnings: string[] = [];
    let hasErrors = false;

    for (let i = 0; i < data.length; i++) {
      const eventData = data[i];
      const eventResult = validatePolymarketEvent(eventData, {
        ...opts,
        logWarnings: false, // We'll handle logging at the batch level
      });

      if (eventResult.success && eventResult.data) {
        validEvents.push(eventResult.data);
      } else {
        hasErrors = true;
        const errorMsg = `Event at index ${i}: ${eventResult.error?.message || 'Unknown error'}`;
        warnings.push(errorMsg);

        if (opts.logWarnings) {
          logger.warn({
            eventIndex: i,
            eventId: typeof eventData === 'object' && eventData !== null && 'id' in eventData ? eventData.id : 'unknown',
            error: eventResult.error,
          }, '[EventValidation] Failed to validate event in batch');
        }

        // If partial data is allowed, continue processing other events
        if (!opts.allowPartialData) {
          return {
            success: false,
            error: {
              type: 'schema_validation',
              message: `Batch validation failed at event ${i}: ${eventResult.error?.message}`,
              path: [`[${i}]`],
              originalError: eventResult.error,
            },
          };
        }
      }
    }

    // Return results based on what we were able to validate
    if (validEvents.length === 0 && hasErrors) {
      return {
        success: false,
        error: {
          type: 'schema_validation',
          message: 'No valid events found in batch',
          suggestions: [
            'Check if the events API response format has changed',
            'Enable partial data parsing to recover valid events',
            'Verify network connectivity and API availability',
          ],
        },
        warnings,
      };
    }

    return {
      success: true,
      data: validEvents,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

  } catch (error) {
    const validationError: EventValidationError = {
      type: 'parsing_error',
      message: `Unexpected error during batch event validation: ${(error as Error).message}`,
      originalError: error,
    };

    if (opts.logWarnings) {
      logger.error({ error: validationError }, '[EventValidation] Unexpected batch validation error');
    }

    return {
      success: false,
      error: validationError,
    };
  }
}

/**
 * Validate a single Polymarket market within event context
 * Implements Requirements 2.3, 2.5, 7.1, 7.2
 */
export function validatePolymarketMarket(
  data: unknown,
  options: Partial<EventParsingOptions> = {}
): EventValidationResult<z.infer<typeof PolymarketMarketSchema>> {
  const logger = getLogger();
  const opts: EventParsingOptions = {
    strict: false,
    allowPartialData: true,
    skipMalformedMarkets: false,
    logWarnings: true,
    ...options,
  };

  try {
    const result = PolymarketMarketSchema.safeParse(data);
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    // Handle validation errors with detailed reporting
    const validationError = createEventValidationError(result.error, 'market');
    
    if (opts.logWarnings) {
      logger.warn({
        error: validationError,
        marketId: typeof data === 'object' && data !== null && 'id' in data ? data.id : 'unknown',
      }, '[EventValidation] Market validation failed');
    }

    return {
      success: false,
      error: validationError,
    };

  } catch (error) {
    const validationError: EventValidationError = {
      type: 'parsing_error',
      message: `Unexpected error during market validation: ${(error as Error).message}`,
      originalError: error,
    };

    return {
      success: false,
      error: validationError,
    };
  }
}

/**
 * Validate Polymarket tags array
 * Implements Requirements 2.2, 2.4, 7.1
 */
export function validatePolymarketTags(
  data: unknown,
  options: Partial<EventParsingOptions> = {}
): EventValidationResult<z.infer<typeof PolymarketTagSchema>[]> {
  const logger = getLogger();
  const opts: EventParsingOptions = {
    strict: false,
    allowPartialData: true,
    skipMalformedMarkets: false,
    logWarnings: true,
    ...options,
  };

  try {
    if (!Array.isArray(data)) {
      return {
        success: false,
        error: {
          type: 'malformed_data',
          message: 'Expected array of tags, received: ' + typeof data,
        },
      };
    }

    const validTags: z.infer<typeof PolymarketTagSchema>[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const tagResult = PolymarketTagSchema.safeParse(data[i]);
      
      if (tagResult.success) {
        validTags.push(tagResult.data);
      } else {
        const errorMsg = `Tag at index ${i}: ${tagResult.error.issues[0]?.message || 'Unknown error'}`;
        warnings.push(errorMsg);

        if (opts.logWarnings) {
          logger.warn({
            tagIndex: i,
            error: tagResult.error.issues[0],
          }, '[EventValidation] Tag validation failed');
        }

        if (!opts.allowPartialData) {
          return {
            success: false,
            error: {
              type: 'schema_validation',
              message: errorMsg,
              path: [`tags[${i}]`],
            },
          };
        }
      }
    }

    return {
      success: true,
      data: validTags,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

  } catch (error) {
    return {
      success: false,
      error: {
        type: 'parsing_error',
        message: `Unexpected error during tags validation: ${(error as Error).message}`,
        originalError: error,
      },
    };
  }
}

// ============================================================================
// Helper Functions for Error Recovery and Partial Validation
// ============================================================================

/**
 * Attempt partial event validation with error recovery
 * Implements Requirements 7.1, 7.2, 7.5
 */
function attemptPartialEventValidation(
  data: unknown,
  zodError: z.ZodError,
  options: EventParsingOptions
): EventValidationResult<z.infer<typeof PolymarketEventSchema>> {
  const logger = getLogger();

  try {
    if (typeof data !== 'object' || data === null) {
      return {
        success: false,
        error: {
          type: 'malformed_data',
          message: 'Event data is not an object',
        },
      };
    }

    const eventData = data as Record<string, unknown>;
    
    // Try to extract core required fields
    const coreFields = ['id', 'title', 'active', 'markets'];
    const missingCore = coreFields.filter(field => !(field in eventData));
    
    if (missingCore.length > 0) {
      return {
        success: false,
        error: {
          type: 'missing_required_fields',
          message: `Missing required fields: ${missingCore.join(', ')}`,
          suggestions: [
            'Verify the events API response format',
            'Check if the API version has changed',
          ],
        },
      };
    }

    // Attempt to create a minimal valid event with defaults
    const partialEvent = createPartialEventWithDefaults(eventData, options);
    
    if (partialEvent) {
      if (options.logWarnings) {
        logger.warn({
          eventId: eventData.id,
          zodError: zodError.issues.slice(0, 3), // Log first 3 issues
        }, '[EventValidation] Using partial event data with defaults');
      }

      return {
        success: true,
        data: partialEvent,
        warnings: [`Partial event validation used defaults for missing/invalid fields`],
      };
    }

    return {
      success: false,
      error: {
        type: 'schema_validation',
        message: 'Could not recover partial event data',
        originalError: zodError,
      },
    };

  } catch (error) {
    return {
      success: false,
      error: {
        type: 'parsing_error',
        message: `Error during partial validation: ${(error as Error).message}`,
        originalError: error,
      },
    };
  }
}

/**
 * Create a partial event with safe defaults for missing fields
 */
function createPartialEventWithDefaults(
  eventData: Record<string, unknown>,
  options: EventParsingOptions
): z.infer<typeof PolymarketEventSchema> | null {
  try {
    // Validate and clean markets array
    let validMarkets: z.infer<typeof PolymarketMarketSchema>[] = [];
    
    if (Array.isArray(eventData.markets)) {
      for (const marketData of eventData.markets) {
        const marketResult = validatePolymarketMarket(marketData, {
          ...options,
          logWarnings: false,
        });
        
        if (marketResult.success && marketResult.data) {
          validMarkets.push(marketResult.data);
        } else if (!options.skipMalformedMarkets) {
          return null; // Fail if we can't skip malformed markets
        }
      }
    }

    // Validate and clean tags array
    let validTags: z.infer<typeof PolymarketTagSchema>[] = [];
    
    if (Array.isArray(eventData.tags)) {
      const tagsResult = validatePolymarketTags(eventData.tags, {
        ...options,
        logWarnings: false,
      });
      
      if (tagsResult.success && tagsResult.data) {
        validTags = tagsResult.data;
      }
    }

    // Create event with safe defaults
    const now = new Date().toISOString();
    
    const partialEvent: z.infer<typeof PolymarketEventSchema> = {
      // Core Event Data (required)
      id: String(eventData.id || ''),
      ticker: String(eventData.ticker || ''),
      slug: String(eventData.slug || eventData.id || ''),
      title: String(eventData.title || 'Unknown Event'),
      description: String(eventData.description || ''),
      resolutionSource: String(eventData.resolutionSource || ''),
      
      // Event Status (with safe defaults)
      active: Boolean(eventData.active),
      closed: Boolean(eventData.closed),
      archived: Boolean(eventData.archived),
      new: Boolean(eventData.new),
      featured: Boolean(eventData.featured),
      restricted: Boolean(eventData.restricted),
      
      // Temporal Data (with safe defaults)
      startDate: String(eventData.startDate || now),
      creationDate: String(eventData.creationDate || now),
      endDate: String(eventData.endDate || now),
      createdAt: String(eventData.createdAt || now),
      updatedAt: String(eventData.updatedAt || now),
      
      // Event Metrics (with safe defaults)
      liquidity: Number(eventData.liquidity) || 0,
      volume: Number(eventData.volume) || 0,
      openInterest: Number(eventData.openInterest) || 0,
      competitive: Number(eventData.competitive) || 0,
      volume24hr: Number(eventData.volume24hr) || 0,
      volume1wk: Number(eventData.volume1wk) || 0,
      volume1mo: Number(eventData.volume1mo) || 0,
      volume1yr: Number(eventData.volume1yr) || 0,
      
      // Event Configuration (with safe defaults)
      enableOrderBook: Boolean(eventData.enableOrderBook),
      liquidityClob: Number(eventData.liquidityClob) || 0,
      negRisk: Boolean(eventData.negRisk),
      negRiskMarketID: eventData.negRiskMarketID ? String(eventData.negRiskMarketID) : undefined,
      commentCount: Number(eventData.commentCount) || 0,
      
      // Visual Elements (optional)
      image: eventData.image ? String(eventData.image) : undefined,
      icon: eventData.icon ? String(eventData.icon) : undefined,
      
      // Nested Markets and Tags (validated above)
      markets: validMarkets,
      tags: validTags,
      
      // Event-Specific Configuration (with safe defaults)
      cyom: Boolean(eventData.cyom),
      showAllOutcomes: Boolean(eventData.showAllOutcomes),
      showMarketImages: Boolean(eventData.showMarketImages),
      enableNegRisk: Boolean(eventData.enableNegRisk),
      automaticallyActive: Boolean(eventData.automaticallyActive),
      gmpChartMode: String(eventData.gmpChartMode || ''),
      negRiskAugmented: Boolean(eventData.negRiskAugmented),
      cumulativeMarkets: Boolean(eventData.cumulativeMarkets),
      pendingDeployment: Boolean(eventData.pendingDeployment),
      deploying: Boolean(eventData.deploying),
      requiresTranslation: Boolean(eventData.requiresTranslation),
    };

    // Final validation of the constructed event
    const finalResult = PolymarketEventSchema.safeParse(partialEvent);
    
    return finalResult.success ? finalResult.data : null;

  } catch (error) {
    return null;
  }
}

/**
 * Create detailed validation error from Zod error
 */
function createEventValidationError(
  zodError: z.ZodError,
  context: 'event' | 'market' | 'tag'
): EventValidationError {
  const firstIssue = zodError.issues[0];
  
  if (!firstIssue) {
    return {
      type: 'schema_validation',
      message: `Unknown validation error for ${context}`,
    };
  }

  const suggestions: string[] = [];
  
  // Add context-specific suggestions
  if (context === 'event') {
    suggestions.push(
      'Verify the events API response format matches the expected structure',
      'Check if required fields like id, title, and markets are present',
      'Enable partial data parsing to recover from validation errors'
    );
  } else if (context === 'market') {
    suggestions.push(
      'Verify market data contains required fields like id, question, and volume',
      'Check if numeric fields contain valid numbers',
      'Ensure boolean fields contain true/false values'
    );
  } else if (context === 'tag') {
    suggestions.push(
      'Verify tag data contains required fields like id and label',
      'Check if tag IDs are positive integers',
      'Ensure tag labels are non-empty strings'
    );
  }

  return {
    type: 'schema_validation',
    message: firstIssue.message,
    field: firstIssue.path.join('.'),
    path: firstIssue.path.map(String),
    originalError: zodError,
    suggestions,
  };
}

// ============================================================================
// Exported Type Definitions
// ============================================================================

export type ValidatedPolymarketEvent = z.infer<typeof PolymarketEventSchema>;
export type ValidatedPolymarketMarket = z.infer<typeof PolymarketMarketSchema>;
export type ValidatedPolymarketTag = z.infer<typeof PolymarketTagSchema>;
export type ValidatedEventsApiResponse = z.infer<typeof EventsApiResponseSchema>;
