import { Router } from 'express';
import XPController from '../controllers/xpController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = Router();

// All XP routes require authentication
router.use(authenticateLocalToken);

// Get user's XP information
router.get('/user', XPController.getUserXP);

// Get user achievements
router.get('/achievements', XPController.getUserAchievements);

// Get level leaderboard
router.get('/leaderboard/level', XPController.getLevelLeaderboard);

// Get wagering leaderboard
router.get('/leaderboard/wagering', XPController.getWageringLeaderboard);

// Get weekly wagering leaderboard
router.get('/leaderboard/weekly-wagering', XPController.getWeeklyWageringLeaderboard);

// Get XP requirements for levels
router.get('/requirements', XPController.getXPRequirements);

export default router;
