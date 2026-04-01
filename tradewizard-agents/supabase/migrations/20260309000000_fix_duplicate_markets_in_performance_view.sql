-- ============================================================================
-- Fix Duplicate Markets in Performance View
-- ============================================================================
-- Issue: v_closed_markets_performance shows duplicate markets when a market
-- has multiple recommendations. This causes the same market to appear multiple
-- times on the history page.
--
-- Solution: Modify the view to show only the LATEST recommendation per market
-- using DISTINCT ON (market_id) with ORDER BY to select the most recent.
-- ============================================================================

-- Drop the existing view
DROP VIEW IF EXISTS v_closed_markets_performance;

-- Recreate the view with DISTINCT ON to ensure one row per market
CREATE OR REPLACE VIEW v_closed_markets_performance AS
SELECT DISTINCT ON (m.id)
  m.id as market_id,
  m.condition_id,
  m.question,
  m.event_type,
  m.status,
  m.resolved_outcome,
  r.id as recommendation_id,
  r.direction,
  r.fair_probability,
  r.market_edge,
  r.expected_value,
  r.confidence,
  r.entry_zone_min,
  r.entry_zone_max,
  r.explanation,
  ro.recommendation_was_correct,
  ro.roi_realized,
  ro.edge_captured,
  ro.market_probability_at_recommendation,
  ro.resolution_date,
  r.created_at as recommendation_created_at,
  -- Calculate days from recommendation to resolution
  EXTRACT(EPOCH FROM (ro.resolution_date - r.created_at)) / 86400 as days_to_resolution,
  -- Agent consensus metrics
  (
    SELECT COUNT(*)
    FROM agent_signals ags 
    WHERE ags.recommendation_id = r.id
  ) as total_agents,
  (
    SELECT COUNT(*)
    FROM agent_signals ags 
    WHERE ags.recommendation_id = r.id 
    AND ((ags.direction = 'YES' AND r.direction = 'LONG_YES') OR 
         (ags.direction = 'NO' AND r.direction = 'LONG_NO'))
  ) as agents_in_agreement
FROM markets m
JOIN recommendations r ON m.id = r.market_id
LEFT JOIN recommendation_outcomes ro ON r.id = ro.recommendation_id
WHERE m.status = 'resolved'
-- Order by market_id first (for DISTINCT ON), then by most recent recommendation
ORDER BY m.id, r.created_at DESC, ro.resolution_date DESC NULLS LAST;

-- Add comment explaining the view's purpose
COMMENT ON VIEW v_closed_markets_performance IS 
'Shows resolved markets with their LATEST recommendation and performance metrics. 
Uses DISTINCT ON (market_id) to ensure each market appears only once, 
selecting the most recent recommendation based on created_at timestamp.';
