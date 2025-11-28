// Lightweight ATS aggregator for Lever and Greenhouse
// Exports: fetchATS(query) -> Promise<array of job-like objects>

const CACHE = new Map();
const DEFAULT_TTL = parseInt(process.env.ATS_CACHE_TTL || '3600', 10); // seconds
import path from 'path';
import fs from 'fs';
// Resolve config path relative to this file (ESM safe)
const COMPANIES_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'config', 'ats_companies.json');

function nowSeconds() { return Math.floor(Date.now() / 1000); }

function readCompanies() {
  try {
    const raw = fs.readFileSync(COMPANIES_PATH, 'utf8');
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    console.log('ATS aggregator: loaded companies', { count: arr.length, sample: arr.slice(0,6) });
    return arr;
  } catch (e) {
    console.warn('ATS aggregator: failed to read companies file', COMPANIES_PATH, String(e).slice(0,200));
    return [];
  }
}

async function tryFetchJson(url, headers = {}) {
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { ok: false, status: r.status, text };
    }
    const json = await r.json().catch(() => null);
    return { ok: true, json };
  } catch (e) {
    return { ok: false, status: 0, text: String(e) };
  }
}

function normalizeLever(job, company) {
  // lever postings often have: id, text, categories:{location, team}, url
  const id = job.id || job._id || (job.id && String(job.id)) || `${company}-lever-${Math.random().toString(36).slice(2,9)}`;
  return {
    id: id,
    title: job.text || job.title || job.position || '',
    company: company || (job.company && job.company.name) || '',
    location: (job.categories && (job.categories.location || job.categories.locationName)) || job.location || '',
    url: job.applyUrl || job.hostedUrl || job.url || job.redirect_url || '',
    description: job.description || job.contents || job.text || '',
    source: 'lever',
    raw: job,
  };
}

function normalizeGreenhouse(job, company) {
  // greenhouse JSON jobs have fields: id, title, absolute_url, location
  const id = job.id || job.job_id || `${company}-greenhouse-${Math.random().toString(36).slice(2,9)}`;
  return {
    id,
    title: job.title || '',
    company: company || (job.company && job.company.name) || '',
    location: (job.location && (job.location.name || job.location)) || job.location || '',
    url: job.absolute_url || job.url || '',
    description: job.content || job.description || '',
    source: 'greenhouse',
    raw: job,
  };
}

async function fetchLeverForCompany(company) {
  const candidates = [
    `https://api.lever.co/v0/postings/${company}?mode=json`,
    `https://jobs.lever.co/${company}.json`,
  ];
  for (const u of candidates) {
    const res = await tryFetchJson(u);
    if (res.ok && res.json) {
      const arr = Array.isArray(res.json) ? res.json : (res.json.postings || res.json.jobs || res.json);
      if (Array.isArray(arr) && arr.length) {
        console.log('fetchLeverForCompany success', { company, url: u, count: arr.length });
        return arr.map(j => normalizeLever(j, company));
      }
    }
  }
  return [];
}

async function fetchGreenhouseForCompany(company) {
  const candidates = [
    `https://boards.greenhouse.io/${company}.json`,
    `https://boards.greenhouse.io/embed/job_board?for=${company}&b=https://boards.greenhouse.io/${company}.json`
  ];
  for (const u of candidates) {
    const res = await tryFetchJson(u);
    if (res.ok && res.json) {
      const arr = res.json.jobs || (Array.isArray(res.json) ? res.json : null);
      if (Array.isArray(arr) && arr.length) {
        console.log('fetchGreenhouseForCompany success', { company, url: u, count: arr.length });
        return arr.map(j => normalizeGreenhouse(j, company));
      }
      // Some greenhouse endpoints return { "jobs": [...] }
      if (res.json.jobs && Array.isArray(res.json.jobs) && res.json.jobs.length) {
        console.log('fetchGreenhouseForCompany success (jobs key)', { company, url: u, count: res.json.jobs.length });
        return res.json.jobs.map(j => normalizeGreenhouse(j, company));
      }
    }
  }
  return [];
}

async function fetchATS(query = '') {
  // simple cache: key by query
  const key = `ats:${query}`;
  const cached = CACHE.get(key);
  if (cached && (nowSeconds() - cached.ts) < (DEFAULT_TTL)) return cached.data;

  const companies = readCompanies();
  const results = [];
  for (const c of companies) {
    try {
      // Only fetch Lever results for now; Greenhouse fetches are disabled per user request.
      const lv = await fetchLeverForCompany(c);
      (lv || []).forEach(j => results.push(j));
    } catch (e) {
      // ignore single-company failures
      continue;
    }
  }

  // If a query provided, filter client-side (simple substring match)
  const filtered = query ? results.filter(r => (String(r.title || '') + ' ' + String(r.description || '') + ' ' + String(r.location || '')).toLowerCase().includes(query.toLowerCase())) : results;

  CACHE.set(key, { ts: nowSeconds(), data: filtered });
  return filtered;
}

export { fetchATS };

// Diagnostic helper: check each company's Lever/Greenhouse endpoints and return per-company status
async function fetchATSDiagnostics() {
  const companies = readCompanies();
  const results = [];
  for (const c of companies) {
    const entry = { company: c, lever: null, greenhouse: null };
    try {
      // lever candidates
      const leverCandidates = [
        `https://api.lever.co/v0/postings/${c}?mode=json`,
        `https://jobs.lever.co/${c}.json`,
      ];
      for (const u of leverCandidates) {
        const r = await tryFetchJson(u);
        entry.lever = entry.lever || [];
        entry.lever.push({ url: u, ok: !!r.ok, status: r.status || 0, length: (r.json && Array.isArray(r.json) ? r.json.length : (r.json && r.json.postings ? r.json.postings.length : 0)), preview: (r.text || (r.json && JSON.stringify(r.json).slice(0,200))) });
      }
    } catch (e) {
      entry.lever = entry.lever || [];
      entry.lever.push({ url: null, ok: false, error: String(e).slice(0,200) });
    }
    // Greenhouse diagnostics intentionally skipped per user preference (disabled).
    entry.greenhouse = [{ skipped: true, reason: 'disabled-by-config' }];
    results.push(entry);
  }
  return { companies: results, count: results.length };
}

export { fetchATSDiagnostics };
