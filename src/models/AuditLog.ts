import mongoose, { Document, Schema } from "mongoose";

// Interface for AuditLog document
export interface IAuditLog extends Document {
  action: string; // The action performed
  category: 'crash_game' | 'user_management' | 'system' | 'risk_control' | 'provable_fair' | 'settings';
  description: string; // Human-readable description
  performedBy: mongoose.Types.ObjectId; // Admin who performed the action
  targetId?: mongoose.Types.ObjectId; // ID of the target (user, game, etc.)
  targetType?: 'user' | 'game' | 'round' | 'system'; // Type of target
  details: {
    // Action-specific details
    [key: string]: any;
  };
  ipAddress?: string; // IP address of the admin
  userAgent?: string; // User agent of the admin
  severity: 'low' | 'medium' | 'high' | 'critical'; // Severity level
  status: 'success' | 'failed' | 'pending'; // Action status
  errorMessage?: string; // Error message if action failed
  metadata: {
    // Additional metadata
    timestamp: Date;
    sessionId?: string;
    requestId?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['crash_game', 'user_management', 'system', 'risk_control', 'provable_fair', 'settings'],
      required: true,
      index: true
    },
    description: {
      type: String,
      required: true
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    targetId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true
    },
    targetType: {
      type: String,
      enum: ['user', 'game', 'round', 'system'],
      default: null
    },
    details: {
      type: Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'pending'],
      default: 'success',
      index: true
    },
    errorMessage: {
      type: String,
      default: null
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({
        timestamp: new Date()
      })
    }
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
