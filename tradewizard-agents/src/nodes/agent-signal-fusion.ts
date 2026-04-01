/**
 * Agent Signal Fusion Node
 *
 * This LangGraph node aggregates and weights signals from all active agents,
 * detects conflicts, calculates alignment, and produces a unified fused signal.
 *
 * The fusion process:
 * 1. Groups signals by agent type
 * 2. Applies dynamic weighting based on agent type and market context
 * 3. Detects signal conflicts (divergent probability estimates)
 * 4. Calculates signal alignment (how much agents agree)
 * 5. Computes fusion confidence with alignment bonus and quality penalty
 * 6. Produces a FusedSignal with weighted consensus probability
 */

import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';
import { getPerformanceWeightAdjustment } from '../utils/performance-tracking.js';

/**
 * Agent type classification for weighting
 */
type AgentType =
  | 'mvp'
  | 'event_intelligence'
  | 'polling_statistical'
  | 'sentiment_narrative'
  | 'price_action'
  | 'event_scenario';

/**
 * Classify agent by type based on agent name
 *
 * @param agentName - Name of the agent
 * @returns Agent type classification
 */
function classifyAgentType(agentName: string): AgentType {
  // MVP agents
  if (
    ['market_microstructure', 'probability_baseline', 'risk_assessment'].includes(agentName)
  ) {
    return 'mvp';
  }

  // Event intelligence agents
  if (['breaking_news', 'event_impact'].includes(agentName)) {
    return 'event_intelligence';
  }

  // Polling & statistical agents
  if (['polling_intelligence', 'historical_pattern'].includes(agentName)) {
    return 'polling_statistical';
  }

  // Sentiment & narrative agents
  if (['media_sentiment', 'social_sentiment', 'narrative_velocity'].includes(agentName)) {
    return 'sentiment_narrative';
  }

  // Price action agents
  if (['momentum', 'mean_reversion'].includes(agentName)) {
    return 'price_action';
  }

  // Event scenario agents
  if (['catalyst', 'tail_risk'].includes(agentName)) {
    return 'event_scenario';
  }

  // Default to MVP for unknown agents
  return 'mvp';
}

/**
 * Get base weight for agent type
 *
 * Base weights reflect the general reliability and importance of each agent type:
 * - MVP agents: 1.0x (baseline)
 * - Event intelligence: 1.2x (high value for event-driven markets)
 * - Polling: 1.5x (very reliable for election markets)
 * - Sentiment: 0.8x (noisy but useful)
 * - Price action: 1.0x (reliable for liquid markets)
 * - Event scenario: 1.0x (forward-looking analysis)
 *
 * @param agentType - Agent type classification
 * @param config - Engine configuration
 * @returns Base weight multiplier
 */
function getBaseWeight(agentType: AgentType, config: EngineConfig): number {
  const baseWeights = config.signalFusion.baseWeights;

  // Use configured base weights if available
  if (baseWeights && baseWeights[agentType] !== undefined) {
    return baseWeights[agentType];
  }

  // Default base weights
  switch (agentType) {
    case 'mvp':
      return 1.0;
    case 'event_intelligence':
      return 1.2;
    case 'polling_statistical':
      return 1.5;
    case 'sentiment_narrative':
      return 0.8;
    case 'price_action':
      return 1.0;
    case 'event_scenario':
      return 1.0;
    default:
      return 1.0;
  }
}

/**
 * Apply context adjustments to base weight
 *
 * Context adjustments modify weights based on:
 * - Agent confidence (higher confidence = higher weight)
 * - Data freshness (stale data = lower weight)
 * - Market liquidity (for price action agents)
 * - Historical performance (high accuracy = higher weight)
 *
 * @param signal - Agent signal
 * @param baseWeight - Base weight for agent type
 * @param state - Current graph state
 * @param config - Engine configuration
 * @returns Adjusted weight
 */
function applyContextAdjustments(
  signal: AgentSignal,
  baseWeight: number,
  state: GraphStateType,
  config: EngineConfig
): number {
  if (!config.signalFusion.contextAdjustments) {
    return baseWeight;
  }

  let adjustedWeight = baseWeight;

  // Confidence adjustment: scale by agent confidence
  // High confidence (>0.8) increases weight by up to 20%
  // Low confidence (<0.5) decreases weight by up to 30%
  const confidenceMultiplier = 0.7 + signal.confidence * 0.5;
  adjustedWeight *= confidenceMultiplier;

  // Data freshness adjustment
  if (state.externalData?.dataFreshness) {
    const agentType = classifyAgentType(signal.agentName);
    let dataSource: string | null = null;

    // Map agent type to data source
    if (agentType === 'event_intelligence' || agentType === 'sentiment_narrative') {
      dataSource = 'news';
    } else if (agentType === 'polling_statistical') {
      dataSource = 'polling';
    }

    // Check data freshness
    if (dataSource && state.externalData.dataFreshness[dataSource]) {
      const dataAge = Date.now() - state.externalData.dataFreshness[dataSource];
      const maxAge = 3600000; // 1 hour in milliseconds

      // If data is stale (>1 hour old), reduce weight
      if (dataAge > maxAge) {
        const staleness = Math.min(dataAge / maxAge, 3); // Cap at 3x max age
        const freshnessMultiplier = 1 / (1 + staleness * 0.2); // Up to 40% reduction
        adjustedWeight *= freshnessMultiplier;
      }
    }
  }

  // Liquidity adjustment for price action agents
  if (
    ['momentum', 'mean_reversion'].includes(signal.agentName) &&
    state.mbd
  ) {
    const liquidityScore = state.mbd.liquidityScore;
    // Low liquidity (<5) reduces price action agent weight
    if (liquidityScore < 5) {
      const liquidityMultiplier = 0.5 + liquidityScore * 0.1; // 0.5x to 1.0x
      adjustedWeight *= liquidityMultiplier;
    }
  }

  // Performance-based adjustment: scale by historical accuracy
  // High accuracy agents (>0.7) get up to 1.5x weight
  // Low accuracy agents (<0.4) get down to 0.5x weight
  const performanceMultiplier = getPerformanceWeightAdjustment(
    signal.agentName,
    state.agentPerformance,
    config
  );
  adjustedWeight *= performanceMultiplier;

  return adjustedWeight;
}

/**
 * Calculate dynamic weights for all agent signals
 *
 * Weights are calculated based on:
 * 1. Base weight for agent type
 * 2. Context adjustments (confidence, data freshness, liquidity)
 * 3. Normalization to sum to 1.0
 *
 * Error handling:
 * - Falls back to equal weights if calculation fails
 * - Ensures all weights are non-negative
 * - Ensures weights sum to 1.0
 *
 * @param signals - Array of agent signals
 * @param state - Current graph state
 * @param config - Engine configuration
 * @returns Record mapping agent name to normalized weight
 */
function calculateDynamicWeights(
  signals: AgentSignal[],
  state: GraphStateType,
  config: EngineConfig
): Record<string, number> {
  try {
    const weights: Record<string, number> = {};

    // Calculate raw weights for each agent
    for (const signal of signals) {
      const agentType = classifyAgentType(signal.agentName);
      const baseWeight = getBaseWeight(agentType, config);
      const adjustedWeight = applyContextAdjustments(signal, baseWeight, state, config);
      weights[signal.agentName] = Math.max(0, adjustedWeight); // Ensure non-negative
    }

    // Normalize weights to sum to 1.0
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

    if (totalWeight > 0) {
      for (const agentName in weights) {
        weights[agentName] = weights[agentName] / totalWeight;
      }
    } else {
      // If all weights are zero, use equal weights
      console.warn('[SignalFusion] All weights are zero, falling back to equal weights');
      const equalWeight = 1.0 / signals.length;
      for (const signal of signals) {
        weights[signal.agentName] = equalWeight;
      }
    }

    return weights;
  } catch (error) {
    // If weight calculation fails, fall back to equal weights
    console.error(
      '[SignalFusion] Weight calculation failed, falling back to equal weights:',
      error instanceof Error ? error.message : String(error)
    );

    const equalWeight = 1.0 / signals.length;
    const weights: Record<string, number> = {};
    for (const signal of signals) {
      weights[signal.agentName] = equalWeight;
    }
    return weights;
  }
}

/**
 * Calculate weighted consensus probability
 *
 * @param signals - Array of agent signals
 * @param weights - Weight for each agent
 * @returns Weighted average probability
 */
function calculateWeightedProbability(
  signals: AgentSignal[],
  weights: Record<string, number>
): number {
  let weightedSum = 0;

  for (const signal of signals) {
    const weight = weights[signal.agentName] || 0;
    weightedSum += signal.fairProbability * weight;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, weightedSum));
}

/**
 * Identify conflicting signals
 *
 * Two signals are considered conflicting if their fair probability estimates
 * differ by more than the configured threshold (default: 0.20).
 *
 * @param signals - Array of agent signals
 * @param config - Engine configuration
 * @returns Array of conflicting signal pairs
 */
function identifyConflicts(
  signals: AgentSignal[],
  config: EngineConfig
): Array<{ agent1: string; agent2: string; disagreement: number }> {
  const conflicts: Array<{ agent1: string; agent2: string; disagreement: number }> = [];
  const threshold = config.signalFusion.conflictThreshold;

  // Compare all pairs of signals
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const signal1 = signals[i];
      const signal2 = signals[j];

      const disagreement = Math.abs(signal1.fairProbability - signal2.fairProbability);

      if (disagreement > threshold) {
        conflicts.push({
          agent1: signal1.agentName,
          agent2: signal2.agentName,
          disagreement,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Calculate signal alignment
 *
 * Alignment measures how much agents agree with each other.
 * It's calculated as 1 - (standard deviation of probabilities).
 *
 * High alignment (close to 1.0) means agents mostly agree.
 * Low alignment (close to 0.0) means agents strongly disagree.
 *
 * @param signals - Array of agent signals
 * @returns Alignment score (0-1)
 */
function calculateSignalAlignment(signals: AgentSignal[]): number {
  if (signals.length === 0) return 1.0;
  if (signals.length === 1) return 1.0;

  const probabilities = signals.map((s) => s.fairProbability);

  // Calculate mean
  const mean = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;

  // Calculate standard deviation
  const variance =
    probabilities.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probabilities.length;
  const stdDev = Math.sqrt(variance);

  // Alignment is inverse of standard deviation
  // Standard deviation ranges from 0 (perfect agreement) to ~0.5 (maximum disagreement)
  // We map this to alignment: 1.0 (perfect) to 0.0 (maximum disagreement)
  const alignment = Math.max(0, 1 - stdDev * 2);

  return alignment;
}

/**
 * Assess data quality across all signals
 *
 * Data quality is based on:
 * - Data freshness (from external data sources)
 * - Agent confidence levels
 *
 * @param signals - Array of agent signals
 * @param state - Current graph state
 * @returns Data quality score (0-1)
 */
function assessDataQuality(signals: AgentSignal[], state: GraphStateType): number {
  let qualityScore = 0;
  let factorCount = 0;

  // Factor 1: Average agent confidence
  const avgConfidence =
    signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
  qualityScore += avgConfidence;
  factorCount++;

  // Factor 2: Data freshness
  if (state.externalData?.dataFreshness) {
    const freshness = state.externalData.dataFreshness;
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    let freshnessScore = 0;
    let sourceCount = 0;

    for (const source in freshness) {
      const age = now - freshness[source];
      const sourceFreshness = Math.max(0, 1 - age / maxAge);
      freshnessScore += sourceFreshness;
      sourceCount++;
    }

    if (sourceCount > 0) {
      qualityScore += freshnessScore / sourceCount;
      factorCount++;
    }
  }

  return factorCount > 0 ? qualityScore / factorCount : 0.5;
}

/**
 * Calculate fusion confidence
 *
 * Fusion confidence is calculated as:
 * - Base confidence: weighted average of agent confidences
 * - Alignment bonus: increase confidence if agents agree (up to 20%)
 * - Data quality penalty: decrease confidence if data is stale (up to 30%)
 *
 * @param signals - Array of agent signals
 * @param weights - Weight for each agent
 * @param alignment - Signal alignment score
 * @param dataQuality - Data quality score
 * @param config - Engine configuration
 * @returns Fusion confidence (0-1)
 */
function calculateFusionConfidence(
  signals: AgentSignal[],
  weights: Record<string, number>,
  alignment: number,
  dataQuality: number,
  config: EngineConfig
): number {
  // Base confidence: weighted average of agent confidences
  let baseConfidence = 0;
  for (const signal of signals) {
    const weight = weights[signal.agentName] || 0;
    baseConfidence += signal.confidence * weight;
  }

  // Alignment bonus: up to 20% increase for high alignment
  const alignmentBonus = alignment * config.signalFusion.alignmentBonus;

  // Data quality penalty: up to 30% decrease for low quality
  const qualityPenalty = (1 - dataQuality) * 0.3;

  // Calculate final confidence
  const confidence = baseConfidence + alignmentBonus - qualityPenalty;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Agent Signal Fusion Node
 *
 * Aggregates and weights signals from all active agents to produce a unified fused signal.
 *
 * @param state - Current graph state
 * @param config - Engine configuration
 * @returns Partial state update with fusedSignal and audit log
 */
export async function agentSignalFusionNode(
  state: GraphStateType,
  config: EngineConfig
): Promise<Partial<GraphStateType>> {
  const startTime = Date.now();
  const { agentSignals, activeAgents } = state;

  // Check if we have agent signals
  if (!agentSignals || agentSignals.length === 0) {
    return {
      fusedSignal: null,
      auditLog: [
        {
          stage: 'agent_signal_fusion',
          timestamp: Date.now(),
          data: {
            success: false,
            reason: 'No agent signals available for fusion',
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  }

  try {
    // Step 1: Calculate dynamic weights
    const weights = calculateDynamicWeights(agentSignals, state, config);

    // Step 2: Calculate weighted consensus probability
    const fairProbability = calculateWeightedProbability(agentSignals, weights);

    // Step 3: Identify conflicting signals
    const conflictingSignals = identifyConflicts(agentSignals, config);

    // Step 4: Calculate signal alignment
    const signalAlignment = calculateSignalAlignment(agentSignals);

    // Check for extreme divergence (signals span full probability range)
    const probabilities = agentSignals.map((s) => s.fairProbability);
    const minProb = Math.min(...probabilities);
    const maxProb = Math.max(...probabilities);
    const probabilityRange = maxProb - minProb;
    const extremeDivergence = probabilityRange > 0.7; // Signals span >70% of range

    if (extremeDivergence) {
      console.warn(
        `[SignalFusion] Extreme signal divergence detected: range ${probabilityRange.toFixed(2)} (${minProb.toFixed(2)} to ${maxProb.toFixed(2)})`
      );
    }

    // Step 5: Assess data quality
    const dataQuality = assessDataQuality(agentSignals, state);

    // Step 6: Calculate fusion confidence
    let confidence = calculateFusionConfidence(
      agentSignals,
      weights,
      signalAlignment,
      dataQuality,
      config
    );

    // Reduce confidence significantly if extreme divergence
    if (extremeDivergence) {
      confidence = confidence * 0.5; // 50% penalty for extreme divergence
      console.warn(
        `[SignalFusion] Confidence reduced to ${confidence.toFixed(2)} due to extreme divergence`
      );
    }

    // Count MVP vs advanced agents
    const mvpAgents = ['market_microstructure', 'probability_baseline', 'risk_assessment'];
    const mvpAgentCount = agentSignals.filter((s) => mvpAgents.includes(s.agentName)).length;
    const advancedAgentCount = agentSignals.length - mvpAgentCount;

    // Create fused signal
    const fusedSignal = {
      fairProbability,
      confidence,
      signalAlignment,
      conflictingSignals,
      contributingAgents: activeAgents || agentSignals.map((s) => s.agentName),
      weights,
      metadata: {
        mvpAgentCount,
        advancedAgentCount,
        dataQuality,
        extremeDivergence,
        probabilityRange,
      },
    };

    return {
      fusedSignal,
      auditLog: [
        {
          stage: 'agent_signal_fusion',
          timestamp: Date.now(),
          data: {
            success: true,
            agentCount: agentSignals.length,
            mvpAgentCount,
            advancedAgentCount,
            fairProbability,
            confidence,
            signalAlignment,
            conflictCount: conflictingSignals.length,
            dataQuality,
            extremeDivergence,
            probabilityRange,
            weights,
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  } catch (error) {
    console.error(
      '[SignalFusion] Signal fusion failed:',
      error instanceof Error ? error.message : String(error)
    );
    return {
      fusedSignal: null,
      auditLog: [
        {
          stage: 'agent_signal_fusion',
          timestamp: Date.now(),
          data: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  }
}

/**
 * Create agent signal fusion node with bound configuration
 *
 * This factory function creates a node function that can be added to the LangGraph.
 *
 * @param config - Engine configuration
 * @returns Node function for LangGraph
 */
export function createAgentSignalFusionNode(config: EngineConfig) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    return agentSignalFusionNode(state, config);
  };
}
