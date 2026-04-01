/**
 * PostgreSQL Checkpointer for LangGraph
 *
 * This module provides a PostgreSQL-backed checkpointer for LangGraph workflows.
 * It uses Supabase PostgreSQL to persist workflow state, enabling:
 * - Workflow resumption after interruptions
 * - Audit trail of workflow execution
 * - State inspection for debugging
 */

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { SupabaseClientManager } from './supabase-client.js';
import dns from 'dns';

// Force IPv4 resolution to avoid IPv6 connectivity issues
dns.setDefaultResultOrder('ipv4first');

/**
 * PostgreSQL checkpointer configuration
 */
export interface PostgresCheckpointerConfig {
  /**
   * Connection string
   */
  connectionString: string;
}

/**
 * Create a PostgreSQL checkpointer for LangGraph
 *
 * This function creates a PostgresSaver instance that uses the Supabase
 * PostgreSQL database for checkpoint storage.
 *
 * @param supabaseManager - Supabase client manager
 * @returns PostgresSaver instance
 */
export async function createPostgresCheckpointer(
  supabaseManager: SupabaseClientManager
): Promise<PostgresSaver> {
  // Extract connection details from Supabase client
  const connectionString = getConnectionString(supabaseManager);

  // Create PostgresSaver
  const checkpointer = PostgresSaver.fromConnString(connectionString);

  try {
    // Setup the checkpointer (creates tables if they don't exist)
    await checkpointer.setup();
    console.log('[PostgresCheckpointer] Checkpointer initialized successfully');
  } catch (error) {
    console.error('[PostgresCheckpointer] Failed to setup checkpointer:', error);
    throw error;
  }

  return checkpointer;
}

/**
 * Extract PostgreSQL connection string from Supabase client manager
 *
 * @param _supabaseManager - Supabase client manager (unused, kept for future use)
 * @returns PostgreSQL connection string
 */
function getConnectionString(_supabaseManager: SupabaseClientManager): string {
  // Check for explicit database URL first (for production with connection pooling)
  const explicitDbUrl = process.env.SUPABASE_DATABASE_URL;
  if (explicitDbUrl) {
    console.log('[PostgresCheckpointer] Using explicit SUPABASE_DATABASE_URL');
    return explicitDbUrl;
  }

  // Get Supabase URL from environment
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('[PostgresCheckpointer] SUPABASE_URL environment variable is required');
  }

  // Extract project reference from Supabase URL
  // Format: https://<project-ref>.supabase.co
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error('[PostgresCheckpointer] Invalid SUPABASE_URL format');
  }

  // Get database password from environment
  // For pooler connections, we need the actual database password, not the service role key
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbPassword) {
    throw new Error(
      '[PostgresCheckpointer] SUPABASE_DB_PASSWORD or SUPABASE_SERVICE_ROLE_KEY environment variable is required'
    );
  }

  // Force use of connection pooling to get IPv4 connectivity
  // The direct db.*.supabase.co endpoints only have IPv6, but pooler has IPv4
  const usePooling = true; // Always use pooling to avoid IPv6 connectivity issues
  
  let connectionString: string;
  
  if (usePooling) {
    // Use connection pooling - this provides IPv4 connectivity
    // Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
    const region = process.env.SUPABASE_REGION || 'us-east-1'; // Default region
    connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true`;
    console.log('[PostgresCheckpointer] Using connection pooling for IPv4 connectivity');
  } else {
    // Direct connection for development - force IPv4 to avoid IPv6 connectivity issues
    // Format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
    connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
    console.log('[PostgresCheckpointer] Using direct connection for development');
  }

  console.log('[PostgresCheckpointer] Connection string constructed:', connectionString.replace(dbPassword, '[REDACTED]'));

  return connectionString;
}

/**
 * Create a PostgreSQL checkpointer with custom configuration
 *
 * @param config - PostgreSQL checkpointer configuration
 * @returns PostgresSaver instance
 */
export async function createPostgresCheckpointerWithConfig(
  config: PostgresCheckpointerConfig
): Promise<PostgresSaver> {
  if (!config.connectionString) {
    throw new Error('[PostgresCheckpointer] connectionString is required');
  }

  // Create PostgresSaver
  const checkpointer = PostgresSaver.fromConnString(config.connectionString);

  // Setup the checkpointer (creates tables if they don't exist)
  await checkpointer.setup();

  console.log('[PostgresCheckpointer] Checkpointer initialized with custom config');

  return checkpointer;
}
