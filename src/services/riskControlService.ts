/**
 * Risk Control Service
 * 
 * Comprehensive risk management for all casino games
 * Features:
 * - Real-time payout monitoring
 * - Anomaly detection
 * - Treasury balance protection
 * - Pattern detection (suspicious winning streaks)
 * - Maximum payout limits
 * - Risk event logging
 * - Admin notifications
 */

import { EventEmitter } from 'events';
import { CrashGame } from '../models/Crash';
import { RouletteGame } from '../models/Roulette';
import { RiskEvent, IRiskEvent } from '../models/RiskEvent';
import HouseService from './houseService';
import { getIO } from '../websocket/index';
import adminNotificationService from './adminNotificationService';
import mongoose from 'mongoose';
import { log } from '../utils/logger';

export interface RiskControlSettings {
  enabled: boolean;
  
  // Payout Limits
  maxPayoutPerGame: number; // Maximum payout for a single game
  maxPayoutPerHour: number; // Maximum total payouts per hour
  maxPayoutPerDay: number; // Maximum total payouts per day
  
  // Treasury Protection
  minTreasuryBalance: number; // Minimum treasury balance to maintain
  maxPayoutVsTreasuryRatio: number; // Max payout as % of treasury (e.g., 0.1 = 10%)
  
  // Pattern Detection
  consecutiveHighWinsThreshold: number; // Alert after X consecutive high wins
  highWinMultiplierThreshold: number; // What's considered a "high win" multiplier
  
  // Anomaly Detection
  anomalyDetectionEnabled: boolean;
  anomalyScoreThreshold: number; // 0-1, higher = more suspicious
  recentGamesAnalysisCount: number; // How many recent games to analyze
  
  // Actions
  pauseGamesOnHighRisk: boolean; // Auto-pause games when risk is too high
  notifyAdminsOnRiskEvent: boolean; // Send notifications to admins
}

export interface RiskEventData {
  timestamp: Date;
  gameType: string;
  gameId: string;
  eventType: 'high_payout' | 'consecutive_wins' | 'anomaly_detected' | 'treasury_low' | 'payout_limit_reached' | 'payout_adjusted' | 'payout_blocked';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  actionTaken?: string;
  userId?: string;
  username?: string;
}

export interface PayoutCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedPayout?: number;
  riskLevel: 'safe' | 'caution' | 'warning' | 'critical';
  warnings: string[];
}

class RiskControlService extends EventEmitter {
  private settings: RiskControlSettings;
  private recentRiskEvents: RiskEventData[] = []; // Memory cache for quick access
  private hourlyPayouts: Map<number, number> = new Map(); // timestamp hour -> total payout
  private dailyPayouts: Map<string, number> = new Map(); // date string -> total payout
  private consecutiveHighWins: number = 0;
  private lastHighWinTimestamp: Date | null = null;
  
  // Per-user consecutive win tracking
  private userConsecutiveWins: Map<string, { count: number; lastWin: Date; gameType: string }> = new Map();

  constructor() {
    super();
    
    // Default settings
    this.settings = {
      enabled: true,
      
      // Payout Limits
      maxPayoutPerGame: 10000, // $10,000 max per game
      maxPayoutPerHour: 50000, // $50,000 per hour
      maxPayoutPerDay: 200000, // $200,000 per day
      
      // Treasury Protection
      minTreasuryBalance: 10000, // Keep at least $10,000 in treasury
      maxPayoutVsTreasuryRatio: 0.15, // Max 15% of treasury per payout
      
      // Pattern Detection
      consecutiveHighWinsThreshold: 5, // Alert after 5 consecutive high wins
      highWinMultiplierThreshold: 10, // 10x+ is considered high
      
      // Anomaly Detection
      anomalyDetectionEnabled: true,
      anomalyScoreThreshold: 0.15, // 15% anomaly score triggers alert
      recentGamesAnalysisCount: 50, // Analyze last 50 games
      
      // Actions
      pauseGamesOnHighRisk: false, // Don't auto-pause (admin decision)
      notifyAdminsOnRiskEvent: true
    };

    // Clean up old data every hour
    setInterval(() => this.cleanupOldData(), 3600000); // 1 hour
  }

  /**
   * Load settings from database or config
   */
  public async loadSettings(settings?: Partial<RiskControlSettings>): Promise<void> {
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    } else {
      // Try to load from game settings if no settings provided
      try {
        const gameSettingsService = require('./gameSettingsService').default;
        const riskControlSettings = await gameSettingsService.getRiskControlSettings();
        this.settings = { ...this.settings, ...riskControlSettings };
      } catch (error) {
        log.warn('⚠️ Could not load risk control settings from game settings, using defaults');
      }
    }
    log.info('🛡️ Risk Control Settings loaded:', this.settings);
  }

  /**
   * Update settings
   */
  public updateSettings(settings: Partial<RiskControlSettings>): void {
    this.settings = { ...this.settings, ...settings };
    log.info('🛡️ Risk Control Settings updated');
  }

  /**
   * Get current settings
   */
  public getSettings(): RiskControlSettings {
    return { ...this.settings };
  }

  /**
   * Check if a payout is allowed based on risk control rules
   */
  public async checkPayoutAllowed(
    gameType: string,
    gameId: string,
    payoutAmount: number,
    multiplier?: number,
    userId?: string,
    username?: string
  ): Promise<PayoutCheckResult> {
    if (!this.settings.enabled) {
      return {
        allowed: true,
        riskLevel: 'safe',
        warnings: []
      };
    }

    const warnings: string[] = [];
    let riskLevel: 'safe' | 'caution' | 'warning' | 'critical' = 'safe';
    let adjustedPayout = payoutAmount;

    // 1. Check per-game payout limit
    if (payoutAmount > this.settings.maxPayoutPerGame) {
      warnings.push(`Payout exceeds max per game limit ($${this.settings.maxPayoutPerGame})`);
      adjustedPayout = this.settings.maxPayoutPerGame;
      riskLevel = 'warning';
      
      await this.logRiskEvent({
        timestamp: new Date(),
        gameType,
        gameId,
        eventType: 'payout_limit_reached',
        severity: 'high',
        details: {
          requestedPayout: payoutAmount,
          adjustedPayout,
          limit: this.settings.maxPayoutPerGame
        },
        actionTaken: 'Payout capped at maximum limit'
      });
    }

    // 2. Check treasury balance
    const house = await HouseService.getHouse();
    const treasuryBalance = house.treasuryBalance;
    
    if (treasuryBalance < this.settings.minTreasuryBalance) {
      warnings.push(`Treasury balance is critically low ($${treasuryBalance.toFixed(2)})`);
      riskLevel = 'critical';
      
      await this.logRiskEvent({
        timestamp: new Date(),
        gameType,
        gameId,
        eventType: 'treasury_low',
        severity: 'critical',
        details: {
          currentBalance: treasuryBalance,
          minRequired: this.settings.minTreasuryBalance
        }
      });

      // Don't allow payout if it would deplete treasury below minimum
      if (treasuryBalance - adjustedPayout < this.settings.minTreasuryBalance) {
        return {
          allowed: false,
          reason: 'Insufficient treasury balance',
          riskLevel: 'critical',
          warnings: [...warnings, 'Treasury balance too low for this payout']
        };
      }
    }

    // 3. Check payout vs treasury ratio
    const payoutRatio = adjustedPayout / treasuryBalance;
    if (payoutRatio > this.settings.maxPayoutVsTreasuryRatio) {
      warnings.push(`Payout is ${(payoutRatio * 100).toFixed(1)}% of treasury (limit: ${(this.settings.maxPayoutVsTreasuryRatio * 100).toFixed(1)}%)`);
      riskLevel = riskLevel === 'critical' ? 'critical' : 'warning';
      
      // Cap payout to max ratio
      const maxAllowedPayout = treasuryBalance * this.settings.maxPayoutVsTreasuryRatio;
      if (adjustedPayout > maxAllowedPayout) {
        adjustedPayout = maxAllowedPayout;
        warnings.push(`Payout adjusted to ${(this.settings.maxPayoutVsTreasuryRatio * 100).toFixed(1)}% of treasury`);
      }
    }

    // 4. Check hourly payout limit
    const currentHour = Math.floor(Date.now() / 3600000); // Hour timestamp
    const hourlyTotal = (this.hourlyPayouts.get(currentHour) || 0) + adjustedPayout;
    
    if (hourlyTotal > this.settings.maxPayoutPerHour) {
      warnings.push(`Hourly payout limit would be exceeded ($${hourlyTotal.toFixed(2)} / $${this.settings.maxPayoutPerHour})`);
      riskLevel = 'warning';
      
      const remainingHourlyBudget = Math.max(0, this.settings.maxPayoutPerHour - (this.hourlyPayouts.get(currentHour) || 0));
      if (remainingHourlyBudget < adjustedPayout) {
        adjustedPayout = remainingHourlyBudget;
        warnings.push('Payout adjusted to fit hourly limit');
      }
    }

    // 5. Check daily payout limit
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dailyTotal = (this.dailyPayouts.get(currentDate) || 0) + adjustedPayout;
    
    if (dailyTotal > this.settings.maxPayoutPerDay) {
      warnings.push(`Daily payout limit would be exceeded ($${dailyTotal.toFixed(2)} / $${this.settings.maxPayoutPerDay})`);
      riskLevel = 'critical';
      
      const remainingDailyBudget = Math.max(0, this.settings.maxPayoutPerDay - (this.dailyPayouts.get(currentDate) || 0));
      if (remainingDailyBudget < adjustedPayout) {
        adjustedPayout = remainingDailyBudget;
        warnings.push('Payout adjusted to fit daily limit');
        
        if (adjustedPayout === 0) {
          await this.logRiskEvent({
            timestamp: new Date(),
            gameType,
            gameId,
            eventType: 'payout_limit_reached',
            severity: 'critical',
            details: {
              requestedPayout: payoutAmount,
              dailyLimit: this.settings.maxPayoutPerDay,
              dailyTotal
            },
            actionTaken: 'Payout blocked - daily limit reached'
          });

          return {
            allowed: false,
            reason: 'Daily payout limit reached',
            riskLevel: 'critical',
            warnings: [...warnings, 'Daily payout limit has been reached']
          };
        }
      }
    }

    // 6. Check for high win multipliers (pattern detection)
    if (multiplier && multiplier >= this.settings.highWinMultiplierThreshold) {
      // Global consecutive high wins tracking (existing logic)
      this.consecutiveHighWins++;
      this.lastHighWinTimestamp = new Date();
      
      if (this.consecutiveHighWins >= this.settings.consecutiveHighWinsThreshold) {
        warnings.push(`${this.consecutiveHighWins} consecutive high wins detected`);
        riskLevel = riskLevel === 'critical' ? 'critical' : 'warning';
        
        await this.logRiskEvent({
          timestamp: new Date(),
          gameType,
          gameId,
          eventType: 'consecutive_wins',
          severity: 'high',
          details: {
            consecutiveWins: this.consecutiveHighWins,
            multiplier,
            threshold: this.settings.highWinMultiplierThreshold
          }
        });
      }

      // Per-user consecutive wins tracking (NEW)
      if (userId && username) {
        const now = new Date();
        const userKey = userId;
        const userWinData = this.userConsecutiveWins.get(userKey);
        
        if (userWinData && userWinData.gameType === gameType) {
          // Check if this is within 10 minutes of last win (consecutive)
          const timeDiff = now.getTime() - userWinData.lastWin.getTime();
          if (timeDiff <= 10 * 60 * 1000) { // 10 minutes
            userWinData.count++;
            userWinData.lastWin = now;
          } else {
            // Reset count if too much time has passed
            userWinData.count = 1;
            userWinData.lastWin = now;
          }
        } else {
          // First win or different game type
          this.userConsecutiveWins.set(userKey, {
            count: 1,
            lastWin: now,
            gameType
          });
        }

        const updatedUserData = this.userConsecutiveWins.get(userKey)!;
        
        // Alert if user has consecutive wins threshold (can be different from global)
        const userConsecutiveThreshold = this.settings.consecutiveHighWinsThreshold;
        if (updatedUserData.count >= userConsecutiveThreshold) {
          warnings.push(`User ${username} has ${updatedUserData.count} consecutive high wins in ${gameType}`);
          riskLevel = riskLevel === 'critical' ? 'critical' : 'warning';
          
          await this.logRiskEvent({
            timestamp: new Date(),
            gameType,
            gameId,
            eventType: 'consecutive_wins',
            severity: updatedUserData.count >= userConsecutiveThreshold * 2 ? 'critical' : 'high',
            details: {
              consecutiveWins: updatedUserData.count,
              multiplier,
              threshold: this.settings.highWinMultiplierThreshold,
              gameType,
              isUserSpecific: true
            },
            userId,
            username
          });
        }
      }
    } else {
      // Reset consecutive wins if not a high win
      if (this.lastHighWinTimestamp && Date.now() - this.lastHighWinTimestamp.getTime() > 300000) { // 5 minutes
        this.consecutiveHighWins = 0;
      }
      
      // Reset user consecutive wins if not a high win (cleanup expired entries)
      const now = Date.now();
      for (const [userId, data] of this.userConsecutiveWins.entries()) {
        if (now - data.lastWin.getTime() > 10 * 60 * 1000) { // 10 minutes
          this.userConsecutiveWins.delete(userId);
        }
      }
    }

    // 7. Log high payout events
    if (adjustedPayout > this.settings.maxPayoutPerGame * 0.5) { // 50% of max
      await this.logRiskEvent({
        timestamp: new Date(),
        gameType,
        gameId,
        eventType: 'high_payout',
        severity: 'medium',
        details: {
          payout: adjustedPayout,
          multiplier,
          treasuryBalance
        }
      });
    }

    // Update tracking
    if (adjustedPayout > 0) {
      this.hourlyPayouts.set(currentHour, (this.hourlyPayouts.get(currentHour) || 0) + adjustedPayout);
      this.dailyPayouts.set(currentDate, (this.dailyPayouts.get(currentDate) || 0) + adjustedPayout);
    }

    return {
      allowed: true,
      adjustedPayout: adjustedPayout !== payoutAmount ? adjustedPayout : undefined,
      riskLevel,
      warnings
    };
  }

  /**
   * Analyze recent game results for anomalies
   */
  public async analyzeRecentGames(gameType: 'crash' | 'roulette'): Promise<{
    isAnomalous: boolean;
    anomalyScore: number;
    details: string;
    recommendations: string[];
  }> {
    if (!this.settings.anomalyDetectionEnabled) {
      return {
        isAnomalous: false,
        anomalyScore: 0,
        details: 'Anomaly detection disabled',
        recommendations: []
      };
    }

    try {
      let recentGames: any[] = [];
      const recommendations: string[] = [];

      if (gameType === 'crash') {
        recentGames = await CrashGame.find({ status: 'ended' })
          .sort({ round: -1 })
          .limit(this.settings.recentGamesAnalysisCount)
          .lean();

        if (recentGames.length < 10) {
          return {
            isAnomalous: false,
            anomalyScore: 0,
            details: 'Insufficient data for analysis',
            recommendations: []
          };
        }

        // Analyze crash points
        const crashPoints = recentGames.map(g => g.crashPoint);
        const avgCrashPoint = crashPoints.reduce((a, b) => a + b, 0) / crashPoints.length;
        const expectedAvg = 1.98; // Theoretical average with house edge
        
        // Check if average is significantly different from expected
        const deviation = Math.abs(avgCrashPoint - expectedAvg);
        const deviationPercent = deviation / expectedAvg;
        
        // Count very high crashes
        const veryHighCrashes = crashPoints.filter(p => p >= 10).length;
        const veryHighPercent = veryHighCrashes / crashPoints.length;
        
        // Expected is about 10% for 10x+ crashes
        const expectedHighPercent = 0.10;
        
        let anomalyScore = 0;
        let details = `Analyzed ${crashPoints.length} recent crash games. `;
        
        if (deviationPercent > 0.15) { // 15% deviation from expected
          anomalyScore += 0.3;
          details += `Average crash point (${avgCrashPoint.toFixed(2)}x) deviates ${(deviationPercent * 100).toFixed(1)}% from expected (${expectedAvg}x). `;
          recommendations.push('Monitor crash point distribution');
        }
        
        if (veryHighPercent > expectedHighPercent * 1.5) { // 50% more high crashes than expected
          anomalyScore += 0.4;
          details += `High crash frequency: ${(veryHighPercent * 100).toFixed(1)}% (expected ~${(expectedHighPercent * 100).toFixed(1)}%). `;
          recommendations.push('Review RNG algorithm and seed generation');
        }

        // Check for patterns in recent games
        const last10Crashes = crashPoints.slice(0, 10);
        const last10Avg = last10Crashes.reduce((a, b) => a + b, 0) / 10;
        if (last10Avg > avgCrashPoint * 1.3) {
          anomalyScore += 0.3;
          details += `Recent games showing higher than average crash points. `;
          recommendations.push('Investigate recent game pattern');
        }

        const isAnomalous = anomalyScore >= this.settings.anomalyScoreThreshold;

        if (isAnomalous) {
          await this.logRiskEvent({
            timestamp: new Date(),
            gameType: 'crash',
            gameId: 'analysis',
            eventType: 'anomaly_detected',
            severity: anomalyScore > 0.5 ? 'high' : 'medium',
            details: {
              anomalyScore,
              avgCrashPoint,
              expectedAvg,
              veryHighPercent,
              gamesAnalyzed: crashPoints.length
            }
          });
        }

        return {
          isAnomalous,
          anomalyScore,
          details,
          recommendations
        };

      } else if (gameType === 'roulette') {
        recentGames = await RouletteGame.find({ status: 'completed' })
          .sort({ completedAt: -1 })
          .limit(this.settings.recentGamesAnalysisCount)
          .lean();

        if (recentGames.length < 10) {
          return {
            isAnomalous: false,
            anomalyScore: 0,
            details: 'Insufficient data for analysis',
            recommendations: []
          };
        }

        // Analyze winning types distribution
        const winningTypes = recentGames.map(g => g.winningType);
        const headsCount = winningTypes.filter(t => t === 'heads').length;
        const tailsCount = winningTypes.filter(t => t === 'tails').length;
        const crownCount = winningTypes.filter(t => t === 'crown').length;
        
        const total = winningTypes.length;
        const headsPercent = headsCount / total;
        const tailsPercent = tailsCount / total;
        const crownPercent = crownCount / total;
        
        // Expected distribution: heads ~48.6%, tails ~48.6%, crown ~2.7% (1/37)
        const expectedHeads = 18/37; // ~48.6%
        const expectedTails = 18/37; // ~48.6%
        const expectedCrown = 1/37;  // ~2.7%
        
        let anomalyScore = 0;
        let details = `Analyzed ${total} recent roulette games. `;
        
        // Check chi-square deviation
        const headsDeviation = Math.abs(headsPercent - expectedHeads);
        const tailsDeviation = Math.abs(tailsPercent - expectedTails);
        const crownDeviation = Math.abs(crownPercent - expectedCrown);
        
        if (headsDeviation > 0.15 || tailsDeviation > 0.15) {
          anomalyScore += 0.4;
          details += `Distribution deviation detected: Heads ${(headsPercent * 100).toFixed(1)}%, Tails ${(tailsPercent * 100).toFixed(1)}%, Crown ${(crownPercent * 100).toFixed(1)}%. `;
          recommendations.push('Monitor roulette outcome distribution');
        }
        
        if (crownDeviation > 0.05) { // Crown frequency off by more than 5%
          anomalyScore += 0.3;
          details += `Crown frequency (${(crownPercent * 100).toFixed(1)}%) deviates from expected (${(expectedCrown * 100).toFixed(1)}%). `;
          recommendations.push('Review crown outcome generation');
        }

        // Check for streaks
        let maxStreak = 1;
        let currentStreak = 1;
        for (let i = 1; i < winningTypes.length; i++) {
          if (winningTypes[i] === winningTypes[i-1]) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
          } else {
            currentStreak = 1;
          }
        }
        
        if (maxStreak >= 8) { // 8+ consecutive same outcomes is suspicious
          anomalyScore += 0.3;
          details += `Long streak detected: ${maxStreak} consecutive same outcomes. `;
          recommendations.push('Investigate outcome streak pattern');
        }

        const isAnomalous = anomalyScore >= this.settings.anomalyScoreThreshold;

        if (isAnomalous) {
          await this.logRiskEvent({
            timestamp: new Date(),
            gameType: 'roulette',
            gameId: 'analysis',
            eventType: 'anomaly_detected',
            severity: anomalyScore > 0.5 ? 'high' : 'medium',
            details: {
              anomalyScore,
              distribution: { headsPercent, tailsPercent, crownPercent },
              maxStreak,
              gamesAnalyzed: total
            }
          });
        }

        return {
          isAnomalous,
          anomalyScore,
          details,
          recommendations
        };
      }

      return {
        isAnomalous: false,
        anomalyScore: 0,
        details: 'Unknown game type',
        recommendations: []
      };

    } catch (error) {
      log.error('❌ Error analyzing recent games:', error);
      return {
        isAnomalous: false,
        anomalyScore: 0,
        details: 'Analysis failed due to error',
        recommendations: ['Check system logs']
      };
    }
  }

  /**
   * Log a risk event (saves to database and memory)
   */
  private async logRiskEvent(event: RiskEventData): Promise<void> {
    try {
      // Save to database
      const dbEvent = new RiskEvent({
        timestamp: event.timestamp,
        gameType: event.gameType,
        gameId: event.gameId,
        eventType: event.eventType,
        severity: event.severity,
        details: event.details,
        actionTaken: event.actionTaken,
        userId: event.userId || null,
        username: event.username || null
      });
      
      await dbEvent.save();
      log.debug(`💾 Risk event saved to database: ${dbEvent._id}`);
      
      // Add to memory cache
      this.recentRiskEvents.push(event);
      
      // Keep only last 1000 events in memory
      if (this.recentRiskEvents.length > 1000) {
        this.recentRiskEvents = this.recentRiskEvents.slice(-1000);
      }

      log.warn(`⚠️ Risk Event [${event.severity}]: ${event.eventType} - ${event.gameType} game ${event.gameId}`);
      
      // Emit event for listeners
      this.emit('risk_event', event);

      // Notify admins if enabled
      if (this.settings.notifyAdminsOnRiskEvent) {
        this.notifyAdmins(event, dbEvent._id.toString());
      }

      // Auto-pause games if enabled and severity is critical
      if (this.settings.pauseGamesOnHighRisk && event.severity === 'critical') {
        log.warn('🛑 Auto-pausing games due to critical risk event');
        // This would need to integrate with game engines
        this.emit('auto_pause_requested', event);
      }
    } catch (error) {
      log.error('❌ Failed to save risk event to database:', error);
      // Still keep in memory even if DB save fails
      this.recentRiskEvents.push(event);
    }
  }

  /**
   * Notify admins about risk event via Socket.IO and Notification System
   */
  private async notifyAdmins(event: RiskEventData, eventId: string): Promise<void> {
    try {
      // Send via Socket.IO for real-time alerts
      const io = getIO();
      io.emit('admin_risk_alert', {
        eventId,
        timestamp: event.timestamp.toISOString(),
        gameType: event.gameType,
        gameId: event.gameId,
        eventType: event.eventType,
        severity: event.severity,
        details: event.details,
        actionTaken: event.actionTaken,
        userId: event.userId,
        username: event.username
      });

      // Send persistent notification to all admins
      await adminNotificationService.sendRiskAlert({
        eventType: event.eventType as any,
        severity: event.severity,
        gameType: event.gameType,
        gameId: event.gameId,
        riskEventId: eventId,
        details: event.details,
        actionTaken: event.actionTaken,
        userId: event.userId,
        username: event.username
      });
      
      log.info(`📢 Admin risk alert sent: ${event.eventType} (${event.severity})`);
    } catch (error) {
      log.error('❌ Failed to notify admins:', error);
    }
  }

  /**
   * Get recent risk events from memory cache
   */
  public getRecentRiskEvents(limit: number = 50): RiskEventData[] {
    return this.recentRiskEvents.slice(-limit).reverse();
  }

  /**
   * Get risk events from database with filters
   */
  public async getRiskEventsFromDB(options: {
    limit?: number;
    skip?: number;
    severity?: string;
    eventType?: string;
    gameType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<mongoose.LeanDocument<IRiskEvent>[]> {
    try {
      const {
        limit = 100,
        skip = 0,
        severity,
        eventType,
        gameType,
        startDate,
        endDate
      } = options;

      const query: any = {};

      if (severity) {
        query.severity = severity;
      }

      if (eventType) {
        query.eventType = eventType;
      }

      if (gameType) {
        query.gameType = gameType;
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = startDate;
        }
        if (endDate) {
          query.timestamp.$lte = endDate;
        }
      }

      const events = await RiskEvent.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username avatar')
        .populate('reviewedBy', 'username')
        .lean();

      return events;
    } catch (error) {
      log.error('❌ Error fetching risk events from database:', error);
      return [];
    }
  }

  /**
   * Get risk event count from database
   */
  public async getRiskEventCount(filters: {
    severity?: string;
    eventType?: string;
    gameType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<number> {
    try {
      const query: any = {};

      if (filters.severity) {
        query.severity = filters.severity;
      }

      if (filters.eventType) {
        query.eventType = filters.eventType;
      }

      if (filters.gameType) {
        query.gameType = filters.gameType;
      }

      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
          query.timestamp.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.timestamp.$lte = filters.endDate;
        }
      }

      return await RiskEvent.countDocuments(query);
    } catch (error) {
      log.error('❌ Error counting risk events:', error);
      return 0;
    }
  }

  /**
   * Get risk statistics
   */
  public async getRiskStatistics(): Promise<{
    currentHourPayout: number;
    currentDayPayout: number;
    treasuryBalance: number;
    riskLevel: string;
    recentEvents: number;
    consecutiveHighWins: number;
  }> {
    const currentHour = Math.floor(Date.now() / 3600000);
    const currentDate = new Date().toISOString().split('T')[0];
    const house = await HouseService.getHouse();
    const treasuryBalance = house.treasuryBalance;

    let riskLevel = 'safe';
    if (treasuryBalance < this.settings.minTreasuryBalance) {
      riskLevel = 'critical';
    } else if ((this.dailyPayouts.get(currentDate) || 0) > this.settings.maxPayoutPerDay * 0.8) {
      riskLevel = 'warning';
    } else if ((this.hourlyPayouts.get(currentHour) || 0) > this.settings.maxPayoutPerHour * 0.8) {
      riskLevel = 'caution';
    }

    return {
      currentHourPayout: this.hourlyPayouts.get(currentHour) || 0,
      currentDayPayout: this.dailyPayouts.get(currentDate) || 0,
      treasuryBalance,
      riskLevel,
      recentEvents: this.recentRiskEvents.filter(e => 
        Date.now() - e.timestamp.getTime() < 3600000 // Last hour
      ).length,
      consecutiveHighWins: this.consecutiveHighWins
    };
  }

  /**
   * Clean up old tracking data (memory and database)
   */
  private async cleanupOldData(): Promise<void> {
    const now = Date.now();
    const currentHour = Math.floor(now / 3600000);
    
    // Remove hourly data older than 24 hours
    for (const [hour, _] of this.hourlyPayouts) {
      if (hour < currentHour - 24) {
        this.hourlyPayouts.delete(hour);
      }
    }

    // Remove daily data older than 30 days
    const thirtyDaysAgo = new Date(now - 30 * 24 * 3600000).toISOString().split('T')[0];
    for (const [date, _] of this.dailyPayouts) {
      if (date < thirtyDaysAgo) {
        this.dailyPayouts.delete(date);
      }
    }

    // Keep only last 7 days of risk events in memory
    const sevenDaysAgo = now - 7 * 24 * 3600000;
    this.recentRiskEvents = this.recentRiskEvents.filter(e => 
      e.timestamp.getTime() > sevenDaysAgo
    );

    // Clean up old user consecutive wins data (remove entries older than 2 hours)
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    for (const [userId, data] of this.userConsecutiveWins.entries()) {
      if (data.lastWin.getTime() < twoHoursAgo) {
        this.userConsecutiveWins.delete(userId);
      }
    }

    // Clean up old events from database (keep 90 days)
    try {
      const ninetyDaysAgo = new Date(now - 90 * 24 * 3600000);
      const result = await RiskEvent.deleteMany({
        timestamp: { $lt: ninetyDaysAgo }
      });
      
      if (result.deletedCount && result.deletedCount > 0) {
        log.info(`🗑️ Deleted ${result.deletedCount} old risk events from database`);
      }
    } catch (error) {
      log.error('❌ Error cleaning up old risk events from database:', error);
    }

    log.info('🧹 Risk control data cleaned up');
  }

  /**
   * Reset all tracking (admin function)
   */
  public resetTracking(): void {
    this.hourlyPayouts.clear();
    this.dailyPayouts.clear();
    this.consecutiveHighWins = 0;
    this.lastHighWinTimestamp = null;
    this.userConsecutiveWins.clear();
    log.info('🔄 Risk control tracking reset');
  }
}

// Singleton instance
const riskControlService = new RiskControlService();

export default riskControlService;

