-- Migration: positions table
-- Requirements: 6.1, 9.4
-- Creates the positions table for persisting Polymarket trade positions

CREATE TABLE IF NOT EXISTS positions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id),
  market_id         TEXT NOT NULL REFERENCES markets(id),
  token_id          TEXT NOT NULL,
  side              TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_id          TEXT NOT NULL,
  entry_price       NUMERIC(10, 6) NOT NULL,
  size_usdc         NUMERIC(12, 4) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'filled', 'closed', 'cancelled', 'resolved')),
  stop_loss         NUMERIC(10, 6) NOT NULL,
  target_price      NUMERIC(10, 6) NOT NULL,
  exit_price        NUMERIC(10, 6),
  realized_pnl      NUMERIC(12, 4),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_market_id ON positions(market_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_recommendation_id ON positions(recommendation_id);

-- Enforces requirement 9.4: no duplicate open/filled positions per recommendation
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_recommendation_active
  ON positions(recommendation_id)
  WHERE status IN ('open', 'filled');
