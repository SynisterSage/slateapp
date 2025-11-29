
import React, { useState, useEffect, useRef } from 'react';
import { 
    LayoutGrid, List, RefreshCw, Search, Filter, MoreVertical, 
    Calendar, Building2, FileText, CheckCircle2, XCircle, 
    Clock, MessageSquare, ArrowRight, Mail, ChevronRight, ExternalLink,
    MoreHorizontal, Loader2, AlertCircle, X, Download
} from 'lucide-react';
import { Application, Job, Resume } from '../types';
import { getApplications, getResumes, createApplication, updateApplication, deleteApplicationById, getEmailMessagesByThread, getEmailMessageById } from '../src/api';
import supabase from '../src/lib/supabaseClient';

// Type helper for the view
interface HydratedApplication extends Application {
    job: Job;
    resume: Resume;
}

// Extended Mock Data for the Board View
const EXTRA_MOCK_APPS: Application[] = [
    { id: 'a2', jobId: 'j1', resumeId: 'r1', status: 'Interviewing', appliedDate: '2023-10-05', notes: 'Technical round scheduled for Tuesday.' },
    { id: 'a3', jobId: 'j2', resumeId: 'r1', status: 'Rejected', appliedDate: '2023-09-28', notes: 'Standard rejection email.' },
    { id: 'a4', jobId: 'j1', resumeId: 'r2', status: 'Offer', appliedDate: '2023-09-15', notes: 'Waiting on equity details.' },
];

// Column Config
const COLUMNS: { id: Application['status'], label: string, color: string, bg: string, border: string, darkBg: string, darkColor: string, darkBorder: string }[] = [
    { 
        id: 'Applied', 
        label: 'Applied', 
        color: 'text-purple-700', 
        bg: 'bg-purple-50', 
        border: 'border-purple-200', 
        darkBg: 'dark:bg-gray-800', 
        darkColor: 'dark:text-purple-400', 
        darkBorder: 'dark:border-gray-700' 
    },
    { 
        id: 'Interviewing', 
        label: 'Interviewing', 
        color: 'text-amber-700', 
        bg: 'bg-amber-50', 
        border: 'border-amber-200', 
        darkBg: 'dark:bg-gray-800', 
        darkColor: 'dark:text-amber-400', 
        darkBorder: 'dark:border-gray-700' 
    },
    { 
        id: 'Offer', 
        label: 'Offer', 
        color: 'text-emerald-700', 
        bg: 'bg-emerald-50', 
        border: 'border-emerald-200', 
        darkBg: 'dark:bg-gray-800', 
        darkColor: 'dark:text-emerald-400', 
        darkBorder: 'dark:border-gray-700' 
    },
    { 
        id: 'Rejected', 
        label: 'Rejected', 
        color: 'text-slate-600', 
        bg: 'bg-slate-100', 
        border: 'border-slate-200', 
        darkBg: 'dark:bg-gray-800', 
        darkColor: 'dark:text-gray-300', 
        darkBorder: 'dark:border-gray-700' 
    },
];

export const Applications = () => {
    const [applications, setApplications] = useState<HydratedApplication[]>([]);
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedApp, setSelectedApp] = useState<HydratedApplication | null>(null);
    const [selectedAppMessage, setSelectedAppMessage] = useState<any | null>(null);
    const lastFetchedRef = useRef<{ threadId?: string | null; messageId?: string | null }>({});
    const inFlightRef = useRef<Record<string, boolean>>({});
    const [selectedAppMessageLoading, setSelectedAppMessageLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Filter State
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(new Set());
    const [tempStatusFilters, setTempStatusFilters] = useState<Set<string>>(new Set());

    // --- Data Loading from Supabase ---

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const apps = await getApplications();
                const resumes = await getResumes();
                const resumeRows = (resumes || []).map((r: any) => (r.data ? r.data : r));
                const hydrated = (apps || []).map((a: any) => {
                    const appData = a.data || a;
                    const job = appData.raw?.job || appData.job || { id: appData.jobId || 'unknown', title: appData.job_title || 'Unknown', company: appData.company || 'Unknown', location: appData.location || '' };
                    const resume = resumeRows.find((r: any) => r.id === (a.resume_id || appData.resumeId)) || resumeRows[0] || { id: 'unknown', title: 'Unknown' };
                    return { ...a, job, resume } as HydratedApplication;
                });
                if (!mounted) return;
                setApplications(hydrated);
            } catch (err) {
                console.warn('Failed to load applications', err);
            } finally {
                setIsLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

        // Listen for selection events triggered by SearchResults / TopNav
        useEffect(() => {
            const onSelect = (e: any) => {
                try {
                    const id = e && e.detail && e.detail.id;
                    if (!id) return;
                    const found = applications.find(a => String(a.id) === String(id));
                    if (found) setSelectedApp(found);
                } catch (err) {}
            };
            window.addEventListener('app:selectApplication', onSelect as EventListener);
            return () => window.removeEventListener('app:selectApplication', onSelect as EventListener);
        }, [applications]);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            // If an application is selected, prefer a targeted sync: check messages for its thread
            if (selectedApp) {
                const threadId = selectedApp.thread_id || selectedApp.threadId || selectedApp.raw?.job?.thread_id || selectedApp.raw?.thread_id || null;
                const messageId = selectedApp.email_message_id || selectedApp.emailMessageId || selectedApp.raw?.email_message_id || selectedApp.raw?.messageId || null;

                if (!threadId && !messageId) {
                    alert('No thread or message id available to sync for this application.');
                    setIsSyncing(false);
                    return;
                }

                // If we have a thread id, fetch latest messages and compare with what's displayed
                if (threadId) {
                    const msgs = await getEmailMessagesByThread(String(threadId));
                    if (!msgs || msgs.length === 0) {
                        alert('No messages found for this application.');
                        setIsSyncing(false);
                        return;
                    }
                    const latest = msgs[0];
                    // If the UI already shows this message, nothing to do
                    if (selectedAppMessage && selectedAppMessage.id && latest.id === selectedAppMessage.id) {
                        alert('Up to date — no new messages.');
                        setIsSyncing(false);
                        return;
                    }

                    // New message found: refresh app list and selected message
                    try {
                        const refreshed = await getApplications();
                        const resumes = await getResumes();
                        const resumeRows = (resumes || []).map((r: any) => (r.data ? r.data : r));
                        const hydrated = (refreshed || []).map((a: any) => {
                            const appData = a.data || a;
                            const job = appData.raw?.job || appData.job || { id: appData.jobId || 'unknown', title: appData.job_title || 'Unknown', company: appData.company || 'Unknown', location: appData.location || '' };
                            const resume = resumeRows.find((r: any) => r.id === (a.resume_id || appData.resumeId)) || resumeRows[0] || { id: 'unknown', title: 'Unknown' };
                            return { ...a, job, resume } as HydratedApplication;
                        });
                        setApplications(hydrated);
                        setSelectedAppMessage(latest);
                        alert('New message found and UI updated.');
                        setIsSyncing(false);
                        return;
                    } catch (e) {
                        console.error('Failed to refresh applications after new message', e);
                        alert('Found a new message, but failed to refresh UI. See console.');
                        setIsSyncing(false);
                        return;
                    }
                }

                // If no thread id but we have a stored message id, fetch that message and compare
                if (messageId) {
                    try {
                        const msg = await getEmailMessageById(String(messageId));
                        if (msg && selectedAppMessage && msg.id === selectedAppMessage.id) {
                            alert('Up to date — no new messages.');
                        } else if (msg) {
                            // Update UI with the fetched message
                            setSelectedAppMessage(msg);
                            // refresh applications list to pick up any status changes
                            const refreshed = await getApplications();
                            const resumes = await getResumes();
                            const resumeRows = (resumes || []).map((r: any) => (r.data ? r.data : r));
                            const hydrated = (refreshed || []).map((a: any) => {
                                const appData = a.data || a;
                                const job = appData.raw?.job || appData.job || { id: appData.jobId || 'unknown', title: appData.job_title || 'Unknown', company: appData.company || 'Unknown', location: appData.location || '' };
                                const resume = resumeRows.find((r: any) => r.id === (a.resume_id || appData.resumeId)) || resumeRows[0] || { id: 'unknown', title: 'Unknown' };
                                return { ...a, job, resume } as HydratedApplication;
                            });
                            setApplications(hydrated);
                            alert('Message fetched and UI updated.');
                        } else {
                            alert('No message found for this application.');
                        }
                    } catch (e) {
                        console.error('Failed to fetch message by id', e);
                        alert('Failed to fetch message. See console for details.');
                    } finally {
                        setIsSyncing(false);
                        return;
                    }
                }
            }

                // Global sync: call server sync endpoint which will persist any new messages/events
            try {
                // Attach the current user's access token so the server can resolve owner via Supabase
                let headers: Record<string, string> = { 'Content-Type': 'application/json' };
                try {
                    const sessRes: any = await supabase.auth.getSession();
                    const session = sessRes && sessRes.data ? sessRes.data.session : sessRes?.session || null;
                    const token = session?.access_token || (session && session.access_token) || null;
                    if (token) headers.Authorization = `Bearer ${token}`;
                    // Also include owner query as a fallback if available
                    const userRes: any = await supabase.auth.getUser();
                    const user = userRes && userRes.data ? userRes.data.user : null;
                    if (user && user.id) {
                        // prefer Authorization header; include owner as query param for dev-server convenience
                        // append owner to url
                    }
                } catch (e) {
                    console.warn('Could not attach supabase auth token to sync request', e);
                }
                let url = '/api/sync-gmail';
                try {
                    const userRes2: any = await supabase.auth.getUser();
                    const user2 = userRes2 && userRes2.data ? userRes2.data.user : null;
                    if (user2 && user2.id) url = `/api/sync-gmail?owner=${encodeURIComponent(user2.id)}`;
                } catch (e) {
                    // ignore; Authorization header should suffice when available
                }
                const resp = await fetch(url, { method: 'POST', headers });
                if (!resp.ok) {
                    const txt = await resp.text().catch(() => '');
                    console.warn('sync-gmail returned non-OK', resp.status, txt);
                    alert('Sync failed on server. See console for details.');
                    setIsSyncing(false);
                    return;
                }
                const json = await resp.json();
                // Refresh applications and show summary
                const refreshed = await getApplications();
                const resumes = await getResumes();
                const resumeRows = (resumes || []).map((r: any) => (r.data ? r.data : r));
                const hydrated = (refreshed || []).map((a: any) => {
                    const appData = a.data || a;
                    const job = appData.raw?.job || appData.job || { id: appData.jobId || 'unknown', title: appData.job_title || 'Unknown', company: appData.company || 'Unknown', location: appData.location || '' };
                    const resume = resumeRows.find((r: any) => r.id === (a.resume_id || appData.resumeId)) || resumeRows[0] || { id: 'unknown', title: 'Unknown' };
                    return { ...a, job, resume } as HydratedApplication;
                });
                setApplications(hydrated);
                if (json && json.found === 0) {
                    alert('Up to date — no new messages found.');
                } else {
                    alert(`Sync complete. ${json.found || 0} new items processed.`);
                }
            } catch (e) {
                console.error('Global sync failed', e);
                alert('Sync failed. See console for details.');
            }
        } finally {
            setIsSyncing(false);
        }
    };

    const handleExport = () => {
        alert("Exporting " + applications.length + " applications to CSV...");
    };

    // --- Actions ---
    const handleStatusChange = (appId: string, newStatus: Application['status']) => {
        setApplications(prev => prev.map(app => 
            app.id === appId ? { ...app, status: newStatus } : app
        ));
        if (selectedApp?.id === appId) {
            setSelectedApp(prev => prev ? { ...prev, status: newStatus } : null);
        }
        // Persist change
        (async () => {
            try {
                await updateApplication(appId, { status: newStatus });
            } catch (err) {
                console.error('Failed to update application status', err);
            }
        })();
    };

    const handleDelete = (appId: string) => {
        if (confirm('Are you sure you want to remove this application?')) {
            // Persist delete
            (async () => {
                try {
                    await deleteApplicationById(appId);
                } catch (err) {
                    console.error('Failed to delete application', err);
                }
                setApplications(prev => prev.filter(a => a.id !== appId));
                setSelectedApp(null);
            })();
        }
    };

    const openFilterModal = () => {
        setTempStatusFilters(new Set(activeStatusFilters));
        setIsFilterOpen(true);
    };

    const applyFilters = () => {
        setActiveStatusFilters(new Set(tempStatusFilters));
        setIsFilterOpen(false);
    };

    const toggleTempFilter = (status: string) => {
        const newSet = new Set(tempStatusFilters);
        if (newSet.has(status)) {
            newSet.delete(status);
        } else {
            newSet.add(status);
        }
        setTempStatusFilters(newSet);
    };

    // Filter & Sort Logic
    const filteredApps = applications
        .filter(app => {
            const companyStr = String((app.job && app.job.company) || '');
            const titleStr = String((app.job && app.job.title) || '');
            const matchesSearch = companyStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  titleStr.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = activeStatusFilters.size === 0 || activeStatusFilters.has(app.status);
            return matchesSearch && matchesStatus;
        })
        .sort((a, b) => {
            // Sort priority: Offer -> Interviewing -> Applied -> Rejected -> Newest Date
            const priority = { 'Offer': 0, 'Interviewing': 1, 'Applied': 2, 'Rejected': 3 };
            const pA = priority[a.status] ?? 99;
            const pB = priority[b.status] ?? 99;
            
            if (pA !== pB) return pA - pB;
            
            // If same status, sort by date (simple string comparison for now, strictly should use Date object)
            const aDate = a.appliedDate ? String(a.appliedDate) : '';
            const bDate = b.appliedDate ? String(b.appliedDate) : '';
            // Newer dates first. If both empty, keep original order (0)
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return bDate.localeCompare(aDate);
        });

    // --- Components ---

    const FilterModal = () => {
        if (!isFilterOpen) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in scale-95 duration-200 border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Filter Applications</h3>
                        <button onClick={() => setIsFilterOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-gray-200">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4 mb-8">
                        <label className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider block">Status</label>
                        <div className="space-y-2">
                            {COLUMNS.map(col => (
                                <label key={col.id} className="flex items-center justify-between p-3 border border-slate-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-2 h-2 rounded-full ${col.bg.replace('bg-', 'bg-slate-400')}`}></span> 
                                        <span className="text-sm font-medium text-slate-700 dark:text-gray-300">{col.label}</span>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 dark:border-gray-600 dark:bg-gray-700"
                                        checked={tempStatusFilters.has(col.id)}
                                        onChange={() => toggleTempFilter(col.id)}
                                    />
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => { setActiveStatusFilters(new Set()); setIsFilterOpen(false); }} className="flex-1 py-2.5 text-slate-600 dark:text-gray-400 font-medium hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                            Clear All
                        </button>
                        <button onClick={applyFilters} className="flex-1 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 dark:shadow-none">
                            Apply Filters
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const ApplicationDetailPanel = () => {
        if (!selectedApp) return null;
        // Helper: extract readable text from stored message objects (shared with effect and render)
        const extractText = (msg: any) => {
            if (!msg) return null;
            if (msg.body && String(msg.body).trim()) return String(msg.body);
            if (msg.data && msg.data.body && String(msg.data.body).trim()) return String(msg.data.body);
            if (msg.raw && msg.raw.snippet) return String(msg.raw.snippet);
            try {
                const parts = msg.raw?.payload?.parts || msg.payload?.parts || null;
                if (Array.isArray(parts)) {
                    for (const p of parts) {
                        if (!p || !p.mimeType) continue;
                        if (p.mimeType === 'text/plain' && p.body && p.body.data) {
                            try {
                                const b64 = p.body.data.replace(/-/g, '+').replace(/_/g, '/');
                                const decoded = atob(b64);
                                if (decoded && decoded.trim()) return decoded;
                            } catch (e) {}
                        }
                    }
                }
            } catch (e) {}
            return null;
        };

        const cleanReplyText = (text: string | null) => {
            if (!text) return '';
            let s = String(text || '');
            const onWroteIdx = s.search(/\nOn\s.+wrote:/i);
            if (onWroteIdx >= 0) s = s.slice(0, onWroteIdx);
            const origIdx = s.search(/-{3,}\s*Original Message|-+Original Message-+/i);
            if (origIdx >= 0) s = s.slice(0, origIdx);
            s = s.split('\n').filter(l => !/^[>\s]*>+/.test(l)).join('\n');
            s = s.replace(/\n{3,}/g, '\n\n').trim();
            const wroteInline = s.search(/<.+>\s*wrote:/i);
            if (wroteInline >= 0) s = s.slice(0, wroteInline).trim();
            return s;
        };

        const formatReceivedAt = (iso: string | null) => {
            if (!iso) return '';
            try {
                const d = new Date(iso);
                const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                return `${dateStr} • ${timeStr}`;
            } catch (e) {
                return iso;
            }
        };
        // Show latest recipient reply if available
        useEffect(() => {
            let mounted = true;
            let didCancel = false;
            // small debounce to avoid double-fires from rapid prop changes
            const timer = setTimeout(() => {
            (async () => {
                try {
                    if (!selectedApp) { setSelectedAppMessage(null); return; }
                    // do not immediately clear the existing message to avoid flicker; show spinner instead
                    setSelectedAppMessageLoading(true);

                    // Fetch a fresh application row to pick up any server-side updates
                    let freshApp: any = selectedApp;
                    try {
                        const { data: appRow, error: appErr } = await supabase.from('applications').select('*').eq('id', selectedApp.id).single();
                        if (!appErr && appRow) freshApp = appRow;
                    } catch (e) {
                        // ignore and continue with selectedApp
                    }

                    const threadId = freshApp.thread_id || freshApp.threadId || freshApp.raw?.job?.thread_id || freshApp.raw?.thread_id || null;
                    const messageId = freshApp.email_message_id || freshApp.emailMessageId || freshApp.raw?.email_message_id || freshApp.raw?.messageId || null;

                    // Skip if we've just fetched this same thread/message to avoid repeated fetches
                    if (lastFetchedRef.current.threadId === String(threadId) && lastFetchedRef.current.messageId === String(messageId) && selectedAppMessage) {
                        return;
                    }

                    

                    if (threadId) {
                        // avoid overlapping fetches for same thread
                        if (inFlightRef.current[String(threadId)]) {
                            setSelectedAppMessageLoading(false);
                            return;
                        }
                        try {
                            inFlightRef.current[String(threadId)] = true;
                            const msgs = await getEmailMessagesByThread(String(threadId));
                            if (!mounted) { inFlightRef.current[String(threadId)] = false; return; }
                            if (msgs && msgs.length) {
                                const m = msgs[0];
                                const text = extractText(m);
                                setSelectedAppMessage({ ...m, extractedBody: text });
                                lastFetchedRef.current = { threadId: String(threadId), messageId: String(messageId || m.id || '') };
                                inFlightRef.current[String(threadId)] = false;
                                setSelectedAppMessageLoading(false);
                                return;
                            }
                            inFlightRef.current[String(threadId)] = false;
                        } catch (e) {
                            inFlightRef.current[String(threadId)] = false;
                            throw e;
                        }
                    }

                    if (messageId) {
                        // avoid overlapping fetches for same message id
                        if (inFlightRef.current[String(messageId)]) {
                            setSelectedAppMessageLoading(false);
                            return;
                        }
                        try {
                            inFlightRef.current[String(messageId)] = true;
                            const msg = await getEmailMessageById(String(messageId));
                            if (!mounted) { inFlightRef.current[String(messageId)] = false; return; }
                            if (msg) {
                                const text = extractText(msg);
                                setSelectedAppMessage({ ...msg, extractedBody: text });
                                lastFetchedRef.current = { threadId: String(threadId || ''), messageId: String(messageId || msg.id || '') };
                                inFlightRef.current[String(messageId)] = false;
                                setSelectedAppMessageLoading(false);
                                return;
                            }
                            inFlightRef.current[String(messageId)] = false;
                        } catch (e) {
                            inFlightRef.current[String(messageId)] = false;
                            throw e;
                        }
                    }
                    setSelectedAppMessageLoading(false);
                } catch (e) {
                    if (!didCancel) console.warn('Failed to fetch messages for selected app', e);
                }
            })();
            }, 50);
            return () => { mounted = false; didCancel = true; clearTimeout(timer); };
        }, [selectedApp?.id]);
        return (
            <div className="fixed inset-y-0 right-0 w-full md:w-[550px] bg-white dark:bg-gray-900 shadow-2xl transform transition-transform z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200 dark:border-gray-700 backdrop-blur-3xl">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-900/50">
                    <div className="flex justify-between items-start mb-4">
                        <button onClick={() => setSelectedApp(null)} className="flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors">
                            <ArrowRight size={16} className="rotate-180" /> Back
                        </button>
                        <div className="flex gap-2">
                            <button className="p-2 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-gray-600">
                                <ExternalLink size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 flex items-center justify-center text-xl font-bold text-slate-700 dark:text-gray-200 shadow-sm">
                            {String((selectedApp.job && selectedApp.job.company) || '').charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{selectedApp.job.title}</h2>
                            <p className="text-slate-500 dark:text-gray-400 font-medium">{selectedApp.job.company}</p>
                        </div>
                    </div>
                    
                    {/* Status Selector */}
                    <div className="inline-flex bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-1 shadow-sm">
                        {COLUMNS.map(col => (
                            <button
                                key={col.id}
                                onClick={() => handleStatusChange(selectedApp.id, col.id)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all border ${
                                    selectedApp.status === col.id 
                                    ? `${col.bg} ${col.color} ${col.border} ${col.darkBg} ${col.darkColor} ${col.darkBorder} shadow-sm` 
                                    : 'border-transparent text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {col.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 border border-slate-100 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                            <span className="text-xs text-slate-400 dark:text-gray-500 uppercase font-bold block mb-1">Applied On</span>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-gray-200">
                                <Calendar size={14} /> {selectedApp.appliedDate}
                            </div>
                        </div>
                        <div className="p-3 border border-slate-100 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                            <span className="text-xs text-slate-400 dark:text-gray-500 uppercase font-bold block mb-1">Resume Used</span>
                            <div className="flex items-center gap-2 text-sm font-medium text-purple-600 dark:text-purple-400 cursor-pointer hover:underline">
                                <FileText size={14} /> {selectedApp.resume.title}
                            </div>
                        </div>
                    </div>

                    {/* Notes Section */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                            <MessageSquare size={14} /> Notes
                        </h3>
                        <textarea 
                            className="w-full h-32 p-3 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-sm focus:bg-white dark:focus:bg-gray-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all resize-none"
                            placeholder="Add interview notes, questions, or reminders..."
                            defaultValue={selectedApp.notes}
                        ></textarea>
                    </div>

                    {/* Timeline Mockup */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Clock size={14} /> Activity
                        </h3>
                        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-gray-700">
                            <div className="relative">
                                <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900 border-2 border-purple-500 dark:border-purple-400"></div>
                                <p className="text-sm font-bold text-slate-800 dark:text-gray-200">Status updated to {selectedApp.status}</p>
                                <span className="text-xs text-slate-400 dark:text-gray-500">Today</span>
                            </div>
                             <div className="relative">
                                <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-slate-100 dark:bg-gray-700 border-2 border-slate-300 dark:border-gray-500"></div>
                                <p className="text-sm font-bold text-slate-800 dark:text-gray-200">Application Sent</p>
                                <span className="text-xs text-slate-400 dark:text-gray-500">{selectedApp.appliedDate}</span>
                            </div>
                            {/* Latest Reply Section */}
                            {selectedAppMessage && (
                                <div className="mt-6 p-4 border border-slate-100 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Latest Reply</h4>
                                            <div className="text-xs text-slate-500 dark:text-gray-400 mb-2">From: {selectedAppMessage.from_address || selectedAppMessage.headers?.From || ''} • {formatReceivedAt(selectedAppMessage.received_at)}</div>
                                            <div className="text-sm text-slate-800 dark:text-gray-200 whitespace-pre-wrap">{cleanReplyText(selectedAppMessage.extractedBody || selectedAppMessage.body || selectedAppMessage.subject || selectedAppMessage.snippet)}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="p-4 border-t border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 flex justify-between">
                    <button onClick={() => handleDelete(selectedApp.id)} className="px-4 py-2 text-rose-600 dark:text-rose-400 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors">Delete</button>
                    <button onClick={() => setSelectedApp(null)} className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-gray-200 transition-colors">Done</button>
                </div>
            </div>
        );
    };

    return (
        <div className="p-8 max-w-full mx-auto h-full flex flex-col animate-fade-in relative overflow-hidden">
            {/* Backdrop */}
            {selectedApp && <div className="fixed inset-0 bg-slate-900/20 dark:bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSelectedApp(null)}></div>}
            
            {/* Filter Modal */}
            <FilterModal />

            {/* Detail Panel */}
            <ApplicationDetailPanel />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Applications</h1>
                    <p className="text-slate-500 dark:text-gray-400 mt-1">Track and manage your job search pipeline.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* View Toggle */}
                    <div className="bg-white dark:bg-gray-900 p-1 rounded-lg border border-slate-200 dark:border-gray-700 flex items-center shadow-sm">
                        <button onClick={() => setViewMode('board')} className={`p-2 rounded-md transition-all ${viewMode === 'board' ? 'bg-slate-100 dark:bg-gray-700 text-slate-900 dark:text-white' : 'text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-gray-200'}`} title="Board View"><LayoutGrid size={20} /></button>
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-slate-100 dark:bg-gray-700 text-slate-900 dark:text-white' : 'text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-gray-200'}`} title="List View"><List size={20} /></button>
                    </div>

                    <button 
                        onClick={handleExport}
                        className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800 text-slate-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-medium shadow-sm transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Download size={18} className="text-purple-600 dark:text-purple-400" />
                        Export
                    </button>

                    <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="bg-slate-900 dark:bg-gray-800 hover:bg-slate-800 dark:hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg font-medium shadow-lg shadow-slate-900/10 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed active:scale-95"
                    >
                        {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                        {isSyncing ? 'Scanning...' : 'Sync Emails'}
                    </button>
                </div>
            </div>

            {/* Search Bar & Filter */}
            <div className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 mb-6 flex gap-3 shrink-0 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-slate-400 dark:text-gray-500" size={20} />
                    <input 
                        type="text" 
                        placeholder="Filter by company or role..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button 
                    onClick={openFilterModal}
                    className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg font-medium transition-all whitespace-nowrap h-full ${
                        activeStatusFilters.size > 0 
                            ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400' 
                            : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-900'
                    }`}
                >
                    <Filter size={18} />
                    Filter
                    {activeStatusFilters.size > 0 && (
                        <span className="w-5 h-5 bg-purple-600 text-white text-xs flex items-center justify-center rounded-full ml-1">
                            {activeStatusFilters.size}
                        </span>
                    )}
                </button>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="animate-spin text-purple-600 dark:text-purple-400" size={40} />
                </div>
            ) : (
                /* Content Area */
                <div className="flex-1 min-h-0 overflow-x-auto">
                    
                    {/* ================= BOARD VIEW ================= */}
                    {viewMode === 'board' && (
                        <div className="flex gap-6 h-full min-w-[1000px] pb-4">
                            {COLUMNS.map(col => {
                                const colApps = filteredApps.filter(a => a.status === col.id);
                                return (
                                    <div key={col.id} className="flex-1 flex flex-col min-w-[260px] bg-slate-50/50 dark:bg-gray-900/50 rounded-2xl border border-slate-200/60 dark:border-gray-700/50">
                                        {/* Column Header */}
                                        <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-gray-700">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${col.color.replace('text-', 'bg-')}`}></span>
                                                <h3 className="font-bold text-slate-700 dark:text-gray-200 text-sm">{col.label}</h3>
                                            </div>
                                            <span className="text-xs font-bold text-slate-400 dark:text-gray-500 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 px-2 py-0.5 rounded-md">
                                                {colApps.length}
                                            </span>
                                        </div>
                                        
                                        {/* Cards Container */}
                                        <div className="p-3 flex-1 overflow-y-auto space-y-3">
                                            {colApps.length === 0 ? (
                                                <div className="h-24 flex items-center justify-center text-slate-300 dark:text-gray-600 text-xs italic border-2 border-dashed border-slate-200 dark:border-gray-700 rounded-xl m-2">
                                                    No applications
                                                </div>
                                            ) : (
                                                colApps.map(app => (
                                                    <div 
                                                        key={app.id}
                                                        onClick={() => setSelectedApp(app)}
                                                        className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 cursor-pointer transition-all group"
                                                    >
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div className="w-10 h-10 bg-slate-50 dark:bg-gray-800 rounded-lg border border-slate-100 dark:border-gray-700 flex items-center justify-center text-slate-500 dark:text-gray-400 font-bold text-sm">
                                                                {String((app.job && app.job.company) || '').charAt(0)}
                                                            </div>
                                                            <button className="text-slate-300 dark:text-gray-600 hover:text-slate-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <MoreHorizontal size={16} />
                                                            </button>
                                                        </div>
                                                        <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight mb-1">{app.job.title}</h4>
                                                        <p className="text-xs text-slate-500 dark:text-gray-400 font-medium mb-4">{app.job.company}</p>
                                                        
                                                        <div className="flex items-center justify-between pt-3 border-t border-slate-50 dark:border-gray-800">
                                                            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-gray-500">
                                                                <Calendar size={12} /> {app.appliedDate}
                                                            </div>
                                                            {app.resume && (
                                                                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium truncate max-w-[80px]">
                                                                    {app.resume.title}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ================= LIST VIEW ================= */}
                    {viewMode === 'list' && (
                        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-gray-800/50 border-b border-slate-200 dark:border-gray-700 text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                                        <th className="p-4 pl-6">Company & Role</th>
                                        <th className="p-4">Date Applied</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Resume</th>
                                        <th className="p-4 text-right pr-6">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                                    {filteredApps.map(app => {
                                        const statusCol = COLUMNS.find(c => c.id === app.status);
                                        return (
                                        <tr key={app.id} onClick={() => setSelectedApp(app)} className="hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors cursor-pointer group">
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-slate-100 dark:bg-gray-800 rounded-lg flex items-center justify-center text-slate-500 dark:text-gray-400 font-bold text-xs">
                                                        {String((app.job && app.job.company) || '').charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 dark:text-white text-sm">{app.job.title}</div>
                                                        <div className="text-xs text-slate-500 dark:text-gray-400">{app.job.company}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-gray-300">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={14} className="text-slate-400 dark:text-gray-500" /> {app.appliedDate}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${statusCol?.bg} ${statusCol?.color} ${statusCol?.border} ${statusCol?.darkBg} ${statusCol?.darkColor} ${statusCol?.darkBorder}`}>
                                                    {app.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-gray-300">
                                                <span className="truncate max-w-[150px] block hover:text-purple-600 dark:hover:text-purple-400">{app.resume.fileName}</span>
                                            </td>
                                            <td className="p-4 text-right pr-6">
                                                 <button className="p-2 text-slate-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 rounded-full hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                                                    <ChevronRight size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
