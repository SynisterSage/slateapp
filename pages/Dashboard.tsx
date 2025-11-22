
import React, { useState } from 'react';
import { 
    Briefcase, FileText, TrendingUp, Clock, MapPin, MoreHorizontal,
    Bell, ArrowUpRight, Sparkles, Bookmark, CheckCircle2, Calendar, Plus, Search
} from 'lucide-react';
import { MOCK_JOBS, MOCK_APPLICATIONS, MOCK_RESUMES } from '../mockData';
import { AppView } from '../types';

interface DashboardProps {
  onNavigate: (view: AppView) => void;
  onQuickApply: (jobId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onQuickApply }) => {
  // Local interaction state for the dashboard mockups
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());

  // Derived Metrics
  const totalApplications = MOCK_APPLICATIONS.length + appliedJobs.size;
  const activeInterviews = MOCK_APPLICATIONS.filter(a => a.status === 'Interviewing').length;
  const totalResumes = MOCK_RESUMES.length;
  const newMatches = MOCK_JOBS.filter(j => j.matchScore > 85).length;

  const nextInterview = {
      company: 'TechFlow Systems',
      role: 'Senior React Developer',
      date: 'Today, 2:00 PM',
      type: 'Technical Round'
  };

  const toggleSave = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSaved = new Set(savedJobs);
    if (newSaved.has(id)) {
        newSaved.delete(id);
    } else {
        newSaved.add(id);
    }
    setSavedJobs(newSaved);
  };

  const handleQuickApply = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onQuickApply(id);
  };

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
                    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer">
                        <div className="flex flex-col items-center justify-center w-14 h-14 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50 shrink-0">
                            <span className="text-xs font-bold uppercase">Today</span>
                            <span className="text-xl font-bold">14</span>
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-gray-900 dark:text-white">{nextInterview.type}</h3>
                                <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-md">Interview</span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                {nextInterview.role} at <span className="font-semibold text-gray-900 dark:text-gray-200">{nextInterview.company}</span>
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                <span className="flex items-center gap-1"><Clock size={12} /> 2:00 PM - 3:00 PM</span>
                                <span className="flex items-center gap-1"><MapPin size={12} /> Google Meet</span>
                            </div>
                        </div>
                        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 transition-colors">
                            <ArrowUpRight size={20} />
                        </button>
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
                    {MOCK_JOBS.slice(0, 3).map((job, idx) => {
                         const isSaved = savedJobs.has(job.id);
                         const isApplied = appliedJobs.has(job.id) || job.status === 'Applied';

                         return (
                             <div key={job.id} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800 transition-all group">
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
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                         <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 px-2.5 py-1 rounded-lg">
                                            <Sparkles size={12} className="text-emerald-600 dark:text-emerald-400" />
                                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{job.matchScore}% Match</span>
                                         </div>
                                         <span className="text-xs text-gray-400 mt-2">{job.postedAt}</span>
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        {['React', 'TypeScript', 'Node.js'].map((skill, i) => (
                                            <span key={i} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md font-medium">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                    {/* Action buttons visible at all times */}
                                    <div className="flex gap-2">
                                         <button 
                                            onClick={(e) => toggleSave(e, job.id)}
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
                    })}
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
                        { label: 'Applied', count: 12 + appliedJobs.size, color: 'bg-purple-500' },
                        { label: 'Screening', count: 4, color: 'bg-indigo-500' },
                        { label: 'Interview', count: 2, color: 'bg-amber-500' },
                        { label: 'Offer', count: 1, color: 'bg-emerald-500' }
                    ].map((stage, i) => (
                        <div key={i} className="relative pl-10 flex items-center justify-between">
                            <div className={`absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 ${stage.color} z-10 shadow-sm`}></div>
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{stage.label}</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{stage.count}</span>
                        </div>
                    ))}
                </div>
                
                <button onClick={() => onNavigate(AppView.APPLICATIONS)} className="w-full mt-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white border border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    View Kanban Board
                </button>
            </section>

            {/* Recent Activity Feed */}
            <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                 <h3 className="font-bold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                 <div className="space-y-4">
                    {[
                        { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'Application viewed by TechFlow', time: '2h ago' },
                        { icon: FileText, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'New resume version created', time: '5h ago' },
                        { icon: Bell, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'New job match found: Senior Dev', time: '1d ago' },
                    ].map((item, i) => (
                        <div key={i} className="flex gap-3 items-start">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.bg} ${item.color}`}>
                                <item.icon size={14} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{item.text}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{item.time}</p>
                            </div>
                        </div>
                    ))}
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