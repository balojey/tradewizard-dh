import { z } from 'zod';

/**
 * LLM Configuration Manager
 * 
 * Centralized configuration loading and validation for all LLM providers including Nova.
 * Supports both single-provider and multi-provider modes with agent-specific overrides.
 */

// ============================================================================
// Zod Schemas for LLM Configuration
// ============================================================================

/**
 * Nova model variant schema
 * Defines all available Amazon Nova models through AWS Bedrock
 * Includes both Nova v1 (original) and Nova 2 (latest) models
 */
export const NovaModelVariantSchema = z.enum([
  // Nova v1 Models
  'amazon.nova-micro-v1:0',
  'amazon.nova-lite-v1:0',
  'amazon.nova-pro-v1:0',
  // Nova 2 Models (December 2025)
  'global.amazon.nova-2-lite-v1:0',
  'global.amazon.nova-2-pro-v1:0',
]);

export type NovaModelVariant = z.infer<typeof NovaModelVariantSchema>;

/**
 * Nova-specific configuration schema
 * Includes AWS credentials and Nova model parameters
 */
export const NovaConfigSchema = z.object({
  provider: z.literal('nova'),
  modelName: NovaModelVariantSchema,
  temperature: z.number().min(0).max(1).optional().default(0.7),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  awsRegion: z.string().min(1),
  awsAccessKeyId: z.string().min(1).optional(),
  awsSecretAccessKey: z.string().min(1).optional(),
});

export type NovaConfig = z.infer<typeof NovaConfigSchema>;

/**
 * OpenAI configuration schema
 */
export const OpenAIConfigSchema = z.object({
  provider: z.literal('openai'),
  modelName: z.string().min(1),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().positive().optional(),
  apiKey: z.string().min(1),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

/**
 * Anthropic configuration schema
 */
export const AnthropicConfigSchema = z.object({
  provider: z.literal('anthropic'),
  modelName: z.string().min(1),
  temperature: z.number().min(0).max(1).optional().default(0.7),
  maxTokens: z.number().positive().optional(),
  apiKey: z.string().min(1),
});

export type AnthropicConfig = z.infer<typeof AnthropicConfigSchema>;

/**
 * Google configuration schema
 */
export const GoogleConfigSchema = z.object({
  provider: z.literal('google'),
  modelName: z.string().min(1),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().positive().optional(),
  apiKey: z.string().min(1),
});

export type GoogleConfig = z.infer<typeof GoogleConfigSchema>;

/**
 * Discriminated union of all LLM provider configurations
 */
export const LLMConfigSchema = z.discriminatedUnion('provider', [
  OpenAIConfigSchema,
  AnthropicConfigSchema,
  GoogleConfigSchema,
  NovaConfigSchema,
]);

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * LLM provider type
 */
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'nova';

/**
 * Agent-specific LLM configuration schema
 * Allows different LLM providers for different agents
 */
export const AgentLLMConfigSchema = z.object({
  newsAgent: LLMConfigSchema.optional(),
  pollingAgent: LLMConfigSchema.optional(),
  marketAgent: LLMConfigSchema.optional(),
  sentimentAgent: LLMConfigSchema.optional(),
  riskAgent: LLMConfigSchema.optional(),
  thesisAgent: LLMConfigSchema.optional(),
  crossExamAgent: LLMConfigSchema.optional(),
  consensusAgent: LLMConfigSchema.optional(),
  recommendationAgent: LLMConfigSchema.optional(),
  default: LLMConfigSchema.optional(),
});

export type AgentLLMConfig = z.infer<typeof AgentLLMConfigSchema>;

/**
 * Environment configuration interface
 */
export interface EnvironmentConfig {
  // Nova configuration
  NOVA_MODEL_NAME?: string;
  NOVA_TEMPERATURE?: string;
  NOVA_MAX_TOKENS?: string;
  NOVA_TOP_P?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;

  // Existing provider configs
  OPENAI_API_KEY?: string;
  OPENAI_DEFAULT_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_DEFAULT_MODEL?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_DEFAULT_MODEL?: string;

  // Multi-provider mode
  USE_MULTI_PROVIDER?: string;
  PRIMARY_PROVIDER?: string;
  LLM_SINGLE_PROVIDER?: string;

  // Agent-specific overrides
  NEWS_AGENT_PROVIDER?: string;
  NEWS_AGENT_MODEL?: string;
  POLLING_AGENT_PROVIDER?: string;
  POLLING_AGENT_MODEL?: string;
  MARKET_AGENT_PROVIDER?: string;
  MARKET_AGENT_MODEL?: string;
  SENTIMENT_AGENT_PROVIDER?: string;
  SENTIMENT_AGENT_MODEL?: string;
  RISK_AGENT_PROVIDER?: string;
  RISK_AGENT_MODEL?: string;
  THESIS_AGENT_PROVIDER?: string;
  THESIS_AGENT_MODEL?: string;
  CROSS_EXAM_AGENT_PROVIDER?: string;
  CROSS_EXAM_AGENT_MODEL?: string;
  CONSENSUS_AGENT_PROVIDER?: string;
  CONSENSUS_AGENT_MODEL?: string;
  RECOMMENDATION_AGENT_PROVIDER?: string;
  RECOMMENDATION_AGENT_MODEL?: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ============================================================================
// LLM Configuration Manager
// ============================================================================

/**
 * LLMConfigManager
 * 
 * Centralized manager for loading, validating, and resolving LLM configurations
 * across all providers including Amazon Nova.
 */
export class LLMConfigManager {
  /**
   * Load LLM configuration from environment variables
   * 
   * Supports three modes:
   * 1. Single-provider mode: LLM_SINGLE_PROVIDER or PRIMARY_PROVIDER set
   * 2. Multi-provider mode: Multiple providers configured
   * 3. Agent-specific mode: Per-agent provider overrides
   * 
   * @returns AgentLLMConfig with resolved configurations
   */
  static loadFromEnvironment(): AgentLLMConfig {
    const env = process.env as EnvironmentConfig;

    // Determine primary provider
    const primaryProvider = env.LLM_SINGLE_PROVIDER || env.PRIMARY_PROVIDER;

    // Load default configuration based on primary provider or multi-provider mode
    let defaultConfig: LLMConfig | undefined;

    if (primaryProvider) {
      // Single-provider mode
      defaultConfig = this.loadProviderConfig(primaryProvider as LLMProvider, env);
    } else {
      // Multi-provider mode: try to load any available provider as default
      defaultConfig =
        this.loadProviderConfig('openai', env) ||
        this.loadProviderConfig('anthropic', env) ||
        this.loadProviderConfig('google', env) ||
        this.loadProviderConfig('nova', env);
    }

    // Load agent-specific configurations
    const config: AgentLLMConfig = {
      default: defaultConfig,
      newsAgent: this.loadAgentConfig('NEWS_AGENT', env, defaultConfig),
      pollingAgent: this.loadAgentConfig('POLLING_AGENT', env, defaultConfig),
      marketAgent: this.loadAgentConfig('MARKET_AGENT', env, defaultConfig),
      sentimentAgent: this.loadAgentConfig('SENTIMENT_AGENT', env, defaultConfig),
      riskAgent: this.loadAgentConfig('RISK_AGENT', env, defaultConfig),
      thesisAgent: this.loadAgentConfig('THESIS_AGENT', env, defaultConfig),
      crossExamAgent: this.loadAgentConfig('CROSS_EXAM_AGENT', env, defaultConfig),
      consensusAgent: this.loadAgentConfig('CONSENSUS_AGENT', env, defaultConfig),
      recommendationAgent: this.loadAgentConfig('RECOMMENDATION_AGENT', env, defaultConfig),
    };

    return config;
  }

  /**
   * Load configuration for a specific provider
   * 
   * @param provider - LLM provider name
   * @param env - Environment configuration
   * @returns LLMConfig or undefined if provider not configured
   */
  private static loadProviderConfig(
    provider: LLMProvider,
    env: EnvironmentConfig
  ): LLMConfig | undefined {
    switch (provider) {
      case 'openai':
        if (!env.OPENAI_API_KEY) return undefined;
        return {
          provider: 'openai',
          modelName: env.OPENAI_DEFAULT_MODEL || 'gpt-4-turbo',
          apiKey: env.OPENAI_API_KEY,
          temperature: 0.7,
        };

      case 'anthropic':
        if (!env.ANTHROPIC_API_KEY) return undefined;
        return {
          provider: 'anthropic',
          modelName: env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-sonnet-20240229',
          apiKey: env.ANTHROPIC_API_KEY,
          temperature: 0.7,
        };

      case 'google':
        if (!env.GOOGLE_API_KEY) return undefined;
        return {
          provider: 'google',
          modelName: env.GOOGLE_DEFAULT_MODEL || 'gemini-1.5-flash',
          apiKey: env.GOOGLE_API_KEY,
          temperature: 0.7,
        };

      case 'nova':
        if (!env.AWS_REGION) return undefined;
        return {
          provider: 'nova',
          modelName: (env.NOVA_MODEL_NAME as NovaModelVariant) || 'amazon.nova-lite-v1:0',
          awsRegion: env.AWS_REGION,
          awsAccessKeyId: env.AWS_ACCESS_KEY_ID,
          awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          temperature: env.NOVA_TEMPERATURE ? parseFloat(env.NOVA_TEMPERATURE) : 0.7,
          maxTokens: env.NOVA_MAX_TOKENS ? parseInt(env.NOVA_MAX_TOKENS, 10) : undefined,
          topP: env.NOVA_TOP_P ? parseFloat(env.NOVA_TOP_P) : undefined,
        };

      default:
        return undefined;
    }
  }

  /**
   * Load agent-specific configuration with fallback to default
   * 
   * @param agentPrefix - Agent environment variable prefix (e.g., 'NEWS_AGENT')
   * @param env - Environment configuration
   * @param defaultConfig - Default configuration to fall back to
   * @returns LLMConfig or undefined
   */
  private static loadAgentConfig(
    agentPrefix: string,
    env: EnvironmentConfig,
    defaultConfig?: LLMConfig
  ): LLMConfig | undefined {
    const providerKey = `${agentPrefix}_PROVIDER` as keyof EnvironmentConfig;
    const modelKey = `${agentPrefix}_MODEL` as keyof EnvironmentConfig;

    const provider = env[providerKey] as LLMProvider | undefined;
    const model = env[modelKey];

    if (!provider) {
      return defaultConfig;
    }

    // Load provider config and override model if specified
    const config = this.loadProviderConfig(provider, env);
    if (config && model) {
      config.modelName = model;
    }

    return config || defaultConfig;
  }

  /**
   * Validate complete LLM configuration
   * 
   * Checks that:
   * - At least one provider is configured
   * - All configured providers have valid settings
   * - Agent-specific configs are valid
   * 
   * @param config - AgentLLMConfig to validate
   * @returns ValidationResult with errors and warnings
   */
  static validate(config: AgentLLMConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if at least one provider is configured
    const hasAnyConfig =
      config.default ||
      config.newsAgent ||
      config.pollingAgent ||
      config.marketAgent ||
      config.sentimentAgent ||
      config.riskAgent ||
      config.thesisAgent ||
      config.crossExamAgent ||
      config.consensusAgent ||
      config.recommendationAgent;

    if (!hasAnyConfig) {
      errors.push('No LLM provider configured. At least one provider must be configured.');
      return { valid: false, errors, warnings };
    }

    // Validate each configured provider
    const configs = [
      config.default,
      config.newsAgent,
      config.pollingAgent,
      config.marketAgent,
      config.sentimentAgent,
      config.riskAgent,
      config.thesisAgent,
      config.crossExamAgent,
      config.consensusAgent,
      config.recommendationAgent,
    ].filter((c): c is LLMConfig => c !== undefined);

    for (const llmConfig of configs) {
      try {
        LLMConfigSchema.parse(llmConfig);
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(
            `Invalid ${llmConfig.provider} configuration: ${error.issues
              .map((e: z.ZodIssue) => e.message)
              .join(', ')}`
          );
        }
      }
    }

    // Warn if using mixed providers (not an error, but worth noting)
    const providers = new Set(configs.map((c) => c.provider));
    if (providers.size > 1) {
      warnings.push(
        `Using multiple providers: ${Array.from(providers).join(', ')}. This increases cost but may improve quality.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get configuration for a specific agent
   * 
   * Returns agent-specific config if available, otherwise falls back to default
   * 
   * @param agentName - Name of the agent
   * @param config - AgentLLMConfig
   * @returns LLMConfig for the agent
   * @throws Error if no configuration available for agent
   */
  static getAgentConfig(agentName: string, config: AgentLLMConfig): LLMConfig {
    const agentKey = `${agentName}Agent` as keyof AgentLLMConfig;
    const agentConfig = config[agentKey];

    if (agentConfig) {
      return agentConfig;
    }

    if (config.default) {
      return config.default;
    }

    throw new Error(
      `No LLM configuration available for agent '${agentName}'. Configure a default provider or agent-specific provider.`
    );
  }

  /**
   * Check if Nova is configured
   * 
   * @returns true if Nova provider is configured
   */
  static isNovaConfigured(): boolean {
    const env = process.env as EnvironmentConfig;
    return !!env.AWS_REGION;
  }

  /**
   * Get missing required environment variables for Nova
   * 
   * @returns Array of missing variable names
   */
  static getMissingNovaVariables(): string[] {
    const env = process.env as EnvironmentConfig;
    const missing: string[] = [];

    if (!env.AWS_REGION) {
      missing.push('AWS_REGION');
    }

    // AWS credentials are optional if using default credential chain
    // but we'll warn if neither explicit credentials nor default chain is available
    if (!env.AWS_ACCESS_KEY_ID && !env.AWS_SECRET_ACCESS_KEY) {
      missing.push('AWS_ACCESS_KEY_ID or AWS default credential chain');
      missing.push('AWS_SECRET_ACCESS_KEY or AWS default credential chain');
    } else if (env.AWS_ACCESS_KEY_ID && !env.AWS_SECRET_ACCESS_KEY) {
      missing.push('AWS_SECRET_ACCESS_KEY');
    } else if (!env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      missing.push('AWS_ACCESS_KEY_ID');
    }

    return missing;
  }

  /**
   * Get missing required variables for any provider
   * 
   * @returns Array of missing variable names
   */
  static getMissingVariables(): string[] {
    const env = process.env as EnvironmentConfig;
    const missing: string[] = [];

    // Check if any provider is configured
    const hasOpenAI = !!env.OPENAI_API_KEY;
    const hasAnthropic = !!env.ANTHROPIC_API_KEY;
    const hasGoogle = !!env.GOOGLE_API_KEY;
    const hasNova = !!env.AWS_REGION;

    if (!hasOpenAI && !hasAnthropic && !hasGoogle && !hasNova) {
      missing.push('At least one LLM provider must be configured:');
      missing.push('  - OPENAI_API_KEY for OpenAI');
      missing.push('  - ANTHROPIC_API_KEY for Anthropic');
      missing.push('  - GOOGLE_API_KEY for Google');
      missing.push('  - AWS_REGION for Amazon Nova');
    }

    return missing;
  }
}
