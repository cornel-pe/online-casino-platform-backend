import { Request } from 'express';
import { AuditLog, IAuditLog } from '../models/AuditLog';

// Extend Request interface to include user and session
export interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    username?: string;
  };
  sessionID?: string;
}

export interface AuditLogData {
  action: string;
  category: 'crash_game' | 'user_management' | 'system' | 'risk_control' | 'provable_fair' | 'settings';
  description: string;
  performedBy: string; // User ID
  targetId?: string;
  targetType?: 'user' | 'game' | 'round' | 'system';
  details?: { [key: string]: any };
  severity?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'success' | 'failed' | 'pending';
  errorMessage?: string;
  metadata?: { [key: string]: any };
}

export class AuditLogger {
  /**
   * Log an admin action
   */
  static async logAction(data: AuditLogData, req?: AuthenticatedRequest): Promise<void> {
    try {
      const logData: Partial<IAuditLog> = {
        action: data.action,
        category: data.category,
        description: data.description,
        performedBy: data.performedBy as any,
        targetId: data.targetId as any,
        targetType: data.targetType,
        details: data.details || {},
        severity: data.severity || 'medium',
        status: data.status || 'success',
        errorMessage: data.errorMessage,
        metadata: {
          timestamp: new Date(),
          ...data.metadata,
          ...(req && {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionID
          })
        }
      };

      const auditLog = new AuditLog(logData);
      await auditLog.save();
      
      console.log(`📝 Audit Log: ${data.action} - ${data.description} by ${data.performedBy}`);
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  /**
   * Log crash game actions
   */
  static async logCrashGameAction(
    action: string,
    description: string,
    performedBy: string,
    targetId?: string,
    details?: { [key: string]: any },
    req?: AuthenticatedRequest
  ): Promise<void> {
    await this.logAction({
      action,
      category: 'crash_game',
      description,
      performedBy,
      targetId,
      targetType: 'game',
      details
    }, req);
  }

  /**
   * Log risk control actions
   */
  static async logRiskControlAction(
    action: string,
    description: string,
    performedBy: string,
    details?: { [key: string]: any },
    req?: AuthenticatedRequest
  ): Promise<void> {
    await this.logAction({
      action,
      category: 'risk_control',
      description,
      performedBy,
      targetType: 'system',
      details
    }, req);
  }

  /**
   * Log provable-fair actions
   */
  static async logProvableFairAction(
    action: string,
    description: string,
    performedBy: string,
    targetId?: string,
    details?: { [key: string]: any },
    req?: AuthenticatedRequest
  ): Promise<void> {
    await this.logAction({
      action,
      category: 'provable_fair',
      description,
      performedBy,
      targetId,
      targetType: 'round',
      details
    }, req);
  }

  /**
   * Log user management actions
   */
  static async logUserManagementAction(
    action: string,
    description: string,
    performedBy: string,
    targetId: string,
    details?: { [key: string]: any },
    req?: AuthenticatedRequest
  ): Promise<void> {
    await this.logAction({
      action,
      category: 'user_management',
      description,
      performedBy,
      targetId,
      targetType: 'user',
      details
    }, req);
  }

  /**
   * Log system actions
   */
  static async logSystemAction(
    action: string,
    description: string,
    performedBy: string,
    details?: { [key: string]: any },
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    req?: AuthenticatedRequest
  ): Promise<void> {
    await this.logAction({
      action,
      category: 'system',
      description,
      performedBy,
      targetType: 'system',
      details,
      severity
    }, req);
  }

  /**
   * Log settings changes
   */
  static async logSettingsAction(
    action: string,
    description: string,
    performedBy: string,
    details?: { [key: string]: any },
    req?: AuthenticatedRequest
  ): Promise<void> {
    await this.logAction({
      action,
      category: 'settings',
      description,
      performedBy,
      targetType: 'system',
      details
    }, req);
  }
}

// Helper function to extract user info from request
export function getUserFromRequest(req: AuthenticatedRequest): { id: string; username: string } | null {
  if (req.user && req.user._id) {
    return {
      id: req.user._id.toString(),
      username: req.user.username || 'Unknown'
    };
  }
  return null;
}
