/**
 * Agent News Tools Configuration
 * 
 * Configures agents to use NewsData.io tools directly for enhanced
 * news fetching capabilities. Provides tool registration and
 * configuration for the agent framework.
 */

import type { EngineConfig } from '../config/index.js';
import type { NewsDataClient } from './newsdata-client.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';
import { 
  createNewsToolsManager,
  type NewsToolsManager,
  type BaseNewsTool,
  type LatestNewsToolParams,
  type ArchiveNewsToolParams,
  type CryptoNewsToolParams,
  type MarketNewsToolParams
} from './newsdata-agent-tools.js';

// ============================================================================
// Agent Tool Configuration
// ============================================================================

export interface AgentNewsToolsConfig {
  // Global configuration
  enabled: boolean;
  
  // Tool availability per agent
  agentToolAccess: {
    [agentName: string]: {
      allowedTools: string[];
      defaultParams: Record<string, any>;
      maxRequestsPerHour: number;
    };
  };
  
  // Default configuration for agents not explicitly configured
  defaultAccess: {
    allowedTools: string[];
    defaultParams: Record<string, any>;
    maxRequestsPerHour: number;
  };
}

// ============================================================================
// Agent News Tools Manager
// ============================================================================

/**
 * Manages news tools for agents with access control and configuration
 */
export class AgentNewsToolsManager {
  private newsToolsManager: NewsToolsManager;
  private config: AgentNewsToolsConfig;
  private logger?: AdvancedObservabilityLogger;
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(
    newsDataClient: NewsDataClient,
    config: AgentNewsToolsConfig,
    logger?: AdvancedObservabilityLogger
  ) {
    this.newsToolsManager = createNewsToolsManager(newsDataClient, logger);
    this.config = config;
    this.logger = logger;
    
    // Log initialization if logger is available
    if (this.logger) {
      console.info('[AgentNewsTools] Manager initialized', {
        agentCount: Object.keys(config.agentToolAccess).length,
        defaultMaxRequests: config.defaultAccess.maxRequestsPerHour,
      });
    }
  }

  /**
   * Get available tools for a specific agent
   */
  getAvailableToolsForAgent(agentName: string): BaseNewsTool[] {
    if (!this.config.enabled) {
      return [];
    }

    const agentConfig = this.config.agentToolAccess[agentName] || this.config.defaultAccess;
    const allTools = this.newsToolsManager.getAllTools();
    
    return allTools.filter(tool => agentConfig.allowedTools.includes(tool.name));
  }

  /**
   * Execute a news tool for an agent with access control
   */
  async executeToolForAgent(
    agentName: string,
    toolName: string,
    params: any
  ): Promise<any> {
    if (!this.config.enabled) {
      throw new Error('Agent news tools are disabled');
    }

    // Check if agent has access to this tool
    const agentConfig = this.config.agentToolAccess[agentName] || this.config.defaultAccess;
    if (!agentConfig.allowedTools.includes(toolName)) {
      throw new Error(`Agent ${agentName} does not have access to tool ${toolName}`);
    }

    // Check rate limiting
    if (!this.checkRateLimit(agentName)) {
      throw new Error(`Agent ${agentName} has exceeded rate limit for news tools`);
    }

    // Apply default parameters
    const enhancedParams = { ...agentConfig.defaultParams, ...params };

    // Execute the tool
    try {
      this.incrementRequestCount(agentName);
      
      const result = await this.newsToolsManager.executeTool(toolName, enhancedParams, agentName);
      
      console.info('[AgentNewsTools] Tool executed successfully', {
        agentName,
        toolName,
        resultCount: Array.isArray(result) ? result.length : 1,
      });
      
      return result;
      
    } catch (error) {
      console.error('[AgentNewsTools] Tool execution failed', {
        agentName,
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }

  /**
   * Get tool configuration for an agent
   */
  getToolConfigForAgent(agentName: string, toolName: string): any {
    const agentConfig = this.config.agentToolAccess[agentName] || this.config.defaultAccess;
    
    if (!agentConfig.allowedTools.includes(toolName)) {
      return null;
    }

    const tool = this.newsToolsManager.getTool(toolName);
    if (!tool) {
      return null;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      defaultParams: agentConfig.defaultParams,
    };
  }

  /**
   * Check if agent can make more requests
   */
  private checkRateLimit(agentName: string): boolean {
    const now = Date.now();
    
    const agentConfig = this.config.agentToolAccess[agentName] || this.config.defaultAccess;
    const maxRequests = agentConfig.maxRequestsPerHour;
    
    const requestData = this.requestCounts.get(agentName);
    
    if (!requestData) {
      return true; // No previous requests
    }
    
    // Reset count if hour has passed
    if (now >= requestData.resetTime) {
      this.requestCounts.delete(agentName);
      return true;
    }
    
    return requestData.count < maxRequests;
  }

  /**
   * Increment request count for agent
   */
  private incrementRequestCount(agentName: string): void {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    
    const requestData = this.requestCounts.get(agentName);
    
    if (!requestData || now >= requestData.resetTime) {
      // First request or reset time reached
      this.requestCounts.set(agentName, {
        count: 1,
        resetTime: now + hourMs,
      });
    } else {
      // Increment existing count
      requestData.count++;
    }
  }

  /**
   * Get request statistics for an agent
   */
  getRequestStats(agentName: string): { count: number; limit: number; resetTime: number } | null {
    const agentConfig = this.config.agentToolAccess[agentName] || this.config.defaultAccess;
    const requestData = this.requestCounts.get(agentName);
    
    if (!requestData) {
      return {
        count: 0,
        limit: agentConfig.maxRequestsPerHour,
        resetTime: Date.now() + (60 * 60 * 1000),
      };
    }
    
    return {
      count: requestData.count,
      limit: agentConfig.maxRequestsPerHour,
      resetTime: requestData.resetTime,
    };
  }
}

// ============================================================================
// Configuration Factory
// ============================================================================

/**
 * Create default agent news tools configuration
 */
export function createDefaultAgentNewsToolsConfig(): AgentNewsToolsConfig {
  return {
    enabled: process.env.NEWSDATA_INTEGRATION_ENABLED === 'true',
    
    agentToolAccess: {
      // Event Intelligence agents
      'breaking_news_agent': {
        allowedTools: ['fetchLatestNews'],
        defaultParams: {
          categories: ['politics', 'business', 'world'],
          size: 10, // Reduced for free tier
          removeDuplicates: true,
        },
        maxRequestsPerHour: 10,
      },
      
      'event_impact_agent': {
        allowedTools: ['fetchLatestNews', 'fetchArchiveNews'],
        defaultParams: {
          categories: ['politics', 'business', 'world'],
          size: 10, // Reduced for free tier
          removeDuplicates: true,
        },
        maxRequestsPerHour: 8,
      },
      
      // Sentiment & Narrative agents
      'media_sentiment_agent': {
        allowedTools: ['fetchLatestNews'],
        defaultParams: {
          size: 10, // Reduced for free tier
          removeDuplicates: true,
        },
        maxRequestsPerHour: 15,
      },
      
      'social_sentiment_agent': {
        allowedTools: ['fetchLatestNews'],
        defaultParams: {
          size: 10, // Reduced for free tier
          removeDuplicates: true,
        },
        maxRequestsPerHour: 12,
      },
      
      'narrative_velocity_agent': {
        allowedTools: ['fetchLatestNews'],
        defaultParams: {
          size: 10, // Reduced for free tier
          removeDuplicates: true,
        },
        maxRequestsPerHour: 20,
      },
      
      // Market-specific agents
      'market_microstructure_agent': {
        allowedTools: ['fetchMarketNews', 'fetchLatestNews'],
        defaultParams: {
          categories: ['business'],
          size: 10, // Reduced size for free tier
          removeDuplicates: true,
        },
        maxRequestsPerHour: 6,
      },
      
      // Crypto-related agents (if any)
      'crypto_analysis_agent': {
        allowedTools: ['fetchCryptoNews', 'fetchLatestNews'],
        defaultParams: {
          size: 10, // Reduced for free tier
          removeDuplicates: true,
        },
        maxRequestsPerHour: 10,
      },
    },
    
    defaultAccess: {
      allowedTools: ['fetchLatestNews'],
      defaultParams: {
        size: 10,
        removeDuplicates: true,
        sort: 'relevancy',
      },
      maxRequestsPerHour: 5,
    },
  };
}

/**
 * Create agent news tools manager from engine configuration
 */
export function createAgentNewsToolsManagerFromConfig(
  engineConfig: EngineConfig,
  newsDataClient: NewsDataClient,
  logger?: AdvancedObservabilityLogger
): AgentNewsToolsManager {
  const config = createDefaultAgentNewsToolsConfig();
  
  // Override configuration from engine config if available
  if (engineConfig.newsData?.agentTools) {
    Object.assign(config, engineConfig.newsData.agentTools);
  }
  
  return new AgentNewsToolsManager(newsDataClient, config, logger);
}

// ============================================================================
// Agent Integration Helpers
// ============================================================================

/**
 * Create news tool functions for agent use
 */
export function createAgentNewsToolFunctions(
  agentName: string,
  toolsManager: AgentNewsToolsManager
) {
  return {
    /**
     * Fetch latest news with agent-specific configuration
     */
    async fetchLatestNews(params: Partial<LatestNewsToolParams> = {}) {
      return await toolsManager.executeToolForAgent(agentName, 'fetchLatestNews', params);
    },
    
    /**
     * Fetch archive news with agent-specific configuration
     */
    async fetchArchiveNews(params: Partial<ArchiveNewsToolParams>) {
      return await toolsManager.executeToolForAgent(agentName, 'fetchArchiveNews', params);
    },
    
    /**
     * Fetch crypto news with agent-specific configuration
     */
    async fetchCryptoNews(params: Partial<CryptoNewsToolParams> = {}) {
      return await toolsManager.executeToolForAgent(agentName, 'fetchCryptoNews', params);
    },
    
    /**
     * Fetch market news with agent-specific configuration
     */
    async fetchMarketNews(params: Partial<MarketNewsToolParams> = {}) {
      return await toolsManager.executeToolForAgent(agentName, 'fetchMarketNews', params);
    },
    
    /**
     * Get available tools for this agent
     */
    getAvailableTools() {
      return toolsManager.getAvailableToolsForAgent(agentName);
    },
    
    /**
     * Get tool configuration
     */
    getToolConfig(toolName: string) {
      return toolsManager.getToolConfigForAgent(agentName, toolName);
    },
    
    /**
     * Get request statistics
     */
    getRequestStats() {
      return toolsManager.getRequestStats(agentName);
    },
  };
}

/**
 * Type for agent news tool functions
 */
export type AgentNewsToolFunctions = ReturnType<typeof createAgentNewsToolFunctions>;