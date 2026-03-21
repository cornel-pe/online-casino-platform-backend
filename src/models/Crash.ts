import mongoose, { Document, Schema } from "mongoose";

// Interface for player bet inside crash
export interface ICrashPlayerBet {
  user: mongoose.Types.ObjectId;
  username: string;
  avatar?: string;
  betAmount: number;
  autoCashoutMultiplier?: number;
  cashoutMultiplier?: number;
  payout?: number;
  status: "active" | "cashed_out" | "lost";
  transactionId: mongoose.Types.ObjectId;
  joinedAt: Date;
  cashedOutAt?: Date;
}

// Interface for player inside crash (legacy - keeping for compatibility)
export interface ICrashPlayer {
  user: mongoose.Types.ObjectId;
  status: "WIN" | "LOSS" | "PENDING";
  joinedAt?: Date; // Optional, will be set when the player joins
  escapedAt?: Date; // Optional, will be set when the player escapes
  payout?: number; // Optional, will be set when the game is settled
  xp?: number; // Optional, can be used to store XP earned by the player
}

// Interface for Crash document
export interface ICrash extends Document {
  round: number;
  ticket: number;
  players: ICrashPlayer[]; // Legacy field
  playerBets: ICrashPlayerBet[]; // New detailed player bets
  status: "betting" | "running" | "crashed" | "ended" | "paused";
  currentMultiplier: number;
  crashPoint: number;
  totalBetAmount: number;
  totalPayout: number;
  startTime: Date;
  bettingEndTime?: Date;
  crashTime?: Date;
  endTime?: Date;
  endedBy?: mongoose.Types.ObjectId; // Optional, admin who ended the game
  autoStopped?: boolean; // Optional, whether the game was auto-stopped
  autoStopReason?: string; // Optional, reason for auto-stop
  // Provable-fair fields
  serverSeed: string;
  serverSeedHash: string;
  publicSeed: string;
  eosBlockNumber: number;
  // Legacy fields (keeping for compatibility)
  launchAt: Date;
  crashAt?: Date;
  betAmount?: number;
  feeRate?: number;
  multiplier?: number;
  clientSeed?: string;
  hash?: string;
}

const crashSchema = new Schema<ICrash>(
  {
    round: {
      type: Number,
      required: true,
    },
    ticket: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["betting", "running", "crashed", "ended", "paused"],
      default: "betting",
    },
    currentMultiplier: {
      type: Number,
      default: 1.00,
    },
    crashPoint: {
      type: Number,
      required: true,
    },
    totalBetAmount: {
      type: Number,
      default: 0,
    },
    totalPayout: {
      type: Number,
      default: 0,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    bettingEndTime: {
      type: Date,
      default: null,
    },
    crashTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    // New detailed player bets
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
      autoCashoutMultiplier: {
        type: Number,
        default: null,
      },
      cashoutMultiplier: {
        type: Number,
        default: null,
      },
      payout: {
        type: Number,
        default: 0,
      },
      status: {
        type: String,
        enum: ["active", "cashed_out", "lost"],
        default: "active",
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
      cashedOutAt: {
        type: Date,
        default: null,
      },
    }],
    // Provable-fair fields
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
    // Legacy fields (keeping for compatibility)
    players: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        status: {
          type: String,
          enum: ["WIN", "LOSS", "PENDING"],
          default: "PENDING",
        },
        escapedAt: {
          type: Date
        }
      },
    ],
    launchAt: {
      type: Date,
      default: Date.now,
    },
    betAmount: {
      type: Number,
      default: 0.1,
    },
    crashAt: {
      type: Date,
      default: null,
    },
    feeRate: {
      type: Number,
      default: 0.05,
    },
    multiplier: {
      type: Number,
      default: null,
    },
    endedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    autoStopped: {
      type: Boolean,
      default: false,
    },
    autoStopReason: {
      type: String,
      default: null,
    },
    clientSeed: {
      type: String,
      default: null,
    },
    hash: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const CrashGame = mongoose.model<ICrash>("Crashgame", crashSchema);
