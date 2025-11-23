import { createClient } from '@supabase/supabase-js';

// Dev helper: returns all resumes using the service role key so the frontend can
// list persisted rows even when anon/RLS prevents client reads during development.
export default async function handler(req, res) {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) {
      console.error('listResumes missing env', { supabaseUrl: !!supabaseUrl, serviceRole: !!serviceRole });
      return res.status(500).json({ error: 'Server missing Supabase config' });
    }
    const serverClient = createClient(supabaseUrl, serviceRole);
    const { data, error } = await serverClient.from('resumes').select('*');
    if (error) {
      console.error('listResumes query error', error);
      return res.status(500).json({ error: error.message || String(error) });
    }
    return res.status(200).json({ rows: data || [] });
  } catch (err) {
    console.error('listResumes handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
