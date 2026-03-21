import { Socket } from 'socket.io';
import { ChatClient } from './types';
import { rouletteGameEngine } from '../engine/rouletteGameEngine';
import User from '../models/User';

export function setupRouletteEventHandlers(socket: Socket, client: ChatClient) {
  console.log(`🎰 Setting up roulette event handlers for ${client.user.username}`);

  // Get current roulette game
  socket.on('roulette_get_current_game', async () => {
    try {
      console.log(`🎰 ${client.user.username} requested current roulette game`);

      const currentGame = rouletteGameEngine.getCurrentGame();
      const status = rouletteGameEngine.getStatus();

      if (!currentGame || currentGame.status === 'completed') {
        socket.emit('roulette_no_active_game', {
          status: status,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Calculate time remaining
      const now = Date.now();
      let timeRemaining = 0;
      
      if (currentGame.bettingStartTime) {
        const bettingEndTime = currentGame.bettingStartTime.getTime() + currentGame.bettingDurationMs;
        timeRemaining = Math.max(0, bettingEndTime - now);
      }

      socket.emit('roulette_current_game', {
        gameId: currentGame.gameId,
        status: currentGame.status,
        totalBetAmount: currentGame.totalBetAmount,
        playerCount: currentGame.playerCount,
        timeRemaining: timeRemaining,
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
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting current roulette game:', error);
      socket.emit('roulette_error', {
        message: 'Failed to get current roulette game',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Place bet in roulette
  socket.on('roulette_place_bet', async (data: any) => {
    try {
      console.log(`🎰 ${client.user.username} placing roulette bet:`, data);

      const { betAmount, betType } = data;

      if (!betAmount || typeof betAmount !== 'number' || betAmount <= 0) {
        socket.emit('roulette_error', {
          message: 'Valid bet amount is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!betType || !['heads', 'tails', 'crown'].includes(betType)) {
        socket.emit('roulette_error', {
          message: 'Valid bet type (heads, tails, crown) is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const result = await rouletteGameEngine.placeBet(client.user.id, betAmount, betType);

      if (result.success) {
        // Update user balance
        const updatedUser = await User.findById(client.user.id);
        socket.emit('user_balance_update', {
          userId: client.user.id,
          newBalance: updatedUser?.balance || 0,
          change: -betAmount,
          reason: 'roulette_bet_placed',
          timestamp: new Date().toISOString()
        });

        socket.emit('roulette_bet_placed', {
          success: true,
          message: result.message,
          data: result.data,
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('roulette_error', {
          message: result.message,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error placing roulette bet:', error);
      socket.emit('roulette_error', {
        message: 'Failed to place bet',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get roulette history
  socket.on('roulette_get_history', async (data: any) => {
    try {
      console.log(`🎰 ${client.user.username} requested roulette history`);

      const { limit = 10 } = data;

      const history = await rouletteGameEngine.getGameHistory(limit);

      socket.emit('roulette_history', {
        games: history.map((game: any) => ({
          id: game._id,
          gameId: game.gameId,
          totalBetAmount: game.totalBetAmount,
          playerCount: game.playerCount,
          winningSlot: game.winningSlot,
          winningType: game.winningType,
          winners: game.winners,
          completedAt: game.completedAt,
          serverSeed: game.serverSeed,
          serverSeedHash: game.serverSeedHash,
          publicSeed: game.publicSeed,
        })),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting roulette history:', error);
      socket.emit('roulette_error', {
        message: 'Failed to get roulette history',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Verify roulette result (provably fair verification)
  socket.on('roulette_verify_result', async (data: any) => {
    try {
      console.log(`🔍 ${client.user.username} verifying roulette result:`, data);

      const { gameId } = data;

      const game = await rouletteGameEngine.getGameHistory(1);
      const targetGame = game.find((g: any) => g.gameId === gameId);

      if (!targetGame) {
        socket.emit('roulette_error', {
          message: 'Game not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Recreate the winning slot calculation
      const crypto = require('crypto');
      const combinedSeed = targetGame.serverSeed + targetGame.publicSeed;
      const hash = crypto.createHash('sha256').update(combinedSeed).digest('hex');
      const randomValue = parseInt(hash.substring(0, 8), 16);
      const calculatedWinningSlot = randomValue % 37;

      const isValid = calculatedWinningSlot === targetGame.winningSlot;

      socket.emit('roulette_verification_result', {
        gameId: targetGame.gameId,
        isValid: isValid,
        providedWinningSlot: targetGame.winningSlot,
        calculatedWinningSlot: calculatedWinningSlot,
        winningType: targetGame.winningType,
        serverSeed: targetGame.serverSeed,
        publicSeed: targetGame.publicSeed,
        hash: hash,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error verifying roulette result:', error);
      socket.emit('roulette_error', {
        message: 'Failed to verify result',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle game reset request from frontend
  socket.on('roulette_reset_game', async () => {
    try {
      console.log('🔄 Frontend requested game reset');
      await rouletteGameEngine.resetGameToWaiting();
    } catch (error) {
      console.error('Error resetting roulette game:', error);
      socket.emit('roulette_error', {
        message: 'Failed to reset game',
        timestamp: new Date().toISOString()
      });
    }
  });
}
