/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Premium design login & registration modal to support credential-based citizen sessions 
// and update dynamic Level and Trust indicators.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, User as UserIcon, ShieldAlert } from 'lucide-react';
import { useToast } from './NotificationToast';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGoogleSsoSim, setShowGoogleSsoSim] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('shubhangi0100@gmail.com');
  const [customGoogleName, setCustomGoogleName] = useState('Shubhangi');
  const [isAnotherAccount, setIsAnotherAccount] = useState(false);
  
  const { showToast } = useToast();

  const handleGoogleSsoLogin = async (emailToUse: string, nameToUse: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse, username: nameToUse })
      });

      const data = await response.json();

      if (response.ok) {
        showToast(data.message || "Signed in securely with Google!", 'success');
        onAuthSuccess(data.user, data.token);
        onClose();
        // Reset states
        setShowGoogleSsoSim(false);
        setIsAnotherAccount(false);
      } else {
        showToast(data.error || "Google authentication failed.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Unable to reach Google authorization services.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (!isLogin && !username)) {
      showToast("Please fill in all requested fields.", 'error');
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin ? { email, password } : { email, username, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        showToast(data.message || "Auth successful!", 'success');
        onAuthSuccess(data.user, data.token);
        onClose();
        // Reset states
        setEmail('');
        setUsername('');
        setPassword('');
      } else {
        showToast(data.error || "A secure authentication error occurred.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Could not securely connect to the authentication server.", 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Mask Background */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-6 overflow-hidden text-slate-800 z-10"
          >
            {/* Header branding background decoration */}
            <div className="absolute top-0 inset-x-0 h-1 bg-blue-600" />
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold font-sans tracking-tight text-slate-900">
                  {isLogin ? 'Welcome Back Hero' : 'Register Civic Profile'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {isLogin ? 'Login to report, verify, and resolve issues near you.' : 'Create an offline validated civilian account.'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="hover:bg-slate-100 p-2 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650">Citizen Username</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. StreetSweeper99"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                      required={!isLogin}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@community.org"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650">Secure Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full relative group bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed rounded-xl py-3 text-sm font-bold shadow-lg shadow-blue-100 cursor-pointer overflow-hidden transition-all text-white"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing session...
                  </span>
                ) : (
                  isLogin ? 'Access Portal' : 'Register Profile'
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold hover:underline cursor-pointer"
                >
                  {isLogin ? "No civic profile yet? Create account" : "Already a community player? Login here"}
                </button>
              </div>

              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-150" />
                </div>
                <span className="relative bg-white px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Or continue with
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowGoogleSsoSim(true)}
                className="w-full flex items-center justify-center gap-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl py-2.5 text-xs font-bold shadow-sm transition-all cursor-pointer hover:border-slate-350"
              >
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" strokeWidth="0" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Sign In with Google
              </button>
            </form>

            {/* Micro-Disclaimer showing sandboxed details */}
            <div className="mt-5 border-t border-slate-100 pt-4 flex gap-2 items-start text-[10px] text-slate-500">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-slate-400" />
              <p className="leading-tight">
                This is a secure sandboxed account. Login profiles are safely maintained on the local Express database for this session. Use realistic mock details.
              </p>
            </div>

            {/* Google SSO Simulator Overlay */}
            {showGoogleSsoSim && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute inset-0 bg-white z-20 p-6 flex flex-col justify-between rounded-2xl"
              >
                <div>
                  <div className="flex justify-between items-center mb-6">
                    {/* Google Logo */}
                    <div className="flex items-center gap-1.5">
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" strokeWidth="0" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span className="text-xs font-bold text-slate-500 font-sans tracking-tight">Google</span>
                    </div>
                    <button
                      onClick={() => { setShowGoogleSsoSim(false); setIsAnotherAccount(false); }}
                      className="hover:bg-slate-100 p-1.5 rounded-lg text-slate-400 hover:text-slate-750 transition-colors cursor-pointer"
                    >
                      <X className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  <h3 className="text-lg font-medium font-sans text-slate-900 tracking-tight text-left">
                    Sign in with Google
                  </h3>
                  <p className="text-xs text-slate-500 text-left mt-1">
                    to continue to <span className="font-bold text-blue-600">Community Hero</span>
                  </p>

                  <div className="mt-6 space-y-3">
                    {!isAnotherAccount ? (
                      <>
                        {/* Option 1: Suggested active email from metadata */}
                        <button
                          onClick={() => handleGoogleSsoLogin(customGoogleEmail, customGoogleName)}
                          className="w-full flex items-center justify-between p-3 border border-slate-150 hover:border-blue-400 rounded-xl hover:bg-blue-50/10 text-left transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                              {customGoogleName[0] || 'S'}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{customGoogleName}</p>
                              <p className="text-[10px] text-slate-500">{customGoogleEmail}</p>
                            </div>
                          </div>
                          <span className="text-[10px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                            One-Tap Login
                          </span>
                        </button>

                        {/* Option 2: Choose another account */}
                        <button
                          onClick={() => setIsAnotherAccount(true)}
                          className="w-full flex items-center gap-3 p-3 border border-slate-100 hover:border-slate-350 rounded-xl hover:bg-slate-50 text-left transition-all cursor-pointer"
                        >
                          <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm">
                            +
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-750">Use another account</p>
                            <p className="text-[10px] text-slate-400">Type any custom Google email</p>
                          </div>
                        </button>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 text-left block">Google Email</label>
                          <input
                            type="email"
                            value={customGoogleEmail}
                            onChange={(e) => {
                              setCustomGoogleEmail(e.target.value);
                              // Auto-suggest name from email prefix
                              const parts = e.target.value.split('@');
                              if (parts[0]) {
                                setCustomGoogleName(parts[0].charAt(0).toUpperCase() + parts[0].slice(1));
                              }
                            }}
                            placeholder="username@gmail.com"
                            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 text-left block">Display Name</label>
                          <input
                            type="text"
                            value={customGoogleName}
                            onChange={(e) => setCustomGoogleName(e.target.value)}
                            placeholder="e.g. HeroPlayer"
                            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsAnotherAccount(false)}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-750 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGoogleSsoLogin(customGoogleEmail, customGoogleName)}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 text-xs font-bold shadow-md shadow-blue-100 transition-all cursor-pointer"
                          >
                            Authenticate
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer terms */}
                <div className="text-[9px] text-slate-400 leading-normal text-left border-t border-slate-100 pt-3 mt-4">
                  Google will securely share your name, email address, language preference, and profile picture with Community Hero. Review their <a href="#" className="text-blue-500 hover:underline">Privacy Policy</a> and <a href="#" className="text-blue-500 hover:underline">Terms of Service</a>.
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
