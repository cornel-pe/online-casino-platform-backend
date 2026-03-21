import express from 'express';
import { authenticateLocalToken } from '../middleware/localAuth';
import { RouletteController } from '../controllers/rouletteController';
const router = express.Router();

// Public routes (no authentication required)
router.get('/current', RouletteController.getCurrentGame);

// Protected routes (authentication required)
router.use(authenticateLocalToken);

router.post('/bet', RouletteController.placeBet);
router.get('/history', RouletteController.getHistory);
router.get('/my-games', RouletteController.getUserGames);
router.get('/stats', RouletteController.getStats);
router.post('/verify', RouletteController.verifyGame);

export default router;
