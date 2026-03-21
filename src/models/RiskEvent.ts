/**
 * Risk Event Model
 * 
 * Stores all risk control events for audit and monitoring
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskEvent extends Document {
  timestamp: Date;
  gameType: string; // 'crash', 'roulette', 'coinflip', 'mine', or 'system'
  gameId: string;
  eventType: 'high_payout' | 'consecutive_wins' | 'anomaly_detected' | 'treasury_low' | 'payout_limit_reached' | 'payout_adjusted' | 'payout_blocked';
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Event details
  details: {
    payout?: number;
    multiplier?: number;
    treasuryBalance?: number;
    limit?: number;
    requestedPayout?: number;
    adjustedPayout?: number;
    consecutiveWins?: number;
    anomalyScore?: number;
    distribution?: any;
    maxStreak?: number;
    gamesAnalyzed?: number;
    currentBalance?: number;
    minRequired?: number;
    hourlyTotal?: number;
    dailyTotal?: number;
    [key: string]: any;
  };
  
  actionTaken?: string;
  
  // User involved (if applicable)
  userId?: mongoose.Types.ObjectId;
  username?: string;
  
  // Admin who reviewed (if reviewed)
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const riskEventSchema = new Schema<IRiskEvent>({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  gameType: {
    type: String,
    required: true,
    enum: ['crash', 'roulette', 'coinflip', 'mine', 'system', 'analysis'],
    index: true
  },
  gameId: {
    type: String,
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'high_payout',
      'consecutive_wins',
      'anomaly_detected',
      'treasury_low',
      'payout_limit_reached',
      'payout_adjusted',
      'payout_blocked'
    ],
    index: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    index: true
  },
  details: {
    type: Schema.Types.Mixed,
    required: true
  },
  actionTaken: {
    type: String,
    default: null
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  username: {
    type: String,
    default: null
  },
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewNotes: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
riskEventSchema.index({ timestamp: -1 });
riskEventSchema.index({ severity: 1, timestamp: -1 });
riskEventSchema.index({ gameType: 1, timestamp: -1 });
riskEventSchema.index({ eventType: 1, timestamp: -1 });
riskEventSchema.index({ createdAt: -1 });

export const RiskEvent = mongoose.model<IRiskEvent>('RiskEvent', riskEventSchema);

