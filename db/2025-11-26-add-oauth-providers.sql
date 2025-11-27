-- Migration: Create table for storing OAuth provider tokens (Gmail etc.)
-- Run in Supabase SQL editor. Tokens should be stored encrypted in production.

CREATE TABLE IF NOT EXISTS public.oauth_providers (
  id text PRIMARY KEY,
  owner uuid NOT NULL,
  provider text NOT NULL,        -- 'google', 'microsoft', etc.
  provider_user_id text,         -- id of the user in the provider
  access_token text,
  refresh_token text,
  scope text,
  token_type text,
  expires_at timestamptz,
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_providers_owner ON public.oauth_providers(owner);

-- Note: For production, encrypt sensitive fields (access_token, refresh_token) or store in a secrets manager.
