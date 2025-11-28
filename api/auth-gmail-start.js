// Server endpoint: start Google OAuth for Gmail access
// Redirects the user to Google's OAuth consent screen.

import querystring from 'querystring';

// Use env vars: GOOGLE_CLIENT_ID, GOOGLE_OAUTH_REDIRECT
export default async function handler(req, res) {
  try {
    // Prefer a dedicated Gmail OAuth client if configured, otherwise fall back
    const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_GMAIL_OAUTH_REDIRECT || process.env.GOOGLE_OAUTH_REDIRECT; // e.g. https://yourapp.com/api/auth-gmail-callback
    if (!clientId || !redirectUri) {
      res.statusCode = 500;
      return res.end('Google OAuth not configured (missing GOOGLE_GMAIL_CLIENT_ID/GOOGLE_CLIENT_ID or GOOGLE_GMAIL_OAUTH_REDIRECT/GOOGLE_OAUTH_REDIRECT)');
    }

    // Preserve `state` from the client (e.g., Supabase JWT) so callback can resolve the owner
    // Accept either `state` query param or `state` in request body
    const state = (req.query && req.query.state) || (req.body && req.body.state) || '';
    const params = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      // Request OpenID scopes so we can obtain a stable user id (id_token/userinfo)
      // Include send scope so we can send emails on behalf of the user
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: state
    };

    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + querystring.stringify(params);
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    console.error('auth-gmail-start error', err);
    res.statusCode = 500;
    res.end('Internal error');
  }
}
