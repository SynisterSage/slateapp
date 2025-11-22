import React, { useState, useEffect } from 'react';
import { Sparkles, UploadCloud, Wand2, Kanban, Eye, EyeOff } from 'lucide-react';

interface LoginProps {
    onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [activeSlide, setActiveSlide] = useState(0);
    const [showPassword, setShowPassword] = useState(false);

    const slides = [
        {
            step: "Step 1",
            title: "Upload & Analyze",
            desc: "Drag and drop your PDF resume. We instantly parse it, score it against 50+ data points, and identify fixes.",
            image: "bg-gradient-to-br from-purple-900 to-indigo-950",
            icon: <UploadCloud size={40} className="text-purple-400" />
        },
        {
            step: "Step 2",
            title: "Tune with AI",
            desc: "Don't send generic resumes. Select a job match and click 'Tune' to rewrite your bullets for that specific role.",
            image: "bg-gradient-to-br from-indigo-900 to-blue-950",
            icon: <Wand2 size={40} className="text-fuchsia-400" />
        },
        {
            step: "Step 3",
            title: "Track Progress",
            desc: "Organize your search. Move applications from 'Applied' to 'Offer' on our visual Kanban board.",
            image: "bg-gradient-to-br from-violet-900 to-purple-950",
            icon: <Kanban size={40} className="text-indigo-400" />
        }
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveSlide(prev => (prev + 1) % slides.length);
        }, 5000); // 5s rotation
        return () => clearInterval(interval);
    }, [slides.length]);

    // Add CSS Keyframe for the progress bar
    const progressAnimation = `
      @keyframes progress {
        from { width: 0%; }
        to { width: 100%; }
      }
    `;

    return (
        <div className="min-h-screen w-full flex bg-white dark:bg-gray-900 transition-colors duration-300">
             <style>{progressAnimation}</style>
            
            {/* Left Side - Form */}
            <div className="w-full lg:w-1/2 flex flex-col p-8 lg:p-16 justify-center animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="max-w-md mx-auto w-full">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/20">
                            <span className="text-xl font-bold text-white">S</span>
                        </div>
                        <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">SlateApp</span>
                    </div>

                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        {isLogin ? "Welcome Back Creative!" : "Create Your Account"}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mb-8">
                        {isLogin ? "We Are Happy To See You Again" : "Start your career journey with us today."}
                    </p>

                    <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex mb-8">
                        <button 
                            onClick={() => setIsLogin(true)}
                            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${isLogin ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                        >
                            Sign In
                        </button>
                        <button 
                            onClick={() => setIsLogin(false)}
                            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${!isLogin ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                        >
                            Sign Up
                        </button>
                    </div>

                    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
                        {!isLogin && (
                             <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                                <input type="text" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all" placeholder="John Doe" />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address</label>
                            <input type="email" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all" placeholder="name@example.com" />
                        </div>
                        <div>
                             <div className="flex justify-between mb-1.5">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                                {isLogin && <a href="#" className="text-sm font-semibold text-purple-600 hover:underline">Forgot Password?</a>}
                             </div>
                            <div className="relative">
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all pr-12" 
                                    placeholder="********" 
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {isLogin && (
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="remember" className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                                <label htmlFor="remember" className="text-sm text-gray-500 dark:text-gray-400">Remember me</label>
                            </div>
                        )}

                        <button type="submit" className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                            {isLogin ? "Login" : "Create Account"}
                        </button>
                    </form>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-gray-900 px-2 text-gray-400">Or continue with</span></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                             Facebook
                        </button>
                        <button className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                             Google
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Side - Tutorial Carousel */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gray-900">
                {slides.map((slide, idx) => (
                     <div 
                        key={idx}
                        className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${activeSlide === idx ? 'opacity-100' : 'opacity-0'} ${slide.image}`}
                     >
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
                     </div>
                ))}
                
                {/* Progress Bar Top */}
                <div className="absolute top-0 left-0 w-full h-1.5 flex gap-1 z-20">
                    {slides.map((_, idx) => (
                        <div key={idx} className="flex-1 h-full bg-white/20 rounded-b-sm overflow-hidden">
                             <div 
                                className={`h-full bg-white ${activeSlide === idx ? 'animate-[progress_5s_linear]' : ''}`}
                                style={{ 
                                    width: activeSlide > idx ? '100%' : activeSlide === idx ? 'auto' : '0%' 
                                }}
                             ></div>
                        </div>
                    ))}
                </div>
                
                <div className="absolute inset-0 flex flex-col justify-center items-center p-16 z-10 text-white text-center">
                    
                    {/* Icon Container with Circle Animation */}
                    <div className="mb-8 relative">
                         <div className="absolute inset-0 bg-white/20 rounded-full blur-xl animate-pulse"></div>
                         <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 flex items-center justify-center shadow-2xl relative z-10 transform transition-all duration-500 scale-100 hover:scale-110">
                             <div key={activeSlide} className="animate-in zoom-in duration-500">
                                {slides[activeSlide].icon}
                             </div>
                         </div>
                    </div>

                    <div className="mb-4">
                         <span className="inline-block py-1 px-3 rounded-full bg-white/10 border border-white/20 text-xs font-bold uppercase tracking-wider mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                             {slides[activeSlide].step}
                         </span>
                         <h2 className="text-4xl font-bold mb-4 leading-tight transition-all duration-500">
                             {slides[activeSlide].title}
                         </h2>
                         <p className="text-lg text-gray-200 max-w-md mx-auto leading-relaxed opacity-90">
                             {slides[activeSlide].desc}
                         </p>
                    </div>
                    
                    <div className="mt-8 flex gap-3 justify-center">
                        {slides.map((_, idx) => (
                            <button 
                                key={idx}
                                onClick={() => setActiveSlide(idx)}
                                className={`h-2 rounded-full transition-all duration-300 ${activeSlide === idx ? 'w-8 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}