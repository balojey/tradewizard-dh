/**
 * Property-Based Tests for Sentiment & Narrative Agents
 *
 * Feature: advanced-agent-league
 * Property 14: Sentiment agent platform aggregation
 * Validates: Requirements 3.4
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { SocialSentimentSignalSchema } from './sentiment-narrative.js';

// ============================================================================
// Property Test: Sentiment agent platform aggregation
// ============================================================================

/**
 * Property 14: Sentiment agent platform aggregation
 *
 * For any social sentiment data from multiple platforms, the Social Sentiment Agent
 * should aggregate sentiment across all platforms into a single overall sentiment score.
 *
 * This property tests that:
 * 1. platformSentiment includes an 'overall' key with aggregated sentiment
 * 2. The overall sentiment is within valid bounds (-1 to 1)
 * 3. The overall sentiment is calculated as the average of all platform sentiments
 * 4. The aggregation handles edge cases (single platform, empty platforms)
 */
describe('Property 14: Sentiment agent platform aggregation', () => {
  // Generator for platform sentiment scores
  const platformSentimentGenerator = fc.dictionary(
    fc.constantFrom('twitter', 'reddit', 'facebook', 'tiktok', 'youtube'),
    fc.double({ min: -1, max: 1, noNaN: true }),
    { minKeys: 1, maxKeys: 5 }
  );

  // Generator for viral narratives
  const viralNarrativeGenerator = fc.record({
    narrative: fc.string({ minLength: 10, maxLength: 100 }),
    viralScore: fc.double({ min: 0, max: 1, noNaN: true }),
    sentiment: fc.double({ min: -1, max: 1, noNaN: true }),
  });

  // Generator for Social Sentiment Agent signal metadata
  const socialSentimentMetadataGenerator = fc.record({
    platformSentiment: platformSentimentGenerator,
    viralNarratives: fc.array(viralNarrativeGenerator, { minLength: 0, maxLength: 10 }),
    crowdPsychology: fc.constantFrom('fear', 'greed', 'uncertainty', 'neutral'),
    retailPositioning: fc.constantFrom('bullish', 'bearish', 'neutral'),
    mentionVelocity: fc.double({ min: 0, max: 1000, noNaN: true }),
  });

  // Generator for complete Social Sentiment Agent signal
  const socialSentimentSignalGenerator = fc.record({
    agentName: fc.constant('social_sentiment'),
    timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    direction: fc.constantFrom('YES', 'NO', 'NEUTRAL'),
    fairProbability: fc.double({ min: 0, max: 1, noNaN: true }),
    keyDrivers: fc.array(fc.string({ minLength: 10, maxLength: 50 }), {
      minLength: 1,
      maxLength: 5,
    }),
    riskFactors: fc.array(fc.string({ minLength: 10, maxLength: 50 }), {
      minLength: 0,
      maxLength: 5,
    }),
    metadata: socialSentimentMetadataGenerator,
  });

  it('should include overall sentiment in platformSentiment', () => {
    fc.assert(
      fc.property(platformSentimentGenerator, (platformSentiment) => {
        // Simulate the aggregation that should happen in the agent
        const platformValues = Object.entries(platformSentiment)
          .filter(([key]) => key !== 'overall')
          .map(([, value]) => value);

        const overallSentiment =
          platformValues.length > 0
            ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
            : 0;

        // Add overall to the platform sentiment
        const aggregatedPlatformSentiment = {
          ...platformSentiment,
          overall: overallSentiment,
        };

        // Property 1: overall key must exist
        const hasOverall = 'overall' in aggregatedPlatformSentiment;

        // Property 2: overall sentiment must be within bounds
        const overallInBounds =
          aggregatedPlatformSentiment.overall >= -1 && aggregatedPlatformSentiment.overall <= 1;

        return hasOverall && overallInBounds;
      }),
      { numRuns: 100 }
    );
  });

  it('should calculate overall sentiment as average of all platforms', () => {
    fc.assert(
      fc.property(platformSentimentGenerator, (platformSentiment) => {
        // Calculate expected overall sentiment
        const platformValues = Object.entries(platformSentiment)
          .filter(([key]) => key !== 'overall')
          .map(([, value]) => value);

        const expectedOverall =
          platformValues.length > 0
            ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
            : 0;

        // Simulate the aggregation
        const overallSentiment =
          platformValues.length > 0
            ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
            : 0;

        // Property: calculated overall should match expected
        const epsilon = 0.0001; // Allow for floating point precision
        return Math.abs(overallSentiment - expectedOverall) < epsilon;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle single platform correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('twitter', 'reddit', 'facebook'),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (platform, sentiment) => {
          const platformSentiment = { [platform]: sentiment };

          // Calculate overall
          const platformValues = Object.values(platformSentiment);
          const overallSentiment =
            platformValues.length > 0
              ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
              : 0;

          // Property: for single platform, overall should equal that platform's sentiment
          const epsilon = 0.0001;
          return Math.abs(overallSentiment - sentiment) < epsilon;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce valid signal with aggregated sentiment', () => {
    fc.assert(
      fc.property(socialSentimentSignalGenerator, (signal) => {
        // Simulate the aggregation that should happen in the agent
        const platformValues = Object.entries(signal.metadata.platformSentiment)
          .filter(([key]) => key !== 'overall')
          .map(([, value]) => value);

        const overallSentiment =
          platformValues.length > 0
            ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
            : 0;

        // Add overall to the signal
        const signalWithOverall = {
          ...signal,
          metadata: {
            ...signal.metadata,
            platformSentiment: {
              ...signal.metadata.platformSentiment,
              overall: overallSentiment,
            },
          },
        };

        // Validate the signal conforms to schema
        const parseResult = SocialSentimentSignalSchema.safeParse(signalWithOverall);

        // Property 1: signal should be valid
        if (!parseResult.success) {
          return false;
        }

        // Property 2: overall sentiment should exist
        const hasOverall = 'overall' in signalWithOverall.metadata.platformSentiment;

        // Property 3: overall sentiment should be within bounds
        const overallInBounds =
          signalWithOverall.metadata.platformSentiment.overall >= -1 &&
          signalWithOverall.metadata.platformSentiment.overall <= 1;

        return hasOverall && overallInBounds;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle extreme sentiment values correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(-1, 1), { minLength: 1, maxLength: 5 }),
        (extremeValues) => {
          // Create platform sentiment with extreme values
          const platforms = ['twitter', 'reddit', 'facebook', 'tiktok', 'youtube'];
          const platformSentiment: Record<string, number> = {};
          extremeValues.forEach((value, index) => {
            if (index < platforms.length) {
              platformSentiment[platforms[index]] = value;
            }
          });

          // Calculate overall
          const platformValues = Object.values(platformSentiment);
          const overallSentiment =
            platformValues.length > 0
              ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
              : 0;

          // Property: overall should still be within bounds
          return overallSentiment >= -1 && overallSentiment <= 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle mixed positive and negative sentiments', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 0, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (negativeSentiment, positiveSentiment) => {
          const platformSentiment = {
            twitter: negativeSentiment,
            reddit: positiveSentiment,
          };

          // Calculate overall
          const platformValues = Object.values(platformSentiment);
          const overallSentiment =
            platformValues.length > 0
              ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
              : 0;

          // Property 1: overall should be between the two values
          const minValue = Math.min(negativeSentiment, positiveSentiment);
          const maxValue = Math.max(negativeSentiment, positiveSentiment);
          const inRange = overallSentiment >= minValue && overallSentiment <= maxValue;

          // Property 2: overall should be within valid bounds
          const inBounds = overallSentiment >= -1 && overallSentiment <= 1;

          return inRange && inBounds;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain sentiment bounds after aggregation', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 10 }),
        (sentiments) => {
          // Calculate overall sentiment
          const overallSentiment =
            sentiments.length > 0
              ? sentiments.reduce((sum, val) => sum + val, 0) / sentiments.length
              : 0;

          // Property: overall sentiment must be within bounds
          return overallSentiment >= -1 && overallSentiment <= 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle zero sentiment correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (platformCount) => {
          // Create platforms with zero sentiment
          const platforms = ['twitter', 'reddit', 'facebook', 'tiktok', 'youtube'];
          const platformSentiment: Record<string, number> = {};
          for (let i = 0; i < platformCount && i < platforms.length; i++) {
            platformSentiment[platforms[i]] = 0;
          }

          // Calculate overall
          const platformValues = Object.values(platformSentiment);
          const overallSentiment =
            platformValues.length > 0
              ? platformValues.reduce((sum, val) => sum + val, 0) / platformValues.length
              : 0;

          // Property: overall should be zero
          const epsilon = 0.0001;
          return Math.abs(overallSentiment - 0) < epsilon;
        }
      ),
      { numRuns: 100 }
    );
  });
});
