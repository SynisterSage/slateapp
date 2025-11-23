
import React, { useState, useEffect } from 'react';
import { 
    LayoutGrid, List, RefreshCw, Search, Filter, MoreVertical, 
    Calendar, Building2, FileText, CheckCircle2, XCircle, 
    Clock, MessageSquare, ArrowRight, Mail, ChevronRight, ExternalLink,
    MoreHorizontal, Loader2, AlertCircle, X, Download
} from 'lucide-react';
import { Application, Job, Resume } from '../types';
import { getApplications, getResumes, createApplication, updateApplication, deleteApplicationById } from '../src/api';

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

    const handleSync = () => {
        setIsSyncing(true);
        // Simulate API call to email provider
        setTimeout(() => {
            setIsSyncing(false);
            // Mock: Add a new 'Interviewing' item found via email
            const sampleJob = applications[0]?.job || { id: 'j_sample', title: 'Sample Role', company: 'Company', location: 'Remote' };
            const sampleResume = applications[0]?.resume || { id: 'r_sample', title: 'Sample Resume' };
            const newAppPayload = {
                id: `a_sync_${Date.now()}`,
                jobId: sampleJob.id,
                resumeId: sampleResume.id,
                status: 'Interviewing',
                appliedDate: new Date().toISOString(),
                notes: 'Auto-detected from email subject "Interview Request"',
                // Optionally store a raw job snapshot so UI can hydrate later
                raw: { job: sampleJob }
            };
            // Persist to Supabase and update UI
            (async () => {
                try {
                    const created = await createApplication(newAppPayload);
                    const hydrated: HydratedApplication = { ...(created as any), job: sampleJob, resume: sampleResume };
                    setApplications(prev => [hydrated, ...prev]);
                    alert("Sync Complete: Found 1 new update from your inbox.");
                } catch (err) {
                    console.error('Sync persist error', err);
                    alert('Sync failed to persist. See console for details.');
                }
            })();
        }, 2000);
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
            const matchesSearch = app.job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  app.job.title.toLowerCase().includes(searchTerm.toLowerCase());
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
            return b.appliedDate.localeCompare(a.appliedDate);
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
                            {selectedApp.job.company.charAt(0)}
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
                                                                {app.job.company.charAt(0)}
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
                                                        {app.job.company.charAt(0)}
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
