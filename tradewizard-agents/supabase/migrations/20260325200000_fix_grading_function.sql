-- ============================================================================
-- Fix grade_pending_recommendations — use price history for resolved markets
-- ============================================================================
-- The previous version only checked the CURRENT live midpoint price (single
-- snapshot). This works for active markets but is wrong for resolved markets:
--   - A resolved YES market has price ≈ 1.0 now, but the recommendation may
--     have been made when price was 0.4 and the target was 0.7.
--   - The cron would see price=1.0 >= target=0.7 and call it SUCCESS, but the
--     ROI would be computed against the live price (1.0) not the actual
--     threshold price (0.7), inflating ROI.
--   - Worse: for LONG_NO on a YES-resolved market, token_price = 1-1.0 = 0.0
--     which hits the stop loss, incorrectly grading it FAILURE.
--
-- Fix: mirror gradeByPriceHistory from [marketId]/route.ts exactly:
--   1. For RESOLVED markets: fetch full price history via
--      /prices-history?market=<tokenId>&interval=max&fidelity=60
--      Walk from recommendation.created_at forward, find the FIRST candle
--      where tokenPrice >= target_zone_min (SUCCESS) or <= stop_loss (FAILURE).
--      Store price_at_threshold as the actual threshold value (targetMin or
--      stopLoss), NOT the live price.
--   2. For ACTIVE markets: keep current live-midpoint behaviour (real-time
--      monitoring is correct for open positions).
-- ============================================================================

CREATE OR REPLACE FUNCTION grade_pending_recommendations()
RETURNS JSONB AS $$
DECLARE
  v_rec              RECORD;
  v_token_id         TEXT;
  v_http_resp        RECORD;
  v_market_data      JSONB;
  v_price_data       JSONB;
  v_history_data     JSONB;
  v_history_arr      JSONB;
  v_candle           JSONB;
  v_yes_price        DECIMAL(20,10);
  v_token_price      DECIMAL(20,10);
  v_entry_avg        DECIMAL(20,10);
  v_target_min       DECIMAL(20,10);
  v_stop             DECIMAL(20,10);
  v_new_status       TEXT;
  v_price_at_thr     DECIMAL(20,10);
  v_threshold_ts     TIMESTAMPTZ;
  v_progress         DECIMAL(5,2);
  v_rec_ts           BIGINT;
  v_candle_ts        BIGINT;
  v_candle_price     DECIMAL(20,10);
  v_i                INT;
  v_arr_len          INT;

  v_evaluated        INT := 0;
  v_succeeded        INT := 0;
  v_failed_grade     INT := 0;
  v_still_pending    INT := 0;
  v_errors           INT := 0;
BEGIN
  FOR v_rec IN
    SELECT
      r.id              AS recommendation_id,
      r.market_id,
      r.direction,
      r.entry_zone_min,
      r.entry_zone_max,
      r.target_zone_min,
      r.target_zone_max,
      r.stop_loss,
      r.created_at      AS recommendation_created_at,
      m.condition_id,
      m.clob_token_ids,
      m.status          AS market_status
    FROM recommendations r
    JOIN markets m ON m.id = r.market_id
    WHERE r.direction IN ('LONG_YES', 'LONG_NO')
      AND NOT EXISTS (
        SELECT 1 FROM recommendation_grades rg
        WHERE rg.recommendation_id = r.id
          AND rg.status IN ('SUCCESS', 'FAILURE')
      )
      AND r.target_zone_min IS NOT NULL
      AND r.target_zone_max IS NOT NULL
      AND r.stop_loss      IS NOT NULL
  LOOP
    v_evaluated := v_evaluated + 1;

    BEGIN
      -- ── 1. Resolve YES token ID ──────────────────────────────────────────
      v_token_id := v_rec.clob_token_ids ->> 0;

      IF v_token_id IS NULL OR v_token_id = '' THEN
        SELECT * INTO v_http_resp
        FROM http_get('https://clob.polymarket.com/markets/' || v_rec.condition_id);

        IF v_http_resp.status = 200 THEN
          v_market_data := (v_http_resp.content)::JSONB;
          v_token_id    := v_market_data -> 'tokens' -> 0 ->> 'token_id';

          UPDATE markets
          SET clob_token_ids = jsonb_build_array(
            v_market_data -> 'tokens' -> 0 ->> 'token_id',
            v_market_data -> 'tokens' -> 1 ->> 'token_id'
          )
          WHERE id = v_rec.market_id;
        END IF;
      END IF;

      IF v_token_id IS NULL OR v_token_id = '' THEN
        INSERT INTO recommendation_grades (
          recommendation_id, market_id, status, graded_at, updated_at
        ) VALUES (
          v_rec.recommendation_id, v_rec.market_id, 'PENDING', NOW(), NOW()
        )
        ON CONFLICT (recommendation_id) DO UPDATE SET
          status = 'PENDING', graded_at = NOW(), updated_at = NOW();

        v_still_pending := v_still_pending + 1;
        CONTINUE;
      END IF;

      -- ── 2. Compute shared values ─────────────────────────────────────────
      v_entry_avg  := (v_rec.entry_zone_min + v_rec.entry_zone_max) / 2.0;
      v_target_min := v_rec.target_zone_min;
      v_stop       := v_rec.stop_loss;

      v_new_status   := 'PENDING';
      v_price_at_thr := NULL;
      v_threshold_ts := NULL;

      -- ── 3. Branch: resolved vs active ────────────────────────────────────
      IF v_rec.market_status = 'resolved' THEN

        -- ── 3a. Resolved: walk full price history ──────────────────────────
        -- GET /prices-history?market=<tokenId>&interval=max&fidelity=60
        -- Returns { "history": [{ "t": <unix_sec>, "p": "<price>" }, ...] }
        SELECT * INTO v_http_resp
        FROM http_get(
          'https://clob.polymarket.com/prices-history?market=' || v_token_id
          || '&interval=max&fidelity=60'
        );

        IF v_http_resp.status != 200 THEN
          v_errors := v_errors + 1;
          CONTINUE;
        END IF;

        v_history_data := (v_http_resp.content)::JSONB;
        v_history_arr  := v_history_data -> 'history';

        IF v_history_arr IS NULL OR jsonb_array_length(v_history_arr) = 0 THEN
          -- No history available — fall back to PENDING, will retry next run
          v_still_pending := v_still_pending + 1;
          CONTINUE;
        END IF;

        -- Convert recommendation timestamp to Unix milliseconds for comparison
        v_rec_ts := EXTRACT(EPOCH FROM v_rec.recommendation_created_at)::BIGINT * 1000;

        v_arr_len := jsonb_array_length(v_history_arr);

        FOR v_i IN 0 .. v_arr_len - 1 LOOP
          v_candle := v_history_arr -> v_i;

          -- Candle timestamp is in seconds; convert to ms for comparison
          v_candle_ts    := ((v_candle ->> 't')::BIGINT) * 1000;
          v_candle_price := (v_candle ->> 'p')::DECIMAL(20,10);

          -- Only consider candles AFTER the recommendation was created
          CONTINUE WHEN v_candle_ts < v_rec_ts;

          -- Convert YES price to token space (mirrors gradeByPriceHistory)
          IF v_rec.direction = 'LONG_YES' THEN
            v_token_price := v_candle_price;
          ELSE
            v_token_price := 1.0 - v_candle_price;
          END IF;

          -- Check thresholds — first crossing wins
          IF v_token_price >= v_target_min THEN
            v_new_status   := 'SUCCESS';
            -- Store the actual threshold value, NOT the live price
            v_price_at_thr := v_target_min;
            v_threshold_ts := TO_TIMESTAMP(v_candle_ts / 1000.0);
            EXIT; -- stop walking history
          END IF;

          IF v_token_price <= v_stop THEN
            v_new_status   := 'FAILURE';
            v_price_at_thr := v_stop;
            v_threshold_ts := TO_TIMESTAMP(v_candle_ts / 1000.0);
            EXIT;
          END IF;
        END LOOP;

        -- If no threshold was hit in history, leave PENDING
        -- (market may have resolved without hitting either zone)

      ELSE

        -- ── 3b. Active: live midpoint snapshot (existing behaviour) ─────────
        -- GET /midpoint?token_id=<id>  →  { "mid": "0.62" }
        SELECT * INTO v_http_resp
        FROM http_get('https://clob.polymarket.com/midpoint?token_id=' || v_token_id);

        IF v_http_resp.status != 200 THEN
          v_errors := v_errors + 1;
          CONTINUE;
        END IF;

        v_price_data := (v_http_resp.content)::JSONB;
        v_yes_price  := (v_price_data ->> 'mid')::DECIMAL(20,10);

        IF v_yes_price IS NULL THEN
          v_errors := v_errors + 1;
          CONTINUE;
        END IF;

        IF v_rec.direction = 'LONG_YES' THEN
          v_token_price := v_yes_price;
        ELSE
          v_token_price := 1.0 - v_yes_price;
        END IF;

        IF v_token_price >= v_target_min THEN
          v_new_status   := 'SUCCESS';
          v_price_at_thr := v_target_min;
          v_threshold_ts := NOW();
        ELSIF v_token_price <= v_stop THEN
          v_new_status   := 'FAILURE';
          v_price_at_thr := v_stop;
          v_threshold_ts := NOW();
        END IF;

      END IF; -- resolved vs active

      -- ── 4. Progress for PENDING ───────────────────────────────────────────
      v_progress := NULL;
      IF v_new_status = 'PENDING' THEN
        IF ABS(v_target_min - v_entry_avg) < 1e-10 THEN
          v_progress := 0;
        ELSIF v_token_price IS NOT NULL AND v_token_price >= v_entry_avg THEN
          v_progress := ROUND(
            ((v_token_price - v_entry_avg) / (v_target_min - v_entry_avg) * 100)::NUMERIC, 2
          );
        ELSE
          IF ABS(v_entry_avg - v_stop) < 1e-10 THEN
            v_progress := 0;
          ELSIF v_token_price IS NOT NULL THEN
            v_progress := ROUND(
              (-((v_entry_avg - v_token_price) / (v_entry_avg - v_stop) * 100))::NUMERIC, 2
            );
          END IF;
        END IF;
      END IF;

      -- ── 5. Upsert grade ───────────────────────────────────────────────────
      INSERT INTO recommendation_grades (
        recommendation_id, market_id, status,
        progress_percentage, price_at_threshold, threshold_reached_at,
        graded_at, updated_at
      ) VALUES (
        v_rec.recommendation_id, v_rec.market_id, v_new_status,
        v_progress,
        v_price_at_thr,
        v_threshold_ts,
        NOW(), NOW()
      )
      ON CONFLICT (recommendation_id) DO UPDATE SET
        status               = EXCLUDED.status,
        progress_percentage  = EXCLUDED.progress_percentage,
        price_at_threshold   = EXCLUDED.price_at_threshold,
        threshold_reached_at = EXCLUDED.threshold_reached_at,
        graded_at            = EXCLUDED.graded_at,
        updated_at           = EXCLUDED.updated_at;

      -- ── 6. Sync back to recommendations row ──────────────────────────────
      UPDATE recommendations
      SET grade_status   = v_new_status,
          last_graded_at = NOW()
      WHERE id = v_rec.recommendation_id;

      IF v_new_status = 'SUCCESS' THEN
        v_succeeded    := v_succeeded + 1;
      ELSIF v_new_status = 'FAILURE' THEN
        v_failed_grade := v_failed_grade + 1;
      ELSE
        v_still_pending := v_still_pending + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'evaluated',     v_evaluated,
    'succeeded',     v_succeeded,
    'failed',        v_failed_grade,
    'still_pending', v_still_pending,
    'errors',        v_errors
  );
END;
$$ LANGUAGE plpgsql;

-- Re-schedule cron (replace old job)
SELECT cron.unschedule('grade-pending-recommendations')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'grade-pending-recommendations'
);

SELECT cron.schedule(
  'grade-pending-recommendations',
  '* * * * *',
  $cron$ SELECT grade_pending_recommendations(); $cron$
);

-- ============================================================================
-- Re-grade resolved markets that were incorrectly graded by the old function
-- ============================================================================
-- The old function stored price_at_threshold = live_price (e.g. 1.0 for a
-- resolved YES market) instead of the actual threshold value (targetMin or
-- stopLoss). Delete those stale grades so the new function re-processes them
-- using full price history.
--
-- We identify stale grades by: market is resolved AND the stored
-- price_at_threshold does not match either target_zone_min or stop_loss
-- (i.e. it was the live price, not the threshold).
-- ============================================================================

DELETE FROM recommendation_grades rg
USING recommendations r
JOIN markets m ON m.id = r.market_id
WHERE rg.recommendation_id = r.id
  AND m.status = 'resolved'
  AND rg.status IN ('SUCCESS', 'FAILURE')
  AND rg.price_at_threshold IS NOT NULL
  -- price_at_threshold should equal targetMin (SUCCESS) or stopLoss (FAILURE)
  -- If it doesn't match either, it was the raw live price — stale
  AND NOT (
    (rg.status = 'SUCCESS' AND ABS(rg.price_at_threshold - r.target_zone_min) < 0.001)
    OR
    (rg.status = 'FAILURE' AND ABS(rg.price_at_threshold - r.stop_loss) < 0.001)
  );

-- Also reset grade_status on recommendations whose grades were just deleted
UPDATE recommendations r
SET grade_status = 'PENDING',
    last_graded_at = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM recommendation_grades rg
  WHERE rg.recommendation_id = r.id
    AND rg.status IN ('SUCCESS', 'FAILURE')
)
AND r.grade_status IN ('SUCCESS', 'FAILURE');
