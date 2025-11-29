// Server endpoint: sync Gmail for the authenticated user
// Expects the server to be able to lookup `oauth_providers` row for the owner and call Gmail API.

// Use global fetch available in Node 18+, no node-fetch dependency required
import { randomUUID } from 'crypto';

async function sendNotify(ownerId, payload) {
  try {
    const devPort = process.env.DEV_SERVER_PORT || process.env.PORT || '3001';
    const base = process.env.DEV_SERVER_BASE || process.env.VITE_DEV_SERVER_BASE || `http://localhost:${devPort}`;
    const url = `${base.replace(/\/$/, '')}/api/internal/notify`;
    const key = process.env.INTERNAL_API_KEY;
    if (!key) {
      console.warn('sendNotify: INTERNAL_API_KEY not set, skipping notify');
      return;
    }
    const body = { ...payload, userId: ownerId };
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.warn('sendNotify failed', e);
  }
}
async function getAccessTokenRow(ownerId) {
  // Use Supabase REST with service role to fetch oauth_providers for owner
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error('Supabase service role not configured');
  if (SUPABASE_URL.includes('your-supabase-url')) {
    throw new Error('Supabase URL appears to be the placeholder value. Please set VITE_SUPABASE_URL to your real Supabase URL (e.g. https://<project>.supabase.co)');
  }
  try {
    // Masked log for debug
    try { console.log('getAccessTokenRow: SUPABASE_URL=', SUPABASE_URL, 'SERVICE_ROLE_PRESENT=', !!SUPABASE_SERVICE_ROLE, 'owner=', ownerId); } catch (e) {}
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/oauth_providers?owner=eq.${ownerId}&provider=eq.google`, {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
    });
    if (!resp.ok) {
      let txt = '';
      try { txt = await resp.text(); } catch (e) { txt = String(e); }
      console.error('getAccessTokenRow: fetch failed', resp.status, resp.statusText, txt);
      throw new Error(`Failed to fetch oauth_providers: ${resp.status} ${resp.statusText}`);
    }
    const rows = await resp.json();
    return rows && rows[0];
  } catch (e) {
    console.error('getAccessTokenRow error', e);
    throw e;
  }
}

async function refreshAccessTokenIfNeeded(row) {
  if (!row) throw new Error('No oauth row');
  const now = new Date();
  if (row.expires_at && new Date(row.expires_at) > now) return row;
  if (!row.refresh_token) throw new Error('No refresh token available');

  // Use Gmail-specific client if configured
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token 
    })
  });
  if (!tokenResp.ok) {
    throw new Error('Failed to refresh token');
  }
  const tokenJson = await tokenResp.json();

  // Persist updated tokens
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  await fetch(`${SUPABASE_URL}/rest/v1/oauth_providers?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      apikey: SUPABASE_SERVICE_ROLE,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      access_token: tokenJson.access_token,
      expires_at: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : null,
      raw: tokenJson
    })
  });

  return { ...row, access_token: tokenJson.access_token, expires_at: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : null };
}

async function listMessages(accessToken, query) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.messages || [];
}

async function getMessage(accessToken, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error('Failed to fetch message');
  return await resp.json();
}

export default async function handler(req, res) {
  try {
    // Debug: surface incoming auth header and query for local troubleshooting
    try {
      console.log('sync-gmail: incoming headers ->', req.headers);
      console.log('sync-gmail: incoming query ->', req.query);
    } catch (e) {}
    // Resolve owner from Authorization Bearer <supabase_jwt> or query param `owner`
    let owner = null;
    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
        const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
        if (userResp.ok) {
          const userJson = await userResp.json();
          owner = userJson && userJson.id ? userJson.id : null;
        }
      } catch (e) {
        console.warn('Failed to resolve user from token', e);
      }
    }
    if (!owner) owner = req.query && req.query.owner;
    if (!owner) return res.status(400).json({ error: 'Missing owner or Authorization header', gotAuthorization: !!authHeader, hasQueryOwner: !!(req.query && req.query.owner) });

    let row = await getAccessTokenRow(owner);
    if (!row) return res.status(404).json({ error: 'No oauth provider found for user' });

    row = await refreshAccessTokenIfNeeded(row);
    const accessToken = row.access_token;
    // Ensure Supabase service role config is available for server-side persistence
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error('Supabase service role not configured');

    // Simple heuristic: look in SENT for common application keywords
    // First: process threads for any existing applications that have a thread_id (replies will be in the same thread)
    const appsWithThreads = [];
    try {
      console.log('sync-gmail: fetching applications for owner', owner);
      const appsRespTmp = await fetch(`${SUPABASE_URL}/rest/v1/applications?owner=eq.${owner}`, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
      });
      const appsTmp = appsRespTmp.ok ? await appsRespTmp.json() : [];
      for (const a of (appsTmp || [])) {
        if (a.thread_id) appsWithThreads.push(a);
      }
    } catch (e) {
      console.warn('sync-gmail: failed to fetch apps for thread processing', e);
    }

    const processedMessageIds = new Set();

    for (const app of appsWithThreads) {
      try {
        // Fetch the full thread; this returns all messages in the conversation
        const threadResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(app.thread_id)}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!threadResp.ok) {
          // thread may not exist or error; skip
          continue;
        }
          const threadJson = await threadResp.json();
          const messagesInThread = threadJson.messages || [];
          console.log('sync-gmail: thread fetched', app.thread_id, 'messagesCount=', messagesInThread.length);
        for (const full of messagesInThread) {
          try {
            if (!full || !full.id) continue;
            // Skip the original sent message (we tracked email_message_id on the app)
            if (String(full.id) === String(app.email_message_id)) { processedMessageIds.add(full.id); continue; }
            if (processedMessageIds.has(full.id)) continue;
            processedMessageIds.add(full.id);

            // Extract headers
            const headersArr = (full.payload && full.payload.headers) || [];
            const getHeader = (name) => {
              const h = headersArr.find(hh => String(hh.name).toLowerCase() === name.toLowerCase());
              return h ? h.value : null;
            };
            const from = getHeader('From');
            const to = getHeader('To');
            const subject = getHeader('Subject') || '';
            const receivedAt = full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null;
            const body = full.snippet || '';

            // Avoid duplicate persistence: check email_messages by id
            try {
              const existsResp = await fetch(`${SUPABASE_URL}/rest/v1/email_messages?id=eq.${encodeURIComponent(full.id)}`, {
                headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
              });
              if (existsResp.ok) {
                const rows = await existsResp.json();
                if (rows && rows.length) continue; // already persisted
              }
            } catch (e) { /* ignore check errors and attempt insert */ }

            // Persist email_message row
            const emailRow = {
              id: full.id,
              provider: 'google',
              message_id: full.id,
              thread_id: full.threadId || app.thread_id,
              from_address: from,
              to_address: to,
              subject: subject,
              body: body,
              headers: headersArr ? headersArr.reduce((acc, h) => ({ ...acc, [h.name]: h.value }), {}) : {},
              raw: full,
              received_at: receivedAt,
              owner: owner
            };
            try {
              console.log('sync-gmail: persisting email_message for message', full.id, 'thread', full.threadId || app.thread_id);
              await fetch(`${SUPABASE_URL}/rest/v1/email_messages`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify(emailRow)
              });
            } catch (e) { console.warn('sync-gmail: failed to persist email_message from thread', e); }

            // Determine new status from keywords
            const lower = (`${subject || ''} ${body || ''}`).toLowerCase();
            let newStatus = null;
            if (lower.includes('interview')) newStatus = 'Interviewing';
            else if (lower.includes('offer')) newStatus = 'Offer';
            else if (lower.includes('reject') || lower.includes('regret') || lower.includes('not selected')) newStatus = 'Rejected';

            if (newStatus) {
              try {
                console.log('sync-gmail: patching application', app.id, 'status->', newStatus);
                await fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${encodeURIComponent(app.id)}`, {
                  method: 'PATCH',
                  headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' , Prefer: 'return=representation'},
                  body: JSON.stringify({ status: newStatus, parsed_from_email: true, email_message_id: full.id, last_synced_at: new Date().toISOString() })
                });
                // create application event
                console.log('sync-gmail: creating status_change event for app', app.id);
                await fetch(`${SUPABASE_URL}/rest/v1/application_events`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                  body: JSON.stringify({ id: randomUUID(), application_id: app.id, owner: owner, type: 'status_change', payload: { from: app.status, to: newStatus, detected_from: 'email_thread' }, created_at: new Date().toISOString() })
                });
                try {
                  await sendNotify(owner, {
                    type: 'application_status_change',
                    priority: 'important',
                    title: 'Application status updated',
                    message: `Your application${app.job_title ? ' for ' + app.job_title : ''} is now ${newStatus}`,
                    url: `/applications/${app.id}`,
                    payload: { applicationId: app.id, from: app.status, to: newStatus }
                  });
                } catch (e) { console.warn('notify failed after thread status change', e); }
              } catch (e) {
                console.warn('sync-gmail: failed to update app status from thread message', e);
              }
            } else {
              // Generic email_received event
              try {
                console.log('sync-gmail: creating email_received event for app', app.id);
                await fetch(`${SUPABASE_URL}/rest/v1/application_events`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                  body: JSON.stringify({ id: randomUUID(), application_id: app.id, owner: owner, type: 'email_received', payload: { email_message_id: full.id, subject, snippet: full.snippet }, created_at: new Date().toISOString() })
                });
              } catch (e) { console.warn('sync-gmail: failed to persist application_event for thread message', e); }
            }
          } catch (e) {
            console.warn('sync-gmail: failed processing message in thread', e);
          }
        }
      } catch (e) {
        console.warn('sync-gmail: failed to fetch/process thread', app.thread_id, e);
      }
    }

    // After processing threads, fall back to scanning recent sent messages for any other signals
    const msgs = await listMessages(accessToken, 'in:sent (apply OR application OR "applied" OR "resume")');
    const results = [];

    // Fetch existing applications and jobs for the owner to attempt matching
    const appsResp = await fetch(`${SUPABASE_URL}/rest/v1/applications?owner=eq.${owner}`, {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
    });
    const apps = appsResp.ok ? await appsResp.json() : [];

    const jobsResp = await fetch(`${SUPABASE_URL}/rest/v1/jobs?select=*`, {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
    });
    const jobs = jobsResp.ok ? await jobsResp.json() : [];

    for (const m of (msgs || []).slice(0, 50)) {
      try {
        const full = await getMessage(accessToken, m.id);

        // Extract headers
        const headersArr = (full.payload && full.payload.headers) || [];
        const getHeader = (name) => {
          const h = headersArr.find(hh => String(hh.name).toLowerCase() === name.toLowerCase());
          return h ? h.value : null;
        };
        const from = getHeader('From');
        const to = getHeader('To');
        const subject = getHeader('Subject') || '';
        const receivedAt = full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null;

        // Use snippet as body fallback (decoding parts is more involved)
        const body = full.snippet || '';

        // Avoid duplicate persistence: check email_messages by id
        try {
          const existsResp = await fetch(`${SUPABASE_URL}/rest/v1/email_messages?id=eq.${encodeURIComponent(full.id)}`, {
            headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
          });
          if (existsResp.ok) {
            const rows = await existsResp.json();
            if (rows && rows.length) {
              // Already persisted; skip processing this message to avoid duplicates
              continue;
            }
          }
        } catch (e) {
          // ignore check errors and attempt insert
        }

        // Persist email_message row
        const emailRow = {
          id: full.id,
          provider: 'google',
          message_id: full.id,
          thread_id: full.threadId,
          from_address: from,
          to_address: to,
          subject: subject,
          body: body,
          headers: headersArr ? headersArr.reduce((acc, h) => ({ ...acc, [h.name]: h.value }), {}) : {},
          raw: full,
          received_at: receivedAt,
          owner: owner
        };

        const resp = await fetch(`${SUPABASE_URL}/rest/v1/email_messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
            apikey: SUPABASE_SERVICE_ROLE,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify(emailRow)
        });
        let created = null;
        if (resp.ok) created = (await resp.json())[0];

        // Attempt to match this email to an existing application or job
        let matchedApp = null;

        // Fast path: match by thread_id if available (will match replies in same conversation)
        try {
          if (full.threadId) {
            const byThread = apps.find(a => (a.thread_id && String(a.thread_id) === String(full.threadId)) || (a.email_message_id && String(a.email_message_id) === String(full.threadId)));
            if (byThread) { matchedApp = byThread; console.log('sync-gmail: matched app by thread', matchedApp.id, 'for message', full.id); }
          }
        } catch (e) { /* ignore */ }

        // If not matched by thread, fall through to other heuristics
        if (!matchedApp) {
          // continue with other matching heuristics below
        }
        const searchText = `${subject || ''} ${body || ''}`.toLowerCase();

        // 1) Try matching by job url present in apps.raw or jobs
        const urlRegex = /https?:\/\/[^\s)]+/g;
        const foundUrls = (full.snippet || '').match(urlRegex) || [];

        if (foundUrls.length) {
          for (const u of foundUrls) {
            // check jobs
            const j = jobs.find(jj => jj.url && jj.url.toLowerCase().includes(u.toLowerCase()));
            if (j) {
              matchedApp = apps.find(a => a.job_id === j.id) || matchedApp;
              if (matchedApp) break;
            }
            // check apps raw
            const appByUrl = apps.find(a => {
              try {
                const raw = a.raw || a.data || {};
                const maybeUrl = raw?.job?.url || raw?.url || '';
                return maybeUrl && String(maybeUrl).toLowerCase().includes(u.toLowerCase());
              } catch (e) { return false; }
            });
            if (appByUrl) { matchedApp = appByUrl; break; }
          }
        }

        // 2) If not matched, try title/company fuzzy includes
        if (!matchedApp) {
          for (const a of apps) {
            const jobTitle = (a.raw && a.raw.job && a.raw.job.title) || a.job_title || '';
            const company = (a.raw && a.raw.job && a.raw.job.company) || a.company || '';
            if (!jobTitle && !company) continue;
            const jt = String(jobTitle).toLowerCase();
            const co = String(company).toLowerCase();
            if ((jt && searchText.includes(jt)) || (co && searchText.includes(co))) {
              matchedApp = a; break;
            }
          }
        }

        // 3) fallback: check recipient email matching job/company domain
        if (!matchedApp && to) {
          for (const a of apps) {
            const jobEmail = (a.raw && a.raw.job && a.raw.job.contact_email) || a.contact_email || '';
            if (jobEmail && String(to).toLowerCase().includes(String(jobEmail).toLowerCase())) { matchedApp = a; break; }
          }
        }

        // If matched, update application row and add status event if applicable
        if (matchedApp) {
          // decide if status bump needed
          const lower = searchText;
          let newStatus = null;
          if (lower.includes('interview')) newStatus = 'Interviewing';
          else if (lower.includes('offer')) newStatus = 'Offer';
          else if (lower.includes('reject') || lower.includes('regret') || lower.includes('not selected')) newStatus = 'Rejected';

          const updatePayload = { parsed_from_email: true, email_message_id: full.id, last_synced_at: new Date().toISOString() };
          if (newStatus) updatePayload.status = newStatus;

          console.log('sync-gmail: updating matched application', matchedApp.id, 'from message', full.id, 'newStatus=', newStatus);
          await fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${matchedApp.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(updatePayload)
          });

          // application event: email_received
          const eventRowEmail = {
            id: randomUUID(),
            application_id: matchedApp.id,
            owner: owner,
            type: 'email_received',
            payload: { email_message_id: full.id, subject, snippet: full.snippet }
          };
          await fetch(`${SUPABASE_URL}/rest/v1/application_events`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(eventRowEmail)
          });

          if (newStatus) {
            const eventRowStatus = {
              id: randomUUID(),
              application_id: matchedApp.id,
              owner: owner,
              type: 'status_change',
              payload: { from: matchedApp.status, to: newStatus, reason: 'Detected from email' }
            };
            await fetch(`${SUPABASE_URL}/rest/v1/application_events`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify(eventRowStatus)
              });
            try {
              await sendNotify(owner, {
                type: 'application_status_change',
                priority: 'important',
                title: 'Application status updated',
                message: `Your application${matchedApp && matchedApp.job_title ? ' for ' + matchedApp.job_title : ''} is now ${newStatus}`,
                url: `/applications/${matchedApp.id}`,
                payload: { applicationId: matchedApp.id, from: matchedApp.status, to: newStatus }
              });
            } catch (e) { console.warn('notify failed after matchedApp status change', e); }
          }
        } else {
          // No match: create a generic event referencing the email only
          const eventRow = {
            id: randomUUID(),
            application_id: null,
            owner: owner,
            type: 'email_received',
            payload: { email_message_id: full.id, subject, snippet: full.snippet }
          };
          await fetch(`${SUPABASE_URL}/rest/v1/application_events`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(eventRow)
          });
        }

        results.push({ message: full, emailRow: created, matchedAppId: matchedApp ? matchedApp.id : null });
      } catch (e) {
        console.warn('Failed to process message', m.id, e);
      }
    }

    return res.status(200).json({ found: results.length, items: results.slice(0, 10) });
  } catch (err) {
    console.error('sync-gmail error', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
};
