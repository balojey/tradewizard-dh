/**
 * Error handling module for AWS Bedrock/Nova integration
 * Provides standardized error types, retry logic, and user-friendly error messages
 */

/**
 * Enumeration of all possible Bedrock error types
 */
export enum BedrockErrorCode {
  AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  INVALID_REQUEST = "INVALID_REQUEST",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  REGION_NOT_SUPPORTED = "REGION_NOT_SUPPORTED",
}

/**
 * Custom error class for Bedrock-specific errors
 * Extends Error with additional metadata for retry logic and user messaging
 */
export class BedrockError extends Error {
  code: BedrockErrorCode;
  retryable: boolean;
  details?: any;

  constructor(code: BedrockErrorCode, message: string, details?: any) {
    super(message);
    this.name = "BedrockError";
    this.code = code;
    this.details = details;
    
    // Determine if error is retryable based on error code
    this.retryable = this.determineRetryability(code);
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Determines if an error type should trigger retry logic
   */
  private determineRetryability(code: BedrockErrorCode): boolean {
    const retryableErrors = [
      BedrockErrorCode.RATE_LIMIT_EXCEEDED,
      BedrockErrorCode.SERVICE_UNAVAILABLE,
    ];
    return retryableErrors.includes(code);
  }

  /**
   * Returns user-friendly error message with troubleshooting steps
   */
  getUserMessage(): string {
    const messages: Record<BedrockErrorCode, string> = {
      [BedrockErrorCode.AUTHENTICATION_FAILED]: `
AWS authentication failed. Please verify:
1. AWS credentials are correct (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
2. IAM user has bedrock:InvokeModel permission
3. Bedrock is available in your AWS region

For more information, see:
https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html
      `.trim(),

      [BedrockErrorCode.RATE_LIMIT_EXCEEDED]: `
Nova API rate limit exceeded.
The system will automatically retry with exponential backoff.
Consider reducing request frequency or upgrading your AWS service limits.
      `.trim(),

      [BedrockErrorCode.MODEL_NOT_FOUND]: `
The specified Nova model was not found.
Valid options:
  - amazon.nova-micro-v1:0
  - amazon.nova-lite-v1:0
  - amazon.nova-pro-v1:0

Please verify your NOVA_MODEL_NAME environment variable.
      `.trim(),

      [BedrockErrorCode.INVALID_REQUEST]: `
Invalid request format sent to Bedrock API.
Please check:
1. Model parameters (temperature, maxTokens, topP) are within valid ranges
2. Request payload conforms to Nova model requirements
3. Input text is properly formatted

${this.details ? `Details: ${JSON.stringify(this.details, null, 2)}` : ""}
      `.trim(),

      [BedrockErrorCode.SERVICE_UNAVAILABLE]: `
AWS Bedrock service is temporarily unavailable.
The system will automatically retry with exponential backoff.
If the issue persists, check AWS service health:
https://status.aws.amazon.com/
      `.trim(),

      [BedrockErrorCode.REGION_NOT_SUPPORTED]: `
AWS Bedrock is not available in the specified region.
Please verify:
1. AWS_REGION environment variable is set correctly
2. Bedrock is available in your region

Bedrock is available in: us-east-1, us-west-2, eu-west-1, ap-southeast-1, and others.
See: https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html
      `.trim(),
    };

    return messages[this.code] || this.message;
  }

  /**
   * Determines if error should trigger retry logic
   */
  shouldRetry(): boolean {
    return this.retryable;
  }
}

/**
 * Configuration for retry logic with exponential backoff
 */
export interface RetryConfig {
  maxRetries: number;        // Maximum number of retry attempts
  initialDelayMs: number;    // Initial delay before first retry
  maxDelayMs: number;        // Maximum delay between retries
  backoffMultiplier: number; // Multiplier for exponential backoff
}

/**
 * Default retry configuration with sensible defaults
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Utility class for handling Bedrock errors with retry logic
 */
export class BedrockErrorHandler {
  /**
   * Wraps Bedrock API calls with standardized error handling
   * Converts AWS SDK errors to BedrockError instances
   * 
   * @param operation - The async operation to execute
   * @param context - Description of the operation for error messages
   * @returns Result of the operation
   * @throws BedrockError with appropriate error code and message
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      throw BedrockErrorHandler.fromAWSError(error, context);
    }
  }

  /**
   * Implements exponential backoff retry logic for transient errors
   * 
   * @param operation - The async operation to retry
   * @param config - Retry configuration (uses defaults if not provided)
   * @returns Result of the operation
   * @throws BedrockError after all retries are exhausted
   */
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<T> {
    let lastError: BedrockError;
    let delay = config.initialDelayMs;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error instanceof BedrockError 
          ? error 
          : BedrockErrorHandler.fromAWSError(error, "retry operation");

        // Don't retry if error is not retryable or we've exhausted retries
        if (!lastError.shouldRetry() || attempt === config.maxRetries) {
          throw lastError;
        }

        // Log retry attempt
        console.warn(
          `Bedrock operation failed (attempt ${attempt + 1}/${config.maxRetries + 1}): ${lastError.message}. ` +
          `Retrying in ${delay}ms...`
        );

        // Wait before retrying
        await BedrockErrorHandler.sleep(delay);

        // Calculate next delay with exponential backoff
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }

    // This should never be reached due to throw in loop, but TypeScript needs it
    throw lastError!;
  }

  /**
   * Converts AWS SDK errors to BedrockError instances
   * Maps AWS error codes to BedrockErrorCode enum values
   * 
   * @param error - The error from AWS SDK
   * @param context - Description of the operation that failed
   * @returns BedrockError with appropriate error code
   */
  static fromAWSError(error: any, context?: string): BedrockError {
    const contextPrefix = context ? `${context}: ` : "";

    // Handle AWS SDK errors
    if (error.name || error.$metadata?.httpStatusCode) {
      const statusCode = error.$metadata?.httpStatusCode;
      const errorCode = error.name || error.code;
      const errorMessage = error.message || "Unknown AWS error";

      // Map AWS error codes to BedrockErrorCode
      switch (errorCode) {
        case "UnrecognizedClientException":
        case "InvalidSignatureException":
        case "AccessDeniedException":
          return new BedrockError(
            BedrockErrorCode.AUTHENTICATION_FAILED,
            `${contextPrefix}${errorMessage}`,
            { statusCode, errorCode }
          );

        case "ThrottlingException":
        case "TooManyRequestsException":
          return new BedrockError(
            BedrockErrorCode.RATE_LIMIT_EXCEEDED,
            `${contextPrefix}${errorMessage}`,
            { statusCode, errorCode, retryAfter: error.retryAfter }
          );

        case "ResourceNotFoundException":
        case "ModelNotFoundException":
          return new BedrockError(
            BedrockErrorCode.MODEL_NOT_FOUND,
            `${contextPrefix}${errorMessage}`,
            { statusCode, errorCode }
          );

        case "ValidationException":
        case "InvalidRequestException":
          return new BedrockError(
            BedrockErrorCode.INVALID_REQUEST,
            `${contextPrefix}${errorMessage}`,
            { statusCode, errorCode, details: error.details }
          );

        case "ServiceUnavailableException":
        case "InternalServerException":
          return new BedrockError(
            BedrockErrorCode.SERVICE_UNAVAILABLE,
            `${contextPrefix}${errorMessage}`,
            { statusCode, errorCode }
          );

        default:
          // Check HTTP status codes
          if (statusCode === 403) {
            return new BedrockError(
              BedrockErrorCode.AUTHENTICATION_FAILED,
              `${contextPrefix}${errorMessage}`,
              { statusCode, errorCode }
            );
          } else if (statusCode === 429) {
            return new BedrockError(
              BedrockErrorCode.RATE_LIMIT_EXCEEDED,
              `${contextPrefix}${errorMessage}`,
              { statusCode, errorCode }
            );
          } else if (statusCode === 503) {
            return new BedrockError(
              BedrockErrorCode.SERVICE_UNAVAILABLE,
              `${contextPrefix}${errorMessage}`,
              { statusCode, errorCode }
            );
          }

          // Default to invalid request for unknown errors
          return new BedrockError(
            BedrockErrorCode.INVALID_REQUEST,
            `${contextPrefix}${errorMessage}`,
            { statusCode, errorCode }
          );
      }
    }

    // Handle BedrockError instances (pass through)
    if (error instanceof BedrockError) {
      return error;
    }

    // Handle generic errors
    return new BedrockError(
      BedrockErrorCode.INVALID_REQUEST,
      `${contextPrefix}${error.message || "Unknown error"}`,
      { originalError: error }
    );
  }

  /**
   * Helper function to sleep for a specified duration
   * @param ms - Duration in milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
