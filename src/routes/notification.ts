import express from 'express';
import notificationController from '../controllers/notificationController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = express.Router();

// User notification routes (require authentication)
router.get('/user/notifications', authenticateLocalToken, notificationController.getUserNotifications.bind(notificationController));
router.get('/user/stats', authenticateLocalToken, notificationController.getNotificationStats.bind(notificationController));
router.put('/user/notifications/:notificationId/read', authenticateLocalToken, notificationController.markAsRead.bind(notificationController));
router.put('/user/notifications/read-all', authenticateLocalToken, notificationController.markAllAsRead.bind(notificationController));
router.delete('/user/notifications/:notificationId', authenticateLocalToken, notificationController.deleteNotification.bind(notificationController));

// Admin notification routes (require admin authentication)
router.post('/admin/send-custom', authenticateLocalToken, notificationController.sendCustomNotification.bind(notificationController));
router.post('/admin/broadcast', authenticateLocalToken, notificationController.broadcastNotification.bind(notificationController));
router.post('/admin/send-template', authenticateLocalToken, notificationController.sendTemplateNotification.bind(notificationController));
router.get('/admin/templates', authenticateLocalToken, notificationController.getTemplates.bind(notificationController));
router.get('/admin/service-status', authenticateLocalToken, notificationController.getServiceStatus.bind(notificationController));
router.post('/admin/cleanup', authenticateLocalToken, notificationController.cleanupExpiredNotifications.bind(notificationController));
router.post('/admin/test', authenticateLocalToken, notificationController.testNotification.bind(notificationController));

export default router;
