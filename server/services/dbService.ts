/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This file implements a high-fidelity local state and file persistence database 
// that operates exactly like MongoDB queries. It calculates Earth distances via the Haversine 
// formula to simulate Mongoose's $near 2dsphere indexing, keeping the application 
// fully stable, fast, and instantly runnable without external MongoDB connection strings.

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { UserModel, IssueModel } from '../models/mongooseSchemas';

// Seed IDs mapping to standard MongoDB 24-character hex ObjectIds
const SEED_MAPPING: Record<string, string> = {
  "user_seed_hero": "6485ff7ca8df5c270da00001",
  "user_seed_green": "6485ff7ca8df5c270da00002",
  "issue_seed_1": "6485ff7ca8df5c270da10001",
  "issue_seed_2": "6485ff7ca8df5c270da10002",
  "issue_seed_3": "6485ff7ca8df5c270da10003"
};

export function toMongoId(id: string): string {
  if (SEED_MAPPING[id]) {
    return SEED_MAPPING[id];
  }
  // Check if it's already a valid 24-character hex string
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    return id;
  }
  // Construct a deterministic 24-character hex string from the input string
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  let hex = '';
  for (let i = 0; i < 24; i++) {
    const code = Math.abs((hash + i * 31) % 16);
    hex += code.toString(16);
  }
  return hex;
}

// Convert a MongoDB User Document to a DBUser memory-state structure
function mapUser(doc: any): DBUser {
  return {
    id: doc._id.toString(),
    username: doc.username,
    email: doc.email,
    passwordHash: doc.passwordHash,
    civicPoints: doc.civicPoints ?? 0,
    level: doc.level ?? 1,
    strikes: doc.strikes ?? 0,
    trustScore: doc.trustScore ?? 100,
    reportedCount: doc.reportedCount ?? 0,
    verifiedCount: doc.verifiedCount ?? 0,
    isBanned: doc.isBanned ?? false,
    reports: (doc.reports || []).map((r: any) => ({
      reporterId: r.reporter ? r.reporter.toString() : "",
      reason: r.reason || "",
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString()
    })),
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString()
  };
}

// Convert a MongoDB Issue Document to a DBIssue memory-state structure
function mapIssue(doc: any): DBIssue {
  let reporterId = "";
  let reporterUsername = "CivicPlayer";
  let reporterTrust = 70;

  if (doc.reporter) {
    if (typeof doc.reporter === 'object' && '_id' in doc.reporter) {
      reporterId = doc.reporter._id.toString();
      reporterUsername = doc.reporter.username || "CivicPlayer";
      reporterTrust = doc.reporter.trustScore ?? 70;
    } else {
      reporterId = doc.reporter.toString();
    }
  }

  return {
    id: doc._id.toString(),
    reporter: {
      id: reporterId,
      username: reporterUsername,
      trustScore: reporterTrust
    },
    description: doc.description,
    category: doc.category,
    status: doc.status,
    location: {
      type: doc.location?.type || 'Point',
      coordinates: doc.location?.coordinates || [0, 0]
    },
    imageUrl: doc.imageUrl,
    upvotes: (doc.upvotes || []).map((u: any) => typeof u === 'object' && '_id' in u ? u._id.toString() : u.toString()),
    flags: (doc.flags || []).map((f: any) => ({
      userId: f.user ? (typeof f.user === 'object' && '_id' in f.user ? f.user._id.toString() : f.user.toString()) : "",
      reason: f.reason,
      createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString()
    })),
    resolutions: (doc.resolutions || []).map((r: any) => typeof r === 'object' && '_id' in r ? r._id.toString() : r.toString()),
    resolvedImageUrl: doc.resolvedImageUrl,
    resolvedByUsername: doc.resolvedByUsername,
    resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : undefined,
    aiDetails: {
      isValid: doc.aiDetails?.isValid ?? true,
      severityScore: doc.aiDetails?.severityScore ?? 5,
      verifiedCategory: doc.aiDetails?.verifiedCategory || doc.category,
      rejectionReason: doc.aiDetails?.rejectionReason,
      confidenceScore: doc.aiDetails?.confidenceScore ?? 100,
      autoDescription: doc.aiDetails?.autoDescription,
      triagedAt: doc.aiDetails?.triagedAt ? new Date(doc.aiDetails.triagedAt).toISOString() : new Date().toISOString()
    },
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString()
  };
}

// Define DB paths
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Interface structures
export interface DBUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  civicPoints: number;
  level: number;
  strikes: number;
  trustScore: number;
  reportedCount: number;
  verifiedCount: number;
  isBanned: boolean;
  reports: Array<{ reporterId: string; reason: string; createdAt: string }>;
  createdAt: string;
}

export interface DBIssue {
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
  upvotes: string[]; // User IDs who upvoted (verified)
  flags: Array<{ userId: string; reason: string; createdAt: string }>;
  resolutions: string[]; // User IDs who verified resolution
  resolvedImageUrl?: string;
  resolvedByUsername?: string;
  resolvedAt?: string;
  aiDetails: {
    isValid: boolean;
    severityScore: number;
    verifiedCategory: string;
    rejectionReason?: string;
    confidenceScore: number;
    autoDescription?: string;
    triagedAt: string;
  };
  createdAt: string;
}

export interface DBState {
  users: DBUser[];
  issues: DBIssue[];
}

// Initial realistic seed issues in San Francisco
const DEFAULT_SF_ISSUES: DBIssue[] = [
  {
    id: "issue_seed_1",
    reporter: { id: "user_seed_hero", username: "CivicDefender", trustScore: 95 },
    description: "Huge pothole in the middle lane causing cars to swerve dangerously.",
    category: "pothole",
    status: "urgent",
    location: { type: "Point", coordinates: [-122.4183, 37.7739] },
    imageUrl: "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?auto=format&fit=crop&q=80&w=600",
    upvotes: ["user_seed_hero", "user1", "user2"],
    flags: [],
    resolutions: [],
    aiDetails: {
      isValid: true,
      severityScore: 8,
      verifiedCategory: "pothole",
      confidenceScore: 98,
      autoDescription: "Severe road degradation visible. High risk to automotive traffic.",
      triagedAt: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: "issue_seed_2",
    reporter: { id: "user_seed_green", username: "EcoWarrior", trustScore: 85 },
    description: "Main water pressure line leaking. Water is gushing onto the sidewalk and flooding the local park entrance.",
    category: "water-leak",
    status: "active",
    location: { type: "Point", coordinates: [-122.4089, 37.7801] },
    imageUrl: "https://images.unsplash.com/photo-1542044896530-05d85be9b11a?auto=format&fit=crop&q=80&w=600",
    upvotes: ["user_seed_green"],
    flags: [],
    resolutions: [],
    aiDetails: {
      isValid: true,
      severityScore: 6,
      verifiedCategory: "water-leak",
      confidenceScore: 92,
      autoDescription: "Active minor water inundation, clean water stream originating near utility meter.",
      triagedAt: new Date(Date.now() - 3600000 * 12).toISOString()
    },
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: "issue_seed_3",
    reporter: { id: "user_seed_hero", username: "CivicDefender", trustScore: 95 },
    description: "Broken streetlight. The entire corner of 9th and Mission is pitch black at night, making it very unsafe for students.",
    category: "broken-streetlight",
    status: "active",
    location: { type: "Point", coordinates: [-122.4124, 37.7772] },
    imageUrl: "https://images.unsplash.com/photo-1509024644558-2f56ce76c490?auto=format&fit=crop&q=80&w=600",
    upvotes: ["user_seed_hero", "user3"],
    flags: [],
    resolutions: [],
    aiDetails: {
      isValid: true,
      severityScore: 5,
      verifiedCategory: "broken-streetlight",
      confidenceScore: 90,
      autoDescription: "No luminous output observed on vertical post fixture. Grid line damage suspected.",
      triagedAt: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
  }
];

const DEFAULT_USERS: DBUser[] = [
  {
    id: "user_seed_hero",
    username: "CivicDefender",
    email: "hero@community.org",
    passwordHash: "seedpasswordhash",
    civicPoints: 210,
    level: 3,
    strikes: 0,
    trustScore: 95,
    reportedCount: 14,
    verifiedCount: 35,
    isBanned: false,
    reports: [],
    createdAt: new Date(Date.now() - 3600000 * 240).toISOString()
  },
  {
    id: "user_seed_green",
    username: "EcoWarrior",
    email: "green@earth.net",
    passwordHash: "seedpasswordhash",
    civicPoints: 90,
    level: 1,
    strikes: 0,
    trustScore: 88,
    reportedCount: 5,
    verifiedCount: 12,
    isBanned: false,
    reports: [],
    createdAt: new Date(Date.now() - 3600000 * 120).toISOString()
  }
];

export class DBService {
  private state: DBState = { users: [], issues: [] };
  private isMongo = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.state = JSON.parse(fileContent);
        // Guarantee clean arrays
        if (!this.state.users) this.state.users = [];
        if (!this.state.issues) this.state.issues = [];
      } else {
        // Build initial seed dataset
        this.state = {
          users: DEFAULT_USERS,
          issues: DEFAULT_SF_ISSUES
        };
        this.save();
      }
    } catch (err) {
      console.error("Failed to initialize database file. Using hot in-memory fallback.", err);
      this.state = { users: DEFAULT_USERS, issues: DEFAULT_SF_ISSUES };
    }

    // Connect to real MongoDB if environment setting is provided
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      console.log("📡 MongoDB Connection detected. Initializing database...");
      try {
        await mongoose.connect(mongoUri);
        this.isMongo = true;
        console.log("=================================================");
        console.log("✅ CONNECTED TO MONGODB ATLAS SUCCESSFULLY");
        console.log("=================================================");

        // Seed default dataset if MongoDB has no users
        const userCount = await UserModel.countDocuments();
        if (userCount === 0) {
          console.log("🌱 Database is empty. Seeding defaults to MongoDB...");
          
          const seedUsers = DEFAULT_USERS.map(u => ({
            _id: new mongoose.Types.ObjectId(toMongoId(u.id)),
            username: u.username,
            email: u.email,
            passwordHash: u.passwordHash,
            civicPoints: u.civicPoints,
            level: u.level,
            strikes: u.strikes,
            trustScore: u.trustScore,
            reportedCount: u.reportedCount,
            verifiedCount: u.verifiedCount,
            createdAt: new Date(u.createdAt)
          }));

          const seedIssues = DEFAULT_SF_ISSUES.map(i => ({
            _id: new mongoose.Types.ObjectId(toMongoId(i.id)),
            reporter: new mongoose.Types.ObjectId(toMongoId(i.reporter.id)),
            description: i.description,
            category: i.category,
            status: i.status,
            location: {
              type: i.location.type,
              coordinates: i.location.coordinates
            },
            imageUrl: i.imageUrl,
            upvotes: i.upvotes.map(uid => new mongoose.Types.ObjectId(toMongoId(uid))),
            flags: i.flags.map(f => ({
              user: new mongoose.Types.ObjectId(toMongoId(f.userId)),
              reason: f.reason,
              createdAt: new Date(f.createdAt)
            })),
            aiDetails: {
              isValid: i.aiDetails.isValid,
              severityScore: i.aiDetails.severityScore,
              verifiedCategory: i.aiDetails.verifiedCategory,
              rejectionReason: i.aiDetails.rejectionReason,
              confidenceScore: i.aiDetails.confidenceScore,
              autoDescription: i.aiDetails.autoDescription,
              triagedAt: new Date(i.aiDetails.triagedAt)
            },
            createdAt: new Date(i.createdAt)
          }));

          await UserModel.insertMany(seedUsers as any[]);
          await IssueModel.insertMany(seedIssues as any[]);
          console.log("✅ MongoDB default collections seeded successfully!");
        }

        // Load and sync standard Mongo data into local state
        const usersDoc = await UserModel.find();
        const issuesDoc = await IssueModel.find().populate('reporter');

        this.state.users = usersDoc.map(doc => mapUser(doc));
        this.state.issues = issuesDoc.map(doc => mapIssue(doc));
        console.log(`🔄 Synchronized Cache: Loaded ${this.state.users.length} users and ${this.state.issues.length} issues from MongoDB Atlas.`);
        this.save(); // Keep local JSON backup in sync
      } catch (err) {
        console.error("❌ MongoDB Atlas synchronization failure:", err);
      }
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error("Local db storage save error:", err);
    }
  }

  private async saveUserToMongo(user: DBUser) {
    if (!this.isMongo) return;
    try {
      const mongoId = toMongoId(user.id);
      await (UserModel as any).findByIdAndUpdate(
        mongoId,
        {
          username: user.username,
          email: user.email,
          passwordHash: user.passwordHash,
          civicPoints: user.civicPoints,
          level: user.level,
          strikes: user.strikes,
          trustScore: user.trustScore,
          reportedCount: user.reportedCount,
          verifiedCount: user.verifiedCount,
          isBanned: user.isBanned,
          reports: (user.reports || []).map(r => ({
            reporter: new mongoose.Types.ObjectId(toMongoId(r.reporterId)),
            reason: r.reason,
            createdAt: new Date(r.createdAt)
          })),
          createdAt: new Date(user.createdAt)
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error(`Failed to background-save User ${user.id} to MongoDB:`, err);
    }
  }

  private async saveIssueToMongo(issue: DBIssue) {
    if (!this.isMongo) return;
    try {
      const mongoId = toMongoId(issue.id);
      const reporterId = toMongoId(issue.reporter.id);
      const upvoteIds = (issue.upvotes || []).map(toMongoId);
      const flagsMapped = (issue.flags || []).map(f => ({
        user: new mongoose.Types.ObjectId(toMongoId(f.userId)),
        reason: f.reason,
        createdAt: new Date(f.createdAt)
      }));
      const resolutionIds = (issue.resolutions || []).map(toMongoId);

      await (IssueModel as any).findByIdAndUpdate(
        mongoId,
        {
          reporter: new mongoose.Types.ObjectId(reporterId),
          description: issue.description,
          category: issue.category,
          status: issue.status,
          location: {
            type: issue.location.type,
            coordinates: issue.location.coordinates
          },
          imageUrl: issue.imageUrl,
          resolvedImageUrl: issue.resolvedImageUrl,
          resolvedByUsername: issue.resolvedByUsername,
          resolvedAt: issue.resolvedAt ? new Date(issue.resolvedAt) : undefined,
          upvotes: upvoteIds.map(id => new mongoose.Types.ObjectId(id)),
          flags: flagsMapped,
          resolutions: resolutionIds.map(id => new mongoose.Types.ObjectId(id)),
          aiDetails: {
            isValid: issue.aiDetails.isValid,
            severityScore: issue.aiDetails.severityScore,
            verifiedCategory: issue.aiDetails.verifiedCategory,
            rejectionReason: issue.aiDetails.rejectionReason,
            confidenceScore: issue.aiDetails.confidenceScore,
            autoDescription: issue.aiDetails.autoDescription,
            triagedAt: new Date(issue.aiDetails.triagedAt)
          },
          createdAt: new Date(issue.createdAt)
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error(`Failed to background-save Issue ${issue.id} to MongoDB:`, err);
    }
  }

  // --- User Operations ---
  public getUsers(): DBUser[] {
    return this.state.users;
  }

  public getUserById(id: string): DBUser | undefined {
    return this.state.users.find(u => u.id === id);
  }

  public getUserByEmail(email: string): DBUser | undefined {
    return this.state.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public getUserByUsername(username: string): DBUser | undefined {
    return this.state.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public createUser(user: Omit<DBUser, 'id' | 'civicPoints' | 'level' | 'strikes' | 'trustScore' | 'reportedCount' | 'verifiedCount' | 'isBanned' | 'reports' | 'createdAt'>): DBUser {
    const newUser: DBUser = {
      ...user,
      id: this.isMongo ? new mongoose.Types.ObjectId().toString() : 'usr_' + Math.random().toString(36).substr(2, 9),
      civicPoints: 10, // Starting bonus
      level: 1,
      strikes: 0,
      trustScore: 70, // Base trusted level
      reportedCount: 0,
      verifiedCount: 0,
      isBanned: false,
      reports: [],
      createdAt: new Date().toISOString()
    };
    this.state.users.push(newUser);
    this.save();
    this.saveUserToMongo(newUser);
    return newUser;
  }

  public updateUserPoints(userId: string, pointsDelta: number): DBUser | undefined {
    const user = this.getUserById(userId);
    if (user) {
      user.civicPoints = Math.max(0, user.civicPoints + pointsDelta);
      // Recalculate level
      user.level = Math.floor(user.civicPoints / 100) + 1;
      this.save();
      this.saveUserToMongo(user);
    }
    return user;
  }

  public updateUserReputation(userId: string, strikesDelta: number, trustDelta: number): DBUser | undefined {
    const user = this.getUserById(userId);
    if (user) {
      user.strikes = Math.max(0, user.strikes + strikesDelta);
      user.trustScore = Math.max(0, Math.min(100, user.trustScore + trustDelta));
      this.save();
      this.saveUserToMongo(user);
    }
    return user;
  }

  // --- Issue Operations ---
  public getIssues(): DBIssue[] {
    // Return sorted by recent first
    return [...this.state.issues].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getIssueById(id: string): DBIssue | undefined {
    return this.state.issues.find(i => i.id === id);
  }

  public createIssue(issue: Omit<DBIssue, 'id' | 'createdAt' | 'upvotes' | 'flags' | 'resolutions'>): DBIssue {
    const newIssue: DBIssue = {
      ...issue,
      id: this.isMongo ? new mongoose.Types.ObjectId().toString() : 'iss_' + Math.random().toString(36).substr(2, 9),
      upvotes: [],
      flags: [],
      resolutions: [],
      createdAt: new Date().toISOString()
    };
    this.state.issues.push(newIssue);

    // Reward reporter points (+10 for reporting)
    this.updateUserPoints(issue.reporter.id, 10);
    const user = this.getUserById(issue.reporter.id);
    if (user) {
      user.reportedCount++;
      this.save();
      this.saveUserToMongo(user);
    }

    this.save();
    this.saveIssueToMongo(newIssue);
    return newIssue;
  }

  public upvoteIssue(issueId: string, userId: string): { issue: DBIssue; userPointsGained: number } | undefined {
    const issue = this.getIssueById(issueId);
    if (!issue) return undefined;

    // Toggle upvote
    const upvoteIndex = issue.upvotes.indexOf(userId);
    let pointsGained = 0;

    if (upvoteIndex === -1) {
      // Add upvote (Verification)
      issue.upvotes.push(userId);
      pointsGained = 2; // +2 civic points for verifying

      // Award voter
      this.updateUserPoints(userId, 2);
      const voter = this.getUserById(userId);
      if (voter) {
        voter.verifiedCount++;
        this.saveUserToMongo(voter);
      }

      // Award original reporter if it gets validation momentum (+5 per 3 upvotes)
      if (issue.upvotes.length % 3 === 0) {
        this.updateUserPoints(issue.reporter.id, 5);
      }
    } else {
      // Remove upvote
      issue.upvotes.splice(upvoteIndex, 1);
      this.updateUserPoints(userId, -2);
      const voter = this.getUserById(userId);
      if (voter) {
        voter.verifiedCount = Math.max(0, voter.verifiedCount - 1);
        this.saveUserToMongo(voter);
      }
    }

    this.save();
    this.saveIssueToMongo(issue);
    const reporter = this.getUserById(issue.reporter.id);
    if (reporter) this.saveUserToMongo(reporter);
    return { issue, userPointsGained: pointsGained };
  }

  public flagIssue(issueId: string, userId: string, reason: string): DBIssue | undefined {
    const issue = this.getIssueById(issueId);
    if (!issue) return undefined;

    // Check if progress exists
    const flagExists = issue.flags.some(f => f.userId === userId);
    if (!flagExists) {
      issue.flags.push({
        userId,
        reason,
        createdAt: new Date().toISOString()
      });

      // Report the author for each flag as well!
      const author = this.getUserById(issue.reporter.id);
      if (author) {
        if (!author.reports) author.reports = [];
        const userReportExists = author.reports.some(r => r.reporterId === userId);
        if (!userReportExists) {
          author.reports.push({
            reporterId: userId,
            reason: `Flagged on issue ${issueId}: ${reason}`,
            createdAt: new Date().toISOString()
          });
        }
      }

      // Check if flags on this issue exceed 10 -> Ban the reporter!
      const totalFlags = issue.flags.length;
      const totalFlagWeights = issue.flags.reduce((weight, flag) => {
        const flagUser = this.getUserById(flag.userId);
        const userWeight = flagUser ? (flagUser.trustScore > 80 ? 2 : 1) : 1;
        return weight + userWeight;
      }, 0);

      if (totalFlags >= 10) {
        issue.status = 'flagged';
        // Ban the reporter for multiple verified fraudulent activities
        const reporter = this.getUserById(issue.reporter.id);
        if (reporter) {
          reporter.isBanned = true;
          reporter.trustScore = 0;
          reporter.strikes = Math.max(reporter.strikes + 1, 3);
          this.saveUserToMongo(reporter);

          // Flag all active issues created by this banned user
          this.state.issues.forEach(iss => {
            if (iss.reporter.id === reporter.id && iss.status !== 'flagged') {
              iss.status = 'flagged';
              this.saveIssueToMongo(iss);
            }
          });
        }
      } else if (totalFlagWeights >= 4) {
        if (issue.status !== 'flagged') {
          issue.status = 'flagged';
          // Give author a strike, take away points
          this.updateUserReputation(issue.reporter.id, 1, -15);
          this.updateUserPoints(issue.reporter.id, -10);
        }
      }
    }

    this.save();
    this.saveIssueToMongo(issue);
    const reporter = this.getUserById(issue.reporter.id);
    if (reporter) this.saveUserToMongo(reporter);
    return issue;
  }

  public resolveIssue(issueId: string, resolverUserId: string, resolvedImageUrl?: string, resolverUsername?: string): DBIssue | undefined {
    const issue = this.getIssueById(issueId);
    if (!issue) return undefined;

    if (!issue.resolutions) {
      issue.resolutions = [];
    }

    if (resolvedImageUrl) {
      issue.resolvedImageUrl = resolvedImageUrl;
      issue.resolvedAt = new Date().toISOString();
    }
    if (resolverUsername) {
      issue.resolvedByUsername = resolverUsername;
    }

    if (issue.status !== 'resolved') {
      const resolutionExists = issue.resolutions.includes(resolverUserId);
      if (!resolutionExists) {
        issue.resolutions.push(resolverUserId);
        
        // Reward the resolver immediately with +5 civic points for verifying resolution
        this.updateUserPoints(resolverUserId, 5);
        const resolver = this.getUserById(resolverUserId);
        if (resolver) {
          resolver.verifiedCount++;
          this.saveUserToMongo(resolver);
        }
      }

      // Officially marked as resolved only if 10+ different accounts validate it!
      if (issue.resolutions.length >= 10) {
        issue.status = 'resolved';

        // Huge rewards structure: +100 to the original reporter when resolved with 10 validations
        this.updateUserPoints(issue.reporter.id, 100);
        this.updateUserReputation(issue.reporter.id, 0, 20); // +20 Trust Score

        // Give additional +15 points to all accounts who validated this resolution
        issue.resolutions.forEach(uid => {
          this.updateUserPoints(uid, 15);
        });
      }
    }

    this.save();
    this.saveIssueToMongo(issue);
    const reporter = this.getUserById(issue.reporter.id);
    if (reporter) this.saveUserToMongo(reporter);
    return issue;
  }

  public reportUser(reportedUserId: string, reporterUserId: string, reason: string): DBUser | undefined {
    const user = this.getUserById(reportedUserId);
    if (!user) return undefined;

    if (!user.reports) user.reports = [];
    const reportExists = user.reports.some(r => r.reporterId === reporterUserId);
    if (!reportExists) {
      user.reports.push({
        reporterId: reporterUserId,
        reason,
        createdAt: new Date().toISOString()
      });

      // If reports reach 10+ -> Banning user!
      if (user.reports.length >= 10) {
        user.isBanned = true;
        user.trustScore = 0;
        user.strikes = Math.max(user.strikes + 1, 3);

        // Flag all of their issues
        this.state.issues.forEach(issue => {
          if (issue.reporter.id === reportedUserId && issue.status !== 'flagged') {
            issue.status = 'flagged';
            this.saveIssueToMongo(issue);
          }
        });
      } else {
        // Increment strikes on intermediate thresholds e.g. every 3 reports
        if (user.reports.length % 3 === 0) {
          user.strikes++;
          user.trustScore = Math.max(0, user.trustScore - 20);
        }
      }

      this.save();
      this.saveUserToMongo(user);
    }
    return user;
  }

  // Haversine Distance computation (Spatial lookup simulation)
  public getIssuesNear(lng: number, lat: number, maxRadiusKm: number): Array<DBIssue & { distanceKm: number }> {
    const issuesWithDistance = this.state.issues
      .filter(issue => issue.status !== 'flagged') // Skip flagged issues on local maps
      .map(issue => {
        const [issueLng, issueLat] = issue.location.coordinates;
        const dist = this.calculateDistance(lat, lng, issueLat, issueLng);
        return {
          ...issue,
          distanceKm: parseFloat(dist.toFixed(2))
        };
      });

    // Filter by radius and sort by closest
    return issuesWithDistance
      .filter(issue => issue.distanceKm <= maxRadiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of Earth in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // distance in KM
  }
}

// Single active database instance
export const db = new DBService();
