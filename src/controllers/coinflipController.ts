import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/supabaseAuth';
import Coinflip from '../models/Coinflip';
import User from '../models/User';
import Token from '../models/Token';
import HouseService from '../services/houseService';
import gameSettingsService from '../services/gameSettingsService';
import rng from '../platform/rng';
import { resolveCoinflipGame } from '../engine/coinflipGameEngine';
import { generateNextCoinflipGameId } from '../utils/gameIdGenerator';
import { getParam } from '../utils/requestParams';

export class CoinflipController {
  /** Get coinflip configuration */
  static async getConfig(req: Request, res: Response) {
    try {
      // Get game settings from database
      const settings = await gameSettingsService.getSettings();
      const tokens = await Token.find({ isActive: true }).select('name symbol price');
      
      const config = {
        enabled: settings.coinflip.enabled,
        maintenanceMessage: settings.coinflip.maintenanceMessage,
        minBetAmount: settings.coinflip.minBet,
        maxBetAmount: settings.coinflip.maxBet,
        platformFee: settings.coinflip.platformFee,
        tokens,
      };

      res.json(config);
    } catch (error) {
      console.error('Error getting coinflip config:', error);
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  }

  // Create a new coinflip game
  static async createGame(req: AuthenticatedRequest, res: Response) {
    try {
      const { betAmount, coinSide, creatorSeed } = req.body;
      const userId = req.user!._id;

      // Validate input
      if (!betAmount || !coinSide) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['heads', 'tails'].includes(coinSide)) {
        return res.status(400).json({ error: 'Invalid coin side' });
      }

      if (betAmount < (await gameSettingsService.getSettings()).coinflip.minBet) {
        return res.status(400).json({ error: 'Bet amount too low' });
      }

      if (betAmount > (await gameSettingsService.getSettings()).coinflip.maxBet) {
        return res.status(400).json({ error: 'Bet amount too high' });
      }

      // Check user balance
      if (req.user!.balance < betAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }


      // Generate server seed and hash via platform RNG
      const serverSeed = rng.generateServerSeed();
      const serverSeedHash = rng.generateServerSeedHash(serverSeed);

      // Generate next game ID
      const gameId = await generateNextCoinflipGameId();

      // Create the game
      const game = new Coinflip({
        gameId: gameId, // Use generated game ID
        creator: userId,
        betAmount,
        coinSide,
        serverSeed,
        serverSeedHash,
        creatorSeed: creatorSeed || '', // Store creator's seed if provided
        totalPot: betAmount,
      });

      await game.save();

      // Process bet through house service (handles treasury balance and transactions)
      const betResult = await HouseService.processBet(
        betAmount,
        'coinflip',
        game._id.toString(),
        userId.toString(),
        `coinflip-creator-bet-${game.gameId}`
      );

      if (!betResult.success) {
        // Rollback: delete the game if bet processing fails
        await Coinflip.findByIdAndDelete(game._id);
        return res.status(500).json({ error: 'Failed to process bet' });
      }

      // Deduct bet amount from user balance
      await User.findByIdAndUpdate(userId, { 
        $inc: { 
          balance: -betAmount,
          totalWagered: betAmount,
          totalBets: 1
        } 
      });

      // Populate creator info
      await game.populate('creator', 'username displayName avatar level');
      await game.populate('token', 'name symbol');

      res.json({
        success: true,
        game: game.getPublicGameState(),
      });

    } catch (error) {
      console.error('Error creating coinflip game:', error);
      res.status(500).json({ error: 'Failed to create game' });
    }
  }

  // Join an existing coinflip game
  static async joinGame(req: AuthenticatedRequest, res: Response) {
    try {
      const { gameId, userSeed, userSeedHash } = req.body;
      const userId = req.user!._id;

      // Validate input
      if (!gameId || !userSeed || !userSeedHash) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Handle both numeric gameId and base64-encoded MongoDB ObjectId
      let game;
      if (typeof gameId === 'number' || /^\d+$/.test(gameId)) {
        // Numeric gameId - find by gameId field
        game = await Coinflip.findOne({ gameId: Number(gameId) }).populate('creator', 'username displayName avatar level');
      } else {
        // Base64-encoded MongoDB ObjectId - decode and find by _id
        const decodedId = Buffer.from(gameId, 'base64').toString();
        game = await Coinflip.findById(decodedId).populate('creator', 'username displayName avatar level');
      }
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      // Check user balance
      if (req.user!.balance < game.betAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Verify user seed hash (platform RNG, still uses same hash algorithm)
      if (rng.generateServerSeedHash(userSeed) !== userSeedHash) {
        return res.status(400).json({ error: 'Invalid user seed hash' });
      }

      // Engine: resolve game outcome (pure logic, no DB or wallet)
      game.joiner = userId;
      game.joinerSeed = userSeed;

      const engineOutcome = resolveCoinflipGame(
        {
          gameId: game.gameId,
          creatorId: game.creator.toString(),
          joinerId: userId.toString(),
          betAmount: game.betAmount,
          coinSide: game.coinSide,
          serverSeed: game.serverSeed,
          creatorSeed: game.creatorSeed || '',
          joinerSeed: userSeed,
        },
        {},
        { rng }
      );

      game.status = 'completed';
      game.totalPot = engineOutcome.totalPot;
      game.platformFee = engineOutcome.platformFee;
      game.winnerPayout = engineOutcome.winnerPayout;
      game.winner = engineOutcome.winnerId as any;
      game.winningTicket = engineOutcome.winningTicket;
      game.completedAt = new Date();
      await game.save();

      // Process joiner's bet through house service
      const joinerBetResult = await HouseService.processBet(
        game.betAmount,
        'coinflip',
        game._id.toString(),
        userId.toString(),
        `coinflip-joiner-bet-${game.gameId}`
      );

      if (!joinerBetResult.success) {
        return res.status(500).json({ error: 'Failed to process joiner bet' });
      }

      // Deduct bet amount from joiner's balance
      await User.findByIdAndUpdate(userId, { 
        $inc: { 
          balance: -game.betAmount,
          totalWagered: game.betAmount,
          totalBets: 1
        } 
      });

      // Process winner's payout through house service
      const payoutResult = await HouseService.processPayout(
        game.winnerPayout,
        'coinflip',
        game._id.toString(),
        game.winner.toString(),
        `coinflip-payout-${game.gameId}`
      );

      if (!payoutResult.success) {
        console.error(`❌ Failed to process payout for winner ${game.winner}:`, payoutResult.error);
        return res.status(500).json({ error: 'Failed to process payout' });
      }

      // Add winnings to winner's balance and update stats
      const winner = await User.findById(game.winner);
      if (winner) {
        await User.findByIdAndUpdate(game.winner, {
          $inc: {
            balance: game.winnerPayout,
            totalWon: game.winnerPayout,
            totalWins: 1
          }
        });
      }

      // Update loser's stats
      const loser = game.winner?.toString() === game.creator.toString() ? game.joiner : game.creator;
      if (loser) {
        await User.findByIdAndUpdate(loser, {
          $inc: {
            totalLosses: 1
          }
        });
      }

      // Populate joiner info
      await game.populate('joiner', 'username displayName avatar level');

      res.json({
        success: true,
        game: game.getCompletedGameState(),
        winner: game.winner,
        winningTicket: game.winningTicket,
      });

    } catch (error) {
      console.error('Error joining coinflip game:', error);
      res.status(500).json({ error: 'Failed to join game' });
    }
  }

  // Get all coinflip games with filters
  static async getGames(req: Request, res: Response) {
    try {
      const { 
        status = 'all', 
        sortBy = 'createdAt', 
        sortOrder = 'desc',
        minAmount = 0,
        maxAmount = 1000000,
        limit = 50,
        page = 1
      } = req.query;

      // Build query
      const query: any = {};
      
      if (status !== 'all') {
        if (status === 'open') {
          query.status = 'waiting';
        } else if (status === 'closed') {
          query.status = { $in: ['completed', 'cancelled'] };
        } else {
          query.status = status;
        }
      }

      if (Number(minAmount) > 0 || Number(maxAmount) < 1000000) {
        query.betAmount = {};
        if (Number(minAmount) > 0) query.betAmount.$gte = Number(minAmount);
        if (Number(maxAmount) < 1000000) query.betAmount.$lte = Number(maxAmount);
      }

      // Build sort object
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

      // Calculate skip
      const skip = (Number(page) - 1) * Number(limit);

      // Get games
      const games = await Coinflip.find(query)
        .populate('creator', 'username displayName avatar level')
        .populate('joiner', 'username displayName avatar level')
        .populate('winner', 'username displayName avatar level')
        .sort(sort)
        .limit(Number(limit))
        .skip(skip);

      // Get total count for pagination
      const totalCount = await Coinflip.countDocuments(query);

      // Format games
      const formattedGames = games.map(game => {
        if (game.status === 'completed') {
          return game.getCompletedGameState();
        } else {
          return game.getPublicGameState();
        }
      });

      res.json({
        games: formattedGames,
        pagination: {
          total: totalCount,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(totalCount / Number(limit))
        }
      });

    } catch (error) {
      console.error('Error getting coinflip games:', error);
      res.status(500).json({ error: 'Failed to get games' });
    }
  }

  // Get a specific game by ID
  static async getGame(req: Request, res: Response) {
    try {
      const gameId = getParam(req, 'gameId');
      if (!gameId) {
        return res.status(400).json({ error: 'Game ID required' });
      }

      // Handle both numeric gameId and base64-encoded MongoDB ObjectId
      let game;
      if (typeof gameId === 'number' || /^\d+$/.test(gameId)) {
        // Numeric gameId - find by gameId field
        game = await Coinflip.findOne({ gameId: Number(gameId) })
          .populate('creator', 'username displayName avatar level')
          .populate('joiner', 'username displayName avatar level')
          .populate('winner', 'username displayName avatar level');
      } else {
        // Base64-encoded MongoDB ObjectId - decode and find by _id
        const decodedId = Buffer.from(gameId, 'base64').toString();
        game = await Coinflip.findById(decodedId)
          .populate('creator', 'username displayName avatar level')
          .populate('joiner', 'username displayName avatar level')
          .populate('winner', 'username displayName avatar level');
      }

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      let gameState;
      if (game.status === 'completed') {
        gameState = game.getCompletedGameState();
      } else {
        gameState = game.getPublicGameState();
      }

      res.json(gameState);

    } catch (error) {
      console.error('Error getting coinflip game:', error);
      res.status(500).json({ error: 'Failed to get game' });
    }
  }

  // Get user's coinflip games
  static async getUserGames(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!._id;
      const { status, limit = 20, page = 1 } = req.query;

      const query: any = {
        $or: [
          { creator: userId },
          { joiner: userId }
        ]
      };

      if (status && ['waiting', 'active', 'completed', 'cancelled'].includes(status as string)) {
        query.status = status;
      }

      const games = await Coinflip.find(query)
        .populate('creator', 'username displayName avatar level')
        .populate('joiner', 'username displayName avatar level')
        .populate('winner', 'username displayName avatar level')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      const formattedGames = games.map(game => {
        if (game.status === 'completed') {
          return game.getCompletedGameState();
        } else {
          return game.getPublicGameState();
        }
      });

      res.json(formattedGames);

    } catch (error) {
      console.error('Error getting user coinflip games:', error);
      res.status(500).json({ error: 'Failed to get user games' });
    }
  }

  // Cancel a waiting game
  // static async cancelGame(req: AuthenticatedRequest, res: Response) {
  //   try {
  //     const { gameId } = req.params;
  //     const userId = req.user!._id;

  //     // Handle both numeric gameId and base64-encoded MongoDB ObjectId
  //     let game;
  //     if (typeof gameId === 'number' || /^\d+$/.test(gameId)) {
  //       // Numeric gameId - find by gameId field
  //       game = await Coinflip.findOne({ gameId: Number(gameId) });
  //     } else {
  //       // Base64-encoded MongoDB ObjectId - decode and find by _id
  //       const decodedId = Buffer.from(gameId, 'base64').toString();
  //       game = await Coinflip.findById(decodedId);
  //     }
  //     if (!game) {
  //       return res.status(404).json({ error: 'Game not found' });
  //     }

  //     // Check if user is the creator
  //     if (game.creator.toString() !== userId.toString()) {
  //       return res.status(403).json({ error: 'Access denied' });
  //     }

  //     // Check if game can be cancelled
  //     if (game.status !== 'waiting') {
  //       return res.status(400).json({ error: 'Game cannot be cancelled' });
  //     }

  //     // Cancel the game
  //     const cancelled = await game.cancelGame();
  //     if (!cancelled) {
  //       return res.status(400).json({ error: 'Failed to cancel game' });
  //     }

  //     // Refund the bet amount
  //     await User.findByIdAndUpdate(userId, { 
  //       $inc: { 
  //         balance: game.betAmount,
  //         totalWagered: -game.betAmount,
  //         totalBets: -1
  //       } 
  //     });

  //     res.json({ success: true, message: 'Game cancelled successfully' });

  //   } catch (error) {
  //     console.error('Error cancelling coinflip game:', error);
  //     res.status(500).json({ error: 'Failed to cancel game' });
  //   }
  // }

  // Generate user seed hash pair
  static async generateUserSeed(req: Request, res: Response) {
    try {
      const seedPair = rng.generateSeedHashPair();
      
      if (!seedPair) {
        return res.status(500).json({ error: 'Failed to generate seed' });
      }

      res.json(seedPair);

    } catch (error) {
      console.error('Error generating user seed:', error);
      res.status(500).json({ error: 'Failed to generate seed' });
    }
  }

  // Verify coinflip game result
  static async verifyGame(req: Request, res: Response) {
    try {
      const { gameId, serverSeed, creatorSeed, joinerSeed } = req.body;

      if (!gameId || !serverSeed || !creatorSeed || !joinerSeed) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Generate expected result using the provided parameters
      const expectedResult = rng.generateCoinflipResult(
        serverSeed,
        creatorSeed,
        joinerSeed,
        gameId.toString()
      );

      res.json({
        verified: true,
        gameId: gameId,
        serverSeed: serverSeed,
        creatorSeed: creatorSeed,
        joinerSeed: joinerSeed,
        expectedResult: expectedResult
      });

    } catch (error) {
      console.error('Error verifying coinflip game:', error);
      res.status(500).json({ error: 'Failed to verify game' });
    }
  }
}
