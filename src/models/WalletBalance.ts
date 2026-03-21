import mongoose, { Document, Schema } from 'mongoose';

export interface IWalletBalance extends Document {
  userId: mongoose.Types.ObjectId;
  balance: number;
  updatedAt: Date;
}

const schema = new Schema<IWalletBalance>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    balance: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IWalletBalance>('WalletBalance', schema);
