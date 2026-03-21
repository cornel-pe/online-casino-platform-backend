import notificationEngine from '../engine/notificationEngine';
import { NotificationPriority } from '../types/notification';

/**
 * Centralized notification utility for clean, consistent notification handling
 * across the entire application
 */
class NotificationUtils {
  /**
   * Send a simple notification to a specific user
   */
  static sendToUser(
    userId: string,
    title: string,
    message: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    data?: any,
    expiresInHours: number = 168 // 7 days default
  ): void {
    const priorityMap = {
      low: NotificationPriority.LOW,
      normal: NotificationPriority.NORMAL,
      high: NotificationPriority.HIGH,
      urgent: NotificationPriority.URGENT
    };

    notificationEngine.sendCustomNotification(
      userId,
      title,
      message,
      priorityMap[priority],
      data,
      expiresInHours
    );

    console.log(`📧 Notification sent to user ${userId}: "${title}"`);
  }

  /**
   * Broadcast notification to all users
   */
  static broadcast(
    title: string,
    message: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    data?: any,
    targetUsers?: string[],
    expiresInHours: number = 168 // 7 days default
  ): void {
    const priorityMap = {
      low: NotificationPriority.LOW,
      normal: NotificationPriority.NORMAL,
      high: NotificationPriority.HIGH,
      urgent: NotificationPriority.URGENT
    };

    notificationEngine.broadcastCustomNotification(
      title,
      message,
      priorityMap[priority],
      data,
      targetUsers,
      expiresInHours
    );

    console.log(`📢 Broadcast notification sent: "${title}"`);
  }

  /**
   * Send admin notification (either to specific users or broadcast)
   */
  static sendAdminNotification(
    title: string,
    message: string,
    adminId: string,
    target: 'all' | 'specific',
    targetUsers?: string[],
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    expiresInHours: number = 168
  ): void {
    const priorityMap = {
      low: NotificationPriority.LOW,
      normal: NotificationPriority.NORMAL,
      high: NotificationPriority.HIGH,
      urgent: NotificationPriority.URGENT
    };

    const data = {
      target,
      timestamp: new Date().toISOString()
    };

    if (target === 'all') {
      // Use broadcast with sentBy
      const notificationService = require('../services/notificationService').default;
      notificationService.broadcastNotification({
        type: require('../types/notification').NotificationType.CUSTOM,
        title,
        message,
        data,
        sentBy: adminId,
        priority: priorityMap[priority],
        targetUsers,
        expiresInHours
      });
      console.log(`📢 Admin broadcast notification sent: "${title}"`);
    } else if (target === 'specific' && targetUsers && targetUsers.length > 0) {
      const notificationService = require('../services/notificationService').default;
      for (const userId of targetUsers) {
        notificationService.queueNotification({
          userId,
          sentBy: adminId,
          type: require('../types/notification').NotificationType.CUSTOM,
          title,
          message,
          data,
          priority: priorityMap[priority],
          expiresInHours
        });
      }
      console.log(`📧 Admin notification sent to ${targetUsers.length} users: "${title}"`);
    } else {
      throw new Error('Invalid target or missing targetUsers for specific target');
    }
  }

  /**
   * Send welcome notification to new user
   */
  static sendWelcome(userId: string): void {
    notificationEngine.sendWelcomeNotification(userId);
    console.log(`🎉 Welcome notification sent to user ${userId}`);
  }

  /**
   * Send level up notification
   */
  static sendLevelUp(userId: string, newLevel: number, rewards?: any): void {
    notificationEngine.sendLevelUpNotification(userId, newLevel, rewards);
    console.log(`🎖️ Level up notification sent to user ${userId} (Level ${newLevel})`);
  }

  /**
   * Send deposit success notification
   */
  static sendDepositSuccess(userId: string, amount: number, currency: string = 'USD'): void {
    notificationEngine.sendDepositSuccessNotification(userId, amount, currency);
    console.log(`💰 Deposit success notification sent to user ${userId} (${amount} ${currency})`);
  }

  /**
   * Send deposit failed notification
   */
  static sendDepositFailed(userId: string, amount: number, currency: string = 'USD', reason?: string): void {
    notificationEngine.sendDepositFailedNotification(userId, amount, currency, reason);
    console.log(`❌ Deposit failed notification sent to user ${userId} (${amount} ${currency})`);
  }

  /**
   * Send withdrawal success notification
   */
  static sendWithdrawalSuccess(userId: string, amount: number, currency: string = 'USD'): void {
    notificationEngine.sendWithdrawalSuccessNotification(userId, amount, currency);
    console.log(`✅ Withdrawal success notification sent to user ${userId} (${amount} ${currency})`);
  }

  /**
   * Send withdrawal failed notification
   */
  static sendWithdrawalFailed(userId: string, amount: number, currency: string = 'USD', reason?: string): void {
    notificationEngine.sendWithdrawalFailedNotification(userId, amount, currency, reason);
    console.log(`❌ Withdrawal failed notification sent to user ${userId} (${amount} ${currency})`);
  }

  /**
   * Send withdrawal pending notification
   */
  static sendWithdrawalPending(userId: string, amount: number, currency: string = 'USD'): void {
    notificationEngine.sendWithdrawalPendingNotification(userId, amount, currency);
    console.log(`⏳ Withdrawal pending notification sent to user ${userId} (${amount} ${currency})`);
  }

  /**
   * Send big win notification
   */
  static sendBigWin(userId: string, amount: number, currency: string = 'USD', gameType?: string): void {
    notificationEngine.sendBigWinNotification(userId, amount, currency, gameType);
    console.log(`🎊 Big win notification sent to user ${userId} (${amount} ${currency} in ${gameType})`);
  }

  /**
   * Send jackpot win notification
   */
  static sendJackpotWin(userId: string, amount: number, currency: string = 'USD', gameType?: string): void {
    notificationEngine.sendJackpotWinNotification(userId, amount, currency, gameType);
    console.log(`🎰 JACKPOT WIN notification sent to user ${userId} (${amount} ${currency} in ${gameType})`);
  }

  /**
   * Send security alert notification
   */
  static sendSecurityAlert(userId: string, alertType: string, details?: any): void {
    notificationEngine.sendSecurityAlertNotification(userId, alertType, details);
    console.log(`🚨 Security alert notification sent to user ${userId} (${alertType})`);
  }

  /**
   * Send system maintenance notification (broadcast)
   */
  static sendSystemMaintenance(message?: string, scheduledFor?: Date): void {
    notificationEngine.sendSystemMaintenanceNotification(message, scheduledFor);
    console.log(`🔧 System maintenance notification broadcast: "${message || 'System maintenance scheduled'}"`);
  }

  /**
   * Send system update notification (broadcast)
   */
  static sendSystemUpdate(message?: string): void {
    notificationEngine.sendSystemUpdateNotification(message);
    console.log(`🔄 System update notification broadcast: "${message || 'System update available'}"`);
  }

  /**
   * Send game disabled notification (broadcast)
   */
  static sendGameDisabled(gameName: string, reason?: string): void {
    notificationEngine.sendGameDisabledNotification(gameName, reason);
    console.log(`🚫 Game disabled notification broadcast: ${gameName} (${reason || 'Maintenance'})`);
  }

  /**
   * Send game enabled notification (broadcast)
   */
  static sendGameEnabled(gameName: string): void {
    notificationEngine.sendGameEnabledNotification(gameName);
    console.log(`✅ Game enabled notification broadcast: ${gameName}`);
  }

  /**
   * Send account frozen notification
   */
  static sendAccountFrozen(userId: string, reason?: string): void {
    notificationEngine.sendAccountFrozenNotification(userId, reason);
    console.log(`🧊 Account frozen notification sent to user ${userId} (${reason || 'No reason provided'})`);
  }

  /**
   * Send account unfrozen notification
   */
  static sendAccountUnfrozen(userId: string): void {
    notificationEngine.sendAccountUnfrozenNotification(userId);
    console.log(`🔥 Account unfrozen notification sent to user ${userId}`);
  }
}

export default NotificationUtils;
