-- ============================================================================
-- Migration: Fix Market Updater to Handle Duplicate Markets
-- ============================================================================
-- Description: Fixes "query returned more than one row" error by using LIMIT 1
-- Date: 2026-03-04
-- 
-- The issue: When id = condition_id and there are duplicate markets,
-- SELECT INTO fails with "query returned more than one row"
-- ============================================================================

-- ============================================================================
-- Fix update_single_market function
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
  v_rows_updated INTEGER;
BEGIN
  v_market_data := fetch_polymarket_market_data(p_condition_id);
  
  IF v_market_data IS NULL THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', 'Market not found on Polymarket'
    );
  END IF;
  
  -- Use LIMIT 1 to handle potential duplicates
  -- This will update the most recently updated market if there are duplicates
  SELECT market_probability, volume_24h, liquidity, status
  INTO v_current_record
  FROM markets
  WHERE id = p_market_id
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- If no market found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', 'Market not found in database'
    );
  END IF;
  
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
    -- Update ALL markets with this id (in case of duplicates)
    UPDATE markets
    SET
      market_probability = COALESCE((v_updates->>'market_probability')::DECIMAL(5,4), market_probability),
      volume_24h = COALESCE((v_updates->>'volume_24h')::DECIMAL(20,2), volume_24h),
      liquidity = COALESCE((v_updates->>'liquidity')::DECIMAL(20,2), liquidity),
      status = COALESCE(v_updates->>'status', status),
      resolved_outcome = COALESCE(v_updates->>'resolved_outcome', resolved_outcome),
      updated_at = NOW()
    WHERE id = p_market_id;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    IF v_rows_updated > 1 THEN
      RAISE WARNING 'Updated % duplicate markets for condition_id %', v_rows_updated, p_condition_id;
    END IF;
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
-- Verification
-- ============================================================================
-- Run this to test:
-- SELECT run_market_updater();
--
-- Check for duplicate markets:
-- SELECT id, COUNT(*) as count
-- FROM markets
-- GROUP BY id
-- HAVING COUNT(*) > 1
-- ORDER BY count DESC;
