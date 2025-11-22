import supabase from '../lib/supabaseClient';

// Simple API wrappers. Replace/mock as needed while backend evolves.

export async function getResumes() {
  // Example: fetch resumes from Supabase `resumes` table
  const { data, error } = await supabase.from('resumes').select('*');
  if (error) throw error;
  return data;
}

export async function getResumeById(id: string) {
  const { data, error } = await supabase.from('resumes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Jobs: default to public job APIs (Remotive/The Muse) if not present in Supabase
export async function searchJobs(q = '') {
  // If you store jobs in Supabase, you can query there. Fallback to Remotive public API.
  try {
    const res = await fetch(`https://remotive.io/api/remote-jobs?search=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('Job API error');
    const json = await res.json();
    return json.jobs || [];
  } catch (err) {
    console.warn('Remote job API failed, returning empty list', err);
    return [];
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

export default {
  getResumes,
  getResumeById,
  searchJobs,
  getApplications,
  createApplication,
};
