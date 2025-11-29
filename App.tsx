
import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { TopNav } from './components/TopNav';
import { NotificationProvider } from './src/lib/notificationStore';
import { Dashboard } from './pages/Dashboard';
import { Resumes } from './pages/Resumes';
import { ResumeDetail } from './pages/ResumeDetail';
import { Jobs } from './pages/Jobs';
import { Applications } from './pages/Applications';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import Support from './pages/Support';
import WhatsNew from './pages/WhatsNew';
import Docs from './pages/Docs';
import Guides from './pages/Guides';
import Legal from './pages/Legal';
import SearchResults from './pages/SearchResults';
import ApiDocs from './pages/ApiDocs';
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

  // Expose current user id to window for dev PoC WS connection
  useEffect(() => {
    (async () => {
      try {
        if (!isAuthenticated) return;
        const { data } = await supabase.auth.getUser();
        if (data && data.user && data.user.id) {
          (window as any).__USER_ID = data.user.id;
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [isAuthenticated]);

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

  // Map views to URL paths and vice-versa so the SPA keeps the URL in sync
  const viewToPath = (view: AppView) => {
    switch (view) {
      case AppView.DASHBOARD: return '/';
      case AppView.RESUMES: return '/resumes';
      case AppView.RESUME_DETAIL: return '/resumes/detail';
      case AppView.JOBS: return '/jobs';
      case AppView.APPLICATIONS: return '/applications';
      case AppView.SETTINGS: return '/settings';
      case AppView.SUPPORT: return '/support';
      case AppView.DOCS: return '/docs';
      case AppView.GUIDES: return '/guides';
      case AppView.WHATS_NEW: return '/whats-new';
      case AppView.API_DOCS: return '/api-docs';
      case AppView.LEGAL: return '/legal';
      default: return '/';
    }
  };

  const pathToView = (path: string) => {
    if (!path) return AppView.DASHBOARD;
    if (path.startsWith('/resumes')) return AppView.RESUMES;
    if (path.startsWith('/jobs')) return AppView.JOBS;
    if (path.startsWith('/applications')) return AppView.APPLICATIONS;
    if (path.startsWith('/settings')) return AppView.SETTINGS;
    if (path.startsWith('/support')) return AppView.SUPPORT;
    if (path.startsWith('/docs')) return AppView.DOCS;
    if (path.startsWith('/guides')) return AppView.GUIDES;
    if (path.startsWith('/whats-new')) return AppView.WHATS_NEW;
    if (path.startsWith('/api-docs')) return AppView.API_DOCS;
    if (path.startsWith('/search')) return AppView.SEARCH;
    if (path.startsWith('/legal')) return AppView.LEGAL;
    return AppView.DASHBOARD;
  };

  // Initialize currentView from location.pathname so deep links (like /settings)
  // rendered after OAuth redirects will show the expected view.
  useEffect(() => {
    try {
      const initial = pathToView(window.location.pathname || '/');
      setCurrentView(initial);
    } catch (e) {}
    // Listen for back/forward navigation
    const onPop = () => {
      try { setCurrentView(pathToView(window.location.pathname || '/')); } catch (e) {}
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Support programmatic app-level navigation/open events from TopNav / SearchResults
  useEffect(() => {
    const onAppNavigate = (e: any) => {
      try {
        const v = e && e.detail && e.detail.view;
        if (!v) return;
        // v is expected to be a key of AppView (string name)
        const viewKey = String(v).toUpperCase();
        if ((AppView as any)[viewKey]) {
          handleNavigate((AppView as any)[viewKey]);
        }
      } catch (err) {}
    };

    const onOpenResume = (e: any) => {
      try {
        const id = e && e.detail && e.detail.id;
        if (!id) return;
        setSelectedResumeId(id);
        handleNavigate(AppView.RESUME_DETAIL);
      } catch (err) {}
    };

    const onOpenApplication = (e: any) => {
      try {
        const id = e && e.detail && e.detail.id;
        if (!id) return;
        // Navigate to Applications view; Applications component can listen for a secondary event
        handleNavigate(AppView.APPLICATIONS);
        // Also re-dispatch a selection event so Applications can act on it
        try { window.dispatchEvent(new CustomEvent('app:selectApplication', { detail: { id } })); } catch (err) {}
      } catch (err) {}
    };

    const onOpenGuideOrDoc = (e: any) => {
      try {
        const id = e && e.detail && (e.detail.id || e.detail.slug);
        if (!id) return;
        // Prefer Guides if a guide id was supplied; docs will be handled by Docs component listening to its event
        if (e.type === 'app:openGuide') handleNavigate(AppView.GUIDES);
        if (e.type === 'app:openDoc') handleNavigate(AppView.DOCS);
      } catch (err) {}
    };

    window.addEventListener('app:navigate', onAppNavigate as EventListener);
    window.addEventListener('app:openResume', onOpenResume as EventListener);
    window.addEventListener('app:openApplication', onOpenApplication as EventListener);
    window.addEventListener('app:openGuide', onOpenGuideOrDoc as EventListener);
    window.addEventListener('app:openDoc', onOpenGuideOrDoc as EventListener);

    return () => {
      window.removeEventListener('app:navigate', onAppNavigate as EventListener);
      window.removeEventListener('app:openResume', onOpenResume as EventListener);
      window.removeEventListener('app:openApplication', onOpenApplication as EventListener);
      window.removeEventListener('app:openGuide', onOpenGuideOrDoc as EventListener);
      window.removeEventListener('app:openDoc', onOpenGuideOrDoc as EventListener);
    };
  }, []);

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
        try { window.localStorage.removeItem('gmail_connected'); } catch (e) {}
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
    // Update view state and push a URL entry so the browser reflects the current view
    try {
      const newPath = viewToPath(view);
      if (window.location.pathname !== newPath) {
        window.history.pushState({}, '', newPath);
      }
    } catch (e) {}
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
      case AppView.SUPPORT:
        return <Support />;
      case AppView.DOCS:
        return <Docs />;
      case AppView.GUIDES:
        return <Guides />;
      case AppView.SEARCH:
        return <SearchResults />;
      case AppView.WHATS_NEW:
        return <WhatsNew />;
      case AppView.API_DOCS:
        return <ApiDocs />;
      case AppView.LEGAL:
        return <Legal />;
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
           <NotificationProvider>
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
                </NotificationProvider>
              </>
       ) : (
          <Login onLogin={handleLogin} />
       )}
    </div>
  );
};

export default App;