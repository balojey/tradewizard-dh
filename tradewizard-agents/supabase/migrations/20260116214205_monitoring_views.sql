-- ============================================================================
-- TradeWizard Automated Market Monitor - Monitoring Views and Functions
-- ============================================================================
-- Creates views and functions for monitoring market analysis statistics,
-- agent performance, cost tracking, and quota usage trends
-- ============================================================================

-- ============================================================================
-- MARKET ANALYSIS STATISTICS
-- ============================================================================

-- Query 1: Overall Market Analysis Summary
-- Shows total markets, analyses, success rate, and average duration
CREATE OR REPLACE VIEW v_market_analysis_summary AS
SELECT
  COUNT(DISTINCT m.id) as total_markets,
  COUNT(DISTINCT CASE WHEN m.status = 'active' THEN m.id END) as active_markets,
  COUNT(DISTINCT CASE WHEN m.status = 'resolved' THEN m.id END) as resolved_markets,
  COUNT(ah.id) as total_analyses,
  COUNT(CASE WHEN ah.status = 'success' THEN 1 END) as successful_analyses,
  COUNT(CASE WHEN ah.status = 'failed' THEN 1 END) as failed_analyses,
  ROUND(
    100.0 * COUNT(CASE WHEN ah.status = 'success' THEN 1 END) / NULLIF(COUNT(ah.id), 0),
    2
  ) as success_rate_pct,
  ROUND(AVG(ah.duration_ms)::numeric, 0) as avg_duration_ms,
  ROUND(AVG(CASE WHEN ah.status = 'success' THEN ah.duration_ms END)::numeric, 0) as avg_success_duration_ms,
  MAX(ah.created_at) as last_analysis_time
FROM markets m
LEFT JOIN analysis_history ah ON m.id = ah.market_id;

-- Query 2: Market Analysis Statistics by Day
-- Shows daily trends in market analysis activity
CREATE OR REPLACE VIEW v_daily_analysis_stats AS
SELECT
  DATE(ah.created_at) as analysis_date,
  COUNT(DISTINCT ah.market_id) as markets_analyzed,
  COUNT(ah.id) as total_analyses,
  COUNT(CASE WHEN ah.status = 'success' THEN 1 END) as successful_analyses,
  COUNT(CASE WHEN ah.status = 'failed' THEN 1 END) as failed_analyses,
  ROUND(
    100.0 * COUNT(CASE WHEN ah.status = 'success' THEN 1 END) / NULLIF(COUNT(ah.id), 0),
    2
  ) as success_rate_pct,
  ROUND(AVG(ah.duration_ms)::numeric, 0) as avg_duration_ms,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd
FROM analysis_history ah
GROUP BY DATE(ah.created_at)
ORDER BY analysis_date DESC;

-- Query 3: Market Analysis Statistics by Type
-- Shows breakdown by analysis type (initial, update, manual)
CREATE OR REPLACE VIEW v_analysis_stats_by_type AS
SELECT
  ah.analysis_type,
  COUNT(ah.id) as total_analyses,
  COUNT(CASE WHEN ah.status = 'success' THEN 1 END) as successful_analyses,
  COUNT(CASE WHEN ah.status = 'failed' THEN 1 END) as failed_analyses,
  ROUND(
    100.0 * COUNT(CASE WHEN ah.status = 'success' THEN 1 END) / NULLIF(COUNT(ah.id), 0),
    2
  ) as success_rate_pct,
  ROUND(AVG(ah.duration_ms)::numeric, 0) as avg_duration_ms,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd
FROM analysis_history ah
GROUP BY ah.analysis_type
ORDER BY total_analyses DESC;

-- Query 4: Most Analyzed Markets
-- Shows which markets are analyzed most frequently
CREATE OR REPLACE VIEW v_most_analyzed_markets AS
SELECT
  m.condition_id,
  m.question,
  m.event_type,
  m.status,
  COUNT(ah.id) as analysis_count,
  MAX(ah.created_at) as last_analyzed,
  ROUND(AVG(ah.duration_ms)::numeric, 0) as avg_duration_ms,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd
FROM markets m
JOIN analysis_history ah ON m.id = ah.market_id
GROUP BY m.id, m.condition_id, m.question, m.event_type, m.status
ORDER BY analysis_count DESC
LIMIT 50;

-- Query 5: Recent Analysis Activity
-- Shows the most recent analyses with details
CREATE OR REPLACE VIEW v_recent_analyses AS
SELECT
  ah.created_at,
  m.condition_id,
  m.question,
  ah.analysis_type,
  ah.status,
  ah.duration_ms,
  ah.cost_usd,
  ah.error_message,
  r.direction,
  r.confidence
FROM analysis_history ah
JOIN markets m ON ah.market_id = m.id
LEFT JOIN recommendations r ON ah.market_id = r.market_id
  AND r.created_at = (
    SELECT MAX(created_at)
    FROM recommendations
    WHERE market_id = ah.market_id
  )
ORDER BY ah.created_at DESC
LIMIT 100;

-- ============================================================================
-- AGENT PERFORMANCE OVER TIME
-- ============================================================================

-- Query 6: Agent Performance Summary
-- Shows overall performance metrics for each agent
CREATE OR REPLACE VIEW v_agent_performance_summary AS
SELECT
  ag.agent_name,
  ag.agent_type,
  COUNT(ag.id) as total_signals,
  ROUND(AVG(ag.confidence)::numeric, 3) as avg_confidence,
  ROUND(AVG(ag.fair_probability)::numeric, 4) as avg_fair_probability,
  COUNT(DISTINCT ag.market_id) as markets_analyzed,
  COUNT(DISTINCT CASE WHEN ag.direction = 'LONG_YES' THEN ag.id END) as long_yes_signals,
  COUNT(DISTINCT CASE WHEN ag.direction = 'LONG_NO' THEN ag.id END) as long_no_signals,
  COUNT(DISTINCT CASE WHEN ag.direction = 'NO_TRADE' THEN ag.id END) as no_trade_signals,
  MAX(ag.created_at) as last_signal_time
FROM agent_signals ag
GROUP BY ag.agent_name, ag.agent_type
ORDER BY total_signals DESC;

-- Query 7: Agent Performance by Day
-- Shows daily trends in agent signal generation
CREATE OR REPLACE VIEW v_daily_agent_performance AS
SELECT
  DATE(ag.created_at) as signal_date,
  ag.agent_name,
  COUNT(ag.id) as signals_generated,
  ROUND(AVG(ag.confidence)::numeric, 3) as avg_confidence,
  COUNT(DISTINCT ag.market_id) as markets_analyzed
FROM agent_signals ag
GROUP BY DATE(ag.created_at), ag.agent_name
ORDER BY signal_date DESC, signals_generated DESC;

-- Query 8: Agent Confidence Distribution
-- Shows distribution of confidence levels by agent
CREATE OR REPLACE VIEW v_agent_confidence_distribution AS
SELECT
  ag.agent_name,
  CASE
    WHEN ag.confidence >= 0.8 THEN 'High (0.8+)'
    WHEN ag.confidence >= 0.6 THEN 'Medium (0.6-0.8)'
    WHEN ag.confidence >= 0.4 THEN 'Low (0.4-0.6)'
    ELSE 'Very Low (<0.4)'
  END as confidence_bucket,
  COUNT(ag.id) as signal_count,
  ROUND(
    100.0 * COUNT(ag.id) / SUM(COUNT(ag.id)) OVER (PARTITION BY ag.agent_name),
    2
  ) as percentage
FROM agent_signals ag
GROUP BY ag.agent_name, confidence_bucket
ORDER BY ag.agent_name, confidence_bucket;

-- Query 9: Agent Direction Agreement
-- Shows how often agents agree on direction
CREATE OR REPLACE VIEW v_agent_direction_agreement AS
SELECT
  ag.market_id,
  m.question,
  COUNT(DISTINCT ag.agent_name) as total_agents,
  COUNT(DISTINCT CASE WHEN ag.direction = 'LONG_YES' THEN ag.agent_name END) as long_yes_count,
  COUNT(DISTINCT CASE WHEN ag.direction = 'LONG_NO' THEN ag.agent_name END) as long_no_count,
  COUNT(DISTINCT CASE WHEN ag.direction = 'NO_TRADE' THEN ag.agent_name END) as no_trade_count,
  CASE
    WHEN COUNT(DISTINCT ag.direction) = 1 THEN 'Full Agreement'
    WHEN COUNT(DISTINCT ag.direction) = 2 THEN 'Partial Agreement'
    ELSE 'No Agreement'
  END as agreement_level,
  MAX(ag.created_at) as last_signal_time
FROM agent_signals ag
JOIN markets m ON ag.market_id = m.id
GROUP BY ag.market_id, m.question
ORDER BY last_signal_time DESC;

-- Query 10: Agent Usage in Analyses
-- Shows which agents are used most frequently in analyses
CREATE OR REPLACE VIEW v_agent_usage_frequency AS
SELECT
  agent_name,
  COUNT(*) as usage_count,
  ROUND(
    100.0 * COUNT(*) / (SELECT COUNT(*) FROM analysis_history WHERE agents_used IS NOT NULL),
    2
  ) as usage_percentage
FROM analysis_history,
  jsonb_array_elements_text(agents_used) as agent_name
WHERE agents_used IS NOT NULL
GROUP BY agent_name
ORDER BY usage_count DESC;

-- ============================================================================
-- COST TRACKING
-- ============================================================================

-- Query 11: Cost Summary
-- Shows overall cost statistics
CREATE OR REPLACE VIEW v_cost_summary AS
SELECT
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(ah.cost_usd)::numeric, 4) as avg_cost_per_analysis,
  ROUND(MIN(ah.cost_usd)::numeric, 4) as min_cost_usd,
  ROUND(MAX(ah.cost_usd)::numeric, 4) as max_cost_usd,
  COUNT(ah.id) as total_analyses,
  COUNT(DISTINCT ah.market_id) as unique_markets
FROM analysis_history ah
WHERE ah.cost_usd IS NOT NULL;

-- Query 12: Daily Cost Tracking
-- Shows daily cost trends
CREATE OR REPLACE VIEW v_daily_cost_tracking AS
SELECT
  DATE(ah.created_at) as cost_date,
  COUNT(ah.id) as analyses_count,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(ah.cost_usd)::numeric, 4) as avg_cost_per_analysis,
  ROUND(MIN(ah.cost_usd)::numeric, 4) as min_cost_usd,
  ROUND(MAX(ah.cost_usd)::numeric, 4) as max_cost_usd
FROM analysis_history ah
WHERE ah.cost_usd IS NOT NULL
GROUP BY DATE(ah.created_at)
ORDER BY cost_date DESC;

-- Query 13: Cost by Analysis Type
-- Shows cost breakdown by analysis type
CREATE OR REPLACE VIEW v_cost_by_analysis_type AS
SELECT
  ah.analysis_type,
  COUNT(ah.id) as analyses_count,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(ah.cost_usd)::numeric, 4) as avg_cost_per_analysis,
  ROUND(
    100.0 * SUM(ah.cost_usd) / NULLIF((SELECT SUM(cost_usd) FROM analysis_history WHERE cost_usd IS NOT NULL), 0),
    2
  ) as cost_percentage
FROM analysis_history ah
WHERE ah.cost_usd IS NOT NULL
GROUP BY ah.analysis_type
ORDER BY total_cost_usd DESC;

-- Query 14: Cost by Market
-- Shows which markets are most expensive to analyze
CREATE OR REPLACE VIEW v_cost_by_market AS
SELECT
  m.condition_id,
  m.question,
  m.event_type,
  COUNT(ah.id) as analyses_count,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(ah.cost_usd)::numeric, 4) as avg_cost_per_analysis
FROM markets m
JOIN analysis_history ah ON m.id = ah.market_id
WHERE ah.cost_usd IS NOT NULL
GROUP BY m.id, m.condition_id, m.question, m.event_type
ORDER BY total_cost_usd DESC
LIMIT 50;

-- Query 15: Monthly Cost Projection
-- Projects monthly costs based on recent activity
CREATE OR REPLACE VIEW v_monthly_cost_projection AS
SELECT
  DATE_TRUNC('month', CURRENT_DATE) as projection_month,
  COUNT(ah.id) as analyses_this_month,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as cost_this_month,
  ROUND(
    SUM(ah.cost_usd) * 30.0 / EXTRACT(DAY FROM CURRENT_DATE),
    4
  ) as projected_monthly_cost
FROM analysis_history ah
WHERE ah.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND ah.cost_usd IS NOT NULL;

-- ============================================================================
-- QUOTA USAGE TRENDS
-- ============================================================================

-- Query 16: Analysis Volume Trends
-- Shows trends in analysis volume over time (proxy for quota usage)
CREATE OR REPLACE VIEW v_analysis_volume_trends AS
SELECT
  DATE(ah.created_at) as analysis_date,
  COUNT(ah.id) as total_analyses,
  COUNT(CASE WHEN ah.analysis_type = 'initial' THEN 1 END) as initial_analyses,
  COUNT(CASE WHEN ah.analysis_type = 'update' THEN 1 END) as update_analyses,
  COUNT(CASE WHEN ah.analysis_type = 'manual' THEN 1 END) as manual_analyses,
  COUNT(DISTINCT ah.market_id) as unique_markets
FROM analysis_history ah
GROUP BY DATE(ah.created_at)
ORDER BY analysis_date DESC;

-- Query 17: Hourly Analysis Distribution
-- Shows when analyses are typically run (helps understand quota usage patterns)
CREATE OR REPLACE VIEW v_hourly_analysis_distribution AS
SELECT
  EXTRACT(HOUR FROM ah.created_at) as hour_of_day,
  COUNT(ah.id) as analysis_count,
  ROUND(
    100.0 * COUNT(ah.id) / (SELECT COUNT(*) FROM analysis_history),
    2
  ) as percentage
FROM analysis_history ah
GROUP BY EXTRACT(HOUR FROM ah.created_at)
ORDER BY hour_of_day;

-- Query 18: Weekly Analysis Trends
-- Shows weekly patterns in analysis activity
CREATE OR REPLACE VIEW v_weekly_analysis_trends AS
SELECT
  DATE_TRUNC('week', ah.created_at) as week_start,
  COUNT(ah.id) as total_analyses,
  COUNT(DISTINCT ah.market_id) as unique_markets,
  ROUND(SUM(ah.cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(ah.duration_ms)::numeric, 0) as avg_duration_ms
FROM analysis_history ah
GROUP BY DATE_TRUNC('week', ah.created_at)
ORDER BY week_start DESC;

-- Query 19: Market Update Frequency
-- Shows how often markets are being updated (quota usage indicator)
CREATE OR REPLACE VIEW v_market_update_frequency AS
SELECT
  m.condition_id,
  m.question,
  m.status,
  COUNT(ah.id) as total_updates,
  MIN(ah.created_at) as first_analysis,
  MAX(ah.created_at) as last_analysis,
  EXTRACT(EPOCH FROM (MAX(ah.created_at) - MIN(ah.created_at))) / 3600 as hours_between_first_last,
  CASE
    WHEN COUNT(ah.id) > 1 THEN
      ROUND(
        EXTRACT(EPOCH FROM (MAX(ah.created_at) - MIN(ah.created_at))) / (COUNT(ah.id) - 1) / 3600,
        2
      )
    ELSE NULL
  END as avg_hours_between_updates
FROM markets m
JOIN analysis_history ah ON m.id = ah.market_id
GROUP BY m.id, m.condition_id, m.question, m.status
HAVING COUNT(ah.id) > 1
ORDER BY total_updates DESC;

-- Query 20: Analysis Capacity Utilization
-- Shows how close the system is to capacity limits
CREATE OR REPLACE VIEW v_analysis_capacity_utilization AS
SELECT
  DATE(ah.created_at) as analysis_date,
  COUNT(ah.id) as analyses_performed,
  3 as configured_max_per_day,
  ROUND(
    100.0 * COUNT(ah.id) / 3,
    2
  ) as capacity_utilization_pct,
  CASE
    WHEN COUNT(ah.id) >= 3 THEN 'At Capacity'
    WHEN COUNT(ah.id) >= 2 THEN 'High Utilization'
    ELSE 'Normal'
  END as utilization_status
FROM analysis_history ah
WHERE ah.analysis_type IN ('initial', 'update')
GROUP BY DATE(ah.created_at)
ORDER BY analysis_date DESC;

-- ============================================================================
-- HELPER FUNCTIONS FOR DASHBOARD QUERIES
-- ============================================================================

-- Function to get analysis statistics for a date range
CREATE OR REPLACE FUNCTION get_analysis_stats_for_period(
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  total_analyses BIGINT,
  successful_analyses BIGINT,
  failed_analyses BIGINT,
  success_rate_pct NUMERIC,
  avg_duration_ms NUMERIC,
  total_cost_usd NUMERIC,
  unique_markets BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(ah.id)::BIGINT,
    COUNT(CASE WHEN ah.status = 'success' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN ah.status = 'failed' THEN 1 END)::BIGINT,
    ROUND(
      100.0 * COUNT(CASE WHEN ah.status = 'success' THEN 1 END) / NULLIF(COUNT(ah.id), 0),
      2
    ),
    ROUND(AVG(ah.duration_ms)::numeric, 0),
    ROUND(SUM(ah.cost_usd)::numeric, 4),
    COUNT(DISTINCT ah.market_id)::BIGINT
  FROM analysis_history ah
  WHERE ah.created_at BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to get agent performance for a date range
CREATE OR REPLACE FUNCTION get_agent_performance_for_period(
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  agent_name TEXT,
  agent_type TEXT,
  total_signals BIGINT,
  avg_confidence NUMERIC,
  markets_analyzed BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ag.agent_name,
    ag.agent_type,
    COUNT(ag.id)::BIGINT,
    ROUND(AVG(ag.confidence)::numeric, 3),
    COUNT(DISTINCT ag.market_id)::BIGINT
  FROM agent_signals ag
  WHERE ag.created_at BETWEEN start_date AND end_date
  GROUP BY ag.agent_name, ag.agent_type
  ORDER BY COUNT(ag.id) DESC;
END;
$$ LANGUAGE plpgsql;
