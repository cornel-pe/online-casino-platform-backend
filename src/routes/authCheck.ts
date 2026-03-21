import { Router } from 'express';
import { requireAuth, AnonymousAuthRequest } from '../middleware/anonymousAuth';

const router = Router();

// Check authentication status
router.get('/check', requireAuth, async (req: AnonymousAuthRequest, res) => {
  try {
    // If we reach here, user is authenticated
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        avatar: req.user.avatar,
        balance: req.user.balance,
        level: req.user.level
      }
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check authentication'
    });
  }
});

export default router;
