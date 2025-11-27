// ESM callback handler (alternate file) for Google OAuth
// Use global fetch available in Node 18+ (no node-fetch dependency required)
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  try {
    const code = req.query && (req.query.code || (req.url && req.url.match(/code=([^&]+)/) && req.url.match(/code=([^&]+)/)[1]));
    if (!code) {
      res.statusCode = 400;
      return res.end('Missing code');
    }

    // Allow a dedicated Gmail OAuth client (fall back to general client)
    const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_GMAIL_OAUTH_REDIRECT || process.env.GOOGLE_OAUTH_REDIRECT;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      console.error('token exchange failed', txt);
      res.statusCode = 500;
      return res.end('Token exchange failed');
    }

    const tokenJson = await tokenResp.json();
    try { console.log('auth-gmail-callback: token exchange succeeded; has_refresh=', !!tokenJson.refresh_token, 'has_id_token=', !!tokenJson.id_token); } catch (e) {}

    const state = req.query && req.query.state;
    let owner = null;
    if (state) {
      try {
        const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
        const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${state}` } });
        if (userResp.ok) {
          const userJson = await userResp.json();
          owner = userJson && userJson.id ? userJson.id : null;
        }
      } catch (e) {
        console.warn('Failed to resolve Supabase user from state token', e);
      }
    }
    try { console.log('auth-gmail-callback: state present=', !!state, 'resolved owner=', owner); } catch (e) {}

    // If we couldn't resolve the owner via Supabase `/auth/v1/user`, try
    // decoding the state value as an unsigned JWT and extract the `sub`
    // (user id) as a fallback. This helps in dev flows where the auth
    // service call may fail or the state is the user's supabase access
    // token.
    if (!owner && state) {
      try {
        const parts = state.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
          owner = payload && (payload.sub || payload.user_id || payload.sub) ? (payload.sub || payload.user_id) : owner;
          console.log('auth-gmail-callback: decoded owner from state jwt=', owner);
        }
      } catch (e) {
        console.warn('auth-gmail-callback: failed to decode state as jwt', e);
      }
    }

    // Extract a stable provider_user_id (the `sub` claim) from id_token when available
    let providerUserId = null;
    try {
      if (tokenJson.id_token) {
        const parts = tokenJson.id_token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
          providerUserId = payload && payload.sub ? payload.sub : null;
        }
      }
    } catch (e) {
      console.warn('Failed to decode id_token for provider_user_id', e);
    }

    // If we don't have a provider user id from the id_token, try the
    // userinfo endpoint using the access_token. This will return the
    // 'sub' field and other profile info which we persist for later.
    let userinfo = null;
    if (!providerUserId && tokenJson.access_token) {
      try {
        const uiResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` }
        });
        if (uiResp.ok) {
          userinfo = await uiResp.json();
          if (userinfo && userinfo.sub) providerUserId = userinfo.sub;
          try { console.log('auth-gmail-callback: fetched userinfo, sub=', userinfo && userinfo.sub); } catch (e) {}
        } else {
          try { console.warn('auth-gmail-callback: userinfo lookup failed', uiResp.status); } catch (e) {}
        }
      } catch (e) {
        console.warn('auth-gmail-callback: failed to fetch userinfo', e);
      }
    }

    // Persist token info. Some DB schemas may not include a `metadata`
    // column; to be compatible we merge any fetched `userinfo` into the
    // existing `raw` JSON field instead of writing a separate metadata
    // column.
    const rawPayload = Object.assign({}, tokenJson);
    if (userinfo) rawPayload.userinfo = userinfo;

    const providerRow = {
      id: randomUUID(),
      owner: owner,
      provider: 'google',
      provider_user_id: providerUserId || null,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      scope: tokenJson.scope,
      token_type: tokenJson.token_type,
      expires_at: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : null,
      raw: rawPayload
    };

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
      if (owner) providerRow.owner = owner;
      try {
        console.log('auth-gmail-callback: persisting provider row to', SUPABASE_URL, 'owner=', providerRow.owner);
        const postResp = await fetch(`${SUPABASE_URL}/rest/v1/oauth_providers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
            apikey: SUPABASE_SERVICE_ROLE,
            Prefer: 'return=representation'
          },
          body: JSON.stringify(providerRow)
        });
        const postText = await postResp.text().catch(() => '<no-body>');
        console.log('auth-gmail-callback: persist result status=', postResp.status, 'body=', postText.substring(0, 200));
      } catch (e) {
        console.error('auth-gmail-callback: failed to persist provider row', e);
      }
    } else {
      console.warn('Supabase service role not configured; skipping DB persist (scaffold).');
    }

    let redirectBack = process.env.POST_GMAIL_OAUTH_REDIRECT || process.env.POST_OAUTH_REDIRECT || '/';
    // Append a query flag so the frontend can detect the successful OAuth redirect
    const separator = redirectBack.includes('?') ? '&' : '?';
    // For dev convenience include the owner id so the client can verify without
    // requiring the browser to have a valid Supabase session.
    if (providerRow.owner) {
      redirectBack = `${redirectBack}${separator}owner=${encodeURIComponent(providerRow.owner)}&gmail_connected=1`;
    } else {
      redirectBack = `${redirectBack}${separator}gmail_connected=1`;
    }
    res.writeHead(302, { Location: redirectBack });
    res.end();
  } catch (err) {
    console.error('auth-gmail-callback error', err);
    res.statusCode = 500;
    res.end('Internal error');
  }
}
