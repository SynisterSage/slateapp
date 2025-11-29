import type { Notification as NType } from '../../types';

let ws: WebSocket | null = null;
let reconnectTimer = 0;
let handlers: Array<(n: NType) => void> = [];

export function connectNotifications(wsUrl: string, userId: string) {
  if (!userId) return;
  if (ws) ws.close();

  const url = new URL(wsUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('userId', userId);

  ws = new WebSocket(url.toString());

  ws.onopen = () => {
    console.log('notifications ws connected to', url.toString());
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg && msg.event === 'notification' && msg.data) {
        handlers.forEach(h => h(msg.data));
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    // attempt reconnect with backoff
    reconnectTimer = Math.min((reconnectTimer || 1) * 2, 60);
    console.warn('notifications ws closed; attempting reconnect in', reconnectTimer, 'seconds');
    setTimeout(() => connectNotifications(wsUrl, userId), reconnectTimer * 1000);
  };

  ws.onerror = () => {
    console.warn('notifications ws error');
  };
}

export function onNotification(handler: (n: NType) => void) {
  handlers.push(handler);
  return () => { handlers = handlers.filter(h => h !== handler); };
}

export function disconnectNotifications() {
  if (ws) {
    ws.close();
    ws = null;
  }
  handlers = [];
}
