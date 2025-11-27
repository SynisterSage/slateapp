
import React, { useState, useEffect } from 'react';
import { 
    Moon, Sun, Key, Shield, User, AlertCircle, 
    Trash2, Bell, Mail, Zap, LogOut
} from 'lucide-react';
import supabase from '../src/lib/supabaseClient';

interface SettingsProps {
    currentTheme: 'light' | 'dark';
    onToggleTheme: () => void;
    onLogout: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ currentTheme, onToggleTheme, onLogout }) => {
    // Mock state for form fields
    const [apiKey, setApiKey] = useState('sk-........................');
    const [showKey, setShowKey] = useState(false);
    const [jobTitle, setJobTitle] = useState('Senior Frontend Engineer');
    const [location, setLocation] = useState('Remote');
    
    // Notification State
    const [notifEmail, setNotifEmail] = useState(true);
    const [notifPush, setNotifPush] = useState(true);
    const [notifMarketing, setNotifMarketing] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [checkingGmail, setCheckingGmail] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<Array<any>>([]);
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [showConnectOptions, setShowConnectOptions] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
    const [lastAddedAccountId, setLastAddedAccountId] = useState<string | null>(null);

    const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
        <button 
            onClick={() => onChange(!checked)}
            className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );

    function initialsAvatarDataUrl(name?: string) {
        const initials = (name || '').split(' ').filter(Boolean).map(s => s[0]?.toUpperCase() || '').slice(0,2).join('') || 'U';
        const bg = '#E9E7FF';
        const fg = '#5B21B6';
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='100%' height='100%' fill='${bg}' rx='16'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, Helvetica, sans-serif' font-size='36' fill='${fg}'>${initials}</text></svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    useEffect(() => {
        // On mount, check whether Gmail is connected for this user
        // If the OAuth callback redirected back with gmail_connected=1, set connected optimistically
        let sawGmailConnected = false;
        let ownerFromUrl: string | null = null;
        // Parse params at top so we can clean them up later
        try {
            const params = new URLSearchParams(window.location.search);
            sawGmailConnected = params.get('gmail_connected') === '1';
            ownerFromUrl = params.get('owner');
            if (sawGmailConnected) {
                // Show a temporary checking state while we verify the server
                setCheckingGmail(true);
            }
        } catch (e) {
            // ignore
        }

        // Read optimistic saved state so the UI doesn't flicker between mounts
        try {
            const saved = typeof window !== 'undefined' ? window.localStorage.getItem('gmail_connected') : null;
            if (saved === '1') setIsConnected(true);
        } catch (e) {}

        (async () => {
            try {
                const s = await supabase.auth.getSession();
                try { console.log('Settings: supabase.getSession ->', s); } catch (e) {}
                const jwt = s && (s as any).data && (s as any).data.session ? (s as any).data.session.access_token : null;
                try { console.log('Settings: jwt present=', !!jwt, 'jwt_len=', jwt ? jwt.length : 0); } catch (e) {}

                // If the callback included an owner in the URL (dev shortcut),
                // use it to check without requiring the browser session token.
                // NOTE: prefer owner param if present regardless of gmail_connected flag.
                if (ownerFromUrl) {
                    try { console.log('Settings: verifying via owner param=', ownerFromUrl); } catch (e) {}
                    const resp = await fetch(`/api/check-gmail?owner=${encodeURIComponent(ownerFromUrl)}`);
                    try { console.log('Settings: /api/check-gmail (owner) status=', resp.status); } catch (e) {}
                    const text = await resp.text().catch(() => null);
                    let json = null;
                    try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
                    try { console.log('Settings: /api/check-gmail (owner) response=', json); } catch (e) {}
                    if (resp.ok && json && json.connected) {
                        try { console.log('Settings: owner-based check -> connected! showing toast and refreshing accounts'); } catch (e) {}
                        // show a toast and refresh accounts; keep main Connect button neutral so users can add more accounts
                        try { showToast('Gmail account connected', 'success'); } catch (e) {}
                        try { await loadAccounts(); } catch (e) {}
                    } else {
                        try { console.log('Settings: owner-based check -> not connected', json); } catch (e) {}
                    }
                    // Remove owner and gmail_connected from the URL after verification
                    try {
                        const params = new URLSearchParams(window.location.search);
                        params.delete('owner');
                        params.delete('gmail_connected');
                        const newSearch = params.toString();
                        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
                        window.history.replaceState({}, document.title, newUrl);
                    } catch (e) { /* ignore */ }
                    try { setCheckingGmail(false); } catch (e) {}
                } else {
                    // Prefer resolving the current user id and checking by owner id.
                    // This avoids sending the raw JWT as an Authorization header to the server
                    // (server checks using the service role key) and is more reliable.
                    try { console.log('Settings: resolving user id via supabase.auth.getUser()'); } catch (e) {}
                    let ownerId: string | null = null;
                    try {
                        const userResp = await supabase.auth.getUser();
                        ownerId = userResp && (userResp as any).data && (userResp as any).data.user ? (userResp as any).data.user.id : null;
                        try { console.log('Settings: resolved ownerId=', ownerId); } catch (e) {}
                    } catch (e) {
                        try { console.warn('Settings: getUser failed', e); } catch (er) {}
                    }

                        if (ownerId) {
                        const resp = await fetch(`/api/check-gmail?owner=${encodeURIComponent(ownerId)}`);
                        try { console.log('Settings: /api/check-gmail (owner) status=', resp.status); } catch (e) {}
                        const text = await resp.text().catch(() => null);
                        let json = null;
                        try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
                        try { console.log('Settings: /api/check-gmail (owner) response=', json); } catch (e) {}
                        if (resp.ok && json && json.connected) {
                            try { console.log('Settings: owner-based check -> connected! setting isConnected'); } catch (e) {}
                            setIsConnected(true);
                            try { window.localStorage.setItem('gmail_connected', '1'); } catch (e) {}
                        } else {
                            try { console.log('Settings: owner-based check -> not connected', json); } catch (e) {}
                        }
                    } else {
                        // Fallback: if we couldn't resolve ownerId, try jwt-based check (best-effort)
                        try { console.log('Settings: ownerId unavailable, attempting jwt-based check'); } catch (e) {}
                        if (!jwt) {
                            if (sawGmailConnected) setCheckingGmail(false);
                            return;
                        }
                        const resp = await fetch('/api/check-gmail', { headers: { Authorization: `Bearer ${jwt}` } });
                        try { console.log('Settings: /api/check-gmail status=', resp.status); } catch (e) {}
                        const text = await resp.text().catch(() => null);
                        let json = null;
                        try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
                        try { console.log('Settings: /api/check-gmail response=', json); } catch (e) {}
                        if (resp.ok && json && json.connected) {
                            try { console.log('Settings: jwt-based check -> connected! setting isConnected'); } catch (e) {}
                            setIsConnected(true);
                            try { window.localStorage.setItem('gmail_connected', '1'); } catch (e) {}
                        } else {
                            try { console.log('Settings: jwt-based check -> not connected', json); } catch (e) {}
                        }
                    }
                }

                if (sawGmailConnected) setCheckingGmail(false);

                // Resolve ownerId for account listing and actions
                try {
                    const userResp = await supabase.auth.getUser();
                    const uid = userResp && (userResp as any).data && (userResp as any).data.user ? (userResp as any).data.user.id : null;
                    setOwnerId(uid);
                } catch (e) {}

                // Load accounts for this owner
                try { await loadAccounts(); } catch (e) {}
            } catch (e) {
                console.warn('check-gmail failed', e);
                try { setCheckingGmail(false); } catch (er) {}
            }
        })();
        // Load saved job preferences from localStorage or user metadata
        (async function loadPreferences() {
            try {
                const raw = typeof window !== 'undefined' ? window.localStorage.getItem('jobPreferences') : null;
                if (raw) {
                    const p = JSON.parse(raw || '{}');
                    if (p.jobTitle) setJobTitle(p.jobTitle);
                    if (p.location) setLocation(p.location);
                } else {
                    // fallback: try to load from supabase user metadata
                    try {
                        const u = await supabase.auth.getUser();
                        const user = u && (u as any).data && (u as any).data.user ? (u as any).data.user : null;
                        const prefs = user?.user_metadata?.preferences || user?.user_metadata || user?.data?.preferences || null;
                        if (prefs && prefs.jobTitle) setJobTitle(prefs.jobTitle);
                        if (prefs && prefs.location) setLocation(prefs.location);
                    } catch (e) {
                        // ignore
                    }
                }
            } catch (e) {
                // ignore
            }
        })();
    }, []);

    async function loadAccounts() {
        try {
            // prefer ownerId state, fallback to supabase.getUser
            let oid = ownerId;
            if (!oid) {
                try {
                    const u = await supabase.auth.getUser();
                    oid = u && (u as any).data && (u as any).data.user ? (u as any).data.user.id : null;
                    setOwnerId(oid);
                } catch (e) {}
            }
            if (!oid) return setAccounts([]);
            const resp = await fetch(`/api/list-gmail-accounts?owner=${encodeURIComponent(oid)}`);
            if (!resp.ok) return setAccounts([]);
            const json = await resp.json().catch(() => ({}));
            // detect newly added accounts by id (compare previous accounts)
            try {
                const prev = accounts ? accounts.map(a => a.id) : [];
                const newAccounts = (json && json.accounts) || [];
                const newIds = newAccounts.map(a => a.id);
                const added = newIds.find(id => !prev.includes(id));
                setAccounts(newAccounts);
                if (added) {
                    setLastAddedAccountId(added);
                    // clear highlight after 3s
                    setTimeout(() => setLastAddedAccountId(null), 3000);
                }
            } catch (e) {
                setAccounts((json && json.accounts) || []);
            }
        } catch (e) {
            console.warn('Failed to load accounts', e);
            setAccounts([]);
        }
    }

    function showToast(msg: string, type: 'success'|'error'|'info' = 'success') {
        try { setToastMessage(msg); setToastType(type); } catch (e) {}
        try { setTimeout(() => setToastMessage(null), 4000); } catch (e) {}
    }

    async function disconnectAccount(id: string) {
        try {
            if (!ownerId) {
                const u = await supabase.auth.getUser();
                setOwnerId(u && (u as any).data && (u as any).data.user ? (u as any).data.user.id : null);
            }
            const url = `/api/remove-gmail-account?id=${encodeURIComponent(id)}${ownerId ? `&owner=${encodeURIComponent(ownerId)}` : ''}`;
            const resp = await fetch(url, { method: 'DELETE' });
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                showToast('Failed to disconnect account', 'error');
                console.error('disconnect failed', j);
                return;
            }
            showToast('Disconnected Gmail account', 'success');
            await loadAccounts();
            // Clear local optimistic flag if no accounts remain
            try { if (!accounts || accounts.length <= 1) window.localStorage.removeItem('gmail_connected'); } catch (e) {}
        } catch (e) {
            console.error('disconnectAccount error', e);
            showToast('Failed to disconnect account', 'error');
        }
    }

    async function syncNowForOwner() {
        try {
            setIsSyncing(true);
            let oid = ownerId;
            if (!oid) {
                const u = await supabase.auth.getUser();
                oid = u && (u as any).data && (u as any).data.user ? (u as any).data.user.id : null;
                setOwnerId(oid);
            }
            if (!oid) { showToast('Please sign in', 'error'); setIsSyncing(false); return; }
            const resp = await fetch(`/api/sync-gmail?owner=${encodeURIComponent(oid)}`, { method: 'POST' });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) { showToast('Sync failed', 'error'); setIsSyncing(false); return; }
            setLastSyncResult(`Found ${json.found} messages`);
            setIsConnected(true);
            try { window.localStorage.setItem('gmail_connected', '1'); } catch (e) {}
            showToast(`Sync complete: found ${json.found} messages`, 'success');
            await loadAccounts();
        } catch (e) {
            console.error('syncNowForOwner error', e);
            showToast('Sync failed', 'error');
        } finally { setIsSyncing(false); }
    }
    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in pb-20">
             <div className="flex justify-between items-center mb-8">
                 <div>
                     <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
                     <p className="text-gray-500 dark:text-gray-400">Manage your preferences, API keys, and account notifications.</p>
                    {/* Toast */}
                                {toastMessage && (
                                    <div className={`fixed right-6 top-6 text-white px-4 py-2 rounded-md shadow-lg ${toastType === 'success' ? 'bg-green-600' : toastType === 'error' ? 'bg-rose-600' : 'bg-slate-700'}`}>
                                        {toastMessage}
                                    </div>
                                )}
                 </div>
             </div>

             <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Main Column */}
                <div className="xl:col-span-2 space-y-6">
                    {/* Profile Preferences */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <User size={20} className="text-purple-600" /> Job Preferences
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Job Title</label>
                                <input 
                                    type="text"
                                    value={jobTitle}
                                    onChange={(e) => setJobTitle(e.target.value)}
                                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Location</label>
                                <input 
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none transition-colors"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                            <button
                                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium shadow-sm"
                                onClick={async () => {
                                    try {
                                        const prefs = { jobTitle: jobTitle || '', location: location || '' };
                                        if (typeof window !== 'undefined') window.localStorage.setItem('jobPreferences', JSON.stringify(prefs));
                                        // Attempt to persist to Supabase user metadata (best-effort)
                                        try {
                                            const upd = await supabase.auth.updateUser({ data: { preferences: prefs } as any });
                                            // supabase.auth.updateUser returns { data, error } in some SDKs; handle both shapes
                                            if ((upd as any).error) throw (upd as any).error;
                                        } catch (e) {
                                            // ignore server-side persistence failures
                                            console.warn('Failed to persist preferences to Supabase (optional):', e);
                                        }
                                        showToast('Saved job preferences', 'success');
                                    } catch (e) {
                                        console.error('Save preferences failed', e);
                                        showToast('Failed to save preferences', 'error');
                                    }
                                }}
                            >
                                Save Preferences
                            </button>
                            <button
                                className="px-3 py-2 rounded-lg bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700 text-gray-700 dark:text-gray-200"
                                onClick={() => {
                                    setJobTitle('');
                                    setLocation('');
                                    try { if (typeof window !== 'undefined') window.localStorage.removeItem('jobPreferences'); } catch (e) {}
                                    showToast('Cleared preferences', 'info');
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </section>

                    {/* Notifications */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Bell size={20} className="text-indigo-500" /> Notifications
                        </h2>
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">
                                        <Mail size={18} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100">Daily Email Digest</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Get a summary of new job matches every morning.</p>
                                    </div>
                                </div>
                                <Toggle checked={notifEmail} onChange={setNotifEmail} />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100">Real-time Alerts</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Notify me immediately when an application status changes.</p>
                                    </div>
                                </div>
                                <Toggle checked={notifPush} onChange={setNotifPush} />
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3 opacity-80">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100">Marketing & Tips</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Receive career advice and feature updates.</p>
                                    </div>
                                </div>
                                <Toggle checked={notifMarketing} onChange={setNotifMarketing} />
                            </div>
                        </div>
                    </section>

                    {/* Gmail Connect */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Mail size={20} className="text-red-500" /> Gmail Integration
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Connect your Gmail account to auto-detect sent applications and replies. We store full email bodies for MVP.</p>
                        <div className="flex gap-3">
                            <button
                                className={`px-4 py-2 rounded-lg font-medium shadow-sm transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200`}
                                onClick={() => setShowConnectOptions(!showConnectOptions)}
                            >
                                Connect Gmail
                            </button>

                            {/* Connect options - compact inline */}
                            {showConnectOptions && (
                                <div className="flex items-center gap-2">
                                    <button
                                        className="px-3 py-1 rounded-md bg-white border border-gray-200 hover:shadow-sm flex items-center gap-2"
                                        onClick={async () => {
                                            try {
                                                const s = await supabase.auth.getSession();
                                                const jwt = s && (s as any).data && (s as any).data.session ? (s as any).data.session.access_token : null;
                                                const state = encodeURIComponent(jwt || '');
                                                window.location.href = `/api/auth-gmail-start?state=${state}`;
                                            } catch (e) {
                                                console.error('Start Gmail OAuth failed', e);
                                                showToast('Failed to start Gmail OAuth. Make sure you are signed in.', 'error');
                                            }
                                        }}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M42 24.5C42 20.36 40.36 16.56 37.64 13.64L29.5 21.78C29.86 23.12 30.04 24.52 30.04 26C30.04 27.48 29.86 28.88 29.5 30.22L37.64 38.36C40.36 35.44 42 31.64 42 27.5V24.5Z" fill="#EA4335"/><path d="M24 42C28.14 42 31.94 40.36 34.86 37.64L26.72 29.5C25.38 29.86 23.98 30.04 22.5 30.04C21.02 30.04 19.62 29.86 18.28 29.5L10.14 37.64C13.06 40.36 16.86 42 21 42H24Z" fill="#34A853"/><path d="M6 24.5C6 28.64 7.64 32.44 10.36 35.36L18.5 27.22C18.14 25.88 17.96 24.48 17.96 23C17.96 21.52 18.14 20.12 18.5 18.78L10.36 10.64C7.64 13.56 6 17.36 6 21.5V24.5Z" fill="#FBBC05"/><path d="M24 6C19.86 6 16.06 7.64 13.14 10.36L21.28 18.5C22.62 18.14 24.02 17.96 25.5 17.96C26.98 17.96 28.38 18.14 29.72 18.5L37.86 10.36C34.94 7.64 31.14 6 27 6H24Z" fill="#4285F4"/></svg>
                                        <span className="text-sm">Continue with Gmail</span>
                                    </button>
                                </div>
                            )}

                            <button
                                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-gray-800 text-white font-medium shadow-sm"
                                onClick={async () => {
                                    try {
                                        setIsSyncing(true);
                                        const s = await supabase.auth.getSession();
                                        const jwt = s && (s as any).data && (s as any).data.session ? (s as any).data.session.access_token : null;
                                        if (!jwt) { showToast('Please sign in to sync', 'error'); setIsSyncing(false); return; }
                                        // Debug: log short token info so we can see if token exists
                                        try { console.log('Sync: jwt length=', jwt ? jwt.length : 'NULL', jwt ? jwt.slice(0,30)+'...' : ''); } catch (e) {}

                                        // Try to get the current user id as a fallback owner param (dev-only convenience)
                                        let ownerIdLocal = null;
                                        try {
                                            const userResp = await supabase.auth.getUser();
                                            ownerIdLocal = userResp && (userResp as any).data && (userResp as any).data.user ? (userResp as any).data.user.id : null;
                                        } catch (e) {
                                            // ignore
                                        }
                                        const url = ownerIdLocal ? `/api/sync-gmail?owner=${encodeURIComponent(ownerIdLocal)}` : '/api/sync-gmail';
                                        const resp = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } });
                                        const json = await resp.json().catch(() => ({ error: 'Invalid response' }));
                                        if (!resp.ok) {
                                            console.error('Sync failed', json);
                                            setLastSyncResult('Sync failed: ' + (json && json.error ? json.error : resp.status));
                                            showToast('Sync failed — check console', 'error');
                                            setIsSyncing(false);
                                            return;
                                        }
                                        setIsConnected(true);
                                        try { window.localStorage.setItem('gmail_connected', '1'); } catch (e) {}
                                        setLastSyncResult(`Found ${json.found} messages`);
                                        showToast(`Sync complete: found ${json.found} messages`, 'success');
                                        try { await loadAccounts(); } catch (e) {}
                                    } catch (e) {
                                        console.error('Sync error', e);
                                        showToast('Sync error — see console', 'error');
                                    } finally {
                                        setIsSyncing(false);
                                    }
                                }}
                            >
                                {isSyncing ? 'Syncing…' : 'Sync Emails'}
                            </button>
                        </div>
                        {lastSyncResult && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Last sync: {lastSyncResult}</p>}
                        {/* Render connected accounts */}
                        <div className="mt-6 space-y-3">
                            {accounts && accounts.length ? (
                                accounts.map(acc => (
                                    <div key={acc.id} className={`flex items-center gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 ${lastAddedAccountId === acc.id ? 'ring-4 ring-green-300/40 animate-pulse' : ''}`}>
                                            <img
                                                src={acc.picture || initialsAvatarDataUrl(acc.name)}
                                                alt={acc.name || acc.email || 'Avatar'}
                                                className="w-12 h-12 rounded-full object-cover"
                                                onError={(e) => { try { (e.currentTarget as HTMLImageElement).src = initialsAvatarDataUrl(acc.name); } catch (err) {} }}
                                            />
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 dark:text-gray-100">{acc.name || acc.email || 'Google Account'}</div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">{acc.email || acc.provider_user_id}</div>
                                            <div className="text-xs text-gray-400 mt-1">Connected: {acc.created_at ? new Date(acc.created_at).toLocaleString() : 'unknown'}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { syncNowForOwner(); }} className="px-3 py-1 rounded-md bg-purple-600 text-white text-sm">Sync Now</button>
                                            <button onClick={() => { if (confirm('Disconnect this account?')) disconnectAccount(acc.id); }} className="px-3 py-1 rounded-md border border-rose-200 dark:border-rose-800 text-rose-600 text-sm">Disconnect</button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-gray-500">No connected Gmail accounts.</div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Right Column (Sidebar-like) */}
                <div className="space-y-6">
                    {/* Appearance */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Sun size={20} className="text-orange-500" /> Appearance
                        </h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">Theme Preference</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Switch between light and dark mode.</p>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                                <button 
                                    onClick={() => currentTheme === 'dark' && onToggleTheme()}
                                    className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                                        currentTheme === 'light' 
                                        ? 'bg-white text-gray-900 shadow-sm' 
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <Sun size={16} /> Light
                                </button>
                                <button 
                                    onClick={() => currentTheme === 'light' && onToggleTheme()}
                                    className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                                        currentTheme === 'dark' 
                                        ? 'bg-gray-700 text-white shadow-sm' 
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <Moon size={16} /> Dark
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* API Configuration */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Key size={20} className="text-purple-600" /> API Configuration
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gemini API Key</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input 
                                            type={showKey ? "text" : "password"} 
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                                        />
                                        <button 
                                            onClick={() => setShowKey(!showKey)}
                                            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xs font-medium"
                                        >
                                            {showKey ? "HIDE" : "SHOW"}
                                        </button>
                                    </div>
                                    <button className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors shadow-sm">
                                        Save
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                                    <Shield size={12} /> Your key is stored locally in your browser.
                                </p>
                            </div>
                            
                            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Token Usage (This Month)</span>
                                    <span className="text-xs font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-md">12,450 / 1M Limit</span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                                    <div className="bg-purple-500 w-[1.2%] h-full rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Danger Zone */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-rose-100 dark:border-rose-900/50 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-rose-600 dark:text-rose-500 mb-4 flex items-center gap-2">
                            <AlertCircle size={20} /> Danger Zone
                        </h2>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-900/30">
                                <div>
                                    <p className="font-bold text-rose-900 dark:text-rose-200 text-sm">Clear All App Data</p>
                                    <p className="text-xs text-rose-700 dark:text-rose-300">Deletes all resumes, job history, and local settings.</p>
                                </div>
                                <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-medium rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors text-sm flex items-center gap-2">
                                    <Trash2 size={14} /> Clear Data
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
             </div>
        </div>
    )
}