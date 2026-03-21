import { Router } from 'express';
import gameStatusController from '../controllers/gameStatusController';
import { optionalLocalAuth } from '../middleware/localAuth';

const router = Router();

// Game status routes use optional authentication (public data)
router.use(optionalLocalAuth);

// Get active player counts for all games
router.get('/active-players', (req, res) => gameStatusController.getActivePlayerCounts(req, res));

// Get active player count for a specific game type
router.get('/active-players/:gameType', (req, res) => gameStatusController.getGamePlayerCount(req, res));

export default router;
