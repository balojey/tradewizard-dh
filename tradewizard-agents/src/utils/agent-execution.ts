/**
 * Agent Execution Utilities
 *
 * Provides utilities for executing agents with timeout and error handling.
 * Ensures that agent failures are isolated and don't crash the entire pipeline.
 */

import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  success: boolean;
  signal?: AgentSignal;
  error?: string;
  timedOut?: boolean;
  duration: number;
}

/**
 * Execute an agent with timeout and error handling
 *
 * This wrapper ensures that:
 * - Agent execution is bounded by a timeout
 * - Agent failures are caught and logged
 * - Failed agents don't crash the pipeline
 * - Execution metrics are tracked
 *
 * @param agentName - Name of the agent being executed
 * @param agentFn - Agent function to execute
 * @param state - Current graph state
 * @param timeout - Timeout in milliseconds (default: 15000)
 * @returns Agent execution result
 */
export async function executeAgentWithTimeout(
  agentName: string,
  agentFn: (state: GraphStateType) => Promise<Partial<GraphStateType>>,
  state: GraphStateType,
  timeout: number = 15000
): Promise<AgentExecutionResult> {
  const startTime = Date.now();

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent ${agentName} timed out after ${timeout}ms`));
      }, timeout);
    });

    // Race agent execution against timeout
    const result = await Promise.race([
      agentFn(state),
      timeoutPromise,
    ]);

    const duration = Date.now() - startTime;

    // Extract agent signal from result
    const signal = extractAgentSignal(result, agentName);

    if (signal) {
      return {
        success: true,
        signal,
        duration,
      };
    } else {
      return {
        success: false,
        error: `Agent ${agentName} did not produce a valid signal`,
        duration,
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    // Check if it was a timeout
    const isTimeout = error instanceof Error && error.message.includes('timed out');

    console.error(
      `[AgentExecution] Agent ${agentName} ${isTimeout ? 'timed out' : 'failed'}:`,
      error instanceof Error ? error.message : String(error)
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timedOut: isTimeout,
      duration,
    };
  }
}

/**
 * Extract agent signal from state update
 *
 * Agents can return signals in different ways:
 * - In agentSignals array
 * - In a specific field (e.g., riskPhilosophySignals)
 *
 * @param stateUpdate - Partial state update from agent
 * @param agentName - Name of the agent
 * @returns Agent signal if found, undefined otherwise
 */
function extractAgentSignal(
  stateUpdate: Partial<GraphStateType>,
  agentName: string
): AgentSignal | undefined {
  // Check agentSignals array
  if (stateUpdate.agentSignals && stateUpdate.agentSignals.length > 0) {
    // Find signal with matching agent name
    const signal = stateUpdate.agentSignals.find((s) => s.agentName === agentName);
    if (signal) return signal;

    // If no exact match, return the last signal (assuming it's from this agent)
    return stateUpdate.agentSignals[stateUpdate.agentSignals.length - 1];
  }

  // Check risk philosophy signals
  if (stateUpdate.riskPhilosophySignals) {
    const riskSignals = stateUpdate.riskPhilosophySignals;
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
 * Execute multiple agents in parallel with error isolation
 *
 * This function executes multiple agents concurrently and ensures that:
 * - Failed agents don't affect other agents
 * - All agents are given a chance to execute
 * - Results are collected even if some agents fail
 *
 * @param agents - Array of agent configurations
 * @param state - Current graph state
 * @param timeout - Timeout per agent in milliseconds
 * @returns Array of execution results
 */
export async function executeAgentsInParallel(
  agents: Array<{
    name: string;
    fn: (state: GraphStateType) => Promise<Partial<GraphStateType>>;
  }>,
  state: GraphStateType,
  timeout: number = 15000
): Promise<AgentExecutionResult[]> {
  const executions = agents.map((agent) =>
    executeAgentWithTimeout(agent.name, agent.fn, state, timeout)
  );

  return Promise.all(executions);
}

/**
 * Filter successful agent signals from execution results
 *
 * @param results - Array of agent execution results
 * @returns Array of successful agent signals
 */
export function filterSuccessfulSignals(results: AgentExecutionResult[]): AgentSignal[] {
  return results
    .filter((r) => r.success && r.signal)
    .map((r) => r.signal!);
}

/**
 * Create audit log entry for agent execution results
 *
 * @param results - Array of agent execution results
 * @returns Audit log entry data
 */
export function createAgentExecutionAuditEntry(results: AgentExecutionResult[]) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const timedOut = results.filter((r) => r.timedOut);

  return {
    totalAgents: results.length,
    successfulAgents: successful.length,
    failedAgents: failed.length,
    timedOutAgents: timedOut.length,
    averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
    failures: failed.map((r) => ({
      agent: r.error?.split(' ')[1], // Extract agent name from error message
      error: r.error,
      timedOut: r.timedOut,
    })),
  };
}
