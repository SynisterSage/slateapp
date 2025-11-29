import supabase from './supabaseClient';

// Local indexes for docs and guides (kept in sync with pages content)
const docsIndex = [
  { slug: 'getting-started', title: 'Getting Started' },
  { slug: 'onboarding', title: 'Onboarding & First Steps' },
  { slug: 'uploading-resumes', title: 'Uploading Resumes' },
  { slug: 'resumes', title: 'Resumes: Editor & Revisions' },
  { slug: 'jobs', title: 'Jobs: Search & Apply' },
  { slug: 'applications', title: 'Applications & Tracking' },
  { slug: 'settings', title: 'Settings & Integrations' },
  { slug: 'integrations-gmail', title: 'Gmail Sync (Integrations)' },
  { slug: 'api-overview', title: 'API Overview' },
  { slug: 'guides-howtos', title: 'Guides & How-tos' },
  { slug: 'troubleshooting', title: 'Troubleshooting & FAQ' }
];

const guidesIndex = [
  { id: 'resume-writing', title: 'Resume Writing Best Practices' },
  { id: 'job-search', title: 'Effective Job Search Workflow' },
  { id: 'interview-prep', title: 'Interview Preparation Checklist' },
  { id: 'networking', title: 'Networking & Outreach Templates' }
];

// Simple utility to score and filter
function matchScore(text = '', q = '') {
  const t = String(text).toLowerCase();
  const qq = String(q).toLowerCase();
  if (!qq) return 0;
  if (t === qq) return 100;
  if (t.includes(qq)) return 50;
  return t.split(qq).length > 1 ? 40 : 0;
}

export async function fetchResumeList() {
  try {
    const resp = await fetch('/api/listResumes');
    if (!resp.ok) return [];
    const json = await resp.json();
    return Array.isArray(json) ? json : [];
  } catch (e) {
    return [];
  }
}

export async function fetchApplicationsForUser() {
  try {
    // Try Supabase client fetch as a fallback; this should work when user is authenticated
    const { data, error } = await supabase.from('applications').select('*').order('applied_date', { ascending: false }).limit(100);
    if (error) return [];
    return data || [];
  } catch (e) {
    return [];
  }
}

export async function fetchSuggestions(q: string) {
  const trimmed = (q || '').trim();
  if (!trimmed) return { docs: [], guides: [], resumes: [], applications: [] };

  // In parallel: fetch resumes and applications
  const [resumes, applications, jobs] = await Promise.all([fetchResumeList(), fetchApplicationsForUser(), fetchJobs(trimmed)]);

  const docs = docsIndex
    .map(d => ({ ...d, score: matchScore(d.title, trimmed) }))
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const guides = guidesIndex
    .map(g => ({ ...g, score: matchScore(g.title, trimmed) }))
    .filter(g => g.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const resumesMatches = (resumes || [])
    .map((r: any) => ({ item: r, score: Math.max(matchScore(r.title || r.fileName || r.personalInfo?.fullName, trimmed), matchScore(r.personalInfo?.fullName, trimmed)) }))
    .filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 6)
    .map((x: any) => x.item);

  const applicationsMatches = (applications || [])
    .map((a: any) => ({ item: a, score: Math.max(matchScore(a.notes || a.status || a.job_id || (a.data && a.data.job && a.data.job.title), trimmed)) }))
    .filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 6)
    .map((x: any) => x.item);

  return { docs, guides, resumes: resumesMatches, applications: applicationsMatches, jobs };
}

export async function fetchResults(q: string) {
  const trimmed = (q || '').trim();
  if (!trimmed) return { docs: [], guides: [], resumes: [], applications: [] };
  const [resumes, applications, jobs] = await Promise.all([fetchResumeList(), fetchApplicationsForUser(), fetchJobs(trimmed)]);

  const docs = docsIndex.filter(d => d.title.toLowerCase().includes(trimmed.toLowerCase()));
  const guides = guidesIndex.filter(g => g.title.toLowerCase().includes(trimmed.toLowerCase()));
  const resumesMatches = (resumes || []).filter((r: any) => {
    const hay = `${r.title || ''} ${r.fileName || ''} ${r.personalInfo?.fullName || ''} ${JSON.stringify(r)}`.toLowerCase();
    return hay.includes(trimmed.toLowerCase());
  });
  const applicationsMatches = (applications || []).filter((a: any) => {
    const hay = `${a.status || ''} ${a.notes || ''} ${JSON.stringify(a.data || {})}`.toLowerCase();
    return hay.includes(trimmed.toLowerCase());
  });

  return { docs, guides, resumes: resumesMatches, applications: applicationsMatches, jobs };
}

export async function fetchJobs(q: string) {
  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    // call the server-side job proxy
    const resp = await fetch(`/api/jobs?${params.toString()}`);
    if (!resp.ok) return [];
    const json = await resp.json().catch(() => ({}));
    const items = json.jobs || json.results || json.data || [];
    if (!Array.isArray(items)) return [];
    // Normalize minimal shape
    return items.map((it: any) => ({ id: it.id || it.raw?.id || String(it.title).slice(0,8), title: it.title || it.name || '', company: it.company || it.employer || '', url: it.url || it.refs?.landing_page || it.source || '' })).slice(0, 12);
  } catch (e) {
    return [];
  }
}
