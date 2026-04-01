/**
 * Tests for timestamp formatter configuration and feature flag
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatTimestamp,
  getConfig,
  setConfig,
  resetConfig,
  DEFAULT_CONFIG,
} from './timestamp-formatter.js';

describe('Timestamp Formatter Configuration', () => {
  // Store original config
  let originalConfig: ReturnType<typeof getConfig>;

  beforeEach(() => {
    originalConfig = getConfig();
  });

  afterEach(() => {
    // Restore original config after each test
    setConfig(originalConfig);
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = getConfig();
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('timezone');
      expect(config).toHaveProperty('relativeThresholdDays');
    });

    it('should return default values on initialization', () => {
      resetConfig();
      const config = getConfig();
      expect(config.timezone).toBe('America/New_York');
      expect(config.relativeThresholdDays).toBe(7);
    });
  });

  describe('setConfig', () => {
    it('should update configuration at runtime', () => {
      setConfig({ timezone: 'America/Los_Angeles' });
      const config = getConfig();
      expect(config.timezone).toBe('America/Los_Angeles');
    });

    it('should merge partial configuration', () => {
      const originalThreshold = getConfig().relativeThresholdDays;
      setConfig({ timezone: 'UTC' });
      const config = getConfig();
      expect(config.timezone).toBe('UTC');
      expect(config.relativeThresholdDays).toBe(originalThreshold);
    });

    it('should allow disabling formatting', () => {
      setConfig({ enabled: false });
      const config = getConfig();
      expect(config.enabled).toBe(false);
    });
  });

  describe('resetConfig', () => {
    it('should reset to environment defaults', () => {
      setConfig({ timezone: 'UTC', relativeThresholdDays: 14 });
      resetConfig();
      const config = getConfig();
      // Should reset to env values or defaults
      expect(config.timezone).toBeDefined();
      expect(config.relativeThresholdDays).toBeDefined();
    });
  });

  describe('Feature Flag - Formatting Disabled', () => {
    it('should return ISO 8601 format when formatting is disabled', () => {
      setConfig({ enabled: false });
      
      const timestamp = '2024-01-15T15:30:00Z';
      const result = formatTimestamp(timestamp);
      
      // Should return ISO 8601 format
      expect(result.formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.formatType).toBe('fallback');
    });

    it('should return human-readable format when formatting is enabled', () => {
      setConfig({ enabled: true });
      
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const result = formatTimestamp(twoHoursAgo.toISOString());
      
      // Should return human-readable format
      expect(result.formatted).toContain('ago');
      expect(result.formatType).toBe('relative');
    });
  });

  describe('Feature Flag - Gradual Rollout Support', () => {
    it('should support runtime toggle for gradual rollout', () => {
      const timestamp = '2024-01-15T15:30:00Z';
      
      // Enable formatting
      setConfig({ enabled: true });
      const enabledResult = formatTimestamp(timestamp);
      expect(enabledResult.formatType).not.toBe('fallback');
      
      // Disable formatting (simulate rollback)
      setConfig({ enabled: false });
      const disabledResult = formatTimestamp(timestamp);
      expect(disabledResult.formatType).toBe('fallback');
      expect(disabledResult.formatted).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom timezone configuration', () => {
      setConfig({ enabled: true, timezone: 'America/Los_Angeles' });
      
      const oldTimestamp = new Date('2024-01-01T15:30:00Z').toISOString();
      const result = formatTimestamp(oldTimestamp);
      
      // Should use absolute format for old timestamp
      expect(result.formatType).toBe('absolute');
      // Should contain PST or PDT (Los Angeles timezone)
      expect(result.formatted).toMatch(/PST|PDT/);
    });

    it('should respect custom threshold configuration', () => {
      setConfig({ enabled: true, relativeThresholdDays: 14 });
      
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const result = formatTimestamp(tenDaysAgo.toISOString());
      
      // With 14-day threshold, 10 days ago should use relative format
      expect(result.formatType).toBe('relative');
      expect(result.formatted).toContain('days ago');
    });
  });

  describe('Environment Variable Support', () => {
    it('should load configuration from environment on initialization', () => {
      resetConfig();
      const config = getConfig();
      
      // Should have loaded from .env or defaults
      expect(config.enabled).toBeDefined();
      expect(config.timezone).toBeDefined();
      expect(config.relativeThresholdDays).toBeGreaterThan(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain backward compatibility when disabled', () => {
      setConfig({ enabled: false });
      
      const timestamps = [
        '2024-01-15T15:30:00Z',
        '2024-12-25T00:00:00Z',
        new Date().toISOString(),
      ];
      
      timestamps.forEach(timestamp => {
        const result = formatTimestamp(timestamp);
        // All should return ISO 8601 format
        expect(result.formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });
  });
});
