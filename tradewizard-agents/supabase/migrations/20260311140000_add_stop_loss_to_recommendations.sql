-- Migration: Add stop_loss column to recommendations table
-- Description: Adds stop-loss price field for risk management in Smart Execution
-- Author: TradeWizard Team
-- Date: 2026-03-11

-- Add stop_loss column to recommendations table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recommendations' 
        AND column_name = 'stop_loss'
    ) THEN
        ALTER TABLE recommendations
        ADD COLUMN stop_loss DECIMAL(10, 4);
        
        -- Add comment to document the column
        COMMENT ON COLUMN recommendations.stop_loss IS 'Stop-loss price below entry zone for risk management (0.01-0.99)';
        
        -- Create index for queries filtering by stop_loss
        CREATE INDEX idx_recommendations_stop_loss ON recommendations(stop_loss) WHERE stop_loss IS NOT NULL;
    END IF;
END $$;

-- Update existing recommendations with calculated stop_loss based on entry_zone_min
-- This is a one-time backfill for existing data
UPDATE recommendations
SET stop_loss = GREATEST(0.01, entry_zone_min - 0.03)
WHERE stop_loss IS NULL 
  AND entry_zone_min IS NOT NULL
  AND direction IN ('LONG_YES', 'LONG_NO');

-- Add check constraint to ensure stop_loss is within valid range (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_stop_loss_range'
    ) THEN
        ALTER TABLE recommendations
        ADD CONSTRAINT check_stop_loss_range 
        CHECK (stop_loss IS NULL OR (stop_loss >= 0.01 AND stop_loss <= 0.99));
    END IF;
END $$;

-- Add check constraint to ensure stop_loss is below entry_zone_min (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_stop_loss_below_entry'
    ) THEN
        ALTER TABLE recommendations
        ADD CONSTRAINT check_stop_loss_below_entry 
        CHECK (stop_loss IS NULL OR entry_zone_min IS NULL OR stop_loss < entry_zone_min);
    END IF;
END $$;
