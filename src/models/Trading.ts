import mongoose, { Document, Schema } from 'mongoose';

export interface ITradingBet extends Document {
  userId: mongoose.Types.ObjectId;
  token: 'BTC' | 'BNB' | 'ETH' | 'SOL' | 'TRX';
  direction: 'up' | 'down'; // 'up' = long, 'down' = short
  wager: number; // Bet amount in USD
  leverage: number; // 1-1000x
  multiplier: number; // Cashed out multiplier
  entryPrice: number; // Price when bet was placed
  bustPrice: number; // Price that will trigger bust
  exitPrice?: number; // Price when bet was closed
  currentPrice?: number; // Latest tracked price
  pnl: number; // Current profit/loss
  status: 'active' | 'closed' | 'busted';
  
  // Auto cashout settings
  autoCashoutEnabled: boolean;
  autoCashoutPrice?: number; // Target price for auto cashout
  autoCashoutProfit?: number; // Target profit amount for auto cashout
  autoCashoutLoss?: number; // Target loss amount for auto cashout (stop loss)
  
  // Results
  profit?: number; // Final profit if closed with profit
  loss?: number; // Final loss if busted or closed with loss
  payout?: number; // Final payout amount
  
  // Timestamps
  openedAt: Date;
  closedAt?: Date;
  bustedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const TradingBetSchema = new Schema<ITradingBet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      enum: ['BTC', 'BNB', 'ETH', 'SOL', 'TRX'],
      required: true,
    },
    direction: {
      type: String,
      enum: ['up', 'down'],
      required: true,
    },
    wager: {
      type: Number,
      required: true,
      min: 0,
    },
    leverage: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
    },
    multiplier: {
      type: Number,
      default: 1,
      min: 0,
    },
    entryPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    bustPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    exitPrice: {
      type: Number,
      min: 0,
    },
    currentPrice: {
      type: Number,
      min: 0,
    },
    pnl: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'closed', 'busted'],
      default: 'active',
    },
    autoCashoutEnabled: {
      type: Boolean,
      default: false,
    },
    autoCashoutPrice: {
      type: Number,
      min: 0,
    },
    autoCashoutProfit: {
      type: Number,
      min: 0,
    },
    autoCashoutLoss: {
      type: Number,
      min: 0,
    },
    profit: {
      type: Number,
    },
    loss: {
      type: Number,
    },
    payout: {
      type: Number,
      min: 0,
    },
    openedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
    },
    bustedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
TradingBetSchema.index({ userId: 1, status: 1 });
TradingBetSchema.index({ token: 1, status: 1 });
TradingBetSchema.index({ status: 1, openedAt: -1 });

// Virtual for calculating PnL percentage
TradingBetSchema.virtual('pnlPercent').get(function() {
  if (!this.currentPrice || !this.entryPrice) return 0;
  
  const priceChange = this.direction === 'up' 
    ? (this.currentPrice - this.entryPrice) / this.entryPrice
    : (this.entryPrice - this.currentPrice) / this.entryPrice;
  
  return priceChange * this.leverage * 100;
});

const TradingBet = mongoose.model<ITradingBet>('TradingBet', TradingBetSchema);

export default TradingBet;






