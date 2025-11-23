import { createClient } from '@supabase/supabase-js';

// Simple handler to create a signed URL for a given storage path using the service role key.
export default async function handler(req, res) {
  try {
    try { const dot = await import('dotenv'); dot.config && dot.config({ path: process.cwd() + '/.env.local' }); } catch (e) {}

    const body = req.method === 'POST' ? (await parseJsonBody(req)) : req.query || (req.url ? (await import('url')).parse(req.url, true).query : {});
    const rawPath = body && (body.path || body.file || body.object);
    if (!rawPath) return res.status(400).json({ error: 'Missing path' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Server missing Supabase config' });

    const serverClient = createClient(supabaseUrl, serviceRole);

    // If path includes bucket prefix, split it
    const parts = String(rawPath).split('/');
    let bucket = parts.length > 1 ? parts[0] : 'resumes';
    let objectPath = parts.length > 1 ? parts.slice(1).join('/') : rawPath;

    // Normalize: if objectPath begins with a slash, strip it
    if (objectPath.startsWith('/')) objectPath = objectPath.slice(1);

    const ttl = body.ttl ? Number(body.ttl) : 60 * 60; // default 1 hour
    try {
      const { data, error } = await serverClient.storage.from(bucket).createSignedUrl(objectPath, ttl);
      if (error) return res.status(500).json({ error: error.message || String(error), details: error });
      return res.status(200).json({ signedUrl: data.signedUrl });
    } catch (err) {
      console.error('createSignedUrl error', err);
      return res.status(500).json({ error: String(err) });
    }
  } catch (err) {
    console.error('getSignedUrl handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  try { return JSON.parse(buf.toString()); } catch (e) { return null; }
}
