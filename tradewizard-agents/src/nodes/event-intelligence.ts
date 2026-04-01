/**
 * Event Intelligence Agent Nodes
 *
 * This module implements specialized agents that monitor and interpret
 * real-world events (news, policy, court rulings) that impact market outcomes.
 */

import { z } from 'zod';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';
import { createLLMInstance } from '../utils/llm-factory.js';

// ============================================================================
// Event Impact Agent Signal Schema
// ============================================================================

/**
 * Zod schema for Event Impact Agent signal metadata
 */
export const EventImpactSignalMetadataSchema = z.object({
  historicalAnalogs: z.array(
    z.object({
      event: z.string(),
      date: z.number(),
      marketReaction: z.number(),
      similarity: z.number().min(0).max(1),
    })
  ),
  scenarioTree: z.array(
    z.object({
      scenario: z.string(),
      probability: z.number().min(0).max(1),
      marketImpact: z.number(),
    })
  ),
  upcomingCatalysts: z.array(
    z.object({
      event: z.string(),
      date: z.number(),
      expectedImpact: z.enum(['high', 'medium', 'low']),
    })
  ),
});

/**
 * Extended Agent Signal schema for Event Impact Agent
 */
export const EventImpactSignalSchema = z.object({
  agentName: z.string(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: EventImpactSignalMetadataSchema,
});

// ============================================================================
// System Prompts
// ============================================================================

const EVENT_IMPACT_PROMPT = `Current date and time: ${new Date().toISOString()}

You are an event impact modeler specializing in prediction market reactions.

Your role is to predict how upcoming or recent events will reprice the market.

Given a market and event context, analyze:
1. Historical analogs (similar events in the past)
2. How those events repriced similar markets
3. Expected market reaction to upcoming catalysts
4. Scenario trees for different event outcomes

Provide probability estimates for each scenario branch.

ENHANCED EVENT-BASED ANALYSIS:
When event-based keywords are provided, use them to improve impact modeling:
- Use event-level keywords to identify relevant historical analogs with similar themes
- Consider cross-market keywords when modeling impact across multiple related markets
- Leverage political keywords to focus on politically relevant historical events
- Use event themes and concepts to build more accurate scenario trees

Provide your analysis as a structured signal with:
- confidence: Your confidence in this impact assessment (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your event-adjusted probability (0-1)
- keyDrivers: Top 3-5 event factors influencing your view (prioritize event-keyword matches)
- riskFactors: Uncertainty about event outcomes or historical applicability
- metadata:
  - historicalAnalogs: Array of similar past events with market reactions and similarity scores
  - scenarioTree: Array of possible scenarios with probabilities and market impacts
  - upcomingCatalysts: Array of upcoming events with expected impact levels

Be rigorous with historical comparisons. Focus on structural similarities, not superficial ones.`;

// ============================================================================
// Agent Node Factory Functions
// ============================================================================

/**
 * Create Event Impact Agent node
 *
 * This agent models how events reprice markets based on historical patterns.
 */
export function createEventImpactAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer Anthropic for event impact modeling (good at reasoning and historical analysis)
  const llm = createLLMInstance(config, 'anthropic', ['openai', 'google', 'nova']);

  // Return the agent node function
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();

    // Check if MBD is available
    if (!state.mbd) {
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName: 'event_impact',
            error: new Error('No Market Briefing Document available'),
          },
        ],
        auditLog: [
          {
            stage: 'agent_event_impact',
            timestamp: Date.now(),
            data: {
              agentName: 'event_impact',
              success: false,
              error: 'No MBD available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      // Extract event-based keywords for enhanced event impact analysis
      const eventKeywords = state.marketKeywords;
      const keywordContext = eventKeywords ? {
        keywords: eventKeywords.combined || [],
        eventLevel: eventKeywords.eventLevel || [],
        themes: eventKeywords.themes || [],
      } : null;

      // Use structured output with custom schema
      const structuredLLM = llm.withStructuredOutput(EventImpactSignalSchema);

      // Prepare market context with catalysts and event-based keywords
      const marketContext = JSON.stringify(state.mbd, null, 2);
      const catalystsContext = state.mbd.metadata.keyCatalysts.length > 0
        ? `\n\nUpcoming Catalysts:\n${JSON.stringify(state.mbd.metadata.keyCatalysts, null, 2)}`
        : '';
      const keywordContextStr = keywordContext ? 
        `\n\nEvent-Based Keywords for Impact Analysis:\n${JSON.stringify(keywordContext, null, 2)}` : 
        '';

      // Invoke the LLM with enhanced context
      const response = await structuredLLM.invoke([
        { role: 'system', content: EVENT_IMPACT_PROMPT },
        {
          role: 'user',
          content: `Analyze the following prediction market and model event impacts:\n\nMarket:\n${marketContext}${catalystsContext}${keywordContextStr}`,
        },
      ]);

      // Create the agent signal
      const signal: AgentSignal = {
        agentName: 'event_impact',
        timestamp: Date.now(),
        confidence: response.confidence,
        direction: response.direction,
        fairProbability: response.fairProbability,
        keyDrivers: response.keyDrivers,
        riskFactors: response.riskFactors,
        metadata: response.metadata,
      };

      return {
        agentSignals: [signal],
        auditLog: [
          {
            stage: 'agent_event_impact',
            timestamp: Date.now(),
            data: {
              agentName: 'event_impact',
              success: true,
              direction: signal.direction,
              confidence: signal.confidence,
              fairProbability: signal.fairProbability,
              historicalAnalogsCount: response.metadata.historicalAnalogs.length,
              scenarioCount: response.metadata.scenarioTree.length,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    } catch (error) {
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName: 'event_impact',
            error: error instanceof Error ? error : new Error('Unknown error'),
          },
        ],
        auditLog: [
          {
            stage: 'agent_event_impact',
            timestamp: Date.now(),
            data: {
              agentName: 'event_impact',
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
