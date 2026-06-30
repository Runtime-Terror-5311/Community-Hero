/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This file contains the complete requested MongoDB Mongoose Schemas for User and Issue.
// It implements standard GeoJSON spatial indexing, fields for the civic points economy (gamification), 
// and the server-side AI Details triaged by the Gemini model.

import mongoose, { Schema, Document } from 'mongoose';

// ==========================================
// 1. USER INTERFACE & SCHEMA (GAMIFIED)
// ==========================================

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  civicPoints: number;      // Points earned from reports, verification, and resolutions
  level: number;            // Elite level calculated based on points (e.g. Level = Math.floor(points/100) + 1)
  strikes: number;          // Count of fake/harmful reports flagged by community and moderators
  trustScore: number;       // Dynamically computed reputation score (0-100)
  reportedCount: number;
  verifiedCount: number;
  isBanned: boolean;        // Account banned status due to community violations
  reports: Array<{          // Community reports against this user
    reporter: mongoose.Types.ObjectId;
    reason: string;
    createdAt: Date;
  }>;
  createdAt: Date;
}

export const UserSchema = new Schema<IUser>({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/\S+@\S+\.\S+/, 'Please provide a valid email address']
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required']
  },
  civicPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  level: {
    type: Number,
    default: 1,
    min: 1
  },
  strikes: {
    type: Number,
    default: 0,
    min: 0
  },
  trustScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  reportedCount: {
    type: Number,
    default: 0
  },
  verifiedCount: {
    type: Number,
    default: 0
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  reports: [{
    reporter: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware to calculate Level dynamically before saving if points changed
UserSchema.pre('save', function (this: any, next: any) {
  if (this.isModified('civicPoints')) {
    // 100 points per level progression
    this.level = Math.floor(this.civicPoints / 100) + 1;
  }
  next();
});


// ==========================================
// 2. ISSUE INTERFACE & SCHEMA (GEOJSON + AI)
// ==========================================

export interface ILocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude] as per GeoJSON specification
}

export interface IAIDetails {
  isValid: boolean;          // AI triage result: Is it real civic infrastructure damage?
  severityScore: number;     // Severity rating: 1 to 10
  verifiedCategory: string;  // Category confirmed or re-assigned by Gemini AI
  rejectionReason?: string;  // Reason for rejection if isValid is false
  confidenceScore: number;   // Confidence percentage (0 to 100)
  autoDescription?: string;  // AI-generated summary of the infrastructure issue
  triagedAt: Date;
}

export interface IFlag {
  user: mongoose.Types.ObjectId;
  reason: string;
  createdAt: Date;
}

export interface IIssue extends Document {
  reporter: mongoose.Types.ObjectId;
  description: string;
  category: 'pothole' | 'broken-streetlight' | 'water-leak' | 'trash' | 'other';
  status: 'active' | 'urgent' | 'resolved' | 'flagged';
  location: ILocation;
  imageUrl: string;
  upvotes: mongoose.Types.ObjectId[]; // Tracks users validating the report
  flags: IFlag[];                    // Community reporting suspicious/fake cards
  resolutions: mongoose.Types.ObjectId[]; // Tracks users validating that the issue is resolved
  resolvedImageUrl?: string;
  resolvedByUsername?: string;
  resolvedAt?: Date;
  aiDetails: IAIDetails;             // Structured validation payload from Gemini AI
  createdAt: Date;
}

export const IssueSchema = new Schema<IIssue>({
  reporter: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  category: {
    type: String,
    enum: ['pothole', 'broken-streetlight', 'water-leak', 'trash', 'other'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'urgent', 'resolved', 'flagged'],
    default: 'active'
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function (val: number[]) {
          return val.length === 2 && 
                 val[0] >= -180 && val[0] <= 180 && // Longitude boundaries
                 val[1] >= -90 && val[1] <= 90;     // Latitude boundaries
        },
        message: 'Coordinates must be valid arrays of [longitude, latitude]'
      }
    }
  },
  imageUrl: {
    type: String,
    required: [true, 'Issue photo is crucial for AI validation']
  },
  upvotes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  flags: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  resolutions: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  resolvedImageUrl: {
    type: String
  },
  resolvedByUsername: {
    type: String
  },
  resolvedAt: {
    type: Date
  },
  aiDetails: {
    isValid: { type: Boolean, default: true },
    severityScore: { type: Number, min: 1, max: 10, default: 5 },
    verifiedCategory: { type: String },
    rejectionReason: { type: String },
    confidenceScore: { type: Number, default: 100 },
    autoDescription: { type: String },
    triagedAt: { type: Date, default: Date.now }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// CRITICAL: GeoJSON Spatial Indexing for distance queries
IssueSchema.index({ location: '2dsphere' });

// Export Models (Fallback checks let this be imported in serverless environments safely)
export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const IssueModel = mongoose.models.Issue || mongoose.model<IIssue>('Issue', IssueSchema);
