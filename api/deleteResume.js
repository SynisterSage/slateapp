import { createClient } from '@supabase/supabase-js';

// Server handler to delete a resume row using the service role key.
export default async function handler(req, res) {
  try {
    try {
      const dot = await import('dotenv');
      dot.config && dot.config({ path: process.cwd() + '/.env.local' });
    } catch (e) {}

    let { query, method } = req;
    if (!query && req.url) {
      const u = await import('url');
      query = u.parse(req.url, true).query;
    }
    if (!method) method = (req.method || 'GET');

    // Accept id from query OR from POST/JSON body for robustness (vite proxy may POST with query params)
    const bodyId = req && req.body && req.body.id;
    const queryId = query && query.id;
    console.log('deleteResume handler incoming', { method, query, bodyId });
    const id = queryId || bodyId;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_URL_FALLBACK;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Server missing Supabase config' });

    const server = createClient(supabaseUrl, serviceRole);
    console.log('deleteResume handler deleting id=', id);
    // Delete the row
    const { data, error } = await server.from('resumes').delete().eq('id', id).select();
    console.log('deleteResume handler result', { data, error });
    if (error) {
      console.error('deleteResume server error', error);
      return res.status(502).json({ error: 'Delete failed', details: error });
    }
    return res.status(200).json({ success: true, rows: data });
  } catch (err) {
    console.error('deleteResume handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
