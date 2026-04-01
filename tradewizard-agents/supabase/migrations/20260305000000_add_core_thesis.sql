-- Add core_thesis column to recommendations table
ALTER TABLE recommendations 
ADD COLUMN IF NOT EXISTS core_thesis TEXT;

-- Add comment for documentation
COMMENT ON COLUMN recommendations.core_thesis IS 'The core argument explaining why the outcome is more likely than the market believes';
