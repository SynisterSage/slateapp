import supabase from '../lib/supabaseClient';
import normalizeJob from '../lib/normalizeJob';

// Simple API wrappers. Replace/mock as needed while backend evolves.

const ENV = (import.meta as any) || {};
const REMOTIVE_BASE = ENV.REMOTIVE_API_BASE || 'https://remotive.com/api/remote-jobs';
const MUSE_BASE = ENV.VITE_MUSE_BASE || 'https://www.themuse.com/api/public/jobs';
const MUSE_KEY = ENV.VITE_MUSE_API_KEY;
const ADZUNA_ID = ENV.VITE_ADZUNA_APP_ID;
const ADZUNA_KEY = ENV.VITE_ADZUNA_APP_KEY;
const ADZUNA_COUNTRY = ENV.VITE_ADZUNA_COUNTRY || 'us';

export async function getResumes() {
  // Simple in-memory debounce/cache to avoid rapid repeated requests from mounting components
  // This prevents spamming the Supabase REST endpoint if multiple components mount quickly.
  try {
    // show a stack trace in dev to help trace callers
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[getResumes] called from:', new Error().stack);
    }
  } catch (e) {}

  // module-level cache (per browser session)
  (globalThis as any)._slate_resumes_cache = (globalThis as any)._slate_resumes_cache || { last: 0, data: null, promise: null };
  const cache = (globalThis as any)._slate_resumes_cache;
  const now = Date.now();
  if (cache.promise) return cache.promise;
  if (cache.data && now - cache.last < 2000) return cache.data;

  cache.promise = (async () => {
    try {
      // In local dev we prefer the server-side proxy so the UI can see rows
      // created by the dev server (which may have null owners). This avoids
      // RLS hiding rows that were upserted server-side without an owner.
      const isLocal = (typeof window !== 'undefined') && (window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
      if (isLocal) {
        try {
          const resp = await fetch('/api/list-resumes');
          if (resp.ok) {
            const json = await resp.json();
            const rows = (json.rows || []).map((r: any) => (r && r.data ? r.data : r));
            cache.data = rows;
            cache.last = Date.now();
            return rows;
          }
        } catch (err) {
          console.warn('Server proxy getResumes failed in dev fallback', err);
        }
      }

      // Try client-side fetch first (works when anon/RLS allows it)
      try {
        const { data, error } = await supabase.from('resumes').select('*');
        if (!error && data) {
          const rows = (data || []).map((r: any) => (r && r.data ? r.data : r));
          if (rows && rows.length) {
            cache.data = rows;
            cache.last = Date.now();
            return rows;
          }
        }
      } catch (err) {
        console.warn('Client getResumes failed or returned empty; falling back to server proxy', err);
      }

      // Fallback to server proxy
      const resp = await fetch('/api/list-resumes');
      if (!resp.ok) throw new Error(`Server proxy failed: ${resp.status}`);
      const json = await resp.json();
      const rows = (json.rows || []).map((r: any) => (r && r.data ? r.data : r));
      cache.data = rows;
      cache.last = Date.now();
      return rows;
    } finally {
      cache.promise = null;
    }
  })();

  return cache.promise;
}

export async function getResumeById(id: string) {
  try {
    const { data, error } = await supabase.from('resumes').select('*').eq('id', id).single();
    if (!error && data) {
      const row = data && data.data ? data.data : data;
      return normalizeResume(row);
    }
    // If we got an error (for example PGRST116 when no rows are returned) fall through to server proxy
    console.warn('Client getResumeById returned no data or error, falling back to server proxy', error || 'no data');
  } catch (err) {
    console.warn('Client getResumeById threw, falling back to server proxy', err);
  }

  // Fallback: call server-side single-row proxy which uses the service role key
  try {
    // Try server proxy with a small retry loop — uploads/upserts may be slightly delayed,
    // so polling briefly increases robustness when the client asks for a row that was
    // just created server-side.
    const maxAttempts = 6;
    const delayMs = 500;
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const resp = await fetch(`/api/get-resume?id=${encodeURIComponent(id)}`);
        if (!resp.ok) {
          // If the proxy returned a transient failure, retry a few times
          console.warn(`Server proxy get-resume returned ${resp.status} (attempt ${attempt})`);
        } else {
          const json = await resp.json();
          const row = json.row || json;
          if (row) {
            const resolved = row.data ? row.data : row;
            return normalizeResume(resolved);
          }
          // If row missing, wait and retry
        }
      } catch (e) {
        console.warn('Server proxy get-resume threw, will retry', e);
      }
      // Wait before next attempt
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error('Resume not found via server single-row proxy after retries');
  } catch (proxyErr) {
    console.warn('Fallback getResumeById via server single-row proxy failed', proxyErr);
    throw proxyErr;
  }
}

function normalizeResume(raw: any) {
  const data = raw || {};
  return {
    id: data.id || '',
    title: data.title || (data.fileName ? String(data.fileName).replace('.pdf', '') : 'Untitled'),
    fileName: data.fileName || '',
    lastUpdated: data.lastUpdated || '',
    personalInfo: data.personalInfo || { fullName: '', email: '', phone: '', location: '', website: '', summary: '' },
    skills: Array.isArray(data.skills) ? data.skills : [],
    experience: Array.isArray(data.experience) ? data.experience : [],
    education: Array.isArray(data.education) ? data.education : [],
    revisions: Array.isArray(data.revisions) ? data.revisions : [],
    analysis: data.analysis || { overallScore: 0, categories: {}, issues: [] },
    storage_path: data.storage_path || data.storagePath || null,
    generated_pdf_path: data.generated_pdf_path || data.generatedPdfPath || null,
    // keep a reference to the raw data object for any fields we don't explicitly map
    raw: data,
  } as any;
}

export async function createResume(payload: any) {
  // If a user is signed in, include their uid as the owner so RLS policies work
  try {
    if (typeof window !== 'undefined' && supabase && supabase.auth) {
      try {
        const userRes: any = await supabase.auth.getUser();
        const user = userRes && userRes.data ? userRes.data.user : null;
        if (user && user.id) payload = { ...(payload || {}), owner: user.id };
      } catch (e) {
        // ignore auth errors and proceed without owner
      }
    }
  } catch (e) {}
  const { data, error } = await supabase.from('resumes').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateResume(id: string, payload: any) {
  // Persist under the `data` JSON column to avoid touching unknown top-level columns
  // Many rows in this project use the legacy shape { id, data: { ...resume... } }
  const upsertPayload: any = { data: { ...(payload && payload.data ? payload.data : payload) } };
  // include owner if available from auth so RLS policies allow client-side updates
  try {
    if (typeof window !== 'undefined' && supabase && supabase.auth) {
      try {
        const userRes: any = await supabase.auth.getUser();
        const user = userRes && userRes.data ? userRes.data.user : null;
        if (user && user.id) upsertPayload.owner = user.id;
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {}
  try {
    const { data, error } = await supabase.from('resumes').upsert({ id, ...upsertPayload }).select().single();
    if (error) throw error;
    return data && (data.data ? data.data : data);
  } catch (err) {
    console.error('updateResume failed (client), will attempt server proxy fallback', err);
    // If the client fails due to RLS (42501) or forbidden, fallback to server endpoint
    try {
      const resp = await fetch('/api/update-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, payload: upsertPayload })
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Server proxy update failed: ${resp.status} ${text}`);
      }
      const json = await resp.json();
      const row = json.row || json;
      return row && (row.data ? row.data : row);
    } catch (proxyErr) {
      console.error('updateResume proxy fallback failed', proxyErr);
      throw proxyErr;
    }
  }
}

export async function createResumeRevision(resumeId: string, revision: any) {
  // Try client fetch first; if client is blocked by RLS, fall back to server proxy
  try {
    let row: any = null;
    try {
      const { data: existing, error: getErr } = await supabase.from('resumes').select('*').eq('id', resumeId).single();
      if (getErr) throw getErr;
      row = existing && existing.data ? existing.data : existing;
    } catch (clientErr) {
      // fallback to server proxy to fetch the row
      try {
        const resp = await fetch(`/api/get-resume?id=${encodeURIComponent(resumeId)}`);
        if (resp.ok) {
          const json = await resp.json();
          const fetched = json.row || json;
          row = fetched && fetched.data ? fetched.data : fetched;
        } else {
          // If server proxy failed, rethrow original client error
          throw clientErr;
        }
      } catch (proxyErr) {
        throw clientErr;
      }
    }

    const revisions = Array.isArray(row.revisions) ? row.revisions : [];
    const newRevs = [...revisions, revision];
    const upsertBody: any = { id: resumeId, data: { ...row, revisions: newRevs, lastUpdated: new Date().toISOString() } };

    // include owner if available so RLS allows the update
    try {
      if (typeof window !== 'undefined' && supabase && supabase.auth) {
        const userRes: any = await supabase.auth.getUser();
        const user = userRes && userRes.data ? userRes.data.user : null;
        if (user && user.id) upsertBody.owner = user.id;
      }
    } catch (e) {}

    // Try client upsert; if it fails (RLS), use server proxy to perform the upsert with service role
    try {
      const { data, error } = await supabase.from('resumes').upsert(upsertBody).select().single();
      if (error) throw error;
      return data && (data.data ? data.data : data);
    } catch (clientUpsertErr) {
      // fallback to server proxy
      const resp = await fetch('/api/update-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resumeId, payload: upsertBody })
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Server proxy update failed: ${resp.status} ${text}`);
      }
      const json = await resp.json();
      const row = json.row || json;
      return row && (row.data ? row.data : row);
    }
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

export async function generatePdf(resumeId: string) {
  try {
    const resp = await fetch('/api/render-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resumeId })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Render PDF failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    return json; // { url, row }
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
    const normalized = (raw || []).map((r: any) => normalizeJob(r));
    // Respect server-side ordering (server now randomizes provider ordering).
    return normalized;
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

export async function getEmailMessagesByThread(threadId: string) {
  if (!threadId) return [];
  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('received_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getEmailMessageById(messageId: string) {
  if (!messageId) return null;
  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .eq('id', messageId)
    .limit(1)
    .single();
  if (error) {
    // If single() returns error when not found, return null
    return null;
  }
  return data || null;
}

export async function createApplication(payload: any) {
  // Accept both camelCase (frontend) and snake_case (DB) keys.
  // Map common camelCase keys to snake_case to avoid PostgREST schema errors (e.g. appliedDate -> applied_date).
  const keyMap: Record<string, string> = {
    appliedDate: 'applied_date',
    jobId: 'job_id',
    resumeId: 'resume_id',
    emailMessageId: 'email_message_id',
    threadId: 'thread_id',
    raw: 'data'
  };

  const normalized: any = {};
  for (const k of Object.keys(payload || {})) {
    const mapped = keyMap[k] || k;
    normalized[mapped] = (payload as any)[k];
  }

  // If a user is authenticated in the browser, set owner so RLS allows the insert.
  try {
    if (typeof window !== 'undefined' && supabase && supabase.auth) {
      const userRes: any = await supabase.auth.getUser();
      const user = userRes && userRes.data ? userRes.data.user : null;
      if (user && user.id) normalized.owner = user.id;
    }
  } catch (e) {
    // ignore auth fetch errors; server proxy will handle if insert fails
  }

  const { data, error } = await supabase.from('applications').insert(normalized).select().single();
  if (error) throw error;
  return data;
}

// Saved jobs (bookmarks)
export async function getSavedJobs() {
  try {
    const { data, error } = await supabase.from('saved_jobs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('getSavedJobs failed', err);
    return [];
  }
}

export async function saveJob(job: any) {
  try {
    // attempt to include owner if available
    try {
      const u = await supabase.auth.getUser();
      const user = u && (u as any).data ? (u as any).data.user : null;
      if (user && user.id) job.owner = user.id;
    } catch (e) {}

    const payload = { job_id: job.id || job.job_id || null, payload: job };
    const { data, error } = await supabase.from('saved_jobs').upsert(payload).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('saveJob failed', err);
    throw err;
  }
}

export async function deleteSavedJob(jobId: string) {
  try {
    const { data, error } = await supabase.from('saved_jobs').delete().eq('job_id', jobId).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('deleteSavedJob failed', err);
    throw err;
  }
}

export async function updateApplication(id: string, payload: any) {
  // Normalize camelCase keys to snake_case before updating to avoid PostgREST schema errors
  const keyMap: Record<string, string> = {
    appliedDate: 'applied_date',
    jobId: 'job_id',
    resumeId: 'resume_id',
    emailMessageId: 'email_message_id',
    threadId: 'thread_id'
  };
  const normalized: any = {};
  for (const k of Object.keys(payload || {})) {
    const mapped = keyMap[k] || k;
    normalized[mapped] = payload[k];
  }

  const { data, error } = await supabase.from('applications').update(normalized).eq('id', id).select().single();
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
