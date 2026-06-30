/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Middleware to authenticate JWT-like signed tokens inside Express requests

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService';
import { db } from '../services/dbService';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Access denied. Authentication token missing." });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: "Access denied. Auth token is invalid or expired." });
    }

    const user = db.getUserById(payload.userId);
    if (user && user.isBanned) {
      return res.status(403).json({ error: "Access denied. Your account has been banned due to repeated community violation flags." });
    }

    // Assign verified user profile to the request
    (req as any).user = payload;
    next();
  } catch (err) {
    console.error("Auth middleware failure path exception:", err);
    return res.status(501).json({ error: "Authentication system failure." });
  }
}
