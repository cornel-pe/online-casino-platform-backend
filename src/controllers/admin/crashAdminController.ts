import { Request, Response } from 'express';
import { crashGameEngine } from '../../engine/crashGameEngine';
import { CrashGame } from '../../models/Crash';
import { AuthenticatedRequest } from '../../utils/auditLogger';
import { getParam } from '../../utils/requestParams';
import mongoose from 'mongoose';

// Get current round status for admin
export const getCurrentRound = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = crashGameEngine.getStatus();
    const currentGame = crashGameEngine.getCurrentGame();

    res.json({
      success: true,
      data: {
        isRunning: status.isRunning,
        isPaused: status.isPaused,
        currentGame: currentGame ? {
          roundId: currentGame._id,
          round: currentGame.round,
          status: currentGame.status,
          currentMultiplier: currentGame.currentMultiplier,
          crashPoint: currentGame.crashPoint, // Admin can see crash point
          totalBetAmount: currentGame.totalBetAmount,
          totalPayout: currentGame.totalPayout,
          playerCount: currentGame.playerBets.length,
          startTime: currentGame.startTime,
          bettingEndTime: currentGame.bettingEndTime,
          crashTime: currentGame.crashTime,
          serverSeedHash: currentGame.serverSeedHash,
          publicSeed: currentGame.publicSeed,
          playerBets: currentGame.playerBets.map((bet: any) => ({
            playerId: bet.user.toString(),
            username: bet.username,
            avatar: bet.avatar,
            betAmount: bet.betAmount,
            autoCashoutMultiplier: bet.autoCashoutMultiplier,
            cashoutMultiplier: bet.cashoutMultiplier,
            payout: bet.payout,
            status: bet.status,
            joinedAt: bet.joinedAt,
            cashedOutAt: bet.cashedOutAt
          }))
        } : null
      }
    });

  } catch (error) {
    console.error('Error getting current round:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get current round'
    });
  }
};

// Start crash game engine
export const startEngine = async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`🚀 Admin ${req.user?.username} attempting to start crash game engine`);

    // Check if engine is already running
    const status = crashGameEngine.getStatus();
    if (status.isRunning) {
      res.json({
        success: false,
        message: 'Crash game engine is already running'
      });
      return;
    }

    // Start the engine
    await crashGameEngine.start();
    
    // Check if it started successfully
    const newStatus = crashGameEngine.getStatus();
    
    res.json({
      success: true,
      message: newStatus.isRunning ? 'Crash game engine started successfully' : 'Engine start attempted, but may be disabled in settings',
      data: {
        isRunning: newStatus.isRunning,
        isPaused: newStatus.isPaused
      }
    });

  } catch (error) {
    console.error('Error starting crash game engine:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start crash game engine'
    });
  }
};

// Force end current round
export const forceEndRound = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const roundId = getParam(req, 'roundId');
    if (!roundId) {
      return res.status(400).json({ success: false, error: 'Round ID required' });
    }
    const { reason } = req.body;

    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'Round ID is required'
      });
    }

    const adminReason = reason || 'Manually ended by admin';
    const adminId = req.user?._id.toString();

    const result = await crashGameEngine.forceEndGame(adminReason, adminId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Round ended successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to end round'
      });
    }

  } catch (error) {
    console.error('Error force ending round:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to force end round'
    });
  }
};

// Pause crash game engine
export const pauseEngine = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await crashGameEngine.pause();

    if (result.success) {
      res.json({
        success: true,
        message: 'Crash game engine paused successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to pause engine'
      });
    }

  } catch (error) {
    console.error('Error pausing engine:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause crash game engine'
    });
  }
};

// Resume crash game engine
export const resumeEngine = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await crashGameEngine.resume();

    if (result.success) {
      res.json({
        success: true,
        message: 'Crash game engine resumed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to resume engine'
      });
    }

  } catch (error) {
    console.error('Error resuming engine:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume crash game engine'
    });
  }
};

// Get crash game history for admin
export const getCrashHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search, round, sortField = 'startTime', sortDirection = 'desc' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 50);
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { status: 'ended' };
    
    // Add search functionality
    if (search) {
      const searchStr = search as string;
      
      // Check if search is a valid ObjectId format (24 hex characters)
      const isObjectId = /^[a-fA-F0-9]{24}$/.test(searchStr);
      
      if (isObjectId) {
        // Search by ObjectId directly (no regex needed)
        filter._id = new mongoose.Types.ObjectId(searchStr);
      } else {
        // Search by round number if it's a number
        const searchNum = parseInt(searchStr);
        if (!isNaN(searchNum)) {
          filter.round = searchNum;
        }
        // If it's not a number and not an ObjectId, ignore the search
      }
    }
    
    // Add round number search
    if (round) {
      filter.round = parseInt(round as string);
    }
    
    // Build sort object
    let sortObj: any = {};
    const direction = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortField) {
      case 'round':
        sortObj.round = direction;
        break;
      case 'crashPoint':
        sortObj.currentMultiplier = direction;
        break;
      case 'totalBets':
        sortObj.totalBetAmount = direction;
        break;
      case 'totalPayout':
        sortObj.totalPayout = direction;
        break;
      case 'playerCount':
        // For player count, we'll sort by the length of playerBets array
        // This requires aggregation for accurate sorting
        break;
      case 'startTime':
      default:
        sortObj.startTime = direction;
        break;
    }
    
    // Default sort if no specific sort field
    if (Object.keys(sortObj).length === 0) {
      sortObj.startTime = -1;
    }

    const [games, total] = await Promise.all([
      CrashGame.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .populate('playerBets.user', 'username avatar')
        .exec(),
      CrashGame.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: {
        games: games.map(game => ({
          id: game._id,
          roundId: game.round, // Use round number for display
          round: game.round,
          crashPoint: game.currentMultiplier,
          totalBets: game.totalBetAmount,
          totalPayout: game.totalPayout,
          playerCount: game.playerBets.length,
          serverSeed: game.serverSeed,
          serverSeedHash: game.serverSeedHash,
          publicSeed: game.publicSeed,
          startTime: game.startTime,
          endTime: game.endTime,
          status: game.status
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: totalPages
        }
      }
    });

  } catch (error) {
    console.error('Error getting crash history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get crash game history'
    });
  }
};

// Get detailed game bets for admin
export const getGameBets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gameId = getParam(req, 'gameId');
    if (!gameId) {
      return res.status(400).json({ success: false, error: 'Game ID required' });
    }

    if (!gameId || !mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid game ID is required'
      });
    }

    const game = await CrashGame.findById(gameId)
      .populate('playerBets.user', 'username avatar')
      .exec();

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    res.json({
      success: true,
      data: {
        game: {
          roundId: game._id,
          round: game.round,
          crashPoint: game.currentMultiplier,
          totalBets: game.totalBetAmount,
          totalPayout: game.totalPayout,
          playerCount: game.playerBets.length,
          serverSeed: game.serverSeed,
          serverSeedHash: game.serverSeedHash,
          publicSeed: game.publicSeed,
          startTime: game.startTime,
          endTime: game.endTime,
          status: game.status
        },
        playerBets: game.playerBets.map(bet => ({
          playerId: bet.user,
          username: bet.username,
          avatar: bet.avatar,
          betAmount: bet.betAmount,
          autoCashoutMultiplier: bet.autoCashoutMultiplier,
          cashoutMultiplier: bet.cashoutMultiplier,
          payout: bet.payout,
          status: bet.status,
          joinedAt: bet.joinedAt,
          cashedOutAt: bet.cashedOutAt,
          transactionId: bet.transactionId
        }))
      }
    });

  } catch (error) {
    console.error('Error getting game bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game bets'
    });
  }
};

// Get crash game statistics
export const getCrashStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalGames,
      todayGames,
      totalVolume,
      totalPayout,
      avgCrashPoint
    ] = await Promise.all([
      CrashGame.countDocuments({ status: 'ended' }),
      CrashGame.countDocuments({ status: 'ended', createdAt: { $gte: today } }),
      CrashGame.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, total: { $sum: '$totalBetAmount' } } }
      ]),
      CrashGame.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, total: { $sum: '$totalPayout' } } }
      ]),
      CrashGame.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, avg: { $avg: '$currentMultiplier' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalGames,
        todayGames,
        totalVolume: totalVolume[0]?.total || 0,
        totalPayout: totalPayout[0]?.total || 0,
        avgCrashPoint: avgCrashPoint[0]?.avg || 0,
        houseProfit: (totalVolume[0]?.total || 0) - (totalPayout[0]?.total || 0)
      }
    });

  } catch (error) {
    console.error('Error getting crash stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get crash game statistics'
    });
  }
};
