-- ============================================================================
-- Stop-Loss / Target-Based ROI Calculation
-- ============================================================================
-- The primary grading path now lives in the Next.js API route
-- (performance/[marketId]/route.ts), which fetches real intraday price history
-- from the Polymarket CLOB API and walks it to find which threshold was hit
-- first (target or stop loss) for each recommendation.
--
-- This DB function is the fallback used by the cron / trigger path when the
-- API has not yet graded a recommendation. It uses the resolved outcome as a
-- proxy (market resolved YES → price eventually reached 1.0, above any target;
-- resolved NO → price reached 0.0, below any stop loss) and calculates ROI
-- from the target/stop prices rather than the old binary 0/1 payout.
--
-- For LONG_YES:
--   Win  (resolved YES): ROI = (target_avg - entry_avg) / entry_avg * 100
--   Loss (resolved NO):  ROI = (stop_loss  - entry_avg) / entry_avg * 100
--
-- For LONG_NO (prices expressed as YES-token prices):
--   NO entry  = 1 - entry_avg
--   NO target = 1 - target_avg   (lower YES target → higher NO target)
--   NO stop   = 1 - stop_loss
--   Win  (resolved NO):  ROI = (NO_target - NO_entry) / NO_entry * 100
--   Loss (resolved YES): ROI = (NO_stop   - NO_entry) / NO_entry * 100
--
-- Falls back to binary payout for recommendations that predate the
-- stop_loss / target_zone columns.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_recommendation_outcomes()
RETURNS INTEGER AS $$
DECLARE
  rec               RECORD;
  outcome_correct   BOOLEAN;
  calculated_roi    DECIMAL(10,4);
  calculated_edge   DECIMAL(10,4);
  entry_avg         DECIMAL(10,6);
  target_avg        DECIMAL(10,6);
  stop_price        DECIMAL(10,6);
  no_entry          DECIMAL(10,6);
  no_target         DECIMAL(10,6);
  no_stop           DECIMAL(10,6);
  market_prob_est   DECIMAL(10,6);
  updated_count     INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT
      r.id                AS recommendation_id,
      r.market_id,
      r.direction,
      r.fair_probability,
      r.entry_zone_min,
      r.entry_zone_max,
      r.target_zone_min,
      r.target_zone_max,
      r.stop_loss,
      m.resolved_outcome,
      m.updated_at        AS resolution_date
    FROM recommendations r
    JOIN markets m ON r.market_id = m.id
    LEFT JOIN recommendation_outcomes ro ON r.id = ro.recommendation_id
    WHERE m.status = 'resolved'
      AND m.resolved_outcome IS NOT NULL
      AND ro.id IS NULL          -- only ungraded recommendations
  LOOP
    entry_avg := (rec.entry_zone_min + rec.entry_zone_max) / 2.0;

    -- Market probability estimate at recommendation time
    market_prob_est := CASE
      WHEN rec.direction = 'LONG_YES' THEN rec.entry_zone_max
      WHEN rec.direction = 'LONG_NO'  THEN 1.0 - rec.entry_zone_min
      ELSE 0.5
    END;

    -- ── Correctness ──────────────────────────────────────────────────────────
    outcome_correct := (
      (rec.direction = 'LONG_YES' AND rec.resolved_outcome = 'YES') OR
      (rec.direction = 'LONG_NO'  AND rec.resolved_outcome = 'NO')  OR
      (rec.direction = 'NO_TRADE')
    );

    -- ── ROI ──────────────────────────────────────────────────────────────────
    IF rec.direction = 'NO_TRADE' THEN
      calculated_roi := 0;

    ELSIF rec.stop_loss IS NOT NULL
      AND rec.target_zone_min IS NOT NULL
      AND rec.target_zone_max IS NOT NULL
    THEN
      target_avg := (rec.target_zone_min + rec.target_zone_max) / 2.0;
      stop_price := rec.stop_loss;

      IF rec.direction = 'LONG_YES' THEN
        calculated_roi := ROUND(
          ((CASE WHEN outcome_correct THEN target_avg ELSE stop_price END - entry_avg)
           / NULLIF(entry_avg, 0)) * 100,
          4
        );
      ELSE
        -- LONG_NO: work in NO-token space
        no_entry  := 1.0 - entry_avg;
        no_target := 1.0 - target_avg;
        no_stop   := 1.0 - stop_price;
        calculated_roi := ROUND(
          ((CASE WHEN outcome_correct THEN no_target ELSE no_stop END - no_entry)
           / NULLIF(no_entry, 0)) * 100,
          4
        );
      END IF;

    ELSE
      -- Legacy fallback: binary payout
      IF outcome_correct THEN
        calculated_roi := CASE
          WHEN rec.direction = 'LONG_YES' THEN (1.0 - entry_avg) * 100
          WHEN rec.direction = 'LONG_NO'  THEN entry_avg * 100
        END;
      ELSE
        calculated_roi := -100;
      END IF;
    END IF;

    -- ── Edge captured ────────────────────────────────────────────────────────
    calculated_edge := CASE
      WHEN rec.resolved_outcome = 'YES' THEN
        rec.fair_probability - market_prob_est
      WHEN rec.resolved_outcome = 'NO' THEN
        (1.0 - rec.fair_probability) - (1.0 - market_prob_est)
      ELSE 0
    END;

    INSERT INTO recommendation_outcomes (
      recommendation_id, market_id, actual_outcome,
      recommendation_was_correct, roi_realized, edge_captured,
      market_probability_at_recommendation, resolution_date
    ) VALUES (
      rec.recommendation_id, rec.market_id, rec.resolved_outcome,
      outcome_correct, calculated_roi, calculated_edge,
      market_prob_est, rec.resolution_date
    );

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Recalculate existing outcomes that used the old binary ROI formula.
-- Only touches rows where the recommendation has stop_loss + target_zone data.
-- ============================================================================
DELETE FROM recommendation_outcomes ro
WHERE EXISTS (
  SELECT 1 FROM recommendations r
  WHERE r.id = ro.recommendation_id
    AND r.direction != 'NO_TRADE'
    AND r.stop_loss IS NOT NULL
    AND r.target_zone_min IS NOT NULL
    AND r.target_zone_max IS NOT NULL
);

SELECT update_recommendation_outcomes();
