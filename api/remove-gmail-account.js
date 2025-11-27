import { createClient } from '@supabase/supabase-js';

async function resolveOwnerFromToken(token) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return null;
    const user = await resp.json();
    return user && user.id ? user.id : null;
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error('Supabase not configured');

    // Resolve owner
    let owner = null;
    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      owner = await resolveOwnerFromToken(token);
    }
    if (!owner) owner = req.query && req.query.owner;
    if (!owner) return res.status(400).json({ error: 'Missing owner or Authorization' });

    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
    // Delete only rows matching owner and id
    const { error } = await supabase.from('oauth_providers').delete().eq('id', id).eq('owner', owner);
    if (error) {
      console.error('remove-gmail-account error', error);
      return res.status(500).json({ error: 'db error' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('remove-gmail-account exception', err);
    res.status(500).json({ error: String(err) });
  }
}
