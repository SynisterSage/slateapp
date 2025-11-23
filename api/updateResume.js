import { createClient } from '@supabase/supabase-js';

// Simple server endpoint to update a resume row using the service role key.
export default async function handler(req, res) {
  try {
    // load dotenv if available for dev
    try {
      const dot = await import('dotenv');
      dot.config && dot.config({ path: process.cwd() + '/.env.local' });
    } catch (e) {}

    // Support both JSON body and query parsing
    let body = req.body;
    if (!body) {
      // collect body from stream
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      try { body = JSON.parse(buf.toString()); } catch (e) { body = null; }
    }

    const id = (body && body.id) || (req.query && req.query.id);
    const payload = (body && body.payload) || (body && body.data) || (body && body.resume) || body;

    if (!id || !payload) return res.status(400).json({ error: 'Missing id or payload' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Server missing Supabase config' });

    const serverClient = createClient(supabaseUrl, serviceRole);

    // Upsert using legacy shape: { id, data: {...} }
    // If the caller provided an owner (user uuid) include it as a top-level column
    // so RLS policies that check owner = auth.uid() can operate correctly.
    const upsertRow = { id, data: { ...(payload.data ? payload.data : payload) } };
    // allow explicit owner in payload (e.g., when the authenticated client includes owner = auth.uid())
    if (payload.owner || payload.user_id || payload.owner_id) {
      upsertRow.owner = payload.owner || payload.user_id || payload.owner_id;
    }
    const { data, error } = await serverClient.from('resumes').upsert(upsertRow).select().single();
    if (error) {
      console.error('server updateResume upsert error', error);
      return res.status(500).json({ error: error.message || String(error), details: error });
    }
    return res.status(200).json({ row: data });
  } catch (err) {
    console.error('updateResume handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}
