import { Router } from 'express';
import gameHistoryController from '../controllers/gameHistoryController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = Router();

// All game history routes require authentication
router.use(authenticateLocalToken);

// Get user's game history from all game models
router.get('/user', (req, res) => gameHistoryController.getUserGameHistory(req, res));

// Get user's game history statistics
router.get('/user/stats', (req, res) => gameHistoryController.getUserGameHistoryStats(req, res));

// Get daily playing statistics for charts
router.get('/user/daily-stats', (req, res) => gameHistoryController.getDailyPlayingStats(req, res));

export default router;
