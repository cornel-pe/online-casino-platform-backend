import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import authController from '../controllers/authController';
import { authenticateLocalToken } from '../middleware/localAuth';
import { authRateLimit } from '../middleware/supabaseAuth';

const router = Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit(authRateLimit);

// Validation middleware
type ValidationRequest = Request & { user?: any };
const validateRequest = (req: ValidationRequest, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Wallet authentication endpoints
// Get nonce for wallet authentication
router.post('/wallet/nonce', authLimiter, [
  body('walletAddress').isString().notEmpty().withMessage('Wallet address is required')
], validateRequest, authController.getNonce);

// Verify wallet signature
router.post('/wallet/verify', authLimiter, [
  body('walletAddress').isString().notEmpty().withMessage('Wallet address is required'),
  body('signature').isString().notEmpty().withMessage('Signature is required')
], validateRequest, authController.verifySignature);

// Refresh token
router.post('/refresh', authenticateLocalToken, authController.refreshToken)

// Verify token
router.get('/verify', authenticateLocalToken, authController.verifyToken)

// Change password
router.patch('/password', authenticateLocalToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], validateRequest, authController.changePassword)

// Update user profile
router.patch('/profile', authenticateLocalToken, [
  body('username').optional().isString().isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL')
], validateRequest, authController.updateProfile)

// Get user profile
router.get('/profile', authenticateLocalToken, authController.getProfile)

// Logout (invalidate token)
router.post('/logout', authenticateLocalToken, authController.logout)

// Register (email + password), verify email, login (email + password)
router.post('/register', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').optional().isString().isLength({ max: 50 })
], validateRequest, authController.register)

router.get('/verify-email', authLimiter, authController.verifyEmail)
router.post('/verify-email', authLimiter, authController.verifyEmail)

router.post('/resend-verification', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required')
], validateRequest, authController.resendVerificationEmail)

router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], validateRequest, authController.login)

// Deprecated: Supabase token exchange (returns 400)
router.post('/exchange', authLimiter, authController.exchangeToken)

// OTP Login Routes
// Send OTP to email
router.post('/otp/send', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required')
], validateRequest, authController.sendOTP)

// Verify OTP and login
router.post('/otp/verify', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('code').isString().isLength({ min: 6, max: 6 }).withMessage('6-digit code is required')
], validateRequest, authController.verifyOTP)

export default router; 