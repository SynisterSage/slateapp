import React from 'react';
import { LayoutDashboard, FileText, Briefcase, Send, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppView } from '../types';

interface NavigationProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ 
  currentView, 
  onNavigate, 
  isCollapsed,
  onToggleCollapse
}) => {
  const navItems = [
    { view: AppView.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { view: AppView.RESUMES, label: 'Resumes', icon: FileText },
    { view: AppView.JOBS, label: 'Find Jobs', icon: Briefcase },
    { view: AppView.APPLICATIONS, label: 'Applications', icon: Send },
    { view: AppView.SETTINGS, label: 'Settings', icon: Settings },
  ];

  return (
    <nav 
      className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900/95 backdrop-blur-xl text-slate-300 flex flex-col h-full shadow-2xl shrink-0 transition-all duration-300 ease-in-out relative z-40 border-r border-white/10`}
    >
      {/* Toggle Button */}
      <button 
        onClick={onToggleCollapse}
        className="absolute -right-3 top-9 w-6 h-6 bg-slate-800 border border-slate-600 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-md z-50 hover:scale-110"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Logo Area */}
      <div className={`h-16 flex items-center border-b border-white/10 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-6 gap-3'}`}>
        <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg text-white shrink-0 shadow-lg shadow-purple-900/50 ring-1 ring-white/10">S</div>
        <span className={`text-lg font-bold text-white tracking-tight overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
          Slate
        </span>
      </div>

      {/* Nav Items */}
      <div className="flex-1 py-6 flex flex-col gap-1.5 px-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view || (currentView === AppView.RESUME_DETAIL && item.view === AppView.RESUMES);
          return (
            <button
              key={item.label}
              onClick={() => onNavigate(item.view)}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center rounded-xl transition-all duration-200 group relative ${
                isCollapsed ? 'justify-center py-3.5 px-0' : 'gap-3 px-4 py-3'
              } ${
                isActive 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/20' 
                  : 'hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={isCollapsed ? 22 : 20} className={`shrink-0 transition-transform duration-200 ${isActive ? 'scale-105' : 'group-hover:scale-110'}`} />
              
              <span className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 absolute' : 'w-auto opacity-100 relative'}`}>
                {item.label}
              </span>

              {/* Active Indicator Dot for Collapsed State */}
              {isCollapsed && isActive && (
                <div className="absolute right-2 top-2 w-1.5 h-1.5 bg-white rounded-full shadow-sm"></div>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Footer Area */}
      <div className="p-4 text-center">
         <div className={`text-[10px] text-slate-600 transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
             v1.2.0 Beta
         </div>
      </div>
    </nav>
  );
};