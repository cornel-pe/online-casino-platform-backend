import express from 'express';
import { TokenController } from '../controllers/tokenController';
import { authenticateLocalToken, requireAdmin } from '../middleware/localAuth';

const router = express.Router();

// Public routes
router.get('/', TokenController.getAllTokens);
router.get('/:tokenId', TokenController.getTokenById);

// Protected routes (authentication required)
router.use(authenticateLocalToken);

// Admin routes
router.post('/', requireAdmin, TokenController.createToken);
router.put('/:tokenId/price', requireAdmin, TokenController.updateTokenPrice);
router.put('/:tokenId/status', requireAdmin, TokenController.updateTokenStatus);

export default router;
