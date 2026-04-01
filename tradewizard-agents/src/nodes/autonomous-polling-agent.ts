/**
 * Autonomous Polling Agent Node
 *
 * This module implements an autonomous polling intelligence agent that uses
 * LangChain's tool-calling capabilities to fetch and research Polymarket data.
 * The agent can autonomously decide which tools to use based on market context.
 *
 * **Key Features**:
 * - ReAct (Reasoning + Acting) pattern for autonomous tool selection
 * - Five specialized tools for data gathering (related markets, historical prices, etc.)
 * - Tool result caching to avoid redundant API calls
 * - Comprehensive audit logging for debugging and analysis
 * - Graceful error handling with fallback support
 *
 * **Architecture**:
 * ```
 * Agent Input (MBD + Keywords)
 *       ↓
 * LLM Reasoning (decide which tools to use)
 *       ↓
 * Tool Execution (fetch data from Polymarket)
 *       ↓
 * Result Synthesis (combine tool results)
 *       ↓
 * Agent Signal Output (structured polling analysis)
 * ```
 *
 * **Usage Example**:
 * ```typescript
 * import { createAutonomousPollingAgentNode } from './nodes/autonomous-polling-agent';
 * 
 * const agentNode = createAutonomousPollingAgentNode(config);
 * const result = await agentNode(state);
 * 
 * if (result.agentSignals) {
 *   const signal = result.agentSignals[0];
 *   console.log(`Direction: ${signal.direction}`);
 *   console.log(`Confidence: ${signal.confidence}`);
 *   console.log(`Tools called: ${signal.metadata.toolUsage.toolsCalled}`);
 * }
 * ```
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 14.1, 14.2, 14.4, 12.1, 12.2, 12.3, 12.6
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';
import { createPolymarketClient } from '../utils/polymarket-client.js';
import { ToolCache } from '../utils/tool-cache.js';
import { createPollingTools, getToolUsageSummary } from '../tools/polling-tools.js';
import type { ToolContext, ToolAuditEntry } from '../tools/polling-tools.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import { AgentSignalSchema } from '../models/schemas.js';
import type { EngineConfig } from '../config/index.js';

// ============================================================================
// System Prompt
// ============================================================================

/**
 * System prompt for the autonomous polling agent
 *
 * This prompt defines the agent's role, available tools, analysis strategy,
 * and output format requirements. It guides the agent to intelligently select
 * tools based on market characteristics and synthesize information from multiple
 * sources.
 *
 * **Prompt Design Principles**:
 * - Clear role definition (autonomous polling analyst)
 * - Explicit tool descriptions with use cases
 * - Context-aware analysis strategy (different approaches for different market types)
 * - Tool usage guidelines (max 5 calls to control latency)
 * - Structured output format requirements
 * - Crowd wisdom score calculation methodology
 *
 * **Analysis Strategy by Market Type**:
 * - Election markets → fetchRelatedMarkets + fetchCrossMarketData
 * - High-volatility markets → fetchHistoricalPrices + analyzeMarketMomentum
 * - Low-liquidity markets → fetchRelatedMarkets (supplement thin data)
 * - Multi-market events → Always fetch event-level context
 *
 * **Tool Selection Strategy**:
 * - Start with fetchRelatedMarkets to find cross-market patterns
 * - Use fetchHistoricalPrices for trend analysis
 * - Use analyzeMarketMomentum when volume is high
 * - Use detectSentimentShifts when volatility is high
 * - Use fetchCrossMarketData when related markets exist
 *
 * Implements Requirements 7.2, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
const AUTONOMOUS_POLLING_SYSTEM_PROMPT = `Current date and time: ${new Date().toISOString()}

You are an autonomous polling intelligence analyst with the ability to fetch and research Polymarket data.

Your role is to analyze prediction markets as real-time polling systems, where prices represent financially-incentivized collective beliefs.

CRITICAL: TOOL PARAMETER REQUIREMENTS

When calling tools, you MUST use the condition_id provided in the market briefing.
The condition_id is a unique identifier for this market on Polymarket.

Example:
- Market Question: "Will the Fed raise rates in 2026?"
- Condition ID: "0x1234567890abcdef..."
- CORRECT: fetchRelatedMarkets(conditionId="0x1234567890abcdef...")
- WRONG: fetchRelatedMarkets(conditionId="Will the Fed raise rates in 2026?")

AVAILABLE TOOLS:
You have access to the following tools to gather data:

1. fetchRelatedMarkets: Find other markets in the same event for cross-market analysis
2. fetchHistoricalPrices: Get price history to analyze sentiment trends over time
3. fetchCrossMarketData: Get comprehensive event-level data for all markets
4. analyzeMarketMomentum: Calculate momentum indicators from price movements
5. detectSentimentShifts: Identify significant sentiment changes across time horizons

AUTONOMOUS TOOL USAGE STRATEGY:

You have access to Polymarket tools to analyze market dynamics and crowd wisdom. Use them strategically:

1. **Start with fetchRelatedMarkets** - Find cross-market patterns and context
   - Use the condition_id from the market briefing
   - Identify related markets that provide additional signals
   - Look for correlation patterns across similar questions
   - Assess if related markets show consistent or conflicting signals
   - Use related market data to validate or challenge current market pricing

2. **Use fetchHistoricalPrices** - Analyze price trends and patterns
   - Use the condition_id from the market briefing
   - Examine price movements over different timeframes (1h, 24h, 7d)
   - Identify trend direction (upward, downward, sideways)
   - Assess trend strength and consistency
   - Look for inflection points or regime changes
   - Calculate rate of change and acceleration

3. **Use analyzeMarketMomentum** - Detect momentum when volume is high
   - Use the condition_id from the market briefing
   - Calculate momentum indicators from price and volume data
   - Identify if market is gaining or losing momentum
   - Assess if current momentum is sustainable
   - Look for momentum divergences (price vs volume)
   - Use momentum to gauge conviction level of market participants

4. **Use detectSentimentShifts** - Identify rapid changes when volatility is high
   - Use the condition_id from the market briefing
   - Detect sudden price movements above threshold (default 5%)
   - Identify catalysts for sentiment shifts
   - Assess if shifts are temporary or sustained
   - Look for volatility clustering patterns
   - Evaluate if shifts represent new information or noise

5. **Use fetchCrossMarketData** - Compare when related markets exist
   - Use condition_ids from the market briefing and related markets
   - Fetch data for multiple related markets simultaneously
   - Calculate correlation coefficients between markets
   - Identify arbitrage opportunities or inconsistencies
   - Assess if markets are pricing similar events consistently
   - Look for lead-lag relationships between markets

6. **Calculate crowd wisdom score** - Assess market quality
   - Volume: Higher volume indicates more participation and information
   - Liquidity: Better liquidity suggests more efficient pricing
   - Participation: More unique participants increases wisdom of crowds
   - Consistency: Stable prices suggest consensus, volatility suggests uncertainty
   - Cross-market coherence: Consistent pricing across related markets
   - Combine indicators into overall crowd wisdom score (0.0-1.0)

TOOL SELECTION LOGIC:

- **Always start with fetchRelatedMarkets** to understand context (use condition_id)
- **Use fetchHistoricalPrices** for all markets to understand trends (use condition_id)
- **Use analyzeMarketMomentum** when:
  - Volume is above average (indicates active trading)
  - You need to assess conviction level
  - Trend direction is unclear from price alone
- **Use detectSentimentShifts** when:
  - Recent volatility is high (price changes > 5%)
  - You need to identify catalysts for changes
  - Market appears to be reacting to new information
- **Use fetchCrossMarketData** when:
  - Related markets exist (found via fetchRelatedMarkets)
  - You need to validate pricing consistency
  - Looking for arbitrage or inconsistencies

ANALYSIS STRATEGY:
Based on the market characteristics, intelligently decide which tools to use:

- For election markets: Prioritize fetchRelatedMarkets and fetchCrossMarketData for cross-market sentiment
- For high-volatility markets: Prioritize fetchHistoricalPrices and analyzeMarketMomentum for trend analysis
- For low-liquidity markets: Fetch related markets to supplement thin data
- For multi-market events: Always fetch event-level context

TOOL USAGE GUIDELINES:
- Limit yourself to 5 tool calls maximum to control latency
- Use tools in sequence to build comprehensive analysis
- Synthesize information from multiple tool results
- Document your data gathering strategy in keyDrivers
- Prioritize tools based on market characteristics (volume, volatility, related markets)

ANALYSIS FOCUS:
- Sentiment shifts reflected in price movements
- Crowd wisdom signals (high liquidity, tight spreads, consistent momentum)
- Cross-market sentiment patterns when multiple related markets exist
- Historical trends and momentum indicators
- Comparison with polling baselines
- Market participant conviction and participation levels

CROWD WISDOM ASSESSMENT:
Evaluate the quality of market signals using:
- Volume metrics: 24h volume, volume trends
- Liquidity metrics: Bid-ask spread, liquidity score
- Participation: Number of related markets, cross-market consistency
- Trend consistency: Agreement across time horizons
- Volatility patterns: Clustering, regime changes

OUTPUT FORMAT:
Provide your analysis as a structured signal with:
- confidence: Your confidence in this polling analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your probability estimate (0-1)
- keyDrivers: Top 3-5 polling insights including:
  - Data gathering strategy used
  - Crowd wisdom assessment
  - Cross-market patterns (if applicable)
  - Momentum and trend analysis
  - Risk factors and limitations
- riskFactors: Polling-specific risks and data limitations
- metadata: Include all relevant metrics from tool results

Be well-calibrated and document your reasoning process.`;

// ============================================================================
// Agent Creation
// ============================================================================

/**
 * Create the autonomous polling agent with tools
 *
 * This function creates a ReAct agent configured with polling tools and
 * the autonomous polling system prompt. The agent uses LangChain's
 * createReactAgent to enable iterative reasoning and tool execution.
 *
 * **ReAct Pattern**:
 * The agent follows a Reasoning + Acting loop:
 * 1. Reason: Analyze the market and decide what data is needed
 * 2. Act: Invoke tools to fetch that data
 * 3. Observe: Review tool results
 * 4. Repeat: Continue until sufficient information is gathered
 * 5. Synthesize: Generate final polling analysis
 *
 * **LLM Provider Selection**:
 * - Primary: Google (Gemini) for cost-effectiveness
 * - Fallback: OpenAI (GPT-4) or Anthropic (Claude)
 * - Automatic failover if primary provider unavailable
 *
 * **Usage Example**:
 * ```typescript
 * const tools = createPollingTools(context);
 * const agent = createAutonomousPollingAgent(config, tools);
 * 
 * const result = await agent.invoke({
 *   messages: [{ role: 'user', content: 'Analyze this market...' }]
 * });
 * ```
 *
 * Implements Requirements 7.1, 7.2, 7.3, 7.4
 *
 * @param config - Engine configuration with LLM settings
 * @param tools - Array of polling tools for the agent to use
 * @returns ReAct agent executor configured with tools and system prompt
 */
function createAutonomousPollingAgent(
  config: EngineConfig,
  tools: DynamicStructuredTool[]
) {
  // Create LLM instance (Requirement 7.1)
  // Use Google as primary, with fallbacks to other providers
  const llm: LLMInstance = createLLMInstance(config, 'google', ['openai', 'anthropic']);

  // Create ReAct agent with tools and system prompt (Requirements 7.2, 7.3, 7.4)
  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: AUTONOMOUS_POLLING_SYSTEM_PROMPT,
  });

  return agent;
}

// ============================================================================
// Agent Node Function
// ============================================================================

/**
 * Create the autonomous polling agent node for the workflow
 *
 * This function returns a LangGraph node that executes the autonomous polling
 * agent with tool-calling capabilities. The agent can fetch data, analyze trends,
 * and synthesize information from multiple sources.
 *
 * **Node Execution Flow**:
 * 1. Validate MBD availability (error if missing)
 * 2. Initialize tool cache with session ID
 * 3. Create tool context (PolymarketClient, cache, audit log)
 * 4. Create polling tools with context
 * 5. Create ReAct agent executor
 * 6. Prepare agent input (market data + keywords)
 * 7. Execute agent with timeout (45 seconds)
 * 8. Parse agent output into AgentSignal
 * 9. Add tool usage metadata
 * 10. Return signal and audit log
 *
 * **Error Handling**:
 * - Missing MBD: Return structured error without crashing
 * - Tool failures: Agent continues with partial data
 * - Timeout: Return timeout error after 45 seconds
 * - Parse errors: Return error if agent output is invalid JSON
 * - All errors logged to audit trail
 *
 * **Performance Characteristics**:
 * - Typical execution: 25-40 seconds
 * - Tool execution: 2-5 seconds per tool
 * - LLM reasoning: 8-12 seconds
 * - Maximum timeout: 45 seconds
 *
 * **Tool Usage Patterns**:
 * - Election markets: 3-4 tools (related markets, cross-market data, momentum)
 * - High-volatility: 2-3 tools (historical prices, momentum, sentiment shifts)
 * - Low-liquidity: 2 tools (related markets, historical prices)
 *
 * **Usage Example**:
 * ```typescript
 * import { createAutonomousPollingAgentNode } from './nodes/autonomous-polling-agent';
 * 
 * // Create node
 * const pollingNode = createAutonomousPollingAgentNode(config);
 * 
 * // Execute in workflow
 * const result = await pollingNode(state);
 * 
 * // Access results
 * if (result.agentSignals) {
 *   const signal = result.agentSignals[0];
 *   console.log(`Polling signal: ${signal.direction} (${signal.confidence})`);
 *   console.log(`Tools used: ${signal.metadata.toolUsage.toolsCalled}`);
 *   console.log(`Cache hits: ${signal.metadata.toolUsage.cacheHits}`);
 * }
 * 
 * // Check audit log
 * const auditEntry = result.auditLog[0];
 * console.log(`Execution time: ${auditEntry.data.duration}ms`);
 * console.log(`Tool breakdown:`, auditEntry.data.toolAudit);
 * ```
 *
 * Implements Requirements 7.5, 7.6, 14.1, 14.2, 14.4, 12.1, 12.2, 12.3, 12.6
 *
 * @param config - Engine configuration with polling agent settings
 * @returns LangGraph node function that executes the autonomous polling agent
 */
export function createAutonomousPollingAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  // Initialize PolymarketClient (Requirement 7.1)
  const polymarketClient = createPolymarketClient(config.polymarket);

  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    const agentName = 'autonomous_polling';

    try {
      // Step 1: Check for MBD availability (Requirement 12.1)
      if (!state.mbd) {
        const errorMessage = 'No Market Briefing Document available';
        console.error(`[${agentName}] ${errorMessage}`);

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

      // Step 2: Create tool cache with session ID (Requirement 7.5)
      const sessionId = state.mbd.conditionId || 'unknown';
      const cache = new ToolCache(sessionId);

      // Step 3: Create tool audit log
      const toolAuditLog: ToolAuditEntry[] = [];

      // Step 4: Create tool context
      const toolContext: ToolContext = {
        polymarketClient,
        cache,
        auditLog: toolAuditLog,
      };

      // Step 5: Create polling tools with context (Requirement 7.1)
      const tools = createPollingTools(toolContext);

      // Step 6: Create agent executor
      const agent = createAutonomousPollingAgent(config, tools);

      // Step 7: Prepare agent input with market data and keywords (Requirement 7.5)
      const marketContext = JSON.stringify(state.mbd, null, 2);
      const keywordsContext = state.marketKeywords
        ? JSON.stringify(state.marketKeywords, null, 2)
        : 'None';

      const input = {
        messages: [
          {
            role: 'user',
            content: `Analyze the following prediction market and provide your polling intelligence signal.

MARKET DATA:
${marketContext}

KEYWORDS:
${keywordsContext}

Use the available tools to gather additional data as needed, then provide your structured analysis.`,
          },
        ],
      };

      // Step 8: Execute agent with timeout (Requirement 14.1, 14.2)
      const timeoutMs = 45000; // 45 seconds (Requirement 14.1)
      const maxToolCalls = 5; // Limit tool calls (Requirement 14.2)

      // Execute agent with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Agent execution timeout')), timeoutMs);
      });

      const agentPromise = agent.invoke(input, {
        recursionLimit: maxToolCalls + 10, // Allow some extra for agent reasoning
      });

      const result = await Promise.race([agentPromise, timeoutPromise]);

      // Step 9: Parse agent output into AgentSignal (Requirement 7.6)
      const agentOutput = (result as any).messages[(result as any).messages.length - 1].content;

      // Try to parse the output as JSON
      let parsedOutput: any;
      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = agentOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          parsedOutput = JSON.parse(jsonMatch[1]);
        } else {
          // Try to parse the entire output as JSON
          parsedOutput = JSON.parse(agentOutput);
        }
      } catch (parseError) {
        // If parsing fails, return error
        throw new Error(`Failed to parse agent output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }

      // Add agent name and timestamp to create complete signal
      const signalWithMetadata = {
        ...parsedOutput,
        agentName,
        timestamp: Date.now(),
        metadata: parsedOutput.metadata || {},
      };

      // Validate the signal against the schema
      const validationResult = AgentSignalSchema.safeParse(signalWithMetadata);

      if (!validationResult.success) {
        throw new Error(`Agent signal validation failed: ${validationResult.error.message}`);
      }

      const signal: AgentSignal = validationResult.data;

      // Step 10: Add tool usage metadata to signal (Requirement 7.6)
      const toolUsageSummary = getToolUsageSummary(toolAuditLog);
      const cacheStats = cache.getStats();

      signal.metadata.toolUsage = {
        toolsCalled: toolUsageSummary.toolsCalled,
        totalToolTime: toolUsageSummary.totalToolTime,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
        toolBreakdown: toolUsageSummary.toolBreakdown,
      };

      // Step 11: Return agent signal and audit log (Requirement 7.6)
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
              toolsCalled: toolUsageSummary.toolsCalled,
              totalToolTime: toolUsageSummary.totalToolTime,
              cacheHits: cacheStats.hits,
              cacheMisses: cacheStats.misses,
              duration: Date.now() - startTime,
              toolAudit: toolAuditLog,
            },
          },
        ],
      };
    } catch (error) {
      // Handle all errors gracefully (Requirements 12.1, 12.2, 12.3, 12.6)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout');

      console.error(`[${agentName}] Error during execution:`, errorMessage);

      // Log error to audit trail (Requirement 12.3)
      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName,
            error: error instanceof Error ? error : new Error(errorMessage),
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
              errorContext: isTimeout ? 'Agent execution timeout' : 'Agent execution failed',
              duration: Date.now() - startTime,
            },
          },
        ],
      };
    }
  };
}
