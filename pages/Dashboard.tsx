
import React, { useState } from 'react';
import { 
    Briefcase, FileText, TrendingUp, Clock, MapPin, MoreHorizontal,
    Bell, ArrowUpRight, Sparkles, Bookmark, CheckCircle2, Calendar, Plus, Search, Trash2, Loader2
} from 'lucide-react';
import { AppView } from '../types';
import { getResumes, getApplications, searchJobs, getSavedJobs, saveJob, deleteSavedJob } from '../src/api';
import { useNotifications } from '../src/lib/notificationStore';
import { formatDistanceToNow } from 'date-fns';
// Helper: normalize / format postedAt values into readable text (copied from Jobs.tsx)
const formatPostedAt = (postedAt: any) => {
    if (!postedAt) return '';
    try {
        const maybe = String(postedAt || '').trim();
        const parsed = Date.parse(maybe);
        if (!isNaN(parsed)) {
            const d = new Date(parsed);
            const now = Date.now();
            const diff = now - d.getTime();
            if (diff < 60 * 1000) return 'just now';
            if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
            const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
            if (diff < THIRTY_DAYS) {
                return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            }
            const opts: any = { month: 'short', day: 'numeric' };
            if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
            return d.toLocaleDateString(undefined, opts);
        }
    } catch (e) {}
    return String(postedAt);
};

interface DashboardProps {
  onNavigate: (view: AppView) => void;
  onQuickApply: (jobId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onQuickApply }) => {
    // Local interaction state for the dashboard
    const [savedJobs, setSavedJobs] = useState<any[]>([]);
    const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());
    const [resumes, setResumes] = useState<any[]>([]);
    const [applications, setApplications] = useState<any[]>([]);
    const [jobs, setJobs] = useState<any[]>([]);
    const [jobsLoading, setJobsLoading] = useState<boolean>(false);
    const { notifications, markRead } = useNotifications();

  // Derived Metrics
    const statusCounts = applications.reduce((acc: any, a: any) => {
            const s = (a.status || 'Applied');
            acc[s] = (acc[s] || 0) + 1;
            return acc;
    }, {} as Record<string, number>);
    const totalApplications = applications.length;
    const activeInterviews = Object.keys(statusCounts).reduce((n, k) => n + (k.toLowerCase().includes('interview') ? (statusCounts[k] || 0) : 0), 0);
    const totalResumes = resumes.length;
    const newMatches = jobs.filter(j => (j.matchScore || 0) > 85).length;

    const [nextInterview, setNextInterview] = useState<any | null>(null);

  const toggleSave = (e: React.MouseEvent, id: string, job?: any) => {
    e.stopPropagation();
    (async () => {
        try {
            const isSaved = (savedJobs || []).some((s: any) => String(s.job_id || (s.payload && (s.payload.id || s.payload.job_id)) || s.id) === String(id));
            if (isSaved) {
                await deleteSavedJob(String(id));
                setSavedJobs(prev => (prev || []).filter((s: any) => String(s.job_id || (s.payload && (s.payload.id || s.payload.job_id)) || s.id) !== String(id)));
            } else {
                // find job payload if not provided
                let payload = job || jobs.find(j => String(j.id) === String(id)) || null;
                if (!payload) payload = { id };
                const resp = await saveJob(payload);
                // resp may be the saved row
                if (resp) setSavedJobs(prev => [resp, ...(prev || [])]);
            }
        } catch (err) {
            console.warn('Dashboard toggleSave failed', err);
        }
    })();
  };

    const handleDeleteSaved = (e: React.MouseEvent, jobId: string) => {
        e.stopPropagation();
        (async () => {
            try {
                // optional confirm to avoid accidental deletes
                if (!window.confirm || window.confirm('Remove this saved job?')) {
                    await deleteSavedJob(String(jobId));
                    setSavedJobs(prev => (prev || []).filter((s: any) => String(s.job_id || (s.payload && (s.payload.id || s.payload.job_id)) || s.id) !== String(jobId)));
                }
            } catch (err) {
                console.warn('Failed to delete saved job', err);
                try { alert('Failed to remove saved job'); } catch (e) {}
            }
        })();
    };

  const handleQuickApply = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onQuickApply(id);
  };

    React.useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const r = await getResumes();
                const rows = (r || []).map((x: any) => (x.data ? x.data : x));
                if (!mounted) return;
                setResumes(rows);

                const apps = await getApplications();
                if (!mounted) return;
                setApplications(apps || []);

                // compute next interview from applications if available
                try {
                    const interviewApps = (apps || []).filter((a: any) => String(a.status || '').toLowerCase().includes('interview'));
                    if (interviewApps.length > 0) {
                        // prefer apps with explicit interview_date / next_step_at in payload
                        const withDates = interviewApps.map((a: any) => {
                            const app = a.data ? a.data : a;
                            const dt = app.next_step_at || app.interview_date || (app.payload && (app.payload.next_step_at || app.payload.interview_date)) || app.appliedDate || app.applied_date || null;
                            return { raw: app, date: dt };
                        }).sort((x: any, y: any) => {
                            if (!x.date && !y.date) return 0;
                            if (!x.date) return 1;
                            if (!y.date) return -1;
                            return new Date(String(x.date)).getTime() - new Date(String(y.date)).getTime();
                        });
                        const chosen = withDates[0];
                        if (chosen) {
                            const app = chosen.raw;
                            const job = app.raw?.job || app.job || { title: app.job_title || app.title || 'Unknown', company: app.company || 'Unknown' };
                            setNextInterview({
                                company: job.company || app.company || 'Unknown',
                                role: job.title || app.job_title || 'Unknown',
                                date: chosen.date || app.appliedDate || 'TBD',
                                type: 'Interview'
                            });
                        }
                    } else {
                        setNextInterview(null);
                    }
                } catch (e) {
                    console.warn('Failed to compute next interview', e);
                    setNextInterview(null);
                }

                setJobsLoading(true);
                const js = await searchJobs('');
                if (!mounted) return;
                setJobs(js || []);
                setJobsLoading(false);
                // load saved jobs
                try {
                    const rows = await getSavedJobs();
                    setSavedJobs(rows || []);
                } catch (err) {
                    console.warn('Failed to load saved jobs for dashboard', err);
                    setSavedJobs([]);
                }
            } catch (err) {
                console.warn('Dashboard data load error', err);
            }
        })();
        return () => { mounted = false; };
    }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Overview</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Here's what's happening with your job search today.</p>
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => onNavigate(AppView.JOBS)}
                className="px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-sm"
            >
                <Search size={18} /> Find Jobs
            </button>
            <button 
                onClick={() => onNavigate(AppView.RESUMES)}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 flex items-center gap-2"
            >
                <Plus size={18} /> New Application
            </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Applications - Changed from Blue to Indigo */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between group hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors cursor-pointer" onClick={() => onNavigate(AppView.APPLICATIONS)}>
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Applications</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalApplications}</h3>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                    <TrendingUp size={12} /> +2 this week
                </p>
            </div>
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                <Briefcase size={22} />
            </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between group hover:border-purple-300 dark:hover:border-purple-600 transition-colors cursor-pointer" onClick={() => onNavigate(AppView.APPLICATIONS)}>
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Interviews</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{activeInterviews}</h3>
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1 flex items-center gap-1">
                    Action Required
                </p>
            </div>
            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                <Calendar size={22} />
            </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between group hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors cursor-pointer" onClick={() => onNavigate(AppView.RESUMES)}>
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Resumes Optimized</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalResumes}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Last updated 2h ago</p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                <FileText size={22} />
            </div>
        </div>

        <div className="bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-lg shadow-purple-900/20 flex items-center justify-between relative overflow-hidden cursor-pointer border border-purple-500/30" onClick={() => onNavigate(AppView.JOBS)}>
            <div className="relative z-10">
                <p className="text-sm font-medium text-purple-100">New Job Matches</p>
                <h3 className="text-2xl font-bold mt-1 text-white">{newMatches}</h3>
                <p className="text-xs text-purple-200 font-medium mt-1 flex items-center gap-1">
                    <Sparkles size={12} /> High relevance
                </p>
            </div>
            <div className="relative z-10 w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white backdrop-blur-md border border-white/10">
                <Bell size={22} />
            </div>
            {/* Decorative background elements */}
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/30 rounded-full blur-2xl"></div>
            <div className="absolute -left-4 -bottom-4 w-20 h-20 bg-indigo-500/30 rounded-full blur-2xl"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Main Feed */}
        <div className="lg:col-span-2 space-y-8">
            
            {/* Upcoming Schedule */}
            <section>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Clock size={20} className="text-gray-400" /> Up Next
                </h2>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-1 shadow-sm">
                    <div onClick={() => { try { window.history.pushState({}, '', '/jobs'); } catch (e) {} ; onNavigate(AppView.JOBS); }} className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer">
                        <div className="flex flex-col items-center justify-center w-14 h-14 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50 shrink-0">
                            <span className="text-xs font-bold uppercase">Next</span>
                            <span className="text-xl font-bold">{nextInterview ? (isNaN(new Date(String(nextInterview.date)).getTime()) ? '—' : new Date(String(nextInterview.date)).getDate()) : '—'}</span>
                        </div>
                        <div className="flex-1">
                            {nextInterview ? (
                                <>
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-gray-900 dark:text-white">{nextInterview.type}</h3>
                                        <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-md">Interview</span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                        {nextInterview.role} at <span className="font-semibold text-gray-900 dark:text-gray-200">{nextInterview.company}</span>
                                    </p>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        <span className="flex items-center gap-1"><Clock size={12} /> {String(nextInterview.date)}</span>
                                        <span className="flex items-center gap-1"><MapPin size={12} /> {nextInterview.location || 'TBD'}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-600 dark:text-gray-400">No upcoming interviews yet. Try improving your match to get interviews.</div>
                                    <div className="ml-4 flex items-center gap-2">
                                      {/* Decorative arrow indicates card is clickable */}
                                      <div className="p-2 text-gray-400">
                                        <ArrowUpRight size={20} />
                                      </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* whole card is clickable; arrow is decorative */}
                        
                    </div>
                </div>
            </section>

            {/* Recent Job Matches */}
            <section>
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Sparkles size={20} className="text-gray-400" /> Top Picks for You
                    </h2>
                    <button onClick={() => onNavigate(AppView.JOBS)} className="text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:underline">
                        View All Matches
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {jobsLoading ? (
                        <div className="col-span-1 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center">
                            <div className="flex items-center gap-3 text-gray-500">
                                <Loader2 className="animate-spin text-purple-600" size={24} />
                                <span className="text-sm">Loading jobs...</span>
                            </div>
                        </div>
                    ) : (
                        (jobs || []).slice(0, 4).map((job, idx) => {
                        const isSaved = (savedJobs || []).some((s: any) => String(s.job_id || (s.payload && s.payload.id) || (s.payload && s.payload.job_id) || s.id) === String(job.id));
                         const isApplied = appliedJobs.has(job.id) || job.status === 'Applied';

                         return (
                             <div
                                 key={job.id}
                                 className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800 transition-all group cursor-pointer"
                                 onClick={() => {
                                     try { window.history.pushState({}, '', `/jobs?openJob=${encodeURIComponent(String(job.id))}`); } catch (e) {}
                                     onNavigate(AppView.JOBS);
                                 }}
                             >
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-400 font-bold text-lg">
                                            {job.company.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900 dark:text-white text-lg group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{job.title}</h4>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">
                                                    {job.company} 
                                                    <span className="w-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></span> 
                                                    {job.location}
                                                </p>
                                                <div className="text-xs text-gray-400 mt-1">{formatPostedAt(job.postedAt)}</div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                         <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 px-2.5 py-1 rounded-lg">
                                            <Sparkles size={12} className="text-emerald-600 dark:text-emerald-400" />
                                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{job.matchScore}% Match</span>
                                         </div>
                                         {/* date moved under company info for consistency */}
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        {((job.tags && job.tags.length) ? job.tags.slice(0, 4) : ['General']).map((skill: string, i: number) => (
                                            <span key={i} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md font-medium">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                    {/* Action buttons visible at all times */}
                                    <div className="flex gap-2">
                                                      <button 
                                                          onClick={(e) => toggleSave(e, job.id, job)}
                                            className={`px-4 py-2 border text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                                                isSaved 
                                                ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400' 
                                                : 'bg-gray-100 dark:bg-gray-800 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                                            }`}
                                         >
                                            <Bookmark size={14} fill={isSaved ? "currentColor" : "none"} />
                                            {isSaved ? 'Saved' : 'Save'}
                                         </button>

                                         <button 
                                            onClick={(e) => !isApplied && handleQuickApply(e, job.id)}
                                            disabled={isApplied}
                                            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                                                isApplied 
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-default' 
                                                : 'bg-gray-900 dark:bg-white hover:bg-purple-600 dark:hover:bg-gray-200 text-white dark:text-gray-900 shadow-md'
                                            }`}
                                         >
                                            {isApplied && <CheckCircle2 size={14} />}
                                            {isApplied ? 'Applied' : 'Apply'}
                                         </button>
                                    </div>
                                </div>
                             </div>
                        );
                    }))}
                </div>
            </section>
        </div>

        {/* Right Column: Activity & Stats */}
        <div className="space-y-8">
            
            {/* Application Pipeline - Mini Visualization */}
            <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center justify-between">
                    Pipeline Status
                    <button className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        <MoreHorizontal size={16} />
                    </button>
                </h3>
                
                <div className="relative space-y-6 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 dark:before:bg-gray-700">
                    {[
                        { label: 'Applied', key: 'Applied', color: 'bg-purple-500' },
                        { label: 'Screening', key: 'Screening', color: 'bg-indigo-500' },
                        { label: 'Interview', key: 'Interviewing', color: 'bg-amber-500' },
                        { label: 'Offer', key: 'Offer', color: 'bg-emerald-500' },
                        { label: 'Rejected', key: 'Rejected', color: 'bg-slate-400' }
                    ].map((stage, i) => (
                        <div key={i} className="relative pl-10 flex items-center justify-between">
                            <div className={`absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 ${stage.color} z-10 shadow-sm`}></div>
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{stage.label}</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{String(statusCounts[stage.key] || 0)}</span>
                        </div>
                    ))}
                </div>
                
                <button onClick={() => onNavigate(AppView.APPLICATIONS)} className="w-full mt-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white border border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    View Kanban Board
                </button>
            </section>

            {/* Saved Jobs */}
            <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white">Saved Jobs</h3>
                </div>
                {savedJobs.length === 0 ? (
                    <div className="text-sm text-gray-500">You have no saved jobs yet. Save interesting roles from the Jobs tab.</div>
                ) : (
                    <div className="space-y-3">
                        {(savedJobs || []).slice(0,5).map((s: any) => {
                            const jobPayload = s.payload || {};
                            const jobId = s.job_id || jobPayload.id || jobPayload.job_id || s.id;
                            const title = jobPayload.title || jobPayload.job_title || jobPayload.name || 'Untitled Role';
                            const company = jobPayload.company || jobPayload.company_name || jobPayload.companyName || '';
                            return (
                                <div
                                    key={String(jobId)}
                                    className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                    onClick={() => {
                                        try { window.history.pushState({}, '', `/jobs?openJob=${encodeURIComponent(String(jobId))}`); } catch (e) {}
                                        onNavigate(AppView.JOBS);
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-100 dark:bg-gray-800 rounded-md flex items-center justify-center text-sm font-bold text-slate-700">{String((company||'').charAt(0) || title.charAt(0))}</div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</div>
                                            <div className="text-xs text-gray-400 truncate">{company}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => handleDeleteSaved(e, String(jobId))}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                            aria-label="Remove saved job"
                                            title="Remove saved job"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

                        {/* Recent Activity Feed */}
            <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                 <h3 className="font-bold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                 <div className="space-y-4">
                                     {(() => {
                                            const recent = (notifications || []).slice(0,5);
                                            if ((recent || []).length === 0) return <div className="text-sm text-gray-500">No recent activity</div>;
                                            return recent.map((n, i) => {
                                                const Icon = n.type === 'resume_analysis' ? CheckCircle2 : (n.type === 'resume_parsed' ? FileText : Bell);
                                                return (
                                                    <div key={n.id || i} className="flex gap-3 items-start">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.priority === 'important' ? 'bg-amber-50 text-amber-500 dark:bg-amber-900/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-600'}`}>
                                                            <Icon size={14} />
                                                        </div>
                                                        <div>
                                                            <button
                                                                onClick={() => {
                                                                    try {
                                                                        markRead && markRead(String(n.id));
                                                                    } catch (e) {}
                                                                    // navigate to notification URL if present
                                                                    try {
                                                                        if (n.url && typeof n.url === 'string') {
                                                                            // SPA-friendly navigation: use pushState and map to views when possible
                                                                            if (n.url.startsWith('/resumes')) {
                                                                                try { window.history.pushState({}, '', n.url); } catch (e) {}
                                                                                onNavigate(AppView.RESUMES);
                                                                                return;
                                                                            }
                                                                            if (n.url.startsWith('/jobs')) {
                                                                                try { window.history.pushState({}, '', n.url); } catch (e) {}
                                                                                onNavigate(AppView.JOBS);
                                                                                return;
                                                                            }
                                                                            if (n.url.startsWith('/applications')) {
                                                                                try { window.history.pushState({}, '', n.url); } catch (e) {}
                                                                                onNavigate(AppView.APPLICATIONS);
                                                                                return;
                                                                            }
                                                                            // fallback: full navigation
                                                                            window.location.href = n.url;
                                                                        } else if (n.payload && n.payload.resumeId) {
                                                                            const url = `/resumes/${encodeURIComponent(String(n.payload.resumeId))}`;
                                                                            try { window.history.pushState({}, '', url); } catch (e) {}
                                                                            onNavigate(AppView.RESUMES);
                                                                        }
                                                                    } catch (e) {
                                                                        // ignore navigation errors
                                                                    }
                                                                }}
                                                                className="text-left"
                                                            >
                                                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{n.title || n.message}</p>
                                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ''}</p>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                     })()}
                 </div>
            </section>

            {/* Tip Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <h4 className="font-bold text-lg mb-2">Pro Tip</h4>
                    <p className="text-sm text-purple-100 leading-relaxed mb-4">
                        Tailoring your resume for each application increases your interview chances by 40%.
                    </p>
                    <button 
                        onClick={() => onNavigate(AppView.RESUMES)}
                        className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg transition-colors backdrop-blur-md border border-white/20"
                    >
                        Try Resume Tuning
                    </button>
                </div>
                <Sparkles className="absolute -right-4 -bottom-4 text-white/10 w-32 h-32 rotate-12" />
            </div>

        </div>
      </div>
    </div>
  );
};