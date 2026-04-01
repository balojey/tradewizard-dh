/**
 * Consensus Engine Node
 *
 * This module implements the consensus calculation stage of the debate protocol.
 * It calculates a weighted consensus probability from debate scores and agent signals,
 * computes confidence bands based on disagreement, and classifies probability regimes.
 *
 * Agent signals are weighted by confidence × leaderboard accuracy (agent_signal_accuracy_pct
 * from v_performance_by_agent), giving historically accurate agents more influence.
 */

import type { GraphStateType } from '../models/state.js';
import type { ConsensusProbability, ProbabilityRegime } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';
import type { SupabaseClientManager } from '../database/supabase-client.js';
import { formatTimestamp } from '../utils/timestamp-formatter.js';

/**
 * Fetch per-agent signal accuracy percentages from the leaderboard view.
 *
 * Queries v_performance_by_agent and returns agentName -> accuracy (0-100).
 * Returns an empty map on any failure so consensus can degrade gracefully.
 */
async function fetchAgentAccuracies(
  supabaseManager: SupabaseClientManager
): Promise<Map<string, number>> {
  try {
    const client = supabaseManager.getClient();
    const { data, error } = await client
      .from('v_performance_by_agent')
      .select('agent_name, agent_signal_accuracy_pct');

    if (error) {
      console.warn('[ConsensusEngine] Could not fetch leaderboard accuracies:', error.message);
      return new Map();
    }

    const map = new Map<string, number>();
    for (const row of data ?? []) {
      if (row.agent_name && row.agent_signal_accuracy_pct != null) {
        map.set(row.agent_name, Number(row.agent_signal_accuracy_pct));
      }
    }
    return map;
  } catch (err) {
    console.warn('[ConsensusEngine] Could not fetch leaderboard accuracies:', err);
    return new Map();
  }
}

/**
 * Format agent signals with human-readable timestamps for consensus context
 * This prepares signal data for potential logging or display purposes
 * 
 * @param signals - Array of agent signals
 * @returns Formatted signal summary with timestamps
 */
function formatSignalsForConsensusContext(
  signals: GraphStateType['agentSignals']
): string {
  if (!signals || signals.length === 0) {
    return 'No agent signals available';
  }
  
  const lines: string[] = [];
  lines.push('Agent Signals for Consensus:');
  
  signals.forEach((signal, index) => {
    const signalTime = formatTimestamp(signal.timestamp);
    lines.push(
      `  ${index + 1}. ${signal.agentName}: ${(signal.fairProbability * 100).toFixed(1)}% ` +
      `(confidence: ${(signal.confidence * 100).toFixed(1)}%, ${signalTime.formatted})`
    );
  });
  
  return lines.join('\n');
}

/**
 * Calculate standard deviation of agent fair probabilities
 *
 * @param probabilities - Array of probability values
 * @returns Standard deviation
 */
function calculateStandardDeviation(probabilities: number[]): number {
  if (probabilities.length === 0) return 0;

  const mean = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
  const variance =
    probabilities.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probabilities.length;

  return Math.sqrt(variance);
}

/**
 * Calculate per-signal weights using confidence × leaderboard accuracy.
 *
 * accuracy_multiplier = agent_signal_accuracy_pct / 50
 * (50% = neutral 1.0x, 100% = 2.0x, 0% = 0.0x)
 * Falls back to 1.0x when no leaderboard data exists for an agent.
 * Returns normalized weights that sum to 1.
 */
function calculateSignalWeights(
  signals: GraphStateType['agentSignals'],
  leaderboardAccuracies: Map<string, number>
): number[] {
  if (!signals || signals.length === 0) return [];

  const raw = signals.map((signal) => {
    const accuracyPct = leaderboardAccuracies.get(signal.agentName);
    const accuracyMultiplier = accuracyPct != null ? accuracyPct / 50 : 1.0;
    return signal.confidence * accuracyMultiplier;
  });

  const total = raw.reduce((sum, w) => sum + w, 0);
  if (total === 0) return raw.map(() => 1 / signals.length);
  return raw.map((w) => w / total);
}

/**
 * Calculate weighted consensus probability from debate scores
 *
 * The consensus probability is calculated by weighting the bull and bear
 * fair probabilities by their respective debate scores.
 *
 * @param bullProbability - Bull thesis fair probability
 * @param bearProbability - Bear thesis fair probability (inverted to YES probability)
 * @param bullScore - Bull thesis debate score
 * @param bearScore - Bear thesis debate score
 * @returns Weighted consensus probability
 */
function calculateWeightedConsensus(
  bullProbability: number,
  bearProbability: number,
  bullScore: number,
  bearScore: number
): number {
  // Handle NaN scores by treating them as 0
  const safeBullScore = Number.isNaN(bullScore) ? 0 : bullScore;
  const safeBearScore = Number.isNaN(bearScore) ? 0 : bearScore;

  // Normalize scores to positive weights (shift from [-1, 1] to [0, 2])
  const bullWeight = safeBullScore + 1;
  const bearWeight = safeBearScore + 1;

  // Bear probability is for NO outcome, so invert it to YES probability
  const bearYesProbability = 1 - bearProbability;

  // Calculate weighted average
  const totalWeight = bullWeight + bearWeight;
  if (totalWeight === 0) {
    // If both weights are zero, use simple average
    return (bullProbability + bearYesProbability) / 2;
  }

  const consensus =
    (bullProbability * bullWeight + bearYesProbability * bearWeight) / totalWeight;

  // Clamp to [0, 1] and handle NaN
  const result = Math.max(0, Math.min(1, consensus));
  return Number.isNaN(result) ? 0.5 : result; // Default to 0.5 if still NaN
}

/**
 * Calculate confidence band based on disagreement
 *
 * The confidence band widens proportionally to agent disagreement.
 * Higher disagreement = wider confidence band.
 *
 * @param consensusProbability - Consensus probability
 * @param disagreementIndex - Disagreement index (0-1)
 * @returns Confidence band [lower, upper]
 */
function calculateConfidenceBand(
  consensusProbability: number,
  disagreementIndex: number
): [number, number] {
  // Base band width is 5%, increases with disagreement
  const baseBandWidth = 0.05;
  const disagreementMultiplier = 1 + disagreementIndex * 3; // Up to 4x wider for max disagreement
  const bandWidth = baseBandWidth * disagreementMultiplier;

  const lower = Math.max(0, consensusProbability - bandWidth);
  const upper = Math.min(1, consensusProbability + bandWidth);

  return [lower, upper];
}

/**
 * Classify probability regime based on disagreement index
 *
 * @param disagreementIndex - Disagreement index (0-1)
 * @returns Probability regime classification
 */
function classifyProbabilityRegime(disagreementIndex: number): ProbabilityRegime {
  if (disagreementIndex < 0.1) {
    return 'high-confidence';
  } else if (disagreementIndex < 0.2) {
    return 'moderate-confidence';
  } else {
    return 'high-uncertainty';
  }
}

/**
 * Detect efficiently priced markets
 *
 * A market is considered efficiently priced if the edge is less than 3%.
 *
 * @param consensusProbability - Consensus probability
 * @param marketProbability - Market-implied probability
 * @returns True if market is efficiently priced
 */
function isEfficientlyPriced(
  consensusProbability: number,
  marketProbability: number
): boolean {
  const edge = Math.abs(consensusProbability - marketProbability);
  return edge < 0.03;
}

/**
 * Create consensus engine node factory
 *
 * @param config - Engine configuration
 * @param supabaseManager - Optional Supabase client for fetching leaderboard accuracies
 * @returns Consensus engine node function
 */
export function createConsensusEngineNode(
  config: EngineConfig,
  supabaseManager?: SupabaseClientManager
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    const startTimeFormatted = formatTimestamp(startTime);
    
    console.log('[ConsensusEngine] Starting with state:', {
      hasDebateRecord: !!state.debateRecord,
      hasBullThesis: !!state.bullThesis,
      hasBearThesis: !!state.bearThesis,
      bullScore: state.debateRecord?.bullScore,
      bearScore: state.debateRecord?.bearScore,
      bullProbability: state.bullThesis?.fairProbability,
      bearProbability: state.bearThesis?.fairProbability,
      startTime: startTimeFormatted.formatted,
    });

    // Check if debate record and agent signals are available
    if (!state.debateRecord) {
      const errorTime = Date.now();
      const errorTimeFormatted = formatTimestamp(errorTime);
      
      return {
        consensusError: {
          type: 'INSUFFICIENT_DATA',
          reason: 'Debate record is required for consensus calculation',
        },
        auditLog: [
          {
            stage: 'consensus_engine',
            timestamp: errorTime,
            data: {
              success: false,
              error: 'Missing debate record',
              duration: errorTime - startTime,
              errorAt: errorTimeFormatted.formatted,
            },
          },
        ],
      };
    }

    if (!state.agentSignals || state.agentSignals.length < config.agents.minAgentsRequired) {
      const errorTime = Date.now();
      const errorTimeFormatted = formatTimestamp(errorTime);
      
      return {
        consensusError: {
          type: 'INSUFFICIENT_DATA',
          reason: `At least ${config.agents.minAgentsRequired} agent signals are required for consensus`,
        },
        auditLog: [
          {
            stage: 'consensus_engine',
            timestamp: errorTime,
            data: {
              success: false,
              error: 'Insufficient agent signals',
              signalCount: state.agentSignals?.length || 0,
              minRequired: config.agents.minAgentsRequired,
              duration: errorTime - startTime,
              errorAt: errorTimeFormatted.formatted,
            },
          },
        ],
      };
    }

    if (!state.bullThesis || !state.bearThesis) {
      const errorTime = Date.now();
      const errorTimeFormatted = formatTimestamp(errorTime);
      
      return {
        consensusError: {
          type: 'INSUFFICIENT_DATA',
          reason: 'Bull and bear theses are required for consensus calculation',
        },
        auditLog: [
          {
            stage: 'consensus_engine',
            timestamp: errorTime,
            data: {
              success: false,
              error: 'Missing theses',
              hasBullThesis: !!state.bullThesis,
              hasBearThesis: !!state.bearThesis,
              duration: errorTime - startTime,
              errorAt: errorTimeFormatted.formatted,
            },
          },
        ],
      };
    }

    try {
      // Fetch leaderboard accuracies (graceful fallback to empty map)
      const leaderboardAccuracies = supabaseManager
        ? await fetchAgentAccuracies(supabaseManager)
        : new Map<string, number>();

      console.log(
        `[ConsensusEngine] Leaderboard accuracies loaded for ${leaderboardAccuracies.size} agents`
      );

      // Log formatted signal context for debugging and audit trail
      const signalContext = formatSignalsForConsensusContext(state.agentSignals);
      console.log('[ConsensusEngine] Signal context:\n', signalContext);

      // Calculate per-signal weights from confidence × leaderboard accuracy
      const signalWeights = calculateSignalWeights(state.agentSignals, leaderboardAccuracies);

      // Calculate weighted consensus probability from debate scores
      const consensusProbability = calculateWeightedConsensus(
        state.bullThesis.fairProbability,
        state.bearThesis.fairProbability,
        state.debateRecord.bullScore,
        state.debateRecord.bearScore
      );

      // Compute standard deviation across agent signals
      const agentProbabilities = state.agentSignals.map((signal) => signal.fairProbability);
      const stdDev = calculateStandardDeviation(agentProbabilities);

      // Disagreement index is the standard deviation (already 0-1 range for probabilities)
      const disagreementIndex = stdDev;

      // Handle consensus failure for high disagreement (> 0.30)
      if (disagreementIndex > 0.3) {
        const errorTime = Date.now();
        const errorTimeFormatted = formatTimestamp(errorTime);
        
        return {
          consensusError: {
            type: 'CONSENSUS_FAILED',
            reason: `Agent disagreement too high: ${(disagreementIndex * 100).toFixed(1)}%`,
          },
          auditLog: [
            {
              stage: 'consensus_engine',
              timestamp: errorTime,
              data: {
                success: false,
                error: 'High disagreement',
                disagreementIndex,
                threshold: 0.3,
                duration: errorTime - startTime,
                errorAt: errorTimeFormatted.formatted,
                signalSummary: signalContext,
              },
            },
          ],
        };
      }

      // Calculate confidence bands based on disagreement
      const confidenceBand = calculateConfidenceBand(consensusProbability, disagreementIndex);

      // Classify probability regime
      const regime = classifyProbabilityRegime(disagreementIndex);

      // Order contributing agents by their weight (highest influence first)
      const contributingSignals = [...state.agentSignals]
        .map((signal, i) => ({ name: signal.agentName, weight: signalWeights[i] ?? 0 }))
        .sort((a, b) => b.weight - a.weight)
        .map((s) => s.name);

      // Create consensus probability object
      const consensus: ConsensusProbability = {
        consensusProbability,
        confidenceBand,
        disagreementIndex,
        regime,
        contributingSignals,
      };

      // Detect efficiently priced markets (edge < 3%)
      const marketProbability = state.mbd?.currentProbability || 0.5;
      const efficientlyPriced = isEfficientlyPriced(consensusProbability, marketProbability);
      const edge = Math.abs(consensusProbability - marketProbability);
      
      const endTime = Date.now();
      const endTimeFormatted = formatTimestamp(endTime);

      return {
        consensus,
        auditLog: [
          {
            stage: 'consensus_engine',
            timestamp: endTime,
            data: {
              success: true,
              consensusProbability,
              marketProbability,
              edge,
              efficientlyPriced,
              disagreementIndex,
              regime,
              confidenceBand,
              contributingAgents: contributingSignals.length,
              leaderboardAgentsLoaded: leaderboardAccuracies.size,
              duration: endTime - startTime,
              completedAt: endTimeFormatted.formatted,
              signalSummary: signalContext,
            },
          },
        ],
      };
    } catch (error) {
      const errorTime = Date.now();
      const errorTimeFormatted = formatTimestamp(errorTime);
      
      return {
        consensusError: {
          type: 'CONSENSUS_FAILED',
          reason:
            error instanceof Error
              ? error.message
              : 'Unknown error during consensus calculation',
        },
        auditLog: [
          {
            stage: 'consensus_engine',
            timestamp: errorTime,
            data: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              duration: errorTime - startTime,
              errorAt: errorTimeFormatted.formatted,
            },
          },
        ],
      };
    }
  };
}

/**
 * Default consensus engine node
 *
 * This is a convenience export that uses the default configuration.
 * For production use, create a node with createConsensusEngineNode(config, supabaseManager).
 */
export const consensusEngineNode = (config: EngineConfig, supabaseManager?: SupabaseClientManager) =>
  createConsensusEngineNode(config, supabaseManager);
