#!/usr/bin/env node
// Simple script to test job API keys (reads .env.local via dotenv)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dotenvPath = path.join(process.cwd(), '.env.local');

if (!fs.existsSync(dotenvPath)) {
  console.error('.env.local not found in project root. Create it from .env.local.example and set keys.');
  process.exit(2);
}

const env = Object.fromEntries(
  fs.readFileSync(dotenvPath, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const [k, ...rest] = l.split('=');
      return [k, rest.join('=')];
    })
);

const fetch = globalThis.fetch || (await import('node-fetch')).default;

async function testMuse() {
  const base = env.VITE_MUSE_BASE || 'https://www.themuse.com/api/public/jobs';
  const key = env.VITE_MUSE_API_KEY;
  try {
    const url = `${base}?page=1`;
    const res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
    console.log('Muse status:', res.status);
    const json = await res.json();
    console.log('Muse keys:', Object.keys(json).slice(0,10));
    console.log('Muse sample count:', (json.results||json.jobs||[]).length || 'n/a');
  } catch (err) {
    console.error('Muse error', err.message || err);
  }
}

async function testAdzuna() {
  const id = env.VITE_ADZUNA_APP_ID;
  const key = env.VITE_ADZUNA_APP_KEY;
  const country = env.VITE_ADZUNA_COUNTRY || 'us';
  if (!id || !key) {
    console.log('Adzuna keys not set; skipping');
    return;
  }
  try {
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${encodeURIComponent(id)}&app_key=${encodeURIComponent(key)}&results_per_page=2&what=developer`;
    const res = await fetch(url);
    console.log('Adzuna status:', res.status);
    const json = await res.json();
    console.log('Adzuna keys:', Object.keys(json).slice(0,10));
    console.log('Adzuna sample results:', (json.results||[]).length);
  } catch (err) {
    console.error('Adzuna error', err.message || err);
  }
}

(async () => {
  console.log('Testing job APIs using .env.local');
  await testMuse();
  await testAdzuna();
  console.log('Done');
})();
