-- ============================================================================
-- Rewrite aggregate performance views to compute ROI inline
-- ============================================================================
-- Previously, views read from recommendation_outcomes which was populated by
-- update_recommendation_outcomes() using the old binary payout formula.
-- Now views compute ROI directly from recommendations + markets using the
-- target/stop-based formula, eliminating stale data from the DB-written rows.
--
-- The recommendation_outcomes table and update_recommendation_outcomes()
-- function are kept for backwards compatibility but are no longer the source
-- of truth for these views.
-- ============================================================================

-- Drop views first to avoid column type mismatch errors on CREATE OR REPLACE
DROP VIEW IF EXISTS v_performance_by_agent CASCADE;
DROP VIEW IF EXISTS v_performance_summary CASCADE;
DROP VIEW IF EXISTS v_performance_by_confidence CASCADE;
DROP VIEW IF EXISTS v_performance_by_category CASCADE;
DROP VIEW IF EXISTS v_monthly_performance CASCADE;
DROP VIEW IF EXISTS v_closed_markets_performance CASCADE;

-- v_performance_summary
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
    m.updated_at AS resolution_date,
    -- Correctness
    (
      (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
      (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')  OR
      (r.direction = 'NO_TRADE')
    ) AS recommendation_was_correct,
    -- Market probability estimate
    CASE
      WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max
      WHEN r.direction = 'LONG_NO'  THEN 1.0 - r.entry_zone_min
      ELSE 0.5
    END AS market_prob_est,
    -- ROI
    CASE
      WHEN r.direction = 'NO_TRADE' THEN 0
      WHEN r.stop_loss IS NOT NULL
        AND r.target_zone_min IS NOT NULL
        AND r.target_zone_max IS NOT NULL
      THEN
        CASE r.direction
          WHEN 'LONG_YES' THEN
            ROUND(
              (( CASE WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES')
                      THEN (r.target_zone_min + r.target_zone_max) / 2.0
                      ELSE r.stop_loss END
                - (r.entry_zone_min + r.entry_zone_max) / 2.0
              ) / NULLIF((r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100,
              4
            )
          WHEN 'LONG_NO' THEN
            ROUND(
              (( CASE WHEN (r.direction = 'LONG_NO' AND m.resolved_outcome = 'NO')
                      THEN 1.0 - (r.target_zone_min + r.target_zone_max) / 2.0
                      ELSE 1.0 - r.stop_loss END
                - (1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0)
              ) / NULLIF(1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100,
              4
            )
          ELSE 0
        END
      ELSE
        -- Legacy binary fallback
        CASE
          WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') THEN
            (1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0) * 100
          WHEN (r.direction = 'LONG_NO' AND m.resolved_outcome = 'NO') THEN
            ((r.entry_zone_min + r.entry_zone_max) / 2.0) * 100
          ELSE -100
        END
    END AS roi_realized,
    -- Edge captured
    CASE
      WHEN m.resolved_outcome = 'YES' THEN
        r.fair_probability - CASE WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max ELSE 1.0 - r.entry_zone_min END
      WHEN m.resolved_outcome = 'NO' THEN
        (1.0 - r.fair_probability) - (1.0 - CASE WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max ELSE 1.0 - r.entry_zone_min END)
      ELSE 0
    END AS edge_captured
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  WHERE m.status = 'resolved'
    AND m.resolved_outcome IS NOT NULL
    AND r.direction != 'NO_TRADE'
)
SELECT
  COUNT(*)                                                                          AS total_resolved_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                           AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                             AS avg_roi,
  ROUND(AVG(CASE WHEN recommendation_was_correct THEN roi_realized END)::numeric, 4) AS avg_winning_roi,
  ROUND(AVG(CASE WHEN NOT recommendation_was_correct THEN roi_realized END)::numeric, 4) AS avg_losing_roi,
  ROUND(AVG(edge_captured)::numeric, 4)                                            AS avg_edge_captured,
  COUNT(CASE WHEN direction = 'LONG_YES' THEN 1 END)                               AS long_yes_count,
  COUNT(CASE WHEN direction = 'LONG_NO'  THEN 1 END)                               AS long_no_count,
  0::bigint                                                                         AS no_trade_count,
  COUNT(CASE WHEN direction = 'LONG_YES' AND recommendation_was_correct THEN 1 END) AS long_yes_wins,
  COUNT(CASE WHEN direction = 'LONG_NO'  AND recommendation_was_correct THEN 1 END) AS long_no_wins
FROM computed;

-- v_performance_by_confidence
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
    (
      (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
      (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
    ) AS recommendation_was_correct,
    CASE
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
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  WHERE m.status = 'resolved'
    AND m.resolved_outcome IS NOT NULL
    AND r.direction != 'NO_TRADE'
)
SELECT
  confidence,
  COUNT(*)                                                                          AS total_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                           AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                             AS avg_roi,
  ROUND(AVG(edge_captured)::numeric, 4)                                            AS avg_edge_captured,
  ROUND(AVG(expected_value)::numeric, 4)                                           AS avg_expected_value,
  ROUND(AVG(fair_probability)::numeric, 4)                                         AS avg_fair_probability
FROM computed
GROUP BY confidence
ORDER BY CASE confidence WHEN 'high' THEN 1 WHEN 'moderate' THEN 2 WHEN 'low' THEN 3 END;

-- v_performance_by_category
CREATE OR REPLACE VIEW v_performance_by_category AS
WITH computed AS (
  SELECT
    m.event_type,
    m.volume_24h,
    m.liquidity,
    r.direction,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    m.resolved_outcome,
    (
      (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
      (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
    ) AS recommendation_was_correct,
    CASE
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
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  WHERE m.status = 'resolved'
    AND m.resolved_outcome IS NOT NULL
    AND r.direction != 'NO_TRADE'
)
SELECT
  event_type,
  COUNT(*)                                                                          AS total_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                           AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                             AS avg_roi,
  ROUND(AVG(edge_captured)::numeric, 4)                                            AS avg_edge_captured,
  ROUND(AVG(volume_24h)::numeric, 2)                                               AS avg_market_volume,
  ROUND(AVG(liquidity)::numeric, 2)                                                AS avg_market_liquidity
FROM computed
GROUP BY event_type
ORDER BY win_rate_pct DESC;

-- v_monthly_performance
CREATE OR REPLACE VIEW v_monthly_performance AS
WITH computed AS (
  SELECT
    m.updated_at AS resolution_date,
    r.direction,
    r.entry_zone_min,
    r.entry_zone_max,
    r.target_zone_min,
    r.target_zone_max,
    r.stop_loss,
    m.resolved_outcome,
    (
      (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
      (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
    ) AS recommendation_was_correct,
    CASE
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
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  WHERE m.status = 'resolved'
    AND m.resolved_outcome IS NOT NULL
    AND r.direction != 'NO_TRADE'
    AND m.updated_at IS NOT NULL
)
SELECT
  DATE_TRUNC('month', resolution_date)                                             AS month,
  COUNT(*)                                                                          AS total_recommendations,
  COUNT(CASE WHEN recommendation_was_correct THEN 1 END)                           AS correct_recommendations,
  ROUND(100.0 * COUNT(CASE WHEN recommendation_was_correct THEN 1 END) / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
  ROUND(AVG(roi_realized)::numeric, 4)                                             AS avg_roi,
  ROUND(SUM(CASE WHEN recommendation_was_correct THEN roi_realized ELSE 0 END)::numeric, 4) AS total_profit,
  ROUND(AVG(edge_captured)::numeric, 4)                                            AS avg_edge_captured
FROM computed
GROUP BY DATE_TRUNC('month', resolution_date)
ORDER BY month DESC;

-- v_closed_markets_performance
-- Also rewritten to compute inline — no longer joins recommendation_outcomes
CREATE OR REPLACE VIEW v_closed_markets_performance AS
WITH computed AS (
  SELECT
    m.id                  AS market_id,
    m.condition_id,
    m.question,
    m.event_type,
    m.status,
    m.resolved_outcome,
    m.volume_24h,
    m.liquidity,
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
    SELECT COUNT(*) FROM agent_signals ags WHERE ags.recommendation_id = computed.recommendation_id
  ) AS total_agents,
  (
    SELECT COUNT(*) FROM agent_signals ags
    WHERE ags.recommendation_id = computed.recommendation_id
      AND ((ags.direction = 'YES' AND computed.direction = 'LONG_YES') OR
           (ags.direction = 'NO'  AND computed.direction = 'LONG_NO'))
  ) AS agents_in_agreement
FROM computed
ORDER BY resolution_date DESC NULLS LAST, recommendation_created_at DESC;

-- v_performance_by_agent
-- Recreated after CASCADE drop — still joins recommendation_outcomes for
-- agent signal accuracy, but ROI comes from inline computation.
CREATE OR REPLACE VIEW v_performance_by_agent AS
WITH rec_computed AS (
  SELECT
    r.id AS recommendation_id,
    m.resolved_outcome,
    (
      (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') OR
      (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')
    ) AS recommendation_was_correct,
    CASE
      WHEN r.stop_loss IS NOT NULL AND r.target_zone_min IS NOT NULL AND r.target_zone_max IS NOT NULL
      THEN
        CASE r.direction
          WHEN 'LONG_YES' THEN
            ROUND(
              ((CASE WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES')
                     THEN (r.target_zone_min + r.target_zone_max) / 2.0
                     ELSE r.stop_loss END
               - (r.entry_zone_min + r.entry_zone_max) / 2.0
              ) / NULLIF((r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)::numeric(10,4)
          WHEN 'LONG_NO' THEN
            ROUND(
              ((CASE WHEN (r.direction = 'LONG_NO' AND m.resolved_outcome = 'NO')
                     THEN 1.0 - (r.target_zone_min + r.target_zone_max) / 2.0
                     ELSE 1.0 - r.stop_loss END
               - (1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0)
              ) / NULLIF(1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0, 0)) * 100, 4)::numeric(10,4)
          ELSE 0::numeric(10,4)
        END
      ELSE
        CASE
          WHEN (r.direction = 'LONG_YES' AND m.resolved_outcome = 'YES') THEN ((1.0 - (r.entry_zone_min + r.entry_zone_max) / 2.0) * 100)::numeric(10,4)
          WHEN (r.direction = 'LONG_NO'  AND m.resolved_outcome = 'NO')  THEN (((r.entry_zone_min + r.entry_zone_max) / 2.0) * 100)::numeric(10,4)
          ELSE (-100)::numeric(10,4)
        END
    END AS roi_realized
  FROM recommendations r
  JOIN markets m ON r.market_id = m.id
  WHERE m.status = 'resolved'
    AND m.resolved_outcome IS NOT NULL
    AND r.direction != 'NO_TRADE'
)
SELECT
  ags.agent_name,
  ags.agent_type,
  COUNT(DISTINCT rc.recommendation_id)                                              AS total_recommendations,
  COUNT(CASE WHEN rc.recommendation_was_correct THEN 1 END)                        AS correct_recommendations,
  ROUND(
    100.0 * COUNT(CASE WHEN rc.recommendation_was_correct THEN 1 END)
    / NULLIF(COUNT(DISTINCT rc.recommendation_id), 0), 2
  )                                                                                 AS win_rate_pct,
  ROUND(AVG(rc.roi_realized)::numeric, 4)                                          AS avg_roi,
  ROUND(AVG(ags.fair_probability)::numeric, 4)                                     AS avg_agent_probability,
  ROUND(AVG(ags.confidence)::numeric, 2)                                           AS avg_agent_confidence,
  COUNT(CASE WHEN ags.direction = 'YES' AND rc.resolved_outcome = 'YES' THEN 1 END) +
  COUNT(CASE WHEN ags.direction = 'NO'  AND rc.resolved_outcome = 'NO'  THEN 1 END) AS agent_correct_signals,
  COUNT(ags.id)                                                                     AS total_agent_signals,
  ROUND(
    100.0 * (
      COUNT(CASE WHEN ags.direction = 'YES' AND rc.resolved_outcome = 'YES' THEN 1 END) +
      COUNT(CASE WHEN ags.direction = 'NO'  AND rc.resolved_outcome = 'NO'  THEN 1 END)
    ) / NULLIF(COUNT(ags.id), 0), 2
  )                                                                                 AS agent_signal_accuracy_pct
FROM rec_computed rc
JOIN agent_signals ags ON rc.recommendation_id = ags.recommendation_id
GROUP BY ags.agent_name, ags.agent_type
ORDER BY win_rate_pct DESC;
