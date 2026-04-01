/**
 * Risk Philosophy Agent Nodes
 *
 * This module implements specialized risk philosophy agents that provide
 * different position sizing and risk management perspectives after consensus
 * probability is established.
 */

import { z } from 'zod';
import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';

/**
 * Type for supported LLM instances
 */
// Removed - now imported from llm-factory

// ============================================================================
// Zod Schemas for Risk Philosophy Signals
// ============================================================================

/**
 * Aggressive Agent Signal Schema
 */
export const AggressiveSignalSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: z.object({
    recommendedPositionSize: z.number().min(0).max(1),
    kellyCriterion: z.number().min(0).max(1),
    convictionLevel: z.enum(['extreme', 'high', 'moderate']),
    expectedReturn: z.number(),
    varianceWarning: z.string(),
  }),
});

/**
 * Conservative Agent Signal Schema
 */
export const ConservativeSignalSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: z.object({
    recommendedPositionSize: z.number().min(0).max(1),
    hedgingStrategy: z.string(),
    maxDrawdownTolerance: z.number().min(0).max(1),
    stopLossLevel: z.number().min(0).max(1),
    capitalPreservationScore: z.number().min(0).max(1),
  }),
});

/**
 * Neutral Agent Signal Schema
 */
export const NeutralSignalSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: z.object({
    spreadOpportunities: z.array(
      z.object({
        setup: z.string(),
        expectedReturn: z.number(),
        riskLevel: z.enum(['low', 'medium']),
      })
    ),
    pairedPositions: z.array(
      z.object({
        long: z.string(),
        short: z.string(),
        netExposure: z.number(),
      })
    ),
    arbitrageSetups: z.array(z.string()),
  }),
});

// ============================================================================
// System Prompts
// ============================================================================

const AGGRESSIVE_AGENT_PROMPT = `Current date and time: ${new Date().toISOString()}

You are an aggressive trader specializing in high-conviction, high-variance strategies.
Your role is to identify maximum EV opportunities and advocate for concentrated positions.

Given a consensus probability and market context, analyze:
1. Maximum position sizing for optimal Kelly criterion
2. High-conviction arguments for concentrated exposure
3. Scenarios where aggressive positioning is justified
4. Expected value maximization strategies

Provide your analysis as a structured signal with:
- confidence: Your confidence in this aggressive approach (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your probability estimate (0-1)
- keyDrivers: Top 3-5 factors supporting aggressive positioning
- riskFactors: Variance risks and potential drawdowns
- metadata:
  - recommendedPositionSize: Percentage of bankroll (0-1)
  - kellyCriterion: Optimal Kelly fraction (0-1)
  - convictionLevel: extreme/high/moderate
  - expectedReturn: Expected value per $100 invested
  - varianceWarning: Warning about variance and drawdown risk

Focus on maximizing long-term returns, accepting high variance.`;

const CONSERVATIVE_AGENT_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a conservative trader specializing in capital preservation and risk management.
Your role is to identify downside risks and advocate for hedged, low-drawdown strategies.

Given a consensus probability and market context, analyze:
1. Downside protection strategies
2. Hedging opportunities
3. Maximum acceptable position size for capital preservation
4. Scenarios that could invalidate the thesis

Provide your analysis as a structured signal with:
- confidence: Your confidence in this conservative approach (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your probability estimate (0-1)
- keyDrivers: Top 3-5 factors supporting conservative positioning
- riskFactors: Downside risks and failure scenarios
- metadata:
  - recommendedPositionSize: Conservative sizing (0-1)
  - hedgingStrategy: Specific hedging recommendation
  - maxDrawdownTolerance: Maximum acceptable drawdown (0-1)
  - stopLossLevel: Stop loss price level (0-1)
  - capitalPreservationScore: How well capital is protected (0-1)

Focus on minimizing drawdowns and preserving capital.`;

const NEUTRAL_AGENT_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a market-neutral trader specializing in arbitrage and spread strategies.
Your role is to identify market-neutral opportunities that profit regardless of outcome.

Given a consensus probability and market context, analyze:
1. Spread trade opportunities
2. Paired position strategies
3. Arbitrage setups
4. Market-neutral structures

Provide your analysis as a structured signal with:
- confidence: Your confidence in this neutral approach (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your probability estimate (0-1)
- keyDrivers: Top 3-5 factors supporting neutral positioning
- riskFactors: Execution risks and correlation risks
- metadata:
  - spreadOpportunities: Array of spread trade setups with expected returns and risk levels
  - pairedPositions: Array of long/short pairs with net exposure
  - arbitrageSetups: Array of arbitrage opportunity descriptions

Focus on low-risk, consistent returns with minimal directional exposure.`;

// ============================================================================
// Agent Node Factory
// ============================================================================

/**
 * Create a risk philosophy agent node
 *
 * @param agentName - Unique identifier for the agent
 * @param llm - LLM instance to use
 * @param systemPrompt - System prompt defining the agent's philosophy
 * @param schema - Zod schema for structured output
 * @returns LangGraph node function
 */
function createRiskPhilosophyAgentNode<T extends z.ZodType>(
  agentName: string,
  llm: LLMInstance,
  systemPrompt: string,
  schema: T
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();

    // Check if consensus is available
    if (!state.consensus) {
      return {
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: false,
              error: 'No consensus probability available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    // Check if MBD is available
    if (!state.mbd) {
      return {
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: false,
              error: 'No Market Briefing Document available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      // Use structured output with Zod schema
      const structuredLLM = llm.withStructuredOutput(schema);

      // Prepare context for the agent
      const context = {
        market: state.mbd,
        consensus: state.consensus,
        agentSignals: state.agentSignals,
        fusedSignal: state.fusedSignal,
      };

      const contextString = JSON.stringify(context, null, 2);

      // Invoke the LLM
      const response = (await structuredLLM.invoke([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyze the following market and consensus probability, then provide your risk philosophy perspective:\n\n${contextString}`,
        },
      ])) as Record<string, any>;

      // Add agent name and timestamp
      const signal = {
        ...response,
        agentName,
        timestamp: Date.now(),
      };

      // Return signal in the appropriate field based on agent type
      const philosophyKey = agentName.replace('risk_philosophy_', '') as 'aggressive' | 'conservative' | 'neutral';
      
      // Create update object with only this agent's philosophy key
      // This ensures concurrent agents don't overwrite each other
      // The custom reducer in GraphState will merge these updates properly
      const riskPhilosophyUpdate: Partial<GraphStateType> = {
        riskPhilosophySignals: {
          [philosophyKey]: signal,
        } as any,
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: true,
              direction: response.direction,
              confidence: response.confidence,
              duration: Date.now() - startTime,
            },
          },
        ],
      };

      return riskPhilosophyUpdate;
    } catch (error) {
      // Handle agent execution failure
      return {
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
// Agent Node Creation Functions
// ============================================================================

/**
 * Create Aggressive Agent node
 */
export function createAggressiveAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer OpenAI for aggressive analysis (fast, good at numerical reasoning)
  const llm = createLLMInstance(config, 'openai', ['anthropic', 'google', 'nova']);

  return createRiskPhilosophyAgentNode(
    'risk_philosophy_aggressive',
    llm,
    AGGRESSIVE_AGENT_PROMPT,
    AggressiveSignalSchema
  );
}

/**
 * Create Conservative Agent node
 */
export function createConservativeAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer Google for conservative analysis (good at structured reasoning)
  const llm = createLLMInstance(config, 'google', ['anthropic', 'openai', 'nova']);

  return createRiskPhilosophyAgentNode(
    'risk_philosophy_conservative',
    llm,
    CONSERVATIVE_AGENT_PROMPT,
    ConservativeSignalSchema
  );
}

/**
 * Create Neutral Agent node
 */
export function createNeutralAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer Google for neutral analysis (good at structured analysis)
  const llm = createLLMInstance(config, 'google', ['anthropic', 'openai', 'nova']);

  return createRiskPhilosophyAgentNode(
    'risk_philosophy_neutral',
    llm,
    NEUTRAL_AGENT_PROMPT,
    NeutralSignalSchema
  );
}

/**
 * Create all risk philosophy agent nodes
 */
export function createRiskPhilosophyAgentNodes(config: EngineConfig): {
  aggressiveAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;
  conservativeAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;
  neutralAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;
} {
  // Check if risk philosophy agents are enabled
  // If advancedAgents is not defined, default to enabled for backward compatibility
  const isEnabled = config.advancedAgents?.riskPhilosophy?.enabled ?? true;
  
  // If disabled, return no-op functions that just pass through state
  if (!isEnabled) {
    const noOpAgent = async (_state: GraphStateType): Promise<Partial<GraphStateType>> => {
      return {}; // Return empty partial state (no changes)
    };
    
    return {
      aggressiveAgent: noOpAgent,
      conservativeAgent: noOpAgent,
      neutralAgent: noOpAgent,
    };
  }
  
  // If enabled, create the actual agent nodes (check individual agent flags)
  return {
    aggressiveAgent: (config.advancedAgents?.riskPhilosophy?.aggressive ?? true)
      ? createAggressiveAgentNode(config)
      : async (_state: GraphStateType) => ({}),
    conservativeAgent: (config.advancedAgents?.riskPhilosophy?.conservative ?? true)
      ? createConservativeAgentNode(config)
      : async (_state: GraphStateType) => ({}),
    neutralAgent: (config.advancedAgents?.riskPhilosophy?.neutral ?? true)
      ? createNeutralAgentNode(config)
      : async (_state: GraphStateType) => ({}),
  };
}
