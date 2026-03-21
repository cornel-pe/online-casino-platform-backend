import mongoose, { Document, Schema } from 'mongoose';

export type LedgerEntryType =
  | 'deposit'
  | 'withdrawal'
  | 'bet'
  | 'payout'
  | 'refund'
  | 'bonus'
  | 'fee'
  | 'adjustment';

export interface ILedgerEntry extends Document {
  userId: mongoose.Types.ObjectId;
  /** Signed: positive = credit, negative = debit */
  amount: number;
  type: LedgerEntryType;
  ref: string;
  description?: string;
  metadata?: Record<string, unknown>;
  balanceAfter?: number;
  createdAt: Date;
}

const schema = new Schema<ILedgerEntry>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'bet', 'payout', 'refund', 'bonus', 'fee', 'adjustment'],
      required: true,
    },
    ref: { type: String, required: true, unique: true },
    description: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    balanceAfter: { type: Number },
  },
  { timestamps: true }
);

schema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<ILedgerEntry>('LedgerEntry', schema);
