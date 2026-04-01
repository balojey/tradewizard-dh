/**
 * Unit tests for Evolution Tracking Service
 */

import { describe, it, expect } from 'vitest';
import {
  createEvolutionTracker,
  logEvolutionEvents,
  type EvolutionTracker,
  type EvolutionEvent,
} from './evolution-tracker.js';
import type { AgentSignal } from '../models/types.js';
import type { HistoricalSignal } from '../database/memory-retrieval.js';

describe('EvolutionTracker', () => {
  let tracker: EvolutionTracker;

  beforeEach(() => {
    tracker = createEvolutionTracker();
  });

  describe('trackEvolution', () => {
    it('should return empty array when no historical signals exist', () => {
      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Driver 1', 'Driver 2'],
        riskFactors: ['Risk 1'],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, []);

      expect(events).toEqual([]);
    });

    it('should detect direction change from YES to NO', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.80,
        direction: 'NO',
        fairProbability: 0.35,
        keyDrivers: ['Driver 2'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const directionChange = events.find((e) => e.type === 'direction_change');
      expect(directionChange).toBeDefined();
      expect(directionChange?.previousValue).toBe('YES');
      expect(directionChange?.currentValue).toBe('NO');
      expect(directionChange?.magnitude).toBe(1.0);
      expect(directionChange?.description).toContain('YES');
      expect(directionChange?.description).toContain('NO');
    });

    it('should detect direction change from NO to YES', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'NO',
        fairProbability: 0.30,
        confidence: 0.75,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Driver 2'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const directionChange = events.find((e) => e.type === 'direction_change');
      expect(directionChange).toBeDefined();
      expect(directionChange?.previousValue).toBe('NO');
      expect(directionChange?.currentValue).toBe('YES');
    });

    it('should detect direction change from YES to NEUTRAL', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.50,
        direction: 'NEUTRAL',
        fairProbability: 0.50,
        keyDrivers: ['Driver 2'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const directionChange = events.find((e) => e.type === 'direction_change');
      expect(directionChange).toBeDefined();
      expect(directionChange?.previousValue).toBe('YES');
      expect(directionChange?.currentValue).toBe('NEUTRAL');
    });

    it('should NOT detect direction change when direction remains the same', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.80,
        direction: 'YES',
        fairProbability: 0.72,
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const directionChange = events.find((e) => e.type === 'direction_change');
      expect(directionChange).toBeUndefined();
    });

    it('should detect probability shift greater than 10%', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.60,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.75, // 15% increase
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const probabilityShift = events.find((e) => e.type === 'probability_shift');
      expect(probabilityShift).toBeDefined();
      expect(probabilityShift?.previousValue).toBe(0.60);
      expect(probabilityShift?.currentValue).toBe(0.75);
      expect(probabilityShift?.magnitude).toBeCloseTo(0.15, 2);
      expect(probabilityShift?.description).toContain('15.0%');
    });

    it('should detect probability shift in negative direction', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.75,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.60, // 15% decrease
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const probabilityShift = events.find((e) => e.type === 'probability_shift');
      expect(probabilityShift).toBeDefined();
      expect(probabilityShift?.magnitude).toBeCloseTo(0.15, 2);
    });

    it('should NOT detect probability shift less than or equal to 10%', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.60,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.68, // 8% increase
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const probabilityShift = events.find((e) => e.type === 'probability_shift');
      expect(probabilityShift).toBeUndefined();
    });

    it('should detect probability shift exactly at 10% threshold', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.60,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70, // Exactly 10% increase
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const probabilityShift = events.find((e) => e.type === 'probability_shift');
      expect(probabilityShift).toBeUndefined(); // Should NOT trigger (> 0.1, not >= 0.1)
    });

    it('should detect confidence change greater than 0.2', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.60,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85, // 0.25 increase
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const confidenceChange = events.find((e) => e.type === 'confidence_change');
      expect(confidenceChange).toBeDefined();
      expect(confidenceChange?.previousValue).toBe(0.60);
      expect(confidenceChange?.currentValue).toBe(0.85);
      expect(confidenceChange?.magnitude).toBeCloseTo(0.25, 2);
      expect(confidenceChange?.description).toContain('25.0%');
    });

    it('should detect confidence decrease greater than 0.2', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.60, // 0.25 decrease
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const confidenceChange = events.find((e) => e.type === 'confidence_change');
      expect(confidenceChange).toBeDefined();
      expect(confidenceChange?.magnitude).toBeCloseTo(0.25, 2);
    });

    it('should NOT detect confidence change less than or equal to 0.2', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.70,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85, // 0.15 increase
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Driver 1'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const confidenceChange = events.find((e) => e.type === 'confidence_change');
      expect(confidenceChange).toBeUndefined();
    });

    it('should detect reasoning evolution when key drivers change significantly', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Polling data', 'Economic indicators'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Social media sentiment', 'News coverage', 'Expert opinions'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const reasoningEvolution = events.find((e) => e.type === 'reasoning_evolution');
      expect(reasoningEvolution).toBeDefined();
      expect(reasoningEvolution?.previousValue).toEqual(['Polling data', 'Economic indicators']);
      expect(reasoningEvolution?.currentValue).toEqual([
        'Social media sentiment',
        'News coverage',
        'Expert opinions',
      ]);
      expect(reasoningEvolution?.magnitude).toBe(0.5);
      expect(reasoningEvolution?.description).toContain('significantly');
    });

    it('should NOT detect reasoning evolution when key drivers have >50% overlap', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Polling data', 'Economic indicators', 'Historical trends'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Polling data', 'Economic indicators', 'Expert opinions'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const reasoningEvolution = events.find((e) => e.type === 'reasoning_evolution');
      expect(reasoningEvolution).toBeUndefined();
    });

    it('should detect reasoning evolution when one array is empty', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: [],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['New driver'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const reasoningEvolution = events.find((e) => e.type === 'reasoning_evolution');
      expect(reasoningEvolution).toBeDefined();
    });

    it('should NOT detect reasoning evolution when both arrays are empty', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: [],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: [],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const reasoningEvolution = events.find((e) => e.type === 'reasoning_evolution');
      expect(reasoningEvolution).toBeUndefined();
    });

    it('should be case-insensitive when comparing key drivers', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Polling Data', 'Economic Indicators'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['polling data', 'economic indicators'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const reasoningEvolution = events.find((e) => e.type === 'reasoning_evolution');
      expect(reasoningEvolution).toBeUndefined(); // Should not detect change due to case
    });

    it('should trim whitespace when comparing key drivers', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['  Polling data  ', 'Economic indicators'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.70,
        keyDrivers: ['Polling data', 'Economic indicators  '],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      const reasoningEvolution = events.find((e) => e.type === 'reasoning_evolution');
      expect(reasoningEvolution).toBeUndefined(); // Should not detect change due to whitespace
    });

    it('should detect multiple evolution events simultaneously', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.60,
        confidence: 0.60,
        keyDrivers: ['Old driver 1', 'Old driver 2'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85, // +0.25 confidence change
        direction: 'NO', // Direction change
        fairProbability: 0.35, // -0.25 probability shift
        keyDrivers: ['New driver 1', 'New driver 2', 'New driver 3'], // Reasoning evolution
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      expect(events.length).toBe(4); // All 4 types of changes
      expect(events.find((e) => e.type === 'direction_change')).toBeDefined();
      expect(events.find((e) => e.type === 'probability_shift')).toBeDefined();
      expect(events.find((e) => e.type === 'confidence_change')).toBeDefined();
      expect(events.find((e) => e.type === 'reasoning_evolution')).toBeDefined();
    });

    it('should only compare against most recent historical signal', () => {
      const olderSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 7200000), // 2 hours ago
        direction: 'NO',
        fairProbability: 0.30,
        confidence: 0.70,
        keyDrivers: ['Very old driver'],
        metadata: {},
      };

      const recentSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        direction: 'YES',
        fairProbability: 0.70,
        confidence: 0.85,
        keyDrivers: ['Recent driver'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.72, // Small change from recent
        keyDrivers: ['Recent driver'],
        riskFactors: [],
        metadata: {},
      };

      // Pass signals in order (most recent first)
      const events = tracker.trackEvolution(newSignal, [recentSignal, olderSignal]);

      // Should not detect direction change (comparing to recent YES, not older NO)
      const directionChange = events.find((e) => e.type === 'direction_change');
      expect(directionChange).toBeUndefined();
    });

    it('should include all required fields in evolution events', () => {
      const historicalSignal: HistoricalSignal = {
        agentName: 'test_agent',
        marketId: 'market-123',
        timestamp: new Date(Date.now() - 3600000),
        direction: 'YES',
        fairProbability: 0.60,
        confidence: 0.85,
        keyDrivers: ['Driver 1'],
        metadata: {},
      };

      const newSignal: AgentSignal = {
        agentName: 'test_agent',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'NO',
        fairProbability: 0.35,
        keyDrivers: ['Driver 2'],
        riskFactors: [],
        metadata: {},
      };

      const events = tracker.trackEvolution(newSignal, [historicalSignal]);

      expect(events.length).toBeGreaterThan(0);
      events.forEach((event) => {
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('agentName');
        expect(event).toHaveProperty('marketId');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('previousValue');
        expect(event).toHaveProperty('currentValue');
        expect(event).toHaveProperty('magnitude');
        expect(event).toHaveProperty('description');
      });
    });
  });

  describe('logEvolutionEvents', () => {
    it('should not log anything when events array is empty', () => {
      const logs: Array<{ message: string; data: unknown }> = [];
      const mockLogger = (message: string, data: unknown) => {
        logs.push({ message, data });
      };

      logEvolutionEvents([], mockLogger);

      expect(logs.length).toBe(0);
    });

    it('should log all evolution events', () => {
      const events: EvolutionEvent[] = [
        {
          type: 'direction_change',
          agentName: 'test_agent',
          marketId: 'market-123',
          timestamp: Date.now(),
          previousValue: 'YES',
          currentValue: 'NO',
          magnitude: 1.0,
          description: 'Direction changed from YES to NO',
        },
        {
          type: 'probability_shift',
          agentName: 'test_agent',
          marketId: 'market-123',
          timestamp: Date.now(),
          previousValue: 0.70,
          currentValue: 0.35,
          magnitude: 0.35,
          description: 'Fair probability shifted by 35.0%',
        },
      ];

      const logs: Array<{ message: string; data: unknown }> = [];
      const mockLogger = (message: string, data: unknown) => {
        logs.push({ message, data });
      };

      logEvolutionEvents(events, mockLogger);

      expect(logs.length).toBe(2);
      expect(logs[0].message).toContain('direction_change');
      expect(logs[1].message).toContain('probability_shift');
    });

    it('should use console.log by default when no logger provided', () => {
      const events: EvolutionEvent[] = [
        {
          type: 'direction_change',
          agentName: 'test_agent',
          marketId: 'market-123',
          timestamp: Date.now(),
          previousValue: 'YES',
          currentValue: 'NO',
          magnitude: 1.0,
          description: 'Direction changed from YES to NO',
        },
      ];

      // Should not throw
      expect(() => logEvolutionEvents(events)).not.toThrow();
    });
  });
});
