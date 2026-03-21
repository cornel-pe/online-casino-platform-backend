import { Request, Response } from 'express';
import TradingBet from '../models/Trading';

/**
 * Get all trading bets (admin only)
 */
export const getAllBets = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const token = req.query.token as string | undefined;

    const query: any = {};
    if (status) {
      query.status = status;
    }
    if (token) {
      query.token = token.toUpperCase();
    }

    const bets = await TradingBet.find(query)
      .populate('userId', 'username email')
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await TradingBet.countDocuments(query);

    res.json({
      success: true,
      data: bets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error getting all bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bets',
    });
  }
};

/**
 * Get trading statistics (admin only)
 */
export const getTradingStats = async (req: Request, res: Response) => {
  try {
    const totalBets = await TradingBet.countDocuments();
    const activeBets = await TradingBet.countDocuments({ status: 'active' });
    const closedBets = await TradingBet.countDocuments({ status: 'closed' });
    const bustedBets = await TradingBet.countDocuments({ status: 'busted' });

    // Calculate total volume
    const volumeResult = await TradingBet.aggregate([
      {
        $group: {
          _id: null,
          totalVolume: { $sum: '$wager' },
        },
      },
    ]);
    const totalVolume = volumeResult[0]?.totalVolume || 0;

    // Calculate total profit/loss
    const pnlResult = await TradingBet.aggregate([
      {
        $match: { status: { $in: ['closed', 'busted'] } },
      },
      {
        $group: {
          _id: null,
          totalProfit: { $sum: { $ifNull: ['$profit', 0] } },
          totalLoss: { $sum: { $ifNull: ['$loss', 0] } },
        },
      },
    ]);
    const totalProfit = pnlResult[0]?.totalProfit || 0;
    const totalLoss = pnlResult[0]?.totalLoss || 0;
    const netPnL = totalProfit - totalLoss;

    // Get stats by token
    const tokenStats = await TradingBet.aggregate([
      {
        $group: {
          _id: '$token',
          count: { $sum: 1 },
          volume: { $sum: '$wager' },
        },
      },
      { $sort: { volume: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        totalBets,
        activeBets,
        closedBets,
        bustedBets,
        totalVolume,
        totalProfit,
        totalLoss,
        netPnL,
        tokenStats,
      },
    });
  } catch (error: any) {
    console.error('Error getting trading stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trading stats',
    });
  }
};

