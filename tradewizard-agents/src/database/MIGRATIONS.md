# Database Migrations Guide

This guide explains how to manage database schema migrations for the TradeWizard Automated Market Monitor.

## Overview

The migration system provides:
- **Version Control**: Track which migrations have been applied
- **Ordering**: Migrations run in chronological order based on timestamp
- **Safety**: Migration locks prevent concurrent execution
- **Tracking**: Full history of applied migrations with execution times
- **Rollback Support**: Track migration status for potential rollbacks

## Migration Files

Migration files are stored in `supabase/migrations/` and follow this naming convention:

```
YYYYMMDDHHMMSS_description.sql
```

Example: `20260115162602_initial_schema.sql`

### Existing Migrations

1. **20260115162601_migration_tracking.sql** - Sets up migration tracking infrastructure
2. **20260115162602_initial_schema.sql** - Creates all core tables for the monitor

## Migration Tracking System

The migration tracking system consists of two tables:

### schema_migrations

Tracks which migrations have been applied:

```sql
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execution_time_ms INTEGER,
  checksum TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT
);
```

### migration_lock

Prevents concurrent migration execution:

```sql
CREATE TABLE migration_lock (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT
);
```

## Running Migrations

### Method 1: Supabase CLI (Recommended)

The recommended way to run migrations is using the Supabase CLI:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your Supabase project
supabase link --project-ref your-project-ref

# Push all pending migrations
supabase db push

# Check migration status
supabase migration list
```

### Method 2: Direct SQL Execution

You can also run migrations directly using psql:

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Run a specific migration
\i supabase/migrations/20260115162601_migration_tracking.sql
\i supabase/migrations/20260115162602_initial_schema.sql
```

### Method 3: Migration Runner Script

We provide a TypeScript migration runner for tracking purposes:

```bash
# Check migration status
npm run migrate:status

# Run pending migrations (tracking only)
npm run migrate
```

**Note**: The TypeScript runner tracks migration status but doesn't execute SQL directly due to Supabase security restrictions. Use Supabase CLI or psql for actual execution.

## Creating New Migrations

### Step 1: Create Migration File

Create a new SQL file in `supabase/migrations/` with a timestamp prefix:

```bash
# Generate timestamp
date +%Y%m%d%H%M%S

# Create file (example)
touch supabase/migrations/20260116120000_add_user_preferences.sql
```

### Step 2: Write Migration SQL

```sql
-- ============================================================================
-- Add User Preferences Table
-- ============================================================================
-- Description of what this migration does
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
  ON user_preferences(user_id);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_user_preferences_updated_at 
  ON user_preferences;
  
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Step 3: Test Migration Locally

```bash
# Start local Supabase (if using local development)
supabase start

# Apply migration locally
supabase db push

# Verify tables were created
supabase db diff
```

### Step 4: Apply to Production

```bash
# Link to production project
supabase link --project-ref your-prod-project-ref

# Push migrations to production
supabase db push
```

## Migration Best Practices

### 1. Always Use IF NOT EXISTS

Protect against re-running migrations:

```sql
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE INDEX IF NOT EXISTS idx_my_index ON my_table(column);
```

### 2. Include Descriptive Comments

Add clear comments explaining what the migration does:

```sql
-- ============================================================================
-- Migration Purpose
-- ============================================================================
-- Detailed description of changes and why they're needed
-- ============================================================================
```

### 3. Add Indexes for Query Performance

Always add indexes for:
- Foreign keys
- Frequently queried columns
- Columns used in WHERE clauses
- Columns used in ORDER BY

```sql
CREATE INDEX IF NOT EXISTS idx_table_column ON table(column);
```

### 4. Use Transactions (Implicit in Supabase)

Supabase automatically wraps migrations in transactions, but you can be explicit:

```sql
BEGIN;

-- Your migration statements here

COMMIT;
```

### 5. Test Rollback Strategy

While we don't have automatic rollbacks, plan for them:

```sql
-- Migration: 20260116120000_add_feature.sql
CREATE TABLE new_feature (...);

-- Rollback (manual): 20260116120001_rollback_add_feature.sql
DROP TABLE IF EXISTS new_feature;
```

### 6. Handle Data Migrations Carefully

When migrating data, use safe patterns:

```sql
-- Add new column with default
ALTER TABLE markets ADD COLUMN new_field TEXT DEFAULT 'default_value';

-- Backfill data (if needed)
UPDATE markets SET new_field = old_field WHERE new_field IS NULL;

-- Make NOT NULL after backfill (if required)
ALTER TABLE markets ALTER COLUMN new_field SET NOT NULL;
```

## Checking Migration Status

### Using Migration Runner

```bash
npm run migrate:status
```

Output:
```
=== Migration Status ===

Version          | Name                    | Status    | Applied At
-----------------|-------------------------|-----------|---------------------------
20260115162601   | migration_tracking      | ✓ Applied | 2026-01-15T16:26:01.000Z
20260115162602   | initial_schema          | ✓ Applied | 2026-01-15T16:26:02.000Z
20260116120000   | add_user_preferences    | Pending   | -
```

### Using Supabase CLI

```bash
supabase migration list
```

### Using SQL Query

```sql
SELECT 
  version,
  name,
  applied_at,
  execution_time_ms,
  success
FROM schema_migrations
ORDER BY version DESC;
```

## Troubleshooting

### Migration Lock Stuck

If a migration fails and leaves the lock acquired:

```sql
-- Check lock status
SELECT * FROM migration_lock;

-- Manually release lock
UPDATE migration_lock SET is_locked = false, locked_at = NULL, locked_by = NULL WHERE id = 1;
```

### Migration Failed Partially

Check the schema_migrations table:

```sql
SELECT * FROM schema_migrations WHERE success = false;
```

To retry:
1. Fix the migration SQL
2. Delete the failed record: `DELETE FROM schema_migrations WHERE version = 'YYYYMMDDHHMMSS';`
3. Re-run the migration

### Missing Migration Tracking Tables

If the migration tracking tables don't exist:

```bash
# Run the tracking migration manually
psql "your-connection-string" < supabase/migrations/20260115162601_migration_tracking.sql
```

## Production Deployment Checklist

Before deploying migrations to production:

- [ ] Test migration on local Supabase instance
- [ ] Test migration on staging environment
- [ ] Verify migration is idempotent (can run multiple times safely)
- [ ] Check for breaking changes to existing queries
- [ ] Backup production database
- [ ] Plan rollback strategy
- [ ] Schedule maintenance window if needed
- [ ] Monitor application logs after deployment

## Environment-Specific Migrations

### Development

```bash
# Local Supabase
supabase start
supabase db push
```

### Staging

```bash
supabase link --project-ref staging-project-ref
supabase db push
```

### Production

```bash
supabase link --project-ref prod-project-ref
supabase db push
```

## Migration Workflow Example

Complete workflow for adding a new feature:

```bash
# 1. Create migration file
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_add_market_tags.sql

# 2. Write migration SQL
cat > supabase/migrations/20260116120000_add_market_tags.sql << 'EOF'
-- Add tags support to markets
CREATE TABLE IF NOT EXISTS market_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_tags_market_id ON market_tags(market_id);
CREATE INDEX IF NOT EXISTS idx_market_tags_tag ON market_tags(tag);
EOF

# 3. Test locally
supabase db push

# 4. Check status
npm run migrate:status

# 5. Deploy to staging
supabase link --project-ref staging-ref
supabase db push

# 6. Deploy to production
supabase link --project-ref prod-ref
supabase db push
```

## Additional Resources

- [Supabase Migrations Documentation](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [SQL Best Practices](https://www.postgresql.org/docs/current/sql.html)

## Support

For issues with migrations:
1. Check the troubleshooting section above
2. Review Supabase logs in the dashboard
3. Check the schema_migrations table for error messages
4. Consult the team or create an issue
