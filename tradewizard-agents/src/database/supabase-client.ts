import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './types.js';

/**
 * Supabase configuration schema
 */
const SupabaseConfigSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
  serviceRoleKey: z.string().min(1).optional(),
});

export type SupabaseConfig = z.infer<typeof SupabaseConfigSchema>;

/**
 * Typed Supabase client
 */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Retry configuration for connection attempts
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Supabase client wrapper with connection management and retry logic
 */
export class SupabaseClientManager {
  private client: TypedSupabaseClient | null = null;
  private config: SupabaseConfig;
  private retryConfig: RetryConfig;
  private isConnected: boolean = false;

  constructor(config: SupabaseConfig, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.config = SupabaseConfigSchema.parse(config);
    this.retryConfig = retryConfig;
  }

  /**
   * Initialize the Supabase client with retry logic
   */
  async connect(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Create Supabase client
        const key = this.config.serviceRoleKey || this.config.anonKey;
        this.client = createClient<Database>(this.config.url, key, {
          auth: {
            autoRefreshToken: true,
            persistSession: false,
          },
        });

        // Test connection with a simple query
        await this.healthCheck();

        this.isConnected = true;
        console.log('[Supabase] Connected successfully');
        return;
      } catch (error) {
        lastError = error as Error;
        this.isConnected = false;

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.warn(
            `[Supabase] Connection attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1} failed. Retrying in ${delay}ms...`,
            error
          );
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `[Supabase] Failed to connect after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Disconnect from Supabase
   */
  async disconnect(): Promise<void> {
    this.client = null;
    this.isConnected = false;
    console.log('[Supabase] Disconnected');
  }

  /**
   * Get the Supabase client instance
   * @throws Error if not connected
   */
  getClient(): TypedSupabaseClient {
    if (!this.client || !this.isConnected) {
      throw new Error('[Supabase] Client not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Check if the client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Perform a health check by querying the database
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // Simple query to test connection
      const { error } = await this.client.from('markets').select('id').limit(1);

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "relation does not exist" which is fine for health check
        // It means we can connect but tables aren't created yet
        throw error;
      }

      return true;
    } catch (error) {
      console.error('[Supabase] Health check failed:', error);
      return false;
    }
  }

  /**
   * Execute a function with retry logic
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.warn(
            `[Supabase] ${operationName} attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1} failed. Retrying in ${delay}ms...`,
            error
          );
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `[Supabase] ${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
    const delay = exponentialDelay + jitter;
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Load Supabase configuration from environment variables
 */
export function loadSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('[Supabase] SUPABASE_URL environment variable is required');
  }

  if (!anonKey) {
    throw new Error(
      '[Supabase] SUPABASE_KEY or SUPABASE_ANON_KEY environment variable is required'
    );
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
  };
}

/**
 * Create a Supabase client manager from environment variables
 */
export function createSupabaseClientManager(
  retryConfig?: RetryConfig
): SupabaseClientManager {
  const config = loadSupabaseConfig();
  return new SupabaseClientManager(config, retryConfig);
}
