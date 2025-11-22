

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, MoreVertical, Loader2, LayoutGrid, List, Briefcase, Trash2, Copy, PenLine, Download, CheckCircle2, AlertTriangle, Clock, Search, X, FileUp, ShieldCheck, ArrowRight } from 'lucide-react';
import { MOCK_RESUMES } from '../mockData';
import { Resume } from '../types';

interface ResumesProps {
    onSelectResume: (id: string) => void;
    onFindJobs?: (id: string) => void;
}

export const Resumes: React.FC<ResumesProps> = ({ onSelectResume, onFindJobs }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [resumes, setResumes] = useState(MOCK_RESUMES);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Upload State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setTimeout(() => {
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
        setResumes([newResume, ...resumes]);
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

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this resume?')) {
        setResumes(resumes.filter(r => r.id !== id));
        setActiveMenuId(null);
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
    setResumes([newResume, ...resumes]);
    setActiveMenuId(null);
  };

  const handleRename = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const name = prompt("Enter new name:");
      if (name) {
          setResumes(resumes.map(r => r.id === id ? { ...r, title: name } : r));
      }
      setActiveMenuId(null);
  };

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
                    // Derived Data for UI
                    const skills = resume.skills || [];
                    const experience = resume.experience || [];
                    const criticalIssuesCount = resume.analysis?.issues.filter(i => i.severity === 'critical').length || 0;
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
                                                <span className="truncate max-w-[120px]">{resume.fileName}</span>
                                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-gray-600"></span>
                                                <span>{resume.lastUpdated}</span>
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
