import http from 'http';
import url from 'url';
import path from 'path';
import dotenv from 'dotenv';
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
    json(obj) {
      if (!originalRes.headersSent) {
        originalRes.setHeader('Content-Type', 'application/json');
        originalRes.statusCode = this._status || 200;
      }
      originalRes.end(JSON.stringify(obj));
    }
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '', true);

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
