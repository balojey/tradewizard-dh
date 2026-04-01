/**
 * Audit Logger Utility
 *
 * This module provides utilities for audit logging, checkpoint inspection,
 * and Opik trace querying for the Market Intelligence Engine.
 */

import type { BaseCheckpointSaver, Checkpoint } from '@langchain/langgraph';
import type { AuditTrail, MarketId } from '../models/types.js';
import type { GraphStateType } from '../models/state.js';

/**
 * Checkpoint metadata with timing information
 */
export interface CheckpointMetadata {
  thread_id: string;
  checkpoint_id: string;
  timestamp: number;
  step: number;
  writes: Record<string, unknown>;
}

/**
 * Retrieve audit trail from LangGraph checkpointer
 *
 * This function reconstructs the complete audit trail for a market analysis
 * by reading all checkpoints from the LangGraph checkpointer.
 *
 * @param checkpointer - LangGraph checkpointer instance
 * @param marketId - Market condition ID (used as thread_id)
 * @returns Complete audit trail with all stages
 */
export async function getAuditTrail(
  checkpointer: BaseCheckpointSaver,
  marketId: MarketId
): Promise<AuditTrail> {
  const stages: AuditTrail['stages'] = [];

  // Retrieve all checkpoints for this thread
  const checkpointTuples = checkpointer.list({ configurable: { thread_id: marketId } });

  let previousTimestamp = Date.now();
  const startTimestamp = Date.now();

  for await (const tuple of checkpointTuples) {
    const checkpoint = tuple.checkpoint as Checkpoint;
    const metadata = tuple.metadata;
    const config = tuple.config;

    // Extract state from checkpoint
    const state = checkpoint.channel_values as GraphStateType;

    // Calculate duration (time since previous checkpoint)
    // Use checkpoint.ts (timestamp string) or current time
    const currentTimestamp = checkpoint.ts ? parseInt(checkpoint.ts, 10) : Date.now();
    const duration = previousTimestamp - currentTimestamp;

    // Extract stage name from checkpoint
    const stageName = extractStageName(state, metadata);

    // Extract errors from state
    const errors = extractErrors(state);

    // Build stage entry
    stages.push({
      name: stageName,
      timestamp: currentTimestamp,
      duration: Math.abs(duration),
      data: {
        checkpoint_id: config.configurable?.checkpoint_id,
        step: metadata?.step,
        state: sanitizeStateForLogging(state),
      },
      errors: errors.length > 0 ? errors : undefined,
    });

    previousTimestamp = currentTimestamp;
  }

  // Reverse stages to get chronological order (list returns newest first)
  stages.reverse();

  return {
    marketId,
    timestamp: startTimestamp,
    stages,
  };
}

/**
 * Get graph state at a specific checkpoint
 *
 * This function retrieves the complete graph state at a specific checkpoint,
 * useful for debugging and inspecting intermediate results.
 *
 * @param checkpointer - LangGraph checkpointer instance
 * @param marketId - Market condition ID (used as thread_id)
 * @param checkpointId - Optional checkpoint ID (if not provided, returns latest)
 * @returns Graph state at the specified checkpoint
 */
export async function getStateAtCheckpoint(
  checkpointer: BaseCheckpointSaver,
  marketId: MarketId,
  checkpointId?: string
): Promise<GraphStateType | null> {
  const config = {
    configurable: {
      thread_id: marketId,
      ...(checkpointId && { checkpoint_id: checkpointId }),
    },
  };

  const checkpoint = await checkpointer.get(config);

  if (!checkpoint) {
    return null;
  }

  return checkpoint.channel_values as GraphStateType;
}

/**
 * List all checkpoints for a market analysis
 *
 * This function returns metadata for all checkpoints associated with
 * a market analysis, useful for understanding the execution flow.
 *
 * @param checkpointer - LangGraph checkpointer instance
 * @param marketId - Market condition ID (used as thread_id)
 * @returns Array of checkpoint metadata
 */
export async function listCheckpoints(
  checkpointer: BaseCheckpointSaver,
  marketId: MarketId
): Promise<CheckpointMetadata[]> {
  const checkpoints: CheckpointMetadata[] = [];

  const checkpointTuples = checkpointer.list({ configurable: { thread_id: marketId } });

  for await (const tuple of checkpointTuples) {
    const metadata = tuple.metadata as any;
    const config = tuple.config;
    const checkpoint = tuple.checkpoint as Checkpoint;

    checkpoints.push({
      thread_id: String(marketId),
      checkpoint_id: config.configurable?.checkpoint_id || 'unknown',
      timestamp: checkpoint.ts ? parseInt(checkpoint.ts, 10) : Date.now(),
      step: metadata?.step || 0,
      writes: metadata?.writes || {},
    });
  }

  return checkpoints;
}

/**
 * Extract stage name from checkpoint state and metadata
 */
function extractStageName(state: GraphStateType, metadata: any): string {
  // Try to get stage from metadata
  if (metadata?.step_name) {
    return metadata.step_name;
  }

  // Try to infer stage from state changes
  if (state.ingestionError) {
    return 'market_ingestion_error';
  }
  if (state.mbd && !state.agentSignals.length) {
    return 'market_ingestion';
  }
  if (state.agentSignals.length > 0 && !state.bullThesis) {
    return 'agent_execution';
  }
  if (state.bullThesis && !state.debateRecord) {
    return 'thesis_construction';
  }
  if (state.debateRecord && !state.consensus) {
    return 'cross_examination';
  }
  if (state.consensus && !state.recommendation) {
    return 'consensus_engine';
  }
  if (state.recommendation) {
    return 'recommendation_generation';
  }

  return 'unknown';
}

/**
 * Extract errors from graph state
 */
function extractErrors(state: GraphStateType): unknown[] {
  const errors: unknown[] = [];

  if (state.ingestionError) {
    errors.push({ type: 'ingestion', error: state.ingestionError });
  }

  if (state.agentErrors.length > 0) {
    errors.push(...state.agentErrors.map((e) => ({ type: 'agent', error: e })));
  }

  if (state.consensusError) {
    errors.push({ type: 'consensus', error: state.consensusError });
  }

  return errors;
}

/**
 * Sanitize state for logging (remove sensitive data, limit size)
 */
function sanitizeStateForLogging(state: GraphStateType): Partial<GraphStateType> {
  return {
    conditionId: state.conditionId,
    mbd: state.mbd
      ? {
          marketId: state.mbd.marketId,
          question: state.mbd.question,
          currentProbability: state.mbd.currentProbability,
          liquidityScore: state.mbd.liquidityScore,
        }
      : null,
    agentSignals: state.agentSignals.map((s) => ({
      agentName: s.agentName,
      direction: s.direction,
      confidence: s.confidence,
      fairProbability: s.fairProbability,
    })),
    bullThesis: state.bullThesis
      ? {
          direction: state.bullThesis.direction,
          fairProbability: state.bullThesis.fairProbability,
          edge: state.bullThesis.edge,
        }
      : null,
    bearThesis: state.bearThesis
      ? {
          direction: state.bearThesis.direction,
          fairProbability: state.bearThesis.fairProbability,
          edge: state.bearThesis.edge,
        }
      : null,
    consensus: state.consensus
      ? {
          consensusProbability: state.consensus.consensusProbability,
          regime: state.consensus.regime,
          disagreementIndex: state.consensus.disagreementIndex,
        }
      : null,
    recommendation: state.recommendation
      ? {
          action: state.recommendation.action,
          expectedValue: state.recommendation.expectedValue,
          liquidityRisk: state.recommendation.liquidityRisk,
        }
      : null,
  } as Partial<GraphStateType>;
}

/**
 * Opik trace query utilities
 */
export interface OpikTraceQuery {
  projectName: string;
  threadId?: string;
  startTime?: number;
  endTime?: number;
  tags?: string[];
}

/**
 * Opik trace summary
 */
export interface OpikTraceSummary {
  traceId: string;
  projectName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'success' | 'error';
  metadata: Record<string, unknown>;
  tags: string[];
  totalCost?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Query Opik traces by market ID
 *
 * Note: This is a placeholder implementation. The actual implementation
 * would use the Opik SDK to query traces from the Opik backend.
 *
 * @param query - Query parameters
 * @returns Array of trace summaries
 */
export async function queryOpikTraces(query: OpikTraceQuery): Promise<OpikTraceSummary[]> {
  // TODO: Implement actual Opik SDK integration
  // This would use the Opik client to query traces:
  //
  // import { Opik } from 'opik';
  // const opik = new Opik({ apiKey: config.opik.apiKey });
  // const traces = await opik.traces.list({
  //   projectName: query.projectName,
  //   filters: {
  //     thread_id: query.threadId,
  //     start_time: query.startTime,
  //     end_time: query.endTime,
  //     tags: query.tags,
  //   },
  // });
  //
  // For now, return empty array as placeholder
  console.warn('queryOpikTraces: Opik SDK integration not yet implemented', { query });
  return [];
}

/**
 * Get Opik trace URL for a market analysis
 *
 * This function constructs the URL to view a specific trace in the Opik UI.
 *
 * @param projectName - Opik project name
 * @param threadId - Market condition ID (used as thread_id)
 * @param workspace - Optional workspace name (for Opik cloud)
 * @param baseUrl - Optional base URL (for self-hosted Opik)
 * @returns URL to view the trace in Opik UI
 */
export function getOpikTraceUrl(
  projectName: string,
  threadId: string,
  workspace?: string,
  baseUrl?: string
): string {
  const base = baseUrl || 'https://www.comet.com/opik';
  const workspacePath = workspace ? `/${workspace}` : '';

  return `${base}${workspacePath}/projects/${projectName}/traces?thread_id=${threadId}`;
}

/**
 * Structured logger for graph executions
 */
export class GraphExecutionLogger {
  private logs: Array<{
    level: 'debug' | 'info' | 'warn' | 'error';
    timestamp: number;
    stage: string;
    message: string;
    data?: unknown;
  }> = [];

  /**
   * Log a debug message
   */
  debug(stage: string, message: string, data?: unknown): void {
    this.log('debug', stage, message, data);
  }

  /**
   * Log an info message
   */
  info(stage: string, message: string, data?: unknown): void {
    this.log('info', stage, message, data);
  }

  /**
   * Log a warning message
   */
  warn(stage: string, message: string, data?: unknown): void {
    this.log('warn', stage, message, data);
  }

  /**
   * Log an error message
   */
  error(stage: string, message: string, data?: unknown): void {
    this.log('error', stage, message, data);
  }

  /**
   * Internal log method
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    stage: string,
    message: string,
    data?: unknown
  ): void {
    const entry = {
      level,
      timestamp: Date.now(),
      stage,
      message,
      data,
    };

    this.logs.push(entry);

    // Also log to console based on level
    const consoleMessage = `[${level.toUpperCase()}] [${stage}] ${message}`;
    switch (level) {
      case 'debug':
        console.debug(consoleMessage, data || '');
        break;
      case 'info':
        console.info(consoleMessage, data || '');
        break;
      case 'warn':
        console.warn(consoleMessage, data || '');
        break;
      case 'error':
        console.error(consoleMessage, data || '');
        break;
    }
  }

  /**
   * Get all logs
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level: 'debug' | 'info' | 'warn' | 'error') {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Get logs filtered by stage
   */
  getLogsByStage(stage: string) {
    return this.logs.filter((log) => log.stage === stage);
  }
}

// ============================================================================
// Advanced Agent Observability Utilities
// ============================================================================

/**
 * Agent selection decision log entry
 */
export interface AgentSelectionLog {
  timestamp: number;
  marketType: string;
  selectedAgents: string[];
  skippedAgents: Array<{
    agent: string;
    reason: 'data_unavailable' | 'cost_optimization' | 'config_disabled' | 'insufficient_history';
  }>;
  totalAgents: number;
  mvpAgents: number;
  advancedAgents: number;
}

/**
 * External data fetch log entry
 */
export interface DataFetchLog {
  timestamp: number;
  source: 'news' | 'polling' | 'social';
  provider: string;
  success: boolean;
  cached: boolean;
  stale: boolean;
  freshness: number; // Age in seconds
  itemCount?: number;
  error?: string;
  duration: number; // milliseconds
}

/**
 * Signal fusion log entry
 */
export interface SignalFusionLog {
  timestamp: number;
  agentCount: number;
  mvpAgentCount: number;
  advancedAgentCount: number;
  weights: Record<string, number>;
  conflicts: Array<{
    agent1: string;
    agent2: string;
    disagreement: number;
  }>;
  signalAlignment: number;
  fusionConfidence: number;
  dataQuality: number;
}

/**
 * Cost optimization log entry
 */
export interface CostOptimizationLog {
  timestamp: number;
  estimatedCost: number;
  maxCost: number;
  skippedAgents: string[];
  totalAgents: number;
  activeAgents: number;
  costSavings: number;
}

/**
 * Performance tracking log entry
 */
export interface PerformanceTrackingLog {
  timestamp: number;
  agentName: string;
  executionTime: number;
  confidence: number;
  fairProbability: number;
  success: boolean;
  error?: string;
}

/**
 * Advanced observability logger for the Advanced Agent League
 *
 * This logger provides specialized logging for:
 * - Agent selection decisions
 * - External data fetching with freshness tracking
 * - Signal fusion process with weights and conflicts
 * - Cost optimization decisions
 * - Performance tracking updates
 */
export class AdvancedObservabilityLogger {
  private agentSelectionLogs: AgentSelectionLog[] = [];
  private dataFetchLogs: DataFetchLog[] = [];
  private signalFusionLogs: SignalFusionLog[] = [];
  private costOptimizationLogs: CostOptimizationLog[] = [];
  private performanceTrackingLogs: PerformanceTrackingLog[] = [];

  /**
   * Log agent selection decision
   */
  logAgentSelection(log: AgentSelectionLog): void {
    this.agentSelectionLogs.push(log);
    console.info('[AgentSelection]', {
      marketType: log.marketType,
      selected: log.selectedAgents.length,
      skipped: log.skippedAgents.length,
      mvp: log.mvpAgents,
      advanced: log.advancedAgents,
    });
  }

  /**
   * Log external data fetch
   */
  logDataFetch(log: DataFetchLog): void {
    this.dataFetchLogs.push(log);
    const status = log.success ? 'SUCCESS' : 'FAILED';
    const cacheStatus = log.cached ? (log.stale ? 'STALE_CACHE' : 'CACHE_HIT') : 'FRESH';
    console.info(`[DataFetch] ${log.source}/${log.provider} ${status} ${cacheStatus}`, {
      freshness: `${log.freshness}s`,
      items: log.itemCount,
      duration: `${log.duration}ms`,
    });
  }

  /**
   * Log signal fusion process
   */
  logSignalFusion(log: SignalFusionLog): void {
    this.signalFusionLogs.push(log);
    console.info('[SignalFusion]', {
      agents: log.agentCount,
      mvp: log.mvpAgentCount,
      advanced: log.advancedAgentCount,
      alignment: log.signalAlignment.toFixed(2),
      confidence: log.fusionConfidence.toFixed(2),
      conflicts: log.conflicts.length,
    });
  }

  /**
   * Log cost optimization decision
   */
  logCostOptimization(log: CostOptimizationLog): void {
    this.costOptimizationLogs.push(log);
    console.info('[CostOptimization]', {
      estimated: `$${log.estimatedCost.toFixed(3)}`,
      max: `$${log.maxCost.toFixed(3)}`,
      skipped: log.skippedAgents.length,
      savings: `$${log.costSavings.toFixed(3)}`,
    });
  }

  /**
   * Log performance tracking update
   */
  logPerformanceTracking(log: PerformanceTrackingLog): void {
    this.performanceTrackingLogs.push(log);
    console.debug('[PerformanceTracking]', {
      agent: log.agentName,
      time: `${log.executionTime}ms`,
      confidence: log.confidence.toFixed(2),
      success: log.success,
    });
  }

  /**
   * Get all agent selection logs
   */
  getAgentSelectionLogs(): AgentSelectionLog[] {
    return [...this.agentSelectionLogs];
  }

  /**
   * Get all data fetch logs
   */
  getDataFetchLogs(): DataFetchLog[] {
    return [...this.dataFetchLogs];
  }

  /**
   * Get all signal fusion logs
   */
  getSignalFusionLogs(): SignalFusionLog[] {
    return [...this.signalFusionLogs];
  }

  /**
   * Get all cost optimization logs
   */
  getCostOptimizationLogs(): CostOptimizationLog[] {
    return [...this.costOptimizationLogs];
  }

  /**
   * Get all performance tracking logs
   */
  getPerformanceTrackingLogs(): PerformanceTrackingLog[] {
    return [...this.performanceTrackingLogs];
  }

  /**
   * Get complete audit trail for advanced agents
   */
  getCompleteAuditTrail() {
    return {
      agentSelection: this.agentSelectionLogs,
      dataFetching: this.dataFetchLogs,
      signalFusion: this.signalFusionLogs,
      costOptimization: this.costOptimizationLogs,
      performanceTracking: this.performanceTrackingLogs,
    };
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.agentSelectionLogs = [];
    this.dataFetchLogs = [];
    this.signalFusionLogs = [];
    this.costOptimizationLogs = [];
    this.performanceTrackingLogs = [];
  }

  /**
   * Validate audit trail completeness
   *
   * Checks that all required log entries are present for a complete audit trail.
   * Returns true if audit trail is complete, false otherwise.
   */
  validateAuditTrailCompleteness(): {
    complete: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    if (this.agentSelectionLogs.length === 0) {
      missing.push('agent_selection');
    }

    if (this.signalFusionLogs.length === 0) {
      missing.push('signal_fusion');
    }

    // Data fetching is optional (depends on agent selection)
    // Cost optimization is optional (depends on configuration)
    // Performance tracking is optional (depends on configuration)

    return {
      complete: missing.length === 0,
      missing,
    };
  }
}

