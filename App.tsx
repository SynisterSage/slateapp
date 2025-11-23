
import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { TopNav } from './components/TopNav';
import { Dashboard } from './pages/Dashboard';
import { Resumes } from './pages/Resumes';
import { ResumeDetail } from './pages/ResumeDetail';
import { Jobs } from './pages/Jobs';
import { Applications } from './pages/Applications';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Loader } from './components/Loader';
import { AppView } from './types';
import supabase, { supabaseSession } from './src/lib/supabaseClient';
// Resumes are now loaded from Supabase via API

const App = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Auth & Loading State
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Used when navigating from Resumes -> Jobs to pre-filter/match
  const [jobSearchContextResumeId, setJobSearchContextResumeId] = useState<string | null>(null);
  
  // Used when navigating from Dashboard -> Jobs to open confirm modal
  const [initialApplyJobId, setInitialApplyJobId] = useState<string | null>(null);

  // Initialize App (Mock Loader)
  useEffect(() => {
    const timer = setTimeout(() => {
        setIsLoading(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Check existing session(s) on mount and subscribe to auth changes
  useEffect(() => {
    let mounted = true;

    const checkSessions = async () => {
      try {
        const { data: localData } = await supabase.auth.getSession();
        if (localData?.session) {
          if (mounted) setIsAuthenticated(true);
          return;
        }

        // Check sessionStorage-backed client too
        if (supabaseSession && supabaseSession !== supabase) {
          const { data: sessionData } = await supabaseSession.auth.getSession();
          if (sessionData?.session && mounted) setIsAuthenticated(true);
        }
      } catch (err) {
        console.warn('Error checking auth sessions', err);
      }
    };

    checkSessions();

    const { data: localListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        setIsAuthenticated(true);
        setCurrentView(AppView.DASHBOARD);
      }
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
      }
    });

    const { data: sessionListener } = supabaseSession.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        setIsAuthenticated(true);
        setCurrentView(AppView.DASHBOARD);
      }
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
      }
    });

    return () => {
      mounted = false;
      try { localListener?.subscription?.unsubscribe?.(); } catch (e) {}
      try { sessionListener?.subscription?.unsubscribe?.(); } catch (e) {}
    };
  }, []);

  // Handle Theme Change
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleLogin = () => {
      setIsAuthenticated(true);
  };

  const handleLogout = () => {
      // Sign out from both possible storages
      (async () => {
        try {
          await supabase.auth.signOut();
        } catch (e) { console.warn('supabase signOut error', e); }
        try {
          if (supabaseSession && supabaseSession !== supabase) await supabaseSession.auth.signOut();
        } catch (e) { console.warn('supabaseSession signOut error', e); }
        setIsAuthenticated(false);
        setCurrentView(AppView.DASHBOARD);
      })();
  };

  const handleResumeSelect = (id: string) => {
    setSelectedResumeId(id);
    setCurrentView(AppView.RESUME_DETAIL);
  };

  const handleBackToResumes = () => {
    setSelectedResumeId(null);
    setCurrentView(AppView.RESUMES);
  };

  const handleFindJobsForResume = (resumeId: string) => {
    setJobSearchContextResumeId(resumeId);
    setCurrentView(AppView.JOBS);
  };

  const handleNavigate = (view: AppView) => {
    if (view !== AppView.JOBS) {
      setJobSearchContextResumeId(null);
      setInitialApplyJobId(null);
    }
    setCurrentView(view);
  };

  const handleQuickApplyFromDashboard = (jobId: string) => {
      setInitialApplyJobId(jobId);
      setCurrentView(AppView.JOBS);
  };

  const renderContent = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard onNavigate={handleNavigate} onQuickApply={handleQuickApplyFromDashboard} />;
      case AppView.RESUMES:
        return <Resumes onSelectResume={handleResumeSelect} onFindJobs={handleFindJobsForResume} />;
      case AppView.RESUME_DETAIL:
        // Pass the selected resume id and let the detail page fetch it from the backend
        if (!selectedResumeId) return <Resumes onSelectResume={handleResumeSelect} />;
        return <ResumeDetail resumeId={selectedResumeId} onBack={handleBackToResumes} />;
      case AppView.JOBS:
        return <Jobs preselectedResumeId={jobSearchContextResumeId} initialApplyJobId={initialApplyJobId} />;
      case AppView.APPLICATIONS:
        return <Applications />;
      case AppView.SETTINGS:
        return <Settings currentTheme={theme} onToggleTheme={toggleTheme} onLogout={handleLogout} />;
      default:
        return <Dashboard onNavigate={handleNavigate} onQuickApply={handleQuickApplyFromDashboard} />;
    }
  };

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300 font-sans overflow-hidden">
       {isAuthenticated ? (
           <>
              <Navigation 
                  currentView={currentView} 
                  onNavigate={handleNavigate} 
                  isCollapsed={isSidebarCollapsed}
                  onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              />
              
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-300">
                  {/* Top Navigation */}
                  <TopNav 
                      currentView={currentView} 
                      isSidebarCollapsed={isSidebarCollapsed}
                      theme={theme}
                      onToggleTheme={toggleTheme}
                      onLogout={handleLogout}
                      onNavigate={handleNavigate}
                  />

                  {/* Main Content Area */}
                  <main className="flex-1 overflow-y-auto scroll-smooth relative z-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                       {renderContent()}
                  </main>
              </div>
           </>
       ) : (
          <Login onLogin={handleLogin} />
       )}
    </div>
  );
};

export default App;