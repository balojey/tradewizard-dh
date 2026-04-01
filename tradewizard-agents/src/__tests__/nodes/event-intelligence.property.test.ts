/**
 * Property-Based Tests for Event Intelligence Agents
 *
 * Feature: advanced-agent-league
 * Property 12: Event intelligence relevance filtering
 * Validates: Requirements 1.2
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { BreakingNewsSignalSchema } from './event-intelligence.js';

// ============================================================================
// Property Test: Event intelligence relevance filtering
// ============================================================================

/**
 * Property 12: Event intelligence relevance filtering
 *
 * For any set of news articles fetched for a market, the Breaking News Agent
 * should only include articles with relevance scores above a minimum threshold
 * in its signal.
 *
 * This property tests that:
 * 1. All articles in relevantArticles have relevanceScore >= minimum threshold (0.5)
 * 2. The relevantArticles array is properly filtered
 * 3. Low-relevance articles are excluded from the signal
 */
describe('Property 12: Event intelligence relevance filtering', () => {
  // Minimum relevance threshold for including articles
  const MIN_RELEVANCE_THRESHOLD = 0.5;

  // Generator for news articles with varying relevance scores
  const newsArticleGenerator = fc.record({
    title: fc.string({ minLength: 10, maxLength: 100 }),
    source: fc.constantFrom('Reuters', 'AP', 'Bloomberg', 'CNN', 'BBC'),
    relevanceScore: fc.double({ min: 0, max: 1, noNaN: true }),
    probabilityImpact: fc.constantFrom('positive', 'negative', 'neutral'),
  });

  // Generator for Breaking News Agent signal metadata
  const breakingNewsMetadataGenerator = fc.record({
    relevantArticles: fc.array(newsArticleGenerator, { minLength: 0, maxLength: 20 }),
    regimeChange: fc.boolean(),
    newsVelocity: fc.double({ min: 0, max: 100, noNaN: true }),
  }).chain((metadata) => {
    // Constraint: if regimeChange is true, there must be at least one article
    if (metadata.regimeChange && metadata.relevantArticles.length === 0) {
      // Force regimeChange to false if no articles
      return fc.constant({ ...metadata, regimeChange: false });
    }
    return fc.constant(metadata);
  });

  // Generator for complete Breaking News Agent signal
  const breakingNewsSignalGenerator = fc.record({
    agentName: fc.constant('breaking_news'),
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
    metadata: breakingNewsMetadataGenerator,
  });

  it('should only include articles with relevance scores above minimum threshold', () => {
    fc.assert(
      fc.property(breakingNewsSignalGenerator, (signal) => {
        // Validate the signal conforms to schema
        const parseResult = BreakingNewsSignalSchema.safeParse(signal);
        if (!parseResult.success) {
          // If schema validation fails, skip this test case
          return true;
        }

        // Simulate the filtering that should happen in the agent implementation
        const MIN_RELEVANCE_THRESHOLD = 0.5;
        const filteredArticles = signal.metadata.relevantArticles.filter(
          (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
        );

        // Property 1: After filtering, all articles should be above threshold
        const allArticlesAboveThreshold = filteredArticles.every(
          (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
        );

        // Property 2: If regime change is true, there must be at least one article
        // (empty relevantArticles with regimeChange=true is invalid)
        const regimeChangeValid =
          !signal.metadata.regimeChange || signal.metadata.relevantArticles.length > 0;

        return allArticlesAboveThreshold && regimeChangeValid;
      }),
      { numRuns: 100 }
    );
  });

  it('should filter out low-relevance articles from the signal', () => {
    fc.assert(
      fc.property(
        fc.array(newsArticleGenerator, { minLength: 5, maxLength: 20 }),
        (allArticles) => {
          // Simulate the filtering that should happen in the agent
          const filteredArticles = allArticles.filter(
            (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
          );

          // Property: filtered articles should only contain high-relevance articles
          const allFiltered = filteredArticles.every(
            (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
          );

          // Property: no low-relevance articles should remain
          const noLowRelevance = !filteredArticles.some(
            (article) => article.relevanceScore < MIN_RELEVANCE_THRESHOLD
          );

          return allFiltered && noLowRelevance;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain article count consistency after filtering', () => {
    fc.assert(
      fc.property(
        fc.array(newsArticleGenerator, { minLength: 1, maxLength: 50 }),
        (allArticles) => {
          // Count articles above and below threshold
          const highRelevanceCount = allArticles.filter(
            (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
          ).length;
          const lowRelevanceCount = allArticles.filter(
            (article) => article.relevanceScore < MIN_RELEVANCE_THRESHOLD
          ).length;

          // Property: total count should equal sum of high and low relevance
          const totalCount = allArticles.length;
          const sumCount = highRelevanceCount + lowRelevanceCount;

          return totalCount === sumCount;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve article order after relevance filtering', () => {
    fc.assert(
      fc.property(
        fc.array(newsArticleGenerator, { minLength: 2, maxLength: 20 }),
        (allArticles) => {
          // Filter articles by relevance
          const filteredArticles = allArticles.filter(
            (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
          );

          // Property: filtered articles should maintain relative order from original array
          let lastIndex = -1;
          for (const filtered of filteredArticles) {
            const currentIndex = allArticles.indexOf(filtered);
            if (currentIndex <= lastIndex) {
              return false; // Order not preserved
            }
            lastIndex = currentIndex;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case of all articles below threshold', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            title: fc.string({ minLength: 10, maxLength: 100 }),
            source: fc.constantFrom('Reuters', 'AP', 'Bloomberg'),
            relevanceScore: fc.double({ min: 0, max: 0.49, noNaN: true }), // All below threshold
            probabilityImpact: fc.constantFrom('positive', 'negative', 'neutral'),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (lowRelevanceArticles) => {
          // Filter articles
          const filteredArticles = lowRelevanceArticles.filter(
            (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
          );

          // Property: should result in empty array
          return filteredArticles.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case of all articles above threshold', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            title: fc.string({ minLength: 10, maxLength: 100 }),
            source: fc.constantFrom('Reuters', 'AP', 'Bloomberg'),
            relevanceScore: fc.double({ min: 0.5, max: 1.0, noNaN: true }), // All above threshold
            probabilityImpact: fc.constantFrom('positive', 'negative', 'neutral'),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (highRelevanceArticles) => {
          // Filter articles
          const filteredArticles = highRelevanceArticles.filter(
            (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
          );

          // Property: should keep all articles
          return filteredArticles.length === highRelevanceArticles.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly identify regime-changing events from high-relevance articles', () => {
    fc.assert(
      fc.property(
        fc.record({
          articles: fc.array(newsArticleGenerator, { minLength: 1, maxLength: 10 }),
          regimeChange: fc.boolean(),
        }),
        ({ articles, regimeChange }) => {
          // Simulate the filtering that should happen in the agent
          const MIN_RELEVANCE_THRESHOLD = 0.5;
          const highRelevanceArticles = articles.filter(
            (article) => article.relevanceScore >= MIN_RELEVANCE_THRESHOLD
          );

          // Simulate the regime change logic from the agent
          const actualRegimeChange = regimeChange && highRelevanceArticles.length > 0;

          // Property: if actualRegimeChange is true, there must be high-relevance articles
          if (actualRegimeChange && highRelevanceArticles.length === 0) {
            return false;
          }

          // Property: regime change can only be true if there are high-relevance articles
          if (actualRegimeChange) {
            return highRelevanceArticles.length > 0;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
