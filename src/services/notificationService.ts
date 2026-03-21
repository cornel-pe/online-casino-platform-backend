import mongoose from 'mongoose';
import { getIO } from '../websocket';
import Notification, { INotificationDocument } from '../models/Notification';
import { 
  INotification, 
  NotificationType, 
  NotificationPriority, 
  NotificationStatus,
  NotificationJob,
  NotificationBroadcast,
  NotificationTemplate
} from '../types/notification';
import User from '../models/User';

class NotificationService {
  private static instance: NotificationService;
  private jobQueue: NotificationJob[] = [];
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startJobProcessor();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Start the background job processor
   */
  private startJobProcessor(): void {
    if (this.processingInterval) return;

    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing && this.jobQueue.length > 0) {
        await this.processJobQueue();
      }
    }, 1000); // Process every second
  }

  /**
   * Stop the background job processor
   */
  public stopJobProcessor(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Process the job queue asynchronously
   */
  private async processJobQueue(): Promise<void> {
    this.isProcessing = true;

    try {
      const jobs = this.jobQueue.splice(0, 10); // Process up to 10 jobs at a time
      
      await Promise.allSettled(
        jobs.map(job => this.processJob(job))
      );
    } catch (error) {
      console.error('Error processing notification job queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single notification job
   */
  private async processJob(job: NotificationJob): Promise<void> {
    try {
      // Check if job should be scheduled for later
      if (job.scheduledFor && job.scheduledFor > new Date()) {
        // Re-queue the job
        this.jobQueue.push(job);
        return;
      }

      // Create notification in database
      const notification = await this.createNotification({
        userId: job.userId,
        sentBy: job.sentBy,
        type: job.type,
        title: job.title,
        message: job.message,
        data: job.data,
        priority: job.priority,
        status: NotificationStatus.PENDING
      }, job.expiresInHours);

      // Send via WebSocket
      await this.sendNotification(notification);

      console.log(`✅ Notification sent: ${job.type} to ${job.userId || 'all users'}`);
    } catch (error) {
      console.error(`❌ Failed to process notification job ${job.id}:`, error);
      
      // Retry logic
      if (job.retryCount === undefined) job.retryCount = 0;
      if (job.maxRetries === undefined) job.maxRetries = 3;
      
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        // Re-queue with exponential backoff
        setTimeout(() => {
          this.jobQueue.push(job);
        }, Math.pow(2, job.retryCount) * 1000);
      }
    }
  }

  /**
   * Create a notification in the database
   */
  public async createNotification(
    notificationData: Partial<INotification>,
    expiresInHours?: number
  ): Promise<INotificationDocument> {
    const notification = new Notification(notificationData);
    
    if (expiresInHours) {
      notification.expiresAt = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));
    }
    
    return await notification.save();
  }

  /**
   * Send notification via WebSocket (non-blocking)
   */
  public async sendNotification(notification: INotificationDocument): Promise<void> {
    try {
      const io = getIO();
      if (!io) {
        console.warn('WebSocket not available for notification');
        return;
      }

      const notificationData = {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        priority: notification.priority,
        createdAt: notification.createdAt,
        expiresAt: notification.expiresAt
      };

      if (notification.userId) {
        // Send to specific user
        io.to(notification.userId.toString()).emit('notification', notificationData);
      } else {
        // Broadcast to all users
        io.emit('notification', notificationData);
      }

      // Mark as sent
      await notification.markAsDelivered();
    } catch (error) {
      console.error('Error sending notification via WebSocket:', error);
      await notification.markAsFailed();
      throw error;
    }
  }

  /**
   * Queue a notification job (non-blocking)
   */
  public queueNotification(job: Omit<NotificationJob, 'id'>): void {
    const notificationJob: NotificationJob = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...job
    };

    this.jobQueue.push(notificationJob);
    console.log(`📝 Notification queued: ${job.type} for ${job.userId || 'all users'}`);
  }

  /**
   * Send notification immediately (blocking - use sparingly)
   */
  public async sendNotificationImmediate(
    userId: string | null,
    type: NotificationType,
    title: string,
    message: string,
    data?: any,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    expiresInHours?: number
  ): Promise<INotificationDocument> {
    const notification = await this.createNotification({
      userId,
      type,
      title,
      message,
      data,
      priority,
      status: NotificationStatus.PENDING
    }, expiresInHours);

    await this.sendNotification(notification);
    return notification;
  }

  /**
   * Broadcast notification to multiple users or all users
   */
  public broadcastNotification(broadcast: NotificationBroadcast): void {
    const job: Omit<NotificationJob, 'id'> = {
      userId: undefined, // Will be handled in processJob
      sentBy: broadcast.sentBy,
      type: broadcast.type,
      title: broadcast.title,
      message: broadcast.message,
      data: broadcast.data,
      priority: broadcast.priority,
      expiresInHours: broadcast.expiresInHours
    };

    // If specific users are targeted, create individual jobs
    if (broadcast.targetUsers && broadcast.targetUsers.length > 0) {
      broadcast.targetUsers.forEach(userId => {
        this.queueNotification({
          ...job,
          userId
        });
      });
    } else {
      // Broadcast to all users
      this.queueNotification(job);
    }
  }

  /**
   * Send notification using template
   */
  public sendTemplateNotification(
    userId: string | null,
    template: NotificationTemplate,
    data?: any,
    expiresInHours?: number
  ): void {
    this.queueNotification({
      userId,
      type: template.type,
      title: template.title,
      message: template.message,
      data,
      priority: template.priority,
      expiresInHours: expiresInHours || template.expiresInHours
    });
  }

  /**
   * Get user notifications
   */
  public async getUserNotifications(
    userId: string,
    limit: number = 50,
    skip: number = 0,
    unreadOnly: boolean = false
  ): Promise<{ notifications: mongoose.LeanDocument<INotificationDocument>[]; total: number }> {
    const query: any = {
      $or: [
        { userId: userId },
        { userId: null } // System-wide notifications
      ]
    };

    if (unreadOnly) {
      query.status = { $ne: NotificationStatus.READ };
    }

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Notification.countDocuments(query)
    ]);

    return { notifications, total };
  }

  /**
   * Mark notification as read
   */
  public async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const notification = await Notification.findOne({
      _id: notificationId,
      $or: [
        { userId: userId },
        { userId: null }
      ]
    });

    if (notification) {
      await notification.markAsRead();
      return true;
    }
    return false;
  }

  /**
   * Mark all user notifications as read
   */
  public async markAllAsRead(userId: string): Promise<number> {
    const result = await Notification.updateMany(
      {
        userId: { $in: [userId, null] },
        status: { $ne: NotificationStatus.READ }
      },
      {
        status: NotificationStatus.READ,
        readAt: new Date()
      }
    );

    return result.modifiedCount;
  }

  /**
   * Delete a notification
   */
  public async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    const result = await Notification.deleteOne({
      _id: notificationId,
      userId: userId // Only allow deleting personal notifications, not system-wide ones
    });

    return result.deletedCount > 0;
  }

  /**
   * Get notification statistics
   */
  public async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    const query = {
      $or: [
        { userId: userId },
        { userId: null }
      ]
    };

    const [total, unread, byType, byPriority] = await Promise.all([
      Notification.countDocuments(query),
      Notification.countDocuments({ ...query, status: { $ne: NotificationStatus.READ } }),
      Notification.aggregate([
        { $match: query },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Notification.aggregate([
        { $match: query },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ])
    ]);

    return {
      total,
      unread,
      byType: byType.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
      byPriority: byPriority.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {})
    };
  }

  /**
   * Clean up expired notifications
   */
  public async cleanupExpiredNotifications(): Promise<number> {
    const result = await Notification.updateMany(
      {
        expiresAt: { $lt: new Date() },
        status: { $ne: NotificationStatus.EXPIRED }
      },
      {
        status: NotificationStatus.EXPIRED
      }
    );

    return result.modifiedCount;
  }

  /**
   * Get job queue status
   */
  public getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.jobQueue.length,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Get admin notification history (notifications sent by admins)
   */
  public async getAdminNotificationHistory(
    adminId?: string,
    limit: number = 50,
    skip: number = 0,
    type?: string,
    status?: string
  ): Promise<{ notifications: any[], total: number }> {
    const query: any = {
      sentBy: { $exists: true, $ne: null }
    };

    // Filter by specific admin if provided
    if (adminId) {
      query.sentBy = adminId;
    }

    // Filter by type if provided
    if (type) {
      query.type = type;
    }

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .populate('sentBy', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Notification.countDocuments(query)
    ]);

    // Group notifications by unique combinations of title, message, and sentBy
    // This helps identify broadcast notifications
    const groupedNotifications = new Map();
    
    notifications.forEach((notif: any) => {
      const key = `${notif.title}_${notif.message}_${notif.sentBy?._id || 'system'}`;
      if (!groupedNotifications.has(key)) {
        groupedNotifications.set(key, {
          _id: notif._id,
          id: notif._id,
          title: notif.title,
          message: notif.message,
          type: notif.type,
          priority: notif.priority,
          status: notif.status,
          target: notif.userId ? 'specific' : 'all',
          targetUsers: notif.userId ? [notif.userId] : undefined,
          sentAt: notif.createdAt,
          createdAt: notif.createdAt,
          createdBy: notif.sentBy ? {
            id: notif.sentBy._id,
            username: notif.sentBy.username,
            avatar: notif.sentBy.avatar
          } : null
        });
      }
    });

    const uniqueNotifications = Array.from(groupedNotifications.values());

    return { 
      notifications: uniqueNotifications,
      total: uniqueNotifications.length
    };
  }
}

export default NotificationService.getInstance();
