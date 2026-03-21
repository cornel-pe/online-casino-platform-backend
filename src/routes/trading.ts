import { Router } from 'express';
import {
  getSupportedTokens,
  getTokenPrice,
  openBet,
  closeBet,
  getActiveBets,
  getBetHistory,
  getBet,
  updateAutoCashout,
} from '../controllers/tradingController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = Router();

// Public routes (market data)
router.get('/tokens', getSupportedTokens);
router.get('/tokens/:token/price', getTokenPrice);

// Protected routes (require authentication)
router.use(authenticateLocalToken);

// Bet management routes
router.post('/bets/open', openBet);
router.post('/bets/:betId/close', closeBet);
router.get('/bets/active', getActiveBets);
router.get('/bets/history', getBetHistory);
router.get('/bets/:betId', getBet);
router.put('/bets/:betId/auto-cashout', updateAutoCashout);

export default router;






