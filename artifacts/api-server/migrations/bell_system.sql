-- Daily Bell notification system
-- Run this on Railway PostgreSQL before deploying

-- Add bell columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bell_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_bell_time TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bell_calendar_event_id TEXT;

-- Bell notifications tracking table (kept for audit trail)
CREATE TABLE IF NOT EXISTS bell_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bell_date TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bell_notifications_user_date
  ON bell_notifications (user_id, bell_date);
