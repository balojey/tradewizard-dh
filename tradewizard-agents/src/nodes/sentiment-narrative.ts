/**
 * Sentiment & Narrative Agent Nodes
 *
 * This module implements specialized agents that track media sentiment,
 * social discourse, and narrative velocity to understand how narratives
 * are evolving and influencing market psychology.
 */

import { z } from 'zod';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';
import { createLLMInstance } from '../utils/llm-factory.js';

// ============================================================================
// Social Sentiment Agent Signal Schema
// ============================================================================

/**
 * Zod schema for Social Sentiment Agent signal metadata
 */
export const SocialSentimentSignalMetadataSchema = z.object({
  platformSentiment: z.object({
    twitter: z.number(),
    reddit: z.number(),
    overall: z.number(),
  }), // Platform sentiment scores
  viralNarratives: z.array(
    z.object({
      narrative: z.string(),
      viralScore: z.number().min(0).max(1),
      sentiment: z.number().min(-1).max(1),
    })
  ),
  crowdPsychology: z.enum(['fear', 'greed', 'uncertainty', 'neutral']),
  retailPositioning: z.enum(['bullish', 'bearish', 'neutral']),
  mentionVelocity: z.number().min(0),
});

/**
 * Extended Agent Signal schema for Social Sentiment Agent
 */
export const SocialSentimentSignalSchema = z.object({
  agentName: z.string(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: SocialSentimentSignalMetadataSchema,
});

// ============================================================================
// Narrative Velocity Agent Signal Schema
// ============================================================================

/**
 * Zod schema for Narrative Velocity Agent signal metadata
 */
export const NarrativeVelocitySignalMetadataSchema = z.object({
  narratives: z.array(
    z.object({
      narrative: z.string(),
      velocity: z.number().min(0),
      acceleration: z.number(),
      peakPrediction: z.number().min(0),
      dominanceProbability: z.number().min(0).max(1),
    })
  ),
  emergingNarratives: z.array(z.string()),
});

/**
 * Extended Agent Signal schema for Narrative Velocity Agent
 */
export const NarrativeVelocitySignalSchema = z.object({
  agentName: z.string(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  fairProbability: z.number().min(0).max(1),
  keyDrivers: z.array(z.string()).min(1).max(5),
  riskFactors: z.array(z.string()),
  metadata: NarrativeVelocitySignalMetadataSchema,
});

// ============================================================================
// System Prompts
// ============================================================================

const SOCIAL_SENTIMENT_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a social sentiment analyst specializing in online discourse and crowd psychology.

Your role is to measure sentiment, detect viral narratives, and assess crowd positioning.

Given social media data about a market, analyze:
1. Overall sentiment across platforms
2. Viral narratives and meme momentum
3. Crowd psychology indicators (fear, greed, uncertainty)
4. Retail positioning signals

Focus on actionable signals, not noise.

ENHANCED EVENT-BASED ANALYSIS:
When event-based keywords are provided, use them to improve social sentiment analysis:
- Focus on social content matching event-level keywords for more accurate sentiment measurement
- Use viral keywords to identify emerging narratives and meme trends
- Leverage political keywords to assess partisan sentiment and echo chamber effects
- Consider cross-market narratives when analyzing sentiment across multiple related markets

CRITICAL: You MUST aggregate sentiment across ALL platforms into a single overallSentiment score in the platformSentiment metadata field. This is required for Property 14 validation.

Provide your analysis as a structured signal with:
- confidence: Your confidence in this sentiment analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your crowd-adjusted probability (0-1)
- keyDrivers: Top 3-5 social factors influencing your view (prioritize event-keyword matches)
- riskFactors: Uncertainty about crowd behavior or platform bias
- metadata:
  - platformSentiment: Sentiment per platform (-1 to 1) - MUST include 'overall' key with aggregated sentiment
  - viralNarratives: Array of viral narratives with scores and sentiment
  - crowdPsychology: Current crowd psychology (fear/greed/uncertainty/neutral)
  - retailPositioning: Retail positioning (bullish/bearish/neutral)
  - mentionVelocity: Rate of mentions (mentions per hour)

Focus on actionable signals and ensure platformSentiment includes 'overall' aggregated score.`;

const NARRATIVE_VELOCITY_PROMPT = `Current date and time: ${new Date().toISOString()}

You are a narrative velocity analyst specializing in information diffusion.

Your role is to measure narrative spread rates and predict which stories will dominate.

Given media and social data, analyze:
1. Rate of narrative spread (velocity)
2. Acceleration or deceleration of narratives
3. Which narratives will dominate the next news cycle
4. Early detection of emerging narratives

Focus on predictive signals, not just current state.

ENHANCED EVENT-BASED ANALYSIS:
When event-based keywords are provided, use them to improve narrative velocity analysis:
- Track velocity of narratives matching event-level keywords for more accurate predictions
- Use narrative seeds to identify early-stage story development and acceleration patterns
- Leverage political keywords to assess partisan narrative spread and echo chamber amplification
- Consider cross-market narratives when predicting story dominance across multiple related markets
- Focus on emerging themes to detect breakthrough narratives before they peak

Provide your analysis as a structured signal with:
- confidence: Your confidence in this velocity analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your narrative-adjusted probability (0-1)
- keyDrivers: Top 3-5 narrative factors influencing your view (prioritize event-keyword matches)
- riskFactors: Uncertainty about narrative evolution or prediction accuracy
- metadata:
  - narratives: Array of narratives with velocity, acceleration, peak prediction, and dominance probability
  - emergingNarratives: Early-stage narratives to watch

Be predictive and focus on narrative momentum, not just current state.`;

// ============================================================================
// Agent Node Factory Functions
// ============================================================================

/**
 * Create Social Sentiment Agent node
 *
 * This agent monitors social media discourse and crowd psychology.
 */
export function createSocialSentimentAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer OpenAI for social sentiment analysis (good at sentiment and psychology)
  const llm = createLLMInstance(config, 'openai', ['anthropic', 'google', 'nova']);

  // Return the agent node function
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();

    // Check if MBD is available
    if (!state.mbd) {
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName: 'social_sentiment',
            error: new Error('No Market Briefing Document available'),
          },
        ],
        auditLog: [
          {
            stage: 'agent_social_sentiment',
            timestamp: Date.now(),
            data: {
              agentName: 'social_sentiment',
              success: false,
              error: 'No MBD available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      // Fetch social data from external data layer
      const socialData = state.externalData?.social || null;

      // If no social data available, skip this agent
      if (!socialData) {
        console.warn('[SocialSentimentAgent] No social data available, skipping agent');
        return {
          auditLog: [
            {
              stage: 'agent_social_sentiment',
              timestamp: Date.now(),
              data: {
                agentName: 'social_sentiment',
                success: false,
                skipped: true,
                reason: 'No social data available',
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }

      // Extract event-based keywords for enhanced social sentiment analysis
      const eventKeywords = state.marketKeywords;
      const keywordContext = eventKeywords ? {
        keywords: eventKeywords.combined || [],
        eventLevel: eventKeywords.eventLevel || [],
        themes: eventKeywords.themes || [],
      } : null;

      // Use structured output with custom schema
      const structuredLLM = llm.withStructuredOutput(SocialSentimentSignalSchema);

      // Prepare enhanced market context with social data and event-based keywords
      const marketContext = JSON.stringify(state.mbd, null, 2);
      const socialContext = JSON.stringify(socialData, null, 2);
      const keywordContextStr = keywordContext ? 
        `\n\nEvent-Based Keywords for Social Sentiment Analysis:\n${JSON.stringify(keywordContext, null, 2)}` : 
        '';

      // Invoke the LLM with enhanced context
      const response = await structuredLLM.invoke([
        { role: 'system', content: SOCIAL_SENTIMENT_PROMPT },
        {
          role: 'user',
          content: `Analyze social sentiment for the following prediction market:\n\nMarket:\n${marketContext}\n\nSocial Data:\n${socialContext}${keywordContextStr}`,
        },
      ]);

      // CRITICAL: Ensure platformSentiment includes 'overall' aggregated score
      // This satisfies Property 14 (sentiment agent platform aggregation)
      if (typeof response.metadata.platformSentiment.overall !== 'number') {
        // Calculate overall sentiment as average of twitter and reddit
        const { twitter, reddit } = response.metadata.platformSentiment;
        const overallSentiment = (twitter + reddit) / 2;
        response.metadata.platformSentiment.overall = overallSentiment;
      }

      // Create the agent signal
      const signal: AgentSignal = {
        agentName: 'social_sentiment',
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
            stage: 'agent_social_sentiment',
            timestamp: Date.now(),
            data: {
              agentName: 'social_sentiment',
              success: true,
              direction: signal.direction,
              confidence: signal.confidence,
              fairProbability: signal.fairProbability,
              crowdPsychology: response.metadata.crowdPsychology,
              retailPositioning: response.metadata.retailPositioning,
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
            agentName: 'social_sentiment',
            error: error instanceof Error ? error : new Error('Unknown error'),
          },
        ],
        auditLog: [
          {
            stage: 'agent_social_sentiment',
            timestamp: Date.now(),
            data: {
              agentName: 'social_sentiment',
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
 * Create Narrative Velocity Agent node
 *
 * This agent measures narrative spread rates and predicts next cycle dominance.
 */
export function createNarrativeVelocityAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer Anthropic for narrative velocity analysis (good at reasoning and prediction)
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
            agentName: 'narrative_velocity',
            error: new Error('No Market Briefing Document available'),
          },
        ],
        auditLog: [
          {
            stage: 'agent_narrative_velocity',
            timestamp: Date.now(),
            data: {
              agentName: 'narrative_velocity',
              success: false,
              error: 'No MBD available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      // Fetch both news and social data for narrative velocity analysis
      const newsArticles = state.externalData?.news || [];
      const socialData = state.externalData?.social || null;

      // If no data available, skip this agent
      if (newsArticles.length === 0 && !socialData) {
        console.warn('[NarrativeVelocityAgent] No media or social data available, skipping agent');
        return {
          auditLog: [
            {
              stage: 'agent_narrative_velocity',
              timestamp: Date.now(),
              data: {
                agentName: 'narrative_velocity',
                success: false,
                skipped: true,
                reason: 'No media or social data available',
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }

      // Extract event-based keywords for enhanced narrative velocity analysis
      const eventKeywords = state.marketKeywords;
      const keywordContext = eventKeywords ? {
        keywords: eventKeywords.combined || [],
        eventLevel: eventKeywords.eventLevel || [],
        themes: eventKeywords.themes || [],
      } : null;

      // Use structured output with custom schema
      const structuredLLM = llm.withStructuredOutput(NarrativeVelocitySignalSchema);

      // Prepare enhanced market context with media and social data and event-based keywords
      const marketContext = JSON.stringify(state.mbd, null, 2);
      const newsContext = newsArticles.length > 0 ? JSON.stringify(newsArticles, null, 2) : 'No news data available';
      const socialContext = socialData ? JSON.stringify(socialData, null, 2) : 'No social data available';
      const keywordContextStr = keywordContext ? 
        `\n\nEvent-Based Keywords for Narrative Velocity Analysis:\n${JSON.stringify(keywordContext, null, 2)}` : 
        '';

      // Invoke the LLM with enhanced context
      const response = await structuredLLM.invoke([
        { role: 'system', content: NARRATIVE_VELOCITY_PROMPT },
        {
          role: 'user',
          content: `Analyze narrative velocity for the following prediction market:\n\nMarket:\n${marketContext}\n\nNews Articles:\n${newsContext}\n\nSocial Data:\n${socialContext}${keywordContextStr}`,
        },
      ]);

      // Create the agent signal
      const signal: AgentSignal = {
        agentName: 'narrative_velocity',
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
            stage: 'agent_narrative_velocity',
            timestamp: Date.now(),
            data: {
              agentName: 'narrative_velocity',
              success: true,
              direction: signal.direction,
              confidence: signal.confidence,
              fairProbability: signal.fairProbability,
              narrativeCount: response.metadata.narratives.length,
              emergingNarrativeCount: response.metadata.emergingNarratives.length,
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
            agentName: 'narrative_velocity',
            error: error instanceof Error ? error : new Error('Unknown error'),
          },
        ],
        auditLog: [
          {
            stage: 'agent_narrative_velocity',
            timestamp: Date.now(),
            data: {
              agentName: 'narrative_velocity',
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
