import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';
import { IToken } from './Token';

export interface ICoinflipPlayer {
  user: mongoose.Types.ObjectId | IUser;
  betAmount: number;
  coinSide: 'heads' | 'tails';
  userSeed?: string;
  userSeedHash?: string;
}

export interface ICoinflip extends Document {
  // Game ID
  gameId: number;
  
  // Players
  creator: mongoose.Types.ObjectId | IUser;
  joiner?: mongoose.Types.ObjectId | IUser;
  
  // Game configuration
  betAmount: number;
  
  // Game state
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  coinSide: 'heads' | 'tails';
  winner?: mongoose.Types.ObjectId | IUser;
  winningTicket?: number;
  
  // Seeds for provably fair
  serverSeed: string;
  serverSeedHash: string;
  creatorSeed?: string;
  joinerSeed?: string;
  
  // Payout information
  totalPot: number;
  platformFee: number;
  winnerPayout: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  
  // Methods
  joinGame(userId: string, userSeed: string, userSeedHash: string): Promise<{ success: boolean; message: string; gameState?: any }>;
  selectWinner(): Promise<{ winner: mongoose.Types.ObjectId; winningTicket: number; gameState: any }>;
  getPublicGameState(): any;
  getCompletedGameState(): any;
  cancelGame(): Promise<boolean>;
}

export interface ICoinflipModel extends mongoose.Model<ICoinflip> {
  generateServerSeeds(): { serverSeed: string; serverSeedHash: string };
}

const coinflipPlayerSchema = new Schema<ICoinflipPlayer>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  betAmount: {
    type: Number,
    required: true,
    min: 0.001,
  },
  coinSide: {
    type: String,
    enum: ['heads', 'tails'],
    required: true,
  },
  userSeed: {
    type: String,
  },
  userSeedHash: {
    type: String,
  },
}, { _id: false });

const coinflipSchema = new Schema<ICoinflip>({
  // Game ID
  gameId: {
    type: Number,
    unique: true,
    required: true,
  },
  
  // Players
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  joiner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Game configuration
  betAmount: {
    type: Number,
    required: true,
    min: 0.001,
  },
  
  // Game state
  status: {
    type: String,
    enum: ['waiting', 'active', 'completed', 'cancelled'],
    default: 'waiting',
  },
  coinSide: {
    type: String,
    enum: ['heads', 'tails'],
    required: true,
  },
  winner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  winningTicket: {
    type: Number,
  },
  
  // Seeds for provably fair
  serverSeed: {
    type: String,
    required: true,
  },
  serverSeedHash: {
    type: String,
    required: true,
  },
  creatorSeed: {
    type: String,
  },
  joinerSeed: {
    type: String,
  },
  
  // Payout information
  totalPot: {
    type: Number,
    default: 0,
  },
  platformFee: {
    type: Number,
    default: 0,
  },
  winnerPayout: {
    type: Number,
    default: 0,
  },
  
  // Timestamps
  completedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Indexes for better performance (gameId has unique index)
coinflipSchema.index({ status: 1, createdAt: -1 });
coinflipSchema.index({ creator: 1, status: 1 });
coinflipSchema.index({ joiner: 1, status: 1 });
coinflipSchema.index({ status: 1, betAmount: 1 });

// No pre-save middleware needed - using MongoDB _id directly


// Instance methods
coinflipSchema.methods.joinGame = async function(userId: string, userSeed: string, userSeedHash: string) {
  // Check if game is waiting for a joiner
  if (this.status !== 'waiting') {
    return {
      success: false,
      message: 'Game is not available for joining'
    };
  }

  // Check if user is trying to join their own game
  if (this.creator.toString() === userId) {
    return {
      success: false,
      message: 'Cannot join your own game'
    };
  }

  // Check if user has sufficient balance (this should be validated in controller)
  
  // Add joiner to the game
  this.joiner = userId;
  this.joinerSeed = userSeed;
  this.status = 'active';
  this.totalPot = this.betAmount * 2; // Both players bet the same amount
  this.platformFee = this.totalPot * 0.05; // 5% platform fee
  this.winnerPayout = this.totalPot - this.platformFee; // 95% to winner
  
  await this.save();

  // Select winner immediately after joining
  const winnerResult = await this.selectWinner();
  
  return {
    success: true,
    message: 'Successfully joined game',
    gameState: winnerResult.gameState
  };
};

coinflipSchema.methods.selectWinner = async function() {
  if (this.status !== 'active') {
    throw new Error('Game is not active');
  }

  // Import the random generator function
  const { generateCoinflipResult } = require('../utils/randomGenerator');
  
  // Generate the coinflip result using our new provably fair system
  const result = generateCoinflipResult(
    this.serverSeed,
    this.creatorSeed || '',
    this.joinerSeed || '',
    this.gameId.toString()
  );
  
  // Determine winner based on coin sides and result
  const creatorSide = this.coinSide.toUpperCase();
  const joinerSide = creatorSide === 'HEADS' ? 'TAILS' : 'HEADS';
  
  // Check if result matches creator's or joiner's choice
  const creatorWins = result.winnerSide === creatorSide;
  
  this.winner = creatorWins ? this.creator : this.joiner;
  this.winningTicket = result.ticket;
  this.status = 'completed';
  this.completedAt = new Date();
  
  await this.save();

  return {
    winner: this.winner,
    winningTicket: result.ticket,
    gameState: this.getCompletedGameState()
  };
};

coinflipSchema.methods.getPublicGameState = function() {
  return {
    id: Buffer.from(this._id.toString()).toString('base64'), // Encode MongoDB ID
    gameId: this.gameId, // Numeric game ID
    creator: this.creator,
    joiner: this.joiner,
    betAmount: this.betAmount,
    token: this.token,
    status: this.status,
    coinSide: this.coinSide,
    serverSeedHash: this.serverSeedHash,
    totalPot: this.totalPot,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

coinflipSchema.methods.getCompletedGameState = function() {
  if (this.status !== 'completed' && this.status !== 'cancelled') {
    throw new Error('Game is not completed yet');
  }
  
  // For cancelled games, return basic state with seeds
  if (this.status === 'cancelled') {
    const baseState = this.getPublicGameState();
    return {
      ...baseState,
      serverSeed: this.serverSeed,
      creatorSeed: this.creatorSeed,
      completedAt: this.completedAt,
    };
  }
  
  // Determine the actual coin result based on winning ticket
  const coinResult = this.winningTicket < 500000 ? 'heads' : 'tails';
  const baseState = this.getPublicGameState();
  return {
    ...baseState,
    winner: this.winner,
    winningTicket: this.winningTicket,
    coinResult: coinResult, // The actual coin result
    serverSeed: this.serverSeed,
    creatorSeed: this.creatorSeed,
    joinerSeed: this.joinerSeed,
    platformFee: this.platformFee,
    winnerPayout: this.winnerPayout,
    completedAt: this.completedAt,
  };
};

coinflipSchema.methods.cancelGame = async function() {
  if (this.status !== 'waiting') {
    return false;
  }
  
  this.status = 'cancelled';
  await this.save();
  return true;
};

export default mongoose.model<ICoinflip, ICoinflipModel>('Coinflip', coinflipSchema);
