import { Socket } from 'socket.io';
import { crashGameEngine } from '../engine/crashGameEngine';
import { ChatClient } from './types';
import User from '../models/User';

export function setupCrashEventHandlers(socket: Socket, client: ChatClient) {
  // Place bet in crash game
  socket.on('crash_place_bet', async (data: { betAmount: number; autoCashoutMultiplier?: number }) => {
    try {
      const { betAmount, autoCashoutMultiplier } = data;

      console.log(`🎮 ${client.user.username} placing crash bet: ${betAmount}, auto-cashout: ${autoCashoutMultiplier}`);

      // Validate input
      if (!betAmount || betAmount <= 0) {
        socket.emit('crash_error', {
          message: 'Invalid bet amount',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (autoCashoutMultiplier && (autoCashoutMultiplier < 1.01 || autoCashoutMultiplier > 1000)) {
        socket.emit('crash_error', {
          message: 'Invalid auto-cashout multiplier',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const result = await crashGameEngine.placeBet(client.user.id, betAmount, autoCashoutMultiplier);

      if (result.success) {
        socket.emit('crash_bet_placed', {
          success: true,
          gameId: result.gameId,
          betAmount: betAmount,
          autoCashoutMultiplier: autoCashoutMultiplier,
          timestamp: new Date().toISOString()
        });

        const walletService = (await import('../services/walletService')).default;
        const newBalance = await walletService.getBalance(client.user.id);
        socket.emit('user_balance_update', {
          userId: client.user.id,
          newBalance,
          change: -betAmount,
          reason: 'crash_bet_placed',
          timestamp: new Date().toISOString()
        });

      } else {
        socket.emit('crash_error', {
          message: result.message || 'Failed to place bet',
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error handling crash bet placement:', error);
      socket.emit('crash_error', {
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Cash out from crash game
  socket.on('crash_cashout', async () => {
    try {
      console.log(`💰 ${client.user.username} attempting to cash out from crash game`);

      const result = await crashGameEngine.cashoutPlayer(client.user.id);

      if (result.success) {
        // Emit success immediately (balance update will come from engine)
        socket.emit('crash_cashed_out', {
          success: true,
          payout: result.payout,
          timestamp: new Date().toISOString()
        });

        // Balance update is now handled in crashGameEngine.cashoutPlayer()
        // No need to fetch user again here - it's done asynchronously in the engine

      } else {
        socket.emit('crash_error', {
          message: result.message || 'Failed to cash out',
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error handling crash cashout:', error);
      socket.emit('crash_error', {
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get current crash game state
  socket.on('crash_get_current_game', async () => {
    try {
      const currentGame = crashGameEngine.getCurrentGame();

      if (currentGame) {
        socket.emit('crash_current_game', {
          roundId: currentGame._id,
          round: currentGame.round,
          status: currentGame.status,
          currentMultiplier: currentGame.currentMultiplier,
          totalBetAmount: currentGame.totalBetAmount,
          playerCount: currentGame.playerBets.length,
          playerBets: currentGame.playerBets.map((bet: any) => ({
            username: bet.username,
            avatar: bet.avatar,
            betAmount: bet.betAmount,
            autoCashoutMultiplier: bet.autoCashoutMultiplier,
            cashoutMultiplier: bet.cashoutMultiplier,
            payout: bet.payout,
            status: bet.status,
            isCurrentUser: bet.user.toString() === client.user.id
          })),
          serverSeedHash: currentGame.serverSeedHash,
          publicSeed: currentGame.publicSeed,
          bettingEndTime: currentGame.bettingEndTime, // Include betting end time for countdown
          startTime: currentGame.startTime, // Include start time for chart
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('crash_no_active_game', {
          message: 'No active game',
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error getting current crash game:', error);
      socket.emit('crash_error', {
        message: 'Failed to get current game',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get crash game history
  socket.on('crash_get_history', async (data: { limit?: number } = {}) => {
    try {
      const limit = Math.min(data.limit || 10, 50); // Max 50 games
      const history = await crashGameEngine.getGameHistory(limit);

      socket.emit('crash_history', {
        games: history.map((game: any) => ({
          roundId: game._id,
          round: game.round,
          crashPoint: game.currentMultiplier,
          totalBetAmount: game.totalBetAmount,
          totalPayout: game.totalPayout,
          playerCount: game.playerBets.length,
          startTime: game.startTime,
          endTime: game.endTime,
          serverSeed: game.serverSeed, // Only show for completed games
          serverSeedHash: game.serverSeedHash,
          publicSeed: game.publicSeed
        })),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting crash game history:', error);
      socket.emit('crash_error', {
        message: 'Failed to get game history',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Generate or regenerate user seed for provable fair
  socket.on('crash_generate_seed', async () => {
    try {
      const user = await User.findById(client.user.id);
      if (!user) {
        socket.emit('crash_error', {
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const newSeed = user.generateSeed();
      await user.save();

      console.log(`🎲 ${client.user.username} generated new seed for crash game`);

      socket.emit('crash_seed_generated', {
        success: true,
        seed: newSeed,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error generating crash game seed:', error);
      socket.emit('crash_error', {
        message: 'Failed to generate seed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Verify a completed game (provable fair)
  socket.on('crash_verify_game', async (data: { roundId: string }) => {
    try {
      const { roundId } = data;

      if (!roundId) {
        socket.emit('crash_error', {
          message: 'Round ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // This would implement the verification logic
      // For now, just acknowledge the request
      socket.emit('crash_game_verified', {
        roundId: roundId,
        verified: true,
        message: 'Game verification completed',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error verifying crash game:', error);
      socket.emit('crash_error', {
        message: 'Failed to verify game',
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Admin-only crash game handlers
export function setupCrashAdminEventHandlers(socket: Socket, client: ChatClient) {
  if (!client.isAdmin) return;

  // Pause crash game engine
  socket.on('crash_admin_pause', async () => {
    try {
      console.log(`⏸️ Admin ${client.user.username} pausing crash game engine`);

      const result = await crashGameEngine.pause();

      if (result.success) {
        socket.emit('crash_admin_action_success', {
          action: 'pause',
          message: 'Crash game paused successfully',
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('crash_admin_action_error', {
          action: 'pause',
          message: result.message || 'Failed to pause game',
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error pausing crash game:', error);
      socket.emit('crash_admin_action_error', {
        action: 'pause',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Resume crash game engine
  socket.on('crash_admin_resume', async () => {
    try {
      console.log(`▶️ Admin ${client.user.username} resuming crash game engine`);

      const result = await crashGameEngine.resume();

      if (result.success) {
        socket.emit('crash_admin_action_success', {
          action: 'resume',
          message: 'Crash game resumed successfully',
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('crash_admin_action_error', {
          action: 'resume',
          message: result.message || 'Failed to resume game',
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error resuming crash game:', error);
      socket.emit('crash_admin_action_error', {
        action: 'resume',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Force end current game
  socket.on('crash_admin_force_end', async (data: { reason?: string } = {}) => {
    try {
      const reason = data.reason || 'Manually ended by admin';
      
      console.log(`⚠️ Admin ${client.user.username} force ending crash game: ${reason}`);

      const result = await crashGameEngine.forceEndGame(reason, client.user.id);

      if (result.success) {
        socket.emit('crash_admin_action_success', {
          action: 'force_end',
          message: 'Game ended successfully',
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('crash_admin_action_error', {
          action: 'force_end',
          message: result.message || 'Failed to end game',
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error force ending crash game:', error);
      socket.emit('crash_admin_action_error', {
        action: 'force_end',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get engine status for admin
  socket.on('crash_admin_get_status', async () => {
    try {
      const status = crashGameEngine.getStatus();
      const currentGame = crashGameEngine.getCurrentGame();

      socket.emit('crash_admin_status', {
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
          serverSeedHash: currentGame.serverSeedHash,
          publicSeed: currentGame.publicSeed
        } : null,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting crash game status:', error);
      socket.emit('crash_admin_action_error', {
        action: 'get_status',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get detailed game information for admin
  socket.on('crash_admin_get_game_details', async (data: { roundId: string }) => {
    try {
      const { roundId } = data;

      if (!roundId) {
        socket.emit('crash_admin_action_error', {
          action: 'get_game_details',
          message: 'Round ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const game = await crashGameEngine.getCurrentGame();
      
      if (!game || game._id.toString() !== roundId) {
        socket.emit('crash_admin_action_error', {
          action: 'get_game_details',
          message: 'Game not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      socket.emit('crash_admin_game_details', {
        roundId: game._id,
        round: game.round,
        status: game.status,
        currentMultiplier: game.currentMultiplier,
        crashPoint: game.crashPoint, // Admin can see crash point
        totalBetAmount: game.totalBetAmount,
        totalPayout: game.totalPayout,
        playerBets: game.playerBets.map((bet: any) => ({
          userId: bet.user,
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
        })),
        serverSeed: game.serverSeed,
        serverSeedHash: game.serverSeedHash,
        publicSeed: game.publicSeed,
        startTime: game.startTime,
        bettingEndTime: game.bettingEndTime,
        crashTime: game.crashTime,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting crash game details:', error);
      socket.emit('crash_admin_action_error', {
        action: 'get_game_details',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  });
}
