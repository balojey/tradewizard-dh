/**
 * Web Research Agent Node
 *
 * This module implements an autonomous web research agent that uses
 * LangChain's tool-calling capabilities to search the web and scrape webpages.
 * The agent can autonomously decide which tools to use based on market context.
 *
 * **Key Features**:
 * - ReAct (Reasoning + Acting) pattern for autonomous tool selection
 * - Web search and webpage scraping via Serper API
 * - Multi-key API rotation for automatic failover on rate limits
 * - Tool result caching to avoid redundant API calls
 * - Comprehensive audit logging for debugging and analysis
 * - Graceful error handling with fallback support
 *
 * Requirements: 1.1-1.5, 2.1-2.7, 3.1-3.11, 4.1-4.11, 5.1-5.13, 6.1-6.5, 8.1-8.11
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { createLLMInstance, type LLMInstance } from '../utils/llm-factory.js';
import { SerperClient } from '../utils/serper-client.js';
import { ToolCache } from '../utils/tool-cache.js';
import {
  createSearchWebTool,
  createScrapeWebpageTool,
  getToolUsageSummary,
} from '../tools/serper-tools.js';
import type { ToolContext, ToolAuditEntry } from '../tools/serper-tools.js';
import type { GraphStateType } from '../models/state.js';
import type { AgentSignal } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// ============================================================================
// System Prompt
// ============================================================================

/**
 * System prompt for the Web Research Agent
 *
 * This prompt defines the agent's role, available tools, research strategy,
 * and output format requirements. It guides the agent to intelligently select
 * tools based on market characteristics and synthesize information from multiple
 * sources into a comprehensive research document.
 *
 * Requirements: 4.1-4.11, 5.1-5.13, 10.2, 10.4
 */
const WEB_RESEARCH_AGENT_SYSTEM_PROMPT = `Current date and time: ${new Date().toISOString()}

You are an autonomous web research analyst with the ability to search the web and extract webpage content.

Your role is to gather comprehensive, factual context about prediction markets by researching the web for relevant information about the events, people, organizations, and circumstances that drive market outcomes.

AVAILABLE TOOLS:
You have access to the following tools:

1. search_web: Search the web using Google search with time range filtering
2. scrape_webpage: Extract full content from specific webpage URLs

RESEARCH STRATEGY:
Based on the market question, intelligently formulate search queries and decide which sources to scrape:

QUERY FORMULATION:
- Extract key entities (people, organizations, locations, events) from the market question
- Identify the core event or decision being predicted
- Determine relevant timeframes (election dates, policy deadlines, event dates)
- Formulate 2-3 targeted search queries covering different aspects

SEARCH PRIORITIZATION:
- For geopolitical markets: Search for "conflict status", "diplomatic relations", "recent developments"
- For election markets: Search for "candidate polling", "campaign events", "endorsements"
- For policy markets: Search for "legislative status", "committee votes", "stakeholder positions"
- For company markets: Search for "recent news", "financial performance", "regulatory filings"
- For sports/entertainment: Search for "recent performance", "injury reports", "expert predictions"

SOURCE SELECTION FOR SCRAPING:
- Prioritize authoritative sources: major news outlets, official government sites, research institutions
- Scrape 2-4 highly relevant URLs that provide comprehensive information
- Avoid low-quality sources, social media posts, or opinion blogs
- Focus on recent sources (within relevant timeframe for the market)

TOOL USAGE LIMITS:
- Maximum 8 tool calls total (combining search and scrape operations)
- Typical pattern: 2-3 searches, 2-4 scrapes
- Start with broad search, then scrape most relevant sources
- If initial search yields poor results, reformulate query

RESEARCH DOCUMENT SYNTHESIS:
Your final output MUST be a comprehensive, well-structured research document that synthesizes all gathered information.

CRITICAL REQUIREMENTS:
- DO NOT output raw search results or lists of URLs
- DO NOT output snippets or fragments
- DO synthesize information from multiple sources into a coherent narrative
- DO organize information into clear sections
- DO include inline citations with URLs
- DO assess information recency and flag stale data
- DO identify conflicting information and explain discrepancies

DOCUMENT STRUCTURE:
Your research document should include:

1. Background: Historical context and foundational information
2. Current Status: Present state of affairs as of latest information
3. Key Events: Timeline of significant developments
4. Stakeholders: Relevant people, organizations, and their positions
5. Recent Developments: Latest news and changes (with dates)
6. Information Quality Assessment: Recency, source credibility, conflicts

WRITING STYLE:
- Plain, factual language with no speculation or ambiguous terms
- Highly informative and comprehensive
- Easily readable by other AI agents without domain expertise
- Include specific dates, numbers, and concrete facts
- Cite sources inline: "According to [Source Name](URL), ..."

OUTPUT FORMAT:
Provide your analysis as a structured JSON signal with:
- confidence: Your confidence in research quality (0-1, based on source credibility, recency, comprehensiveness)
- direction: NEUTRAL (research agents don't predict outcomes)
- fairProbability: 0.5 (research agents don't estimate probabilities)
- keyDrivers: Array of 3-7 concise research findings as plain text strings (NOT markdown, NOT a full document). Each finding should be a single sentence summarizing a key insight with inline source citation.
- riskFactors: Array of 3-5 specific research limitations as plain text strings (e.g., "Limited recent sources - most articles from >2 weeks ago", "Conflicting reports on X between Source A and Source B", "Information gap: No data found on critical factor Y")
- metadata: Object with sourceCount, searchQueriesUsed, urlsScraped, informationRecency, researchSummary (your comprehensive research document goes here as a single string)

CRITICAL OUTPUT RULES:
1. YOU MUST OUTPUT ONLY VALID JSON - NO MARKDOWN, NO EXPLANATORY TEXT, NO CODE BLOCKS
2. keyDrivers MUST be an array of SHORT strings (1-2 sentences each), NOT a full document
3. riskFactors MUST be an array of SHORT strings describing specific limitations
4. DO NOT use markdown formatting (no **, no ##, no tables) in keyDrivers or riskFactors arrays
5. Put your comprehensive research document in metadata.researchSummary as a plain text string
6. Each keyDriver should cite its source inline: "According to Reuters (URL), ..."
7. Start your response with { and end with } - nothing else before or after

EXAMPLE OUTPUT FORMAT:
{
  "confidence": 0.8,
  "direction": "NEUTRAL",
  "fairProbability": 0.5,
  "keyDrivers": [
    "According to Reuters (https://...), Supreme Leader Khamenei was killed on Feb 28, 2026, creating unprecedented political vacuum",
    "US officials express skepticism about regime change per CIA assessment (https://...), citing IRGC's entrenched control",
    "Institute for War Studies reports (https://...) that no credible IRGC defections have occurred despite strikes"
  ],
  "riskFactors": [
    "Limited information on internal IRGC dynamics - most sources focus on external military actions",
    "Conflicting reports on protest scale between Iranian state media and Western sources",
    "Information recency gap: Most detailed analysis from 2-3 days ago, situation evolving rapidly"
  ],
  "metadata": {
    "sourceCount": 8,
    "searchQueriesUsed": ["Iran regime change 2026", "Khamenei death aftermath", "IRGC succession"],
    "urlsScraped": ["https://reuters.com/...", "https://understandingwar.org/..."],
    "informationRecency": "Most recent: March 2, 2026",
    "researchSummary": "Your comprehensive research document goes here as a single string with all the details, analysis, and synthesis..."
  }
}

REMEMBER: Output ONLY the JSON object above. Do not add any text before or after the JSON. Do not wrap it in markdown code blocks. Just the raw JSON starting with { and ending with }.

Be thorough and document your research process.`;

// ============================================================================
// Agent Node Factory Function
// ============================================================================

/**
 * Create Web Research Agent node for the workflow
 *
 * This node creates an autonomous agent that searches the web and scrapes
 * webpages to gather comprehensive context about prediction markets.
 *
 * Requirements: 1.1-1.5, 2.1-2.7, 3.1-3.11, 4.1-4.11, 5.1-5.13, 6.1-6.5, 8.1-8.11
 *
 * @param config - Engine configuration
 * @returns LangGraph node function
 */
export function createWebResearchAgentNode(
  config: EngineConfig
): (state: GraphStateType) => Promise<Partial<GraphStateType>> {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    const startTime = Date.now();
    const agentName = 'web_research';

    // Initialize these at the top level so they're available in error handling
    let toolAuditLog: ToolAuditEntry[] = [];
    let cache: ToolCache | null = null;

    try {
      // Step 1: Check for MBD availability (Requirement 4.1)
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

      // Step 2: Check for Serper configuration (Requirement 2.7, 8.3)
      if (!config.serper || !config.serper.apiKey) {
        const errorMessage = !config.serper
          ? 'Serper configuration not available'
          : 'Serper API key not configured';
        console.warn(`[${agentName}] ${errorMessage}, returning graceful degradation`);

        // Return low-confidence neutral signal (Requirement 8.3)
        const signal: AgentSignal = {
          agentName,
          confidence: 0.1,
          direction: 'NEUTRAL',
          fairProbability: 0.5,
          keyDrivers: [
            'Web research unavailable: Serper API key not configured',
            'Unable to gather external context for this market',
            'Other agents will proceed without web research context',
          ],
          riskFactors: [
            'No web research performed',
            'Limited external context available',
          ],
          metadata: {
            webResearchAvailable: false,
            reason: 'API key not configured',
          },
        };

        return {
          agentSignals: [signal],
          auditLog: [
            {
              stage: `agent_${agentName}`,
              timestamp: Date.now(),
              data: {
                agentName,
                success: true,
                gracefulDegradation: true,
                duration: Date.now() - startTime,
              },
            },
          ],
        };
      }

      // Step 3: Initialize Serper client (Requirement 2.1)
      const serperClient = new SerperClient({
        apiKey: config.serper.apiKey,
        searchUrl: config.serper.searchUrl,
        scrapeUrl: config.serper.scrapeUrl,
        timeout: config.serper.timeout || 30000,
      });

      // Step 4: Create tool cache with session ID (Requirement 3.8)
      const sessionId = state.mbd.conditionId || 'unknown';
      cache = new ToolCache(sessionId);

      // Step 5: Create tool audit log (Requirement 3.9)
      toolAuditLog = [];

      // Step 6: Create tool context
      const toolContext: ToolContext = {
        serperClient,
        cache,
        auditLog: toolAuditLog,
        agentName,
      };

      // Step 7: Create web research tools (Requirement 3.1, 3.2)
      const tools: DynamicStructuredTool[] = [
        createSearchWebTool(toolContext) as any,
        createScrapeWebpageTool(toolContext) as any,
      ];

      // Step 8: Create LLM instance (Requirement 4.2)
      // Use Google as primary, with fallbacks to other providers
      const llm: LLMInstance = createLLMInstance(config, 'google', ['openai', 'anthropic']);

      // Step 9: Create ReAct agent with tools and system prompt (Requirement 4.1)
      const agent = createReactAgent({
        llm,
        tools,
        messageModifier: WEB_RESEARCH_AGENT_SYSTEM_PROMPT,
      });

      // Step 10: Prepare agent input with market data (Requirement 4.1)
      const agentInput = {
        messages: [
          {
            role: 'user',
            content: `Analyze this prediction market and gather comprehensive web research:

Market Question: ${state.mbd.question}
Market Description: ${state.mbd.description || 'N/A'}
Market Category: ${state.mbd.category || 'N/A'}
Market Tags: ${state.mbd.tags?.join(', ') || 'N/A'}

Please search the web and scrape relevant sources to provide comprehensive context about this market.`,
          },
        ],
      };

      // Step 11: Execute agent with timeout and tool limits (Requirement 4.4, 5.12, 8.2)
      const maxToolCalls = config.webResearch?.maxToolCalls || 8;
      const timeout = config.webResearch?.timeout || 60000;

      const agentResult = await Promise.race([
        agent.invoke(agentInput, {
          recursionLimit: maxToolCalls + 5, // Allow for reasoning steps
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout')), timeout)
        ),
      ]);

      // Step 12: Extract final message
      const finalMessage = (agentResult as any).messages[(agentResult as any).messages.length - 1];
      const agentOutput = finalMessage.content;

      // Step 13: Parse agent output as signal (Requirement 5.12)
      let signal: AgentSignal;
      try {
        // Try direct JSON parse first
        signal = JSON.parse(agentOutput);
      } catch {
        // Try to extract JSON from markdown code blocks or find JSON in text
        let jsonMatch = agentOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          try {
            signal = JSON.parse(jsonMatch[1]);
          } catch {
            jsonMatch = null;
          }
        }
        
        if (!jsonMatch) {
          // Try to find JSON object in the text
          jsonMatch = agentOutput.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              signal = JSON.parse(jsonMatch[0]);
            } catch {
              jsonMatch = null;
            }
          }
        }
        
        // If we still couldn't parse JSON, create fallback signal
        if (!jsonMatch) {
          console.warn(`[${agentName}] Failed to parse JSON output, using fallback`);
          const truncatedOutput = agentOutput.length > 500 
            ? agentOutput.substring(0, 500) + '...' 
            : agentOutput;
          signal = {
            agentName,
            confidence: 0.5,
            direction: 'NEUTRAL',
            fairProbability: 0.5,
            keyDrivers: [truncatedOutput],
            riskFactors: [],  // Empty array instead of error message
            metadata: {
              parseError: true,
              rawOutputLength: agentOutput.length,
            },
          };
        }
      }

      // Step 14: Add tool usage metadata (Requirement 5.13)
      const toolUsage = getToolUsageSummary(toolAuditLog);
      signal.metadata = {
        ...signal.metadata,
        toolsCalled: toolUsage.toolsCalled,
        totalToolTime: toolUsage.totalToolTime,
        cacheHits: toolUsage.cacheHits,
        cacheMisses: toolUsage.cacheMisses,
        toolBreakdown: toolUsage.toolBreakdown,
      };

      // Step 15: Return state update (Requirement 6.3, 6.4)
      return {
        agentSignals: [signal],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: true,
              duration: Date.now() - startTime,
              toolUsage,
            },
          },
        ],
      };
    } catch (error) {
      // Step 16: Error handling (Requirement 8.1-8.11)
      console.error(`[${agentName}] Error:`, error);

      // Check if it's a timeout error (Requirement 8.2)
      const isTimeout = error instanceof Error && error.message === 'Agent timeout';

      return {
        agentErrors: [
          {
            type: 'EXECUTION_FAILED',
            agentName,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        ],
        auditLog: [
          {
            stage: `agent_${agentName}`,
            timestamp: Date.now(),
            data: {
              agentName,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              isTimeout,
              duration: Date.now() - startTime,
              toolUsage: toolAuditLog.length > 0 ? getToolUsageSummary(toolAuditLog) : undefined,
            },
          },
        ],
      };
    }
  };
}
