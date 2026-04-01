/**
 * Memory Context Formatter Tests
 *
 * Unit tests for memory formatting utilities
 */

import { describe, it, expect } from 'vitest';
import {
  formatMemoryContext,
  type MemoryFormatOptions,
  type FormattedMemoryContext,
} from './memory-formatter.js';
import type { AgentMemoryContext, HistoricalSignal } from '../database/memory-retrieval.js';

describe('Memory Context Formatter', () => {
  // Helper to create test signals
  const createSignal = (overrides: Partial<HistoricalSignal> = {}): HistoricalSignal => ({
    agentName: 'TestAgent',
    marketId: 'test-market-123',
    timestamp: new Date('2025-01-15T14:30:00Z'),
    direction: 'YES',
    fairProbability: 0.65,
    confidence: 0.8,
    keyDrivers: ['Driver 1', 'Driver 2'],
    metadata: {},
    ...overrides,
  });

  // Helper to create memory context
  const createMemoryContext = (
    signals: HistoricalSignal[],
    hasHistory: boolean = true
  ): AgentMemoryContext => ({
    agentName: 'TestAgent',
    marketId: 'test-market-123',
    historicalSignals: signals,
    hasHistory,
  });

  describe('Empty Memory Context', () => {
    it('should return "No previous analysis available" for empty history', () => {
      const memory = createMemoryContext([], false);
      const result = formatMemoryContext(memory);

      expect(result.text).toBe('No previous analysis available for this market.');
      expect(result.signalCount).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('should handle memory with hasHistory=false', () => {
      const memory = createMemoryContext([createSignal()], false);
      const result = formatMemoryContext(memory);

      expect(result.text).toBe('No previous analysis available for this market.');
      expect(result.signalCount).toBe(0);
      expect(result.truncated).toBe(false);
    });
  });

  describe('Single Signal Formatting', () => {
    it('should format a single signal correctly', () => {
      const signal = createSignal({
        timestamp: new Date('2025-01-15T14:30:00Z'),
        direction: 'YES',
        fairProbability: 0.65,
        confidence: 0.8,
        keyDrivers: ['Strong polling data', 'Positive market sentiment'],
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).toContain('Previous Analysis History (1 signal)');
      expect(result.text).toContain('Direction: YES');
      expect(result.text).toContain('Fair Probability: 65.0%');
      expect(result.text).toContain('Confidence: 80.0%');
      expect(result.text).toContain('• Strong polling data');
      expect(result.text).toContain('• Positive market sentiment');
      expect(result.signalCount).toBe(1);
      expect(result.truncated).toBe(false);
    });

    it('should format percentages correctly', () => {
      const signal = createSignal({
        fairProbability: 0.123,
        confidence: 0.999,
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).toContain('Fair Probability: 12.3%');
      expect(result.text).toContain('Confidence: 99.9%');
    });

    it('should handle signals with no key drivers', () => {
      const signal = createSignal({
        keyDrivers: [],
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).not.toContain('Key Drivers:');
      expect(result.text).toContain('Direction: YES');
    });

    it('should handle different directions', () => {
      const yesSignal = createSignal({ direction: 'YES' });
      const noSignal = createSignal({ direction: 'NO' });
      const neutralSignal = createSignal({ direction: 'NEUTRAL' });

      const yesResult = formatMemoryContext(createMemoryContext([yesSignal]));
      const noResult = formatMemoryContext(createMemoryContext([noSignal]));
      const neutralResult = formatMemoryContext(createMemoryContext([neutralSignal]));

      expect(yesResult.text).toContain('Direction: YES');
      expect(noResult.text).toContain('Direction: NO');
      expect(neutralResult.text).toContain('Direction: NEUTRAL');
    });
  });

  describe('Multiple Signals Formatting', () => {
    it('should format multiple signals in chronological order', () => {
      const signals = [
        createSignal({
          timestamp: new Date('2025-01-15T10:00:00Z'),
          fairProbability: 0.5,
        }),
        createSignal({
          timestamp: new Date('2025-01-14T10:00:00Z'),
          fairProbability: 0.6,
        }),
        createSignal({
          timestamp: new Date('2025-01-16T10:00:00Z'),
          fairProbability: 0.7,
        }),
      ];

      const memory = createMemoryContext(signals);
      const result = formatMemoryContext(memory);

      expect(result.text).toContain('Previous Analysis History (3 signals)');
      expect(result.signalCount).toBe(3);

      // Verify chronological order (oldest first)
      // New formatter uses "January 14, 2025" format instead of "Jan 14"
      const jan14Index = result.text.indexOf('January 14');
      const jan15Index = result.text.indexOf('January 15');
      const jan16Index = result.text.indexOf('January 16');

      expect(jan14Index).toBeLessThan(jan15Index);
      expect(jan15Index).toBeLessThan(jan16Index);
    });

    it('should show signal count correctly', () => {
      const twoSignals = createMemoryContext([createSignal(), createSignal()]);
      const threeSignals = createMemoryContext([createSignal(), createSignal(), createSignal()]);

      const twoResult = formatMemoryContext(twoSignals);
      const threeResult = formatMemoryContext(threeSignals);

      expect(twoResult.text).toContain('Previous Analysis History (2 signals)');
      expect(threeResult.text).toContain('Previous Analysis History (3 signals)');
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format timestamps in human-readable format by default', () => {
      const signal = createSignal({
        timestamp: new Date('2025-01-15T14:30:00Z'),
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      // New timestamp formatter uses either relative or absolute format
      // For dates in the past, it will use absolute format: "January 15, 2025 at 2:30 PM EST"
      expect(result.text).toMatch(/January \d+, 2025 at \d+:\d+ (AM|PM) (EST|EDT)/);
    });

    it('should format timestamps in ISO format when requested', () => {
      const signal = createSignal({
        timestamp: new Date('2025-01-15T14:30:00Z'),
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory, { dateFormat: 'iso' });

      expect(result.text).toContain('2025-01-15T14:30:00.000Z');
    });

    it('should format timestamps in relative format when requested', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const signal = createSignal({
        timestamp: twoHoursAgo,
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory, { dateFormat: 'relative' });

      expect(result.text).toMatch(/2 hours? ago/);
    });
  });

  describe('Truncation Logic', () => {
    it('should truncate when content exceeds maxLength', () => {
      // Create signals with long key drivers to exceed limit
      const signals = Array.from({ length: 10 }, (_, i) =>
        createSignal({
          timestamp: new Date(`2025-01-${10 + i}T10:00:00Z`),
          keyDrivers: [
            'This is a very long key driver that will help us exceed the maximum length limit',
            'Another long key driver with lots of text to make the formatted output very large',
            'Yet another driver with substantial content to ensure we hit the truncation threshold',
          ],
        })
      );

      const memory = createMemoryContext(signals);
      const result = formatMemoryContext(memory, { maxLength: 500 });

      expect(result.truncated).toBe(true);
      expect(result.text).toContain('[Additional signals truncated for brevity]');
      expect(result.text.length).toBeLessThanOrEqual(550); // Allow some buffer
    });

    it('should not truncate when content is within maxLength', () => {
      const signals = [
        createSignal({
          keyDrivers: ['Short driver'],
        }),
      ];

      const memory = createMemoryContext(signals);
      const result = formatMemoryContext(memory, { maxLength: 1000 });

      expect(result.truncated).toBe(false);
      expect(result.text).not.toContain('[Additional signals truncated for brevity]');
    });

    it('should respect custom maxLength values', () => {
      const signals = Array.from({ length: 5 }, (_, i) =>
        createSignal({
          timestamp: new Date(`2025-01-${10 + i}T10:00:00Z`),
          keyDrivers: ['Driver 1', 'Driver 2', 'Driver 3'],
        })
      );

      const memory = createMemoryContext(signals);

      const shortResult = formatMemoryContext(memory, { maxLength: 200 });
      const longResult = formatMemoryContext(memory, { maxLength: 2000 });

      expect(shortResult.truncated).toBe(true);
      expect(longResult.truncated).toBe(false);
    });
  });

  describe('Metadata Inclusion', () => {
    it('should not include metadata by default', () => {
      const signal = createSignal({
        metadata: { customField: 'value', anotherField: 123 },
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).not.toContain('Metadata:');
      expect(result.text).not.toContain('customField');
    });

    it('should include metadata when requested', () => {
      const signal = createSignal({
        metadata: { customField: 'value', anotherField: 123 },
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory, { includeMetadata: true });

      expect(result.text).toContain('Metadata:');
      expect(result.text).toContain('customField');
      expect(result.text).toContain('value');
    });

    it('should handle empty metadata gracefully', () => {
      const signal = createSignal({
        metadata: {},
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory, { includeMetadata: true });

      expect(result.text).not.toContain('Metadata:');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero probability and confidence', () => {
      const signal = createSignal({
        fairProbability: 0,
        confidence: 0,
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).toContain('Fair Probability: 0.0%');
      expect(result.text).toContain('Confidence: 0.0%');
    });

    it('should handle maximum probability and confidence', () => {
      const signal = createSignal({
        fairProbability: 1,
        confidence: 1,
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).toContain('Fair Probability: 100.0%');
      expect(result.text).toContain('Confidence: 100.0%');
    });

    it('should handle very long key drivers', () => {
      const signal = createSignal({
        keyDrivers: [
          'This is an extremely long key driver that contains a lot of detailed information about the market conditions and various factors that are influencing the analysis and prediction',
        ],
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).toContain('This is an extremely long key driver');
    });

    it('should handle special characters in key drivers', () => {
      const signal = createSignal({
        keyDrivers: [
          'Driver with "quotes"',
          "Driver with 'apostrophes'",
          'Driver with & ampersand',
          'Driver with <brackets>',
        ],
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      expect(result.text).toContain('"quotes"');
      expect(result.text).toContain("'apostrophes'");
      expect(result.text).toContain('& ampersand');
      expect(result.text).toContain('<brackets>');
    });
  });

  describe('Format Options Combinations', () => {
    it('should handle all options together', () => {
      const signal = createSignal({
        timestamp: new Date('2025-01-15T14:30:00Z'),
        metadata: { test: 'value' },
      });

      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory, {
        maxLength: 500,
        includeMetadata: true,
        dateFormat: 'iso',
      });

      expect(result.text).toContain('2025-01-15T14:30:00.000Z');
      expect(result.text).toContain('Metadata:');
      expect(result.text).toContain('test');
    });

    it('should use default options when none provided', () => {
      const signal = createSignal();
      const memory = createMemoryContext([signal]);
      const result = formatMemoryContext(memory);

      // Should use human-readable dates with new timestamp formatter
      // Format will be either relative or absolute depending on age
      expect(result.text).toMatch(/(ago|January|February|March|April|May|June|July|August|September|October|November|December)/);
      // Should not include metadata
      expect(result.text).not.toContain('Metadata:');
      // Should not be truncated (single signal is small)
      expect(result.truncated).toBe(false);
    });
  });

  describe('Chronological Ordering', () => {
    it('should always sort signals oldest to newest', () => {
      // Create signals in random order
      const signals = [
        createSignal({
          timestamp: new Date('2025-01-20T10:00:00Z'),
          fairProbability: 0.8,
        }),
        createSignal({
          timestamp: new Date('2025-01-10T10:00:00Z'),
          fairProbability: 0.5,
        }),
        createSignal({
          timestamp: new Date('2025-01-15T10:00:00Z'),
          fairProbability: 0.6,
        }),
      ];

      const memory = createMemoryContext(signals);
      const result = formatMemoryContext(memory);

      // Extract probabilities in order they appear
      const probMatches = result.text.match(/Fair Probability: (\d+\.\d+)%/g);
      expect(probMatches).toHaveLength(3);
      expect(probMatches![0]).toContain('50.0%'); // Jan 10
      expect(probMatches![1]).toContain('60.0%'); // Jan 15
      expect(probMatches![2]).toContain('80.0%'); // Jan 20
    });
  });
});
