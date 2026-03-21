import express from 'express';
import { CrashController } from '../controllers/crashController';
import { authenticateLocalToken } from '../middleware/localAuth';
import { allowAnonymous } from '../middleware/anonymousAuth';

const router = express.Router();

// Public routes (no authentication required)
router.get('/current', CrashController.getCurrentGame);
router.get('/debug', CrashController.debugDatabase);
router.get('/recent-history', CrashController.getRecentHistory);
// history-modal supports optional auth for filtering
router.get('/history-modal', allowAnonymous, CrashController.getHistoryForModal);
router.get('/analysis', CrashController.getAnalysis);

// Protected routes (authentication required)
router.use(authenticateLocalToken);

router.get('/history', CrashController.getHistory);
router.get('/stats', CrashController.getStats);
router.get('/user-games', CrashController.getUserGames);
router.post('/verify', CrashController.verifyGame);

export default router;
