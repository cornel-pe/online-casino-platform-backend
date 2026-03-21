import { Router } from 'express';
import settingsController from '../controllers/settingsController';
import { authenticateAdmin } from '../middleware/adminAuth';

const router = Router();

// Public routes (no authentication required)
router.get('/public', settingsController.getPublicSettings);

// Admin routes (authentication required)
router.get('/admin', authenticateAdmin, settingsController.getFullSettings);
router.post('/admin/initialize', authenticateAdmin, settingsController.initializeSettings);
router.put('/admin/game-status', authenticateAdmin, settingsController.updateGameStatus);
router.put('/admin/global', authenticateAdmin, settingsController.updateGlobalSettings);
router.put('/admin', authenticateAdmin, settingsController.updateSettings);

export default router;
