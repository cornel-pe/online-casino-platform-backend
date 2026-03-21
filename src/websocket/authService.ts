import User from '../models/User';
import jwt from 'jsonwebtoken';

// Verify platform JWT and return userId (no Supabase)
export function verifyPlatformToken(token: string): { valid: boolean; userId?: string; error?: string } {
  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const decoded = jwt.verify(token, secret) as { userId?: string; exp?: number };
    if (!decoded?.userId) {
      return { valid: false, error: 'Invalid token payload' };
    }
    return { valid: true, userId: decoded.userId };
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expired' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
}

// Resolve user from platform JWT (cookie or Authorization header only)
export async function getUserFromPlatformToken(token: string): Promise<{ user: any; error?: string }> {
  try {
    const result = verifyPlatformToken(token);
    if (!result.valid || !result.userId) {
      return { user: null, error: result.error };
    }
    const user = await User.findById(result.userId);
    if (!user || !user.isActive) {
      return { user: null, error: 'User not found or inactive' };
    }
    return { user };
  } catch (error) {
    console.error('getUserFromPlatformToken error:', error);
    return { user: null, error: 'Validation failed' };
  }
}
