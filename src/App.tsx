/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Primary entry framework shell for 'Community Hero'.
// Connects the high-contrast Street SVG Map Dashboard, incident FeedList, Report submission workflow, and Leaderboards.
// Implements secure off-line localStorage persistence, user location tracking, and mobile fluid panels.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ToastProvider, useToast } from './components/NotificationToast';
import { MapDashboard } from './components/MapDashboard';
import { FeedList } from './components/FeedList';
import { SubmissionForm } from './components/SubmissionForm';
import { Leaderboard } from './components/Leaderboard';
import { AuthModal } from './components/AuthModal';
import { Issue, User, LeaderboardItem } from './types';
import { 
  ShieldCheck, 
  PlusCircle, 
  ListFilter, 
  Trophy, 
  LogIn, 
  LogOut, 
  Grid, 
  MapPin, 
  Navigation,
  Sparkles,
  Info
} from 'lucide-react';

// Safe LocalStorage wrapper to prevent crash under restricted iframe/sandbox cookie blocks
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage access restricted. Session persistence disabled.", e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Storage write restricted.", e);
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("Storage delete restricted.", e);
    }
  }
};

function AppShell() {
  // Authentication stats
  const [authToken, setAuthToken] = useState<string>(safeLocalStorage.getItem('hero_auth_token') || '');
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  // Core geographical structures
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null); // [lng, lat]
  const [dropPinCoords, setDropPinCoords] = useState<[number, number] | null>(null); // [lng, lat]
  const [gpsLoading, setGpsLoading] = useState(false);

  // Data fetching elements
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);

  // Multi-view active tab selection for smaller mobile layouts
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'feed' | 'report' | 'leaderboard'>('feed');

  const { showToast } = useToast();

  // Load user profile if token is present
  const fetchMyProfile = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setActiveUser(data.user);
      } else {
        // Stale session
        handleLogout();
      }
    } catch (err) {
      console.warn("Authentication profile sync delayed.", err);
    }
  }, []);

  // Fetch active issues (with optional proximity filter if coordinates locked!)
  const fetchIssuesList = useCallback(async () => {
    setIsLoadingFeed(true);
    try {
      let queryUrl = '/api/issues';
      if (userCoords) {
        queryUrl += `?lng=${userCoords[0]}&lat=${userCoords[1]}&radius=15`; // Proximity search within 15km
      }

      const response = await fetch(queryUrl);
      if (response.ok) {
        const data = await response.json();
        setIssues(Array.isArray(data.issues) ? data.issues : []);
      }
    } catch (err) {
      console.error(err);
      showToast("Frictionless network alert. Failed to query active map pins.", 'error');
    } finally {
      setIsLoadingFeed(false);
    }
  }, [userCoords, showToast]);

  // Fetch SOMA leaderboards roster
  const fetchLeaderboardsList = useCallback(async () => {
    try {
      const response = await fetch('/api/issues/leaderboard');
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Bootstrap initial queries
  useEffect(() => {
    if (authToken) {
      fetchMyProfile(authToken);
    }
    fetchIssuesList();
    fetchLeaderboardsList();
  }, [authToken, userCoords]);

  // Handles successful registration/login sessions
  const handleAuthSuccess = (user: User, token: string) => {
    setAuthToken(token);
    setActiveUser(user);
    safeLocalStorage.setItem('hero_auth_token', token);
  };

  const handleLogout = () => {
    setAuthToken('');
    setActiveUser(null);
    safeLocalStorage.removeItem('hero_auth_token');
    showToast("Logged out of citizen portal. Profile statistics saved.", "info");
  };

  // Queries actual HTML5 browser and centers viewport coords with IP fallback
  const fallbackToIpLocation = async () => {
    setGpsLoading(true);
    
    // Fallback 1: freeipapi.com (Reliable, unlimited, HTTPS CORS-enabled)
    try {
      const res = await fetch('https://freeipapi.com/api/json');
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          const lat = parseFloat(data.latitude);
          const lng = parseFloat(data.longitude);
          setUserCoords([lng, lat]);
          setGpsLoading(false);
          return true;
        }
      }
    } catch (e) {
      console.warn("freeipapi lookup failed, trying ip-api.com:", e);
    }

    // Fallback 2: ip-api.com (HTTP fallback, but fallback secure if needed or other lookup)
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          const lat = parseFloat(data.latitude);
          const lng = parseFloat(data.longitude);
          setUserCoords([lng, lat]);
          setGpsLoading(false);
          return true;
        }
      }
    } catch (e) {
      console.warn("ipapi.co fallback failed too:", e);
    }

    // Fallback 3: Hardcoded SOMA San Francisco
    setUserCoords([-122.4150, 37.7780]);
    setGpsLoading(false);
    return false;
  };

  const handleGeolocationTrigger = () => {
    try {
      setGpsLoading(true);
      if (!navigator.geolocation) {
        fallbackToIpLocation();
        return;
      }
      
      // Try fast low-accuracy query first (highly successful on desktop/WiFi)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lng = parseFloat(position.coords.longitude.toFixed(5));
          const lat = parseFloat(position.coords.latitude.toFixed(5));
          setUserCoords([lng, lat]);
          setGpsLoading(false);
        },
        async (error) => {
          console.warn("Low accuracy GPS lock failed, trying high accuracy option...", error);
          // Try high accuracy just in case (more successful on hardware-GPS mobile)
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const lng = parseFloat(pos.coords.longitude.toFixed(5));
              const lat = parseFloat(pos.coords.latitude.toFixed(5));
              setUserCoords([lng, lat]);
              setGpsLoading(false);
            },
            async (err2) => {
              console.warn("High accuracy failed too, trying IP-based fallback...", err2);
              await fallbackToIpLocation();
            },
            { enableHighAccuracy: true, timeout: 5000 }
          );
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    } catch (err) {
      console.warn("GPS access restricted, attempting IP-based fallback...", err);
      fallbackToIpLocation();
    }
  };

  // Automatically fetch current location on load or reload
  useEffect(() => {
    handleGeolocationTrigger();
  }, []);

  // Synchronizes issue selections on the list with active map states
  const handleSelectIssueFromGrid = (issue: Issue | null) => {
    setSelectedIssue(issue);
    if (issue) {
      // Focus appropriate tab automatically
      setActiveWorkspaceTab('feed');
      // Scroll issue into view on feed
      const element = document.getElementById(`map-anchor-${issue.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // Calculate local user ranking if registered
  const userRankIndex = useMemo(() => {
    if (!activeUser || leaderboard.length === 0) return null;
    const index = leaderboard.findIndex(item => item.username === activeUser.username);
    return index !== -1 ? index + 1 : null;
  }, [activeUser, leaderboard]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans transition-colors antialiased select-none">
      
      {/* 1. Navigational Branding & Stats Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30 select-none">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600 p-2 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <ShieldCheck className="h-5.5 w-5.5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-1.5 leading-none">
                Community Hero
                <span className="text-[9.5px] bg-slate-100 text-blue-600 font-mono px-1.5 py-0.5 rounded border border-slate-200 font-extrabold uppercase select-none">SOMA Hub</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-medium leading-none mt-1">Hyperlocal infrastructure accountability network</p>
            </div>
          </div>

          {/* User Session profile statistics counters */}
          <div className="flex items-center gap-3">
            {activeUser ? (
              <div className="flex items-center gap-3 bg-[#f8fafc] p-1.5 pr-3 rounded-2xl border border-slate-200">
                <div className="bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-xl text-center">
                  <span className="block text-[8px] uppercase tracking-wider font-extrabold text-blue-600 leading-none">Civic Lvl</span>
                  <span className="block text-xs font-bold text-slate-900 mt-0.5">{activeUser.level}</span>
                </div>
                
                <div className="text-left hidden sm:block">
                  <span className="block text-xs font-bold text-slate-700 leading-none">{activeUser.username}</span>
                  <span className="block text-[10px] text-blue-600 font-bold font-mono mt-1">{activeUser.civicPoints} Civic Points</span>
                </div>

                <button 
                  onClick={handleLogout}
                  className="bg-white hover:bg-slate-100 border border-slate-200 p-2 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  title="Disconnect profile"
                >
                  <LogOut className="h-4.5 w-4.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-xs font-bold px-4 py-2.5 rounded-xl text-white shadow-lg shadow-blue-200 flex items-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer"
              >
                <LogIn className="h-4 w-4" />
                Auth Profile
              </button>
            )}
          </div>

        </div>
      </header>

      {/* 2. Primary Layout Workspace Box */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col md:flex-row gap-5 overflow-hidden">
        
        {/* Left Column: Interactive Vector Street Grid (Takes 60% wide space) */}
        <section className="flex-1 flex flex-col gap-4 min-w-0 md:max-h-[660px]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <h3 className="text-xs font-mono font-bold text-slate-800 flex items-center gap-1.5 uppercase">
                <Grid className="h-4 w-4 text-blue-600" />
                SOMA District Coordinates
              </h3>
              <p className="text-[10px] text-slate-500">
                {gpsLoading 
                  ? 'Loading...' 
                  : userCoords 
                  ? 'Current view' 
                  : 'Capture location grids to filter issues dynamically by distances.'}
              </p>
            </div>
            
            <button
              onClick={handleGeolocationTrigger}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 select-none transition-colors cursor-pointer ${
                userCoords
                  ? 'bg-blue-50 border-blue-150 text-blue-600 hover:bg-blue-100'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Navigation className={`h-4 w-4 ${(gpsLoading || userCoords) && 'animate-spin'}`} />
              {gpsLoading ? "Loading..." : userCoords ? "GPS Active" : "GPS Lock Feed"}
            </button>
          </div>

          <div className="flex-1 relative rounded-2xl overflow-hidden min-h-[300px] border border-slate-200 shadow-sm">
            <MapDashboard 
              issues={issues}
              selectedIssue={selectedIssue}
              onSelectIssue={handleSelectIssueFromGrid}
              dropPinCoords={dropPinCoords}
              onDropPin={(coords) => {
                setDropPinCoords(coords);
                // Switch tab to report automatically if pin dropped
                if (coords) {
                  setActiveWorkspaceTab('report');
                }
              }}
              isLoading={isLoadingFeed}
              userCoords={userCoords}
              onCaptureCoords={handleGeolocationTrigger}
            />
          </div>

          {/* Quick Informational Guide Segment */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex gap-2.5 items-start text-[11px] text-slate-600 select-none">
            <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
            <p className="leading-tight">
              <strong className="text-slate-800">Quick-start guide:</strong> Log in with a test profile, then click any roadway lane or park coordinate on the high-contrast map above to "drop a pin". This immediately copies the GPS coordinate bounds into the hazard reporting form panel on the right.
            </p>
          </div>
        </section>

        {/* Right Column: Interactive Side-Feed containing tabs (Takes 40% space) */}
        <section className="w-full md:w-[380px] shrink-0 flex flex-col gap-4 md:max-h-[660px]">
          
          {/* Quick-select Mobile Tab switches */}
          <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm grid grid-cols-3 gap-1 select-none">
            <button
              onClick={() => setActiveWorkspaceTab('feed')}
              className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeWorkspaceTab === 'feed'
                  ? 'bg-slate-100 border border-slate-200 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ListFilter className="h-3.5 w-3.5 text-blue-600" />
              Feed
            </button>
            <button
              onClick={() => setActiveWorkspaceTab('report')}
              className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeWorkspaceTab === 'report'
                  ? 'bg-slate-100 border border-slate-200 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <PlusCircle className="h-3.5 w-3.5 text-blue-650" />
              Report
            </button>
            <button
              onClick={() => setActiveWorkspaceTab('leaderboard')}
              className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                activeWorkspaceTab === 'leaderboard'
                  ? 'bg-slate-100 border border-slate-200 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              Civic Board
            </button>
          </div>

          {/* Active rendering panels based on workspace selections */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className={`${activeWorkspaceTab === 'feed' ? 'block' : 'hidden'}`}>
              <FeedList 
                issues={issues}
                selectedIssue={selectedIssue}
                onSelectIssue={handleSelectIssueFromGrid}
                onRefresh={() => { fetchIssuesList(); fetchLeaderboardsList(); }}
                isLoading={isLoadingFeed}
                authToken={authToken}
                activeUserId={activeUser?.id || ''}
                userCoords={userCoords}
              />
            </div>

            <div className={`${activeWorkspaceTab === 'report' ? 'block' : 'hidden'}`}>
              <SubmissionForm 
                dropPinCoords={dropPinCoords}
                onClearDropPin={() => setDropPinCoords(null)}
                onSuccessSubmit={() => {
                  fetchIssuesList();
                  fetchLeaderboardsList();
                  if (activeUser) {
                    fetchMyProfile(authToken); // Refresh user score metrics
                  }
                  setActiveWorkspaceTab('feed');
                }}
                authToken={authToken}
                onProfileRefresh={() => {
                  if (activeUser) {
                    fetchMyProfile(authToken);
                  }
                }}
                userCoords={userCoords}
              />
            </div>

            <div className={`${activeWorkspaceTab === 'leaderboard' ? 'block' : 'hidden'}`}>
              <Leaderboard 
                items={leaderboard}
                userRank={userRankIndex}
                userPoints={activeUser?.civicPoints || 0}
                userLevel={activeUser?.level || 1}
              />
            </div>
          </div>

        </section>

      </main>

      {/* Shared Modals */}
      <AuthModal 
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
