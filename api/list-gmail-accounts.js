// Returns sanitized list of Gmail provider rows for an owner
import { createClient } from '@supabase/supabase-js';

function safeDecodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    // base64url -> base64
    let b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // pad base64 string to multiple of 4
    while (b64.length % 4 !== 0) b64 += '=';
    const buf = Buffer.from(b64, 'base64');
    const json = JSON.parse(buf.toString('utf8'));
    return json;
  } catch (e) {
    return null;
  }
}

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
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error('Supabase not configured');

    // Determine owner: prefer Authorization bearer token -> /auth/v1/user, else query param owner
    let owner = null;
    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      owner = await resolveOwnerFromToken(token);
    }
    if (!owner) owner = req.query && req.query.owner;
    if (!owner) return res.status(400).json({ error: 'Missing owner or Authorization' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
    const { data, error } = await supabase.from('oauth_providers').select('id,provider_user_id,created_at,raw').eq('owner', owner).eq('provider', 'google');
    if (error) {
      console.error('list-gmail-accounts supabase error', error);
      return res.status(500).json({ error: 'db error' });
    }

    // Sanitize rows: extract name/email/picture from raw.id_token or raw
    const rows = (data || []).map(r => {
      const raw = r.raw || {};
      let name = null, email = null, picture = null;
      if (raw && raw.id_token && typeof raw.id_token === 'string') {
        const payload = safeDecodeJwtPayload(raw.id_token);
        if (payload) {
          name = payload.name || null;
          email = payload.email || null;
          picture = payload.picture || null;
        }
      }
      // fallback to raw fields
      if (!name) name = raw.name || raw.full_name || null;
      if (!email) email = raw.email || raw.user_email || null;
      if (!picture) picture = raw.picture || raw.avatar || null;

      return {
        id: r.id,
        provider_user_id: r.provider_user_id,
        name,
        email,
        picture,
        created_at: r.created_at
      };
    });

    return res.status(200).json({ accounts: rows });
  } catch (err) {
    console.error('list-gmail-accounts error', err);
    res.status(500).json({ error: String(err) });
  }
}
