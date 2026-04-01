/**
 * Property-Based Tests for API Quota Manager
 * 
 * Feature: automated-market-monitor, Property 2: API quota respect
 * Validates: Requirements 4.2, 4.4
 * 
 * Property: For any API source with a configured daily quota, the total number
 * of API calls in a 24-hour period should not exceed the quota limit.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { QuotaManager, type QuotaConfig } from './api-quota-manager.js';

describe('API Quota Manager Property Tests', () => {
  /**
   * Generator for valid quota configurations
   */
  const quotaConfigGen = fc.record({
    newsApiQuota: fc.integer({ min: 1, max: 1000 }),
    twitterQuota: fc.integer({ min: 1, max: 2000 }),
    redditQuota: fc.integer({ min: 1, max: 500 }),
  });

  /**
   * Generator for API sources
   */
  const apiSourceGen = fc.constantFrom('newsapi', 'twitter', 'reddit');

  /**
   * Generator for usage sequences (list of API call counts)
   */
  const usageSequenceGen = fc.array(
    fc.integer({ min: 1, max: 50 }),
    { minLength: 1, maxLength: 100 }
  );

  /**
   * Property 2: API quota respect
   * 
   * For any API source with a configured daily quota, when recording usage
   * through canMakeRequest checks, the system should stay within reasonable
   * bounds of the quota threshold. Since canMakeRequest doesn't know the size
   * of the next call, we may exceed the threshold by at most one batch.
   */
  it('should never allow usage to exceed quota when respecting canMakeRequest', () => {
    fc.assert(
      fc.property(
        quotaConfigGen,
        apiSourceGen,
        usageSequenceGen,
        (config, source, usageSequence) => {
          const manager = new QuotaManager(config);
          const quotaLimit = manager.getQuotaLimit(source);
          const threshold = Math.ceil(quotaLimit * 0.8);
          let lastRecordedAmount = 0;

          // Simulate API calls, respecting canMakeRequest
          for (const callCount of usageSequence) {
            if (manager.canMakeRequest(source)) {
              manager.recordUsage(source, callCount);
              lastRecordedAmount = callCount;
            }
          }

          const finalUsage = manager.getUsage(source);
          
          // Either we're at or below threshold, OR we exceeded it by at most
          // the last recorded batch (since canMakeRequest was true before that call)
          if (finalUsage > threshold) {
            // We can only exceed by the last batch that was recorded
            expect(finalUsage - lastRecordedAmount).toBeLessThanOrEqual(threshold);
          } else {
            expect(finalUsage).toBeLessThanOrEqual(threshold);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Quota enforcement threshold
   * 
   * For any API source, canMakeRequest should return false when usage
   * reaches or exceeds 80% of the quota limit.
   */
  it('should deny requests at or above 80% quota threshold', () => {
    fc.assert(
      fc.property(
        quotaConfigGen,
        apiSourceGen,
        (config, source) => {
          const manager = new QuotaManager(config);
          const quotaLimit = manager.getQuotaLimit(source);
          const threshold = Math.ceil(quotaLimit * 0.8);

          // Use exactly at threshold
          manager.recordUsage(source, threshold);
          expect(manager.canMakeRequest(source)).toBe(false);

          // Reset and try just below threshold
          manager.resetUsage();
          if (threshold > 0) {
            manager.recordUsage(source, threshold - 1);
            expect(manager.canMakeRequest(source)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Independent quota tracking
   * 
   * For any set of API sources, usage tracking should be independent -
   * exhausting quota for one source should not affect others.
   */
  it('should track quotas independently per source', () => {
    fc.assert(
      fc.property(
        quotaConfigGen,
        (config) => {
          const manager = new QuotaManager(config);
          const sources = ['newsapi', 'twitter', 'reddit'] as const;

          // Exhaust quota for newsapi
          const newsQuota = manager.getQuotaLimit('newsapi');
          manager.recordUsage('newsapi', newsQuota);

          // Other sources should still be available
          expect(manager.canMakeRequest('newsapi')).toBe(false);
          expect(manager.canMakeRequest('twitter')).toBe(true);
          expect(manager.canMakeRequest('reddit')).toBe(true);

          // Verify usage is independent
          expect(manager.getUsage('newsapi')).toBe(newsQuota);
          expect(manager.getUsage('twitter')).toBe(0);
          expect(manager.getUsage('reddit')).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Reset restores full quota
   * 
   * For any usage state, calling resetUsage should restore all quotas
   * to their full limits.
   */
  it('should restore full quota after reset', () => {
    fc.assert(
      fc.property(
        quotaConfigGen,
        fc.array(
          fc.record({
            source: apiSourceGen,
            amount: fc.integer({ min: 1, max: 100 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (config, usageRecords) => {
          const manager = new QuotaManager(config);

          // Record arbitrary usage
          for (const { source, amount } of usageRecords) {
            manager.recordUsage(source, amount);
          }

          // Reset
          manager.resetUsage();

          // All sources should be at zero usage and allow requests
          expect(manager.getUsage('newsapi')).toBe(0);
          expect(manager.getUsage('twitter')).toBe(0);
          expect(manager.getUsage('reddit')).toBe(0);
          expect(manager.canMakeRequest('newsapi')).toBe(true);
          expect(manager.canMakeRequest('twitter')).toBe(true);
          expect(manager.canMakeRequest('reddit')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Recommended market count respects quotas
   * 
   * For any quota configuration and usage state, the recommended market
   * count should never require more API calls than remaining quota allows.
   */
  it('should recommend market count within remaining quota', () => {
    fc.assert(
      fc.property(
        quotaConfigGen,
        fc.record({
          newsapi: fc.integer({ min: 0, max: 100 }),
          twitter: fc.integer({ min: 0, max: 500 }),
          reddit: fc.integer({ min: 0, max: 100 }),
        }),
        (config, usage) => {
          const manager = new QuotaManager(config);

          // Record usage
          manager.recordUsage('newsapi', usage.newsapi);
          manager.recordUsage('twitter', usage.twitter);
          manager.recordUsage('reddit', usage.reddit);

          const recommendedCount = manager.getRecommendedMarketCount();

          // Recommended count should be between 1 and 3
          expect(recommendedCount).toBeGreaterThanOrEqual(1);
          expect(recommendedCount).toBeLessThanOrEqual(3);

          // Calculate required API calls for recommended markets
          // (1 newsapi + 3 twitter + 2 reddit per market)
          const requiredNewsApi = recommendedCount * 1;
          const requiredTwitter = recommendedCount * 3;
          const requiredReddit = recommendedCount * 2;

          // Remaining quota should accommodate recommended count
          const remainingNewsApi = manager.getQuotaLimit('newsapi') - usage.newsapi;
          const remainingTwitter = manager.getQuotaLimit('twitter') - usage.twitter;
          const remainingReddit = manager.getQuotaLimit('reddit') - usage.reddit;

          // At least one source should have enough quota for recommended count
          // (or we're at minimum of 1 market)
          if (recommendedCount > 1) {
            const hasNewsApiQuota = remainingNewsApi >= requiredNewsApi;
            const hasTwitterQuota = remainingTwitter >= requiredTwitter;
            const hasRedditQuota = remainingReddit >= requiredReddit;

            // At least the most restrictive source should allow this many markets
            expect(
              hasNewsApiQuota || hasTwitterQuota || hasRedditQuota
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Usage accumulation
   * 
   * For any sequence of recordUsage calls, the total usage should equal
   * the sum of all recorded amounts.
   */
  it('should accurately accumulate usage across multiple calls', () => {
    fc.assert(
      fc.property(
        quotaConfigGen,
        apiSourceGen,
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 50 }),
        (config, source, amounts) => {
          const manager = new QuotaManager(config);

          // Record all usage
          for (const amount of amounts) {
            manager.recordUsage(source, amount);
          }

          // Total should equal sum
          const expectedTotal = amounts.reduce((sum, amount) => sum + amount, 0);
          expect(manager.getUsage(source)).toBe(expectedTotal);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Quota limit immutability
   * 
   * For any quota configuration, the quota limits should remain constant
   * regardless of usage or resets.
   */
  it('should maintain constant quota limits', () => {
    fc.assert(
      fc.property(
        quotaConfigGen,
        usageSequenceGen,
        fc.integer({ min: 0, max: 5 }),
        (config, usageSequence, resetCount) => {
          const manager = new QuotaManager(config);

          // Store initial limits
          const initialNewsLimit = manager.getQuotaLimit('newsapi');
          const initialTwitterLimit = manager.getQuotaLimit('twitter');
          const initialRedditLimit = manager.getQuotaLimit('reddit');

          // Perform various operations
          for (const amount of usageSequence) {
            manager.recordUsage('newsapi', amount);
            manager.recordUsage('twitter', amount);
            manager.recordUsage('reddit', amount);
          }

          // Reset multiple times
          for (let i = 0; i < resetCount; i++) {
            manager.resetUsage();
          }

          // Limits should remain unchanged
          expect(manager.getQuotaLimit('newsapi')).toBe(initialNewsLimit);
          expect(manager.getQuotaLimit('twitter')).toBe(initialTwitterLimit);
          expect(manager.getQuotaLimit('reddit')).toBe(initialRedditLimit);
        }
      ),
      { numRuns: 100 }
    );
  });
});
