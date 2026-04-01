/**
 * Unit tests for API Quota Manager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QuotaManager, createQuotaManager, type QuotaConfig } from './api-quota-manager.js';

describe('QuotaManager', () => {
  let quotaManager: QuotaManager;
  let config: QuotaConfig;

  beforeEach(() => {
    config = {
      newsApiQuota: 100,
      twitterQuota: 500,
      redditQuota: 60,
    };
    quotaManager = new QuotaManager(config);
  });

  describe('usage tracking', () => {
    it('should start with zero usage', () => {
      expect(quotaManager.getUsage('newsapi')).toBe(0);
      expect(quotaManager.getUsage('twitter')).toBe(0);
      expect(quotaManager.getUsage('reddit')).toBe(0);
    });

    it('should record single API call', () => {
      quotaManager.recordUsage('newsapi');
      expect(quotaManager.getUsage('newsapi')).toBe(1);
    });

    it('should record multiple API calls', () => {
      quotaManager.recordUsage('newsapi', 5);
      expect(quotaManager.getUsage('newsapi')).toBe(5);
    });

    it('should track usage independently per source', () => {
      quotaManager.recordUsage('newsapi', 10);
      quotaManager.recordUsage('twitter', 20);
      quotaManager.recordUsage('reddit', 5);

      expect(quotaManager.getUsage('newsapi')).toBe(10);
      expect(quotaManager.getUsage('twitter')).toBe(20);
      expect(quotaManager.getUsage('reddit')).toBe(5);
    });

    it('should accumulate usage across multiple calls', () => {
      quotaManager.recordUsage('newsapi', 10);
      quotaManager.recordUsage('newsapi', 15);
      quotaManager.recordUsage('newsapi', 5);

      expect(quotaManager.getUsage('newsapi')).toBe(30);
    });

    it('should return 0 for unknown sources', () => {
      expect(quotaManager.getUsage('unknown')).toBe(0);
    });
  });

  describe('quota enforcement', () => {
    it('should allow requests when under 80% of quota', () => {
      quotaManager.recordUsage('newsapi', 70); // 70% of 100
      expect(quotaManager.canMakeRequest('newsapi')).toBe(true);
    });

    it('should deny requests when at 80% of quota', () => {
      quotaManager.recordUsage('newsapi', 80); // 80% of 100
      expect(quotaManager.canMakeRequest('newsapi')).toBe(false);
    });

    it('should deny requests when over 80% of quota', () => {
      quotaManager.recordUsage('newsapi', 90); // 90% of 100
      expect(quotaManager.canMakeRequest('newsapi')).toBe(false);
    });

    it('should enforce quota independently per source', () => {
      quotaManager.recordUsage('newsapi', 90); // Over quota
      quotaManager.recordUsage('twitter', 100); // Under quota (20% of 500)

      expect(quotaManager.canMakeRequest('newsapi')).toBe(false);
      expect(quotaManager.canMakeRequest('twitter')).toBe(true);
    });

    it('should allow requests for sources with no quota limit', () => {
      expect(quotaManager.canMakeRequest('unknown')).toBe(true);
    });
  });

  describe('recommended market count calculation', () => {
    it('should recommend 3 markets when all quotas are available', () => {
      expect(quotaManager.getRecommendedMarketCount()).toBe(3);
    });

    it('should reduce recommendation when newsapi quota is low', () => {
      // NewsAPI: 1 call per market, quota 100
      // If we've used 98, we can only do 2 more markets
      quotaManager.recordUsage('newsapi', 98);
      expect(quotaManager.getRecommendedMarketCount()).toBe(2);
    });

    it('should reduce recommendation when twitter quota is low', () => {
      // Twitter: 3 calls per market, quota 500
      // If we've used 494, we can only do 2 more markets (6 calls)
      quotaManager.recordUsage('twitter', 494);
      expect(quotaManager.getRecommendedMarketCount()).toBe(2);
    });

    it('should reduce recommendation when reddit quota is low', () => {
      // Reddit: 2 calls per market, quota 60
      // If we've used 58, we can only do 1 more market (2 calls)
      quotaManager.recordUsage('reddit', 58);
      expect(quotaManager.getRecommendedMarketCount()).toBe(1);
    });

    it('should recommend at least 1 market even when quotas are exhausted', () => {
      quotaManager.recordUsage('newsapi', 100);
      quotaManager.recordUsage('twitter', 500);
      quotaManager.recordUsage('reddit', 60);

      expect(quotaManager.getRecommendedMarketCount()).toBe(1);
    });

    it('should cap recommendation at 3 markets', () => {
      // Even with huge quotas, max is 3
      const largeQuotaManager = new QuotaManager({
        newsApiQuota: 10000,
        twitterQuota: 10000,
        redditQuota: 10000,
      });

      expect(largeQuotaManager.getRecommendedMarketCount()).toBe(3);
    });

    it('should use most restrictive quota as limiting factor', () => {
      // Reddit is most restrictive: 60 quota / 2 calls per market = 30 markets max
      // But we cap at 3, so should still be 3
      expect(quotaManager.getRecommendedMarketCount()).toBe(3);

      // Now make reddit very restrictive
      quotaManager.recordUsage('reddit', 56); // 4 remaining / 2 = 2 markets
      expect(quotaManager.getRecommendedMarketCount()).toBe(2);
    });
  });

  describe('quota reset', () => {
    it('should clear all usage counters', () => {
      quotaManager.recordUsage('newsapi', 50);
      quotaManager.recordUsage('twitter', 200);
      quotaManager.recordUsage('reddit', 30);

      quotaManager.resetUsage();

      expect(quotaManager.getUsage('newsapi')).toBe(0);
      expect(quotaManager.getUsage('twitter')).toBe(0);
      expect(quotaManager.getUsage('reddit')).toBe(0);
    });

    it('should update last reset timestamp', () => {
      const beforeReset = quotaManager.getLastReset();
      
      // Wait a tiny bit to ensure timestamp changes
      setTimeout(() => {
        quotaManager.resetUsage();
        const afterReset = quotaManager.getLastReset();
        
        expect(afterReset.getTime()).toBeGreaterThanOrEqual(beforeReset.getTime());
      }, 10);
    });

    it('should allow requests after reset', () => {
      quotaManager.recordUsage('newsapi', 90);
      expect(quotaManager.canMakeRequest('newsapi')).toBe(false);

      quotaManager.resetUsage();
      expect(quotaManager.canMakeRequest('newsapi')).toBe(true);
    });
  });

  describe('configuration loading', () => {
    it('should load configuration from constructor', () => {
      const customConfig: QuotaConfig = {
        newsApiQuota: 200,
        twitterQuota: 1000,
        redditQuota: 120,
      };

      const customManager = new QuotaManager(customConfig);

      expect(customManager.getQuotaLimit('newsapi')).toBe(200);
      expect(customManager.getQuotaLimit('twitter')).toBe(1000);
      expect(customManager.getQuotaLimit('reddit')).toBe(120);
    });

    it('should use default values for missing config', () => {
      const partialConfig: QuotaConfig = {
        newsApiQuota: 200,
      };

      const manager = new QuotaManager(partialConfig);

      expect(manager.getQuotaLimit('newsapi')).toBe(200);
      expect(manager.getQuotaLimit('twitter')).toBe(500); // default
      expect(manager.getQuotaLimit('reddit')).toBe(60); // default
    });

    it('should create manager from environment variables', () => {
      // Set environment variables
      process.env.NEWS_API_DAILY_QUOTA = '150';
      process.env.TWITTER_API_DAILY_QUOTA = '750';
      process.env.REDDIT_API_DAILY_QUOTA = '90';

      const manager = createQuotaManager();

      expect(manager.getQuotaLimit('newsapi')).toBe(150);
      expect(manager.getQuotaLimit('twitter')).toBe(750);
      expect(manager.getQuotaLimit('reddit')).toBe(90);

      // Clean up
      delete process.env.NEWS_API_DAILY_QUOTA;
      delete process.env.TWITTER_API_DAILY_QUOTA;
      delete process.env.REDDIT_API_DAILY_QUOTA;
    });

    it('should use defaults when environment variables are not set', () => {
      // Ensure env vars are not set
      delete process.env.NEWS_API_DAILY_QUOTA;
      delete process.env.TWITTER_API_DAILY_QUOTA;
      delete process.env.REDDIT_API_DAILY_QUOTA;

      const manager = createQuotaManager();

      expect(manager.getQuotaLimit('newsapi')).toBe(100);
      expect(manager.getQuotaLimit('twitter')).toBe(500);
      expect(manager.getQuotaLimit('reddit')).toBe(60);
    });
  });
});
