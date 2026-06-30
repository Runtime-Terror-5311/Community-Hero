/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Controller mapping user authentication requests (registration, login, profile queries)
// to persistent db and session JWT token services.

import { Request, Response } from 'express';
import { db } from '../services/dbService';
import { hashPassword, generateToken } from '../services/authService';

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email, and password are required fields." });
      }

      if (username.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters long." });
      }

      // Check uniqueness
      const existingUserEmail = db.getUserByEmail(email);
      if (existingUserEmail) {
        return res.status(400).json({ error: "A community player with this email already exists." });
      }

      const existingUserUsername = db.getUserByUsername(username);
      if (existingUserUsername) {
        return res.status(400).json({ error: "Username is already taken by another hero." });
      }

      const passwordHash = hashPassword(password);
      
      const createdUser = db.createUser({
        username,
        email,
        passwordHash
      });

      const token = generateToken({
        userId: createdUser.id,
        username: createdUser.username,
        email: createdUser.email,
        level: createdUser.level
      });

      // Respond with profile, token, and stats
      const { passwordHash: _, ...safeUser } = createdUser;
      return res.status(201).json({
        message: "Welcome to Community Hero! 10 start-up Points have been awarded.",
        token,
        user: safeUser
      });

    } catch (error) {
      console.error("Auth register handler exception:", error);
      return res.status(500).json({ error: "Register service failure." });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required inputs." });
      }

      const user = db.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password settings." });
      }

      const hashedInput = hashPassword(password);
      if (user.passwordHash !== hashedInput) {
        return res.status(401).json({ error: "Invalid email or password settings." });
      }

      const token = generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        level: user.level
      });

      const { passwordHash: _, ...safeUser } = user;
      return res.status(200).json({
        message: `Welcome back, ${user.username}!`,
        token,
        user: safeUser
      });

    } catch (error) {
      console.error("Auth login handler exception:", error);
      return res.status(500).json({ error: "Login service failure." });
    }
  },

  async me(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      if (!userPayload) {
        return res.status(401).json({ error: "No active authenticated player." });
      }

      const user = db.getUserById(userPayload.userId);
      if (!user) {
        return res.status(404).json({ error: "Player profile not found inside historical logs." });
      }

      const { passwordHash: _, ...safeUser } = user;
      return res.status(200).json({ user: safeUser });

    } catch (error) {
      console.error("Auth me query handler exception:", error);
      return res.status(500).json({ error: "User retrieval failed." });
    }
  },

  async googleLogin(req: Request, res: Response) {
    try {
      const { email, username } = req.body;

      if (!email || !username) {
        return res.status(400).json({ error: "Email and username are required inputs for Google Sign-In." });
      }

      let user = db.getUserByEmail(email);
      let isNew = false;

      if (!user) {
        isNew = true;
        // Auto-register federated Google profile
        user = db.createUser({
          username,
          email,
          passwordHash: 'google_oauth_sso_federated_hash'
        });
      }

      const token = generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        level: user.level
      });

      const { passwordHash: _, ...safeUser } = user;
      return res.status(isNew ? 201 : 200).json({
        message: isNew 
          ? `Welcome ${user.username}! Your community profile was created via Google Sign-In.`
          : `Welcome back, ${user.username}! Signed in securely via Google SSO.`,
        token,
        user: safeUser
      });

    } catch (error) {
      console.error("Google SSO authorization handler exception:", error);
      return res.status(500).json({ error: "Google login service failure." });
    }
  }
};
