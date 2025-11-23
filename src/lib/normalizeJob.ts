import { Job } from '../../types';

function asArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  return [String(v)];
}

export default function normalizeJob(raw: any): Job {
  const id = raw.id || raw.job_id || raw.slug || raw.url || (raw.title ? `${raw.title}-${Math.random().toString(36).slice(2,8)}` : `job-${Date.now()}`);
  const title = raw.title || raw.name || raw.position || raw.role || 'Untitled Role';
  const company = raw.company?.name || raw.company || raw.employer || raw.organisation || raw.organization || 'Unknown Company';
  const location = (() => {
    if (raw.location) return Array.isArray(raw.location) ? raw.location.join(', ') : raw.location;
    if (raw.locations) return Array.isArray(raw.locations) ? raw.locations.map((l: any)=> l.name || l).join(', ') : raw.locations;
    if (raw.city && raw.country) return `${raw.city}, ${raw.country}`;
    return raw.area || raw.region || 'Remote';
  })();
  const matchScore = Number(raw.matchScore ?? raw.match_score ?? raw.score ?? 0) || 0;
  const salary = raw.salary || raw.salary_range || raw.remuneration || raw.package || undefined;
  const postedAt = raw.postedAt || raw.date_posted || raw.created_at || raw.posted || raw.publication_date || '';
  const description = raw.description || raw.contents || raw.summary || raw.snippet || '';
  const status = raw.status || (raw.applied ? 'Applied' : undefined);
  const tags = new Set<string>();
  asArray(raw.tags).forEach(t => tags.add(t));
  asArray(raw.skills || raw.keywords || raw.categories || raw.categories?.names).forEach(t => tags.add(t));
  // Try to parse tags from description if none present (take first few tokens matching capitalized words)
  if (tags.size === 0 && description) {
    const found = Array.from(new Set((description.match(/\b[A-Z][a-z0-9+.#-]{1,30}\b/g) || []).slice(0,6)));
    found.forEach(f => tags.add(f));
  }

  const sourceUrl = raw.url || raw.refs?.landing_page || raw.refs?.api || raw.sourceUrl || raw.source || raw.source_url || undefined;

  return {
    id: String(id),
    title: String(title),
    company: String(company),
    location: String(location),
    matchScore,
    salary: salary ? String(salary) : undefined,
    postedAt: String(postedAt),
    description: String(description),
    status: status as any,
    tags: Array.from(tags),
    sourceUrl: sourceUrl as any,
  } as Job;
}
