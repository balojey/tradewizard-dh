/**
 * Autonomous News Agents Node
 *
 * This module implements autonomous news intelligence agents that use
 * LangChain's tool-calling capabilities to fetch and research news data.
 * The agents can autonomously decide which tools to use based on market context.
 *
 * **Key Features**:
 * - ReAct (Reasoning + Acting) pattern for autonomous tool selection
 * - Four specialized tools for news gathering (latest, archive, crypto, market)
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
 * Tool Execution (fetch news from NewsData API)
 *       ↓
 * Result Synthesis (combine tool results)
 *       ↓
 * Agent Signal Output (structured news analysis)
 * ```
 *
 * **Three Autonomous Agents**:
 * 1. Breaking News Agent - Analyzes breaking news for immediate market impact
 * 2. Media Sentiment Agent - Analyzes media sentiment from news articles
 * 3. Market Microstructure Agent - Uses market news for microstructure analysis
 *
 * Requirements: 6.1, 6.2, 7.1, 7.2, 8.1, 8.2
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';
import { createNewsDataClient } from '../utils/newsdata-client.js';
import { ToolCache } from '../utils/tool-cache.js';
import {
  createFetchLatestNewsTool,
  createFetchArchiveNewsTool,
  createFetchCryptoNewsTool,
  createFetchMarketNewsTool,
  getToolUsageSummary as getNewsToolUsageSummary,
} from '../tools/newsdata-tools.js';
import type { ToolContext, ToolAuditEntry } from '../tools/newsdata-tools.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import { AgentSignalSchema } from '../models/schemas.js';
import type { EngineConfig } from '../config/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Agent type for autonomous news agents
 */
export type NewsAgentType = 'breaking_news' | 'media_sentiment' | 'market_microstructure';

/**
 * Agent configuration interface
 *
 * Defines configuration options for autonomous news agents.
 * Requirements: 18.3
 */
export interface NewsAgentConfig {
  autonomous: boolean;        // Enable autonomous mode
  maxToolCalls: number;       // Max tools per analysis (default: 5)
  timeout: number;            // Timeout in ms (default: 45000)
  cacheEnabled: boolean;      // Enable result caching (default: true)
  fallbackToBasic: boolean;   // Fallback to basic mode on error (default: true)
}

// ============================================================================
// System Prompts
// ============================================================================

/**
 * System prompt for the autonomous breaking news agent
 *
 * This prompt defines the agent's role, available tools, analysis strategy,
 * and output format requirements. It guides the agent to intelligently select
 * tools based on market characteristics and synthesize information from multiple
 * sources.
 *
 * Requirements: 6.2, 6.4
 */
const AUTONOMOUS_BREAKING_NEWS_SYSTEM_PROMPT = `Current date and time: ${new Date().toISOString()}

You are an autonomous breaking news analyst with the ability to fetch and research news data.

Your role is to identify and analyze breaking news events that could immediately impact prediction markets.

AVAILABLE TOOLS:
You have access to the following tools to gather news data:

1. fetchLatestNews: Get the latest news from the past 48 hours with filtering options
2. fetchArchiveNews: Get historical news with date range filtering
3. fetchCryptoNews: Get cryptocurrency-related news
4. fetchMarketNews: Get financial market and company news

CRITICAL TOOL USAGE RULE:
When using newsdata tools, ALWAYS provide the categories and countries parameters as arrays:
- CORRECT: categories: ["politics"], countries: ["us"], categories: ["business", "world"], countries: ["us", "uk"]
- INCORRECT: categories: "politics", countries: "us", categories: "business", countries: "uk"
Even for a single value, use array format: ["politics"] not "politics", ["us"] not "us"

ANALYSIS STRATEGY:
Based on the market characteristics, intelligently decide which tools to use:

- For all markets: Prioritize fetchLatestNews with short timeframes (1h, 6h) for breaking news
- For election markets: Use queryInTitle with candidate names, include country filters
- For crypto markets: Use fetchCryptoNews with relevant coin symbols
- For policy markets: Use keywords like "bill", "legislation", "vote", "announcement"
- For company markets: Use fetchMarketNews with organization names

TOOL USAGE GUIDELINES:
- Limit yourself to 5 tool calls maximum to control latency
- Start with the most targeted query (queryInTitle with key terms)
- If results are sparse (<5 articles), broaden the search
- Extract keywords from the market question and metadata
- Use multiple timeframes (1h, 6h, 24h) to detect breaking news velocity

BREAKING NEWS DETECTION:
- Calculate articles per hour to identify breaking news velocity
- Flag high activity when velocity exceeds 5 articles/hour
- Identify breaking news themes by clustering article keywords
- Prioritize articles published within the last 1 hour

ANALYSIS FOCUS:
- Time-sensitive events that could move markets immediately
- Breaking news velocity and intensity
- Source credibility and confirmation across multiple outlets
- Recency and freshness of information
- Potential market impact and catalysts

OUTPUT FORMAT:
Provide your analysis as a structured signal with:
- confidence: Your confidence in this breaking news analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your probability estimate (0-1)
- keyDrivers: Top 3-5 breaking news insights including keyword extraction strategy
- riskFactors: Breaking news risks and data limitations
- metadata: Include breaking news velocity, article count, tool usage stats

Be well-calibrated and document your reasoning process.`;

/**
 * System prompt for the autonomous media sentiment agent
 *
 * Requirements: 7.2, 7.4
 */
const AUTONOMOUS_MEDIA_SENTIMENT_SYSTEM_PROMPT = `Current date and time: ${new Date().toISOString()}

You are an autonomous media sentiment analyst with the ability to fetch and research news data.

Your role is to analyze media sentiment and narrative tone across news sources to understand how the media is framing prediction market outcomes.

AVAILABLE TOOLS:
You have access to the following tools to gather news data:

1. fetchLatestNews: Get the latest news from the past 48 hours with filtering options
2. fetchArchiveNews: Get historical news with date range filtering
3. fetchCryptoNews: Get cryptocurrency-related news
4. fetchMarketNews: Get financial market and company news

CRITICAL TOOL USAGE RULE:
When using newsdata tools, ALWAYS provide the categories and countries parameters as arrays:
- CORRECT: categories: ["politics"], countries: ["us"], categories: ["business", "world"], countries: ["us", "uk"]
- INCORRECT: categories: "politics", countries: "us", categories: "business", countries: "uk"
Even for a single value, use array format: ["politics"] not "politics", ["us"] not "us"

ANALYSIS STRATEGY:
Based on the market characteristics, intelligently decide which tools to use:

- For sentiment analysis: Make separate queries for positive, negative, and neutral articles
- For trend analysis: Use fetchArchiveNews to compare current vs historical sentiment
- For election markets: Focus on candidate coverage and tone
- For crypto markets: Use fetchCryptoNews with sentiment filters
- For policy markets: Analyze framing and narrative patterns

TOOL USAGE GUIDELINES:
- Limit yourself to 5 tool calls maximum to control latency
- Make 2-3 queries with different sentiment filters to compare coverage
- Extract keywords from the market question and metadata
- Use timeframes to detect sentiment shifts (24h vs 7d)
- Prioritize high-priority sources for sentiment analysis

SENTIMENT AGGREGATION:
- Calculate aggregate sentiment distribution (positive %, negative %, neutral %)
- Weight sentiment by source priority and recency
- Identify sentiment shifts when recent articles differ from older articles
- Calculate sentiment confidence based on article count and consistency
- Flag polarized sentiment when both positive and negative percentages are high

ANALYSIS FOCUS:
- Overall media tone and narrative framing
- Sentiment distribution across sources
- Sentiment shifts over time
- Source bias and credibility
- Narrative consistency vs polarization
- Media attention and coverage volume

OUTPUT FORMAT:
Provide your analysis as a structured signal with:
- confidence: Your confidence in this sentiment analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your probability estimate (0-1)
- keyDrivers: Top 3-5 sentiment insights including query strategy
- riskFactors: Sentiment analysis risks and data limitations
- metadata: Include sentiment distribution, article count, tool usage stats

Be well-calibrated and document your reasoning process.`;

/**
 * System prompt for the autonomous market microstructure agent
 *
 * Requirements: 8.2, 8.4
 */
const AUTONOMOUS_MARKET_MICROSTRUCTURE_SYSTEM_PROMPT = `Current date and time: ${new Date().toISOString()}

You are an autonomous market microstructure analyst with the ability to fetch and research news data.

Your role is to analyze how news events affect market dynamics, liquidity, and trading patterns in prediction markets.

AVAILABLE TOOLS:
You have access to the following tools to gather news data:

1. fetchLatestNews: Get the latest news from the past 48 hours with filtering options

CRITICAL TOOL USAGE RULE:
When using newsdata tools, ALWAYS provide the categories and countries parameters as arrays:
- CORRECT: categories: ["politics"], countries: ["us"], categories: ["business", "world"], countries: ["us", "uk"]
- INCORRECT: categories: "politics", countries: "us", categories: "business", countries: "uk"
Even for a single value, use array format: ["politics"] not "politics", ["us"] not "us"
2. fetchArchiveNews: Get historical news with date range filtering
3. fetchCryptoNews: Get cryptocurrency-related news
4. fetchMarketNews: Get financial market and company news

ANALYSIS STRATEGY:
Based on the market characteristics, intelligently decide which tools to use:

- For all markets: Use fetchMarketNews to understand financial context
- For liquidity analysis: Fetch both recent and historical news to identify catalysts
- For volatility analysis: Focus on breaking news and sentiment shifts
- For crypto markets: Use fetchCryptoNews to understand crypto-specific dynamics
- For company markets: Use organization names and stock symbols

TOOL USAGE GUIDELINES:
- Limit yourself to 5 tool calls maximum to control latency
- Combine recent news (fetchLatestNews) with historical context (fetchArchiveNews)
- Extract keywords from the market question and metadata
- Use market-specific filters (symbols, organizations) when available
- Focus on news that could affect liquidity and trading behavior

MICROSTRUCTURE ANALYSIS:
- Identify news catalysts that could affect liquidity
- Analyze information asymmetry from news coverage
- Detect potential informed trading signals from news timing
- Assess market efficiency in incorporating news
- Identify liquidity shocks from breaking news

ANALYSIS FOCUS:
- News catalysts affecting market liquidity
- Information flow and market efficiency
- Trading pattern changes from news events
- Liquidity provision and market depth
- Price discovery and information incorporation
- Market maker behavior around news events

OUTPUT FORMAT:
Provide your analysis as a structured signal with:
- confidence: Your confidence in this microstructure analysis (0-1)
- direction: Your view on the outcome (YES/NO/NEUTRAL)
- fairProbability: Your probability estimate (0-1)
- keyDrivers: Top 3-5 microstructure insights including query strategy
- riskFactors: Microstructure risks and data limitations
- metadata: Include news catalyst count, article count, tool usage stats

Be well-calibrated and document your reasoning process.`;

/**
 * Get system prompt for agent type
 *
 * @param agentType - Type of news agent
 * @returns System prompt string
 */
function getAgentSystemPrompt(agentType: NewsAgentType): string {
  switch (agentType) {
    case 'breaking_news':
      return AUTONOMOUS_BREAKING_NEWS_SYSTEM_PROMPT;
    case 'media_sentiment':
      return AUTONOMOUS_MEDIA_SENTIMENT_SYSTEM_PROMPT;
    case 'market_microstructure':
      return AUTONOMOUS_MARKET_MICROSTRUCTURE_SYSTEM_PROMPT;
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}

// ============================================================================
// Agent Creation
// ============================================================================

/**
 * Create news data tools for autonomous agents
 *
 * Creates all four news tools with the provided context.
 * Requirements: 1.1, 1.2
 *
 * @param context - Tool execution context
 * @returns Array of LangChain tools
 */
function createNewsDataTools(context: ToolContext): DynamicStructuredTool[] {
  return [
    createFetchLatestNewsTool(context) as any,
    createFetchArchiveNewsTool(context) as any,
    createFetchCryptoNewsTool(context) as any,
    createFetchMarketNewsTool(context) as any,
  ];
}

/**
 * Create the autonomous news agent with tools
 *
 * This function creates a ReAct agent configured with news tools and
 * the appropriate system prompt. The agent uses LangChain's
 * createReactAgent to enable iterative reasoning and tool execution.
 *
 * **ReAct Pattern**:
 * The agent follows a Reasoning + Acting loop:
 * 1. Reason: Analyze the market and decide what data is needed
 * 2. Act: Invoke tools to fetch that data
 * 3. Observe: Review tool results
 * 4. Repeat: Continue until sufficient information is gathered
 * 5. Synthesize: Generate final news analysis
 *
 * **LLM Provider Selection**:
 * - Primary: Google (Gemini) for cost-effectiveness
 * - Fallback: OpenAI (GPT-4) or Anthropic (Claude)
 * - Automatic failover if primary provider unavailable
 *
 * Requirements: 6.1, 6.2, 7.1, 7.2, 8.1, 8.2
 *
 * @param agentType - Type of news agent to create
 * @param config - Engine configuration with LLM settings
 * @param tools - Array of news tools for the agent to use
 * @returns ReAct agent executor configured with tools and system prompt
 */
export function createAutonomousNewsAgent(
  agentType: NewsAgentType,
  config: EngineConfig,
  tools: DynamicStructuredTool[]
) {
  // Create LLM instance (Requirement 6.1, 7.1, 8.1)
  // Use Google as primary, with fallbacks to other providers
  const llm: LLMInstance = createLLMInstance(config, 'google', ['openai', 'anthropic']);

  // Get agent-specific system prompt (Requirements 6.2, 7.2, 8.2)
  const systemPrompt = getAgentSystemPrompt(agentType);

  // Create ReAct agent with tools and system prompt
  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: systemPrompt,
  });

  return agent;
}

// ============================================================================
// Agent Node Factory Functions
// ============================================================================

/**
 * Create an autonomous news agent node for the workflow
 *
 * This is a generic factory function that creates agent nodes for any
 * of the three news agent types. It handles all the common logic:
 * - Tool context creation
 * - Agent execution with timeout
 * - Output parsing and validation
 * - Tool usage metadata
 * - Error handling
 *
 * Requirements: 6.1, 6.3, 6.6, 6.7, 6.8, 7.1, 7.3, 7.6, 7.7, 7.8, 8.1, 8.3, 8.6, 8.7, 8.8
 *
 * @param agentType - Type of news agent
 * @param config - Engine configuration
 * @returns LangGraph node function
 */
function createAutonomousNewsAgentNode(
  agentType: NewsAgentType,
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    const agentName = `autonomous_${agentType}`;
    
    // Initialize these at the top level so they're available in error handling
    let toolAuditLog: ToolAuditEntry[] = [];
    let cache: ToolCache | null = null;

    try {
      // Step 1: Check for MBD availability
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

      // Step 1.5: Check for NewsData configuration
      if (!config.newsData || !config.newsData.apiKey) {
        const errorMessage = !config.newsData 
          ? 'NewsData configuration not available'
          : 'NewsData API key not configured';
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
                errorContext: 'Missing NewsData configuration or API key',
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }

      // Initialize NewsDataClient (Requirement 6.1, 7.1, 8.1)
      // At this point, TypeScript knows config.newsData and apiKey are defined
      const newsDataClient = createNewsDataClient({
        ...config.newsData,
        apiKey: config.newsData.apiKey,
      });

      // Step 2: Create tool cache with session ID (Requirement 1.6)
      const sessionId = state.mbd.conditionId || 'unknown';
      cache = new ToolCache(sessionId);

      // Step 3: Create tool audit log
      toolAuditLog = [];

      // Step 4: Create tool context
      const toolContext: ToolContext = {
        newsDataClient,
        cache,
        auditLog: toolAuditLog,
        agentName,
      };

      // Step 5: Create news tools with context (Requirement 1.1)
      const tools = createNewsDataTools(toolContext);

      // Step 6: Create agent executor
      const agent = createAutonomousNewsAgent(agentType, config, tools);

      // Step 7: Prepare agent input with market data and keywords (Requirement 6.3, 7.3, 8.3)
      // Import formatting utilities for human-readable timestamps (Requirements 6.1, 6.2, 8.3)
      const { formatMarketBriefingForAgent, formatExternalDataForAgent, extractWebResearchContext } = await import('../utils/agent-context-formatter.js');
      
      // Extract web research context (CRITICAL: Provides comprehensive external research)
      const webResearchContext = extractWebResearchContext(state.agentSignals);
      if (webResearchContext) {
        console.log(`[${agentName}] Including web research context (${webResearchContext.length} chars)`);
      }
      
      const marketContext = formatMarketBriefingForAgent(state.mbd, webResearchContext);
      const externalDataContext = state.externalData 
        ? formatExternalDataForAgent(state.externalData)
        : '';
      const keywordsContext = state.marketKeywords
        ? JSON.stringify(state.marketKeywords, null, 2)
        : 'None';

      const input = {
        messages: [
          {
            role: 'user',
            content: `Analyze the following prediction market and provide your ${agentType.replace('_', ' ')} signal.

MARKET DATA:
${marketContext}

${externalDataContext ? `EXTERNAL DATA:\n${externalDataContext}\n` : ''}KEYWORDS:
${keywordsContext}

Use the available tools to gather additional news data as needed, then provide your structured analysis.`,
          },
        ],
      };

      // Step 8: Execute agent with timeout (Requirements 6.6, 7.6, 8.6, 17.1, 17.2, 17.3)
      const timeoutMs = 45000; // 45 seconds
      const maxToolCalls = 5; // Limit tool calls

      // Execute agent with timeout using Promise.race
      // If timeout occurs, we'll catch it and return partial results
      let result: any;

      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
        });

        const agentPromise = agent.invoke(input, {
          recursionLimit: maxToolCalls + 10, // Allow some extra for agent reasoning
        });

        result = await Promise.race([agentPromise, timeoutPromise]);
      } catch (error) {
        // Check if this is a timeout error
        if (error instanceof Error && error.message === 'TIMEOUT') {
          // Log timeout warning (Requirement 17.3)
          console.warn(`[${agentName}] Agent execution timeout after ${timeoutMs}ms`);
          console.warn(`[${agentName}] Returning partial results with reduced confidence`);

          // Return partial results with timeout indication (Requirement 17.2)
          const toolUsageSummary = getNewsToolUsageSummary(toolAuditLog);
          const cacheStats = cache.getStats();
          const totalDuration = Date.now() - startTime;
          const llmTime = totalDuration - toolUsageSummary.totalToolTime;

          // Create a partial signal with reduced confidence
          const partialSignal: AgentSignal = {
            agentName,
            timestamp: Date.now(),
            confidence: 0.3, // Low confidence due to timeout
            direction: 'NEUTRAL',
            fairProbability: state.mbd.currentProbability || 0.5,
            keyDrivers: [
              'Analysis incomplete due to timeout',
              `Executed ${toolUsageSummary.toolsCalled} tool calls before timeout`,
              'Returning neutral signal with low confidence',
            ],
            riskFactors: [
              'Agent execution timeout - analysis incomplete',
              'Insufficient time to gather comprehensive news data',
              'Results may not reflect full market context',
            ],
            metadata: {
              timeout: true,
              timeoutMs,
              toolUsage: {
                toolsCalled: toolUsageSummary.toolsCalled,
                totalToolTime: toolUsageSummary.totalToolTime,
                cacheHits: cacheStats.hits,
                cacheMisses: cacheStats.misses,
                toolBreakdown: toolUsageSummary.toolBreakdown,
              },
            },
          };

          return {
            agentSignals: [partialSignal],
            auditLog: [
              {
                stage: `agent_${agentName}`,
                timestamp: Date.now(),
                data: {
                  agentName,
                  success: false,
                  timeout: true,
                  timeoutMs,
                  direction: partialSignal.direction,
                  confidence: partialSignal.confidence,
                  fairProbability: partialSignal.fairProbability,
                  
                  // Tool usage summary (Requirements 19.5, 19.6)
                  toolsCalled: toolUsageSummary.toolsCalled,
                  totalToolTime: toolUsageSummary.totalToolTime,
                  llmTime, // Separate LLM time from tool time (Requirement 17.6)
                  totalDuration,
                  
                  // Cache statistics (Requirements 16.6, 19.4)
                  cacheHits: cacheStats.hits,
                  cacheMisses: cacheStats.misses,
                  cacheHitRate: cacheStats.hits + cacheStats.misses > 0 
                    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)).toFixed(2)
                    : '0.00',
                  
                  // Tool breakdown (Requirement 19.5)
                  toolBreakdown: toolUsageSummary.toolBreakdown,
                  totalArticles: toolUsageSummary.totalArticles,
                  errors: toolUsageSummary.errors,
                  
                  // Detailed tool audit trail (Requirements 19.1, 19.2, 19.3, 19.4)
                  toolAudit: toolAuditLog,
                  warning: 'Agent execution timeout - returned partial results',
                },
              },
            ],
          };
        }
        
        // If it's not a timeout error, re-throw it
        throw error;
      }

      // Step 9: Parse agent output into AgentSignal (Requirement 6.7, 7.7, 8.7)
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

      // Step 10: Add tool usage metadata to signal (Requirement 6.8, 7.8, 8.8)
      const toolUsageSummary = getNewsToolUsageSummary(toolAuditLog);
      const cacheStats = cache.getStats();

      signal.metadata.toolUsage = {
        toolsCalled: toolUsageSummary.toolsCalled,
        totalToolTime: toolUsageSummary.totalToolTime,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
        toolBreakdown: toolUsageSummary.toolBreakdown,
      };

      // Step 10.5: Implement graceful degradation (Requirements 15.2, 15.4, 15.5, 15.6)
      // Check for tool failures and adjust confidence/riskFactors accordingly
      const toolFailures = toolAuditLog.filter(entry => entry.error);
      const toolFailureCount = toolFailures.length;
      const totalToolCalls = toolAuditLog.length;

      if (toolFailureCount > 0) {
        // Calculate failure rate
        const failureRate = totalToolCalls > 0 ? toolFailureCount / totalToolCalls : 0;

        // Adjust confidence downward based on tool failures (Requirement 15.4)
        // Reduce confidence by 10% for each failed tool, up to 50% reduction
        const confidenceReduction = Math.min(0.5, toolFailureCount * 0.1);
        const originalConfidence = signal.confidence;
        signal.confidence = Math.max(0.1, signal.confidence * (1 - confidenceReduction));

        console.warn(`[${agentName}] ${toolFailureCount} tool failure(s) detected`);
        console.warn(`[${agentName}] Adjusted confidence from ${originalConfidence.toFixed(2)} to ${signal.confidence.toFixed(2)}`);

        // Include tool failure information in riskFactors (Requirement 15.5)
        const toolFailureRisks = [
          `${toolFailureCount} of ${totalToolCalls} tool calls failed (${(failureRate * 100).toFixed(0)}% failure rate)`,
          'Analysis may be incomplete due to tool failures',
          'Confidence adjusted downward to reflect data limitations',
        ];

        // Add specific tool failure details
        toolFailures.forEach(failure => {
          toolFailureRisks.push(`${failure.toolName} failed: ${failure.error || 'Unknown error'}`);
        });

        // Prepend tool failure risks to existing riskFactors
        signal.riskFactors = [...toolFailureRisks, ...signal.riskFactors];

        // Add tool failure metadata
        signal.metadata.toolFailures = {
          count: toolFailureCount,
          rate: failureRate,
          failures: toolFailures.map(f => ({
            toolName: f.toolName,
            error: f.error,
            timestamp: f.timestamp,
          })),
          confidenceAdjustment: confidenceReduction,
        };
      }

      // Step 11: Return agent signal and comprehensive audit log
      // Requirements: 19.5, 19.6 - Include tool usage summary in audit log
      const totalDuration = Date.now() - startTime;
      const llmTime = totalDuration - toolUsageSummary.totalToolTime;

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
              
              // Tool usage summary (Requirements 19.5, 19.6)
              toolsCalled: toolUsageSummary.toolsCalled,
              totalToolTime: toolUsageSummary.totalToolTime,
              llmTime, // Separate LLM time from tool time
              totalDuration,
              
              // Cache statistics (Requirements 16.6, 19.4)
              cacheHits: cacheStats.hits,
              cacheMisses: cacheStats.misses,
              cacheHitRate: cacheStats.hits + cacheStats.misses > 0 
                ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)).toFixed(2)
                : '0.00',
              
              // Tool breakdown (Requirement 19.5)
              toolBreakdown: toolUsageSummary.toolBreakdown,
              totalArticles: toolUsageSummary.totalArticles,
              errors: toolUsageSummary.errors,
              
              // Detailed tool audit trail (Requirements 19.1, 19.2, 19.3, 19.4)
              toolAudit: toolAuditLog,
            },
          },
        ],
      };
    } catch (error) {
      // Handle all errors gracefully (Requirements 15.2, 15.6)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout');
      const isCriticalFailure = !isTimeout; // Non-timeout errors are critical

      console.error(`[${agentName}] Error during execution:`, errorMessage);

      // Get tool usage summary for error reporting
      const toolUsageSummary = getNewsToolUsageSummary(toolAuditLog);
      const cacheStats = cache ? cache.getStats() : { hits: 0, misses: 0 };
      const totalDuration = Date.now() - startTime;
      const llmTime = totalDuration - toolUsageSummary.totalToolTime;

      // Check if we should fall back to basic mode (Requirement 15.2)
      const shouldFallback = isCriticalFailure && config.newsAgents?.[`${agentType}Agent` as keyof typeof config.newsAgents]?.fallbackToBasic;

      if (shouldFallback) {
        console.warn(`[${agentName}] Critical failure detected, attempting fallback to basic mode`);
        
        // Note: The actual fallback to basic agent is handled at the workflow level
        // by checking the autonomous flag. Here we just report the failure and
        // let the workflow decide whether to use the basic agent on retry.
        
        // Return error with fallback suggestion
        return {
          agentErrors: [
            {
              type: 'EXECUTION_FAILED',
              agentName,
              error: error instanceof Error ? error : new Error(errorMessage),
              fallbackRecommended: true,
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
                errorContext: isCriticalFailure ? 'Critical agent execution failure' : 'Agent execution timeout',
                fallbackRecommended: true,
                
                // Tool usage summary (Requirements 19.5, 19.6)
                toolsCalled: toolUsageSummary.toolsCalled,
                totalToolTime: toolUsageSummary.totalToolTime,
                llmTime, // Separate LLM time from tool time (Requirement 17.6)
                totalDuration,
                
                // Cache statistics (Requirements 16.6, 19.4)
                cacheHits: cacheStats.hits,
                cacheMisses: cacheStats.misses,
                cacheHitRate: cacheStats.hits + cacheStats.misses > 0 
                  ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)).toFixed(2)
                  : '0.00',
                
                // Tool breakdown (Requirement 19.5)
                toolBreakdown: toolUsageSummary.toolBreakdown,
                totalArticles: toolUsageSummary.totalArticles,
                errors: toolUsageSummary.errors,
                
                // Detailed tool audit trail (Requirements 19.1, 19.2, 19.3, 19.4)
                toolAudit: toolAuditLog,
              },
            },
          ],
        };
      }

      // Log error to audit trail without fallback
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
              
              // Tool usage summary (Requirements 19.5, 19.6)
              toolsCalled: toolUsageSummary.toolsCalled,
              totalToolTime: toolUsageSummary.totalToolTime,
              llmTime, // Separate LLM time from tool time (Requirement 17.6)
              totalDuration,
              
              // Cache statistics (Requirements 16.6, 19.4)
              cacheHits: cacheStats.hits,
              cacheMisses: cacheStats.misses,
              cacheHitRate: cacheStats.hits + cacheStats.misses > 0 
                ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)).toFixed(2)
                : '0.00',
              
              // Tool breakdown (Requirement 19.5)
              toolBreakdown: toolUsageSummary.toolBreakdown,
              totalArticles: toolUsageSummary.totalArticles,
              errors: toolUsageSummary.errors,
              
              // Detailed tool audit trail (Requirements 19.1, 19.2, 19.3, 19.4)
              toolAudit: toolAuditLog,
            },
          },
        ],
      };
    }
  };
}

// ============================================================================
// Exported Agent Node Functions
// ============================================================================

/**
 * Create the autonomous breaking news agent node
 *
 * Requirements: 6.1, 6.2, 6.3, 6.6, 6.7, 6.8
 *
 * @param config - Engine configuration
 * @returns LangGraph node function
 */
export function createAutonomousBreakingNewsAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return createAutonomousNewsAgentNode('breaking_news', config);
}

/**
 * Create the autonomous media sentiment agent node
 *
 * Requirements: 7.1, 7.2, 7.3, 7.6, 7.7, 7.8
 *
 * @param config - Engine configuration
 * @returns LangGraph node function
 */
export function createAutonomousMediaSentimentAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return createAutonomousNewsAgentNode('media_sentiment', config);
}

/**
 * Create the autonomous market microstructure agent node
 *
 * Requirements: 8.1, 8.2, 8.3, 8.6, 8.7, 8.8
 *
 * @param config - Engine configuration
 * @returns LangGraph node function
 */
export function createAutonomousMarketMicrostructureAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return createAutonomousNewsAgentNode('market_microstructure', config);
}
