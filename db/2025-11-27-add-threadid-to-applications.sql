-- Migration: Add thread_id column to applications so Gmail thread replies can be matched
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS thread_id text;

-- Optional: create an index to speed up thread_id lookups
CREATE INDEX IF NOT EXISTS idx_applications_thread_id ON public.applications(thread_id);

-- Note: run this in Supabase SQL editor or with psql using the project's credentials.
