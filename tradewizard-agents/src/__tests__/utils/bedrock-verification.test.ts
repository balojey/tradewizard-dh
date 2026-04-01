/**
 * Verification tests for Bedrock client functionality
 * These tests verify that the implementation is complete and can be imported
 */

import { describe, it, expect } from 'vitest';
import { BedrockClient } from '../bedrock-client';
import { 
  BedrockError, 
  BedrockErrorHandler, 
  BedrockErrorCode,
  DEFAULT_RETRY_CONFIG 
} from '../bedrock-errors';

describe('Bedrock Client - Module Verification', () => {
  describe('BedrockClient', () => {
    it('should be importable and instantiable', () => {
      const config = {
        modelId: 'amazon.nova-lite-v1:0',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      };

      const client = new BedrockClient(config);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(BedrockClient);
    });

    it('should provide available models metadata', () => {
      const models = BedrockClient.getAvailableModels();
      
      // Should include both Nova v1 (3 models) and Nova 2 (2 models)
      expect(models).toHaveLength(5);
      expect(models[0].id).toBe('micro');
      expect(models[1].id).toBe('lite');
      expect(models[2].id).toBe('pro');
      expect(models[3].id).toBe('nova-2-lite');
      expect(models[4].id).toBe('nova-2-pro');
      
      // Verify pricing information is present
      models.forEach(model => {
        expect(model.inputCostPer1kTokens).toBeGreaterThan(0);
        expect(model.outputCostPer1kTokens).toBeGreaterThan(0);
        expect(model.maxTokens).toBeGreaterThan(0);
      });
    });

    it('should validate model IDs correctly', () => {
      // Nova v1 models
      expect(BedrockClient.validateModelId('amazon.nova-micro-v1:0')).toBe(true);
      expect(BedrockClient.validateModelId('amazon.nova-lite-v1:0')).toBe(true);
      expect(BedrockClient.validateModelId('amazon.nova-pro-v1:0')).toBe(true);
      // Nova 2 models
      expect(BedrockClient.validateModelId('global.amazon.nova-2-lite-v1:0')).toBe(true);
      expect(BedrockClient.validateModelId('global.amazon.nova-2-pro-v1:0')).toBe(true);
      // Invalid model
      expect(BedrockClient.validateModelId('invalid-model')).toBe(false);
    });

    it('should create chat model with default parameters', () => {
      const config = {
        modelId: 'amazon.nova-lite-v1:0',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      };

      const client = new BedrockClient(config);
      const model = client.createChatModel();
      
      expect(model).toBeDefined();
    });

    it('should create chat model with custom parameters', () => {
      const config = {
        modelId: 'amazon.nova-pro-v1:0',
        region: 'us-west-2',
        temperature: 0.5,
        maxTokens: 4096,
        topP: 0.9,
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      };

      const client = new BedrockClient(config);
      const model = client.createChatModel();
      
      expect(model).toBeDefined();
    });
  });

  describe('BedrockError', () => {
    it('should be importable and instantiable', () => {
      const error = new BedrockError(
        BedrockErrorCode.AUTHENTICATION_FAILED,
        'Test error message'
      );

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BedrockError);
      expect(error.code).toBe(BedrockErrorCode.AUTHENTICATION_FAILED);
    });

    it('should correctly identify retryable errors', () => {
      const rateLimitError = new BedrockError(
        BedrockErrorCode.RATE_LIMIT_EXCEEDED,
        'Rate limit exceeded'
      );
      expect(rateLimitError.shouldRetry()).toBe(true);

      const serviceError = new BedrockError(
        BedrockErrorCode.SERVICE_UNAVAILABLE,
        'Service unavailable'
      );
      expect(serviceError.shouldRetry()).toBe(true);

      const authError = new BedrockError(
        BedrockErrorCode.AUTHENTICATION_FAILED,
        'Auth failed'
      );
      expect(authError.shouldRetry()).toBe(false);
    });

    it('should provide user-friendly error messages', () => {
      const error = new BedrockError(
        BedrockErrorCode.AUTHENTICATION_FAILED,
        'Auth failed'
      );

      const userMessage = error.getUserMessage();
      expect(userMessage).toContain('AWS authentication failed');
      expect(userMessage).toContain('AWS_ACCESS_KEY_ID');
      expect(userMessage).toContain('bedrock:InvokeModel');
    });

    it('should support all error codes', () => {
      const errorCodes = [
        BedrockErrorCode.AUTHENTICATION_FAILED,
        BedrockErrorCode.RATE_LIMIT_EXCEEDED,
        BedrockErrorCode.MODEL_NOT_FOUND,
        BedrockErrorCode.INVALID_REQUEST,
        BedrockErrorCode.SERVICE_UNAVAILABLE,
        BedrockErrorCode.REGION_NOT_SUPPORTED,
      ];

      errorCodes.forEach(code => {
        const error = new BedrockError(code, 'Test message');
        expect(error.code).toBe(code);
        expect(error.getUserMessage()).toBeTruthy();
      });
    });
  });

  describe('BedrockErrorHandler', () => {
    it('should have default retry configuration', () => {
      expect(DEFAULT_RETRY_CONFIG).toBeDefined();
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
    });

    it('should convert AWS errors to BedrockError', () => {
      const awsError = {
        name: 'ThrottlingException',
        message: 'Rate limit exceeded',
        $metadata: { httpStatusCode: 429 },
      };

      const bedrockError = BedrockErrorHandler.fromAWSError(awsError);
      
      expect(bedrockError).toBeInstanceOf(BedrockError);
      expect(bedrockError.code).toBe(BedrockErrorCode.RATE_LIMIT_EXCEEDED);
    });

    it('should handle various AWS error types', () => {
      const testCases = [
        {
          awsError: { name: 'UnrecognizedClientException', message: 'Invalid credentials' },
          expectedCode: BedrockErrorCode.AUTHENTICATION_FAILED,
        },
        {
          awsError: { name: 'ResourceNotFoundException', message: 'Model not found' },
          expectedCode: BedrockErrorCode.MODEL_NOT_FOUND,
        },
        {
          awsError: { name: 'ValidationException', message: 'Invalid request' },
          expectedCode: BedrockErrorCode.INVALID_REQUEST,
        },
        {
          awsError: { name: 'ServiceUnavailableException', message: 'Service down' },
          expectedCode: BedrockErrorCode.SERVICE_UNAVAILABLE,
        },
      ];

      testCases.forEach(({ awsError, expectedCode }) => {
        const bedrockError = BedrockErrorHandler.fromAWSError(awsError);
        expect(bedrockError.code).toBe(expectedCode);
      });
    });

    it('should wrap operations with error handling', async () => {
      const successOperation = async () => 'success';
      const result = await BedrockErrorHandler.withErrorHandling(
        successOperation,
        'test operation'
      );
      
      expect(result).toBe('success');
    });

    it('should convert errors in wrapped operations', async () => {
      const failingOperation = async () => {
        const error: any = new Error('Test error');
        error.name = 'ThrottlingException';
        throw error;
      };

      await expect(
        BedrockErrorHandler.withErrorHandling(failingOperation, 'test operation')
      ).rejects.toThrow(BedrockError);
    });
  });
});
