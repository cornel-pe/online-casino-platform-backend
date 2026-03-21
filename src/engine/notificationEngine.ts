import notificationService from '../services/notificationService';
import { 
  NotificationType, 
  NotificationPriority, 
  NotificationTemplate,
  NotificationBroadcast
} from '../types/notification';

class NotificationEngine {
  private static instance: NotificationEngine;

  private constructor() {}

  public static getInstance(): NotificationEngine {
    if (!NotificationEngine.instance) {
      NotificationEngine.instance = new NotificationEngine();
    }
    return NotificationEngine.instance;
  }

  /**
   * Predefined notification templates
   */
  private templates: Record<string, NotificationTemplate> = {
    // Welcome & Account
    welcome: {
      type: NotificationType.WELCOME,
      title: 'Welcome to SpinX!',
      message: 'Welcome to SpinX! Your account has been created successfully. Start playing and win big!',
      priority: NotificationPriority.HIGH,
      expiresInHours: 24
    },
    account_verified: {
      type: NotificationType.ACCOUNT_VERIFIED,
      title: 'Account Verified',
      message: 'Your account has been successfully verified. You now have access to all features!',
      priority: NotificationPriority.HIGH,
      expiresInHours: 48
    },
    password_updated: {
      type: NotificationType.PASSWORD_UPDATED,
      title: 'Password Updated',
      message: 'Your password has been successfully updated. If you did not make this change, please contact support immediately.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 24
    },
    account_frozen: {
      type: NotificationType.ACCOUNT_FROZEN,
      title: 'Account Frozen',
      message: 'Your account has been temporarily frozen. Please contact support for assistance.',
      priority: NotificationPriority.URGENT,
      expiresInHours: 168 // 7 days
    },
    account_unfrozen: {
      type: NotificationType.ACCOUNT_UNFROZEN,
      title: 'Account Restored',
      message: 'Your account has been restored and is now active. Welcome back!',
      priority: NotificationPriority.HIGH,
      expiresInHours: 24
    },

    // Financial
    deposit_success: {
      type: NotificationType.DEPOSIT_SUCCESS,
      title: 'Deposit Successful',
      message: 'Your deposit has been processed successfully. Your balance has been updated.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 72
    },
    deposit_failed: {
      type: NotificationType.DEPOSIT_FAILED,
      title: 'Deposit Failed',
      message: 'Your deposit could not be processed. Please try again or contact support.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 24
    },
    withdrawal_success: {
      type: NotificationType.WITHDRAWAL_SUCCESS,
      title: 'Withdrawal Successful',
      message: 'Your withdrawal has been processed successfully. Funds should arrive shortly.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 72
    },
    withdrawal_failed: {
      type: NotificationType.WITHDRAWAL_FAILED,
      title: 'Withdrawal Failed',
      message: 'Your withdrawal could not be processed. Please check your details and try again.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 24
    },
    withdrawal_pending: {
      type: NotificationType.WITHDRAWAL_PENDING,
      title: 'Withdrawal Pending',
      message: 'Your withdrawal is being processed. You will be notified once it\'s completed.',
      priority: NotificationPriority.NORMAL,
      expiresInHours: 48
    },

    // Game & Achievement
    level_up: {
      type: NotificationType.LEVEL_UP,
      title: 'Level Up!',
      message: 'Congratulations! You\'ve reached a new level. Keep playing to unlock more rewards!',
      priority: NotificationPriority.HIGH,
      expiresInHours: 48
    },
    achievement_unlocked: {
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: 'Achievement Unlocked!',
      message: 'You\'ve unlocked a new achievement! Check your profile to see your rewards.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 72
    },
    big_win: {
      type: NotificationType.BIG_WIN,
      title: 'Big Win!',
      message: 'Congratulations on your big win! Your balance has been updated.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 24
    },
    jackpot_win: {
      type: NotificationType.JACKPOT_WIN,
      title: 'JACKPOT WIN!',
      message: '🎉 CONGRATULATIONS! You\'ve won the JACKPOT! 🎉',
      priority: NotificationPriority.URGENT,
      expiresInHours: 168 // 7 days
    },

    // System
    system_maintenance: {
      type: NotificationType.SYSTEM_MAINTENANCE,
      title: 'System Maintenance',
      message: 'The system will be under maintenance. Some features may be temporarily unavailable.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 12
    },
    system_update: {
      type: NotificationType.SYSTEM_UPDATE,
      title: 'System Update',
      message: 'A new system update is available. Please refresh your browser to get the latest features.',
      priority: NotificationPriority.NORMAL,
      expiresInHours: 24
    },
    security_alert: {
      type: NotificationType.SECURITY_ALERT,
      title: 'Security Alert',
      message: 'We detected unusual activity on your account. Please verify your account security.',
      priority: NotificationPriority.URGENT,
      expiresInHours: 24
    },

    // Admin
    admin_message: {
      type: NotificationType.ADMIN_MESSAGE,
      title: 'Message from Admin',
      message: 'You have received a message from the administration team.',
      priority: NotificationPriority.HIGH,
      expiresInHours: 168 // 7 days
    },
    game_disabled: {
      type: NotificationType.GAME_DISABLED,
      title: 'Game Temporarily Disabled',
      message: 'This game is temporarily disabled for maintenance. Please try again later.',
      priority: NotificationPriority.NORMAL,
      expiresInHours: 12
    },
    game_enabled: {
      type: NotificationType.GAME_ENABLED,
      title: 'Game Available',
      message: 'This game is now available for play. Enjoy!',
      priority: NotificationPriority.NORMAL,
      expiresInHours: 24
    }
  };

  /**
   * Send welcome notification to new user
   */
  public sendWelcomeNotification(userId: string): void {
    notificationService.sendTemplateNotification(
      userId,
      this.templates.welcome,
      { timestamp: new Date().toISOString() }
    );
  }

  /**
   * Send account verification notification
   */
  public sendAccountVerifiedNotification(userId: string): void {
    notificationService.sendTemplateNotification(
      userId,
      this.templates.account_verified,
      { timestamp: new Date().toISOString() }
    );
  }

  /**
   * Send password updated notification
   */
  public sendPasswordUpdatedNotification(userId: string, ipAddress?: string): void {
    notificationService.sendTemplateNotification(
      userId,
      this.templates.password_updated,
      { 
        timestamp: new Date().toISOString(),
        ipAddress: ipAddress || 'Unknown'
      }
    );
  }

  /**
   * Send account frozen notification
   */
  public sendAccountFrozenNotification(userId: string, reason?: string): void {
    const template = { ...this.templates.account_frozen };
    if (reason) {
      template.message += ` Reason: ${reason}`;
    }
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        timestamp: new Date().toISOString(),
        reason: reason || 'Not specified'
      }
    );
  }

  /**
   * Send account unfrozen notification
   */
  public sendAccountUnfrozenNotification(userId: string): void {
    notificationService.sendTemplateNotification(
      userId,
      this.templates.account_unfrozen,
      { timestamp: new Date().toISOString() }
    );
  }

  /**
   * Send deposit success notification
   */
  public sendDepositSuccessNotification(userId: string, amount: number, currency: string = 'USD'): void {
    const template = { ...this.templates.deposit_success };
    template.message = `Your deposit of ${amount} ${currency} has been processed successfully. Your balance has been updated.`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        amount,
        currency,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send deposit failed notification
   */
  public sendDepositFailedNotification(userId: string, amount: number, currency: string = 'USD', reason?: string): void {
    const template = { ...this.templates.deposit_failed };
    if (reason) {
      template.message += ` Reason: ${reason}`;
    }
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        amount,
        currency,
        reason: reason || 'Unknown error',
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send withdrawal success notification
   */
  public sendWithdrawalSuccessNotification(userId: string, amount: number, currency: string = 'USD'): void {
    const template = { ...this.templates.withdrawal_success };
    template.message = `Your withdrawal of ${amount} ${currency} has been processed successfully. Funds should arrive shortly.`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        amount,
        currency,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send withdrawal failed notification
   */
  public sendWithdrawalFailedNotification(userId: string, amount: number, currency: string = 'USD', reason?: string): void {
    const template = { ...this.templates.withdrawal_failed };
    if (reason) {
      template.message += ` Reason: ${reason}`;
    }
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        amount,
        currency,
        reason: reason || 'Unknown error',
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send withdrawal pending notification
   */
  public sendWithdrawalPendingNotification(userId: string, amount: number, currency: string = 'USD'): void {
    const template = { ...this.templates.withdrawal_pending };
    template.message = `Your withdrawal of ${amount} ${currency} is being processed. You will be notified once it's completed.`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        amount,
        currency,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send level up notification
   */
  public sendLevelUpNotification(userId: string, newLevel: number, rewards?: any): void {
    const template = { ...this.templates.level_up };
    template.message = `Congratulations! You've reached level ${newLevel}. Keep playing to unlock more rewards!`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        newLevel,
        rewards,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send achievement unlocked notification
   */
  public sendAchievementUnlockedNotification(userId: string, achievementName: string, rewards?: any): void {
    const template = { ...this.templates.achievement_unlocked };
    template.message = `You've unlocked the "${achievementName}" achievement! Check your profile to see your rewards.`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        achievementName,
        rewards,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send big win notification
   */
  public sendBigWinNotification(userId: string, amount: number, currency: string = 'USD', gameType?: string): void {
    const template = { ...this.templates.big_win };
    template.message = `Congratulations on your big win of ${amount} ${currency}! Your balance has been updated.`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        amount,
        currency,
        gameType,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send jackpot win notification
   */
  public sendJackpotWinNotification(userId: string, amount: number, currency: string = 'USD', gameType?: string): void {
    const template = { ...this.templates.jackpot_win };
    template.message = `🎉 CONGRATULATIONS! You've won the JACKPOT of ${amount} ${currency}! 🎉`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        amount,
        currency,
        gameType,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send system maintenance notification (broadcast to all users)
   */
  public sendSystemMaintenanceNotification(message?: string, scheduledFor?: Date): void {
    const template = { ...this.templates.system_maintenance };
    if (message) {
      template.message = message;
    }
    
    const broadcast: NotificationBroadcast = {
      ...template,
      data: { 
        scheduledFor: scheduledFor?.toISOString(),
        timestamp: new Date().toISOString()
      }
    };
    
    notificationService.broadcastNotification(broadcast);
  }

  /**
   * Send system update notification (broadcast to all users)
   */
  public sendSystemUpdateNotification(message?: string): void {
    const template = { ...this.templates.system_update };
    if (message) {
      template.message = message;
    }
    
    const broadcast: NotificationBroadcast = {
      ...template,
      data: { timestamp: new Date().toISOString() }
    };
    
    notificationService.broadcastNotification(broadcast);
  }

  /**
   * Send security alert notification
   */
  public sendSecurityAlertNotification(userId: string, alertType: string, details?: any): void {
    const template = { ...this.templates.security_alert };
    template.message = `We detected ${alertType} on your account. Please verify your account security.`;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        alertType,
        details,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send admin message notification
   */
  public sendAdminMessageNotification(userId: string, message: string, fromAdmin?: string): void {
    const template = { ...this.templates.admin_message };
    template.message = message;
    
    notificationService.sendTemplateNotification(
      userId,
      template,
      { 
        fromAdmin,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Send game disabled notification (broadcast to all users)
   */
  public sendGameDisabledNotification(gameName: string, reason?: string): void {
    const template = { ...this.templates.game_disabled };
    template.title = `${gameName} Game Disabled`;
    template.message = `The ${gameName} game is temporarily disabled for maintenance. Please try again later.`;
    if (reason) {
      template.message += ` Reason: ${reason}`;
    }
    
    const broadcast: NotificationBroadcast = {
      ...template,
      data: { 
        gameName,
        reason: reason || 'Maintenance',
        timestamp: new Date().toISOString()
      }
    };
    
    notificationService.broadcastNotification(broadcast);
  }

  /**
   * Send game enabled notification (broadcast to all users)
   */
  public sendGameEnabledNotification(gameName: string): void {
    const template = { ...this.templates.game_enabled };
    template.title = `${gameName} Game Available`;
    template.message = `The ${gameName} game is now available for play. Enjoy!`;
    
    const broadcast: NotificationBroadcast = {
      ...template,
      data: { 
        gameName,
        timestamp: new Date().toISOString()
      }
    };
    
    notificationService.broadcastNotification(broadcast);
  }

  /**
   * Send custom notification
   */
  public sendCustomNotification(
    userId: string | null,
    title: string,
    message: string,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    data?: any,
    expiresInHours?: number
  ): void {
    notificationService.queueNotification({
      userId,
      type: NotificationType.CUSTOM,
      title,
      message,
      data,
      priority,
      expiresInHours
    });
  }

  /**
   * Broadcast custom notification to all users
   */
  public broadcastCustomNotification(
    title: string,
    message: string,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    data?: any,
    targetUsers?: string[],
    expiresInHours?: number
  ): void {
    const broadcast: NotificationBroadcast = {
      type: NotificationType.CUSTOM,
      title,
      message,
      data,
      priority,
      targetUsers,
      expiresInHours
    };
    
    notificationService.broadcastNotification(broadcast);
  }

  /**
   * Get notification template by type
   */
  public getTemplate(templateName: string): NotificationTemplate | undefined {
    return this.templates[templateName];
  }

  /**
   * Get all available templates
   */
  public getAllTemplates(): Record<string, NotificationTemplate> {
    return { ...this.templates };
  }
}

export default NotificationEngine.getInstance();
