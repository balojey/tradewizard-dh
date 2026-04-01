/**
 * Recommendation Generation Node
 *
 * This module implements the final stage of the debate protocol.
 * It generates actionable trade recommendations from consensus probability,
 * including entry/target zones, expected value calculation, and natural language explanations.
 */

import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';
import type { GraphStateType } from '../models/state.js';
import type { TradeRecommendation, TradeAction, LiquidityRisk } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

/**
 * Type for supported LLM instances
 */
// Removed - now imported from llm-factory

/**
 * Calculate expected value from consensus probability
 *
 * EV = (winProbability * payoff) - (lossProbability * stake)
 * For a $100 investment:
 * - If LONG_YES: EV = (consensusProb * (100/marketProb - 100)) - ((1-consensusProb) * 100)
 * - If LONG_NO: EV = ((1-consensusProb) * (100/(1-marketProb) - 100)) - (consensusProb * 100)
 *
 * @param consensusProbability - Consensus probability estimate
 * @param marketProbability - Market-implied probability
 * @param direction - Trade direction
 * @returns Expected value in dollars per $100 invested
 */
function calculateExpectedValue(
  consensusProbability: number,
  marketProbability: number,
  direction: 'LONG_YES' | 'LONG_NO'
): number {
  if (direction === 'LONG_YES') {
    // Buying YES shares at market price
    const costPerShare = marketProbability;
    if (costPerShare === 0) return 0; // Avoid division by zero
    
    const sharesPerDollar = 1 / costPerShare;
    const payoffIfWin = sharesPerDollar * 1 - 1; // Profit per dollar invested
    const ev = consensusProbability * payoffIfWin - (1 - consensusProbability) * 1;
    
    return ev * 100; // Scale to $100 investment
  } else {
    // Buying NO shares at market price
    const costPerShare = 1 - marketProbability;
    if (costPerShare === 0) return 0; // Avoid division by zero
    
    const sharesPerDollar = 1 / costPerShare;
    const payoffIfWin = sharesPerDollar * 1 - 1; // Profit per dollar invested
    const noProbability = 1 - consensusProbability;
    const ev = noProbability * payoffIfWin - consensusProbability * 1;
    
    return ev * 100; // Scale to $100 investment
  }
}

/**
 * Determine trade direction based on consensus vs market probability
 *
 * @param consensusProbability - Consensus probability estimate
 * @param marketProbability - Market-implied probability
 * @returns Trade direction
 */
function determineTradeDirection(
  consensusProbability: number,
  marketProbability: number
): 'LONG_YES' | 'LONG_NO' {
  return consensusProbability > marketProbability ? 'LONG_YES' : 'LONG_NO';
}

/**
 * Calculate entry zone (market price ± 2%)
 *
 * @param marketProbability - Market-implied probability
 * @param direction - Trade direction
 * @returns Entry zone [min, max]
 */
function calculateEntryZone(
  marketProbability: number,
  direction: 'LONG_YES' | 'LONG_NO'
): [number, number] {
  const price = direction === 'LONG_YES' ? marketProbability : 1 - marketProbability;
  const buffer = 0.02;
  
  const min = Math.max(0, price - buffer);
  const max = Math.min(1, price + buffer);
  
  return [min, max];
}

/**
 * Calculate stop-loss zone (below entry zone for risk management)
 *
 * @param entryZone - Entry zone [min, max]
 * @param liquidityScore - Liquidity score (0-10)
 * @returns Stop-loss price (below entry zone minimum)
 */
function calculateStopLoss(
  entryZone: [number, number],
  liquidityScore: number
): number {
  const entryMin = entryZone[0];
  
  // Base stop-loss: 3% below entry minimum
  let stopLossDistance = 0.03;
  
  // Adjust for liquidity (lower liquidity = tighter stop-loss to limit slippage)
  if (liquidityScore < 4.0) {
    stopLossDistance = 0.025; // 2.5% for low liquidity
  } else if (liquidityScore < 7.0) {
    stopLossDistance = 0.03; // 3% for medium liquidity
  } else {
    stopLossDistance = 0.035; // 3.5% for high liquidity
  }
  
  const stopLoss = entryMin - stopLossDistance;
  
  // Bound to [0.01, entry minimum)
  return Math.max(0.01, Math.min(entryMin - 0.01, stopLoss));
}

/**
 * Calculate target zone (consensus probability ± confidence band)
 *
 * @param confidenceBand - Confidence band [lower, upper]
 * @param direction - Trade direction
 * @returns Target zone [min, max]
 */
function calculateTargetZone(
  confidenceBand: [number, number],
  direction: 'LONG_YES' | 'LONG_NO'
): [number, number] {
  if (direction === 'LONG_YES') {
    return confidenceBand;
  } else {
    // For LONG_NO, invert the probabilities
    return [1 - confidenceBand[1], 1 - confidenceBand[0]];
  }
}

/**
 * Determine liquidity risk level
 *
 * @param liquidityScore - Liquidity score (0-10)
 * @returns Liquidity risk level
 */
function determineLiquidityRisk(liquidityScore: number): LiquidityRisk {
  if (liquidityScore < 5.0) {
    return 'high';
  } else if (liquidityScore < 7.0) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Create LLM instance for explanation generation
 *
 * In single-provider mode: use the configured LLM
 * In multi-provider mode: use default LLM (ChatOpenAI with GPT-4-turbo)
 *
 * @param config - Engine configuration
 * @returns LLM instance for explanation generation
 */
function createExplanationLLM(config: EngineConfig): LLMInstance {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer OpenAI for explanation generation (good at clear explanations)
  return createLLMInstance(config, 'openai', ['anthropic', 'google', 'nova']);
}

/**
 * Generate natural language explanation using LLM
 *
 * @param llm - LLM instance
 * @param state - Graph state
 * @param action - Trade action
 * @param expectedValue - Expected value
 * @param edge - Market edge
 * @returns Trade explanation
 */
async function generateExplanation(
  llm: LLMInstance,
  state: GraphStateType,
  action: TradeAction,
  expectedValue: number,
  edge: number
): Promise<TradeRecommendation['explanation']> {
  const { consensus, bullThesis, bearThesis, mbd, riskPhilosophySignals } = state;

  if (!consensus || !bullThesis || !bearThesis || !mbd) {
    throw new Error('Missing required state for explanation generation');
  }

  // Determine which thesis to use based on action
  const primaryThesis = action === 'LONG_YES' ? bullThesis : bearThesis;
  const secondaryThesis = action === 'LONG_YES' ? bearThesis : bullThesis;

  // Build context for LLM
  const context = {
    market: {
      question: mbd.question,
      currentProbability: mbd.currentProbability,
      liquidityScore: mbd.liquidityScore,
    },
    recommendation: {
      action,
      expectedValue,
      edge,
      consensusProbability: consensus.consensusProbability,
      disagreementIndex: consensus.disagreementIndex,
    },
    primaryThesis: {
      direction: primaryThesis.direction,
      coreArgument: primaryThesis.coreArgument,
      catalysts: primaryThesis.catalysts,
      failureConditions: primaryThesis.failureConditions,
    },
    secondaryThesis: {
      direction: secondaryThesis.direction,
      coreArgument: secondaryThesis.coreArgument,
    },
    riskPhilosophy: riskPhilosophySignals ? {
      aggressive: riskPhilosophySignals.aggressive ? {
        positionSize: riskPhilosophySignals.aggressive.metadata.recommendedPositionSize,
        kellyCriterion: riskPhilosophySignals.aggressive.metadata.kellyCriterion,
        convictionLevel: riskPhilosophySignals.aggressive.metadata.convictionLevel,
        expectedReturn: riskPhilosophySignals.aggressive.metadata.expectedReturn,
        varianceWarning: riskPhilosophySignals.aggressive.metadata.varianceWarning,
      } : undefined,
      conservative: riskPhilosophySignals.conservative ? {
        positionSize: riskPhilosophySignals.conservative.metadata.recommendedPositionSize,
        hedgingStrategy: riskPhilosophySignals.conservative.metadata.hedgingStrategy,
        maxDrawdown: riskPhilosophySignals.conservative.metadata.maxDrawdownTolerance,
        stopLoss: riskPhilosophySignals.conservative.metadata.stopLossLevel,
      } : undefined,
      neutral: riskPhilosophySignals.neutral ? {
        spreadOpportunities: riskPhilosophySignals.neutral.metadata.spreadOpportunities,
        pairedPositions: riskPhilosophySignals.neutral.metadata.pairedPositions,
      } : undefined,
    } : undefined,
  };

  const riskPhilosophyInstructions = riskPhilosophySignals 
    ? `6. Include risk philosophy perspectives in the explanation:
   - If aggressive philosophy is present, mention position sizing and conviction level
   - If conservative philosophy is present, mention hedging strategy and risk management
   - If neutral philosophy is present, mention spread opportunities or paired positions`
    : '';

  const prompt = `You are a trade recommendation explainer for prediction markets.

Generate a clear, concise explanation for this trade recommendation.

Context:
${JSON.stringify(context, null, 2)}

Your explanation should:
1. Provide a 2-3 sentence summary explaining the core thesis
2. List the core thesis argument
3. Include key catalysts from the thesis (if any)
4. Include failure scenarios from the thesis (if any)
5. ${consensus.disagreementIndex > 0.15 ? 'Acknowledge the uncertainty due to agent disagreement' : 'Omit uncertainty note (low disagreement)'}
${riskPhilosophyInstructions}

Respond in JSON format with these fields:
{
  "summary": "2-3 sentence plain language explanation${riskPhilosophySignals ? ' including risk philosophy perspectives' : ''}",
  "coreThesis": "The core argument from the primary thesis",
  "keyCatalysts": ["catalyst1", "catalyst2", ...],
  "failureScenarios": ["scenario1", "scenario2", ...],
  "uncertaintyNote": "Optional note about uncertainty (only if disagreementIndex > 0.15)"${riskPhilosophySignals ? ',\n  "riskPerspectives": "Summary of risk philosophy perspectives on position sizing and risk management"' : ''}
}`;

  const response = await llm.invoke([
    { role: 'system', content: 'You are a helpful assistant that generates trade explanations in JSON format.' },
    { role: 'user', content: prompt },
  ]);

  // Parse LLM response
  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  // Try to extract JSON from the response
  let parsed;
  try {
    // Try direct parse first
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      // Try to find JSON object in the text
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        parsed = JSON.parse(objectMatch[0]);
      } else {
        throw new Error('Could not parse LLM response as JSON');
      }
    }
  }

  return {
    summary: parsed.summary || '',
    coreThesis: parsed.coreThesis || primaryThesis.coreArgument,
    keyCatalysts: parsed.keyCatalysts || primaryThesis.catalysts,
    failureScenarios: parsed.failureScenarios || primaryThesis.failureConditions,
    uncertaintyNote: consensus.disagreementIndex > 0.15 ? parsed.uncertaintyNote : undefined,
    riskPerspectives: parsed.riskPerspectives,
  };
}

/**
 * Create recommendation generation node factory
 *
 * This factory function creates a recommendation generation node with the configured LLM.
 *
 * @param config - Engine configuration
 * @returns Recommendation generation node function
 */
export function createRecommendationGenerationNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  const llm = createExplanationLLM(config);

  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    console.log('[RecommendationGeneration] Starting with state:', {
      hasConsensus: !!state.consensus,
      hasBullThesis: !!state.bullThesis,
      hasBearThesis: !!state.bearThesis,
      hasMbd: !!state.mbd,
      consensusProbability: state.consensus?.consensusProbability,
      marketProbability: state.mbd?.currentProbability,
    });

    // Validate required state
    if (!state.consensus) {
      return {
        recommendation: null,
        auditLog: [
          {
            stage: 'recommendation_generation',
            timestamp: Date.now(),
            data: {
              success: false,
              error: 'No consensus available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    if (!state.bullThesis || !state.bearThesis) {
      return {
        recommendation: null,
        auditLog: [
          {
            stage: 'recommendation_generation',
            timestamp: Date.now(),
            data: {
              success: false,
              error: 'Missing theses',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    if (!state.mbd) {
      return {
        recommendation: null,
        auditLog: [
          {
            stage: 'recommendation_generation',
            timestamp: Date.now(),
            data: {
              success: false,
              error: 'No Market Briefing Document available',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      const { consensus, mbd } = state;
      const consensusProbability = consensus.consensusProbability;
      const marketProbability = mbd.currentProbability;

      // Calculate edge
      const edge = Math.abs(consensusProbability - marketProbability);

      // Check edge threshold (minimum 5%)
      if (edge < config.consensus.minEdgeThreshold) {
        const recommendation: TradeRecommendation = {
          marketId: mbd.marketId,
          action: 'NO_TRADE',
          entryZone: [0, 0],
          targetZone: [0, 0],
          stopLoss: 0,
          expectedValue: 0,
          winProbability: 0,
          liquidityRisk: determineLiquidityRisk(mbd.liquidityScore),
          explanation: {
            summary: `No trade recommended. The edge (${(edge * 100).toFixed(1)}%) is below the minimum threshold of ${(config.consensus.minEdgeThreshold * 100).toFixed(1)}%.`,
            coreThesis: 'Market is efficiently priced with no significant edge.',
            keyCatalysts: [],
            failureScenarios: [],
          },
          metadata: {
            consensusProbability,
            marketProbability,
            edge,
            confidenceBand: consensus.confidenceBand,
          },
        };

        return {
          recommendation,
          auditLog: [
            {
              stage: 'recommendation_generation',
              timestamp: Date.now(),
              data: {
                success: true,
                action: 'NO_TRADE',
                reason: 'Insufficient edge',
                edge,
                threshold: config.consensus.minEdgeThreshold,
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }

      // Determine trade direction
      const direction = determineTradeDirection(consensusProbability, marketProbability);
      console.log('[RecommendationGeneration] Trade direction:', direction, 'consensus:', consensusProbability, 'market:', marketProbability);

      // Calculate expected value
      const expectedValue = calculateExpectedValue(
        consensusProbability,
        marketProbability,
        direction
      );
      console.log('[RecommendationGeneration] Expected value:', expectedValue);

      // Implement negative EV rejection logic
      if (expectedValue < 0) {
        const recommendation: TradeRecommendation = {
          marketId: mbd.marketId,
          action: 'NO_TRADE',
          entryZone: [0, 0],
          targetZone: [0, 0],
          stopLoss: 0,
          expectedValue,
          winProbability: direction === 'LONG_YES' ? consensusProbability : 1 - consensusProbability,
          liquidityRisk: determineLiquidityRisk(mbd.liquidityScore),
          explanation: {
            summary: `No trade recommended. Expected value is negative ($${expectedValue.toFixed(2)} per $100 invested).`,
            coreThesis: 'Trade has negative expected value despite edge.',
            keyCatalysts: [],
            failureScenarios: [],
          },
          metadata: {
            consensusProbability,
            marketProbability,
            edge,
            confidenceBand: consensus.confidenceBand,
          },
        };

        return {
          recommendation,
          auditLog: [
            {
              stage: 'recommendation_generation',
              timestamp: Date.now(),
              data: {
                success: true,
                action: 'NO_TRADE',
                reason: 'Negative expected value',
                expectedValue,
                edge,
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }

      // Calculate entry and target zones
      const entryZone = calculateEntryZone(marketProbability, direction);
      const targetZone = calculateTargetZone(
        consensus.confidenceBand,
        direction
      );
      
      // Calculate stop-loss price
      const stopLoss = calculateStopLoss(entryZone, mbd.liquidityScore);

      // Determine liquidity risk
      const liquidityRisk = determineLiquidityRisk(mbd.liquidityScore);

      // Calculate win probability
      const winProbability = direction === 'LONG_YES' ? consensusProbability : 1 - consensusProbability;

      // Generate natural language explanation
      let explanation;
      try {
        explanation = await generateExplanation(
          llm,
          state,
          direction,
          expectedValue,
          edge
        );
      } catch (explanationError) {
        console.error('[RecommendationGeneration] Failed to generate explanation:', explanationError);
        // Fallback explanation if LLM call fails
        explanation = {
          summary: `${direction === 'LONG_YES' ? 'Buy YES' : 'Buy NO'} shares. Expected value: ${expectedValue.toFixed(2)} per $100 invested.`,
          coreThesis: state.bullThesis?.coreArgument || state.bearThesis?.coreArgument || 'Market analysis indicates trading opportunity.',
          keyCatalysts: state.bullThesis?.catalysts || state.bearThesis?.catalysts || [],
          failureScenarios: state.bullThesis?.failureConditions || state.bearThesis?.failureConditions || [],
          uncertaintyNote: state.consensus?.disagreementIndex && state.consensus.disagreementIndex > 0.15 ? 'High uncertainty due to agent disagreement' : undefined,
        };
      }

      // Create recommendation
      const recommendation: TradeRecommendation = {
        marketId: mbd.marketId,
        action: direction,
        entryZone,
        targetZone,
        stopLoss,
        expectedValue,
        winProbability,
        liquidityRisk,
        explanation,
        metadata: {
          consensusProbability,
          marketProbability,
          edge,
          confidenceBand: consensus.confidenceBand,
        },
      };

      return {
        recommendation,
        auditLog: [
          {
            stage: 'recommendation_generation',
            timestamp: Date.now(),
            data: {
              success: true,
              action: direction,
              expectedValue,
              edge,
              winProbability,
              liquidityRisk,
              entryZone,
              targetZone,
              stopLoss,
              riskPhilosophyIncluded: !!state.riskPhilosophySignals,
              riskPhilosophyAgents: state.riskPhilosophySignals ? Object.keys(state.riskPhilosophySignals).filter(k => state.riskPhilosophySignals![k as keyof typeof state.riskPhilosophySignals]) : [],
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    } catch (error) {
      return {
        recommendation: null,
        auditLog: [
          {
            stage: 'recommendation_generation',
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
 * Default recommendation generation node
 *
 * This is a convenience export that uses the default configuration.
 * For production use, create a node with createRecommendationGenerationNode(config).
 */
export const recommendationGenerationNode = (config: EngineConfig) =>
  createRecommendationGenerationNode(config);
