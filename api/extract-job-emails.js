// Attempts to extract contact email addresses and apply URLs from a job object or job page
export default async function handler(req, res) {
  try {
    const body = req.body || (req.url ? (await (await import('url')).parse(req.url, true).query) : {});
    const job = body.job || body || {};

    const candidates = new Set();
    const add = (s) => { if (s && typeof s === 'string') { const t = s.trim(); if (t) candidates.add(t); } };

    // 1) Known fields from providers
    add(job.contact_email || job.apply_email || job.email || job.contactEmail || job.applyEmail || job.emailAddress);
    // company / raw fields may contain contact info
    if (job.company && typeof job.company === 'object') {
      add(job.company.email || job.company.contact_email || job.company.contactEmail || job.company.url);
    }

    // 2) Search raw text fields (description, contents, summary) for email-like patterns
    const textSources = [job.description, job.contents, job.summary, job.snippet, job.cleanDescription, job.how_to_apply, job.how_to_apply_text];
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
    for (const src of textSources) {
      if (!src) continue;
      try {
        const matches = String(src).match(emailRegex);
        if (matches) matches.forEach(m => add(m));
      } catch (e) {}
    }

    // 3) If we have a job URL, fetch the page and look for mailto: links and plain emails
    const fetchFromUrl = async (url) => {
      try {
        const resp = await fetch(url, { headers: { 'User-Agent': 'slateapp/1.0 (dev)' }, redirect: 'follow' });
        if (!resp.ok) return null;
        const html = await resp.text();
        // mailto links
        const mailtoRe = /href=["']mailto:([^"'>?\s]+)["']/ig;
        let m;
        while ((m = mailtoRe.exec(html)) !== null) add(decodeURIComponent(m[1]));
        // plain emails
        const matches = html.match(emailRegex);
        if (matches) matches.forEach(m2 => add(m2));
        // attempt to find a canonical apply link
        const applyRe = /href=["']([^"']+)["'][^>]*>(?:apply|apply now|apply here|view original)/i;
        const a = html.match(applyRe);
        const applyUrl = a && a[1] ? (new URL(a[1], url)).toString() : null;
        return { html, applyUrl };
      } catch (e) {
        return null;
      }
    };

    const triedUrls = new Set();
    const tryUrl = async (u) => {
      if (!u) return null;
      try {
        const normalized = String(u).trim();
        if (!normalized) return null;
        if (triedUrls.has(normalized)) return null;
        triedUrls.add(normalized);
        return await fetchFromUrl(normalized);
      } catch (e) { return null; }
    };

    const candidatesUrls = [job.url, job.apply_url, job.redirect_url, job.landing_page, job.refs && job.refs.landing_page].filter(Boolean);
    let foundApplyUrl = null;
    for (const u of candidatesUrls) {
      const out = await tryUrl(u).catch(() => null);
      if (out) {
        if (out.applyUrl) foundApplyUrl = foundApplyUrl || out.applyUrl;
      }
    }

    // Normalize candidate emails
    const final = Array.from(candidates).map(s => s.replace(/^["'\s]+|["'\s]+$/g, ''))
      .filter(Boolean)
      .map(s => s.toLowerCase());

    // Deduplicate
    const unique = [...new Set(final)];

    return res.status(200).json({ emails: unique, applyUrl: foundApplyUrl || job.url || null });
  } catch (err) {
    console.error('extract-job-emails error', err);
    return res.status(500).json({ error: String(err) });
  }
}
