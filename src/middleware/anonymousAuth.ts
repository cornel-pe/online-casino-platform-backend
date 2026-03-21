import { Request, Response, NextFunction } from 'express';
import { authenticateLocalToken } from './localAuth';

export interface AnonymousAuthRequest extends Request {
  user?: any;
  isAnonymous?: boolean;
}

/**
 * Middleware that allows both authenticated and anonymous users
 * Sets req.user if authenticated, or req.isAnonymous = true if not
 */
export const allowAnonymous = async (
  req: AnonymousAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Try to authenticate with local token
    const token = extractBearerToken(req);
    
    if (token) {
      // User has a token, try to authenticate
      try {
        const secret = process.env.JWT_SECRET || 'fallback-secret';
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, secret) as { userId: string };
        
        if (payload?.userId) {
          const User = require('../models/User').default;
          const user = await User.findById(payload.userId);
          
          if (user && user.isActive) {
            req.user = user;
            req.isAnonymous = false;
            return next();
          }
        }
      } catch (error) {
        // Token is invalid, continue as anonymous
      }
    }
    
    // No valid token, treat as anonymous
    req.isAnonymous = true;
    next();
  } catch (error) {
    console.error('Anonymous auth middleware error:', error);
    req.isAnonymous = true;
    next();
  }
};

/**
 * Middleware that requires authentication
 * Rejects anonymous users
 */
export const requireAuth = async (
  req: AnonymousAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractBearerToken(req);
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, secret) as { userId: string };
    
    if (!payload?.userId) {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    const User = require('../models/User').default;
    const user = await User.findById(payload.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = user;
    req.isAnonymous = false;
    next();
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (error?.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    return res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

function extractBearerToken(req: Request): string | null {
  // Try cookie first (primary method)
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookieHeader.split(';').map((p) => p.trim().split('='));
  const tokenCookie = cookies.find(([name]) => name === 'platform-token');
  if (tokenCookie && tokenCookie[1]) {
    try {
      return decodeURIComponent(tokenCookie[1]);
    } catch {
      return tokenCookie[1];
    }
  }
  
  // Try Authorization header as fallback
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}
