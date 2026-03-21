import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/supabaseAuth';
import Mine from '../models/Mine';
import Token from '../models/Token';
import User from '../models/User';
import rng from '../platform/rng';
import { createSignatureHash } from '../utils/randomGenerator';
import { calculateNextMultiplier } from '../utils/multiplierCalculator';
import { generateNextMineGameId } from '../utils/gameIdGenerator';
import { getParam } from '../utils/requestParams';

export class MineController {
  // Get game configuration
  static async getConfig(req: Request, res: Response) {
    try {
      const tokens = await Token.find({ isActive: true }).select('name symbol price');

      const config = {
        gridSizes: [3, 4, 5, 6, 7, 8, 9, 10],
        maxMines: 24, // For 5x5 grid
        minBetAmount: 0.001,
        tokens,
      };

      res.json(config);
    } catch (error) {
      console.error('Error getting mine config:', error);
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  }

  // Create a new mine game
  static async createGame(req: AuthenticatedRequest, res: Response) {
    try {
      const { numMines, betAmount, clientSeed } = req.body;
      const userId = req.user!._id;

      // Validate input
      if (!numMines || !betAmount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate number of mines
      const totalTiles = 25;
      if (numMines < 1 || numMines >= totalTiles) {
        return res.status(400).json({ error: 'Invalid number of mines' });
      }

      // Validate bet amount
      if (betAmount < 0.001) {
        return res.status(400).json({ error: 'Bet amount too low' });
      }

      // Check user balance
      if (req.user!.balance < betAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Generate server seed and use user's current client seed
      const serverSeed = rng.generateServerSeed();
      // Use the user's current client seed from their profile (not from request)
      const userClientSeed = req.user!.seed || rng.generateClientSeed();
      const clientSeedHash = rng.generateClientSeedHash(userClientSeed);

      // Generate next game ID first
      const gameId = await generateNextMineGameId();
      
      // Generate mine positions using updated function with client seed and gameId
      const mineTiles = rng.generateMinePositions(serverSeed, userClientSeed, 5, numMines, gameId.toString());
      const serverSeedHash = rng.generateServerSeedHash(serverSeed);
      const sigHash = createSignatureHash(5, numMines, betAmount, serverSeedHash, userId.toString());

      // Create the game
      const game = new Mine({
        gameId,
        player: userId,
        token: null,
        gridSize: 5,
        numMines,
        betAmount,
        serverSeed,
        clientSeed: userClientSeed,
        mineTiles,
        sigHash,
        status: 'playing',
        revealedTiles: [],
        currentMultiplier: 1.0,
      });

      await game.save();

      // Deduct bet amount from user balance
      await User.findByIdAndUpdate(userId, {
        $inc: {
          balance: -betAmount,
          totalWagered: betAmount,
          totalBets: 1
        }
      });

      // Return public game state with seed hashes
      const gameState = game.getPublicGameState();
      res.json({
        ...gameState,
        clientSeedHash, // Include client seed hash for verification
        serverSeedHash  // Include server seed hash
      });

    } catch (error) {
      console.error('Error creating mine game:', error);
      res.status(500).json({ error: 'Failed to create game' });
    }
  }

  // NEW: Verify game result endpoint
  static async verifyGame(req: Request, res: Response) {
    try {
      const { gameId, serverSeed, clientSeed, numMines, gridSize = 5 } = req.body;

      if (!gameId || !serverSeed || !clientSeed || !numMines) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Generate mine positions using ONLY the request parameters
      // This allows users to verify what the result should be with those exact parameters
      const expectedPositions = rng.generateMinePositions(
        serverSeed,    // Use server seed from request
        clientSeed,    // Use client seed from request  
        gridSize,      // Use grid size from request (default 5)
        numMines,      // Use num mines from request
        gameId.toString()  // Use gameId from request as nonce
      );

      res.json({
        verified: true,  // Always true since we're generating from user inputs
        gameId: gameId,
        serverSeed: serverSeed,
        clientSeed: clientSeed,
        expectedPositions: expectedPositions,
        gridSize: gridSize,
        numMines: numMines
      });

    } catch (error) {
      console.error('Error verifying mine game:', error);
      res.status(500).json({ error: 'Failed to verify game' });
    }
  }

  // NEW: Generate client seed endpoint
  static async generateClientSeed(req: Request, res: Response) {
    try {
      const clientSeed = rng.generateClientSeed();
      const clientSeedHash = rng.generateClientSeedHash(clientSeed);

      res.json({
        clientSeed,
        clientSeedHash
      });

    } catch (error) {
      console.error('Error generating client seed:', error);
      res.status(500).json({ error: 'Failed to generate client seed' });
    }
  }

  // Get game state (for active games)
  static async betPlace(req: AuthenticatedRequest, res: Response) {
    try {
      const { index, gameId } = req.body;
      const userId = req.user!._id;

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      const game = await Mine.findById(decodedId);

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      console.log('game.player', game.player, userId.toString())
      // Check if user owns this game
      if (game.player.toString() !== userId.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

    } catch (error) {
      console.error('Error getting game state:', error);
      res.status(500).json({ error: 'Failed to get game state' });
    }
  }

  // Get game state (for active games)
  static async getGameState(req: AuthenticatedRequest, res: Response) {
    try {
      const gameId = getParam(req, 'gameId');
      if (!gameId) {
        return res.status(400).json({ error: 'Game ID required' });
      }
      const userId = req.user!._id;

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      const game = await Mine.findById(decodedId);

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      console.log('game.player', game.player, userId.toString())

      // Check if user owns this game
      if (game.player.toString() !== userId.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const gameState = game.getPublicGameState();
      res.json(gameState);

    } catch (error) {
      console.error('Error getting game state:', error);
      res.status(500).json({ error: 'Failed to get game state' });
    }
  }

  // Get public game state (for completed games)
  static async getPublicGameState(req: Request, res: Response) {
    try {
      const gameId = getParam(req, 'gameId');
      if (!gameId) {
        return res.status(400).json({ error: 'Game ID required' });
      }

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      const game = await Mine.findById(decodedId);

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      // Only return completed games publicly
      if (game.status === 'playing') {
        return res.status(403).json({ error: 'Game is still in progress' });
      }

      const gameState = game.getCompletedGameState();
      res.json(gameState);

    } catch (error) {
      console.error('Error getting public game state:', error);
      res.status(500).json({ error: 'Failed to get game state' });
    }
  }

  // Note: Tile revelation is now handled via WebSocket for real-time gameplay

  // Cash out from game
  static async cashOut(req: AuthenticatedRequest, res: Response) {
    try {
      const gameId = getParam(req, 'gameId');
      if (!gameId) {
        return res.status(400).json({ error: 'Game ID required' });
      }
      const userId = req.user!._id;

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      const game = await Mine.findById(decodedId);

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      // Check if user owns this game
      if (game.player.toString() !== userId.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Cash out logic is handled via sockets in real-time flow.
      // This HTTP endpoint is kept for compatibility but does not mutate balance.
      const gameState = game.getCompletedGameState();
      res.json(gameState);

    } catch (error) {
      console.error('Error cashing out:', error);
      res.status(500).json({ error: 'Failed to cash out' });
    }
  }

  // Get player's games
  static async getPlayerGames(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!._id;
      const { status, limit = 20, page = 1 } = req.query;

      const query: any = { player: userId };
      if (status && ['playing', 'win', 'lose'].includes(status as string)) {
        query.status = status;
      }

      const games = await Mine.find(query)
        .populate('token', 'name symbol')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      const gameStates = games.map(game => {
        if (game.status === 'playing') {
          return game.getPublicGameState();
        } else {
          return game.getCompletedGameState();
        }
      });

      res.json(gameStates);

    } catch (error) {
      console.error('Error getting player games:', error);
      res.status(500).json({ error: 'Failed to get games' });
    }
  }

  // Delete a game (only for playing games)
  static async deleteGame(req: AuthenticatedRequest, res: Response) {
    try {
      const gameId = getParam(req, 'gameId');
      if (!gameId) {
        return res.status(400).json({ error: 'Game ID required' });
      }
      const userId = req.user!._id;

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      const game = await Mine.findById(decodedId);

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      // Check if user owns this game
      if (game.player.toString() !== userId.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Only allow deletion of playing games
      if (game.status !== 'playing') {
        return res.status(400).json({ error: 'Cannot delete completed game' });
      }

      await Mine.findByIdAndDelete(decodedId);

      res.json({ success: true, message: 'Game deleted successfully' });

    } catch (error) {
      console.error('Error deleting game:', error);
      res.status(500).json({ error: 'Failed to delete game' });
    }
  }

  // Get user's incomplete games
  static async getIncompleteGames(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!._id;

      // Find games that are still in 'playing' status for this user
      const incompleteGames = await Mine.find({
        player: userId,
        status: 'playing'
      })
        .populate('player', 'username avatar')
        .populate('token', 'symbol name')
        .sort({ createdAt: -1 }) // Most recent first
        .lean();

      // Format response
      const formattedGames = incompleteGames.map(game => ({
        id: Buffer.from(game._id.toString()).toString('base64'),
        player: {
          id: game.player?._id || game.player,
          username: (game.player as any)?.username || 'Unknown',
          avatar: (game.player as any)?.avatar || null
        },
        token: game.token ? {
          symbol: (game.token as any)?.symbol || 'Unknown',
          name: (game.token as any)?.name || 'Unknown'
        } : undefined,
        time: game.createdAt,
        wager: game.betAmount,
        multiplier: game.currentMultiplier,
        payout: game.payout || 0,
        status: game.status,
        gridSize: game.gridSize,
        numMines: game.numMines,
        revealedTiles: game.revealedTiles,
        completedAt: game.completedAt
      }));

      res.json({
        success: true,
        data: {
          games: formattedGames,
          total: incompleteGames.length
        }
      });
    } catch (error) {
      console.error('Error fetching incomplete games:', error);
      res.status(500).json({ error: 'Failed to fetch incomplete games' });
    }
  }

  // Get mine game history with pagination, search, and filtering
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

      // Build query
      let query: any = {};

      // Filter by game type
      if (gameType === 'my' && req.user?._id) {
        query.player = req.user._id;
      }

      // Search by player username, game ID, or gameId
      if (search) {
        const searchRegex = new RegExp(search as string, 'i');

        // If searching for a specific user, find user IDs first
        const users = await User.find({
          username: searchRegex
        }).select('_id');

        const userIds = users.map(user => user._id);

        // Build search conditions
        const searchConditions: any[] = [
          { player: { $in: userIds } }
        ];

        // Check if search term is a valid ObjectId format (24 hex characters)
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        if (objectIdRegex.test(search as string)) {
          try {
            const mongoose = require('mongoose');
            const searchObjectId = new mongoose.Types.ObjectId(search as string);
            searchConditions.push({ _id: searchObjectId });
          } catch (error) {
            // If ObjectId creation fails, just skip this condition
            console.log('Invalid ObjectId format for search:', search);
          }
        }

        // Simple partial match for gameId (like %search%)
        const gameIdRegex = new RegExp(search as string);
        searchConditions.push({
          $expr: {
            $regexMatch: {
              input: { $toString: "$gameId" },
              regex: gameIdRegex
            }
          }
        });

        query.$or = searchConditions;
      }

      // Build sort object - map frontend field names to database field names
      const sort: any = {};
      const sortOrderValue = sortOrder === 'desc' ? -1 : 1;

      // Map frontend field names to database field names
      const fieldMapping: { [key: string]: string } = {
        'wager': 'betAmount',
        'multiplier': 'currentMultiplier',
        'createdAt': 'createdAt',
        'payout': 'payout'
      };

      const dbFieldName = fieldMapping[sortBy as string] || sortBy as string;
      sort[dbFieldName] = sortOrderValue;

      // Execute query with population
      const [games, total] = await Promise.all([
        Mine.find(query)
          .populate('player', 'username avatar')
          .populate('token', 'symbol name')
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean() as unknown as any[],
        Mine.countDocuments(query)
      ]);

      // Format response
      const formattedGames = games.map(game => ({
        _id: game._id,
        gameId: game.gameId,
        id: Buffer.from(game._id.toString()).toString('base64'),
        player: {
          id: game.player?._id || game.player,
          username: (game.player as any)?.username || 'Unknown',
          avatar: (game.player as any)?.avatar || null
        },
        time: game.createdAt,
        wager: game.betAmount,
        multiplier: game.currentMultiplier,
        payout: game.payout,
        status: game.status,
        gridSize: game.gridSize,
        numMines: game.numMines,
        revealedTiles: game.revealedTiles, // Return actual array of tile positions
        mineTiles: game.mineTiles, // Return actual array of mine positions
        completedAt: game.completedAt,
        serverSeed: game.serverSeed,
        clientSeed: game.clientSeed,
        createdAt: game.createdAt
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
      console.error('Error fetching mine history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mine game history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get mine game statistics for a user
  static async getStats(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?._id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = req.user._id;

      // Get user's mine game statistics
      const stats = await Mine.aggregate([
        { $match: { player: userId } },
        {
          $group: {
            _id: null,
            totalGames: { $sum: 1 },
            totalWagered: { $sum: '$betAmount' },
            totalWon: { $sum: '$payout' },
            gamesWon: {
              $sum: { $cond: [{ $eq: ['$status', 'win'] }, 1, 0] }
            },
            gamesLost: {
              $sum: { $cond: [{ $eq: ['$status', 'lose'] }, 1, 0] }
            },
            avgMultiplier: { $avg: '$currentMultiplier' },
            maxMultiplier: { $max: '$currentMultiplier' },
            avgWager: { $avg: '$betAmount' },
            maxWager: { $max: '$betAmount' }
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
        maxWager: 0
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
          roi: Math.round(roi * 100) / 100
        }
      });

    } catch (error) {
      console.error('Error fetching mine stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mine game statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
