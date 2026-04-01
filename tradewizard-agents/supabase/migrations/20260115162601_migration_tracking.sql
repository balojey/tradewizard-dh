-- ============================================================================
-- Migration Tracking System
-- ============================================================================
-- This migration creates the infrastructure for tracking database migrations
-- Must be run before any other migrations
-- ============================================================================

-- ============================================================================
-- Schema Migrations Table
-- ============================================================================
-- Tracks which migrations have been applied to the database
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execution_time_ms INTEGER,
  checksum TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT
);

-- Index for quick version lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);

-- ============================================================================
-- Migration Lock Table
-- ============================================================================
-- Prevents concurrent migration execution
CREATE TABLE IF NOT EXISTS migration_lock (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT,
  CONSTRAINT single_lock CHECK (id = 1)
);

-- Insert the single lock row
INSERT INTO migration_lock (id, is_locked) 
VALUES (1, false) 
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to acquire migration lock
CREATE OR REPLACE FUNCTION acquire_migration_lock(locker TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  lock_acquired BOOLEAN;
BEGIN
  UPDATE migration_lock
  SET is_locked = true,
      locked_at = NOW(),
      locked_by = locker
  WHERE id = 1 AND is_locked = false;
  
  GET DIAGNOSTICS lock_acquired = ROW_COUNT;
  RETURN lock_acquired > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to release migration lock
CREATE OR REPLACE FUNCTION release_migration_lock()
RETURNS VOID AS $$
BEGIN
  UPDATE migration_lock
  SET is_locked = false,
      locked_at = NULL,
      locked_by = NULL
  WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a migration has been applied
CREATE OR REPLACE FUNCTION is_migration_applied(migration_version TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  applied BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM schema_migrations 
    WHERE version = migration_version AND success = true
  ) INTO applied;
  
  RETURN applied;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Record this migration
-- ============================================================================
INSERT INTO schema_migrations (version, name, execution_time_ms, success)
VALUES ('20260115162601', 'migration_tracking', 0, true)
ON CONFLICT (version) DO NOTHING;
