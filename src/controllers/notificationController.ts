import { Request, Response } from 'express';
import notificationService from '../services/notificationService';
import notificationEngine from '../engine/notificationEngine';
import { NotificationType, NotificationPriority } from '../types/notification';
import { getParam } from '../utils/requestParams';

interface AuthRequest extends Request {
  user?: {
    _id: string;
    username: string;
    isAdmin?: boolean;
  };
}

class NotificationController {
  /**
   * Get user notifications
   */
  async getUserNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        unreadOnly = false
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const { notifications, total } = await notificationService.getUserNotifications(
        userId,
        limitNum,
        skip,
        unreadOnly === 'true'
      );

      const totalPages = Math.ceil(total / limitNum);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages
          }
        }
      });
    } catch (error) {
      console.error('Error getting user notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const notificationId = getParam(req, 'notificationId');
      if (!notificationId) {
        res.status(400).json({ error: 'Notification ID required' });
        return;
      }
      const success = await notificationService.markAsRead(notificationId, userId);

      if (success) {
        res.json({
          success: true,
          message: 'Notification marked as read'
        });
      } else {
        res.status(404).json({ error: 'Notification not found' });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const updatedCount = await notificationService.markAllAsRead(userId);

      res.json({
        success: true,
        message: `${updatedCount} notifications marked as read`
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const stats = await notificationService.getNotificationStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting notification stats:', error);
      res.status(500).json({ error: 'Failed to fetch notification statistics' });
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const notificationId = getParam(req, 'notificationId');
      if (!notificationId) {
        res.status(400).json({ error: 'Notification ID required' });
        return;
      }
      const success = await notificationService.deleteNotification(notificationId, userId);

      if (success) {
        res.json({
          success: true,
          message: 'Notification deleted successfully'
        });
      } else {
        res.status(404).json({ error: 'Notification not found' });
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  }

  /**
   * Send custom notification (Admin only)
   */
  async sendCustomNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin privileges required' });
        return;
      }

      const {
        userId,
        title,
        message,
        priority = NotificationPriority.NORMAL,
        data,
        expiresInHours
      } = req.body;

      if (!title || !message) {
        res.status(400).json({ error: 'Title and message are required' });
        return;
      }

      notificationEngine.sendCustomNotification(
        userId || null,
        title,
        message,
        priority,
        data,
        expiresInHours
      );

      res.json({
        success: true,
        message: 'Custom notification queued successfully'
      });
    } catch (error) {
      console.error('Error sending custom notification:', error);
      res.status(500).json({ error: 'Failed to send custom notification' });
    }
  }

  /**
   * Broadcast notification (Admin only)
   */
  async broadcastNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin privileges required' });
        return;
      }

      const {
        title,
        message,
        priority = NotificationPriority.NORMAL,
        data,
        targetUsers,
        expiresInHours
      } = req.body;

      if (!title || !message) {
        res.status(400).json({ error: 'Title and message are required' });
        return;
      }

      notificationEngine.broadcastCustomNotification(
        title,
        message,
        priority,
        data,
        targetUsers,
        expiresInHours
      );

      res.json({
        success: true,
        message: 'Broadcast notification queued successfully'
      });
    } catch (error) {
      console.error('Error broadcasting notification:', error);
      res.status(500).json({ error: 'Failed to broadcast notification' });
    }
  }

  /**
   * Send template notification (Admin only)
   */
  async sendTemplateNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin privileges required' });
        return;
      }

      const {
        userId,
        templateName,
        data,
        expiresInHours
      } = req.body;

      if (!templateName) {
        res.status(400).json({ error: 'Template name is required' });
        return;
      }

      const template = notificationEngine.getTemplate(templateName);
      if (!template) {
        res.status(400).json({ error: 'Template not found' });
        return;
      }

      notificationService.sendTemplateNotification(
        userId || null,
        template,
        data,
        expiresInHours
      );

      res.json({
        success: true,
        message: `Template notification "${templateName}" queued successfully`
      });
    } catch (error) {
      console.error('Error sending template notification:', error);
      res.status(500).json({ error: 'Failed to send template notification' });
    }
  }

  /**
   * Get available templates (Admin only)
   */
  async getTemplates(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin privileges required' });
        return;
      }

      const templatesObject = notificationEngine.getAllTemplates();

      // Convert template object to array format for UI
      const templatesArray = Object.entries(templatesObject).map(([key, template]: [string, any]) => ({
        _id: key,
        name: key,
        type: template.type,
        title: template.title,
        message: template.message,
        priority: template.priority,
        expiresInHours: template.expiresInHours,
        createdAt: new Date().toISOString()
      }));

      res.json({
        success: true,
        data: templatesArray
      });
    } catch (error) {
      console.error('Error getting templates:', error);
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  /**
   * Get notification service status (Admin only)
   */
  async getServiceStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin privileges required' });
        return;
      }

      const queueStatus = notificationService.getQueueStatus();

      res.json({
        success: true,
        data: {
          queueStatus,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting service status:', error);
      res.status(500).json({ error: 'Failed to fetch service status' });
    }
  }

  /**
   * Cleanup expired notifications (Admin only)
   */
  async cleanupExpiredNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin privileges required' });
        return;
      }

      const cleanedCount = await notificationService.cleanupExpiredNotifications();

      res.json({
        success: true,
        message: `${cleanedCount} expired notifications cleaned up`
      });
    } catch (error) {
      console.error('Error cleaning up expired notifications:', error);
      res.status(500).json({ error: 'Failed to cleanup expired notifications' });
    }
  }

  /**
   * Test notification (Admin only)
   */
  async testNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin privileges required' });
        return;
      }

      const { type = 'custom' } = req.body;

      // Send a test notification to the admin user
      notificationEngine.sendCustomNotification(
        req.user._id,
        'Test Notification',
        'This is a test notification from the admin panel.',
        NotificationPriority.NORMAL,
        { test: true, timestamp: new Date().toISOString() }
      );

      res.json({
        success: true,
        message: 'Test notification sent successfully'
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  }
}

export default new NotificationController();
