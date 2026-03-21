import { Router } from 'express';
import { getChartStats, getLiveStats } from '../controllers/chartController';
import { authenticateAdmin } from '../middleware/adminAuth';

const router = Router();

// Get chart statistics with time period filtering
router.get('/stats', authenticateAdmin, getChartStats);

// Get real-time live statistics
router.get('/live', authenticateAdmin, getLiveStats);

export default router;
