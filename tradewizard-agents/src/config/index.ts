import { z } from 'zod';

// Export LLM configuration types and manager
export * from './llm-config.js';

// Export polling agent configuration types
export * from './polling-agent-config.js';
import { loadPollingAgentConfig } from './polling-agent-config.js';

// Export news agents configuration types
export * from './news-agents-config.js';
import { loadNewsAgentsConfig } from './news-agents-config.js';

/**
 * Configuration schema for the Market Intelligence Engine
 * 
 * The engine supports two LLM configuration modes:
 * 
 * 1. **Single-Provider Mode** (Budget-Friendly):
 *    - Set `llm.singleProvider` to 'openai', 'anthropic', or 'google'
 *    - Configure only that provider's API key and model
 *    - All agents use the same LLM instance with different system prompts
 *    - Lower cost, simpler API key management
 * 
 * 2. **Multi-Provider Mode** (Optimal Quality, Default):
 *    - Leave `llm.singleProvider` undefined
 *    - Configure multiple providers (openai, anthropic, google)
 *    - Each agent uses a different LLM optimized for its task
 *    - Diverse perspectives reduce model-specific biases
 *    - Higher cost but better quality recommendations
 */
const EngineConfigSchema = z
  .object({
    polymarket: z.object({
      gammaApiUrl: z.string().url(),
      clobApiUrl: z.string().url(),
      rateLimitBuffer: z.number().min(0).max(100),
      politicsTagId: z.number().positive().default(2),
      // Enhanced event-based configuration (optional with defaults)
      eventsApiEndpoint: z.string().default('/events'),
      includeRelatedTags: z.boolean().default(true),
      maxEventsPerDiscovery: z.number().positive().default(20),
      maxMarketsPerEvent: z.number().positive().default(50),
      defaultSortBy: z.enum(['volume24hr', 'liquidity', 'competitive', 'marketCount', 'totalVolume', 'id']).default('volume24hr'),
      enableCrossMarketAnalysis: z.boolean().default(true),
      correlationThreshold: z.number().min(0).max(1).default(0.3),
      arbitrageThreshold: z.number().min(0).max(1).default(0.05),
      eventsApiRateLimit: z.number().positive().default(500),
      maxRequestsPerMinute: z.number().positive().default(60),
      rateLimitWindowMs: z.number().positive().default(60000),
      eventCacheTTL: z.number().positive().default(300),
      marketCacheTTL: z.number().positive().default(300),
      tagCacheTTL: z.number().positive().default(3600),
      correlationCacheTTL: z.number().positive().default(1800),
      enableEventBasedKeywords: z.boolean().default(true),
      enableMultiMarketAnalysis: z.boolean().default(true),
      enableCrossMarketCorrelation: z.boolean().default(true),
      enableArbitrageDetection: z.boolean().default(true),
      enableEventLevelIntelligence: z.boolean().default(true),
      enableEnhancedEventDiscovery: z.boolean().default(true),
      enableMultiMarketFiltering: z.boolean().default(true),
      enableEventRankingAlgorithm: z.boolean().default(true),
      enableCrossMarketOpportunities: z.boolean().default(true),
      maxRetries: z.number().positive().default(3),
      circuitBreakerThreshold: z.number().positive().default(5),
      fallbackToCache: z.boolean().default(true),
      enableGracefulDegradation: z.boolean().default(true),
      keywordExtractionMode: z.enum(['event_priority', 'market_priority', 'balanced']).default('event_priority'),
      correlationAnalysisDepth: z.enum(['basic', 'advanced', 'comprehensive']).default('basic'),
      riskAssessmentLevel: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
      // Environment-specific event API configuration
      environment: z.enum(['development', 'staging', 'production']).default('development'),
      environmentConfigs: z.object({
        development: z.object({
          eventsApiRateLimit: z.number().positive().default(100),
          maxRequestsPerMinute: z.number().positive().default(30),
          eventCacheTTL: z.number().positive().default(60),
          enableDebugLogging: z.boolean().default(true),
          enableMockData: z.boolean().default(false),
        }).optional(),
        staging: z.object({
          eventsApiRateLimit: z.number().positive().default(300),
          maxRequestsPerMinute: z.number().positive().default(45),
          eventCacheTTL: z.number().positive().default(180),
          enableDebugLogging: z.boolean().default(false),
          enableMockData: z.boolean().default(false),
        }).optional(),
        production: z.object({
          eventsApiRateLimit: z.number().positive().default(500),
          maxRequestsPerMinute: z.number().positive().default(60),
          eventCacheTTL: z.number().positive().default(300),
          enableDebugLogging: z.boolean().default(false),
          enableMockData: z.boolean().default(false),
        }).optional(),
      }).default({}),
    }),
    langgraph: z.object({
      checkpointer: z.enum(['memory', 'sqlite', 'postgres']).default('memory'),
      recursionLimit: z.number().positive().default(25),
      streamMode: z.enum(['values', 'updates']).default('values'),
    }),
    opik: z.object({
      apiKey: z.string().optional(),
      projectName: z.string(),
      workspace: z.string().optional(),
      baseUrl: z.string().url().optional(),
      tags: z.array(z.string()).default([]),
      trackCosts: z.boolean().default(true),
    }),
    llm: z.object({
      // Single-provider mode: use one LLM for all agents (cost-effective)
      singleProvider: z.enum(['openai', 'anthropic', 'google', 'nova']).optional(),

      // Multi-provider mode: configure each provider separately (default, better quality)
      openai: z
        .object({
          apiKey: z.string(),
          defaultModel: z.string(),
        })
        .optional(),
      anthropic: z
        .object({
          apiKey: z.string(),
          defaultModel: z.string(),
        })
        .optional(),
      google: z
        .object({
          apiKey: z.string(),
          defaultModel: z.string(),
        })
        .optional(),
      nova: z
        .object({
          modelName: z.string(),
          awsRegion: z.string(),
          awsAccessKeyId: z.string().optional(),
          awsSecretAccessKey: z.string().optional(),
          temperature: z.number().min(0).max(1).optional(),
          maxTokens: z.number().positive().optional(),
          topP: z.number().min(0).max(1).optional(),
        })
        .optional(),
    }),
    agents: z.object({
      timeoutMs: z.number().positive(),
      minAgentsRequired: z.number().positive().min(1),
    }),
    consensus: z.object({
      minEdgeThreshold: z.number().min(0).max(1),
      highDisagreementThreshold: z.number().min(0).max(1),
    }),
    logging: z.object({
      level: z.enum(['debug', 'info', 'warn', 'error']),
      auditTrailRetentionDays: z.number().positive(),
    }),
    // ============================================================================
    // Advanced Agent League Configuration
    // ============================================================================
    advancedAgents: z.object({
      eventIntelligence: z.object({
        enabled: z.boolean().default(false),
        breakingNews: z.boolean().default(true),
        eventImpact: z.boolean().default(true),
      }),
      pollingStatistical: z.object({
        enabled: z.boolean().default(false),
        pollingIntelligence: z.boolean().default(true),
        historicalPattern: z.boolean().default(true),
      }),
      sentimentNarrative: z.object({
        enabled: z.boolean().default(false),
        mediaSentiment: z.boolean().default(true),
        socialSentiment: z.boolean().default(true),
        narrativeVelocity: z.boolean().default(true),
      }),
      priceAction: z.object({
        enabled: z.boolean().default(false),
        momentum: z.boolean().default(true),
        meanReversion: z.boolean().default(true),
        minVolumeThreshold: z.number().positive().default(1000),
      }),
      eventScenario: z.object({
        enabled: z.boolean().default(false),
        catalyst: z.boolean().default(true),
        tailRisk: z.boolean().default(true),
      }),
      riskPhilosophy: z.object({
        enabled: z.boolean().default(false),
        aggressive: z.boolean().default(true),
        conservative: z.boolean().default(true),
        neutral: z.boolean().default(true),
      }),
    }),
    externalData: z.object({
      news: z.object({
        provider: z.enum(['newsapi', 'perplexity', 'newsdata', 'none']).default('none'),
        apiKey: z.string().optional(),
        cacheTTL: z.number().positive().default(900), // 15 minutes
        maxArticles: z.number().positive().default(20),
      }),
      polling: z.object({
        provider: z.enum(['538', 'rcp', 'polymarket', 'none']).default('none'),
        apiKey: z.string().optional(),
        cacheTTL: z.number().positive().default(3600), // 1 hour
      }),
      social: z.object({
        providers: z.array(z.enum(['twitter', 'reddit'])).default([]),
        apiKeys: z.record(z.string(), z.string()).optional(),
        cacheTTL: z.number().positive().default(300), // 5 minutes
        maxMentions: z.number().positive().default(100),
      }),
    }),
    // NewsData.io specific configuration
    newsData: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional(),
      rateLimiting: z.object({
        requestsPerWindow: z.number().positive().default(100),
        windowSizeMs: z.number().positive().default(900000), // 15 minutes
        dailyQuota: z.number().positive().default(1000),
      }),
      cache: z.object({
        enabled: z.boolean().default(true),
        ttl: z.object({
          latest: z.number().positive().default(300), // 5 minutes
          crypto: z.number().positive().default(300),
          market: z.number().positive().default(300),
          archive: z.number().positive().default(1800), // 30 minutes
        }),
        maxSize: z.number().positive().default(1000),
      }),
      circuitBreaker: z.object({
        enabled: z.boolean().default(true),
        failureThreshold: z.number().positive().default(5),
        resetTimeoutMs: z.number().positive().default(60000),
      }),
      agentTools: z.object({
        enabled: z.boolean().default(true),
        defaultParams: z.record(z.string(), z.any()).default({}),
        maxRequestsPerHour: z.number().positive().default(10),
      }).optional(),
    }).optional(),
    // Serper API configuration for web research
    serper: z.object({
      apiKey: z.string(),
      searchUrl: z.string().url().default('https://google.serper.dev/search'),
      scrapeUrl: z.string().url().default('https://scrape.serper.dev'),
      timeout: z.number().positive().default(30000),
    }).optional(),
    // Web Research Agent configuration
    webResearch: z.object({
      enabled: z.boolean().default(true),
      maxToolCalls: z.number().positive().default(8),
      timeout: z.number().positive().default(60000),
    }).optional(),
    signalFusion: z.object({
      baseWeights: z.record(z.string(), z.number()).default({
        'market_microstructure': 1.0,
        'probability_baseline': 1.0,
        'risk_assessment': 1.0,
        'breaking_news': 1.2,
        'event_impact': 1.2,
        'polling_intelligence': 1.5,
        'historical_pattern': 1.0,
        'media_sentiment': 0.8,
        'social_sentiment': 0.8,
        'narrative_velocity': 0.8,
        'momentum': 1.0,
        'mean_reversion': 1.0,
        'catalyst': 1.0,
        'tail_risk': 1.0,
      }),
      contextAdjustments: z.boolean().default(true),
      conflictThreshold: z.number().min(0).max(1).default(0.20),
      alignmentBonus: z.number().min(0).max(1).default(0.20),
    }),
    costOptimization: z.object({
      maxCostPerAnalysis: z.number().positive().default(2.0),
      skipLowImpactAgents: z.boolean().default(false),
      batchLLMRequests: z.boolean().default(true),
    }),
    performanceTracking: z.object({
      enabled: z.boolean().default(false),
      evaluateOnResolution: z.boolean().default(true),
      minSampleSize: z.number().positive().default(10),
    }),
    pollingAgent: z.object({
      autonomous: z.boolean().default(true),
      maxToolCalls: z.number().positive().default(5),
      timeout: z.number().positive().default(45000),
      cacheEnabled: z.boolean().default(true),
      fallbackToBasic: z.boolean().default(true),
    }),
    newsAgents: z.object({
      breakingNewsAgent: z.object({
        autonomous: z.boolean().default(true),
        maxToolCalls: z.number().positive().default(5),
        timeout: z.number().positive().default(45000),
        cacheEnabled: z.boolean().default(true),
        fallbackToBasic: z.boolean().default(true),
      }),
      mediaSentimentAgent: z.object({
        autonomous: z.boolean().default(true),
        maxToolCalls: z.number().positive().default(5),
        timeout: z.number().positive().default(45000),
        cacheEnabled: z.boolean().default(true),
        fallbackToBasic: z.boolean().default(true),
      }),
      marketMicrostructureAgent: z.object({
        autonomous: z.boolean().default(true),
        maxToolCalls: z.number().positive().default(5),
        timeout: z.number().positive().default(45000),
        cacheEnabled: z.boolean().default(true),
        fallbackToBasic: z.boolean().default(true),
      }),
    }),
    // ============================================================================
    // Agent Memory System Configuration
    // ============================================================================
    memorySystem: z.object({
      // Feature flag to enable/disable the entire memory system
      enabled: z.boolean().default(false),
      // Maximum number of historical signals to retrieve per agent-market combination
      maxSignalsPerAgent: z.number().positive().min(1).max(10).default(3),
      // Query timeout in milliseconds (prevents slow queries from blocking workflow)
      queryTimeoutMs: z.number().positive().default(5000),
      // Number of retry attempts for rate limit errors
      retryAttempts: z.number().min(0).max(5).default(3),
    }),
    // ============================================================================
    // Workflow Service Configuration (DOA Integration)
    // ============================================================================
    workflowService: z.object({
      // Optional URL for remote workflow service (HTTP/HTTPS only)
      url: z.string().url().refine(
        (url) => url.startsWith('http://') || url.startsWith('https://'),
        { message: 'Workflow service URL must use HTTP or HTTPS protocol' }
      ).optional(),
      // Timeout for HTTP requests in milliseconds (default: 2 minutes)
      timeoutMs: z.number().positive().default(120000),
      // Optional custom headers for the workflow service
      headers: z.record(z.string(), z.string()).optional(),
    }).optional(),
  })
  .refine(
    (config) => {
      // If single-provider mode is set, ensure that provider is configured
      if (config.llm.singleProvider) {
        const provider = config.llm.singleProvider;
        if (provider === 'openai' && !config.llm.openai) {
          return false;
        }
        if (provider === 'anthropic' && !config.llm.anthropic) {
          return false;
        }
        if (provider === 'google' && !config.llm.google) {
          return false;
        }
        if (provider === 'nova' && !config.llm.nova) {
          return false;
        }
      } else {
        // Multi-provider mode: at least one provider must be configured
        if (!config.llm.openai && !config.llm.anthropic && !config.llm.google && !config.llm.nova) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        'LLM configuration invalid: In single-provider mode, the specified provider must be configured. In multi-provider mode, at least one provider must be configured.',
    }
  )
  .refine(
    (config) => {
      // Validate that enabled agent groups have required data sources configured
      const errors: string[] = [];
      
      // Event Intelligence requires news data
      if (config.advancedAgents.eventIntelligence.enabled && 
          config.externalData.news.provider === 'none') {
        errors.push('Event Intelligence agents require news data source to be configured');
      }
      
      // Polling agents require polling data
      if (config.advancedAgents.pollingStatistical.enabled && 
          config.externalData.polling.provider === 'none') {
        errors.push('Polling & Statistical agents require polling data source to be configured');
      }
      
      // Sentiment agents require news or social data
      if (config.advancedAgents.sentimentNarrative.enabled && 
          config.externalData.news.provider === 'none' && 
          config.externalData.social.providers.length === 0) {
        errors.push('Sentiment & Narrative agents require news or social data sources to be configured');
      }
      
      return errors.length === 0;
    },
    {
      message: 'Agent groups enabled but required external data sources not configured',
    }
  );

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

/**
 * Partial configuration for overrides
 */
export type PartialEngineConfig = z.infer<typeof EngineConfigSchema> extends infer T
  ? {
      [K in keyof T]?: T[K] extends object
        ? {
            [P in keyof T[K]]?: T[K][P];
          }
        : T[K];
    }
  : never;

/**
 * Get environment-specific default values for event configuration
 * 
 * @param environment - The current environment
 * @param setting - The setting to get default for
 * @returns Default value for the setting in the given environment
 */
function getEnvironmentDefault(environment: 'development' | 'staging' | 'production', setting: string): string {
  const defaults = {
    development: {
      eventsApiRateLimit: '100',
      maxRequestsPerMinute: '30',
      eventCacheTTL: '60',
    },
    staging: {
      eventsApiRateLimit: '300',
      maxRequestsPerMinute: '45',
      eventCacheTTL: '180',
    },
    production: {
      eventsApiRateLimit: '500',
      maxRequestsPerMinute: '60',
      eventCacheTTL: '300',
    },
  };

  return defaults[environment][setting as keyof typeof defaults[typeof environment]] || '0';
}

/**
 * Load and validate configuration from environment variables
 * 
 * Error handling:
 * - Validates configuration against schema
 * - Logs validation errors
 * - Disables misconfigured agent groups
 * - Falls back to safe defaults when possible
 */
export function loadConfig(): EngineConfig {
  const nodeEnv = (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development';
  
  const config: EngineConfig = {
    polymarket: {
      gammaApiUrl: process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com',
      clobApiUrl: process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com',
      rateLimitBuffer: parseInt(process.env.POLYMARKET_RATE_LIMIT_BUFFER || '80', 10),
      politicsTagId: parseInt(process.env.POLYMARKET_POLITICS_TAG_ID || '2', 10),
      // Enhanced event-based configuration
      eventsApiEndpoint: process.env.POLYMARKET_EVENTS_API_ENDPOINT || '/events',
      includeRelatedTags: process.env.POLYMARKET_INCLUDE_RELATED_TAGS !== 'false',
      maxEventsPerDiscovery: parseInt(process.env.POLYMARKET_MAX_EVENTS_PER_DISCOVERY || '20', 10),
      maxMarketsPerEvent: parseInt(process.env.POLYMARKET_MAX_MARKETS_PER_EVENT || '50', 10),
      defaultSortBy: (process.env.POLYMARKET_DEFAULT_SORT_BY as 'volume24hr' | 'liquidity' | 'competitive' | 'marketCount' | 'totalVolume' | 'id') || 'volume24hr',
      enableCrossMarketAnalysis: process.env.POLYMARKET_ENABLE_CROSS_MARKET_ANALYSIS !== 'false',
      correlationThreshold: parseFloat(process.env.POLYMARKET_CORRELATION_THRESHOLD || '0.3'),
      arbitrageThreshold: parseFloat(process.env.POLYMARKET_ARBITRAGE_THRESHOLD || '0.05'),
      eventsApiRateLimit: parseInt(process.env.POLYMARKET_EVENTS_API_RATE_LIMIT || getEnvironmentDefault(nodeEnv, 'eventsApiRateLimit'), 10),
      maxRequestsPerMinute: parseInt(process.env.POLYMARKET_MAX_REQUESTS_PER_MINUTE || getEnvironmentDefault(nodeEnv, 'maxRequestsPerMinute'), 10),
      rateLimitWindowMs: parseInt(process.env.POLYMARKET_RATE_LIMIT_WINDOW_MS || '60000', 10),
      eventCacheTTL: parseInt(process.env.POLYMARKET_EVENT_CACHE_TTL || getEnvironmentDefault(nodeEnv, 'eventCacheTTL'), 10),
      marketCacheTTL: parseInt(process.env.POLYMARKET_MARKET_CACHE_TTL || '300', 10),
      tagCacheTTL: parseInt(process.env.POLYMARKET_TAG_CACHE_TTL || '3600', 10),
      correlationCacheTTL: parseInt(process.env.POLYMARKET_CORRELATION_CACHE_TTL || '1800', 10),
      enableEventBasedKeywords: process.env.POLYMARKET_ENABLE_EVENT_BASED_KEYWORDS !== 'false',
      enableMultiMarketAnalysis: process.env.POLYMARKET_ENABLE_MULTI_MARKET_ANALYSIS !== 'false',
      enableCrossMarketCorrelation: process.env.POLYMARKET_ENABLE_CROSS_MARKET_CORRELATION !== 'false',
      enableArbitrageDetection: process.env.POLYMARKET_ENABLE_ARBITRAGE_DETECTION !== 'false',
      enableEventLevelIntelligence: process.env.POLYMARKET_ENABLE_EVENT_LEVEL_INTELLIGENCE !== 'false',
      enableEnhancedEventDiscovery: process.env.POLYMARKET_ENABLE_ENHANCED_EVENT_DISCOVERY !== 'false',
      enableMultiMarketFiltering: process.env.POLYMARKET_ENABLE_MULTI_MARKET_FILTERING !== 'false',
      enableEventRankingAlgorithm: process.env.POLYMARKET_ENABLE_EVENT_RANKING_ALGORITHM !== 'false',
      enableCrossMarketOpportunities: process.env.POLYMARKET_ENABLE_CROSS_MARKET_OPPORTUNITIES !== 'false',
      maxRetries: parseInt(process.env.POLYMARKET_MAX_RETRIES || '3', 10),
      circuitBreakerThreshold: parseInt(process.env.POLYMARKET_CIRCUIT_BREAKER_THRESHOLD || '5', 10),
      fallbackToCache: process.env.POLYMARKET_FALLBACK_TO_CACHE !== 'false',
      enableGracefulDegradation: process.env.POLYMARKET_ENABLE_GRACEFUL_DEGRADATION !== 'false',
      keywordExtractionMode: (process.env.POLYMARKET_KEYWORD_EXTRACTION_MODE as 'event_priority' | 'market_priority' | 'balanced') || 'event_priority',
      correlationAnalysisDepth: (process.env.POLYMARKET_CORRELATION_ANALYSIS_DEPTH as 'basic' | 'advanced' | 'comprehensive') || 'basic',
      riskAssessmentLevel: (process.env.POLYMARKET_RISK_ASSESSMENT_LEVEL as 'conservative' | 'moderate' | 'aggressive') || 'moderate',
      // Environment-specific configuration
      environment: nodeEnv,
      environmentConfigs: {
        development: {
          eventsApiRateLimit: parseInt(process.env.POLYMARKET_DEV_EVENTS_API_RATE_LIMIT || '100', 10),
          maxRequestsPerMinute: parseInt(process.env.POLYMARKET_DEV_MAX_REQUESTS_PER_MINUTE || '30', 10),
          eventCacheTTL: parseInt(process.env.POLYMARKET_DEV_EVENT_CACHE_TTL || '60', 10),
          enableDebugLogging: process.env.POLYMARKET_DEV_ENABLE_DEBUG_LOGGING !== 'false',
          enableMockData: process.env.POLYMARKET_DEV_ENABLE_MOCK_DATA === 'true',
        },
        staging: {
          eventsApiRateLimit: parseInt(process.env.POLYMARKET_STAGING_EVENTS_API_RATE_LIMIT || '300', 10),
          maxRequestsPerMinute: parseInt(process.env.POLYMARKET_STAGING_MAX_REQUESTS_PER_MINUTE || '45', 10),
          eventCacheTTL: parseInt(process.env.POLYMARKET_STAGING_EVENT_CACHE_TTL || '180', 10),
          enableDebugLogging: process.env.POLYMARKET_STAGING_ENABLE_DEBUG_LOGGING === 'true',
          enableMockData: process.env.POLYMARKET_STAGING_ENABLE_MOCK_DATA === 'true',
        },
        production: {
          eventsApiRateLimit: parseInt(process.env.POLYMARKET_PROD_EVENTS_API_RATE_LIMIT || '500', 10),
          maxRequestsPerMinute: parseInt(process.env.POLYMARKET_PROD_MAX_REQUESTS_PER_MINUTE || '60', 10),
          eventCacheTTL: parseInt(process.env.POLYMARKET_PROD_EVENT_CACHE_TTL || '300', 10),
          enableDebugLogging: process.env.POLYMARKET_PROD_ENABLE_DEBUG_LOGGING === 'true',
          enableMockData: process.env.POLYMARKET_PROD_ENABLE_MOCK_DATA === 'true',
        },
      },
    },
    langgraph: {
      checkpointer:
        (process.env.LANGGRAPH_CHECKPOINTER as 'memory' | 'sqlite' | 'postgres') || 'memory',
      recursionLimit: parseInt(process.env.LANGGRAPH_RECURSION_LIMIT || '25', 10),
      streamMode: (process.env.LANGGRAPH_STREAM_MODE as 'values' | 'updates') || 'values',
    },
    opik: {
      apiKey: process.env.OPIK_API_KEY,
      projectName: process.env.OPIK_PROJECT_NAME || 'market-intelligence-engine',
      workspace: process.env.OPIK_WORKSPACE,
      baseUrl: process.env.OPIK_BASE_URL,
      tags: process.env.OPIK_TAGS ? process.env.OPIK_TAGS.split(',') : [],
      trackCosts: process.env.OPIK_TRACK_COSTS !== 'false',
    },
    llm: {
      singleProvider: process.env.LLM_SINGLE_PROVIDER as 'openai' | 'anthropic' | 'google' | 'nova' | undefined,
      openai: process.env.OPENAI_API_KEY
        ? {
            apiKey: process.env.OPENAI_API_KEY,
            defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4-turbo',
          }
        : undefined,
      anthropic: process.env.ANTHROPIC_API_KEY
        ? {
            apiKey: process.env.ANTHROPIC_API_KEY,
            defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-sonnet-20240229',
          }
        : undefined,
      google: process.env.GOOGLE_API_KEY
        ? {
            apiKey: process.env.GOOGLE_API_KEY,
            defaultModel: process.env.GOOGLE_DEFAULT_MODEL || 'gemini-1.5-flash',
          }
        : undefined,
      nova: process.env.AWS_REGION
        ? {
            modelName: process.env.NOVA_MODEL_NAME || 'amazon.nova-lite-v1:0',
            awsRegion: process.env.AWS_REGION,
            awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
            awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            temperature: process.env.NOVA_TEMPERATURE ? parseFloat(process.env.NOVA_TEMPERATURE) : undefined,
            maxTokens: process.env.NOVA_MAX_TOKENS ? parseInt(process.env.NOVA_MAX_TOKENS, 10) : undefined,
            topP: process.env.NOVA_TOP_P ? parseFloat(process.env.NOVA_TOP_P) : undefined,
          }
        : undefined,
    },
    agents: {
      timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '10000', 10),
      minAgentsRequired: parseInt(process.env.MIN_AGENTS_REQUIRED || '2', 10),
    },
    consensus: {
      minEdgeThreshold: parseFloat(process.env.MIN_EDGE_THRESHOLD || '0.05'),
      highDisagreementThreshold: parseFloat(process.env.HIGH_DISAGREEMENT_THRESHOLD || '0.15'),
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      auditTrailRetentionDays: parseInt(process.env.AUDIT_TRAIL_RETENTION_DAYS || '30', 10),
    },
    advancedAgents: {
      eventIntelligence: {
        enabled: process.env.ADVANCED_AGENTS_EVENT_INTELLIGENCE_ENABLED === 'true',
        breakingNews: process.env.ADVANCED_AGENTS_EVENT_INTELLIGENCE_BREAKING_NEWS !== 'false',
        eventImpact: process.env.ADVANCED_AGENTS_EVENT_INTELLIGENCE_EVENT_IMPACT !== 'false',
      },
      pollingStatistical: {
        enabled: process.env.ADVANCED_AGENTS_POLLING_STATISTICAL_ENABLED === 'true',
        pollingIntelligence: process.env.ADVANCED_AGENTS_POLLING_STATISTICAL_POLLING_INTELLIGENCE !== 'false',
        historicalPattern: process.env.ADVANCED_AGENTS_POLLING_STATISTICAL_HISTORICAL_PATTERN !== 'false',
      },
      sentimentNarrative: {
        enabled: process.env.ADVANCED_AGENTS_SENTIMENT_NARRATIVE_ENABLED === 'true',
        mediaSentiment: process.env.ADVANCED_AGENTS_SENTIMENT_NARRATIVE_MEDIA_SENTIMENT !== 'false',
        socialSentiment: process.env.ADVANCED_AGENTS_SENTIMENT_NARRATIVE_SOCIAL_SENTIMENT !== 'false',
        narrativeVelocity: process.env.ADVANCED_AGENTS_SENTIMENT_NARRATIVE_NARRATIVE_VELOCITY !== 'false',
      },
      priceAction: {
        enabled: process.env.ADVANCED_AGENTS_PRICE_ACTION_ENABLED === 'true',
        momentum: process.env.ADVANCED_AGENTS_PRICE_ACTION_MOMENTUM !== 'false',
        meanReversion: process.env.ADVANCED_AGENTS_PRICE_ACTION_MEAN_REVERSION !== 'false',
        minVolumeThreshold: parseInt(process.env.ADVANCED_AGENTS_PRICE_ACTION_MIN_VOLUME_THRESHOLD || '1000', 10),
      },
      eventScenario: {
        enabled: process.env.ADVANCED_AGENTS_EVENT_SCENARIO_ENABLED === 'true',
        catalyst: process.env.ADVANCED_AGENTS_EVENT_SCENARIO_CATALYST !== 'false',
        tailRisk: process.env.ADVANCED_AGENTS_EVENT_SCENARIO_TAIL_RISK !== 'false',
      },
      riskPhilosophy: {
        enabled: process.env.ADVANCED_AGENTS_RISK_PHILOSOPHY_ENABLED === 'true',
        aggressive: process.env.ADVANCED_AGENTS_RISK_PHILOSOPHY_AGGRESSIVE !== 'false',
        conservative: process.env.ADVANCED_AGENTS_RISK_PHILOSOPHY_CONSERVATIVE !== 'false',
        neutral: process.env.ADVANCED_AGENTS_RISK_PHILOSOPHY_NEUTRAL !== 'false',
      },
    },
    externalData: {
      news: {
        provider: (process.env.EXTERNAL_DATA_NEWS_PROVIDER as 'newsapi' | 'perplexity' | 'newsdata' | 'none') || 'none',
        apiKey: process.env.EXTERNAL_DATA_NEWS_API_KEY,
        cacheTTL: parseInt(process.env.EXTERNAL_DATA_NEWS_CACHE_TTL || '900', 10),
        maxArticles: parseInt(process.env.EXTERNAL_DATA_NEWS_MAX_ARTICLES || '20', 10),
      },
      polling: {
        provider: (process.env.EXTERNAL_DATA_POLLING_PROVIDER as '538' | 'rcp' | 'polymarket' | 'none') || 'none',
        apiKey: process.env.EXTERNAL_DATA_POLLING_API_KEY,
        cacheTTL: parseInt(process.env.EXTERNAL_DATA_POLLING_CACHE_TTL || '3600', 10),
      },
      social: {
        providers: process.env.EXTERNAL_DATA_SOCIAL_PROVIDERS 
          ? (process.env.EXTERNAL_DATA_SOCIAL_PROVIDERS.split(',') as ('twitter' | 'reddit')[])
          : [],
        apiKeys: process.env.EXTERNAL_DATA_SOCIAL_API_KEYS 
          ? JSON.parse(process.env.EXTERNAL_DATA_SOCIAL_API_KEYS)
          : undefined,
        cacheTTL: parseInt(process.env.EXTERNAL_DATA_SOCIAL_CACHE_TTL || '300', 10),
        maxMentions: parseInt(process.env.EXTERNAL_DATA_SOCIAL_MAX_MENTIONS || '100', 10),
      },
    },
    newsData: process.env.NEWSDATA_INTEGRATION_ENABLED === 'true' ? {
      enabled: true,
      apiKey: process.env.NEWSDATA_API_KEY,
      rateLimiting: {
        requestsPerWindow: parseInt(process.env.NEWSDATA_RATE_LIMIT_REQUESTS || '100', 10),
        windowSizeMs: parseInt(process.env.NEWSDATA_RATE_LIMIT_WINDOW_MS || '900000', 10),
        dailyQuota: parseInt(process.env.NEWSDATA_DAILY_QUOTA || '1000', 10),
      },
      cache: {
        enabled: process.env.NEWSDATA_CACHE_ENABLED !== 'false',
        ttl: {
          latest: parseInt(process.env.NEWSDATA_CACHE_TTL_LATEST || '300', 10),
          crypto: parseInt(process.env.NEWSDATA_CACHE_TTL_CRYPTO || '300', 10),
          market: parseInt(process.env.NEWSDATA_CACHE_TTL_MARKET || '300', 10),
          archive: parseInt(process.env.NEWSDATA_CACHE_TTL_ARCHIVE || '1800', 10),
        },
        maxSize: parseInt(process.env.NEWSDATA_CACHE_MAX_SIZE || '1000', 10),
      },
      circuitBreaker: {
        enabled: process.env.NEWSDATA_CIRCUIT_BREAKER_ENABLED !== 'false',
        failureThreshold: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
        resetTimeoutMs: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_RESET_TIMEOUT || '60000', 10),
      },
      agentTools: {
        enabled: process.env.NEWSDATA_AGENT_TOOLS_ENABLED !== 'false',
        defaultParams: process.env.NEWSDATA_AGENT_TOOLS_DEFAULT_PARAMS 
          ? JSON.parse(process.env.NEWSDATA_AGENT_TOOLS_DEFAULT_PARAMS)
          : {},
        maxRequestsPerHour: parseInt(process.env.NEWSDATA_AGENT_TOOLS_MAX_REQUESTS_PER_HOUR || '10', 10),
      },
    } : undefined,
    serper: process.env.SERPER_API_KEY ? {
      apiKey: process.env.SERPER_API_KEY,
      searchUrl: process.env.SERPER_SEARCH_URL || 'https://google.serper.dev/search',
      scrapeUrl: process.env.SERPER_SCRAPE_URL || 'https://scrape.serper.dev',
      timeout: parseInt(process.env.SERPER_TIMEOUT || '30000', 10),
    } : undefined,
    webResearch: {
      enabled: process.env.WEB_RESEARCH_ENABLED !== 'false',
      maxToolCalls: parseInt(process.env.WEB_RESEARCH_MAX_TOOL_CALLS || '8', 10),
      timeout: parseInt(process.env.WEB_RESEARCH_TIMEOUT || '60000', 10),
    },
    signalFusion: {
      baseWeights: process.env.SIGNAL_FUSION_BASE_WEIGHTS
        ? JSON.parse(process.env.SIGNAL_FUSION_BASE_WEIGHTS)
        : {
            'market_microstructure': 1.0,
            'probability_baseline': 1.0,
            'risk_assessment': 1.0,
            'breaking_news': 1.2,
            'event_impact': 1.2,
            'polling_intelligence': 1.5,
            'historical_pattern': 1.0,
            'media_sentiment': 0.8,
            'social_sentiment': 0.8,
            'narrative_velocity': 0.8,
            'momentum': 1.0,
            'mean_reversion': 1.0,
            'catalyst': 1.0,
            'tail_risk': 1.0,
          },
      contextAdjustments: process.env.SIGNAL_FUSION_CONTEXT_ADJUSTMENTS !== 'false',
      conflictThreshold: parseFloat(process.env.SIGNAL_FUSION_CONFLICT_THRESHOLD || '0.20'),
      alignmentBonus: parseFloat(process.env.SIGNAL_FUSION_ALIGNMENT_BONUS || '0.20'),
    },
    costOptimization: {
      maxCostPerAnalysis: parseFloat(process.env.COST_OPTIMIZATION_MAX_COST_PER_ANALYSIS || '2.0'),
      skipLowImpactAgents: process.env.COST_OPTIMIZATION_SKIP_LOW_IMPACT_AGENTS === 'true',
      batchLLMRequests: process.env.COST_OPTIMIZATION_BATCH_LLM_REQUESTS !== 'false',
    },
    performanceTracking: {
      enabled: process.env.PERFORMANCE_TRACKING_ENABLED === 'true',
      evaluateOnResolution: process.env.PERFORMANCE_TRACKING_EVALUATE_ON_RESOLUTION !== 'false',
      minSampleSize: parseInt(process.env.PERFORMANCE_TRACKING_MIN_SAMPLE_SIZE || '10', 10),
    },
    pollingAgent: loadPollingAgentConfig(),
    newsAgents: loadNewsAgentsConfig(),
    memorySystem: {
      enabled: process.env.MEMORY_SYSTEM_ENABLED === 'true',
      maxSignalsPerAgent: parseInt(process.env.MEMORY_SYSTEM_MAX_SIGNALS_PER_AGENT || '3', 10),
      queryTimeoutMs: parseInt(process.env.MEMORY_SYSTEM_QUERY_TIMEOUT_MS || '5000', 10),
      retryAttempts: parseInt(process.env.MEMORY_SYSTEM_RETRY_ATTEMPTS || '3', 10),
    },
    workflowService: process.env.WORKFLOW_SERVICE_URL ? {
      url: process.env.WORKFLOW_SERVICE_URL,
      timeoutMs: parseInt(process.env.WORKFLOW_SERVICE_TIMEOUT_MS || '120000', 10),
      headers: process.env.WORKFLOW_SERVICE_HEADERS 
        ? JSON.parse(process.env.WORKFLOW_SERVICE_HEADERS)
        : undefined,
    } : undefined,
  };

  // Validate configuration
  try {
    return EngineConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Config] Configuration validation failed:');
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      
      // Try to fix configuration by disabling misconfigured agent groups
      const fixedConfig = fixMisconfiguredAgentGroups(config);
      
      try {
        console.log('[Config] Attempting to use fixed configuration with disabled agent groups');
        return EngineConfigSchema.parse(fixedConfig);
      } catch (retryError) {
        console.error('[Config] Failed to fix configuration, using minimal safe defaults');
        throw error; // Re-throw original error
      }
    }
    throw error;
  }
}

/**
 * Fix misconfigured agent groups by disabling them
 * 
 * This function disables agent groups that are enabled but don't have
 * required external data sources configured.
 * 
 * @param config - Configuration to fix
 * @returns Fixed configuration
 */
function fixMisconfiguredAgentGroups(config: EngineConfig): EngineConfig {
  const fixed = { ...config };
  
  // Event Intelligence requires news data
  if (fixed.advancedAgents.eventIntelligence.enabled && 
      fixed.externalData.news.provider === 'none') {
    console.warn('[Config] Disabling Event Intelligence agents: news data source not configured');
    fixed.advancedAgents.eventIntelligence.enabled = false;
  }
  
  // Polling agents require polling data
  if (fixed.advancedAgents.pollingStatistical.enabled && 
      fixed.externalData.polling.provider === 'none') {
    console.warn('[Config] Disabling Polling & Statistical agents: polling data source not configured');
    fixed.advancedAgents.pollingStatistical.enabled = false;
  }
  
  // Sentiment agents require news or social data
  if (fixed.advancedAgents.sentimentNarrative.enabled && 
      fixed.externalData.news.provider === 'none' && 
      fixed.externalData.social.providers.length === 0) {
    console.warn('[Config] Disabling Sentiment & Narrative agents: news or social data sources not configured');
    fixed.advancedAgents.sentimentNarrative.enabled = false;
  }
  
  return fixed;
}

/**
 * Default configuration instance (lazy loaded)
 */
let _config: EngineConfig | null = null;
export const config = new Proxy({} as EngineConfig, {
  get(_target, prop) {
    if (!_config) {
      _config = loadConfig();
    }
    return _config[prop as keyof EngineConfig];
  }
});

/**
 * Create a configuration with overrides
 * 
 * This function allows you to override specific configuration values
 * while keeping the rest from environment variables or defaults.
 * 
 * @example
 * ```typescript
 * // Override just the project name
 * const config = createConfig({
 *   opik: { projectName: 'my-custom-project' }
 * });
 * 
 * // Override LLM mode to single-provider
 * const config = createConfig({
 *   llm: {
 *     singleProvider: 'openai',
 *     openai: {
 *       apiKey: 'sk-...',
 *       defaultModel: 'gpt-4o-mini'
 *     }
 *   }
 * });
 * ```
 * 
 * @param overrides - Partial configuration to override defaults
 * @returns Validated configuration with overrides applied
 */
export function createConfig(overrides: Partial<EngineConfig>): EngineConfig {
  const baseConfig = loadConfig();
  
  // Deep merge overrides with base config
  const mergedConfig = {
    ...baseConfig,
    ...overrides,
    polymarket: {
      ...baseConfig.polymarket,
      ...(overrides.polymarket || {}),
      environmentConfigs: {
        development: {
          ...baseConfig.polymarket.environmentConfigs?.development,
          ...(overrides.polymarket?.environmentConfigs?.development || {}),
        },
        staging: {
          ...baseConfig.polymarket.environmentConfigs?.staging,
          ...(overrides.polymarket?.environmentConfigs?.staging || {}),
        },
        production: {
          ...baseConfig.polymarket.environmentConfigs?.production,
          ...(overrides.polymarket?.environmentConfigs?.production || {}),
        },
      },
    },
    langgraph: {
      ...baseConfig.langgraph,
      ...(overrides.langgraph || {}),
    },
    opik: {
      ...baseConfig.opik,
      ...(overrides.opik || {}),
    },
    llm: {
      ...baseConfig.llm,
      ...(overrides.llm || {}),
      openai: overrides.llm?.openai || baseConfig.llm.openai,
      anthropic: overrides.llm?.anthropic || baseConfig.llm.anthropic,
      google: overrides.llm?.google || baseConfig.llm.google,
    },
    agents: {
      ...baseConfig.agents,
      ...(overrides.agents || {}),
    },
    consensus: {
      ...baseConfig.consensus,
      ...(overrides.consensus || {}),
    },
    logging: {
      ...baseConfig.logging,
      ...(overrides.logging || {}),
    },
    advancedAgents: {
      eventIntelligence: {
        ...baseConfig.advancedAgents.eventIntelligence,
        ...(overrides.advancedAgents?.eventIntelligence || {}),
      },
      pollingStatistical: {
        ...baseConfig.advancedAgents.pollingStatistical,
        ...(overrides.advancedAgents?.pollingStatistical || {}),
      },
      sentimentNarrative: {
        ...baseConfig.advancedAgents.sentimentNarrative,
        ...(overrides.advancedAgents?.sentimentNarrative || {}),
      },
      priceAction: {
        ...baseConfig.advancedAgents.priceAction,
        ...(overrides.advancedAgents?.priceAction || {}),
      },
      eventScenario: {
        ...baseConfig.advancedAgents.eventScenario,
        ...(overrides.advancedAgents?.eventScenario || {}),
      },
      riskPhilosophy: {
        ...baseConfig.advancedAgents.riskPhilosophy,
        ...(overrides.advancedAgents?.riskPhilosophy || {}),
      },
    },
    externalData: {
      news: {
        ...baseConfig.externalData.news,
        ...(overrides.externalData?.news || {}),
      },
      polling: {
        ...baseConfig.externalData.polling,
        ...(overrides.externalData?.polling || {}),
      },
      social: {
        ...baseConfig.externalData.social,
        ...(overrides.externalData?.social || {}),
      },
    },
    newsData: overrides.newsData || baseConfig.newsData ? {
      ...baseConfig.newsData,
      ...(overrides.newsData || {}),
      rateLimiting: {
        ...baseConfig.newsData?.rateLimiting,
        ...(overrides.newsData?.rateLimiting || {}),
      },
      cache: {
        ...baseConfig.newsData?.cache,
        ...(overrides.newsData?.cache || {}),
        ttl: {
          ...baseConfig.newsData?.cache?.ttl,
          ...(overrides.newsData?.cache?.ttl || {}),
        },
      },
      circuitBreaker: {
        ...baseConfig.newsData?.circuitBreaker,
        ...(overrides.newsData?.circuitBreaker || {}),
      },
      agentTools: {
        ...baseConfig.newsData?.agentTools,
        ...(overrides.newsData?.agentTools || {}),
      },
    } : undefined,
    signalFusion: {
      ...baseConfig.signalFusion,
      ...(overrides.signalFusion || {}),
    },
    costOptimization: {
      ...baseConfig.costOptimization,
      ...(overrides.costOptimization || {}),
    },
    performanceTracking: {
      ...baseConfig.performanceTracking,
      ...(overrides.performanceTracking || {}),
    },
    pollingAgent: {
      ...baseConfig.pollingAgent,
      ...(overrides.pollingAgent || {}),
    },
    newsAgents: {
      breakingNewsAgent: {
        ...baseConfig.newsAgents.breakingNewsAgent,
        ...(overrides.newsAgents?.breakingNewsAgent || {}),
      },
      mediaSentimentAgent: {
        ...baseConfig.newsAgents.mediaSentimentAgent,
        ...(overrides.newsAgents?.mediaSentimentAgent || {}),
      },
      marketMicrostructureAgent: {
        ...baseConfig.newsAgents.marketMicrostructureAgent,
        ...(overrides.newsAgents?.marketMicrostructureAgent || {}),
      },
    },
    memorySystem: {
      ...baseConfig.memorySystem,
      ...(overrides.memorySystem || {}),
    },
    workflowService: overrides.workflowService || baseConfig.workflowService ? {
      ...baseConfig.workflowService,
      ...(overrides.workflowService || {}),
    } : undefined,
  };

  // Validate merged configuration
  return EngineConfigSchema.parse(mergedConfig);
}

/**
 * Get default configuration values
 * 
 * Returns the default configuration without loading from environment variables.
 * Useful for testing or documentation purposes.
 * 
 * @returns Default configuration object
 */
export function getDefaultConfig(): Partial<EngineConfig> {
  return {
    polymarket: {
      gammaApiUrl: 'https://gamma-api.polymarket.com',
      clobApiUrl: 'https://clob.polymarket.com',
      rateLimitBuffer: 80,
      politicsTagId: 2,
      eventsApiEndpoint: '/events',
      includeRelatedTags: true,
      maxEventsPerDiscovery: 20,
      maxMarketsPerEvent: 50,
      defaultSortBy: 'volume24hr',
      enableCrossMarketAnalysis: true,
      correlationThreshold: 0.3,
      arbitrageThreshold: 0.05,
      eventsApiRateLimit: 500,
      maxRequestsPerMinute: 60,
      rateLimitWindowMs: 60000,
      eventCacheTTL: 300,
      marketCacheTTL: 300,
      tagCacheTTL: 3600,
      correlationCacheTTL: 1800,
      enableEventBasedKeywords: true,
      enableMultiMarketAnalysis: true,
      enableCrossMarketCorrelation: true,
      enableArbitrageDetection: true,
      enableEventLevelIntelligence: true,
      enableEnhancedEventDiscovery: true,
      enableMultiMarketFiltering: true,
      enableEventRankingAlgorithm: true,
      enableCrossMarketOpportunities: true,
      maxRetries: 3,
      circuitBreakerThreshold: 5,
      fallbackToCache: true,
      enableGracefulDegradation: true,
      keywordExtractionMode: 'event_priority',
      correlationAnalysisDepth: 'basic',
      riskAssessmentLevel: 'moderate',
      environment: 'development',
      environmentConfigs: {
        development: {
          eventsApiRateLimit: 100,
          maxRequestsPerMinute: 30,
          eventCacheTTL: 60,
          enableDebugLogging: true,
          enableMockData: false,
        },
        staging: {
          eventsApiRateLimit: 300,
          maxRequestsPerMinute: 45,
          eventCacheTTL: 180,
          enableDebugLogging: false,
          enableMockData: false,
        },
        production: {
          eventsApiRateLimit: 500,
          maxRequestsPerMinute: 60,
          eventCacheTTL: 300,
          enableDebugLogging: false,
          enableMockData: false,
        },
      },
    },
    langgraph: {
      checkpointer: 'memory',
      recursionLimit: 25,
      streamMode: 'values',
    },
    opik: {
      projectName: 'market-intelligence-engine',
      tags: [],
      trackCosts: true,
    },
    agents: {
      timeoutMs: 10000,
      minAgentsRequired: 2,
    },
    consensus: {
      minEdgeThreshold: 0.05,
      highDisagreementThreshold: 0.15,
    },
    logging: {
      level: 'info',
      auditTrailRetentionDays: 30,
    },
    advancedAgents: {
      eventIntelligence: {
        enabled: false,
        breakingNews: true,
        eventImpact: true,
      },
      pollingStatistical: {
        enabled: false,
        pollingIntelligence: true,
        historicalPattern: true,
      },
      sentimentNarrative: {
        enabled: false,
        mediaSentiment: true,
        socialSentiment: true,
        narrativeVelocity: true,
      },
      priceAction: {
        enabled: false,
        momentum: true,
        meanReversion: true,
        minVolumeThreshold: 1000,
      },
      eventScenario: {
        enabled: false,
        catalyst: true,
        tailRisk: true,
      },
      riskPhilosophy: {
        enabled: false,
        aggressive: true,
        conservative: true,
        neutral: true,
      },
    },
    externalData: {
      news: {
        provider: 'none',
        cacheTTL: 900,
        maxArticles: 20,
      },
      polling: {
        provider: 'none',
        cacheTTL: 3600,
      },
      social: {
        providers: [],
        cacheTTL: 300,
        maxMentions: 100,
      },
    },
    newsData: {
      enabled: false,
      rateLimiting: {
        requestsPerWindow: 100,
        windowSizeMs: 900000,
        dailyQuota: 1000,
      },
      cache: {
        enabled: true,
        ttl: {
          latest: 300,
          crypto: 300,
          market: 300,
          archive: 1800,
        },
        maxSize: 1000,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 60000,
      },
      agentTools: {
        enabled: true,
        defaultParams: {},
        maxRequestsPerHour: 10,
      },
    },
    signalFusion: {
      baseWeights: {
        'market_microstructure': 1.0,
        'probability_baseline': 1.0,
        'risk_assessment': 1.0,
        'breaking_news': 1.2,
        'event_impact': 1.2,
        'polling_intelligence': 1.5,
        'historical_pattern': 1.0,
        'media_sentiment': 0.8,
        'social_sentiment': 0.8,
        'narrative_velocity': 0.8,
        'momentum': 1.0,
        'mean_reversion': 1.0,
        'catalyst': 1.0,
        'tail_risk': 1.0,
      },
      contextAdjustments: true,
      conflictThreshold: 0.20,
      alignmentBonus: 0.20,
    },
    costOptimization: {
      maxCostPerAnalysis: 2.0,
      skipLowImpactAgents: false,
      batchLLMRequests: true,
    },
    performanceTracking: {
      enabled: false,
      evaluateOnResolution: true,
      minSampleSize: 10,
    },
    pollingAgent: {
      autonomous: true,
      maxToolCalls: 5,
      timeout: 45000,
      cacheEnabled: true,
      fallbackToBasic: true,
    },
    newsAgents: {
      breakingNewsAgent: {
        autonomous: true,
        maxToolCalls: 5,
        timeout: 45000,
        cacheEnabled: true,
        fallbackToBasic: true,
      },
      mediaSentimentAgent: {
        autonomous: true,
        maxToolCalls: 5,
        timeout: 45000,
        cacheEnabled: true,
        fallbackToBasic: true,
      },
      marketMicrostructureAgent: {
        autonomous: true,
        maxToolCalls: 5,
        timeout: 45000,
        cacheEnabled: true,
        fallbackToBasic: true,
      },
    },
    memorySystem: {
      enabled: false,
      maxSignalsPerAgent: 3,
      queryTimeoutMs: 5000,
      retryAttempts: 3,
    },
    workflowService: {
      timeoutMs: 120000,
    },
  };
}

/**
 * Get the current environment-specific configuration for events API
 * 
 * @param config - The engine configuration
 * @returns Environment-specific configuration for the current environment
 */
export function getCurrentEnvironmentConfig(config: EngineConfig) {
  const currentEnv = config.polymarket.environment;
  const envConfig = config.polymarket.environmentConfigs?.[currentEnv];
  
  if (!envConfig) {
    console.warn(`[Config] No environment configuration found for '${currentEnv}', using defaults`);
    return config.polymarket.environmentConfigs?.development || {
      eventsApiRateLimit: 100,
      maxRequestsPerMinute: 30,
      eventCacheTTL: 60,
      enableDebugLogging: true,
      enableMockData: false,
    };
  }
  
  return envConfig;
}

/**
 * Validate environment-specific configuration
 * 
 * @param config - The engine configuration
 * @returns Validation result with any errors
 */
export function validateEnvironmentConfig(config: EngineConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const currentEnv = config.polymarket.environment;
  const envConfig = config.polymarket.environmentConfigs?.[currentEnv];
  
  if (!envConfig) {
    errors.push(`Missing environment configuration for '${currentEnv}'`);
    return { valid: false, errors };
  }
  
  // Validate rate limits are reasonable
  if (envConfig.eventsApiRateLimit && envConfig.eventsApiRateLimit < 1) {
    errors.push(`Events API rate limit must be at least 1, got ${envConfig.eventsApiRateLimit}`);
  }
  
  if (envConfig.maxRequestsPerMinute && envConfig.maxRequestsPerMinute < 1) {
    errors.push(`Max requests per minute must be at least 1, got ${envConfig.maxRequestsPerMinute}`);
  }
  
  if (envConfig.eventCacheTTL && envConfig.eventCacheTTL < 1) {
    errors.push(`Event cache TTL must be at least 1 second, got ${envConfig.eventCacheTTL}`);
  }
  
  // Validate production environment has appropriate settings
  if (currentEnv === 'production') {
    if (envConfig.enableDebugLogging) {
      errors.push('Debug logging should be disabled in production environment');
    }
    
    if (envConfig.enableMockData) {
      errors.push('Mock data should be disabled in production environment');
    }
    
    if (envConfig.eventsApiRateLimit && envConfig.eventsApiRateLimit < 100) {
      errors.push(`Production events API rate limit seems too low: ${envConfig.eventsApiRateLimit}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
