# Database Migrations

This directory contains SQL migration files for the TradeWizard database schema.

## Quick Start

### Run All Migrations

```bash
# Using Supabase CLI (recommended)
supabase db push

# Or check status first
npm run migrate:status
```

### Create New Migration

```bash
# Generate timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Create migration file
touch supabase/migrations/${TIMESTAMP}_your_migration_name.sql
```

## Migration Files

Migrations are executed in chronological order based on the timestamp prefix:

| Version        | Name                  | Description                                    |
|----------------|-----------------------|------------------------------------------------|
| 20260115162601 | migration_tracking    | Sets up migration tracking infrastructure      |
| 20260115162602 | initial_schema        | Creates core tables (markets, recommendations) |

## File Naming Convention

```
YYYYMMDDHHMMSS_description.sql
```

- **YYYY**: 4-digit year
- **MM**: 2-digit month
- **DD**: 2-digit day
- **HH**: 2-digit hour (24-hour format)
- **MM**: 2-digit minute
- **SS**: 2-digit second
- **description**: Snake_case description of the migration

Example: `20260115162602_initial_schema.sql`

## Migration Template

```sql
-- ============================================================================
-- Migration Title
-- ============================================================================
-- Description of what this migration does and why
-- ============================================================================

-- Create tables
CREATE TABLE IF NOT EXISTS my_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_my_table_name ON my_table(name);

-- Apply triggers (if needed)
DROP TRIGGER IF EXISTS update_my_table_updated_at ON my_table;
CREATE TRIGGER update_my_table_updated_at
  BEFORE UPDATE ON my_table
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## Best Practices

1. **Always use `IF NOT EXISTS`** - Makes migrations idempotent
2. **Add descriptive comments** - Explain what and why
3. **Create indexes** - For foreign keys and frequently queried columns
4. **Test locally first** - Use `supabase start` and `supabase db push`
5. **One logical change per migration** - Keep migrations focused

## Documentation

For detailed migration documentation, see:
- [src/database/MIGRATIONS.md](../../src/database/MIGRATIONS.md) - Complete migration guide
- [Supabase Docs](https://supabase.com/docs/guides/cli/local-development#database-migrations)

## Troubleshooting

### Migration tracking not initialized

```bash
# Run the tracking migration first
psql "your-connection-string" < 20260115162601_migration_tracking.sql
```

### Check migration status

```bash
npm run migrate:status
```

### View applied migrations

```sql
SELECT version, name, applied_at, success 
FROM schema_migrations 
ORDER BY version DESC;
```


## Market Updater Cron Job (20260211111442)

This migration sets up an automated hourly job to update market data from Polymarket.

### Prerequisites

Before running this migration, you must configure the database settings with your Supabase credentials:

```sql
-- Set the Supabase URL (replace with your project URL)
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project-ref.supabase.co';

-- Set the service role key (replace with your actual key)
ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key-here';
```

**Important:** Keep your service role key secure. Never commit it to version control.

### What This Migration Does

1. **Enables pg_cron extension** - Allows scheduling recurring jobs in PostgreSQL
2. **Enables http extension** - Required for making HTTP requests to edge functions
3. **Grants permissions** - Gives postgres role access to cron schema
4. **Creates hourly job** - Schedules market-updater edge function to run every hour

### Deployment Steps

#### Step 1: Set Database Configuration

Connect to your Supabase database and run:

```sql
-- Replace these values with your actual credentials
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://xxxxx.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJhbGc...your-key-here';
```

To verify the settings are stored:

```sql
SELECT name, setting 
FROM pg_settings 
WHERE name LIKE 'app.settings%';
```

#### Step 2: Run the Migration

```bash
# Using Supabase CLI
cd tradewizard-agents
supabase db push

# Or apply this specific migration
psql "your-connection-string" < supabase/migrations/20260211111442_market_updater_cron.sql
```

#### Step 3: Verify Cron Job is Running

```sql
-- Check if the job exists
SELECT jobid, jobname, schedule, active 
FROM cron.job 
WHERE jobname = 'market-updater-hourly';

-- Expected output:
-- jobid | jobname                | schedule    | active
-- ------|------------------------|-------------|--------
-- 1     | market-updater-hourly  | 0 * * * *   | t
```

### Monitoring the Cron Job

#### Check Recent Executions

```sql
-- View last 10 executions
SELECT 
  job_run_details.runid,
  job_run_details.start_time,
  job_run_details.end_time,
  job_run_details.status,
  job_run_details.return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'market-updater-hourly')
ORDER BY start_time DESC
LIMIT 10;
```

#### Check for Failed Executions

```sql
-- View failed executions with error details
SELECT 
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'market-updater-hourly')
  AND status = 'failed'
ORDER BY start_time DESC;
```

#### Monitor Execution Performance

```sql
-- View execution duration statistics
SELECT 
  COUNT(*) as total_runs,
  AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration_seconds,
  MAX(EXTRACT(EPOCH FROM (end_time - start_time))) as max_duration_seconds,
  MIN(EXTRACT(EPOCH FROM (end_time - start_time))) as min_duration_seconds
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'market-updater-hourly')
  AND status = 'succeeded'
  AND start_time > NOW() - INTERVAL '7 days';
```

### Checking Edge Function Logs

In addition to cron job logs, you can check the edge function execution logs:

1. **Via Supabase Dashboard:**
   - Navigate to Edge Functions → market-updater → Logs
   - View execution summaries, errors, and performance metrics

2. **Via Database Query:**
```sql
-- Check recent market updates (indicates successful runs)
SELECT 
  condition_id,
  question,
  status,
  market_probability,
  updated_at
FROM markets
WHERE updated_at > NOW() - INTERVAL '2 hours'
ORDER BY updated_at DESC;
```

### Troubleshooting

#### Job Not Running

If the cron job isn't executing:

1. **Check if job is active:**
```sql
SELECT jobid, jobname, active 
FROM cron.job 
WHERE jobname = 'market-updater-hourly';
```

2. **Verify database settings are configured:**
```sql
SELECT name, setting 
FROM pg_settings 
WHERE name LIKE 'app.settings%';
```

3. **Check for errors in job run details:**
```sql
SELECT return_message 
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'market-updater-hourly')
ORDER BY start_time DESC
LIMIT 1;
```

#### HTTP Request Failures

If the edge function isn't being invoked:

1. **Verify edge function is deployed:**
```bash
supabase functions list
```

2. **Test manual invocation:**
```bash
curl -X POST \
  https://your-project-ref.supabase.co/functions/v1/market-updater \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json"
```

3. **Check http extension is enabled:**
```sql
SELECT * FROM pg_extension WHERE extname = 'http';
```

#### Updating Configuration

To update the Supabase URL or service role key:

```sql
-- Update URL
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://new-url.supabase.co';

-- Update service role key
ALTER DATABASE postgres SET app.settings.service_role_key = 'new-key-here';

-- Reload configuration
SELECT pg_reload_conf();
```

### Modifying the Schedule

To change the cron schedule:

```sql
-- Unschedule the existing job
SELECT cron.unschedule('market-updater-hourly');

-- Create new schedule (example: every 30 minutes)
SELECT cron.schedule(
  'market-updater-hourly',
  '*/30 * * * *',  -- Every 30 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/market-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

### Disabling the Cron Job

To temporarily disable the job without deleting it:

```sql
-- Disable the job
SELECT cron.unschedule('market-updater-hourly');

-- To re-enable, run the schedule command again from the migration file
```

### Security Considerations

1. **Service Role Key:** The service role key has full database access. Store it securely in database settings, never in code or version control.

2. **Database Settings:** The `app.settings.*` configuration is stored in the database and persists across restarts.

3. **Network Access:** Ensure your Supabase project allows HTTP requests from the database to edge functions.

4. **Monitoring:** Regularly check cron job logs for unauthorized access attempts or unusual patterns.

### Related Documentation

- [Edge Function Implementation](../functions/market-updater/README.md)
- [Requirements Document](../../.kiro/specs/supabase-market-updater/requirements.md)
- [Design Document](../../.kiro/specs/supabase-market-updater/design.md)
- [pg_cron Documentation](https://github.com/citusdata/pg_cron)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
