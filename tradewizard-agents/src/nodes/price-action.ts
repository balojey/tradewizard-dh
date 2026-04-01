/**
 * Price Action & Timing Agent Nodes
 *
 * This module implements specialized agents that analyze market price movements,
 * momentum patterns, and mean reversion opportunities.
 */

import { createLLMInstance } from '../utils/llm-factory.js';
import { z } from 'zod';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import { AgentSignalSchema } from '../models/schemas.js';
import type { EngineConfig } from '../config/index.js';

// ============================================================================
// Momentum Signal Schema
// ============================================================================

/**
 * Zod schema for Momentum Agent signal metadata
 */
export const MomentumSignalMetadataSchema = z.object({
  momentumScore: z.number().min(-1).max(1),
  breakoutProbability: z.number().min(0).max(1),
  orderFlowImbalance: z.number().min(-1).max(1),
  timingWindow: z.object({
    optimal: z.number(), // Hours until optimal entry
    duration: z.number(), // How long window stays open
  }),
  priceTarget: z.number(), // Short-term price target
});

/**
 * Extended schema for Momentum Agent signal
 */
export const MomentumSignalSchema = AgentSignalSchema.extend({
  metadata: MomentumSignalMetadataSchema,
});

// ============================================================================
// Mean Reversion Signal Schema
// ============================================================================

/**
 * Zod schema for Mean Reversion Agent signal metadata
 */
export const MeanReversionSignalMetadataSchema = z.object({
  overextensionScore: z.number().min(0).max(1),
  reversionProbability: z.number().min(0).max(1),
  reversionTarget: z.number(), // Expected reversion price
  timingEstimate: z.number(), // Hours until reversion
  crowdOverreaction: z.boolean(),
});

/**
 * Extended schema for Mean Reversion Agent signal
 */
export const MeanReversionSignalSchema = AgentSignalSchema.extend({
  metadata: MeanReversionSignalMetadataSchema,
});

// ============================================================================
// System Prompts
// ============================================================================

const MOMENTUM_AGENT_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a momentum trader specializing in price action and order flow.
Your role is to identify breakout patterns and momentum-driven opportunities.

Given market price history and order book data, analyze:
1. Momentum indicators (price velocity, volume acceleration)
2. Breakout patterns and continuation signals
3. Order flow imbalances
4. Short-term timing windows for entry

Focus on actionable short-term setups, not long-term fundamentals.

Provide your analysis as a structured signal with:
- confidence: Your confidence in this momentum analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your momentum-adjusted probability estimate (0-1)
- keyDrivers: Top 3-5 momentum factors influencing your view
- riskFactors: Momentum risks or reversal signals
- metadata: Momentum-specific metrics including:
  - momentumScore: Overall momentum strength (-1 to 1, negative = bearish momentum)
  - breakoutProbability: Likelihood of continued momentum (0-1)
  - orderFlowImbalance: Buy/sell pressure (-1 to 1, negative = selling pressure)
  - timingWindow: { optimal: hours until best entry, duration: window length }
  - priceTarget: Short-term price target based on momentum

Be precise and focus on near-term price action signals.`;

const MEAN_REVERSION_AGENT_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a mean reversion trader specializing in overextension and crowd psychology.
Your role is to identify when markets have moved too far and are due for reversion.

Given market price history and sentiment data, analyze:
1. Overextension indicators (distance from mean, volatility)
2. Crowd overreaction signals
3. Reversion probability and timing
4. Target reversion levels

Focus on high-probability fade opportunities with defined risk.

Provide your analysis as a structured signal with:
- confidence: Your confidence in this reversion analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your reversion-adjusted probability estimate (0-1)
- keyDrivers: Top 3-5 reversion factors influencing your view
- riskFactors: Risks that could prevent reversion
- metadata: Mean reversion-specific metrics including:
  - overextensionScore: How overextended the market is (0-1)
  - reversionProbability: Likelihood of mean reversion (0-1)
  - reversionTarget: Expected reversion price level
  - timingEstimate: Hours until expected reversion
  - crowdOverreaction: Whether this appears to be crowd-driven overextension

Be conservative and focus on clear overextension signals.`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if market has sufficient price history for price action analysis
 */
function hasSufficientPriceHistory(mbd: GraphStateType['mbd']): boolean {
  if (!mbd) return false;
  
  // Require minimum volume threshold (from design: 1000 for default config)
  const minVolumeThreshold = 1000;
  return mbd.volume24h >= minVolumeThreshold;
}

/**
 * Calculate basic momentum indicators from MBD
 */
function calculateMomentumIndicators(mbd: GraphStateType['mbd']): {
  priceVelocity: number;
  volumeAcceleration: number;
  volatilityLevel: number;
} {
  if (!mbd) {
    return { priceVelocity: 0, volumeAcceleration: 0, volatilityLevel: 0 };
  }

  // Simple momentum calculation based on available MBD data
  // In production, this would use historical price data
  const priceVelocity = mbd.currentProbability > 0.5 ? 0.1 : -0.1;
  const volumeAcceleration = mbd.volume24h > 5000 ? 0.2 : 0.05;
  const volatilityLevel = mbd.volatilityRegime === 'high' ? 0.8 : 
                          mbd.volatilityRegime === 'medium' ? 0.5 : 0.2;

  return { priceVelocity, volumeAcceleration, volatilityLevel };
}

/**
 * Calculate mean reversion indicators from MBD
 */
function calculateReversionIndicators(mbd: GraphStateType['mbd']): {
  distanceFromMean: number;
  overextensionLevel: number;
  reversionPotential: number;
} {
  if (!mbd) {
    return { distanceFromMean: 0, overextensionLevel: 0, reversionPotential: 0 };
  }

  // Calculate distance from 50% (mean for binary markets)
  const distanceFromMean = Math.abs(mbd.currentProbability - 0.5);
  
  // Overextension increases with distance and volatility
  const overextensionLevel = distanceFromMean * (mbd.volatilityRegime === 'high' ? 1.5 : 1.0);
  
  // Reversion potential is higher when overextended
  const reversionPotential = Math.min(1.0, overextensionLevel * 1.2);

  return { distanceFromMean, overextensionLevel, reversionPotential };
}

// ============================================================================
// Momentum Agent Node
// ============================================================================

/**
 * Create Momentum Agent node
 *
 * Analyzes price momentum, breakout patterns, and short-term timing opportunities.
 *
 * @param config - Engine configuration
 * @returns LangGraph node function
 */
export function createMomentumAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer OpenAI for momentum analysis (fast and good at pattern recognition)
  const llm = createLLMInstance(config, 'openai', ['anthropic', 'google', 'nova']);
  
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    const agentName = 'momentum';

    // Check if MBD is available
    if (!state.mbd) {
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName,
            error: new Error('No Market Briefing Document available'),
          },
        ],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: false,
              error: 'No MBD available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    // Check if market has sufficient price history
    if (!hasSufficientPriceHistory(state.mbd)) {
      return {
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: true,
              skipped: true,
              reason: 'Insufficient price history',
              volume24h: state.mbd.volume24h,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      // Calculate momentum indicators
      const indicators = calculateMomentumIndicators(state.mbd);

      // Use structured output with Zod schema
      const structuredLLM = llm.withStructuredOutput(MomentumSignalSchema);

      // Prepare the market context with momentum indicators
      const marketContext = JSON.stringify({
        ...state.mbd,
        momentumIndicators: indicators,
      }, null, 2);

      // Invoke the LLM with system prompt and market data
      const response = await structuredLLM.invoke([
        { role: 'system', content: MOMENTUM_AGENT_PROMPT },
        {
          role: 'user',
          content: `Analyze the following prediction market for momentum signals:\n\n${marketContext}`,
        },
      ]);

      // Add agent name and timestamp to the signal
      const signal: AgentSignal = {
        ...response,
        agentName,
        timestamp: Date.now(),
      };

      // Return successful signal
      return {
        agentSignals: [signal],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: true,
              direction: signal.direction,
              confidence: signal.confidence,
              fairProbability: signal.fairProbability,
              momentumScore: (signal.metadata as any).momentumScore,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    } catch (error) {
      // Handle agent execution failure
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName,
            error: error instanceof Error ? error : new Error('Unknown error'),
          },
        ],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
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

// ============================================================================
// Mean Reversion Agent Node
// ============================================================================

/**
 * Create Mean Reversion Agent node
 *
 * Analyzes price overextensions and identifies mean reversion opportunities.
 *
 * @param config - Engine configuration
 * @returns LangGraph node function
 */
export function createMeanReversionAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer OpenAI for mean reversion analysis (fast and good at statistical patterns)
  const llm = createLLMInstance(config, 'openai', ['anthropic', 'google', 'nova']);
  
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    const agentName = 'mean_reversion';

    // Check if MBD is available
    if (!state.mbd) {
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName,
            error: new Error('No Market Briefing Document available'),
          },
        ],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: false,
              error: 'No MBD available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    // Check if market has sufficient price history
    if (!hasSufficientPriceHistory(state.mbd)) {
      return {
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: true,
              skipped: true,
              reason: 'Insufficient price history',
              volume24h: state.mbd.volume24h,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      // Calculate reversion indicators
      const indicators = calculateReversionIndicators(state.mbd);

      // Use structured output with Zod schema
      const structuredLLM = llm.withStructuredOutput(MeanReversionSignalSchema);

      // Prepare the market context with reversion indicators
      const marketContext = JSON.stringify({
        ...state.mbd,
        reversionIndicators: indicators,
      }, null, 2);

      // Invoke the LLM with system prompt and market data
      const response = await structuredLLM.invoke([
        { role: 'system', content: MEAN_REVERSION_AGENT_PROMPT },
        {
          role: 'user',
          content: `Analyze the following prediction market for mean reversion opportunities:\n\n${marketContext}`,
        },
      ]);

      // Add agent name and timestamp to the signal
      const signal: AgentSignal = {
        ...response,
        agentName,
        timestamp: Date.now(),
      };

      // Return successful signal
      return {
        agentSignals: [signal],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: true,
              direction: signal.direction,
              confidence: signal.confidence,
              fairProbability: signal.fairProbability,
              overextensionScore: (signal.metadata as any).overextensionScore,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    } catch (error) {
      // Handle agent execution failure
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName,
            error: error instanceof Error ? error : new Error('Unknown error'),
          },
        ],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
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
