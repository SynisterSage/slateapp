import http from 'http';
import url from 'url';
import jobsHandler from '../api/jobs.js';

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

  if (parsed.pathname && parsed.pathname.startsWith('/api/')) {
    const fakeReq = { query: parsed.query, method: req.method, headers: req.headers };
    const fakeRes = makeResNode(res);
    try {
      // Route /api/parse-resume and /api/upload-resume to their handlers; otherwise to jobsHandler
      if (parsed.pathname === '/api/parse-resume') {
        const parseHandler = (await import('../api/parseResume.js')).default;
        await parseHandler(fakeReq, fakeRes);
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
