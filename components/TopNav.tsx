import React, { useState } from 'react';
import { 
  Search, Bell, Moon, Sun, 
  ChevronRight, HelpCircle, LogOut, 
  Settings, CreditCard, FileText,
  MessageSquare, BookOpen, Zap, User
} from 'lucide-react';
import { AppView } from '../types';

interface TopNavProps {
  currentView: AppView;
  isSidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigate: (view: AppView) => void;
}

export const TopNav: React.FC<TopNavProps> = ({ 
  currentView, 
  theme, 
  onToggleTheme,
  onLogout,
  onNavigate
}) => {
  const [activeDropdown, setActiveDropdown] = useState<'notifications' | 'help' | 'profile' | null>(null);

  const toggleDropdown = (name: 'notifications' | 'help' | 'profile') => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const closeDropdowns = () => setActiveDropdown(null);

  // Helper to format breadcrumb text
  const getBreadcrumb = () => {
    switch (currentView) {
      case AppView.DASHBOARD: return 'Dashboard';
      case AppView.RESUMES: return 'Resumes';
      case AppView.RESUME_DETAIL: return 'Resumes / Editor';
      case AppView.JOBS: return 'Find Jobs';
      case AppView.APPLICATIONS: return 'Applications';
      case AppView.SETTINGS: return 'Settings';
      default: return 'Dashboard';
    }
  };

  const breadcrumbs = getBreadcrumb().split(' / ');

  const notifications = [
    { id: 1, title: 'New Job Match', desc: 'Senior React Dev at TechFlow', time: '2m ago', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { id: 2, title: 'Application Viewed', desc: 'DataSphere viewed your application', time: '1h ago', icon: FileText, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { id: 3, title: 'Resume Score Improved', desc: 'Your "Senior Dev" resume is now 92%', time: '3h ago', icon: User, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  ];

  return (
    <>
      {/* Backdrop for closing dropdowns */}
      {activeDropdown && (
        <div className="fixed inset-0 z-20 bg-transparent" onClick={closeDropdowns}></div>
      )}

      <header className="h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 sticky top-0 z-30 transition-all duration-300 ease-in-out">
        
        {/* Left: Breadcrumbs & Search */}
        <div className="flex items-center gap-6 md:gap-8 flex-1">
          <div className="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400 animate-fade-in">
              <span className="hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors hidden sm:inline">SlateApp</span>
              <ChevronRight size={14} className="mx-2 text-gray-400 hidden sm:inline" />
              
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb}>
                  {index > 0 && <ChevronRight size={14} className="mx-2 text-gray-400" />}
                  <span className={`transition-colors duration-200 ${index === breadcrumbs.length - 1 ? 'text-gray-900 dark:text-white font-bold' : 'hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer'}`}>
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
          </div>

          {/* Global Search Bar */}
          <div className="hidden md:block relative max-w-sm w-full group z-10">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-purple-500 transition-colors" />
              <input 
                  type="text" 
                  placeholder="Search..." 
                  className="w-full pl-9 pr-12 py-2 bg-gray-100/50 dark:bg-gray-800/50 border border-transparent group-hover:border-purple-200 dark:group-hover:border-purple-900/50 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-purple-500/50 focus:bg-white dark:focus:bg-gray-900 focus:border-purple-500 transition-all outline-none"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none">
                  <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 font-sans text-[10px] font-medium text-gray-500 dark:text-gray-400">
                    ⌘K
                  </kbd>
              </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3 relative z-30">
          <button 
              onClick={onToggleTheme}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          
          {/* Notifications */}
          <div className="relative">
              <button 
                onClick={() => toggleDropdown('notifications')}
                className={`p-2 rounded-lg transition-all ${activeDropdown === 'notifications' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20'}`}
              >
                  <Bell size={18} />
                  <span className="absolute top-2 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-gray-900"></span>
              </button>

              {activeDropdown === 'notifications' && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200 backdrop-blur-sm">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                    <button className="text-xs text-purple-600 dark:text-purple-400 hover:underline">Mark all read</button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {notifications.map(n => (
                      <div key={n.id} className="p-4 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer flex gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.bg} ${n.color}`}>
                          <n.icon size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{n.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.desc}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="w-full py-2.5 text-sm text-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors">
                    View All
                  </button>
                </div>
              )}
          </div>

          {/* Help */}
          <div className="relative hidden sm:block">
            <button 
              onClick={() => toggleDropdown('help')}
              className={`p-2 rounded-lg transition-colors ${activeDropdown === 'help' ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
                <HelpCircle size={18} />
            </button>
            
            {activeDropdown === 'help' && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-1.5 backdrop-blur-sm">
                {[
                  { icon: BookOpen, label: 'Documentation' },
                  { icon: MessageSquare, label: 'Support Chat' },
                  { icon: FileText, label: 'Keyboard Shortcuts' },
                  { icon: Zap, label: 'What\'s New' },
                ].map((item, i) => (
                  <button key={i} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors text-left">
                    <item.icon size={16} /> {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2 hidden sm:block"></div>

          {/* Profile Dropdown */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('profile')}
              className={`flex items-center gap-3 pl-1 pr-2 py-1 rounded-full transition-all group ${activeDropdown === 'profile' ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
                <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md ring-2 ring-white dark:ring-gray-900 group-hover:ring-purple-100 dark:group-hover:ring-purple-900 transition-all">
                    AD
                </div>
                <div className="hidden md:block text-left">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200 leading-none group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Alex Dev</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-none mt-1">Free Plan</p>
                </div>
            </button>

            {activeDropdown === 'profile' && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200 backdrop-blur-sm">
                {/* User Info Header */}
                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md">
                      AD
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Alex Developer</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">alex@example.com</p>
                    </div>
                  </div>
                  
                  {/* Plan Usage */}
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Zap size={10} className="text-amber-400 fill-amber-400" /> Free Plan
                          </div>
                          <span className="text-[10px] text-purple-500 hover:underline cursor-pointer">Upgrade</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden mb-1">
                          <div className="bg-gradient-to-r from-purple-500 to-pink-500 w-3/4 h-full rounded-full"></div>
                      </div>
                      <div className="text-[10px] text-gray-400 text-right">75% Storage Used</div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="p-2 space-y-1">
                  <button 
                    onClick={() => { onNavigate(AppView.SETTINGS); closeDropdowns(); }} 
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-left"
                  >
                    <Settings size={16} /> Account Settings
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-left">
                    <CreditCard size={16} /> Billing & Plans
                  </button>
                  <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-2"></div>
                  <button 
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors text-left font-medium"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
};