/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This file handles secure password hashing and clean JWT-like cryptographic 
// session tokens using Node's standard native 'crypto' library. 
// This offers premium-level full-stack security with zero external module compilation risks.

import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'community_hero_super_secret_reputation_key';

export function hashPassword(password: string): string {
  // Use a stable, standard SHA256 digest
  return crypto.createHmac('sha256', SECRET).update(password).digest('hex');
}

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  level: number;
}

export function generateToken(payload: TokenPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  // Token expires in 7 days for easy citizen testing
  const exp = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7);
  const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${data}`)
    .digest('base64url');
    
  return `${header}.${data}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, data, signature] = parts;
    
    // Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
      .update(`${header}.${data}`)
      .digest('base64url');
      
    if (signature !== expectedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    
    // Check expiration
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expired
    }
    
    return {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      level: payload.level
    };
  } catch (err) {
    return null;
  }
}
