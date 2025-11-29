import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { Notification } from '../../types';

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Notification) => void;
  markRead: (id: string) => void;
  clearInbox: () => Promise<void>;
  markAllRead: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (n: Notification) => {
    setNotifications(prev => [n, ...prev].slice(0, 200));
  };

  const markRead = (id: string) => {
    // optimistic update
    setNotifications(prev => prev.map(p => p.id === id ? { ...p, isRead: true } : p));
    try {
      const userId = (window as any).__USER_ID || null;
      if (!userId) return;
      fetch(`/api/notifications/${encodeURIComponent(String(id))}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).catch(() => {});
    } catch (e) {}
  };

  const markAllRead = () => setNotifications(prev => prev.map(p => ({ ...p, isRead: true })));

  const clearInbox = async () => {
    // optimistic: mark all read locally (preserve history in UI)
    setNotifications(prev => prev.map(p => ({ ...p, isRead: true })));
    try {
      const userId = (window as any).__USER_ID || null;
      if (!userId) return;
      await fetch(`/api/notifications/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
    } catch (e) {
      // on failure, ignore — could re-fetch, but keep UX simple for now
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Fetch persisted notifications on mount (dev: uses window.__USER_ID)
  useEffect(() => {
    (async () => {
      try {
        const userId = (window as any).__USER_ID || null;
        if (!userId) return;
        const resp = await fetch(`/api/notifications?userId=${encodeURIComponent(String(userId))}&limit=50`);
        if (!resp.ok) return;
        const json = await resp.json();
        if (Array.isArray(json)) {
          // normalize field names from DB to client shape
          const mapped = json.map((r: any) => ({
            id: r.id,
            userId: r.user_id,
            type: r.type,
            priority: r.priority,
            title: r.title,
            message: r.message,
            url: r.url,
            payload: r.payload,
            isRead: r.is_read,
            createdAt: r.created_at
          }));
          setNotifications(mapped);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const value = { notifications, unreadCount, addNotification, markRead, markAllRead, clearInbox };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
