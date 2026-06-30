/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// User profile and authentication routing mapping

import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);
router.get('/me', authenticate, authController.me);

export default router;
