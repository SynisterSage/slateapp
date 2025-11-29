-- Create notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  priority text NOT NULL,
  title text,
  message text,
  url text,
  payload jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- Index for unread counts (partial index)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE (is_read = false);
