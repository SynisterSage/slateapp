-- Migration: Add application tracking, email messages, events, and RLS
-- Run this in your Supabase SQL editor.

-- 1) Add owner and tracking columns to applications
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS owner uuid,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS parsed_from_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- 2) Backfill owner where possible
-- If your application stored owner in the application JSON (data->>'owner')
UPDATE public.applications
SET owner = (data->>'owner')::uuid
WHERE data->>'owner' IS NOT NULL AND data->>'owner' <> '' AND owner IS NULL;

-- If resumes have an owner, propagate it to applications via resume_id
UPDATE public.applications
SET owner = r.owner
FROM public.resumes r
WHERE public.applications.resume_id = r.id AND public.applications.owner IS NULL AND r.owner IS NOT NULL;

-- 3) Create email_messages table to store raw/parsed emails (MVP: full email body stored)
CREATE TABLE IF NOT EXISTS public.email_messages (
  id text PRIMARY KEY,
  provider text,                 -- 'gmail', 'imap', etc.
  message_id text,               -- provider message id
  thread_id text,
  from_address text,
  to_address text,
  subject text,
  body text,                     -- plain text or HTML; consider size limits
  headers jsonb,
  raw jsonb,
  received_at timestamptz,
  owner uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_owner ON public.email_messages(owner);
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id ON public.email_messages(message_id);

-- 4) Create application_events table to record timeline and immutable events
CREATE TABLE IF NOT EXISTS public.application_events (
  id text PRIMARY KEY,
  application_id text REFERENCES public.applications(id) ON DELETE CASCADE,
  owner uuid,
  type text NOT NULL,            -- 'status_change' | 'email_received' | 'note' | 'manual'
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_events_app ON public.application_events(application_id);
CREATE INDEX IF NOT EXISTS idx_application_events_owner ON public.application_events(owner);

-- 5) Wire email_messages <> applications: optional FK
-- We don't add a strict FK because emails may arrive before an application is created.
-- Instead, applications.email_message_id can reference email_messages.id logically.

-- 6) Enable RLS and create policies so users only see their own rows
-- Applications RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'select_own_applications' AND schemaname = 'public' AND tablename = 'applications'
  ) THEN
    CREATE POLICY select_own_applications ON public.applications
      FOR SELECT USING (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'insert_own_applications' AND schemaname = 'public' AND tablename = 'applications'
  ) THEN
    CREATE POLICY insert_own_applications ON public.applications
      FOR INSERT WITH CHECK (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'update_own_applications' AND schemaname = 'public' AND tablename = 'applications'
  ) THEN
    CREATE POLICY update_own_applications ON public.applications
      FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'delete_own_applications' AND schemaname = 'public' AND tablename = 'applications'
  ) THEN
    CREATE POLICY delete_own_applications ON public.applications
      FOR DELETE USING (owner = auth.uid());
  END IF;
END$$;

-- Email messages RLS
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'select_own_email_messages' AND schemaname = 'public' AND tablename = 'email_messages'
  ) THEN
    CREATE POLICY select_own_email_messages ON public.email_messages
      FOR SELECT USING (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'insert_own_email_messages' AND schemaname = 'public' AND tablename = 'email_messages'
  ) THEN
    CREATE POLICY insert_own_email_messages ON public.email_messages
      FOR INSERT WITH CHECK (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'update_own_email_messages' AND schemaname = 'public' AND tablename = 'email_messages'
  ) THEN
    CREATE POLICY update_own_email_messages ON public.email_messages
      FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'delete_own_email_messages' AND schemaname = 'public' AND tablename = 'email_messages'
  ) THEN
    CREATE POLICY delete_own_email_messages ON public.email_messages
      FOR DELETE USING (owner = auth.uid());
  END IF;
END$$;

-- Application events RLS
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'select_own_application_events' AND schemaname = 'public' AND tablename = 'application_events'
  ) THEN
    CREATE POLICY select_own_application_events ON public.application_events
      FOR SELECT USING (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'insert_own_application_events' AND schemaname = 'public' AND tablename = 'application_events'
  ) THEN
    CREATE POLICY insert_own_application_events ON public.application_events
      FOR INSERT WITH CHECK (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'update_own_application_events' AND schemaname = 'public' AND tablename = 'application_events'
  ) THEN
    CREATE POLICY update_own_application_events ON public.application_events
      FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'delete_own_application_events' AND schemaname = 'public' AND tablename = 'application_events'
  ) THEN
    CREATE POLICY delete_own_application_events ON public.application_events
      FOR DELETE USING (owner = auth.uid());
  END IF;
END$$;

-- 7) Notes:
-- - The Supabase `service_role` bypasses RLS and should remain secret.
-- - For server-side sync jobs (Gmail scanning), run them under a secure server that uses the service role.
-- - Consider truncating/storing large email bodies in object storage if you expect very large messages.
