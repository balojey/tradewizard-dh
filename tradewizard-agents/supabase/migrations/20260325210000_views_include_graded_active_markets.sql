-- ============================================================================
-- Rewrite all performance views to include graded recommendations from
-- BOTH resolved AND active markets.
-- ============================================================================
-- Previously every view filtered on m.status = 'resolved', which excluded
-- any recommendation that hit its target/stop on an active market.
-- recommendation_grades is the source of truth for grading — a SUCCESS or
-- FAILURE grade is definitive regardless of whether the market has resolved.
--
-- New inclusion rule:
--   Include a recommendation if EITHER:
--     (a) The market is resolved (m.status = 'resolved') — use resolved_outcome
--         as the correctness signal when no grade exists.
--     (b) The recommendation has a definitive grade (rg.status IN ('SUCCESS','FAILURE'))
--         — grade is the correctness signal regardless of market status.
--
-- ROI priority (unchanged):
--   1. Grade SUCCESS/FAILURE with price_at_threshold → accurate intraday ROI
--   2. Resolved market + zones exist → resolution fallback
--   3. Resolved market + no zones → binary payout fallback
--
-- Correctness priority (unchanged):
--   SUCCESS → true, FAILURE → false, else resolved_outcome match
-- ============================================================================

-- ============================================================================
-- Shared base CTE (inlined per view):
--
--   FROM recommendations r
--   JOIN markets m ON r.market_id = m.id
--   LEFT JOIN recommendation_grades rg ON rg.recommendation_id = r.id
--   WHERE r.direction != 'NO_TRADE'
--     AND (
--       m.status = 'resolved'
--       OR rg.status IN ('SUCCESS', 'FAILURE')
--     )
-- ============================================================================

-- ============================================================================
-- v_performance_summary
-- ============================================================================
CREATE OR REPLACE VIEW v_performance_summary AS
WITH computed AS (
  SELECT
    r.id,
    r.direction,
    r.confidence,
    r.fair_probability,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    m.resolved_outcome,
    m.updated_at          AS resolution_date,
    rg.status             AS grade_status,
    rg.price_at_threshold,
    CASE
      WHEN rg.status = 'SUCCESS' THEN TRUE
      WHEN rg.status = 'FAILURE' THEN FALSE
      ELSE (
        (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
        (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
      )
    END AS recommendation_was_correct,
    CASE
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
    END AS roi_realized,
    CASE
      WHEN m.resolved_outcome = 'YES' THEN
        r.fair_probability - CASE WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max ELSE 1.0 - r.entry_zone_min END
      WHEN m.resolved_outcome = 'NO' THEN
        (1.0 - r.fair_probability) - (1.0 - CASE WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max ELSE 1.0 - r.entry_zone_min END)
      ELSE 0
    END AS edge_captured
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  LEFT JOIN recommendation_grades rg ON rg.recommendation_id = r.id
  WHERE r.direction != 'NO_TRADE'
    AND (
      (m.status = 'resolved' AND m.resolved_outcome IS NOT NULL)
      OR rg.status IN ('SUCCESS', 'FAILURE')
    )
)
SELECT
  COUNT(*)                                                                                        AS total_resolved_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                                         AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                                           AS avg_roi,
  ROUND(AVG(CASE WHEN recommendation_was_correct THEN roi_realized END)::numeric, 4)             AS avg_winning_roi,
  ROUND(AVG(CASE WHEN NOT recommendation_was_correct THEN roi_realized END)::numeric, 4)         AS avg_losing_roi,
  ROUND(AVG(edge_captured)::numeric, 4)                                                          AS avg_edge_captured,
  COUNT(CASE WHEN direction = 'LONG_YES' THEN 1 END)                                             AS long_yes_count,
  COUNT(CASE WHEN direction = 'LONG_NO'  THEN 1 END)                                             AS long_no_count,
  0::bigint                                                                                       AS no_trade_count,
  COUNT(CASE WHEN direction = 'LONG_YES' AND recommendation_was_correct THEN 1 END)              AS long_yes_wins,
  COUNT(CASE WHEN direction = 'LONG_NO'  AND recommendation_was_correct THEN 1 END)              AS long_no_wins
FROM computed;

-- ============================================================================
-- v_performance_by_confidence
-- ============================================================================
CREATE OR REPLACE VIEW v_performance_by_confidence AS
WITH computed AS (
  SELECT
    r.confidence,
    r.direction,
    r.expected_value,
    r.fair_probability,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    m.resolved_outcome,
    rg.status             AS grade_status,
    rg.price_at_threshold,
    CASE
      WHEN rg.status = 'SUCCESS' THEN TRUE
      WHEN rg.status = 'FAILURE' THEN FALSE
      ELSE (
        (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
        (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
      )
    END AS recommendation_was_correct,
    CASE
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
    END AS roi_realized,
    CASE
      WHEN m.resolved_outcome = 'YES' THEN r.fair_probability - r.entry_zone_max
      WHEN m.resolved_outcome = 'NO'  THEN (1.0 - r.fair_probability) - (1.0 - r.entry_zone_min)
      ELSE 0
    END AS edge_captured
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  LEFT JOIN recommendation_grades rg ON rg.recommendation_id = r.id
  WHERE r.direction != 'NO_TRADE'
    AND (
      (m.status = 'resolved' AND m.resolved_outcome IS NOT NULL)
      OR rg.status IN ('SUCCESS', 'FAILURE')
    )
)
SELECT
  confidence,
  COUNT(*)                                                                                        AS total_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                                         AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                                           AS avg_roi,
  ROUND(AVG(edge_captured)::numeric, 4)                                                          AS avg_edge_captured,
  ROUND(AVG(expected_value)::numeric, 4)                                                         AS avg_expected_value,
  ROUND(AVG(fair_probability)::numeric, 4)                                                       AS avg_fair_probability
FROM computed
GROUP BY confidence
ORDER BY CASE confidence WHEN 'high' THEN 1 WHEN 'moderate' THEN 2 WHEN 'low' THEN 3 END;

-- ============================================================================
-- v_performance_by_category
-- ============================================================================
CREATE OR REPLACE VIEW v_performance_by_category AS
WITH computed AS (
  SELECT
    m.event_type,
    m.volume_24h,
    m.liquidity,
    r.direction,
    r.fair_probability,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    m.resolved_outcome,
    rg.status             AS grade_status,
    rg.price_at_threshold,
    CASE
      WHEN rg.status = 'SUCCESS' THEN TRUE
      WHEN rg.status = 'FAILURE' THEN FALSE
      ELSE (
        (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
        (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
      )
    END AS recommendation_was_correct,
    CASE
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
    END AS roi_realized,
    CASE
      WHEN m.resolved_outcome = 'YES' THEN r.fair_probability - r.entry_zone_max
      WHEN m.resolved_outcome = 'NO'  THEN (1.0 - r.fair_probability) - (1.0 - r.entry_zone_min)
      ELSE 0
    END AS edge_captured
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  LEFT JOIN recommendation_grades rg ON rg.recommendation_id = r.id
  WHERE r.direction != 'NO_TRADE'
    AND (
      (m.status = 'resolved' AND m.resolved_outcome IS NOT NULL)
      OR rg.status IN ('SUCCESS', 'FAILURE')
    )
)
SELECT
  event_type,
  COUNT(*)                                                                                        AS total_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                                         AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                                           AS avg_roi,
  ROUND(AVG(edge_captured)::numeric, 4)                                                          AS avg_edge_captured,
  ROUND(AVG(volume_24h)::numeric, 2)                                                             AS avg_market_volume,
  ROUND(AVG(liquidity)::numeric, 2)                                                              AS avg_market_liquidity
FROM computed
GROUP BY event_type
ORDER BY win_rate_pct DESC;

-- ============================================================================
-- v_monthly_performance
-- Bucket by grade threshold_reached_at for active-market grades,
-- resolution_date for resolved-market fallback.
-- ============================================================================
CREATE OR REPLACE VIEW v_monthly_performance AS
WITH computed AS (
  SELECT
    -- Use threshold_reached_at when graded on active market, else resolution date
    COALESCE(rg.threshold_reached_at, m.updated_at) AS event_date,
    r.direction,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    m.resolved_outcome,
    rg.status             AS grade_status,
    rg.price_at_threshold,
    CASE
      WHEN rg.status = 'SUCCESS' THEN TRUE
      WHEN rg.status = 'FAILURE' THEN FALSE
      ELSE (
        (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
        (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
      )
    END AS recommendation_was_correct,
    CASE
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
    END AS roi_realized,
    CASE
      WHEN m.resolved_outcome = 'YES' THEN r.fair_probability - r.entry_zone_max
      WHEN m.resolved_outcome = 'NO'  THEN (1.0 - r.fair_probability) - (1.0 - r.entry_zone_min)
      ELSE 0
    END AS edge_captured
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  LEFT JOIN recommendation_grades rg ON rg.recommendation_id = r.id
  WHERE r.direction != 'NO_TRADE'
    AND (
      (m.status = 'resolved' AND m.resolved_outcome IS NOT NULL)
      OR rg.status IN ('SUCCESS', 'FAILURE')
    )
    AND COALESCE(rg.threshold_reached_at, m.updated_at) IS NOT NULL
)
SELECT
  DATE_TRUNC('month', event_date)                                                                AS month,
  COUNT(*)                                                                                        AS total_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                                         AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                                           AS avg_roi,
  ROUND(SUM(CASE WHEN recommendation_was_correct THEN roi_realized ELSE 0 END)::numeric, 4)      AS total_profit,
  ROUND(AVG(edge_captured)::numeric, 4)                                                          AS avg_edge_captured
FROM computed
GROUP BY DATE_TRUNC('month', event_date)
ORDER BY month DESC;

-- ============================================================================
-- v_performance_by_agent
-- ============================================================================
CREATE OR REPLACE VIEW v_performance_by_agent AS
WITH rec_computed AS (
  SELECT
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
    CASE
      WHEN rg.status = 'SUCCESS' THEN TRUE
      WHEN rg.status = 'FAILURE' THEN FALSE
      ELSE (
        (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
        (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
      )
    END AS recommendation_was_correct,
    CASE
      WHEN rg.status IN ('SUCCESS','FAILURE') AND rg.price_at_threshold IS NOT NULL THEN
        ROUND(((rg.price_at_threshold - (r.entry_zone_min + r.entry_zone_max) / 2.0)
               / NULLIF((r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)::numeric(10,4)
      WHEN r.stop_loss IS NOT NULL AND r.target_zone_min IS NOT NULL AND r.target_zone_max IS NOT NULL THEN
        ROUND(((CASE
                  WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
                       (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
                  THEN (r.target_zone_min + r.target_zone_max) / 2.0
                  ELSE r.stop_loss END
                - (r.entry_zone_min + r.entry_zone_max) / 2.0)
               / NULLIF((r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)::numeric(10,4)
      ELSE
        CASE
          WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
               (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
          THEN ((1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0) * 100)::numeric(10,4)
          ELSE (-100)::numeric(10,4)
        END
    END AS roi_realized
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  LEFT JOIN recommendation_grades rg ON rg.recommendation_id = r.id
  WHERE r.direction != 'NO_TRADE'
    AND (
      (m.status = 'resolved' AND m.resolved_outcome IS NOT NULL)
      OR rg.status IN ('SUCCESS', 'FAILURE')
    )
)
SELECT
  ags.agent_name,
  ags.agent_type,
  COUNT(DISTINCT rc.recommendation_id)                                                            AS total_recommendations,
  COUNT(CASE WHEN rc.recommendation_was_correct THEN 1 END)                                      AS correct_recommendations,
  ROUND(
    100.0 * COUNT(CASE WHEN rc.recommendation_was_correct THEN 1 END)
    / NULLIF(COUNT(DISTINCT rc.recommendation_id), 0), 2
  )                                                                                               AS win_rate_pct,
  ROUND(AVG(rc.roi_realized)::numeric, 4)                                                        AS avg_roi,
  ROUND(AVG(ags.fair_probability)::numeric, 4)                                                   AS avg_agent_probability,
  ROUND(AVG(ags.confidence)::numeric, 2)                                                         AS avg_agent_confidence,
  COUNT(CASE WHEN ags.direction = 'YES' AND rc.resolved_outcome = 'YES' THEN 1 END) +
  COUNT(CASE WHEN ags.direction = 'NO'  AND rc.resolved_outcome = 'NO'  THEN 1 END)              AS agent_correct_signals,
  COUNT(ags.id)                                                                                   AS total_agent_signals,
  ROUND(
    100.0 * (
      COUNT(CASE WHEN ags.direction = 'YES' AND rc.resolved_outcome = 'YES' THEN 1 END) +
      COUNT(CASE WHEN ags.direction = 'NO'  AND rc.resolved_outcome = 'NO'  THEN 1 END)
    ) / NULLIF(COUNT(ags.id), 0), 2
  )                                                                                               AS agent_signal_accuracy_pct
FROM rec_computed rc
JOIN agent_signals ags ON rc.recommendation_id = ags.recommendation_id
GROUP BY ags.agent_name, ags.agent_type
ORDER BY win_rate_pct DESC;
