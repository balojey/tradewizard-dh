/**
 * Observability Integration Module
 *
 * This module provides utilities for integrating observability logging
 * across all advanced agent nodes. It ensures consistent logging patterns
 * and complete audit trails.
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';

/**
 * Global observability logger instance
 * This is set during workflow initialization and used by all nodes
 */
let globalObservabilityLogger: AdvancedObservabilityLogger | null = null;

/**
 * Set the global observability logger
 *
 * This should be called once during workflow initialization.
 *
 * @param logger - Observability logger instance
 */
export function setGlobalObservabilityLogger(logger: AdvancedObservabilityLogger): void {
  globalObservabilityLogger = logger;
}

/**
 * Get the global observability logger
 *
 * @returns Observability logger instance or null if not set
 */
export function getGlobalObservabilityLogger(): AdvancedObservabilityLogger | null {
  return globalObservabilityLogger;
}

/**
 * Clear the global observability logger
 */
export function clearGlobalObservabilityLogger(): void {
  globalObservabilityLogger = null;
}

/**
 * Log agent execution performance
 *
 * This should be called after each agent execution to track performance metrics.
 *
 * @param agentName - Name of the agent
 * @param executionTime - Execution time in milliseconds
 * @param signal - Agent signal produced (if successful)
 * @param error - Error message (if failed)
 */
export function logAgentPerformance(
  agentName: string,
  executionTime: number,
  signal?: AgentSignal,
  error?: string
): void {
  if (!globalObservabilityLogger) return;

  globalObservabilityLogger.logPerformanceTracking({
    timestamp: Date.now(),
    agentName,
    executionTime,
    confidence: signal?.confidence ?? 0,
    fairProbability: signal?.fairProbability ?? 0,
    success: !error,
    error,
  });
}

/**
 * Wrap an agent node function with observability logging
 *
 * This higher-order function wraps an agent node to automatically log
 * performance metrics and errors.
 *
 * @param agentName - Name of the agent
 * @param nodeFn - Agent node function
 * @returns Wrapped node function with observability logging
 */
export function withObservability<T extends Partial<GraphStateType>>(
  agentName: string,
  nodeFn: (state: GraphStateType) => Promise<T>
): (state: GraphStateType) => Promise<T> {
  return async (state: GraphStateType): Promise<T> => {
    const startTime = Date.now();

    try {
      const result = await nodeFn(state);
      const executionTime = Date.now() - startTime;

      // Extract signal from result
      const signal = extractSignalFromResult(result, agentName);

      // Log performance
      logAgentPerformance(agentName, executionTime, signal);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Log error
      logAgentPerformance(
        agentName,
        executionTime,
        undefined,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  };
}

/**
 * Extract agent signal from node result
 *
 * @param result - Node result
 * @param agentName - Agent name
 * @returns Agent signal if found
 */
function extractSignalFromResult(
  result: Partial<GraphStateType>,
  agentName: string
): AgentSignal | undefined {
  // Check agentSignals array
  if (result.agentSignals && result.agentSignals.length > 0) {
    const signal = result.agentSignals.find((s) => s.agentName === agentName);
    if (signal) return signal;
    return result.agentSignals[result.agentSignals.length - 1];
  }

  // Check risk philosophy signals
  if (result.riskPhilosophySignals) {
    const riskSignals = result.riskPhilosophySignals;
    if (agentName === 'aggressive' && riskSignals.aggressive) {
      return riskSignals.aggressive as AgentSignal;
    }
    if (agentName === 'conservative' && riskSignals.conservative) {
      return riskSignals.conservative as AgentSignal;
    }
    if (agentName === 'neutral' && riskSignals.neutral) {
      return riskSignals.neutral as AgentSignal;
    }
  }

  return undefined;
}

/**
 * Create observability-enhanced audit log entry
 *
 * This function creates an audit log entry that includes observability metadata.
 *
 * @param stage - Stage name
 * @param data - Audit data
 * @returns Audit log entry
 */
export function createObservabilityAuditEntry(stage: string, data: Record<string, unknown>) {
  return {
    stage,
    timestamp: Date.now(),
    data: {
      ...data,
      observability: {
        logged: !!globalObservabilityLogger,
        timestamp: Date.now(),
      },
    },
  };
}
