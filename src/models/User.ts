import mongoose, { Document, Schema } from 'mongoose';

// Interface for User document
export interface IUser extends Document {
  // Supabase authentication
  supabaseId?: string;
  
  // Legacy wallet authentication (optional)
  walletAddress?: string;
  userId?: string;
  username?: string;
  displayName?: string;
  email?: string;
  bio?: string;
  avatar?: string;
  password?: string;
  nonce?: string;
  signature?: string;
  isVerified: boolean;
  verified: boolean; // email verified
  discordName?: string;
  discordAvatar?: string;
  xUsername?: string;
  isActive: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  isFrozen: boolean;
  banReason?: string;
  freezeReason?: string;
  bannedAt?: Date;
  frozenAt?: Date;
  lastActive: Date;
  totalBets: number;
  totalWins: number;
  totalLosses: number;
  totalWagered: number;
  totalWon: number;
  balance: number;
  chatEnabled: boolean;
  paymentAccount: boolean;
  seed?: string;
  lastLogin: Date;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;

  // Virtual properties
  winRate: string;
  profitLoss: number;
  exp: number;
  level: number;

  // Methods
  generateSeed(): string;
  getPaymentOpenId(): string;
  deductBalance(amount: number): Promise<{ success: boolean; message?: string }>;
  addBalance(amount: number): Promise<IUser>;
  isAdminUser(): boolean;
}

// Static methods interface
export interface IUserModel extends mongoose.Model<IUser> {
  findByPaymentOpenId(openId: string): Promise<IUser | null>;
}

const userSchema = new Schema<IUser>({
  // Supabase authentication
  supabaseId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  
  // Legacy wallet authentication (optional)
  userId: {
    type: String,
    default: null,
  },
  
  walletAddress: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },

  // Profile information
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },

  displayName: {
    type: String,
    trim: true,
    maxlength: 50,
    default: null
  },

  email: {
    type: String,
    required: false, // Made optional for wallet-only auth
    lowercase: true,
    trim: true,
    default: null,
    unique: true, // ensure uniqueness if present
    sparse: true, // allow multiple nulls
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },

  bio: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null
  },

  avatar: {
    type: String,
    default: null
  },

  // Authentication
  password: {
    type: String,
    default: null,
    select: false
  },

  nonce: {
    type: String,
    default: null
  },

  signature: {
    type: String,
    default: null
  },

  // User status
  isVerified: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  // Social fields
  discordName: {
    type: String,
    default: null
  },
  discordAvatar: {
    type: String,
    default: null
  },
  xUsername: {
    type: String,
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
  },

  isAdmin: {
    type: Boolean,
    default: false
  },

  isBanned: {
    type: Boolean,
    default: false
  },

  isFrozen: {
    type: Boolean,
    default: false
  },

  banReason: {
    type: String,
    default: null
  },

  freezeReason: {
    type: String,
    default: null
  },

  bannedAt: {
    type: Date,
    default: null
  },

  frozenAt: {
    type: Date,
    default: null
  },

  lastActive: {
    type: Date,
    default: Date.now
  },

  // Betting statistics
  totalBets: {
    type: Number,
    default: 0
  },

  totalWins: {
    type: Number,
    default: 0
  },

  totalLosses: {
    type: Number,
    default: 0
  },

  totalWagered: {
    type: Number,
    default: 0
  },

  totalWon: {
    type: Number,
    default: 0
  },

  // Balance (in SOL or tokens)
  balance: {
    type: Number,
    default: 100 // Initial balance for new users
  },

  // Chat settings
  chatEnabled: {
    type: Boolean,
    default: true
  },

  // Payment account status
  paymentAccount: {
    type: Boolean,
    default: false
  },

  // Provably fair gaming seed
  seed: {
    type: String,
    default: null
  },

  // Timestamps
  lastLogin: {
    type: Date,
    default: Date.now
  },

  lastActivity: {
    type: Date,
    default: Date.now
  },
  exp: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 0
  },
}, {
  timestamps: true
});

// Index for better query performance (supabaseId, walletAddress, username already have unique indexes)
userSchema.index({ isActive: 1 });

// Virtual for win rate
userSchema.virtual('winRate').get(function (this: IUser): string {
  if (this.totalBets === 0) return '0.00';
  return ((this.totalWins / this.totalBets) * 100).toFixed(2);
});

// Virtual for profit/loss
userSchema.virtual('profitLoss').get(function (this: IUser): number {
  return this.totalWon - this.totalWagered;
});

// Generate unique username
userSchema.statics['generateUniqueUsername'] = async function (): Promise<string> {
  const adjectives = [
    'Swift', 'Brave', 'Clever', 'Bold', 'Wise', 'Quick', 'Sharp', 'Bright',
    'Calm', 'Wild', 'Free', 'Pure', 'True', 'Fair', 'Kind', 'Warm',
    'Cool', 'Fresh', 'New', 'Old', 'Young', 'Smart', 'Fast', 'Slow',
    'High', 'Low', 'Deep', 'Wide', 'Long', 'Short', 'Big', 'Small'
  ];

  const nouns = [
    'Wolf', 'Eagle', 'Lion', 'Tiger', 'Bear', 'Fox', 'Hawk', 'Falcon',
    'Dragon', 'Phoenix', 'Unicorn', 'Griffin', 'Knight', 'Warrior', 'Mage',
    'Archer', 'Guard', 'Scout', 'Ranger', 'Hunter', 'Trader', 'Gambler',
    'Player', 'Winner', 'Champion', 'Hero', 'Legend', 'Master', 'Expert',
    'Pro', 'Elite', 'Veteran', 'Rookie', 'Novice', 'Beginner', 'Amateur'
  ];

  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 999) + 1;

    const username = `${adjective}${noun}${number}`;

    // Check if username exists
    const existingUser = await this.findOne({ username });
    if (!existingUser) {
      return username;
    }

    attempts++;
  }

  // Fallback: use timestamp-based username
  const timestamp = Date.now().toString(36);
  return `User${timestamp}`;
};

// Generate nonce for wallet authentication
userSchema.methods['generateNonce'] = function (this: IUser): string {
  this.nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return this.nonce;
};

// Generate seed for provably fair gaming
userSchema.methods['generateSeed'] = function (this: IUser): string {
  const crypto = require('crypto');
  this.seed = crypto.randomBytes(32).toString('hex');
  return this.seed;
};

// Verify wallet signature
userSchema.methods['verifySignature'] = function (this: IUser, signature: string): boolean {
  // This would typically use Solana's verification methods
  // For now, we'll store the signature and verify it later
  this.signature = signature;
  return true;
};

// Update last activity
userSchema.methods['updateActivity'] = async function (this: IUser): Promise<IUser> {
  this.lastActivity = new Date();
  return this.save();
};

// Update betting statistics
userSchema.methods['updateBettingStats'] = async function (this: IUser, betAmount: number, won: boolean, winAmount: number = 0): Promise<IUser> {
  this.totalBets += 1;
  this.totalWagered += betAmount;

  if (won) {
    this.totalWins += 1;
    this.totalWon += winAmount;
  } else {
    this.totalLosses += 1;
  }

  return this.save();
};

// Deduct balance for betting (ledger-based)
userSchema.methods['deductBalance'] = async function (this: IUser, amount: number): Promise<{ success: boolean; message?: string }> {
  const walletService = require('../services/walletService').default;
  const ref = `user_deduct_${this._id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await walletService.debit(this._id, amount, ref, { type: 'bet', description: 'Balance deduction' });
  if (result.success) {
    this.balance = await walletService.getBalance(this._id);
  }
  return result;
};

// Add balance (for winnings) (ledger-based)
userSchema.methods['addBalance'] = async function (this: IUser, amount: number): Promise<IUser> {
  const walletService = require('../services/walletService').default;
  const ref = `user_add_${this._id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await walletService.credit(this._id, amount, ref, { type: 'payout', description: 'Balance credit' });
  if (result.success) {
    this.balance = await walletService.getBalance(this._id);
  }
  return this;
};

// Check if user is admin
userSchema.methods['isAdminUser'] = function (this: IUser): boolean {
  return this.isAdmin === true;
};

// Generate payment OpenId from ObjectId
userSchema.methods['getPaymentOpenId'] = function (this: IUser): string {
  // Convert ObjectId to a consistent UUID-like string
  const objectIdString = this._id.toString();
  
  // Create a deterministic UUID from ObjectId
  // This ensures the same ObjectId always generates the same OpenId
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(objectIdString).digest('hex');
  
  // Format as UUID-like string: SPINX_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
  
  return `SPINX_${uuid}`;
};

// Static method to find user by payment OpenId
userSchema.statics['findByPaymentOpenId'] = async function(openId: string): Promise<IUser | null> {
  // Extract the UUID part from the OpenId
  const uuidPart = openId.replace('SPINX_', '');
  
  // Find all users and check which one generates the matching OpenId
  const users = await this.find({});
  
  for (const user of users) {
    if (user.getPaymentOpenId() === openId) {
      return user;
    }
  }
  
  return null;
};

const User = mongoose.model<IUser, IUserModel>('User', userSchema);

export default User; 