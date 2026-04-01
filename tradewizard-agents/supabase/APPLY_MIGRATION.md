# Quick Start: Apply Direct Market Updater Migration

## Prerequisites

- Supabase CLI installed (`npm install -g supabase`)
- Database connection configured
- `http` extension enabled (migration will check)
- `pg_cron` extension enabled (migration will check)

## Apply Migration

### Using Supabase CLI (Recommended)

```bash
cd tradewizard-agents
supabase db push
```

### Using SQL Editor

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `migrations/20260219000000_direct_market_updater_cron.sql`
3. Paste and run

## Verify Installation

```bash
# Connect to your database
psql $DATABASE_URL

# Or use Supabase SQL Editor
```

```sql
-- Test the updater function
SELECT run_market_updater();

-- Check cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'market-updater-hourly';
```

## Expected Result

```json
{
  "total_markets": 10,
  "updated": 9,
  "resolved": 1,
  "failed": 0,
  "duration_ms": 2345,
  "errors": [],
  "timestamp": "2026-02-19T10:00:00.000Z"
}
```

## Monitor Execution

```sql
-- View last 10 executions
SELECT 
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'market-updater-hourly')
ORDER BY start_time DESC
LIMIT 10;
```

## Next Steps

1. ✅ Migration applied successfully
2. ✅ Cron job running hourly
3. ✅ Edge function no longer needed
4. 🗑️ Optional: Remove `supabase/functions/market-updater` directory

## Troubleshooting

**Cron job not found?**
```sql
-- Check if pg_cron is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

**HTTP function error?**
```sql
-- Check if http extension is enabled
SELECT * FROM pg_extension WHERE extname = 'http';
```

**Need help?**
- See `MIGRATION_20260219_README.md` for detailed documentation
- Check `cron.job_run_details` for error messages
