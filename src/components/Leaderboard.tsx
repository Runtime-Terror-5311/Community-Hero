/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// A highly polished, data-dense local leaderboard querying top users by points.
// Inspires healthy citizen competition with custom ranks, trust ratings, and levels.

import React from 'react';
import { Trophy, Star, Shield, Award, Users, Crosshair, ArrowUp } from 'lucide-react';
import { LeaderboardItem } from '../types';

interface LeaderboardProps {
  items: LeaderboardItem[];
  userRank: number | null;
  userPoints: number;
  userLevel: number;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  items,
  userRank,
  userPoints,
  userLevel
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-850 shadow-sm animate-fade-in" id="civic-leaderboard">
      {/* Dynamic Personal Level Summary Header */}
      <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex items-center justify-between mb-5">
        <div className="space-y-1">
          <span className="text-[9.5px] uppercase font-bold tracking-wider text-blue-600">My Civic Rank status</span>
          <h3 className="text-sm font-bold font-sans flex items-center gap-1 text-slate-800">
            <Award className="h-4.5 w-4.5 text-amber-500" />
            Civic Defender Lvl {userLevel}
          </h3>
          <p className="text-[10.5px] text-slate-500 font-medium">
            Earned {userPoints} total points. {100 - (userPoints % 100)} pts to next level.
          </p>
        </div>
        <div className="bg-white rounded-xl p-2.5 border border-blue-150 text-center shrink-0 min-w-[70px] shadow-sm">
          <span className="block text-[10px] text-blue-600 font-bold leading-none">Rank</span>
          <span className="block text-xl font-black font-sans text-slate-900 mt-1">
            #{userRank ? userRank : '—'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
        <Trophy className="h-5 w-5 text-amber-500" />
        <div>
          <h3 className="text-sm font-bold font-sans tracking-tight text-slate-900">Active Town Leaderboard</h3>
          <p className="text-[10px] text-slate-500 font-medium">Top contributors in SOMA Municipal sector</p>
        </div>
      </div>

      {/* Sorted Leaderboard Roster */}
      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-center py-4 text-slate-400 text-xs font-mono">
            Syncing roster boards...
          </div>
        ) : (
          items.map((citizen, index) => {
            const isTop3 = index < 3;
            let rankColor = "text-slate-400";
            if (index === 0) rankColor = "text-amber-500 font-extrabold";
            else if (index === 1) rankColor = "text-slate-450 font-extrabold";
            else if (index === 2) rankColor = "text-amber-700 font-bold";

            return (
              <div
                key={citizen.username}
                className="bg-slate-50 border border-slate-150 p-2.5 rounded-xl flex items-center justify-between gap-2 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Rank bracket */}
                  <span className={`text-xs text-mono w-5 shrink-0 text-center ${rankColor}`}>
                    {index === 0 && '🥇'}
                    {index === 1 && '🥈'}
                    {index === 2 && '🥉'}
                    {index > 2 && `${index + 1}`}
                  </span>

                  {/* Citizen Profile Details */}
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-800 truncate flex items-center gap-1">
                      {citizen.username}
                      {citizen.trustScore >= 90 && (
                        <Shield className="h-3 w-3 text-emerald-600 fill-current" title="Validated High-Trust" />
                      )}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <span>Lvl {citizen.level}</span>
                      <span>•</span>
                      <span>Trust {citizen.trustScore}%</span>
                    </div>
                  </div>
                </div>

                {/* Score badge */}
                <div className="text-right shrink-0">
                  <span className="block text-xs font-bold text-slate-800 font-mono flex items-center gap-0.5 justify-end">
                    {citizen.civicPoints}
                    <ArrowUp className="h-3 w-3 text-emerald-500" />
                  </span>
                  <span className="block text-[9px] text-slate-450 leading-none">
                    {citizen.reportedCount} reps • {citizen.verifiedCount} v_votes
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Dynamic Points Economics Key */}
      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[10px] font-mono text-slate-400">
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/50">
          <span className="block text-slate-400 text-[9px]">Post Danger</span>
          <span className="block font-bold mt-0.5 text-blue-650">+10 Pts</span>
        </div>
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/50">
          <span className="block text-slate-400 text-[9px]">Upvote Verify</span>
          <span className="block font-bold mt-0.5 text-blue-650">+2 Pts</span>
        </div>
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/50">
          <span className="block text-slate-400 text-[9px]">Task Resolved</span>
          <span className="block font-bold mt-0.5 text-blue-650">+50 Pts</span>
        </div>
      </div>
    </div>
  );
};
