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

  // Helper to normalize job shape
  const normalize = (item, source) => ({
    id: item.id || item.slug || item._id || `${source}-${Math.random().toString(36).slice(2,9)}`,
    title: item.name || item.title || item.job_title || '',
    company: item.company?.name || item.company || item.employer || '',
    location: item.location?.display_name || item.location || (item.locations ? item.locations.map(l=>l.name).join(', ') : ''),
    url: item.refs?.landing_page || item.refs?.api || item.redirect_url || item.url || item.location_url || '',
    description: item.contents || item.description || item.summary || '',
    source,
    raw: item,
  });

  try {
    // Try LinkedIn RapidAPI (if configured) first, then Indeed RapidAPI.
    const RAPID_LINKEDIN_KEY = process.env.RAPIDAPI_LINKEDIN_KEY;
    const RAPID_LINKEDIN_HOST = process.env.RAPIDAPI_LINKEDIN_HOST;
    const RAPID_LINKEDIN_BASEPATH = process.env.RAPIDAPI_LINKEDIN_BASEPATH || '';
    const normalizeBasepath = (bp) => {
      if (!bp) return '';
      if (bp.includes('optional-basepath')) return '';
      return bp.startsWith('/') ? bp : `/${bp}`;
    };

    // Try LinkedIn RapidAPI first if available
    if (RAPID_LINKEDIN_KEY && RAPID_LINKEDIN_HOST) {
      const cacheKey = `linkedin:${q}`;
      const cached = LINKEDIN_CACHE.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < LINKEDIN_TTL) {
        console.log('Returning cached LinkedIn results', { q, count: cached.data.length });
        return res.status(200).json({ provider: 'linkedin', jobs: cached.data });
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
            return res.status(200).json({ provider: 'linkedin', raw: json });
          }
          const items = json?.results || json?.data || json?.jobs || json?.hits || json?.positions || [];
          const normalized = (Array.isArray(items) ? items : []).map(i => normalize(i, 'linkedin'));
          console.log(`LinkedIn returned ${normalized.length} items for candidate ${p}`);
          LINKEDIN_CACHE.set(cacheKey, { ts: Date.now(), data: normalized });
          return res.status(200).json({ provider: 'linkedin', jobs: normalized });
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
          if (query.raw === '1') return res.status(200).json({ provider: 'adzuna', raw: json });
          const items = json.results || [];
          console.log(`Adzuna (primary) returned ${Array.isArray(items) ? items.length : 0} items`);
          return res.status(200).json({ provider: 'adzuna', jobs: items.map(i => normalize(i, 'adzuna')) });
        } else {
          const text = await ar.text().catch(() => '');
          console.warn('Adzuna primary non-OK response preview:', (text || '').slice(0,200));
        }
      } catch (e) {
        console.warn('Adzuna primary call failed', String(e).slice(0,200));
      }
    }

    const RAPID_KEY = process.env.RAPIDAPI_INDEED_KEY;
    const RAPID_HOST = process.env.RAPIDAPI_INDEED_HOST;
    const RAPID_BASEPATH = process.env.RAPIDAPI_INDEED_BASEPATH || '';
    const SANITIZED_RAPID_BASEPATH = normalizeBasepath(RAPID_BASEPATH);
    const SANITIZED_RAPID_LINKEDIN_BASEPATH = normalizeBasepath(RAPID_LINKEDIN_BASEPATH);
    const userip = query.userip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const useragent = query.useragent || req.headers['user-agent'] || 'SlateApp/1.0';
    const loc = query.l || query.location || query.loc || '';
    if (RAPID_KEY && RAPID_HOST) {
      const cacheKey = `indeed:${q}`;
      const cached = INDEED_CACHE.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < INDEED_TTL) {
        console.log('Returning cached Indeed results', { q, count: cached.data.length });
        return res.status(200).json({ provider: 'indeed', jobs: cached.data });
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
        `/search?query=${encodeURIComponent(q)}&limit=20`,
        `/search?q=${encodeURIComponent(q)}&limit=20`,
        `/v2/search?query=${encodeURIComponent(q)}&limit=20`,
        `/jobs/search?query=${encodeURIComponent(q)}&limit=20`,
        `/jobs?q=${encodeURIComponent(q)}&limit=20`,
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
            return res.status(200).json({ provider: 'indeed', raw: json });
          }
          const items = json?.results || json?.data || json?.jobs || json?.hits || [];
          const normalized = (Array.isArray(items) ? items : []).map(i => normalize(i, 'indeed'));
          console.log(`Indeed returned ${normalized.length} items for candidate ${p}`);
          INDEED_CACHE.set(cacheKey, { ts: Date.now(), data: normalized });
          return res.status(200).json({ provider: 'indeed', jobs: normalized });
        } catch (e) {
          console.warn('Indeed candidate failed', { url: p, err: String(e).slice(0,200) });
          continue;
        }
      }
      console.warn('Indeed attempts failed for all candidate paths', { tried });
      // fall through to other providers
    }

    console.log('/api/jobs called', { q, MUSE_BASE: !!MUSE_BASE, MUSE_KEY: !!MUSE_KEY, ADZUNA: !!(ADZUNA_ID && ADZUNA_KEY) });
    // Try Muse first if configured
    if (MUSE_KEY || MUSE_BASE) {
      const params = new URLSearchParams();
      params.set('page', '1');
      if (q) {
        // Prefer free-text `q` param for search; keep `category` as fallback for
        // categorical lookups so queries like `q=graphic` return relevant results.
        params.set('q', q);
        params.set('category', q);
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
          return res.status(200).json({ provider: 'muse', raw: json });
        }
        const items = json.results || json.jobs || [];
        console.log(`Muse returned ${Array.isArray(items) ? items.length : 0} items`);
        return res.status(200).json({ provider: 'muse', jobs: items.map(i => normalize(i, 'muse')) });
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
          return res.status(200).json({ provider: 'adzuna', raw: json });
        }
        const items = json.results || [];
        console.log(`Adzuna returned ${Array.isArray(items) ? items.length : 0} items`);
        return res.status(200).json({ provider: 'adzuna', jobs: items.map(i => normalize(i, 'adzuna')) });
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
        return res.status(200).json({ provider: 'remotive', raw: json });
      }
      const items = json.jobs || json.results || [];
      console.log(`Remotive returned ${Array.isArray(items) ? items.length : 0} items`);
      return res.status(200).json({ provider: 'remotive', jobs: items.map(i => normalize(i, 'remotive')) });
    } else {
      const text = await r2.text().catch(() => '');
      console.warn('Remotive non-OK response body preview:', (text || '').slice(0, 200));
    }

    return res.status(502).json({ error: 'No job providers available' });
  } catch (err) {
    console.error('Job proxy error', err);
    return res.status(500).json({ error: String(err) });
  }
}
