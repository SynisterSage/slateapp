-- Add table to persist saved/bookmarked jobs
CREATE TABLE IF NOT EXISTS saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  payload jsonb NOT NULL,
  owner uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NULL,
  UNIQUE (job_id, owner)
);

-- Optional index to query by owner
CREATE INDEX IF NOT EXISTS idx_saved_jobs_owner ON saved_jobs(owner);
