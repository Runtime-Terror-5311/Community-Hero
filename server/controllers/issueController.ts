/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Controller mapping community infrastructure issue reporting, real-time upvotes (verification),
// citizen-triggered resolutions, and AI triage checks.

import { Request, Response } from 'express';
import { db } from '../services/dbService';
import { triageIssueImage, validateInfrastructureImage } from '../services/geminiService';
import { uploadToCloudinary } from '../services/cloudinaryService';

export const issueController = {
  // Fetch active issues near coordinates (with Haversine calculation)
  async listIssues(req: Request, res: Response) {
    try {
      const { lat, lng, radius } = req.query;

      // If latitude and longitude are specified, perform spatial GeoJSON search
      if (lat && lng) {
        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const maxRadius = radius ? parseFloat(radius as string) : 10; // Default 10km radius

        if (!isNaN(latitude) && !isNaN(longitude)) {
          console.log(`Performing hyperlocal spatial lookup near: [${longitude}, ${latitude}], Radius: ${maxRadius}km`);
          const nearbyIssues = db.getIssuesNear(longitude, latitude, maxRadius);
          return res.status(200).json({ issues: nearbyIssues });
        }
      }

      // Return general feed list sorted chronologically
      const allIssues = db.getIssues();
      return res.status(200).json({ issues: allIssues });

    } catch (error) {
      console.error("List issues handler exception:", error);
      return res.status(500).json({ error: "Failed to load issues query list." });
    }
  },

  // Submit and triage new community issue
  async createIssue(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      const { description, category, latitude, longitude, userLatitude, userLongitude } = req.body;

      if (!userPayload) {
        return res.status(401).json({ error: "Unauthorized. Please login to report issues." });
      }

      const reporterUser = db.getUserById(userPayload.userId);
      if (!reporterUser) {
        return res.status(404).json({ error: "Reporting user profile not located." });
      }

      if (!description || !category || typeof latitude === 'undefined' || typeof longitude === 'undefined') {
        return res.status(400).json({ error: "Incomplete details. Description, category, and location coords are required." });
      }

      // Check the 5km range constraint
      if (!userLatitude || !userLongitude) {
        return res.status(400).json({ error: "Your physical device location is required to verify the 5km reporting range." });
      }

      const issueLat = parseFloat(latitude as string);
      const issueLng = parseFloat(longitude as string);
      const userLat = parseFloat(userLatitude as string);
      const userLng = parseFloat(userLongitude as string);

      if (isNaN(issueLat) || isNaN(issueLng) || isNaN(userLat) || isNaN(userLng)) {
        return res.status(400).json({ error: "Invalid coordinates format." });
      }

      // Haversine distance helper
      const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371; // Radius of the earth in km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // distance in KM
      };

      const distance = calculateDistance(userLat, userLng, issueLat, issueLng);
      if (distance > 5.0) {
        return res.status(400).json({ 
          error: `Submission blocked! You can only report hazards within 5 km of your physical location. (Target location is ${distance.toFixed(2)} km away)` 
        });
      }

      // Convert file buffer or body image to base64 data
      let base64Data = "";
      let mimeType = "image/jpeg";

      if (req.file) {
        base64Data = req.file.buffer.toString("base64");
        mimeType = req.file.mimetype;
      } else if (req.body.image) {
        const imageStr = req.body.image;
        if (imageStr.startsWith("data:")) {
          const matches = imageStr.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            mimeType = matches[1];
            base64Data = matches[2];
          } else {
            base64Data = imageStr;
          }
        } else if (imageStr.startsWith("http")) {
          try {
            const fetchRes = await fetch(imageStr);
            if (fetchRes.ok) {
              const contentType = fetchRes.headers.get("content-type");
              if (contentType) mimeType = contentType;
              const arrayBuffer = await fetchRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              base64Data = buffer.toString("base64");
            } else {
              throw new Error(`Failed to download remote preset image: ${fetchRes.status}`);
            }
          } catch (err) {
            console.error("Failed to download remote preset image, reverting to static placeholder:", err);
            // tiny transparent PNG fallback
            base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
          }
        } else {
          base64Data = imageStr;
        }
      }

      if (!base64Data) {
        return res.status(400).json({ error: "An image photo is required." });
      }

      // 1. Validate Infrastructure Image with Gemini AI
      console.log(`[Triage Pipeline] Initiating automatic verification for category [${category}] reported by ${reporterUser.username}...`);
      const aiTriageResult = await validateInfrastructureImage(base64Data, mimeType, category);

      // If validation fails, immediately return a 400 Bad Request to the frontend with the rejection reason
      if (!aiTriageResult.isValid) {
        console.warn(`[Triage Pipeline] Image validation rejected: ${aiTriageResult.rejectionReason}`);
        
        // Penalize reporting user points and reputation for submitting fake/unrelated reports
        db.updateUserPoints(reporterUser.id, -20);
        db.updateUserReputation(reporterUser.id, 1, -15);
        
        const updatedReporter = db.getUserById(reporterUser.id);
        
        return res.status(400).json({ 
          error: `Submission rejected: ${aiTriageResult.rejectionReason || "Image shows unrelated content, not " + category + "."}`,
          rejectionReason: aiTriageResult.rejectionReason || "Image quality insufficient, or unrelated content detected.",
          civicPenalty: {
            pointsDeducted: 20,
            trustScorePenalty: 15,
            currentPoints: updatedReporter?.civicPoints || 0,
            currentLevel: updatedReporter?.level || 1,
            currentTrustScore: updatedReporter?.trustScore || 100,
            currentStrikes: updatedReporter?.strikes || 0
          }
        });
      }

      // 2. Proceed to upload image to Cloudinary
      console.log("[Triage Pipeline] Image approved. Uploading to Cloudinary...");
      let cloudinaryUrl = "";
      try {
        cloudinaryUrl = await uploadToCloudinary(base64Data, mimeType);
        console.log(`[Triage Pipeline] Cloudinary upload successful: ${cloudinaryUrl}`);
      } catch (uploadErr) {
        console.error("[Triage Pipeline] Cloudinary upload exception, using local data URI fallback:", uploadErr);
        cloudinaryUrl = `data:${mimeType};base64,${base64Data}`;
      }

      // 3. Assemble and save document to Database
      const locationCoords: [number, number] = [parseFloat(longitude as string), parseFloat(latitude as string)];
      
      const newIssueRecord = db.createIssue({
        reporter: {
          id: reporterUser.id,
          username: reporterUser.username,
          trustScore: reporterUser.trustScore
        },
        description,
        category: aiTriageResult.verifiedCategory as any || category,
        status: aiTriageResult.severityScore >= 8 ? 'urgent' : 'active',
        location: {
          type: 'Point',
          coordinates: locationCoords
        },
        imageUrl: cloudinaryUrl,
        aiDetails: {
          isValid: aiTriageResult.isValid,
          severityScore: aiTriageResult.severityScore,
          verifiedCategory: aiTriageResult.verifiedCategory || category,
          rejectionReason: aiTriageResult.rejectionReason,
          confidenceScore: aiTriageResult.confidenceScore,
          autoDescription: aiTriageResult.autoDescription,
          triagedAt: new Date().toISOString()
        }
      });

      // Fetch refreshed user progress object to return latest level, points
      const updatedReporter = db.getUserById(reporterUser.id);

      return res.status(201).json({
        message: "Report validation successful! Issue posted on Map.",
        issue: newIssueRecord,
        civicReward: {
          pointsAwarded: 10,
          currentPoints: updatedReporter?.civicPoints || 0,
          currentLevel: updatedReporter?.level || 1
        }
      });

    } catch (error) {
      console.error("Create issue handler exception:", error);
      return res.status(500).json({ error: "Failed to submit new issue. Please try again." });
    }
  },

  // Citizen Upvote / Verification
  async upvoteIssue(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      const { id } = req.params;

      if (!userPayload) {
        return res.status(401).json({ error: "Unauthorized. Please login to upvote." });
      }

      const runUpvote = db.upvoteIssue(id, userPayload.userId);
      if (!runUpvote) {
        return res.status(404).json({ error: "Civic issue record not found." });
      }

      const updatedVoter = db.getUserById(userPayload.userId);

      return res.status(200).json({
        message: runUpvote.userPointsGained > 0 ? "You have verified this issue. +2 Civic Points!" : "Verification vote retracted.",
        issue: runUpvote.issue,
        voterPoints: updatedVoter?.civicPoints || 0
      });

    } catch (error) {
      console.error("Upvote issue handler exception:", error);
      return res.status(500).json({ error: "Failed to cast verification vote." });
    }
  },

  // Citizen Flag / Anti-Fake
  async flagIssue(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      const { id } = req.params;
      const { reason } = req.body;

      if (!userPayload) {
        return res.status(401).json({ error: "Unauthorized. Please login." });
      }

      if (!reason) {
        return res.status(400).json({ error: "Please declare a valid flagging reason." });
      }

      const flaggedIssue = db.flagIssue(id, userPayload.userId, reason);
      if (!flaggedIssue) {
        return res.status(404).json({ error: "Civic issue record not found." });
      }

      const feedbackMsg = flaggedIssue.status === 'flagged' 
        ? "This report has hit the critical fraud threshold and has been hidden for official audit." 
        : "Your flag has been lodged successfully.";

      return res.status(200).json({
        message: feedbackMsg,
        issue: flaggedIssue
      });

    } catch (error) {
      console.error("Flag issue handler exception:", error);
      return res.status(500).json({ error: "Failed to log community flag." });
    }
  },

  // Mark Issue Resolved (requires 10+ validations, rewards original reporter)
  async resolveIssue(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      const { id } = req.params;
      const { userLatitude, userLongitude, resolvedImage } = req.body;

      if (!userPayload) {
        return res.status(401).json({ error: "Unauthorized. Please login." });
      }

      if (!resolvedImage) {
        return res.status(400).json({ error: "A photo of the repaired hazard/pothole is required to submit a resolution." });
      }

      const issue = db.getIssueById(id);
      if (!issue) {
        return res.status(404).json({ error: "Civic issue record not found." });
      }

      // Check distance if device coordinates are provided to verify the 5km range constraint
      if (userLatitude && userLongitude) {
        const issueLat = issue.location.coordinates[1];
        const issueLng = issue.location.coordinates[0];
        const userLat = parseFloat(userLatitude as string);
        const userLng = parseFloat(userLongitude as string);

        if (!isNaN(userLat) && !isNaN(userLng)) {
          const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const R = 6371; // Radius of the earth in km
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLon = ((lon2 - lon1) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c; // distance in KM
          };

          const distance = calculateDistance(userLat, userLng, issueLat, issueLng);
          if (distance > 5.0) {
            return res.status(400).json({ 
              error: `Validation blocked! You can only verify or resolve hazards within 5 km of your physical location. (Target hazard is ${distance.toFixed(2)} km away)` 
            });
          }
        }
      }

      // Process and upload resolution image
      let resolvedImageUrl = "";
      let base64Data = "";
      let mimeType = "image/jpeg";
      if (resolvedImage.startsWith("data:")) {
        const matches = resolvedImage.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          base64Data = resolvedImage;
        }
      } else {
        base64Data = resolvedImage;
      }

      try {
        resolvedImageUrl = await uploadToCloudinary(base64Data, mimeType);
      } catch (uploadErr) {
        console.error("Cloudinary upload exception for resolution, using local data URI fallback:", uploadErr);
        resolvedImageUrl = `data:${mimeType};base64,${base64Data}`;
      }

      const resolverUser = db.getUserById(userPayload.userId);
      const resolverUsername = resolverUser ? resolverUser.username : "Anonymous Agent";

      const resolvedRecord = db.resolveIssue(id, userPayload.userId, resolvedImageUrl, resolverUsername);
      if (!resolvedRecord) {
        return res.status(404).json({ error: "Civic issue record not found." });
      }

      const validationsCount = resolvedRecord.resolutions.length;
      let msg = `Resolution validation received! Currently at ${validationsCount}/10 community confirmations.`;
      if (resolvedRecord.status === 'resolved') {
        msg = `Resolution fully confirmed by the community! +100 Points awarded to the reporter.`;
      }

      return res.status(200).json({
        message: msg,
        issue: resolvedRecord
      });

    } catch (error) {
      console.error("Resolve issue handler exception:", error);
      return res.status(500).json({ error: "Failed to mark issue resolved." });
    }
  },

  // Report User (Directly flag user behavior)
  async reportUser(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      const { userId } = req.params;
      const { reason } = req.body;

      if (!userPayload) {
        return res.status(401).json({ error: "Unauthorized. Please login." });
      }

      if (!reason) {
        return res.status(400).json({ error: "Please declare a valid reporting reason." });
      }

      if (userPayload.userId === userId) {
        return res.status(400).json({ error: "You cannot report your own account." });
      }

      const reportedUser = db.reportUser(userId, userPayload.userId, reason);
      if (!reportedUser) {
        return res.status(404).json({ error: "User profile not located." });
      }

      const feedbackMsg = reportedUser.isBanned 
        ? "This user has reached the threshold of 10+ community reports and has been automatically banned." 
        : "Your report has been logged successfully.";

      return res.status(200).json({
        message: feedbackMsg,
        user: {
          username: reportedUser.username,
          reportedCount: reportedUser.reports.length,
          isBanned: reportedUser.isBanned
        }
      });

    } catch (error) {
      console.error("Report user handler exception:", error);
      return res.status(500).json({ error: "Failed to submit user report." });
    }
  },

  // Get leaderboards
  async getLeaderboard(req: Request, res: Response) {
    try {
      const usersSorted = [...db.getUsers()]
        .sort((a, b) => b.civicPoints - a.civicPoints)
        .slice(0, 10) // Top 10 citizens
        .map(u => ({
          username: u.username,
          civicPoints: u.civicPoints,
          level: u.level,
          trustScore: u.trustScore,
          reportedCount: u.reportedCount,
          verifiedCount: u.verifiedCount,
          createdAt: u.createdAt
        }));

      return res.status(200).json({ leaderboard: usersSorted });

    } catch (error) {
      console.error("Get leaderboard handler exception:", error);
      return res.status(500).json({ error: "Failed to compile leaderboard." });
    }
  }
};
