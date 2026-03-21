import mongoose from 'mongoose';
import Transaction, { ITransaction } from '../models/Transaction';
import User from '../models/User';
import House from '../models/House';
import walletService from './walletService';

// House ID constant
const HOUSE_ID = new mongoose.Types.ObjectId('000000000000000000000000');

export interface CreateTransactionParams {
  amount: number;
  from: mongoose.Types.ObjectId;
  to: mongoose.Types.ObjectId;
  type: 'deposit' | 'withdrawal' | 'bet' | 'payout' | 'house_profit' | 'refund' | 'bonus' | 'fee';
  description: string;
  ref: string;
  gameType?: string;
  gameId?: mongoose.Types.ObjectId;
  metadata?: any;
}

export interface GameTransactionParams {
  userId: mongoose.Types.ObjectId;
  gameType: string;
  gameId: mongoose.Types.ObjectId;
  betAmount: number;
  payoutAmount?: number;
  description: string;
  metadata?: any;
}

class TransactionService {
  /**
   * Create a single transaction
   */
  static async createTransaction(params: CreateTransactionParams): Promise<ITransaction> {
    // Generate hash for the transaction
    const crypto = require('crypto');
    const data = `${params.from}-${params.to}-${params.amount}-${params.type}-${params.ref}-${Date.now()}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');

    const transaction = new Transaction({
      amount: params.amount,
      from: params.from,
      to: params.to,
      type: params.type,
      description: params.description,
      ref: params.ref,
      gameType: params.gameType,
      gameId: params.gameId,
      metadata: params.metadata || {},
      hash: hash
    });

    return await transaction.save();
  }

  /**
   * Create a game transaction (bet + payout if won)
   */
  static async createGameTransaction(params: GameTransactionParams): Promise<{
    betTransaction: ITransaction;
    payoutTransaction?: ITransaction;
  }> {
    const session = await mongoose.startSession();
    
    try {
      let result: { betTransaction: ITransaction; payoutTransaction?: ITransaction };
      
      await session.withTransaction(async () => {
        // 1. Create bet transaction (user -> house)
        const betTransaction = await this.createTransaction({
          amount: params.betAmount,
          from: params.userId,
          to: HOUSE_ID,
          type: 'bet',
          description: params.description,
          ref: params.gameId.toString(),
          gameType: params.gameType,
          gameId: params.gameId,
          metadata: {
            ...params.metadata,
            originalBet: params.betAmount
          }
        });

        // 2. Update user balance via ledger (deduct bet)
        const debitResult = await walletService.debit(
          params.userId,
          params.betAmount,
          `game_bet_${params.gameType}_${params.gameId}_${params.userId}`,
          { type: 'bet', description: params.description }
        );
        if (!debitResult.success) throw new Error(debitResult.error || 'Insufficient balance');

        // 3. Update house balance (add bet)
        await House.findOneAndUpdate(
          {},
          { $inc: { treasuryBalance: params.betAmount } },
          { session, upsert: true }
        );

        let payoutTransaction: ITransaction | undefined;

        // 4. If there's a payout, create payout transaction (house -> user)
        if (params.payoutAmount && params.payoutAmount > 0) {
          payoutTransaction = await this.createTransaction({
            amount: params.payoutAmount,
            from: HOUSE_ID,
            to: params.userId,
            type: 'payout',
            description: `${params.description} - Payout`,
            ref: params.gameId.toString(),
            gameType: params.gameType,
            gameId: params.gameId,
            metadata: {
              ...params.metadata,
              multiplier: params.payoutAmount / params.betAmount,
              originalBet: params.betAmount
            }
          });

          // 5. Update user balance via ledger (add payout)
          const creditResult = await walletService.credit(
            params.userId,
            params.payoutAmount,
            `game_payout_${params.gameType}_${params.gameId}_${params.userId}`,
            { type: 'payout', description: `${params.description} - Payout` }
          );
          if (!creditResult.success) throw new Error(creditResult.error || 'Credit failed');

          // 6. Update house balance (deduct payout)
          await House.findOneAndUpdate(
            {},
            { $inc: { treasuryBalance: -params.payoutAmount } },
            { session, upsert: true }
          );

          // 7. Create house profit transaction (if house made profit)
          const houseProfit = params.betAmount - params.payoutAmount;
          if (houseProfit > 0) {
            await this.createTransaction({
              amount: houseProfit,
              from: params.userId, // Technically from the game
              to: HOUSE_ID,
              type: 'house_profit',
              description: `${params.description} - House Profit`,
              ref: params.gameId.toString(),
              gameType: params.gameType,
              gameId: params.gameId,
              metadata: {
                betAmount: params.betAmount,
                payoutAmount: params.payoutAmount,
                houseEdge: (houseProfit / params.betAmount) * 100
              }
            });
          }
        }

        result = { betTransaction, payoutTransaction };
      });
      
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Create deposit transaction
   */
  static async createDeposit(
    userId: mongoose.Types.ObjectId,
    amount: number,
    description: string,
    ref: string,
    metadata?: any
  ): Promise<ITransaction> {
    const session = await mongoose.startSession();
    
    try {
      let result: ITransaction;
      
      await session.withTransaction(async () => {
        // Create deposit transaction (external -> user)
        const transaction = await this.createTransaction({
          amount,
          from: HOUSE_ID, // External source
          to: userId,
          type: 'deposit',
          description,
          ref,
          metadata
        });

        // Update user balance via ledger
        const creditResult = await walletService.credit(
          userId,
          amount,
          `deposit_${ref}_${userId}`,
          { type: 'deposit', description }
        );
        if (!creditResult.success) throw new Error(creditResult.error || 'Credit failed');

        result = transaction;
      });
      
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Create withdrawal transaction
   */
  static async createWithdrawal(
    userId: mongoose.Types.ObjectId,
    amount: number,
    description: string,
    ref: string,
    metadata?: any
  ): Promise<ITransaction> {
    const session = await mongoose.startSession();
    
    try {
      let result: ITransaction;
      
      await session.withTransaction(async () => {
        // Create withdrawal transaction (user -> external)
        const transaction = await this.createTransaction({
          amount,
          from: userId,
          to: HOUSE_ID, // External destination
          type: 'withdrawal',
          description,
          ref,
          metadata
        });

        // Update user balance via ledger
        const debitResult = await walletService.debit(
          userId,
          amount,
          `withdrawal_${ref}_${userId}`,
          { type: 'withdrawal', description }
        );
        if (!debitResult.success) throw new Error(debitResult.error || 'Insufficient balance');

        result = transaction;
      });
      
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get house transactions only (for statistics)
   */
  static async getHouseTransactions(filters: {
    startDate?: Date;
    endDate?: Date;
    type?: string;
    gameType?: string;
  } = {}) {
    const matchConditions: any = {
      $or: [
        { from: HOUSE_ID },
        { to: HOUSE_ID }
      ]
    };

    if (filters.startDate || filters.endDate) {
      matchConditions.createdAt = {};
      if (filters.startDate) matchConditions.createdAt.$gte = filters.startDate;
      if (filters.endDate) matchConditions.createdAt.$lte = filters.endDate;
    }

    if (filters.type) {
      matchConditions.type = filters.type;
    }

    if (filters.gameType) {
      matchConditions.gameType = filters.gameType;
    }

    return await Transaction.find(matchConditions).sort({ createdAt: -1 });
  }

  /**
   * Get user transactions
   */
  static async getUserTransactions(
    userId: mongoose.Types.ObjectId,
    filters: {
      startDate?: Date;
      endDate?: Date;
      type?: string;
      gameType?: string;
    } = {}
  ) {
    const matchConditions: any = {
      $or: [
        { from: userId },
        { to: userId }
      ]
    };

    if (filters.startDate || filters.endDate) {
      matchConditions.createdAt = {};
      if (filters.startDate) matchConditions.createdAt.$gte = filters.startDate;
      if (filters.endDate) matchConditions.createdAt.$lte = filters.endDate;
    }

    if (filters.type) {
      matchConditions.type = filters.type;
    }

    if (filters.gameType) {
      matchConditions.gameType = filters.gameType;
    }

    return await Transaction.find(matchConditions).sort({ createdAt: -1 });
  }

  /**
   * Get house statistics
   */
  static async getHouseStats(filters: {
    startDate?: Date;
    endDate?: Date;
    gameType?: string;
  } = {}) {
    const matchConditions: any = {
      $or: [
        { from: HOUSE_ID },
        { to: HOUSE_ID }
      ]
    };

    if (filters.startDate || filters.endDate) {
      matchConditions.createdAt = {};
      if (filters.startDate) matchConditions.createdAt.$gte = filters.startDate;
      if (filters.endDate) matchConditions.createdAt.$lte = filters.endDate;
    }

    if (filters.gameType) {
      matchConditions.gameType = filters.gameType;
    }

    const stats = await Transaction.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalBets: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'bet'] }, { $eq: ['$to', HOUSE_ID] }] },
                '$amount',
                0
              ]
            }
          },
          totalPayouts: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'payout'] }, { $eq: ['$from', HOUSE_ID] }] },
                '$amount',
                0
              ]
            }
          },
          totalDeposits: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'deposit'] }, { $eq: ['$to', HOUSE_ID] }] },
                '$amount',
                0
              ]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'withdrawal'] }, { $eq: ['$from', HOUSE_ID] }] },
                '$amount',
                0
              ]
            }
          },
          totalHouseProfit: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'house_profit'] },
                '$amount',
                0
              ]
            }
          }
        }
      }
    ]);

    return stats[0] || {
      totalBets: 0,
      totalPayouts: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalHouseProfit: 0
    };
  }
}

export default TransactionService;