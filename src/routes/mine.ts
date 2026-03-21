import express from 'express';
import { MineController } from '../controllers/mineController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = express.Router();

// Public routes (no authentication required)
router.get('/config', MineController.getConfig);
router.get('/game/:gameId/public', MineController.getPublicGameState);

// Protected routes (authentication required)
router.use(authenticateLocalToken);

router.post('/create', MineController.createGame);
router.post('/verify', MineController.verifyGame);
router.get('/game/:gameId', MineController.getGameState);
router.post('/game/:gameId/cashout', MineController.cashOut);
router.get('/games', MineController.getPlayerGames);
router.delete('/game/:gameId', MineController.deleteGame);
router.get('/history', MineController.getHistory);
router.get('/stats', MineController.getStats);
router.get('/incomplete', MineController.getIncompleteGames);

export default router;
