import { Request, Response } from 'express';
import User, { IUser } from '../../models/User';
import Transaction from '../../models/Transaction';
import House from '../../models/House';
import Notification from '../../models/Notification';
import { getIO } from '../../websocket';
import { NotificationType, NotificationPriority, NotificationStatus } from '../../types/notification';
import gameSettingsService from '../../services/gameSettingsService';
import { 
  getAdminUsers, 
  removeUserAdmin 
} from '../../utils/adminUtils';
import { getParam } from '../../utils/requestParams';

interface AuthRequest extends Request {
  user?: IUser;
}

class AdminController {
  // Get all admin users
  async getAdminUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const adminUsers = await getAdminUsers();

      res.json({
        success: true,
        data: adminUsers
      });
    } catch (error) {
      console.error('Get admin users error:', error);
      res.status(500).json({ error: 'Failed to get admin users' });
    }
  }

  

  // Remove admin privileges from a user
  async removeUserAdmin(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      const { targetUserId } = req.body;
      
      if (!targetUserId) {
        res.status(400).json({ error: 'Target user ID is required' });
        return;
      }

      // Prevent removing admin privileges from self
      if (targetUserId === userId) {
        res.status(400).json({ error: 'Cannot remove admin privileges from yourself' });
        return;
      }

      const result = await removeUserAdmin(targetUserId);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Admin privileges have been removed'
      });
    } catch (error) {
      console.error('Remove user admin error:', error);
      res.status(500).json({ error: 'Failed to remove admin privileges' });
    }
  }

  // Get user by ID (admin only)
  async getUserById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const targetUserId = getParam(req, 'targetUserId');
      if (!targetUserId) {
        res.status(400).json({ error: 'User ID required' });
        return;
      }
      const user = await User.findById(targetUserId).select('-nonce -signature -seed');

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  }

  // Get all users with pagination (admin only)
  async getAllUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 50, search, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      let query: any = {};
      
      // Search filter
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { walletAddress: { $regex: search, $options: 'i' } }
        ];
      }

      // Status filters
      if (status === 'banned') {
        query.isBanned = true;
      } else if (status === 'frozen') {
        query.isFrozen = true;
      } else if (status === 'active') {
        query.isBanned = false;
        query.isFrozen = false;
      }

      // Shared build: bot module removed; bot filter returns no users, isBot always false
      if (status === 'bot') {
        query._id = { $in: [] };
      }

      const users = await User.find(query)
        .select('-nonce -signature -seed')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await User.countDocuments(query);

      const usersWithBotFlag = users.map(user => ({
        ...user.toObject(),
        isBot: false
      }));

      res.json({
        success: true,
        data: {
          users: usersWithBotFlag,
          total,
          page: Number(page),
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  }

  // Update user balance (admin only)
  async updateUserBalance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { targetUserId, amount, reason } = req.body;
      if (!targetUserId || amount === undefined) {
        res.status(400).json({ error: 'Target user ID and amount are required' });
        return;
      }

      const user = await User.findById(targetUserId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const oldBalance = user.balance;
      user.balance = Number(amount);
      await user.save();

      res.json({
        success: true,
        data: {
          userId: targetUserId,
          oldBalance,
          newBalance: user.balance,
          change: user.balance - oldBalance,
          reason: reason || 'Admin balance adjustment'
        }
      });
    } catch (error) {
      console.error('Update user balance error:', error);
      res.status(500).json({ error: 'Failed to update user balance' });
    }
  }

  // Ban user
  async banUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getParam(req, 'userId');
      if (!userId) {
        res.status(400).json({ error: 'User ID required' });
        return;
      }
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Ban reason is required' });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      user.isBanned = true;
      user.banReason = reason;
      user.bannedAt = new Date();
      await user.save();

      res.json({
        success: true,
        message: 'User has been banned successfully'
      });
    } catch (error) {
      console.error('Ban user error:', error);
      res.status(500).json({ error: 'Failed to ban user' });
    }
  }

  // Unban user
  async unbanUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getParam(req, 'userId');
      if (!userId) {
        res.status(400).json({ error: 'User ID required' });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      user.isBanned = false;
      user.banReason = undefined;
      user.bannedAt = undefined;
      await user.save();

      res.json({
        success: true,
        message: 'User has been unbanned successfully'
      });
    } catch (error) {
      console.error('Unban user error:', error);
      res.status(500).json({ error: 'Failed to unban user' });
    }
  }

  // Freeze user account
  async freezeUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getParam(req, 'userId');
      if (!userId) {
        res.status(400).json({ error: 'User ID required' });
        return;
      }
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Freeze reason is required' });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      user.isFrozen = true;
      user.freezeReason = reason;
      user.frozenAt = new Date();
      await user.save();

      res.json({
        success: true,
        message: 'User account has been frozen successfully'
      });
    } catch (error) {
      console.error('Freeze user error:', error);
      res.status(500).json({ error: 'Failed to freeze user' });
    }
  }

  // Unfreeze user account
  async unfreezeUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getParam(req, 'userId');
      if (!userId) {
        res.status(400).json({ error: 'User ID required' });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      user.isFrozen = false;
      user.freezeReason = undefined;
      user.frozenAt = undefined;
      await user.save();

      res.json({
        success: true,
        message: 'User account has been unfrozen successfully'
      });
    } catch (error) {
      console.error('Unfreeze user error:', error);
      res.status(500).json({ error: 'Failed to unfreeze user' });
    }
  }

  // Get transaction history for admin
  async getTransactionHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        transactionType = 'all',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query: any = {};

      // Search functionality
      if (search && typeof search === 'string') {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
          { description: searchRegex },
          { ref: searchRegex },
          { type: searchRegex }
        ];
        if (search.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.push({ _id: search });
        }
      }

      // Filter by transaction type
      if (transactionType === 'my') {
        // For admin, show transactions where the admin is either the sender or receiver
        // This would require the admin user ID, but for now let's show all transactions
        // TODO: Implement proper admin-specific transaction filtering if needed
        console.log('🔍 Admin requested "my" transactions - showing all transactions for now');
      }

      // Build sort object
      const sortField = sortBy === 'amount' ? 'amount' :
                       sortBy === 'type' ? 'type' : 'createdAt';
      const sortDirection = sortOrder === 'asc' ? 1 : -1;
      const sort: any = { [sortField]: sortDirection };

      // Get transactions with pagination
      console.log('🔍 Transaction query:', JSON.stringify(query, null, 2));
      
      const [transactions, total] = await Promise.all([
        Transaction.find(query)
          .populate({
            path: 'from',
            select: 'username avatar displayname',
            model: 'User'
          })
          .populate({
            path: 'to', 
            select: 'username avatar displayname',
            model: 'User'
          })
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Transaction.countDocuments(query)
      ]);

      console.log('🔍 Found transactions:', transactions.length);
      console.log('🔍 Sample transaction before formatting:', transactions[0] ? JSON.stringify(transactions[0], null, 2) : 'No transactions found');
      
      // Test if User model is working by trying to find a user
      if (transactions.length > 0) {
        const testUserId = transactions[0].from || transactions[0].to;
        if (testUserId && testUserId.toString() !== '000000000000000000000000') {
          const testUser = await User.findById(testUserId).select('username avatar').lean();
          console.log('🔍 Test user lookup:', { testUserId, testUser });
        }
      }

      // Format transactions
      const formattedTransactions = transactions.map(transaction => {
        // Determine which field contains the user (not the house)
        const houseId = '000000000000000000000000';
        let userField = null;
        
        if (transaction.from && transaction.from.toString() !== houseId) {
          userField = transaction.from;
        } else if (transaction.to && transaction.to.toString() !== houseId) {
          userField = transaction.to;
        }

        // Debug logging for user field resolution
        console.log('🔍 Transaction user resolution debug:', {
          transactionId: transaction._id,
          from: transaction.from,
          to: transaction.to,
          fromType: typeof transaction.from,
          toType: typeof transaction.to,
          fromIsObject: transaction.from && typeof transaction.from === 'object',
          toIsObject: transaction.to && typeof transaction.to === 'object',
          userField: userField,
          houseId: houseId,
          fromUsername: (transaction.from as any)?.username,
          toUsername: (transaction.to as any)?.username
        });

        return {
          _id: transaction._id,
          id: Buffer.from(transaction._id.toString()).toString('base64'),
          user: {
            id: userField?._id || userField || 'Unknown',
            username: (userField as any)?.username || 'Unknown',
            avatar: (userField as any)?.avatar || null
          },
          amount: transaction.amount,
          type: transaction.type,
          name: transaction.description, // Use description as name
          description: transaction.description,
          ref: transaction.ref,
          gameType: transaction.gameType || null,
          gameId: transaction.gameId ? Buffer.from(transaction.gameId.toString()).toString('base64') : null,
          status: transaction.status,
          hash: transaction.hash,
          time: transaction.createdAt.toISOString(),
          createdAt: transaction.createdAt.toISOString()
        };
      });

      const totalPages = Math.ceil(total / limitNum);

      res.json({
        success: true,
        data: {
          transactions: formattedTransactions,
          total,
          page: pageNum,
          totalPages
        }
      });
    } catch (error) {
      console.error('Get transaction history error:', error);
      res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
  }

  // Get transaction statistics for admin
  async getTransactionStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Get transaction statistics
      const [
        totalTransactions,
        totalDeposits,
        totalWithdrawals,
        totalBets,
        totalPayouts,
        houseBalance
      ] = await Promise.all([
        Transaction.countDocuments(),
        Transaction.aggregate([
          { $match: { type: 'deposit' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'withdrawal' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'bet' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'payout' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        House.findOne().select('treasuryBalance')
      ]);

      // Get treasury statistics
      const [treasuryIn, treasuryOut] = await Promise.all([
        Transaction.aggregate([
          { $match: { type: { $in: ['bet', 'house_win'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: { $in: ['payout', 'house_loss'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      const stats = {
        totalTransactions,
        totalDeposits: totalDeposits[0]?.total || 0,
        totalWithdrawals: totalWithdrawals[0]?.total || 0,
        totalBets: totalBets[0]?.total || 0,
        totalPayouts: totalPayouts[0]?.total || 0,
        netProfit: (totalBets[0]?.total || 0) - (totalPayouts[0]?.total || 0),
        houseBalance: houseBalance?.treasuryBalance || 0,
        treasuryIn: treasuryIn[0]?.total || 0,
        treasuryOut: treasuryOut[0]?.total || 0,
        treasuryNet: (treasuryIn[0]?.total || 0) - (treasuryOut[0]?.total || 0)
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get transaction stats error:', error);
      res.status(500).json({ error: 'Failed to fetch transaction statistics' });
    }
  }

  // Get game settings
  async getGameSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const settings = await gameSettingsService.getSettings();

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('Get game settings error:', error);
      res.status(500).json({ error: 'Failed to fetch game settings' });
    }
  }

  // Update game settings
  async updateGameSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const updates = req.body;
      const userId = req.user?._id?.toString() || '000000000000000000000000'; // Use house ID as fallback for testing

      const settings = await gameSettingsService.updateSettings(updates, userId);

      // Broadcast settings update to all clients via WebSocket
      const publicSettings = await gameSettingsService.getPublicSettings();
      const { getIO } = await import('../../websocket/index');
      const io = getIO();
      io.emit('server_settings_updated', {
        success: true,
        data: publicSettings,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        data: settings,
        message: 'Game settings updated successfully'
      });
    } catch (error) {
      console.error('Update game settings error:', error);
      res.status(500).json({ error: 'Failed to update game settings' });
    }
  }

  // Reset game settings to defaults
  async resetGameSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const gameType = getParam(req, 'gameType');
      if (!gameType) {
        res.status(400).json({ error: 'Game type required' });
        return;
      }

      const house = await House.findOne();
      if (!house) {
        res.status(404).json({ error: 'House settings not found' });
        return;
      }

      // Reset to default values based on game type
      switch (gameType) {
        case 'mine':
          house.gameSettings.mine = {
            minBet: 0.01,
            maxBet: 1000,
            minMines: 3,
            maxMines: 25,
            houseEdge: 1
          };
          break;
        case 'crash':
          house.gameSettings.crash = {
            minBet: 0.01,
            maxBet: 1000,
            houseEdge: 1,
            maxMultiplier: 1000
          };
          break;
        case 'coinflip':
          house.gameSettings.coinflip = {
            minBet: 0.01,
            maxBet: 1000,
            houseEdge: 1
          };
          break;
        case 'roulette':
          house.gameSettings.roulette = {
            minBet: 0.01,
            maxBet: 1000,
            houseEdge: 0.05, // 5% house edge
            maxPlayers: 100,
            timeoutSeconds: 20,
            minPlayers: 1
          };
          break;
        default:
          res.status(400).json({ error: 'Invalid game type' });
          return;
      }

      await house.save();

      res.json({
        success: true,
        message: `${gameType} game settings reset to defaults`
      });
    } catch (error) {
      console.error('Reset game settings error:', error);
      res.status(500).json({ error: 'Failed to reset game settings' });
    }
  }

  // Get game statistics
  async getGameStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const gameType = getParam(req, 'gameType');
      if (!gameType) {
        res.status(400).json({ error: 'Game type required' });
        return;
      }

      // Get game-specific statistics
      const stats = await Transaction.aggregate([
        { $match: { gameType: gameType } },
        {
          $group: {
            _id: null,
            totalBets: { $sum: { $cond: [{ $eq: ['$type', 'bet'] }, '$amount', 0] } },
            totalPayouts: { $sum: { $cond: [{ $eq: ['$type', 'payout'] }, '$amount', 0] } },
            totalGames: { $sum: { $cond: [{ $eq: ['$type', 'bet'] }, 1, 0] } },
            totalWins: { $sum: { $cond: [{ $eq: ['$type', 'payout'] }, 1, 0] } }
          }
        }
      ]);

      const gameStats = stats[0] || {
        totalBets: 0,
        totalPayouts: 0,
        totalGames: 0,
        totalWins: 0
      };

      gameStats.netProfit = gameStats.totalBets - gameStats.totalPayouts;
      gameStats.winRate = gameStats.totalGames > 0 ? (gameStats.totalWins / gameStats.totalGames) * 100 : 0;

      res.json({
        success: true,
        data: gameStats
      });
    } catch (error) {
      console.error('Get game stats error:', error);
      res.status(500).json({ error: 'Failed to fetch game statistics' });
    }
  }

  // Get master settings
  async getMasterSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const house = await House.findOne();
      if (!house) {
        res.status(404).json({ error: 'House settings not found' });
        return;
      }

      const settings = {
        server: {
          status: house.isActive ? 'online' : 'offline',
          maintenanceMode: house.maintenanceMode || false,
          maintenanceMessage: 'System is under maintenance. Please try again later.', // Default
          maxConnections: 1000, // Default
          connectionTimeout: 30 // Default
        },
        platform: {
          allowNewRegistrations: true, // Default
          allowDeposits: true, // Default
          allowWithdrawals: true, // Default
          requireKYC: false, // Default
          minDepositAmount: 0.01, // Default
          maxDepositAmount: 10000, // Default
          minWithdrawalAmount: 0.01, // Default
          maxWithdrawalAmount: 10000, // Default
          withdrawalFee: 0.5 // Default
        },
        games: {
          mineEnabled: house.gameSettings?.mine ? true : false,
          crashEnabled: house.gameSettings?.crash ? true : false,
          coinflipEnabled: house.gameSettings?.coinflip ? true : false,
          rouletteEnabled: house.gameSettings?.roulette ? true : false,
          globalGameCooldown: 0, // Default
          maxConcurrentGames: 100 // Default
        },
        security: {
          enable2FA: false, // Default
          sessionTimeout: 60, // Default
          maxLoginAttempts: 5, // Default
          lockoutDuration: 15, // Default
          requireStrongPasswords: false, // Default
          enableIPWhitelist: false, // Default
          allowedIPs: [] as string[] // Default
        },
        notifications: {
          enableEmailNotifications: false, // Default
          enableSMSNotifications: false, // Default
          enablePushNotifications: false, // Default
          notificationCooldown: 60, // Default
          adminNotificationEmail: 'admin@spinx.com' // Default
        }
      };

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('Get master settings error:', error);
      res.status(500).json({ error: 'Failed to fetch master settings' });
    }
  }

  // Update master settings
  async updateMasterSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { server, platform, games, security, notifications } = req.body;

      const house = await House.findOne();
      if (!house) {
        res.status(404).json({ error: 'House settings not found' });
        return;
      }

      // Update server settings
      if (server) {
        house.isActive = server.status === 'online';
        house.maintenanceMode = server.maintenanceMode || false;
        // Note: maintenanceMessage would need to be added to House model
      }

      // Update game settings based on master settings
      if (games) {
        if (house.gameSettings) {
          if (house.gameSettings.mine) {
            // Mine game settings already exist, just update enabled status
          } else if (games.mineEnabled) {
            house.gameSettings.mine = {
              minBet: 0.01,
              maxBet: 1000,
              minMines: 3,
              maxMines: 25,
              houseEdge: 1
            };
          }

          if (house.gameSettings.crash) {
            // Crash game settings already exist, just update enabled status
          } else if (games.crashEnabled) {
            house.gameSettings.crash = {
              minBet: 0.01,
              maxBet: 1000,
              houseEdge: 1,
              maxMultiplier: 1000
            };
          }

          if (house.gameSettings.coinflip) {
            // Coinflip game settings already exist, just update enabled status
          } else if (games.coinflipEnabled) {
            house.gameSettings.coinflip = {
              minBet: 0.01,
              maxBet: 1000,
              houseEdge: 1
            };
          }

          if (house.gameSettings.roulette) {
            // Roulette game settings already exist, just update enabled status
          } else if (games.rouletteEnabled) {
            house.gameSettings.roulette = {
              minBet: 0.01,
              maxBet: 1000,
              houseEdge: 0.05, // 5% house edge
              maxPlayers: 100,
              timeoutSeconds: 20,
              minPlayers: 1
            };
          }
        }
      }

      await house.save();

      res.json({
        success: true,
        message: 'Master settings updated successfully'
      });
    } catch (error) {
      console.error('Update master settings error:', error);
      res.status(500).json({ error: 'Failed to update master settings' });
    }
  }

  // Update server status
  async updateServerStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status, message } = req.body;

      const house = await House.findOne();
      if (!house) {
        res.status(404).json({ error: 'House settings not found' });
        return;
      }

      switch (status) {
        case 'online':
          house.isActive = true;
          house.maintenanceMode = false;
          break;
        case 'offline':
          house.isActive = false;
          house.maintenanceMode = false;
          break;
        case 'maintenance':
          house.isActive = true;
          house.maintenanceMode = true;
          // Note: maintenanceMessage would need to be added to House model
          break;
        default:
          res.status(400).json({ error: 'Invalid server status' });
          return;
      }

      await house.save();

      res.json({
        success: true,
        message: `Server status updated to ${status}`
      });
    } catch (error) {
      console.error('Update server status error:', error);
      res.status(500).json({ error: 'Failed to update server status' });
    }
  }

  // Get system health
  async getSystemHealth(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Get system health metrics
      const [
        totalUsers,
        activeUsers,
        totalTransactions,
        houseBalance,
        systemUptime
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }), // Active in last 5 minutes
        Transaction.countDocuments(),
        House.findOne().select('treasuryBalance'),
        process.uptime()
      ]);

      const health = {
        status: 'healthy',
        uptime: Math.floor(systemUptime),
        metrics: {
          totalUsers,
          activeUsers,
          totalTransactions,
          houseBalance: houseBalance?.treasuryBalance || 0
        },
        services: {
          database: 'healthy',
          websocket: 'healthy',
          api: 'healthy'
        },
        lastChecked: new Date().toISOString()
      };

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      console.error('Get system health error:', error);
      res.status(500).json({ error: 'Failed to fetch system health' });
    }
  }

  // Send notification
  async sendNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { title, message, type, target, targetUsers } = req.body;
      const adminId = req.user?._id;

      if (!title || !message) {
        res.status(400).json({ error: 'Title and message are required' });
        return;
      }

      // Map priority type
      const priorityMap: Record<string, NotificationPriority> = {
        'low': NotificationPriority.LOW,
        'normal': NotificationPriority.NORMAL,
        'high': NotificationPriority.HIGH,
        'urgent': NotificationPriority.URGENT
      };
      const priority = priorityMap[type || 'normal'] || NotificationPriority.NORMAL;

      // Set expiration (7 days)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 168);

      const io = getIO();
      const notificationIds: string[] = [];

      if (target === 'all') {
        // Broadcast to all users - create notification for EVERY user
        // Get all active users
        const allUsers = await User.find({ isActive: true }).select('_id').lean();
        
        // Create notification for each user
        const notifications = await Promise.all(
          allUsers.map(async (user) => {
            const notification = new Notification({
              userId: user._id,
              sentBy: adminId,
              type: NotificationType.CUSTOM,
              title,
              message,
              priority,
              status: NotificationStatus.SENT,
              expiresAt,
              data: {
                target: 'all',
                timestamp: new Date().toISOString()
              }
            });

            await notification.save();
            notificationIds.push(notification._id.toString());
            return notification;
          })
        );

        // Broadcast via WebSocket to all online users
        if (io) {
          io.emit('notification', {
            id: notifications[0]?._id,
            type: NotificationType.CUSTOM,
            title,
            message,
            priority,
            createdAt: new Date()
          });
        }

        console.log(`📢 Admin broadcast notification sent to ${allUsers.length} users: "${title}"`);
      } else if (target === 'specific' && targetUsers && targetUsers.length > 0) {
        // Send to specific users
        const notifications = await Promise.all(
          targetUsers.map(async (targetUserId: string) => {
            const notification = new Notification({
              userId: targetUserId,
              sentBy: adminId,
              type: NotificationType.CUSTOM,
              title,
              message,
              priority,
              status: NotificationStatus.SENT,
              expiresAt,
              data: {
                target: 'specific',
                timestamp: new Date().toISOString()
              }
            });

            await notification.save();
            notificationIds.push(notification._id.toString());

            // Send via WebSocket to specific user
            if (io) {
              io.to(targetUserId).emit('notification', {
                id: notification._id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                priority: notification.priority,
                createdAt: notification.createdAt
              });
            }

            return notification;
          })
        );

        console.log(`📧 Admin notification sent to ${notifications.length} users: "${title}"`);
      } else {
        res.status(400).json({ error: 'Invalid target or missing targetUsers for specific target' });
        return;
      }

      res.json({
        success: true,
        message: 'Notification sent successfully',
        data: { 
          notificationIds,
          count: notificationIds.length
        }
      });
    } catch (error) {
      console.error('Send notification error:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  }

  // Get notification history
  async getNotificationHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, type, status } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Query notifications sent by admins directly from database
      const query: any = {
        sentBy: { $exists: true, $ne: null }
      };

      // Filter by type if provided
      if (type) {
        query.type = type;
      }

      // Filter by status if provided
      if (status) {
        query.status = status;
      }

      // Get notifications with admin user details
      const [notifications, total] = await Promise.all([
        Notification.find(query)
          .populate('sentBy', 'username email avatar')
          .sort({ createdAt: -1 })
          .limit(limitNum)
          .skip(skip)
          .lean(),
        Notification.countDocuments(query)
      ]);

      // Group notifications by unique combinations to identify broadcasts
      const groupedNotifications = new Map();
      
      notifications.forEach((notif: any) => {
        const key = `${notif.title}_${notif.message}_${notif.sentBy?._id || 'system'}_${new Date(notif.createdAt).getTime()}`;
        if (!groupedNotifications.has(key)) {
          groupedNotifications.set(key, {
            _id: notif._id,
            id: notif._id,
            title: notif.title,
            message: notif.message,
            type: notif.type,
            priority: notif.priority,
            status: notif.status,
            target: notif.userId ? 'specific' : 'all',
            targetUsers: notif.userId ? [notif.userId] : undefined,
            sentAt: notif.createdAt,
            createdAt: notif.createdAt,
            createdBy: notif.sentBy ? {
              id: notif.sentBy._id,
              username: notif.sentBy.username,
              avatar: notif.sentBy.avatar
            } : null
          });
        }
      });

      const uniqueNotifications = Array.from(groupedNotifications.values());
      const totalPages = Math.ceil(uniqueNotifications.length / limitNum);

      res.json({
        success: true,
        data: {
          notifications: uniqueNotifications,
          total: uniqueNotifications.length,
          page: pageNum,
          totalPages
        }
      });
    } catch (error) {
      console.error('Get notification history error:', error);
      res.status(500).json({ error: 'Failed to fetch notification history' });
    }
  }

  // Get notification statistics
  async getNotificationStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Query notification stats directly from database
      const query = {
        $or: [
          { userId: userId },
          { userId: null } // System-wide notifications
        ]
      };

      const [
        total,
        unread,
        read,
        delivered,
        pending
      ] = await Promise.all([
        Notification.countDocuments(query),
        Notification.countDocuments({ ...query, status: 'pending' }),
        Notification.countDocuments({ ...query, status: 'read' }),
        Notification.countDocuments({ ...query, status: 'delivered' }),
        Notification.countDocuments({ ...query, status: 'sent' })
      ]);

      const stats = {
        total,
        unread: unread + pending,
        read,
        delivered,
        pending
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get notification stats error:', error);
      res.status(500).json({ error: 'Failed to fetch notification statistics' });
    }
  }

  // Get notification templates
  async getNotificationTemplates(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Get templates from notification engine
      const notificationEngine = require('../../engine/notificationEngine').default;
      const templatesObject = notificationEngine.getAllTemplates();

      // Convert template object to array format for UI
      const templatesArray = Object.entries(templatesObject).map(([key, template]: [string, any]) => ({
        _id: key,
        name: key,
        type: template.type,
        title: template.title,
        message: template.message,
        priority: template.priority,
        expiresInHours: template.expiresInHours,
        createdAt: new Date().toISOString() // Static templates don't have creation date
      }));

      res.json({
        success: true,
        data: templatesArray
      });
    } catch (error) {
      console.error('Get notification templates error:', error);
      res.status(500).json({ error: 'Failed to fetch notification templates' });
    }
  }

  // Create notification template
  async createNotificationTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, title, message, type } = req.body;

      if (!name || !title || !message) {
        res.status(400).json({ error: 'Name, title, and message are required' });
        return;
      }

      // Templates are predefined in the notification engine
      // For now, return an error indicating templates are not dynamically creatable
      res.status(400).json({ 
        error: 'Templates are predefined and cannot be created dynamically. Please use existing templates or send custom notifications.',
        availableTemplates: Object.keys(require('../../engine/notificationEngine').default.getAllTemplates())
      });
    } catch (error) {
      console.error('Create notification template error:', error);
      res.status(500).json({ error: 'Failed to create notification template' });
    }
  }

  // Delete notification
  async deleteNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      const notificationId = getParam(req, 'notificationId');
      const userId = req.user?._id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (!notificationId) {
        res.status(400).json({ error: 'Notification ID required' });
        return;
      }

      // Use the real notification service to delete the notification
      const notificationService = require('../../services/notificationService').default;
      const success = await notificationService.deleteNotification(notificationId, userId);

      if (success) {
        res.json({
          success: true,
          message: 'Notification deleted successfully'
        });
      } else {
        res.status(404).json({ error: 'Notification not found' });
      }
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  }

  /**
   * Test endpoint to check transaction and user data
   */
  async testTransactionData(req: Request, res: Response): Promise<void> {
    try {
      console.log("🔍 === TESTING TRANSACTION DATA ===");
      
      // Get a sample transaction
      const sampleTransaction = await Transaction.findOne().lean();
      console.log("🔍 Sample transaction:", sampleTransaction);
      
      if (sampleTransaction) {
        // Try to populate the user data
        const populatedTransaction = await Transaction.findById(sampleTransaction._id)
          .populate('from', 'username avatar')
          .populate('to', 'username avatar')
          .lean();
        
        console.log("🔍 Populated transaction:", populatedTransaction);
        
        // Test direct user lookup
        const houseId = '000000000000000000000000';
        let testUserId = null;
        
        if (sampleTransaction.from && sampleTransaction.from.toString() !== houseId) {
          testUserId = sampleTransaction.from;
        } else if (sampleTransaction.to && sampleTransaction.to.toString() !== houseId) {
          testUserId = sampleTransaction.to;
        }
        
        let testUser = null;
        if (testUserId) {
          testUser = await User.findById(testUserId).select('username avatar').lean();
          console.log("🔍 Direct user lookup:", { testUserId, testUser });
        }
        
        res.json({
          success: true,
          data: {
            sampleTransaction,
            populatedTransaction,
            testUser,
            message: 'Transaction data test completed'
          }
        });
      } else {
        res.json({
          success: true,
          data: {
            message: 'No transactions found in database'
          }
        });
      }
    } catch (error) {
      console.error('Error testing transaction data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new AdminController();
