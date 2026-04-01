-- ============================================================================
-- Fix grade_pending_recommendations function
-- ============================================================================
-- Two bugs in the original:
--   1. clob_token_ids was NULL on all markets (column just added, never populated).
--      Fix: when token ID is missing, fetch it from CLOB API and cache it on
--      the markets row so subsequent cron runs don't need to re-fetch.
--   2. Wrong price endpoint. Used /price?token_id=...&side=BUY which doesn't
--      exist on the public CLOB API. Fix: use /midpoint?token_id=<id> which
--      returns { "mid": "0.62" }.
-- ============================================================================

CREATE OR REPLACE FUNCTION grade_pending_recommendations()
RETURNS JSONB AS $$
DECLARE
  v_rec              RECORD;
  v_token_id         TEXT;
  v_http_resp        RECORD;
  v_market_data      JSONB;
  v_price_data       JSONB;
  v_yes_price        DECIMAL(20,10);
  v_token_price      DECIMAL(20,10);
  v_entry_avg        DECIMAL(20,10);
  v_target_min       DECIMAL(20,10);
  v_stop             DECIMAL(20,10);
  v_new_status       TEXT;
  v_price_at_thr     DECIMAL(20,10);
  v_progress         DECIMAL(5,2);

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
      m.condition_id,
      m.clob_token_ids
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
        -- Fetch from CLOB and cache on the market row
        SELECT * INTO v_http_resp
        FROM http_get('https://clob.polymarket.com/markets/' || v_rec.condition_id);

        IF v_http_resp.status = 200 THEN
          v_market_data := (v_http_resp.content)::JSONB;
          v_token_id    := v_market_data -> 'tokens' -> 0 ->> 'token_id';

          -- Cache both token IDs so future cron runs skip this fetch
          UPDATE markets
          SET clob_token_ids = jsonb_build_array(
            v_market_data -> 'tokens' -> 0 ->> 'token_id',
            v_market_data -> 'tokens' -> 1 ->> 'token_id'
          )
          WHERE id = v_rec.market_id;
        END IF;
      END IF;

      -- If still no token ID, keep PENDING and move on
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

      -- ── 2. Fetch current midpoint price ──────────────────────────────────
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

      -- ── 3. Convert to token space ─────────────────────────────────────────
      -- Zones are stored in the recommendation's own token space:
      --   LONG_YES → YES price  (use yes_price directly)
      --   LONG_NO  → NO  price  (1 - yes_price)
      IF v_rec.direction = 'LONG_YES' THEN
        v_token_price := v_yes_price;
      ELSE
        v_token_price := 1.0 - v_yes_price;
      END IF;

      v_entry_avg  := (v_rec.entry_zone_min + v_rec.entry_zone_max) / 2.0;
      v_target_min := v_rec.target_zone_min;
      v_stop       := v_rec.stop_loss;

      -- ── 4. Evaluate thresholds ────────────────────────────────────────────
      v_new_status   := 'PENDING';
      v_price_at_thr := NULL;

      IF v_token_price >= v_target_min THEN
        v_new_status   := 'SUCCESS';
        v_price_at_thr := v_token_price;
      ELSIF v_token_price <= v_stop THEN
        v_new_status   := 'FAILURE';
        v_price_at_thr := v_token_price;
      END IF;

      -- ── 5. Progress for PENDING ───────────────────────────────────────────
      v_progress := NULL;
      IF v_new_status = 'PENDING' THEN
        IF ABS(v_target_min - v_entry_avg) < 1e-10 THEN
          v_progress := 0;
        ELSIF v_token_price >= v_entry_avg THEN
          v_progress := ROUND(
            ((v_token_price - v_entry_avg) / (v_target_min - v_entry_avg) * 100)::NUMERIC, 2
          );
        ELSE
          IF ABS(v_entry_avg - v_stop) < 1e-10 THEN
            v_progress := 0;
          ELSE
            v_progress := ROUND(
              (-((v_entry_avg - v_token_price) / (v_entry_avg - v_stop) * 100))::NUMERIC, 2
            );
          END IF;
        END IF;
      END IF;

      -- ── 6. Upsert grade ───────────────────────────────────────────────────
      INSERT INTO recommendation_grades (
        recommendation_id, market_id, status,
        progress_percentage, price_at_threshold, threshold_reached_at,
        graded_at, updated_at
      ) VALUES (
        v_rec.recommendation_id, v_rec.market_id, v_new_status,
        v_progress,
        v_price_at_thr,
        CASE WHEN v_new_status IN ('SUCCESS', 'FAILURE') THEN NOW() ELSE NULL END,
        NOW(), NOW()
      )
      ON CONFLICT (recommendation_id) DO UPDATE SET
        status               = EXCLUDED.status,
        progress_percentage  = EXCLUDED.progress_percentage,
        price_at_threshold   = EXCLUDED.price_at_threshold,
        threshold_reached_at = EXCLUDED.threshold_reached_at,
        graded_at            = EXCLUDED.graded_at,
        updated_at           = EXCLUDED.updated_at;

      -- ── 7. Sync back to recommendations row ──────────────────────────────
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

-- Re-schedule cron (replace old job with corrected function)
SELECT cron.unschedule('grade-pending-recommendations')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'grade-pending-recommendations'
);

SELECT cron.schedule(
  'grade-pending-recommendations',
  '* * * * *',
  $cron$ SELECT grade_pending_recommendations(); $cron$
);
