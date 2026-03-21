// crash.controller.ts - Legacy crash game functions
// Most functions in this file are deprecated in favor of crashGameEngine.ts
// This file is kept for audit logs, monitoring, and backward compatibility

import { Request, Response } from "express";
import { CrashGame } from "../models/Crash";
import { AuditLog } from "../models/AuditLog";
import { AuditLogger, getUserFromRequest } from "../utils/auditLogger";
import { crashGameEngine } from "../engine/crashGameEngine";
import User from "../models/User";
import Console from "../utils/console";
import { getParam } from "../utils/requestParams";

// Interface for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    username: string;
    email: string;
  };
}

// ====================================================================
// NEW CRASH CONTROLLER - Public API endpoints
// ====================================================================

export class CrashController {
  // Debug endpoint to check database state
  static async debugDatabase(req: Request, res: Response) {
    try {
      // Get total count of all crash games
      const totalGames = await CrashGame.countDocuments();
      
      // Get count by status
      const statusCounts = await CrashGame.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      // Get recent games
      const recentGames = await CrashGame.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('round status crashPoint totalBetAmount playerBets createdAt')
        .lean();

      // Get ended games count
      const endedGames = await CrashGame.countDocuments({ status: 'ended' });

      res.json({
        success: true,
        data: {
          totalGames,
          statusCounts,
          endedGames,
          recentGames: recentGames.map(game => ({
            round: game.round,
            status: game.status,
            crashPoint: game.crashPoint,
            playerCount: game.playerBets?.length || 0,
            createdAt: (game as any).createdAt
          }))
        }
      });

    } catch (error) {
      console.error('Error in debug endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to debug database',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get current crash game
  static async getCurrentGame(req: Request, res: Response) {
    try {
      const currentGame = crashGameEngine.getCurrentGame();
      const status = crashGameEngine.getStatus();
      
      if (!currentGame) {
        return res.json({
          success: true,
          data: null,
          status: status
        });
      }

      // Format the response
      const gameData = {
        roundId: currentGame._id,
        round: currentGame.round,
        status: currentGame.status,
        currentMultiplier: currentGame.currentMultiplier,
        crashPoint: currentGame.crashPoint,
        totalBetAmount: currentGame.totalBetAmount,
        totalPayout: currentGame.totalPayout,
        playerCount: currentGame.playerBets.length,
        startTime: currentGame.startTime,
        bettingEndTime: currentGame.bettingEndTime,
        crashTime: currentGame.crashTime,
        endTime: currentGame.endTime,
        serverSeedHash: currentGame.serverSeedHash,
        publicSeed: currentGame.publicSeed
      };

      res.json({
        success: true,
        data: gameData,
        status: status
      });

    } catch (error) {
      console.error('Error getting current crash game:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get current crash game',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get crash history for modal (100 games with full details)
  static async getHistoryForModal(req: Request, res: Response) {
    try {
      const { limit = 100, onlyMyGames = false } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 100, 200); // Max 200 games

      // Build query
      let query: any = { status: 'ended' };

      // If filtering by user's games, check if user is authenticated
      // allowAnonymous middleware sets req.user if authenticated
      const authReq = req as any; // allowAnonymous sets req.user
      // Query params are always strings, so check for string 'true' or '1'
      const onlyMyGamesBool = onlyMyGames === 'true' || onlyMyGames === '1';
      
      if (onlyMyGamesBool) {
        if (authReq.user?._id) {
          query['playerBets.user'] = authReq.user._id;
        } else {
          // If filter is requested but no user, return empty
          return res.json({
            success: true,
            data: []
          });
        }
      }

      // Debug: Check total games count
      const totalEndedGames = await CrashGame.countDocuments({ status: 'ended' });
      console.log(`📊 [History Modal] Total ended games: ${totalEndedGames}, Query:`, JSON.stringify(query));

      // Get recent completed games with full details
      const games = await CrashGame.find(query)
        .sort({ round: -1 })
        .limit(limitNum)
        .select('round crashPoint _id serverSeedHash')
        .lean();

      console.log(`📊 [History Modal] Found ${games.length} games matching query`);

      // Format response
      const history = games.map(game => ({
        gameId: game.round,
        result: game.crashPoint,
        hash: game.serverSeedHash || game._id.toString().substring(0, 16)
      }));

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      console.error('Error fetching crash history for modal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch crash history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get crash analysis with threshold
  static async getAnalysis(req: Request, res: Response) {
    try {
      const { limit = 1000, threshold = 2 } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 1000, 5000); // Max 5000 games
      const thresholdNum = parseFloat(threshold as string) || 2;

      // Get games for analysis
      const games = await CrashGame.find({ status: 'ended' })
        .sort({ round: -1 })
        .limit(limitNum)
        .select('round crashPoint')
        .lean();

      // Reverse to get chronological order (oldest first)
      const gamesChronological = games.reverse();

      // Analyze games
      const range1: number[] = []; // [1, threshold)
      const range2: number[] = []; // [threshold, ∞)
      
      gamesChronological.forEach(game => {
        if (game.crashPoint < thresholdNum) {
          range1.push(game.crashPoint);
        } else {
          range2.push(game.crashPoint);
        }
      });

      // Calculate statistics
      const range1Count = range1.length;
      const range2Count = range2.length;
      const totalCount = games.length;
      
      const range1Chance = totalCount > 0 ? (range1Count / totalCount) * 100 : 0;
      const range2Chance = totalCount > 0 ? (range2Count / totalCount) * 100 : 0;

      // Calculate max combo (consecutive games in same range)
      let maxCombo1 = 0;
      let maxCombo2 = 0;
      let currentCombo1 = 0;
      let currentCombo2 = 0;

      gamesChronological.forEach(game => {
        if (game.crashPoint < thresholdNum) {
          currentCombo1++;
          currentCombo2 = 0;
          maxCombo1 = Math.max(maxCombo1, currentCombo1);
        } else {
          currentCombo2++;
          currentCombo1 = 0;
          maxCombo2 = Math.max(maxCombo2, currentCombo2);
        }
      });

      // Format analysis results
      const analysis = [
        {
          range: `[1, ${thresholdNum})`,
          chance: range1Chance.toFixed(2),
          count: range1Count,
          maxCombo: maxCombo1
        },
        {
          range: `[${thresholdNum}, ∞)`,
          chance: range2Chance.toFixed(2),
          count: range2Count,
          maxCombo: maxCombo2
        }
      ];

      // Format games list with range info
      const gamesList = gamesChronological.map(game => ({
        gameId: game.round,
        result: game.crashPoint,
        inRange1: game.crashPoint < thresholdNum
      }));

      res.json({
        success: true,
        data: {
          analysis,
          games: gamesList,
          threshold: thresholdNum,
          totalGames: totalCount
        }
      });

    } catch (error) {
      console.error('Error fetching crash analysis:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch crash analysis',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get recent crash game history (for top display - public endpoint)
  static async getRecentHistory(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 10, 20); // Max 20 games

      // Get recent completed games with minimal data
      const games = await CrashGame.find({ status: 'ended' })
        .sort({ round: -1 })
        .limit(limitNum)
        .select('round crashPoint _id')
        .lean();

      // Format response - simple structure for top display
      const recentHistory = games.map(game => ({
        roundId: game._id.toString(),
        round: game.round,
        crashPoint: game.crashPoint
      }));

      res.json({
        success: true,
        data: recentHistory
      });

    } catch (error) {
      console.error('Error fetching recent crash history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent crash history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get crash game history (supports both "all" and "my" gameType)
  static async getHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        search = '',
        gameType = 'all', // 'all' or 'my'
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build query for completed games only
      let query: any = { status: 'ended' };

      console.log("#############", gameType, req.user?._id)
      // Filter by game type
      if (gameType === 'my' && req.user?._id) {
        query['playerBets.user'] = req.user._id;
      }

      // Search by round ID or player username
      if (search) {
        const searchRegex = new RegExp(search as string, 'i');
        
        // Find users matching the search term
        const users = await User.find({ 
          username: searchRegex 
        }).select('_id');
        
        const userIds = users.map(user => user._id);
        
        // Build search conditions
        const searchConditions: any[] = [
          { 'playerBets.user': { $in: userIds } }
        ];
        
        // Check if search term could be a round number
        const roundNumber = parseInt(search as string);
        if (!isNaN(roundNumber)) {
          searchConditions.push({ round: roundNumber });
        }
        
        query.$or = searchConditions;
      }

      // Build sort object
      const sort: any = {};
      const sortOrderValue = sortOrder === 'desc' ? -1 : 1;
      
      // Map frontend field names to database field names
      const fieldMapping: { [key: string]: string } = {
        'createdAt': 'createdAt',
        'crashPoint': 'crashPoint',
        'totalBetAmount': 'totalBetAmount',
        'round': 'round'
      };
      
      const dbFieldName = fieldMapping[sortBy as string] || sortBy as string;
      sort[dbFieldName] = sortOrderValue;


      // Execute query
      const [games, total] = await Promise.all([
        CrashGame.find(query)
          .populate('playerBets.user', 'username avatar')
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        CrashGame.countDocuments(query)
      ]);

      Console.info('🔍 Query results:', { gamesFound: games.length, totalCount: total });
      
      // Debug: Log first few games to see their structure
      if (games.length > 0) {
        console.log('🔍 Sample game structure:', {
          round: games[0].round,
          status: games[0].status,
          playerBetsCount: games[0].playerBets?.length || 0,
          crashPoint: games[0].crashPoint,
          hasEndTime: !!games[0].endTime
        });
      }

      // Format response - game-centric format (one record per game round)
      const formattedGames = games.map(game => {
        // Calculate game statistics
        const playerBets = game.playerBets || [];
        const totalBetAmount = game.totalBetAmount || 0;
        const totalPayout = game.totalPayout || 0;
        const playerCount = playerBets.length;
        
        // Count winners and losers
        const winners = playerBets.filter((bet: any) => bet.status === 'cashed_out');
        const losers = playerBets.filter((bet: any) => bet.status === 'lost' || bet.status === 'active');

        // Format player details for the detail view
        const players = playerBets.map((bet: any) => ({
          id: bet.user._id || bet.user,
          username: bet.username || (bet.user as any)?.username || 'Unknown',
          avatar: bet.avatar || (bet.user as any)?.avatar || null,
          betAmount: bet.betAmount,
          cashoutMultiplier: bet.cashoutMultiplier,
          payout: bet.payout || 0,
          status: bet.status === 'cashed_out' ? 'won' : 'lost',
          joinedAt: bet.joinedAt,
          cashedOutAt: bet.cashedOutAt
        }));

        return {
          id: game._id,
          roundId: game._id,
          round: game.round,
          time: (game as any).createdAt,
          crashPoint: game.crashPoint,
          totalBetAmount,
          totalPayout,
          playerCount,
          winnersCount: winners.length,
          losersCount: losers.length,
          serverSeed: game.serverSeed,
          serverSeedHash: game.serverSeedHash,
          publicSeed: game.publicSeed,
          completedAt: game.endTime,
          // Player details for expandable view
          players: players
        };
      }).filter(game => game !== null); // Remove null entries from "my" games filter

      Console.info('🔍 Formatted games count:', formattedGames.length);

      // Sort formatted games by the same criteria
      formattedGames.sort((a, b) => {
        if (sortBy === 'crashPoint') {
          return sortOrder === 'desc' ? b.crashPoint - a.crashPoint : a.crashPoint - b.crashPoint;
        }
        if (sortBy === 'totalBetAmount') {
          return sortOrder === 'desc' ? b.totalBetAmount - a.totalBetAmount : a.totalBetAmount - b.totalBetAmount;
        }
        if (sortBy === 'playerCount') {
          return sortOrder === 'desc' ? b.playerCount - a.playerCount : a.playerCount - b.playerCount;
        }
        if (sortBy === 'round') {
          return sortOrder === 'desc' ? b.round - a.round : a.round - b.round;
        }
        // Default to time sorting
        const aTime = new Date(a.time).getTime();
        const bTime = new Date(b.time).getTime();
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      });

      const totalPages = Math.ceil(total / limitNum);

      res.json({
        success: true,
        data: {
          games: formattedGames,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalItems: total,
            itemsPerPage: limitNum,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1
          }
        }
      });

    } catch (error) {
      console.error('Error fetching crash history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch crash game history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }


  // Get user's crash game statistics
  static async getStats(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?._id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = req.user._id;

      // Get user's crash game statistics using aggregation
      const stats = await CrashGame.aggregate([
        { $match: { status: 'ended', 'playerBets.user': new (require('mongoose')).Types.ObjectId(userId) } },
        { $unwind: '$playerBets' },
        { $match: { 'playerBets.user': new (require('mongoose')).Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalGames: { $sum: 1 },
            totalWagered: { $sum: '$playerBets.betAmount' },
            totalWon: { $sum: '$playerBets.payout' },
            gamesWon: {
              $sum: { $cond: [{ $eq: ['$playerBets.status', 'cashed_out'] }, 1, 0] }
            },
            gamesLost: {
              $sum: { $cond: [{ $eq: ['$playerBets.status', 'lost'] }, 1, 0] }
            },
            avgMultiplier: { $avg: '$playerBets.cashoutMultiplier' },
            maxMultiplier: { $max: '$playerBets.cashoutMultiplier' },
            avgWager: { $avg: '$playerBets.betAmount' },
            maxWager: { $max: '$playerBets.betAmount' },
            avgCrashPoint: { $avg: '$crashPoint' },
            maxCrashPoint: { $max: '$crashPoint' }
          }
        }
      ]);

      const userStats = stats[0] || {
        totalGames: 0,
        totalWagered: 0,
        totalWon: 0,
        gamesWon: 0,
        gamesLost: 0,
        avgMultiplier: 0,
        maxMultiplier: 0,
        avgWager: 0,
        maxWager: 0,
        avgCrashPoint: 0,
        maxCrashPoint: 0
      };

      // Calculate additional stats
      const winRate = userStats.totalGames > 0 
        ? (userStats.gamesWon / userStats.totalGames) * 100 
        : 0;
      
      const profit = userStats.totalWon - userStats.totalWagered;
      const roi = userStats.totalWagered > 0 
        ? (profit / userStats.totalWagered) * 100 
        : 0;

      res.json({
        success: true,
        data: {
          ...userStats,
          winRate: Math.round(winRate * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          roi: Math.round(roi * 100) / 100,
          avgMultiplier: userStats.avgMultiplier || 0,
          avgCrashPoint: userStats.avgCrashPoint || 0
        }
      });

    } catch (error) {
      console.error('Error fetching crash stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch crash game statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get user's crash games
  static async getUserGames(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!._id;
      const { status, limit = 20, page = 1 } = req.query;

      const query: any = {
        'playerBets.user': userId
      };

      if (status && ['betting', 'flying', 'ended', 'crashed'].includes(status as string)) {
        query.status = status;
      }

      const games = await CrashGame.find(query)
        .populate('playerBets.user', 'username displayName avatar level')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit as string) * parseInt(page as string))
        .lean();

      // Filter and format games for user
      const userGames = games.map((game: any) => {
        // Find user's bet (handle both populated and non-populated user field)
        const userBet = game.playerBets.find((bet: any) => {
          const betUserId = bet.user?._id ? bet.user._id.toString() : bet.user.toString();
          return betUserId === userId.toString();
        });

        return {
          _id: game._id,
          round: game.round,
          status: game.status,
          crashPoint: game.crashPoint,
          totalBetAmount: game.totalBetAmount,
          totalPayout: game.totalPayout,
          playerCount: game.playerBets?.length || 0,
          serverSeed: game.serverSeed,
          serverSeedHash: game.serverSeedHash,
          publicSeed: game.publicSeed,
          eosBlockNumber: game.eosBlockNumber,
          createdAt: game.createdAt,
          endTime: game.endTime,
          startTime: game.startTime,
          // User's specific bet info (only return bet details, not full user object)
          userBet: userBet ? {
            betAmount: userBet.betAmount,
            cashoutMultiplier: userBet.cashoutMultiplier,
            payout: userBet.payout || 0,
            status: userBet.status,
            joinedAt: userBet.joinedAt,
            cashedOutAt: userBet.cashedOutAt
          } : undefined,
          // Check if user won
          userWon: userBet?.status === 'cashed_out' || false
        };
      });

      res.json({
        success: true,
        data: userGames
      });

    } catch (error) {
      console.error('Error fetching user crash games:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user crash games',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Verify crash game result
  static async verifyGame(req: Request, res: Response) {
    try {
      const { serverSeed, publicSeed, gameId } = req.body;

      // Validate input parameters
      if (!serverSeed || !publicSeed || !gameId) {
        return res.status(400).json({
          success: false,
          message: 'Server seed, public seed, and game ID are required'
        });
      }

      if (serverSeed.length !== 64) {
        return res.status(400).json({
          success: false,
          message: 'Server seed must be exactly 64 characters long'
        });
      }

      // Use the centralized verification function from randomGenerator
      const { verifyCrashPoint } = require('../utils/randomGenerator');
      const expectedResult = verifyCrashPoint(serverSeed, publicSeed, gameId);

      res.json({
        success: true,
        data: {
          expectedResult,
          serverSeed: serverSeed.substring(0, 16) + '...',
          publicSeed: publicSeed.substring(0, 16) + '...',
          gameId,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error verifying crash game:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify crash game',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// ====================================================================
// AUDIT LOG FUNCTIONS - Still useful for tracking admin actions
// ====================================================================

export async function getCrashAuditLogs(req: any, res: Response): Promise<void> {
  try {
    const { page = 1, limit = 50, action, startDate, endDate } = req.query;
    
    const filter: any = { category: 'crash' };
    if (action) filter.action = action;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate as string);
      if (endDate) filter.timestamp.$lte = new Date(endDate as string);
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit as string))
        .populate('userId', 'username email'),
      AuditLog.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit as string));

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit as string)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching crash audit logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
}

export async function getCrashAuditStats(req: any, res: Response): Promise<void> {
  try {
    const { period = '7d' } = req.query;
    
    let startDate: Date;
    const endDate = new Date();
    
    switch (period) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const stats = await AuditLog.aggregate([
      {
        $match: {
          category: 'crash',
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$timestamp' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const totalActions = await AuditLog.countDocuments({
      category: 'crash',
      timestamp: { $gte: startDate, $lte: endDate }
    });

    res.json({
      success: true,
      data: {
        period,
        totalActions,
        actionBreakdown: stats,
        dateRange: { startDate, endDate }
      }
    });

  } catch (error) {
    console.error('Error fetching crash audit stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit statistics' });
  }
}

// ====================================================================
// MONITORING FUNCTIONS - Useful for system health monitoring
// ====================================================================

export async function getCrashMonitoringData(req: any, res: Response): Promise<void> {
  try {
    const { period = '1h' } = req.query;
    
    let startDate: Date;
    const endDate = new Date();
    
    switch (period) {
      case '1h':
        startDate = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case '6h':
        startDate = new Date(Date.now() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 60 * 60 * 1000);
    }

    const [gameStats, recentGames] = await Promise.all([
      CrashGame.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgMultiplier: { $avg: '$multiplier' },
            totalBetAmount: { $sum: '$totalBetAmount' },
            totalPayout: { $sum: '$totalPayout' }
          }
        }
      ]),
      CrashGame.find({
        createdAt: { $gte: startDate, $lte: endDate }
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('round status multiplier totalBetAmount totalPayout createdAt')
    ]);

    const totalGames = gameStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalVolume = gameStats.reduce((sum, stat) => sum + (stat.totalBetAmount || 0), 0);
    const totalPayouts = gameStats.reduce((sum, stat) => sum + (stat.totalPayout || 0), 0);

    res.json({
      success: true,
      data: {
        period,
        summary: {
          totalGames,
          totalVolume,
          totalPayouts,
          houseProfit: totalVolume - totalPayouts
        },
        gameStats,
        recentGames,
        dateRange: { startDate, endDate }
      }
    });

  } catch (error) {
    console.error('Error fetching crash monitoring data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monitoring data' });
  }
}

export async function getCrashAlerts(req: any, res: Response): Promise<void> {
  try {
    const alerts = [];
    
    // Check for games stuck in running state for too long
    const stuckGames = await CrashGame.find({
      status: 'running',
      createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } // 10 minutes ago
    }).countDocuments();

    if (stuckGames > 0) {
      alerts.push({
        type: 'warning',
        message: `${stuckGames} games have been running for more than 10 minutes`,
        timestamp: new Date(),
        severity: 'medium'
      });
    }

    // Check for unusual multiplier patterns
    const recentHighMultipliers = await CrashGame.find({
      multiplier: { $gt: 100 },
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    }).countDocuments();

    if (recentHighMultipliers > 5) {
      alerts.push({
        type: 'info',
        message: `${recentHighMultipliers} games with multipliers >100x in the last hour`,
        timestamp: new Date(),
        severity: 'low'
      });
    }

    // Check for high volume games
    const highVolumeGames = await CrashGame.find({
      totalBetAmount: { $gt: 1000 },
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    }).countDocuments();

    if (highVolumeGames > 0) {
      alerts.push({
        type: 'info',
        message: `${highVolumeGames} high-volume games (>1000) in the last hour`,
        timestamp: new Date(),
        severity: 'low'
      });
    }

    res.json({
      success: true,
      data: {
        alerts,
        alertCount: alerts.length,
        lastChecked: new Date()
      }
    });

  } catch (error) {
    console.error('Error fetching crash alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
  }
}

export async function sendCrashAlertNotification(req: any, res: Response): Promise<void> {
  try {
    const { alertType, message, severity = 'medium' } = req.body;
    
    if (!alertType || !message) {
      res.status(400).json({ success: false, error: 'Alert type and message are required' });
      return;
    }

    // Log the alert
    await AuditLogger.logCrashGameAction(
      'alert_sent',
      `Alert notification sent: ${message}`,
      req.user?._id || 'system',
      req
    );

    // Here you could integrate with notification services like:
    // - Email notifications
    // - Slack/Discord webhooks
    // - SMS alerts
    // - Push notifications
    
    console.log(`🚨 Crash Game Alert [${severity.toUpperCase()}]: ${message}`);

    res.json({
      success: true,
      message: 'Alert notification sent successfully',
      alert: {
        type: alertType,
        message,
        severity,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Error sending crash alert notification:', error);
    res.status(500).json({ success: false, error: 'Failed to send alert notification' });
  }
}

// ====================================================================
// LEGACY HTTP - Moved from engine/crash.ts (no HTTP in engine)
// ====================================================================
export async function getCrashGame(req: Request, res: Response): Promise<void> {
  try {
    const round = getParam(req, "id");
    if (!round) {
      res.status(400).json({ msg: "Round ID required" });
      return;
    }
    const game = await CrashGame.findById(round).populate("players.user", "username avatar level");
    if (game && game?.status === "crashed") {
      res.status(200).json(game);
    } else {
      res.status(400).json({ msg: "The game isn't over yet." });
    }
  } catch (error) {
    res.status(400).json(error);
  }
}

export async function getCrashGames(req: Request, res: Response): Promise<void> {
  try {
    const { skip = 0, limit = 10 } = (req.query as { skip?: string; limit?: string }) || {};
    const skipNum = parseInt(String(skip), 10) || 0;
    const limitNum = parseInt(String(limit), 10) || 10;
    const history = await CrashGame.find({ status: { $ne: "STARTED" } })
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .populate("players.user", "username avatar level");
    res.status(200).json(history);
  } catch (error) {
    res.status(400).json(error);
  }
}

// LEGACY FUNCTIONS - Kept for backward compatibility
// These return deprecation warnings and redirect to new endpoints
// ====================================================================

export async function getCrashGameStatus(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Use /admin/crash/current-round instead',
    redirectTo: '/admin/crash/current-round'
  });
}

export async function pauseCrashGame(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Use /admin/crash/pause-engine instead',
    redirectTo: '/admin/crash/pause-engine'
  });
}

export async function resumeCrashGame(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Use /admin/crash/resume-engine instead',
    redirectTo: '/admin/crash/resume-engine'
  });
}

export async function forceEndCrashGame(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Use /admin/crash/force-end-round/:roundId instead',
    redirectTo: '/admin/crash/force-end-round/:roundId'
  });
}

export async function updateCrashGameConfig(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Use game settings endpoints instead',
    redirectTo: '/admin/games/settings'
  });
}

export async function getCrashGameHistory(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Use /admin/crash/history-new instead',
    redirectTo: '/admin/crash/history-new'
  });
}

// Placeholder functions for risk management (can be implemented later if needed)
export async function getCrashExposureData(req: any, res: Response): Promise<void> {
  res.status(501).json({
    success: false,
    error: 'Risk management features not yet implemented',
    message: 'This feature will be available in a future update'
  });
}

export async function updateCrashRiskSettings(req: any, res: Response): Promise<void> {
  res.status(501).json({
    success: false,
    error: 'Risk management features not yet implemented',
    message: 'This feature will be available in a future update'
  });
}

export async function getCrashRiskAlerts(req: any, res: Response): Promise<void> {
  res.status(501).json({
    success: false,
    error: 'Risk management features not yet implemented',
    message: 'This feature will be available in a future update'
  });
}

// Placeholder functions for provable fair (implemented in crashGameEngine)
export async function generateCrashSeeds(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Seed generation is now handled automatically by the crash game engine'
  });
}

export async function verifyCrashRound(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Round verification is now handled automatically by the crash game engine'
  });
}

export async function publishCrashSeedHash(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Seed hash publishing is now handled automatically by the crash game engine'
  });
}

export async function revealCrashSeed(req: any, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated',
    message: 'Seed revealing is now handled automatically by the crash game engine'
  });
}