import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  formatRelativeTime,
  formatAbsoluteTime,
  formatTimestampBatch,
} from './timestamp-formatter.js';

describe('Timestamp Formatter', () => {
  describe('formatRelativeTime', () => {
    it('should format "just now" for timestamps less than 1 minute old', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-15T15:29:30Z').toISOString();
      const result = formatRelativeTime(timestamp, now);
      expect(result).toBe('just now');
    });

    it('should format minutes ago for timestamps 1-59 minutes old', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-15T15:25:00Z').toISOString();
      const result = formatRelativeTime(timestamp, now);
      expect(result).toBe('5 minutes ago');
    });

    it('should format hours ago for timestamps 1-23 hours old', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-15T13:30:00Z').toISOString();
      const result = formatRelativeTime(timestamp, now);
      expect(result).toBe('2 hours ago');
    });

    it('should format days ago for timestamps 1-6 days old', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-12T15:30:00Z').toISOString();
      const result = formatRelativeTime(timestamp, now);
      expect(result).toBe('3 days ago');
    });

    it('should handle singular forms correctly', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      
      const oneMinute = new Date('2024-01-15T15:29:00Z').toISOString();
      expect(formatRelativeTime(oneMinute, now)).toBe('1 minute ago');
      
      const oneHour = new Date('2024-01-15T14:30:00Z').toISOString();
      expect(formatRelativeTime(oneHour, now)).toBe('1 hour ago');
      
      const oneDay = new Date('2024-01-14T15:30:00Z').toISOString();
      expect(formatRelativeTime(oneDay, now)).toBe('1 day ago');
    });
  });

  describe('formatAbsoluteTime', () => {
    it('should format absolute time with full month names', () => {
      const timestamp = '2024-01-15T20:30:00Z'; // 3:30 PM EST
      const result = formatAbsoluteTime(timestamp);
      expect(result).toMatch(/^January 15, 2024 at \d{1,2}:\d{2} (AM|PM) (EST|EDT)$/);
    });

    it('should use 12-hour clock format', () => {
      const timestamp = '2024-01-15T20:30:00Z'; // 3:30 PM EST
      const result = formatAbsoluteTime(timestamp);
      expect(result).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
      expect(result).not.toMatch(/\d{2}:\d{2}:\d{2}/); // No seconds
    });

    it('should include timezone abbreviation', () => {
      const timestamp = '2024-01-15T20:30:00Z';
      const result = formatAbsoluteTime(timestamp);
      expect(result).toMatch(/(EST|EDT)$/);
    });

    it('should handle DST transitions correctly', () => {
      // March 10, 2024 - Spring forward (EDT)
      const springTimestamp = '2024-03-10T15:00:00Z';
      const springResult = formatAbsoluteTime(springTimestamp);
      expect(springResult).toContain('EDT');

      // November 3, 2024 - Fall back (EST)
      const fallTimestamp = '2024-11-03T15:00:00Z';
      const fallResult = formatAbsoluteTime(fallTimestamp);
      expect(fallResult).toContain('EST');
    });
  });

  describe('formatTimestamp', () => {
    it('should use relative format for timestamps less than 7 days old', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-12T15:30:00Z').toISOString(); // 3 days ago
      const result = formatTimestamp(timestamp, { referenceTime: now });
      
      expect(result.formatType).toBe('relative');
      expect(result.formatted).toBe('3 days ago');
      expect(result.original).toBe(timestamp);
    });

    it('should use absolute format for timestamps 7 or more days old', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-01T20:30:00Z').toISOString(); // 14 days ago
      const result = formatTimestamp(timestamp, { referenceTime: now });
      
      expect(result.formatType).toBe('absolute');
      expect(result.formatted).toMatch(/^January 1, 2024 at/);
      expect(result.original).toBe(timestamp);
    });

    it('should handle exactly 7 days old as absolute', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-08T15:30:00Z').toISOString(); // Exactly 7 days
      const result = formatTimestamp(timestamp, { referenceTime: now });
      
      expect(result.formatType).toBe('absolute');
    });

    it('should return "unknown time" for null timestamps', () => {
      const result = formatTimestamp(null);
      expect(result.formatted).toBe('unknown time');
      expect(result.formatType).toBe('fallback');
    });

    it('should return "unknown time" for undefined timestamps', () => {
      const result = formatTimestamp(undefined);
      expect(result.formatted).toBe('unknown time');
      expect(result.formatType).toBe('fallback');
    });

    it('should return "invalid timestamp" for malformed timestamps', () => {
      const result = formatTimestamp('not-a-timestamp');
      expect(result.formatted).toBe('invalid timestamp');
      expect(result.formatType).toBe('fallback');
    });

    it('should handle Unix timestamp numbers', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-15T13:30:00Z').getTime(); // 2 hours ago
      const result = formatTimestamp(timestamp, { referenceTime: now });
      
      expect(result.formatType).toBe('relative');
      expect(result.formatted).toBe('2 hours ago');
    });

    it('should respect custom timezone option', () => {
      const timestamp = '2024-01-15T20:30:00Z';
      const result = formatTimestamp(timestamp, { 
        timezone: 'America/Los_Angeles',
        relativeThresholdDays: 0 // Force absolute format
      });
      
      expect(result.formatType).toBe('absolute');
      expect(result.formatted).toMatch(/(PST|PDT)$/);
    });

    it('should respect custom threshold option', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamp = new Date('2024-01-12T15:30:00Z').toISOString(); // 3 days ago
      
      // With default threshold (7 days), should be relative
      const relativeResult = formatTimestamp(timestamp, { referenceTime: now });
      expect(relativeResult.formatType).toBe('relative');
      
      // With threshold of 2 days, should be absolute
      const absoluteResult = formatTimestamp(timestamp, { 
        referenceTime: now,
        relativeThresholdDays: 2
      });
      expect(absoluteResult.formatType).toBe('absolute');
    });
  });

  describe('formatTimestampBatch', () => {
    it('should format multiple timestamps efficiently', () => {
      const now = new Date('2024-01-15T15:30:00Z');
      const timestamps = [
        new Date('2024-01-15T15:25:00Z').toISOString(), // 5 minutes ago
        new Date('2024-01-01T20:30:00Z').toISOString(), // 14 days ago
        null,
        'invalid',
      ];
      
      const results = formatTimestampBatch(timestamps, { referenceTime: now });
      
      expect(results).toHaveLength(4);
      expect(results[0].formatType).toBe('relative');
      expect(results[0].formatted).toBe('5 minutes ago');
      expect(results[1].formatType).toBe('absolute');
      expect(results[1].formatted).toMatch(/^January 1, 2024 at/);
      expect(results[2].formatted).toBe('unknown time');
      expect(results[3].formatted).toBe('invalid timestamp');
    });
  });
});
