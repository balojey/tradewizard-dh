/**
 * Opik Integration for Automated Market Monitor
 *
 * This module provides Opik observability integration for the monitor service,
 * including custom spans for monitor operations, cost tracking per analysis cycle,
 * and agent performance tracking across cycles.
 * 
 * Includes Nova-specific tracing with provider tags, model variant metadata,
 * and cost tracking for Amazon Bedrock models.
 */

import { OpikCallbackHandler } from 'opik-langchain';
import type { EngineConfig } from '../config/index.js';
import type { MarketId } from '../models/types.js';
import type { AgentSignal } from '../models/types.js';
import { getOpikTraceUrl } from './audit-logger.js';
import { BedrockClient } from './bedrock-client.js';
import type { LLMProvider } from '../config/llm-config.js';

/**
 * Opik span metadata for monitor operations
 */
export interface OpikSpanMetadata {
  operation: string;
  marketId?: MarketId;
  conditionId?: string;
  timestamp: number;
  duration?: number;
  cost?: number;
  status: 'success' | 'error' | 'in_progress';
  error?: string;
  // Nova-specific metadata
  provider?: LLMProvider;
  modelVariant?: string;
  agentName?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  [key: string]: unknown;
}

/**
 * Nova invocation metadata for Opik tracking
 */
export interface NovaInvocationMetadata {
  provider: 'nova';
  modelVariant: 'micro' | 'lite' | 'pro';
  modelId: string;
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timestamp: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Analysis cycle metrics for Opik tracking
 */
export interface AnalysisCycleMetrics {
  cycleId: string;
  timestamp: number;
  marketsDiscovered: number;
  marketsAnalyzed: number;
  marketsUpdated: number;
  totalDuration: number;
  totalCost: number;
  successCount: number;
  errorCount: number;
  agentMetrics: Record<string, AgentCycleMetrics>;
}

/**
 * Agent performance metrics per cycle
 */
export interface AgentCycleMetrics {
  agentName: string;
  executionCount: number;
  totalDuration: number;
  averageDuration: number;
  totalCost: number;
  averageCost: number;
  successCount: number;
  errorCount: number;
  averageConfidence: number;
  // Nova-specific metrics
  provider?: LLMProvider;
  modelVariant?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  averageLatencyMs?: number;
}

/**
 * Opik integration manager for monitor service
 */
export class OpikMonitorIntegration {
  private config: EngineConfig;
  private currentCycleMetrics: AnalysisCycleMetrics | null = null;
  private cycleHistory: AnalysisCycleMetrics[] = [];

  constructor(config: EngineConfig) {
    this.config = config;
  }

  /**
   * Create Opik callback handler for workflow execution
   */
  createOpikHandler(): OpikCallbackHandler {
    return new OpikCallbackHandler({
      projectName: this.config.opik.projectName,
    });
  }

  /**
   * Create Opik callback handler for Nova tracking
   * 
   * Note: OpikCallbackHandler doesn't support tags in constructor.
   * Tags should be added via metadata in the tracked operations.
   * 
   * @returns OpikCallbackHandler for Nova operations
   */
  createNovaOpikHandler(): OpikCallbackHandler {
    return new OpikCallbackHandler({
      projectName: this.config.opik.projectName,
    });
  }

  /**
   * Start tracking an analysis cycle
   */
  startCycle(): string {
    const cycleId = `cycle_${Date.now()}`;
    this.currentCycleMetrics = {
      cycleId,
      timestamp: Date.now(),
      marketsDiscovered: 0,
      marketsAnalyzed: 0,
      marketsUpdated: 0,
      totalDuration: 0,
      totalCost: 0,
      successCount: 0,
      errorCount: 0,
      agentMetrics: {},
    };

    console.log(`[OpikMonitor] Started tracking cycle: ${cycleId}`);
    return cycleId;
  }

  /**
   * Record market discovery in current cycle
   */
  recordDiscovery(marketCount: number): void {
    if (!this.currentCycleMetrics) {
      console.warn('[OpikMonitor] No active cycle to record discovery');
      return;
    }

    this.currentCycleMetrics.marketsDiscovered = marketCount;
    console.log(`[OpikMonitor] Recorded discovery: ${marketCount} markets`);
  }

  /**
   * Record market analysis in current cycle
   */
  recordAnalysis(
    conditionId: string,
    duration: number,
    cost: number,
    success: boolean,
    agentSignals: AgentSignal[] = [],
    error?: string
  ): void {
    if (!this.currentCycleMetrics) {
      console.warn('[OpikMonitor] No active cycle to record analysis');
      return;
    }

    // Update cycle totals
    this.currentCycleMetrics.marketsAnalyzed++;
    this.currentCycleMetrics.totalDuration += duration;
    this.currentCycleMetrics.totalCost += cost;

    if (success) {
      this.currentCycleMetrics.successCount++;
    } else {
      this.currentCycleMetrics.errorCount++;
    }

    // Update agent metrics
    for (const signal of agentSignals) {
      this.updateAgentMetrics(signal, duration, cost, success);
    }

    // Log Opik trace URL
    const traceUrl = this.getTraceUrl(conditionId);
    console.log(`[OpikMonitor] Analysis recorded: ${conditionId}`);
    console.log(`[OpikMonitor] Opik Trace: ${traceUrl}`);

    if (error) {
      console.error(`[OpikMonitor] Analysis error: ${error}`);
    }
  }

  /**
   * Record Nova-specific invocation in current cycle
   * 
   * Tracks Nova model usage with detailed metadata including:
   * - Model variant (micro, lite, pro)
   * - Token counts (input/output)
   * - Latency metrics
   * - Cost breakdown
   * 
   * @param metadata - Nova invocation metadata
   */
  recordNovaInvocation(metadata: NovaInvocationMetadata): void {
    if (!this.currentCycleMetrics) {
      console.warn('[OpikMonitor] No active cycle to record Nova invocation');
      return;
    }

    // Update cycle totals
    this.currentCycleMetrics.totalCost += metadata.totalCost;
    this.currentCycleMetrics.totalDuration += metadata.latencyMs;

    if (metadata.success) {
      this.currentCycleMetrics.successCount++;
    } else {
      this.currentCycleMetrics.errorCount++;
    }

    // Update agent metrics with Nova-specific data
    const agentName = metadata.agentName;
    const metrics = this.currentCycleMetrics.agentMetrics[agentName] || {
      agentName,
      executionCount: 0,
      totalDuration: 0,
      averageDuration: 0,
      totalCost: 0,
      averageCost: 0,
      successCount: 0,
      errorCount: 0,
      averageConfidence: 0,
      provider: 'nova',
      modelVariant: metadata.modelVariant,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      averageLatencyMs: 0,
    };

    // Update counts
    metrics.executionCount++;
    if (metadata.success) {
      metrics.successCount++;
    } else {
      metrics.errorCount++;
    }

    // Update totals
    metrics.totalDuration += metadata.latencyMs;
    metrics.totalCost += metadata.totalCost;
    metrics.totalInputTokens = (metrics.totalInputTokens || 0) + metadata.inputTokens;
    metrics.totalOutputTokens = (metrics.totalOutputTokens || 0) + metadata.outputTokens;

    // Update averages
    metrics.averageDuration = metrics.totalDuration / metrics.executionCount;
    metrics.averageCost = metrics.totalCost / metrics.executionCount;
    metrics.averageLatencyMs = metrics.totalDuration / metrics.executionCount;

    this.currentCycleMetrics.agentMetrics[agentName] = metrics;

    // Log Nova invocation details
    console.log(`[OpikMonitor] Nova invocation recorded:`, {
      agent: metadata.agentName,
      model: metadata.modelVariant,
      inputTokens: metadata.inputTokens,
      outputTokens: metadata.outputTokens,
      latency: `${metadata.latencyMs}ms`,
      cost: `$${metadata.totalCost.toFixed(6)}`,
      success: metadata.success,
    });

    if (!metadata.success && metadata.errorMessage) {
      console.error(`[OpikMonitor] Nova invocation error: ${metadata.errorMessage}`);
    }
  }

  /**
   * Record market update in current cycle
   */
  recordUpdate(conditionId: string): void {
    if (!this.currentCycleMetrics) {
      console.warn('[OpikMonitor] No active cycle to record update');
      return;
    }

    this.currentCycleMetrics.marketsUpdated++;
    console.log(`[OpikMonitor] Recorded update: ${conditionId}`);
  }

  /**
   * End current cycle and store metrics
   */
  endCycle(): AnalysisCycleMetrics | null {
    if (!this.currentCycleMetrics) {
      console.warn('[OpikMonitor] No active cycle to end');
      return null;
    }

    const metrics = this.currentCycleMetrics;
    this.cycleHistory.push(metrics);

    // Keep only last 100 cycles
    if (this.cycleHistory.length > 100) {
      this.cycleHistory.shift();
    }

    console.log(`[OpikMonitor] Cycle ended: ${metrics.cycleId}`);
    console.log(`[OpikMonitor] Cycle summary:`, {
      discovered: metrics.marketsDiscovered,
      analyzed: metrics.marketsAnalyzed,
      updated: metrics.marketsUpdated,
      duration: `${(metrics.totalDuration / 1000).toFixed(2)}s`,
      cost: `$${metrics.totalCost.toFixed(4)}`,
      success: metrics.successCount,
      errors: metrics.errorCount,
    });

    this.currentCycleMetrics = null;
    return metrics;
  }

  /**
   * Get current cycle metrics
   */
  getCurrentCycleMetrics(): AnalysisCycleMetrics | null {
    return this.currentCycleMetrics;
  }

  /**
   * Get cycle history
   */
  getCycleHistory(): AnalysisCycleMetrics[] {
    return [...this.cycleHistory];
  }

  /**
   * Get aggregate metrics across all cycles
   */
  getAggregateMetrics(): {
    totalCycles: number;
    totalMarketsAnalyzed: number;
    totalCost: number;
    averageCostPerMarket: number;
    averageDurationPerMarket: number;
    successRate: number;
    topAgents: Array<{ agentName: string; averageCost: number; averageDuration: number }>;
  } {
    if (this.cycleHistory.length === 0) {
      return {
        totalCycles: 0,
        totalMarketsAnalyzed: 0,
        totalCost: 0,
        averageCostPerMarket: 0,
        averageDurationPerMarket: 0,
        successRate: 0,
        topAgents: [],
      };
    }

    const totalMarketsAnalyzed = this.cycleHistory.reduce(
      (sum, cycle) => sum + cycle.marketsAnalyzed,
      0
    );
    const totalCost = this.cycleHistory.reduce((sum, cycle) => sum + cycle.totalCost, 0);
    const totalDuration = this.cycleHistory.reduce((sum, cycle) => sum + cycle.totalDuration, 0);
    const totalSuccess = this.cycleHistory.reduce((sum, cycle) => sum + cycle.successCount, 0);
    const totalErrors = this.cycleHistory.reduce((sum, cycle) => sum + cycle.errorCount, 0);

    // Aggregate agent metrics
    const agentAggregates: Record<string, { totalCost: number; totalDuration: number; count: number }> = {};

    for (const cycle of this.cycleHistory) {
      for (const [agentName, metrics] of Object.entries(cycle.agentMetrics)) {
        if (!agentAggregates[agentName]) {
          agentAggregates[agentName] = { totalCost: 0, totalDuration: 0, count: 0 };
        }
        agentAggregates[agentName].totalCost += metrics.totalCost;
        agentAggregates[agentName].totalDuration += metrics.totalDuration;
        agentAggregates[agentName].count += metrics.executionCount;
      }
    }

    const topAgents = Object.entries(agentAggregates)
      .map(([agentName, data]) => ({
        agentName,
        averageCost: data.totalCost / data.count,
        averageDuration: data.totalDuration / data.count,
      }))
      .sort((a, b) => b.averageCost - a.averageCost)
      .slice(0, 10);

    return {
      totalCycles: this.cycleHistory.length,
      totalMarketsAnalyzed,
      totalCost,
      averageCostPerMarket: totalMarketsAnalyzed > 0 ? totalCost / totalMarketsAnalyzed : 0,
      averageDurationPerMarket: totalMarketsAnalyzed > 0 ? totalDuration / totalMarketsAnalyzed : 0,
      successRate: totalSuccess + totalErrors > 0 ? totalSuccess / (totalSuccess + totalErrors) : 0,
      topAgents,
    };
  }

  /**
   * Get Opik trace URL for a market analysis
   */
  getTraceUrl(conditionId: string): string {
    const workspace = process.env.OPIK_WORKSPACE;
    const baseUrl = process.env.OPIK_BASE_URL;

    return getOpikTraceUrl(this.config.opik.projectName, conditionId, workspace, baseUrl);
  }

  /**
   * Log Opik dashboard link
   */
  logDashboardLink(): void {
    const baseUrl = process.env.OPIK_BASE_URL || 'https://www.comet.com/opik';
    const workspace = process.env.OPIK_WORKSPACE || 'default';
    const projectName = this.config.opik.projectName;

    const dashboardUrl = `${baseUrl}/${workspace}/projects/${projectName}`;
    console.log(`[OpikMonitor] Opik Dashboard: ${dashboardUrl}`);
  }

  /**
   * Create custom Opik span metadata for monitor operations
   */
  createSpanMetadata(operation: string, data: Partial<OpikSpanMetadata> = {}): OpikSpanMetadata {
    return {
      operation,
      timestamp: Date.now(),
      status: 'in_progress',
      ...data,
    };
  }

  /**
   * Create Nova-specific Opik span metadata
   * 
   * @param operation - Operation name
   * @param modelVariant - Nova model variant (micro, lite, pro)
   * @param agentName - Agent name
   * @param data - Additional metadata
   * @returns OpikSpanMetadata with Nova-specific fields
   */
  createNovaSpanMetadata(
    operation: string,
    modelVariant: string,
    agentName: string,
    data: Partial<OpikSpanMetadata> = {}
  ): OpikSpanMetadata {
    return {
      operation,
      timestamp: Date.now(),
      status: 'in_progress',
      provider: 'nova',
      modelVariant,
      agentName,
      ...data,
    };
  }

  /**
   * Extract Nova model variant from model ID
   * 
   * @param modelId - Full Nova model ID (e.g., "amazon.nova-lite-v1:0")
   * @returns Model variant (micro, lite, pro) or undefined
   */
  static extractNovaVariant(modelId: string): 'micro' | 'lite' | 'pro' | undefined {
    if (modelId.includes('micro')) return 'micro';
    if (modelId.includes('lite')) return 'lite';
    if (modelId.includes('pro')) return 'pro';
    return undefined;
  }

  /**
   * Calculate Nova invocation cost
   * 
   * @param modelVariant - Nova model variant
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @returns Cost breakdown with input, output, and total costs
   */
  static calculateNovaCost(
    modelVariant: 'micro' | 'lite' | 'pro',
    inputTokens: number,
    outputTokens: number
  ): { inputCost: number; outputCost: number; totalCost: number } {
    const models = BedrockClient.getAvailableModels();
    const model = models.find((m) => m.id === modelVariant);

    if (!model) {
      throw new Error(`Unknown Nova model variant: ${modelVariant}`);
    }

    const inputCost = (inputTokens / 1000) * model.inputCostPer1kTokens;
    const outputCost = (outputTokens / 1000) * model.outputCostPer1kTokens;
    const totalCost = inputCost + outputCost;

    return { inputCost, outputCost, totalCost };
  }

  /**
   * Update agent metrics in current cycle
   */
  private updateAgentMetrics(
    signal: AgentSignal,
    duration: number,
    cost: number,
    success: boolean
  ): void {
    if (!this.currentCycleMetrics) return;

    const agentName = signal.agentName;
    const metrics = this.currentCycleMetrics.agentMetrics[agentName] || {
      agentName,
      executionCount: 0,
      totalDuration: 0,
      averageDuration: 0,
      totalCost: 0,
      averageCost: 0,
      successCount: 0,
      errorCount: 0,
      averageConfidence: 0,
    };

    // Update counts
    metrics.executionCount++;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.errorCount++;
    }

    // Update totals
    metrics.totalDuration += duration;
    metrics.totalCost += cost;

    // Update averages
    metrics.averageDuration = metrics.totalDuration / metrics.executionCount;
    metrics.averageCost = metrics.totalCost / metrics.executionCount;

    // Update confidence (running average)
    const n = metrics.executionCount;
    metrics.averageConfidence =
      (metrics.averageConfidence * (n - 1) + signal.confidence) / n;

    this.currentCycleMetrics.agentMetrics[agentName] = metrics;
  }
}

/**
 * Create Opik monitor integration instance
 */
export function createOpikMonitorIntegration(config: EngineConfig): OpikMonitorIntegration {
  return new OpikMonitorIntegration(config);
}

/**
 * Format cycle metrics for logging
 */
/**
 * Format cycle metrics for logging
 */
export function formatCycleMetrics(metrics: AnalysisCycleMetrics): string {
  const lines = [
    `Cycle: ${metrics.cycleId}`,
    `Timestamp: ${new Date(metrics.timestamp).toISOString()}`,
    `Markets Discovered: ${metrics.marketsDiscovered}`,
    `Markets Analyzed: ${metrics.marketsAnalyzed}`,
    `Markets Updated: ${metrics.marketsUpdated}`,
    `Total Duration: ${(metrics.totalDuration / 1000).toFixed(2)}s`,
    `Total Cost: ${metrics.totalCost.toFixed(4)}`,
    `Success: ${metrics.successCount}`,
    `Errors: ${metrics.errorCount}`,
    `Success Rate: ${((metrics.successCount / (metrics.successCount + metrics.errorCount)) * 100).toFixed(1)}%`,
  ];

  if (Object.keys(metrics.agentMetrics).length > 0) {
    lines.push('\nAgent Performance:');
    for (const [agentName, agentMetrics] of Object.entries(metrics.agentMetrics)) {
      let agentLine = `  ${agentName}: ${agentMetrics.executionCount} executions, ` +
        `avg ${agentMetrics.averageDuration.toFixed(0)}ms, ` +
        `avg ${agentMetrics.averageCost.toFixed(4)}, ` +
        `confidence ${agentMetrics.averageConfidence.toFixed(2)}`;

      // Add Nova-specific metrics if available
      if (agentMetrics.provider === 'nova' && agentMetrics.modelVariant) {
        agentLine += ` [Nova ${agentMetrics.modelVariant}`;
        if (agentMetrics.totalInputTokens && agentMetrics.totalOutputTokens) {
          agentLine += `, ${agentMetrics.totalInputTokens} in / ${agentMetrics.totalOutputTokens} out tokens`;
        }
        agentLine += `]`;
      }

      lines.push(agentLine);
    }
  }

  return lines.join('\n');
}

/**
 * Format aggregate metrics for logging
 */
export function formatAggregateMetrics(metrics: ReturnType<OpikMonitorIntegration['getAggregateMetrics']>): string {
  const lines = [
    'Aggregate Metrics (All Cycles):',
    `Total Cycles: ${metrics.totalCycles}`,
    `Total Markets Analyzed: ${metrics.totalMarketsAnalyzed}`,
    `Total Cost: $${metrics.totalCost.toFixed(4)}`,
    `Average Cost per Market: $${metrics.averageCostPerMarket.toFixed(4)}`,
    `Average Duration per Market: ${(metrics.averageDurationPerMarket / 1000).toFixed(2)}s`,
    `Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`,
  ];

  if (metrics.topAgents.length > 0) {
    lines.push('\nTop Agents by Cost:');
    for (const agent of metrics.topAgents) {
      lines.push(
        `  ${agent.agentName}: avg $${agent.averageCost.toFixed(4)}, ` +
        `avg ${(agent.averageDuration / 1000).toFixed(2)}s`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Track Nova model invocation with Opik
 * 
 * This is a convenience function for tracking Nova LLM invocations with complete
 * metadata including model variant, token counts, latency, and cost information.
 * 
 * Usage example:
 * ```typescript
 * const startTime = Date.now();
 * const result = await novaModel.invoke(prompt);
 * const latency = Date.now() - startTime;
 * 
 * await trackNovaInvocation({
 *   agentName: 'market_microstructure',
 *   modelId: 'amazon.nova-lite-v1:0',
 *   inputTokens: result.usage.inputTokens,
 *   outputTokens: result.usage.outputTokens,
 *   latencyMs: latency,
 *   config,
 *   success: true,
 * });
 * ```
 * 
 * @param params - Nova invocation tracking parameters
 * @returns Promise that resolves when tracking is complete
 */
export async function trackNovaInvocation(params: {
  agentName: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  config: EngineConfig;
  success: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  const {
    agentName,
    modelId,
    inputTokens,
    outputTokens,
    latencyMs,
    config,
    success,
    temperature,
    maxTokens,
    topP,
    errorCode,
    errorMessage,
  } = params;

  // Extract model variant from model ID
  const modelVariant = OpikMonitorIntegration.extractNovaVariant(modelId);
  if (!modelVariant) {
    console.warn(`[trackNovaInvocation] Could not extract variant from model ID: ${modelId}`);
    return;
  }

  // Calculate costs
  const { inputCost, outputCost, totalCost } = OpikMonitorIntegration.calculateNovaCost(
    modelVariant,
    inputTokens,
    outputTokens
  );

  // Create metadata object
  const metadata: NovaInvocationMetadata = {
    provider: 'nova',
    modelVariant,
    modelId,
    agentName,
    inputTokens,
    outputTokens,
    latencyMs,
    inputCost,
    outputCost,
    totalCost,
    temperature,
    maxTokens,
    topP,
    timestamp: Date.now(),
    success,
    errorCode,
    errorMessage,
  };

  // Log to console for immediate visibility
  if (config.logging.level === 'debug' || config.logging.level === 'info') {
    console.log(`[Nova Invocation] ${agentName}:`, {
      model: modelVariant,
      inputTokens,
      outputTokens,
      latency: `${latencyMs}ms`,
      cost: `$${totalCost.toFixed(6)}`,
      success,
    });
  }

  // If Opik tracking is enabled, record the invocation
  if (config.opik.trackCosts) {
    try {
      // Note: The actual Opik trace is created by OpikCallbackHandler in the workflow
      // This function provides additional structured logging and metrics
      
      // Format metadata for Opik
      const formattedMetadata = formatNovaMetadataForOpik(metadata);
      
      // Log detailed metadata for Opik dashboard filtering
      console.log(`[Opik] Nova invocation metadata:`, {
        tags: [
          'provider:nova',
          `model:${modelVariant}`,
          `agent:${agentName}`,
        ],
        metadata: formattedMetadata,
      });
    } catch (error) {
      console.error('[trackNovaInvocation] Failed to track with Opik:', error);
    }
  }

  // Log errors if invocation failed
  if (!success && errorMessage) {
    console.error(`[Nova Invocation Error] ${agentName}:`, {
      errorCode,
      errorMessage,
      model: modelVariant,
    });
  }
}

/**
 * Create Nova-specific Opik tags for filtering and analysis
 * 
 * These tags enable filtering in the Opik dashboard by:
 * - Provider (nova)
 * - Model variant (micro, lite, pro)
 * - Agent name
 * - Cost tier
 * 
 * @param modelVariant - Nova model variant
 * @param agentName - Agent name
 * @param totalCost - Total cost of invocation
 * @returns Array of Opik tags
 */
export function createNovaOpikTags(
  modelVariant: 'micro' | 'lite' | 'pro',
  agentName: string,
  totalCost: number
): string[] {
  const tags = [
    'provider:nova',
    `model:${modelVariant}`,
    `agent:${agentName}`,
  ];

  // Add cost tier tag for easy filtering
  if (totalCost < 0.001) {
    tags.push('cost:low');
  } else if (totalCost < 0.01) {
    tags.push('cost:medium');
  } else {
    tags.push('cost:high');
  }

  return tags;
}

/**
 * Format Nova invocation metadata for Opik trace
 * 
 * Creates a structured metadata object optimized for Opik dashboard display
 * and analysis. Includes all relevant Nova-specific information.
 * 
 * @param metadata - Nova invocation metadata
 * @returns Formatted metadata object for Opik
 */
export function formatNovaMetadataForOpik(metadata: NovaInvocationMetadata): Record<string, unknown> {
  return {
    // Provider information
    provider: 'nova',
    model_variant: metadata.modelVariant,
    model_id: metadata.modelId,
    
    // Agent information
    agent_name: metadata.agentName,
    
    // Token usage
    input_tokens: metadata.inputTokens,
    output_tokens: metadata.outputTokens,
    total_tokens: metadata.inputTokens + metadata.outputTokens,
    
    // Performance metrics
    latency_ms: metadata.latencyMs,
    
    // Cost breakdown
    input_cost_usd: metadata.inputCost,
    output_cost_usd: metadata.outputCost,
    total_cost_usd: metadata.totalCost,
    
    // Model parameters
    temperature: metadata.temperature,
    max_tokens: metadata.maxTokens,
    top_p: metadata.topP,
    
    // Status
    success: metadata.success,
    error_code: metadata.errorCode,
    error_message: metadata.errorMessage,
    
    // Timestamp
    timestamp: new Date(metadata.timestamp).toISOString(),
  };
}
