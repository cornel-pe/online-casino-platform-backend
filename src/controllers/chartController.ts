import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction';
import TransactionService from '../services/transactionService';
import { AuthenticatedRequest } from '../utils/auditLogger';

interface ChartStatsRequest extends Request {
  user?: {
    _id: string;
    username: string;
  };
}

// Get historical chart statistics
export const getChartStats = async (req: ChartStatsRequest, res: Response) => {
  try {
    console.log('📊 Chart stats request:', req.query);

    const { period = 'daily', days = 7 } = req.query;
    const endDate = new Date();
    const startDate = new Date();

    // Calculate start date based on period and days
    switch (period) {
      case 'hourly':
        startDate.setHours(endDate.getHours() - parseInt(days as string));
        break;
      case 'daily':
        startDate.setDate(endDate.getDate() - parseInt(days as string));
        break;
      case 'weekly':
        startDate.setDate(endDate.getDate() - (parseInt(days as string) * 7));
        break;
      case 'monthly':
        startDate.setMonth(endDate.getMonth() - parseInt(days as string));
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    // Get house transactions for betting statistics
    const bettingStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          $or: [
            { from: new mongoose.Types.ObjectId('000000000000000000000000') },
            { to: new mongoose.Types.ObjectId('000000000000000000000000') }
          ],
          type: { $in: ['bet', 'payout', 'house_profit'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === 'hourly' ? '%Y-%m-%d %H:00' : 
                      period === 'daily' ? '%Y-%m-%d' :
                      period === 'weekly' ? '%Y-%U' : '%Y-%m',
              date: '$createdAt'
            }
          },
          totalBets: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'bet'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                '$amount',
                0
              ]
            }
          },
          totalPayouts: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'payout'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
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
          },
          betCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'bet'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          },
          payoutCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'payout'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $addFields: {
          totalBetAmount: '$totalBets',
          totalProfit: { $subtract: ['$totalBets', '$totalPayouts'] },
          completedBets: '$payoutCount',
          cancelledBets: { $subtract: ['$betCount', '$payoutCount'] }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Get transaction statistics (deposits/withdrawals)
    const transactionStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          $or: [
            { from: new mongoose.Types.ObjectId('000000000000000000000000') },
            { to: new mongoose.Types.ObjectId('000000000000000000000000') }
          ],
          type: { $in: ['deposit', 'withdrawal'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === 'hourly' ? '%Y-%m-%d %H:00' : 
                      period === 'daily' ? '%Y-%m-%d' :
                      period === 'weekly' ? '%Y-%U' : '%Y-%m',
              date: '$createdAt'
            }
          },
          totalDeposits: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'deposit'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                '$amount',
                0
              ]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'withdrawal'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                '$amount',
                0
              ]
            }
          },
          depositCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'deposit'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          },
          withdrawalCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'withdrawal'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Combine and format the data
    const combinedStats = bettingStats.map(betStat => {
      const transactionStat = transactionStats.find(t => t._id === betStat._id) || {
        totalDeposits: 0,
        totalWithdrawals: 0,
        depositCount: 0,
        withdrawalCount: 0
      };

      return {
        date: betStat._id,
        betting: {
          totalBets: betStat.betCount,
          totalBetAmount: betStat.totalBetAmount,
          totalPayouts: betStat.totalPayouts,
          totalProfit: betStat.totalProfit,
          completedBets: betStat.completedBets,
          cancelledBets: betStat.cancelledBets,
          rtp: betStat.totalBetAmount > 0 ? (betStat.totalPayouts / betStat.totalBetAmount) * 100 : 0
        },
        transactions: {
          totalDeposits: transactionStat.totalDeposits,
          totalWithdrawals: transactionStat.totalWithdrawals,
          depositCount: transactionStat.depositCount,
          withdrawalCount: transactionStat.withdrawalCount,
          netFlow: transactionStat.totalDeposits - transactionStat.totalWithdrawals
        }
      };
    });

    // Calculate summary statistics
    const summary = {
      totalBets: bettingStats.reduce((sum, stat) => sum + stat.betCount, 0),
      totalBetAmount: bettingStats.reduce((sum, stat) => sum + stat.totalBetAmount, 0),
      totalPayouts: bettingStats.reduce((sum, stat) => sum + stat.totalPayouts, 0),
      totalProfit: bettingStats.reduce((sum, stat) => sum + stat.totalProfit, 0),
      totalDeposits: transactionStats.reduce((sum, stat) => sum + stat.totalDeposits, 0),
      totalWithdrawals: transactionStats.reduce((sum, stat) => sum + stat.totalWithdrawals, 0),
      period,
      days: parseInt(days as string),
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };

    res.json({
      success: true,
      data: {
        stats: combinedStats,
        summary
      }
    });

  } catch (error) {
    console.error('Error fetching chart stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chart statistics'
    });
  }
};

// Get real-time live statistics
export const getLiveStats = async (req: ChartStatsRequest, res: Response) => {
  try {
    console.log('⚡ Live stats request:', req.query);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get live betting data from house transactions (last hour)
    const liveBettingStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: oneHourAgo, $lte: now },
          $or: [
            { from: new mongoose.Types.ObjectId('000000000000000000000000') },
            { to: new mongoose.Types.ObjectId('000000000000000000000000') }
          ],
          type: { $in: ['bet', 'payout', 'house_profit'] }
        }
      },
      {
        $group: {
          _id: null,
          totalBets: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'bet'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                '$amount',
                0
              ]
            }
          },
          totalPayouts: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'payout'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                '$amount',
                0
              ]
            }
          },
          betCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'bet'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          },
          payoutCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'payout'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Get live transaction data (last hour)
    const liveTransactionStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: oneHourAgo, $lte: now },
          $or: [
            { from: new mongoose.Types.ObjectId('000000000000000000000000') },
            { to: new mongoose.Types.ObjectId('000000000000000000000000') }
          ],
          type: { $in: ['deposit', 'withdrawal'] }
        }
      },
      {
        $group: {
          _id: null,
          totalDeposits: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'deposit'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                '$amount',
                0
              ]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'withdrawal'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                '$amount',
                0
              ]
            }
          },
          depositCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'deposit'] }, { $eq: ['$to', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          },
          withdrawalCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'withdrawal'] }, { $eq: ['$from', new mongoose.Types.ObjectId('000000000000000000000000')] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const bettingData = liveBettingStats[0] || {
      totalBets: 0,
      totalPayouts: 0,
      betCount: 0,
      payoutCount: 0
    };

    const transactionData = liveTransactionStats[0] || {
      totalDeposits: 0,
      totalWithdrawals: 0,
      depositCount: 0,
      withdrawalCount: 0
    };

    const liveStats = {
      timestamp: now.toISOString(),
      betting: {
        totalBets: bettingData.betCount,
        totalBetAmount: bettingData.totalBets,
        totalPayouts: bettingData.totalPayouts,
        activeBets: 0, // We'll calculate this separately if needed
        completedBets: bettingData.payoutCount
      },
      transactions: {
        totalDeposits: transactionData.totalDeposits,
        totalWithdrawals: transactionData.totalWithdrawals,
        depositCount: transactionData.depositCount,
        withdrawalCount: transactionData.withdrawalCount
      },
      summary: {
        totalProfit: bettingData.totalBets - bettingData.totalPayouts,
        netFlow: transactionData.totalDeposits - transactionData.totalWithdrawals,
        rtp: bettingData.totalBets > 0 ? (bettingData.totalPayouts / bettingData.totalBets) * 100 : 0
      }
    };

    res.json({
      success: true,
      data: liveStats
    });

  } catch (error) {
    console.error('Error fetching live stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live statistics'
    });
  }
};
