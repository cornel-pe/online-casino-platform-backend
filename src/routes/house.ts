import { Router } from 'express';
import houseController from '../controllers/houseController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = Router();

// Public routes (no authentication required)
router.get('/balance', (req, res) => houseController.getHouseBalance(req, res));

// Admin routes (authentication required)
router.use(authenticateLocalToken);

// House management (admin only)
router.get('/stats', (req, res) => houseController.getHouseStats(req, res));
router.get('/transactions', (req, res) => houseController.getHouseTransactionHistory(req, res));
router.put('/treasury', (req, res) => houseController.adjustTreasury(req, res));

export default router;
