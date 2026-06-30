/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Shared TypeScript type agreements across the Citizen frontend and Express server

export interface User {
  id: string;
  username: string;
  email: string;
  civicPoints: number;
  level: number;
  strikes: number;
  trustScore: number;
  reportedCount: number;
  verifiedCount: number;
  createdAt: string;
}

export interface Issue {
  id: string;
  reporter: {
    id: string;
    username: string;
    trustScore: number;
  };
  description: string;
  category: 'pothole' | 'broken-streetlight' | 'water-leak' | 'trash' | 'other';
  status: 'active' | 'urgent' | 'resolved' | 'flagged';
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  imageUrl: string;
  upvotes: string[]; // List of user IDs
  flags: Array<{ userId: string; reason: string; createdAt: string }>;
  aiDetails: {
    isValid: boolean;
    severityScore: number; // 1 to 10
    verifiedCategory: string;
    rejectionReason?: string;
    confidenceScore: number; // percentage
    autoDescription?: string;
    triagedAt: string;
  };
  createdAt: string;
  distanceKm?: number; // Calculated relative to search coordinates
  resolvedImageUrl?: string;
  resolvedByUsername?: string;
  resolvedAt?: string;
}

export interface LeaderboardItem {
  username: string;
  civicPoints: number;
  level: number;
  trustScore: number;
  reportedCount: number;
  verifiedCount: number;
  createdAt: string;
}
