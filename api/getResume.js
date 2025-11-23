import { createClient } from '@supabase/supabase-js';

// Dev endpoint: return a single resume row using service-role key
export default async function handler(req, res) {
  try {
    try { const dot = await import('dotenv'); dot.config && dot.config({ path: process.cwd() + '/.env.local' }); } catch (e) {}
    const query = req.query || (req.url ? (await import('url')).parse(req.url, true).query : {});
    const id = query && (query.id || query.resumeId);
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Server missing Supabase config' });

    const serverClient = createClient(supabaseUrl, serviceRole);
    const { data, error } = await serverClient.from('resumes').select('*').eq('id', id).single();
    if (error) {
      console.error('getResume handler db error', error);
      return res.status(500).json({ error: error.message || String(error), details: error });
    }
    return res.status(200).json({ row: data });
  } catch (err) {
    console.error('getResume handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
