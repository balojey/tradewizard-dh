-- ============================================================================
-- Migration: grade_market_recommendations + update_single_market integration
-- ============================================================================
-- Description: Adds grade_market_recommendations(p_market_id TEXT) PL/pgSQL
--              function that fetches CLOB price history and upserts grades into
--              recommendation_grades for all recommendations belonging to a
--              resolved market. Also modifies update_single_market to call this
--              function when a market first transitions to resolved.
-- Date: 2026-03-13
-- Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 6.2, 6.3
-- ============================================================================

-- ============================================================================
-- Ensure clob_token_ids column exists on markets table
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'markets'
    AND column_name = 'clob_token_ids'
  ) THEN
    ALTER TABLE markets ADD COLUMN clob_token_ids JSONB;
    COMMENT ON COLUMN markets.clob_token_ids IS 'Array of CLOB token IDs from Polymarket; index 0 = YES token';
  END IF;
END $$;

-- ============================================================================
-- Function: grade_market_recommendations
-- ============================================================================
-- Grades all recommendations for a given market by fetching CLOB price history
-- and evaluating each recommendation's entry/target/stop-loss thresholds.
-- Upserts results into recommendation_grades.
-- Returns a JSONB summary: { "graded": int, "skipped": int, "failed": int }
-- ============================================================================
CREATE OR REPLACE FUNCTION grade_market_recommendations(
  p_market_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_rec             RECORD;
  v_token_id        TEXT;
  v_http_response   RECORD;
  v_price_history   JSONB;
  v_history_item    JSONB;
  v_price           DECIMAL(20,10);
  v_ts              TIMESTAMPTZ;

  -- Recommendation evaluation parameters
  v_entry_avg       DECIMAL(20,10);
  v_target_avg      DECIMAL(20,10);
  v_stop_loss       DECIMAL(20,10);
  v_epsilon         CONSTANT DECIMAL := 1e-10;
  v_equal_ranges    BOOLEAN;

  -- Grade result
  v_status          TEXT;
  v_price_at_thr    DECIMAL(20,10);
  v_thr_reached_at  TIMESTAMPTZ;
  v_progress        DECIMAL(5,2);

  -- Counters
  v_graded          INT := 0;
  v_skipped         INT := 0;
  v_failed          INT := 0;
BEGIN
  -- Fetch the YES token ID for this market once (shared across all recommendations)
  SELECT clob_token_ids->>0
  INTO v_token_id
  FROM markets
  WHERE id = p_market_id
  LIMIT 1;

  -- Loop over every recommendation for this market
  FOR v_rec IN
    SELECT
      r.id,
      r.market_id,
      r.entry_zone_min,
      r.entry_zone_max,
      r.target_zone_min,
      r.target_zone_max,
      r.stop_loss,
      r.created_at
    FROM recommendations r
    WHERE r.market_id = p_market_id
  LOOP

    -- ----------------------------------------------------------------
    -- Terminal grade preservation: skip if SUCCESS or FAILURE exists
    -- ----------------------------------------------------------------
    IF EXISTS (
      SELECT 1 FROM recommendation_grades
      WHERE recommendation_id = v_rec.id
        AND status IN ('SUCCESS', 'FAILURE')
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- ----------------------------------------------------------------
    -- Per-recommendation block: fetch price history and evaluate
    -- ----------------------------------------------------------------
    BEGIN

      -- If token ID is missing, record PENDING and continue
      IF v_token_id IS NULL OR v_token_id = '' THEN
        INSERT INTO recommendation_grades (
          recommendation_id, market_id, status,
          progress_percentage, price_at_threshold, threshold_reached_at,
          graded_at, updated_at
        ) VALUES (
          v_rec.id, p_market_id, 'PENDING',
          NULL, NULL, NULL,
          NOW(), NOW()
        )
        ON CONFLICT (recommendation_id) DO UPDATE SET
          status               = 'PENDING',
          progress_percentage  = NULL,
          price_at_threshold   = NULL,
          threshold_reached_at = NULL,
          graded_at            = NOW(),
          updated_at           = NOW();

        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      -- Fetch price history from CLOB API
      SELECT *
      INTO v_http_response
      FROM http_get(
        'https://clob.polymarket.com/prices-history?market=' || v_token_id || '&interval=max&fidelity=60'
      );

      -- On non-200: upsert PENDING and continue
      IF v_http_response.status != 200 THEN
        INSERT INTO recommendation_grades (
          recommendation_id, market_id, status,
          progress_percentage, price_at_threshold, threshold_reached_at,
          graded_at, updated_at
        ) VALUES (
          v_rec.id, p_market_id, 'PENDING',
          NULL, NULL, NULL,
          NOW(), NOW()
        )
        ON CONFLICT (recommendation_id) DO UPDATE SET
          status               = 'PENDING',
          progress_percentage  = NULL,
          price_at_threshold   = NULL,
          threshold_reached_at = NULL,
          graded_at            = NOW(),
          updated_at           = NOW();

        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      -- Parse JSON response body
      v_price_history := (v_http_response.content)::JSONB;

      -- Compute evaluation parameters
      v_entry_avg  := (v_rec.entry_zone_min  + v_rec.entry_zone_max)  / 2.0;
      v_target_avg := (v_rec.target_zone_min + v_rec.target_zone_max) / 2.0;
      v_stop_loss  := v_rec.stop_loss;

      v_equal_ranges := ABS(v_target_avg - v_entry_avg) < v_epsilon;

      -- Reset per-recommendation result variables
      v_status         := 'PENDING';
      v_price_at_thr   := NULL;
      v_thr_reached_at := NULL;
      v_progress       := NULL;

      -- Walk price history chronologically (history array ordered by t ASC)
      -- The CLOB API returns: { "history": [ { "t": <unix_ts>, "p": "<price>" }, ... ] }
      FOR v_history_item IN
        SELECT value
        FROM jsonb_array_elements(v_price_history->'history') AS value
        ORDER BY (value->>'t')::BIGINT ASC
      LOOP
        v_price := (v_history_item->>'p')::DECIMAL(20,10);
        v_ts    := TO_TIMESTAMP((v_history_item->>'t')::BIGINT);

        IF v_equal_ranges THEN
          -- Equal ranges: SUCCESS when price >= entryAvg, FAILURE when price <= stopLoss
          IF v_price >= v_entry_avg THEN
            v_status         := 'SUCCESS';
            v_price_at_thr   := v_price;
            v_thr_reached_at := v_ts;
            EXIT;
          ELSIF v_price <= v_stop_loss THEN
            v_status         := 'FAILURE';
            v_price_at_thr   := v_price;
            v_thr_reached_at := v_ts;
            EXIT;
          END IF;
        ELSE
          -- Normal: SUCCESS when price >= targetAvg, FAILURE when price <= stopLoss
          IF v_price >= v_target_avg THEN
            v_status         := 'SUCCESS';
            v_price_at_thr   := v_price;
            v_thr_reached_at := v_ts;
            EXIT;
          ELSIF v_price <= v_stop_loss THEN
            v_status         := 'FAILURE';
            v_price_at_thr   := v_price;
            v_thr_reached_at := v_ts;
            EXIT;
          END IF;
        END IF;
      END LOOP;

      -- Compute progress_percentage for PENDING
      IF v_status = 'PENDING' THEN
        -- Use the last price point for progress calculation
        SELECT (value->>'p')::DECIMAL(20,10)
        INTO v_price
        FROM jsonb_array_elements(v_price_history->'history') AS value
        ORDER BY (value->>'t')::BIGINT DESC
        LIMIT 1;

        IF v_price IS NOT NULL THEN
          IF ABS(v_target_avg - v_entry_avg) < v_epsilon THEN
            -- Equal ranges: no meaningful progress denominator
            v_progress := 0;
          ELSIF v_price >= v_entry_avg THEN
            v_progress := ROUND(
              ((v_price - v_entry_avg) / (v_target_avg - v_entry_avg) * 100)::NUMERIC,
              2
            );
          ELSE
            -- Below entry: negative progress toward stop loss
            IF ABS(v_entry_avg - v_stop_loss) < v_epsilon THEN
              v_progress := 0;
            ELSE
              v_progress := ROUND(
                (-((v_entry_avg - v_price) / (v_entry_avg - v_stop_loss) * 100))::NUMERIC,
                2
              );
            END IF;
          END IF;
        END IF;
      END IF;

      -- Upsert grade into recommendation_grades
      INSERT INTO recommendation_grades (
        recommendation_id, market_id, status,
        progress_percentage, price_at_threshold, threshold_reached_at,
        graded_at, updated_at
      ) VALUES (
        v_rec.id, p_market_id, v_status,
        v_progress, v_price_at_thr, v_thr_reached_at,
        NOW(), NOW()
      )
      ON CONFLICT (recommendation_id) DO UPDATE SET
        status               = EXCLUDED.status,
        progress_percentage  = EXCLUDED.progress_percentage,
        price_at_threshold   = EXCLUDED.price_at_threshold,
        threshold_reached_at = EXCLUDED.threshold_reached_at,
        graded_at            = EXCLUDED.graded_at,
        updated_at           = EXCLUDED.updated_at;

      v_graded := v_graded + 1;

    EXCEPTION
      WHEN OTHERS THEN
        -- Per-recommendation exception: upsert PENDING and continue
        BEGIN
          INSERT INTO recommendation_grades (
            recommendation_id, market_id, status,
            progress_percentage, price_at_threshold, threshold_reached_at,
            graded_at, updated_at
          ) VALUES (
            v_rec.id, p_market_id, 'PENDING',
            NULL, NULL, NULL,
            NOW(), NOW()
          )
          ON CONFLICT (recommendation_id) DO UPDATE SET
            status               = 'PENDING',
            progress_percentage  = NULL,
            price_at_threshold   = NULL,
            threshold_reached_at = NULL,
            graded_at            = NOW(),
            updated_at           = NOW();
        EXCEPTION
          WHEN OTHERS THEN
            NULL; -- Swallow nested exception to keep loop running
        END;

        v_failed := v_failed + 1;
    END;

  END LOOP;

  RETURN jsonb_build_object(
    'graded',  v_graded,
    'skipped', v_skipped,
    'failed',  v_failed
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: update_single_market (modified to call grade_market_recommendations)
-- ============================================================================
-- Identical to the version in 20260311000001_fix_resolved_outcome_update.sql
-- EXCEPT: inside the IF v_resolved AND v_current_status != 'resolved' THEN
-- block, after the UPDATE markets SET ... statement, we add:
--   PERFORM grade_market_recommendations(p_market_id);
-- ============================================================================
CREATE OR REPLACE FUNCTION update_single_market(
  p_market_id TEXT,
  p_condition_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_market_data JSONB;
  v_current_probability DECIMAL(5,4);
  v_current_volume_24h DECIMAL(20,2);
  v_current_liquidity DECIMAL(20,2);
  v_current_status TEXT;
  v_current_outcome TEXT;
  v_probability DECIMAL(5,4);
  v_volume_24h DECIMAL(20,2);
  v_liquidity DECIMAL(20,2);
  v_resolved BOOLEAN;
  v_outcome TEXT;
  v_updates JSONB := '{}'::JSONB;
  v_updated_fields TEXT[] := ARRAY[]::TEXT[];
  v_tokens JSONB;
BEGIN
  v_market_data := fetch_polymarket_market_data(p_condition_id);

  IF v_market_data IS NULL THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', 'Market not found on Polymarket'
    );
  END IF;

  -- Use subquery with explicit LIMIT to avoid "more than one row" error
  -- Also fetch resolved_outcome to check if it needs updating
  SELECT market_probability, volume_24h, liquidity, status, resolved_outcome
  INTO v_current_probability, v_current_volume_24h, v_current_liquidity, v_current_status, v_current_outcome
  FROM (
    SELECT market_probability, volume_24h, liquidity, status, resolved_outcome
    FROM markets
    WHERE id = p_market_id
    LIMIT 1
  ) AS single_market;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', 'Market not found in database'
    );
  END IF;

  v_tokens := v_market_data->'tokens';

  IF jsonb_typeof(v_tokens) = 'array' AND jsonb_array_length(v_tokens) > 0 THEN
    v_probability := COALESCE((v_tokens->0->>'price')::DECIMAL(5,4), 0);
  ELSE
    v_probability := 0;
  END IF;

  v_volume_24h := COALESCE((v_market_data->>'volume24hr')::DECIMAL(20,2), 0);
  v_liquidity  := COALESCE((v_market_data->>'liquidity')::DECIMAL(20,2), 0);

  v_resolved := COALESCE(
    (v_market_data->>'closed')::BOOLEAN = true OR
    (v_market_data->>'active')::BOOLEAN = false,
    false
  );

  -- Determine outcome from tokens array winner field
  IF v_resolved AND jsonb_typeof(v_tokens) = 'array' AND jsonb_array_length(v_tokens) >= 2 THEN
    BEGIN
      -- Check if first token (Yes) is the winner
      IF COALESCE((v_tokens->0->>'winner')::BOOLEAN, false) = true THEN
        v_outcome := UPPER(v_tokens->0->>'outcome');
      -- Check if second token (No) is the winner
      ELSIF COALESCE((v_tokens->1->>'winner')::BOOLEAN, false) = true THEN
        v_outcome := UPPER(v_tokens->1->>'outcome');
      -- Fallback: check token prices (price=1 means winner, price=0 means loser)
      ELSIF COALESCE((v_tokens->0->>'price')::DECIMAL(5,4), 0) >= 0.99 THEN
        v_outcome := UPPER(v_tokens->0->>'outcome');
      ELSIF COALESCE((v_tokens->1->>'price')::DECIMAL(5,4), 0) >= 0.99 THEN
        v_outcome := UPPER(v_tokens->1->>'outcome');
      ELSE
        v_outcome := 'UNKNOWN';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_outcome := 'UNKNOWN';
    END;
  ELSE
    v_outcome := NULL;
  END IF;

  IF v_probability IS DISTINCT FROM v_current_probability THEN
    v_updates := v_updates || jsonb_build_object('market_probability', v_probability);
    v_updated_fields := array_append(v_updated_fields, 'market_probability');
  END IF;

  IF v_volume_24h IS DISTINCT FROM v_current_volume_24h THEN
    v_updates := v_updates || jsonb_build_object('volume_24h', v_volume_24h);
    v_updated_fields := array_append(v_updated_fields, 'volume_24h');
  END IF;

  IF v_liquidity IS DISTINCT FROM v_current_liquidity THEN
    v_updates := v_updates || jsonb_build_object('liquidity', v_liquidity);
    v_updated_fields := array_append(v_updated_fields, 'liquidity');
  END IF;

  -- Update status if market is resolved but status is not 'resolved'
  IF v_resolved AND v_current_status != 'resolved' THEN
    v_updates := v_updates || jsonb_build_object('status', 'resolved');
    v_updated_fields := array_append(v_updated_fields, 'status');
  END IF;

  -- Update resolved_outcome if market is resolved AND we have a valid outcome
  -- AND the current outcome is different (NULL counts as different)
  IF v_resolved AND v_outcome IS NOT NULL AND v_outcome IS DISTINCT FROM v_current_outcome THEN
    v_updates := v_updates || jsonb_build_object('resolved_outcome', v_outcome);
    v_updated_fields := array_append(v_updated_fields, 'resolved_outcome');
  END IF;

  IF v_updates != '{}'::JSONB THEN
    UPDATE markets
    SET
      market_probability = COALESCE((v_updates->>'market_probability')::DECIMAL(5,4), market_probability),
      volume_24h         = COALESCE((v_updates->>'volume_24h')::DECIMAL(20,2), volume_24h),
      liquidity          = COALESCE((v_updates->>'liquidity')::DECIMAL(20,2), liquidity),
      status             = COALESCE(v_updates->>'status', status),
      resolved_outcome   = COALESCE(v_updates->>'resolved_outcome', resolved_outcome),
      updated_at         = NOW()
    WHERE id = p_market_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- NEW: Trigger grading when market first transitions active → resolved
  -- Requirement 4.1: call grade_market_recommendations after the UPDATE
  -- -----------------------------------------------------------------------
  IF v_resolved AND v_current_status != 'resolved' THEN
    PERFORM grade_market_recommendations(p_market_id);
  END IF;

  RETURN jsonb_build_object(
    'condition_id', p_condition_id,
    'success', true,
    'updated_fields', array_to_json(v_updated_fields),
    'resolved_outcome', v_outcome
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;
