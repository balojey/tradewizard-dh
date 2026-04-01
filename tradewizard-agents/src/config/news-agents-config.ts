/**
 * Configuration for Autonomous NewsData Agents
 * 
 * This configuration controls the behavior of three autonomous news agents:
 * - Breaking News Agent: Analyzes breaking news for immediate market impact
 * - Media Sentiment Agent: Analyzes media sentiment from news articles
 * - Market Microstructure Agent: Uses market news for microstructure analysis
 * 
 * Each agent uses LangChain's tool-calling capabilities to fetch and analyze
 * NewsData API data autonomously.
 * 
 * **Configuration Philosophy**:
 * The autonomous news agents are designed with conservative defaults that
 * prioritize reliability over advanced features. Autonomous mode is enabled
 * by default as the recommended configuration. Set environment variables to
 * false to disable autonomous mode if needed.
 * 
 * **Usage Example**:
 * ```typescript
 * import { loadNewsAgentsConfig } from './config/news-agents-config';
 * 
 * const config = loadNewsAgentsConfig();
 * 
 * if (config.breakingNewsAgent.autonomous) {
 *   console.log('Breaking News Agent: Autonomous mode enabled');
 *   console.log(`Max tool calls: ${config.breakingNewsAgent.maxToolCalls}`);
 *   console.log(`Timeout: ${config.breakingNewsAgent.timeout}ms`);
 * }
 * ```
 */

/**
 * News Agent Configuration Interface
 * 
 * Controls autonomous mode, tool usage limits, timeouts, and fallback behavior
 * for a single news agent.
 * 
 * **Configuration Strategy**:
 * - Autonomous mode is enabled by default (recommended)
 * - Set environment variables to false to disable if needed
 * - Gradually increase maxToolCalls as confidence grows
 * - Always keep fallbackToBasic=true in production for reliability
 */
export interface NewsAgentConfig {
  /**
   * Enable autonomous mode with tool-calling capabilities
   * 
   * When true, the agent can autonomously fetch news data using NewsData tools.
   * 
   * When false, the agent falls back to basic analysis using only pre-fetched
   * data from the workflow state.
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
   * Fallback to basic news agent on error
   * 
   * When true, if the autonomous agent fails or times out, the system
   * will fall back to the basic news agent using pre-fetched data.
   * 
   * When false, agent failures will be reported as errors without fallback.
   * 
   * @default true
   */
  fallbackToBasic: boolean;
}

/**
 * News Agents Configuration Interface
 * 
 * Contains configuration for all three autonomous news agents.
 */
export interface NewsAgentsConfig {
  /**
   * Breaking News Agent configuration
   * 
   * Analyzes breaking news for immediate market impact.
   * Prioritizes fetchLatestNews with short timeframes (1h, 6h).
   */
  breakingNewsAgent: NewsAgentConfig;

  /**
   * Media Sentiment Agent configuration
   * 
   * Analyzes media sentiment from news articles.
   * Makes multiple queries with different sentiment filters.
   */
  mediaSentimentAgent: NewsAgentConfig;

  /**
   * Market Microstructure Agent configuration
   * 
   * Uses market news for microstructure analysis.
   * Focuses on fetchMarketNews for financial context.
   */
  marketMicrostructureAgent: NewsAgentConfig;
}

/**
 * Default news agent configuration
 * 
 * Conservative defaults that prioritize reliability over advanced features.
 * Autonomous mode is enabled by default as the recommended configuration.
 */
export const DEFAULT_NEWS_AGENT_CONFIG: NewsAgentConfig = {
  autonomous: true,
  maxToolCalls: 5,
  timeout: 45000,
  cacheEnabled: true,
  fallbackToBasic: true,
};

/**
 * Default news agents configuration
 * 
 * All three agents use the same conservative defaults.
 */
export const DEFAULT_NEWS_AGENTS_CONFIG: NewsAgentsConfig = {
  breakingNewsAgent: { ...DEFAULT_NEWS_AGENT_CONFIG },
  mediaSentimentAgent: { ...DEFAULT_NEWS_AGENT_CONFIG },
  marketMicrostructureAgent: { ...DEFAULT_NEWS_AGENT_CONFIG },
};

/**
 * Load news agent configuration from environment variables
 * 
 * Autonomous mode is enabled by default. Set environment variables to 'false'
 * to disable autonomous mode for specific agents.
 * 
 * Environment variables for Breaking News Agent:
 * - BREAKING_NEWS_AGENT_AUTONOMOUS: Enable autonomous mode (default: true, set to 'false' to disable)
 * - BREAKING_NEWS_AGENT_MAX_TOOL_CALLS: Maximum tool calls per analysis
 * - BREAKING_NEWS_AGENT_TIMEOUT: Timeout in milliseconds
 * - BREAKING_NEWS_AGENT_CACHE_ENABLED: Enable tool result caching (true/false)
 * - BREAKING_NEWS_AGENT_FALLBACK_TO_BASIC: Enable fallback to basic agent (true/false)
 * 
 * Environment variables for Media Sentiment Agent:
 * - MEDIA_SENTIMENT_AGENT_AUTONOMOUS: Enable autonomous mode (default: true, set to 'false' to disable)
 * - MEDIA_SENTIMENT_AGENT_MAX_TOOL_CALLS: Maximum tool calls per analysis
 * - MEDIA_SENTIMENT_AGENT_TIMEOUT: Timeout in milliseconds
 * - MEDIA_SENTIMENT_AGENT_CACHE_ENABLED: Enable tool result caching (true/false)
 * - MEDIA_SENTIMENT_AGENT_FALLBACK_TO_BASIC: Enable fallback to basic agent (true/false)
 * 
 * Environment variables for Market Microstructure Agent:
 * - MARKET_MICROSTRUCTURE_AGENT_AUTONOMOUS: Enable autonomous mode (default: true, set to 'false' to disable)
 * - MARKET_MICROSTRUCTURE_AGENT_MAX_TOOL_CALLS: Maximum tool calls per analysis
 * - MARKET_MICROSTRUCTURE_AGENT_TIMEOUT: Timeout in milliseconds
 * - MARKET_MICROSTRUCTURE_AGENT_CACHE_ENABLED: Enable tool result caching (true/false)
 * - MARKET_MICROSTRUCTURE_AGENT_FALLBACK_TO_BASIC: Enable fallback to basic agent (true/false)
 * 
 * @returns News agents configuration
 */
export function loadNewsAgentsConfig(): NewsAgentsConfig {
  // Warn if autonomous mode is explicitly disabled for any agent
  if (process.env.BREAKING_NEWS_AGENT_AUTONOMOUS === 'false') {
    console.warn(
      '[Breaking News Agent] Autonomous mode has been explicitly disabled via BREAKING_NEWS_AGENT_AUTONOMOUS=false. ' +
      'Autonomous mode is the recommended default for optimal agent performance. ' +
      'The agent will fall back to basic news analysis using only pre-fetched data.'
    );
  }
  
  if (process.env.MEDIA_SENTIMENT_AGENT_AUTONOMOUS === 'false') {
    console.warn(
      '[Media Sentiment Agent] Autonomous mode has been explicitly disabled via MEDIA_SENTIMENT_AGENT_AUTONOMOUS=false. ' +
      'Autonomous mode is the recommended default for optimal agent performance. ' +
      'The agent will fall back to basic sentiment analysis using only pre-fetched data.'
    );
  }
  
  if (process.env.MARKET_MICROSTRUCTURE_AGENT_AUTONOMOUS === 'false') {
    console.warn(
      '[Market Microstructure Agent] Autonomous mode has been explicitly disabled via MARKET_MICROSTRUCTURE_AGENT_AUTONOMOUS=false. ' +
      'Autonomous mode is the recommended default for optimal agent performance. ' +
      'The agent will fall back to basic microstructure analysis using only pre-fetched data.'
    );
  }
  
  return {
    breakingNewsAgent: {
      autonomous: process.env.BREAKING_NEWS_AGENT_AUTONOMOUS !== 'false',
      maxToolCalls: parseInt(process.env.BREAKING_NEWS_AGENT_MAX_TOOL_CALLS || '5', 10),
      timeout: parseInt(process.env.BREAKING_NEWS_AGENT_TIMEOUT || '45000', 10),
      cacheEnabled: process.env.BREAKING_NEWS_AGENT_CACHE_ENABLED !== 'false',
      fallbackToBasic: process.env.BREAKING_NEWS_AGENT_FALLBACK_TO_BASIC !== 'false',
    },
    mediaSentimentAgent: {
      autonomous: process.env.MEDIA_SENTIMENT_AGENT_AUTONOMOUS !== 'false',
      maxToolCalls: parseInt(process.env.MEDIA_SENTIMENT_AGENT_MAX_TOOL_CALLS || '5', 10),
      timeout: parseInt(process.env.MEDIA_SENTIMENT_AGENT_TIMEOUT || '45000', 10),
      cacheEnabled: process.env.MEDIA_SENTIMENT_AGENT_CACHE_ENABLED !== 'false',
      fallbackToBasic: process.env.MEDIA_SENTIMENT_AGENT_FALLBACK_TO_BASIC !== 'false',
    },
    marketMicrostructureAgent: {
      autonomous: process.env.MARKET_MICROSTRUCTURE_AGENT_AUTONOMOUS !== 'false',
      maxToolCalls: parseInt(process.env.MARKET_MICROSTRUCTURE_AGENT_MAX_TOOL_CALLS || '5', 10),
      timeout: parseInt(process.env.MARKET_MICROSTRUCTURE_AGENT_TIMEOUT || '45000', 10),
      cacheEnabled: process.env.MARKET_MICROSTRUCTURE_AGENT_CACHE_ENABLED !== 'false',
      fallbackToBasic: process.env.MARKET_MICROSTRUCTURE_AGENT_FALLBACK_TO_BASIC !== 'false',
    },
  };
}

/**
 * Validate news agents configuration
 * 
 * Checks that configuration values are within acceptable ranges and
 * that autonomous mode dependencies are satisfied.
 * 
 * @param config - News agents configuration to validate
 * @returns Validation result with any errors
 */
export function validateNewsAgentsConfig(config: NewsAgentsConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate Breaking News Agent
  if (config.breakingNewsAgent.maxToolCalls < 1 || config.breakingNewsAgent.maxToolCalls > 20) {
    errors.push('Breaking News Agent: maxToolCalls must be between 1 and 20');
  }
  if (config.breakingNewsAgent.timeout < 1000 || config.breakingNewsAgent.timeout > 120000) {
    errors.push('Breaking News Agent: timeout must be between 1000ms and 120000ms');
  }

  // Validate Media Sentiment Agent
  if (config.mediaSentimentAgent.maxToolCalls < 1 || config.mediaSentimentAgent.maxToolCalls > 20) {
    errors.push('Media Sentiment Agent: maxToolCalls must be between 1 and 20');
  }
  if (config.mediaSentimentAgent.timeout < 1000 || config.mediaSentimentAgent.timeout > 120000) {
    errors.push('Media Sentiment Agent: timeout must be between 1000ms and 120000ms');
  }

  // Validate Market Microstructure Agent
  if (config.marketMicrostructureAgent.maxToolCalls < 1 || config.marketMicrostructureAgent.maxToolCalls > 20) {
    errors.push('Market Microstructure Agent: maxToolCalls must be between 1 and 20');
  }
  if (config.marketMicrostructureAgent.timeout < 1000 || config.marketMicrostructureAgent.timeout > 120000) {
    errors.push('Market Microstructure Agent: timeout must be between 1000ms and 120000ms');
  }

  return { valid: errors.length === 0, errors };
}
