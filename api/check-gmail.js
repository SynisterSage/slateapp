// Server endpoint: check if the current user has a Gmail OAuth provider connected

// Use Supabase server client for safe server-to-server queries
import { createClient } from '@supabase/supabase-js';
async function resolveOwnerFromToken(token) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
  try {
    // Safe debug: log that we received a token (length only) but do not log the token itself
    try { console.log('check-gmail: resolveOwnerFromToken called; token_len=', token ? token.length : 0); } catch (e) {}
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
    try { console.log('check-gmail: /auth/v1/user status=', resp.status); } catch (e) {}
    if (!resp.ok) return null;
    const user = await resp.json();
    try { console.log('check-gmail: resolved user id=', user && user.id ? user.id : null); } catch (e) {}
    return user && user.id ? user.id : null;
  } catch (err) {
    console.error('check-gmail: error resolving owner from token', String(err));
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
    try { console.log('check-gmail: received request; url=', req.url, 'authHeader present=', !!authHeader); } catch (e) {}
    let owner = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try { console.log('check-gmail: received bearer token length=', token ? token.length : 0); } catch (e) {}
      owner = await resolveOwnerFromToken(token);
    }
    if (!owner) owner = req.query && req.query.owner;
    try { console.log('check-gmail: resolved owner=', owner); } catch (e) {}
    if (!owner) return res.status(400).json({ connected: false, error: 'Missing owner or Authorization header' });

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error('Supabase service role not configured');

    // Create a server-side Supabase client using the service role key.
    // This avoids hand-crafting REST calls and avoids sending a non-JWT in Authorization.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false }
    });

    try { console.log('check-gmail: querying supabase via client for owner=', owner); } catch (e) {}
    const { data: rows, error, status } = await supabase
      .from('oauth_providers')
      .select('*')
      .eq('owner', owner)
      .eq('provider', 'google')
      .limit(1);

    if (error) {
      try { console.error('check-gmail: supabase client error=', String(error)); } catch (e) {}
      return res.status(200).json({ connected: false });
    }

    try { console.log('check-gmail: db rows count=', rows && rows.length ? rows.length : 0); } catch (e) {}
    try { console.log('check-gmail: db rows sample=', rows && rows.length ? rows[0] : null); } catch (e) {}
    return res.status(200).json({ connected: (rows && rows.length > 0), providers: rows });
  } catch (err) {
    console.error('check-gmail error', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ connected: false, error: String(err) }));
  }
}
