/**
 * Thesis Construction Node
 *
 * This module implements the thesis construction stage of the debate protocol.
 * It generates bull and bear theses from agent signals using LLM analysis.
 */

import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';
import type { GraphStateType } from '../models/state.js';
import type { Thesis } from '../models/types.js';
import { ThesisSchema } from '../models/schemas.js';
import type { EngineConfig } from '../config/index.js';
import { formatTimestamp } from '../utils/timestamp-formatter.js';

/**
 * Type for supported LLM instances
 */
// Removed - now imported from llm-factory

/**
 * Calculate weighted fair probability from agent signals
 *
 * @param signals - Array of agent signals
 * @returns Weighted average fair probability
 */
function calculateWeightedFairProbability(
  signals: GraphStateType['agentSignals']
): number {
  if (signals.length === 0) return 0.5;

  // Weight each signal by its confidence
  const totalWeight = signals.reduce((sum, signal) => sum + signal.confidence, 0);
  
  // Handle edge case: all confidences are 0 (would cause 0/0 = NaN)
  if (totalWeight === 0 || !isFinite(totalWeight)) {
    // Fall back to simple average when no confidence weighting is possible
    const validSignals = signals.filter(s => isFinite(s.fairProbability));
    if (validSignals.length === 0) return 0.5;
    
    const sum = validSignals.reduce((acc, signal) => acc + signal.fairProbability, 0);
    return sum / validSignals.length;
  }
  
  const weightedSum = signals.reduce(
    (sum, signal) => sum + signal.fairProbability * signal.confidence,
    0
  );

  const result = weightedSum / totalWeight;
  
  // Ensure result is finite and within valid probability range
  if (!isFinite(result)) return 0.5;
  return Math.max(0, Math.min(1, result));
}

/**
 * Get fair probability from fused signal or fall back to agent signals
 *
 * @param state - Graph state
 * @returns Fair probability and source indicator
 */
function getFairProbability(state: GraphStateType): {
  fairProbability: number;
  source: 'fused' | 'raw';
  confidence?: number;
} {
  // Prefer fused signal if available
  if (state.fusedSignal && isFinite(state.fusedSignal.fairProbability)) {
    return {
      fairProbability: state.fusedSignal.fairProbability,
      source: 'fused',
      confidence: state.fusedSignal.confidence,
    };
  }

  // Fall back to raw agent signals (backward compatibility)
  return {
    fairProbability: calculateWeightedFairProbability(state.agentSignals),
    source: 'raw',
  };
}

/**
 * Create LLM instance for thesis generation
 *
 * In single-provider mode: use the configured LLM
 * In multi-provider mode: use default LLM (ChatOpenAI with GPT-4-turbo)
 *
 * @param config - Engine configuration
 * @returns LLM instance for thesis generation
 */
function createThesisLLM(config: EngineConfig): LLMInstance {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer OpenAI for thesis generation (good at creative reasoning)
  return createLLMInstance(config, 'openai', ['anthropic', 'google', 'nova']);
}

/**
 * System prompt for bull thesis generation
 */
const BULL_THESIS_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a bull thesis constructor for prediction markets.

Your role is to synthesize agent signals into a compelling argument for the YES outcome.

Given the market context and agent signals, construct a bull thesis that:
- Argues why the YES outcome is likely
- Synthesizes the strongest signals supporting YES
- Identifies key catalysts that would drive YES
- Acknowledges failure conditions that would invalidate the thesis
- Provides a fair probability estimate based on the evidence

Be rigorous and evidence-based. Your thesis should be persuasive but grounded in the agent signals.

Respond with a structured thesis including:
- direction: "YES"
- fairProbability: Your probability estimate for YES (0-1)
- marketProbability: The current market probability
- edge: The absolute difference between fair and market probability
- coreArgument: A clear, concise argument for YES (2-3 sentences)
- catalysts: Key events or factors that would drive YES
- failureConditions: Scenarios that would invalidate this thesis
- supportingSignals: Names of agents whose signals support this thesis`;

/**
 * System prompt for bear thesis generation
 */
const BEAR_THESIS_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a bear thesis constructor for prediction markets.

Your role is to synthesize agent signals into a compelling argument for the NO outcome.

Given the market context and agent signals, construct a bear thesis that:
- Argues why the NO outcome is likely
- Synthesizes the strongest signals supporting NO
- Identifies key catalysts that would drive NO
- Acknowledges failure conditions that would invalidate the thesis
- Provides a fair probability estimate based on the evidence

Be rigorous and evidence-based. Your thesis should be persuasive but grounded in the agent signals.

Respond with a structured thesis including:
- direction: "NO"
- fairProbability: Your probability estimate for NO (0-1, which is 1 - P(YES))
- marketProbability: The current market probability
- edge: The absolute difference between fair and market probability
- coreArgument: A clear, concise argument for NO (2-3 sentences)
- catalysts: Key events or factors that would drive NO
- failureConditions: Scenarios that would invalidate this thesis
- supportingSignals: Names of agents whose signals support this thesis`;

/**
 * Create thesis construction node factory
 *
 * This factory function creates a thesis construction node with the configured LLM.
 *
 * @param config - Engine configuration
 * @returns Thesis construction node function
 */
export function createThesisConstructionNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  const llm = createThesisLLM(config);

  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    console.log('[ThesisConstruction] Starting with state:', {
      agentSignalsCount: state.agentSignals.length,
      minRequired: config.agents.minAgentsRequired,
      hasMbd: !!state.mbd,
      hasFusedSignal: !!state.fusedSignal,
      fusedSignalFairProbability: state.fusedSignal?.fairProbability,
    });

    // Check minimum agent threshold
    if (state.agentSignals.length < config.agents.minAgentsRequired) {
      return {
        consensusError: {
          type: 'INSUFFICIENT_DATA',
          reason: `Only ${state.agentSignals.length} agents completed, minimum ${config.agents.minAgentsRequired} required`,
        },
        auditLog: [
          {
            stage: 'thesis_construction',
            timestamp: Date.now(),
            data: {
              success: false,
              error: 'Insufficient agent signals',
              agentCount: state.agentSignals.length,
              minRequired: config.agents.minAgentsRequired,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    // Check if MBD is available
    if (!state.mbd) {
      return {
        consensusError: {
          type: 'INSUFFICIENT_DATA',
          reason: 'No Market Briefing Document available',
        },
        auditLog: [
          {
            stage: 'thesis_construction',
            timestamp: Date.now(),
            data: {
              success: false,
              error: 'No MBD available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      // Get fair probability from fused signal or fall back to raw signals
      const { fairProbability: weightedFairProbability, source, confidence } = getFairProbability(state);
      const marketProbability = state.mbd.currentProbability;
      
      // Validate market probability is finite
      if (!isFinite(marketProbability)) {
        return {
          consensusError: {
            type: 'INSUFFICIENT_DATA',
            reason: 'Market probability is not a valid number (NaN or Infinity)',
          },
          auditLog: [
            {
              stage: 'thesis_construction',
              timestamp: Date.now(),
              data: {
                success: false,
                error: 'Invalid market probability',
                marketProbability,
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }
      
      const edge = Math.abs(weightedFairProbability - marketProbability);
      
      // Validate edge calculation is finite
      if (!isFinite(edge)) {
        return {
          consensusError: {
            type: 'INSUFFICIENT_DATA',
            reason: 'Edge calculation produced invalid result',
          },
          auditLog: [
            {
              stage: 'thesis_construction',
              timestamp: Date.now(),
              data: {
                success: false,
                error: 'Invalid edge calculation',
                weightedFairProbability,
                marketProbability,
                edge,
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }

      // Prepare context for thesis generation with human-readable timestamps
      const expiryFormatted = formatTimestamp(state.mbd.expiryTimestamp);
      
      // Format catalyst timestamps
      const formattedCatalysts = state.mbd.metadata.keyCatalysts?.map(catalyst => ({
        event: catalyst.event,
        timestamp: formatTimestamp(catalyst.timestamp).formatted,
      })) || [];
      
      const context = {
        market: {
          question: state.mbd.question,
          currentProbability: marketProbability,
          resolutionCriteria: state.mbd.resolutionCriteria,
          expiryTimestamp: expiryFormatted.formatted,
          liquidityScore: state.mbd.liquidityScore,
          volatilityRegime: state.mbd.volatilityRegime,
          keyCatalysts: formattedCatalysts,
        },
        // Include fused signal if available, otherwise use raw agent signals
        ...(source === 'fused' && state.fusedSignal
          ? {
              fusedSignal: {
                fairProbability: state.fusedSignal.fairProbability,
                confidence: state.fusedSignal.confidence,
                signalAlignment: state.fusedSignal.signalAlignment,
                contributingAgents: state.fusedSignal.contributingAgents,
                conflictingSignals: state.fusedSignal.conflictingSignals,
              },
            }
          : {
              agentSignals: state.agentSignals.map((signal) => ({
                agentName: signal.agentName,
                direction: signal.direction,
                confidence: signal.confidence,
                fairProbability: signal.fairProbability,
                keyDrivers: signal.keyDrivers,
                riskFactors: signal.riskFactors,
              })),
            }),
        weightedFairProbability,
        edge,
      };

      const contextString = JSON.stringify(context, null, 2);

      // Use structured output for thesis generation
      const structuredLLM = llm.withStructuredOutput(ThesisSchema);

      // Generate bull thesis
      const bullThesisResponse = await structuredLLM.invoke([
        { role: 'system', content: BULL_THESIS_PROMPT },
        {
          role: 'user',
          content: `Generate a bull thesis (YES outcome) based on this market analysis:\n\n${contextString}`,
        },
      ]);

      const bullThesis: Thesis = {
        ...bullThesisResponse,
        direction: 'YES',
        marketProbability,
        edge: Math.abs(bullThesisResponse.fairProbability - marketProbability),
      };
      
      // Validate bull thesis edge is finite
      if (!isFinite(bullThesis.edge)) {
        bullThesis.edge = 0;
      }

      // Generate bear thesis
      const bearThesisResponse = await structuredLLM.invoke([
        { role: 'system', content: BEAR_THESIS_PROMPT },
        {
          role: 'user',
          content: `Generate a bear thesis (NO outcome) based on this market analysis:\n\n${contextString}`,
        },
      ]);

      const bearThesis: Thesis = {
        ...bearThesisResponse,
        direction: 'NO',
        marketProbability,
        edge: Math.abs(bearThesisResponse.fairProbability - marketProbability),
      };
      
      // Validate bear thesis edge is finite
      if (!isFinite(bearThesis.edge)) {
        bearThesis.edge = 0;
      }

      // Detect fairly priced markets (edge < 2%)
      const isFairlyPriced = edge < 0.02;

      return {
        bullThesis,
        bearThesis,
        auditLog: [
          {
            stage: 'thesis_construction',
            timestamp: Date.now(),
            data: {
              success: true,
              signalSource: source,
              fusedSignalUsed: source === 'fused',
              fusedSignalConfidence: confidence,
              weightedFairProbability,
              marketProbability,
              edge,
              isFairlyPriced,
              bullEdge: bullThesis.edge,
              bearEdge: bearThesis.edge,
              agentCount: state.agentSignals.length,
              contributingAgents: source === 'fused' && state.fusedSignal
                ? state.fusedSignal.contributingAgents
                : state.agentSignals.map(s => s.agentName),
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    } catch (error) {
      return {
        consensusError: {
          type: 'CONSENSUS_FAILED',
          reason: error instanceof Error ? error.message : 'Unknown error during thesis construction',
        },
        auditLog: [
          {
            stage: 'thesis_construction',
            timestamp: Date.now(),
            data: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }
  };
}

/**
 * Default thesis construction node
 *
 * This is a convenience export that uses the default configuration.
 * For production use, create a node with createThesisConstructionNode(config).
 */
export const thesisConstructionNode = (config: EngineConfig) =>
  createThesisConstructionNode(config);
