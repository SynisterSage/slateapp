import supabase from '../lib/supabaseClient';
import normalizeJob from '../lib/normalizeJob';

// Simple API wrappers. Replace/mock as needed while backend evolves.

const ENV = (import.meta as any) || {};
const REMOTIVE_BASE = ENV.REMOTIVE_API_BASE || 'https://remotive.io/api/remote-jobs';
const MUSE_BASE = ENV.VITE_MUSE_BASE || 'https://www.themuse.com/api/public/jobs';
const MUSE_KEY = ENV.VITE_MUSE_API_KEY;
const ADZUNA_ID = ENV.VITE_ADZUNA_APP_ID;
const ADZUNA_KEY = ENV.VITE_ADZUNA_APP_KEY;
const ADZUNA_COUNTRY = ENV.VITE_ADZUNA_COUNTRY || 'us';

export async function getResumes() {
  // Try client-side fetch first (works when anon/RLS allows it)
  try {
    const { data, error } = await supabase.from('resumes').select('*');
    if (error) throw error;
    const rows = (data || []).map((r: any) => (r && r.data ? r.data : r));
    if (rows && rows.length) return rows;
    // If client returned no rows, fall back to server proxy which uses service role
  } catch (err) {
    console.warn('Client getResumes failed or returned empty; falling back to server proxy', err);
  }

  try {
    const resp = await fetch('/api/list-resumes');
    if (!resp.ok) throw new Error(`Server proxy failed: ${resp.status}`);
    const json = await resp.json();
    const rows = (json.rows || []).map((r: any) => (r && r.data ? r.data : r));
    return rows;
  } catch (proxyErr) {
    console.warn('Fallback list-resumes proxy failed', proxyErr);
    return [];
  }
}

export async function getResumeById(id: string) {
  const { data, error } = await supabase.from('resumes').select('*').eq('id', id).single();
  if (error) throw error;
  return data && (data.data ? data.data : data);
}

export async function createResume(payload: any) {
  const { data, error } = await supabase.from('resumes').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateResume(id: string, payload: any) {
  // If the table stores the full resume under `data` column (legacy), keep that shape
  const upsertPayload = { ...payload };
  const { data, error } = await supabase.from('resumes').upsert({ id, ...upsertPayload }).select().single();
  if (error) throw error;
  return data && (data.data ? data.data : data);
}

export async function createResumeRevision(resumeId: string, revision: any) {
  try {
    // Fetch existing resume
    const { data: existing, error: getErr } = await supabase.from('resumes').select('*').eq('id', resumeId).single();
    if (getErr) throw getErr;
    const row = existing && existing.data ? existing.data : existing;
    const revisions = Array.isArray(row.revisions) ? row.revisions : [];
    const newRevs = [...revisions, revision];
    const { data, error } = await supabase.from('resumes').upsert({ id: resumeId, data: { ...row, revisions: newRevs, lastUpdated: new Date().toISOString() } }).select().single();
    if (error) throw error;
    return data && (data.data ? data.data : data);
  } catch (err) {
    throw err;
  }
}

export async function uploadFileToStorage(bucket: string, path: string, file: File) {
  // Guard for browser environment
  if (typeof window === 'undefined') throw new Error('uploadFileToStorage must be called in the browser');
  try {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    return data;
  } catch (err) {
    throw err;
  }
}

// Provider-specific job search helpers
export async function searchJobsMuse(q = '') {
  try {
    const params = new URLSearchParams();
    params.set('page', '1');
    if (q) params.set('category', q);
    const url = `${MUSE_BASE}?${params.toString()}`;
    const headers: Record<string, string> = {};
    if (MUSE_KEY) headers['Authorization'] = `Bearer ${MUSE_KEY}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Muse API error: ${res.status}`);
    const json = await res.json();
    const items = json.results || json.jobs || json;
    if (!Array.isArray(items)) return [];
    return items.map((item: any) => normalizeJob({ ...item, source: 'muse' }));
  } catch (err) {
    console.warn('searchJobsMuse failed', err);
    return [];
  }
}

export async function searchJobsAdzuna(q = '') {
  if (!ADZUNA_ID || !ADZUNA_KEY) return [];
  try {
    const url = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?app_id=${encodeURIComponent(
      ADZUNA_ID
    )}&app_key=${encodeURIComponent(ADZUNA_KEY)}&results_per_page=20&what=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Adzuna API error: ${res.status}`);
    const json = await res.json();
    const items = json.results || [];
    return items.map((item: any) => normalizeJob({ ...item, source: 'adzuna' }));
  } catch (err) {
    console.warn('searchJobsAdzuna failed', err);
    return [];
  }
}

// Jobs: prefer Muse if available, else Adzuna, else fallback to Remotive public API
export async function searchJobs(q = '') {
  // Use serverless proxy endpoint to keep keys secret (deployed under /api/jobs)
  try {
    const url = `/api/jobs?q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Job proxy error: ${res.status}`);
    const json = await res.json();
    const raw = json.jobs || json.results || [];
    return (raw || []).map((r: any) => normalizeJob(r));
  } catch (err) {
    console.warn('Job search proxy failed, falling back to client providers', err);
    try {
      // Fallback to client-side provider resolution if proxy fails
      if (MUSE_KEY || ENV.VITE_MUSE_BASE) {
        const muse = await searchJobsMuse(q);
        if (muse && muse.length) return muse;
      }
      if (ADZUNA_ID && ADZUNA_KEY) {
        const adz = await searchJobsAdzuna(q);
        if (adz && adz.length) return adz;
      }
      const res2 = await fetch(`${REMOTIVE_BASE}?search=${encodeURIComponent(q)}`);
      if (!res2.ok) return [];
      const json2 = await res2.json();
      const raw2 = json2.jobs || json2.results || [];
      return (raw2 || []).map((r: any) => normalizeJob(r));
    } catch (err2) {
      console.warn('Client-side fallback also failed', err2);
      return [];
    }
  }
}

export async function getApplications() {
  const { data, error } = await supabase.from('applications').select('*');
  if (error) throw error;
  return data;
}

export async function createApplication(payload: any) {
  const { data, error } = await supabase.from('applications').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateApplication(id: string, payload: any) {
  const { data, error } = await supabase.from('applications').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteApplicationById(id: string) {
  const { data, error } = await supabase.from('applications').delete().eq('id', id).select();
  if (error) throw error;
  return data;
}

export default {
  getResumes,
  getResumeById,
  createResume,
  updateResume,
  createResumeRevision,
  uploadFileToStorage,
  searchJobs,
  searchJobsMuse,
  searchJobsAdzuna,
  getApplications,
  createApplication,
};
