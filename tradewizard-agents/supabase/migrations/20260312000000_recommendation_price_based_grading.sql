-- ============================================================================
-- TradeWizard Recommendation Price-Based Grading - Schema Migration
-- ============================================================================
-- Creates tables for tracking recommendation grades based on price movement
-- rather than market resolution outcomes.
--
-- New tables:
--   - recommendation_grades: stores grade results (SUCCESS, FAILURE, PENDING)
--   - grade_audit_trail: records all status transitions for transparency
--
-- Updated tables:
--   - recommendations: adds grade tracking columns
-- ============================================================================

-- ============================================================================
-- New Table: recommendation_grades
-- ============================================================================
-- Stores the current grade for each recommendation based on price performance.
-- Each recommendation has at most one grade record (enforced by UNIQUE constraint).
CREATE TABLE IF NOT EXISTS recommendation_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'PENDING')),
  progress_percentage DECIMAL(5, 2),
  price_at_threshold DECIMAL(20, 10),
  threshold_reached_at TIMESTAMP WITH TIME ZONE,
  graded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(recommendation_id)
);

-- Indexes for recommendation_grades table
CREATE INDEX IF NOT EXISTS idx_recommendation_grades_market_id ON recommendation_grades(market_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_grades_status ON recommendation_grades(status);
CREATE INDEX IF NOT EXISTS idx_recommendation_grades_graded_at ON recommendation_grades(graded_at DESC);

-- ============================================================================
-- New Table: grade_audit_trail
-- ============================================================================
-- Records every status change for a recommendation grade, providing a full
-- history of transitions (e.g., PENDING -> SUCCESS) with timestamps and reasons.
CREATE TABLE IF NOT EXISTS grade_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reason TEXT
);

-- Indexes for grade_audit_trail table
CREATE INDEX IF NOT EXISTS idx_grade_audit_trail_recommendation_id ON grade_audit_trail(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_grade_audit_trail_changed_at ON grade_audit_trail(changed_at DESC);

-- ============================================================================
-- Updated Table: recommendations
-- ============================================================================
-- Add columns to track grading state directly on the recommendation for
-- efficient querying without always joining to recommendation_grades.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations'
    AND column_name = 'grade_status'
  ) THEN
    ALTER TABLE recommendations
      ADD COLUMN grade_status VARCHAR(20) DEFAULT 'PENDING';

    COMMENT ON COLUMN recommendations.grade_status IS 'Current grade status: SUCCESS, FAILURE, or PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations'
    AND column_name = 'last_graded_at'
  ) THEN
    ALTER TABLE recommendations
      ADD COLUMN last_graded_at TIMESTAMP WITH TIME ZONE;

    COMMENT ON COLUMN recommendations.last_graded_at IS 'Timestamp of the most recent grading evaluation';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations'
    AND column_name = 'last_price_check_at'
  ) THEN
    ALTER TABLE recommendations
      ADD COLUMN last_price_check_at TIMESTAMP WITH TIME ZONE;

    COMMENT ON COLUMN recommendations.last_price_check_at IS 'Timestamp of the most recent price data fetch for grading';
  END IF;
END $$;

-- Index for querying pending recommendations efficiently
CREATE INDEX IF NOT EXISTS idx_recommendations_grade_status ON recommendations(grade_status);

-- ============================================================================
-- Trigger: auto-update updated_at on recommendation_grades
-- ============================================================================
CREATE OR REPLACE FUNCTION update_recommendation_grades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_recommendation_grades_updated_at ON recommendation_grades;
CREATE TRIGGER update_recommendation_grades_updated_at
  BEFORE UPDATE ON recommendation_grades
  FOR EACH ROW
  EXECUTE FUNCTION update_recommendation_grades_updated_at();
