import House, { IHouse } from '../models/House';
import Transaction from '../models/Transaction';
import TransactionService from './transactionService';
import mongoose from 'mongoose';

export interface HouseTransactionData {
  type: 'bet_received' | 'payout_given' | 'deposit' | 'withdrawal' | 'adjustment';
  amount: number;
  gameType?: string;
  gameId?: string;
  userId?: string;
  description: string;
  ref: string;
}

export interface HouseTransactionResult {
  success: boolean;
  house?: IHouse;
  transaction?: any;
  error?: string;
}

class HouseService {
  /**
   * Get or create the house
   */
  async getHouse(): Promise<IHouse> {
    return await House.getHouse();
  }

  /**
   * Process a bet (player bets, house receives)
   */
  async processBet(
    betAmount: number,
    gameType: string,
    gameId: string,
    userId: string,
    ref: string
  ): Promise<HouseTransactionResult> {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Get or create house
        const house = await House.getHouse();

        // Add to treasury
        await house.addToTreasury(betAmount);

        // Create house transaction record using the new clean system
        const houseTransaction = await TransactionService.createTransaction({
          amount: betAmount,
          from: new mongoose.Types.ObjectId(userId),
          to: new mongoose.Types.ObjectId('000000000000000000000000'), // House
          type: 'bet',
          description: `House received bet of ${betAmount} from ${gameType} game`,
          ref: `house_bet_${ref}`,
          gameType: gameType,
          gameId: mongoose.Types.ObjectId.isValid(gameId) ? new mongoose.Types.ObjectId(gameId) : new mongoose.Types.ObjectId(),
          metadata: {
            betAmount: betAmount,
            gameType: gameType,
            gameId: gameId,
            userId: userId,
            houseBalance: house.treasuryBalance
          }
        });

        return {
          success: true,
          house,
          transaction: houseTransaction
        };
      });

      // Get final result
      const house = await House.findOne({ isActive: true });
      const transaction = await Transaction.findOne({ ref: `house_bet_${ref}` });
      
      return {
        success: true,
        house,
        transaction
      };

    } catch (error) {
      console.error('House bet processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Process a payout (player wins, house pays)
   */
  async processPayout(
    payoutAmount: number,
    gameType: string,
    gameId: string,
    userId: string,
    ref: string
  ): Promise<HouseTransactionResult> {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Get or create house
        const house = await House.getHouse();

        // Deduct from treasury
        const deductResult = await house.deductFromTreasury(payoutAmount);
        if (!deductResult.success) {
          throw new Error(deductResult.message || 'Failed to deduct from treasury');
        }

        // Create house transaction record using the new clean system
        const houseTransaction = await TransactionService.createTransaction({
          amount: payoutAmount,
          from: new mongoose.Types.ObjectId('000000000000000000000000'), // House
          to: new mongoose.Types.ObjectId(userId),
          type: 'payout',
          description: `House paid out ${payoutAmount} to player from ${gameType} game`,
          ref: `house_payout_${ref}`,
          gameType: gameType,
          gameId: mongoose.Types.ObjectId.isValid(gameId) ? new mongoose.Types.ObjectId(gameId) : new mongoose.Types.ObjectId(),
          metadata: {
            payoutAmount: payoutAmount,
            gameType: gameType,
            gameId: gameId,
            userId: userId,
            houseBalance: house.treasuryBalance
          }
        });

        return {
          success: true,
          house,
          transaction: houseTransaction
        };
      });

      // Get final result
      const house = await House.findOne({ isActive: true });
      const transaction = await Transaction.findOne({ ref: `house_payout_${ref}` });
      
      return {
        success: true,
        house,
        transaction
      };

    } catch (error) {
      console.error('House payout processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Update house statistics after a game
   */
  async updateGameStats(
    betAmount: number,
    payoutAmount: number,
    gameType: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const house = await this.getHouse();
      await house.updateGameStats(betAmount, payoutAmount, gameType);
      
      return { success: true };
    } catch (error) {
      console.error('House stats update error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get house statistics
   */
  async getHouseStats(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const house = await this.getHouse();
      
      const stats = {
        treasuryBalance: house.treasuryBalance,
        totalBetsReceived: house.totalBetsReceived,
        totalPayoutsGiven: house.totalPayoutsGiven,
        totalProfit: house.totalProfit,
        houseEdgePercentage: house.houseEdgePercentage,
        statistics: house.statistics,
        gameSettings: house.gameSettings,
        isActive: house.isActive,
        maintenanceMode: house.maintenanceMode
      };

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('Get house stats error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Adjust treasury balance (admin only)
   */
  async adjustTreasury(
    amount: number,
    reason: string,
    adminUserId: string
  ): Promise<HouseTransactionResult> {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        const house = await House.findOne({ isActive: true }).session(session);
        if (!house) {
          throw new Error('House not found');
        }

        const oldBalance = house.treasuryBalance;
        house.treasuryBalance += amount;
        await house.save({ session });

        // Create adjustment transaction using the new clean system
        const adjustmentTransaction = await TransactionService.createTransaction({
          amount: Math.abs(amount),
          from: amount > 0 ? new mongoose.Types.ObjectId('000000000000000000000000') : new mongoose.Types.ObjectId(adminUserId),
          to: amount > 0 ? new mongoose.Types.ObjectId(adminUserId) : new mongoose.Types.ObjectId('000000000000000000000000'),
          type: amount > 0 ? 'deposit' : 'withdrawal',
          description: `Treasury adjusted by ${amount}: ${reason}`,
          ref: `house_adjustment_${Date.now()}`,
          metadata: {
            oldBalance: oldBalance,
            newBalance: house.treasuryBalance,
            adjustmentAmount: amount,
            reason: reason,
            adminUserId: adminUserId
          }
        });

        return {
          success: true,
          house,
          transaction: adjustmentTransaction
        };
      });

      const house = await House.findOne({ isActive: true });
      const transaction = await Transaction.findOne({ 
        ref: { $regex: /^house_adjustment_/ },
        'metadata.adminUserId': adminUserId
      }).sort({ createdAt: -1 });
      
      return {
        success: true,
        house,
        transaction
      };

    } catch (error) {
      console.error('Treasury adjustment error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get house transaction history
   */
  async getHouseTransactionHistory(
    options: {
      page?: number;
      limit?: number;
      type?: string;
      gameType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    const {
      page = 1,
      limit = 50,
      type,
      gameType,
      startDate,
      endDate
    } = options;

    const skip = (page - 1) * limit;
    const query: any = { 
      userId: new mongoose.Types.ObjectId('000000000000000000000000') // House transactions
    };

    // Add filters
    if (type) query.type = type;
    if (gameType) query.gameType = gameType;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const transactions = await Transaction.find(query)
      .populate('gameId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Transaction.countDocuments(query);

    return {
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }
}

export default new HouseService();
