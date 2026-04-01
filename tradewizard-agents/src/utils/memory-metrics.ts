/**
 * Memory System Monitoring and Metrics
 *
 * This module provides comprehensive monitoring and metrics collection
 * for the Agent Memory System, including:
 * - Performance metrics for memory retrieval latency
 * - Error rate tracking
 * - Memory context size metrics
 * - Evolution event frequency metrics
 * - Audit trail logging for all operations
 *
 * Requirements: 5.4, 8.2, 8.3, 8.4, 8.5, 9.1
 */

import type { EvolutionEvent, EvolutionEventType } from './evolution-tracker.js';
import type { AgentMemoryContext } from '../database/memory-retrieval.js';

/**
 * Memory retrieval performance metrics
 */
export interface MemoryRetrievalMetrics {
  // Latency metrics (milliseconds)
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  // Success/error counts
  totalRetrievals: number;
  successfulRetrievals: number;
  failedRetrievals: number;
  errorRate: number; // Percentage
  // Timeout metrics
  timeouts: number;
  timeoutRate: number; // Percentage
}

/**
 * Memory context size metrics
 */
export interface MemoryContextSizeMetrics {
  // Signal count distribution
  signalCounts: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  // Context size in bytes
  contextSizes: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  // Agents with history
  agentsWithHistory: number;
  agentsWithoutHistory: number;
  historyRate: number; // Percentage
}

/**
 * Evolution event frequency metrics
 */
export interface EvolutionEventMetrics {
  // Total events by type
  totalEvents: number;
  directionChanges: number;
  probabilityShifts: number;
  confidenceChanges: number;
  reasoningEvolutions: number;
  // Event rates (events per analysis)
  directionChangeRate: number;
  probabilityShiftRate: number;
  confidenceChangeRate: number;
  reasoningEvolutionRate: number;
  // Magnitude statistics
  averageProbabilityShiftMagnitude: number;
  averageConfidenceChangeMagnitude: number;
}

/**
 * Memory system audit log entry
 */
export interface MemoryAuditLogEntry {
  timestamp: number;
  operation: 'retrieval' | 'evolution_tracking' | 'context_formatting' | 'validation';
  success: boolean;
  duration: number; // milliseconds
  marketId?: string;
  agentName?: string;
  signalCount?: number;
  contextSize?: number; // bytes
  evolutionEvents?: number;
  error?: {
    type: string;
    message: string;
    context?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Memory system metrics collector
 *
 * Collects and aggregates metrics for the memory system, providing
 * real-time monitoring and historical analysis capabilities.
 */
export class MemoryMetricsCollector {
  private retrievalLatencies: number[] = [];
  private retrievalErrors: Array<{ timestamp: number; error: string }> = [];
  private retrievalTimeouts: number = 0;
  private contextSizes: Array<{ signalCount: number; sizeBytes: number }> = [];
  private evolutionEvents: EvolutionEvent[] = [];
  private auditLog: MemoryAuditLogEntry[] = [];
  private totalAnalyses: number = 0;

  /**
   * Record a memory retrieval operation
   */
  recordRetrieval(params: {
    duration: number;
    success: boolean;
    marketId: string;
    agentName?: string;
    signalCount?: number;
    contextSize?: number;
    error?: { type: string; message: string; context?: Record<string, unknown> };
    timeout?: boolean;
  }): void {
    const { duration, success, marketId, agentName, signalCount, contextSize, error, timeout } =
      params;

    // Record latency
    this.retrievalLatencies.push(duration);

    // Record error if failed
    if (!success && error) {
      this.retrievalErrors.push({
        timestamp: Date.now(),
        error: error.message,
      });
    }

    // Record timeout
    if (timeout) {
      this.retrievalTimeouts++;
    }

    // Record context size
    if (success && signalCount !== undefined && contextSize !== undefined) {
      this.contextSizes.push({ signalCount, sizeBytes: contextSize });
    }

    // Add to audit log (Requirement 5.4)
    this.auditLog.push({
      timestamp: Date.now(),
      operation: 'retrieval',
      success,
      duration,
      marketId,
      agentName,
      signalCount,
      contextSize,
      error,
    });

    // Log to console for real-time monitoring
    if (success) {
      console.log('[MemoryMetrics] Retrieval successful:', {
        marketId,
        agentName,
        duration: `${duration}ms`,
        signalCount,
        contextSize: contextSize ? `${contextSize} bytes` : undefined,
      });
    } else {
      console.error('[MemoryMetrics] Retrieval failed:', {
        marketId,
        agentName,
        duration: `${duration}ms`,
        error: error?.message,
        timeout,
      });
    }
  }

  /**
   * Record evolution events for an analysis
   * Requirements: 8.2, 8.3, 8.4, 8.5
   */
  recordEvolutionEvents(events: EvolutionEvent[], marketId: string, agentName: string): void {
    this.evolutionEvents.push(...events);

    // Add to audit log (Requirement 5.4)
    this.auditLog.push({
      timestamp: Date.now(),
      operation: 'evolution_tracking',
      success: true,
      duration: 0, // Evolution tracking is synchronous
      marketId,
      agentName,
      evolutionEvents: events.length,
      metadata: {
        eventTypes: events.map((e) => e.type),
      },
    });

    // Log evolution events (Requirements 8.2, 8.3, 8.4, 8.5)
    if (events.length > 0) {
      console.log('[MemoryMetrics] Evolution events detected:', {
        marketId,
        agentName,
        eventCount: events.length,
        events: events.map((e) => ({
          type: e.type,
          description: e.description,
          magnitude: e.magnitude,
        })),
      });
    }
  }

  /**
   * Record a context formatting operation
   */
  recordContextFormatting(params: {
    duration: number;
    success: boolean;
    agentName: string;
    signalCount: number;
    contextSize: number;
    truncated: boolean;
    error?: { type: string; message: string };
  }): void {
    const { duration, success, agentName, signalCount, contextSize, truncated, error } = params;

    // Add to audit log (Requirement 5.4)
    this.auditLog.push({
      timestamp: Date.now(),
      operation: 'context_formatting',
      success,
      duration,
      agentName,
      signalCount,
      contextSize,
      error,
      metadata: { truncated },
    });

    if (success) {
      console.debug('[MemoryMetrics] Context formatted:', {
        agentName,
        signalCount,
        contextSize: `${contextSize} bytes`,
        truncated,
      });
    } else {
      console.error('[MemoryMetrics] Context formatting failed:', {
        agentName,
        error: error?.message,
      });
    }
  }

  /**
   * Record a signal validation operation
   */
  recordValidation(params: {
    duration: number;
    totalSignals: number;
    validSignals: number;
    invalidSignals: number;
    marketId: string;
    agentName: string;
  }): void {
    const { duration, totalSignals, validSignals, invalidSignals, marketId, agentName } = params;

    // Add to audit log (Requirement 5.4)
    this.auditLog.push({
      timestamp: Date.now(),
      operation: 'validation',
      success: true,
      duration,
      marketId,
      agentName,
      metadata: {
        totalSignals,
        validSignals,
        invalidSignals,
        validationRate: totalSignals > 0 ? (validSignals / totalSignals) * 100 : 100,
      },
    });

    if (invalidSignals > 0) {
      console.warn('[MemoryMetrics] Signal validation filtered invalid signals:', {
        marketId,
        agentName,
        totalSignals,
        validSignals,
        invalidSignals,
        validationRate: `${((validSignals / totalSignals) * 100).toFixed(1)}%`,
      });
    }
  }

  /**
   * Increment analysis counter
   */
  incrementAnalysisCount(): void {
    this.totalAnalyses++;
  }

  /**
   * Get memory retrieval performance metrics
   */
  getRetrievalMetrics(): MemoryRetrievalMetrics {
    if (this.retrievalLatencies.length === 0) {
      return {
        latency: { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 },
        totalRetrievals: 0,
        successfulRetrievals: 0,
        failedRetrievals: 0,
        errorRate: 0,
        timeouts: 0,
        timeoutRate: 0,
      };
    }

    const sortedLatencies = [...this.retrievalLatencies].sort((a, b) => a - b);
    const totalRetrievals = this.retrievalLatencies.length;
    const failedRetrievals = this.retrievalErrors.length;
    const successfulRetrievals = totalRetrievals - failedRetrievals;

    return {
      latency: {
        min: sortedLatencies[0],
        max: sortedLatencies[sortedLatencies.length - 1],
        mean: sortedLatencies.reduce((sum, val) => sum + val, 0) / sortedLatencies.length,
        p50: this.percentile(sortedLatencies, 0.5),
        p95: this.percentile(sortedLatencies, 0.95),
        p99: this.percentile(sortedLatencies, 0.99),
      },
      totalRetrievals,
      successfulRetrievals,
      failedRetrievals,
      errorRate: (failedRetrievals / totalRetrievals) * 100,
      timeouts: this.retrievalTimeouts,
      timeoutRate: (this.retrievalTimeouts / totalRetrievals) * 100,
    };
  }

  /**
   * Get memory context size metrics
   */
  getContextSizeMetrics(): MemoryContextSizeMetrics {
    if (this.contextSizes.length === 0) {
      return {
        signalCounts: { min: 0, max: 0, mean: 0, median: 0 },
        contextSizes: { min: 0, max: 0, mean: 0, median: 0 },
        agentsWithHistory: 0,
        agentsWithoutHistory: 0,
        historyRate: 0,
      };
    }

    const signalCounts = this.contextSizes.map((c) => c.signalCount);
    const contextSizes = this.contextSizes.map((c) => c.sizeBytes);

    const sortedSignalCounts = [...signalCounts].sort((a, b) => a - b);
    const sortedContextSizes = [...contextSizes].sort((a, b) => a - b);

    const agentsWithHistory = this.contextSizes.filter((c) => c.signalCount > 0).length;
    const agentsWithoutHistory = this.contextSizes.filter((c) => c.signalCount === 0).length;

    return {
      signalCounts: {
        min: sortedSignalCounts[0],
        max: sortedSignalCounts[sortedSignalCounts.length - 1],
        mean: signalCounts.reduce((sum, val) => sum + val, 0) / signalCounts.length,
        median: this.percentile(sortedSignalCounts, 0.5),
      },
      contextSizes: {
        min: sortedContextSizes[0],
        max: sortedContextSizes[sortedContextSizes.length - 1],
        mean: contextSizes.reduce((sum, val) => sum + val, 0) / contextSizes.length,
        median: this.percentile(sortedContextSizes, 0.5),
      },
      agentsWithHistory,
      agentsWithoutHistory,
      historyRate:
        this.contextSizes.length > 0
          ? (agentsWithHistory / this.contextSizes.length) * 100
          : 0,
    };
  }

  /**
   * Get evolution event frequency metrics
   * Requirements: 8.2, 8.3, 8.4, 8.5
   */
  getEvolutionMetrics(): EvolutionEventMetrics {
    const totalEvents = this.evolutionEvents.length;
    const directionChanges = this.evolutionEvents.filter(
      (e) => e.type === 'direction_change'
    ).length;
    const probabilityShifts = this.evolutionEvents.filter(
      (e) => e.type === 'probability_shift'
    ).length;
    const confidenceChanges = this.evolutionEvents.filter(
      (e) => e.type === 'confidence_change'
    ).length;
    const reasoningEvolutions = this.evolutionEvents.filter(
      (e) => e.type === 'reasoning_evolution'
    ).length;

    // Calculate average magnitudes
    const probabilityShiftMagnitudes = this.evolutionEvents
      .filter((e) => e.type === 'probability_shift')
      .map((e) => e.magnitude);
    const confidenceChangeMagnitudes = this.evolutionEvents
      .filter((e) => e.type === 'confidence_change')
      .map((e) => e.magnitude);

    const avgProbShiftMagnitude =
      probabilityShiftMagnitudes.length > 0
        ? probabilityShiftMagnitudes.reduce((sum, val) => sum + val, 0) /
          probabilityShiftMagnitudes.length
        : 0;

    const avgConfChangeMagnitude =
      confidenceChangeMagnitudes.length > 0
        ? confidenceChangeMagnitudes.reduce((sum, val) => sum + val, 0) /
          confidenceChangeMagnitudes.length
        : 0;

    // Calculate event rates (events per analysis)
    const analysisCount = this.totalAnalyses || 1; // Avoid division by zero

    return {
      totalEvents,
      directionChanges,
      probabilityShifts,
      confidenceChanges,
      reasoningEvolutions,
      directionChangeRate: directionChanges / analysisCount,
      probabilityShiftRate: probabilityShifts / analysisCount,
      confidenceChangeRate: confidenceChanges / analysisCount,
      reasoningEvolutionRate: reasoningEvolutions / analysisCount,
      averageProbabilityShiftMagnitude: avgProbShiftMagnitude,
      averageConfidenceChangeMagnitude: avgConfChangeMagnitude,
    };
  }

  /**
   * Get complete audit log
   * Requirement 5.4: Audit trail logging for all operations
   */
  getAuditLog(): MemoryAuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get audit log filtered by operation type
   */
  getAuditLogByOperation(
    operation: 'retrieval' | 'evolution_tracking' | 'context_formatting' | 'validation'
  ): MemoryAuditLogEntry[] {
    return this.auditLog.filter((entry) => entry.operation === operation);
  }

  /**
   * Get audit log filtered by time range
   */
  getAuditLogByTimeRange(startTime: number, endTime: number): MemoryAuditLogEntry[] {
    return this.auditLog.filter(
      (entry) => entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * Get audit log filtered by market ID
   */
  getAuditLogByMarket(marketId: string): MemoryAuditLogEntry[] {
    return this.auditLog.filter((entry) => entry.marketId === marketId);
  }

  /**
   * Get audit log filtered by agent name
   */
  getAuditLogByAgent(agentName: string): MemoryAuditLogEntry[] {
    return this.auditLog.filter((entry) => entry.agentName === agentName);
  }

  /**
   * Get summary of all metrics
   */
  getMetricsSummary(): {
    retrieval: MemoryRetrievalMetrics;
    contextSize: MemoryContextSizeMetrics;
    evolution: EvolutionEventMetrics;
    auditLogSize: number;
  } {
    return {
      retrieval: this.getRetrievalMetrics(),
      contextSize: this.getContextSizeMetrics(),
      evolution: this.getEvolutionMetrics(),
      auditLogSize: this.auditLog.length,
    };
  }

  /**
   * Print metrics summary to console
   */
  printMetricsSummary(): void {
    const summary = this.getMetricsSummary();

    console.log('\n========================================');
    console.log('Memory System Metrics Summary');
    console.log('========================================\n');

    console.log('Retrieval Performance:');
    console.log(`  Total Retrievals: ${summary.retrieval.totalRetrievals}`);
    console.log(`  Success Rate: ${(100 - summary.retrieval.errorRate).toFixed(1)}%`);
    console.log(`  Error Rate: ${summary.retrieval.errorRate.toFixed(1)}%`);
    console.log(`  Timeout Rate: ${summary.retrieval.timeoutRate.toFixed(1)}%`);
    console.log(`  Latency (p50): ${summary.retrieval.latency.p50.toFixed(0)}ms`);
    console.log(`  Latency (p95): ${summary.retrieval.latency.p95.toFixed(0)}ms`);
    console.log(`  Latency (p99): ${summary.retrieval.latency.p99.toFixed(0)}ms`);

    console.log('\nContext Size:');
    console.log(`  Agents with History: ${summary.contextSize.agentsWithHistory}`);
    console.log(`  History Rate: ${summary.contextSize.historyRate.toFixed(1)}%`);
    console.log(`  Avg Signal Count: ${summary.contextSize.signalCounts.mean.toFixed(1)}`);
    console.log(`  Avg Context Size: ${summary.contextSize.contextSizes.mean.toFixed(0)} bytes`);

    console.log('\nEvolution Events:');
    console.log(`  Total Events: ${summary.evolution.totalEvents}`);
    console.log(`  Direction Changes: ${summary.evolution.directionChanges}`);
    console.log(`  Probability Shifts: ${summary.evolution.probabilityShifts}`);
    console.log(`  Confidence Changes: ${summary.evolution.confidenceChanges}`);
    console.log(`  Reasoning Evolutions: ${summary.evolution.reasoningEvolutions}`);
    console.log(
      `  Avg Probability Shift: ${(summary.evolution.averageProbabilityShiftMagnitude * 100).toFixed(1)}%`
    );
    console.log(
      `  Avg Confidence Change: ${(summary.evolution.averageConfidenceChangeMagnitude * 100).toFixed(1)}%`
    );

    console.log('\nAudit Log:');
    console.log(`  Total Entries: ${summary.auditLogSize}`);

    console.log('\n========================================\n');
  }

  /**
   * Check if metrics exceed alert thresholds
   * Requirement 9.1: Error rate tracking
   */
  checkAlertThresholds(): {
    alerts: Array<{ severity: 'warning' | 'critical'; message: string }>;
    healthy: boolean;
  } {
    const alerts: Array<{ severity: 'warning' | 'critical'; message: string }> = [];
    const metrics = this.getRetrievalMetrics();

    // Check error rate (critical if > 5%, warning if > 2%)
    if (metrics.errorRate > 5) {
      alerts.push({
        severity: 'critical',
        message: `Memory retrieval error rate is ${metrics.errorRate.toFixed(1)}% (threshold: 5%)`,
      });
    } else if (metrics.errorRate > 2) {
      alerts.push({
        severity: 'warning',
        message: `Memory retrieval error rate is ${metrics.errorRate.toFixed(1)}% (threshold: 2%)`,
      });
    }

    // Check p95 latency (critical if > 200ms, warning if > 150ms)
    if (metrics.latency.p95 > 200) {
      alerts.push({
        severity: 'critical',
        message: `Memory retrieval p95 latency is ${metrics.latency.p95.toFixed(0)}ms (threshold: 200ms)`,
      });
    } else if (metrics.latency.p95 > 150) {
      alerts.push({
        severity: 'warning',
        message: `Memory retrieval p95 latency is ${metrics.latency.p95.toFixed(0)}ms (threshold: 150ms)`,
      });
    }

    // Check timeout rate (critical if > 10%, warning if > 5%)
    if (metrics.timeoutRate > 10) {
      alerts.push({
        severity: 'critical',
        message: `Memory retrieval timeout rate is ${metrics.timeoutRate.toFixed(1)}% (threshold: 10%)`,
      });
    } else if (metrics.timeoutRate > 5) {
      alerts.push({
        severity: 'warning',
        message: `Memory retrieval timeout rate is ${metrics.timeoutRate.toFixed(1)}% (threshold: 5%)`,
      });
    }

    return {
      alerts,
      healthy: alerts.filter((a) => a.severity === 'critical').length === 0,
    };
  }

  /**
   * Reset all metrics (useful for testing or periodic resets)
   */
  reset(): void {
    this.retrievalLatencies = [];
    this.retrievalErrors = [];
    this.retrievalTimeouts = 0;
    this.contextSizes = [];
    this.evolutionEvents = [];
    this.auditLog = [];
    this.totalAnalyses = 0;
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }
}

/**
 * Global metrics collector instance
 */
let globalMetricsCollector: MemoryMetricsCollector | null = null;

/**
 * Get or create the global metrics collector
 */
export function getMemoryMetricsCollector(): MemoryMetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MemoryMetricsCollector();
  }
  return globalMetricsCollector;
}

/**
 * Reset the global metrics collector
 */
export function resetMemoryMetricsCollector(): void {
  if (globalMetricsCollector) {
    globalMetricsCollector.reset();
  }
}

/**
 * Calculate memory context size in bytes
 */
export function calculateContextSize(context: AgentMemoryContext): number {
  // Estimate size by serializing to JSON
  const json = JSON.stringify(context);
  return new TextEncoder().encode(json).length;
}
