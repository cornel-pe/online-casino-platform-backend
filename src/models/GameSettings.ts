import mongoose, { Schema, Document } from 'mongoose';

export interface IGameSettings extends Document {
  // Game Status
  mine: {
    enabled: boolean;
    maintenanceMessage?: string;
    minBet: number;
    maxBet: number;
    maxMultiplier: number;
  };
  crash: {
    enabled: boolean;
    maintenanceMessage?: string;
    minBet: number;
    maxBet: number;
    houseEdge: number;
    maxMultiplier: number;
    tickIntervalMs: number;
    bettingPhaseMs: number;
    maxPlayers: number;
    multiplierGrowthRate: number;
  };
  coinflip: {
    enabled: boolean;
    maintenanceMessage?: string;
    minBet: number;
    maxBet: number;
    platformFee: number; // Platform fee percentage (e.g., 0.05 = 5%)
  };
  roulette: {
    enabled: boolean;
    maintenanceMessage?: string;
    minBet: number;
    maxBet: number;
    houseEdge: number;
    maxPlayers: number;
    timeoutSeconds: number;
    minPlayers: number;
  };
  
  // Global Settings
  global: {
    maintenanceMode: boolean;
    maintenanceMessage?: string;
    allowRegistrations: boolean;
    allowDeposits: boolean;
    allowWithdrawals: boolean;
    chatEnabled: boolean;
  };
  // Bot Settings
  bots?: {
    enabled: boolean;
    maxBetAmount: number;
  };
  
  // Risk Control Settings
  riskControl?: {
    enabled: boolean;
    
    // Payout Limits
    maxPayoutPerGame: number;
    maxPayoutPerHour: number;
    maxPayoutPerDay: number;
    
    // Treasury Protection
    minTreasuryBalance: number;
    maxPayoutVsTreasuryRatio: number;
    
    // Pattern Detection
    consecutiveHighWinsThreshold: number;
    highWinMultiplierThreshold: number;
    
    // Anomaly Detection
    anomalyDetectionEnabled: boolean;
    anomalyScoreThreshold: number;
    recentGamesAnalysisCount: number;
    
    // Actions
    pauseGamesOnHighRisk: boolean;
    notifyAdminsOnRiskEvent: boolean;
  };
  
  // Metadata
  lastUpdated: Date;
  updatedBy: mongoose.Types.ObjectId;
  version: number;
}

const gameSettingsSchema = new Schema<IGameSettings>({
  mine: {
    enabled: { type: Boolean, default: true },
    maintenanceMessage: { type: String, default: 'Mine game is currently under maintenance. Please try again later.' },
    minBet: { type: Number, default: 0.001 },
    maxBet: { type: Number, default: 1000 },
    maxMultiplier: { type: Number, default: 24 }
  },
  crash: {
    enabled: { type: Boolean, default: true },
    maintenanceMessage: { type: String, default: 'Crash game is currently under maintenance. Please try again later.' },
    minBet: { type: Number, default: 0.001 },
    maxBet: { type: Number, default: 1000 },
    houseEdge: { type: Number, default: 0.01 },
    maxMultiplier: { type: Number, default: 1000 },
    tickIntervalMs: { type: Number, default: 25 }, // Halved default tick; engine uses half again effectively
    bettingPhaseMs: { type: Number, default: 20000 },
    maxPlayers: { type: Number, default: 20 },
    multiplierGrowthRate: { type: Number, default: 0.08 } // Faster exponential growth
  },
  coinflip: {
    enabled: { type: Boolean, default: true },
    maintenanceMessage: { type: String, default: 'Coinflip game is currently under maintenance. Please try again later.' },
    minBet: { type: Number, default: 0.001 },
    maxBet: { type: Number, default: 1000 },
    platformFee: { type: Number, default: 0.05 } // 5% platform fee
  },
  roulette: {
    enabled: { type: Boolean, default: true },
    maintenanceMessage: { type: String, default: 'Roulette game is currently under maintenance. Please try again later.' },
    minBet: { type: Number, default: 0.01 },
    maxBet: { type: Number, default: 1000 },
    houseEdge: { type: Number, default: 0.05 },
    maxPlayers: { type: Number, default: 100 },
    timeoutSeconds: { type: Number, default: 20 },
    minPlayers: { type: Number, default: 1 }
  },
  global: {
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'The platform is currently under maintenance. Please try again later.' },
    allowRegistrations: { type: Boolean, default: true },
    allowDeposits: { type: Boolean, default: true },
    allowWithdrawals: { type: Boolean, default: true },
    chatEnabled: { type: Boolean, default: true }
  },
  bots: {
    enabled: { type: Boolean, default: true },
    maxBetAmount: { type: Number, default: 100 }
  },
  riskControl: {
    enabled: { type: Boolean, default: true },
    
    // Payout Limits
    maxPayoutPerGame: { type: Number, default: 10000 }, // $10,000 max per game
    maxPayoutPerHour: { type: Number, default: 50000 }, // $50,000 per hour
    maxPayoutPerDay: { type: Number, default: 200000 }, // $200,000 per day
    
    // Treasury Protection
    minTreasuryBalance: { type: Number, default: 10000 }, // Keep at least $10,000
    maxPayoutVsTreasuryRatio: { type: Number, default: 0.15 }, // Max 15% of treasury per payout
    
    // Pattern Detection
    consecutiveHighWinsThreshold: { type: Number, default: 5 }, // Alert after 5 consecutive high wins
    highWinMultiplierThreshold: { type: Number, default: 10 }, // 10x+ is considered high
    
    // Anomaly Detection
    anomalyDetectionEnabled: { type: Boolean, default: true },
    anomalyScoreThreshold: { type: Number, default: 0.15 }, // 15% anomaly score triggers alert
    recentGamesAnalysisCount: { type: Number, default: 50 }, // Analyze last 50 games
    
    // Actions
    pauseGamesOnHighRisk: { type: Boolean, default: false }, // Don't auto-pause
    notifyAdminsOnRiskEvent: { type: Boolean, default: true }
  },
  lastUpdated: { type: Date, default: Date.now },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: Number, default: 1 }
}, {
  timestamps: true
});

// Ensure only one settings document exists
gameSettingsSchema.index({}, { unique: true });

export default mongoose.model<IGameSettings>('GameSettings', gameSettingsSchema);
