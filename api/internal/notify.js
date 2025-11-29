const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WS_BROADCAST_URL = process.env.NOTIFY_WS_URL || 'http://localhost:3002/broadcast';

async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  try {
    const mod = await import('node-fetch');
    return mod.default || mod;
  } catch (e) {
    throw new Error('fetch is not available. Install node-fetch or run on Node 18+');
  }
}

export default async function notifyHandler(req, res) {
  // Require server-to-server secret in Authorization header
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!auth || auth !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const { userId, type, priority = 'info', title, message, url: link, payload } = body;
  if (!userId || !type || !title) return res.status(400).json({ ok: false, error: 'missing fields' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.warn('Supabase not configured for server notify');
  }

  // Insert into Supabase via REST
  try {
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
      const _fetch = await getFetch();
      const insertResp = await _fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
          apikey: SUPABASE_SERVICE_ROLE,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{ user_id: userId, type, priority, title, message, url: link || null, payload: payload || null }])
      });
      if (!insertResp.ok) {
        const txt = await insertResp.text().catch(() => '');
        console.warn('Supabase insert failed', insertResp.status, txt);
      }
    }
  } catch (e) {
    console.warn('Failed to insert notification into Supabase', e && e.message);
  }

  // Broadcast to WS server (best-effort)
  try {
    const _fetch = await getFetch();
    const resp = await _fetch(WS_BROADCAST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, notification: { id: Date.now().toString(), type, priority, title, message, url: link, payload, createdAt: new Date().toISOString() } })
    });
    // ignore resp body
  } catch (e) {
    console.warn('Failed to forward to ws server', e && e.message);
  }

  return res.json({ ok: true });
}
