
import React, { useState, useEffect } from 'react';
import { 
    Search, MapPin, DollarSign, Filter, ExternalLink, 
    LayoutGrid, List, Clock, Bookmark, CheckCircle2, X, 
    Briefcase, ChevronRight, Sparkles, Globe, ArrowRight, Loader2,
    FileText, ChevronDown, Frown
} from 'lucide-react';
import { MOCK_JOBS, MOCK_RESUMES } from '../mockData';
import { Job } from '../types';

interface JobsProps {
    preselectedResumeId?: string | null;
    initialApplyJobId?: string | null;
}

interface FilterState {
    jobTypes: { [key: string]: boolean };
    locations: { [key: string]: boolean };
    minMatchScore: number;
}

export const Jobs: React.FC<JobsProps> = ({ preselectedResumeId, initialApplyJobId }) => {
    // --- State ---
    const [jobs, setJobs] = useState<Job[]>(MOCK_JOBS);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [searchTerm, setSearchTerm] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
    
    // Filter State
    const [activeFilters, setActiveFilters] = useState<FilterState>({
        jobTypes: { 'Full-time': true, 'Contract': false, 'Freelance': false, 'Internship': false },
        locations: { 'Remote': true, 'On-site': true },
        minMatchScore: 0
    });
    const [tempFilters, setTempFilters] = useState<FilterState>(activeFilters);
    
    // Context State (Resume Matching)
    const [activeResumeId, setActiveResumeId] = useState<string>('all');
    
    // Confirmation State
    const [confirmingJobId, setConfirmingJobId] = useState<string | null>(null);
    const [applicationResumeId, setApplicationResumeId] = useState<string>(''); 
    
    const activeFilterCount = (activeFilters.minMatchScore > 0 ? 1 : 0) + 
                              (Object.values(activeFilters.jobTypes).some(v => !v) ? 1 : 0) +
                              (Object.values(activeFilters.locations).some(v => !v) ? 1 : 0);

    // Initialize active resume from prop if present
    useEffect(() => {
        if (preselectedResumeId) {
            setActiveResumeId(preselectedResumeId);
        }
    }, [preselectedResumeId]);

    // Initialize Apply Modal from prop if present
    useEffect(() => {
        if (initialApplyJobId) {
            setApplicationResumeId(activeResumeId !== 'all' ? activeResumeId : MOCK_RESUMES[0].id);
            setConfirmingJobId(initialApplyJobId);
        }
    }, [initialApplyJobId, activeResumeId]);

    // --- Filtering Logic ---
    const filteredJobs = jobs.filter(job => {
        // 1. Search Term
        const term = searchTerm.toLowerCase();
        const matchesSearch = !term || 
                              job.title.toLowerCase().includes(term) || 
                              job.company.toLowerCase().includes(term) || 
                              job.description.toLowerCase().includes(term);

        // 2. Location
        const isRemote = job.location.toLowerCase().includes('remote');
        const showRemote = activeFilters.locations['Remote'];
        const showOnSite = activeFilters.locations['On-site'];
        
        let matchesLocation = false;
        if (isRemote && showRemote) matchesLocation = true;
        if (!isRemote && showOnSite) matchesLocation = true;
        // Fallback: if both unchecked, show nothing? Or all? Let's follow strict UI.
        if (!showRemote && !showOnSite) matchesLocation = false;

        // 3. Match Score
        const matchesScore = job.matchScore >= activeFilters.minMatchScore;

        // 4. Job Type (Mock assumption: All are Full-time unless specified)
        // Since MOCK data lacks strict 'type' field, we map 'Full-time' to standard jobs.
        const showFullTime = activeFilters.jobTypes['Full-time'];
        const matchesType = showFullTime; 

        return matchesSearch && matchesLocation && matchesScore && matchesType;
    });

    // --- Actions ---
    
    const toggleSave = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newSaved = new Set(savedJobIds);
        if (newSaved.has(id)) newSaved.delete(id);
        else newSaved.add(id);
        setSavedJobIds(newSaved);
    };

    const initiateApply = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setApplicationResumeId(activeResumeId !== 'all' ? activeResumeId : MOCK_RESUMES[0].id);
        setConfirmingJobId(id);
    };

    const handleConfirmApply = () => {
        if (confirmingJobId) {
            setJobs(jobs.map(j => j.id === confirmingJobId ? { ...j, status: 'Applied' } : j));
            if (selectedJob?.id === confirmingJobId) {
                setSelectedJob(prev => prev ? { ...prev, status: 'Applied' } : null);
            }
            setConfirmingJobId(null);
        }
    };

    const handleScrape = () => {
        setIsScanning(true);
        setTimeout(() => {
            const newJob: Job = {
                id: `j${Date.now()}`,
                title: 'Lead Frontend Architect',
                company: 'Innovate AI',
                location: 'Remote',
                matchScore: 98,
                salary: '$180k - $220k',
                postedAt: 'Just now',
                status: 'New',
                description: 'We are looking for a visionary architect to lead our frontend initiatives using React 19, Server Components, and Edge Runtime. You will work directly with the CTO...'
            };
            setJobs([newJob, ...jobs]);
            setIsScanning(false);
        }, 2000);
    };
    
    const handleOpenFilters = () => {
        setTempFilters(JSON.parse(JSON.stringify(activeFilters)));
        setIsFilterOpen(true);
    };

    const handleApplyFilters = () => {
        setActiveFilters(tempFilters);
        setIsFilterOpen(false);
    };

    const handleTempJobTypeChange = (type: string, checked: boolean) => {
        setTempFilters(prev => ({
            ...prev,
            jobTypes: { ...prev.jobTypes, [type]: checked }
        }));
    };

    const handleTempLocationChange = (loc: string, checked: boolean) => {
        setTempFilters(prev => ({
            ...prev,
            locations: { ...prev.locations, [loc]: checked }
        }));
    };

    // --- Components ---

    const ConfirmApplyModal = () => {
        if (!confirmingJobId) return null;
        const job = jobs.find(j => j.id === confirmingJobId);
        
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setConfirmingJobId(null)}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in scale-95 duration-200 border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-start mb-4">
                         <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400">
                            <ExternalLink size={24} />
                        </div>
                        <button onClick={() => setConfirmingJobId(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-full text-slate-500 dark:text-gray-400">
                            <X size={20} />
                        </button>
                    </div>
                   
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Apply to {job?.company}</h3>
                    <p className="text-slate-600 dark:text-gray-400 text-sm mb-6">
                        Review your application details for <span className="font-semibold text-slate-800 dark:text-gray-200">{job?.title}</span>.
                    </p>

                    <div className="space-y-4 mb-8">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2">Select Resume</label>
                            <div className="relative">
                                <select 
                                    value={applicationResumeId}
                                    onChange={(e) => setApplicationResumeId(e.target.value)}
                                    className="w-full appearance-none bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200 rounded-xl py-3 pl-4 pr-10 font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                                >
                                    {MOCK_RESUMES.map(r => (
                                        <option key={r.id} value={r.id}>{r.title} ({r.lastUpdated})</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" size={18} />
                            </div>
                        </div>

                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 flex gap-3 items-start">
                            <Sparkles size={16} className="text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                                We'll attach your latest tuned version. Your resume match score for this role is <span className="font-bold">{job?.matchScore}%</span>.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button 
                            onClick={() => setConfirmingJobId(null)} 
                            className="flex-1 py-3 text-slate-600 dark:text-gray-300 font-medium hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirmApply} 
                            className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 dark:shadow-none flex items-center justify-center gap-2"
                        >
                            Confirm Apply
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const FilterModal = () => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in scale-95 duration-200 border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Filters</h3>
                    <button onClick={() => setIsFilterOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-gray-200">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3 block">Job Type</label>
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(tempFilters.jobTypes).map(type => (
                                <label key={type} className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${
                                    tempFilters.jobTypes[type] 
                                    ? 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800' 
                                    : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700'
                                }`}>
                                    <input 
                                        type="checkbox" 
                                        className="rounded text-purple-600 focus:ring-purple-500 border-slate-300 dark:border-gray-600 dark:bg-gray-700" 
                                        checked={tempFilters.jobTypes[type]}
                                        onChange={(e) => handleTempJobTypeChange(type, e.target.checked)}
                                    />
                                    <span className={`text-sm font-medium ${tempFilters.jobTypes[type] ? 'text-purple-700 dark:text-purple-300' : 'text-slate-700 dark:text-gray-300'}`}>
                                        {type}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3 block">Location</label>
                        <div className="flex flex-wrap gap-2">
                             {Object.keys(tempFilters.locations).map(loc => (
                                 <label key={loc} className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${
                                    tempFilters.locations[loc]
                                    ? 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800'
                                    : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700'
                                 }`}>
                                    <input 
                                        type="checkbox" 
                                        className="rounded text-purple-600 focus:ring-purple-500 border-slate-300 dark:border-gray-600 dark:bg-gray-700" 
                                        checked={tempFilters.locations[loc]}
                                        onChange={(e) => handleTempLocationChange(loc, e.target.checked)}
                                    />
                                    <span className={`text-sm font-medium ${tempFilters.locations[loc] ? 'text-purple-700 dark:text-purple-300' : 'text-slate-700 dark:text-gray-300'}`}>
                                        {loc}
                                    </span>
                                </label>
                             ))}
                        </div>
                    </div>

                    <div>
                         <label className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3 block">Minimum Match Score: {tempFilters.minMatchScore}%</label>
                         <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={tempFilters.minMatchScore}
                            onChange={(e) => setTempFilters(prev => ({ ...prev, minMatchScore: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-slate-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600" 
                         />
                         <div className="flex justify-between text-xs text-slate-400 mt-2">
                            <span>0%</span>
                            <span>50%</span>
                            <span>100%</span>
                         </div>
                    </div>
                </div>

                <div className="mt-8 flex gap-3">
                    <button onClick={() => setIsFilterOpen(false)} className="flex-1 py-2.5 text-slate-600 dark:text-gray-400 font-medium hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleApplyFilters} className="flex-1 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 dark:shadow-none">
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>
    );

    const JobDetailPanel = () => {
        if (!selectedJob) return null;
        return (
            <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-white dark:bg-gray-900 shadow-2xl transform transition-transform z-40 flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200 dark:border-gray-800 backdrop-blur-3xl">
                <div className="p-6 border-b border-slate-100 dark:border-gray-800 flex justify-between items-start bg-slate-50/50 dark:bg-gray-900/50">
                    <div>
                        <button onClick={() => setSelectedJob(null)} className="mb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors">
                            <ArrowRight size={16} className="rotate-180" /> Back to list
                        </button>
                         <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 flex items-center justify-center text-lg font-bold text-slate-700 dark:text-gray-200 shadow-sm">
                                {selectedJob.company.charAt(0)}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{selectedJob.title}</h2>
                                <p className="text-slate-500 dark:text-gray-400 font-medium">{selectedJob.company}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={(e) => toggleSave(e, selectedJob.id)} className="p-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-400 hover:text-amber-500 transition-colors">
                            <Bookmark size={20} fill={savedJobIds.has(selectedJob.id) ? "currentColor" : "none"} className={savedJobIds.has(selectedJob.id) ? "text-amber-500" : ""} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* AI Insight */}
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/30 rounded-xl p-4 mb-6">
                         <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
                            <h4 className="text-sm font-bold text-purple-900 dark:text-purple-300">AI Match Analysis</h4>
                            <span className="ml-auto text-xs font-bold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">{selectedJob.matchScore}% Match</span>
                         </div>
                         <p className="text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
                            Your resume is a strong fit for this role. Your experience with <strong>React</strong> and <strong>Node.js</strong> aligns perfectly. Consider emphasizing your <strong>System Design</strong> skills in the cover letter.
                         </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                         <div className="p-3 bg-slate-50 dark:bg-gray-800 rounded-lg border border-slate-100 dark:border-gray-700">
                            <span className="text-xs text-slate-400 dark:text-gray-500 uppercase font-bold block mb-1">Location</span>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-gray-200">
                                <MapPin size={14} /> {selectedJob.location}
                            </div>
                         </div>
                         <div className="p-3 bg-slate-50 dark:bg-gray-800 rounded-lg border border-slate-100 dark:border-gray-700">
                            <span className="text-xs text-slate-400 dark:text-gray-500 uppercase font-bold block mb-1">Salary</span>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-gray-200">
                                <DollarSign size={14} /> {selectedJob.salary || 'Competitive'}
                            </div>
                         </div>
                         <div className="p-3 bg-slate-50 dark:bg-gray-800 rounded-lg border border-slate-100 dark:border-gray-700">
                            <span className="text-xs text-slate-400 dark:text-gray-500 uppercase font-bold block mb-1">Posted</span>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-gray-200">
                                <Clock size={14} /> {selectedJob.postedAt}
                            </div>
                         </div>
                         <div className="p-3 bg-slate-50 dark:bg-gray-800 rounded-lg border border-slate-100 dark:border-gray-700">
                            <span className="text-xs text-slate-400 dark:text-gray-500 uppercase font-bold block mb-1">Type</span>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-gray-200">
                                <Briefcase size={14} /> Full-time
                            </div>
                         </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide border-b border-slate-100 dark:border-gray-800 pb-2">Description</h3>
                        <p className="text-slate-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                            {selectedJob.description}
                            {'\n\n'}
                            Responsibilities:
                            {'\n'}• Architect scalable frontend solutions
                            {'\n'}• Mentor junior developers
                            {'\n'}• Collaborate with product and design teams
                            {'\n\n'}
                            Requirements:
                            {'\n'}• 5+ years of experience with React
                            {'\n'}• Experience with TypeScript and Node.js
                            {'\n'}• Strong communication skills
                        </p>
                    </div>
                </div>

                <div className="p-5 border-t border-slate-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex gap-3">
                    <button onClick={() => setSelectedJob(null)} className="flex-1 py-3 text-slate-600 dark:text-gray-300 font-medium hover:bg-slate-50 dark:hover:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 transition-colors">
                        Cancel
                    </button>
                    {selectedJob.status === 'Applied' ? (
                        <button disabled className="flex-1 py-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold rounded-xl flex items-center justify-center gap-2 border border-emerald-100 dark:border-emerald-900/50">
                            <CheckCircle2 size={20} /> Applied
                        </button>
                    ) : (
                        <button onClick={(e) => initiateApply(e, selectedJob.id)} className="flex-[2] py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-200 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2">
                            Apply Now <ExternalLink size={18} />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto h-full flex flex-col animate-fade-in relative">
            {/* Overlay Backdrop for Detail Panel */}
            {selectedJob && <div className="fixed inset-0 bg-slate-900/20 dark:bg-black/50 z-30 backdrop-blur-sm transition-opacity" onClick={() => setSelectedJob(null)}></div>}
            
            {/* Filter Modal */}
            {isFilterOpen && <FilterModal />}

            {/* Confirmation Modal */}
            <ConfirmApplyModal />

            {/* Detail Panel */}
            <JobDetailPanel />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Find Jobs</h1>
                    <p className="text-slate-500 dark:text-gray-400 mt-1">AI-curated matches based on your skill profile.</p>
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
                        onClick={handleScrape}
                        disabled={isScanning}
                        className="bg-slate-900 dark:bg-gray-800 hover:bg-slate-800 dark:hover:bg-gray-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-slate-900/10 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed active:scale-95"
                    >
                        {isScanning ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
                        {isScanning ? 'Scanning...' : 'Scan Job Boards'}
                    </button>
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 mb-8 flex flex-col lg:flex-row gap-4 sticky top-0 z-20">
                
                {/* Resume Context Selector */}
                <div className="lg:w-64 relative shrink-0">
                     <div className="absolute left-3 top-3 pointer-events-none">
                         <FileText size={18} className={activeResumeId !== 'all' ? "text-purple-600 dark:text-purple-400" : "text-slate-400 dark:text-gray-500"} />
                     </div>
                     <select 
                        value={activeResumeId}
                        onChange={(e) => setActiveResumeId(e.target.value)}
                        className={`w-full pl-10 pr-8 py-2.5 rounded-lg border appearance-none focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer transition-colors font-medium text-sm truncate ${
                            activeResumeId !== 'all' 
                            ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300' 
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                     >
                         <option value="all">General Search (All)</option>
                         <optgroup label="Match with Resume">
                             {MOCK_RESUMES.map(r => (
                                 <option key={r.id} value={r.id}>{r.title}</option>
                             ))}
                         </optgroup>
                     </select>
                     <ChevronDown className={`absolute right-3 top-3 pointer-events-none ${activeResumeId !== 'all' ? "text-purple-500 dark:text-purple-400" : "text-slate-400 dark:text-gray-500"}`} size={16} />
                </div>

                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3 text-slate-400 dark:text-gray-500" size={20} />
                    <input 
                        type="text" 
                        placeholder={activeResumeId !== 'all' ? `Searching best matches for ${MOCK_RESUMES.find(r=>r.id===activeResumeId)?.title}...` : "Search for roles, companies, or keywords..."}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-gray-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
                    <button 
                        onClick={handleOpenFilters}
                        className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg font-medium transition-all whitespace-nowrap ${
                            activeFilterCount > 0 
                                ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300' 
                                : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-900'
                        }`}
                    >
                        <Filter size={18} />
                        Filter
                        {activeFilterCount > 0 && (
                            <span className="w-5 h-5 bg-purple-600 text-white text-xs flex items-center justify-center rounded-full ml-1">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Job List */}
             <div className="flex-1 overflow-y-auto min-h-0 pb-20">
                {filteredJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 bg-slate-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
                            <Frown size={40} className="text-slate-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No jobs found</h3>
                        <p className="text-slate-500 dark:text-gray-400 max-w-sm">Try adjusting your search terms or filters to find what you're looking for.</p>
                        <button 
                            onClick={() => { setSearchTerm(''); setActiveFilters({ jobTypes: { 'Full-time': true, 'Contract': false, 'Freelance': false, 'Internship': false }, locations: { 'Remote': true, 'On-site': true }, minMatchScore: 0 }); }}
                            className="mt-6 text-purple-600 dark:text-purple-400 font-medium hover:underline"
                        >
                            Clear all filters
                        </button>
                    </div>
                ) : (
                    <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
                        {filteredJobs.map(job => {
                             const isSaved = savedJobIds.has(job.id);
                             const isApplied = job.status === 'Applied';

                             if (viewMode === 'card') {
                                 return (
                                     <div key={job.id} onClick={() => setSelectedJob(job)} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all cursor-pointer group flex flex-col h-full relative">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex gap-4">
                                                <div className="w-12 h-12 bg-slate-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-gray-400 font-bold text-lg shrink-0">
                                                    {job.company.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 dark:text-white text-lg leading-tight group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-1">{job.title}</h4>
                                                    <p className="text-sm text-slate-500 dark:text-gray-400 font-medium">{job.company}</p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-gray-400 mb-4">
                                            <span className="flex items-center gap-1 bg-slate-50 dark:bg-gray-800/50 px-2 py-1 rounded"><MapPin size={12} /> {job.location}</span>
                                            <span className="flex items-center gap-1 bg-slate-50 dark:bg-gray-800/50 px-2 py-1 rounded"><DollarSign size={12} /> {job.salary?.split(' - ')[0]}+</span>
                                        </div>

                                        <p className="text-sm text-slate-600 dark:text-gray-300 line-clamp-3 mb-6 flex-1">
                                            {job.description}
                                        </p>

                                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-gray-700">
                                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                                                <Sparkles size={12} /> {job.matchScore}% Match
                                            </div>
                                            <span className="text-xs text-slate-400 dark:text-gray-500">{job.postedAt}</span>
                                        </div>
                                        
                                        {/* Hover Actions */}
                                        <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <button 
                                                onClick={(e) => toggleSave(e, job.id)}
                                                className={`p-2 rounded-full border shadow-sm transition-colors ${isSaved ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-600 text-slate-400 hover:text-amber-500'}`}
                                            >
                                                <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} />
                                             </button>
                                        </div>
                                     </div>
                                 );
                             } else {
                                 // List View
                                 return (
                                     <div key={job.id} onClick={() => setSelectedJob(job)} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all cursor-pointer flex items-center gap-4 group">
                                         <div className="w-12 h-12 bg-slate-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-gray-400 font-bold text-lg shrink-0">
                                            {job.company.charAt(0)}
                                         </div>
                                         <div className="flex-1 min-w-0">
                                             <div className="flex justify-between items-start">
                                                 <h4 className="font-bold text-slate-900 dark:text-white text-base truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{job.title}</h4>
                                                 <span className="text-xs text-slate-400 dark:text-gray-500 whitespace-nowrap">{job.postedAt}</span>
                                             </div>
                                             <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-gray-400 mt-0.5">
                                                 <span className="font-medium text-slate-700 dark:text-gray-300">{job.company}</span>
                                                 <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-gray-600"></span>
                                                 <span>{job.location}</span>
                                                 <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-gray-600"></span>
                                                 <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1"><Sparkles size={10} /> {job.matchScore}% Match</span>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-2">
                                             <button 
                                                onClick={(e) => toggleSave(e, job.id)}
                                                className={`p-2 rounded-lg transition-colors ${isSaved ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                             >
                                                <Bookmark size={18} fill={isSaved ? "currentColor" : "none"} />
                                             </button>
                                             <button 
                                                className="p-2 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                             >
                                                 <ChevronRight size={20} />
                                             </button>
                                         </div>
                                     </div>
                                 );
                             }
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};