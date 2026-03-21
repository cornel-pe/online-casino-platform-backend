import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { signPlatformToken } from '../middleware/localAuth';
import NotificationUtils from '../utils/notificationUtils';
import OTP from '../models/OTP';
import emailService from '../services/emailService';
import { generateNonce } from '../utils/randomGenerator';
import notificationEngine from '../engine/notificationEngine';
const bcrypt = require('bcryptjs');



const VERIFICATION_JWT_EXPIRY = '24h';
const SALT_ROUNDS = 10;

interface AuthRequest extends Request {
  user?: IUser;
}

class AuthController {
  constructor() {
    // this.connectWallet = this.connectWallet.bind(this);
    this.verifyToken = this.verifyToken.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
    this.getNonce = this.getNonce.bind(this);
    this.verifySignature = this.verifySignature.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.logout = this.logout.bind(this);
    this.exchangeToken = this.exchangeToken.bind(this);
    this.sendOTP = this.sendOTP.bind(this);
    this.verifyOTP = this.verifyOTP.bind(this);
    this.register = this.register.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
    this.resendVerificationEmail = this.resendVerificationEmail.bind(this);
    this.login = this.login.bind(this);
    this.changePassword = this.changePassword.bind(this);
  }

  
  // Ensure username meets min length and uniqueness constraints
  private async ensureValidUsername(desiredUsername: string, currentUserId?: string): Promise<string> {
    // Normalize: trim, collapse spaces, remove non-word except underscore and dash
    let base = (desiredUsername || '').toString().trim();
    base = base.replace(/\s+/g, '');
    base = base.replace(/[^a-zA-Z0-9_-]/g, '');

    // Enforce minimum length by prefixing
    if (base.length < 3) {
      base = `spinx_${base}`;
    }

    // Enforce max length (schema max 20)
    if (base.length > 20) {
      base = base.slice(0, 20);
    }

    // If unique or belongs to current user, return
    const existing = await User.findOne({ username: base });
    if (!existing || (currentUserId && String(existing._id) === String(currentUserId))) {
      return base;
    }

    // Try appending numeric suffix up to a few attempts
    for (let i = 0; i < 10; i++) {
      const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const candidate = (base + suffix).slice(0, 20);
      const clash = await User.findOne({ username: candidate });
      if (!clash) return candidate;
    }

    // Fallback to random generator
    const generated = await (User as any).generateUniqueUsername();
    return generated;
  }

  // Detect Mongo duplicate key for username
  private isDuplicateUsernameError(err: any): boolean {
    return !!(
      err &&
      (err.code === 11000 || err.code === '11000') &&
      (err.keyPattern?.username || (typeof err.message === 'string' && err.message.includes('index: username')))
    );
  }


  // Generate JWT token
  private generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      process.env['JWT_SECRET'] || 'fallback-secret',
      { expiresIn: '7d' }
    );
  }

  // Connect wallet
  // async connectWallet(req: Request, res: Response): Promise<Response> {
  //   try {
  //     const { walletAddress } = req.body;
  //     const token = req.cookies["privy-token"];
  //     if (!token) {
  //       return res.status(401).json({ error: 'Access token required' });
  //     }
  //     const tokenValidation = await verifyToken(token);
  //     if (!tokenValidation) {
  //       return res.status(401).json({ error: 'Invalid or expired token' });
  //     }
  //     if (!walletAddress) {
  //       return res.status(400).json({ error: 'Wallet address is required' });
  //     }
  //     // Check if user exists
  //     let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

  //     if (!user && tokenValidation) {
  //       // Create new user
  //       const username = await (User as any).generateUniqueUsername();
  //       user = new User({
  //         userId: tokenValidation.userId, // Ensure userId is set from token claims
  //         walletAddress: walletAddress.toLowerCase(),
  //         username,
  //         nonce: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  //       });
  //     }
  //     else {
  //       if (!user.userId && tokenValidation) {
  //         user.userId = tokenValidation.userId; // Ensure userId is set from token claims
  //       }
  //     }
  //     // Update last login
  //     user.lastLogin = new Date();
  //     await user.save();
  //     res.json({ user });
  //   } catch (error) {
  //     console.error('Connect wallet error:', error);
  //     return res.status(500).json({ error: 'Failed to connect wallet' });
  //   }
  // }

  // Verify token
  async verifyToken(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = await User.findOne(req.user?._id)

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Verify token error:', error);
      return res.status(500).json({ error: 'Failed to verify token' });
    }
  }

  // Refresh token
  async refreshToken(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await User.findById(req.user?._id).select('-nonce -signature');

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Generate new token
      const token = this.generateToken(user._id.toString());

      res.json({
        token,
        user: {
          id: user._id,
          walletAddress: user.walletAddress,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          isVerified: user.isVerified,
          balance: user.balance,
          totalBets: user.totalBets,
          totalWins: user.totalWins,
          totalLosses: user.totalLosses,
          totalWagered: user.totalWagered,
          totalWon: user.totalWon,
          winRate: user.winRate,
          profitLoss: user.profitLoss
        }
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  }

  // Get nonce for wallet authentication
  async getNonce(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress } = req.body;

      if (!walletAddress) {
        res.status(400).json({ error: 'Wallet address is required' });
        return;
      }

      const normalizedAddress = walletAddress.toLowerCase().trim();
      let user = await User.findOne({ walletAddress: normalizedAddress });
      let isNewUser = false;

      if (!user) {
        // Create new user
        const username = await (User as any).generateUniqueUsername();
        user = new User({
          walletAddress: normalizedAddress,
          username,
          balance: 100, // Initial balance for new users
          nonce: generateNonce(),
          lastLogin: null // Set to null for new users, will be set on first successful login
        });
        
        // Generate seed for new user
        (user as any).generateSeed();
        await user.save();
        isNewUser = true;
        
        console.log('✅ New wallet user created:', user.username, 'Address:', normalizedAddress);
      } else {
        // Generate new nonce for existing user
        (user as any).generateNonce();
        await user.save();
        
        console.log('🔄 Existing wallet user requesting nonce:', user.username, 'Address:', normalizedAddress);
      }

      res.json({
        nonce: user.nonce,
        message: `Sign this message to authenticate with SpinX:\n\nNonce: ${user.nonce}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`,
        isNewUser // Return this so we know on verification
      });
    } catch (error) {
      console.error('Get nonce error:', error);
      res.status(500).json({ error: 'Failed to get nonce' });
    }
  }

  // Verify signature
  async verifySignature(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress, signature } = req.body;

      if (!walletAddress || !signature) {
        res.status(400).json({ error: 'Wallet address and signature are required' });
        return;
      }

      const normalizedAddress = walletAddress.toLowerCase().trim();
      const user = await User.findOne({ walletAddress: normalizedAddress });

      if (!user) {
        res.status(404).json({ error: 'User not found. Please request a nonce first.' });
        return;
      }

      if (!user.nonce) {
        res.status(400).json({ error: 'No nonce found. Please request a nonce first.' });
        return;
      }

      // Verify Ethereum signature using ethers.js
      const { ethers } = require('ethers');
      const message = `Sign this message to authenticate with SpinX:\n\nNonce: ${user.nonce}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`;
      
      try {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        
        if (recoveredAddress.toLowerCase() !== normalizedAddress) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      } catch (error) {
        console.error('Signature verification failed:', error);
        res.status(401).json({ error: 'Invalid signature format' });
        return;
      }

      // Check if this is the first login (welcome notification should only be sent once)
      const isFirstLogin = !user.lastLogin;

      // Generate platform token
      const platformToken = signPlatformToken(user._id.toString());

      // Set HTTP-only cookie with platform token
      res.cookie('platform-token', platformToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
      });

      // Update last login and clear nonce
      user.lastLogin = new Date();
      user.nonce = null;
      await user.save();

      console.log('✅ Platform token set in HTTP-only cookie for wallet user:', user.username);

      // Send welcome notification only on first login
      if (isFirstLogin) {
        NotificationUtils.sendWelcome(user._id.toString());
      } else {
        console.log('👋 Welcome back wallet user:', user.username);
      }

      res.json({
        success: true,
        user: {
          id: user._id,
          walletAddress: user.walletAddress,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          isVerified: user.isVerified,
          balance: user.balance,
          totalBets: user.totalBets,
          totalWins: user.totalWins,
          totalLosses: user.totalLosses,
          totalWagered: user.totalWagered,
          totalWon: user.totalWon,
          winRate: user.winRate,
          profitLoss: user.profitLoss,
          level: user.level
        }
      });
    } catch (error) {
      console.error('Verify signature error:', error);
      res.status(500).json({ error: 'Failed to verify signature' });
    }
  }

  // Change password (authenticated user)
  async changePassword(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      const user = await User.findById(userId).select('+password');
      if (!user || !(user as any).password) {
        return res.status(400).json({ error: 'Password change not available for this account' });
      }
      const match = await bcrypt.compare(currentPassword, (user as any).password);
      if (!match) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      (user as any).password = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await user.save();
      return res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
      console.error('Change password error:', err);
      return res.status(500).json({ error: 'Failed to change password' });
    }
  }

  // Update user profile
  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { username, email, discordName, discordAvatar, xUsername } = req.body;
      // Validate username uniqueness
      if (username) {
        const existingUsername = await User.findOne({ username, _id: { $ne: userId } });
        if (existingUsername) {
          res.status(400).json({ error: 'Username already taken' });
          return;
        }
      }
      // Validate email uniqueness (if provided)
      if (email) {
        const existingEmail = await User.findOne({ email, _id: { $ne: userId } });
        if (existingEmail) {
          res.status(400).json({ error: 'Email already in use' });
          return;
        }
      }
      // Update user fields
      const update: any = {};
      if (username) update.username = username;
      if (email !== undefined) update.email = email;
      if (discordName !== undefined) update.discordName = discordName;
      if (discordAvatar !== undefined) update.discordAvatar = discordAvatar;
      if (xUsername !== undefined) update.xUsername = xUsername;
      // If email is changed, set verified to false
      if (email !== undefined) update.verified = false;
      const user = await User.findByIdAndUpdate(userId, update, { new: true }).select('-nonce -signature');
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({
        user: {
          id: user._id,
          walletAddress: user.walletAddress,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          isVerified: user.isVerified,
          verified: user.verified,
          discordName: user.discordName,
          discordAvatar: user.discordAvatar,
          xUsername: user.xUsername,
          balance: user.balance,
          totalBets: user.totalBets,
          totalWins: user.totalWins,
          totalLosses: user.totalLosses,
          totalWagered: user.totalWagered,
          totalWon: user.totalWon,
          winRate: user.winRate,
          profitLoss: user.profitLoss
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  // Get user profile
  async getProfile(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      return res.json({
        success: true,
        data: {
          _id: user._id,
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          discordAvatar: user.discordAvatar,
          balance: user.balance,
          level: user.level,
          isAdmin: user.isAdmin,
          isActive: user.isActive,
          createdAt: user.createdAt,
          profile: {
            username: user.username,
            avatar: user.avatar,
            discordAvatar: user.discordAvatar,
            displayName: user.displayName,
            bio: user.bio
          }
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }

  // Logout (clear cookie)
  async logout(req: AuthRequest, res: Response): Promise<Response> {
    try {
      // Clear the platform token cookie
      res.clearCookie('platform-token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });

      console.log('✅ Platform token cookie cleared');
      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  }

  // Register with email and password (no Supabase)
  async register(req: Request, res: Response): Promise<Response> {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const emailLower = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailLower)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const existing = await User.findOne({ email: emailLower });
      if (existing) {
        return res.status(400).json({ error: 'An account with this email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const rawUsername = (name || emailLower.split('@')[0] || `user_${Date.now().toString(36)}`).slice(0, 20);
      const username = await this.ensureValidUsername(rawUsername);

      const user = new User({
        email: emailLower,
        password: hashedPassword,
        username,
        displayName: name?.trim()?.slice(0, 50) || null,
        verified: false,
        isVerified: false,
        isActive: true,
        balance: 10,
        totalBets: 0,
        totalWins: 0,
        totalLosses: 0,
        totalWagered: 0,
        totalWon: 0,
        chatEnabled: true,
        paymentAccount: false,
        isAdmin: false,
        nonce: generateNonce(),
      });
      (user as any).generateSeed();
      await user.save();

      const verificationToken = jwt.sign(
        { userId: user._id.toString(), email: emailLower, purpose: 'verify' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: VERIFICATION_JWT_EXPIRY }
      );
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const verificationLink = `${frontendUrl}/auth/verify-email?token=${verificationToken}`;
      await emailService.sendVerificationEmail(emailLower, verificationLink);

      return res.status(201).json({
        success: true,
        message: 'Account created. Please check your email to verify your account.',
      });
    } catch (err: any) {
      if (this.isDuplicateUsernameError(err)) {
        return res.status(400).json({ error: 'Username conflict. Please try again.' });
      }
      console.error('Register error:', err);
      return res.status(500).json({ error: 'Failed to register' });
    }
  }

  // Resend verification email (for unverified users)
  async resendVerificationEmail(req: Request, res: Response): Promise<Response> {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      const emailLower = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailLower)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const user = await User.findOne({ email: emailLower });
      if (!user) {
        return res.status(404).json({ error: 'No account found with this email' });
      }
      if (user.verified) {
        return res.status(400).json({ error: 'Email is already verified. You can sign in.' });
      }

      const verificationToken = jwt.sign(
        { userId: user._id.toString(), email: emailLower, purpose: 'verify' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: VERIFICATION_JWT_EXPIRY }
      );
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const verificationLink = `${frontendUrl}/auth/verify-email?token=${verificationToken}`;
      const sent = await emailService.sendVerificationEmail(emailLower, verificationLink);

      if (!sent) {
        return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
      }

      return res.json({
        success: true,
        message: 'Verification email sent. Please check your inbox.',
      });
    } catch (err) {
      console.error('Resend verification error:', err);
      return res.status(500).json({ error: 'Failed to resend verification email' });
    }
  }

  // Verify email via token in query (GET) or body (POST)
  async verifyEmail(req: Request, res: Response): Promise<Response> {
    try {
      const token = (req.query.token as string) || req.body?.token;
      if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      const secret = process.env.JWT_SECRET || 'fallback-secret';
      let payload: { userId: string; email: string; purpose?: string };
      try {
        payload = jwt.verify(token, secret) as typeof payload;
      } catch {
        return res.status(400).json({ error: 'Invalid or expired verification link' });
      }
      if (payload.purpose !== 'verify' || !payload.userId) {
        return res.status(400).json({ error: 'Invalid verification token' });
      }

      const user = await User.findById(payload.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.verified) {
        return res.json({ success: true, message: 'Email already verified' });
      }

      user.verified = true;
      user.isVerified = true;
      await user.save();

      const platformToken = signPlatformToken(user._id.toString());
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

      res.cookie('platform-token', platformToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      const redirectUrl = req.query.redirect === 'false' ? undefined : `${frontendUrl}/?verified=1`;
      if (redirectUrl && req.get('accept')?.includes('text/html')) {
        return res.redirect(302, redirectUrl) as any;
      }
      return res.json({
        success: true,
        message: 'Email verified',
        redirect: redirectUrl,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          verified: true,
        },
      });
    } catch (err) {
      console.error('Verify email error:', err);
      return res.status(500).json({ error: 'Failed to verify email' });
    }
  }

  // Login with email and password (require verified)
  async login(req: Request, res: Response): Promise<Response> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const emailLower = email.toLowerCase().trim();
      const user = await User.findOne({ email: emailLower }).select('+password');
      if (!user || !(user as any).password) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const match = await bcrypt.compare(password, (user as any).password);
      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.verified) {
        const verificationToken = jwt.sign(
          { userId: user._id.toString(), email: emailLower, purpose: 'verify' },
          process.env.JWT_SECRET || 'fallback-secret',
          { expiresIn: VERIFICATION_JWT_EXPIRY }
        );
        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
        const verificationLink = `${frontendUrl}/auth/verify-email?token=${verificationToken}`;
        await emailService.sendVerificationEmail(emailLower, verificationLink);

        return res.status(403).json({
          error: 'Please verify your email before logging in. A new verification link has been sent to your inbox.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Account is inactive' });
      }

      user.lastLogin = new Date();
      await user.save();

      const platformToken = signPlatformToken(user._id.toString());
      res.cookie('platform-token', platformToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return res.json({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          avatar: user.avatar,
          balance: user.balance,
          level: user.level,
          verified: user.verified,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Failed to login' });
    }
  }

  // Exchange Supabase token for platform JWT (deprecated – use POST /auth/login instead)
  async exchangeToken(req: Request, res: Response): Promise<Response> {
    return res.status(400).json({
      error: 'Supabase auth is no longer supported. Use POST /auth/login with email and password instead.',
    });
  }

  // Send OTP to email
  async sendOTP(req: Request, res: Response): Promise<Response> {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      // Check if user exists with this email
      const user = await User.findOne({ email:email });
      if (!user) {
        return res.status(404).json({ error: 'No account found with this email' });
      }

      // Check for recent OTP requests (rate limiting - max 1 per minute)
      const recentOTP = await OTP.findOne({
        email: email.toLowerCase(),
        createdAt: { $gte: new Date(Date.now() - 60000) } // Last minute
      });

      if (recentOTP) {
        const timeLeft = Math.ceil((60000 - (Date.now() - recentOTP.createdAt.getTime())) / 1000);
        return res.status(429).json({ 
          error: `Please wait ${timeLeft} seconds before requesting another code` 
        });
      }

      // Generate 6-digit OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryMinutes = 2;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60000);

      // Delete any existing OTPs for this email
      await OTP.deleteMany({ email: email.toLowerCase() });

      // Create new OTP
      await OTP.create({
        email: email.toLowerCase(),
        code,
        expiresAt,
      });

      // Send OTP via email from backend (secure method)
      const emailSent = await emailService.sendOTP(email, code, expiryMinutes);

      if (!emailSent) {
        // Email sending failed, but we'll still return success since OTP is stored
        console.warn('⚠️ Email sending failed, but OTP is stored in database');
      }

      // Return success without exposing the OTP code
      return res.json({
        success: true,
        message: 'Verification code sent to your email',
        expiryMinutes,
        expiresIn: expiryMinutes * 60, // seconds
      });
    } catch (error) {
      console.error('Send OTP error:', error);
      return res.status(500).json({ error: 'Failed to send OTP' });
    }
  }

  // Verify OTP and login
  async verifyOTP(req: Request, res: Response): Promise<Response> {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required' });
      }

      // Find OTP
      const otp = await OTP.findOne({
        email: email.toLowerCase(),
        code: code.toString(),
      });

      if (!otp) {
        // Increment failed attempts
        const anyOTP = await OTP.findOne({ email: email.toLowerCase() });
        if (anyOTP) {
          anyOTP.attempts += 1;
          await anyOTP.save();

          // Lock after 5 failed attempts
          if (anyOTP.attempts >= 5) {
            await OTP.deleteMany({ email: email.toLowerCase() });
            return res.status(429).json({ 
              error: 'Too many failed attempts. Please request a new code.' 
            });
          }
        }

        return res.status(401).json({ error: 'Invalid or expired code' });
      }

      // Check if expired
      if (otp.expiresAt < new Date()) {
        await OTP.deleteMany({ email: email.toLowerCase() });
        return res.status(401).json({ error: 'Code has expired. Please request a new one.' });
      }

      // Check if already verified
      if (otp.verified) {
        return res.status(400).json({ error: 'Code already used' });
      }

      // Mark as verified
      otp.verified = true;
      await otp.save();

      // Get user
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = this.generateToken(user._id.toString());

      // Generate platform token
      const platformToken = signPlatformToken(user._id.toString());

      // Send welcome notification (optional - remove if notificationEngine doesn't support this)
      try {
        // Check if notificationEngine has send method, otherwise skip
        if (typeof (notificationEngine as any).send === 'function') {
          await (notificationEngine as any).send({
            userId: user._id.toString(),
            title: 'Welcome Back! 🎰',
            message: `You've successfully logged in via email.`,
            priority: 'normal',
            data: { loginMethod: 'otp' },
            expiresInHours: 24,
          });
        }
      } catch (notifError) {
        console.log('Notification skipped:', notifError);
      }

      // Delete used OTP
      await OTP.deleteMany({ email: email.toLowerCase() });

      // Set HTTP-only cookie with platform token
      res.cookie('platform-token', platformToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
      });

      console.log('✅ Platform token set in HTTP-only cookie for user:', user.username);

      return res.json({
        success: true,
        token,
        platformToken,
        user: {
          id: user._id,
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          avatar: user.avatar,
          balance: user.balance,
          level: user.level,
          bio: user.bio,
        },
      });
    } catch (error) {
      console.error('Verify OTP error:', error);
      return res.status(500).json({ error: 'Failed to verify OTP' });
    }
  }
}

export default new AuthController(); 