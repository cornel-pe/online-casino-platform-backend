import mongoose, { Document, Schema } from 'mongoose';

// Clean transaction interface with from/to structure
export interface ITransaction extends Document {
  // Core transaction data
  amount: number; // Always positive, represents the actual amount transferred
  from: mongoose.Types.ObjectId; // Source (user ID or house ID: 000000000000000000000000)
  to: mongoose.Types.ObjectId; // Destination (user ID or house ID: 000000000000000000000000)
  hash: string; // Unique fingerprint/hash for this transaction
  
  // Transaction details
  type: 'deposit' | 'withdrawal' | 'bet' | 'payout' | 'house_profit' | 'refund' | 'bonus' | 'fee';
  description: string; // Human-readable description
  ref: string; // Reference ID (game ID, deposit ID, etc.)
  
  // Game-related fields (optional)
  gameType?: string;
  gameId?: mongoose.Types.ObjectId; // Reference to game document
  
  // Status and metadata
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  metadata?: {
    multiplier?: number; // For game payouts
    originalBet?: number; // Original bet amount
    houseEdge?: number; // House edge applied
    gameResult?: any; // Game-specific result data
    [key: string]: any; // Additional metadata
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>({
  // Core transaction data
  amount: {
    type: Number,
    required: true,
    min: 0, // Always positive
    index: true
  },
  
  from: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  to: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  hash: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 64,
    index: true
  },
  
  // Transaction details
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'bet', 'payout', 'house_profit', 'refund', 'bonus', 'fee'],
    required: true,
    index: true
  },
  
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  ref: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true
  },
  
  // Game-related fields
  gameType: {
    type: String,
    enum: ['mine', 'coinflip', 'crash', 'roulette'],
    required: false,
    index: true
  },
  
  gameId: {
    type: Schema.Types.ObjectId,
    required: false,
    index: true
  },
  
  // Status and metadata
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
    required: true,
    index: true
  },
  
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for better query performance (status, ref have field-level index)
transactionSchema.index({ from: 1, createdAt: -1 });
transactionSchema.index({ to: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ gameType: 1, createdAt: -1 });

// Compound indexes
transactionSchema.index({ from: 1, type: 1, createdAt: -1 });
transactionSchema.index({ to: 1, type: 1, createdAt: -1 });
transactionSchema.index({ gameType: 1, type: 1, createdAt: -1 });

// Pre-save middleware to generate hash if not provided
transactionSchema.pre('save', function(next) {
  if (!this.hash) {
    const crypto = require('crypto');
    const data = `${this.from}-${this.to}-${this.amount}-${this.type}-${this.ref}-${Date.now()}`;
    this.hash = crypto.createHash('sha256').update(data).digest('hex');
  }
  next();
});

// Static method to get house ObjectId
transactionSchema.statics.getHouseId = function() {
  return new mongoose.Types.ObjectId('000000000000000000000000');
};

// Instance method to check if transaction involves house
transactionSchema.methods.involvesHouse = function() {
  const houseId = new mongoose.Types.ObjectId('000000000000000000000000');
  return this.from.equals(houseId) || this.to.equals(houseId);
};

// Instance method to get the user involved (non-house)
transactionSchema.methods.getUser = function() {
  const houseId = new mongoose.Types.ObjectId('000000000000000000000000');
  if (this.from.equals(houseId)) {
    return this.to;
  } else if (this.to.equals(houseId)) {
    return this.from;
  }
  return null; // User-to-user transaction
};

const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);

export default Transaction;
