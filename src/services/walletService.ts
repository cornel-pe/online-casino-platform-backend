import mongoose from 'mongoose';
import User from '../models/User';
import LedgerEntry from '../models/LedgerEntry';
import WalletBalance from '../models/WalletBalance';

export interface DebitCreditResult {
  success: boolean;
  error?: string;
}

function ensureRef(ref: string): string {
  return ref || `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

class WalletService {
  async getBalance(userId: string | mongoose.Types.ObjectId): Promise<number> {
    const id = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const row = await WalletBalance.findOne({ userId: id }).select('balance').lean();
    if (row) return row.balance;
    const user = await User.findById(id).select('balance').lean();
    return user?.balance ?? 0;
  }

  async debit(
    userId: string | mongoose.Types.ObjectId,
    amount: number,
    ref: string,
    metadata?: Record<string, unknown>
  ): Promise<DebitCreditResult> {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }
    const id = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const refUnique = ensureRef(ref);
    const entryType = (metadata?.type as string) || 'bet';

    const session = await mongoose.startSession();
    try {
      let success = false;
      await session.withTransaction(async () => {
        let wb = await WalletBalance.findOne({ userId: id }).session(session);
        if (!wb) {
          const user = await User.findById(id).select('balance').session(session);
          const current = user?.balance ?? 0;
          if (current < amount) throw new Error('Insufficient balance');
          const balanceAfter = current - amount;
          await WalletBalance.create([{ userId: id, balance: balanceAfter }], { session });
          await LedgerEntry.create(
            [
              {
                userId: id,
                amount: -amount,
                type: entryType,
                ref: refUnique,
                description: (metadata?.description as string) || 'Debit',
                metadata: metadata ?? {},
                balanceAfter,
              },
            ],
            { session }
          );
          await User.updateOne({ _id: id }, { $set: { balance: balanceAfter } }, { session });
          success = true;
          return;
        }
        if (wb.balance < amount) throw new Error('Insufficient balance');
        const balanceAfter = wb.balance - amount;
        await WalletBalance.updateOne(
          { userId: id },
          { $set: { balance: balanceAfter, updatedAt: new Date() } },
          { session }
        );
        await LedgerEntry.create(
          [
            {
              userId: id,
              amount: -amount,
              type: entryType,
              ref: refUnique,
              description: (metadata?.description as string) || 'Debit',
              metadata: metadata ?? {},
              balanceAfter,
            },
          ],
          { session }
        );
        await User.updateOne({ _id: id }, { $set: { balance: balanceAfter } }, { session });
        success = true;
      });
      return success ? { success: true } : { success: false, error: 'Insufficient balance' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Debit failed' };
    } finally {
      await session.endSession();
    }
  }

  async credit(
    userId: string | mongoose.Types.ObjectId,
    amount: number,
    ref: string,
    metadata?: Record<string, unknown>
  ): Promise<DebitCreditResult> {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }
    const id = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const refUnique = ensureRef(ref);
    const entryType = (metadata?.type as string) || 'payout';

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        let wb = await WalletBalance.findOne({ userId: id }).session(session);
        if (!wb) {
          const user = await User.findById(id).select('balance').session(session);
          const current = user?.balance ?? 0;
          const balanceAfter = current + amount;
          await WalletBalance.create([{ userId: id, balance: balanceAfter }], { session });
          await LedgerEntry.create(
            [
              {
                userId: id,
                amount,
                type: entryType,
                ref: refUnique,
                description: (metadata?.description as string) || 'Credit',
                metadata: metadata ?? {},
                balanceAfter,
              },
            ],
            { session }
          );
          await User.updateOne({ _id: id }, { $set: { balance: balanceAfter } }, { session });
          return;
        }
        const balanceAfter = wb.balance + amount;
        await WalletBalance.updateOne(
          { userId: id },
          { $set: { balance: balanceAfter, updatedAt: new Date() } },
          { session }
        );
        await LedgerEntry.create(
          [
            {
              userId: id,
              amount,
              type: entryType,
              ref: refUnique,
              description: (metadata?.description as string) || 'Credit',
              metadata: metadata ?? {},
              balanceAfter,
            },
          ],
          { session }
        );
        await User.updateOne({ _id: id }, { $set: { balance: balanceAfter } }, { session });
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Credit failed' };
    } finally {
      await session.endSession();
    }
  }
}

const walletService = new WalletService();
export default walletService;
