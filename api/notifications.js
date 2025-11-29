const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  try {
    const mod = await import('node-fetch');
    return mod.default || mod;
  } catch (e) {
    throw new Error('fetch is not available. Install node-fetch or run on Node 18+');
  }
}

export default async function handler(req, res) {
  try {
    const method = req.method && req.method.toUpperCase();
    // Determine userId: prefer query param, then body.userId
    const userId = (req.query && req.query.userId) || (req.body && req.body.userId) || null;

    if (method === 'GET') {
      if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return res.status(500).json({ ok: false, error: 'Supabase not configured' });

      const limit = req.query && req.query.limit ? Number(req.query.limit) : 50;
      const url = `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=${limit}`;
      const _fetch = await getFetch();
      const resp = await _fetch(url, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        return res.status(502).json({ ok: false, error: 'Supabase query failed', details: txt });
      }
      const rows = await resp.json();
      return res.json(rows);
    }

    // POST to create a new notification (dev helper): path /api/notifications/create
    if (method === 'POST' && String(req.path || '').includes('/create')) {
      const body = req.body || {};
      console.log('notifications:create called, body=', JSON.stringify(body).slice(0,200));
      const targetUser = body.userId || null;
      const type = body.type || 'generic';
      const priority = body.priority || 'info';
      const title = body.title || '';
      const message = body.message || '';
      const url = body.url || null;
      const payload = body.payload || null;
      if (!targetUser) return res.status(400).json({ ok: false, error: 'userId required' });
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return res.status(500).json({ ok: false, error: 'Supabase not configured' });
      try {
        const insertUrl = `${SUPABASE_URL}/rest/v1/notifications`;
        const _fetch = await getFetch();
        const ins = await _fetch(insertUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify([{ user_id: targetUser, type, priority, title, message, url, payload }])
        });
        const respText = await ins.text().catch(() => '');
        if (!ins.ok) {
          console.warn('notifications:create supabase insert failed', ins.status, respText.slice(0,500));
          return res.status(502).json({ ok: false, error: 'Supabase insert failed', status: ins.status, details: respText });
        }
        // parse returned representation if present
        let inserted = null;
        try { inserted = JSON.parse(respText); } catch (e) { inserted = respText; }
        console.log('notifications:create inserted=', Array.isArray(inserted) ? (inserted[0] || inserted) : inserted);
        // best-effort forward to WS
        try {
          const WS_BROADCAST_URL = process.env.NOTIFY_WS_URL || 'http://localhost:3002/broadcast';
          const fwdBody = { userId: targetUser, notification: { id: Date.now().toString(), type, priority, title, message, url, payload, createdAt: new Date().toISOString() } };
          const fwdResp = await _fetch(WS_BROADCAST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fwdBody) });
          const fwdText = await fwdResp.text().catch(() => '');
          console.log('notifications:create forwarded to ws, status=', fwdResp.status, 'resp=', String(fwdText).slice(0,200));
        } catch (e) {}
        return res.json({ ok: true, inserted: Array.isArray(inserted) ? (inserted[0] || inserted) : inserted });
      } catch (e) {
        return res.status(500).json({ ok: false, error: String(e) });
      }
    }
    // POST to mark read: expected path like /api/notifications/:id/read
    if (method === 'POST' && String(req.path || '').includes('/read')) {
      // Extract id from req.path or req.query.id
      let notifId = null;
      if (req.path) {
        const m = String(req.path).match(/\/api\/notifications\/([^/]+)\/read/);
        if (m && m[1]) notifId = m[1];
      }
      if (!notifId && req.query && req.query.id) notifId = req.query.id;
      if (!notifId) return res.status(400).json({ ok: false, error: 'notification id required in path' });
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return res.status(500).json({ ok: false, error: 'Supabase not configured' });

      try {
        const patchUrl = `${SUPABASE_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(notifId)}`;
        const _fetch = await getFetch();
        const p = await _fetch(patchUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_read: true })
        });
        if (!p.ok) {
          const txt = await p.text().catch(() => '');
          return res.status(502).json({ ok: false, error: 'Supabase update failed', details: txt });
        }
        return res.json({ ok: true });
      } catch (e) {
        return res.status(500).json({ ok: false, error: String(e) });
      }
    }

    // POST to clear all notifications for user: path /api/notifications/clear
    if (method === 'POST' && String(req.path || '').includes('/clear')) {
      // Mark all notifications for the user as read (preserve history)
      if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return res.status(500).json({ ok: false, error: 'Supabase not configured' });
      try {
        const patchUrl = `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(userId)}`;
        const _fetch = await getFetch();
        const p = await _fetch(patchUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_read: true })
        });
        if (!p.ok) {
          const txt = await p.text().catch(() => '');
          return res.status(502).json({ ok: false, error: 'Supabase update failed', details: txt });
        }
        return res.json({ ok: true });
      } catch (e) {
        return res.status(500).json({ ok: false, error: String(e) });
      }
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('notifications handler error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
