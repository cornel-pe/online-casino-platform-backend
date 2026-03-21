import { Router } from 'express';
import adminController from '../controllers/admin/adminController';
import adminDashboardController from '../controllers/admin/adminDashboardController';
import * as riskControlController from '../controllers/riskControlController';
import * as adminNotificationController from '../controllers/adminNotificationController';
import { 
  getCrashGameStatus, 
  pauseCrashGame, 
  resumeCrashGame, 
  forceEndCrashGame, 
  updateCrashGameConfig, 
  getCrashGameHistory,
  getCrashExposureData,
  updateCrashRiskSettings,
  getCrashRiskAlerts,
  generateCrashSeeds,
  verifyCrashRound,
  publishCrashSeedHash,
  revealCrashSeed,
  getCrashAuditLogs,
  getCrashAuditStats,
  getCrashMonitoringData,
  getCrashAlerts,
  sendCrashAlertNotification
} from '../controllers/crashController';

// New crash admin controller
import {
  getCurrentRound,
  startEngine as startCrashEngine,
  forceEndRound,
  pauseEngine,
  resumeEngine,
  getCrashHistory,
  getGameBets,
  getCrashStats
} from '../controllers/admin/crashAdminController';
import { authenticateLocalToken } from '../middleware/localAuth';
import {
  getAllBets as getAllTradingBets,
  getTradingStats as getTradingAdminStats,
} from '../controllers/tradingAdminController';
import { authenticateAdmin } from '../middleware/adminAuth';
import { isAdminById } from '../utils/adminUtils';
import { getParam } from '../utils/requestParams';

const router = Router();

// Admin status check route - requires authentication but allows any authenticated user to check their own status
router.get('/check-admin/:userId', authenticateLocalToken, async (req: any, res) => {
  try {
    const userId = getParam(req, 'userId');
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }
    const requestingUserId = req.user?._id?.toString();
    const requestingUserSupabaseId = req.user?.supabaseId;
    
    // Only allow users to check their own admin status, or existing admins to check others
    const isRequestingUserAdmin = req.user?.isAdmin === true;
    const isCheckingOwnStatus = requestingUserId === userId || requestingUserSupabaseId === userId;
    
    if (!isRequestingUserAdmin && !isCheckingOwnStatus) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to check admin status' });
    }
    
    // Try to find user by MongoDB _id first, then by supabaseId
    let isAdmin = false;
    try {
      // Import User model
      const User = require('../models/User').default;
      
      let user = null;
      try {
        // Try by MongoDB ObjectId first
        user = await User.findById(userId);
      } catch (err) {
        // If not valid ObjectId, try by supabaseId
        user = await User.findOne({ supabaseId: userId });
      }
      
      isAdmin = user?.isAdmin === true;
    } catch (error) {
      console.error('Error finding user for admin check:', error);
      return res.status(500).json({ success: false, error: 'Failed to check admin status' });
    }
    
    res.json({ success: true, isAdmin });
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({ success: false, error: 'Failed to check admin status' });
  }
});

// All other admin routes require authentication and admin privileges
router.use(authenticateLocalToken);
router.use(authenticateAdmin);

// Admin user management
router.get('/users', (req, res) => adminController.getAllUsers(req, res));
router.get('/users/:targetUserId', (req, res) => adminController.getUserById(req, res));
router.get('/admins', (req, res) => adminController.getAdminUsers(req, res));

// User ban/unban management
router.post('/users/:userId/ban', (req, res) => adminController.banUser(req, res));
router.post('/users/:userId/unban', (req, res) => adminController.unbanUser(req, res));

// User freeze/unfreeze management
router.post('/users/:userId/freeze', (req, res) => adminController.freezeUser(req, res));
router.post('/users/:userId/unfreeze', (req, res) => adminController.unfreezeUser(req, res));

// User balance management
router.post('/users/:userId/balance', (req, res) => adminController.updateUserBalance(req, res));

// Admin privilege management
router.post('/remove-admin', (req, res) => adminController.removeUserAdmin(req, res));

// Transaction management routes
router.get('/transactions/history', (req, res) => adminController.getTransactionHistory(req, res));
router.get('/transactions/stats', (req, res) => adminController.getTransactionStats(req, res));

// Game settings routes
router.get('/games/settings', (req, res) => adminController.getGameSettings(req, res));
router.put('/games/settings', (req, res) => adminController.updateGameSettings(req, res));
router.post('/games/:gameType/reset', (req, res) => adminController.resetGameSettings(req, res));
router.get('/games/:gameType/stats', (req, res) => adminController.getGameStats(req, res));

// Master settings routes
router.get('/settings/master', (req, res) => adminController.getMasterSettings(req, res));
router.put('/settings/master', (req, res) => adminController.updateMasterSettings(req, res));
router.post('/settings/server-status', (req, res) => adminController.updateServerStatus(req, res));
router.get('/settings/system-health', (req, res) => adminController.getSystemHealth(req, res));

// Admin notification routes
router.post('/notifications/send', (req, res) => adminController.sendNotification(req, res));
router.get('/notifications/history', (req, res) => adminController.getNotificationHistory(req, res));
router.post('/notifications/templates', (req, res) => adminController.createNotificationTemplate(req, res));
router.get('/notifications/templates', (req, res) => adminController.getNotificationTemplates(req, res));
router.get('/notifications/stats', (req, res) => adminController.getNotificationStats(req, res));
router.delete('/notifications/:notificationId', (req, res) => adminController.deleteNotification(req, res));

// Additional notification routes - Also available via /api/notifications/admin/* endpoints
// See backend/src/routes/notification.ts for notification routes

// Dashboard routes
router.get('/dashboard/stats', (req, res) => adminDashboardController.getStats(req, res));
router.get('/dashboard/charts', (req, res) => adminDashboardController.getCharts(req, res));
router.get('/dashboard/online-users', (req, res) => adminDashboardController.getOnlineUsers(req, res));

// ====================================================================
// CRASH GAME ADMIN ROUTES - New Engine (Primary)
// ====================================================================
router.get('/crash/current-round', (req, res) => getCurrentRound(req, res));
router.post('/crash/start-engine', (req, res) => startCrashEngine(req, res));
router.post('/crash/force-end-round/:roundId', (req, res) => forceEndRound(req, res));
router.post('/crash/pause-engine', (req, res) => pauseEngine(req, res));
router.post('/crash/resume-engine', (req, res) => resumeEngine(req, res));
router.get('/crash/history-new', (req, res) => getCrashHistory(req, res));
router.get('/crash/game/:gameId/bets', (req, res) => getGameBets(req, res));
router.get('/crash/stats', (req, res) => getCrashStats(req, res));

// ====================================================================
// CRASH GAME MONITORING & AUDIT ROUTES - Still Useful
// ====================================================================
router.get('/crash/audit-logs', (req, res) => getCrashAuditLogs(req, res));
router.get('/crash/audit-stats', (req, res) => getCrashAuditStats(req, res));
router.get('/crash/monitoring', (req, res) => getCrashMonitoringData(req, res));
router.get('/crash/alerts', (req, res) => getCrashAlerts(req, res));
router.post('/crash/send-alert-notification', (req, res) => sendCrashAlertNotification(req, res));

// ====================================================================
// LEGACY CRASH GAME ROUTES - Deprecated (Return 410 Gone)
// These routes are kept for backward compatibility but return deprecation warnings
// ====================================================================
router.get('/crash/status', (req, res) => getCrashGameStatus(req, res));
router.post('/crash/pause', (req, res) => pauseCrashGame(req, res));
router.post('/crash/resume', (req, res) => resumeCrashGame(req, res));
router.post('/crash/force-end', (req, res) => forceEndCrashGame(req, res));
router.put('/crash/config', (req, res) => updateCrashGameConfig(req, res));
router.get('/crash/history', (req, res) => getCrashGameHistory(req, res));

// ====================================================================
// PLACEHOLDER ROUTES - Not Yet Implemented (Return 501 Not Implemented)
// These routes are placeholders for future features
// ====================================================================
router.get('/crash/exposure', (req, res) => getCrashExposureData(req, res));
router.put('/crash/risk-settings', (req, res) => updateCrashRiskSettings(req, res));
router.get('/crash/risk-alerts', (req, res) => getCrashRiskAlerts(req, res));
router.post('/crash/generate-seeds', (req, res) => generateCrashSeeds(req, res));
router.post('/crash/verify-round', (req, res) => verifyCrashRound(req, res));
router.post('/crash/publish-hash', (req, res) => publishCrashSeedHash(req, res));
router.post('/crash/reveal-seed', (req, res) => revealCrashSeed(req, res));

// ====================================================================
// RISK CONTROL ROUTES
// Platform-wide risk management and monitoring
// ====================================================================
router.get('/risk-control/dashboard', (req, res) => riskControlController.getRiskDashboard(req, res));
router.get('/risk-control/settings', (req, res) => riskControlController.getRiskSettings(req, res));
router.put('/risk-control/settings', (req, res) => riskControlController.updateRiskSettings(req, res));
router.get('/risk-control/statistics', (req, res) => riskControlController.getRiskStatistics(req, res));
router.get('/risk-control/events', (req, res) => riskControlController.getRiskEvents(req, res));
router.post('/risk-control/analyze', (req, res) => riskControlController.analyzeGames(req, res));
router.post('/risk-control/reset', (req, res) => riskControlController.resetRiskTracking(req, res));
router.get('/risk-control/payout-limits', (req, res) => riskControlController.getPayoutLimits(req, res));
router.get('/risk-control/game-history/:gameType', (req, res) => riskControlController.getGameHistoryWithRisk(req, res));
router.put('/risk-control/events/:eventId/review', (req, res) => riskControlController.reviewRiskEvent(req, res));
router.get('/risk-control/event-stats', (req, res) => riskControlController.getRiskEventStats(req, res));

// ====================================================================
// ADMIN NOTIFICATION ROUTES
// Admin-specific notification system for alerts and platform events
// ====================================================================
router.get('/notifications/admin', (req, res) => adminNotificationController.getAdminNotifications(req, res));
router.get('/notifications/admin/counts', (req, res) => adminNotificationController.getAdminNotificationCounts(req, res));
router.put('/notifications/admin/:notificationId/read', (req, res) => adminNotificationController.markNotificationAsRead(req, res));
router.post('/notifications/admin/read-all', (req, res) => adminNotificationController.markAllNotificationsAsRead(req, res));
router.delete('/notifications/admin/:notificationId', (req, res) => adminNotificationController.deleteAdminNotification(req, res));
router.post('/notifications/admin/send', (req, res) => adminNotificationController.sendCustomAdminNotification(req, res));
router.post('/notifications/admin/test', (req, res) => adminNotificationController.sendTestNotification(req, res));

// ====================================================================
// TRADING ADMIN ROUTES
// Admin-specific trading management and monitoring
// ====================================================================
router.get('/trading/bets', (req, res) => getAllTradingBets(req, res));
router.get('/trading/stats', (req, res) => getTradingAdminStats(req, res));

export default router;
