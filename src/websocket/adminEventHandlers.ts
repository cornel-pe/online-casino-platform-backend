import { Socket } from 'socket.io';
import { ChatClient } from './types';
import { getUserFromPlatformToken } from './authService';
import { isAdminById } from '../utils/adminUtils';
import User from '../models/User';
import House from '../models/House';
import Transaction from '../models/Transaction';
import Mine from '../models/Mine';
import Coinflip from '../models/Coinflip';
import { CrashGame } from '../models/Crash';
import gameSettingsService from '../services/gameSettingsService';
import { getIO } from './index';
import { getChartStats, getLiveStats } from '../controllers/chartController';

// Admin WebSocket event handlers
export function setupAdminEventHandlers(socket: Socket, client: ChatClient) {
  console.log(`🔧 Setting up admin event handlers for ${client.user.username}`);

  // Admin authentication (platform JWT only)
  socket.on('admin_authenticate', async (data: { token: string }) => {
    try {
      const { token } = data;

      const { user, error } = await getUserFromPlatformToken(token);
      if (!user) {
        socket.emit('admin_auth_error', { message: error || 'Invalid token' });
        return;
      }

      const isAdmin = await isAdminById(user._id.toString());
      if (!isAdmin) {
        socket.emit('admin_auth_error', { message: 'Access denied. Admin privileges required.' });
        return;
      }

      client.isAdmin = true;
      client.user = {
        id: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        level: user.level,
        role: (user as any).role
      };

      socket.emit('admin_auth_success', {
        message: 'Admin authenticated successfully',
        user: {
          id: user._id,
          username: user.username,
          avatar: user.avatar
        }
      });

      console.log(`✅ Admin authenticated: ${user.username}`);
    } catch (error) {
      console.error('Admin authentication error:', error);
      socket.emit('admin_auth_error', { message: 'Authentication failed' });
    }
  });

  // Dashboard stats request
  socket.on('admin_dashboard_stats_request', async () => {
    try {
      if (!client.isAdmin) {
        socket.emit('admin_auth_error', { message: 'Admin privileges required' });
        return;
      }

      console.log(`📊 Admin ${client.user.username} requested dashboard stats`);

      // Get dashboard statistics
      const [
        totalUsers,
        onlineUsers,
        house,
        totalTransactions
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }), // Active in last 5 minutes
        House.findOne(),
        Transaction.countDocuments()
      ]);

      // Calculate total bets and payouts from all game models
      const [mineStats, coinflipStats, crashStats] = await Promise.all([
        Mine.aggregate([
          { $group: { _id: null, totalBets: { $sum: '$betAmount' }, totalPayouts: { $sum: '$payout' } } }
        ]),
        Coinflip.aggregate([
          { $group: { _id: null, totalBets: { $sum: { $multiply: ['$betAmount', 2] } }, totalPayouts: { $sum: '$winnerPayout' } } }
        ]),
        CrashGame.aggregate([
          { 
            $group: { 
              _id: null, 
              totalBets: { $sum: { $multiply: ['$betAmount', { $size: '$players' }] } },
              totalPayouts: { 
                $sum: { 
                  $reduce: {
                    input: '$players',
                    initialValue: 0,
                    in: {
                      $add: [
                        '$$value',
                        {
                          $cond: [
                            { $eq: ['$$this.status', 'WIN'] },
                            { $multiply: ['$betAmount', { $ifNull: ['$$this.payout', 0] }] },
                            0
                          ]
                        }
                      ]
                    }
                  }
                }
              }
            } 
          }
        ])
      ]);

      const totalBets = (mineStats[0]?.totalBets || 0) + (coinflipStats[0]?.totalBets || 0) + (crashStats[0]?.totalBets || 0);
      const totalPayouts = (mineStats[0]?.totalPayouts || 0) + (coinflipStats[0]?.totalPayouts || 0) + (crashStats[0]?.totalPayouts || 0);

      const stats = {
        totalUsers,
        onlineUsers,
        totalBets,
        totalPayouts,
        houseBalance: house?.treasuryBalance || 0,
        totalGames: totalBets, // Using total bets as proxy for total games
        totalTransactions,
        lastUpdated: new Date().toISOString()
      };

      socket.emit('admin_dashboard_stats_update', stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      socket.emit('admin_error', { message: 'Failed to fetch dashboard stats' });
    }
  });

  // User update events
  socket.on('admin_user_update_request', async (data: { userId: string }) => {
    try {
      if (!client.isAdmin) {
        socket.emit('admin_auth_error', { message: 'Admin privileges required' });
        return;
      }

      const { userId } = data;
      const user = await User.findById(userId).select('username avatar balance lastActive isBanned isFrozen');
      
      if (user) {
        socket.emit('admin_user_update', {
          userId: user._id.toString(),
          username: user.username,
          avatar: user.avatar,
          balance: user.balance,
          isOnline: user.lastActive && (Date.now() - user.lastActive.getTime()) < 5 * 60 * 1000,
          lastActive: user.lastActive?.toISOString(),
          isBanned: user.isBanned,
          isFrozen: user.isFrozen
        });
      }
    } catch (error) {
      console.error('Error fetching user update:', error);
      socket.emit('admin_error', { message: 'Failed to fetch user update' });
    }
  });

  // Transaction update events
  socket.on('admin_transaction_update_request', async (data: { transactionId: string }) => {
    try {
      if (!client.isAdmin) {
        socket.emit('admin_auth_error', { message: 'Admin privileges required' });
        return;
      }

      const { transactionId } = data;
      const transaction = await Transaction.findById(transactionId)
        .populate('from', 'username balance')
        .populate('to', 'username balance')
        .lean();

      if (transaction && transaction.from) {
        socket.emit('admin_transaction_update', {
          transactionId: transaction._id.toString(),
          userId: transaction.from._id.toString(),
          username: (transaction.from as any).username,
          type: transaction.type,
          amount: transaction.amount,
          balance: (transaction.from as any).balance || 0,
          description: transaction.description,
          timestamp: transaction.createdAt.toISOString(),
          gameId: transaction.gameId
        });
      }
    } catch (error) {
      console.error('Error fetching transaction update:', error);
      socket.emit('admin_error', { message: 'Failed to fetch transaction update' });
    }
  });

  // House balance update
  socket.on('admin_house_balance_request', async () => {
    try {
      if (!client.isAdmin) {
        socket.emit('admin_auth_error', { message: 'Admin privileges required' });
        return;
      }

      const house = await House.findOne();
      if (house) {
        socket.emit('admin_house_balance_update', house.treasuryBalance);
      }
    } catch (error) {
      console.error('Error fetching house balance:', error);
      socket.emit('admin_error', { message: 'Failed to fetch house balance' });
    }
  });

  // System status update
  socket.on('admin_system_status_request', async () => {
    try {
      if (!client.isAdmin) {
        socket.emit('admin_auth_error', { message: 'Admin privileges required' });
        return;
      }

      const [
        totalUsers,
        onlineUsers,
        house
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
        House.findOne()
      ]);

      // Count active games from all game models
      const [activeMineGames, activeCoinflipGames, activeCrashGames] = await Promise.all([
        Mine.countDocuments({ status: 'playing' }),
        Coinflip.countDocuments({ status: { $in: ['waiting', 'active'] } }),
        CrashGame.countDocuments({ status: { $in: ['PENDING', 'STARTED', 'LAUNCHED'] } })
      ]);

      const activeGames = activeMineGames + activeCoinflipGames + activeCrashGames;

      const systemStatus = {
        totalUsers,
        onlineUsers,
        houseBalance: house?.treasuryBalance || 0,
        activeGames,
        serverStatus: 'online',
        lastUpdated: new Date().toISOString()
      };

      socket.emit('admin_system_status_update', systemStatus);
    } catch (error) {
      console.error('Error fetching system status:', error);
      socket.emit('admin_error', { message: 'Failed to fetch system status' });
    }
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log(`🔧 Admin event handlers cleaned up for ${client.user.username}`);
  });

  // ==================== SETTINGS MANAGEMENT ====================

  // Get full settings (admin only)
  socket.on('admin_get_settings', async () => {
    try {
      const settings = await gameSettingsService.getSettings();
      console.log('settings', settings)
      socket.emit('admin_settings', {
        success: true,
        data: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting admin settings:', error);
      socket.emit('admin_settings_error', {
        success: false,
        error: 'Failed to get settings',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update game status (admin only)
  socket.on('admin_update_game_status', async (data: any) => {
    try {
      const { gameName, enabled, maintenanceMessage } = data;
      
      if (!gameName || typeof enabled !== 'boolean') {
        socket.emit('admin_settings_error', {
          success: false,
          error: 'Invalid request data',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!['mine', 'crash', 'coinflip', 'roulette'].includes(gameName)) {
        socket.emit('admin_settings_error', {
          success: false,
          error: 'Invalid game name',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const settings = await gameSettingsService.updateGameStatus(
        gameName,
        enabled,
        maintenanceMessage,
        client.user.id
      );

      // Broadcast settings update to all clients
      const publicSettings = await gameSettingsService.getPublicSettings();
      const io = getIO();
      io.emit('server_settings_updated', {
        success: true,
        data: publicSettings,
        timestamp: new Date().toISOString()
      });

      socket.emit('admin_settings_updated', {
        success: true,
        data: settings,
        message: `${gameName} game ${enabled ? 'enabled' : 'disabled'} successfully`,
        timestamp: new Date().toISOString()
      });

      console.log(`🔧 Admin ${client.user.username} updated ${gameName} game status: ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error updating game status:', error);
      socket.emit('admin_settings_error', {
        success: false,
        error: 'Failed to update game status',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update global settings (admin only)
  socket.on('admin_update_global_settings', async (data: any) => {
    try {
      const updates = data;
      const settings = await gameSettingsService.updateGlobalSettings(updates, client.user.id);

      // Broadcast settings update to all clients
      const publicSettings = await gameSettingsService.getPublicSettings();
      const io = getIO();
      io.emit('server_settings_updated', {
        success: true,
        data: publicSettings,
        timestamp: new Date().toISOString()
      });

      socket.emit('admin_settings_updated', {
        success: true,
        data: settings,
        message: 'Global settings updated successfully',
        timestamp: new Date().toISOString()
      });

      console.log(`🔧 Admin ${client.user.username} updated global settings`);
    } catch (error) {
      console.error('Error updating global settings:', error);
      socket.emit('admin_settings_error', {
        success: false,
        error: 'Failed to update global settings',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update full settings (admin only)
  socket.on('admin_update_settings', async (data: any) => {
    try {
      const updates = data;
      const settings = await gameSettingsService.updateSettings(updates, client.user.id);

      // Broadcast settings update to all clients
      const publicSettings = await gameSettingsService.getPublicSettings();
      const io = getIO();
      io.emit('server_settings_updated', {
        success: true,
        data: publicSettings,
        timestamp: new Date().toISOString()
      });

      socket.emit('admin_settings_updated', {
        success: true,
        data: settings,
        message: 'Settings updated successfully',
        timestamp: new Date().toISOString()
      });

      console.log(`🔧 Admin ${client.user.username} updated settings`);
    } catch (error) {
      console.error('Error updating settings:', error);
      socket.emit('admin_settings_error', {
        success: false,
        error: 'Failed to update settings',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Initialize settings (admin only)
  socket.on('admin_initialize_settings', async () => {
    try {
      const settings = await gameSettingsService.initializeSettings();

      // Broadcast settings update to all clients
      const publicSettings = await gameSettingsService.getPublicSettings();
      const io = getIO();
      io.emit('server_settings_updated', {
        success: true,
        data: publicSettings,
        timestamp: new Date().toISOString()
      });

      socket.emit('admin_settings_updated', {
        success: true,
        data: settings,
        message: 'Settings initialized successfully',
        timestamp: new Date().toISOString()
      });

      console.log(`🔧 Admin ${client.user.username} initialized settings`);
    } catch (error) {
      console.error('Error initializing settings:', error);
      socket.emit('admin_settings_error', {
        success: false,
        error: 'Failed to initialize settings',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Chart statistics events
  setupChartEventHandlers(socket, client);

  console.log(`✅ Admin event handlers setup complete for ${client.user.username}`);
}

// Broadcast functions for real-time updates
export function broadcastAdminDashboardStats(stats: any) {
  // This would be called from other parts of the application
  // to broadcast real-time updates to all connected admin clients
  console.log('📊 Broadcasting admin dashboard stats update');
}

export function broadcastAdminUserUpdate(user: any) {
  console.log('👤 Broadcasting admin user update');
}

export function broadcastAdminTransactionUpdate(transaction: any) {
  console.log('💳 Broadcasting admin transaction update');
}

export function broadcastAdminHouseBalanceUpdate(balance: number) {
  console.log('🏦 Broadcasting admin house balance update');
}

// Chart statistics WebSocket events
export function setupChartEventHandlers(socket: Socket, client: ChatClient) {
  // Get chart statistics
  socket.on('admin_get_chart_stats', async (data: { period?: string; days?: number }) => {
    try {
      const { period = 'daily', days = 7 } = data;
      
      // Create a mock request object for the controller
      const mockReq = {
        query: { period, days: days.toString() },
        user: client.user
      } as any;
      
      const mockRes = {
        json: (data: any) => {
          socket.emit('admin_chart_stats', data);
        }
      } as any;

      await getChartStats(mockReq, mockRes);
    } catch (error) {
      console.error('Error getting chart stats:', error);
      socket.emit('admin_chart_error', { error: 'Failed to fetch chart statistics' });
    }
  });

  // Get live statistics
  socket.on('admin_get_live_stats', async () => {
    try {
      const mockReq = {
        user: client.user
      } as any;
      
      const mockRes = {
        json: (data: any) => {
          socket.emit('admin_live_stats', data);
        }
      } as any;

      await getLiveStats(mockReq, mockRes);
    } catch (error) {
      console.error('Error getting live stats:', error);
      socket.emit('admin_chart_error', { error: 'Failed to fetch live statistics' });
    }
  });

  // Update game settings
  socket.on('admin_update_game_settings', async (data: { gameType: 'mine' | 'crash' | 'coinflip' | 'roulette'; settings: any }) => {
    try {
      if (!client.isAdmin) {
        socket.emit('admin_error', { message: 'Admin privileges required' });
        return;
      }

      const { gameType, settings } = data;
      const gameKey: 'mine' | 'crash' | 'coinflip' | 'roulette' = gameType;
      console.log(`🔧 Admin ${client.user.username} updating ${gameType} game settings:`, settings);

      // Update settings in database
      const updatedSettings = await gameSettingsService.updateSettings(
        { [gameKey]: settings },
        client.user.id
      );

      // Broadcast to all clients (admin and regular users)
      const io = getIO();
      if (io) {
        io.emit('game_settings_updated', {
          gameType: gameKey,
          settings: (updatedSettings as any)[gameKey],
          updatedBy: client.user.username,
          timestamp: new Date().toISOString()
        });

        // If game was disabled, terminate active games
        if (gameKey === 'mine' && !settings.enabled) {
          await terminateActiveMineGames();
        }
      }

      socket.emit('admin_game_settings_updated', {
        success: true,
        message: `${gameKey} game settings updated successfully`,
        settings: (updatedSettings as any)[gameKey]
      });

    } catch (error) {
      console.error('Error updating game settings:', error);
      socket.emit('admin_error', { error: 'Failed to update game settings' });
    }
  });

  // Get active mine games
  socket.on('admin_get_active_mine_games', async () => {
    try {
      if (!client.isAdmin) {
        socket.emit('admin_error', { message: 'Admin privileges required' });
        return;
      }

      const activeGames = await Mine.find({ 
        status: { $in: ['active', 'waiting'] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })
      .populate('user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

      socket.emit('admin_active_mine_games', {
        success: true,
        games: activeGames
      });

    } catch (error) {
      console.error('Error getting active mine games:', error);
      socket.emit('admin_error', { error: 'Failed to fetch active mine games' });
    }
  });
}

// Terminate active mine games when game is disabled
async function terminateActiveMineGames() {
  try {
    const activeGames = await Mine.find({ 
      status: { $in: ['active', 'waiting'] }
    });

    if (activeGames.length > 0) {
      console.log(`🛑 Terminating ${activeGames.length} active mine games due to game being disabled`);
      
      // Update all active games to cancelled status
      await Mine.updateMany(
        { status: { $in: ['active', 'waiting'] } },
        { 
          status: 'cancelled',
          endedAt: new Date(),
          reason: 'Game disabled by admin'
        }
      );

      // Broadcast termination to all clients
      const io = getIO();
      if (io) {
        io.emit('mine_games_terminated', {
          message: 'All active mine games have been terminated due to game being disabled',
          terminatedCount: activeGames.length,
          timestamp: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Error terminating active mine games:', error);
  }
}

// Broadcast real-time chart updates
export function broadcastChartUpdate(updateType: 'bet' | 'payout' | 'transaction', data: any) {
  const io = getIO();
  if (io) {
    io.emit('admin_chart_update', {
      type: updateType,
      data,
      timestamp: new Date().toISOString()
    });
  }
}
