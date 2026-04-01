/**
 * LLM Factory Utility
 * 
 * Provides consistent LLM instance creation that respects single/multi LLM mode configuration.
 * This ensures all agents use the correct LLM provider based on the configuration.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatBedrockConverse } from '@langchain/aws';
import type { EngineConfig } from '../config/index.js';
import { BedrockClient } from './bedrock-client.js';
import type { LLMConfig, NovaConfig } from '../config/llm-config.js';

/**
 * Type for supported LLM instances
 * Note: ChatBedrockConverse supports tool calling for Nova models via the Converse API
 */
export type LLMInstance = ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI | ChatBedrockConverse;

/**
 * Type guard to check if an LLM instance supports structured output
 */
export function supportsStructuredOutput(llm: LLMInstance): llm is ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI | ChatBedrockConverse {
  return 'withStructuredOutput' in llm && typeof (llm as any).withStructuredOutput === 'function';
}

/**
 * LLM provider types
 */
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'nova';

/**
 * Create an LLM instance respecting single/multi provider mode
 * 
 * @param config - Engine configuration
 * @param preferredProvider - Preferred provider (ignored in single mode)
 * @param fallbackProviders - Fallback providers in order of preference (ignored in single mode)
 * @returns LLM instance
 */
export function createLLMInstance(
  config: EngineConfig,
  preferredProvider: LLMProvider = 'openai',
  fallbackProviders: LLMProvider[] = ['anthropic', 'google']
): LLMInstance {
  // Single provider mode: use the configured single provider for all agents
  if (config.llm.singleProvider) {
    const provider = config.llm.singleProvider;
    
    if (provider === 'openai' && config.llm.openai) {
      return new ChatOpenAI({
        apiKey: config.llm.openai.apiKey,
        model: config.llm.openai.defaultModel,
      });
    } else if (provider === 'anthropic' && config.llm.anthropic) {
      return new ChatAnthropic({
        apiKey: config.llm.anthropic.apiKey,
        model: config.llm.anthropic.defaultModel,
      });
    } else if (provider === 'google' && config.llm.google) {
      return new ChatGoogleGenerativeAI({
        apiKey: config.llm.google.apiKey,
        model: config.llm.google.defaultModel,
      });
    } else if (provider === 'nova' && config.llm.nova) {
      const bedrockClient = new BedrockClient({
        modelId: config.llm.nova.modelName,
        region: config.llm.nova.awsRegion,
        temperature: config.llm.nova.temperature,
        maxTokens: config.llm.nova.maxTokens,
        topP: config.llm.nova.topP,
        credentials: config.llm.nova.awsAccessKeyId && config.llm.nova.awsSecretAccessKey
          ? {
              accessKeyId: config.llm.nova.awsAccessKeyId,
              secretAccessKey: config.llm.nova.awsSecretAccessKey,
            }
          : undefined,
      });
      return bedrockClient.createChatModel();
    } else {
      throw new Error(`Single provider mode configured for '${provider}' but provider not available`);
    }
  }

  // Multi-provider mode: use preferred provider with fallbacks
  const providers = [preferredProvider, ...fallbackProviders];
  
  for (const provider of providers) {
    if (provider === 'openai' && config.llm.openai) {
      return new ChatOpenAI({
        apiKey: config.llm.openai.apiKey,
        model: config.llm.openai.defaultModel,
      });
    } else if (provider === 'anthropic' && config.llm.anthropic) {
      return new ChatAnthropic({
        apiKey: config.llm.anthropic.apiKey,
        model: config.llm.anthropic.defaultModel,
      });
    } else if (provider === 'google' && config.llm.google) {
      return new ChatGoogleGenerativeAI({
        apiKey: config.llm.google.apiKey,
        model: config.llm.google.defaultModel,
      });
    } else if (provider === 'nova' && config.llm.nova) {
      const bedrockClient = new BedrockClient({
        modelId: config.llm.nova.modelName,
        region: config.llm.nova.awsRegion,
        temperature: config.llm.nova.temperature,
        maxTokens: config.llm.nova.maxTokens,
        topP: config.llm.nova.topP,
        credentials: config.llm.nova.awsAccessKeyId && config.llm.nova.awsSecretAccessKey
          ? {
              accessKeyId: config.llm.nova.awsAccessKeyId,
              secretAccessKey: config.llm.nova.awsSecretAccessKey,
            }
          : undefined,
      });
      return bedrockClient.createChatModel();
    }
  }

  throw new Error(`No available LLM providers found. Tried: ${providers.join(', ')}`);
}

/**
 * Get the effective provider being used (useful for logging/debugging)
 */
export function getEffectiveProvider(
  config: EngineConfig,
  preferredProvider: LLMProvider = 'openai',
  fallbackProviders: LLMProvider[] = ['anthropic', 'google']
): LLMProvider {
  if (config.llm.singleProvider) {
    return config.llm.singleProvider;
  }

  const providers = [preferredProvider, ...fallbackProviders];
  
  for (const provider of providers) {
    if (provider === 'openai' && config.llm.openai) return 'openai';
    if (provider === 'anthropic' && config.llm.anthropic) return 'anthropic';
    if (provider === 'google' && config.llm.google) return 'google';
    if (provider === 'nova' && config.llm.nova) return 'nova';
  }

  throw new Error(`No available LLM providers found. Tried: ${providers.join(', ')}`);
}

/**
 * Create LLM instances for multiple agents based on LLMConfigManager configuration
 * 
 * This function supports mixed-provider configurations where different agents
 * can use different LLM providers (including Nova).
 * 
 * @param agentConfig - Agent-specific LLM configuration from LLMConfigManager
 * @returns Map of agent names to LLM instances
 */
export function createAgentLLMs(agentConfig: {
  newsAgent?: LLMConfig;
  pollingAgent?: LLMConfig;
  marketAgent?: LLMConfig;
  sentimentAgent?: LLMConfig;
  riskAgent?: LLMConfig;
  thesisAgent?: LLMConfig;
  crossExamAgent?: LLMConfig;
  consensusAgent?: LLMConfig;
  recommendationAgent?: LLMConfig;
  default?: LLMConfig;
}): Map<string, LLMInstance> {
  const llmMap = new Map<string, LLMInstance>();

  // Helper function to create LLM from LLMConfig
  const createFromConfig = (config: LLMConfig): LLMInstance => {
    switch (config.provider) {
      case 'openai':
        return new ChatOpenAI({
          apiKey: config.apiKey,
          model: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });

      case 'anthropic':
        return new ChatAnthropic({
          apiKey: config.apiKey,
          model: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });

      case 'google':
        return new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: config.modelName,
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        });

      case 'nova': {
        const novaConfig = config as NovaConfig;
        const bedrockClient = new BedrockClient({
          modelId: novaConfig.modelName,
          region: novaConfig.awsRegion,
          temperature: novaConfig.temperature,
          maxTokens: novaConfig.maxTokens,
          topP: novaConfig.topP,
          credentials: novaConfig.awsAccessKeyId && novaConfig.awsSecretAccessKey
            ? {
                accessKeyId: novaConfig.awsAccessKeyId,
                secretAccessKey: novaConfig.awsSecretAccessKey,
              }
            : undefined,
        });
        return bedrockClient.createChatModel();
      }

      default:
        throw new Error(`Unsupported provider: ${(config as any).provider}`);
    }
  };

  // Create LLM instances for each agent, falling back to default if not specified
  const agents = [
    'news',
    'polling',
    'market',
    'sentiment',
    'risk',
    'thesis',
    'crossExam',
    'consensus',
    'recommendation',
  ];

  for (const agent of agents) {
    const agentKey = `${agent}Agent` as keyof typeof agentConfig;
    const config = agentConfig[agentKey] || agentConfig.default;

    if (config) {
      llmMap.set(agent, createFromConfig(config));
    }
  }

  // Ensure at least one LLM is configured
  if (llmMap.size === 0) {
    throw new Error('No LLM configuration available. At least one agent or default configuration must be provided.');
  }

  return llmMap;
}

/**
 * Validate LLM configuration before instantiation
 * 
 * Checks that the configuration is valid and all required fields are present.
 * 
 * @param config - LLM configuration to validate
 * @returns Validation result with errors if any
 */
export function validateLLMConfig(config: LLMConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) errors.push('OpenAI API key is required');
      if (!config.modelName) errors.push('OpenAI model name is required');
      break;

    case 'anthropic':
      if (!config.apiKey) errors.push('Anthropic API key is required');
      if (!config.modelName) errors.push('Anthropic model name is required');
      break;

    case 'google':
      if (!config.apiKey) errors.push('Google API key is required');
      if (!config.modelName) errors.push('Google model name is required');
      break;

    case 'nova': {
      const novaConfig = config as NovaConfig;
      if (!novaConfig.awsRegion) errors.push('AWS region is required for Nova');
      if (!novaConfig.modelName) errors.push('Nova model name is required');
      
      // Validate model name is a valid Nova model
      if (novaConfig.modelName && !BedrockClient.validateModelId(novaConfig.modelName)) {
        const validModels = BedrockClient.getAvailableModels().map(m => m.modelId);
        errors.push(`Invalid Nova model name. Valid options: ${validModels.join(', ')}`);
      }

      // Check temperature range
      if (novaConfig.temperature !== undefined && (novaConfig.temperature < 0 || novaConfig.temperature > 1)) {
        errors.push('Nova temperature must be between 0 and 1');
      }

      // Check topP range
      if (novaConfig.topP !== undefined && (novaConfig.topP < 0 || novaConfig.topP > 1)) {
        errors.push('Nova topP must be between 0 and 1');
      }
      break;
    }

    default:
      errors.push(`Unknown provider: ${(config as any).provider}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default configuration for a provider
 * 
 * Returns sensible defaults for optional parameters.
 * 
 * @param provider - LLM provider
 * @returns Partial configuration with defaults
 */
export function getDefaultConfig(provider: LLMProvider): Partial<LLMConfig> {
  switch (provider) {
    case 'openai':
      return {
        provider: 'openai',
        modelName: 'gpt-4-turbo',
        temperature: 0.7,
      };

    case 'anthropic':
      return {
        provider: 'anthropic',
        modelName: 'claude-3-sonnet-20240229',
        temperature: 0.7,
      };

    case 'google':
      return {
        provider: 'google',
        modelName: 'gemini-1.5-flash',
        temperature: 0.7,
      };

    case 'nova':
      return {
        provider: 'nova',
        modelName: 'amazon.nova-lite-v1:0',
        temperature: 0.7,
      };

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
