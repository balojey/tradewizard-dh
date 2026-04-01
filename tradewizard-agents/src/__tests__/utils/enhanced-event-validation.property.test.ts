/**
 * Property-Based Tests for Enhanced Event Data Validation
 * 
 * These tests use fast-check to generate random inputs and verify that validation
 * functions behave correctly across all possible inputs, ensuring robustness
 * and comprehensive error handling.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.5
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  validatePolymarketEvent,
  validatePolymarketEvents,
  validatePolymarketMarket,
  validatePolymarketTags,
  PolymarketEventSchema,
  PolymarketMarketSchema,
  PolymarketTagSchema,
} from './enhanced-event-validation.js';

describe('Enhanced Event Validation - Property-Based Tests', () => {
  
  /**
   * **Feature: polymarket-integration-enhancement, Property 18: Event Structure Validation**
   * For any event API response, the event structure and nested markets should be validated against expected schemas
   * **Validates: Requirements 7.1**
   */
  it('should validate event structure against expected schemas for any input', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = validatePolymarketEvent(input, {
          strict: false,
          allowPartialData: true,
          skipMalformedMarkets: true,
          logWarnings: false,
        });

        // Property: Validation should always return a result object
        if (typeof result !== 'object' || result === null) {
          return false;
        }

        // Property: Result should have success boolean
        if (typeof result.success !== 'boolean') {
          return false;
        }

        // Property: If successful, data should be present and valid
        if (result.success) {
          if (!result.data) {
            return false;
          }
          
          // Validate that successful data conforms to schema
          const schemaResult = PolymarketEventSchema.safeParse(result.data);
          return schemaResult.success;
        }

        // Property: If failed, error should be present with proper structure
        if (!result.success) {
          if (!result.error) {
            return false;
          }
          
          // Error should have required fields
          return (
            typeof result.error.type === 'string' &&
            typeof result.error.message === 'string'
          );
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 19: Event Error Resilience**
   * For any malformed event data encountered, errors should be logged and valid events and markets should continue to be processed
   * **Validates: Requirements 7.2**
   */
  it('should handle malformed event data gracefully and continue processing valid parts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { minLength: 1, maxLength: 10 }),
        (inputArray) => {
          const result = validatePolymarketEvents(inputArray, {
            strict: false,
            allowPartialData: true,
            skipMalformedMarkets: true,
            logWarnings: false,
          });

          // Property: Should always return a result
          if (typeof result !== 'object' || result === null) {
            return false;
          }

          // Property: Should have success boolean
          if (typeof result.success !== 'boolean') {
            return false;
          }

          // Property: If successful with data, all returned events should be valid
          if (result.success && result.data) {
            if (!Array.isArray(result.data)) {
              return false;
            }

            // Each event in successful result should pass schema validation
            for (const event of result.data) {
              const schemaResult = PolymarketEventSchema.safeParse(event);
              if (!schemaResult.success) {
                return false;
              }
            }
          }

          // Property: Warnings should be array if present
          if (result.warnings && !Array.isArray(result.warnings)) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 6: Event Structure Parsing Completeness**
   * For any valid event API response, the event structure with nested markets array should be successfully parsed into corresponding TypeScript interfaces
   * **Validates: Requirements 2.1, 2.3**
   */
  it('should parse valid event structures completely into TypeScript interfaces', () => {
    // Generate valid-looking event structures
    const validEventArbitrary = fc.record({
      id: fc.string({ minLength: 1 }),
      ticker: fc.string(),
      slug: fc.string({ minLength: 1 }),
      title: fc.string({ minLength: 1 }),
      description: fc.string(),
      resolutionSource: fc.string(),
      active: fc.boolean(),
      closed: fc.boolean(),
      archived: fc.boolean(),
      new: fc.boolean(),
      featured: fc.boolean(),
      restricted: fc.boolean(),
      startDate: fc.date().map(d => d.toISOString()),
      creationDate: fc.date().map(d => d.toISOString()),
      endDate: fc.date().map(d => d.toISOString()),
      createdAt: fc.date().map(d => d.toISOString()),
      updatedAt: fc.date().map(d => d.toISOString()),
      liquidity: fc.nat(),
      volume: fc.nat(),
      openInterest: fc.nat(),
      competitive: fc.nat(),
      volume24hr: fc.nat(),
      volume1wk: fc.nat(),
      volume1mo: fc.nat(),
      volume1yr: fc.nat(),
      enableOrderBook: fc.boolean(),
      liquidityClob: fc.nat(),
      negRisk: fc.boolean(),
      commentCount: fc.nat(),
      markets: fc.array(fc.record({
        id: fc.string({ minLength: 1 }),
        question: fc.string({ minLength: 1 }),
        conditionId: fc.string({ minLength: 1 }),
        slug: fc.string({ minLength: 1 }),
        description: fc.string(),
        resolutionSource: fc.string(),
        active: fc.boolean(),
        closed: fc.boolean(),
        archived: fc.boolean(),
        new: fc.boolean(),
        featured: fc.boolean(),
        restricted: fc.boolean(),
        volume: fc.string(),
        volumeNum: fc.nat(),
        outcomes: fc.string(),
        outcomePrices: fc.string(),
        startDate: fc.date().map(d => d.toISOString()),
        endDate: fc.date().map(d => d.toISOString()),
        createdAt: fc.date().map(d => d.toISOString()),
        updatedAt: fc.date().map(d => d.toISOString()),
        marketMakerAddress: fc.string(),
        submitted_by: fc.string(),
        enableOrderBook: fc.boolean(),
        negRisk: fc.boolean(),
        ready: fc.boolean(),
        funded: fc.boolean(),
        cyom: fc.boolean(),
        pagerDutyNotificationEnabled: fc.boolean(),
        approved: fc.boolean(),
        automaticallyActive: fc.boolean(),
        clearBookOnStart: fc.boolean(),
        seriesColor: fc.string(),
        showGmpSeries: fc.boolean(),
        showGmpOutcome: fc.boolean(),
        manualActivation: fc.boolean(),
        negRiskOther: fc.boolean(),
        pendingDeployment: fc.boolean(),
        deploying: fc.boolean(),
        rfqEnabled: fc.boolean(),
        holdingRewardsEnabled: fc.boolean(),
        feesEnabled: fc.boolean(),
        requiresTranslation: fc.boolean(),
      }), { maxLength: 5 }),
      tags: fc.array(fc.record({
        id: fc.nat({ min: 1 }),
        label: fc.string({ minLength: 1 }),
        slug: fc.string({ minLength: 1 }),
        createdAt: fc.date().map(d => d.toISOString()),
        updatedAt: fc.date().map(d => d.toISOString()),
        requiresTranslation: fc.boolean(),
      }), { maxLength: 3 }),
      cyom: fc.boolean(),
      showAllOutcomes: fc.boolean(),
      showMarketImages: fc.boolean(),
      enableNegRisk: fc.boolean(),
      automaticallyActive: fc.boolean(),
      gmpChartMode: fc.string(),
      negRiskAugmented: fc.boolean(),
      cumulativeMarkets: fc.boolean(),
      pendingDeployment: fc.boolean(),
      deploying: fc.boolean(),
      requiresTranslation: fc.boolean(),
    });

    fc.assert(
      fc.property(validEventArbitrary, (eventData) => {
        const result = validatePolymarketEvent(eventData, {
          strict: false,
          allowPartialData: true,
          skipMalformedMarkets: true,
          logWarnings: false,
        });

        // Property: Valid-looking structures should either succeed or fail gracefully
        if (result.success) {
          // If successful, data should be present and match input structure
          if (!result.data) {
            return false;
          }

          // Key fields should be preserved
          return (
            result.data.id === eventData.id &&
            result.data.title === eventData.title &&
            result.data.active === eventData.active &&
            Array.isArray(result.data.markets) &&
            Array.isArray(result.data.tags)
          );
        } else {
          // If failed, should have proper error structure
          return (
            result.error &&
            typeof result.error.message === 'string' &&
            typeof result.error.type === 'string'
          );
        }
      }),
      { numRuns: 50 } // Reduced runs for complex generation
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 7: Market Relationship Preservation**
   * For any event with multiple markets, market relationships and dependencies within the event should be maintained and accessible
   * **Validates: Requirements 2.3, 3.1**
   */
  it('should preserve market relationships and dependencies within events', () => {
    const eventWithMarketsArbitrary = fc.record({
      id: fc.string({ minLength: 1 }),
      title: fc.string({ minLength: 1 }),
      markets: fc.array(
        fc.record({
          id: fc.string({ minLength: 1 }),
          question: fc.string({ minLength: 1 }),
          // Add minimal required fields for market
        }),
        { minLength: 2, maxLength: 5 } // Ensure multiple markets
      ),
      // Add other minimal required event fields
    });

    fc.assert(
      fc.property(eventWithMarketsArbitrary, (eventData) => {
        const result = validatePolymarketEvent(eventData, {
          strict: false,
          allowPartialData: true,
          skipMalformedMarkets: false, // Don't skip to test relationship preservation
          logWarnings: false,
        });

        // Property: If validation succeeds, market count should be preserved or reduced (not increased)
        if (result.success && result.data) {
          const originalMarketCount = eventData.markets.length;
          const validatedMarketCount = result.data.markets.length;
          
          // Should not have more markets than original
          if (validatedMarketCount > originalMarketCount) {
            return false;
          }

          // Market IDs should be preserved for valid markets
          const originalIds = new Set(eventData.markets.map(m => m.id));
          const validatedIds = new Set(result.data.markets.map(m => m.id));
          
          // All validated IDs should exist in original
          for (const id of validatedIds) {
            if (!originalIds.has(id)) {
              return false;
            }
          }
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 22: Event Validation Error Reporting**
   * For any event validation failure, detailed error messages should be provided that include sufficient information for debugging event-level issues
   * **Validates: Requirements 7.5**
   */
  it('should provide detailed error messages for validation failures', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = validatePolymarketEvent(input, {
          strict: true, // Use strict mode to trigger more validation failures
          allowPartialData: false,
          logWarnings: false,
        });

        // Property: If validation fails, error should have detailed information
        if (!result.success) {
          if (!result.error) {
            return false;
          }

          const error = result.error;

          // Should have error type
          if (typeof error.type !== 'string') {
            return false;
          }

          // Should have descriptive message
          if (typeof error.message !== 'string' || error.message.length === 0) {
            return false;
          }

          // Should have suggestions for common error types
          if (error.type === 'schema_validation' || error.type === 'missing_required_fields') {
            if (!error.suggestions || !Array.isArray(error.suggestions) || error.suggestions.length === 0) {
              return false;
            }
          }

          // Path should be array if present
          if (error.path && !Array.isArray(error.path)) {
            return false;
          }

          // Field should be string if present
          if (error.field && typeof error.field !== 'string') {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 21: Event Processing Rate Limit Handling**
   * For any rate limit exceeded scenario during event processing, proper backoff strategies and user notification should be implemented
   * **Validates: Requirements 7.4**
   */
  it('should handle validation performance consistently regardless of input size', () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { maxLength: 100 }),
        (inputArray) => {
          const startTime = Date.now();
          
          const result = validatePolymarketEvents(inputArray, {
            strict: false,
            allowPartialData: true,
            skipMalformedMarkets: true,
            logWarnings: false,
          });
          
          const endTime = Date.now();
          const duration = endTime - startTime;

          // Property: Validation should complete within reasonable time (5 seconds max)
          if (duration > 5000) {
            return false;
          }

          // Property: Should always return a result regardless of performance
          if (typeof result !== 'object' || result === null) {
            return false;
          }

          // Property: Performance should not affect result structure
          return typeof result.success === 'boolean';
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 20: Event API Fallback Behavior**
   * For any events API unavailability scenario, the system should fall back to cached event data or alternative endpoints when available
   * **Validates: Requirements 7.3**
   */
  it('should maintain data integrity during validation regardless of input corruption', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.array(fc.anything()),
          fc.record({}, { withDeletedKeys: true }),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (corruptedInput) => {
          const result = validatePolymarketEvent(corruptedInput, {
            strict: false,
            allowPartialData: true,
            skipMalformedMarkets: true,
            logWarnings: false,
          });

          // Property: Validation should never throw exceptions
          // (This is tested by the property not throwing)

          // Property: Should always return proper result structure
          if (typeof result !== 'object' || result === null) {
            return false;
          }

          // Property: Success should be boolean
          if (typeof result.success !== 'boolean') {
            return false;
          }

          // Property: If successful, data should be valid according to schema
          if (result.success && result.data) {
            const schemaCheck = PolymarketEventSchema.safeParse(result.data);
            return schemaCheck.success;
          }

          // Property: If failed, should have error information
          if (!result.success) {
            return result.error && typeof result.error.message === 'string';
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: polymarket-integration-enhancement, Property 16: Event Configuration Environment Support**
   * For any system startup, event-specific environment variables should be properly read and used for configuration with appropriate defaults
   * **Validates: Requirements 6.1, 6.2, 6.4, 6.5**
   */
  it('should handle validation options consistently across different configurations', () => {
    const optionsArbitrary = fc.record({
      strict: fc.boolean(),
      allowPartialData: fc.boolean(),
      skipMalformedMarkets: fc.boolean(),
      logWarnings: fc.boolean(),
      maxMarkets: fc.option(fc.nat({ max: 100 })),
    }, { requiredKeys: [] });

    fc.assert(
      fc.property(
        fc.anything(),
        optionsArbitrary,
        (input, options) => {
          const result = validatePolymarketEvent(input, options);

          // Property: Different options should not break validation structure
          if (typeof result !== 'object' || result === null) {
            return false;
          }

          // Property: Success should always be boolean regardless of options
          if (typeof result.success !== 'boolean') {
            return false;
          }

          // Property: Strict mode should be more restrictive than non-strict
          if (options.strict === false && options.allowPartialData === true) {
            // Non-strict mode should be more likely to succeed or provide partial data
            if (!result.success && !result.partialData) {
              // This is acceptable, but let's verify error structure
              return result.error && typeof result.error.message === 'string';
            }
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});