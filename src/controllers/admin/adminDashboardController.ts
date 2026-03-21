import { Request, Response } from 'express';
import User from '../../models/User';
import Transaction from '../../models/Transaction';
import House from '../../models/House';

interface AuthRequest extends Request {
  user?: any;
}

class AdminDashboardController {
  // Get dashboard statistics
  async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {

      // Get current date ranges
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now.getTime() - (now.getDay() * 24 * 60 * 60 * 1000));
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get house balance
      const house = await House.getHouse();

      // Get user statistics
      const [totalUsers, activeUsers] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ 
          lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Active in last 24 hours
        })
      ]);

      // Get transaction statistics
      const [
        totalBets,
        totalPayouts,
        dailyBets,
        dailyPayouts,
        weeklyBets,
        weeklyPayouts,
        monthlyBets,
        monthlyPayouts
      ] = await Promise.all([
        Transaction.aggregate([
          { $match: { type: 'bet' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'win' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'bet', createdAt: { $gte: startOfDay } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'win', createdAt: { $gte: startOfDay } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'bet', createdAt: { $gte: startOfWeek } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'win', createdAt: { $gte: startOfWeek } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'bet', createdAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'win', createdAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      // Get game-specific statistics
      const gameStats = await Promise.all([
        // Mine game stats
        Promise.all([
          Transaction.aggregate([
            { $match: { gameType: 'mine', type: 'bet' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Transaction.aggregate([
            { $match: { gameType: 'mine', type: 'win' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]),
        // Crash game stats
        Promise.all([
          Transaction.aggregate([
            { $match: { gameType: 'crash', type: 'bet' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Transaction.aggregate([
            { $match: { gameType: 'crash', type: 'win' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]),
        // Coinflip game stats
        Promise.all([
          Transaction.aggregate([
            { $match: { gameType: 'coinflip', type: 'bet' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Transaction.aggregate([
            { $match: { gameType: 'coinflip', type: 'win' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]),
        // Roulette game stats
        Promise.all([
          Transaction.aggregate([
            { $match: { gameType: 'roulette', type: 'bet' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Transaction.aggregate([
            { $match: { gameType: 'roulette', type: 'win' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ])
      ]);

      const stats = {
        totalUsers,
        activeUsers,
        onlineUsers: 0, // This would be tracked via WebSocket connections
        totalBets: totalBets[0]?.total || 0,
        totalPayouts: totalPayouts[0]?.total || 0,
        houseBalance: house.treasuryBalance,
        dailyBets: dailyBets[0]?.total || 0,
        dailyPayouts: dailyPayouts[0]?.total || 0,
        weeklyBets: weeklyBets[0]?.total || 0,
        weeklyPayouts: weeklyPayouts[0]?.total || 0,
        monthlyBets: monthlyBets[0]?.total || 0,
        monthlyPayouts: monthlyPayouts[0]?.total || 0,
        gameStats: {
          mine: {
            totalBets: gameStats[0][0][0]?.total || 0,
            totalPayouts: gameStats[0][1][0]?.total || 0,
            activeGames: 0 // This would be tracked via active game sessions
          },
          crash: {
            totalBets: gameStats[1][0][0]?.total || 0,
            totalPayouts: gameStats[1][1][0]?.total || 0,
            activeGames: 0
          },
          coinflip: {
            totalBets: gameStats[2][0][0]?.total || 0,
            totalPayouts: gameStats[2][1][0]?.total || 0,
            activeGames: 0
          },
          roulette: {
            totalBets: gameStats[3][0][0]?.total || 0,
            totalPayouts: gameStats[3][1][0]?.total || 0,
            activeGames: 0
          }
        }
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({ error: 'Failed to get dashboard statistics' });
    }
  }

  // Get chart data for dashboard
  async getCharts(req: AuthRequest, res: Response): Promise<void> {
    try {

      const { period = 'week' } = req.query;
      const now = new Date();
      let startDate: Date;
      let groupBy: string;

      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          groupBy = 'hour';
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          groupBy = 'day';
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          groupBy = 'day';
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          groupBy = 'day';
      }

      // Get chart data
      const chartData = await Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            type: { $in: ['bet', 'win'] }
          }
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: groupBy === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d',
                  date: '$createdAt'
                }
              },
              type: '$type'
            },
            amount: { $sum: '$amount' }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            bets: {
              $sum: {
                $cond: [{ $eq: ['$_id.type', 'bet'] }, '$amount', 0]
              }
            },
            payouts: {
              $sum: {
                $cond: [{ $eq: ['$_id.type', 'win'] }, '$amount', 0]
              }
            }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Format chart data
      const formattedData = chartData.map(item => ({
        date: item._id,
        bets: item.bets,
        payouts: item.payouts,
        users: 0 // This would be tracked separately
      }));

      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      console.error('Get charts error:', error);
      res.status(500).json({ error: 'Failed to get chart data' });
    }
  }

  // Get online users count
  async getOnlineUsers(req: AuthRequest, res: Response): Promise<void> {
    try {

      // This would be tracked via WebSocket connections
      // For now, return users active in the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const onlineUsers = await User.countDocuments({
        lastActive: { $gte: fiveMinutesAgo }
      });

      res.json({
        success: true,
        data: {
          onlineUsers,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Get online users error:', error);
      res.status(500).json({ error: 'Failed to get online users' });
    }
  }
}

export default new AdminDashboardController();
