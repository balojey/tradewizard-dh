/**
 * Cross-Examination Node
 *
 * This module implements the cross-examination stage of the debate protocol.
 * It challenges thesis assumptions through structured tests using LLM analysis.
 */

import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';
import type { GraphStateType } from '../models/state.js';
import type { DebateRecord, DebateTest, Thesis } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';
import { formatTimestamp } from '../utils/timestamp-formatter.js';

/**
 * Type for supported LLM instances
 */
// Removed - now imported from llm-factory

/**
 * Create LLM instance for cross-examination
 *
 * In single-provider mode: use the configured LLM
 * In multi-provider mode: use default LLM (ChatOpenAI with GPT-4-turbo)
 *
 * @param config - Engine configuration
 * @returns LLM instance for cross-examination
 */
function createCrossExaminationLLM(config: EngineConfig): LLMInstance {
  // Use configured LLM respecting single/multi provider mode
  // In multi-provider mode, prefer OpenAI for cross-examination (good at adversarial reasoning)
  return createLLMInstance(config, 'openai', ['anthropic', 'google', 'nova']);
}

/**
 * System prompt for evidence testing
 */
const EVIDENCE_TEST_PROMPT = `Current date and time: ${formatTimestamp(Date.now()).formatted}

You are a fact-checker for prediction market theses.

Your role is to verify factual claims made in a thesis against available data.

Given a thesis and its claims, evaluate:
- Are the factual claims verifiable?
- Is the evidence cited accurate and relevant?
- Are there contradictory facts that weaken the claim?

For each claim, determine if it:
- SURVIVED: The claim is well-supported by evidence
- WEAKENED: The claim has some support but also contradictory evidence
- REFUTED: The claim is contradicted by available evidence

Respond with a structured test result including:
- testType: "evidence"
- claim: The specific claim being tested
- challenge: Your analysis of the evidence
- outcome: "survived", "weakened", or "refuted"
- score: A number from -1 (refuted) to 1 (survived), with 0 being neutral`;

/**
 * System prompt for causality testing
 */
const CAUSALITY_TEST_PROMPT = `Current date and time: ${formatTimestamp(Date.now()).formatted}

You are a causality analyst for prediction market theses.

Your role is to test whether claimed correlations actually imply causation.

Given a thesis and its causal claims, evaluate:
- Does the thesis confuse correlation with causation?
- Are there alternative explanations for the observed correlation?
- Is the causal mechanism plausible and well-explained?

For each causal claim, determine if it:
- SURVIVED: The causal claim is well-reasoned with a clear mechanism
- WEAKENED: The causal claim is plausible but has alternative explanations
- REFUTED: The claim confuses correlation with causation

Respond with a structured test result including:
- testType: "causality"
- claim: The specific causal claim being tested
- challenge: Your analysis of the causality
- outcome: "survived", "weakened", or "refuted"
- score: A number from -1 (refuted) to 1 (survived), with 0 being neutral`;

/**
 * System prompt for timing testing
 */
const TIMING_TEST_PROMPT = `Current date and time: ${formatTimestamp(Date.now()).formatted}

You are a timeline analyst for prediction market theses.

Your role is to validate catalyst timelines and event sequences.

Given a thesis and its catalysts, evaluate:
- Are the catalyst timelines realistic?
- Is there enough time for the catalysts to have their claimed effect?
- Are the event sequences logically ordered?

For each timing claim, determine if it:
- SURVIVED: The timeline is realistic and well-reasoned
- WEAKENED: The timeline is plausible but tight or uncertain
- REFUTED: The timeline is unrealistic or contradictory

Respond with a structured test result including:
- testType: "timing"
- claim: The specific timing claim being tested
- challenge: Your analysis of the timeline
- outcome: "survived", "weakened", or "refuted"
- score: A number from -1 (refuted) to 1 (survived), with 0 being neutral`;

/**
 * System prompt for liquidity testing
 */
const LIQUIDITY_TEST_PROMPT = `Current date and time: ${formatTimestamp(Date.now()).formatted}

You are a market microstructure analyst for prediction market theses.

Your role is to assess execution feasibility given market liquidity.

Given a thesis and market conditions, evaluate:
- Can the recommended position be executed at stated prices?
- Is there sufficient liquidity to enter and exit without significant slippage?
- Are there liquidity risks that could impact the trade?

For the liquidity assessment, determine if it:
- SURVIVED: Liquidity is sufficient for execution
- WEAKENED: Liquidity is adequate but with some slippage risk
- REFUTED: Liquidity is insufficient for the recommended position size

Respond with a structured test result including:
- testType: "liquidity"
- claim: The liquidity assumption being tested
- challenge: Your analysis of execution feasibility
- outcome: "survived", "weakened", or "refuted"
- score: A number from -1 (refuted) to 1 (survived), with 0 being neutral`;

/**
 * System prompt for tail risk testing
 */
const TAIL_RISK_TEST_PROMPT = `Current date and time: ${formatTimestamp(Date.now()).formatted}

You are a tail risk analyst for prediction market theses.

Your role is to identify low-probability, high-impact scenarios.

Given a thesis, evaluate:
- Are there low-probability scenarios that could invalidate the thesis?
- Has the thesis adequately considered tail risks?
- Are there "black swan" events that could dramatically change the outcome?

For the tail risk assessment, determine if it:
- SURVIVED: Tail risks are acknowledged and accounted for
- WEAKENED: Some tail risks are present but not fully addressed
- REFUTED: Critical tail risks are ignored or dismissed

Respond with a structured test result including:
- testType: "tail-risk"
- claim: The tail risk assumption being tested
- challenge: Your analysis of tail risk scenarios
- outcome: "survived", "weakened", or "refuted"
- score: A number from -1 (refuted) to 1 (survived), with 0 being neutral`;

/**
 * Execute evidence test on a thesis
 */
async function executeEvidenceTest(
  llm: LLMInstance,
  thesis: Thesis,
  opposingThesis: Thesis
): Promise<DebateTest> {
  const prompt = `Evaluate the factual claims in this thesis:

Thesis Direction: ${thesis.direction}
Core Argument: ${thesis.coreArgument}
Catalysts: ${thesis.catalysts.join(', ')}

Opposing Thesis: ${opposingThesis.coreArgument}

Analyze the factual claims and determine if they are well-supported by evidence.`;

  const response = await llm.invoke([
    { role: 'system', content: EVIDENCE_TEST_PROMPT },
    { role: 'user', content: prompt },
  ]);

  // Parse the response to extract test result
  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  // Simple parsing logic - look for keywords in the response
  let outcome: 'survived' | 'weakened' | 'refuted' = 'survived';
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('refuted') || lowerContent.includes('contradicted') || lowerContent.includes('false')) {
    outcome = 'refuted';
  } else if (lowerContent.includes('weakened') || lowerContent.includes('questionable') || lowerContent.includes('uncertain')) {
    outcome = 'weakened';
  }
  
  const score = outcome === 'survived' ? 0.7 : outcome === 'weakened' ? 0 : -0.7;

  return {
    testType: 'evidence',
    claim: thesis.coreArgument,
    challenge: content.substring(0, 200), // Truncate for brevity
    outcome,
    score,
  };
}

/**
 * Execute causality test on a thesis
 */
async function executeCausalityTest(
  llm: LLMInstance,
  thesis: Thesis,
  opposingThesis: Thesis
): Promise<DebateTest> {
  const prompt = `Evaluate the causal claims in this thesis:

Thesis Direction: ${thesis.direction}
Core Argument: ${thesis.coreArgument}
Catalysts: ${thesis.catalysts.join(', ')}

Opposing Thesis: ${opposingThesis.coreArgument}

Analyze whether the thesis confuses correlation with causation.`;

  const response = await llm.invoke([
    { role: 'system', content: CAUSALITY_TEST_PROMPT },
    { role: 'user', content: prompt },
  ]);

  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  let outcome: 'survived' | 'weakened' | 'refuted' = 'survived';
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('refuted') || lowerContent.includes('correlation') && lowerContent.includes('not') && lowerContent.includes('causation')) {
    outcome = 'refuted';
  } else if (lowerContent.includes('weakened') || lowerContent.includes('alternative')) {
    outcome = 'weakened';
  }
  
  const score = outcome === 'survived' ? 0.7 : outcome === 'weakened' ? 0 : -0.7;

  return {
    testType: 'causality',
    claim: thesis.coreArgument,
    challenge: content.substring(0, 200),
    outcome,
    score,
  };
}

/**
 * Execute timing test on a thesis
 */
async function executeTimingTest(
  llm: LLMInstance,
  thesis: Thesis,
  mbd: GraphStateType['mbd']
): Promise<DebateTest> {
  if (!mbd) {
    return {
      testType: 'timing',
      claim: 'Catalyst timeline',
      challenge: 'No market data available for timing analysis',
      outcome: 'weakened',
      score: 0,
    };
  }

  const marketExpiry = formatTimestamp(mbd.expiryTimestamp);
  const prompt = `Evaluate the timing of catalysts in this thesis:

Thesis Direction: ${thesis.direction}
Catalysts: ${thesis.catalysts.join(', ')}
Market Expiry: ${marketExpiry.formatted}

Analyze whether the catalyst timeline is realistic given the market expiry.`;

  const response = await llm.invoke([
    { role: 'system', content: TIMING_TEST_PROMPT },
    { role: 'user', content: prompt },
  ]);

  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  let outcome: 'survived' | 'weakened' | 'refuted' = 'survived';
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('refuted') || lowerContent.includes('unrealistic') || lowerContent.includes('impossible')) {
    outcome = 'refuted';
  } else if (lowerContent.includes('weakened') || lowerContent.includes('tight') || lowerContent.includes('uncertain')) {
    outcome = 'weakened';
  }
  
  const score = outcome === 'survived' ? 0.7 : outcome === 'weakened' ? 0 : -0.7;

  return {
    testType: 'timing',
    claim: `Catalysts: ${thesis.catalysts.join(', ')}`,
    challenge: content.substring(0, 200),
    outcome,
    score,
  };
}

/**
 * Execute liquidity test on a thesis
 */
async function executeLiquidityTest(
  llm: LLMInstance,
  thesis: Thesis,
  mbd: GraphStateType['mbd']
): Promise<DebateTest> {
  if (!mbd) {
    return {
      testType: 'liquidity',
      claim: 'Execution feasibility',
      challenge: 'No market data available for liquidity analysis',
      outcome: 'weakened',
      score: 0,
    };
  }

  const prompt = `Evaluate the execution feasibility of this thesis:

Thesis Direction: ${thesis.direction}
Market Liquidity Score: ${mbd.liquidityScore}/10
Bid-Ask Spread: ${mbd.bidAskSpread} cents
24h Volume: $${mbd.volume24h}

Analyze whether the position can be executed without significant slippage.`;

  const response = await llm.invoke([
    { role: 'system', content: LIQUIDITY_TEST_PROMPT },
    { role: 'user', content: prompt },
  ]);

  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  let outcome: 'survived' | 'weakened' | 'refuted' = 'survived';
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('refuted') || lowerContent.includes('insufficient') || lowerContent.includes('cannot')) {
    outcome = 'refuted';
  } else if (lowerContent.includes('weakened') || lowerContent.includes('slippage') || lowerContent.includes('risk')) {
    outcome = 'weakened';
  }
  
  const score = outcome === 'survived' ? 0.7 : outcome === 'weakened' ? 0 : -0.7;

  return {
    testType: 'liquidity',
    claim: 'Sufficient liquidity for execution',
    challenge: content.substring(0, 200),
    outcome,
    score,
  };
}

/**
 * Execute tail risk test on a thesis
 */
async function executeTailRiskTest(
  llm: LLMInstance,
  thesis: Thesis
): Promise<DebateTest> {
  const prompt = `Evaluate the tail risk considerations in this thesis:

Thesis Direction: ${thesis.direction}
Core Argument: ${thesis.coreArgument}
Failure Conditions: ${thesis.failureConditions.join(', ')}

Analyze whether the thesis adequately considers low-probability, high-impact scenarios.`;

  const response = await llm.invoke([
    { role: 'system', content: TAIL_RISK_TEST_PROMPT },
    { role: 'user', content: prompt },
  ]);

  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  let outcome: 'survived' | 'weakened' | 'refuted' = 'survived';
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('refuted') || lowerContent.includes('ignored') || lowerContent.includes('dismissed')) {
    outcome = 'refuted';
  } else if (lowerContent.includes('weakened') || lowerContent.includes('not fully') || lowerContent.includes('inadequate')) {
    outcome = 'weakened';
  }
  
  const score = outcome === 'survived' ? 0.7 : outcome === 'weakened' ? 0 : -0.7;

  return {
    testType: 'tail-risk',
    claim: `Failure conditions: ${thesis.failureConditions.join(', ')}`,
    challenge: content.substring(0, 200),
    outcome,
    score,
  };
}

/**
 * Calculate aggregate scores from debate tests
 */
function calculateDebateScores(tests: DebateTest[]): {
  bullScore: number;
  bearScore: number;
} {
  // Tests are alternated: bull tests, then bear tests
  // For simplicity, we'll calculate average scores
  const bullTests = tests.filter((_, index) => index % 2 === 0);
  const bearTests = tests.filter((_, index) => index % 2 === 1);

  const bullScore =
    bullTests.length > 0
      ? bullTests.reduce((sum, test) => sum + test.score, 0) / bullTests.length
      : 0;

  const bearScore =
    bearTests.length > 0
      ? bearTests.reduce((sum, test) => sum + test.score, 0) / bearTests.length
      : 0;

  return { bullScore, bearScore };
}

/**
 * Identify key disagreements between theses
 */
function identifyKeyDisagreements(
  bullThesis: Thesis,
  bearThesis: Thesis,
  tests: DebateTest[]
): string[] {
  const disagreements: string[] = [];

  // Check probability disagreement
  const probDiff = Math.abs(bullThesis.fairProbability - bearThesis.fairProbability);
  if (probDiff > 0.2) {
    disagreements.push(
      `Significant probability disagreement: Bull ${(bullThesis.fairProbability * 100).toFixed(1)}% vs Bear ${(bearThesis.fairProbability * 100).toFixed(1)}%`
    );
  }

  // Check for refuted tests
  const refutedTests = tests.filter((test) => test.outcome === 'refuted');
  if (refutedTests.length > 0) {
    disagreements.push(
      `${refutedTests.length} claims were refuted during cross-examination`
    );
  }

  // Check for conflicting catalysts
  const bullCatalysts = new Set(bullThesis.catalysts);
  const bearCatalysts = new Set(bearThesis.catalysts);
  const hasConflictingCatalysts =
    bullCatalysts.size > 0 &&
    bearCatalysts.size > 0 &&
    ![...bullCatalysts].some((c) => bearCatalysts.has(c));

  if (hasConflictingCatalysts) {
    disagreements.push('Theses identify different key catalysts');
  }

  return disagreements;
}

/**
 * Create cross-examination node factory
 *
 * This factory function creates a cross-examination node with the configured LLM.
 *
 * @param config - Engine configuration
 * @returns Cross-examination node function
 */
export function createCrossExaminationNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  const llm = createCrossExaminationLLM(config);

  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();

    // Check if theses are available
    if (!state.bullThesis || !state.bearThesis) {
      return {
        consensusError: {
          type: 'INSUFFICIENT_DATA',
          reason: 'Bull and bear theses are required for cross-examination',
        },
        auditLog: [
          {
            stage: 'cross_examination',
            timestamp: Date.now(),
            data: {
              success: false,
              error: 'Missing theses',
              hasBullThesis: !!state.bullThesis,
              hasBearThesis: !!state.bearThesis,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }

    try {
      const tests: DebateTest[] = [];

      // Execute evidence test on bull thesis
      const bullEvidenceTest = await executeEvidenceTest(
        llm,
        state.bullThesis,
        state.bearThesis
      );
      tests.push(bullEvidenceTest);

      // Execute evidence test on bear thesis
      const bearEvidenceTest = await executeEvidenceTest(
        llm,
        state.bearThesis,
        state.bullThesis
      );
      tests.push(bearEvidenceTest);

      // Execute causality test on bull thesis
      const bullCausalityTest = await executeCausalityTest(
        llm,
        state.bullThesis,
        state.bearThesis
      );
      tests.push(bullCausalityTest);

      // Execute causality test on bear thesis
      const bearCausalityTest = await executeCausalityTest(
        llm,
        state.bearThesis,
        state.bullThesis
      );
      tests.push(bearCausalityTest);

      // Execute timing test on bull thesis
      const bullTimingTest = await executeTimingTest(llm, state.bullThesis, state.mbd);
      tests.push(bullTimingTest);

      // Execute timing test on bear thesis
      const bearTimingTest = await executeTimingTest(llm, state.bearThesis, state.mbd);
      tests.push(bearTimingTest);

      // Execute liquidity test on bull thesis
      const bullLiquidityTest = await executeLiquidityTest(
        llm,
        state.bullThesis,
        state.mbd
      );
      tests.push(bullLiquidityTest);

      // Execute liquidity test on bear thesis
      const bearLiquidityTest = await executeLiquidityTest(
        llm,
        state.bearThesis,
        state.mbd
      );
      tests.push(bearLiquidityTest);

      // Execute tail risk test on bull thesis
      const bullTailRiskTest = await executeTailRiskTest(llm, state.bullThesis);
      tests.push(bullTailRiskTest);

      // Execute tail risk test on bear thesis
      const bearTailRiskTest = await executeTailRiskTest(llm, state.bearThesis);
      tests.push(bearTailRiskTest);

      // Calculate aggregate scores
      const { bullScore, bearScore } = calculateDebateScores(tests);

      // Identify key disagreements
      const keyDisagreements = identifyKeyDisagreements(
        state.bullThesis,
        state.bearThesis,
        tests
      );

      // Create debate record
      const debateRecord: DebateRecord = {
        tests,
        bullScore,
        bearScore,
        keyDisagreements,
      };

      return {
        debateRecord,
        auditLog: [
          {
            stage: 'cross_examination',
            timestamp: Date.now(),
            data: {
              success: true,
              testsExecuted: tests.length,
              bullScore,
              bearScore,
              keyDisagreements: keyDisagreements.length,
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    } catch (error) {
      return {
        consensusError: {
          type: 'CONSENSUS_FAILED',
          reason:
            error instanceof Error
              ? error.message
              : 'Unknown error during cross-examination',
        },
        auditLog: [
          {
            stage: 'cross_examination',
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
 * Default cross-examination node
 *
 * This is a convenience export that uses the default configuration.
 * For production use, create a node with createCrossExaminationNode(config).
 */
export const crossExaminationNode = (config: EngineConfig) =>
  createCrossExaminationNode(config);
