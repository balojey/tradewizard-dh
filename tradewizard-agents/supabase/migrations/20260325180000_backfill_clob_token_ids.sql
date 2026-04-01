-- ============================================================================
-- Backfill clob_token_ids for markets that have PENDING recommendations
-- but no cached token IDs yet.
--
-- This is a one-time helper so the cron job doesn't have to lazily fetch
-- token IDs on every tick. After this runs, the cron will find token IDs
-- already populated and go straight to price fetching.
--
-- The function uses pg_net (http extension) to call:
--   GET https://clob.polymarket.com/markets/<condition_id>
-- and caches tokens[0] (YES) and tokens[1] (NO) into markets.clob_token_ids.
--
-- Safe to re-run: only updates rows where clob_token_ids IS NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION backfill_clob_token_ids()
RETURNS JSONB AS $$
DECLARE
  v_market       RECORD;
  v_http_resp    RECORD;
  v_market_data  JSONB;
  v_yes_token    TEXT;
  v_no_token     TEXT;
  v_updated      INT := 0;
  v_errors       INT := 0;
  v_skipped      INT := 0;
BEGIN
  FOR v_market IN
    SELECT DISTINCT m.id, m.condition_id
    FROM markets m
    JOIN recommendations r ON r.market_id = m.id
    WHERE m.clob_token_ids IS NULL
      AND r.direction IN ('LONG_YES', 'LONG_NO')
  LOOP
    BEGIN
      SELECT * INTO v_http_resp
      FROM http_get('https://clob.polymarket.com/markets/' || v_market.condition_id);

      IF v_http_resp.status != 200 THEN
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      v_market_data := (v_http_resp.content)::JSONB;
      v_yes_token   := v_market_data -> 'tokens' -> 0 ->> 'token_id';
      v_no_token    := v_market_data -> 'tokens' -> 1 ->> 'token_id';

      IF v_yes_token IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE markets
      SET clob_token_ids = jsonb_build_array(v_yes_token, v_no_token)
      WHERE id = v_market.id;

      v_updated := v_updated + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'errors',  v_errors
  );
END;
$$ LANGUAGE plpgsql;

-- Run the backfill immediately
SELECT backfill_clob_token_ids();
