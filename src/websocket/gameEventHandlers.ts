import { Socket } from 'socket.io';
import mongoose from 'mongoose';
import { ChatClient } from './types';
import { getIO } from './index';
import CoinflipModel from '../models/Coinflip';
import { CrashGame as CrashModel } from '../models/Crash';
import MineModel from '../models/Mine';
import ChatModel from '../models/Chat';
import TokenModel from '../models/Token';
import User from '../models/User';
import TransactionService from '../services/transactionService';
import houseService from '../services/houseService';
import XPService from '../services/xpService';
import { calculateMultiplier } from '../utils/multiplierCalculator';
import rng from '../platform/rng';
import { createSignatureHash } from '../utils/randomGenerator';
import { resolveCoinflipGame } from '../engine/coinflipGameEngine';
import OptimizedChatService from '../services/optimizedChatService';
import gameSettingsService from '../services/gameSettingsService';
import walletService from '../services/walletService';
import House from '../models/House';
import { generateNextCoinflipGameId } from '../utils/gameIdGenerator';

export function setupGameEventHandlers(socket: Socket, client: ChatClient) {
  console.log(`🎮 Setting up game event handlers for ${client.user.username}`);

  // Helper function to reject anonymous user actions
  const rejectAnonymousAction = (action: string) => {
    socket.emit('error', {
      message: `Anonymous users cannot ${action}. Please log in to continue.`,
      timestamp: new Date().toISOString()
    });
  };

  // ==================== COINFLIP EVENTS ====================

  socket.on('coinflip_get_games', async (data: any) => {
    try {
      console.log(`🎮 ${client.user.username} requested coinflip games`);

      // Get recent games (open games first, then recently closed)
      const openGames = await CoinflipModel.find({ status: 'waiting' })
        .populate('creator', '_id username displayName avatar level')
        .sort({ createdAt: -1 })
        .limit(25);

      const closedGames = await CoinflipModel.find({
        status: { $in: ['completed', 'cancelled'] }
      })
        .populate('creator', '_id username displayName avatar level')
        .populate('joiner', '_id username displayName avatar level')
        .populate('winner', '_id username displayName avatar level')
        .sort({ completedAt: -1 })
        .limit(25);

      // Combine and format games
      const allGames = [
        ...openGames.map(game => game.getPublicGameState()),
        ...closedGames.map(game => game.getCompletedGameState())
      ];

      console.log(`🎮 Found ${openGames.length} open games and ${closedGames.length} closed games`);

      socket.emit('coinflip_games_list', {
        games: allGames,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting coinflip games:', error);
      socket.emit('coinflip_error', {
        message: 'Failed to get games',
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('coinflip_create_game', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('create games');
      return;
    }

    try {
      const { betAmount, coinSide, creatorSeed } = data;

      // Validate input
      if (!betAmount || !coinSide) {
        socket.emit('coinflip_error', {
          message: 'Missing required fields: betAmount and coinSide are required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!['heads', 'tails'].includes(coinSide)) {
        socket.emit('coinflip_error', {
          message: 'Invalid coin side. Must be heads or tails.',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (betAmount <= 0) {
        socket.emit('coinflip_error', {
          message: 'Bet amount must be greater than 0',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (betAmount < 0.001) {
        socket.emit('coinflip_error', {
          message: 'Minimum bet amount is 0.001',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Get user from database to check and update balance
      const user = await User.findById(client.user.id);
      if (!user) {
        socket.emit('coinflip_error', {
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Check balance and deduct via ledger
      const debitResult = await walletService.debit(
        client.user.id,
        Number(betAmount),
        `coinflip_create_${client.user.id}_${Date.now()}`,
        { type: 'bet', description: 'Coinflip create game' }
      );
      if (!debitResult.success) {
        socket.emit('coinflip_error', {
          message: debitResult.error || 'Insufficient balance',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Generate server seeds for provably fair gaming (platform RNG)
      const serverSeed = rng.generateServerSeed();
      const serverSeedHash = rng.generateServerSeedHash(serverSeed);

      // Generate next game ID
      const gameId = await generateNextCoinflipGameId();

      // Create new game with all required fields
      const game = new CoinflipModel({
        gameId: gameId, // Use generated game ID
        creator: client.user.id,
        betAmount: Number(betAmount),
        coinSide: coinSide,
        status: 'waiting',
        serverSeed: serverSeed,
        serverSeedHash: serverSeedHash,
        creatorSeed: creatorSeed || '', // Store creator's seed if provided
        totalPot: 0, // Will be set when joiner joins
        platformFee: 0, // Will be calculated when joiner joins
        winnerPayout: 0, // Will be calculated when joiner joins
        createdAt: new Date()
      });

      await game.save();
      await game.populate('creator', '_id username displayName avatar level');

      console.log(`🎮 ${client.user.username} created coinflip game: ${game._id}`);

      // Emit private balance update to the user who created the game
      const newBalanceCreate = await walletService.getBalance(client.user.id);
      socket.emit('user_balance_update', {
        userId: user._id,
        newBalance: newBalanceCreate,
        change: -Number(betAmount),
        reason: 'coinflip_game_created',
        timestamp: new Date().toISOString()
      });

      // Emit to all clients
      socket.broadcast.emit('coinflip_game_created_success', {
        game: game.getPublicGameState(),
        timestamp: new Date().toISOString()
      });

      socket.emit('coinflip_game_created_success', {
        game: game.getPublicGameState(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error creating coinflip game:', error);
      socket.emit('coinflip_error', {
        message: 'Failed to create game',
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('coinflip_join_game', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('join games');
      return;
    }

    try {
      const { gameId } = data;

      if (!gameId) {
        socket.emit('coinflip_error', {
          message: 'Game ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Handle both numeric gameId and base64-encoded MongoDB ObjectId
      let game;
      if (typeof gameId === 'number' || /^\d+$/.test(gameId)) {
        // Numeric gameId - find by gameId field
        game = await CoinflipModel.findOne({ gameId: Number(gameId) })
          .populate('creator', '_id username displayName avatar level')
          .populate('joiner', '_id username displayName avatar level')
          .populate('winner', '_id username displayName avatar level');
      } else {
        // Base64-encoded MongoDB ObjectId - decode and find by _id
        const decodedId = Buffer.from(gameId, 'base64').toString();
        game = await CoinflipModel.findById(decodedId)
          .populate('creator', '_id username displayName avatar level')
          .populate('joiner', '_id username displayName avatar level')
          .populate('winner', '_id username displayName avatar level');
      }

      if (!game) {
        socket.emit('coinflip_error', {
          message: 'Game not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (game.status !== 'waiting') {
        socket.emit('coinflip_error', {
          message: 'Game is not available for joining',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (game.creator._id.toString() === client.user.id) {
        socket.emit('coinflip_error', {
          message: 'You cannot join your own game',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const user = await User.findById(client.user.id);

      if (!user || !user.seed) {
        socket.emit('coinflip_error', {
          message: 'You need a seed to join games. Please generate one in your profile.',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Check balance and deduct via ledger
      const debitResultJoin = await walletService.debit(
        client.user.id,
        game.betAmount,
        `coinflip_join_${game._id}_${client.user.id}`,
        { type: 'bet', description: 'Coinflip join game' }
      );
      if (!debitResultJoin.success) {
        socket.emit('coinflip_error', {
          message: debitResultJoin.error || 'Insufficient balance',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Join the game at engine level (pure logic)
      const userSeed = user.seed;
      const userSeedHash = require('crypto').createHash('sha256').update(userSeed).digest('hex');

      game.joiner = client.user.id as any;
      game.joinerSeed = userSeed;

      const engineOutcome = resolveCoinflipGame(
        {
          gameId: game.gameId,
          creatorId: game.creator._id.toString(),
          joinerId: client.user.id,
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
      await game.populate('creator', '_id username displayName avatar level');
      await game.populate('joiner', '_id username displayName avatar level');

      console.log(`🎮 ${client.user.username} joined coinflip game: ${game._id}`);

      // Emit private balance update to the joiner
      const newBalanceJoin = await walletService.getBalance(client.user.id);
      socket.emit('user_balance_update', {
        userId: user._id,
        newBalance: newBalanceJoin,
        change: -game.betAmount,
        reason: 'coinflip_game_joined',
        timestamp: new Date().toISOString()
      });

      // Complete the game immediately and send full result
      console.log(`🎮 Completing coinflip game immediately: ${game._id}`);

      // Populate winner and complete the game
      await game.populate('winner', '_id username displayName avatar level');

      // Distribute winnings to the winner via ledger
      const winnerId = (game.winner as any)._id?.toString?.() || game.winner?.toString?.();
      if (winnerId) {
        const creditResult = await walletService.credit(
          winnerId,
          game.winnerPayout,
          `coinflip_win_${game._id}_${winnerId}`,
          { type: 'payout', description: 'Coinflip winner payout' }
        );
        if (creditResult.success) {
          const winner = await User.findById(winnerId).select('username');
          if (winner) console.log(`💰 Winner ${winner.username} received ${game.winnerPayout} USDT`);
        }
      }

      // Send balance updates to both players
      const io = getIO();
      const creator = await User.findById(game.creator._id);
      const joiner = await User.findById(game.joiner._id);

      if (creator) {
        const creatorBalance = await walletService.getBalance(creator._id.toString());
        setTimeout(() => {
        io.to(creator._id.toString()).emit('user_balance_update', {
          userId: creator._id.toString(),
          newBalance: creatorBalance,
          change: game.winner._id.toString() === creator._id.toString() ?
            game.winnerPayout:
            0,
          reason: 'coinflip_game_completed',
          timestamp: new Date().toISOString()
        });
        }, 10000);
      }

      if (joiner) {
        const joinerBalance = await walletService.getBalance(joiner._id.toString());
        setTimeout(() => {
          io.to(joiner._id.toString()).emit('user_balance_update', {
            userId: joiner._id.toString(),
            newBalance: joinerBalance,
            change: game.winner._id.toString() === joiner._id.toString() ?
              game.winnerPayout:
              0,
            reason: 'coinflip_game_completed',
            timestamp: new Date().toISOString()
          });
        }, 10000);
        // 10 seconds delay to ensure the balance is updated
        // Countdown 5 + flipping animation 3 seconds = 8 seconds + extra 2
      }

      console.log(`💰 Sent balance updates to both players for game ${game.gameId}`);

      // Award XP to both players for participating in the coinflip
      const xpReward = XPService.calculateXPReward(game.betAmount, 'coinflip');

      // Award XP to both players
      const players = [game.creator._id.toString(), game.joiner._id.toString()];

      for (const playerId of players) {
        XPService.addXP(playerId, xpReward, game.betAmount).then((xpResult: any) => {
          io.emit('xp_update', {
            userId: playerId,
            newLevel: xpResult.newLevel,
            newXP: xpResult.newXP,
            totalXP: xpResult.totalXP,
            levelProgress: xpResult.levelProgress,
            nextLevelXP: xpResult.nextLevelXP,
            leveledUp: xpResult.leveledUp,
            levelsGained: xpResult.levelsGained,
            xpGained: xpReward.xpGained,
            reason: xpReward.reason
          });

          if (xpResult.leveledUp) {
            io.emit('level_up', {
              userId: playerId,
              newLevel: xpResult.newLevel,
              levelsGained: xpResult.levelsGained,
              totalXP: xpResult.totalXP
            });
          }
        }).catch((error: any) => {
          console.error(`Failed to award XP to player ${playerId}:`, error);
        });
      }

      // Emit full game result to both players
      console.log(`🏆 Sending complete coinflip result for game: ${game._id}`);
      io.emit('coinflip_game_update', {
        game: game.getCompletedGameState(),
        timestamp: new Date().toISOString()
      });

      // Emit game completion to all clients
      io.emit('coinflip_game_completed', {
        game: game.getCompletedGameState(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error joining coinflip game:', error);
      socket.emit('coinflip_error', {
        message: 'Failed to join game',
        timestamp: new Date().toISOString()
      });
    }
  });


  socket.on('coinflip_cancel_game', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('cancel games');
      return;
    }

    try {
      const { gameId } = data;

      if (!gameId) {
        socket.emit('coinflip_error', {
          message: 'Game ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Handle both numeric gameId and MongoDB ObjectId
      let game;
      if (typeof gameId === 'number' || /^\d+$/.test(gameId)) {
        // Numeric gameId - find by gameId field
        game = await CoinflipModel.findOne({ gameId: Number(gameId) })
          .populate('creator', '_id username avatar level');
      } else {
        // MongoDB ObjectId - find by _id
        game = await CoinflipModel.findById(gameId)
          .populate('creator', '_id username avatar level');
      }

      if (!game) {
        socket.emit('coinflip_error', {
          message: 'Game not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (game.creator._id.toString() !== client.user.id) {
        socket.emit('coinflip_error', {
          message: 'You can only cancel your own games',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (game.status !== 'waiting') {
        socket.emit('coinflip_error', {
          message: 'Game cannot be cancelled',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Cancel the game
      await game.cancelGame();

      // Refund the bet from house treasury
      try {
        const HouseService = require('../services/houseService').default;
        const refundResult = await HouseService.processPayout(
          game.betAmount,
          'coinflip',
          game._id.toString(),
          game.creator._id.toString(),
          `coinflip-cancel-refund-${game.gameId}`
        );

        if (!refundResult.success) {
          console.error(`❌ Failed to process refund for cancelled game ${game._id}:`, refundResult.error);
        }

        // Refund bet amount to creator
        await User.findByIdAndUpdate(game.creator._id, {
          $inc: {
            balance: game.betAmount,
            totalWagered: -game.betAmount,
            totalBets: -1
          }
        });

        console.log(`💰 Refunded ${game.betAmount} to ${client.user.username} for cancelled game`);
      } catch (refundError) {
        console.error('Error processing refund:', refundError);
      }

      console.log(`🎮 ${client.user.username} cancelled coinflip game: ${game._id}`);

      // Emit to all clients
      socket.broadcast.emit('coinflip_game_cancelled', {
        gameId: game._id,
        timestamp: new Date().toISOString()
      });

      socket.emit('coinflip_game_cancelled', {
        gameId: game._id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error cancelling coinflip game:', error);
      socket.emit('coinflip_error', {
        message: 'Failed to cancel game',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ==================== CHAT EVENTS ====================

  // Handle request for chat history
  socket.on('get_chat_history', async (data: any) => {
    try {
      // console.log(`📜 ${client.user.username} requested chat history`);

      const { limit = 50, room = 'default' } = data;

      const messages = await ChatModel.find({
        isDeleted: false,
        room: room
      })
        .populate('userId', 'username avatar level displayName')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();

      // Convert to frontend format
      const formattedMessages = messages.reverse().map((msg: any) => {
        // Handle both authenticated and anonymous messages
        if (msg.isAnonymous) {
          return {
            id: msg._id,
            user: {
              id: msg.anonymousId,
              username: msg.anonymousUsername,
              avatar: '/assets/images/avatar/default.png',
              level: 0,
              isAnonymous: true,
              displayName: msg.displayName
            },
            message: msg.message,
            timestamp: msg.createdAt,
            isHistory: true
          };
        } else {
          return {
            id: msg._id,
            user: {
              id: msg.userId?._id?.toString() || null,
              username: msg.userId?.username || 'Anonymous',
              avatar: msg.userId?.avatar || null,
              level: msg.userId?.level || 0,
              isAnonymous: false,
              displayName: msg.userId?.displayName || msg.userId?.username || 'Anonymous'
            },
            message: msg.message,
            timestamp: msg.createdAt,
            isHistory: true
          };
        }
      });

      socket.emit('chat_history', {
        messages: formattedMessages,
        timestamp: new Date().toISOString()
      });

      console.log(`📜 Sent ${formattedMessages.length} chat history messages to ${client.user.username}`);

    } catch (error) {
      console.error('Error getting chat history:', error);
      socket.emit('chat_error', {
        message: 'Failed to get chat history',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle 'chat' event from frontend - OPTIMIZED VERSION
  socket.on('chat', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('send chat messages');
      return;
    }

    try {
      const { message } = data;

      if (!message || message.trim().length === 0) {
        socket.emit('chat_error', {
          message: 'Message cannot be empty',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (message.length > 500) {
        socket.emit('chat_error', {
          message: 'Message too long (max 500 characters)',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Use optimized service for immediate response (79.9% faster!)
      const result = await OptimizedChatService.saveMessageImmediate(
        client.tokenValidation,
        message.trim(),
        'default'
      );

      if (result.type === 'chat') {
        const broadcastData = {
          id: (result.data as any)._id,
          user: (result.data as any).userId,
          message: (result.data as any).message,
          timestamp: (result.data as any).createdAt
        };

        console.log(`⚡ ${client.user.username} sent chat message (${result.responseTime}ms): ${message}`);

        // Broadcast to all connected clients immediately
        const io = getIO();
        io.emit('chat', broadcastData);

        // Send response time info to sender
        socket.emit('chat_response_time', {
          responseTime: result.responseTime,
          method: 'immediate'
        });
      } else {
        socket.emit('chat_error', result.data);
      }

    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('chat_error', {
        message: 'Failed to send message',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle 'chat_blocking' event - for comparison/testing
  socket.on('chat_blocking', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('send chat messages');
      return;
    }

    try {
      const { message } = data;

      if (!message || message.trim().length === 0) {
        socket.emit('chat_error', {
          message: 'Message cannot be empty',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (message.length > 500) {
        socket.emit('chat_error', {
          message: 'Message too long (max 500 characters)',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Use blocking service for comparison
      const result = await OptimizedChatService.saveMessageBlocking(
        client.tokenValidation,
        message.trim(),
        'default'
      );

      if (result.type === 'chat') {
        const broadcastData = {
          id: (result.data as any)._id,
          user: (result.data as any).userId,
          message: (result.data as any).message,
          timestamp: (result.data as any).createdAt
        };

        console.log(`🐌 ${client.user.username} sent chat message (${result.responseTime}ms): ${message}`);

        // Broadcast to all connected clients after database save
        const io = getIO();
        io.emit('chat', broadcastData);

        // Send response time info to sender
        socket.emit('chat_response_time', {
          responseTime: result.responseTime,
          method: 'blocking'
        });
      } else {
        socket.emit('chat_error', result.data);
      }

    } catch (error) {
      console.error('Error handling blocking chat message:', error);
      socket.emit('chat_error', {
        message: 'Failed to send message',
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('chat_message', async (data: any) => {
    console.log(`💬 Chat message received from ${client.user.username}:`, {
      isAnonymous: client.isAnonymous,
      isAuthenticated: client.isAuthenticated,
      userId: client.user.id,
      username: client.user.username
    });

    if (client.isAnonymous) {
      console.log(`❌ Rejecting chat message from anonymous user: ${client.user.username}`);
      rejectAnonymousAction('send chat messages');
      return;
    }

    try {
      const { message } = data;

      if (!message || message.trim().length === 0) {
        socket.emit('chat_error', {
          message: 'Message cannot be empty',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (message.length > 500) {
        socket.emit('chat_error', {
          message: 'Message too long (max 500 characters)',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Create chat message
      const chatMessage = new ChatModel({
        user: client.user.id,
        message: message.trim(),
        timestamp: new Date()
      });

      await chatMessage.save();
      await chatMessage.populate('user', 'username avatar level');

      console.log(`💬 ${client.user.username} sent chat message`);

      // Emit to all clients
      socket.broadcast.emit('chat_message', {
        message: chatMessage,
        timestamp: new Date().toISOString()
      });

      socket.emit('chat_message', {
        message: chatMessage,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error sending chat message:', error);
      socket.emit('chat_error', {
        message: 'Failed to send message',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ==================== CHAT PERFORMANCE EVENTS ====================

  // Get queue statistics for monitoring
  socket.on('get_queue_stats', () => {
    const stats = OptimizedChatService.getQueueStats();
    socket.emit('queue_stats', stats);
  });

  // ==================== SETTINGS EVENTS ====================

  // Get public server settings
  socket.on('get_server_settings', async () => {
    try {
      const settings = await gameSettingsService.getPublicSettings();
      socket.emit('server_settings', {
        success: true,
        data: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting server settings:', error);
      socket.emit('server_settings_error', {
        success: false,
        error: 'Failed to get server settings',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ==================== BALANCE EVENTS ====================

  // Handle balance update requests
  socket.on('request_balance_update', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('request balance updates');
      return;
    }

    try {
      const user = await User.findById(client.user.id);
      if (!user) {
        socket.emit('coinflip_error', {
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Send private balance update to the requesting user
      socket.emit('user_balance_update', {
        userId: user._id,
        newBalance: user.balance,
        change: 0, // No change, just current balance
        reason: 'balance_refresh',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error handling balance update request:', error);
      socket.emit('coinflip_error', {
        message: 'Failed to get balance update',
        timestamp: new Date().toISOString()
      });
    }
  });


  // ==================== OTHER GAME EVENTS ====================
  // Add crash, mine, and other game events here as needed

  console.log(`✅ Game event handlers setup complete for ${client.user.username}`);
}
