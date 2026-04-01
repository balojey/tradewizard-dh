/**
 * Serper Tools Infrastructure
 *
 * This module provides the tool infrastructure for the Web Research Agent,
 * including search and scrape tools with caching and audit logging.
 *
 * Requirements: 3.1-3.9
 */

import { z } from 'zod';
import type { SerperClient, SerperSearchResult, SerperScrapeResponse } from '../utils/serper-client.js';
import type { ToolCache } from '../utils/tool-cache.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Tool execution context
 *
 * Provides access to shared resources needed by all tools:
 * - serperClient: For web search and scraping
 * - cache: For caching tool results within a session
 * - auditLog: For logging all tool calls
 * - agentName: Name of the agent using the tool
 */
export interface ToolContext {
  serperClient: SerperClient;
  cache: ToolCache;
  auditLog: ToolAuditEntry[];
  agentName: string;
}

/**
 * Tool audit log entry
 *
 * Records details of each tool invocation for debugging and analysis.
 */
export interface ToolAuditEntry {
  toolName: string;
  timestamp: number;
  params: any;
  result?: any;
  error?: string;
  duration: number;
  cacheHit: boolean;
  resultCount?: number;
}

/**
 * Tool error
 *
 * Structured error object returned when tool execution fails.
 */
export interface ToolError {
  error: true;
  message: string;
  toolName: string;
  code?: string;
}

// ============================================================================
// Tool Input Schemas (Zod)
// ============================================================================

/**
 * Input schema for search_web tool
 */
export const SearchWebInputSchema = z.object({
  query: z.string().describe('Search query string'),
  numResults: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe('Number of results to return (1-20)'),
  timeRange: z
    .enum(['hour', 'day', 'week', 'month', 'year', 'all'])
    .optional()
    .describe('Time range filter: hour, day, week, month, year, or all'),
});

export type SearchWebInput = z.infer<typeof SearchWebInputSchema>;

/**
 * Input schema for scrape_webpage tool
 */
export const ScrapeWebpageInputSchema = z.object({
  url: z.string().url().describe('URL to scrape'),
});

export type ScrapeWebpageInput = z.infer<typeof ScrapeWebpageInputSchema>;

// ============================================================================
// Tool Execution Wrapper
// ============================================================================

/**
 * Execute a tool with error handling, caching, and audit logging
 *
 * This wrapper provides consistent error handling, caching, and audit logging
 * for all tool executions.
 *
 * @param toolName - Name of the tool being executed
 * @param params - Tool input parameters
 * @param context - Tool execution context
 * @param executor - Tool execution function
 * @returns Tool result or error
 */
export async function executeToolWithWrapper<TInput, TOutput>(
  toolName: string,
  params: TInput,
  context: ToolContext,
  executor: (params: TInput, context: ToolContext) => Promise<TOutput>
): Promise<TOutput | ToolError> {
  const startTime = Date.now();
  let cacheHit = false;

  try {
    // Check cache first (Requirement 3.8)
    const cached = context.cache.get(toolName, params);
    if (cached !== null) {
      cacheHit = true;
      const duration = Date.now() - startTime;

      // Log cache hit to audit trail (Requirement 3.9)
      const auditEntry: ToolAuditEntry = {
        toolName,
        timestamp: Date.now(),
        params,
        result: cached,
        duration,
        cacheHit: true,
        resultCount: Array.isArray(cached) ? cached.length : undefined,
      };
      context.auditLog.push(auditEntry);

      console.debug(
        `[${context.agentName}] Tool cache HIT: ${toolName} (${duration}ms)`
      );

      return cached as TOutput;
    }

    console.debug(`[${context.agentName}] Tool cache MISS: ${toolName}`);

    // Execute tool function
    const result = await executor(params, context);

    // Cache result (Requirement 3.8)
    context.cache.set(toolName, params, result);

    // Log successful execution to audit trail (Requirement 3.9)
    const duration = Date.now() - startTime;
    const auditEntry: ToolAuditEntry = {
      toolName,
      timestamp: Date.now(),
      params,
      result,
      duration,
      cacheHit: false,
      resultCount: Array.isArray(result) ? result.length : undefined,
    };
    context.auditLog.push(auditEntry);

    console.info(
      `[${context.agentName}] Tool executed: ${toolName} (${duration}ms)`
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Create structured error
    const toolError: ToolError = {
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      toolName,
      code: error instanceof Error && 'code' in error ? (error as any).code : undefined,
    };

    // Log error to audit trail (Requirement 3.9)
    const auditEntry: ToolAuditEntry = {
      toolName,
      timestamp: Date.now(),
      params,
      error: toolError.message,
      duration,
      cacheHit,
    };
    context.auditLog.push(auditEntry);

    console.error(
      `[${context.agentName}] Tool error: ${toolName} (${duration}ms) - ${toolError.message}`,
      { code: toolError.code, params }
    );

    return toolError;
  }
}

/**
 * Type guard to check if a result is a tool error
 */
export function isToolError(result: any): result is ToolError {
  return !!(result && typeof result === 'object' && result.error === true);
}

/**
 * Validate tool input against schema
 */
export function validateToolInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(input);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return {
        success: false,
        error: `Input validation failed: ${errorMessages}`,
      };
    }
    return {
      success: false,
      error: 'Input validation failed: Unknown error',
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get tool usage summary from audit log
 */
export function getToolUsageSummary(auditLog: ToolAuditEntry[]): {
  toolsCalled: number;
  totalToolTime: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  toolBreakdown: Record<string, number>;
} {
  const toolBreakdown: Record<string, number> = {};
  let totalToolTime = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let errors = 0;

  for (const entry of auditLog) {
    toolBreakdown[entry.toolName] = (toolBreakdown[entry.toolName] || 0) + 1;
    totalToolTime += entry.duration;

    if (entry.cacheHit) {
      cacheHits++;
    } else {
      cacheMisses++;
    }

    if (entry.error) {
      errors++;
    }
  }

  return {
    toolsCalled: auditLog.length,
    totalToolTime,
    cacheHits,
    cacheMisses,
    errors,
    toolBreakdown,
  };
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * search_web Tool
 *
 * Searches the web using Google search via Serper API.
 *
 * Requirements: 3.1, 3.3, 3.5, 3.6, 3.8, 3.9
 */
export async function searchWeb(
  input: SearchWebInput,
  context: ToolContext
): Promise<SerperSearchResult[] | ToolError> {
  return executeToolWithWrapper<SearchWebInput, SerperSearchResult[]>(
    'search_web',
    input,
    context,
    async (params, ctx) => {
      // Validate input (Requirement 3.5)
      const validation = validateToolInput(SearchWebInputSchema, params);
      if (!validation.success) {
        throw new Error(validation.error);
      }

      const validatedParams = validation.data;

      // Clamp numResults to [1, 20] range (Requirement 3.5)
      const numResults = Math.max(1, Math.min(20, validatedParams.numResults || 10));

      // Transform time range to Serper format (Requirement 3.6)
      let tbs: string | undefined;
      if (validatedParams.timeRange) {
        const timeRangeMap: Record<string, string> = {
          hour: 'qdr:h',
          day: 'qdr:d',
          week: 'qdr:w',
          month: 'qdr:m',
          year: 'qdr:y',
        };
        tbs = timeRangeMap[validatedParams.timeRange];
      }

      // Call Serper API (Requirement 3.1)
      const response = await ctx.serperClient.search({
        q: validatedParams.query,
        num: numResults,
        tbs,
      });

      // Return organic results (Requirement 3.3)
      return response.organic || [];
    }
  );
}

/**
 * scrape_webpage Tool
 *
 * Extracts full content from a webpage URL using Serper scrape endpoint.
 *
 * Requirements: 3.2, 3.4, 3.7, 3.8, 3.9
 */
export async function scrapeWebpage(
  input: ScrapeWebpageInput,
  context: ToolContext
): Promise<SerperScrapeResponse | ToolError> {
  return executeToolWithWrapper<ScrapeWebpageInput, SerperScrapeResponse>(
    'scrape_webpage',
    input,
    context,
    async (params, ctx) => {
      // Validate input (Requirement 3.4)
      const validation = validateToolInput(ScrapeWebpageInputSchema, params);
      if (!validation.success) {
        throw new Error(validation.error);
      }

      const validatedParams = validation.data;

      // Call Serper scrape API (Requirement 3.2)
      try {
        const response = await ctx.serperClient.scrape({
          url: validatedParams.url,
        });

        return response;
      } catch (error) {
        // Graceful error handling for scraping failures (Requirement 3.7)
        console.warn(
          `[scrape_webpage] Failed to scrape ${validatedParams.url}: ${error instanceof Error ? error.message : String(error)}`
        );
        
        // Return partial response with error indication
        return {
          url: validatedParams.url,
          title: undefined,
          text: undefined,
          metadata: {
            error: error instanceof Error ? error.message : 'Scraping failed',
          },
        };
      }
    }
  );
}

// ============================================================================
// LangChain Tool Factories
// ============================================================================

/**
 * Create LangChain-compatible search_web tool
 *
 * Requirements: 3.1
 */
export function createSearchWebTool(context: ToolContext) {
  return {
    name: 'search_web',
    description: `Search the web for information using Google search.

Use this tool to:
- Find recent news and articles about market subjects
- Gather background information on events, people, or organizations
- Discover current developments and breaking news
- Identify authoritative sources for deeper research

Parameters:
- query: Search query string (required)
- numResults: Number of results (1-20, default: 10)
- timeRange: Filter by time - 'hour', 'day', 'week', 'month', 'year', or 'all'

Returns: Array of search results with title, link, snippet, and date.

Example usage:
- Recent news: { query: "Ukraine conflict latest", timeRange: "day" }
- Background: { query: "candidate biography policy positions" }
- Breaking news: { query: "Federal Reserve announcement", timeRange: "hour" }`,
    schema: SearchWebInputSchema,
    func: async (input: SearchWebInput) => {
      const result = await searchWeb(input, context);

      if (isToolError(result)) {
        return JSON.stringify({
          error: true,
          message: result.message,
        });
      }

      return JSON.stringify({
        success: true,
        resultCount: result.length,
        results: result,
      });
    },
  };
}

/**
 * Create LangChain-compatible scrape_webpage tool
 *
 * Requirements: 3.2
 */
export function createScrapeWebpageTool(context: ToolContext) {
  return {
    name: 'scrape_webpage',
    description: `Extract full content from a webpage URL.

Use this tool to:
- Get complete article text from news URLs
- Extract detailed information from authoritative sources
- Read full policy documents or official statements
- Gather comprehensive context from specific pages

Parameters:
- url: Full URL to scrape (required, must be valid URL)

Returns: Webpage content including title, full text, and metadata.

Example usage:
- News article: { url: "https://example.com/article" }
- Official document: { url: "https://gov.example.com/policy" }
- Research paper: { url: "https://journal.example.com/paper" }

Note: Only scrape URLs from search results or known authoritative sources.`,
    schema: ScrapeWebpageInputSchema,
    func: async (input: ScrapeWebpageInput) => {
      const result = await scrapeWebpage(input, context);

      if (isToolError(result)) {
        return JSON.stringify({
          error: true,
          message: result.message,
        });
      }

      return JSON.stringify({
        success: true,
        url: result.url,
        title: result.title,
        textLength: result.text?.length || 0,
        text: result.text,
        metadata: result.metadata,
      });
    },
  };
}
