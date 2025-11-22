import React from 'react';
import { Sparkles } from 'lucide-react';

export const Loader = () => {
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 flex flex-col items-center justify-center z-50 transition-colors duration-300">
      <div className="relative">
        <div className="w-24 h-24 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center animate-pulse">
           <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center shadow-xl rotate-3">
              <span className="text-3xl font-bold text-white">S</span>
           </div>
        </div>
        <div className="absolute -top-2 -right-2">
             <Sparkles className="text-amber-400 animate-bounce" size={24} fill="currentColor" />
        </div>
      </div>
      <h2 className="mt-8 text-2xl font-bold text-gray-900 dark:text-white tracking-tight">SlateApp</h2>
      <p className="text-gray-500 dark:text-gray-400 mt-2 animate-pulse">Preparing your workspace...</p>
    </div>
  );
};