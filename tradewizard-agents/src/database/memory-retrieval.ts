/**
 * Memory Retrieval Service
 *
 * This module provides functionality for querying and retrieving historical
 * agent signals from the database to enable closed-loop agent analysis.
 *
 * Implements comprehensive error handling and retry logic:
 * - Database connection error handling (Requirement 9.1)
 * - Exponential backoff for rate limits (Requirement 9.2)
 * - Query timeout logic (5 seconds) (Requirement 9.3)
 * - Graceful degradation for all error types (Requirement 9.4)
 * - Comprehensive error logging (Requirement 9.5)
 */

import type { SupabaseClientManager } from './supabase-client.js';
import { validateSignal } from './signal-validation.js';
import { getMemoryMetricsCollector, calculateContextSize } from '../utils/memory-metrics.js';

/**
 * Error types for memory retrieval operations
 */
export enum MemoryRetrievalErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  DATA_CORRUPTION_ERROR = 'DATA_CORRUPTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Memory retrieval error with detailed context
 */
export class MemoryRetrievalError extends Error {
  constructor(
    public type: MemoryRetrievalErrorType,
    message: string,
    public context?: Record<string, unknown>,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'MemoryRetrievalError';
  }
}

/**
 * Retry configuration for memory retrieval operations
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration (Requirement 9.2)
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

/**
 * Historical agent signal retrieved from database
 */
export interface HistoricalSignal {
  agentName: string;
  marketId: string;
  timestamp: Date;
  direction: 'YES' | 'NO' | 'NEUTRAL';
  fairProbability: number;
  confidence: number;
  keyDrivers: string[];
  metadata: Record<string, unknown>;
}

/**
 * Memory context for a specific agent
 */
export interface AgentMemoryContext {
  agentName: string;
  marketId: string;
  historicalSignals: HistoricalSignal[];
  hasHistory: boolean;
}

/**
 * Memory retrieval service interface
 */
export interface MemoryRetrievalService {
  /**
   * Retrieve historical signals for a specific agent-market combination
   * @param agentName - Name of the agent
   * @param marketId - Market condition ID
   * @param limit - Maximum number of historical signals to retrieve (default: 3)
   * @returns Agent memory context with historical signals
   */
  getAgentMemory(
    agentName: string,
    marketId: string,
    limit?: number
  ): Promise<AgentMemoryContext>;

  /**
   * Retrieve memory context for all agents for a specific market
   * @param marketId - Market condition ID
   * @param agentNames - List of agent names to retrieve memory for
   * @param limit - Maximum number of historical signals per agent (default: 3)
   * @returns Map of agent name to memory context
   */
  getAllAgentMemories(
    marketId: string,
    agentNames: string[],
    limit?: number
  ): Promise<Map<string, AgentMemoryContext>>;
}

/**
 * Memory Retrieval Service Implementation
 */
export class MemoryRetrievalServiceImpl implements MemoryRetrievalService {
  private retryConfig: RetryConfig;

  constructor(
    private supabaseManager: SupabaseClientManager,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Retrieve historical signals for a specific agent-market combination
   * Implements comprehensive error handling and retry logic (Requirements 9.1-9.5)
   */
  async getAgentMemory(
    agentName: string,
    marketId: string,
    limit: number = 3
  ): Promise<AgentMemoryContext> {
    const startTime = Date.now();
    const context = { agentName, marketId, limit };
    const metricsCollector = getMemoryMetricsCollector();

    try {
      // Execute query with retry logic and timeout (Requirements 9.2, 9.3)
      const result = await this.executeWithRetry(
        () => this.queryAgentSignals(agentName, marketId, limit),
        context
      );

      const duration = Date.now() - startTime;
      
      // Calculate context size for metrics
      const contextSize = calculateContextSize(result);
      
      // Record successful retrieval in metrics
      metricsCollector.recordRetrieval({
        duration,
        success: true,
        marketId,
        agentName,
        signalCount: result.historicalSignals.length,
        contextSize,
      });

      // Log successful retrieval (Requirement 9.5)
      console.log('[MemoryRetrieval] Successfully retrieved agent memory:', {
        agentName,
        marketId,
        signalCount: result.historicalSignals.length,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Determine if this was a timeout error
      const isTimeout = error instanceof MemoryRetrievalError && 
        error.type === MemoryRetrievalErrorType.TIMEOUT_ERROR;

      // Record failed retrieval in metrics
      if (error instanceof MemoryRetrievalError) {
        metricsCollector.recordRetrieval({
          duration,
          success: false,
          marketId,
          agentName,
          error: {
            type: error.type,
            message: error.message,
            context: error.context,
          },
          timeout: isTimeout,
        });
      } else {
        metricsCollector.recordRetrieval({
          duration,
          success: false,
          marketId,
          agentName,
          error: {
            type: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }

      // Comprehensive error logging (Requirement 9.5)
      if (error instanceof MemoryRetrievalError) {
        console.error('[MemoryRetrieval] Memory retrieval failed:', {
          errorType: error.type,
          message: error.message,
          context: { ...context, ...error.context },
          duration,
        });
      } else {
        console.error('[MemoryRetrieval] Unexpected error:', {
          error: error instanceof Error ? error.message : String(error),
          context,
          duration,
        });
      }

      // Graceful degradation: return empty context (Requirement 9.4)
      return this.emptyContext(agentName, marketId);
    }
  }

  /**
   * Query agent signals from database with timeout
   * (Requirement 9.3: 5 second timeout)
   */
  private async queryAgentSignals(
    agentName: string,
    marketId: string,
    limit: number
  ): Promise<AgentMemoryContext> {
    const effectiveLimit = Math.min(limit, 5);
    const timeoutMs = 5000; // 5 second timeout (Requirement 9.3)

    try {
      const client = this.supabaseManager.getClient();

      // Create query promise
      const queryPromise = client
        .from('agent_signals')
        .select('*')
        .eq('agent_name', agentName)
        .eq('market_id', marketId)
        .order('created_at', { ascending: false })
        .limit(effectiveLimit);

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new MemoryRetrievalError(
              MemoryRetrievalErrorType.TIMEOUT_ERROR,
              'Query timeout exceeded',
              { agentName, marketId, timeoutMs }
            )
          );
        }, timeoutMs);
      });

      // Race query against timeout (Requirement 9.3)
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      // Handle database errors (Requirement 9.1)
      if (error) {
        throw this.classifyDatabaseError(error, { agentName, marketId });
      }

      // Handle empty results (Requirement 1.4)
      if (!data || data.length === 0) {
        return this.emptyContext(agentName, marketId);
      }

      // Transform and validate signals (Requirement 9.2: data corruption handling)
      const historicalSignals = data
        .map((row) => this.transformToHistoricalSignal(row))
        .filter((signal) => signal !== null) as HistoricalSignal[];

      return {
        agentName,
        marketId,
        historicalSignals,
        hasHistory: historicalSignals.length > 0,
      };
    } catch (error) {
      // Re-throw MemoryRetrievalError as-is
      if (error instanceof MemoryRetrievalError) {
        throw error;
      }

      // Wrap unknown errors
      throw new MemoryRetrievalError(
        MemoryRetrievalErrorType.UNKNOWN_ERROR,
        'Unexpected error during query',
        { agentName, marketId },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Execute operation with exponential backoff retry logic
   * (Requirement 9.2: Exponential backoff for rate limits)
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.retryConfig.maxAttempts) {
      attempt++;

      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);

        // Log retry attempt (Requirement 9.5)
        console.warn('[MemoryRetrieval] Operation failed, checking retry:', {
          attempt,
          maxAttempts: this.retryConfig.maxAttempts,
          isRetryable,
          errorType:
            error instanceof MemoryRetrievalError ? error.type : 'UNKNOWN',
          context,
        });

        // Don't retry if error is not retryable or max attempts reached
        if (!isRetryable || attempt >= this.retryConfig.maxAttempts) {
          throw error;
        }

        // Calculate exponential backoff delay (Requirement 9.2)
        const delay = Math.min(
          this.retryConfig.initialDelayMs *
            Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelayMs
        );

        console.log('[MemoryRetrieval] Retrying after delay:', {
          attempt,
          delayMs: delay,
          context,
        });

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // All retries exhausted (Requirement 9.5)
    throw new MemoryRetrievalError(
      MemoryRetrievalErrorType.UNKNOWN_ERROR,
      `Operation failed after ${this.retryConfig.maxAttempts} attempts`,
      { ...context, attempts: attempt },
      lastError
    );
  }

  /**
   * Classify database error into specific error types
   * (Requirement 9.1: Database connection error handling)
   */
  private classifyDatabaseError(
    error: any,
    context: Record<string, unknown>
  ): MemoryRetrievalError {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || error?.status;

    // Connection errors (Requirement 9.1)
    if (
      errorMessage.includes('connection') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorCode === 'PGRST301'
    ) {
      return new MemoryRetrievalError(
        MemoryRetrievalErrorType.CONNECTION_ERROR,
        'Database connection failed',
        { ...context, errorCode, errorMessage },
        error instanceof Error ? error : undefined
      );
    }

    // Rate limit errors (Requirement 9.2)
    if (
      errorCode === 429 ||
      errorCode === 'PGRST103' ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')
    ) {
      return new MemoryRetrievalError(
        MemoryRetrievalErrorType.RATE_LIMIT_ERROR,
        'Rate limit exceeded',
        { ...context, errorCode, errorMessage },
        error instanceof Error ? error : undefined
      );
    }

    // Data corruption errors (Requirement 9.2)
    if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('malformed') ||
      errorMessage.includes('corrupt')
    ) {
      return new MemoryRetrievalError(
        MemoryRetrievalErrorType.DATA_CORRUPTION_ERROR,
        'Data corruption detected',
        { ...context, errorCode, errorMessage },
        error instanceof Error ? error : undefined
      );
    }

    // Generic database error
    return new MemoryRetrievalError(
      MemoryRetrievalErrorType.UNKNOWN_ERROR,
      'Database query failed',
      { ...context, errorCode, errorMessage },
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Check if error is retryable
   * (Requirement 9.2: Retry logic for transient errors)
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof MemoryRetrievalError)) {
      return false;
    }

    // Retry connection errors and rate limits
    return (
      error.type === MemoryRetrievalErrorType.CONNECTION_ERROR ||
      error.type === MemoryRetrievalErrorType.RATE_LIMIT_ERROR
    );
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retrieve memory context for all agents for a specific market
   * Implements parallel fetching with error isolation (Requirement 9.4)
   */
  async getAllAgentMemories(
    marketId: string,
    agentNames: string[],
    limit: number = 3
  ): Promise<Map<string, AgentMemoryContext>> {
    const startTime = Date.now();
    const memoryMap = new Map<string, AgentMemoryContext>();
    const metricsCollector = getMemoryMetricsCollector();

    try {
      // Fetch memories in parallel for all agents
      // Each agent's errors are isolated (Requirement 9.4)
      const memoryPromises = agentNames.map((agentName) =>
        this.getAgentMemory(agentName, marketId, limit).catch((error) => {
          // Log error but don't fail entire operation (Requirement 9.4)
          console.error('[MemoryRetrieval] Failed to retrieve memory for agent:', {
            agentName,
            marketId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Return empty context for failed agent
          return this.emptyContext(agentName, marketId);
        })
      );

      const memories = await Promise.all(memoryPromises);

      memories.forEach((memory) => {
        memoryMap.set(memory.agentName, memory);
      });

      const duration = Date.now() - startTime;
      const successCount = Array.from(memoryMap.values()).filter(
        (m) => m.hasHistory
      ).length;

      // Log summary (Requirement 9.5)
      console.log('[MemoryRetrieval] Retrieved memories for all agents:', {
        marketId,
        totalAgents: agentNames.length,
        agentsWithHistory: successCount,
        duration,
      });

      return memoryMap;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Comprehensive error logging (Requirement 9.5)
      console.error('[MemoryRetrieval] Failed to retrieve all agent memories:', {
        marketId,
        agentCount: agentNames.length,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Graceful degradation: return empty map (Requirement 9.4)
      agentNames.forEach((agentName) => {
        memoryMap.set(agentName, this.emptyContext(agentName, marketId));
      });

      return memoryMap;
    }
  }

  /**
   * Create empty memory context
   */
  private emptyContext(agentName: string, marketId: string): AgentMemoryContext {
    return {
      agentName,
      marketId,
      historicalSignals: [],
      hasHistory: false,
    };
  }

  /**
   * Transform database row to HistoricalSignal
   * Implements validation logic with data corruption handling (Requirements 10.1-10.5, 9.2)
   */
  private transformToHistoricalSignal(row: any): HistoricalSignal | null {
    try {
      // Validate signal using centralized validation module
      // Requirements 10.1, 10.2, 10.3, 10.4, 10.5
      const validation = validateSignal(row);

      if (!validation.valid) {
        console.warn('[MemoryRetrieval] Invalid signal filtered out:', {
          agent_name: row.agent_name,
          market_id: row.market_id,
          errors: validation.errors,
        });
        return null;
      }

      // Normalize direction to YES/NO/NEUTRAL format
      let normalizedDirection: 'YES' | 'NO' | 'NEUTRAL';
      if (row.direction === 'LONG_YES' || row.direction === 'YES') {
        normalizedDirection = 'YES';
      } else if (row.direction === 'LONG_NO' || row.direction === 'NO') {
        normalizedDirection = 'NO';
      } else {
        normalizedDirection = 'NEUTRAL';
      }

      // Parse key_drivers from JSON with error handling (Requirement 9.2)
      let keyDrivers: string[] = [];
      if (row.key_drivers) {
        try {
          if (Array.isArray(row.key_drivers)) {
            keyDrivers = row.key_drivers;
          } else if (typeof row.key_drivers === 'string') {
            keyDrivers = JSON.parse(row.key_drivers);
          }
        } catch (error) {
          console.warn('[MemoryRetrieval] Failed to parse key_drivers:', {
            agent_name: row.agent_name,
            error: error instanceof Error ? error.message : String(error),
          });
          keyDrivers = [];
        }
      }

      // Parse metadata from JSON with error handling (Requirement 9.2)
      let metadata: Record<string, unknown> = {};
      if (row.metadata) {
        try {
          if (typeof row.metadata === 'object' && !Array.isArray(row.metadata)) {
            metadata = row.metadata;
          } else if (typeof row.metadata === 'string') {
            metadata = JSON.parse(row.metadata);
          }
        } catch (error) {
          console.warn('[MemoryRetrieval] Failed to parse metadata:', {
            agent_name: row.agent_name,
            error: error instanceof Error ? error.message : String(error),
          });
          metadata = {};
        }
      }

      return {
        agentName: row.agent_name,
        marketId: row.market_id,
        timestamp: new Date(row.created_at),
        direction: normalizedDirection,
        fairProbability: row.fair_probability,
        confidence: row.confidence,
        keyDrivers,
        metadata,
      };
    } catch (error) {
      // Data corruption handling (Requirement 9.2)
      console.error('[MemoryRetrieval] Failed to transform signal:', {
        agent_name: row?.agent_name,
        market_id: row?.market_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/**
 * Create a memory retrieval service instance
 * @param supabaseManager - Supabase client manager
 * @param retryConfig - Optional retry configuration (defaults to 3 attempts with exponential backoff)
 */
export function createMemoryRetrievalService(
  supabaseManager: SupabaseClientManager,
  retryConfig?: Partial<RetryConfig>
): MemoryRetrievalService {
  return new MemoryRetrievalServiceImpl(supabaseManager, retryConfig);
}
