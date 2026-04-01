/**
 * Configuration for the Autonomous Polling Agent
 * 
 * This configuration controls the behavior of the autonomous polling agent,
 * which uses LangChain's tool-calling capabilities to fetch and analyze
 * Polymarket data autonomously.
 * 
 * **Configuration Philosophy**:
 * The autonomous polling agent is designed with autonomous mode enabled by
 * default, providing the most capable agent implementation out of the box.
 * Autonomous mode can be explicitly disabled via environment variables if needed.
 * 
 * **Usage Example**:
 * ```typescript
 * import { loadPollingAgentConfig } from './config/polling-agent-config';
 * 
 * const config = loadPollingAgentConfig();
 * 
 * if (config.autonomous) {
 *   console.log('Autonomous mode enabled');
 *   console.log(`Max tool calls: ${config.maxToolCalls}`);
 *   console.log(`Timeout: ${config.timeout}ms`);
 * }
 * ```
 */

/**
 * Polling Agent Configuration Interface
 * 
 * Controls autonomous mode, tool usage limits, timeouts, and fallback behavior.
 * 
 * **Configuration Strategy**:
 * - Autonomous mode is enabled by default (recommended)
 * - Set POLLING_AGENT_AUTONOMOUS=false to disable if needed
 * - Adjust maxToolCalls based on latency requirements
 * - Keep fallbackToBasic=true in production for reliability
 */
export interface PollingAgentConfig {
  /**
   * Enable autonomous mode with tool-calling capabilities
   * 
   * When true, the polling agent can autonomously fetch related markets,
   * historical prices, cross-market data, and perform momentum analysis.
   * 
   * When false, the agent falls back to basic polling analysis using
   * only pre-fetched data from the workflow state.
   * 
   * @default true
   */
  autonomous: boolean;

  /**
   * Maximum number of tool calls per analysis
   * 
   * Limits the number of tools the agent can invoke to control latency
   * and API usage. The agent will prioritize essential tools when
   * approaching this limit.
   * 
   * @default 5
   */
  maxToolCalls: number;

  /**
   * Timeout for agent execution in milliseconds
   * 
   * The autonomous agent has a longer timeout than the basic agent
   * (45 seconds vs 30 seconds) to account for tool execution time.
   * 
   * @default 45000 (45 seconds)
   */
  timeout: number;

  /**
   * Enable tool result caching
   * 
   * When true, tool results are cached within an analysis session
   * to avoid redundant API calls for the same data.
   * 
   * @default true
   */
  cacheEnabled: boolean;

  /**
   * Fallback to basic polling agent on error
   * 
   * When true, if the autonomous agent fails or times out, the system
   * will fall back to the basic polling agent using pre-fetched data.
   * 
   * When false, agent failures will be reported as errors without fallback.
   * 
   * @default true
   */
  fallbackToBasic: boolean;
}

/**
 * Default polling agent configuration
 * 
 * Autonomous mode is enabled by default, providing the most capable
 * agent implementation. Set POLLING_AGENT_AUTONOMOUS=false to disable.
 */
export const DEFAULT_POLLING_AGENT_CONFIG: PollingAgentConfig = {
  autonomous: true,
  maxToolCalls: 5,
  timeout: 45000,
  cacheEnabled: true,
  fallbackToBasic: true,
};

/**
 * Load polling agent configuration from environment variables
 * 
 * Environment variables:
 * - POLLING_AGENT_AUTONOMOUS: Disable autonomous mode by setting to 'false' (default: true)
 * - POLLING_AGENT_MAX_TOOL_CALLS: Maximum tool calls per analysis
 * - POLLING_AGENT_TIMEOUT: Timeout in milliseconds
 * - POLLING_AGENT_CACHE_ENABLED: Enable tool result caching (true/false)
 * - POLLING_AGENT_FALLBACK_TO_BASIC: Enable fallback to basic agent (true/false)
 * 
 * Autonomous mode is enabled by default. Set POLLING_AGENT_AUTONOMOUS=false to disable.
 * 
 * @returns Polling agent configuration
 */
export function loadPollingAgentConfig(): PollingAgentConfig {
  const autonomous = process.env.POLLING_AGENT_AUTONOMOUS !== 'false';
  
  // Warn if autonomous mode is explicitly disabled
  if (process.env.POLLING_AGENT_AUTONOMOUS === 'false') {
    console.warn(
      '[Polling Agent] Autonomous mode has been explicitly disabled via POLLING_AGENT_AUTONOMOUS=false. ' +
      'Autonomous mode is the recommended default for optimal agent performance. ' +
      'The agent will fall back to basic polling analysis using only pre-fetched data.'
    );
  }
  
  return {
    autonomous,
    maxToolCalls: parseInt(process.env.POLLING_AGENT_MAX_TOOL_CALLS || '5', 10),
    timeout: parseInt(process.env.POLLING_AGENT_TIMEOUT || '45000', 10),
    cacheEnabled: process.env.POLLING_AGENT_CACHE_ENABLED !== 'false',
    fallbackToBasic: process.env.POLLING_AGENT_FALLBACK_TO_BASIC !== 'false',
  };
}
