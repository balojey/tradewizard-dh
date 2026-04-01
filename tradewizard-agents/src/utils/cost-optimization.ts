/**
 * Cost Optimization Utilities
 *
 * This module provides cost estimation and optimization for agent execution.
 * It helps manage LLM API costs by:
 * - Estimating costs before agent activation
 * - Skipping low-impact agents when budget is constrained
 * - Prioritizing MVP and high-value agents
 * - Tracking actual costs via Opik integration
 */

import type { EngineConfig } from '../config/index.js';

/**
 * Nova model pricing (per 1K tokens)
 * 
 * Official AWS Bedrock pricing for Amazon Nova models:
 * 
 * Nova v1 Models (Original):
 * - Nova Micro: $0.000035 per 1K input tokens, $0.00014 per 1K output tokens
 * - Nova Lite: $0.00006 per 1K input tokens, $0.00024 per 1K output tokens
 * - Nova Pro: $0.0008 per 1K input tokens, $0.0032 per 1K output tokens
 * 
 * Nova 2 Models (December 2025):
 * - Nova 2 Lite: $0.30 per 1M tokens input, $2.50 per 1M tokens output (reasoning disabled)
 * - Nova 2 Pro: Similar to Nova Pro v1 (preview pricing)
 * 
 * Note: Nova 2 models support extended reasoning which may increase costs.
 * Pricing shown is for reasoning disabled mode.
 */
export const NOVA_PRICING = {
  // Nova v1 Models
  'amazon.nova-micro-v1:0': {
    inputCostPer1kTokens: 0.000035,
    outputCostPer1kTokens: 0.00014,
  },
  'amazon.nova-lite-v1:0': {
    inputCostPer1kTokens: 0.00006,
    outputCostPer1kTokens: 0.00024,
  },
  'amazon.nova-pro-v1:0': {
    inputCostPer1kTokens: 0.0008,
    outputCostPer1kTokens: 0.0032,
  },
  // Nova 2 Models
  'global.amazon.nova-2-lite-v1:0': {
    inputCostPer1kTokens: 0.0003,  // $0.30 per 1M tokens
    outputCostPer1kTokens: 0.0025,  // $2.50 per 1M tokens
  },
  'global.amazon.nova-2-pro-v1:0': {
    inputCostPer1kTokens: 0.0008,  // Estimated, similar to Nova Pro v1
    outputCostPer1kTokens: 0.0032,  // Estimated, similar to Nova Pro v1
  },
} as const;

/**
 * Cost estimates per agent type (in USD)
 * 
 * These are rough estimates based on typical LLM API costs:
 * - GPT-4: ~$0.03 per 1K input tokens, ~$0.06 per 1K output tokens
 * - Claude: ~$0.015 per 1K input tokens, ~$0.075 per 1K output tokens
 * - Gemini: ~$0.00025 per 1K input tokens, ~$0.0005 per 1K output tokens
 * - Nova Micro: ~$0.000035 per 1K input tokens, ~$0.00014 per 1K output tokens
 * - Nova Lite: ~$0.00006 per 1K input tokens, ~$0.00024 per 1K output tokens
 * - Nova Pro: ~$0.0008 per 1K input tokens, ~$0.0032 per 1K output tokens
 * 
 * Average agent call: ~2K input tokens, ~500 output tokens
 */
const AGENT_COST_ESTIMATES: Record<string, number> = {
  // MVP agents (always run, higher priority)
  'market_microstructure': 0.10,
  'probability_baseline': 0.08,
  'risk_assessment': 0.10,
  
  // Event Intelligence agents (high value)
  'breaking_news': 0.12,
  'event_impact': 0.12,
  
  // Polling & Statistical agents (high value for elections)
  'polling_intelligence': 0.15,
  'historical_pattern': 0.10,
  
  // Sentiment & Narrative agents (medium value, can be noisy)
  'media_sentiment': 0.10,
  'social_sentiment': 0.10,
  'narrative_velocity': 0.10,
  
  // Price Action agents (medium value, market-dependent)
  'momentum': 0.08,
  'mean_reversion': 0.08,
  
  // Event Scenario agents (medium value)
  'catalyst': 0.10,
  'tail_risk': 0.10,
  
  // Risk Philosophy agents (lower cost, run after consensus)
  'aggressive': 0.06,
  'conservative': 0.06,
  'neutral': 0.06,
};

/**
 * Agent priority levels for cost optimization
 * 
 * When budget is constrained, agents are prioritized:
 * 1. CRITICAL: MVP agents (always run)
 * 2. HIGH: Event intelligence, polling (high signal value)
 * 3. MEDIUM: Catalysts, historical patterns, price action
 * 4. LOW: Sentiment, narrative velocity (can be noisy)
 */
export enum AgentPriority {
  CRITICAL = 1,
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4,
}

const AGENT_PRIORITIES: Record<string, AgentPriority> = {
  // MVP agents - always run
  'market_microstructure': AgentPriority.CRITICAL,
  'probability_baseline': AgentPriority.CRITICAL,
  'risk_assessment': AgentPriority.CRITICAL,
  
  // High-value advanced agents
  'breaking_news': AgentPriority.HIGH,
  'event_impact': AgentPriority.HIGH,
  'polling_intelligence': AgentPriority.HIGH,
  
  // Medium-value agents
  'catalyst': AgentPriority.MEDIUM,
  'historical_pattern': AgentPriority.MEDIUM,
  'momentum': AgentPriority.MEDIUM,
  'mean_reversion': AgentPriority.MEDIUM,
  'tail_risk': AgentPriority.MEDIUM,
  
  // Lower-priority agents (can be skipped if budget tight)
  'media_sentiment': AgentPriority.LOW,
  'social_sentiment': AgentPriority.LOW,
  'narrative_velocity': AgentPriority.LOW,
  
  // Risk philosophy agents (run after consensus, lower cost)
  'aggressive': AgentPriority.MEDIUM,
  'conservative': AgentPriority.MEDIUM,
  'neutral': AgentPriority.MEDIUM,
};

/**
 * Estimate cost for a set of agents
 * 
 * @param agentNames - Array of agent names to estimate cost for
 * @returns Estimated total cost in USD
 */
export function estimateAgentCost(agentNames: string[]): number {
  return agentNames.reduce((total, agentName) => {
    const cost = AGENT_COST_ESTIMATES[agentName] ?? 0.10; // Default to $0.10 if unknown
    return total + cost;
  }, 0);
}

/**
 * Get priority for an agent
 * 
 * @param agentName - Agent name
 * @returns Priority level
 */
export function getAgentPriority(agentName: string): AgentPriority {
  return AGENT_PRIORITIES[agentName] ?? AgentPriority.LOW;
}

/**
 * Filter agents based on cost budget
 * 
 * This function implements cost-aware agent selection:
 * 1. Always include CRITICAL priority agents (MVP)
 * 2. Add HIGH priority agents if budget allows
 * 3. Add MEDIUM priority agents if budget allows
 * 4. Add LOW priority agents if budget allows
 * 5. Within each priority level, sort by estimated value/cost ratio
 * 
 * @param candidateAgents - Array of candidate agent names
 * @param maxCost - Maximum cost budget in USD
 * @param skipLowImpact - Whether to skip low-impact agents
 * @returns Object with selected agents and cost breakdown
 */
export function filterAgentsByCost(
  candidateAgents: string[],
  maxCost: number,
  skipLowImpact: boolean
): {
  selectedAgents: string[];
  skippedAgents: string[];
  estimatedCost: number;
  remainingBudget: number;
  costBreakdown: Record<string, number>;
} {
  // Separate agents by priority
  const agentsByPriority: Record<AgentPriority, string[]> = {
    [AgentPriority.CRITICAL]: [],
    [AgentPriority.HIGH]: [],
    [AgentPriority.MEDIUM]: [],
    [AgentPriority.LOW]: [],
  };

  for (const agent of candidateAgents) {
    const priority = getAgentPriority(agent);
    agentsByPriority[priority].push(agent);
  }

  const selectedAgents: string[] = [];
  const skippedAgents: string[] = [];
  const costBreakdown: Record<string, number> = {};
  let currentCost = 0;
  let hasSkippedHigherPriority = false; // Track if we've skipped a higher priority agent

  // Helper function to try adding agents from a priority level
  const tryAddAgents = (agents: string[], canSkip: boolean): void => {
    for (const agent of agents) {
      const agentCost = AGENT_COST_ESTIMATES[agent] ?? 0.10;
      
      // If we've already skipped a higher priority agent due to budget,
      // we must skip all lower priority agents to maintain priority ordering
      if (hasSkippedHigherPriority && canSkip && skipLowImpact) {
        skippedAgents.push(agent);
        continue;
      }
      
      // Check if we can afford this agent
      if (currentCost + agentCost <= maxCost) {
        selectedAgents.push(agent);
        costBreakdown[agent] = agentCost;
        currentCost += agentCost;
      } else if (canSkip && skipLowImpact) {
        // Skip this agent if we're over budget and skipping is allowed
        skippedAgents.push(agent);
        hasSkippedHigherPriority = true; // Mark that we've skipped an agent
      } else {
        // For critical agents, we must include them even if over budget
        selectedAgents.push(agent);
        costBreakdown[agent] = agentCost;
        currentCost += agentCost;
      }
    }
  };

  // Add agents by priority
  tryAddAgents(agentsByPriority[AgentPriority.CRITICAL], false); // Never skip critical
  tryAddAgents(agentsByPriority[AgentPriority.HIGH], true);
  tryAddAgents(agentsByPriority[AgentPriority.MEDIUM], true);
  tryAddAgents(agentsByPriority[AgentPriority.LOW], true);

  return {
    selectedAgents,
    skippedAgents,
    estimatedCost: currentCost,
    remainingBudget: Math.max(0, maxCost - currentCost),
    costBreakdown,
  };
}

/**
 * Apply cost optimization to agent selection
 * 
 * This is the main entry point for cost optimization.
 * It filters agents based on configuration and budget constraints.
 * 
 * @param candidateAgents - Array of candidate agent names
 * @param config - Engine configuration
 * @returns Object with optimization results
 */
export function applyCostOptimization(
  candidateAgents: string[],
  config: EngineConfig
): {
  selectedAgents: string[];
  skippedAgents: string[];
  estimatedCost: number;
  maxCost: number;
  costBreakdown: Record<string, number>;
  optimizationApplied: boolean;
} {
  const maxCost = config.costOptimization.maxCostPerAnalysis;
  const skipLowImpact = config.costOptimization.skipLowImpactAgents;

  // If cost optimization is disabled, return all agents
  if (!skipLowImpact) {
    const estimatedCost = estimateAgentCost(candidateAgents);
    const costBreakdown: Record<string, number> = {};
    candidateAgents.forEach(agent => {
      costBreakdown[agent] = AGENT_COST_ESTIMATES[agent] ?? 0.10;
    });

    return {
      selectedAgents: candidateAgents,
      skippedAgents: [],
      estimatedCost,
      maxCost,
      costBreakdown,
      optimizationApplied: false,
    };
  }

  // Apply cost-based filtering
  const result = filterAgentsByCost(candidateAgents, maxCost, skipLowImpact);

  return {
    ...result,
    maxCost,
    optimizationApplied: result.skippedAgents.length > 0,
  };
}

/**
 * Log cost optimization decision
 * 
 * Creates an audit log entry for cost optimization decisions.
 * 
 * @param result - Cost optimization result
 * @returns Audit log entry data
 */
export function createCostOptimizationAuditEntry(result: {
  selectedAgents: string[];
  skippedAgents: string[];
  estimatedCost: number;
  maxCost: number;
  costBreakdown: Record<string, number>;
  optimizationApplied: boolean;
}): Record<string, any> {
  return {
    optimizationApplied: result.optimizationApplied,
    maxCost: result.maxCost,
    estimatedCost: result.estimatedCost,
    remainingBudget: result.maxCost - result.estimatedCost,
    selectedAgentCount: result.selectedAgents.length,
    skippedAgentCount: result.skippedAgents.length,
    selectedAgents: result.selectedAgents,
    skippedAgents: result.skippedAgents,
    costBreakdown: result.costBreakdown,
    budgetUtilization: (result.estimatedCost / result.maxCost) * 100,
  };
}

/**
 * Get Nova pricing information for a specific model variant
 * 
 * @param modelId - Nova model ID (e.g., "amazon.nova-lite-v1:0")
 * @returns Pricing information with input and output costs per 1K tokens
 * @throws Error if model ID is not a valid Nova model
 */
export function getNovaPricing(modelId: string): {
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
} {
  const pricing = NOVA_PRICING[modelId as keyof typeof NOVA_PRICING];
  
  if (!pricing) {
    throw new Error(
      `Invalid Nova model ID: "${modelId}". Valid options: ${Object.keys(NOVA_PRICING).join(', ')}`
    );
  }
  
  return pricing;
}

/**
 * Calculate cost for LLM usage
 * 
 * Supports multiple providers:
 * - Nova: Uses official AWS Bedrock pricing
 * - OpenAI/Anthropic/Google: Uses approximate pricing
 * 
 * @param provider - LLM provider ("nova", "openai", "anthropic", "google")
 * @param modelName - Model name or ID
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateCost(
  provider: string,
  modelName: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (provider === 'nova') {
    // Use precise Nova pricing
    const pricing = getNovaPricing(modelName);
    const inputCost = (inputTokens / 1000) * pricing.inputCostPer1kTokens;
    const outputCost = (outputTokens / 1000) * pricing.outputCostPer1kTokens;
    return inputCost + outputCost;
  }
  
  // Default pricing for other providers (approximations)
  let inputCostPer1K = 0.03;  // GPT-4 default
  let outputCostPer1K = 0.06;
  
  if (provider === 'anthropic') {
    inputCostPer1K = 0.015;
    outputCostPer1K = 0.075;
  } else if (provider === 'google') {
    inputCostPer1K = 0.00025;
    outputCostPer1K = 0.0005;
  }
  
  const inputCost = (inputTokens / 1000) * inputCostPer1K;
  const outputCost = (outputTokens / 1000) * outputCostPer1K;
  
  return inputCost + outputCost;
}

/**
 * Usage record for LLM invocations
 */
export interface UsageRecord {
  provider: string;
  modelName: string;
  agentName?: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Cost summary by provider
 */
export interface ProviderCostSummary {
  provider: string;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  invocationCount: number;
  models?: Record<string, {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    invocationCount: number;
  }>;
}

/**
 * Nova-specific cost breakdown
 */
export interface NovaCostBreakdown {
  micro: {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    invocationCount: number;
  };
  lite: {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    invocationCount: number;
  };
  pro: {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    invocationCount: number;
  };
  total: {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    invocationCount: number;
  };
}

/**
 * Record LLM usage with provider-specific cost calculation
 * 
 * This function records token usage and calculates costs for any LLM provider.
 * It supports Nova models with precise pricing and other providers with approximate pricing.
 * 
 * @param record - Usage record with provider, model, tokens, and optional metadata
 * @returns Usage record with calculated cost
 */
export function recordUsage(record: Omit<UsageRecord, 'totalCost' | 'timestamp'>): UsageRecord {
  const totalCost = calculateCost(
    record.provider,
    record.modelName,
    record.inputTokens,
    record.outputTokens
  );
  
  const usageRecord: UsageRecord = {
    ...record,
    totalCost,
    timestamp: new Date(),
  };
  
  // Add Nova-specific metadata if provider is Nova
  if (record.provider === 'nova') {
    const modelVariant = record.modelName.includes('micro') ? 'micro' :
                        record.modelName.includes('lite') ? 'lite' : 'pro';
    
    usageRecord.metadata = {
      ...record.metadata,
      modelVariant,
      inputCostPer1kTokens: getNovaPricing(record.modelName).inputCostPer1kTokens,
      outputCostPer1kTokens: getNovaPricing(record.modelName).outputCostPer1kTokens,
    };
  }
  
  return usageRecord;
}

/**
 * Get costs grouped by provider
 * 
 * Aggregates usage records by provider and returns cost summaries.
 * 
 * @param usageRecords - Array of usage records
 * @returns Map of provider to cost summary
 */
export function getCostsByProvider(usageRecords: UsageRecord[]): Map<string, ProviderCostSummary> {
  const costsByProvider = new Map<string, ProviderCostSummary>();
  
  for (const record of usageRecords) {
    const existing = costsByProvider.get(record.provider);
    
    if (existing) {
      existing.totalCost += record.totalCost;
      existing.totalInputTokens += record.inputTokens;
      existing.totalOutputTokens += record.outputTokens;
      existing.invocationCount += 1;
      
      // Track per-model stats
      if (existing.models) {
        const modelStats = existing.models[record.modelName];
        if (modelStats) {
          modelStats.cost += record.totalCost;
          modelStats.inputTokens += record.inputTokens;
          modelStats.outputTokens += record.outputTokens;
          modelStats.invocationCount += 1;
        } else {
          existing.models[record.modelName] = {
            cost: record.totalCost,
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            invocationCount: 1,
          };
        }
      }
    } else {
      costsByProvider.set(record.provider, {
        provider: record.provider,
        totalCost: record.totalCost,
        totalInputTokens: record.inputTokens,
        totalOutputTokens: record.outputTokens,
        invocationCount: 1,
        models: {
          [record.modelName]: {
            cost: record.totalCost,
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            invocationCount: 1,
          },
        },
      });
    }
  }
  
  return costsByProvider;
}

/**
 * Get Nova-specific cost breakdown by model variant
 * 
 * Provides detailed cost breakdown for Nova models grouped by variant (Micro, Lite, Pro).
 * 
 * @param usageRecords - Array of usage records (will filter for Nova only)
 * @returns Nova cost breakdown by variant
 */
export function getNovaCostBreakdown(usageRecords: UsageRecord[]): NovaCostBreakdown {
  const breakdown: NovaCostBreakdown = {
    micro: { cost: 0, inputTokens: 0, outputTokens: 0, invocationCount: 0 },
    lite: { cost: 0, inputTokens: 0, outputTokens: 0, invocationCount: 0 },
    pro: { cost: 0, inputTokens: 0, outputTokens: 0, invocationCount: 0 },
    total: { cost: 0, inputTokens: 0, outputTokens: 0, invocationCount: 0 },
  };
  
  const novaRecords = usageRecords.filter(r => r.provider === 'nova');
  
  for (const record of novaRecords) {
    const variant = record.metadata?.modelVariant as string | undefined;
    
    if (variant === 'micro' || variant === 'lite' || variant === 'pro') {
      breakdown[variant].cost += record.totalCost;
      breakdown[variant].inputTokens += record.inputTokens;
      breakdown[variant].outputTokens += record.outputTokens;
      breakdown[variant].invocationCount += 1;
    }
    
    // Update total
    breakdown.total.cost += record.totalCost;
    breakdown.total.inputTokens += record.inputTokens;
    breakdown.total.outputTokens += record.outputTokens;
    breakdown.total.invocationCount += 1;
  }
  
  return breakdown;
}

/**
 * Track actual agent cost
 * 
 * This function would integrate with Opik to track actual costs.
 * For now, it returns the estimated cost.
 * 
 * @param agentName - Agent name
 * @param actualTokens - Actual token usage (if available)
 * @param provider - LLM provider (optional, defaults to GPT-4 pricing)
 * @param modelName - Model name (optional, required for Nova)
 * @returns Actual or estimated cost
 */
export function trackAgentCost(
  agentName: string,
  actualTokens?: { input: number; output: number },
  provider?: string,
  modelName?: string
): number {
  // If actual token usage is provided, calculate precise cost
  if (actualTokens) {
    // If provider is specified, use provider-specific pricing
    if (provider && modelName) {
      return calculateCost(provider, modelName, actualTokens.input, actualTokens.output);
    }
    
    // Otherwise use default GPT-4 pricing
    const inputCostPer1K = 0.03;
    const outputCostPer1K = 0.06;
    
    const inputCost = (actualTokens.input / 1000) * inputCostPer1K;
    const outputCost = (actualTokens.output / 1000) * outputCostPer1K;
    
    return inputCost + outputCost;
  }

  // Otherwise, return estimated cost
  return AGENT_COST_ESTIMATES[agentName] ?? 0.10;
}
