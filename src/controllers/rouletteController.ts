import { Request, Response } from "express";
import mongoose from "mongoose";
import { rouletteGameEngine } from "../engine/rouletteGameEngine";
import { RouletteGame } from "../models/Roulette";
import { verifyRouletteResult } from "../utils/randomGenerator";

// Interface for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    username: string;
    email: string;
  };
}

export class RouletteController {
  // Get current roulette game
  static async getCurrentGame(req: Request, res: Response) {
    try {
      const currentGame = rouletteGameEngine.getCurrentGame();
      const status = rouletteGameEngine.getStatus();
      
      if (!currentGame) {
        return res.json({
          success: true,
          data: null,
          status: status
        });
      }

      // Format the response
      const gameData = {
        gameId: currentGame.gameId,
        status: currentGame.status,
        totalBetAmount: currentGame.totalBetAmount,
        playerCount: currentGame.playerCount,
        bettingStartTime: currentGame.bettingStartTime,
        bettingEndTime: currentGame.bettingEndTime,
        bettingDurationMs: currentGame.bettingDurationMs,
        minBetAmount: currentGame.minBetAmount,
        maxBetAmount: currentGame.maxBetAmount,
        serverSeedHash: currentGame.serverSeedHash,
        publicSeed: currentGame.publicSeed,
        players: currentGame.playerBets.map((bet: any) => ({
          userId: bet.user.toString(),
          username: bet.username,
          avatar: bet.avatar,
          betAmount: bet.betAmount,
          betType: bet.betType,
        })),
        winner: currentGame.winners
      };

      res.json({
        success: true,
        data: gameData,
        status: status
      });

    } catch (error) {
      console.error('Error getting current roulette game:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get current roulette game',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Place bet in current roulette
  static async placeBet(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?._id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { betAmount, betType } = req.body;

      if (!betAmount || typeof betAmount !== 'number' || betAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid bet amount is required'
        });
      }

      const result = await rouletteGameEngine.placeBet(req.user._id, betAmount, betType);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Error placing roulette bet:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to place bet',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get roulette game history
  static async getHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        search = '',
        sortBy = 'completedAt',
        sortOrder = 'desc'
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build query for completed games only
      let query: any = { status: 'completed' };

      // Search by game ID or winner username
      if (search) {
        const searchRegex = new RegExp(search as string, 'i');
        const searchNumber = parseInt(search as string);
        query.$or = [
          // If search is a number, search gameId as number, otherwise use regex for username
          ...(isNaN(searchNumber) ? [] : [{ gameId: searchNumber }]),
          { 'winners.username': searchRegex }
        ];
      }

      // Build sort object
      const sort: any = {};
      const sortOrderValue = sortOrder === 'desc' ? -1 : 1;
      sort[sortBy as string] = sortOrderValue;

      // Execute query
      const [games, total] = await Promise.all([
        RouletteGame.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        RouletteGame.countDocuments(query)
      ]);

      // Format response
      const formattedGames = games.map((game: any) => ({
        id: game._id,
        gameId: game.gameId,
        totalBetAmount: game.totalBetAmount,
        playerCount: game.playerCount,
        winners: game.winners,
        winningSlot: game.winningSlot,
        winningType: game.winningType,
        completedAt: game.completedAt, // Map completedAt to time for frontend compatibility
        serverSeed: game.serverSeed,
        serverSeedHash: game.serverSeedHash,
        publicSeed: game.publicSeed,
      }));

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
      console.error('Error fetching roulette history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch roulette history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get user's roulette statistics
  static async getStats(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?._id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = req.user._id;

      // Get user's roulette statistics
      const stats = await RouletteGame.aggregate([
        { $match: { status: 'completed', 'playerBets.user': new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$playerBets' },
        { $match: { 'playerBets.user': new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalGames: { $sum: 1 },
            totalWagered: { $sum: '$playerBets.betAmount' },
            gamesWon: {
              $sum: { 
                $cond: [
                  { $in: [new mongoose.Types.ObjectId(userId), '$winners.userId'] }, 
                  1, 
                  0
                ] 
              }
            },
            totalWinnings: {
              $sum: { 
                $let: {
                  vars: {
                    userWinner: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$winners',
                            cond: { $eq: ['$$this.userId', new mongoose.Types.ObjectId(userId)] }
                          }
                        },
                        0
                      ]
                    }
                  },
                  in: { $ifNull: ['$$userWinner.payout', 0] }
                }
              }
            },
            avgBetAmount: { $avg: '$playerBets.betAmount' },
            maxBetAmount: { $max: '$playerBets.betAmount' },
            avgWinningSlot: { $avg: '$winningSlot' },
            mostCommonWinningType: { $first: '$winningType' },
          }
        }
      ]);

      const userStats = stats[0] || {
        totalGames: 0,
        totalWagered: 0,
        gamesWon: 0,
        totalWinnings: 0,
        avgBetAmount: 0,
        maxBetAmount: 0,
        avgWinningSlot: 0,
        mostCommonWinningType: null,
      };

      // Calculate additional stats
      const winRate = userStats.totalGames > 0 
        ? (userStats.gamesWon / userStats.totalGames) * 100 
        : 0;
      
      const profit = userStats.totalWinnings - userStats.totalWagered;
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
        }
      });

    } catch (error) {
      console.error('Error fetching roulette stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch roulette statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get user's roulette games
  static async getUserGames(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!._id;
      const { status, limit = 20, page = 1 } = req.query;

      const query: any = {
        'playerBets.user': userId
      };

      if (status && ['waiting', 'betting', 'drawing', 'completed', 'cancelled'].includes(status as string)) {
        query.status = status;
      }

      const games = await RouletteGame.find(query)
        .populate('playerBets.user', 'username displayName avatar level')
        .populate('winners.userId', 'username displayName avatar level')
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
          gameId: game.gameId,
          status: game.status,
          totalBetAmount: game.totalBetAmount,
          playerCount: game.playerCount,
          winningSlot: game.winningSlot,
          winningType: game.winningType,
          winners: game.winners,
          serverSeed: game.serverSeed,
          serverSeedHash: game.serverSeedHash,
          publicSeed: game.publicSeed,
          eosBlockNumber: game.eosBlockNumber,
          createdAt: game.createdAt,
          completedAt: game.completedAt,
          // User's specific bet info (only return bet details, not full user object)
          userBet: userBet ? {
            betAmount: userBet.betAmount,
            betType: userBet.betType,
            joinedAt: userBet.joinedAt
          } : undefined,
          // Check if user won
          userWon: game.winners?.some((winner: any) => {
            const winnerUserId = winner.userId?._id ? winner.userId._id.toString() : winner.userId.toString();
            return winnerUserId === userId.toString();
          }) || false
        };
      });

      res.json({
        success: true,
        data: userGames
      });

    } catch (error) {
      console.error('Error fetching user roulette games:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user roulette games',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Verify roulette game result
  static async verifyGame(req: Request, res: Response) {
    try {
      const { serverSeed, publicSeed, gameId, eosBlockNumber } = req.body;

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

      if (publicSeed.length !== 64) {
        return res.status(400).json({
          success: false,
          message: 'Public seed must be exactly 64 characters long'
        });
      }

      // Generate expected result using the verification function
      // If eosBlockNumber is provided, use it for more accurate verification
      const expectedResult = verifyRouletteResult(
        serverSeed, 
        publicSeed, 
        gameId, 
        eosBlockNumber
      );

      res.json({
        success: true,
        data: {
          expectedResult,
          serverSeed: serverSeed.substring(0, 16) + '...',
          publicSeed: publicSeed.substring(0, 16) + '...',
          gameId,
          eosBlockNumber: eosBlockNumber || null,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error verifying roulette game:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify roulette game',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
