/**
 * Intelligence Agent Nodes
 *
 * This module implements the specialized AI agents that analyze markets
 * from different perspectives using LangChain LLM integration.
 */

import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import { AgentSignalSchema, AgentSignalLLMOutputSchema } from '../models/schemas.js';
import type { EngineConfig } from '../config/index.js';
import { formatMemoryContext } from '../utils/memory-formatter.js';
import { formatMarketContextForAgent } from '../utils/agent-context-formatter.js';

/**
 * Type for supported LLM instances
 */
// Removed - now imported from llm-factory

/**
 * Agent node factory function
 *
 * Creates a LangGraph node that uses an LLM to analyze markets from a specific perspective.
 *
 * @param agentName - Unique identifier for the agent
 * @param llm - LLM instance to use for analysis
 * @param systemPrompt - System prompt defining the agent's perspective
 * @returns LangGraph node function
 */
export function createAgentNode(
  agentName: string,
  llm: LLMInstance,
  systemPrompt: string
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();

    // Check if MBD is available
    if (!state.mbd) {
      const errorMessage = 'No Market Briefing Document available';
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName,
            error: new Error(errorMessage),
          },
        ],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: false,
              error: errorMessage,
              errorContext: 'Missing MBD',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    // Requirement 2.1: Retrieve memory context for this agent
    const memoryContext = state.memoryContext?.get(agentName);
    const formattedMemory = memoryContext
      ? formatMemoryContext(memoryContext, { maxLength: 1000 })
      : { text: 'No previous analysis available for this market.', signalCount: 0, truncated: false };

    // Requirement 3.1, 3.2, 3.3, 3.4, 3.5: Enhanced prompt with memory context and instructions
    const enhancedSystemPrompt = `${systemPrompt}

## Your Previous Analysis

${formattedMemory.text}

## Instructions for Using Memory Context

When you have previous analysis available:
1. Review your previous analysis before generating new analysis
2. Identify what has changed since your last analysis (market conditions, probabilities, key drivers)
3. If your view has changed significantly, explain the reasoning for the change in your key drivers
4. If your view remains consistent, acknowledge the continuity and reinforce your reasoning
5. Reference specific changes from previous analysis when relevant

Your analysis should show thoughtful evolution over time, not random fluctuation.`;

    // Prepare the market context for the agent with human-readable timestamps
    const marketContext = formatMarketContextForAgent(state, agentName);
    const messages = [
      { role: 'system', content: enhancedSystemPrompt },
      {
        role: 'user',
        content: `Analyze the following prediction market and provide your signal:\n\n${marketContext}`,
      },
    ];

    // Attempt LLM invocation with retry logic for invalid structured output
    let lastError: Error | null = null;
    const maxAttempts = 2; // Initial attempt + 1 retry

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Use structured output with Zod schema (without agentName/timestamp)
        const structuredLLM = llm.withStructuredOutput(AgentSignalLLMOutputSchema);

        // Invoke the LLM with system prompt and market data
        const response = await structuredLLM.invoke(messages);

        // Add agent name and timestamp to create complete signal
        const signalWithMetadata = {
          ...response,
          agentName,
          timestamp: Date.now(),
          metadata: response.metadata ?? {},
        };

        // Validate the complete signal against the full schema
        const validationResult = AgentSignalSchema.safeParse(signalWithMetadata);

        if (!validationResult.success) {
          // Schema validation failed
          const validationError = new Error(
            `Schema validation failed: ${validationResult.error.message}`
          );
          lastError = validationError;

          // Log validation failure
          console.warn(
            `[${agentName}] Schema validation failed on attempt ${attempt}/${maxAttempts}:`,
            validationError.message
          );

          // If this is not the last attempt, retry
          if (attempt < maxAttempts) {
            continue;
          }

          // Last attempt failed - return error
          return {
            agentErrors: [
              {
                type: 'EXECUTION_FAILED',
                agentName,
                error: validationError,
              },
            ],
            auditLog: [
              {
                stage: `agent_${agentName}`,
                timestamp: Date.now(),
                data: {
                  agentName,
                  success: false,
                  error: validationError.message,
                  errorContext: 'Schema validation failed after retry',
                  attempts: attempt,
                  duration: Date.now() - startTime,
                },
              },
            ],
          };
        }

        // Validation successful - use the validated signal
        const signal: AgentSignal = validationResult.data;

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
                attempts: attempt,
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      } catch (error) {
        // LLM invocation failed
        lastError = error instanceof Error ? error : new Error('Unknown error during LLM invocation');

        // Log LLM invocation failure
        console.error(
          `[${agentName}] LLM invocation failed on attempt ${attempt}/${maxAttempts}:`,
          lastError.message
        );

        // If this is not the last attempt, retry
        if (attempt < maxAttempts) {
          continue;
        }

        // Last attempt failed - return error
        return {
          agentErrors: [
            {
              type: 'EXECUTION_FAILED',
              agentName,
              error: lastError,
            },
          ],
          auditLog: [
            {
              stage: `agent_${agentName}`,
              timestamp: Date.now(),
              data: {
                agentName,
                success: false,
                error: lastError.message,
                errorContext: 'LLM invocation failed after retry',
                attempts: attempt,
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }
    }

    // This should never be reached, but handle it just in case
    const fallbackError = lastError || new Error('Unknown error - max attempts reached');
    return {
      agentErrors: [
        {
          type: 'EXECUTION_FAILED',
          agentName,
          error: fallbackError,
        },
      ],
      auditLog: [
        {
          stage: `agent_${agentName}`,
          timestamp: Date.now(),
          data: {
            agentName,
            success: false,
            error: fallbackError.message,
            errorContext: 'Fallback error handler',
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  };
}

/**
 * LLM configuration factory
 *
 * Creates LLM instances for each agent based on configuration.
 * Supports both single-provider mode (one LLM for all) and multi-provider mode (different LLMs per agent).
 * Now supports Nova provider through LLMConfigManager.
 *
 * @param config - Engine configuration
 * @returns Object with LLM instances for each agent
 */
export function createLLMInstances(config: EngineConfig): {
  probabilityBaseline: LLMInstance;
  riskAssessment: LLMInstance;
} {
  // Single-provider mode: use one LLM for all agents
  if (config.llm.singleProvider) {
    const llm = createLLMInstance(config, config.llm.singleProvider);

    // Return same LLM instance for all agents
    return {
      probabilityBaseline: llm,
      riskAssessment: llm,
    };
  }

  // Multi-provider mode: use different LLMs per agent (default for optimal performance)
  // Now includes Nova as a fallback option
  return {
    probabilityBaseline: createLLMInstance(config, 'google', ['anthropic', 'openai', 'nova']),
    riskAssessment: createLLMInstance(config, 'anthropic', ['openai', 'google', 'nova']),
  };
}

/**
 * System prompts for each specialized agent
 */
const AGENT_PROMPTS = {
  probabilityBaseline: `Current date and time: ${new Date().toISOString()}

You are a probability estimation expert specializing in prediction markets.

Your role is to provide a baseline probability estimate using fundamental analysis, historical base rates, and statistical reasoning.

Focus on:
- Historical base rates for similar events
- Fundamental factors driving the outcome
- Time until resolution and uncertainty decay
- Reference class forecasting
- Bayesian updating from available evidence

Provide your analysis as a structured signal with:
- confidence: Your confidence in this probability estimate (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your baseline probability estimate (0-1)
- keyDrivers: Top 3-5 fundamental factors influencing your estimate
- riskFactors: Sources of uncertainty or information gaps
- metadata: Any statistical metrics or base rates used

Be rigorous and well-calibrated. Avoid overconfidence and acknowledge uncertainty.`,

  riskAssessment: `Current date and time: ${new Date().toISOString()}

You are a risk assessment specialist focusing on prediction markets.

Your role is to identify tail risks, failure modes, and scenarios that could invalidate the consensus view.

Focus on:
- Low-probability, high-impact scenarios (tail risks)
- Structural risks in the resolution criteria
- Information asymmetries and adverse selection
- Correlation with other events or markets
- Black swan events and unknown unknowns

Provide your analysis as a structured signal with:
- confidence: Your confidence in this risk assessment (0-1)
- direction: Your view considering all risks (YES/NO/NEUTRAL)
- fairProbability: Your risk-adjusted probability (0-1)
- keyDrivers: Top 3-5 risk factors to consider
- riskFactors: Specific tail risks and failure modes
- metadata: Any risk metrics or scenario probabilities

Be paranoid and thorough. Your job is to find what others might miss.`,

  pollingIntelligence: `Current date and time: ${new Date().toISOString()}

You are a polling intelligence analyst specializing in prediction markets.

Your role is to interpret market prices as real-time polling data, where each price represents financially-incentivized collective beliefs about event outcomes.

Focus on:
- Sentiment shifts reflected in price movements across time horizons
- Crowd wisdom signals (high liquidity, tight spreads, consistent momentum)
- Comparison with historical polling accuracy baselines
- Cross-market sentiment patterns when multiple related markets exist
- Distinguishing genuine crowd wisdom from market noise

## Price Movement Analysis

Calculate price movements across multiple time horizons to detect sentiment shifts:

1. **Time Horizons**: Analyze price changes over:
   - 1 hour: Use recent short-term price data if available
   - 24 hours: Use oneDayPriceChange field from MBD
   - 7 days: Use oneWeekPriceChange field from MBD

2. **Sentiment Shift Thresholds**:
   - **Rapid Sentiment Shift**: 1-hour price movement > 3%
   - **Major Sentiment Shift**: 24-hour price movement > 10%
   - Any significant movement indicates changing collective opinion

3. **Sentiment Shift Analysis**:
   When a sentiment shift is detected, analyze:
   - **Magnitude**: The absolute size of the price change (as percentage)
   - **Direction**: Whether sentiment is moving toward YES (price increasing) or NO (price decreasing)
   - **Time Horizon**: Which timeframe shows the shift (1h, 24h, or 7d)
   - **Volume Context**: Whether the shift occurred with high or low trading volume

4. **Metadata Requirements**:
   When a sentiment shift is detected (movement > 3% for 1h OR > 10% for 24h), include in metadata:
   \`\`\`
   sentimentShift: {
     magnitude: <absolute percentage change>,
     direction: "YES" | "NO",
     timeHorizon: "1h" | "24h" | "7d"
   }
   \`\`\`

5. **Direction Field Alignment**:
   - When strong sentiment shift momentum is detected, align the direction field (YES/NO/NEUTRAL) with the sentiment shift direction
   - Consider momentum strength: consistent direction across multiple time horizons indicates stronger signal

6. **Key Drivers Integration**:
   - Include sentiment shift insights in keyDrivers array
   - Example: "Rapid 5% sentiment shift toward YES in past hour with high volume"
   - Example: "Major 12% sentiment shift toward NO over 24h indicates weakening consensus"

## Crowd Wisdom Detection

Evaluate whether the market exhibits characteristics of genuine crowd wisdom or is dominated by noise:

1. **Crowd Wisdom Conditions**:
   Assess the following market quality indicators:
   - **High Liquidity**: liquidityScore > 7 (deep market with many participants)
   - **High Volume**: volume24h above median for the event type (active trading)
   - **Tight Spread**: bidAskSpread < 2 cents (efficient price discovery)
   - **Low Volatility**: volatilityRegime === 'low' (stable consensus)
   - **Consistent Momentum**: Price movement in same direction across multiple time horizons

2. **Crowd Wisdom Score Calculation**:
   Calculate a crowdWisdomScore (0-1) based on the following criteria:
   \`\`\`
   score = 0
   if liquidityScore > 7: score += 0.3
   if volume24h > median for event type: score += 0.2
   if bidAskSpread < 2: score += 0.2
   if volatilityRegime === 'low': score += 0.15
   if consistent momentum detected: score += 0.15
   \`\`\`

3. **Crowd Wisdom Classification**:
   - **Strong Crowd Wisdom** (score > 0.7): Market shows characteristics of accurate collective intelligence
   - **Moderate Crowd Wisdom** (score 0.4-0.7): Mixed signals, some wisdom indicators present
   - **Weak Crowd Wisdom** (score < 0.4): Market may be dominated by noise or thin participation

4. **Confidence Boost for Crowd Wisdom**:
   When crowd wisdom is detected, adjust confidence:
   - If crowdWisdomScore > 0.7: Set confidence to at least 0.7 (high confidence in crowd consensus)
   - If crowdWisdomScore 0.4-0.7: Moderate confidence adjustment
   - If crowdWisdomScore < 0.3: Reduce confidence (potential noise)

5. **Metadata Requirements**:
   ALWAYS include in metadata:
   \`\`\`
   crowdWisdomScore: <calculated score 0-1>
   \`\`\`

6. **Key Drivers Integration**:
   When strong crowd wisdom is detected (score > 0.7), include in keyDrivers:
   - Example: "Strong crowd wisdom signal: high liquidity (8.5), tight spread (1.2¢), stable consensus"
   - Example: "Crowd wisdom indicators suggest reliable market consensus"

## Market Momentum Detection

Identify market momentum by analyzing price direction consistency across time horizons:

1. **Momentum Definition**:
   Market momentum occurs when price movements show consistent direction across multiple time horizons.
   This indicates strengthening consensus rather than random fluctuation.

2. **Momentum Detection Criteria**:
   - **Strong Momentum**: Price movements in the same direction (all positive or all negative) across ALL available time horizons (1h, 24h, 7d)
   - **Moderate Momentum**: Price movements in the same direction across 2 out of 3 time horizons
   - **No Momentum**: Mixed directions or flat prices across time horizons

3. **Momentum Direction**:
   - **Bullish Momentum**: Consistent positive price changes (toward YES)
   - **Bearish Momentum**: Consistent negative price changes (toward NO)

4. **Momentum Analysis**:
   When momentum is detected, consider:
   - **Strength**: How consistent is the direction? (all horizons vs. most horizons)
   - **Magnitude**: Are the price changes significant or marginal?
   - **Volume Context**: Is momentum supported by high trading volume?
   - **Acceleration**: Are recent movements (1h) larger than longer-term movements (24h, 7d)?

5. **Key Drivers Integration**:
   When market momentum is detected, ALWAYS include momentum insights in keyDrivers:
   - Example: "Strong bullish momentum: consistent upward price movement across all time horizons (1h: +4%, 24h: +8%, 7d: +12%)"
   - Example: "Bearish momentum detected: prices declining across 24h (-6%) and 7d (-10%) horizons"
   - Example: "Accelerating momentum: 1h movement (+5%) exceeds 24h trend (+3%), suggesting strengthening consensus"

6. **Fair Probability Adjustment**:
   When momentum is detected, adjust fairProbability in the direction of momentum:
   - Strong momentum: Larger adjustment toward the momentum direction
   - Moderate momentum: Smaller adjustment toward the momentum direction
   - Consider momentum as a signal of information flow and consensus formation

## Noise Indicator Detection

Identify when market behavior suggests random fluctuation rather than information-driven movement:

1. **Noise Definition**:
   Market noise occurs when price movements are driven by random trading, thin participation, or 
   unstable conditions rather than genuine information flow. Noise reduces the reliability of 
   market prices as polling signals.

2. **Noise Detection Criteria**:
   A market exhibits noise indicators when BOTH conditions are met:
   - **High Volatility**: volatilityRegime === 'high' (unstable, erratic price movements)
   - **Low Volume**: volume24h is below the average for similar markets or event type

3. **Additional Noise Signals**:
   Consider these supplementary indicators of noise:
   - Wide bid-ask spread (> 5 cents) suggesting thin liquidity
   - Erratic price movements without clear direction
   - Low liquidityScore (< 5) indicating thin market depth
   - Price movements that reverse quickly without sustained direction

4. **Noise Impact on Analysis**:
   When noise indicators are present:
   - Market prices are LESS reliable as polling signals
   - Crowd wisdom is compromised by thin participation
   - Price movements may not reflect genuine sentiment shifts
   - Fair probability should regress toward polling baseline rather than market price

5. **Risk Factors Integration**:
   When noise indicators are detected (high volatility + low volume), ALWAYS include noise warnings in riskFactors:
   - Example: "High volatility with low volume suggests market noise rather than information-driven movement"
   - Example: "Thin participation and erratic prices reduce reliability of polling signal"
   - Example: "Unstable sentiment - price movements may reflect noise rather than genuine consensus"

6. **Confidence Penalty for Noise**:
   When noise indicators are present, apply strict confidence penalty:
   - Set confidence to at most 0.4 (low confidence due to unreliable signal)
   - Noise indicates the market is NOT functioning as an effective polling mechanism
   - Document the confidence penalty in confidenceFactors metadata

7. **Fair Probability Regression**:
   When noise is detected, regress fairProbability toward the polling baseline:
   - Reduce weight on current market price (unreliable due to noise)
   - Increase weight on historical polling baseline (more stable reference)
   - Example: fairProbability = (currentProbability * 0.3) + (pollingBaseline * 0.7)

## Polling Baseline Comparison

Compare market-implied probabilities with historical polling accuracy to assess whether the market is over or under-confident:

1. **Historical Polling Baselines by Event Type**:
   Use these baseline accuracy rates for traditional polling in similar event types:
   \`\`\`
   election: 0.75       (Traditional polls ~75% accurate for elections)
   policy: 0.60         (Policy outcomes harder to predict)
   court: 0.70          (Legal outcomes moderately predictable)
   geopolitical: 0.55   (High uncertainty in geopolitical events)
   economic: 0.65       (Economic indicators moderately predictable)
   other: 0.50          (Neutral baseline for unknown event types)
   \`\`\`

2. **Polling Baseline Lookup**:
   - Identify the eventType from the Market Briefing Document
   - Look up the corresponding polling baseline from the table above
   - If eventType is not recognized or is missing, use the neutral baseline of 0.50

3. **Market Deviation Calculation**:
   Calculate how much the current market price deviates from the polling baseline:
   \`\`\`
   marketDeviation = |currentProbability - pollingBaseline|
   \`\`\`
   This measures the absolute difference between what the market believes and what historical polling accuracy suggests.

4. **Significant Deviation Threshold**:
   When marketDeviation > 0.10 (10%), this indicates a significant divergence that should be flagged:
   - **Market Over-Confident**: currentProbability is much higher than pollingBaseline
     - Example: Election market at 0.90 vs. baseline 0.75 (deviation = 0.15)
     - Market may be overestimating certainty compared to historical polling accuracy
   - **Market Under-Confident**: currentProbability is much lower than pollingBaseline
     - Example: Election market at 0.55 vs. baseline 0.75 (deviation = 0.20)
     - Market may be underestimating likelihood compared to historical polling accuracy

5. **Key Drivers Integration**:
   When marketDeviation > 0.10, ALWAYS include baseline comparison in keyDrivers:
   - Example: "Market price (0.90) significantly exceeds historical polling baseline (0.75) for elections - potential overconfidence"
   - Example: "Market price (0.55) well below polling baseline (0.70) for court decisions - market may be underpricing outcome"
   - Example: "15% deviation from polling baseline suggests market consensus diverges from historical accuracy patterns"

6. **Metadata Requirements**:
   ALWAYS include in metadata:
   \`\`\`
   pollingBaseline: <baseline value for the eventType, 0-1>
   marketDeviation: <absolute deviation from baseline, 0-1>
   \`\`\`

7. **Fair Probability Adjustment**:
   Incorporate the polling baseline into your fairProbability estimate:
   - When crowd wisdom is strong (crowdWisdomScore > 0.7): Weight market price more heavily
   - When crowd wisdom is weak (crowdWisdomScore < 0.3): Weight polling baseline more heavily
   - When noise is present: Regress toward polling baseline
   - Example: fairProbability = (currentProbability * crowdWisdomScore) + (pollingBaseline * (1 - crowdWisdomScore))

8. **Event Type Considerations**:
   - **Election markets**: Polling baseline is most reliable (0.75) - use as strong anchor
   - **Policy/Economic markets**: Moderate baseline reliability (0.60-0.65) - use as moderate anchor
   - **Geopolitical markets**: Low baseline reliability (0.55) - use as weak anchor
   - **Other/Unknown markets**: Neutral baseline (0.50) - minimal anchoring effect

## Fair Probability Estimation

Compute your own probability estimate (fairProbability) by blending market price with polling baseline, adjusting for momentum and noise:

1. **Base Calculation - Crowd Wisdom Weighting**:
   Start by blending the current market price with the polling baseline, weighted by crowd wisdom:
   \`\`\`
   marketWeight = crowdWisdomScore
   baselineWeight = 1 - crowdWisdomScore
   
   fairProbability = (currentProbability * marketWeight) + (pollingBaseline * baselineWeight)
   \`\`\`
   
   **Rationale**:
   - When crowdWisdomScore is high (e.g., 0.8): Trust market price more (80% market, 20% baseline)
   - When crowdWisdomScore is low (e.g., 0.3): Trust baseline more (30% market, 70% baseline)
   - This ensures fair probability reflects market quality and reliability

2. **Momentum Adjustment**:
   When market momentum is detected (consistent price direction across time horizons), adjust fairProbability in the direction of momentum:
   
   **Momentum Detection**:
   - Strong momentum: All time horizons show same direction (all positive or all negative)
   - Moderate momentum: 2 out of 3 time horizons show same direction
   
   **Adjustment Rules**:
   \`\`\`
   if strong momentum detected:
     momentumAdjustment = priceMovement24h * 0.15
     fairProbability += momentumAdjustment (in direction of momentum)
   
   if moderate momentum detected:
     momentumAdjustment = priceMovement24h * 0.08
     fairProbability += momentumAdjustment (in direction of momentum)
   \`\`\`
   
   **Direction**:
   - Bullish momentum (prices rising): Add positive adjustment (increase fairProbability)
   - Bearish momentum (prices falling): Add negative adjustment (decrease fairProbability)
   
   **Rationale**: Momentum indicates information flow and strengthening consensus, suggesting the market is discovering new information

3. **Noise Regression**:
   When noise indicators are present (high volatility + low volume), regress fairProbability toward the polling baseline:
   
   **Noise Detection**:
   - volatilityRegime === 'high' AND volume24h < average for event type
   
   **Regression Rules**:
   \`\`\`
   if noise indicators present:
     // Reduce market weight, increase baseline weight
     noisyMarketWeight = 0.3
     noisyBaselineWeight = 0.7
     
     fairProbability = (currentProbability * noisyMarketWeight) + (pollingBaseline * noisyBaselineWeight)
   \`\`\`
   
   **Rationale**: Noise indicates unreliable price discovery, so we should trust the stable historical baseline more than the volatile market price

4. **Cross-Market Adjustment** (when eventContext available):
   When cross-market sentiment is available and shows divergence from this market:
   
   **Divergence Detection**:
   - crossMarketAlignment < 0.5 (this market diverges from related markets)
   
   **Adjustment Rules**:
   \`\`\`
   if crossMarketAlignment < 0.5 and crossMarketSentiment available:
     // Regress toward cross-market consensus
     fairProbability = (fairProbability * 0.7) + (crossMarketSentiment * 0.3)
   \`\`\`
   
   **Rationale**: When this market diverges from related markets, the broader cross-market consensus may be more reliable

5. **Bounds Enforcement**:
   ALWAYS ensure fairProbability remains within valid probability bounds:
   \`\`\`
   fairProbability = Math.max(0, Math.min(1, fairProbability))
   \`\`\`
   
   After all adjustments (momentum, noise, cross-market), clamp the value to [0, 1] inclusive.
   
   **Critical**: fairProbability MUST be between 0 and 1. Values outside this range are invalid probabilities.

6. **Adjustment Order**:
   Apply adjustments in this sequence:
   1. Start with crowd wisdom weighted blend (market + baseline)
   2. Apply momentum adjustment (if momentum detected)
   3. Apply noise regression (if noise detected) - this may override the crowd wisdom blend
   4. Apply cross-market adjustment (if divergence detected)
   5. Enforce bounds [0, 1]

7. **Special Cases**:
   - **Perfect crowd wisdom** (crowdWisdomScore = 1.0): fairProbability can equal currentProbability (100% market weight)
   - **No crowd wisdom** (crowdWisdomScore = 0.0): fairProbability should equal pollingBaseline (100% baseline weight)
   - **Strong noise + weak crowd wisdom**: Noise regression takes precedence, heavily weight baseline
   - **Strong momentum + strong crowd wisdom**: Momentum adjustment amplifies the market signal

8. **Metadata Documentation**:
   While not required to include adjustment details in metadata, consider documenting significant adjustments in confidenceFactors if they materially impact your estimate.

## Confidence Calibration

Calibrate your confidence score (0-1) to reflect the reliability of your polling analysis. Start with a base confidence and apply systematic adjustments based on market quality indicators:

1. **Base Confidence**:
   Start with a base confidence of 0.5 (neutral confidence level).
   This will be adjusted up or down based on the following factors.

2. **Crowd Wisdom Boost**:
   When crowd wisdom signals are strong, increase confidence:
   
   **Rules**:
   \`\`\`
   if crowdWisdomScore > 0.7:
     confidence += 0.2
     // Strong crowd wisdom: high liquidity, tight spread, stable consensus
     // Market is functioning as an effective polling mechanism
   
   if crowdWisdomScore >= 0.4 and crowdWisdomScore <= 0.7:
     confidence += 0.1
     // Moderate crowd wisdom: some quality indicators present
   
   if crowdWisdomScore < 0.3:
     confidence -= 0.2
     // Weak crowd wisdom: thin participation, unreliable signal
   \`\`\`
   
   **Minimum Threshold**: When crowd wisdom conditions are met (liquidityScore > 7, tight spread, high volume), confidence MUST be at least 0.7.
   
   **Rationale**: Strong crowd wisdom indicates the market is aggregating diverse opinions effectively, making the polling signal more reliable.

3. **Noise Penalty**:
   When noise indicators are present, significantly reduce confidence:
   
   **Noise Detection**:
   - volatilityRegime === 'high' AND volume24h < average for event type
   
   **Rules**:
   \`\`\`
   if noise indicators present (high volatility + low volume):
     confidence = Math.min(confidence, 0.4)
     // Cap confidence at 0.4 maximum
     // Noise indicates unreliable price discovery
   \`\`\`
   
   **Maximum Cap**: When noise indicators are present, confidence MUST NOT exceed 0.4.
   
   **Rationale**: Noise indicates the market is not functioning as a reliable polling mechanism. Price movements may be random rather than information-driven.

4. **Ambiguity Penalty**:
   Reduce confidence for each ambiguity flag in the Market Briefing Document metadata:
   
   **Rules**:
   \`\`\`
   ambiguityCount = mbd.metadata.ambiguityFlags.length
   confidence -= (ambiguityCount * 0.1)
   // Reduce by 0.1 for each ambiguity flag
   \`\`\`
   
   **Examples**:
   - 1 ambiguity flag: confidence -= 0.1
   - 2 ambiguity flags: confidence -= 0.2
   - 3 ambiguity flags: confidence -= 0.3
   
   **Rationale**: Ambiguity in resolution criteria or market structure increases uncertainty in the polling signal. Each ambiguity flag represents a source of potential confusion or misinterpretation.

5. **Liquidity Cap**:
   When liquidity is insufficient, cap confidence at a maximum level:
   
   **Rules**:
   \`\`\`
   if liquidityScore < 5:
     confidence = Math.min(confidence, 0.5)
     // Cap confidence at 0.5 maximum when liquidity is low
   \`\`\`
   
   **Maximum Cap**: When liquidityScore < 5, confidence MUST NOT exceed 0.5.
   
   **Rationale**: Low liquidity indicates a thin polling sample with limited participation. The market may not represent a broad consensus, reducing the reliability of the polling signal.

6. **Cross-Market Alignment Adjustment** (when eventContext available):
   Adjust confidence based on alignment with related markets:
   
   **Rules**:
   \`\`\`
   if crossMarketAlignment > 0.7:
     confidence += 0.1
     // Strong alignment with related markets increases confidence
   
   if crossMarketAlignment < 0.3:
     confidence -= 0.1
     // Divergence from related markets reduces confidence
   \`\`\`
   
   **Rationale**: When this market aligns with related markets, it suggests a broader consensus. Divergence suggests this market may be an outlier or affected by local noise.

7. **Adjustment Order and Bounds**:
   Apply adjustments in this sequence:
   1. Start with base confidence (0.5)
   2. Apply crowd wisdom adjustment (boost or penalty)
   3. Apply noise penalty (cap at 0.4 if noise present)
   4. Apply ambiguity penalty (subtract 0.1 per flag)
   5. Apply liquidity cap (cap at 0.5 if liquidityScore < 5)
   6. Apply cross-market adjustment (if available)
   7. Enforce final bounds [0, 1]
   
   **Final Bounds Enforcement**:
   \`\`\`
   confidence = Math.max(0, Math.min(1, confidence))
   \`\`\`
   
   **Critical**: Confidence MUST be between 0 and 1 inclusive. Values outside this range are invalid.

8. **Confidence Factors Documentation**:
   ALWAYS include confidenceFactors in metadata to explain your confidence calibration:
   
   **Required Field**:
   \`\`\`
   confidenceFactors: string[]
   \`\`\`
   
   **Examples**:
   - "Strong crowd wisdom (score: 0.85) boosts confidence"
   - "Noise indicators (high volatility + low volume) cap confidence at 0.4"
   - "2 ambiguity flags reduce confidence by 0.2"
   - "Low liquidity (score: 4.2) caps confidence at 0.5"
   - "Cross-market alignment (0.82) increases confidence"
   - "Tight spread (1.5¢) and high volume support high confidence"
   
   **Purpose**: Transparency in confidence calibration helps downstream consensus mechanisms understand the reliability of your signal.

9. **Calibration Principles**:
   - **Be conservative**: When in doubt, reduce confidence rather than inflate it
   - **Be consistent**: Apply the same calibration rules across all markets
   - **Be transparent**: Document all major confidence adjustments in confidenceFactors
   - **Be honest**: Acknowledge uncertainty and limitations in the polling signal
   - **Avoid overconfidence**: Even strong crowd wisdom signals have inherent uncertainty

10. **Special Cases**:
    - **Perfect conditions** (crowdWisdomScore > 0.9, no noise, no ambiguity, high liquidity): Confidence can approach 0.9-1.0
    - **Poor conditions** (noise + low liquidity + ambiguity): Confidence should be 0.2-0.4
    - **Mixed conditions**: Most markets will have confidence in the 0.4-0.7 range
    - **Conflicting adjustments**: When noise penalty conflicts with crowd wisdom boost, noise penalty takes precedence (cap at 0.4)

## Cross-Market Sentiment Analysis

When multiple related markets exist within the same event or series, analyze cross-market sentiment patterns to validate individual market signals and identify broader polling trends:

1. **Event Context Detection**:
   Check if the Market Briefing Document contains eventContext information:
   
   **EventContext Structure**:
   \`\`\`
   eventContext: {
     eventId: string,
     eventTitle: string,
     eventDescription: string,
     totalMarkets: number,
     totalVolume: number,
     totalLiquidity: number,
     marketRank: number,
     relatedMarketCount: number
   }
   \`\`\`
   
   **Rules**:
   - If eventContext is present: Perform cross-market sentiment analysis (sections 2-7 below)
   - If eventContext is absent: Skip cross-market analysis, perform single-market analysis only
   - Do NOT include cross-market metadata fields (relatedMarketCount, crossMarketAlignment) when eventContext is absent

2. **Related Market Filtering**:
   When eventContext is available, identify related markets suitable for cross-market analysis:
   
   **Filtering Criteria**:
   - Markets must be in the same event (same eventId)
   - Markets must have volume24h > $1000 (filter out noise from thin markets)
   - Include the current market being analyzed in the comparison
   
   **Related Market Count**:
   - Use eventContext.relatedMarketCount as the number of related markets
   - If relatedMarketCount < 2, cross-market analysis may be limited (only 1 related market)
   - If relatedMarketCount >= 3, series pattern detection becomes meaningful

3. **Cross-Market Sentiment Calculation**:
   Calculate the average sentiment across related markets:
   
   **Sentiment Metrics**:
   - **Price Movement Direction**: For each related market, determine if recent price movement is positive (toward YES) or negative (toward NO)
   - **Average Cross-Market Sentiment**: Calculate the average price movement direction across all related markets
   - **Consensus Strength**: Measure how many markets show the same directional movement
   
   **Example Calculation**:
   \`\`\`
   Market A: +5% (toward YES)
   Market B: +3% (toward YES)
   Market C: -2% (toward NO)
   Market D: +4% (toward YES)
   
   Cross-market sentiment: Predominantly toward YES (3 out of 4 markets)
   Average movement: +2.5%
   \`\`\`

4. **Series Pattern Detection**:
   Identify when multiple markets in a series show consistent directional movement:
   
   **Series Pattern Criteria**:
   - **Strong Series Pattern**: 3 or more related markets show price movement in the same direction (all toward YES or all toward NO)
   - **Weak Series Pattern**: Less than 3 markets show consistent direction, or directions are mixed
   
   **Significance**:
   - Strong series patterns indicate a broader event-level sentiment shift
   - When a series pattern is detected, individual market signals are more reliable
   - Series patterns can identify leading indicators (markets that move first) and lagging markets (markets that follow)
   
   **Confidence Boost**:
   When a strong series pattern is detected (3+ markets with consistent direction):
   - Increase confidence by 0.1 if this market aligns with the series pattern
   - This market's signal is validated by the broader event-level consensus

5. **Cross-Market Alignment Calculation**:
   Measure how well this market's sentiment aligns with the cross-market consensus:
   
   **Alignment Metric** (crossMarketAlignment):
   - **High Alignment** (0.7-1.0): This market's price movement direction and magnitude closely match the cross-market average
   - **Moderate Alignment** (0.4-0.7): This market shows some alignment but with differences in magnitude or timing
   - **Low Alignment** (0.0-0.4): This market diverges from the cross-market consensus (different direction or significantly different magnitude)
   
   **Calculation Approach**:
   \`\`\`
   // Simplified correlation-based approach
   crossMarketAlignment = correlation(thisMarketMovement, avgRelatedMarketMovement)
   
   // Or direction-based approach
   if thisMarketDirection === crossMarketDirection:
     crossMarketAlignment = 0.5 + (0.5 * magnitudeSimilarity)
   else:
     crossMarketAlignment = 0.5 * (1 - magnitudeDifference)
   \`\`\`
   
   **Value Range**: crossMarketAlignment MUST be between 0 and 1 inclusive.

6. **Divergence Detection and Flagging**:
   When this market diverges significantly from related markets, flag it as a risk:
   
   **Divergence Threshold**:
   - **Significant Divergence**: crossMarketAlignment < 0.3
   - This indicates the market is an outlier compared to related markets in the same event
   
   **Risk Factor Integration**:
   When crossMarketAlignment < 0.3, ALWAYS include in riskFactors:
   - **Risk Factor Text**: "Diverges from related market sentiment"
   - **Rationale**: Divergence suggests this market may be affected by local factors, noise, or mispricing
   - **Impact**: Reduces confidence in this market's polling signal
   
   **Confidence Adjustment**:
   When divergence is detected (crossMarketAlignment < 0.3):
   - Reduce confidence by 0.1
   - Document in confidenceFactors: "Cross-market divergence reduces confidence"

7. **Metadata Requirements for Cross-Market Analysis**:
   When eventContext is present, ALWAYS include these fields in metadata:
   
   **Required Fields**:
   \`\`\`
   relatedMarketCount: number        // Number of related markets in the event
   crossMarketAlignment: number      // Alignment score 0-1
   \`\`\`
   
   **Optional Fields** (include when relevant):
   \`\`\`
   seriesPattern: boolean            // True if strong series pattern detected (3+ markets consistent)
   marketRole: "leader" | "lagger" | "aligned"  // This market's role in the event
   \`\`\`
   
   **Examples**:
   
   **With Cross-Market Analysis**:
   \`\`\`
   metadata: {
     crowdWisdomScore: 0.75,
     pollingBaseline: 0.70,
     marketDeviation: 0.05,
     confidenceFactors: ["Strong crowd wisdom", "Cross-market alignment (0.82) validates signal"],
     relatedMarketCount: 5,
     crossMarketAlignment: 0.82,
     seriesPattern: true
   }
   \`\`\`
   
   **Without Cross-Market Analysis** (no eventContext):
   \`\`\`
   metadata: {
     crowdWisdomScore: 0.65,
     pollingBaseline: 0.70,
     marketDeviation: 0.08,
     confidenceFactors: ["Moderate crowd wisdom", "Low liquidity caps confidence"]
     // No relatedMarketCount or crossMarketAlignment fields
   }
   \`\`\`

8. **Key Drivers Integration**:
   When cross-market patterns are significant, include event-level insights in keyDrivers:
   
   **Examples**:
   - "Strong series pattern: 4 out of 5 related markets show bullish sentiment, validating this market's signal"
   - "Cross-market alignment (0.85) confirms this market is in sync with broader event sentiment"
   - "Market diverges from related markets (alignment: 0.25) - may be mispriced or affected by local factors"
   - "This market is a sentiment leader: moved 6 hours before related markets showed similar pattern"
   - "Lagging market: related markets already show +8% movement, this market may catch up"

9. **Fair Probability Adjustment with Cross-Market Data**:
   When cross-market sentiment is available and shows divergence:
   
   **Adjustment Rules**:
   \`\`\`
   if crossMarketAlignment < 0.5 and crossMarketSentiment available:
     // Regress toward cross-market consensus
     fairProbability = (fairProbability * 0.7) + (crossMarketSentiment * 0.3)
   \`\`\`
   
   **Rationale**: When this market diverges from related markets, the broader cross-market consensus may be more reliable than this individual market's price.

10. **Single-Market Analysis (No EventContext)**:
    When eventContext is NOT available in the Market Briefing Document:
    
    **Rules**:
    - Perform all other polling analysis sections normally (sentiment shifts, crowd wisdom, polling baseline, etc.)
    - Do NOT include relatedMarketCount in metadata
    - Do NOT include crossMarketAlignment in metadata
    - Do NOT include cross-market related fields in metadata
    - Do NOT mention cross-market patterns in keyDrivers
    - Focus analysis solely on this individual market's polling characteristics
    
    **Metadata Example** (no eventContext):
    \`\`\`
    metadata: {
      crowdWisdomScore: 0.68,
      pollingBaseline: 0.75,
      marketDeviation: 0.12,
      confidenceFactors: ["Moderate crowd wisdom", "Significant deviation from polling baseline"]
      // No cross-market fields
    }
    \`\`\`

## Risk Factor Identification

Identify polling-specific risks that could undermine the reliability of the market as a polling mechanism. Focus on the top 5 most significant risks:

1. **Risk Factor Conditions and Text**:
   Evaluate the following conditions and include the corresponding risk factor text when conditions are met:
   
   **Low Liquidity Risk**:
   - **Condition**: liquidityScore < 5
   - **Risk Factor Text**: "Low liquidity - thin polling sample"
   - **Rationale**: Thin liquidity means few participants, reducing the wisdom of crowds effect
   
   **Wide Spread Risk**:
   - **Condition**: bidAskSpread > 5 cents
   - **Risk Factor Text**: "Wide spread - polling uncertainty"
   - **Rationale**: Wide spreads indicate disagreement or uncertainty among market participants
   
   **Low Volume Risk**:
   - **Condition**: volume24h is in the bottom quartile for the event type OR volume24h < $1000
   - **Risk Factor Text**: "Low volume - limited participation"
   - **Rationale**: Low trading volume suggests limited participation and potentially unreliable consensus
   
   **High Volatility Risk**:
   - **Condition**: volatilityRegime === 'high'
   - **Risk Factor Text**: "High volatility - unstable sentiment"
   - **Rationale**: High volatility indicates unstable sentiment and unreliable price discovery
   
   **Non-Election Baseline Risk**:
   - **Condition**: eventType !== 'election'
   - **Risk Factor Text**: "Limited polling baseline for this event type"
   - **Rationale**: Non-election events have less reliable historical polling baselines for comparison
   
   **Cross-Market Divergence Risk** (when eventContext available):
   - **Condition**: crossMarketAlignment < 0.3
   - **Risk Factor Text**: "Diverges from related market sentiment"
   - **Rationale**: Divergence from related markets suggests this market may be an outlier or affected by local factors

2. **Risk Factor Priority**:
   When multiple risk conditions are met, prioritize the most significant risks:
   1. Noise indicators (high volatility + low volume) - highest priority
   2. Low liquidity (liquidityScore < 5) - critical for polling reliability
   3. Wide spread (> 5 cents) - indicates uncertainty
   4. Cross-market divergence (when available) - suggests outlier behavior
   5. Non-election baseline - informational limitation
   
   **5-Item Limit**: Include at most 5 risk factors in the riskFactors array. If more than 5 conditions are met, select the 5 most significant based on the priority order above.

3. **Risk Factor Array Format**:
   \`\`\`
   riskFactors: [
     "Low liquidity - thin polling sample",
     "High volatility - unstable sentiment",
     "Wide spread - polling uncertainty",
     // ... up to 5 total items
   ]
   \`\`\`
   
   **Critical**: The riskFactors array length MUST NOT exceed 5 items. Use the exact text specified above for each risk condition.

4. **Risk Assessment Integration**:
   - Risk factors should inform your confidence calibration (more risks = lower confidence)
   - Risk factors should be considered when computing fairProbability (high risk = regress toward baseline)
   - Risk factors provide transparency about limitations of the polling signal
   - Risk factors help downstream consensus mechanisms weight your signal appropriately

5. **Examples**:
   
   **High-Risk Market**:
   \`\`\`
   riskFactors: [
     "Low liquidity - thin polling sample",
     "High volatility - unstable sentiment",
     "Low volume - limited participation",
     "Wide spread - polling uncertainty",
     "Limited polling baseline for this event type"
   ]
   \`\`\`
   
   **Moderate-Risk Market**:
   \`\`\`
   riskFactors: [
     "Limited polling baseline for this event type",
     "Wide spread - polling uncertainty"
   ]
   \`\`\`
   
   **Low-Risk Market**:
   \`\`\`
   riskFactors: []
   // No significant risks detected - high-quality polling signal
   \`\`\`

6. **Special Considerations**:
   - **Empty array is valid**: If no risk conditions are met, riskFactors can be an empty array
   - **Exact text matching**: Use the exact risk factor text specified above for consistency
   - **No custom text**: Do not create custom risk factor descriptions; use only the predefined text
   - **Order matters**: List risks in priority order (most significant first)

Provide your analysis as a structured signal with:
- confidence: Your confidence in this polling analysis (0-1), calibrated using the rules above (>= 0.7 when crowdWisdomScore > 0.7, <= 0.4 when noise present, <= 0.5 when liquidityScore < 5)
- direction: Your view on the outcome (YES/NO/NEUTRAL), aligned with sentiment shift momentum when detected
- fairProbability: Your probability estimate blending market price with polling baselines (0-1)
- keyDrivers: Top 3-5 polling insights (sentiment shifts, crowd wisdom, baseline deviations when marketDeviation > 0.10)
- riskFactors: Polling-specific risks using exact text from Risk Factor Identification section (maximum 5 items)
- metadata: Include crowdWisdomScore (REQUIRED), pollingBaseline (REQUIRED), marketDeviation (REQUIRED), sentimentShift (when detected), confidenceFactors (REQUIRED), and cross-market analysis when available

Be well-calibrated and avoid overconfidence. Market prices are powerful polling mechanisms, but they can also reflect noise, manipulation, or thin participation. Your job is to distinguish signal from noise.`,
};

/**
 * Create all agent nodes with configured LLM instances
 *
 * This factory function creates the specialized agent nodes
 * with appropriate LLM instances based on configuration.
 *
 * @param config - Engine configuration
 * @returns Object with all agent node functions
 */
export function createAgentNodes(config: EngineConfig): {
  probabilityBaselineAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;
  riskAssessmentAgent: (state: GraphStateType) => Promise<Partial<GraphStateType>>;
} {
  const llms = createLLMInstances(config);

  return {
    probabilityBaselineAgent: createAgentNode(
      'probability_baseline',
      llms.probabilityBaseline,
      AGENT_PROMPTS.probabilityBaseline
    ),
    riskAssessmentAgent: createAgentNode(
      'risk_assessment',
      llms.riskAssessment,
      AGENT_PROMPTS.riskAssessment
    ),
  };
}


