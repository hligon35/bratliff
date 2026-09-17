-- Add action filtering support for the admin activity log.
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON audit_log(action, created_at DESC);
