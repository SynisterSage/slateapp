#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('.env.local not found; create it from .env.local.example with Supabase keys');
  process.exit(2);
}

const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const [k, ...rest] = l.split('=');
      return [k, rest.join('=')];
    })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase URL or ANON key missing in .env.local');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const mockPath = path.join(process.cwd(), 'mockData.ts');
if (!fs.existsSync(mockPath)) {
  console.error('mockData.ts not found');
  process.exit(2);
}

// Dynamically import mockData (TypeScript file) by evaluating via esbuild would be complex; instead,
// read a small JSON export. We will require the user to have exported `mockData.json` with the same content.
const jsonMock = path.join(process.cwd(), 'mockData.json');
if (!fs.existsSync(jsonMock)) {
  console.error('mockData.json not found. Please run `node ./scripts/export-mock.js` to create it from TypeScript mockData.');
  process.exit(2);
}

const mock = JSON.parse(fs.readFileSync(jsonMock, 'utf8'));

async function seed() {
  console.log('Seeding resumes...');
  for (const r of mock.MOCK_RESUMES) {
    const id = r.id;
    const { error } = await supabase.from('resumes').upsert({ id, data: r });
    if (error) console.error('Resume upsert error', error);
    else console.log('Upserted resume', id);
  }

  console.log('Seeding applications...');
  for (const a of mock.MOCK_APPLICATIONS || []) {
    const id = a.id;
    const { error } = await supabase.from('applications').upsert({ id, job_id: a.jobId, resume_id: a.resumeId, status: a.status, applied_date: a.appliedDate, notes: a.notes, data: a });
    if (error) console.error('Application upsert error', error);
    else console.log('Upserted application', id);
  }

  console.log('Done');
}

seed().catch(err => { console.error('Seeding failed', err); process.exit(1); });
