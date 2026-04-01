-- Migration: Market Updater Cron Job Setup
-- Description: Enables pg_cron extension and configures hourly market data updates
-- Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6

-- ============================================================================
-- Step 1: Enable pg_cron extension
-- ============================================================================
-- The pg_cron extension allows scheduling recurring jobs within PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- Step 2: Grant necessary permissions
-- ============================================================================
-- Grant usage on the cron schema to the postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Grant all privileges on cron tables to postgres role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================================================
-- Step 3: Enable http extension for making HTTP requests
-- ============================================================================
-- The http extension is required for net.http_post function
CREATE EXTENSION IF NOT EXISTS http;

-- ============================================================================
-- Step 4: Configure cron job schedule
-- ============================================================================
-- Schedule the market-updater edge function to run hourly
-- Cron expression '0 * * * *' means: at minute 0 of every hour
-- 
-- IMPORTANT: Before running this migration, you must set the service role key:
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project-ref.supabase.co';

SELECT cron.schedule(
  'market-updater-hourly',           -- Job name
  '0 * * * *',                       -- Cron expression (every hour at minute 0)
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
