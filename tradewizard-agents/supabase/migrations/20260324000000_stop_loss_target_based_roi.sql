-- ============================================================================
-- Stop-Loss / Target-Based ROI Calculation
-- ============================================================================
-- Previously, ROI was calculated as a binary payout (win = full payout to $1,
-- loss = -100%). This ignores the stop_loss and target_zone fields that are
-- stored on every non-NO_TRADE recommendation.
--
-- New logic:
--   Entry price  = midpoint of entry_zone_min / entry_zone_max
--   Target price = midpoint of target_zone_min / target_zone_max
--   Stop price   = stop_loss
--
-- For LONG_YES:
--   Win  (resolved YES): price reached 1.0 → above any target
--     ROI = (target_price - entry_price) / entry_price * 100
--   Loss (resolved NO):  price reached 0.0 → below any stop
--     ROI = (stop_price  - entry_price) / entry_price * 100  (negative)
--
-- For LONG_NO (trading the NO token, price = 1 - YES_price):
--   Entry NO price  = 1 - entry_avg_YES
--   Target NO price = 1 - target_avg_YES  (lower YES = higher NO)
--   Stop NO price   = 1 - stop_loss_YES
--   Win  (resolved NO):  NO token → 1.0
--     ROI = (target_NO_price - entry_NO_price) / entry_NO_price * 100
--   Loss (resolved YES): NO token → 0.0
--     ROI = (stop_NO_price   - entry_NO_price) / entry_NO_price * 100  (negative)
--
-- NO_TRADE: ROI = 0, always correct.
--
-- Falls back to the old binary calculation when stop_loss or target_zone
-- columns are NULL (older recommendations that predate those columns).
-- ============================================================================

CREATE OR REPLACE FUNCTION update_recommendation_outcomes()
RETURNS INTEGER AS $$
DECLARE
  rec RECORD;
  outcome_correct    BOOLEAN;
  calculated_roi     DECIMAL(10,4);
  calculated_edge    DECIMAL(10,4);
  entry_avg          DECIMAL(10,6);
  target_avg         DECIMAL(10,6);
  stop_price         DECIMAL(10,6);
  updated_count      INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT
      r.id                  AS recommendation_id,
      r.market_id,
      r.direction,
      r.fair_probability,
      r.entry_zone_min,
      r.entry_zone_max,
      r.target_zone_min,
      r.target_zone_max,
      r.stop_loss,
      m.resolved_outcome,
      m.updated_at          AS resolution_date,
      CASE
        WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max
        WHEN r.direction = 'LONG_NO'  THEN (1.0 - r.entry_zone_min)
        ELSE 0.5
      END AS market_prob_estimate
    FROM recommendations r
    JOIN markets m ON r.market_id = m.id
    LEFT JOIN recommendation_outcomes ro ON r.id = ro.recommendation_id
    WHERE m.status = 'resolved'
      AND m.resolved_outcome IS NOT NULL
      AND ro.id IS NULL
  LOOP
    -- ----------------------------------------------------------------
    -- Correctness: unchanged — direction must match resolved outcome
    -- ----------------------------------------------------------------
    outcome_correct := (
      (rec.direction = 'LONG_YES' AND rec.resolved_outcome = 'YES') OR
      (rec.direction = 'LONG_NO'  AND rec.resolved_outcome = 'NO')  OR
      (rec.direction = 'NO_TRADE')
    );

    -- ----------------------------------------------------------------
    -- ROI calculation
    -- ----------------------------------------------------------------
    IF rec.direction = 'NO_TRADE' THEN
      calculated_roi := 0;

    ELSIF rec.stop_loss IS NOT NULL
      AND rec.target_zone_min IS NOT NULL
      AND rec.target_zone_max IS NOT NULL
    THEN
      -- Use stop-loss / target-zone prices for realistic trade management ROI

      entry_avg  := (rec.entry_zone_min + rec.entry_zone_max) / 2.0;
      target_avg := (rec.target_zone_min + rec.target_zone_max) / 2.0;
      stop_price := rec.stop_loss;

      IF rec.direction = 'LONG_YES' THEN
        -- Trading the YES token (price in [0,1])
        IF outcome_correct THEN
          -- Target hit: sold at target_avg
          calculated_roi := ROUND(
            ((target_avg - entry_avg) / NULLIF(entry_avg, 0)) * 100,
            4
          );
        ELSE
          -- Stop hit: sold at stop_price
          calculated_roi := ROUND(
            ((stop_price - entry_avg) / NULLIF(entry_avg, 0)) * 100,
            4
          );
        END IF;

      ELSIF rec.direction = 'LONG_NO' THEN
        -- Trading the NO token; entry_zone_* are expressed as YES prices,
        -- so NO token prices are their complements.
        DECLARE
          entry_no  DECIMAL(10,6) := 1.0 - entry_avg;
          target_no DECIMAL(10,6) := 1.0 - target_avg;  -- lower YES target → higher NO target
          stop_no   DECIMAL(10,6) := 1.0 - stop_price;  -- YES stop → NO stop complement
        BEGIN
          IF outcome_correct THEN
            calculated_roi := ROUND(
              ((target_no - entry_no) / NULLIF(entry_no, 0)) * 100,
              4
            );
          ELSE
            calculated_roi := ROUND(
              ((stop_no - entry_no) / NULLIF(entry_no, 0)) * 100,
              4
            );
          END IF;
        END;
      END IF;

    ELSE
      -- Fallback: old binary payout for recommendations without stop_loss/target
      IF outcome_correct THEN
        calculated_roi := CASE
          WHEN rec.direction = 'LONG_YES' THEN
            (1.0 - (rec.entry_zone_min + rec.entry_zone_max) / 2.0) * 100
          WHEN rec.direction = 'LONG_NO' THEN
            ((rec.entry_zone_min + rec.entry_zone_max) / 2.0) * 100
        END;
      ELSE
        calculated_roi := -100;
      END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- Edge captured
    -- ----------------------------------------------------------------
    calculated_edge := CASE
      WHEN rec.resolved_outcome = 'YES' THEN
        rec.fair_probability - rec.market_prob_estimate
      WHEN rec.resolved_outcome = 'NO' THEN
        (1.0 - rec.fair_probability) - (1.0 - rec.market_prob_estimate)
      ELSE 0
    END;

    INSERT INTO recommendation_outcomes (
      recommendation_id,
      market_id,
      actual_outcome,
      recommendation_was_correct,
      roi_realized,
      edge_captured,
      market_probability_at_recommendation,
      resolution_date
    ) VALUES (
      rec.recommendation_id,
      rec.market_id,
      rec.resolved_outcome,
      outcome_correct,
      calculated_roi,
      calculated_edge,
      rec.market_prob_estimate,
      rec.resolution_date
    );

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Recalculate existing outcomes that used the old binary ROI formula.
-- We delete and re-insert so the new function picks them up cleanly.
-- Only touches rows where the recommendation has stop_loss AND target_zone
-- data (i.e. rows that were previously calculated incorrectly).
-- ============================================================================
DELETE FROM recommendation_outcomes ro
WHERE EXISTS (
  SELECT 1
  FROM recommendations r
  WHERE r.id = ro.recommendation_id
    AND r.direction != 'NO_TRADE'
    AND r.stop_loss IS NOT NULL
    AND r.target_zone_min IS NOT NULL
    AND r.target_zone_max IS NOT NULL
);

-- Re-run the updated function to repopulate with correct ROI values
SELECT update_recommendation_outcomes();
