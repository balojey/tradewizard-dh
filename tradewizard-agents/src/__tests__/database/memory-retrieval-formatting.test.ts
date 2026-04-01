/**
 * Memory Retrieval Formatting Integration Test
 * 
 * This test verifies that memory retrieval integrates correctly with
 * human-readable timestamp formatting for agent consumption.
 * 
 * Requirements: 7.1, 7.2, 8.3
 */

import { describe, it, expect } from 'vitest';
import type { AgentMemoryContext, HistoricalSignal } from './memory-retrieval.js';
import { formatMemoryContext } from '../utils/memory-formatter.js';

describe('Memory Retrieval Formatting Integration', () => {
  it('should format historical signals with human-readable timestamps', () => {
    // Create a mock historical signal as would be returned by memory retrieval
    const historicalSignal: HistoricalSignal = {
      agentName: 'News Analysis Agent',
      marketId: 'test-market-123',
      timestamp: new Date('2025-02-11T12:00:00Z'), // 5 hours ago from test time
      direction: 'YES',
      fairProbability: 0.65,
      confidence: 0.8,
      keyDrivers: [
        'Recent polling shows strong momentum',
        'Key endorsement from major figure',
      ],
      metadata: {},
    };

    // Create memory context as would be returned by memory retrieval service
    const memoryContext: AgentMemoryContext = {
      agentName: 'News Analysis Agent',
      marketId: 'test-market-123',
      historicalSignals: [historicalSignal],
      hasHistory: true,
    };

    // Format the memory context for agent consumption
    const formatted = formatMemoryContext(memoryContext);

    // Verify the formatted output contains human-readable elements
    expect(formatted.text).toContain('Previous Analysis History (1 signal)');
    expect(formatted.text).toContain('Direction: YES');
    expect(formatted.text).toContain('Fair Probability: 65.0%');
    expect(formatted.text).toContain('Confidence: 80.0%');
    expect(formatted.text).toContain('Key Drivers:');
    expect(formatted.text).toContain('Recent polling shows strong momentum');
    
    // Verify timestamp is formatted (not ISO 8601)
    // Should NOT contain ISO format patterns
    expect(formatted.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    
    // Should contain human-readable time reference
    // (either relative like "5 hours ago" or absolute like "February 11, 2025")
    expect(formatted.text).toMatch(/Analysis from/);
    
    expect(formatted.signalCount).toBe(1);
    expect(formatted.truncated).toBe(false);
  });

  it('should handle multiple historical signals with consistent timestamp formatting', () => {
    const signals: HistoricalSignal[] = [
      {
        agentName: 'Market Microstructure Agent',
        marketId: 'test-market-456',
        timestamp: new Date('2025-02-01T10:00:00Z'), // 10 days ago
        direction: 'NO',
        fairProbability: 0.35,
        confidence: 0.7,
        keyDrivers: ['Low liquidity concerns'],
        metadata: {},
      },
      {
        agentName: 'Market Microstructure Agent',
        marketId: 'test-market-456',
        timestamp: new Date('2025-02-08T14:00:00Z'), // 3 days ago
        direction: 'NO',
        fairProbability: 0.32,
        confidence: 0.75,
        keyDrivers: ['Liquidity improved but still bearish'],
        metadata: {},
      },
    ];

    const memoryContext: AgentMemoryContext = {
      agentName: 'Market Microstructure Agent',
      marketId: 'test-market-456',
      historicalSignals: signals,
      hasHistory: true,
    };

    const formatted = formatMemoryContext(memoryContext);

    // Verify multiple signals are formatted
    expect(formatted.text).toContain('Previous Analysis History (2 signals)');
    expect(formatted.signalCount).toBe(2);
    
    // Verify both signals have human-readable timestamps
    const analysisMatches = formatted.text.match(/Analysis from/g);
    expect(analysisMatches).toHaveLength(2);
    
    // Verify no ISO 8601 timestamps in output
    expect(formatted.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should handle empty memory context gracefully', () => {
    const memoryContext: AgentMemoryContext = {
      agentName: 'Risk Assessment Agent',
      marketId: 'new-market-789',
      historicalSignals: [],
      hasHistory: false,
    };

    const formatted = formatMemoryContext(memoryContext);

    expect(formatted.text).toBe('No previous analysis available for this market.');
    expect(formatted.signalCount).toBe(0);
    expect(formatted.truncated).toBe(false);
  });

  it('should maintain consistency with agent context formatter', () => {
    // This test ensures that memory formatting is consistent with
    // the agent context formatter used in agent nodes
    
    const signal: HistoricalSignal = {
      agentName: 'Sentiment Analysis Agent',
      marketId: 'test-market-999',
      timestamp: new Date('2025-02-10T16:30:00Z'),
      direction: 'NEUTRAL',
      fairProbability: 0.5,
      confidence: 0.6,
      keyDrivers: ['Mixed signals from social media'],
      metadata: {},
    };

    const memoryContext: AgentMemoryContext = {
      agentName: 'Sentiment Analysis Agent',
      marketId: 'test-market-999',
      historicalSignals: [signal],
      hasHistory: true,
    };

    const formatted = formatMemoryContext(memoryContext);

    // Verify formatting matches expected agent context format
    expect(formatted.text).toContain('Analysis from');
    expect(formatted.text).toContain('Direction: NEUTRAL');
    expect(formatted.text).toContain('Fair Probability: 50.0%');
    expect(formatted.text).toContain('Confidence: 60.0%');
    expect(formatted.text).toContain('• Mixed signals from social media');
  });
});
