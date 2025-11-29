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

// Server endpoint: send an application email using a connected Gmail account
// Expects POST JSON: { job, resumeId, senderAccountId, subject, bodyHtml, toEmail }
// Uses Supabase REST with service role to fetch oauth_providers and resumes, refresh tokens,
// generates PDF if needed (calls /api/render-pdf), downloads signed PDF URL, builds RFC822 MIME
// message with attachment and sends via Gmail API.

async function resolveOwnerFromToken(token) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return null;
    const user = await resp.json();
    return user && user.id ? user.id : null;
  } catch (err) { return null; }
}

async function getOauthRowById(id) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error('Supabase not configured');
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/oauth_providers?id=eq.${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
  });
  if (!resp.ok) throw new Error('Failed to fetch oauth provider');
  const rows = await resp.json();
  return (rows && rows[0]) || null;
}

async function refreshAccessTokenIfNeeded(row) {
  if (!row) throw new Error('No oauth row');
  const now = new Date();
  if (row.expires_at && new Date(row.expires_at) > now) return row;
  if (!row.refresh_token) throw new Error('No refresh token available');

  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: row.refresh_token })
  });
  if (!tokenResp.ok) {
    const txt = await tokenResp.text().catch(() => '');
    throw new Error('Failed to refresh token: ' + txt);
  }
  const tokenJson = await tokenResp.json();

  // Persist updated tokens
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  await fetch(`${SUPABASE_URL}/rest/v1/oauth_providers?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: tokenJson.access_token, expires_at: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : null, raw: tokenJson })
  });

  return { ...row, access_token: tokenJson.access_token, expires_at: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : null };
}

async function ensureGeneratedPdfForResume(resumeId) {
  // Prefer calling the render-pdf handler in-process (avoids HTTP/body parsing issues in local dev)
  try {
    try {
      const mod = await import('./renderPdf.js');
      const handler = mod && mod.default ? mod.default : null;
      if (typeof handler === 'function') {
        // fake request/response used by dev-server handlers
        const fakeReq = { method: 'POST', headers: { 'content-type': 'application/json' }, body: { id: resumeId } };
        let captured = null;
        const fakeRes = {
          status(code) { this._status = code; return this; },
          json(obj) { captured = obj; return; },
          setHeader() {},
          end() { return; }
        };
        await handler(fakeReq, fakeRes);
        if (captured && captured.url) return captured.url;
      }
    } catch (e) {
      console.warn('send-application: in-process renderPdf call failed', String(e));
    }

    // Fallback: call existing render-pdf endpoint via HTTP
    const devPort = process.env.DEV_SERVER_PORT || process.env.PORT || '3001';
    const base = process.env.DEV_SERVER_BASE || process.env.VITE_DEV_SERVER_BASE || `http://localhost:${devPort}`;
    const url = `${base.replace(/\/$/, '')}/api/render-pdf`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resumeId })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error('send-application: render-pdf failed', resp.status, txt);
      throw new Error(`render-pdf returned ${resp.status} ${txt}`);
    }
    const json = await resp.json();
    return json && json.url ? json.url : null;
  } catch (e) {
    console.error('send-application: ensureGeneratedPdfForResume error', String(e));
    throw e;
  }
}

function makeMimeMessage({ from, to, subject, bodyHtml, attachmentBuffer, attachmentFilename }) {
  const boundary = '----=_slate_' + Date.now();
  const nl = '\r\n';
  const parts = [];

  parts.push(`From: ${from}`);
  parts.push(`To: ${to}`);
  parts.push(`Subject: ${subject}`);
  parts.push('MIME-Version: 1.0');
  parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  parts.push('');
  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/html; charset="UTF-8"');
  parts.push('Content-Transfer-Encoding: 7bit');
  parts.push('');
  parts.push(bodyHtml || '');
  parts.push('');
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: application/pdf; name="${attachmentFilename}"`);
  parts.push('Content-Transfer-Encoding: base64');
  parts.push(`Content-Disposition: attachment; filename="${attachmentFilename}"`);
  parts.push('');
  parts.push(attachmentBuffer.toString('base64'));
  parts.push('');
  parts.push(`--${boundary}--`);

  const message = parts.join(nl);
  // Gmail expects base64url without padding
  const b64 = Buffer.from(message, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || (req.url ? (await (await import('url')).parse(req.url, true).query) : {});
    const { job, resumeId, senderAccountId, subject, bodyHtml, toEmail } = body;
    if (!job || !resumeId || !senderAccountId) return res.status(400).json({ error: 'Missing required fields' });

    // Resolve owner from Authorization bearer token when present (best-effort)
    let owner = null;
    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      owner = await resolveOwnerFromToken(token);
    }

    console.log('send-application: incoming', { jobId: job && job.id, resumeId, senderAccountId, owner });

    // Fetch oauth provider row
    const row = await getOauthRowById(senderAccountId);
    if (!row) return res.status(404).json({ error: 'Sender account not found' });
    if (owner && row.owner && owner !== row.owner) return res.status(403).json({ error: 'Sender account does not belong to owner' });

    // Refresh token if needed
    const upRow = await refreshAccessTokenIfNeeded(row);
    const accessToken = upRow.access_token;

    // Debug: log oauth row info (avoid printing secrets)
    try {
      console.log('send-application: oauth row after refresh', { id: upRow.id, provider: upRow.provider, provider_user_id: upRow.provider_user_id, owner: upRow.owner });
    } catch (e) { /* ignore logging errors */ }

    // Debug: call Gmail profile to confirm which account access token belongs to
    try {
      const profileResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (profileResp.ok) {
        const profileJson = await profileResp.json();
        console.log('send-application: gmail profile', { emailAddress: profileJson.emailAddress, messagesTotal: profileJson.messagesTotal });
      } else {
        const txt = await profileResp.text().catch(() => '');
        console.warn('send-application: gmail profile fetch failed', profileResp.status, txt);
      }
    } catch (e) {
      console.warn('send-application: error fetching gmail profile', String(e));
    }

    // Ensure resume PDF exists and get signed URL
    let signedUrl = null;
    try { signedUrl = await ensureGeneratedPdfForResume(resumeId); } catch (e) { signedUrl = null; }
    if (!signedUrl) {
      return res.status(500).json({ error: 'Failed to generate resume PDF' });
    }

    // Download PDF from signed URL
    const pdfResp = await fetch(signedUrl);
    if (!pdfResp.ok) throw new Error('Failed to download generated PDF');
    const arrayBuf = await pdfResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // Build RFC822 MIME message with attachment
    const fromAddr = (upRow && upRow.raw && upRow.raw.userinfo && upRow.raw.userinfo.email) || (upRow && upRow.raw && upRow.raw.email) || (upRow && upRow.provider_user_id) || 'me';
    const toAddr = (toEmail && String(toEmail).trim()) || (job && (job.contact_email || job.apply_email || job.email)) || null;
    // Basic validation: must look like an email address
    const looksLikeEmail = toAddr && /\S+@\S+\.\S+/.test(String(toAddr));
    if (!looksLikeEmail) {
      console.warn('send-application: missing recipient email for job', { jobId: job && job.id, url: job && job.url });
      return res.status(400).json({ error: 'No recipient email found for this job', applyUrl: (job && (job.url || job.apply_url || job.link)) || null });
    }
    const finalSubject = subject || `Application: ${job.title} at ${job.company}`;
    const finalBodyHtml = bodyHtml || `<p>Hi,</p><p>Please find my resume for the ${job.title} role at ${job.company}.</p><p>Best regards,</p>`;

    const raw = makeMimeMessage({ from: fromAddr, to: toAddr, subject: finalSubject, bodyHtml: finalBodyHtml, attachmentBuffer: buffer, attachmentFilename: `${resumeId}.pdf` });

    // Send via Gmail API
    console.log('send-application: sending email', { fromAddr, toAddr, subject: finalSubject });
    const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    });
    if (!sendResp.ok) {
      const txt = await sendResp.text().catch(() => '');
      console.error('gmail send failed', sendResp.status, txt);
      return res.status(500).json({ error: 'Failed to send email', details: txt });
    }
    const sentJson = await sendResp.json();
    console.log('send-application: gmail sent', { messageId: sentJson && sentJson.id });
    try { console.log('send-application: gmail send response (trimmed)', JSON.stringify(sentJson).slice(0, 200)); } catch (e) {}

    // Debug: fetch message metadata to inspect labelIds (confirm presence in SENT)
    try {
      if (sentJson && sentJson.id) {
        const msgResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(sentJson.id)}?format=metadata`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (msgResp.ok) {
          const msgJson = await msgResp.json();
          try { console.log('send-application: message metadata', { id: msgJson.id, labelIds: msgJson.labelIds, snippet: (msgJson.snippet || '').slice(0,200) }); } catch (e) {}
        } else {
          const txt = await msgResp.text().catch(() => '');
          console.warn('send-application: fetch message metadata failed', msgResp.status, txt);
        }
      }
    } catch (e) {
      console.warn('send-application: error fetching message metadata', String(e));
    }

    // Persist email_message and application rows using Supabase service role
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
      // email_messages
      const emailRow = {
        id: sentJson.id || randomUUID(),
        provider: 'google',
        message_id: sentJson.id || null,
        thread_id: sentJson.threadId || null,
        from_address: fromAddr,
        to_address: toAddr,
        subject: finalSubject,
        body: finalBodyHtml,
        raw: sentJson,
        received_at: new Date().toISOString(),
        owner: owner || row.owner || null
      };
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/email_messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify(emailRow)
        });
      } catch (e) { console.warn('Failed to persist email_message', e); }

      // Create application row (include thread_id so replies can be matched)
      const appId = randomUUID();
      let createdApp = null;
      const appRow = {
        id: appId,
        job_id: job.id || null,
        resume_id: resumeId,
        status: 'Applied',
        applied_date: new Date().toISOString(),
        data: { job, resumeId, senderAccountId },
        email_message_id: sentJson.id || null,
        thread_id: sentJson.threadId || null,
        owner: owner || row.owner || null
      };
      try {
        // Insert application row and return representation
        let appResp = await fetch(`${SUPABASE_URL}/rest/v1/applications`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify(appRow)
        });
        if (!appResp.ok) {
          const txt = await appResp.text().catch(() => '');
          console.warn('send-application: failed to persist application', appResp.status, txt);
          // If failure due to missing 'thread_id' column in DB, retry without thread_id for backward-compat
          if (String(txt).toLowerCase().includes('thread_id') || String(txt).includes("Could not find the 'thread_id' column")) {
            try {
              const fallback = { ...appRow };
              delete fallback.thread_id;
              appResp = await fetch(`${SUPABASE_URL}/rest/v1/applications`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify(fallback)
              });
              if (appResp.ok) {
                try { createdApp = await appResp.json(); } catch (e) { createdApp = null; }
              } else {
                const txt2 = await appResp.text().catch(() => '');
                console.warn('send-application: fallback persist also failed', appResp.status, txt2);
              }
            } catch (e) {
              console.warn('send-application: fallback persist error', e);
            }
          }
        } else {
          try { createdApp = await appResp.json(); } catch (e) { createdApp = null; }
        }

        // Create application event
        const eventRow = { id: randomUUID(), application_id: appId, owner: owner || row.owner || null, type: 'sent', payload: { message_id: sentJson.id, subject: finalSubject }, created_at: new Date().toISOString() };
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/application_events`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(eventRow)
          });
          try {
            const notifyOwner = owner || row.owner || null;
            await sendNotify(notifyOwner, {
              type: 'application_sent',
              priority: 'info',
              title: 'Application sent',
              message: `Your application${job && job.title ? ' for ' + job.title : ''} was sent successfully.`,
              url: `/applications/${appId}`,
              payload: { applicationId: appId, messageId: sentJson.id }
            });
          } catch (e) { console.warn('send-application: notify failed', e); }
        } catch (e) {
          console.warn('send-application: failed to persist application_event', e);
        }
      } catch (e) {
        console.warn('Failed to persist application or event', e);
      }
    }

    return res.status(200).json({ success: true, sent: sentJson, application: (typeof createdApp !== 'undefined' ? createdApp : null) });
  } catch (err) {
    console.error('send-application error', err);
    return res.status(500).json({ error: String(err) });
  }
}
