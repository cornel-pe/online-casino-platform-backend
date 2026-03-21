import mongoose, { Document, Schema } from 'mongoose';

// Interface for Betting Logic Model document
export interface IBettingLogicModel extends Document {
  name: string;
  description?: string;
  isDefault: boolean;
  
  // Crash game settings
  crash: {
    enabled: boolean;
    cashoutMin: number;
    cashoutMax: number;
    roundPattern: {
      play: number; // Number of rounds to play
      skip: number; // Number of rounds to skip
    };
    riskProfile: 'conservative' | 'moderate' | 'aggressive';
  };
  
  // Roulette game settings
  roulette: {
    enabled: boolean;
    betTypes: ('color' | 'number' | 'range' | 'dozen' | 'column')[];
    patterns: ('random' | 'martingale' | 'fibonacci' | 'dalembert')[];
    roundPattern: {
      play: number;
      skip: number;
    };
  };
  
  // Coinflip game settings
  coinflip: {
    enabled: boolean;
    createGameChance: number; // Percentage (0-100)
    joinDelay: {
      min: number; // Seconds
      max: number; // Seconds
    };
    sidePreference?: 'heads' | 'tails' | 'random';
  };
  
  // Bet amount calculation
  betAmount: {
    balance_over_100: { min: number; max: number }; // Percentage
    balance_50_100: { min: number; max: number }; // Percentage
    balance_under_50: { min: number; max: number }; // Percentage
    preferWholeNumbers: boolean;
    allowHalfValues: boolean; // .5 endings
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const bettingLogicModelSchema = new Schema<IBettingLogicModel>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  crash: {
    enabled: {
      type: Boolean,
      default: true
    },
    cashoutMin: {
      type: Number,
      default: 1.2,
      min: 1.01
    },
    cashoutMax: {
      type: Number,
      default: 2.0,
      min: 1.01
    },
    roundPattern: {
      play: {
        type: Number,
        default: 2,
        min: 1
      },
      skip: {
        type: Number,
        default: 1,
        min: 0
      }
    },
    riskProfile: {
      type: String,
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate'
    }
  },
  roulette: {
    enabled: {
      type: Boolean,
      default: true
    },
    betTypes: [{
      type: String,
      enum: ['color', 'number', 'range', 'dozen', 'column']
    }],
    patterns: [{
      type: String,
      enum: ['random', 'martingale', 'fibonacci', 'dalembert']
    }],
    roundPattern: {
      play: {
        type: Number,
        default: 3,
        min: 1
      },
      skip: {
        type: Number,
        default: 2,
        min: 0
      }
    }
  },
  coinflip: {
    enabled: {
      type: Boolean,
      default: true
    },
    createGameChance: {
      type: Number,
      default: 30,
      min: 0,
      max: 100
    },
    joinDelay: {
      min: {
        type: Number,
        default: 3,
        min: 0
      },
      max: {
        type: Number,
        default: 8,
        min: 0
      }
    },
    sidePreference: {
      type: String,
      enum: ['heads', 'tails', 'random'],
      default: 'random'
    }
  },
  betAmount: {
    balance_over_100: {
      min: {
        type: Number,
        default: 1,
        min: 0.001
      },
      max: {
        type: Number,
        default: 5,
        min: 0.001
      }
    },
    balance_50_100: {
      min: {
        type: Number,
        default: 1,
        min: 0.001
      },
      max: {
        type: Number,
        default: 3,
        min: 0.001
      }
    },
    balance_under_50: {
      min: {
        type: Number,
        default: 1,
        min: 0.001
      },
      max: {
        type: Number,
        default: 2.5,
        min: 0.001
      }
    },
    preferWholeNumbers: {
      type: Boolean,
      default: true
    },
    allowHalfValues: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Indexes (name has unique index)
bettingLogicModelSchema.index({ isDefault: 1 });

const BettingLogicModel = mongoose.model<IBettingLogicModel>('BettingLogicModel', bettingLogicModelSchema);

export default BettingLogicModel;

