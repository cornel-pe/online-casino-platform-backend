/**
 * Mine Game Socket Event Handlers
 * 
 * This module contains all socket event handlers for the mine game.
 * It provides a structured way to handle mine-specific socket events.
 */

import { Socket } from 'socket.io';
import mongoose from 'mongoose';
import { ChatClient } from './types';
import { getIO } from './index';
import MineModel from '../models/Mine';
import User from '../models/User';
import House from '../models/House';
import TransactionService from '../services/transactionService';
import XPService from '../services/xpService';
import gameSettingsService from '../services/gameSettingsService';
import rng from '../platform/rng';
import { createSignatureHash } from '../utils/randomGenerator';
import { revealMineTile, cashOutMineGame } from '../engine/mineGameEngine';
import { generateNextMineGameId } from '../utils/gameIdGenerator';

/**
 * Setup mine game socket event handlers
 * @param socket - The socket instance
 * @param client - The authenticated client
 */
export function setupMineEventHandlers(socket: Socket, client: ChatClient) {
  console.log(`⛏️ Setting up mine event handlers for ${client.user.username}`);

  // Helper function to reject anonymous user actions
  const rejectAnonymousAction = (action: string) => {
    socket.emit('mine_error', {
      message: `Anonymous users cannot ${action}. Please log in to continue.`,
      timestamp: new Date().toISOString()
    });
  };

  // ==================== MINE GAME EVENTS ====================

  /**
   * Handle mine game start event
   */
  socket.on('mine_start_game', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('start mine games');
      return;
    }

    try {
      const { numMines, betAmount, clientSeed } = data;

      // Validate input
      if (!numMines || !betAmount) {
        socket.emit('mine_error', {
          message: 'Missing required fields: numMines and betAmount are required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (numMines < 1 || numMines > 24) {
        socket.emit('mine_error', {
          message: 'Number of mines must be between 1 and 24',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (betAmount <= 0) {
        socket.emit('mine_error', {
          message: 'Bet amount must be greater than 0',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (betAmount < 0.001) {
        socket.emit('mine_error', {
          message: 'Minimum bet amount is 0.001',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Generate server seed and use user's current client seed
      const serverSeed = rng.generateServerSeed();
      
      // Fetch user's current client seed from database
      const user = await User.findById(client.user.id);
      const userClientSeed = user?.seed || rng.generateClientSeed();
      const clientSeedHash = rng.generateClientSeedHash(userClientSeed);

      // Generate next game ID first
      const gameId = await generateNextMineGameId();

      // Generate mine positions using updated function with client seed and gameId
      const mineTiles = rng.generateMinePositions(serverSeed, userClientSeed, 5, Number(numMines), gameId.toString());
      const serverSeedHash = rng.generateServerSeedHash(serverSeed);
      const sigHash = createSignatureHash(5, Number(numMines), Number(betAmount), serverSeedHash, client.user.id);

      // Create new mine game
      const game = new MineModel({
        gameId: gameId,
        player: client.user.id,
        betAmount: Number(betAmount),
        numMines: Number(numMines),
        gridSize: 5, // 5x5 grid
        status: 'playing',
        currentMultiplier: 1.0,
        revealedTiles: [],
        mineTiles: mineTiles,
        serverSeed: serverSeed,
        clientSeed: userClientSeed,
        sigHash: sigHash,
        createdAt: new Date()
      });

      // SECURITY: Mark game as locked immediately to prevent manipulation
      game.isLocked = true;

      // FAST RESPONSE: Emit game started event immediately
      socket.emit('mine_game_started', {
        gameId: Buffer.from(game._id.toString()).toString('base64'),
        gameState: game.getPublicGameState(),
        clientSeedHash, // Include client seed hash for verification
        serverSeedHash, // Include server seed hash
        timestamp: new Date().toISOString()
      });

      // BACKGROUND: Save game and create transaction (non-blocking)
      Promise.all([
        game.save(),
        TransactionService.createGameTransaction({
          userId: new mongoose.Types.ObjectId(client.user.id),
          gameType: 'mine',
          gameId: game._id as mongoose.Types.ObjectId,
          betAmount: Number(betAmount),
          payoutAmount: 0, // No payout on game start
          description: `Mine game bet with ${numMines} mines`,
          metadata: {
            numMines: Number(numMines),
            gridSize: 5,
            gameId: game._id.toString()
          }
        })
      ]).then(async ([savedGame, gameTransaction]) => {
        console.log(`🎮 ${client.user.username} started mine game: ${savedGame._id}`);
        console.log(`💰 Game transaction created: ${gameTransaction.betTransaction._id}`);
        console.log(`🏠 House treasury balance updated`);

        const walletServiceStart = (await import('../services/walletService')).default;
        const newBalance = await walletServiceStart.getBalance(client.user.id);
        socket.emit('user_balance_update', {
          userId: client.user.id,
          newBalance,
          change: -Number(betAmount),
          reason: 'mine_game_started',
          timestamp: new Date().toISOString()
        });
      }).catch(error => {
        console.error('Error in background mine game save:', error);
        // Emit error to user
        socket.emit('mine_error', {
          message: 'Game creation failed',
          timestamp: new Date().toISOString()
        });
      });

    } catch (error) {
      console.error('Error starting mine game:', error);
      socket.emit('mine_error', {
        message: 'Failed to start game',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Handle mine cell reveal event
   */
  socket.on('mine_reveal_cell', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('play mine games');
      return;
    }

    try {
      const { gameId, cellId } = data;

      // Validate input
      if (!gameId || cellId === undefined || cellId === null) {
        socket.emit('mine_error', {
          message: 'Missing gameId or cellId',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      console.log(`🎯 Revealing cell for gameId: ${gameId} (decoded: ${decodedId})`);
      const game = await MineModel.findById(decodedId)
        .populate('player', 'username avatar');

      if (!game) {
        socket.emit('mine_error', {
          message: 'Game not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate game ownership
      if (game.player._id.toString() !== client.user.id) {
        socket.emit('mine_error', {
          message: 'Access denied',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate game status
      if (game.status !== 'playing') {
        socket.emit('mine_error', {
          message: 'Game is not active',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate tile index
      const totalTiles = game.gridSize * game.gridSize;
      if (cellId < 0 || cellId >= totalTiles) {
        socket.emit('mine_error', {
          message: 'Invalid tile index',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Check if tile is already revealed
      if (game.revealedTiles.includes(cellId)) {
        socket.emit('mine_error', {
          message: 'Tile already revealed',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // SECURITY: Check if game is locked (prevents manipulation)
      if (game.isLocked && game.status !== 'playing') {
        socket.emit('mine_error', {
          message: 'Game is no longer active',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // SECURITY: Lock game immediately to prevent multiple simultaneous reveals
      game.isLocked = true;

      // Engine: pure reveal logic
      const engineState = {
        gridSize: game.gridSize,
        numMines: game.numMines,
        betAmount: game.betAmount,
        revealedTiles: [...game.revealedTiles],
        mineTiles: [...game.mineTiles],
        currentMultiplier: game.currentMultiplier,
        status: game.status as 'playing' | 'win' | 'lose',
      };

      const settings = await gameSettingsService.getSettings();
      const maxMultiplier = settings.mine.maxMultiplier;

      const { nextState, result } = revealMineTile(engineState, cellId, { maxMultiplier });

      // Apply engine state back to model
      game.revealedTiles = nextState.revealedTiles;
      game.currentMultiplier = nextState.currentMultiplier;
      game.status = nextState.status;

      if (result.isMine) {
        game.completedAt = new Date();

        const gameState = game.getCompletedGameState();

        socket.emit('mine_hit', {
          success: false,
          gameId: game.gameId,
          cellId,
          isMine: true,
          gameState,
          timestamp: new Date().toISOString()
        });

        game.save().then(savedGame => {
          console.log(`💥 ${client.user.username} lost mine game: ${savedGame._id}`);

          // Award XP for the game
          const xpReward = XPService.calculateXPReward(savedGame.betAmount, 'mine');
          XPService.addXP(client.user.id, xpReward, savedGame.betAmount).then((xpResult: any) => {
            // Emit XP update to the user
            const io = getIO();
            io.to(client.socket.id).emit('xp_update', {
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

            // If user leveled up, emit level up notification
            if (xpResult.leveledUp) {
              io.to(client.socket.id).emit('level_up', {
                newLevel: xpResult.newLevel,
                levelsGained: xpResult.levelsGained,
                totalXP: xpResult.totalXP
              });
            }
          }).catch((error: any) => {
            console.error(`Failed to award XP to user ${client.user.id}:`, error);
          });

          // Broadcast game completion to all clients for history table update
          const io = getIO();
          io.emit('mine_game_completed', {
            gameId: savedGame.gameId,
            player: {
              id: savedGame.player._id,
              username: (savedGame.player as any)?.username || 'Unknown',
              avatar: (savedGame.player as any)?.avatar || null
            },
            wager: savedGame.betAmount,
            multiplier: savedGame.currentMultiplier,
            payout: 0,
            status: 'lose',
            time: savedGame.createdAt,
            completedAt: savedGame.completedAt,
            gridSize: savedGame.gridSize,
            numMines: savedGame.numMines,
            revealedTiles: savedGame.revealedTiles.length
          });
        }).catch(error => {
          console.error('Error saving mine game loss:', error);
        });
      } else {
        // FAST RESPONSE: Emit result immediately
        const gameState = game.getPublicGameState();

        socket.emit('mine_gem_found', {
          success: true,
          gameId: game.gameId,
          cellId,
          isMine: false,
          multiplier: game.currentMultiplier,
          revealedTiles: game.revealedTiles,
          gameState,
          timestamp: new Date().toISOString()
        });

        // BACKGROUND: Save game state (non-blocking)
        game.save().catch(error => {
          console.error('Error saving mine game progress:', error);
        });
      }

    } catch (error) {
      console.error('Error handling cell reveal:', error);
      socket.emit('mine_error', {
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Handle mine game cash out event
   */
  socket.on('mine_cash_out', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('cash out mine games');
      return;
    }

    try {
      const { gameId } = data;

      // Validate input
      if (!gameId) {
        socket.emit('mine_error', {
          message: 'Missing gameId',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      console.log(`💰 Cashing out gameId: ${gameId} (decoded: ${decodedId})`);
      const game = await MineModel.findById(decodedId)
        .populate('player', 'username avatar');

      if (!game) {
        socket.emit('mine_error', {
          message: 'Game not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate game ownership
      if (game.player._id.toString() !== client.user.id) {
        socket.emit('mine_error', {
          message: 'Access denied',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate game status
      if (game.status !== 'playing') {
        socket.emit('mine_error', {
          message: 'Game is not active',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Check if any tiles have been revealed
      if (game.revealedTiles.length === 0) {
        socket.emit('mine_error', {
          message: 'No tiles revealed yet',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // SECURITY: Check if game is locked (prevents manipulation)
      if (game.isLocked && game.status !== 'playing') {
        socket.emit('mine_error', {
          message: 'Game is no longer active',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // SECURITY: Lock game immediately to prevent multiple cashouts
      game.isLocked = true;

      const engineState = {
        gridSize: game.gridSize,
        numMines: game.numMines,
        betAmount: game.betAmount,
        revealedTiles: [...game.revealedTiles],
        mineTiles: [...game.mineTiles],
        currentMultiplier: game.currentMultiplier,
        status: game.status as 'playing' | 'win' | 'lose',
      };

      const { nextState, payout } = cashOutMineGame(engineState);

      game.status = nextState.status;
      game.completedAt = new Date();
      game.payout = payout;

      // FAST RESPONSE: Emit result immediately
      const gameState = game.getCompletedGameState();

      socket.emit('mine_cashed_out', {
        success: true,
        gameId: game.gameId,
        payout,
        multiplier: game.currentMultiplier,
        gameState,
        timestamp: new Date().toISOString()
      });

      // BACKGROUND: Save game and create payout transaction (non-blocking)
      // Note: Bet was already deducted at game start, so we only create payout transaction
      Promise.all([
        game.save(),
        TransactionService.createTransaction({
          amount: payout,
          from: new mongoose.Types.ObjectId('000000000000000000000000'), // HOUSE_ID
          to: new mongoose.Types.ObjectId(client.user.id),
          type: 'payout',
          description: `Mine game cashout with ${game.currentMultiplier}x multiplier`,
          ref: game._id.toString(),
          gameType: 'mine',
          gameId: game._id as mongoose.Types.ObjectId,
          metadata: {
            betAmount: game.betAmount,
            multiplier: game.currentMultiplier,
            payout: payout,
            revealedTiles: game.revealedTiles.length,
            numMines: game.numMines,
            gameId: game._id.toString()
          }
        }).then(async (payoutTx) => {
          const walletService = (await import('../services/walletService')).default;
          await walletService.credit(
            client.user.id,
            payout,
            `mine_payout_${game._id}_${client.user.id}`,
            { type: 'payout', description: 'Mine game payout' }
          );
          // Update house balance
          await House.findOneAndUpdate(
            {},
            { $inc: { treasuryBalance: -payout } },
            { upsert: true }
          );
          return payoutTx;
        })
      ]).then(async ([savedGame, payoutTransaction]) => {
        console.log(`💰 Winner ${client.user.username} received ${payout} USDT`);
        console.log(`💰 Payout transaction created: ${payoutTransaction._id}`);
        console.log(`🏠 House treasury balance updated`);

        const walletServiceEmit = (await import('../services/walletService')).default;
        const newBalance = await walletServiceEmit.getBalance(client.user.id);
        socket.emit('user_balance_update', {
          userId: client.user.id,
          newBalance,
          change: payout,
          reason: 'mine_game_cashed_out',
          timestamp: new Date().toISOString()
        });

        // Award XP for the game
        const xpReward = XPService.calculateXPReward(savedGame.betAmount, 'mine');
        XPService.addXP(client.user.id, xpReward, savedGame.betAmount).then((xpResult: any) => {
          // Emit XP update to the user
          const io = getIO();
          io.to(client.socket.id).emit('xp_update', {
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

          // If user leveled up, emit level up notification
          if (xpResult.leveledUp) {
            io.to(client.socket.id).emit('level_up', {
              newLevel: xpResult.newLevel,
              levelsGained: xpResult.levelsGained,
              totalXP: xpResult.totalXP
            });
          }
        }).catch((error: any) => {
          console.error(`Failed to award XP to user ${client.user.id}:`, error);
        });

        // Broadcast game completion to all clients for history table update
        const io = getIO();
        io.emit('mine_game_completed', {
          gameId: savedGame.gameId,
          player: {
            id: savedGame.player._id,
            username: (savedGame.player as any)?.username || 'Unknown',
            avatar: (savedGame.player as any)?.avatar || null
          },
          wager: savedGame.betAmount,
          multiplier: savedGame.currentMultiplier,
          payout: payout,
          status: 'win',
          time: savedGame.createdAt,
          completedAt: savedGame.completedAt,
          gridSize: savedGame.gridSize,
          numMines: savedGame.numMines,
          revealedTiles: savedGame.revealedTiles.length
        });
      }).catch(error => {
        console.error('Error in background mine cashout save:', error);
        // Emit error to user
        socket.emit('mine_error', {
          message: 'Cashout failed',
          timestamp: new Date().toISOString()
        });
      });

    } catch (error) {
      console.error('Error handling cash out:', error);
      socket.emit('mine_error', {
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Handle mine game resume event
   */
  socket.on('mine_resume_game', async (data: any) => {
    if (client.isAnonymous) {
      rejectAnonymousAction('resume mine games');
      return;
    }

    try {
      const { gameId } = data;

      // Validate input
      if (!gameId) {
        socket.emit('mine_error', {
          message: 'Missing gameId',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Decode game ID
      const decodedId = Buffer.from(gameId, 'base64').toString();
      const game = await MineModel.findById(decodedId)
        .populate('player', 'username avatar');

      if (!game) {
        socket.emit('mine_error', {
          message: 'Game not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate game ownership
      if (game.player._id.toString() !== client.user.id) {
        socket.emit('mine_error', {
          message: 'Access denied',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Validate game status
      if (game.status !== 'playing') {
        socket.emit('mine_error', {
          message: 'Game is not active or already completed',
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`🎮 ${client.user.username} resumed mine game: ${game._id}`);

      // Emit game resumed event with current state
      socket.emit('mine_game_resumed', {
        gameId: Buffer.from(game._id.toString()).toString('base64'),
        gameState: game.getPublicGameState(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error resuming mine game:', error);
      socket.emit('mine_error', {
        message: 'Failed to resume game',
        timestamp: new Date().toISOString()
      });
    }
  });
}
