-- Migration: Enable pg_net extension for HTTP requests
-- Description: Fixes "schema net does not exist" error in cron job
-- The pg_net extension provides the net.http_post function needed by the cron job

-- ============================================================================
-- Enable pg_net extension
-- ============================================================================
-- This extension provides HTTP client functionality for PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- Grant necessary permissions
-- ============================================================================
-- Grant usage on the net schema to the postgres role
GRANT USAGE ON SCHEMA net TO postgres;

-- Grant execute on all functions in the net schema
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres;

-- ============================================================================
-- Verification
-- ============================================================================
-- Verify the extension is enabled
-- SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- Verify the net schema exists
-- SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'net';

-- Test the http_post function is available
-- SELECT proname FROM pg_proc WHERE proname = 'http_post' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net');
