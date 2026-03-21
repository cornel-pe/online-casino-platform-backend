import mongoose, { Document, Schema } from 'mongoose';

export interface IToken extends Document {
  name: string;
  symbol: string;
  price: number; // Price in USD
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tokenSchema = new Schema<IToken>({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  symbol: {
    type: String,
    required: true,
    unique: true,
  },
  price: {
    type: Number,
    required: true,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Index for faster queries (symbol has unique index)
tokenSchema.index({ isActive: 1 });

export default mongoose.model<IToken>('Token', tokenSchema);
