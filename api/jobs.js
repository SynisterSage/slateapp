// Serverless job-proxy endpoint (Vercel / Netlify compatible)
// This proxies requests to Muse / Adzuna / Remotive using server-side env vars

export default async function handler(req, res) {
  const { query } = req;
  const q = query.q || query.search || '';

  const REMOTIVE_BASE = process.env.REMOTIVE_API_BASE || 'https://remotive.io/api/remote-jobs';
  const MUSE_BASE = process.env.VITE_MUSE_BASE || 'https://www.themuse.com/api/public/jobs';
  const MUSE_KEY = process.env.VITE_MUSE_API_KEY;
  const ADZUNA_ID = process.env.VITE_ADZUNA_APP_ID;
  const ADZUNA_KEY = process.env.VITE_ADZUNA_APP_KEY;
  const ADZUNA_COUNTRY = process.env.VITE_ADZUNA_COUNTRY || 'us';

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
    // Try Muse first if configured
    if (MUSE_KEY || MUSE_BASE) {
      const params = new URLSearchParams();
      params.set('page', '1');
      if (q) params.set('category', q);
      const url = `${MUSE_BASE}?${params.toString()}`;
      const headers = {};
      if (MUSE_KEY) headers['Authorization'] = `Bearer ${MUSE_KEY}`;
      const r = await fetch(url, { headers });
      if (r.ok) {
        const json = await r.json();
        const items = json.results || json.jobs || [];
        return res.status(200).json({ provider: 'muse', jobs: items.map(i => normalize(i, 'muse')) });
      }
    }

    // Then Adzuna if configured
    if (ADZUNA_ID && ADZUNA_KEY) {
      const url = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?app_id=${encodeURIComponent(ADZUNA_ID)}&app_key=${encodeURIComponent(ADZUNA_KEY)}&results_per_page=20&what=${encodeURIComponent(q)}`;
      const r = await fetch(url);
      if (r.ok) {
        const json = await r.json();
        const items = json.results || [];
        return res.status(200).json({ provider: 'adzuna', jobs: items.map(i => normalize(i, 'adzuna')) });
      }
    }

    // Fallback to Remotive public API
    const remUrl = `${REMOTIVE_BASE}?search=${encodeURIComponent(q)}`;
    const r2 = await fetch(remUrl);
    if (r2.ok) {
      const json = await r2.json();
      const items = json.jobs || json.results || [];
      return res.status(200).json({ provider: 'remotive', jobs: items.map(i => normalize(i, 'remotive')) });
    }

    return res.status(502).json({ error: 'No job providers available' });
  } catch (err) {
    console.error('Job proxy error', err);
    return res.status(500).json({ error: String(err) });
  }
}
