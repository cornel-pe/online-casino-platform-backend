import mongoose, { Document, Schema } from 'mongoose';

export interface IUserWallet extends Document {
  user: mongoose.Types.ObjectId;
  openId: string; // Payment system user ID
  chainId: string; // Blockchain chain ID
  address: string; // Wallet address
  tokenId?: string; // Token ID for specific token wallets
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userWalletSchema = new Schema<IUserWallet>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    openId: {
      type: String,
      required: true,
      index: true
    },
    chainId: {
      type: String,
      required: true,
      index: true
    },
    address: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    tokenId: {
      type: String,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for efficient queries
userWalletSchema.index({ user: 1, chainId: 1 });
userWalletSchema.index({ openId: 1, chainId: 1 });
userWalletSchema.index({ address: 1, chainId: 1 });

// Ensure unique combination of user, chainId, and tokenId
userWalletSchema.index(
  { user: 1, chainId: 1, tokenId: 1 },
  { unique: true, partialFilterExpression: { tokenId: { $ne: null } } }
);

export const UserWallet = mongoose.model<IUserWallet>('UserWallet', userWalletSchema);
