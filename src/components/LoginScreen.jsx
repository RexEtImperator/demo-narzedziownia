import React, { useState, useEffect } from 'react';
import { XCircleIcon, ArrowPathIcon, EyeIcon, EyeSlashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';

const LoginScreen = ({ onLogin }) => {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [rememberedProfiles, setRememberedProfiles] = useState([]);
  const [lowPerformanceMode, setLowPerformanceMode] = useState(false);

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('lowPerformanceMode');
      if (savedMode) {
        Promise.resolve().then(() => { setLowPerformanceMode(JSON.parse(savedMode)); });
      }
      const savedUsername = localStorage.getItem('rememberedUsername');
      if (savedUsername) {
        Promise.resolve().then(() => {
          setCredentials(prev => ({ ...prev, username: savedUsername }));
          setRememberMe(true);
        });
      }
      const savedProfilesRaw = localStorage.getItem('rememberedProfiles');
      if (savedProfilesRaw) {
        const list = JSON.parse(savedProfilesRaw);
        if (Array.isArray(list)) Promise.resolve().then(() => { setRememberedProfiles(list.filter(Boolean)); });
      }
    } catch (_) {
      // graceful no-op if localStorage is unavailable
    }
  }, []);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      // Bardzo subtelny ruch (max 5px w każdą stronę) - efekt "bardzo powolny"
      const x = (clientX / window.innerWidth - 0.5) * 10; 
      const y = (clientY / window.innerHeight - 0.5) * 10;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const performLogin = async (creds) => {
    setIsLoading(true);
    setError('');
    try {
      await onLogin(creds);
      try {
        if (rememberMe) {
          localStorage.setItem('rememberedUsername', creds.username);
          const next = Array.from(new Set([...(rememberedProfiles || []), creds.username].filter(Boolean)));
          localStorage.setItem('rememberedProfiles', JSON.stringify(next));
          setRememberedProfiles(next);
        }
      } catch (_) { void 0; }
    } catch (err) {
      setError(err.message || t('login.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await performLogin(credentials);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const updateCapsLock = (e) => {
    try {
      const isOn =
        (typeof e.getModifierState === 'function' && e.getModifierState('CapsLock')) ||
        (e.nativeEvent?.getModifierState?.('CapsLock')) ||
        false;
      setCapsLockOn(!!isOn);
    } catch (_) {
      setCapsLockOn(false);
    }
  };

  const handleSelectProfile = (username) => {
    setCredentials(prev => ({ ...prev, username }));
    // Focus on password field
    setTimeout(() => {
      const passwordInput = document.getElementById('password');
      if (passwordInput) {
        passwordInput.focus();
      }
    }, 50);
  };
  const handleRemoveProfile = (username) => {
    try {
      const next = (rememberedProfiles || []).filter(u => u !== username);
      localStorage.setItem('rememberedProfiles', JSON.stringify(next));
      setRememberedProfiles(next);
      const saved = localStorage.getItem('rememberedUsername');
      if (saved && saved === username) localStorage.removeItem('rememberedUsername');
    } catch (_) { void 0; }
  };

  const togglePerformanceMode = () => {
    setLowPerformanceMode(prev => {
      const next = !prev;
      localStorage.setItem('lowPerformanceMode', JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0f172a] text-white transition-colors duration-200 relative overflow-hidden font-sans">
      
      {/* Cinematic Background Effects */}
      {!lowPerformanceMode && (
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Deep space / nebula effect */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px] animate-pulse animation-delay-4000"></div>
        {/* "Wow" orange glow from top-left (matches inspiration light source) */}
        <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-orange-500/10 rounded-full blur-[100px] mix-blend-screen animate-blob"></div>
      </div>
      )}

      <style>{`
        @keyframes gradient-xy {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-xy {
          animation: gradient-xy 15s ease infinite;
        }
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 20s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>

      <div className="w-full md:w-1/2 flex items-center justify-center px-4 sm:px-6 lg:px-8 z-10 relative">
        <div className="max-w-md w-full space-y-4">
          <div className="text-center relative">
            {/* Logo glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-blue-500/20 blur-[40px] rounded-full -z-10"></div>
            <div className="flex justify-center mb-6">
              <img 
                src="/equipr-nobg.png" 
                alt="Logo systemu" 
                className="h-auto w-56 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" 
                loading="eager"
                decoding="async"
              />
            </div>
            <h2 className="text-4xl font-black text-white mb-2 tracking-tight drop-shadow-md">
              {t('login.title')}
            </h2>
            <p className="text-sm text-slate-400 font-medium tracking-wide uppercase opacity-80">{t('login.subtitle')}</p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="relative group">
              {/* Glassmorphism Card Container */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-purple-600/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-slate-900/40 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl ring-1 ring-white/5">
                <div className="space-y-2">
                  <div>
                    <label htmlFor="username" className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 ml-1">
                      {t('login.username')}
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      className="block w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 sm:text-sm shadow-inner"
                      placeholder={t('login.enterUsername')}
                      value={credentials.username}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 ml-1">
                      {t('login.password')}
                    </label>
                    <div className="relative group/input">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        className="block w-full px-4 py-3 pr-12 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 sm:text-sm shadow-inner"
                        placeholder={t('login.enterPassword')}
                        value={credentials.password}
                        onChange={handleChange}
                        onKeyDown={updateCapsLock}
                        onKeyUp={updateCapsLock}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-white transition-colors focus:outline-none"
                        disabled={isLoading}
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <EyeIcon className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {capsLockOn && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 px-3 py-1.5 rounded-lg border border-yellow-400/20">
                         <span>⚠️</span> {t('login.capsLock')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center">
                      <input
                        id="rememberMe"
                        name="rememberMe"
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 transition duration-150 ease-in-out"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={isLoading}
                      />
                      <label htmlFor="rememberMe" className="ml-2 block text-sm text-slate-300 select-none cursor-pointer">{t('login.rememberMe')}</label>
                    </div>
                  </div>
                </div>
                {error && (
                  <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-3 animate-pulse">
                    <XCircleIcon className="h-5 w-5 text-red-400 shrink-0" aria-hidden="true" />
                    <p className="text-sm text-red-300 font-medium">{error}</p>
                  </div>
                )}
                <div className="mt-6 pt-2 border-t border-slate-700/50">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] transform hover:-translate-y-0.5"
                  >
                    {isLoading ? (
                      <>
                        <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" aria-hidden="true" />
                        {t('login.loading')}
                      </>
                    ) : (
                      t('login.submit')
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-mono">ver. 2.6.5 • © 2026 Equipr</p>
          </div>
        </div>
      </div>
      
      <div className="hidden md:flex md:w-1/2 items-center justify-center relative z-0 bg-black">
        <div className="w-full h-full relative overflow-hidden">
          {/* Advanced gradient transition mask (Left to Right) */}
          <div className="absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-[#0f172a] via-[#0f172a]/80 to-transparent z-20 pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent z-20 pointer-events-none opacity-80"></div>
          
          {/* Color grading overlay */}
          <div className="absolute inset-0 z-10 bg-indigo-900/20 mix-blend-overlay"></div>
          
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <img 
              src="/login-screen-picture.png" 
              alt="Ilustracja narzędziowni" 
              className={`object-cover h-[110%] w-[110%] opacity-80 transition-transform duration-700 ease-out will-change-transform filter contrast-125 brightness-90 saturate-110 ${lowPerformanceMode ? '' : 'transform-gpu'}`}
              style={lowPerformanceMode ? {} : {
                transform: `translate(${mousePosition.x * -1}px, ${mousePosition.y * -1}px) scale(1.05)`
              }}
              loading="lazy"
              decoding="async"
            />

            {/* Remembered profiles overlay */}
            {Array.isArray(rememberedProfiles) && rememberedProfiles.length > 0 && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center space-y-4 bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-2xl animate-fade-in-up">
                  <p className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-1 drop-shadow-md">{t('login.rememberedTitle')}</p>
                  <div className="flex flex-col gap-3 w-full min-w-[200px]">
                    {rememberedProfiles.map(u => (
                      <div key={u} className="group/profile relative flex items-center transform transition-all duration-300 hover:scale-105">
                        <button
                          type="button"
                          onClick={() => handleSelectProfile(u)}
                          className="flex-1 flex items-center space-x-3 bg-slate-800/80 hover:bg-slate-700/90 border border-slate-600/50 hover:border-indigo-500/50 text-slate-200 hover:text-white px-4 py-3 rounded-xl shadow-lg hover:shadow-indigo-500/20 transition-all"
                          title={t('login.loginAs')}
                        >
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-inner shrink-0">
                            {u.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium tracking-wide truncate">{u}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemoveProfile(u); }}
                          className="absolute right-2 p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover/profile:opacity-100"
                          title={t('login.rememberedRemove')}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={togglePerformanceMode}
        className="fixed bottom-4 right-4 z-50 px-3 py-1 bg-black/50 hover:bg-black/70 text-xs text-gray-400 hover:text-white rounded-full border border-white/10 transition-colors backdrop-blur-sm"
        title={lowPerformanceMode ? "Włącz efekty wizualne" : "Wyłącz efekty dla lepszej wydajności"}
      >
        {lowPerformanceMode ? 'Włącz dodatki' : 'Wyłącz dodatki'}
      </button>
    </div>
  );
};

export default LoginScreen;
