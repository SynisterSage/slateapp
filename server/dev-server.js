import http from 'http';
import url from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import jobsHandler from '../api/jobs.js';

// Load environment variables from .env.local (preferred) or .env so handlers see keys
const envPathLocal = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');
try {
  const result = dotenv.config({ path: envPathLocal });
  if (result.error) {
    // fallback to .env
    dotenv.config({ path: envPath });
  }
} catch (e) {
  // ignore dotenv errors; process.env may already be set by the caller
}

const PORT = process.env.DEV_SERVER_PORT ? parseInt(process.env.DEV_SERVER_PORT) : 3001;

function makeResNode(originalRes) {
  return {
    status(code) {
      this._status = code;
      return this;
    },
    setHeader(k, v) {
      originalRes.setHeader(k, v);
    },
    writeHead(status, headers) {
      // mirror node's writeHead for handlers that perform redirects
      try {
        if (headers) originalRes.writeHead(status, headers);
        else originalRes.statusCode = status;
      } catch (e) {
        // some environments may not support writeHead on the original response
        originalRes.statusCode = status;
        if (headers) {
          Object.entries(headers).forEach(([k, v]) => originalRes.setHeader(k, v));
        }
      }
    },
    end(body) {
      if (!originalRes.headersSent && this._status) originalRes.statusCode = this._status;
      if (body !== undefined) originalRes.end(body);
      else originalRes.end();
    },
    json(obj) {
      if (!originalRes.headersSent) {
        // Add permissive CORS headers for local dev to allow Authorization header in requests
        originalRes.setHeader('Access-Control-Allow-Origin', '*');
        originalRes.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        originalRes.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        originalRes.setHeader('Content-Type', 'application/json');
        originalRes.statusCode = this._status || 200;
      }
      originalRes.end(JSON.stringify(obj));
    }
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '', true);

  // Quick CORS preflight handling for /api/* requests from the frontend (Authorization header)
  if (parsed.pathname && parsed.pathname.startsWith('/api/') && req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.statusCode = 204;
    res.end();
    return;
  }

  // Read and parse JSON body for non-GET requests so handlers can access req.body
  // NOTE: don't pre-read binary uploads (e.g., PDF file uploads) — only read when content-type is JSON/text
  let bodyText = '';
  const contentType = (req.headers && req.headers['content-type']) ? String(req.headers['content-type']) : '';
  const shouldReadBody = req.method && req.method.toUpperCase() !== 'GET' && (contentType.includes('application/json') || contentType.includes('application/x-www-form-urlencoded') || contentType.startsWith('text/'));
  if (shouldReadBody) {
    try {
      bodyText = await new Promise((resolve, reject) => {
        let acc = '';
        req.on('data', chunk => acc += chunk);
        req.on('end', () => resolve(acc));
        req.on('error', err => reject(err));
      });
    } catch (e) {
      console.warn('Failed to read request body in dev-server', e);
    }
  }

    if (parsed.pathname && parsed.pathname.startsWith('/api/')) {
    const fakeReq = { query: parsed.query, method: req.method, headers: req.headers, body: null };
    if (bodyText) {
      try { fakeReq.body = JSON.parse(bodyText); } catch (e) { fakeReq.body = bodyText; }
    }
    const fakeRes = makeResNode(res);
    try {
      if (parsed.pathname === '/api/tune') {
        const tuneHandler = (await import('../api/tune.js')).default;
        console.log('dev-server: routing /api/tune to tune handler');
        await tuneHandler(fakeReq, fakeRes);
      } else
      // Route /api/parse-resume and /api/upload-resume to their handlers; otherwise to jobsHandler
      if (parsed.pathname === '/api/parse-resume') {
        const parseHandler = (await import('../api/parseResume.js')).default;
        await parseHandler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/analyze') {
        // Use canonical analyze handler (do not prefer _fixed versions)
        const analyzeHandler = (await import('../api/analyze.js')).default;
        await analyzeHandler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/suggest') {
        // Use canonical suggest handler (do not prefer _fixed versions)
        const suggestHandler = (await import('../api/suggest.js')).default;
        await suggestHandler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/update-resume') {
        const updateHandler = (await import('../api/updateResume.js')).default;
        // attach parsed.query onto the original request object if needed
        try { req.query = parsed.query; } catch (e) {}
        await updateHandler(req, fakeRes);
      } else if (parsed.pathname === '/api/get-resume') {
        const getHandler = (await import('../api/getResume.js')).default;
        await getHandler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/upload-resume') {
        const uploadHandler = (await import('../api/uploadResume.js')).default;
        // Ensure the original req carries the parsed query so the upload handler can access resumeId/fileName
        try {
          // attach parsed.query onto the original request object
          req.query = parsed.query;
        } catch (e) {
          // ignore
        }
        await uploadHandler(req, fakeRes);
      } else if (parsed.pathname === '/api/list-resumes') {
        const listHandler = (await import('../api/listResumes.js')).default;
        await listHandler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/delete-resume') {
        const deleteHandler = (await import('../api/deleteResume.js')).default;
        // attach parsed.query onto the original request object
        try { req.query = parsed.query; } catch (e) {}
        await deleteHandler(req, fakeRes);
      } else if (parsed.pathname === '/api/render-pdf') {
        const renderHandler = (await import('../api/renderPdf.js')).default;
        // attach parsed.query onto the original request object
        try { req.query = parsed.query; } catch (e) {}
        await renderHandler(req, fakeRes);
      } else if (parsed.pathname === '/api/auth-gmail-start') {
        const handler = (await import('../api/auth-gmail-start.js')).default || (await import('../api/auth-gmail-start.js'));
        await handler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/auth-gmail-callback') {
        // Use .mjs callback handler to avoid mixed CJS/ESM issues in local dev
        const handler = (await import('../api/auth-gmail-callback.mjs')).default || (await import('../api/auth-gmail-callback.mjs'));
        await handler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/sync-gmail') {
        // Log headers for debugging Authorization forwarding
        try { console.log('dev-server: /api/sync-gmail headers ->', req.headers); } catch (e) {}
        const handler = (await import('../api/sync-gmail.js')).default || (await import('../api/sync-gmail.js'));
        await handler(fakeReq, fakeRes);
      } else if (parsed.pathname === '/api/ats-debug') {
        // Dev-only diagnostics for ATS aggregator (lever/greenhouse)
        try {
          // Use createRequire to load the CommonJS atsAggregator from this ESM module
          const require = createRequire(import.meta.url);
          const agg = require('../server/atsAggregator');
          const diagFn = (agg && agg.fetchATSDiagnostics) || (agg && agg.default && agg.default.fetchATSDiagnostics);
          if (typeof diagFn === 'function') {
            console.log('dev-server: running ATS diagnostics');
            const diag = await diagFn();
            return fakeRes.json({ ok: true, diagnostics: diag });
          }
          return fakeRes.json({ ok: false, error: 'ATS diagnostics not available' });
        } catch (e) {
          console.error('dev-server: ats-debug failed', e);
          return fakeRes.json({ ok: false, error: String(e) });
        }
      } else if (parsed.pathname === '/api/check-gmail') {
        const handler = (await import('../api/check-gmail.js')).default || (await import('../api/check-gmail.js'));
        await handler(fakeReq, fakeRes);
        } else if (parsed.pathname === '/api/support') {
          try {
            const handler = (await import('../api/support.js')).default || (await import('../api/support.js'));
            await handler(fakeReq, fakeRes);
          } catch (e) {
            console.error('dev-server: routing /api/support failed', e);
            fakeRes.status(500).json({ error: String(e) });
          }
        } else if (parsed.pathname === '/api/internal/notify') {
          // Internal notify endpoint used by server-side processes to create notifications
          try {
            const handler = (await import('../api/internal/notify.js')).default || (await import('../api/internal/notify.js'));
            await handler(fakeReq, fakeRes);
          } catch (e) {
            console.error('dev-server: routing /api/internal/notify failed', e);
            fakeRes.status(500).json({ error: String(e) });
          }
        } else if (parsed.pathname === '/api/list-gmail-accounts') {
        const handler = (await import('../api/list-gmail-accounts.js')).default || (await import('../api/list-gmail-accounts.js'));
        await handler(fakeReq, fakeRes);
        } else if (parsed.pathname === '/api/notifications') {
          try {
            const handler = (await import('../api/notifications.js')).default || (await import('../api/notifications.js'));
            // attach parsed.query
            try { fakeReq.query = parsed.query; fakeReq.path = parsed.pathname; } catch (e) {}
            await handler(fakeReq, fakeRes);
          } catch (e) {
            console.error('dev-server: routing /api/notifications failed', e);
            fakeRes.status(500).json({ error: String(e) });
          }
        } else if (parsed.pathname && parsed.pathname.startsWith('/api/notifications/')) {
          try {
            const handler = (await import('../api/notifications.js')).default || (await import('../api/notifications.js'));
            try { fakeReq.query = parsed.query; fakeReq.path = parsed.pathname; } catch (e) {}
            await handler(fakeReq, fakeRes);
          } catch (e) {
            console.error('dev-server: routing /api/notifications/:id failed', e);
            fakeRes.status(500).json({ error: String(e) });
          }
      } else if (parsed.pathname === '/api/extract-job-emails') {
        try {
          const handler = (await import('../api/extract-job-emails.js')).default || (await import('../api/extract-job-emails.js'));
          await handler(fakeReq, fakeRes);
        } catch (e) {
          console.error('dev-server: failed to route /api/extract-job-emails', e);
          fakeRes.status(500).json({ error: String(e) });
        }
      } else if (parsed.pathname === '/api/send-application') {
        try {
          const handler = (await import('../api/send-application.js')).default || (await import('../api/send-application.js'));
          await handler(fakeReq, fakeRes);
        } catch (e) {
          console.error('dev-server: failed to route /api/send-application', e);
          fakeRes.status(500).json({ error: String(e) });
        }
      } else if (parsed.pathname === '/api/remove-gmail-account') {
        const handler = (await import('../api/remove-gmail-account.js')).default || (await import('../api/remove-gmail-account.js'));
        await handler(fakeReq, fakeRes);
      } else {
        await jobsHandler(fakeReq, fakeRes);
      }
    } catch (err) {
      console.error('dev-server handler error', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // For any non-/api requests, reply with simple message
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Dev API server running. Use /api/jobs?q=...');
});

server.listen(PORT, () => {
  console.log(`Dev API server listening on http://localhost:${PORT}`);
});

// Optional background poll: run /api/sync-gmail for connected owners on an interval
// Enable via env var `DEV_GMAIL_POLL=true`. Interval can be configured with `DEV_GMAIL_POLL_MS` (default 5 minutes).
if (process.env.DEV_GMAIL_POLL === 'true') {
  const POLL_MS = process.env.DEV_GMAIL_POLL_MS ? parseInt(process.env.DEV_GMAIL_POLL_MS) : 5 * 60 * 1000;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.warn('DEV_GMAIL_POLL enabled but Supabase service role not configured; disabling poll');
  } else {
    console.log('DEV_GMAIL_POLL enabled. Poll interval (ms)=', POLL_MS);
    // Poll function
    const runPoll = async () => {
      try {
        console.log('dev-server: gmail poll: fetching connected oauth_providers');
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/oauth_providers?provider=eq.google`, {
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, apikey: SUPABASE_SERVICE_ROLE }
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          console.warn('dev-server: gmail poll: failed to fetch oauth_providers', resp.status, txt);
          return;
        }
        const rows = await resp.json();
        const owners = Array.from(new Set((rows || []).map(r => r.owner).filter(Boolean)));
        if (!owners.length) {
          console.log('dev-server: gmail poll: no connected owners found');
          return;
        }

        // Import handler once per poll
        let syncHandler = null;
        try {
          syncHandler = (await import('../api/sync-gmail.js')).default || (await import('../api/sync-gmail.js'));
        } catch (e) {
          console.error('dev-server: gmail poll: failed to import sync handler', e);
          return;
        }

        for (const owner of owners) {
          try {
            console.log('dev-server: gmail poll: invoking sync for owner', owner);
            const fakeReq = { query: { owner }, headers: {} };
            const fakeRes = makeResNode({
              headersSent: false,
              setHeader: () => {},
              end: () => {}
            });
            // call handler and don't await long; allow handler to run
            await syncHandler(fakeReq, fakeRes);
          } catch (e) {
            console.warn('dev-server: gmail poll: sync failed for owner', owner, e);
          }
        }
      } catch (e) {
        console.error('dev-server: gmail poll failed', e);
      }
    };

    // Run immediately then schedule
    runPoll();
    setInterval(runPoll, POLL_MS);
  }
}
