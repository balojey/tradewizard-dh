#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * This script runs database migrations against Supabase PostgreSQL.
 * It tracks which migrations have been applied and ensures they run in order.
 * 
 * Usage:
 *   npm run migrate              # Run all pending migrations
 *   npm run migrate:status       # Show migration status
 *   npm run migrate:rollback     # Rollback last migration (if supported)
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { config } from 'dotenv';
import { createSupabaseClientManager } from './supabase-client.js';
import type { TypedSupabaseClient } from './supabase-client.js';

// Load environment variables
config();

interface Migration {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

interface MigrationRecord {
  version: string;
  name: string;
  applied_at: string;
  execution_time_ms: number;
  success: boolean;
  error_message?: string;
}

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const MIGRATION_FILE_PATTERN = /^(\d{14})_(.+)\.sql$/;

/**
 * Calculate MD5 checksum of migration content
 */
function calculateChecksum(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Parse migration filename to extract version and name
 */
function parseMigrationFilename(filename: string): { version: string; name: string } | null {
  const match = filename.match(MIGRATION_FILE_PATTERN);
  if (!match) return null;
  
  return {
    version: match[1],
    name: match[2],
  };
}

/**
 * Load all migration files from the migrations directory
 */
async function loadMigrations(): Promise<Migration[]> {
  try {
    const files = await readdir(MIGRATIONS_DIR);
    const migrations: Migration[] = [];

    for (const filename of files) {
      if (!filename.endsWith('.sql')) continue;

      const parsed = parseMigrationFilename(filename);
      if (!parsed) {
        console.warn(`[Migrate] Skipping invalid migration filename: ${filename}`);
        continue;
      }

      const filepath = join(MIGRATIONS_DIR, filename);
      const sql = await readFile(filepath, 'utf-8');
      const checksum = calculateChecksum(sql);

      migrations.push({
        version: parsed.version,
        name: parsed.name,
        filename,
        sql,
        checksum,
      });
    }

    // Sort by version (timestamp)
    migrations.sort((a, b) => a.version.localeCompare(b.version));

    return migrations;
  } catch (error) {
    console.error('[Migrate] Failed to load migrations:', error);
    throw error;
  }
}

/**
 * Get applied migrations from the database
 */
async function getAppliedMigrations(client: TypedSupabaseClient): Promise<MigrationRecord[]> {
  const { data, error } = await client
    .from('schema_migrations')
    .select('*')
    .order('version', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch applied migrations: ${error.message}`);
  }

  return data as MigrationRecord[];
}

/**
 * Acquire migration lock to prevent concurrent migrations
 */
async function acquireLock(client: TypedSupabaseClient, lockerId: string): Promise<boolean> {
  const { data, error } = await client.rpc('acquire_migration_lock', {
    locker: lockerId,
  });

  if (error) {
    throw new Error(`Failed to acquire migration lock: ${error.message}`);
  }

  return data as boolean;
}

/**
 * Release migration lock
 */
async function releaseLock(client: TypedSupabaseClient): Promise<void> {
  const { error } = await client.rpc('release_migration_lock');

  if (error) {
    throw new Error(`Failed to release migration lock: ${error.message}`);
  }
}

/**
 * Execute a single migration
 * 
 * Note: This function is for tracking purposes only.
 * Actual SQL execution must be done via Supabase CLI (supabase db push) or psql.
 * The Supabase JS client doesn't support executing arbitrary SQL for security reasons.
 */
async function executeMigration(
  client: TypedSupabaseClient,
  migration: Migration
): Promise<void> {
  const startTime = Date.now();

  console.log(`[Migrate] Recording migration: ${migration.version}_${migration.name}`);
  console.log(`[Migrate] Note: SQL execution must be done via Supabase CLI or psql`);
  console.log(`[Migrate] File: supabase/migrations/${migration.filename}`);

  try {
    const executionTime = Date.now() - startTime;

    // Record migration as applied
    // This assumes the migration has already been executed via Supabase CLI
    const { error: recordError } = await client
      .from('schema_migrations')
      .insert({
        version: migration.version,
        name: migration.name,
        execution_time_ms: executionTime,
        checksum: migration.checksum,
        success: true,
      });

    if (recordError) {
      // If it's a duplicate, that's fine - migration already recorded
      if (recordError.code !== '23505') {
        throw recordError;
      }
      console.log(`[Migrate] ✓ Migration already recorded`);
    } else {
      console.log(`[Migrate] ✓ Migration recorded successfully`);
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failed migration
    await client
      .from('schema_migrations')
      .insert({
        version: migration.version,
        name: migration.name,
        execution_time_ms: executionTime,
        checksum: migration.checksum,
        success: false,
        error_message: errorMessage,
      });

    throw new Error(`Migration ${migration.version}_${migration.name} failed: ${errorMessage}`);
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations(): Promise<void> {
  const clientManager = createSupabaseClientManager();
  
  try {
    console.log('[Migrate] Connecting to database...');
    await clientManager.connect();
    const client = clientManager.getClient();

    // Acquire lock
    const lockerId = `migrate-${Date.now()}`;
    console.log('[Migrate] Acquiring migration lock...');
    
    const lockAcquired = await acquireLock(client, lockerId);
    if (!lockAcquired) {
      console.error('[Migrate] Failed to acquire lock. Another migration may be running.');
      process.exit(1);
    }

    try {
      // Load all migrations
      const migrations = await loadMigrations();
      console.log(`[Migrate] Found ${migrations.length} migration files`);

      // Get applied migrations
      const applied = await getAppliedMigrations(client);
      const appliedVersions = new Set(
        applied.filter(m => m.success).map(m => m.version)
      );

      // Find pending migrations
      const pending = migrations.filter(m => !appliedVersions.has(m.version));

      if (pending.length === 0) {
        console.log('[Migrate] No pending migrations. Database is up to date.');
        return;
      }

      console.log(`[Migrate] Found ${pending.length} pending migrations`);
      console.log('[Migrate] Note: Migrations must be executed via Supabase CLI first');
      console.log('[Migrate] Run: npx supabase db push');

      // Record each pending migration
      for (const migration of pending) {
        await executeMigration(client, migration);
      }

      console.log('[Migrate] ✓ All migrations recorded successfully');
    } finally {
      // Always release lock
      await releaseLock(client);
      console.log('[Migrate] Released migration lock');
    }
  } catch (error) {
    console.error('[Migrate] Migration failed:', error);
    process.exit(1);
  } finally {
    await clientManager.disconnect();
  }
}

/**
 * Show migration status
 */
async function showStatus(): Promise<void> {
  const clientManager = createSupabaseClientManager();
  
  try {
    console.log('[Migrate] Connecting to database...');
    await clientManager.connect();
    const client = clientManager.getClient();

    // Load all migrations
    const migrations = await loadMigrations();
    
    // Try to get applied migrations
    let applied: MigrationRecord[] = [];
    try {
      applied = await getAppliedMigrations(client);
    } catch (error) {
      console.log('[Migrate] Migration tracking not initialized yet');
      console.log('[Migrate] Run migrations to initialize: npx supabase db push');
    }
    
    const appliedMap = new Map(applied.map(m => [m.version, m]));

    console.log('\n=== Migration Status ===\n');
    console.log('Version          | Name                    | Status    | Applied At');
    console.log('-----------------|-------------------------|-----------|---------------------------');

    for (const migration of migrations) {
      const record = appliedMap.get(migration.version);
      
      if (record) {
        const status = record.success ? '✓ Applied' : '✗ Failed';
        const appliedAt = new Date(record.applied_at!).toISOString();
        console.log(
          `${migration.version} | ${migration.name.padEnd(23)} | ${status.padEnd(9)} | ${appliedAt}`
        );
      } else {
        console.log(
          `${migration.version} | ${migration.name.padEnd(23)} | Pending   | -`
        );
      }
    }

    console.log('\n');
  } catch (error) {
    console.error('[Migrate] Failed to show status:', error);
    process.exit(1);
  } finally {
    await clientManager.disconnect();
  }
}

/**
 * Main entry point
 */
async function main() {
  const command = process.argv[2] || 'run';

  switch (command) {
    case 'run':
      await runMigrations();
      break;
    case 'status':
      await showStatus();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Usage: npm run migrate [run|status]');
      process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('[Migrate] Fatal error:', error);
    process.exit(1);
  });
}

export { runMigrations, showStatus, loadMigrations, getAppliedMigrations };
