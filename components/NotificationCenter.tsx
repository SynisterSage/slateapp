import React, { useEffect, useState } from 'react';
import { useNotifications } from '../src/lib/notificationStore';

export const NotificationCenter: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { notifications, markRead, clearInbox } = useNotifications();
  const [list, setList] = useState(notifications);

  useEffect(() => setList(notifications), [notifications]);

  function shortTime(d: Date | number | undefined | null) {
    const date = d ? new Date(d) : new Date();
    const now = Date.now();
    const diff = Math.floor((now - date.getTime()) / 1000);
    if (diff < 5) return 'now';
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 52) return `${weeks}w`;
    const years = Math.floor(days / 365);
    return `${years}y`;
  }

  return (
    <div className="w-96 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-xs text-gray-500 dark:text-gray-400">Close</button>
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {list.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">No recent activity</div>
        )}
        {list.map(n => (
          <div
            key={n.id}
            className={`p-4 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${n.isRead ? 'opacity-80' : ''}`}
            onClick={() => { markRead(n.id); if (n.url) window.location.href = n.url; }}
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 pr-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{n.title}</div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</div>
              </div>
              <div className="text-[11px] text-gray-400 flex-shrink-0 pt-0.5">
                {shortTime(n.createdAt ? new Date(n.createdAt) : new Date())}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            className="text-sm text-red-600 hover:underline"
            onClick={async () => {
              try {
                await clearInbox();
              } catch (e) {}
            }}
          >
            Clear inbox
          </button>
          {/* Dev helper: create a test notification from the frontend without curl */}
          <button
            className="text-sm text-gray-600 hover:underline"
            onClick={async () => {
              try {
                const userId = (window as any).__USER_ID || null;
                if (!userId) return alert('No userId available (not signed in)');
                const sample = {
                  userId,
                  type: 'application_status_change',
                  priority: 'important',
                  title: 'Test: Application status',
                  message: 'This is a test status change notification from the UI',
                  url: '/applications',
                  payload: { test: true }
                };
                const resp = await fetch('/api/notifications/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample) });
                let bodyTxt = '';
                try {
                  const json = await resp.json().catch(() => null);
                  bodyTxt = json ? JSON.stringify(json) : (await resp.text().catch(() => ''));
                } catch (e) {
                  bodyTxt = await resp.text().catch(() => '');
                }
                if (!resp.ok) {
                  alert('Failed to create test notification: ' + bodyTxt);
                } else {
                  alert('Created notification: ' + bodyTxt);
                }
              } catch (e) {
                alert('Error creating test notification');
              }
            }}
          >
            Create test notification
          </button>
        </div>
        <div></div>
      </div>
    </div>
  );
};
