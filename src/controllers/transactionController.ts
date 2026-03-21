import { Request, Response } from 'express';
import mongoose from 'mongoose';
import TransactionService from '../services/transactionService';
import Transaction from '../models/Transaction';
import User, { IUser } from '../models/User';
import { isAdminById } from '../utils/adminUtils';
import { getParam } from '../utils/requestParams';

interface AuthRequest extends Request {
  user?: IUser;
}

class TransactionController {
  // Get user's transaction history
  async getUserTransactions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const {
        page = 1,
        limit = 50,
        type,
        gameType,
        startDate,
        endDate
      } = req.query;

      const options = {
        page: Number(page),
        limit: Number(limit),
        type: type as string,
        gameType: gameType as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      };

      const result = await TransactionService.getUserTransactions(new mongoose.Types.ObjectId(userId), options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get user transactions error:', error);
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  }

  // Get transaction history with pagination and filtering (similar to mine game history)
  async getTransactionHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const {
        page = 1,
        limit = 10,
        search = '',
        transactionType = 'all', // 'all', 'my'
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Build query for game transactions
      let gameQuery: any = {};

      // Filter by user if not 'all'
      if (transactionType === 'my') {
        gameQuery.from = new mongoose.Types.ObjectId(userId);
      }

      // Search functionality for game transactions
      if (search && typeof search === 'string') {
        const searchRegex = new RegExp(search, 'i');
        gameQuery.$or = [
          { description: searchRegex },
          { ref: searchRegex },
          { type: searchRegex }
        ];

        // If search looks like an ObjectId, try to search by _id
        if (search.match(/^[0-9a-fA-F]{24}$/)) {
          gameQuery.$or.push({ _id: search });
        }
      }

      // Shared build: payment module removed; only game transactions
      const gameTransactions = await Transaction.find(gameQuery).lean();

      const allTransactions = gameTransactions.map((transaction: any) => ({
        id: Buffer.from(transaction._id.toString()).toString('base64'),
        user: {
          id: transaction.from,
          username: 'User',
          avatar: null as string | null
        },
        amount: transaction.amount,
        type: transaction.type,
        name: transaction.description,
        description: transaction.description,
        ref: transaction.ref,
        gameType: transaction.gameType || null,
        gameId: transaction.gameId ? Buffer.from(transaction.gameId.toString()).toString('base64') : null,
        status: transaction.status,
        hash: transaction.hash,
        time: transaction.createdAt,
        _sortTime: transaction.createdAt.getTime()
      }));

      // Sort merged transactions
      const sortField = sortBy === 'amount' ? 'amount' : 
                       sortBy === 'type' ? 'type' : '_sortTime';
      const sortDirection = sortOrder === 'asc' ? 1 : -1;
      
      allTransactions.sort((a: any, b: any) => {
        if (sortField === 'amount' || sortField === 'type') {
          return sortDirection * (a[sortField] > b[sortField] ? 1 : -1);
        }
        return sortDirection * (a._sortTime - b._sortTime);
      });

      // Apply pagination
      const totalCount = allTransactions.length;
      const paginatedTransactions = allTransactions.slice(skip, skip + limitNum);

      // Format final transactions (convert time to ISO string and remove _sortTime)
      const formattedTransactions = paginatedTransactions.map((transaction: any) => {
        const { _sortTime, time, ...rest } = transaction;
        return {
          ...rest,
          time: time.toISOString ? time.toISOString() : new Date(time).toISOString()
        };
      });

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        success: true,
        data: {
          transactions: formattedTransactions,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalItems: totalCount,
            itemsPerPage: limitNum
          }
        }
      });
    } catch (error) {
      console.error('Get transaction history error:', error);
      res.status(500).json({ error: 'Failed to get transaction history' });
    }
  }

  // Get transaction by reference ID
  async getTransactionByRef(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const ref = getParam(req, 'ref');
      if (!ref) {
        res.status(400).json({ error: 'Reference required' });
        return;
      }
      const transaction = await Transaction.findOne({ ref });

      if (!transaction) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }
      console.log('game.player', transaction.from.toString(), userId.toString())

      // Check if user owns this transaction
      if (transaction.from.toString() !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      console.error('Get transaction by ref error:', error);
      res.status(500).json({ error: 'Failed to get transaction' });
    }
  }

  // Get user's transaction statistics
  async getUserTransactionStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { period } = req.query;
      const stats = await TransactionService.getUserTransactions(
        new mongoose.Types.ObjectId(userId),
        { 
          startDate: new Date(Date.now() - (period === 'day' ? 24*60*60*1000 : 
                                          period === 'week' ? 7*24*60*60*1000 :
                                          period === 'month' ? 30*24*60*60*1000 :
                                          365*24*60*60*1000))
        }
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get transaction stats error:', error);
      res.status(500).json({ error: 'Failed to get transaction statistics' });
    }
  }

  // Get transaction statistics for the history page
  async getTransactionStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Get user's game transaction statistics
      const gameStats = await Transaction.aggregate([
        {
          $match: { from: new mongoose.Types.ObjectId(userId) }
        },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalBets: {
              $sum: {
                $cond: [{ $eq: ['$type', 'bet'] }, '$amount', 0]
              }
            },
            totalWins: {
              $sum: {
                $cond: [{ $eq: ['$type', 'payout'] }, '$amount', 0]
              }
            },
            avgTransactionAmount: { $avg: '$amount' },
            maxTransactionAmount: { $max: '$amount' }
          }
        }
      ]);

      // Shared build: payment module removed; payment stats are zero
      const gameStatsData = gameStats[0] || {
        totalTransactions: 0,
        totalBets: 0,
        totalWins: 0,
        avgTransactionAmount: 0,
        maxTransactionAmount: 0
      };

      const totalTransactions = gameStatsData.totalTransactions;
      const netDeposits = 0;
      const netWinnings = gameStatsData.totalWins - gameStatsData.totalBets;
      const totalProfit = netDeposits + netWinnings;

      res.json({
        success: true,
        data: {
          totalTransactions,
          totalDeposits: 0,
          totalWithdrawals: 0,
          totalBets: gameStatsData.totalBets,
          totalWins: gameStatsData.totalWins,
          netDeposits,
          netWinnings,
          totalProfit,
          avgTransactionAmount: gameStatsData.avgTransactionAmount,
          maxTransactionAmount: gameStatsData.maxTransactionAmount
        }
      });
    } catch (error) {
      console.error('Get transaction stats error:', error);
      res.status(500).json({ error: 'Failed to get transaction statistics' });
    }
  }

  // Create a transaction (admin only - for deposits/withdrawals)
  async createTransaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user is admin
      const isAdmin = await isAdminById(userId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const {
        targetUserId,
        amount,
        type,
        name,
        description,
        ref,
        gameType,
        gameId,
        hash,
        status = 'completed',
        metadata
      } = req.body;

      if (!targetUserId || !amount || !type || !name || !description || !ref) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const result = await TransactionService.createTransaction({
        amount: Number(amount),
        from: new mongoose.Types.ObjectId(targetUserId),
        to: new mongoose.Types.ObjectId('000000000000000000000000'), // House
        type,
        description,
        ref,
        gameType,
        gameId: gameId ? new mongoose.Types.ObjectId(gameId) : undefined,
        metadata
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Create transaction error:', error);
      res.status(500).json({ error: 'Failed to create transaction' });
    }
  }

  // Update transaction status (admin only)
  async updateTransactionStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user is admin
      const isAdmin = await isAdminById(userId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const ref = getParam(req, 'ref');
      if (!ref) {
        res.status(400).json({ error: 'Reference required' });
        return;
      }
      const { status } = req.body;

      if (!status) {
        res.status(400).json({ error: 'Status is required' });
        return;
      }

      const result = await Transaction.findOneAndUpdate(
        { ref },
        { status },
        { new: true }
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Update transaction status error:', error);
      res.status(500).json({ error: 'Failed to update transaction status' });
    }
  }

  // Get user's game history with enhanced filtering
  async getUserGameHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        gameType,
        result,
        startDate,
        endDate
      } = req.query;

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Build match conditions for game transactions
      const matchConditions: any = {
        $or: [
          { from: new mongoose.Types.ObjectId(userId) },
          { to: new mongoose.Types.ObjectId(userId) }
        ],
        type: { $in: ['bet', 'payout'] },
        gameType: { $exists: true, $ne: null }
      };

      // Apply filters
      if (gameType && gameType !== 'all') {
        matchConditions.gameType = gameType;
      }

      if (startDate || endDate) {
        matchConditions.createdAt = {};
        if (startDate) matchConditions.createdAt.$gte = new Date(startDate as string);
        if (endDate) matchConditions.createdAt.$lte = new Date(endDate as string);
      }

      // Get total count
      const total = await Transaction.countDocuments(matchConditions);

      // Get transactions with pagination
      const transactions = await Transaction.find(matchConditions)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Process transactions to create game history entries
      const gameHistory = [];
      const processedGames = new Set();

      for (const transaction of transactions) {
        const gameId = transaction.gameId?.toString();
        if (!gameId || processedGames.has(gameId)) continue;

        // Find related transactions for this game
        const gameTransactions = transactions.filter(t => 
          t.gameId?.toString() === gameId
        );

        const betTransaction = gameTransactions.find(t => t.type === 'bet');
        const payoutTransaction = gameTransactions.find(t => t.type === 'payout');

        if (!betTransaction) continue;

        const isWin = payoutTransaction && payoutTransaction.amount > 0;
        const betAmount = betTransaction.amount;
        const payoutAmount = payoutTransaction?.amount || 0;
        const profitLoss = payoutAmount - betAmount;

        // Apply result filter
        if (result && result !== 'all') {
          if (result === 'win' && !isWin) continue;
          if (result === 'loss' && isWin) continue;
        }

        const gameHistoryEntry = {
          id: gameId,
          gameType: betTransaction.gameType,
          gameName: betTransaction.gameType,
          date: betTransaction.createdAt.toISOString(),
          betAmount,
          payoutAmount,
          result: isWin ? 'win' : 'loss',
          profitLoss,
          multiplier: payoutTransaction?.metadata?.multiplier,
          description: betTransaction.description,
          gameId,
          status: betTransaction.status,
          metadata: betTransaction.metadata
        };

        gameHistory.push(gameHistoryEntry);
        processedGames.add(gameId);
      }

      const totalPages = Math.ceil(total / limitNum);

      res.json({
        success: true,
        data: {
          transactions: gameHistory,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages
        }
      });
    } catch (error) {
      console.error('Get user game history error:', error);
      res.status(500).json({ error: 'Failed to get game history' });
    }
  }

  // Get user's game history statistics
  async getUserGameHistoryStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { gameType, startDate, endDate } = req.query;

      // Build match conditions
      const matchConditions: any = {
        $or: [
          { from: new mongoose.Types.ObjectId(userId) },
          { to: new mongoose.Types.ObjectId(userId) }
        ],
        type: { $in: ['bet', 'payout'] },
        gameType: { $exists: true, $ne: null }
      };

      if (gameType && gameType !== 'all') {
        matchConditions.gameType = gameType;
      }

      if (startDate || endDate) {
        matchConditions.createdAt = {};
        if (startDate) matchConditions.createdAt.$gte = new Date(startDate as string);
        if (endDate) matchConditions.createdAt.$lte = new Date(endDate as string);
      }

      // Get all game transactions
      const transactions = await Transaction.find(matchConditions)
        .sort({ createdAt: -1 })
        .lean();

      // Process statistics
      const processedGames = new Set();
      let totalGames = 0;
      let totalWins = 0;
      let totalWagered = 0;
      let totalWon = 0;
      let totalLost = 0;

      for (const transaction of transactions) {
        const gameId = transaction.gameId?.toString();
        if (!gameId || processedGames.has(gameId)) continue;

        const gameTransactions = transactions.filter(t => 
          t.gameId?.toString() === gameId
        );

        const betTransaction = gameTransactions.find(t => t.type === 'bet');
        const payoutTransaction = gameTransactions.find(t => t.type === 'payout');

        if (!betTransaction) continue;

        const isWin = payoutTransaction && payoutTransaction.amount > 0;
        const betAmount = betTransaction.amount;
        const payoutAmount = payoutTransaction?.amount || 0;

        totalGames++;
        totalWagered += betAmount;

        if (isWin) {
          totalWins++;
          totalWon += payoutAmount;
        } else {
          totalLost += betAmount;
        }

        processedGames.add(gameId);
      }

      const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
      const netProfit = totalWon - totalLost;

      res.json({
        success: true,
        data: {
          totalGames,
          winRate,
          netProfit,
          totalWagered,
          totalWon,
          totalLost
        }
      });
    } catch (error) {
      console.error('Get user game history stats error:', error);
      res.status(500).json({ error: 'Failed to get game history statistics' });
    }
  }
}

export default new TransactionController();

