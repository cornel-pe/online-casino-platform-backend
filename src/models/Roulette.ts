import mongoose, { Document, Schema } from "mongoose";

// Interface for player bet in roulette
export interface IRoulettePlayerBet {
  user: mongoose.Types.ObjectId;
  username: string;
  avatar?: string;
  betAmount: number;
  betType: "heads" | "tails" | "crown";
  transactionId: mongoose.Types.ObjectId;
  joinedAt: Date;
}

// Interface for Roulette document
export interface IRoulette extends Document {
  gameId: number;
  status: "waiting" | "betting" | "drawing" | "completed" | "cancelled";
  totalBetAmount: number;
  playerCount: number;
  playerBets: IRoulettePlayerBet[];
  
  // Timing
  bettingStartTime: Date;
  bettingEndTime?: Date;
  drawTime?: Date;
  completedAt?: Date;
  bettingDurationMs: number; // 20 seconds
  
  // Winner selection
  winningSlot?: number; // 0-36 (0-17: heads, 18: crown, 19-36: tails)
  winningType?: "heads" | "tails" | "crown";
  winners?: {
    userId: mongoose.Types.ObjectId;
    username: string;
    avatar?: string;
    betAmount: number;
    betType: "heads" | "tails" | "crown";
    payout: number;
  }[];
  
  // Provable fair
  serverSeed: string;
  serverSeedHash: string;
  publicSeed: string;
  eosBlockNumber: number; // The actual EOS block number used for this game
  
  // Game settings
  minBetAmount: number;
  maxBetAmount: number;
  houseEdge: number; // Percentage taken by house (e.g., 5%)
}

const rouletteSchema = new Schema<IRoulette>(
  {
    gameId: {
      type: Number,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["waiting", "betting", "drawing", "completed", "cancelled"],
      default: "waiting",
    },
    totalBetAmount: {
      type: Number,
      default: 0,
    },
    playerCount: {
      type: Number,
      default: 0,
    },
    playerBets: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      username: {
        type: String,
        required: true,
      },
      avatar: {
        type: String,
        default: null,
      },
      betAmount: {
        type: Number,
        required: true,
      },
      betType: {
        type: String,
        enum: ["heads", "tails", "crown"],
        required: true,
      },
      transactionId: {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
        required: true,
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // Timing
    bettingStartTime: {
      type: Date,
      default: null, // Will be set when first player joins
    },
    bettingEndTime: {
      type: Date,
      default: null,
    },
    drawTime: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    bettingDurationMs: {
      type: Number,
      default: 20000, // 20 seconds default
    },
    
    // Winner selection
    winningSlot: {
      type: Number,
      default: null, // 0-36 (0-17: heads, 18: crown, 19-36: tails)
    },
    winningType: {
      type: String,
      enum: ["heads", "tails", "crown"],
      default: null,
    },
    winners: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      username: {
        type: String,
        required: true,
      },
      avatar: {
        type: String,
        default: null,
      },
      betAmount: {
        type: Number,
        required: true,
      },
      betType: {
        type: String,
        enum: ["heads", "tails", "crown"],
        required: true,
      },
      payout: {
        type: Number,
        required: true,
      },
    }],
    
    // Provable fair
    serverSeed: {
      type: String,
      required: true,
    },
    serverSeedHash: {
      type: String,
      required: true,
    },
    publicSeed: {
      type: String,
      required: true,
    },
    eosBlockNumber: {
      type: Number,
      required: true,
    },
    
    // Game settings
    minBetAmount: {
      type: Number,
      default: 0.01, // 0.01 USDT minimum
    },
    maxBetAmount: {
      type: Number,
      default: 1000, // 1000 USDT maximum
    },
    houseEdge: {
      type: Number,
      default: 5, // 5% house edge
    },
  },
  {
    timestamps: true,
  }
);

// Helper methods for roulette
rouletteSchema.methods.getWinningType = function(slot: number): "heads" | "tails" | "crown" {
  if (slot === 18) return "crown";
  if (slot >= 0 && slot <= 17) return "heads";
  if (slot >= 19 && slot <= 36) return "tails";
  throw new Error(`Invalid slot number: ${slot}`);
};

export const RouletteGame = mongoose.model<IRoulette>("Roulette", rouletteSchema);
