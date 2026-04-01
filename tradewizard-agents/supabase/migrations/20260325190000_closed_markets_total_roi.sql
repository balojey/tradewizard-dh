-- ============================================================================
-- Add total_roi and recommendation_count to v_closed_markets_performance
-- ============================================================================
-- The card on the history page must show total ROI across ALL recommendations
-- for a market, not just the most recent one.
--
-- Strategy:
--   1. Compute per-recommendation ROI for every rec on every resolved market
--      (same formula as all other views).
--   2. Aggregate into a per-market CTE: total_roi = SUM, rec_count = COUNT,
--      correct_count = COUNT WHERE correct.
--   3. JOIN that aggregate back onto the deduped row (most recent rec) so the
--      card still shows the latest direction/confidence/explanation while
--      displaying the full-history ROI.
-- ============================================================================

-- Must drop first — PostgreSQL won't let CREATE OR REPLACE reorder/rename columns
DROP VIEW IF EXISTS v_closed_markets_performance;

CREATE VIEW v_closed_markets_performance AS
WITH all_recs AS (
  -- Per-recommendation ROI for every resolved market (all recs, not deduped)
  SELECT
    m.id                  AS market_id,
    r.id                  AS recommendation_id,
    r.direction,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    m.resolved_outcome,
    rg.status             AS grade_status,
    rg.price_at_threshold,
    r.created_at          AS recommendation_created_at,
    CASE
      WHEN rg.status = 'SUCCESS' THEN TRUE
      WHEN rg.status = 'FAILURE' THEN FALSE
      ELSE (
        (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
        (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')  OR
        (r.direction = 'NO_TRADE')
      )
    END AS recommendation_was_correct,
    CASE
      WHEN r.direction = 'NO_TRADE' THEN 0
      WHEN rg.status IN ('SUCCESS','FAILURE') AND rg.price_at_threshold IS NOT NULL THEN
        ROUND(((rg.price_at_threshold - (r.entry_zone_min + r.entry_zone_max) / 2.0)
               / NULLIF((r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)
      WHEN r.stop_loss IS NOT NULL AND r.target_zone_min IS NOT NULL AND r.target_zone_max IS NOT NULL THEN
        ROUND(((CASE
                  WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
                       (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
                  THEN (r.target_zone_min + r.target_zone_max) / 2.0
                  ELSE r.stop_loss END
                - (r.entry_zone_min + r.entry_zone_max) / 2.0)
               / NULLIF((r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)
      ELSE
        CASE
          WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
               (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
          THEN (1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0) * 100
          ELSE -100
        END
    END AS roi_realized
  FROM markets m
  JOIN recommendations r ON m.id = r.market_id
  LEFT JOIN recommendation_grades rg ON rg.recommendation_id = r.id
  WHERE m.status = 'resolved'
),
market_agg AS (
  -- Aggregate all recommendations per market
  SELECT
    market_id,
    COUNT(*)                                                          AS recommendation_count,
    COUNT(CASE WHEN recommendation_was_correct AND direction != 'NO_TRADE' THEN 1 END)
                                                                      AS correct_count,
    ROUND(SUM(roi_realized)::numeric, 4)                              AS total_roi,
    ROUND(AVG(roi_realized)::numeric, 4)                              AS avg_roi
  FROM all_recs
  GROUP BY market_id
),
latest_rec AS (
  -- Most recent recommendation per market (for display: direction, confidence, explanation)
  SELECT DISTINCT ON (market_id) *
  FROM all_recs
  ORDER BY market_id, recommendation_created_at DESC
),
computed AS (
  SELECT
    m.id                  AS market_id,
    m.condition_id,
    m.question,
    m.event_type,
    m.status,
    m.resolved_outcome,
    m.updated_at          AS resolution_date,
    lr.recommendation_id,
    lr.direction,
    lr.recommendation_was_correct,
    lr.recommendation_created_at,
    lr.roi_realized       AS latest_roi,
    ma.total_roi,
    ma.avg_roi,
    ma.recommendation_count,
    ma.correct_count,
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
    CASE
      WHEN lr.direction = 'LONG_YES' THEN r.entry_zone_max
      WHEN lr.direction = 'LONG_NO'  THEN 1.0 - r.entry_zone_min
      ELSE 0.5
    END AS market_probability_at_recommendation,
    CASE
      WHEN m.resolved_outcome = 'YES' THEN r.fair_probability - r.entry_zone_max
      WHEN m.resolved_outcome = 'NO'  THEN (1.0 - r.fair_probability) - (1.0 - r.entry_zone_min)
      ELSE 0
    END AS edge_captured
  FROM markets m
  JOIN latest_rec lr ON lr.market_id = m.id
  JOIN recommendations r ON r.id = lr.recommendation_id
  JOIN market_agg ma ON ma.market_id = m.id
  WHERE m.status = 'resolved'
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
  -- total_roi is the primary ROI shown on the card (all recs summed)
  total_roi                                   AS roi_realized,
  avg_roi,
  recommendation_count,
  correct_count,
  edge_captured,
  market_probability_at_recommendation,
  resolution_date,
  recommendation_created_at,
  EXTRACT(EPOCH FROM (resolution_date - recommendation_created_at)) / 86400 AS days_to_resolution,
  (
    SELECT COUNT(*) FROM agent_signals ags
    WHERE ags.recommendation_id = computed.recommendation_id
  ) AS total_agents,
  (
    SELECT COUNT(*) FROM agent_signals ags
    WHERE ags.recommendation_id = computed.recommendation_id
      AND ((ags.direction = 'YES' AND computed.direction = 'LONG_YES') OR
           (ags.direction = 'NO'  AND computed.direction = 'LONG_NO'))
  ) AS agents_in_agreement
FROM computed
ORDER BY resolution_date DESC NULLS LAST, recommendation_created_at DESC;
