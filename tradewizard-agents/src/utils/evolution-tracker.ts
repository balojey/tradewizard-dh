/**
 * Evolution Tracking Service
 *
 * This module provides functionality for comparing new agent signals to
 * historical signals and detecting significant changes in agent analysis.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import type { AgentSignal } from '../models/types.js';
import type { HistoricalSignal } from '../database/memory-retrieval.js';
import { getMemoryMetricsCollector } from './memory-metrics.js';

/**
 * Signal evolution event types
 */
export type EvolutionEventType =
  | 'direction_change'
  | 'probability_shift'
  | 'confidence_change'
  | 'reasoning_evolution';

/**
 * Signal evolution event
 */
export interface EvolutionEvent {
  type: EvolutionEventType;
  agentName: string;
  marketId: string;
  timestamp: number;
  previousValue: unknown;
  currentValue: unknown;
  magnitude: number; // Quantified change magnitude
  description: string;
}

/**
 * Evolution tracking service interface
 */
export interface EvolutionTracker {
  /**
   * Compare new signal to most recent historical signal
   * @param newSignal - Newly generated agent signal
   * @param historicalSignals - Historical signals for this agent-market combination
   * @returns Array of evolution events detected
   */
  trackEvolution(
    newSignal: AgentSignal,
    historicalSignals: HistoricalSignal[]
  ): EvolutionEvent[];
}

/**
 * Evolution Tracker Implementation
 */
export class EvolutionTrackerImpl implements EvolutionTracker {
  /**
   * Track evolution by comparing new signal to historical signals
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   */
  trackEvolution(
    newSignal: AgentSignal,
    historicalSignals: HistoricalSignal[]
  ): EvolutionEvent[] {
    // Requirement 8.1: Compare to most recent historical signal
    if (historicalSignals.length === 0) {
      return []; // No history to compare against
    }

    // Get most recent signal (assuming sorted desc by timestamp)
    const mostRecent = historicalSignals[0];
    const events: EvolutionEvent[] = [];
    const metricsCollector = getMemoryMetricsCollector();

    // Requirement 8.2: Check for direction change
    if (newSignal.direction !== mostRecent.direction) {
      events.push({
        type: 'direction_change',
        agentName: newSignal.agentName,
        marketId: mostRecent.marketId,
        timestamp: newSignal.timestamp,
        previousValue: mostRecent.direction,
        currentValue: newSignal.direction,
        magnitude: 1.0, // Binary change
        description: `Direction changed from ${mostRecent.direction} to ${newSignal.direction}`,
      });
    }

    // Requirement 8.3: Check for probability shift (>10%)
    const probDiff = Math.abs(newSignal.fairProbability - mostRecent.fairProbability);
    if (probDiff > 0.1) {
      events.push({
        type: 'probability_shift',
        agentName: newSignal.agentName,
        marketId: mostRecent.marketId,
        timestamp: newSignal.timestamp,
        previousValue: mostRecent.fairProbability,
        currentValue: newSignal.fairProbability,
        magnitude: probDiff,
        description: `Fair probability shifted by ${(probDiff * 100).toFixed(1)}%`,
      });
    }

    // Requirement 8.4: Check for confidence change (>0.2)
    const confDiff = Math.abs(newSignal.confidence - mostRecent.confidence);
    if (confDiff > 0.2) {
      events.push({
        type: 'confidence_change',
        agentName: newSignal.agentName,
        marketId: mostRecent.marketId,
        timestamp: newSignal.timestamp,
        previousValue: mostRecent.confidence,
        currentValue: newSignal.confidence,
        magnitude: confDiff,
        description: `Confidence changed by ${(confDiff * 100).toFixed(1)}%`,
      });
    }

    // Requirement 8.5: Check for reasoning evolution (key drivers changed significantly)
    const reasoningChanged = this.detectReasoningChange(
      newSignal.keyDrivers,
      mostRecent.keyDrivers
    );
    if (reasoningChanged) {
      events.push({
        type: 'reasoning_evolution',
        agentName: newSignal.agentName,
        marketId: mostRecent.marketId,
        timestamp: newSignal.timestamp,
        previousValue: mostRecent.keyDrivers,
        currentValue: newSignal.keyDrivers,
        magnitude: 0.5, // Qualitative change
        description: 'Key drivers have evolved significantly',
      });
    }

    // Record evolution events in metrics (Requirements 8.2, 8.3, 8.4, 8.5)
    if (events.length > 0) {
      metricsCollector.recordEvolutionEvents(events, mostRecent.marketId, newSignal.agentName);
    }

    return events;
  }

  /**
   * Detect if reasoning has changed significantly
   * Uses overlap ratio heuristic: if less than 50% overlap, reasoning has changed
   */
  private detectReasoningChange(
    currentDrivers: string[],
    previousDrivers: string[]
  ): boolean {
    // Handle empty arrays
    if (currentDrivers.length === 0 && previousDrivers.length === 0) {
      return false;
    }
    if (currentDrivers.length === 0 || previousDrivers.length === 0) {
      return true;
    }

    // Normalize to lowercase for comparison
    const currentSet = new Set(currentDrivers.map((d) => d.toLowerCase().trim()));
    const previousSet = new Set(previousDrivers.map((d) => d.toLowerCase().trim()));

    // Calculate intersection
    const intersection = new Set(
      [...currentSet].filter((d) => previousSet.has(d))
    );

    // Calculate overlap ratio
    const maxSize = Math.max(currentSet.size, previousSet.size);
    const overlapRatio = intersection.size / maxSize;

    // Reasoning has changed if less than 50% overlap
    return overlapRatio < 0.5;
  }
}

/**
 * Create an evolution tracker instance
 */
export function createEvolutionTracker(): EvolutionTracker {
  return new EvolutionTrackerImpl();
}

/**
 * Log evolution events to audit trail
 * @param events - Evolution events to log
 * @param logger - Optional logger function (defaults to console.log)
 */
export function logEvolutionEvents(
  events: EvolutionEvent[],
  logger: (message: string, data: unknown) => void = (msg, data) =>
    console.log(msg, JSON.stringify(data, null, 2))
): void {
  if (events.length === 0) {
    return;
  }

  events.forEach((event) => {
    logger(`[EvolutionTracker] ${event.type} detected`, {
      agentName: event.agentName,
      marketId: event.marketId,
      timestamp: event.timestamp,
      description: event.description,
      magnitude: event.magnitude,
      previousValue: event.previousValue,
      currentValue: event.currentValue,
    });
  });
}
