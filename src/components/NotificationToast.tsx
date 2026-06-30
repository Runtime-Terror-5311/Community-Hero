/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Elegant, lightweight toast notification system with custom animations
// for feedback on upvotes, submissions, and AI validations.

import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'ai-triage';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  rejectionReason?: string;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType, rejectionReason?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType, rejectionReason?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts([{ id, message, type, rejectionReason }]);
    
    // Automatically dismiss standard toasts after 3.5 seconds
    if (type !== 'ai-triage') {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      
      {/* Toast Render Area - Centered at the middle top of the screen */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none select-none w-auto max-w-[90vw]">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, scale: 0.95, y: -15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
              className={`px-4 py-2 rounded-full shadow-lg border backdrop-blur-md flex items-center justify-center text-center pointer-events-auto ${
                toast.type === 'success' 
                  ? 'bg-emerald-600/80 border-emerald-500 text-white'
                  : toast.type === 'error'
                  ? 'bg-red-600/80 border-red-500 text-white'
                  : toast.type === 'ai-triage'
                  ? 'bg-blue-600/80 border-blue-500 text-white animate-pulse'
                  : 'bg-slate-800/80 border-slate-700 text-white'
              } w-auto`}
            >
              <span className="text-[11px] font-bold tracking-tight whitespace-nowrap px-1">
                {toast.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
};
