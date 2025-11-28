// Serverless job-proxy endpoint (Vercel / Netlify compatible)
// This proxies requests to Muse / Adzuna / Remotive (and optional RapidAPI
// products like LinkedIn/Indeed) using server-side env vars.
// Simple in-memory cache for provider results (keyed by provider:q)
const LINKEDIN_CACHE = new Map();
const INDEED_CACHE = new Map();
const LINKEDIN_TTL = 60 * 1000; // 60s
const INDEED_TTL = 60 * 1000; // 60s

export default async function handler(req, res) {
  const { query } = req;
  const q = query.q || query.search || '';

  const REMOTIVE_BASE = process.env.REMOTIVE_API_BASE || 'https://remotive.io/api/remote-jobs';
  const MUSE_BASE = process.env.VITE_MUSE_BASE || 'https://www.themuse.com/api/public/jobs';
  const MUSE_KEY = process.env.VITE_MUSE_API_KEY;
  const ADZUNA_ID = process.env.VITE_ADZUNA_APP_ID;
  const ADZUNA_KEY = process.env.VITE_ADZUNA_APP_KEY;
  const ADZUNA_COUNTRY = process.env.VITE_ADZUNA_COUNTRY || 'us';
  const PRIMARY_JOB_PROVIDER = (process.env.PRIMARY_JOB_PROVIDER || 'indeed').toLowerCase();
  const RAPID_KEY = process.env.RAPIDAPI_INDEED_KEY;
  const RAPID_HOST = process.env.RAPIDAPI_INDEED_HOST;
  const RAPID_BASEPATH = process.env.RAPIDAPI_INDEED_BASEPATH || '';
  const OVERRIDE_PROVIDER = (query.provider || '').toLowerCase();

  // Helper to normalize job shape
  const normalize = (item, source) => ({
    id: item.id || item.slug || item._id || `${source}-${Math.random().toString(36).slice(2,9)}`,
    title: item.name || item.title || item.job_title || '',
    // Robust company extraction: handle Adzuna / Muse / Indeed shapes
    company: (function() {
      try {
        if (!item) return '';
        if (typeof item.company === 'string') return item.company;
        if (item.company && typeof item.company === 'object') {
          return item.company.display_name || item.company.name || item.company.label || item.company.title || JSON.stringify(item.company);
        }
        if (item.employer) {
          if (typeof item.employer === 'string') return item.employer;
          if (typeof item.employer === 'object') return item.employer.name || JSON.stringify(item.employer);
        }
        return item.company || item.organisation || item.organization || '';
      } catch (e) { return '' }
    })(),
    location: (item.location && (item.location.display_name || item.location.name)) || (Array.isArray(item.locations) ? item.locations.map(l=>l.name || l).join(', ') : (item.location || '')),
    url: item.refs?.landing_page || item.refs?.api || item.redirect_url || item.url || item.location_url || item.source_url || '',
    description: item.contents || item.description || item.summary || item.snippet || '',
    // Try to surface a salary string from provider fields or by heuristics on HTML/text
    salary: (function() {
      try {
        // Adzuna explicit fields
        const smin = item.salary_min || item.salaryMin || item.min_salary || (item.salary && (item.salary.from || item.salary.min));
        const smax = item.salary_max || item.salaryMax || item.max_salary || (item.salary && (item.salary.to || item.salary.max));
        if (smin || smax) {
          const fmt = (v) => { try { return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }); } catch (e) { return String(v); } };
          return smin && smax ? `$${fmt(smin)} - $${fmt(smax)}` : `$${fmt(smin || smax)}`;
        }
        // Some providers include nested salary object
        if (item.salary && typeof item.salary === 'object') {
          const from = item.salary.from || item.salary.min;
          const to = item.salary.to || item.salary.max;
          if (from || to) {
            const fmt = (v) => { try { return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }); } catch (e) { return String(v); } };
            return (from && to) ? `$${fmt(from)} - $${fmt(to)}` : `$${fmt(from || to)}`;
          }
        }
        // Fallback: find currency or numeric ranges in contents/description HTML
        const text = String(item.contents || item.description || '');
        // Match patterns like: $110,000 - $166,500 | $110k–$166k | 110,000 - 166,500 | £35k
        const moneyRe = /(?:[$£€]\s*)?\d{1,3}(?:[\d,]{0,})?(?:\.\d+)?\s*(?:[kK])?(?:\s*(?:-|–|—|to)\s*(?:[$£€]\s*)?\d{1,3}(?:[\d,]{0,})?(?:\.\d+)?\s*(?:[kK])?)/u;
        const m = text.match(moneyRe);
        if (m) return m[0].replace(/\s+/g,' ').trim();
      } catch (e) {}
      return undefined;
    })(),
    source,
    raw: item,
  });

  try {
    // ATS aggregator (Lever / Greenhouse)
    let fetchATS = null;
    try {
      // require the server helper if available
      // note: this file runs in serverless env where require is supported
      // path: ../server/atsAggregator.js
      // We lazy-load so this still works if the file isn't present in other envs.
      // eslint-disable-next-line global-require, import/no-dynamic-require
      fetchATS = require('../server/atsAggregator').fetchATS;
    } catch (e) {
      fetchATS = null;
    }
    // Track providers attempted and any provider-level errors for observability
    const providersAttempted = [];
    const providerErrors = {};

    // Helper to send successful JSON responses with observability fields
    const sendOk = (providerName, payload) => {
      const body = { provider: providerName, providersAttempted, providerErrors };
      if (payload && payload.raw) body.raw = payload.raw;
      else body.jobs = payload || [];
      try {
        // include a small ATS preview when available to help UI validation
        if (typeof atsResults !== 'undefined' && Array.isArray(atsResults) && atsResults.length) {
          body.atsPreview = atsResults.slice(0, 3);
        }
      } catch (e) {
        // ignore preview failures
      }
      return res.status(200).json(body);
    };

    // Pre-fetch ATS aggregator results (if available) so we can merge them later.
    let atsResults = [];
    if (fetchATS) {
      providersAttempted.push('ats');
      try {
        console.log('Calling ATS aggregator', { q });
        atsResults = await fetchATS(q) || [];
        console.log('ATS aggregator returned', { count: Array.isArray(atsResults) ? atsResults.length : 0 });
      } catch (e) {
        console.warn('ATS aggregator failed', String(e).slice(0, 200));
        providerErrors.ats = String(e).slice(0, 200);
        atsResults = [];
      }
    }
    // Helper to merge ATS results with a provider's jobs (ATS first, deduped)
    const mergeWithATS = (jobsArray) => {
      const seen = new Set();
      const merged = [];
      const keyFor = (j) => {
        if (!j) return '';
        if (j.url) return `url:${j.url}`;
        if (j.id) return `id:${j.id}`;
        return `t:${j.title || ''}|c:${j.company || ''}`;
      };
      for (const at of (atsResults || [])) {
        const k = keyFor(at);
        if (!seen.has(k)) { seen.add(k); merged.push(at); }
      }
      for (const j of (Array.isArray(jobsArray) ? jobsArray : [])) {
        const k = keyFor(j);
        if (!seen.has(k)) { seen.add(k); merged.push(j); }
      }
      return merged;
    };
    // Helper to fetch Indeed results from RapidAPI (returns normalized jobs)
    const fetchIndeedRapid = async (queryText) => {
      if (!RAPID_KEY || !RAPID_HOST) return [];
      const sanitizeBasepath = (bp) => {
        if (!bp) return '';
        if (bp.includes('optional-basepath')) return '';
        return bp.startsWith('/') ? bp : `/${bp}`;
      };
      const SANITIZED_RAPID_BASEPATH = sanitizeBasepath(RAPID_BASEPATH);
      const userip = query.userip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const useragent = query.useragent || req.headers['user-agent'] || 'SlateApp/1.0';
      const loc = query.l || query.location || query.loc || '';
      const base = `https://${RAPID_HOST}${SANITIZED_RAPID_BASEPATH}`;
      const apisearchCommon = `apisearch?v=2&format=json&q=${encodeURIComponent(queryText)}&radius=25&userip=${encodeURIComponent(userip)}&useragent=${encodeURIComponent(useragent)}`;
      const apisearchAlt = `apisearch?q=${encodeURIComponent(queryText)}&format=json&userip=${encodeURIComponent(userip)}&useragent=${encodeURIComponent(useragent)}`;
      const candidatePaths = [
        `/${apisearchCommon}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/${apisearchAlt}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/apisearch?v=2&format=json&q=${encodeURIComponent(queryText)}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/apisearch?q=${encodeURIComponent(queryText)}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/apigetjobs?v=2&format=json`,
        `/apigetjobs`,
        `/search?query=${encodeURIComponent(queryText)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/search?q=${encodeURIComponent(queryText)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/v2/search?query=${encodeURIComponent(queryText)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/jobs/search?query=${encodeURIComponent(queryText)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/jobs?q=${encodeURIComponent(queryText)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
      ];

      for (const p of candidatePaths) {
        const url = `${base}${p}`;
        try {
          const r = await fetch(url, {
            headers: {
              'X-RapidAPI-Key': RAPID_KEY,
              'X-RapidAPI-Host': RAPID_HOST,
              Accept: 'application/json'
            }
          });
          if (!r.ok) continue;
          const json = await r.json().catch(() => null);
          const items = json?.results || json?.data || json?.jobs || json?.hits || [];
          if (!Array.isArray(items)) continue;
          return items.map(i => normalize(i, 'indeed'));
        } catch (e) {
          continue;
        }
      }
      return [];
    };
    // Try LinkedIn RapidAPI (if configured) first, then Indeed RapidAPI.
    const RAPID_LINKEDIN_KEY = process.env.RAPIDAPI_LINKEDIN_KEY;
    const RAPID_LINKEDIN_HOST = process.env.RAPIDAPI_LINKEDIN_HOST;
    const RAPID_LINKEDIN_BASEPATH = process.env.RAPIDAPI_LINKEDIN_BASEPATH || '';
    const normalizeBasepath = (bp) => {
      if (!bp) return '';
      if (bp.includes('optional-basepath')) return '';
      return bp.startsWith('/') ? bp : `/${bp}`;
    };
    const SANITIZED_RAPID_LINKEDIN_BASEPATH = normalizeBasepath(RAPID_LINKEDIN_BASEPATH);

    // Try LinkedIn RapidAPI first if available
    if (RAPID_LINKEDIN_KEY && RAPID_LINKEDIN_HOST) {
      providersAttempted.push('linkedin');
      const cacheKey = `linkedin:${q}`;
      const cached = LINKEDIN_CACHE.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < LINKEDIN_TTL) {
        console.log('Returning cached LinkedIn results', { q, count: cached.data.length });
        return sendOk('linkedin', cached.data);
      }

      const base = `https://${RAPID_LINKEDIN_HOST}${SANITIZED_RAPID_LINKEDIN_BASEPATH}`;
      // Candidate paths — will try root variations; use `raw=1` to inspect exact provider payload
      const candidatePaths = [
        `/search?keywords=${encodeURIComponent(q)}&limit=20`,
        `/jobs/search?keywords=${encodeURIComponent(q)}&limit=20`,
        `/v1/search?keywords=${encodeURIComponent(q)}&limit=20`,
        `/jobs?keywords=${encodeURIComponent(q)}&limit=20`,
        `/search/jobs?keywords=${encodeURIComponent(q)}&limit=20`,
      ];

      let tried = [];
      for (const p of candidatePaths) {
        const url = `${base}${p}`;
        tried.push(url);
        try {
          console.log('Calling LinkedIn candidate', { url: url.replace(/(keywords=)[^&]+/, '$1REDACTED') });
          const r = await fetch(url, {
            headers: {
              'X-RapidAPI-Key': RAPID_LINKEDIN_KEY,
              'X-RapidAPI-Host': RAPID_LINKEDIN_HOST,
              Accept: 'application/json'
            }
          });
          console.log('LinkedIn candidate response', { url: p, status: r.status, ok: r.ok });
          if (!r.ok) {
            const text = await r.text().catch(() => '');
            console.warn('LinkedIn candidate non-OK preview', { url: p, preview: (text || '').slice(0, 200) });
            continue;
          }
          const json = await r.json().catch(() => null);
          if (query.raw === '1') {
            return sendOk('linkedin', { raw: json });
          }
          const items = json?.results || json?.data || json?.jobs || json?.hits || json?.positions || [];
          const normalized = (Array.isArray(items) ? items : []).map(i => normalize(i, 'linkedin'));
          console.log(`LinkedIn returned ${normalized.length} items for candidate ${p}`);
          LINKEDIN_CACHE.set(cacheKey, { ts: Date.now(), data: normalized });
          return sendOk('linkedin', normalized);
        } catch (e) {
          console.warn('LinkedIn candidate failed', { url: p, err: String(e).slice(0,200) });
          continue;
        }
      }
      console.warn('LinkedIn attempts failed for all candidate paths', { tried });
      // fall through to Indeed and other providers
    }

    // If PRIMARY_JOB_PROVIDER is set to 'adzuna', prefer Adzuna first (helps when Indeed RapidAPI is down)
    // If configured to prefer Adzuna, try it first before Indeed
    if (PRIMARY_JOB_PROVIDER === 'adzuna' && ADZUNA_ID && ADZUNA_KEY) {
      try {
        const adzUrl = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?app_id=${encodeURIComponent(ADZUNA_ID)}&app_key=${encodeURIComponent(ADZUNA_KEY)}&results_per_page=20&what=${encodeURIComponent(q)}`;
        console.log('PRIMARY_JOB_PROVIDER=adzuna, calling Adzuna first', { url: adzUrl.replace(/app_key=[^&]+/, 'app_key=REDACTED') });
        const ar = await fetch(adzUrl);
        console.log('Adzuna primary response', { status: ar.status, ok: ar.ok });
        if (ar.ok) {
          const json = await ar.json();
          if (query.raw === '1') return sendOk('adzuna', { raw: json });
          const items = json.results || [];
          console.log(`Adzuna (primary) returned ${Array.isArray(items) ? items.length : 0} items`);
          const adzNormalized = (items || []).map(i => normalize(i, 'adzuna'));
          providersAttempted.push('adzuna');
          if (RAPID_KEY && RAPID_HOST) {
            try {
              providersAttempted.push('indeed');
              const indeedResults = await fetchIndeedRapid(q);
              // dedupe by url / id / title+company
              const seen = new Set();
              const merged = [];
              const keyFor = (j) => {
                if (!j) return '';
                if (j.url) return `url:${j.url}`;
                if (j.id) return `id:${j.id}`;
                return `t:${j.title || ''}|c:${j.company || ''}`;
              };
              // include ATS results first (if any)
              for (const at of (atsResults || [])) {
                const k = keyFor(at);
                if (!seen.has(k)) { seen.add(k); merged.push(at); }
              }
              for (const it of (indeedResults || [])) {
                const k = keyFor(it);
                if (!seen.has(k)) { seen.add(k); merged.push(it); }
              }
              for (const a of adzNormalized) {
                const k = keyFor(a);
                if (!seen.has(k)) { seen.add(k); merged.push(a); }
              }
              console.log('Returning merged Indeed+Adzuna (primary)', { indeed: indeedResults.length, adzuna: adzNormalized.length, merged: merged.length });
              return sendOk('combined', merged);
            } catch (e) {
              console.warn('Indeed merge failed, falling back to Adzuna only', String(e).slice(0,200));
              providerErrors.indeed = String(e).slice(0,200);
              return sendOk('adzuna', adzNormalized);
            }
          }
          return sendOk('adzuna', adzNormalized);
        } else {
          const text = await ar.text().catch(() => '');
          console.warn('Adzuna primary non-OK response preview:', (text || '').slice(0,200));
        }
      } catch (e) {
        console.warn('Adzuna primary call failed', String(e).slice(0,200));
      }
    }

    const SANITIZED_RAPID_BASEPATH = normalizeBasepath(RAPID_BASEPATH);
    const userip = query.userip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const useragent = query.useragent || req.headers['user-agent'] || 'SlateApp/1.0';
    const loc = query.l || query.location || query.loc || '';
    if (RAPID_KEY && RAPID_HOST) {
      const cacheKey = `indeed:${q}`;
      const cached = INDEED_CACHE.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < INDEED_TTL) {
        console.log('Returning cached Indeed results', { q, count: cached.data.length });
        providersAttempted.push('indeed');
        return sendOk('indeed', cached.data);
      }

      // Allow configuring a base path for some RapidAPI products which expose
      // a non-root path (e.g. `/v1` or `/api`). Set `RAPIDAPI_INDEED_BASEPATH` in
      // `.env.local` if your RapidAPI product requires a path prefix.
      const base = `https://${RAPID_HOST}${SANITIZED_RAPID_BASEPATH}`;
      // Try Indeed RapidAPI's documented apisearch path first (sample from RapidAPI),
      // then fallback to other commonly-used shapes.
      const apisearchCommon = `apisearch?v=2&format=json&q=${encodeURIComponent(q)}&radius=25&userip=${encodeURIComponent(userip)}&useragent=${encodeURIComponent(useragent)}`;
      const apisearchAlt = `apisearch?q=${encodeURIComponent(q)}&format=json&userip=${encodeURIComponent(userip)}&useragent=${encodeURIComponent(useragent)}`;
      const candidatePaths = [
        `/${apisearchCommon}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/${apisearchAlt}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/apisearch?v=2&format=json&q=${encodeURIComponent(q)}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/apisearch?q=${encodeURIComponent(q)}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/apigetjobs?v=2&format=json`,
        `/apigetjobs`,
        `/search?query=${encodeURIComponent(q)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/search?q=${encodeURIComponent(q)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/v2/search?query=${encodeURIComponent(q)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/jobs/search?query=${encodeURIComponent(q)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
        `/jobs?q=${encodeURIComponent(q)}&limit=20${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
      ];

      let tried = [];
      for (const p of candidatePaths) {
        const url = `${base}${p}`;
        tried.push(url);
        try {
          console.log('Calling Indeed candidate', { url: url.replace(/(query=)[^&]+/, '$1REDACTED') });
          const r = await fetch(url, {
            headers: {
              'X-RapidAPI-Key': RAPID_KEY,
              'X-RapidAPI-Host': RAPID_HOST,
              Accept: 'application/json'
            }
          });
          console.log('Indeed candidate response', { url: p, status: r.status, ok: r.ok });
          if (!r.ok) {
            const text = await r.text().catch(() => '');
            console.warn('Indeed candidate non-OK preview', { url: p, preview: (text || '').slice(0, 200) });
            continue;
          }
          const json = await r.json().catch(() => null);
          // If caller asked for raw provider output, return it directly for debugging
          if (query.raw === '1') {
            return sendOk('indeed', { raw: json });
          }
          const items = json?.results || json?.data || json?.jobs || json?.hits || [];
          const normalized = (Array.isArray(items) ? items : []).map(i => normalize(i, 'indeed'));
          console.log(`Indeed returned ${normalized.length} items for candidate ${p}`);
          INDEED_CACHE.set(cacheKey, { ts: Date.now(), data: normalized });
          return sendOk('indeed', normalized);
        } catch (e) {
          console.warn('Indeed candidate failed', { url: p, err: String(e).slice(0,200) });
          continue;
        }
      }
      console.warn('Indeed attempts failed for all candidate paths', { tried });
      // fall through to other providers
    }

    console.log('/api/jobs called', { q, providerOverride: OVERRIDE_PROVIDER || null, MUSE_BASE: !!MUSE_BASE, MUSE_KEY: !!MUSE_KEY, ADZUNA: !!(ADZUNA_ID && ADZUNA_KEY), RAPID: !!(RAPID_KEY && RAPID_HOST) });
    // Try Muse first if configured
    if (MUSE_KEY || MUSE_BASE) {
      const params = new URLSearchParams();
      params.set('page', '1');
      if (q) {
        // Prefer free-text `q` param for search.
        // Do NOT set `category` to the free-text query by default because
        // that filters results too aggressively (e.g. `category=developer` returns 0).
        params.set('q', q);
        // If the caller explicitly provided a `category` param, forward it.
        if (query.category) params.set('category', query.category);
      }
      const url = `${MUSE_BASE}?${params.toString()}`;
      const headers = {};
      if (MUSE_KEY) headers['Authorization'] = `Bearer ${MUSE_KEY}`;
      console.log('Calling Muse', { url, hasKey: !!MUSE_KEY });
      const r = await fetch(url, { headers });
      console.log('Muse response', { status: r.status, ok: r.ok });
      if (r.ok) {
        const json = await r.json();
        // raw debug mode: return raw provider payload
        if (query.raw === '1') {
          return sendOk('muse', { raw: json });
        }
        const items = json.results || json.jobs || [];
        // Log a small preview of the first item's HTML contents so it's visible in server logs
        try {
          console.log('Muse items preview', { count: Array.isArray(items) ? items.length : 0, firstPreview: (items && items[0] && (items[0].contents || items[0].description || '') ? String(items[0].contents || items[0].description).slice(0,200) : null) });
        } catch (e) {
          // ignore logging errors
        }
        console.log(`Muse returned ${Array.isArray(items) ? items.length : 0} items`);
        providersAttempted.push('muse');
        const museNormalized = (items || []).map(i => normalize(i, 'muse'));
        try {
          const salaryCount = museNormalized.filter(m => !!m.salary).length;
          console.log('Muse normalization salary count', { total: museNormalized.length, withSalary: salaryCount });
        } catch (e) {}

        // If Adzuna is configured, fetch it as well and merge results (deduped).
        if (ADZUNA_ID && ADZUNA_KEY) {
          try {
            providersAttempted.push('adzuna');
            const adzUrl = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?app_id=${encodeURIComponent(ADZUNA_ID)}&app_key=${encodeURIComponent(ADZUNA_KEY)}&results_per_page=20&what=${encodeURIComponent(q)}`;
            console.log('Muse branch: calling Adzuna to merge', { url: adzUrl.replace(/app_key=[^&]+/, 'app_key=REDACTED') });
            const ar = await fetch(adzUrl);
            if (ar.ok) {
              const ajson = await ar.json();
              const aitems = ajson.results || [];
              console.log(`Adzuna (merge) returned ${Array.isArray(aitems) ? aitems.length : 0} items`);
              const adzNormalized = (aitems || []).map(i => normalize(i, 'adzuna'));

              // combine muse + adzuna, dedupe by url/id/title+company
              const seen = new Set();
              const combined = [];
              const keyFor = (j) => {
                if (!j) return '';
                if (j.url) return `url:${j.url}`;
                if (j.id) return `id:${j.id}`;
                return `t:${j.title || ''}|c:${j.company || ''}`;
              };
              for (const m of museNormalized) {
                const k = keyFor(m);
                if (!seen.has(k)) { seen.add(k); combined.push(m); }
              }
              for (const a of adzNormalized) {
                const k = keyFor(a);
                if (!seen.has(k)) { seen.add(k); combined.push(a); }
              }

              const merged = (atsResults && atsResults.length) ? mergeWithATS(combined) : combined;
              return sendOk('combined', merged);
            } else {
              const text = await ar.text().catch(() => '');
              console.warn('Adzuna (merge) non-OK preview', (text || '').slice(0, 200));
              // Fall back to returning Muse-only normalized results
              const museMerged = (atsResults && atsResults.length) ? mergeWithATS(museNormalized) : museNormalized;
              return sendOk('muse', museMerged);
            }
          } catch (e) {
            console.warn('Adzuna (merge) failed', String(e).slice(0,200));
            providerErrors.adzuna = String(e).slice(0,200);
            const museMerged = (atsResults && atsResults.length) ? mergeWithATS(museNormalized) : museNormalized;
            return sendOk('muse', museMerged);
          }
        }

        const museMerged = (atsResults && atsResults.length) ? mergeWithATS(museNormalized) : museNormalized;
        return sendOk('muse', museMerged);
      } else {
        const text = await r.text().catch(() => '');
        console.warn('Muse non-OK response body preview:', (text || '').slice(0, 200));
      }
    }

    // Then Adzuna if configured
    if (ADZUNA_ID && ADZUNA_KEY) {
      const url = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?app_id=${encodeURIComponent(ADZUNA_ID)}&app_key=${encodeURIComponent(ADZUNA_KEY)}&results_per_page=20&what=${encodeURIComponent(q)}`;
      console.log('Calling Adzuna', { url: url.replace(/app_key=[^&]+/, 'app_key=REDACTED') });
      const r = await fetch(url);
      console.log('Adzuna response', { status: r.status, ok: r.ok });
      if (r.ok) {
        const json = await r.json();
        if (query.raw === '1') {
            return sendOk('adzuna', { raw: json });
          }
          const items = json.results || [];
          console.log(`Adzuna returned ${Array.isArray(items) ? items.length : 0} items`);
          const adzNormalized = (items || []).map(i => normalize(i, 'adzuna'));
          providersAttempted.push('adzuna');
          if (RAPID_KEY && RAPID_HOST) {
            try {
              providersAttempted.push('indeed');
              const indeedResults = await fetchIndeedRapid(q);
              const seen = new Set();
              const merged = [];
              const keyFor = (j) => {
                if (!j) return '';
                if (j.url) return `url:${j.url}`;
                if (j.id) return `id:${j.id}`;
                return `t:${j.title || ''}|c:${j.company || ''}`;
              };
              // include ATS results first
              for (const at of (atsResults || [])) {
                const k = keyFor(at);
                if (!seen.has(k)) { seen.add(k); merged.push(at); }
              }
              for (const it of (indeedResults || [])) {
                const k = keyFor(it);
                if (!seen.has(k)) { seen.add(k); merged.push(it); }
              }
              for (const a of adzNormalized) {
                const k = keyFor(a);
                if (!seen.has(k)) { seen.add(k); merged.push(a); }
              }
              console.log('Returning merged Indeed+Adzuna', { indeed: indeedResults.length, adzuna: adzNormalized.length, merged: merged.length });
              return sendOk('combined', merged);
            } catch (e) {
              console.warn('Indeed merge failed, falling back to Adzuna only', String(e).slice(0,200));
              providerErrors.indeed = String(e).slice(0,200);
              return sendOk('adzuna', adzNormalized);
            }
          }
          const mergedOnlyAdz = (atsResults && atsResults.length) ? mergeWithATS(adzNormalized) : adzNormalized;
          return sendOk('adzuna', mergedOnlyAdz);
      } else {
        const text = await r.text().catch(() => '');
        console.warn('Adzuna non-OK response body preview:', (text || '').slice(0, 200));
      }
    }

    // Fallback to Remotive public API
    const remUrl = `${REMOTIVE_BASE}?search=${encodeURIComponent(q)}`;
    console.log('Calling Remotive', { remUrl });
    const r2 = await fetch(remUrl);
    console.log('Remotive response', { status: r2.status, ok: r2.ok });
    if (r2.ok) {
      const json = await r2.json();
      if (query.raw === '1') {
        return sendOk('remotive', { raw: json });
      }
      const items = json.jobs || json.results || [];
      console.log(`Remotive returned ${Array.isArray(items) ? items.length : 0} items`);
      providersAttempted.push('remotive');
      const remNormalized = (items || []).map(i => normalize(i, 'remotive'));
      const remMerged = (atsResults && atsResults.length) ? mergeWithATS(remNormalized) : remNormalized;
      return sendOk('remotive', remMerged);
    } else {
      const text = await r2.text().catch(() => '');
      console.warn('Remotive non-OK response body preview:', (text || '').slice(0, 200));
    }

    return res.status(502).json({ error: 'No job providers available', providersAttempted, providerErrors });
  } catch (err) {
    console.error('Job proxy error', err);
    return res.status(500).json({ error: String(err), providersAttempted: Array.isArray(providersAttempted) ? providersAttempted : [] , providerErrors: providerErrors || {} });
  }
}
