// Serverless job-proxy endpoint (Vercel / Netlify compatible)
// This proxies requests to Muse / Adzuna / Remotive (and optional RapidAPI
// products like LinkedIn/Indeed) using server-side env vars.
// Simple in-memory cache for provider results (keyed by provider:q)
const LINKEDIN_CACHE = new Map();
const INDEED_CACHE = new Map();
const LINKEDIN_TTL = 60 * 1000; // 60s
const INDEED_TTL = 60 * 1000; // 60s
const RISE_CACHE = new Map();
const RISE_TTL = 60 * 1000; // 60s

export default async function handler(req, res) {
  const { query } = req;
  const q = query.q || query.search || '';

  const REMOTIVE_BASE = process.env.REMOTIVE_API_BASE || 'https://remotive.io/api/remote-jobs';
  const MUSE_BASE = process.env.VITE_MUSE_BASE || 'https://www.themuse.com/api/public/jobs';
  const MUSE_KEY = process.env.VITE_MUSE_API_KEY;
  const ADZUNA_ID = process.env.VITE_ADZUNA_APP_ID;
  const ADZUNA_KEY = process.env.VITE_ADZUNA_APP_KEY;
  const ADZUNA_COUNTRY = process.env.VITE_ADZUNA_COUNTRY || 'us';
  const RISE_BASE = process.env.RISE_BASE || 'https://api.joinrise.io/api/v1/jobs/public';
  const RISE_ENABLED = (typeof process.env.RISE_ENABLED === 'undefined') ? true : (process.env.RISE_ENABLED !== 'false');
  const RISE_LIMIT = Number(process.env.RISE_LIMIT || 20);
  const PRIMARY_JOB_PROVIDER = (process.env.PRIMARY_JOB_PROVIDER || 'indeed').toLowerCase();
  const RAPID_KEY = process.env.RAPIDAPI_INDEED_KEY;
  const RAPID_HOST = process.env.RAPIDAPI_INDEED_HOST;
  const RAPID_BASEPATH = process.env.RAPIDAPI_INDEED_BASEPATH || '';
  const OVERRIDE_PROVIDER = (query.provider || '').toLowerCase();

  // Helper to normalize job shape
  // Helper to normalize job shape
  const normalize = (item, source) => {
    const id = item.id || item.slug || item._id || `${source}-${Math.random().toString(36).slice(2,9)}`;
    const title = item.name || item.title || item.job_title || '';
    // Robust company extraction: handle Adzuna / Muse / Indeed shapes and Rise's owner.companyName
    const company = (function() {
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
        if (item.owner && typeof item.owner === 'object') {
          if (item.owner.companyName) return item.owner.companyName;
          if (item.owner.name) return item.owner.name;
        }
        return item.company || item.organisation || item.organization || '';
      } catch (e) { return '' }
    })();

    const location = (item.location && (item.location.display_name || item.location.name)) || (Array.isArray(item.locations) ? item.locations.map(l=>l.name || l).join(', ') : (item.location || item.locationAddress || item.location_address || ''));

    const url = item.refs?.landing_page || item.refs?.api || item.redirect_url || item.url || item.location_url || item.source_url || '';

    const description = item.contents || item.description || item.summary || item.snippet || (item.descriptionBreakdown && item.descriptionBreakdown.oneSentenceJobSummary) || (Array.isArray(item.skills_suggest) ? item.skills_suggest.join('\n') : '') || '';

    // salary resolver
    const salary = (function() {
      try {
        const smin = item.salary_min || item.salaryMin || item.min_salary || (item.salary && (item.salary.from || item.salary.min));
        const smax = item.salary_max || item.salaryMax || item.max_salary || (item.salary && (item.salary.to || item.salary.max));
        const rmin = item.descriptionBreakdown && (item.descriptionBreakdown.salaryRangeMinYearly || item.descriptionBreakdown.salaryRangeMin);
        const rmax = item.descriptionBreakdown && (item.descriptionBreakdown.salaryRangeMaxYearly || item.descriptionBreakdown.salaryRangeMax);
        if (smin || smax) {
          const fmt = (v) => { try { return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }); } catch (e) { return String(v); } };
          return smin && smax ? `$${fmt(smin)} - $${fmt(smax)}` : `$${fmt(smin || smax)}`;
        }
        if ((rmin || rmax) && !(smin || smax)) {
          const fmt = (v) => { try { return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }); } catch (e) { return String(v); } };
          return (rmin && rmax) ? `$${fmt(rmin)} - $${fmt(rmax)}` : `$${fmt(rmin || rmax)}`;
        }
        if (item.salary && typeof item.salary === 'object') {
          const from = item.salary.from || item.salary.min;
          const to = item.salary.to || item.salary.max;
          if (from || to) {
            const fmt = (v) => { try { return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }); } catch (e) { return String(v); } };
            return (from && to) ? `$${fmt(from)} - $${fmt(to)}` : `$${fmt(from || to)}`;
          }
        }
        const text = String(item.contents || item.description || '');
        const moneyRe = /(?:[$£€]\s*)?\d{1,3}(?:[\d,]{0,})?(?:\.\d+)?\s*(?:[kK])?(?:\s*(?:-|–|—|to)\s*(?:[$£€]\s*)?\d{1,3}(?:[\d,]{0,})?(?:\.\d+)?\s*(?:[kK])?)/u;
        const m = text.match(moneyRe);
        if (m) return m[0].replace(/\s+/g,' ').trim();
      } catch (e) {}
      return undefined;
    })();

    const postedAt = item.postedAt || item.date_posted || item.created_at || item.createdAt || item.created || item.posted || item.publication_date || '';

    return {
      id,
      title,
      company,
      location,
      url,
      description,
      salary,
      postedAt,
      source,
      raw: item,
    };
  };

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
    // Helper to fetch Rise (JoinRise) public jobs and normalize them.
    let riseResults = [];
    const fetchRise = async (queryText) => {
      if (!RISE_ENABLED) return [];
      const cacheKey = `rise:${queryText || ''}`;
      const cached = RISE_CACHE.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < RISE_TTL) return cached.data;
      try {
        const params = new URLSearchParams();
        params.set('page', '1');
        params.set('limit', String(RISE_LIMIT));
        if (queryText) params.set('q', queryText);
        const loc = query.l || query.location || query.loc || '';
        if (loc) params.set('jobLoc', loc);
        const url = `${RISE_BASE}?${params.toString()}`;
        console.log('Calling Rise', { url: url.replace(/(q=)[^&]+/, '$1REDACTED') });
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) {
          console.warn('Rise non-OK response', { status: r.status });
          return [];
        }
        const json = await r.json().catch(() => null);
        // JoinRise returns jobs under `result.jobs` (or similar). Try common shapes.
        const items = (json && (json.result?.jobs || json.result?.results || json.jobs || json.data)) || [];
        const normalized = (Array.isArray(items) ? items : []).map(i => normalize(i, 'rise'));
        RISE_CACHE.set(cacheKey, { ts: Date.now(), data: normalized });
        console.log('Rise fetch success', { count: normalized.length });
        return normalized;
      } catch (e) {
        console.warn('Rise fetch failed', String(e).slice(0,200));
        return [];
      }
    };
    // Start Rise fetch in parallel so results can be merged into provider responses.
    const risePromise = fetchRise(q);
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
    // Merge ATS + Rise + provider results (dedupe by url/id/title+company).
    // To avoid always showing providers in the same order, shuffle non-ATS results
    // each time so front-end shows mixed provider order. ATS results (if any)
    // are kept at the top for visibility.
    const mergeWithRiseAndATS = (jobsArray) => {
      const seen = new Set();
      const ats = [];
      const nonAts = [];
      const keyFor = (j) => {
        if (!j) return '';
        if (j.url) return `url:${j.url}`;
        if (j.id) return `id:${j.id}`;
        return `t:${j.title || ''}|c:${j.company || ''}`;
      };
      // collect ATS results first (preserve order)
      for (const at of (atsResults || [])) {
        const k = keyFor(at);
        if (!seen.has(k)) { seen.add(k); ats.push(at); }
      }
      // collect Rise + provider results into nonAts (deduped)
      try {
        const resolvedRise = Array.isArray(riseResults) ? riseResults : [];
        for (const r of resolvedRise) {
          const k = keyFor(r);
          if (!seen.has(k)) { seen.add(k); nonAts.push(r); }
        }
      } catch (e) {}
      for (const j of (Array.isArray(jobsArray) ? jobsArray : [])) {
        const k = keyFor(j);
        if (!seen.has(k)) { seen.add(k); nonAts.push(j); }
      }

      // Shuffle non-ATS results to randomize provider ordering each call
      for (let i = nonAts.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        const tmp = nonAts[i];
        nonAts[i] = nonAts[r];
        nonAts[r] = tmp;
      }

      return ats.concat(nonAts);
    };
      // Interleave multiple provider result arrays (round-robin) with per-provider caps
      // Keeps ATS results at the front, then distributes provider items so one
      // provider doesn't dominate the final list. Options:
      // - perProviderCap: max items to take from each provider
      // - totalLimit: overall limit for returned job items (excluding ATS)
      const mergeProvidersInterleaved = (providersMap = {}, opts = {}) => {
        // Slightly higher per-provider cap to include more Adzuna results by default
        const perProviderCap = Number(opts.perProviderCap || 8);
        const totalLimit = Number(opts.totalLimit || 50);
        const seen = new Set();
        const result = [];
        const keyFor = (j) => {
          if (!j) return '';
          // Prefer explicit id/url when present
          if (j.id) return `id:${j.id}`;
          if (j.url) return `url:${j.url}`;
          // fallback: include title + company + postedAt (date) to reduce accidental collisions
          const posted = (j.postedAt || j.posted || (j.raw && (j.raw.createdAt || j.raw.created_at || j.raw.created)) || '').toString().slice(0,10);
          return `t:${String(j.title || '').trim().toLowerCase()}|c:${String(j.company || '').trim().toLowerCase()}|p:${posted}`;
        };

        // push ATS results first (preserve order)
        for (const at of (atsResults || [])) {
          const k = keyFor(at);
          if (!seen.has(k)) { seen.add(k); result.push(at); }
        }

        // build per-provider queues (slice to cap)
        const queues = {};
        const providerKeys = Object.keys(providersMap || {}).filter(k => Array.isArray(providersMap[k]) && providersMap[k].length > 0);
        for (const pk of providerKeys) {
          queues[pk] = (providersMap[pk] || []).slice(0, perProviderCap).slice();
        }

        // randomize provider ordering each call to vary mix
        for (let i = providerKeys.length - 1; i > 0; i--) {
          const r = Math.floor(Math.random() * (i + 1));
          const tmp = providerKeys[i]; providerKeys[i] = providerKeys[r]; providerKeys[r] = tmp;
        }

        // Round-robin pick from each provider until we hit totalLimit
        let remaining = true;
        while (result.length < totalLimit && remaining) {
          remaining = false;
          for (const pk of providerKeys) {
            const q = queues[pk];
            if (q && q.length) {
              remaining = true;
              const item = q.shift();
              const k = keyFor(item);
              if (!seen.has(k)) { seen.add(k); result.push(item); }
              if (result.length >= totalLimit) break;
            }
          }
        }

        // Debug: log provider distribution in the merged result (counts by source)
        try {
          const dist = {};
          for (const it of result) {
            const src = (it && (it.source || it.provider || (it.raw && it.raw.source) || 'unknown')) || 'unknown';
            dist[src] = (dist[src] || 0) + 1;
          }
          console.log('mergeProvidersInterleaved distribution', { perProviderCap, totalLimit, providers: Object.keys(providersMap), mergedCount: result.length, distribution: dist });
        } catch (e) {}

        return result;
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
        try { riseResults = await risePromise.catch(() => []); } catch (e) {}
        const mergedCached = mergeWithRiseAndATS(cached.data);
        return sendOk('linkedin', mergedCached);
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
          try { riseResults = await risePromise.catch(() => []); } catch (e) {}
          const merged = mergeWithRiseAndATS(normalized);
          return sendOk('linkedin', merged);
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
              // Interleave Indeed + Adzuna (and Rise if available) to avoid Adzuna dominating
              try { riseResults = await risePromise.catch(() => []); } catch (e) {}
              const providersMap = {
                indeed: indeedResults || [],
                adzuna: adzNormalized || [],
              };
              if (Array.isArray(riseResults) && riseResults.length) providersMap.rise = riseResults;
              const mergedInterleaved = mergeProvidersInterleaved(providersMap, { perProviderCap: 6, totalLimit: 50 });
              console.log('Returning interleaved Indeed+Adzuna (primary)', { indeed: (indeedResults || []).length, adzuna: (adzNormalized || []).length, merged: mergedInterleaved.length });
              return sendOk('combined', mergedInterleaved);
            } catch (e) {
              console.warn('Indeed merge failed, falling back to Adzuna only', String(e).slice(0,200));
              providerErrors.indeed = String(e).slice(0,200);
              return sendOk('adzuna', adzNormalized);
            }
          }
          try { riseResults = await risePromise.catch(() => []); } catch (e) {}
          const mergedAdz = mergeWithRiseAndATS(adzNormalized);
          return sendOk('adzuna', mergedAdz);
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
        try { riseResults = await risePromise.catch(() => []); } catch (e) {}
        const mergedCachedIndeed = mergeWithRiseAndATS(cached.data);
        return sendOk('indeed', mergedCachedIndeed);
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
          try { riseResults = await risePromise.catch(() => []); } catch (e) {}
          const merged = mergeWithRiseAndATS(normalized);
          INDEED_CACHE.set(cacheKey, { ts: Date.now(), data: merged });
          return sendOk('indeed', merged);
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

              // Interleave Muse + Adzuna (and Rise) to improve distribution
              try { riseResults = await risePromise.catch(() => []); } catch (e) {}
              const providersMapMA = {
                muse: museNormalized || [],
                adzuna: adzNormalized || [],
              };
              if (Array.isArray(riseResults) && riseResults.length) providersMapMA.rise = riseResults;
              const mergedMA = mergeProvidersInterleaved(providersMapMA, { perProviderCap: 6, totalLimit: 50 });
              return sendOk('combined', mergedMA);
            } else {
              const text = await ar.text().catch(() => '');
              console.warn('Adzuna (merge) non-OK preview', (text || '').slice(0, 200));
              // Fall back to returning Muse-only normalized results
              try { riseResults = await risePromise.catch(() => []); } catch (e) {}
              const museMerged = mergeWithRiseAndATS(museNormalized);
              return sendOk('muse', museMerged);
            }
          } catch (e) {
            console.warn('Adzuna (merge) failed', String(e).slice(0,200));
            providerErrors.adzuna = String(e).slice(0,200);
            try { riseResults = await risePromise.catch(() => []); } catch (er) {}
            const museMerged = mergeWithRiseAndATS(museNormalized);
            return sendOk('muse', museMerged);
          }
        }

        try { riseResults = await risePromise.catch(() => []); } catch (er) {}
        const museMerged = mergeWithRiseAndATS(museNormalized);
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
              // Interleave Rise + Indeed + Adzuna to avoid single-provider dominance
              try { riseResults = await risePromise.catch(() => []); } catch (e) {}
              const providersMap2 = {
                rise: Array.isArray(riseResults) ? riseResults : [],
                indeed: indeedResults || [],
                adzuna: adzNormalized || [],
              };
              const mergedInter = mergeProvidersInterleaved(providersMap2, { perProviderCap: 6, totalLimit: 50 });
              console.log('Returning interleaved Indeed+Adzuna', { indeed: (indeedResults || []).length, adzuna: (adzNormalized || []).length, merged: mergedInter.length });
              return sendOk('combined', mergedInter);
            } catch (e) {
              console.warn('Indeed merge failed, falling back to Adzuna only', String(e).slice(0,200));
              providerErrors.indeed = String(e).slice(0,200);
              try { riseResults = await risePromise.catch(() => []); } catch (e) {}
              const mergedAdz2 = mergeWithRiseAndATS(adzNormalized);
              return sendOk('adzuna', mergedAdz2);
            }
          }
          try { riseResults = await risePromise.catch(() => []); } catch (e) {}
          const mergedOnlyAdz = mergeWithRiseAndATS(adzNormalized);
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
      try { riseResults = await risePromise.catch(() => []); } catch (e) {}
      const remMerged = mergeWithRiseAndATS(remNormalized);
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
