import { Router } from 'express';
import { CoinflipController } from '../controllers/coinflipController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = Router();

// Public routes
router.get('/config', CoinflipController.getConfig);
router.get('/games', CoinflipController.getGames);
router.get('/game/:gameId', CoinflipController.getGame);
router.get('/seed', CoinflipController.generateUserSeed);
router.post('/verify', CoinflipController.verifyGame);

// Protected routes (require authentication)
router.post('/create', authenticateLocalToken, CoinflipController.createGame);
router.post('/join', authenticateLocalToken, CoinflipController.joinGame);
// router.delete('/cancel/:gameId', authenticateLocalToken, CoinflipController.cancelGame);
router.get('/my-games', authenticateLocalToken, CoinflipController.getUserGames);

export default router;
