-- ============================================================================
-- Drop all performance views and recommendation_outcomes table
-- ============================================================================

DROP VIEW IF EXISTS v_performance_by_agent CASCADE;
DROP VIEW IF EXISTS v_performance_summary CASCADE;
DROP VIEW IF EXISTS v_performance_by_confidence CASCADE;
DROP VIEW IF EXISTS v_performance_by_category CASCADE;
DROP VIEW IF EXISTS v_monthly_performance CASCADE;
DROP VIEW IF EXISTS v_closed_markets_performance CASCADE;

DROP TABLE IF EXISTS recommendation_outcomes CASCADE;
