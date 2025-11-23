-- Migration: add `owner` column (uuid) to `resumes` and create RLS policies
-- Run these statements in your Supabase SQL editor or via psql.

-- 1) Add an `owner` column to identify the user who owns a resume.
ALTER TABLE IF EXISTS public.resumes
  ADD COLUMN IF NOT EXISTS owner uuid;

-- 2) (Optional) Backfill owner for existing rows if you have the user id stored
-- inside the `data` JSON. Adjust the JSON path if needed.
-- This will set owner for rows where data->>'owner' contains a uuid string.
UPDATE public.resumes
SET owner = (data->>'owner')::uuid
WHERE data->>'owner' IS NOT NULL AND data->>'owner' <> '';

-- 3) Enable Row Level Security (RLS) if not already enabled.
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

-- 4) Create policies that allow authenticated users to select/insert/update
-- only their own resume rows (owner = auth.uid()). The service_role
-- bypasses RLS so server-side processes can still insert/update.

-- Allow authenticated users to SELECT their own rows
CREATE POLICY "select_own_resumes" ON public.resumes
  FOR SELECT
  USING (owner = auth.uid());

-- Allow authenticated users to INSERT rows where owner = auth.uid()
CREATE POLICY "insert_own_resumes" ON public.resumes
  FOR INSERT
  WITH CHECK (owner = auth.uid());

-- Allow authenticated users to UPDATE only their rows
CREATE POLICY "update_own_resumes" ON public.resumes
  FOR UPDATE
  USING (owner = auth.uid())
  WITH CHECK (owner = auth.uid());

-- 5) Grant select/insert/update to authenticated role if you prefer role-based grants
-- (Supabase manages roles; usually policies are enough).

-- Notes:
-- - Do NOT add the service_role key to client code. The service role bypasses RLS
--   and must remain secret.
-- - After applying these policies, client-side writes/reads must include an
--   authenticated user (via Supabase Auth) and the server or client must ensure
--   `owner` is set to the inserting user's `auth.uid()`.
-- - For immediate local dev convenience you can continue using your server
--   proxy which uses the service role. For production, prefer owner-based RLS.
