import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import User, { IUser } from '../models/User';
import { generateNonce } from '../utils/randomGenerator';

// Function to get Supabase client with environment variables
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  console.log('Supabase URL:', supabaseUrl);
  console.log('Supabase Anon Key:', supabaseAnonKey ? '***' : 'undefined');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase environment variables!');
    console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file');
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

// Initialize Supabase client
let supabase: any;

// Lazy initialization of Supabase client
const getSupabase = () => {
  if (!supabase) {
    supabase = getSupabaseClient();
  }
  return supabase;
};

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  supabaseUser?: any;
}

// Helper function to extract token from cookies
const extractTokenFromCookies = (req: Request): string | null => {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  
  // Parse cookies to find the auth token
  const cookiePairs = cookies.split(';').map(pair => pair.trim().split('='));
  // Look for any cookie that contains 'auth-token'
  const authCookie = cookiePairs.find(([name]) => 
    name === `sb-${process.env.SUPABASE_PROJECT_REF}-auth-token` || name === `sb-${process.env.SUPABASE_PROJECT_REF}-auth-token.0`
  );

  console.log("authCookie", authCookie)
  if (authCookie && authCookie[1]) {
    const tokenValue = atob(decodeURIComponent(authCookie[1]).replace(/^base64-/, ""));
    
    // If it's a JSON object, extract the access_token
    try {
      const parsed = JSON.parse(tokenValue);
      console.log('Parsed:', parsed);
      if (parsed.access_token) {
        return parsed.access_token;
      }
    } catch {
      // If it's not JSON, assume it's the token directly
      return tokenValue;
    }
  }
  
  return null;
};

// Middleware to verify Supabase JWT token
export const authenticateSupabaseToken = async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    // First try to get token from cookies
    let token = extractTokenFromCookies(req);
    // Fallback to Authorization header if cookie not found
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove 'Bearer ' prefix
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }
    // Verify the JWT token with Supabase
    const { data: { user }, error } = await getSupabase().auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Store the Supabase user in the request
    req.supabaseUser = user;

    // Find or create user in our custom database
    let dbUser = await User.findOne({ supabaseId: user.id });

    if (!dbUser) {
      // Create new user in our database
      dbUser = new User({
        supabaseId: user.id,
        email: user.email,
        username: user.user_metadata?.name || user.email?.split('@')[0] || `user_${user.id.slice(-6)}`,
        isActive: true,
        balance: 0, // Starting balance
        totalBets: 0,
        totalWins: 0,
        totalLosses: 0,
        totalWagered: 0,
        totalWon: 0,
        chatEnabled: true,
        isVerified: false,
        verified: false,
        isAdmin: false,
        nonce: generateNonce(),
        exp: 0,
        level: 1
      });

      // Generate seed for new user
      (dbUser as any).generateSeed();
      await dbUser.save();
    }

    // Check if user is active
    if (!dbUser.isActive) {
      return res.status(401).json({ error: 'User account is inactive' });
    }

    req.user = dbUser;
    next();

  } catch (error: any) {
    console.error('Supabase auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Optional authentication middleware
export const optionalSupabaseAuth = async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    // First try to get token from cookies
    let token = extractTokenFromCookies(req);
    
    // Fallback to Authorization header if cookie not found
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (token) {
      const { data: { user }, error } = await getSupabase().auth.getUser(token);
      
      if (!error && user) {
        req.supabaseUser = user;
        
        const dbUser = await User.findOne({ supabaseId: user.id });
        if (dbUser && dbUser.isActive) {
          req.user = dbUser;
        }
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Admin middleware
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Rate limiting for authentication endpoints
export const authRateLimit = {
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '100'), // More restrictive than global but reasonable
  message: 'Too many authentication attempts, please try again later.'
};
