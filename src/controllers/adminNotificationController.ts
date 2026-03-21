/**
 * Admin Notification Controller
 * 
 * Handles admin-specific notifications including risk alerts and system notifications
 */

import { Request, Response } from 'express';
import adminNotificationService from '../services/adminNotificationService';
import Notification from '../models/Notification';
import { getParam } from '../utils/requestParams';

/**
 * Get admin notifications with filters
 * GET /api/admin/notifications
 */
export const getAdminNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;
    const priority = req.query.priority as string;
    const type = req.query.type as string;
    const actionRequired = req.query.actionRequired === 'true';
    const unreadOnly = req.query.unreadOnly === 'true';

    const notifications = await adminNotificationService.getAdminNotifications({
      limit,
      skip,
      priority,
      type,
      actionRequired,
      unreadOnly
    });

    const totalCount = await Notification.countDocuments({
      isAdminOnly: true,
      ...(priority && { priority }),
      ...(type && { type }),
      ...(actionRequired !== undefined && { actionRequired }),
      ...(unreadOnly && { status: { $ne: 'read' } })
    });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          total: totalCount,
          limit,
          skip,
          hasMore: skip + notifications.length < totalCount
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error getting admin notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get admin notifications'
    });
  }
};

/**
 * Get admin notification counts
 * GET /api/admin/notifications/counts
 */
export const getAdminNotificationCounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const counts = await adminNotificationService.getAdminNotificationCounts();

    res.json({
      success: true,
      data: counts
    });
  } catch (error: any) {
    console.error('❌ Error getting notification counts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get notification counts'
    });
  }
};

/**
 * Mark notification as read
 * PUT /api/admin/notifications/:notificationId/read
 */
export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const notificationId = getParam(req, 'notificationId');
    const adminId = (req as any).user?._id;
    if (!notificationId) {
      res.status(400).json({ success: false, error: 'Notification ID required' });
      return;
    }
    const result = await adminNotificationService.markAsRead(notificationId, adminId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Notification not found or unauthorized'
      });
    }
  } catch (error: any) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark notification as read'
    });
  }
};

/**
 * Mark all notifications as read
 * POST /api/admin/notifications/read-all
 */
export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user?._id;

    const result = await adminNotificationService.markAllAsRead(adminId);

    res.json({
      success: true,
      message: `${result.count || 0} notifications marked as read`
    });
  } catch (error: any) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark notifications as read'
    });
  }
};

/**
 * Delete admin notification
 * DELETE /api/admin/notifications/:notificationId
 */
export const deleteAdminNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const notificationId = getParam(req, 'notificationId');
    if (!notificationId) {
      res.status(400).json({ success: false, error: 'Notification ID required' });
      return;
    }
    const result = await adminNotificationService.deleteNotification(notificationId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Notification deleted'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
  } catch (error: any) {
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete notification'
    });
  }
};

/**
 * Send custom admin notification
 * POST /api/admin/notifications/send
 */
export const sendCustomAdminNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, message, priority, severity, gameType, gameId, data } = req.body;

    if (!title || !message) {
      res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
      return;
    }

    const result = await adminNotificationService.sendSystemAlert({
      type: 'custom',
      title,
      message,
      severity: severity || 'medium',
      gameType,
      gameId,
      data
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Notification sent to all admins'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send notification'
      });
    }
  } catch (error: any) {
    console.error('❌ Error sending custom notification:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send notification'
    });
  }
};

/**
 * Send test admin notification (for testing the notification system)
 * POST /api/admin/notifications/test
 */
export const sendTestNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    // Send a test risk alert
    await adminNotificationService.sendRiskAlert({
      eventType: 'high_payout',
      severity: 'high',
      gameType: 'crash',
      gameId: 'test-game-123',
      riskEventId: 'test-event-123',
      details: {
        payout: 8500,
        multiplier: 45,
        treasuryBalance: 50000
      },
      actionTaken: 'This is a test notification'
    });

    // Also send a system alert
    await adminNotificationService.sendSystemAlert({
      type: 'custom',
      title: '🧪 Test Admin Notification',
      message: 'This is a test notification to verify the admin notification system is working properly. You should see this in your notification bell and on the notifications page.',
      severity: 'medium',
      data: { test: true, timestamp: new Date().toISOString() }
    });

    res.json({
      success: true,
      message: 'Test notifications sent successfully. Check your notification bell!'
    });

  } catch (error: any) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send test notification'
    });
  }
};

