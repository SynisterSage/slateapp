
import React, { useState } from 'react';
import { 
    Moon, Sun, Key, Shield, User, AlertCircle, 
    Trash2, Bell, Mail, Zap, LogOut
} from 'lucide-react';

interface SettingsProps {
    currentTheme: 'light' | 'dark';
    onToggleTheme: () => void;
    onLogout: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ currentTheme, onToggleTheme, onLogout }) => {
    // Mock state for form fields
    const [apiKey, setApiKey] = useState('sk-........................');
    const [showKey, setShowKey] = useState(false);
    const [jobTitle, setJobTitle] = useState('Senior Frontend Engineer');
    const [location, setLocation] = useState('Remote');
    
    // Notification State
    const [notifEmail, setNotifEmail] = useState(true);
    const [notifPush, setNotifPush] = useState(true);
    const [notifMarketing, setNotifMarketing] = useState(false);

    const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
        <button 
            onClick={() => onChange(!checked)}
            className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );

    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in pb-20">
             <div className="flex justify-between items-center mb-8">
                 <div>
                     <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
                     <p className="text-gray-500 dark:text-gray-400">Manage your preferences, API keys, and account notifications.</p>
                 </div>
             </div>

             <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Main Column */}
                <div className="xl:col-span-2 space-y-6">
                    {/* Profile Preferences */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <User size={20} className="text-purple-600" /> Job Preferences
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Job Title</label>
                                <input 
                                    type="text"
                                    value={jobTitle}
                                    onChange={(e) => setJobTitle(e.target.value)}
                                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Location</label>
                                <input 
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none transition-colors"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Notifications */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Bell size={20} className="text-indigo-500" /> Notifications
                        </h2>
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">
                                        <Mail size={18} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100">Daily Email Digest</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Get a summary of new job matches every morning.</p>
                                    </div>
                                </div>
                                <Toggle checked={notifEmail} onChange={setNotifEmail} />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100">Real-time Alerts</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Notify me immediately when an application status changes.</p>
                                    </div>
                                </div>
                                <Toggle checked={notifPush} onChange={setNotifPush} />
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3 opacity-80">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100">Marketing & Tips</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Receive career advice and feature updates.</p>
                                    </div>
                                </div>
                                <Toggle checked={notifMarketing} onChange={setNotifMarketing} />
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Column (Sidebar-like) */}
                <div className="space-y-6">
                    {/* Appearance */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Sun size={20} className="text-orange-500" /> Appearance
                        </h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">Theme Preference</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Switch between light and dark mode.</p>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                                <button 
                                    onClick={() => currentTheme === 'dark' && onToggleTheme()}
                                    className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                                        currentTheme === 'light' 
                                        ? 'bg-white text-gray-900 shadow-sm' 
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <Sun size={16} /> Light
                                </button>
                                <button 
                                    onClick={() => currentTheme === 'light' && onToggleTheme()}
                                    className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                                        currentTheme === 'dark' 
                                        ? 'bg-gray-700 text-white shadow-sm' 
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <Moon size={16} /> Dark
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* API Configuration */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Key size={20} className="text-purple-600" /> API Configuration
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gemini API Key</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input 
                                            type={showKey ? "text" : "password"} 
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                                        />
                                        <button 
                                            onClick={() => setShowKey(!showKey)}
                                            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xs font-medium"
                                        >
                                            {showKey ? "HIDE" : "SHOW"}
                                        </button>
                                    </div>
                                    <button className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors shadow-sm">
                                        Save
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                                    <Shield size={12} /> Your key is stored locally in your browser.
                                </p>
                            </div>
                            
                            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Token Usage (This Month)</span>
                                    <span className="text-xs font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-md">12,450 / 1M Limit</span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                                    <div className="bg-purple-500 w-[1.2%] h-full rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Danger Zone */}
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-rose-100 dark:border-rose-900/50 p-6 shadow-sm transition-colors">
                        <h2 className="text-lg font-bold text-rose-600 dark:text-rose-500 mb-4 flex items-center gap-2">
                            <AlertCircle size={20} /> Danger Zone
                        </h2>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-900/30">
                                <div>
                                    <p className="font-bold text-rose-900 dark:text-rose-200 text-sm">Clear All App Data</p>
                                    <p className="text-xs text-rose-700 dark:text-rose-300">Deletes all resumes, job history, and local settings.</p>
                                </div>
                                <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-medium rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors text-sm flex items-center gap-2">
                                    <Trash2 size={14} /> Clear Data
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
             </div>
        </div>
    )
}