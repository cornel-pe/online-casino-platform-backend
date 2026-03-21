import mongoose, { Document, Schema } from 'mongoose';

// Interface for House document
export interface IHouse extends Document {
  name: string;
  treasuryBalance: number; // House's treasury balance
  totalBetsReceived: number; // Total bets received from players
  totalPayoutsGiven: number; // Total payouts given to players
  totalProfit: number; // House profit (bets - payouts)
  
  // Game settings
  gameSettings: {
    mine: {
      minBet: number;
      maxBet: number;
      minMines: number;
      maxMines: number;
      houseEdge: number; // House edge percentage (e.g., 0.02 for 2%)
    };
    coinflip: {
      minBet: number;
      maxBet: number;
      houseEdge: number;
    };
    crash: {
      minBet: number;
      maxBet: number;
      houseEdge: number;
      maxMultiplier: number;
    };
    roulette: {
      minBet: number;
      maxBet: number;
      houseEdge: number;
      maxPlayers: number;
      timeoutSeconds: number;
      minPlayers: number;
    };
  };
  
  // Statistics
  statistics: {
    totalGamesPlayed: number;
    totalPlayers: number;
    averageBetSize: number;
    averagePayoutSize: number;
    winRate: number; // House win rate
  };
  
  // Status
  isActive: boolean;
  maintenanceMode: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual properties
  houseEdgePercentage: number;
  
  // Methods
  addToTreasury(amount: number): Promise<IHouse>;
  deductFromTreasury(amount: number): Promise<{ success: boolean; message?: string }>;
  updateGameStats(betAmount: number, payoutAmount: number, gameType: string): Promise<IHouse>;
}

// Static methods interface
export interface IHouseModel extends mongoose.Model<IHouse> {
  getHouse(): Promise<IHouse>;
}

const houseSchema = new Schema<IHouse>({
  name: {
    type: String,
    default: 'SpinX House',
    required: true,
    trim: true
  },
  
  treasuryBalance: {
    type: Number,
    default: 0,
    required: true,
    min: 0
  },
  
  totalBetsReceived: {
    type: Number,
    default: 0,
    required: true,
    min: 0
  },
  
  totalPayoutsGiven: {
    type: Number,
    default: 0,
    required: true,
    min: 0
  },
  
  totalProfit: {
    type: Number,
    default: 0,
    required: true
  },
  
  gameSettings: {
    mine: {
      minBet: {
        type: Number,
        default: 0.001,
        min: 0
      },
      maxBet: {
        type: Number,
        default: 1000,
        min: 0
      },
      minMines: {
        type: Number,
        default: 1,
        min: 1
      },
      maxMines: {
        type: Number,
        default: 24,
        max: 24
      },
      houseEdge: {
        type: Number,
        default: 0.01, // 1% house edge
        min: 0,
        max: 0.1
      }
    },
    coinflip: {
      minBet: {
        type: Number,
        default: 0.001,
        min: 0
      },
      maxBet: {
        type: Number,
        default: 1000,
        min: 0
      },
      houseEdge: {
        type: Number,
        default: 0.01, // 1% house edge
        min: 0,
        max: 0.1
      }
    },
    crash: {
      minBet: {
        type: Number,
        default: 0.001,
        min: 0
      },
      maxBet: {
        type: Number,
        default: 1000,
        min: 0
      },
      houseEdge: {
        type: Number,
        default: 0.01, // 1% house edge
        min: 0,
        max: 0.1
      },
      maxMultiplier: {
        type: Number,
        default: 1000,
        min: 1
      }
    },
    roulette: {
      minBet: {
        type: Number,
        default: 0.01,
        min: 0
      },
      maxBet: {
        type: Number,
        default: 1000,
        min: 0
      },
      houseEdge: {
        type: Number,
        default: 0.05, // 5% house edge
        min: 0,
        max: 0.1
      },
      maxPlayers: {
        type: Number,
        default: 100,
        min: 1
      },
      timeoutSeconds: {
        type: Number,
        default: 20,
        min: 10
      },
      minPlayers: {
        type: Number,
        default: 1,
        min: 1
      }
    }
  },
  
  statistics: {
    totalGamesPlayed: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPlayers: {
      type: Number,
      default: 0,
      min: 0
    },
    averageBetSize: {
      type: Number,
      default: 0,
      min: 0
    },
    averagePayoutSize: {
      type: Number,
      default: 0,
      min: 0
    },
    winRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  maintenanceMode: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
houseSchema.index({ isActive: 1 });
houseSchema.index({ treasuryBalance: 1 });

// Virtual for house edge calculation
houseSchema.virtual('houseEdgePercentage').get(function (this: IHouse): number {
  if (this.totalBetsReceived === 0) return 0;
  return (this.totalProfit / this.totalBetsReceived) * 100;
});

// Add to treasury (when players bet)
houseSchema.methods['addToTreasury'] = async function (this: IHouse, amount: number): Promise<IHouse> {
  this.treasuryBalance += amount;
  this.totalBetsReceived += amount;
  this.totalProfit += amount;
  return this.save();
};

// Deduct from treasury (when players win)
houseSchema.methods['deductFromTreasury'] = async function (this: IHouse, amount: number): Promise<{ success: boolean; message?: string }> {
  if (this.treasuryBalance < amount) {
    return { success: false, message: 'Insufficient treasury balance' };
  }
  
  this.treasuryBalance -= amount;
  this.totalPayoutsGiven += amount;
  this.totalProfit -= amount;
  await this.save();
  return { success: true };
};

// Update game statistics
houseSchema.methods['updateGameStats'] = async function (this: IHouse, betAmount: number, payoutAmount: number, gameType: string): Promise<IHouse> {
  this.statistics.totalGamesPlayed += 1;
  
  // Update average bet size
  const totalBets = this.totalBetsReceived;
  this.statistics.averageBetSize = totalBets / this.statistics.totalGamesPlayed;
  
  // Update average payout size
  const totalPayouts = this.totalPayoutsGiven;
  this.statistics.averagePayoutSize = totalPayouts / this.statistics.totalGamesPlayed;
  
  // Update win rate (house win rate)
  if (payoutAmount < betAmount) {
    // House won this game
    this.statistics.winRate = (this.statistics.winRate * (this.statistics.totalGamesPlayed - 1) + 1) / this.statistics.totalGamesPlayed;
  } else {
    // Player won this game
    this.statistics.winRate = (this.statistics.winRate * (this.statistics.totalGamesPlayed - 1) + 0) / this.statistics.totalGamesPlayed;
  }
  
  return this.save();
};

// Static method to get or create the house
houseSchema.statics['getHouse'] = async function (): Promise<IHouse> {
  let house = await this.findOne({ isActive: true });
  
  if (!house) {
    house = new this({
      name: 'SpinX House',
      treasuryBalance: 0, // Initial treasury balance
      gameSettings: {
        mine: {
          minBet: 0.001,
          maxBet: 1000,
          minMines: 1,
          maxMines: 24,
          houseEdge: 0.01
        },
        coinflip: {
          minBet: 0.001,
          maxBet: 1000,
          houseEdge: 0.01
        },
        crash: {
          minBet: 0.001,
          maxBet: 1000,
          houseEdge: 0.01,
          maxMultiplier: 1000
        }
      }
    });
    
    await house.save();
    console.log('🏠 House created with initial treasury balance:', house.treasuryBalance);
  }
  
  return house;
};

const House = mongoose.model<IHouse, IHouseModel>('House', houseSchema);

export default House;
