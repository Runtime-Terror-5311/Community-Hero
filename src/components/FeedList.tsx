/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Beautiful, responsive Side-Feed / Mobile Bottom-Sheet containing all active, urgent,
// or resolved cards reported near SOMA coordinates. Features skeleton loaders, optimistic upvote ticks,
// flag indicators, and custom AI confidence score readouts.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThumbsUp, Check, AlertTriangle, User, Calendar, MapPin, BadgeCheck, Sparkles, Flag, Loader2, RefreshCcw, ShieldAlert } from 'lucide-react';
import { Issue } from '../types';
import { useToast } from './NotificationToast';

interface FeedListProps {
  issues: Issue[];
  selectedIssue: Issue | null;
  onSelectIssue: (issue: Issue | null) => void;
  onRefresh: () => void;
  isLoading: boolean;
  authToken: string;
  activeUserId: string;
  userCoords: [number, number] | null;
}

export const FeedList: React.FC<FeedListProps> = ({
  issues,
  selectedIssue,
  onSelectIssue,
  onRefresh,
  isLoading,
  authToken,
  activeUserId,
  userCoords
}) => {
  const [upvotingIds, setUpvotingIds] = useState<string[]>([]);
  const [resolvingIds, setResolvingIds] = useState<string[]>([]);
  const [flaggingIds, setFlaggingIds] = useState<string[]>([]);
  
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);
  const [resolutionImage, setResolutionImage] = useState<string>('');
  const [resolutionImageName, setResolutionImageName] = useState<string>('');
  const [flagReasonId, setFlagReasonId] = useState<string | null>(null);
  const [customReasonText, setCustomReasonText] = useState<string>('');

  const [reportUserTarget, setReportUserTarget] = useState<{ userId: string; username: string } | null>(null);
  const [userReportReason, setUserReportReason] = useState<string>('');
  const [reportingUserIds, setReportingUserIds] = useState<string[]>([]);

  const { showToast } = useToast();

  const handleResolutionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        showToast("Maximum image upload size is 8MB.", "error");
        return;
      }
      setResolutionImageName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setResolutionImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Optimistic upvote handler
  const handleUpvote = async (issueId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!authToken) {
      showToast("Authentication required! Please register or log in first.", 'error');
      return;
    }

    setUpvotingIds(prev => [...prev, issueId]);

    try {
      const response = await fetch(`/api/issues/${issueId}/upvote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        showToast(data.message, 'success');
        onRefresh(); // Refresh parent feed data
      } else {
        showToast(data.error || "Could not cast verification vote.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Network fault while transmitting vote.", 'error');
    } finally {
      setUpvotingIds(prev => prev.filter(id => id !== issueId));
    }
  };

  // Resolve issue handler
  const handleResolve = async (issueId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!authToken) {
      showToast("Authentication required to verify municipal resolutions.", 'error');
      return;
    }
    setConfirmResolveId(issueId);
  };

  const executeResolve = async (issueId: string) => {
    if (!resolutionImage) {
      showToast("Please select a photo of the repaired hazard to proceed.", 'error');
      return;
    }

    setConfirmResolveId(null);
    setResolvingIds(prev => [...prev, issueId]);

    try {
      const response = await fetch(`/api/issues/${issueId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          userLatitude: userCoords ? userCoords[1] : undefined,
          userLongitude: userCoords ? userCoords[0] : undefined,
          resolvedImage: resolutionImage
        })
      });
      const data = await response.json();
      if (response.ok) {
        showToast(data.message, 'success');
        setResolutionImage('');
        setResolutionImageName('');
        onRefresh();
      } else {
        showToast(data.error || "Failed to catalog resolution.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Could not send resolution reports.", 'error');
    } finally {
      setResolvingIds(prev => prev.filter(id => id !== issueId));
    }
  };

  const handleReportUser = (userId: string, username: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!authToken) {
      showToast("Please log in to report community profiles.", 'error');
      return;
    }
    setReportUserTarget({ userId, username });
    setUserReportReason('');
  };

  const executeReportUser = async (userId: string, reason: string) => {
    if (!reason.trim()) {
      showToast("Please provide a reason for the report.", 'error');
      return;
    }
    setReportUserTarget(null);
    setReportingUserIds(prev => [...prev, userId]);

    try {
      const response = await fetch(`/api/issues/users/${userId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await response.json();
      if (response.ok) {
        showToast(data.message, 'success');
        onRefresh();
      } else {
        showToast(data.error || "Failed to submit user report.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Could not send user report.", 'error');
    } finally {
      setReportingUserIds(prev => prev.filter(id => id !== userId));
    }
  };

  // Flag issue handler (fraud report)
  const handleFlag = async (issueId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!authToken) {
      showToast("Login to flag fake posts.", 'error');
      return;
    }
    setFlagReasonId(issueId);
    setCustomReasonText('');
  };

  const executeFlag = async (issueId: string, reason: string) => {
    if (!reason.trim()) {
      showToast("Please provide a reason to flag this report.", 'error');
      return;
    }
    setFlagReasonId(null);
    setFlaggingIds(prev => [...prev, issueId]);

    try {
      const response = await fetch(`/api/issues/${issueId}/flag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await response.json();
      if (response.ok) {
        showToast(data.message, 'success');
        onRefresh();
      } else {
        showToast(data.error || "Failed to lodge flag report.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Could not log flag signal.", 'error');
    } finally {
      setFlaggingIds(prev => prev.filter(id => id !== issueId));
    }
  };

  // Filter issues lists
  const filteredIssues = (Array.isArray(issues) ? issues : []).filter(iss => {
    if (!iss) return false;
    const isCategoryMatch = categoryFilter === 'all' || iss.category === categoryFilter;
    const isStatusMatch = statusFilter === 'all' || iss.status === statusFilter;
    return isCategoryMatch && isStatusMatch;
  });

  return (
    <div className="flex flex-col h-full text-slate-800" id="municipal-feed">
      {/* Filtering Actions bar */}
      <div className="flex flex-col gap-2 pb-4 mb-4 border-b border-slate-200">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold font-sans tracking-tight text-slate-900">Active SOMA Street Grid Reports</h2>
          <button 
            onClick={onRefresh} 
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm p-2 rounded-lg text-slate-500 hover:text-slate-800 text-xs select-none cursor-pointer font-medium"
          >
            <RefreshCcw className={`h-3 w-3 text-slate-500 ${isLoading && 'animate-spin'}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Category drop selection */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-slate-200 focus:border-blue-500/50 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 outline-none shadow-sm"
          >
            <option value="all">Any Category</option>
            <option value="pothole">Road Potholes</option>
            <option value="broken-streetlight">Broken Streetlights</option>
            <option value="water-leak">Water Pipe Leaks</option>
            <option value="trash">Accumulated Trash</option>
            <option value="other">Other Malfunctions</option>
          </select>

          {/* Status drop selection */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 focus:border-blue-500/50 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 outline-none shadow-sm"
          >
            <option value="all">Any Status</option>
            <option value="active">Active Reports</option>
            <option value="urgent">Urgent Escalation</option>
            <option value="resolved">Resolved Tasks</option>
          </select>
        </div>
      </div>

      {/* Issues feed scroll zone */}
      <div className="flex-1 overflow-y-auto space-y-4 max-h-[500px] md:max-h-[600px] pr-1.5">
        {isLoading ? (
          // Frictionless Skeleton placeholders during initial loading phases
          Array.from({ length: 3 }).map((_, idx) => (
            <div key={`skeleton-${idx}`} className="bg-white border border-slate-200 rounded-2xl p-4 animate-pulse space-y-3 shadow-sm">
              <div className="flex gap-2 justify-between">
                <div className="h-5 w-24 bg-slate-100 rounded-lg" />
                <div className="h-5 w-16 bg-slate-100 rounded-lg" />
              </div>
              <div className="h-12 bg-slate-100 rounded-xl" />
              <div className="flex gap-4">
                <div className="h-4.5 w-16 bg-slate-100 rounded-lg" />
                <div className="h-4.5 w-16 bg-slate-100 rounded-lg" />
              </div>
            </div>
          ))
        ) : filteredIssues.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm select-none">
            <p className="text-slate-400 text-xs font-mono">No incident reports located under current filters.</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredIssues.map((issue) => {
              const isSelected = selectedIssue?.id === issue.id;
              const isResolved = issue.status === 'resolved';
              const isUrgent = issue.status === 'urgent';
              const isUpvotedByMe = activeUserId && Array.isArray(issue.upvotes) && issue.upvotes.includes(activeUserId);

              let statusBg = "bg-blue-500 text-white";
              if (isResolved) statusBg = "bg-green-500 text-white";
              else if (isUrgent) statusBg = "bg-red-500 text-white";

              let cardBg = "bg-white border-slate-200 hover:border-slate-350";
              if (isResolved) cardBg = "bg-emerald-50/10 border-emerald-100 hover:border-emerald-250";
              else if (isUrgent) cardBg = "bg-red-50/20 border-red-100 hover:border-red-250";

              return (
                <motion.div
                  key={issue.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => onSelectIssue(isSelected ? null : issue)}
                  id={`map-anchor-${issue.id}`}
                  className={`border rounded-2xl p-4 cursor-pointer transition-all shadow-sm overflow-hidden relative group/card ${cardBg} ${
                    isSelected ? 'ring-2 ring-blue-500/35 shadow-md' : ''
                  }`}
                >
                  {/* Category & Status Headers */}
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <span className="text-[10px] font-mono tracking-wider uppercase bg-slate-50 text-slate-600 font-bold px-2 py-0.5 rounded border border-slate-200">
                      📋 {issue.category}
                    </span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${statusBg}`}>
                      {issue.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Core Incident Visual Row */}
                  <div className="flex gap-3 mb-3.5 items-start">
                    {issue.imageUrl && (
                      <div className="relative w-18 h-18 rounded-xl overflow-hidden border border-slate-150 shrink-0">
                        <img referrerPolicy="no-referrer" src={issue.imageUrl} alt="Incident snapshot" className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300" />
                        
                        {/* Interactive zoom banner overlay */}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
                          <MapPin className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 min-w-0">
                      <p className="text-xs text-slate-700 font-medium leading-relaxed font-sans line-clamp-2 md:line-clamp-3">
                        {issue.description}
                      </p>
                      
                      {/* Municipal Location Reference */}
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>(Lat: {issue.location?.coordinates?.[1]?.toFixed(4) || '0.000'}, Lng: {issue.location?.coordinates?.[0]?.toFixed(4) || '0.000'})</span>
                        {issue.distanceKm !== undefined && (
                          <span className="text-blue-600 font-bold bg-blue-50 px-1.5 py-0.2 rounded-md">
                            ~{issue.distanceKm} km away
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Resolution Report (Repaired View) */}
                  {issue.resolvedImageUrl && (
                    <div className="bg-emerald-50/70 border border-emerald-500/10 p-2.5 rounded-xl space-y-2 mb-3 shadow-xs">
                      <div className="flex justify-between items-center text-[10px] font-bold text-emerald-800 tracking-tight select-none font-sans">
                        <span className="flex items-center gap-1">
                          <Check className="h-3.5 w-3.5 text-emerald-600 bg-emerald-100/80 rounded-full p-0.5" />
                          Community Repaired Status
                        </span>
                        {issue.resolvedAt && (
                          <span className="text-[9px] text-emerald-650 font-mono">
                            {new Date(issue.resolvedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex gap-2.5 items-center">
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-emerald-150 shrink-0 shadow-xs">
                          <img referrerPolicy="no-referrer" src={issue.resolvedImageUrl} alt="Repaired Snapshot" className="w-full h-full object-cover" />
                        </div>
                        <div className="space-y-0.5 text-slate-700 min-w-0">
                          <p className="text-[10.5px] font-semibold leading-tight text-emerald-900">
                            Verified Resolved
                          </p>
                          <p className="text-[9.5px] text-slate-500 font-medium truncate">
                            Repaired photo uploaded by <span className="font-bold text-emerald-700">@{issue.resolvedByUsername || "citizen"}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. High-Quality Gemini AI Gatekeeper Feedback Dashboard */}
                  <div className="bg-slate-50 border border-blue-500/10 p-2.5 rounded-xl space-y-1.5 shadow-inner mb-3">
                    <div className="flex justify-between items-center text-[10px] font-bold text-blue-700 tracking-tight select-none font-sans">
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                        Gemini AI Gatekeeper Analysis
                      </span>
                      <span className="bg-blue-50 text-blue-600 px-1.5 py-0.2 rounded border border-blue-100 text-[9px] font-extrabold uppercase">
                        Confidence {issue.aiDetails?.confidenceScore || 0}%
                      </span>
                    </div>
                    
                    <p className="text-[10.5px] italic text-slate-650 leading-tight">
                      💬 "{issue.aiDetails?.autoDescription || 'Auto triage parsed and successfully mapped.'}"
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-150 text-[10px] font-mono text-slate-400">
                      <div>Triage Severity: <span className="font-bold text-slate-700">{issue.aiDetails?.severityScore || 0}/10</span></div>
                      <div className="text-right">Re-assessed: <span className="font-bold text-blue-600">{issue.aiDetails?.verifiedCategory || issue.category}</span></div>
                    </div>
                  </div>

                  {/* Metadatas Row (Author details + timestamp EXIF validation) */}
                  <div className="flex justify-between items-center text-[10.5px] text-slate-500 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center justify-center h-4.5 w-4.5 rounded-full bg-slate-100">
                        <User className="h-3 w-3 text-slate-500" />
                      </div>
                      <span className="text-slate-600 font-semibold truncate max-w-[80px]">
                        {issue.reporter.username}
                      </span>
                      <BadgeCheck className="h-3.5 w-3.5 text-blue-600" title={`High-Rank Trust score: ${issue.reporter.trustScore}`} />
                      {authToken && activeUserId !== issue.reporter.id && (
                        <button
                          onClick={(e) => handleReportUser(issue.reporter.id, issue.reporter.username, e)}
                          title="Report this user's profile for malicious/fake activity"
                          className="ml-1 p-0.5 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded transition-colors cursor-pointer"
                        >
                          <Flag className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-[9.5px]">
                        {new Date(issue.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* 4. Action Bars (Upvoting, Flagging, Resolving) */}
                  <div className="flex justify-between items-center pt-2.5">
                    <button
                      onClick={(e) => handleUpvote(issue.id, e)}
                      disabled={upvotingIds.includes(issue.id) || isResolved}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all active:scale-95 ${
                        isResolved
                          ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                          : isUpvotedByMe
                          ? 'bg-blue-50 border-blue-200 text-blue-600'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-650 hover:text-slate-900'
                      }`}
                      title={isResolved ? "Resolved issues cannot be upvoted" : isUpvotedByMe ? "Retract validation" : "Upvote to verify"}
                    >
                      {upvotingIds.includes(issue.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ThumbsUp className={`h-3.5 w-3.5 ${isUpvotedByMe ? 'fill-current font-black' : ''}`} />
                      )}
                      <span>
                        {isResolved ? "Verified" : isUpvotedByMe ? "Verified" : "Verify"} ({Array.isArray(issue.upvotes) ? issue.upvotes.length : 0})
                      </span>
                    </button>

                    <div className="flex gap-2">
                      {/* Resolve button (available to and rewards original reporter, or any authenticated agent) */}
                      {!isResolved && (
                        <button
                          onClick={(e) => handleResolve(issue.id, e)}
                          disabled={resolvingIds.includes(issue.id)}
                          className="bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer shadow-sm"
                          title="Verify Resolved (+50 Civic points to reporter)"
                        >
                          {resolvingIds.includes(issue.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 text-emerald-500" />
                          )}
                        </button>
                      )}

                      {/* Flag button to fight fraud */}
                      {!isResolved && (
                        <button
                          onClick={(e) => handleFlag(issue.id, e)}
                          disabled={flaggingIds.includes(issue.id)}
                          className="bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 p-1.5 rounded-lg text-slate-500 hover:text-red-500 transition-colors cursor-pointer shadow-sm"
                          title="Report Fake / Fraudulent Submission"
                        >
                          {flaggingIds.includes(issue.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Flag className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Custom Non-Blocking Dialogs to avoid iframe restriction failures */}
      <AnimatePresence>
        {confirmResolveId && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-xl space-y-4"
            >
              <div className="flex items-center gap-3 text-emerald-600">
                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Check className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Verify Resolution</h3>
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed">
                Has this hazard genuinely been resolved or cleared? To verify, you must upload an image of the repaired infrastructure. Marking yes distributes +50 civic points to the original reporter!
              </p>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                  Proof of Repair / Resolution Photo *
                </label>
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-xl p-4 transition-colors bg-slate-50 hover:bg-slate-50/50 cursor-pointer relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleResolutionFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {resolutionImage ? (
                    <div className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-100">
                      <img src={resolutionImage} alt="Repaired preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <span className="text-white text-[10px] font-semibold bg-emerald-600 px-2 py-0.5 rounded-full">Change Photo</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-1">
                      <div className="text-xs font-semibold text-slate-600">Click or drag image to upload</div>
                      <div className="text-[10px] text-slate-400">Supporting PNG, JPG, up to 8MB</div>
                    </div>
                  )}
                </div>
                {resolutionImageName && !resolutionImage && (
                  <p className="text-[10px] text-slate-500 font-mono truncate">{resolutionImageName}</p>
                )}
              </div>

              <div className="flex gap-2.5 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmResolveId(null);
                    setResolutionImage('');
                    setResolutionImageName('');
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!resolutionImage}
                  onClick={() => executeResolve(confirmResolveId)}
                  className={`px-4 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer shadow-md ${
                    resolutionImage 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100' 
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  Confirm Resolved
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {flagReasonId && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-xl space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Flag Submission</h3>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reason for Flagging</label>
                <textarea
                  value={customReasonText}
                  onChange={(e) => setCustomReasonText(e.target.value)}
                  placeholder="e.g. Outdated hazard, fake or offline photograph, duplicate or inappropriate description..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                />
              </div>
              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setFlagReasonId(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeFlag(flagReasonId, customReasonText)}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-md shadow-rose-100 transition-colors cursor-pointer"
                >
                  Submit Flag
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {reportUserTarget && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-xl space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Report User: @{reportUserTarget.username}</h3>
              </div>
              <p className="text-xs text-slate-605">
                Reporting a community member logs a formal strike. Accounts with 10+ community-reported violations are automatically banned.
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reason for Report</label>
                <textarea
                  value={userReportReason}
                  onChange={(e) => setUserReportReason(e.target.value)}
                  placeholder="e.g. Reporting fake hazards, duplicate accounts, offensive/spam comments or descriptions..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                />
              </div>
              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setReportUserTarget(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeReportUser(reportUserTarget.userId, userReportReason)}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-md shadow-rose-100 transition-colors cursor-pointer"
                >
                  Submit Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
