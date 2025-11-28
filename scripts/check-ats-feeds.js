#!/usr/bin/env node
// scripts/check-ats-feeds.js
// Simple checker that reads config/ats_companies.json and pings candidate Lever/Greenhouse endpoints

import fs from 'fs';
import path from 'path';

const COMPANIES_PATH = path.resolve(process.cwd(), 'config', 'ats_companies.json');

function now() { return new Date().toISOString(); }

async function tryFetchJson(url) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { ok: r.ok, status: r.status, text, json };
  } catch (e) {
    return { ok: false, status: 0, text: String(e) };
  }
}

async function checkCompany(c) {
  const lever = [
    `https://api.lever.co/v0/postings/${c}?mode=json`,
    `https://jobs.lever.co/${c}.json`
  ];
  const gh = [
    `https://boards.greenhouse.io/${c}.json`,
    `https://boards.greenhouse.io/embed/job_board?for=${c}&b=https://boards.greenhouse.io/${c}.json`
  ];
  const out = { company: c, lever: [], greenhouse: [] };
  for (const u of lever) {
    const r = await tryFetchJson(u);
    out.lever.push({ url: u, ok: r.ok, status: r.status, length: (r.json && Array.isArray(r.json) ? r.json.length : (r.json && r.json.postings ? r.json.postings.length : 0)), preview: (r.text || '').slice(0,200) });
  }
  for (const u of gh) {
    const r = await tryFetchJson(u);
    let length = 0;
    if (r.json && Array.isArray(r.json.jobs)) length = r.json.jobs.length;
    else if (r.json && Array.isArray(r.json)) length = r.json.length;
    out.greenhouse.push({ url: u, ok: r.ok, status: r.status, length, preview: (r.text || '').slice(0,200) });
  }
  return out;
}

async function main() {
  let raw = '[]';
  try { raw = fs.readFileSync(COMPANIES_PATH, 'utf8'); } catch (e) { console.error('Failed to read companies file', COMPANIES_PATH, String(e)); process.exit(1); }
  const arr = JSON.parse(raw || '[]');
  console.log(now(), 'Checking', arr.length, 'companies');
  for (const c of arr) {
    const res = await checkCompany(c);
    console.log(JSON.stringify(res, null, 2));
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
