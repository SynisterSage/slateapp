import http from 'http';
import url from 'url';
import { WebSocketServer } from 'ws';

const PORT = process.env.NOTIFY_WS_PORT ? parseInt(process.env.NOTIFY_WS_PORT) : 3002;

// Map userId -> Set of WebSocket
const clientsByUser = new Map();

function addClient(userId, ws) {
  if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
  clientsByUser.get(userId).add(ws);
}

function removeClient(userId, ws) {
  if (!clientsByUser.has(userId)) return;
  clientsByUser.get(userId).delete(ws);
  if (clientsByUser.get(userId).size === 0) clientsByUser.delete(userId);
}

function broadcastToUser(userId, payload) {
  const set = clientsByUser.get(userId);
  if (!set) return 0;
  let sent = 0;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ event: 'notification', data: payload }));
        sent++;
      } catch (e) {
        // ignore per-socket errors
      }
    }
  }
  return sent;
}

// Create HTTP server to accept broadcast POSTs from local API
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '', true);
  if (req.method === 'GET' && parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && parsed.pathname === '/broadcast') {
    // read body
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const json = JSON.parse(body || '{}');
        const { userId, notification } = json;
        if (!userId || !notification) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'userId and notification required' }));
          return;
        }
        console.log('WS broadcast received for user', userId, 'notification id=', notification && notification.id);
        const sent = broadcastToUser(userId, notification);
        console.log('WS broadcast sent to', sent, 'sockets for user', userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sent }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

// Attach WebSocket server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // parse userId from query params for dev PoC
  const parsed = url.parse(request.url || '', true);
  const { userId } = parsed.query || {};
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, userId);
  });
});

wss.on('connection', (ws, userId) => {
  // userId could be undefined; require it for mapping
  const uid = typeof userId === 'string' ? userId : (userId ? String(userId) : null);
  if (!uid) {
    // accept but don't map
    console.warn('WS connection without userId');
  } else {
    addClient(uid, ws);
    console.log('WS: client connected for user', uid);
  }

  ws.on('message', (msg) => {
    // For debugging: echo or process keep-alive
    try {
      const parsed = JSON.parse(String(msg));
      if (parsed && parsed.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (e) {}
  });

  ws.on('close', () => {
    if (uid) removeClient(uid, ws);
    console.log('WS: client disconnected for user', uid);
  });

  ws.on('error', (err) => {
    console.warn('WS socket error', err && err.message);
  });
});

server.listen(PORT, () => console.log(`Notifications WS server listening on ws://localhost:${PORT}`));

// Export broadcast helper for potential local requires (optional)
export { broadcastToUser };
