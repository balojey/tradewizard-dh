/**
 * Workflow Service HTTP Client
 *
 * This module provides an HTTP client for communicating with remote workflow services.
 * It handles request formatting, authentication, timeout management, and response validation.
 */

import type { TradeRecommendation, AgentSignal } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

/**
 * Configuration for workflow service client
 */
export interface WorkflowServiceConfig {
  url: string;
  timeoutMs: number;
  authToken?: string;
  headers?: Record<string, string>;
}

/**
 * Request payload for workflow service
 */
export interface WorkflowServiceRequest {
  conditionId: string;
}

/**
 * Response payload from workflow service
 */
export interface WorkflowServiceResponse {
  recommendation: TradeRecommendation | null;
  agentSignals: AgentSignal[];
  cost?: number;
}

/**
 * Analysis result returned by workflow service
 */
export interface AnalysisResult {
  recommendation: TradeRecommendation | null;
  agentSignals: AgentSignal[];
  cost?: number;
}

/**
 * HTTP client for workflow service communication
 *
 * Handles:
 * - HTTP POST requests with JSON payloads
 * - Bearer token authentication
 * - Timeout management with AbortController
 * - Response validation
 * - Error handling and logging
 */
export class WorkflowServiceClient {
  private config: WorkflowServiceConfig;

  constructor(config: WorkflowServiceConfig) {
    this.config = config;
  }

  /**
   * Execute market analysis via remote workflow service
   *
   * @param conditionId - Market condition ID to analyze
   * @returns Analysis result from workflow service
   * @throws Error if request fails or times out
   */
  async analyzeMarket(conditionId: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    console.log(`[WorkflowService] Sending analysis request for ${conditionId}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.headers,
      };

      // Add Bearer token if configured
      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }

      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ conditionId } satisfies WorkflowServiceRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Handle non-2xx status codes (Requirements 2.6, 5.2)
      if (!response.ok) {
        let errorBody: string;
        try {
          errorBody = await response.text();
        } catch (readError) {
          errorBody = 'Unable to read error response body';
        }

        // Log error with appropriate details (Requirement 6.2)
        console.error(`[WorkflowService] Request failed with status ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          duration,
          conditionId, // Include context for debugging
        });

        // Handle authentication errors (Requirement 5.3)
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `Authentication failed: ${response.statusText}. Check DIGITALOCEAN_API_TOKEN is valid and has proper permissions.`
          );
        }

        // Handle other error status codes with descriptive messages
        if (response.status >= 500) {
          throw new Error(
            `Workflow service error (${response.status}): ${response.statusText}. Service may be experiencing issues. ${errorBody ? `Details: ${errorBody}` : ''}`
          );
        }

        if (response.status === 400) {
          throw new Error(
            `Bad request (${response.status}): ${errorBody || response.statusText}. Check that conditionId is valid.`
          );
        }

        if (response.status === 404) {
          throw new Error(
            `Workflow service endpoint not found (${response.status}): ${this.config.url}. Check WORKFLOW_SERVICE_URL configuration.`
          );
        }

        if (response.status === 429) {
          throw new Error(
            `Rate limit exceeded (${response.status}): ${errorBody || response.statusText}. Too many requests to workflow service.`
          );
        }

        // Generic error for other status codes
        throw new Error(
          `Workflow service returned ${response.status}: ${errorBody || response.statusText}`
        );
      }

      const result = await response.json() as unknown;

      console.log(`[WorkflowService] Analysis completed successfully in ${duration}ms`);

      // Validate response structure
      this.validateResponse(result);

      return {
        recommendation: result.recommendation,
        agentSignals: result.agentSignals,
        cost: result.cost,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle timeout errors (Requirement 5.4)
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = `Workflow service request timed out after ${this.config.timeoutMs}ms`;
        console.error(`[WorkflowService] ${timeoutError}`);
        throw new Error(timeoutError);
      }

      // Handle network errors (Requirement 5.1)
      if (error instanceof Error) {
        // Check for common network error codes
        const errorWithCode = error as Error & { code?: string; cause?: Error & { code?: string } };
        const errorCode = errorWithCode.code || errorWithCode.cause?.code;
        
        if (errorCode === 'ECONNREFUSED') {
          const networkError = `Workflow service is unreachable: connection refused at ${this.config.url}`;
          console.error(`[WorkflowService] ${networkError}`);
          throw new Error(networkError);
        }
        
        if (errorCode === 'ENOTFOUND') {
          const dnsError = `Workflow service is unreachable: DNS lookup failed for ${this.config.url}`;
          console.error(`[WorkflowService] ${dnsError}`);
          throw new Error(dnsError);
        }
        
        if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
          const connectionError = `Workflow service connection error: ${errorCode}`;
          console.error(`[WorkflowService] ${connectionError}`);
          throw new Error(connectionError);
        }

        // Ensure token is never logged in error messages (Requirement 6.4)
        const sanitizedMessage = this.sanitizeErrorMessage(error.message);
        console.error(`[WorkflowService] Request failed after ${duration}ms:`, {
          message: sanitizedMessage,
          name: error.name,
        });
        
        // Re-throw with sanitized message
        const sanitizedError = new Error(sanitizedMessage);
        sanitizedError.name = error.name;
        throw sanitizedError;
      }

      // Handle non-Error objects
      console.error(`[WorkflowService] Request failed after ${duration}ms with unknown error:`, String(error));
      throw new Error(`Workflow service request failed: ${String(error)}`);
    }
  }

  /**
   * Validate workflow service response structure
   *
   * Ensures the response contains all required fields with correct types.
   * Throws descriptive errors for invalid responses.
   *
   * Requirements validated:
   * - 7.1: recommendation field (object or null)
   * - 7.2: agentSignals field (array)
   * - 7.3: cost field (optional number)
   * - 7.4: Missing required fields throw validation error
   * - 7.5: Validate before returning to caller
   *
   * @param response - Response to validate
   * @throws Error if response structure is invalid
   */
  private validateResponse(response: unknown): asserts response is WorkflowServiceResponse {
    // Check if response is an object (but not an array)
    if (typeof response !== 'object' || response === null || Array.isArray(response)) {
      throw new Error('Invalid response: response must be an object');
    }

    const resp = response as Record<string, unknown>;

    // Validate recommendation field (required, can be object or null, but not an array)
    if (!('recommendation' in resp)) {
      throw new Error('Invalid response: missing required field "recommendation"');
    }
    if (resp.recommendation !== null && (typeof resp.recommendation !== 'object' || Array.isArray(resp.recommendation))) {
      throw new Error('Invalid response: recommendation must be an object or null');
    }

    // Validate agentSignals field (required, must be array)
    if (!('agentSignals' in resp)) {
      throw new Error('Invalid response: missing required field "agentSignals"');
    }
    if (!Array.isArray(resp.agentSignals)) {
      throw new Error('Invalid response: agentSignals must be an array');
    }

    // Validate cost field (optional, must be number if present)
    if ('cost' in resp && resp.cost !== undefined && typeof resp.cost !== 'number') {
      throw new Error('Invalid response: cost must be a number');
    }
  }

  /**
   * Sanitize error messages to ensure authentication tokens are never logged
   *
   * Removes any potential token values from error messages to prevent
   * accidental exposure in logs.
   *
   * Requirement 6.4: Ensure token is never logged in error messages
   *
   * @param message - Error message to sanitize
   * @returns Sanitized error message
   */
  private sanitizeErrorMessage(message: string): string {
    if (!this.config.authToken) {
      return message;
    }

    // Replace any occurrence of the token with [REDACTED]
    return message.replace(new RegExp(this.config.authToken, 'g'), '[REDACTED]');
  }
}

/**
 * Create workflow service client from configuration
 *
 * Returns null if no workflow URL is configured, indicating that
 * local workflow execution should be used instead.
 *
 * @param config - Engine configuration
 * @returns WorkflowServiceClient instance or null
 */
export function createWorkflowServiceClient(
  config: EngineConfig
): WorkflowServiceClient | null {
  if (!config.workflowService?.url) {
    return null;
  }

  const authToken = process.env.DIGITALOCEAN_API_TOKEN;

  if (!authToken) {
    console.warn('[WorkflowService] DIGITALOCEAN_API_TOKEN not set, requests may fail');
  }

  return new WorkflowServiceClient({
    url: config.workflowService.url,
    timeoutMs: config.workflowService.timeoutMs,
    authToken,
    headers: config.workflowService.headers,
  });
}
