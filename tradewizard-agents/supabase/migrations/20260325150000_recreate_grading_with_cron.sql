-- ============================================================================
-- Recreate recommendation grading infrastructure + per-minute cron job
-- ============================================================================
-- Every LONG_YES / LONG_NO recommendation starts as PENDING.
-- A cron job fires every minute, fetches the current live YES-token midpoint
-- price for each PENDING recommendation's market, and checks thresholds.
--
-- Zone storage convention (from recommendation-generation.ts):
--   LONG_YES: entry/target/stop stored as YES-token prices
--   LONG_NO:  entry/target/stop stored as NO-token prices (1 - YES price)
--
-- Grading logic (mirrors gradeByPriceHistory in [marketId]/route.ts):
--   LONG_YES: token_price = yes_price
--     SUCCESS when token_price >= target_zone_min
--     FAILURE when token_price <= stop_loss
--   LONG_NO:  token_price = 1 - yes_price
--     SUCCESS when token_price >= target_zone_min
--     FAILURE when token_price <= stop_loss
--
-- Once SUCCESS or FAILURE is written it is terminal — never re-evaluated.
-- NO_TRADE recommendations are never inserted into this table.
-- ============================================================================

-- ============================================================================
-- Table: recommendation_grades
-- ============================================================================
CREATE TABLE IF NOT EXISTS recommendation_grades (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id    UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  market_id            TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  status               VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'PENDING')),
  progress_percentage  DECIMAL(5, 2),
  price_at_threshold   DECIMAL(20, 10),
  threshold_reached_at TIMESTAMP WITH TIME ZONE,
  graded_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(recommendation_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_grades_market_id
  ON recommendation_grades(market_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_grades_status
  ON recommendation_grades(status);
CREATE INDEX IF NOT EXISTS idx_recommendation_grades_graded_at
  ON recommendation_grades(graded_at DESC);

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_recommendation_grades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recommendation_grades_updated_at ON recommendation_grades;
CREATE TRIGGER trg_recommendation_grades_updated_at
  BEFORE UPDATE ON recommendation_grades
  FOR EACH ROW EXECUTE FUNCTION update_recommendation_grades_updated_at();

-- ============================================================================
-- Columns on recommendations
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'grade_status'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN grade_status VARCHAR(20) DEFAULT 'PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'last_graded_at'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN last_graded_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recommendations_grade_status
  ON recommendations(grade_status);

-- ============================================================================
-- Column on markets: YES token ID cached here to avoid re-fetching every tick
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'markets' AND column_name = 'clob_token_ids'
  ) THEN
    ALTER TABLE markets ADD COLUMN clob_token_ids JSONB;
    COMMENT ON COLUMN markets.clob_token_ids IS
      'Array of CLOB token IDs; index 0 = YES token, index 1 = NO token';
  END IF;
END $$;
--   1. Fetch current YES-token price from CLOB API
--   2. Convert to the recommendation's token space
--   3. Check target / stop thresholds
--   4. Upsert into recommendation_grades
--   5. Sync grade_status back onto recommendations row
--
-- Returns JSONB: { "evaluated": int, "succeeded": int, "failed": int,
--                  "still_pending": int, "errors": int }
-- ============================================================================
CREATE OR REPLACE FUNCTION grade_pending_recommendations()
RETURNS JSONB AS $$
DECLARE
  v_rec              RECORD;
  v_token_id         TEXT;
  v_http_resp        RECORD;
  v_price_data       JSONB;
  v_yes_price        DECIMAL(20,10);
  v_token_price      DECIMAL(20,10);  -- price in the recommendation's token space
  v_entry_avg        DECIMAL(20,10);
  v_target_min       DECIMAL(20,10);
  v_stop             DECIMAL(20,10);
  v_new_status       TEXT;
  v_price_at_thr     DECIMAL(20,10);
  v_progress         DECIMAL(5,2);

  -- counters
  v_evaluated        INT := 0;
  v_succeeded        INT := 0;
  v_failed_grade     INT := 0;
  v_still_pending    INT := 0;
  v_errors           INT := 0;
BEGIN
  -- Loop over all PENDING tradeable recommendations
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
      m.clob_token_ids
    FROM recommendations r
    JOIN markets m ON m.id = r.market_id
    -- Only PENDING grades (or recommendations not yet in the table)
    WHERE r.direction IN ('LONG_YES', 'LONG_NO')
      AND NOT EXISTS (
        SELECT 1 FROM recommendation_grades rg
        WHERE rg.recommendation_id = r.id
          AND rg.status IN ('SUCCESS', 'FAILURE')
      )
      -- Skip if target/stop not set
      AND r.target_zone_min IS NOT NULL
      AND r.target_zone_max IS NOT NULL
      AND r.stop_loss IS NOT NULL
  LOOP
    v_evaluated := v_evaluated + 1;

    BEGIN
      -- ── 1. Get YES token ID ──────────────────────────────────────────────
      v_token_id := v_rec.clob_token_ids ->> 0;

      IF v_token_id IS NULL OR v_token_id = '' THEN
        -- No token ID yet — insert/keep PENDING
        INSERT INTO recommendation_grades (
          recommendation_id, market_id, status,
          progress_percentage, price_at_threshold, threshold_reached_at,
          graded_at, updated_at
        ) VALUES (
          v_rec.recommendation_id, v_rec.market_id, 'PENDING',
          NULL, NULL, NULL, NOW(), NOW()
        )
        ON CONFLICT (recommendation_id) DO UPDATE SET
          status = 'PENDING', graded_at = NOW(), updated_at = NOW();

        v_still_pending := v_still_pending + 1;
        CONTINUE;
      END IF;

      -- ── 2. Fetch current price from CLOB API ─────────────────────────────
      -- Endpoint: GET /price?token_id=<id>&side=BUY
      -- Returns: { "price": "0.62" }
      SELECT * INTO v_http_resp
      FROM http_get(
        'https://clob.polymarket.com/price?token_id=' || v_token_id || '&side=BUY'
      );

      IF v_http_resp.status != 200 THEN
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      v_price_data := (v_http_resp.content)::JSONB;
      v_yes_price  := (v_price_data ->> 'price')::DECIMAL(20,10);

      IF v_yes_price IS NULL THEN
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      -- ── 3. Convert to token space ─────────────────────────────────────────
      -- Zones are stored in the recommendation's own token space:
      --   LONG_YES → YES price space  → use yes_price directly
      --   LONG_NO  → NO  price space  → no_price = 1 - yes_price
      IF v_rec.direction = 'LONG_YES' THEN
        v_token_price := v_yes_price;
      ELSE
        v_token_price := 1.0 - v_yes_price;
      END IF;

      v_entry_avg  := (v_rec.entry_zone_min + v_rec.entry_zone_max) / 2.0;
      v_target_min := v_rec.target_zone_min;
      v_stop       := v_rec.stop_loss;

      -- ── 4. Evaluate thresholds ────────────────────────────────────────────
      v_new_status     := 'PENDING';
      v_price_at_thr   := NULL;

      IF v_token_price >= v_target_min THEN
        v_new_status   := 'SUCCESS';
        v_price_at_thr := v_token_price;
      ELSIF v_token_price <= v_stop THEN
        v_new_status   := 'FAILURE';
        v_price_at_thr := v_token_price;
      END IF;

      -- ── 5. Compute progress for PENDING ──────────────────────────────────
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

      -- ── 7. Sync grade_status back to recommendations ──────────────────────
      UPDATE recommendations
      SET grade_status   = v_new_status,
          last_graded_at = NOW()
      WHERE id = v_rec.recommendation_id;

      -- Counters
      IF v_new_status = 'SUCCESS' THEN
        v_succeeded := v_succeeded + 1;
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

-- ============================================================================
-- Backfill: insert PENDING grades for all existing LONG_YES/LONG_NO
-- recommendations that don't have a grade yet.
-- The cron will pick them up on its first run.
-- ============================================================================
INSERT INTO recommendation_grades (
  recommendation_id, market_id, status, graded_at, updated_at
)
SELECT
  r.id,
  r.market_id,
  'PENDING',
  NOW(),
  NOW()
FROM recommendations r
WHERE r.direction IN ('LONG_YES', 'LONG_NO')
  AND NOT EXISTS (
    SELECT 1 FROM recommendation_grades rg
    WHERE rg.recommendation_id = r.id
  );

-- ============================================================================
-- pg_cron job: run grade_pending_recommendations() every minute
-- ============================================================================
SELECT cron.unschedule('grade-pending-recommendations')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'grade-pending-recommendations'
);

SELECT cron.schedule(
  'grade-pending-recommendations',
  '* * * * *',   -- every minute
  $$ SELECT grade_pending_recommendations(); $$
);
