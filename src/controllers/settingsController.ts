import { Request, Response } from 'express';
import gameSettingsService from '../services/gameSettingsService';
import Mine from '../models/Mine';
import { getIO } from '../websocket';

class SettingsController {
  // Get public server settings (no authentication required)
  async getPublicSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await gameSettingsService.getPublicSettings();
      
      res.json({
        success: true,
        data: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting public settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get server settings',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Get full settings (admin only)
  async getFullSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await gameSettingsService.getSettings();
      
      res.json({
        success: true,
        data: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting full settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get settings',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Update game status (admin only)
  async updateGameStatus(req: Request, res: Response): Promise<void> {
    try {
      const { gameName, enabled, maintenanceMessage } = req.body;
      const userId = (req as any).user?._id;

      if (!gameName || typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!['mine', 'crash', 'coinflip', 'roulette'].includes(gameName)) {
        res.status(400).json({
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
        userId
      );

      // Broadcast updated public settings to all clients
      try {
        const publicSettings = await gameSettingsService.getPublicSettings();
        const io = getIO();
        io.emit('server_settings_updated', {
          success: true,
          data: publicSettings,
          timestamp: new Date().toISOString()
        });

        // If a game was disabled, terminate its active sessions
        if (gameName === 'mine' && enabled === false) {
          const activeGames = await Mine.find({ status: { $in: ['active', 'waiting'] } });
          if (activeGames.length > 0) {
            await Mine.updateMany(
              { status: { $in: ['active', 'waiting'] } },
              {
                status: 'cancelled',
                endedAt: new Date(),
                reason: 'Game disabled by admin'
              }
            );

            io.emit('mine_games_terminated', {
              message: 'All active mine games have been terminated due to game being disabled',
              terminatedCount: activeGames.length,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (broadcastErr) {
        console.error('Error broadcasting settings update:', broadcastErr);
      }

      res.json({
        success: true,
        data: settings,
        message: `${gameName} game ${enabled ? 'enabled' : 'disabled'} successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating game status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update game status',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Update global settings (admin only)
  async updateGlobalSettings(req: Request, res: Response): Promise<void> {
    try {
      const updates = req.body;
      const userId = (req as any).user?._id;

      const settings = await gameSettingsService.updateGlobalSettings(updates, userId);

      // Broadcast updated public settings to all clients
      try {
        const publicSettings = await gameSettingsService.getPublicSettings();
        const io = getIO();
        io.emit('server_settings_updated', {
          success: true,
          data: publicSettings,
          timestamp: new Date().toISOString()
        });
      } catch (broadcastErr) {
        console.error('Error broadcasting global settings update:', broadcastErr);
      }

      res.json({
        success: true,
        data: settings,
        message: 'Global settings updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating global settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update global settings',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Update full settings (admin only)
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const updates = req.body;
      const userId = (req as any).user?._id;

      const settings = await gameSettingsService.updateSettings(updates, userId);

      // Broadcast updated public settings to all clients
      try {
        const publicSettings = await gameSettingsService.getPublicSettings();
        const io = getIO();
        io.emit('server_settings_updated', {
          success: true,
          data: publicSettings,
          timestamp: new Date().toISOString()
        });
      } catch (broadcastErr) {
        console.error('Error broadcasting settings update:', broadcastErr);
      }

      res.json({
        success: true,
        data: settings,
        message: 'Settings updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update settings',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Initialize settings (admin only)
  async initializeSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await gameSettingsService.initializeSettings();

      res.json({
        success: true,
        data: settings,
        message: 'Settings initialized successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error initializing settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initialize settings',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default new SettingsController();
