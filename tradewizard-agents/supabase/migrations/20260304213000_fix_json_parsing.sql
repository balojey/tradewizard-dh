-- ============================================================================
-- Migration: Fix JSON Parsing in Market Updater
-- ============================================================================
-- Description: Fixes "query returned more than one row" by properly handling JSONB
-- Date: 2026-03-04
-- 
-- The issue: The error is from improper JSONB parsing, not duplicate rows
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
  v_tokens JSONB;
  v_outcome_prices JSONB;
BEGIN
  v_market_data := fetch_polymarket_market_data(p_condition_id);
  
  IF v_market_data IS NULL THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', 'Market not found on Polymarket'
    );
  END IF;
  
  -- Get current market data - use LIMIT 1 to be safe
  SELECT market_probability, volume_24h, liquidity, status
  INTO v_current_record
  FROM markets
  WHERE id = p_market_id
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'condition_id', p_condition_id,
      'success', false,
      'error', 'Market not found in database'
    );
  END IF;
  
  -- Safely extract tokens array
  v_tokens := v_market_data->'tokens';
  
  -- Extract probability from first token's price
  -- Handle both array and non-array cases
  IF jsonb_typeof(v_tokens) = 'array' AND jsonb_array_length(v_tokens) > 0 THEN
    v_probability := COALESCE(
      (v_tokens->0->>'price')::DECIMAL(5,4),
      0
    );
  ELSE
    v_probability := 0;
  END IF;
  
  -- Extract volume and liquidity
  v_volume_24h := COALESCE(
    (v_market_data->>'volume24hr')::DECIMAL(20,2),
    0
  );
  
  v_liquidity := COALESCE(
    (v_market_data->>'liquidity')::DECIMAL(20,2),
    0
  );
  
  -- Market is resolved if closed=true OR active=false
  v_resolved := COALESCE(
    (v_market_data->>'closed')::BOOLEAN = true OR
    (v_market_data->>'active')::BOOLEAN = false,
    false
  );
  
  -- Safely extract outcome_prices array
  v_outcome_prices := v_market_data->'outcome_prices';
  
  -- Determine outcome from outcome_prices array
  IF v_resolved AND jsonb_typeof(v_outcome_prices) = 'array' AND jsonb_array_length(v_outcome_prices) >= 2 THEN
    DECLARE
      v_yes_price DECIMAL(5,4);
      v_no_price DECIMAL(5,4);
    BEGIN
      -- Safely parse prices
      v_yes_price := COALESCE((v_outcome_prices->>0)::DECIMAL(5,4), 0);
      v_no_price := COALESCE((v_outcome_prices->>1)::DECIMAL(5,4), 0);
      
      IF v_yes_price >= 0.95 THEN
        v_outcome := 'YES';
      ELSIF v_no_price >= 0.95 THEN
        v_outcome := 'NO';
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
  
  -- Build updates
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
  
  -- Apply updates if any
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
-- Verification
-- ============================================================================
-- Test with one of the failing markets:
-- SELECT update_single_market('0x30cfb887558b20373a984da60c372fe5a90c0296aa6d8bb413a8aa7543846da2', '0x30cfb887558b20373a984da60c372fe5a90c0296aa6d8bb413a8aa7543846da2');
--
-- Then run the full updater:
-- SELECT run_market_updater();
