-- ============================================================================
-- Migration: Fix Market Outcome Detection
-- ============================================================================
-- Description: Fixes the update_single_market function to correctly detect
--              resolved outcomes using the tokens array winner field instead
--              of the non-existent outcome_prices field
-- Date: 2026-03-11
-- Issue: Market outcomes were being set to NULL or UNKNOWN because outcome_prices
--        doesn't exist in the Polymarket CLOB API response. The API provides
--        a tokens array where each token has a winner boolean field.
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
  SELECT market_probability, volume_24h, liquidity, status
  INTO v_current_probability, v_current_volume_24h, v_current_liquidity, v_current_status
  FROM (
    SELECT market_probability, volume_24h, liquidity, status
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
  v_liquidity := COALESCE((v_market_data->>'liquidity')::DECIMAL(20,2), 0);
  
  v_resolved := COALESCE(
    (v_market_data->>'closed')::BOOLEAN = true OR
    (v_market_data->>'active')::BOOLEAN = false,
    false
  );
  
  -- FIX: Determine outcome from tokens array winner field
  -- The Polymarket CLOB API returns a tokens array where each token has:
  -- - outcome: "Yes" or "No" (capitalized)
  -- - winner: boolean indicating if this token won
  -- - price: final price (1 for winner, 0 for loser)
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
  
  IF v_resolved AND v_current_status != 'resolved' THEN
    v_updates := v_updates || jsonb_build_object('status', 'resolved');
    v_updated_fields := array_append(v_updated_fields, 'status');
    
    IF v_outcome IS NOT NULL THEN
      v_updates := v_updates || jsonb_build_object('resolved_outcome', v_outcome);
      v_updated_fields := array_append(v_updated_fields, 'resolved_outcome');
    END IF;
  END IF;
  
  IF v_updates != '{}'::JSONB THEN
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

-- ============================================================================
-- Verification: Test the fix with the problematic market
-- ============================================================================
-- Run this to verify the fix works:
-- SELECT update_single_market(
--   '0x28b418b2aeb0f2eec0a64d0cca38a2a7df484a45ee5c35d3d2b2822c27c17dfb',
--   '0x28b418b2aeb0f2eec0a64d0cca38a2a7df484a45ee5c35d3d2b2822c27c17dfb'
-- );
