

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, MoreVertical, Loader2, LayoutGrid, List, Briefcase, Trash2, Copy, PenLine, Download, CheckCircle2, AlertTriangle, Clock, Search, X, FileUp, ShieldCheck, ArrowRight } from 'lucide-react';
import supabase from '../src/lib/supabaseClient';
import { getResumes } from '../src/api';
import { Resume } from '../types';

interface ResumesProps {
    onSelectResume: (id: string) => void;
    onFindJobs?: (id: string) => void;
}

export const Resumes: React.FC<ResumesProps> = ({ onSelectResume, onFindJobs }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [resumes, setResumes] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Upload State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
    // Preview State removed - parsing will happen in editor

  // Close menu when clicking outside (handled by transparent backdrop)
  const closeMenu = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveMenuId(null);
  };

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  // --- File Handling Logic ---

  const processFile = (file: File) => {
      if (file.type !== 'application/pdf') {
          alert('Please upload a PDF file.');
          return;
      }

      setIsUploadModalOpen(false); // Close modal if open
      setIsDraggingOver(false); // Remove overlay
      setIsUploading(true);

            // Mock upload delay
            setTimeout(async () => {
                const newResume: Resume = {
            id: `r${Date.now()}`,
            title: file.name.replace('.pdf', ''),
            fileName: file.name,
            lastUpdated: 'Just now',
            personalInfo: {
                fullName: 'New Candidate',
                email: 'email@example.com',
                phone: 'Phone',
                location: 'City, Country',
                website: 'website.com',
                summary: 'Resume summary goes here...'
            },
            experience: [],
            education: [],
            skills: [],
            revisions: [{ id: `rev${Date.now()}`, name: 'Original', createdAt: 'Just now', tags: ['Processing'], contentSummary: 'Analysis pending...' }],
            analysis: {
                overallScore: 50,
                categories: { impact: 50, brevity: 50, style: 50, ats: 50 },
                issues: []
            }
        };
                // persist to Supabase
                try {
                    // Upload PDF to storage then persist a resume row that references it
                    // Sanitize the filename for storage object naming (keep original displayed name).
                    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    // Use a path *relative to the bucket* (do not include the bucket name here)
                    const path = `${newResume.id}/${safeFileName}`;
                    try {
                        // Upload via server endpoint so the service role can write to storage and persist the row
                        // Include current user's uid as `owner` so server can set the owner column (avoids null owner rows)
                        let ownerUid: string | null = null;
                        try {
                            const userRes: any = await supabase.auth.getUser();
                            const user = userRes && userRes.data ? userRes.data.user : null;
                            if (user && user.id) ownerUid = user.id;
                        } catch (e) {
                            // ignore - proceed without owner
                        }
                        const qs = new URLSearchParams({ resumeId: newResume.id, fileName: file.name });
                        if (ownerUid) qs.set('owner', ownerUid);
                        const uploadUrl = `/api/upload-resume?${qs.toString()}`;
                        const resp = await fetch(uploadUrl, { method: 'POST', body: file });
                        if (!resp.ok) {
                            const body = await resp.json().catch(() => ({}));
                            console.error('Server upload failed', resp.status, body);
                            alert('Upload failed on server. Check dev-server logs.');
                        } else {
                            const body = await resp.json();
                            // If server returned the persisted row, use it directly (avoids anon RLS issues)
                            if (body && body.row) {
                                const row = body.row;
                                const rowData = row.data ? row.data : row;
                                // Use functional update to avoid stale closure over `resumes`
                                setResumes(prev => [rowData, ...prev]);
                                // Invalidate getResumes cache so other components will refetch
                                try { (globalThis as any)._slate_resumes_cache = null; } catch (e) {}
                            } else {
                                // Fallback: try to fetch the persisted row directly from the server proxy
                                try {
                                    console.debug('Upload response missing row; trying server proxy /api/get-resume');
                                    const resp2 = await fetch(`/api/get-resume?id=${encodeURIComponent(newResume.id)}`);
                                    if (resp2.ok) {
                                        const j2 = await resp2.json();
                                        const fetched = j2.row || j2;
                                        const rowData = fetched && fetched.data ? fetched.data : fetched;
                                        if (rowData) {
                                            setResumes(prev => [rowData, ...prev]);
                                            try { (globalThis as any)._slate_resumes_cache = null; } catch (e) {}
                                        } else {
                                            console.warn('Server proxy returned no row for uploaded resume', j2);
                                        }
                                    } else {
                                        console.warn('Server proxy /api/get-resume failed', resp2.status);
                                    }
                                } catch (fetchErr) {
                                    console.warn('Failed to fetch persisted resume after upload', fetchErr);
                                }
                            }
                            // No client-side parse step needed; server returns parsed revision when available
                        }
                    } catch (e) {
                        console.error('Upload to server failed', e);
                        alert('Upload failed. See console for details.');
                    }
                } catch (err) {
                    console.error('Failed to persist resume', err);
                }
                                                                setIsUploading(false);
    }, 1500);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
    }
  };

  // Global Drag Events
  const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      // Only set to false if we are leaving the main container
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDraggingOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          processFile(e.dataTransfer.files[0]);
      }
  };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this resume?')) return;

        // Try client delete first but request the deleted row back with `.select()` so
        // we can confirm whether the delete actually removed a row (RLS may block it).
        try {
            const { data: deleted, error } = await supabase.from('resumes').delete().eq('id', id).select();
            if (error) {
                console.warn('Client delete returned error, falling back to server proxy', error);
            }

            if (Array.isArray(deleted) && deleted.length > 0) {
                // Delete confirmed — update UI
                setResumes(prev => prev.filter(r => r.id !== id));
                setActiveMenuId(null);
                // Invalidate cache so list refreshes elsewhere
                try { (globalThis as any)._slate_resumes_cache = null; } catch (e) {}
                return;
            }
        } catch (e) {
            console.warn('Client delete threw, will attempt server proxy', e);
        }

        // If we reach here, client-side delete didn't remove the row — use server proxy
        try {
            const resp = await fetch(`/api/delete-resume?id=${encodeURIComponent(id)}`, { method: 'POST' });
            if (!resp.ok) {
                const text = await resp.text().catch(() => '');
                console.error('Server proxy delete failed', resp.status, text);
                alert('Delete failed. See console for details.');
                return;
            }
            const json = await resp.json();
            console.debug('Server proxy delete succeeded', json);
            // Refresh full list to reflect server state
            try {
                const api = await import('../src/api');
                const refreshed = await api.getResumes();
                const rows = (refreshed || []).map((r:any) => (r.data ? r.data : r));
                setResumes(rows);
            } catch (fetchErr) {
                console.warn('Failed to refresh resumes after server delete', fetchErr);
                // still optimistically remove from UI
                setResumes(prev => prev.filter(r => r.id !== id));
            }
            setActiveMenuId(null);
            try { (globalThis as any)._slate_resumes_cache = null; } catch (e) {}
        } catch (err) {
            console.error('Server proxy delete threw', err);
            alert('Delete failed. See console.');
        }
    };

  const handleDuplicate = (e: React.MouseEvent, resume: Resume) => {
    e.stopPropagation();
    const newResume = {
        ...resume,
        id: `copy_${Date.now()}`,
        title: `${resume.title} (Copy)`,
        fileName: resume.fileName.replace('.pdf', '_copy.pdf'),
        lastUpdated: 'Just now'
    };
        supabase.from('resumes').upsert({ id: newResume.id, data: newResume }).then(({ error }) => {
            if (error) console.error('Duplicate error', error);
        });
        setResumes([newResume, ...resumes]);
    setActiveMenuId(null);
  };

  const handleRename = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const name = prompt("Enter new name:");
      if (name) {
                    const updated = resumes.map(r => r.id === id ? { ...r, title: name } : r);
                    const target = updated.find(r => r.id === id);
                    if (target) supabase.from('resumes').upsert({ id: target.id, data: target }).then(({ error })=> { if (error) console.error(error); });
                    setResumes(updated);
      }
      setActiveMenuId(null);
  };

    // Load resumes from Supabase on mount
    React.useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const data = await getResumes();
                if (!mounted) return;
                // data is array of rows; each row may be { id, data }
                const rows = (data || []).map((r: any) => (r.data ? r.data : r));
                setResumes(rows);
            } catch (err) {
                console.warn('Failed to load resumes', err);
            }
        })();
        return () => { mounted = false; };
    }, []);

    // Listen for external updates (e.g. parsed import applied in the editor)
    React.useEffect(() => {
        const handler = async (e: any) => {
            try {
                console.debug('[resumes:updated] event received', e && e.detail);
                const detail = e && e.detail ? e.detail : null;
                const id = detail && detail.id ? detail.id : null;
                // If the event included the full row, use it directly (no network)
                if (detail && detail.row) {
                    const rowData = detail.row;
                    setResumes(prev => {
                        const filtered = (prev || []).filter(r => r.id !== rowData.id);
                        return [rowData, ...filtered];
                    });
                    try { (globalThis as any)._slate_resumes_cache = null; } catch (err) {}
                    return;
                }

                if (!id) {
                    console.debug('[resumes:updated] no id in event; refreshing full list');
                    try { (globalThis as any)._slate_resumes_cache = null; } catch (err) {}
                    const all = await getResumes();
                    const rows = (all || []).map((r:any) => (r.data ? r.data : r));
                    setResumes(rows);
                    return;
                }

                // Try server proxy first for a consistent view (handles RLS/dev rows)
                console.debug('[resumes:updated] fetching updated resume id=', id);
                const resp = await fetch(`/api/get-resume?id=${encodeURIComponent(id)}`);
                if (resp.ok) {
                    const j = await resp.json();
                    const fetched = j.row || j;
                    const rowData = fetched && fetched.data ? fetched.data : fetched;
                    if (rowData) {
                        setResumes(prev => {
                            const filtered = (prev || []).filter(r => r.id !== rowData.id);
                            return [rowData, ...filtered];
                        });
                        try { (globalThis as any)._slate_resumes_cache = null; } catch (err) {}
                        return;
                    }
                }
                // Fallback: refresh full list
                console.debug('[resumes:updated] server proxy failed; refreshing full list');
                try { (globalThis as any)._slate_resumes_cache = null; } catch (err) {}
                const all2 = await getResumes();
                const rows2 = (all2 || []).map((r:any) => (r.data ? r.data : r));
                setResumes(rows2);
            } catch (err) {
                console.warn('Failed to refresh resume after update event', err);
            }
        };

        window.addEventListener('resumes:updated', handler as EventListener);
        return () => {
            window.removeEventListener('resumes:updated', handler as EventListener);
        };
    }, []);

  const handleDownload = (e: React.MouseEvent) => {
      e.stopPropagation();
      alert("Downloading PDF...");
      setActiveMenuId(null);
  }

  const handleFindJobsClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (onFindJobs) onFindJobs(id);
      setActiveMenuId(null);
  }

  // --- Components ---

  const UploadModal = () => {
      if (!isUploadModalOpen) return null;
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div 
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-8 animate-in scale-95 duration-200 border border-slate-200 dark:border-gray-700 relative"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
                }}
              >
                  <button 
                    onClick={() => setIsUploadModalOpen(false)}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                  >
                      <X size={20} />
                  </button>

                  <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-purple-50 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-purple-600 dark:text-purple-400">
                          <UploadCloud size={32} />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Upload Resume</h2>
                      <p className="text-slate-500 dark:text-gray-400 mt-2">Import your resume to get instant AI analysis.</p>
                  </div>

                  {/* Drop Zone */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-gray-600 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-800/50 hover:border-purple-400 dark:hover:border-purple-500 transition-all group"
                  >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".pdf"
                        onChange={handleFileSelect}
                      />
                      <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <FileUp size={28} className="text-purple-600 dark:text-purple-400" />
                      </div>
                      <p className="font-bold text-slate-700 dark:text-gray-200 text-lg">Click to upload or drag and drop</p>
                      <p className="text-sm text-slate-400 dark:text-gray-500 mt-2">PDF files only (Max 10MB)</p>
                  </div>

                  <div className="mt-6 flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl">
                      <ShieldCheck size={20} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-purple-800 dark:text-purple-300">
                          <strong>Privacy First:</strong> Your resume is processed securely. We parse your skills and experience to find the best job matches for you.
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  

  return (
    <div 
        className="p-8 max-w-7xl mx-auto animate-fade-in min-h-full relative" 
        onClick={() => setActiveMenuId(null)}
        onDragOver={onDragOver}
    >
        {/* Full Page Drag Overlay */}
        {isDraggingOver && (
            <div 
                className="fixed inset-0 z-[60] bg-purple-900/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-200"
                onDragLeave={onDragLeave}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
            >
                <div className="pointer-events-none text-center animate-bounce">
                    <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
                        <UploadCloud size={64} className="text-purple-600" />
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-4">Drop your resume here</h2>
                    <p className="text-purple-200 text-xl">We'll handle the rest!</p>
                </div>
            </div>
        )}

        {/* Backdrop for closing menus */}
        {activeMenuId && <div className="fixed inset-0 z-0 bg-transparent" onClick={closeMenu}></div>}

        {/* Upload Modal */}
        <UploadModal />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Resumes</h1>
                <p className="text-slate-500 dark:text-gray-400 mt-1">Manage your resume versions, track AI parsing, and view analysis scores.</p>
            </div>
            
            <div className="flex items-center gap-3">
                {/* View Toggle */}
                <div className="bg-white dark:bg-gray-900 p-1 rounded-lg border border-slate-200 dark:border-gray-700 flex items-center shadow-sm">
                    <button 
                        onClick={() => setViewMode('card')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'card' ? 'bg-slate-100 dark:bg-gray-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}
                        title="Card View"
                    >
                        <LayoutGrid size={20} />
                    </button>
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-slate-100 dark:bg-gray-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}
                        title="List View"
                    >
                        <List size={20} />
                    </button>
                </div>

                <button 
                    onClick={() => setIsUploadModalOpen(true)}
                    disabled={isUploading}
                    className="bg-slate-900 dark:bg-gray-800 hover:bg-slate-800 dark:hover:bg-gray-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-slate-900/10 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed active:scale-95"
                >
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
                    {isUploading ? 'Parsing...' : 'Upload Resume'}
                </button>
            </div>
        </div>

        {resumes.length === 0 ? (
             <div 
                className="border-2 border-dashed border-slate-300 dark:border-gray-700 rounded-2xl p-16 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-gray-900 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors cursor-pointer" 
                onClick={() => setIsUploadModalOpen(true)}
             >
                <div className="w-20 h-20 bg-slate-200 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
                    <UploadCloud size={40} className="text-slate-400 dark:text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 dark:text-white">No resumes uploaded yet</h3>
                <p className="text-slate-500 dark:text-gray-400 max-w-sm mt-2 mb-6">Upload your PDF resume to get an instant AI score and start optimizing it for jobs.</p>
                <button className="text-purple-600 dark:text-purple-400 font-semibold hover:underline">Browse Files</button>
             </div>
        ) : (
            <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" : "flex flex-col gap-4"}>
                {resumes.map(resume => {
                    // Create a display-only merged resume that prefers server-parsed revision data
                    const merged = (() => {
                        try {
                            const base = JSON.parse(JSON.stringify(resume || {}));
                            const revs = Array.isArray(base.revisions) ? base.revisions.slice().reverse() : [];
                            // Find the most recent parsed revision that includes a `parsed` blob
                            const parsedRev = revs.find((r:any) => r && (r.parsed || (r.tags && (r.tags.includes('parsed') || r.tags.includes('Auto-Parsed') || r.tags.includes('import')))));
                            if (parsedRev && parsedRev.parsed) {
                                const p = parsedRev.parsed;
                                base.personalInfo = base.personalInfo || { fullName: '', email: '', phone: '', summary: '' };
                                // Only show parsed fields if top-level seems empty or generic
                                if (!base.personalInfo.fullName || base.personalInfo.fullName === 'New Candidate' || base.personalInfo.fullName.trim() === '') {
                                    if (p.name) base.personalInfo.fullName = p.name;
                                }
                                if (!base.personalInfo.email && p.email) base.personalInfo.email = p.email;
                                if (!base.personalInfo.phone && p.phone) base.personalInfo.phone = p.phone;
                                if ((!base.personalInfo.summary || base.personalInfo.summary.trim() === '') && p.text) base.personalInfo.summary = (p.text || '').slice(0, 200);
                                // Map parsed skills (comma string) into skills array if no skills exist
                                if ((!Array.isArray(base.skills) || base.skills.length === 0) && p.skills) {
                                    const skillList = String(p.skills || '').split(',').map((s:string) => s.trim()).filter(Boolean).slice(0, 20);
                                    base.skills = skillList.map((s:string) => ({ name: s, level: 'Intermediate' }));
                                }
                            }
                            return base;
                        } catch (e) {
                            return resume;
                        }
                    })();

                    // Derived Data for UI (use merged display object)
                    const skills = merged.skills || [];
                    const experience = merged.experience || [];
                    const criticalIssuesCount = merged.analysis?.issues.filter((i:any) => i.severity === 'critical').length || 0;
                    const topSkills = skills.slice(0, 3);
                    
                    // Shared Dropdown Menu
                    const MenuDropdown = () => (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right backdrop-blur-sm">
                            <button onClick={(e) => handleFindJobsClick(e, resume.id)} className="w-full text-left px-4 py-2.5 text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 font-medium flex items-center gap-2">
                                <Search size={14} /> Find Related Jobs
                            </button>
                            <div className="h-px bg-slate-100 dark:bg-gray-700 my-1" />
                            <button onClick={(e) => handleRename(e, resume.id)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 flex items-center gap-2">
                                <PenLine size={14} /> Rename
                            </button>
                            <button onClick={(e) => handleDuplicate(e, resume)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 flex items-center gap-2">
                                <Copy size={14} /> Duplicate
                            </button>
                            <button onClick={(e) => handleDownload(e)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 flex items-center gap-2">
                                <Download size={14} /> Download PDF
                            </button>
                            <div className="h-px bg-slate-100 dark:bg-gray-700 my-1" />
                            <button onClick={(e) => handleDelete(e, resume.id)} className="w-full text-left px-4 py-2.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2 font-medium">
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
                    );

                    return (
                        <div 
                            key={resume.id} 
                            className={`bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 transition-all hover:shadow-lg group relative ${
                                viewMode === 'card' ? 'rounded-2xl flex flex-col overflow-visible' : 'rounded-xl p-5 flex items-center gap-6 overflow-visible'
                            }`}
                        >
                            {/* ================= CARD VIEW LAYOUT ================= */}
                            {viewMode === 'card' && (
                                <>
                                    <div className="p-6 flex-1 flex flex-col relative">
                                        {/* Top Row: Icon + Score + Menu */}
                                        <div className="flex justify-between items-start mb-5 relative z-10">
                                            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-900/30 flex items-center justify-center shrink-0">
                                                <FileText size={24} className="text-purple-600 dark:text-purple-400" />
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                {resume.analysis?.overallScore ? (
                                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                                        resume.analysis.overallScore >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30' : 
                                                        resume.analysis.overallScore >= 60 ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30' : 
                                                        'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30'
                                                    }`}>
                                                        {resume.analysis.overallScore}
                                                        <span className="text-[10px] opacity-70 font-medium">/100</span>
                                                    </div>
                                                ) : (
                                                    <div className="bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-gray-400 text-xs px-2 py-1 rounded-md">Parsed</div>
                                                )}

                                                {/* Card Menu Button */}
                                                <div className="relative">
                                                    <button 
                                                        onClick={(e) => toggleMenu(e, resume.id)}
                                                        className={`p-1.5 rounded-lg transition-colors ${activeMenuId === resume.id ? 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-white' : 'text-slate-300 dark:text-gray-600 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}
                                                    >
                                                        <MoreVertical size={18} />
                                                    </button>
                                                    {activeMenuId === resume.id && <MenuDropdown />}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Title & Info */}
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1.5 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-1" title={resume.title}>
                                                {resume.title}
                                            </h3>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                                                <span className="truncate max-w-[120px]">{merged.fileName || resume.fileName}</span>
                                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-gray-600"></span>
                                                <span>{merged.lastUpdated || resume.lastUpdated}</span>
                                            </div>
                                        </div>

                                        {/* Skills */}
                                        <div className="mb-auto">
                                            <div className="flex flex-wrap gap-1.5">
                                                {topSkills.map(skill => (
                                                    <span key={skill.name} className="px-2 py-1 bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-300 text-[10px] rounded border border-slate-100 dark:border-gray-700 font-medium">
                                                        {skill.name}
                                                    </span>
                                                ))}
                                                {skills.length > 3 && (
                                                    <span className="px-2 py-1 bg-slate-50 dark:bg-gray-800 text-slate-400 dark:text-gray-500 text-[10px] rounded border border-slate-100 dark:border-gray-700 font-medium">
                                                        +{skills.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Inline Status Indicator */}
                                        <div className="mt-5 pt-4 border-t border-slate-50 dark:border-gray-700 flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400">
                                                                <Briefcase size={12} />
                                                                <span>{experience.length} Roles</span>
                                                            </div>
                                            
                                            {criticalIssuesCount > 0 ? (
                                                <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                                                    <AlertTriangle size={12} /> {criticalIssuesCount} Issues
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                                    <CheckCircle2 size={12} /> Ready
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Bottom Action */}
                                    <div className="p-3 bg-slate-50 dark:bg-gray-800/50 border-t border-slate-100 dark:border-gray-700 rounded-b-2xl flex flex-col gap-2">
                                        <button 
                                            onClick={() => onSelectResume(resume.id)}
                                            className="w-full py-2 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 hover:shadow-sm text-slate-700 dark:text-gray-200 font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            Open Studio <ArrowRight size={14} />
                                        </button>
                                        <button 
                                            onClick={(e) => handleFindJobsClick(e, resume.id)}
                                            className="w-full py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Search size={14} /> Find Related Jobs
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* ================= LIST VIEW LAYOUT ================= */}
                            {viewMode === 'list' && (
                                <>
                                    {/* Icon */}
                                    <div className="shrink-0 w-12 h-12 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-900/30 flex items-center justify-center">
                                        <FileText size={24} className="text-purple-600 dark:text-purple-400" />
                                    </div>
                                    
                                    {/* Main Info (Width fixed to prevent crushing) */}
                                    <div className="w-1/4 min-w-[220px]">
                                        <h3 className="text-base font-bold text-slate-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors" title={resume.title}>
                                            {resume.title}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 truncate">{resume.fileName}</p>
                                    </div>

                                    {/* Metadata Block */}
                                     <div className="flex items-center gap-6 text-xs text-slate-500 dark:text-gray-400 shrink-0 w-[200px]">
                                        <div className="flex items-center gap-2">
                                            <Clock size={14} className="text-slate-400 dark:text-gray-500" />
                                            <span>{resume.lastUpdated}</span>
                                        </div>
                                        <div className="flex items-center gap-2 hidden sm:flex">
                                            <Briefcase size={14} className="text-slate-400 dark:text-gray-500" />
                                            <span>{experience.length} Roles</span>
                                        </div>
                                     </div>

                                    {/* Skills (Flex 1 to take available space, hidden on small screens) */}
                                    <div className="hidden 2xl:flex flex-1 flex-wrap gap-2 overflow-hidden h-7 mask-linear-fade">
                                        {topSkills.map(skill => (
                                            <span key={skill.name} className="px-2.5 py-1 bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-300 text-xs rounded-md border border-slate-100 dark:border-gray-700 font-medium whitespace-nowrap">
                                                {skill.name}
                                            </span>
                                        ))}
                                        {skills.length > 3 && (
                                            <span className="px-2 py-1 text-slate-400 dark:text-gray-500 text-xs font-medium">
                                                +{skills.length - 3}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {/* Spacer for smaller screens where skills are hidden */}
                                    <div className="flex-1 2xl:hidden"></div>

                                    {/* Right Side: Score & Actions */}
                                    <div className="ml-auto flex items-center gap-4 shrink-0">
                                        {resume.analysis?.overallScore && (
                                            <div className="flex flex-col items-end mr-4 min-w-[60px]">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold ${resume.analysis.overallScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : resume.analysis.overallScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>{resume.analysis.overallScore}</span>
                                                    <div className={`w-2 h-2 rounded-full ${resume.analysis.overallScore >= 80 ? 'bg-emerald-500' : resume.analysis.overallScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                                                </div>
                                                <span className="text-[10px] text-slate-400 dark:text-gray-500 uppercase font-bold">Score</span>
                                            </div>
                                        )}
                                        
                                        <div className="flex items-center gap-2 relative">
                                            <button 
                                                onClick={() => onSelectResume(resume.id)}
                                                className="text-sm font-medium text-slate-700 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-4 py-2 rounded-lg border border-slate-200 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700 transition-all bg-white dark:bg-gray-900"
                                            >
                                                Open Studio
                                            </button>
                                            
                                            {/* List Menu Button */}
                                            <div className="relative">
                                                <button 
                                                    onClick={(e) => toggleMenu(e, resume.id)}
                                                    className={`p-2 rounded-lg transition-colors ${activeMenuId === resume.id ? 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-white' : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                                >
                                                    <MoreVertical size={18} />
                                                </button>
                                                {activeMenuId === resume.id && <MenuDropdown />}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        )}
    </div>
  );
};
