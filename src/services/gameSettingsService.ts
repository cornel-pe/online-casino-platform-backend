import GameSettings, { IGameSettings } from '../models/GameSettings';
import User from '../models/User';
import mongoose from 'mongoose';

class GameSettingsService {
  private static instance: GameSettingsService;
  private settings: IGameSettings | null = null;
  private lastFetch: Date | null = null;
  private readonly CACHE_DURATION = 30000; // 30 seconds cache

  private constructor() {}

  static getInstance(): GameSettingsService {
    if (!GameSettingsService.instance) {
      GameSettingsService.instance = new GameSettingsService();
    }
    return GameSettingsService.instance;
  }

  // Initialize default settings if none exist
  async initializeSettings(): Promise<IGameSettings> {
    try {
      // Wait for MongoDB connection before querying
      await this.waitForConnection();

      let settings = await GameSettings.findOne();
      
      if (!settings) {
        // Create default settings
        const defaultUser = await User.findOne({ isAdmin: true });
        if (!defaultUser) {
          throw new Error('No admin user found to initialize settings');
        }

        settings = new GameSettings({
          updatedBy: defaultUser._id,
          version: 1
        });

        await settings.save();
        console.log('✅ Game settings initialized with default values');
      }

      this.settings = settings;
      this.lastFetch = new Date();
      return settings;
    } catch (error) {
      console.error('❌ Error initializing game settings:', error);
      throw error;
    }
  }

  // Wait for MongoDB connection to be ready
  private async waitForConnection(maxWaitMs: number = 10000): Promise<void> {
    const startTime = Date.now();
    while (mongoose.connection.readyState !== 1) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error('MongoDB connection timeout - database not available');
      }
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Get current settings (with caching)
  async getSettings(): Promise<IGameSettings> {
    try {
      // Wait for MongoDB connection before querying
      await this.waitForConnection();

      // Return cached settings if still valid
      if (this.settings && this.lastFetch && 
          (Date.now() - this.lastFetch.getTime()) < this.CACHE_DURATION) {
        return this.settings;
      }

      // Fetch fresh settings from database
      const settings = await GameSettings.findOne();
      if (!settings) {
        return await this.initializeSettings();
      }

      this.settings = settings;
      this.lastFetch = new Date();
      return settings;
    } catch (error) {
      console.error('❌ Error getting game settings:', error);
      throw error;
    }
  }

  // Update game settings
  async updateSettings(updates: Partial<IGameSettings>, updatedBy: string): Promise<IGameSettings> {
    try {
      // Wait for MongoDB connection before querying
      await this.waitForConnection();

      const settings = await GameSettings.findOne();
      if (!settings) {
        throw new Error('Game settings not found');
      }

      // Update fields
      Object.keys(updates).forEach(key => {
        if (key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt') {
          (settings as any)[key] = (updates as any)[key];
        }
      });

      settings.lastUpdated = new Date();
      settings.updatedBy = new mongoose.Types.ObjectId(updatedBy);
      settings.version += 1;

      await settings.save();
      
      // Update cache
      this.settings = settings;
      this.lastFetch = new Date();

      // Notify crash game engine if crash settings were updated
      if (updates.crash) {
        try {
          const { crashGameEngine } = require('../engine/crashGameEngine');
          await crashGameEngine.updateSettings();
          console.log('🎮 Crash game engine settings updated');
        } catch (error) {
          console.error('❌ Error updating crash game engine settings:', error);
        }
      }

      console.log(`✅ Game settings updated by user ${updatedBy}`);
      return settings;
    } catch (error) {
      console.error('❌ Error updating game settings:', error);
      throw error;
    }
  }

  // Update specific game status
  async updateGameStatus(
    gameName: 'mine' | 'crash' | 'coinflip' | 'roulette',
    enabled: boolean,
    maintenanceMessage?: string,
    updatedBy?: string
  ): Promise<IGameSettings> {
    try {
      await this.waitForConnection();
      const settings = await GameSettings.findOne();
      if (!settings) {
        throw new Error('Game settings not found');
      }

      // Update game status
      settings[gameName].enabled = enabled;
      if (maintenanceMessage) {
        settings[gameName].maintenanceMessage = maintenanceMessage;
      }

      settings.lastUpdated = new Date();
      if (updatedBy) {
        settings.updatedBy = new mongoose.Types.ObjectId(updatedBy);
      }
      settings.version += 1;

      await settings.save();
      
      // Update cache
      this.settings = settings;
      this.lastFetch = new Date();

      console.log(`✅ ${gameName} game status updated: ${enabled ? 'enabled' : 'disabled'}`);
      return settings;
    } catch (error) {
      console.error(`❌ Error updating ${gameName} game status:`, error);
      throw error;
    }
  }

  // Update global settings
  async updateGlobalSettings(
    updates: Partial<IGameSettings['global']>,
    updatedBy?: string
  ): Promise<IGameSettings> {
    try {
      await this.waitForConnection();
      const settings = await GameSettings.findOne();
      if (!settings) {
        throw new Error('Game settings not found');
      }

      // Update global settings
      Object.keys(updates).forEach(key => {
        (settings.global as any)[key] = (updates as any)[key];
      });

      settings.lastUpdated = new Date();
      if (updatedBy) {
        settings.updatedBy = new mongoose.Types.ObjectId(updatedBy);
      }
      settings.version += 1;

      await settings.save();
      
      // Update cache
      this.settings = settings;
      this.lastFetch = new Date();

      console.log('✅ Global settings updated');
      return settings;
    } catch (error) {
      console.error('❌ Error updating global settings:', error);
      throw error;
    }
  }

  // Update bot master settings
  async updateBotSettings(
    updates: Partial<NonNullable<IGameSettings['bots']>>,
    updatedBy?: string
  ): Promise<IGameSettings> {
    try {
      await this.waitForConnection();
      const settings = await GameSettings.findOne();
      if (!settings) {
        throw new Error('Game settings not found');
      }

      settings.bots = settings.bots || { enabled: true, maxBetAmount: 100 } as any;
      Object.keys(updates).forEach(key => {
        (settings.bots as any)[key] = (updates as any)[key];
      });

      settings.lastUpdated = new Date();
      if (updatedBy) {
        settings.updatedBy = new mongoose.Types.ObjectId(updatedBy);
      }
      settings.version += 1;

      await settings.save();

      this.settings = settings;
      this.lastFetch = new Date();

      console.log('✅ Bot master settings updated');
      return settings;
    } catch (error) {
      console.error('❌ Error updating bot settings:', error);
      throw error;
    }
  }

  // Check if a game is enabled
  async isGameEnabled(gameName: 'mine' | 'crash' | 'coinflip' | 'roulette'): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      return settings[gameName].enabled && !settings.global.maintenanceMode;
    } catch (error) {
      console.error(`❌ Error checking ${gameName} game status:`, error);
      return false; // Default to disabled on error
    }
  }

  // Get game maintenance message
  async getGameMaintenanceMessage(gameName: 'mine' | 'crash' | 'coinflip' | 'roulette'): Promise<string> {
    try {
      const settings = await this.getSettings();
      
      if (settings.global.maintenanceMode) {
        return settings.global.maintenanceMessage || 'The platform is currently under maintenance. Please try again later.';
      }
      
      return settings[gameName].maintenanceMessage || `${gameName} game is currently under maintenance. Please try again later.`;
    } catch (error) {
      console.error(`❌ Error getting ${gameName} maintenance message:`, error);
      return `${gameName} game is currently under maintenance. Please try again later.`;
    }
  }

  // Clear cache (for testing or manual refresh)
  clearCache(): void {
    this.settings = null;
    this.lastFetch = null;
    console.log('🗑️ Game settings cache cleared');
  }

  // Update risk control settings
  async updateRiskControlSettings(
    updates: Partial<NonNullable<IGameSettings['riskControl']>>,
    updatedBy?: string
  ): Promise<IGameSettings> {
    try {
      await this.waitForConnection();
      const settings = await GameSettings.findOne();
      if (!settings) {
        throw new Error('Game settings not found');
      }

      settings.riskControl = settings.riskControl || {
        enabled: true,
        maxPayoutPerGame: 10000,
        maxPayoutPerHour: 50000,
        maxPayoutPerDay: 200000,
        minTreasuryBalance: 10000,
        maxPayoutVsTreasuryRatio: 0.15,
        consecutiveHighWinsThreshold: 5,
        highWinMultiplierThreshold: 10,
        anomalyDetectionEnabled: true,
        anomalyScoreThreshold: 0.15,
        recentGamesAnalysisCount: 50,
        pauseGamesOnHighRisk: false,
        notifyAdminsOnRiskEvent: true
      } as any;

      Object.keys(updates).forEach(key => {
        (settings.riskControl as any)[key] = (updates as any)[key];
      });

      settings.lastUpdated = new Date();
      if (updatedBy) {
        settings.updatedBy = new mongoose.Types.ObjectId(updatedBy);
      }
      settings.version += 1;

      await settings.save();

      this.settings = settings;
      this.lastFetch = new Date();

      // Update risk control service with new settings
      try {
        const riskControlService = require('./riskControlService').default;
        await riskControlService.loadSettings(settings.riskControl);
        console.log('🛡️ Risk control service settings updated');
      } catch (error) {
        console.error('❌ Error updating risk control service settings:', error);
      }

      console.log('✅ Risk control settings updated');
      return settings;
    } catch (error) {
      console.error('❌ Error updating risk control settings:', error);
      throw error;
    }
  }

  // Get risk control settings
  async getRiskControlSettings(): Promise<NonNullable<IGameSettings['riskControl']>> {
    try {
      const settings = await this.getSettings();
      return settings.riskControl || {
        enabled: true,
        maxPayoutPerGame: 10000,
        maxPayoutPerHour: 50000,
        maxPayoutPerDay: 200000,
        minTreasuryBalance: 10000,
        maxPayoutVsTreasuryRatio: 0.15,
        consecutiveHighWinsThreshold: 5,
        highWinMultiplierThreshold: 10,
        anomalyDetectionEnabled: true,
        anomalyScoreThreshold: 0.15,
        recentGamesAnalysisCount: 50,
        pauseGamesOnHighRisk: false,
        notifyAdminsOnRiskEvent: true
      };
    } catch (error) {
      console.error('❌ Error getting risk control settings:', error);
      throw error;
    }
  }

  // Get public settings (without sensitive data)
  async getPublicSettings(): Promise<any> {
    try {
      const settings = await this.getSettings();
      
      return {
        games: {
          mine: {
            enabled: settings.mine.enabled && !settings.global.maintenanceMode,
            maintenanceMessage: settings.mine.maintenanceMessage
          },
          crash: {
            enabled: settings.crash.enabled && !settings.global.maintenanceMode,
            maintenanceMessage: settings.crash.maintenanceMessage,
            minBet: settings.crash.minBet,
            maxBet: settings.crash.maxBet,
            houseEdge: settings.crash.houseEdge,
            maxMultiplier: settings.crash.maxMultiplier
          },
          coinflip: {
            enabled: settings.coinflip.enabled && !settings.global.maintenanceMode,
            maintenanceMessage: settings.coinflip.maintenanceMessage
          },
          roulette: {
            enabled: settings.roulette.enabled && !settings.global.maintenanceMode,
            maintenanceMessage: settings.roulette.maintenanceMessage,
            minBet: settings.roulette.minBet,
            maxBet: settings.roulette.maxBet,
            houseEdge: settings.roulette.houseEdge,
            maxPlayers: settings.roulette.maxPlayers,
            timeoutSeconds: settings.roulette.timeoutSeconds,
            minPlayers: settings.roulette.minPlayers
          }
        },
        global: {
          maintenanceMode: settings.global.maintenanceMode,
          maintenanceMessage: settings.global.maintenanceMessage,
          allowRegistrations: settings.global.allowRegistrations,
          allowDeposits: settings.global.allowDeposits,
          allowWithdrawals: settings.global.allowWithdrawals,
          chatEnabled: settings.global.chatEnabled
        },
        version: settings.version,
        lastUpdated: settings.lastUpdated
      };
    } catch (error) {
      console.error('❌ Error getting public settings:', error);
      throw error;
    }
  }
}

export default GameSettingsService.getInstance();
