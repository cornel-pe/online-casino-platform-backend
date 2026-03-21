import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';
import { IToken } from './Token';
import { generateServerSeedHash } from '../utils/randomGenerator';

export interface IMine extends Document {
  // Game ID
  gameId: number;
  
  // Player information
  player: mongoose.Types.ObjectId | IUser;
  token: mongoose.Types.ObjectId | IToken;
  
  // Game configuration
  gridSize: number;
  numMines: number;
  betAmount: number;
  payout: number;
  
  // Game state
  status: 'playing' | 'win' | 'lose';
  revealedTiles: number[];
  currentMultiplier: number;
  isLocked: boolean; // Security: prevents manipulation during database operations
  
  // Server-side only (never sent to frontend)
  serverSeed: string;
  clientSeed: string;
  mineTiles: number[];
  sigHash: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  
  // Methods
  revealTile(tileIndex: number): { success: boolean; isMine: boolean; multiplier: number; gameEnded: boolean };
  cashOut(): { success: boolean; payout: number };
  getPublicGameState(): any;
  getCompletedGameState(): any;
}

const mineSchema = new Schema<IMine>({
  // Game ID
  gameId: {
    type: Number,
    unique: true,
    required: true,
  },
  
  // Player information
  player: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  token: {
    type: Schema.Types.ObjectId,
    ref: 'Token',
  },
  
  // Game configuration
  gridSize: {
    type: Number,
    required: true,
    min: 3,
    max: 10,
  },
  numMines: {
    type: Number,
    required: true,
    min: 1,
  },
  betAmount: {
    type: Number,
    required: true,
    min: 0.001,
  },
  payout: {
    type: Number,
    default: 0,
  },
  // Game state
  status: {
    type: String,
    enum: ['playing', 'win', 'lose'],
    default: 'playing',
  },
  revealedTiles: [{
    type: Number,
    min: 0,
  }],
  currentMultiplier: {
    type: Number,
    default: 1.0,
  },
  isLocked: {
    type: Boolean,
    default: false,
  },
  
  // Server-side only (never sent to frontend)
  serverSeed: {
    type: String,
    required: true,
  },
  clientSeed: {
    type: String,
    required: true,
  },
  mineTiles: [{
    type: Number,
    min: 0,
  }],
  sigHash: {
    type: String,
    required: true,
  },
  
  // Timestamps
  completedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Indexes for better performance (gameId has unique index)
mineSchema.index({ player: 1, status: 1 });
mineSchema.index({ status: 1, createdAt: 1 });
mineSchema.index({ player: 1, createdAt: -1 });

// Pre-save validation
mineSchema.pre('save', function(next) {
  // Validate that numMines is less than total tiles
  const totalTiles = this.gridSize * this.gridSize;
  if (this.numMines >= totalTiles) {
    return next(new Error('Number of mines cannot be greater than or equal to total tiles'));
  }
  
  // Validate that mineTiles are within grid bounds
  if (this.mineTiles.some(tile => tile < 0 || tile >= totalTiles)) {
    console.log('Mine tiles must be within grid bounds', this.mineTiles, totalTiles);
    return next(new Error('Mine tiles must be within grid bounds'));
  }
  
  next();
});

// Instance methods
mineSchema.methods.revealTile = function(tileIndex: number) {
  const totalTiles = this.gridSize * this.gridSize;
  
  // Validate tile index
  if (tileIndex < 0 || tileIndex >= totalTiles) {
    throw new Error('Invalid tile index');
  }
  
  // Check if game is already ended
  if (this.status !== 'playing') {
    throw new Error('Game is already ended');
  }
  
  // Check if tile is already revealed
  if (this.revealedTiles.includes(tileIndex)) {
    throw new Error('Tile is already revealed');
  }
  
  // Check if tile is a mine
  const isMine = this.mineTiles.includes(tileIndex);
  
  if (isMine) {
    // Game lost
    this.status = 'lose';
    this.completedAt = new Date();
    this.save();
    
    return {
      success: false,
      isMine: true,
      multiplier: 0,
      gameEnded: true
    };
  } else {
    // Add tile to revealed tiles
    this.revealedTiles.push(tileIndex);
    
    // Calculate new multiplier
    const { calculateMultiplier } = require('../utils/multiplierCalculator');
    this.currentMultiplier = calculateMultiplier(this.gridSize, this.numMines, this.revealedTiles.length);
    
    this.save();
    
    return {
      success: true,
      isMine: false,
      multiplier: this.currentMultiplier,
      gameEnded: false
    };
  }
};

mineSchema.methods.cashOut = function() {
  if (this.status !== 'playing') {
    throw new Error('Game is already ended');
  }
  
  if (this.revealedTiles.length === 0) {
    throw new Error('No tiles revealed yet');
  }
  
  // Game won
  this.status = 'win';
  this.completedAt = new Date();
  
  this.payout = this.betAmount * this.currentMultiplier;
  
  this.save();
  
  return {
    success: true,
    payout: this.payout,
  };
};

// Get public game state (for active games)
mineSchema.methods.getPublicGameState = function() {
  return {
    id: Buffer.from(this._id.toString()).toString('base64'), // Encode MongoDB ID
    gameId: this.gameId,
    gridSize: this.gridSize,
    numMines: this.numMines,
    betAmount: this.betAmount,
    status: this.status,
    revealedTiles: this.revealedTiles,
    currentMultiplier: this.currentMultiplier,
    nextMultiplier: this.currentMultiplier ,
    serverSeedHash: generateServerSeedHash(this.serverSeed),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Get completed game state (includes mine positions)
mineSchema.methods.getCompletedGameState = function() {
  if (this.status === 'playing') {
    throw new Error('Game is not completed yet');
  }
  
  const baseState = this.getPublicGameState();
  return {
    ...baseState,
    mineTiles: this.mineTiles,
    completedAt: this.completedAt,
    payout: this.payout,
  };
};

export default mongoose.model<IMine>('Mine', mineSchema);
