-- ============================================================================
-- Fix v_closed_markets_performance to show one row per market
-- Uses DISTINCT ON (market_id) to pick the most recent recommendation per
-- market for display purposes only.
-- All aggregate views (summary, confidence, category, monthly, agent) are
-- unaffected and continue to count every recommendation.
-- ============================================================================

CREATE OR REPLACE VIEW v_closed_markets_performance AS
WITH computed AS (
  SELECT
    m.id                  AS market_id,
    m.condition_id,
    m.question,
    m.event_type,
    m.status,
    m.resolved_outcome,
    m.updated_at          AS resolution_date,
    r.id                  AS recommendation_id,
    r.direction,
    r.fair_probability,
    r.market_edge,
    r.expected_value,
    r.confidence,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    r.explanation,
    r.created_at          AS recommendation_created_at,
    (
      (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
      (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')  OR
      (r.direction = 'NO_TRADE')
    ) AS recommendation_was_correct,
    CASE
      WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max
      WHEN r.direction = 'LONG_NO'  THEN 1.0 - r.entry_zone_min
      ELSE 0.5
    END AS market_probability_at_recommendation,
    CASE
      WHEN r.direction = 'NO_TRADE' THEN 0
      WHEN r.stop_loss IS NOT NULL AND r.target_zone_min IS NOT NULL AND r.target_zone_max IS NOT NULL
      THEN
        CASE r.direction
          WHEN 'LONG_YES' THEN
            ROUND(
              ((CASE WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES')
                     THEN (r.target_zone_min + r.target_zone_max) / 2.0
                     ELSE r.stop_loss END
               - (r.entry_zone_min + r.entry_zone_max) / 2.0
              ) / NULLIF((r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)
          WHEN 'LONG_NO' THEN
            ROUND(
              ((CASE WHEN (r.direction = 'LONG_NO' AND m.resolved_outcome = 'NO')
                     THEN 1.0 - (r.target_zone_min + r.target_zone_max) / 2.0
                     ELSE 1.0 - r.stop_loss END
               - (1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0)
              ) / NULLIF(1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)
          ELSE 0
        END
      ELSE
        CASE
          WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') THEN (1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0) * 100
          WHEN (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')  THEN ((r.entry_zone_min + r.entry_zone_max) / 2.0) * 100
          ELSE -100
        END
    END AS roi_realized,
    CASE
      WHEN m.resolved_outcome = 'YES' THEN r.fair_probability - r.entry_zone_max
      WHEN m.resolved_outcome = 'NO'  THEN (1.0 - r.fair_probability) - (1.0 - r.entry_zone_min)
      ELSE 0
    END AS edge_captured
  FROM markets m
  JOIN recommendations r ON m.id = r.market_id
  WHERE m.status = 'resolved'
),
-- Pick the single most recent recommendation per market
deduped AS (
  SELECT DISTINCT ON (market_id) *
  FROM computed
  ORDER BY market_id, recommendation_created_at DESC
)
SELECT
  market_id,
  condition_id,
  question,
  event_type,
  status,
  resolved_outcome,
  recommendation_id,
  direction,
  fair_probability,
  market_edge,
  expected_value,
  confidence,
  entry_zone_min,
  entry_zone_max,
  explanation,
  recommendation_was_correct,
  roi_realized,
  edge_captured,
  market_probability_at_recommendation,
  resolution_date,
  recommendation_created_at,
  EXTRACT(EPOCH FROM (resolution_date - recommendation_created_at)) / 86400 AS days_to_resolution,
  (
    SELECT COUNT(*) FROM agent_signals ags WHERE ags.recommendation_id = deduped.recommendation_id
  ) AS total_agents,
  (
    SELECT COUNT(*) FROM agent_signals ags
    WHERE ags.recommendation_id = deduped.recommendation_id
      AND ((ags.direction = 'YES' AND deduped.direction = 'LONG_YES') OR
           (ags.direction = 'NO'  AND deduped.direction = 'LONG_NO'))
  ) AS agents_in_agreement
FROM deduped
ORDER BY resolution_date DESC NULLS LAST, recommendation_created_at DESC;
