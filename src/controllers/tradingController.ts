import { Request, Response } from 'express';
import TradingBet from '../models/Trading';
import tradingEngine from '../engine/tradingEngine';
import { calculateBustPrice, calculatePnL, calculateExitPrice } from '../utils/tradingCalculations';
import mongoose from 'mongoose';
import { getParam } from '../utils/requestParams';

/**
 * Get supported tokens and their current prices
 */
export const getSupportedTokens = async (req: Request, res: Response) => {
  try {
    const prices = tradingEngine.getAllPrices();
    const tokens = Array.from(prices.values()).map(priceData => ({
      token: priceData.token,
      price: priceData.price,
      lastUpdate: priceData.lastUpdate,
    }));

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error: any) {
    console.error('Error getting supported tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get supported tokens',
    });
  }
};

/**
 * Get current price for a specific token
 */
export const getTokenPrice = async (req: Request, res: Response) => {
  try {
    const token = getParam(req, 'token');
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token required' });
    }
    const supportedTokens = ['BTC', 'BNB', 'ETH', 'SOL', 'TRX'];
    
    if (!supportedTokens.includes(token.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported token',
      });
    }

    const price = tradingEngine.getPrice(token.toUpperCase() as any);
    
    if (price === null) {
      return res.status(404).json({
        success: false,
        error: 'Price not available',
      });
    }

    res.json({
      success: true,
      data: {
        token: token.toUpperCase(),
        price,
      },
    });
  } catch (error: any) {
    console.error('Error getting token price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get token price',
    });
  }
};

/**
 * Open a new trading bet
 */
export const openBet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const {
      token,
      direction,
      wager,
      leverage,
      autoCashoutEnabled,
      autoCashoutPrice,
      autoCashoutProfit,
      autoCashoutLoss,
    } = req.body;

    // Validation
    if (!['BTC', 'BNB', 'ETH', 'SOL', 'TRX'].includes(token?.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token',
      });
    }

    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Direction must be "up" or "down"',
      });
    }

    if (!wager || wager <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Wager must be greater than 0',
      });
    }

    if (!leverage || leverage < 1 || leverage > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Leverage must be between 1 and 1000',
      });
    }

    // Get current price
    const entryPrice = tradingEngine.getPrice(token.toUpperCase() as any);
    if (entryPrice === null) {
      return res.status(503).json({
        success: false,
        error: 'Price not available for this token',
      });
    }

    // Check user balance
    const User = require('../models/User').default;
    const user = await User.findById(userId);
    if (!user || user.balance < wager) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance',
      });
    }

    // Calculate bust price
    const bustPrice = calculateBustPrice(entryPrice, leverage, direction);

    // Create bet
    const bet = new TradingBet({
      userId,
      token: token.toUpperCase(),
      direction,
      wager,
      leverage,
      entryPrice,
      bustPrice,
      status: 'active',
      autoCashoutEnabled: autoCashoutEnabled || false,
      autoCashoutPrice: autoCashoutPrice || undefined,
      autoCashoutProfit: autoCashoutProfit || undefined,
      autoCashoutLoss: autoCashoutLoss || undefined,
    });

    await bet.save();

    const walletService = (await import('../services/walletService')).default;
    const debitResult = await walletService.debit(
      userId,
      wager,
      `trading_bet_${bet._id}`,
      { type: 'bet', description: 'Trading wager' }
    );
    if (!debitResult.success) {
      await TradingBet.findByIdAndDelete(bet._id);
      return res.status(400).json({ success: false, error: debitResult.error || 'Insufficient balance' });
    }

    res.json({
      success: true,
      data: bet,
    });
  } catch (error: any) {
    console.error('Error opening bet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to open bet',
    });
  }
};

/**
 * Close an active bet (manual cashout)
 */
export const closeBet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const betId = getParam(req, 'betId');
    if (!betId) {
      return res.status(400).json({ success: false, error: 'Bet ID required' });
    }

    const bet = await TradingBet.findOne({
      _id: betId,
      userId,
      status: 'active',
    });

    if (!bet) {
      return res.status(404).json({
        success: false,
        error: 'Bet not found or already closed',
      });
    }

    // Get current price
    const exitPrice = tradingEngine.getPrice(bet.token);
    if (exitPrice === null) {
      return res.status(503).json({
        success: false,
        error: 'Price not available',
      });
    }

    // Calculate final PnL
    const pnl = calculatePnL(
      bet.entryPrice,
      exitPrice,
      bet.wager,
      bet.leverage,
      bet.direction
    );

    // Update bet
    bet.status = 'closed';
    bet.exitPrice = exitPrice;
    bet.currentPrice = exitPrice;
    bet.pnl = pnl;
    bet.closedAt = new Date();

    if (pnl > 0) {
      bet.profit = pnl;
      bet.payout = bet.wager + pnl;
    } else {
      bet.loss = Math.abs(pnl);
      bet.payout = bet.wager + pnl;
    }

    await bet.save();

    const walletServiceClose = (await import('../services/walletService')).default;
    await walletServiceClose.credit(
      userId,
      bet.payout,
      `trading_close_${bet._id}`,
      { type: 'payout', description: 'Trading close payout' }
    );

    res.json({
      success: true,
      data: bet,
    });
  } catch (error: any) {
    console.error('Error closing bet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to close bet',
    });
  }
};

/**
 * Get user's active bets
 */
export const getActiveBets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const bets = await TradingBet.find({
      userId,
      status: 'active',
    }).sort({ openedAt: -1 });

    res.json({
      success: true,
      data: bets,
    });
  } catch (error: any) {
    console.error('Error getting active bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active bets',
    });
  }
};

/**
 * Get user's bet history
 */
export const getBetHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const bets = await TradingBet.find({
      userId,
      status: { $in: ['closed', 'busted'] },
    })
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await TradingBet.countDocuments({
      userId,
      status: { $in: ['closed', 'busted'] },
    });

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
    console.error('Error getting bet history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bet history',
    });
  }
};

/**
 * Get a specific bet by ID
 */
export const getBet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const betId = getParam(req, 'betId');
    if (!betId) {
      return res.status(400).json({ success: false, error: 'Bet ID required' });
    }

    const bet = await TradingBet.findOne({
      _id: betId,
      userId,
    });

    if (!bet) {
      return res.status(404).json({
        success: false,
        error: 'Bet not found',
      });
    }

    res.json({
      success: true,
      data: bet,
    });
  } catch (error: any) {
    console.error('Error getting bet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bet',
    });
  }
};

/**
 * Update auto cashout settings for an active bet
 */
export const updateAutoCashout = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const betId = getParam(req, 'betId');
    if (!betId) {
      return res.status(400).json({ success: false, error: 'Bet ID required' });
    }
    const {
      autoCashoutEnabled,
      autoCashoutPrice,
      autoCashoutProfit,
      autoCashoutLoss,
    } = req.body;

    const bet = await TradingBet.findOne({
      _id: betId,
      userId,
      status: 'active',
    });

    if (!bet) {
      return res.status(404).json({
        success: false,
        error: 'Active bet not found',
      });
    }

    // Update auto cashout settings
    if (autoCashoutEnabled !== undefined) {
      bet.autoCashoutEnabled = autoCashoutEnabled;
    }
    if (autoCashoutPrice !== undefined) {
      bet.autoCashoutPrice = autoCashoutPrice;
    }
    if (autoCashoutProfit !== undefined) {
      bet.autoCashoutProfit = autoCashoutProfit;
    }
    if (autoCashoutLoss !== undefined) {
      bet.autoCashoutLoss = autoCashoutLoss;
    }

    await bet.save();

    res.json({
      success: true,
      data: bet,
    });
  } catch (error: any) {
    console.error('Error updating auto cashout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update auto cashout',
    });
  }
};

