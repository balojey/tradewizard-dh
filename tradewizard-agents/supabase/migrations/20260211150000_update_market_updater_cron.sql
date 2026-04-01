-- Migration: Update Market Updater Cron Job
-- Description: Removes service role key from cron job headers since edge function uses environment variables
-- Date: 2026-02-11

-- ============================================================================
-- Step 1: Unschedule the existing cron job
-- ============================================================================
-- Remove the old cron job that required service role key in headers
SELECT cron.unschedule('market-updater-hourly');

-- ============================================================================
-- Step 2: Create updated cron job without Authorization header
-- ============================================================================
-- Schedule the market-updater edge function to run hourly
-- Cron expression '0 * * * *' means: at minute 0 of every hour
-- 
-- The edge function now uses SUPABASE_SERVICE_ROLE_KEY from its own environment
-- so we don't need to pass it in the Authorization header

SELECT cron.schedule(
  'market-updater-hourly',           -- Job name
  '0 * * * *',                       -- Cron expression (every hour at minute 0)
  $$
  SELECT
    net.http_post(
      url := 'https://zerctdhzckdemcyyvmzb.supabase.co/functions/v1/market-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Use these queries to verify the cron job is configured correctly:
--
-- 1. Check if the cron job exists:
-- SELECT * FROM cron.job WHERE jobname = 'market-updater-hourly';
--
-- 2. View recent job executions:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'market-updater-hourly')
-- ORDER BY start_time DESC
-- LIMIT 10;
--
-- 3. Check for failed executions:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'market-updater-hourly')
-- AND status = 'failed'
-- ORDER BY start_time DESC;
--
-- 4. Check job configuration:
-- SELECT jobname, schedule, command 
-- FROM cron.job 
-- WHERE jobname = 'market-updater-hourly';
