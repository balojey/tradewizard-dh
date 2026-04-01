-- ============================================================================
-- TradeWizard Performance Tracking - Performance Dashboard Schema
-- ============================================================================
-- Creates tables and views for tracking recommendation performance against
-- actual market outcomes for closed/resolved markets
-- ============================================================================

-- ============================================================================
-- Recommendation Outcomes Table
-- ============================================================================
-- Tracks the performance of recommendations against actual market outcomes
CREATE TABLE IF NOT EXISTS recommendation_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE CASCADE,
  market_id TEXT REFERENCES markets(id) ON DELETE CASCADE,
  actual_outcome TEXT NOT NULL, -- The actual resolved outcome (YES/NO)
  recommendation_was_correct BOOLEAN NOT NULL,
  roi_realized DECIMAL(10,4), -- Actual return on investment if trade was executed
  edge_captured DECIMAL(10,4), -- Difference between fair_probability and actual outcome
  market_probability_at_recommendation DECIMAL(5,4), -- Market price when recommendation was made
  resolution_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for recommendation_outcomes table
CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_recommendation_id ON recommendation_outcomes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_market_id ON recommendation_outcomes(market_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_resolution_date ON recommendation_outcomes(resolution_date DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_was_correct ON recommendation_outcomes(recommendation_was_correct);

-- ============================================================================
-- Performance Metrics Views
-- ============================================================================

-- Overall Performance Summary
CREATE OR REPLACE VIEW v_performance_summary AS
SELECT
  COUNT(ro.id) as total_resolved_recommendations,
  COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) as correct_recommendations,
  ROUND(
    100.0 * COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) / NULLIF(COUNT(ro.id), 0),
    2
  ) as win_rate_pct,
  ROUND(AVG(ro.roi_realized)::numeric, 4) as avg_roi,
  ROUND(AVG(CASE WHEN ro.recommendation_was_correct THEN ro.roi_realized END)::numeric, 4) as avg_winning_roi,
  ROUND(AVG(CASE WHEN NOT ro.recommendation_was_correct THEN ro.roi_realized END)::numeric, 4) as avg_losing_roi,
  ROUND(AVG(ro.edge_captured)::numeric, 4) as avg_edge_captured,
  COUNT(CASE WHEN r.direction = 'LONG_YES' THEN 1 END) as long_yes_count,
  COUNT(CASE WHEN r.direction = 'LONG_NO' THEN 1 END) as long_no_count,
  COUNT(CASE WHEN r.direction = 'NO_TRADE' THEN 1 END) as no_trade_count,
  COUNT(CASE WHEN r.direction = 'LONG_YES' AND ro.recommendation_was_correct THEN 1 END) as long_yes_wins,
  COUNT(CASE WHEN r.direction = 'LONG_NO' AND ro.recommendation_was_correct THEN 1 END) as long_no_wins
FROM recommendation_outcomes ro
JOIN recommendations r ON ro.recommendation_id = r.id;

-- Performance by Confidence Level
CREATE OR REPLACE VIEW v_performance_by_confidence AS
SELECT
  r.confidence,
  COUNT(ro.id) as total_recommendations,
  COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) as correct_recommendations,
  ROUND(
    100.0 * COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) / NULLIF(COUNT(ro.id), 0),
    2
  ) as win_rate_pct,
  ROUND(AVG(ro.roi_realized)::numeric, 4) as avg_roi,
  ROUND(AVG(ro.edge_captured)::numeric, 4) as avg_edge_captured,
  ROUND(AVG(r.expected_value)::numeric, 4) as avg_expected_value,
  ROUND(AVG(r.fair_probability)::numeric, 4) as avg_fair_probability
FROM recommendation_outcomes ro
JOIN recommendations r ON ro.recommendation_id = r.id
GROUP BY r.confidence
ORDER BY 
  CASE r.confidence 
    WHEN 'high' THEN 1 
    WHEN 'moderate' THEN 2 
    WHEN 'low' THEN 3 
  END;

-- Performance by Agent
CREATE OR REPLACE VIEW v_performance_by_agent AS
SELECT
  ags.agent_name,
  ags.agent_type,
  COUNT(DISTINCT ro.id) as total_recommendations,
  COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) as correct_recommendations,
  ROUND(
    100.0 * COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) / NULLIF(COUNT(DISTINCT ro.id), 0),
    2
  ) as win_rate_pct,
  ROUND(AVG(ro.roi_realized)::numeric, 4) as avg_roi,
  ROUND(AVG(ags.fair_probability)::numeric, 4) as avg_agent_probability,
  ROUND(AVG(ags.confidence)::numeric, 2) as avg_agent_confidence,
  COUNT(CASE WHEN ags.direction = 'YES' AND ro.actual_outcome = 'YES' THEN 1 END) +
  COUNT(CASE WHEN ags.direction = 'NO' AND ro.actual_outcome = 'NO' THEN 1 END) as agent_correct_signals,
  COUNT(ags.id) as total_agent_signals,
  ROUND(
    100.0 * (
      COUNT(CASE WHEN ags.direction = 'YES' AND ro.actual_outcome = 'YES' THEN 1 END) +
      COUNT(CASE WHEN ags.direction = 'NO' AND ro.actual_outcome = 'NO' THEN 1 END)
    ) / NULLIF(COUNT(ags.id), 0),
    2
  ) as agent_signal_accuracy_pct
FROM recommendation_outcomes ro
JOIN recommendations r ON ro.recommendation_id = r.id
JOIN agent_signals ags ON ro.recommendation_id = ags.recommendation_id
GROUP BY ags.agent_name, ags.agent_type
ORDER BY win_rate_pct DESC;

-- Performance by Market Category
CREATE OR REPLACE VIEW v_performance_by_category AS
SELECT
  m.event_type,
  COUNT(ro.id) as total_recommendations,
  COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) as correct_recommendations,
  ROUND(
    100.0 * COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) / NULLIF(COUNT(ro.id), 0),
    2
  ) as win_rate_pct,
  ROUND(AVG(ro.roi_realized)::numeric, 4) as avg_roi,
  ROUND(AVG(ro.edge_captured)::numeric, 4) as avg_edge_captured,
  ROUND(AVG(m.volume_24h)::numeric, 2) as avg_market_volume,
  ROUND(AVG(m.liquidity)::numeric, 2) as avg_market_liquidity
FROM recommendation_outcomes ro
JOIN recommendations r ON ro.recommendation_id = r.id
JOIN markets m ON ro.market_id = m.id
GROUP BY m.event_type
ORDER BY win_rate_pct DESC;

-- Monthly Performance Trends
CREATE OR REPLACE VIEW v_monthly_performance AS
SELECT
  DATE_TRUNC('month', ro.resolution_date) as month,
  COUNT(ro.id) as total_recommendations,
  COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) as correct_recommendations,
  ROUND(
    100.0 * COUNT(CASE WHEN ro.recommendation_was_correct THEN 1 END) / NULLIF(COUNT(ro.id), 0),
    2
  ) as win_rate_pct,
  ROUND(AVG(ro.roi_realized)::numeric, 4) as avg_roi,
  ROUND(SUM(CASE WHEN ro.recommendation_was_correct THEN ro.roi_realized ELSE 0 END)::numeric, 4) as total_profit,
  ROUND(AVG(ro.edge_captured)::numeric, 4) as avg_edge_captured
FROM recommendation_outcomes ro
WHERE ro.resolution_date IS NOT NULL
GROUP BY DATE_TRUNC('month', ro.resolution_date)
ORDER BY month DESC;

-- Detailed Closed Markets with Performance
CREATE OR REPLACE VIEW v_closed_markets_performance AS
SELECT
  m.id as market_id,
  m.condition_id,
  m.question,
  m.event_type,
  m.status,
  m.resolved_outcome,
  r.id as recommendation_id,
  r.direction,
  r.fair_probability,
  r.market_edge,
  r.expected_value,
  r.confidence,
  r.entry_zone_min,
  r.entry_zone_max,
  r.explanation,
  ro.recommendation_was_correct,
  ro.roi_realized,
  ro.edge_captured,
  ro.market_probability_at_recommendation,
  ro.resolution_date,
  r.created_at as recommendation_created_at,
  -- Calculate days from recommendation to resolution
  EXTRACT(EPOCH FROM (ro.resolution_date - r.created_at)) / 86400 as days_to_resolution,
  -- Agent consensus metrics
  (
    SELECT COUNT(*)
    FROM agent_signals ags 
    WHERE ags.recommendation_id = r.id
  ) as total_agents,
  (
    SELECT COUNT(*)
    FROM agent_signals ags 
    WHERE ags.recommendation_id = r.id 
    AND ((ags.direction = 'YES' AND r.direction = 'LONG_YES') OR 
         (ags.direction = 'NO' AND r.direction = 'LONG_NO'))
  ) as agents_in_agreement
FROM markets m
JOIN recommendations r ON m.id = r.market_id
LEFT JOIN recommendation_outcomes ro ON r.id = ro.recommendation_id
WHERE m.status = 'resolved'
ORDER BY ro.resolution_date DESC NULLS LAST, r.created_at DESC;

-- ============================================================================
-- Functions for Performance Calculation
-- ============================================================================

-- Function to calculate and update recommendation outcomes
CREATE OR REPLACE FUNCTION update_recommendation_outcomes()
RETURNS INTEGER AS $$
DECLARE
  rec RECORD;
  outcome_correct BOOLEAN;
  calculated_roi DECIMAL(10,4);
  calculated_edge DECIMAL(10,4);
  updated_count INTEGER := 0;
BEGIN
  -- Process resolved markets that don't have outcome records yet
  FOR rec IN 
    SELECT 
      r.id as recommendation_id,
      r.market_id,
      r.direction,
      r.fair_probability,
      r.entry_zone_min,
      r.entry_zone_max,
      m.resolved_outcome,
      m.updated_at as resolution_date,
      -- Estimate market probability at recommendation time (simplified)
      CASE 
        WHEN r.direction = 'LONG_YES' THEN r.entry_zone_max
        WHEN r.direction = 'LONG_NO' THEN (1.0 - r.entry_zone_min)
        ELSE 0.5
      END as market_prob_estimate
    FROM recommendations r
    JOIN markets m ON r.market_id = m.id
    LEFT JOIN recommendation_outcomes ro ON r.id = ro.recommendation_id
    WHERE m.status = 'resolved' 
    AND m.resolved_outcome IS NOT NULL
    AND ro.id IS NULL
  LOOP
    -- Determine if recommendation was correct
    outcome_correct := (
      (rec.direction = 'LONG_YES' AND rec.resolved_outcome = 'YES') OR
      (rec.direction = 'LONG_NO' AND rec.resolved_outcome = 'NO') OR
      (rec.direction = 'NO_TRADE')
    );
    
    -- Calculate ROI (simplified - assumes $100 investment at entry zone midpoint)
    IF rec.direction = 'NO_TRADE' THEN
      calculated_roi := 0;
    ELSIF outcome_correct AND rec.direction != 'NO_TRADE' THEN
      -- Winning trade: calculate profit based on entry price
      calculated_roi := CASE 
        WHEN rec.direction = 'LONG_YES' THEN 
          (1.0 - (rec.entry_zone_min + rec.entry_zone_max) / 2.0) * 100
        WHEN rec.direction = 'LONG_NO' THEN 
          ((rec.entry_zone_min + rec.entry_zone_max) / 2.0) * 100
      END;
    ELSE
      -- Losing trade: lose the investment
      calculated_roi := -100;
    END IF;
    
    -- Calculate edge captured (how much of the theoretical edge was realized)
    calculated_edge := CASE
      WHEN rec.resolved_outcome = 'YES' THEN rec.fair_probability - rec.market_prob_estimate
      WHEN rec.resolved_outcome = 'NO' THEN (1.0 - rec.fair_probability) - (1.0 - rec.market_prob_estimate)
      ELSE 0
    END;
    
    -- Insert the outcome record
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
-- Trigger to automatically update outcomes when markets are resolved
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_update_recommendation_outcomes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when status changes to 'resolved' and resolved_outcome is set
  IF NEW.status = 'resolved' AND NEW.resolved_outcome IS NOT NULL AND 
     (OLD.status != 'resolved' OR OLD.resolved_outcome IS NULL) THEN
    PERFORM update_recommendation_outcomes();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on markets table
DROP TRIGGER IF EXISTS trigger_market_resolved ON markets;
CREATE TRIGGER trigger_market_resolved
  AFTER UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_recommendation_outcomes();