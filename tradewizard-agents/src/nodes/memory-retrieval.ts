/**
 * Memory Retrieval Node
 *
 * This LangGraph node retrieves historical agent signals from the database
 * and populates the memoryContext state field for use by agent nodes.
 *
 * Requirements:
 * - 5.2: Populate memoryContext field with agent-specific historical data
 * - 5.4: Preserve memoryContext in audit log for debugging
 * - 9.1: Handle database errors gracefully
 * - 9.3: Implement timeout logic (5 seconds)
 */

import type { GraphStateType } from '../models/state.js';
import type { MemoryRetrievalService } from '../database/memory-retrieval.js';
import type { EngineConfig } from '../config/index.js';
import { getMemoryMetricsCollector } from '../utils/memory-metrics.js';

/**
 * Memory Retrieval Node
 *
 * This node runs after market ingestion and before agent execution.
 * It retrieves historical signals for all agents and populates the memoryContext state.
 *
 * @param state - Current graph state
 * @param memoryService - Memory retrieval service instance
 * @param agentNames - List of agent names to retrieve memory for
 * @param config - Engine configuration with memory system settings
 * @returns Partial state update with memoryContext and audit log
 */
export async function memoryRetrievalNode(
  state: GraphStateType,
  memoryService: MemoryRetrievalService,
  agentNames: string[],
  config: EngineConfig
): Promise<Partial<GraphStateType>> {
  const startTime = Date.now();
  const metricsCollector = getMemoryMetricsCollector();

  // Check feature flag - if disabled, return empty memory context
  if (!config.memorySystem.enabled) {
    return {
      memoryContext: new Map(),
      auditLog: [
        {
          stage: 'memory_retrieval',
          timestamp: Date.now(),
          data: {
            success: true,
            reason: 'Memory system disabled via feature flag',
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  }

  // Extract market ID from state
  const marketId = state.conditionId;

  if (!marketId) {
    console.warn('[MemoryRetrieval] No market ID in state, skipping memory retrieval');
    return {
      memoryContext: new Map(),
      auditLog: [
        {
          stage: 'memory_retrieval',
          timestamp: Date.now(),
          data: {
            success: false,
            reason: 'No market ID',
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  }

  try {
    // Retrieve memory context for all agents with configurable timeout and limit
    const memoryPromise = memoryService.getAllAgentMemories(
      marketId,
      agentNames,
      config.memorySystem.maxSignalsPerAgent
    );
    const timeoutPromise = new Promise<Map<string, any>>((_, reject) =>
      setTimeout(
        () => reject(new Error('Memory retrieval timeout')),
        config.memorySystem.queryTimeoutMs
      )
    );

    const memoryContext = await Promise.race([memoryPromise, timeoutPromise]);

    // Count agents with historical signals
    const agentsWithHistory = Array.from(memoryContext.values()).filter(
      (ctx) => ctx.hasHistory
    ).length;

    // Calculate total signals retrieved
    const totalSignals = Array.from(memoryContext.values()).reduce(
      (sum, ctx) => sum + ctx.historicalSignals.length,
      0
    );

    // Increment analysis counter in metrics
    metricsCollector.incrementAnalysisCount();

    // Requirement 5.4: Preserve memoryContext in audit log
    return {
      memoryContext,
      auditLog: [
        {
          stage: 'memory_retrieval',
          timestamp: Date.now(),
          data: {
            success: true,
            marketId,
            totalAgents: agentNames.length,
            agentsWithHistory,
            totalSignals,
            maxSignalsPerAgent: config.memorySystem.maxSignalsPerAgent,
            queryTimeoutMs: config.memorySystem.queryTimeoutMs,
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  } catch (error) {
    // Requirement 9.1: Log error but don't fail the workflow
    console.error('[MemoryRetrieval] Failed to retrieve memory context:', error);

    return {
      memoryContext: new Map(), // Empty map allows agents to continue
      auditLog: [
        {
          stage: 'memory_retrieval',
          timestamp: Date.now(),
          data: {
            success: false,
            marketId,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  }
}

/**
 * Create a memory retrieval node with bound dependencies
 *
 * This factory function creates a node function that can be added to the LangGraph.
 *
 * @param memoryService - Memory retrieval service instance
 * @param agentNames - List of agent names to retrieve memory for
 * @param config - Engine configuration with memory system settings
 * @returns Node function for LangGraph
 */
export function createMemoryRetrievalNode(
  memoryService: MemoryRetrievalService,
  agentNames: string[],
  config: EngineConfig
) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    return memoryRetrievalNode(state, memoryService, agentNames, config);
  };
}
