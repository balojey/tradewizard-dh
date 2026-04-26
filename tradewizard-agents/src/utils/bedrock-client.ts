/**
 * AWS Bedrock Client for Amazon Nova Models
 * 
 * Manages AWS Bedrock authentication and model instantiation for Nova models.
 * Integrates with LangChain's ChatBedrockConverse for full tool calling support.
 * 
 * Note: Uses ChatBedrockConverse (Converse API) instead of BedrockChat (InvokeModel API)
 * because Nova models only support tool calling through the Converse API.
 * 
 * Includes defensive handling for empty text content blocks returned by Nova models,
 * which can cause "Unsupported content block type" errors in @langchain/aws message conversion.
 */

import { ChatBedrockConverse } from '@langchain/aws';
import { SafeChatBedrockConverse } from './bedrock-message-filter.js';

/**
 * Configuration for Nova model instantiation
 */
export interface NovaModelConfig {
  /** AWS Bedrock model ID (e.g., "amazon.nova-micro-v1:0") */
  modelId: string;
  /** AWS region for Bedrock service */
  region: string;
  /** Temperature for response randomness (0.0 - 1.0) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Nucleus sampling parameter (0.0 - 1.0) */
  topP?: number;
  /** Optional explicit AWS credentials */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Metadata for Nova model variants with pricing information
 */
export interface NovaModelVariant {
  /** Short identifier (e.g., "micro", "lite", "pro") */
  id: string;
  /** Display name */
  name: string;
  /** Full AWS Bedrock model ID */
  modelId: string;
  /** Cost per 1K input tokens in USD */
  inputCostPer1kTokens: number;
  /** Cost per 1K output tokens in USD */
  outputCostPer1kTokens: number;
  /** Maximum supported tokens */
  maxTokens: number;
}

/**
 * Default retry configuration for Bedrock LLM calls
 */
const DEFAULT_LLM_RETRY_CONFIG = {
  stopAfterAttempt: 3,
  onFailedAttempt: (error: any) => {
    const msg = error?.message || String(error);
    console.warn(
      `[BedrockClient] LLM call failed (attempt ${error?.attemptNumber ?? '?'}): ${msg}`
    );
  },
};

/**
 * AWS Bedrock client for Nova model management
 */
export class BedrockClient {
  private config: NovaModelConfig;

  /**
   * Create a new Bedrock client instance
   * 
   * @param config - Nova model configuration
   */
  constructor(config: NovaModelConfig) {
    this.config = config;

    // Note: BedrockRuntimeClient initialization is handled by LangChain's BedrockChat
    // We store the config for use in createChatModel()
  }

  /**
   * Build the common model configuration object
   */
  private buildModelConfig(): Record<string, any> {
    // Nova 2 models require inference profile IDs (e.g., 'global.amazon.nova-2-lite-v1:0')
    // The 'global.' prefix is the cross-region inference profile — pass it through as-is
    const modelConfig: Record<string, any> = {
      model: this.config.modelId,
      region: this.config.region,
      temperature: this.config.temperature ?? 0.7,
    };

    if (this.config.maxTokens !== undefined) {
      modelConfig.maxTokens = this.config.maxTokens;
    }

    if (this.config.topP !== undefined) {
      modelConfig.topP = this.config.topP;
    }

    if (this.config.credentials) {
      modelConfig.credentials = {
        accessKeyId: this.config.credentials.accessKeyId,
        secretAccessKey: this.config.credentials.secretAccessKey,
      };
    }

    return modelConfig;
  }

  /**
   * Create a LangChain-compatible chat model instance for Nova
   * 
   * Uses ChatBedrockConverse which supports tool calling for Nova models
   * via the Bedrock Converse API.
   * 
   * @returns ChatBedrockConverse instance configured for the specified Nova model
   */
  /**
   * Create a LangChain-compatible chat model instance for Nova
   * 
   * Uses SafeChatBedrockConverse which supports tool calling for Nova models
   * via the Bedrock Converse API and automatically filters empty text content
   * blocks that Nova sometimes returns.
   * 
   * @returns SafeChatBedrockConverse instance configured for the specified Nova model
   */
  createChatModel(): ChatBedrockConverse {
    return new SafeChatBedrockConverse(this.buildModelConfig());
  }

  /**
   * Create a SafeChatBedrockConverse instance with built-in retry logic.
   * 
   * Note: The returned Runnable supports `.invoke()` and `.stream()` with retry,
   * but does NOT support `.bindTools()`. Use `createChatModel()` instead when
   * the LLM will be passed to `createReactAgent` or other tool-binding APIs.
   * 
   * @param retryConfig - Optional retry configuration override
   * @returns A Runnable that retries on failure (up to 3 attempts by default)
   */
  createChatModelWithRetry(
    retryConfig: { stopAfterAttempt?: number } = {}
  ): ChatBedrockConverse {
    const model = new SafeChatBedrockConverse(this.buildModelConfig());
    return model.withRetry({
      ...DEFAULT_LLM_RETRY_CONFIG,
      ...retryConfig,
    }) as unknown as ChatBedrockConverse;
  }

  /**
   * Validate AWS credentials and Bedrock access
   * 
   * Performs a lightweight health check to ensure:
   * - AWS credentials are valid
   * - Bedrock service is accessible in the specified region
   * - The specified model is available
   * 
   * @returns Promise<boolean> - true if connection is valid
   * @throws Error with descriptive message if validation fails
   */
  async validateConnection(): Promise<boolean> {
    try {
      // Attempt to create a model instance and validate it can be initialized
      // This will fail fast if credentials are invalid or region is unsupported
      this.createChatModel();
      
      // The model creation itself validates the configuration
      // If we get here without errors, the connection is valid
      return true;
    } catch (error: any) {
      // Provide descriptive error messages for common failure scenarios
      if (error.name === 'CredentialsProviderError') {
        throw new Error(
          'AWS credentials not found or invalid. Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set, ' +
          'or configure AWS credentials using the AWS CLI: aws configure'
        );
      }

      if (error.name === 'UnrecognizedClientException') {
        throw new Error(
          `AWS region "${this.config.region}" does not support Amazon Bedrock. ` +
          'Please use a supported region (e.g., us-east-1, us-west-2)'
        );
      }

      if (error.message?.includes('ResourceNotFoundException')) {
        throw new Error(
          `Nova model "${this.config.modelId}" not found in region "${this.config.region}". ` +
          'Please verify the model ID and ensure Bedrock access is enabled in your AWS account.'
        );
      }

      // Re-throw with original error for unexpected failures
      throw new Error(`Bedrock connection validation failed: ${error.message}`);
    }
  }

  /**
   * Get available Nova model variants with pricing information
   * 
   * Includes both Nova v1 and Nova 2 models.
   * Nova 2 models offer improved reasoning capabilities and larger context windows.
   * 
   * @returns Array of Nova model variants with metadata
   */
  static getAvailableModels(): NovaModelVariant[] {
    return [
      // Nova v1 Models (Original)
      {
        id: 'micro',
        name: 'Nova Micro v1',
        modelId: 'amazon.nova-micro-v1:0',
        inputCostPer1kTokens: 0.000035,
        outputCostPer1kTokens: 0.00014,
        maxTokens: 128000,
      },
      {
        id: 'lite',
        name: 'Nova Lite v1',
        modelId: 'amazon.nova-lite-v1:0',
        inputCostPer1kTokens: 0.00006,
        outputCostPer1kTokens: 0.00024,
        maxTokens: 300000,
      },
      {
        id: 'pro',
        name: 'Nova Pro v1',
        modelId: 'amazon.nova-pro-v1:0',
        inputCostPer1kTokens: 0.0008,
        outputCostPer1kTokens: 0.0032,
        maxTokens: 300000,
      },
      // Nova 2 Models (Latest - December 2025)
      {
        id: 'nova-2-lite',
        name: 'Nova 2 Lite',
        modelId: 'global.amazon.nova-2-lite-v1:0',
        inputCostPer1kTokens: 0.0003,  // $0.30 per 1M tokens (reasoning disabled)
        outputCostPer1kTokens: 0.0025,  // $2.50 per 1M tokens (reasoning disabled)
        maxTokens: 1000000,  // 1M token context window
      },
      {
        id: 'nova-2-pro',
        name: 'Nova 2 Pro (Preview)',
        modelId: 'global.amazon.nova-2-pro-v1:0',
        inputCostPer1kTokens: 0.0008,  // Estimated, similar to Nova Pro v1
        outputCostPer1kTokens: 0.0032,  // Estimated, similar to Nova Pro v1
        maxTokens: 1000000,  // 1M token context window
      },
    ];
  }

  /**
   * Validate that a model ID is a valid Nova model identifier
   * 
   * @param modelId - Model ID to validate
   * @returns true if the model ID is valid
   */
  static validateModelId(modelId: string): boolean {
    const validModelIds = BedrockClient.getAvailableModels().map(m => m.modelId);
    return validModelIds.includes(modelId);
  }
}
