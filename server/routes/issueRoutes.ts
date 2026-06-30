/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Hyperlocal community infrastructure issues routing mapping

import { Router } from 'express';
import multer from 'multer';
import { issueController } from '../controllers/issueController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB limit
  }
});

// Public routes (anyone can see issues near them or browse leaderboards)
router.get('/', issueController.listIssues);
router.get('/leaderboard', issueController.getLeaderboard);

// Authenticated actions (reporting, upvotes, resolve, flags)
router.post('/', authenticate, upload.single('image'), issueController.createIssue);
router.post('/users/:userId/report', authenticate, issueController.reportUser);
router.post('/:id/upvote', authenticate, issueController.upvoteIssue);
router.post('/:id/flag', authenticate, issueController.flagIssue);
router.post('/:id/resolve', authenticate, issueController.resolveIssue);

export default router;
