import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

export interface LocalAuthRequest extends Request {
  user?: IUser;
}

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

export const authenticateLocalToken = async (
  req: LocalAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const payload = jwt.verify(token, secret) as { userId: string; iat: number; exp: number };
    if (!payload?.userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!user.isActive) {
      return res.status(401).json({ error: 'User account is inactive' });
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error?.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const optionalLocalAuth = async (
  req: LocalAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      // No token provided, continue without authentication
      req.user = undefined;
      return next();
    }

    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const payload = jwt.verify(token, secret) as { userId: string; iat: number; exp: number };
    if (!payload?.userId) {
      // Invalid token, continue without authentication
      req.user = undefined;
      return next();
    }

    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      // User not found or inactive, continue without authentication
      req.user = undefined;
      return next();
    }

    req.user = user;
    next();
  } catch (error: any) {
    // Any error in token verification, continue without authentication
    req.user = undefined;
    next();
  }
};

export const requireAdmin = (req: LocalAuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export function signPlatformToken(userId: string): string {
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
}
