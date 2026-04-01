-- ============================================================================
-- Migration: Direct Market Updater Functions (No Extension Management)
-- ============================================================================
-- Description: Creates market updater functions and cron job
-- Date: 2026-02-19
-- 
-- This version assumes pg_cron and http extensions are already enabled
-- in your Supabase instance. It only creates the functions and schedules
-- the cron job.
-- ============================================================================

-- ============================================================================
-- Step 1: Create function to fetch market data from Polymarket API
-- ============================================================================

CREATE OR REPLACE FUNCTION fetch_polymarket_market_data(
  p_condition_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_response http_response;
  v_market_data JSONB;
  v_url TEXT;
BEGIN
  v_url := 'https://clob.polymarket.com/markets/' || p_condition_id;
  v_response := http_get(v_url);
  
  IF v_response.status != 200 THEN
    RETURN NULL;
  END IF;
  
  v_market_data := v_response.content::JSONB;
  RETURN v_market_data;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error fetching market data for condition_id %: %', p_condition_id, SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 2: Create function to update a single market
-- ============================================================================

CREATE OR REPLACE FUNCTION update_single_market(
  p_market_id TEXT,
  p_condition_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_market_data JSONB;
  v_current_record RECORD;
  v_probability DECIMAL(5,4);
  v_volume_24h DECIMAL(20,2);
  v_liquidity DECIMAL(20,2);
  v_resolved BOOLEAN;
  v_outcome TEXT;
  v_updates JSONB := '{}'::JSONB;
  v_updated_fields TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_market_data := fetch_polymarket_market_data(p_condition_id);
  
  IF v_market_data IS NULL THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', 'Market not found on Polymarket'
    );
  END IF;
  
  SELECT market_probability, volume_24h, liquidity, status
  INTO v_current_record
  FROM markets
  WHERE id = p_market_id;
  
  -- Extract probability from tokens array (first token is YES)
  -- CLOB API returns tokens array with outcome and price fields
  v_probability := COALESCE(
    (v_market_data->'tokens'->0->>'price')::DECIMAL(5,4),
    0
  );
  
  v_volume_24h := COALESCE(
    (v_market_data->>'volume24hr')::DECIMAL(20,2),
    0
  );
  
  v_liquidity := COALESCE(
    (v_market_data->>'liquidity')::DECIMAL(20,2),
    0
  );
  
  -- Market is resolved if closed=true OR active=false
  -- This matches the TypeScript implementation in polymarket-client.ts
  v_resolved := COALESCE(
    (v_market_data->>'closed')::BOOLEAN = true OR
    (v_market_data->>'active')::BOOLEAN = false,
    false
  );
  
  -- Determine outcome from outcome_prices array
  -- If YES price >= 0.95, outcome is YES; if NO price >= 0.95, outcome is NO
  v_outcome := CASE
    WHEN v_resolved THEN
      CASE
        WHEN (v_market_data->'outcome_prices'->0)::TEXT::DECIMAL >= 0.95 THEN 'YES'
        WHEN (v_market_data->'outcome_prices'->1)::TEXT::DECIMAL >= 0.95 THEN 'NO'
        ELSE 'UNKNOWN'
      END
    ELSE NULL
  END;
  
  IF v_probability IS DISTINCT FROM v_current_record.market_probability THEN
    v_updates := v_updates || jsonb_build_object('market_probability', v_probability);
    v_updated_fields := array_append(v_updated_fields, 'market_probability');
  END IF;
  
  IF v_volume_24h IS DISTINCT FROM v_current_record.volume_24h THEN
    v_updates := v_updates || jsonb_build_object('volume_24h', v_volume_24h);
    v_updated_fields := array_append(v_updated_fields, 'volume_24h');
  END IF;
  
  IF v_liquidity IS DISTINCT FROM v_current_record.liquidity THEN
    v_updates := v_updates || jsonb_build_object('liquidity', v_liquidity);
    v_updated_fields := array_append(v_updated_fields, 'liquidity');
  END IF;
  
  IF v_resolved AND v_current_record.status != 'resolved' THEN
    v_updates := v_updates || jsonb_build_object('status', 'resolved');
    v_updated_fields := array_append(v_updated_fields, 'status');
    
    IF v_outcome IS NOT NULL THEN
      v_updates := v_updates || jsonb_build_object('resolved_outcome', v_outcome);
      v_updated_fields := array_append(v_updated_fields, 'resolved_outcome');
    END IF;
  END IF;
  
  IF jsonb_object_keys(v_updates) IS NOT NULL THEN
    UPDATE markets
    SET
      market_probability = COALESCE((v_updates->>'market_probability')::DECIMAL(5,4), market_probability),
      volume_24h = COALESCE((v_updates->>'volume_24h')::DECIMAL(20,2), volume_24h),
      liquidity = COALESCE((v_updates->>'liquidity')::DECIMAL(20,2), liquidity),
      status = COALESCE(v_updates->>'status', status),
      resolved_outcome = COALESCE(v_updates->>'resolved_outcome', resolved_outcome),
      updated_at = NOW()
    WHERE id = p_market_id;
  END IF;
  
  RETURN jsonb_build_object(
    'condition_id', p_condition_id,
    'success', true,
    'updated_fields', array_to_json(v_updated_fields)
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

-- ============================================================================
-- Step 3: Create main market updater procedure
-- ============================================================================

CREATE OR REPLACE FUNCTION run_market_updater()
RETURNS JSONB AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_market RECORD;
  v_result JSONB;
  v_total_markets INTEGER := 0;
  v_updated INTEGER := 0;
  v_resolved INTEGER := 0;
  v_failed INTEGER := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_summary JSONB;
BEGIN
  v_start_time := clock_timestamp();
  
  FOR v_market IN 
    SELECT id, condition_id, question, status
    FROM markets
    WHERE status = 'active'
  LOOP
    v_total_markets := v_total_markets + 1;
    v_result := update_single_market(v_market.id, v_market.condition_id);
    
    IF (v_result->>'success')::BOOLEAN THEN
      v_updated := v_updated + 1;
      
      IF 'status' = ANY(
        ARRAY(SELECT jsonb_array_elements_text(v_result->'updated_fields'))
      ) THEN
        v_resolved := v_resolved + 1;
      END IF;
    ELSE
      v_failed := v_failed + 1;
      v_errors := array_append(
        v_errors,
        v_market.condition_id || ': ' || (v_result->>'error')
      );
    END IF;
  END LOOP;
  
  v_summary := jsonb_build_object(
    'total_markets', v_total_markets,
    'updated', v_updated,
    'resolved', v_resolved,
    'failed', v_failed,
    'duration_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER,
    'errors', array_to_json(v_errors),
    'timestamp', NOW()
  );
  
  RETURN v_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 4: Safely unschedule existing cron job
-- ============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('market-updater-hourly');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not unschedule market-updater-hourly: %', SQLERRM;
END $$;

-- ============================================================================
-- Step 5: Schedule the cron job
-- ============================================================================

SELECT cron.schedule(
  'market-updater-hourly',
  '0 * * * *',
  $$SELECT run_market_updater();$$
);

-- ============================================================================
-- Verification
-- ============================================================================
-- Run these queries to verify:
--
-- SELECT * FROM cron.job WHERE jobname = 'market-updater-hourly';
-- SELECT run_market_updater();
