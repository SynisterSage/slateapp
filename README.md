<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1JsIxHozo2kNAcSMSNhJnrmgGutfEjxc9

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Environment & Supabase

This project expects a Supabase project for auth and storage. Create a `.env.local` file at the project root (do not commit it). You can copy `.env.local.example`.

Required variables:
- `VITE_SUPABASE_URL` — your Supabase project URL (e.g. https://xyz.supabase.co)
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key

Optional:
- `GEMINI_API_KEY` — if you plan to use Gemini or other LLM services
- `REMOTIVE_API_BASE`, `THE_MUSE_API`, `ADZUNA_*` — keys/URLs if you add job API providers

After creating `.env.local`, restart the dev server.

## Free Job API options (suggestions)
- Remotive (https://remotive.io/) — public remote jobs API (no key required for basic searches)
- The Muse (https://www.themuse.com/developers) — public job listings API
- Adzuna — has a free tier for developers (app id/key required)

When you want, I can scaffold the Supabase table definitions (SQL) to match `types.ts` and wire auth flows (sign-in / sign-up) using Supabase Auth.
