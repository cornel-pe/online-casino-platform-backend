import { Request, Response, NextFunction } from 'express';
import { isAdmin, isAdminById } from '../utils/adminUtils';

interface AuthRequest extends Request {
  user?: any;
}

export const authenticateAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Check if user is admin
    const admin = isAdmin( req.user);
    if (!admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // User is authenticated and is admin, proceed
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};
