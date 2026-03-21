/**
 * Risk Control Controller
 * 
 * Admin endpoints for managing and monitoring risk control system
 */

import { Request, Response } from 'express';
import riskControlService from '../services/riskControlService';
import { getParam } from '../utils/requestParams';
import gameSettingsService from '../services/gameSettingsService';
import HouseService from '../services/houseService';
import { CrashGame } from '../models/Crash';
import { RouletteGame } from '../models/Roulette';
import { RiskEvent } from '../models/RiskEvent';
import { IUser } from '../models/User';
import { log } from '../utils/logger';
interface AuthRequest extends Request {
    user?: IUser;
}
/**
 * Get risk control dashboard overview
 * GET /api/admin/risk-control/dashboard
 */
export const getRiskDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
        // Get current risk statistics
        const riskStats = await riskControlService.getRiskStatistics();

        // Get risk control settings
        const settings = riskControlService.getSettings();

        // Get recent risk events from database
        const recentEvents = await riskControlService.getRiskEventsFromDB({ limit: 20 });

        // Get house statistics
        const houseStats = await HouseService.getHouseStats();

        // Get game statistics
        const crashGamesCount = await CrashGame.countDocuments({ status: 'ended' });
        const rouletteGamesCount = await RouletteGame.countDocuments({ status: 'completed' });

        // Calculate risk alerts count
        const criticalEvents = recentEvents.filter(e => e.severity === 'critical').length;
        const highEvents = recentEvents.filter(e => e.severity === 'high').length;

        res.json({
            success: true,
            data: {
                statistics: {
                    ...riskStats,
                    totalGames: crashGamesCount + rouletteGamesCount,
                    crashGames: crashGamesCount,
                    rouletteGames: rouletteGamesCount,
                },
                settings,
                alerts: {
                    critical: criticalEvents,
                    high: highEvents,
                    total: recentEvents.length
                },
                houseStatistics: houseStats,
                recentEvents: recentEvents.slice(0, 20) // Last 20 events
            }
        });
    } catch (error: any) {
        log.error('❌ Error getting risk dashboard:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get risk dashboard'
        });
    }
};

/**
 * Get risk control settings
 * GET /api/admin/risk-control/settings
 */
export const getRiskSettings = async (req: Request, res: Response): Promise<void> => {
    try {
        const settings = riskControlService.getSettings();

        res.json({
            success: true,
            data: settings
        });
    } catch (error: any) {
        log.error('❌ Error getting risk settings:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get risk settings'
        });
    }
};

/**
 * Update risk control settings
 * PUT /api/admin/risk-control/settings
 */
export const updateRiskSettings = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const updates = req.body;
        const adminId = req.user?._id?.toString() || '';
        // Update in game settings
        await gameSettingsService.updateRiskControlSettings(updates, adminId);

        // Settings will be automatically loaded into risk control service
        const newSettings = riskControlService.getSettings();

        res.json({
            success: true,
            message: 'Risk control settings updated successfully',
            data: newSettings
        });
    } catch (error: any) {
        log.error('❌ Error updating risk settings:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update risk settings'
        });
    }
};

/**
 * Get risk statistics
 * GET /api/admin/risk-control/statistics
 */
export const getRiskStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
        const stats = await riskControlService.getRiskStatistics();

        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        log.error('❌ Error getting risk statistics:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get risk statistics'
        });
    }
};

/**
 * Get risk events from database with filters
 * GET /api/admin/risk-control/events
 * Query params: limit, skip, severity, eventType, gameType, startDate, endDate
 */
export const getRiskEvents = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const skip = parseInt(req.query.skip as string) || 0;
        const severity = req.query.severity as string;
        const eventType = req.query.eventType as string;
        const gameType = req.query.gameType as string;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const events = await riskControlService.getRiskEventsFromDB({
            limit,
            skip,
            severity,
            eventType,
            gameType,
            startDate,
            endDate
        });

        const totalCount = await riskControlService.getRiskEventCount({
            severity,
            eventType,
            gameType,
            startDate,
            endDate
        });

        res.json({
            success: true,
            data: {
                events,
                pagination: {
                    total: totalCount,
                    limit,
                    skip,
                    hasMore: skip + events.length < totalCount
                }
            }
        });
    } catch (error: any) {
        log.error('❌ Error getting risk events:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get risk events'
        });
    }
};

/**
 * Analyze game results for anomalies
 * POST /api/admin/risk-control/analyze
 */
export const analyzeGames = async (req: Request, res: Response): Promise<void> => {
    try {
        const { gameType } = req.body;

        if (!gameType || (gameType !== 'crash' && gameType !== 'roulette')) {
            res.status(400).json({
                success: false,
                error: 'Invalid game type. Must be "crash" or "roulette"'
            });
            return;
        }

        const analysis = await riskControlService.analyzeRecentGames(gameType);

        res.json({
            success: true,
            data: analysis
        });
    } catch (error: any) {
        log.error('❌ Error analyzing games:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to analyze games'
        });
    }
};

/**
 * Reset risk tracking data
 * POST /api/admin/risk-control/reset
 */
export const resetRiskTracking = async (req: Request, res: Response): Promise<void> => {
    try {
        const adminId = (req as any).user?.userId;

        if (!adminId) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
            return;
        }

        riskControlService.resetTracking();

        res.json({
            success: true,
            message: 'Risk tracking data reset successfully'
        });
    } catch (error: any) {
        log.error('❌ Error resetting risk tracking:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to reset risk tracking'
        });
    }
};

/**
 * Get payout limits status
 * GET /api/admin/risk-control/payout-limits
 */
export const getPayoutLimits = async (req: Request, res: Response): Promise<void> => {
    try {
        const stats = await riskControlService.getRiskStatistics();
        const settings = riskControlService.getSettings();

        const currentHourUsage = (stats.currentHourPayout / settings.maxPayoutPerHour) * 100;
        const currentDayUsage = (stats.currentDayPayout / settings.maxPayoutPerDay) * 100;
        const treasuryUsage = ((settings.minTreasuryBalance / stats.treasuryBalance) * 100);

        res.json({
            success: true,
            data: {
                hourly: {
                    used: stats.currentHourPayout,
                    limit: settings.maxPayoutPerHour,
                    remaining: settings.maxPayoutPerHour - stats.currentHourPayout,
                    usagePercent: currentHourUsage
                },
                daily: {
                    used: stats.currentDayPayout,
                    limit: settings.maxPayoutPerDay,
                    remaining: settings.maxPayoutPerDay - stats.currentDayPayout,
                    usagePercent: currentDayUsage
                },
                treasury: {
                    current: stats.treasuryBalance,
                    minimum: settings.minTreasuryBalance,
                    available: Math.max(0, stats.treasuryBalance - settings.minTreasuryBalance),
                    safetyPercent: treasuryUsage
                },
                perGame: {
                    limit: settings.maxPayoutPerGame,
                    maxRatio: settings.maxPayoutVsTreasuryRatio,
                    maxAllowedNow: Math.min(
                        settings.maxPayoutPerGame,
                        stats.treasuryBalance * settings.maxPayoutVsTreasuryRatio
                    )
                }
            }
        });
    } catch (error: any) {
        log.error('❌ Error getting payout limits:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get payout limits'
        });
    }
};

/**
 * Get game history with risk analysis
 * GET /api/admin/risk-control/game-history/:gameType
 */
export const getGameHistoryWithRisk = async (req: Request, res: Response): Promise<void> => {
    try {
        const gameType = getParam(req, 'gameType');
        if (!gameType) {
            res.status(400).json({ success: false, error: 'Game type required' });
            return;
        }
        const limit = parseInt(req.query.limit as string) || 50;

        if (gameType !== 'crash' && gameType !== 'roulette') {
            res.status(400).json({
                success: false,
                error: 'Invalid game type'
            });
            return;
        }

        let games: any[] = [];

        if (gameType === 'crash') {
            games = await CrashGame.find({ status: 'ended' })
                .sort({ round: -1 })
                .limit(limit)
                .select('round crashPoint totalBetAmount totalPayout playerBets startTime endTime')
                .lean();

            // Add risk indicators
            games = games.map(game => ({
                ...game,
                houseProfit: game.totalBetAmount - game.totalPayout,
                profitMargin: ((game.totalBetAmount - game.totalPayout) / game.totalBetAmount) * 100,
                isHighPayout: game.totalPayout > 5000, // Flag high payouts
                isHighCrash: game.crashPoint > 10, // Flag high crashes
                playerCount: game.playerBets?.length || 0
            }));
        } else if (gameType === 'roulette') {
            games = await RouletteGame.find({ status: 'completed' })
                .sort({ completedAt: -1 })
                .limit(limit)
                .select('gameId winningSlot winningType totalBetAmount playerCount winners completedAt')
                .lean();

            // Calculate payouts
            games = games.map(game => {
                const totalPayout = game.winners?.reduce((sum: number, w: any) => sum + w.payout, 0) || 0;
                return {
                    ...game,
                    totalPayout,
                    houseProfit: game.totalBetAmount - totalPayout,
                    profitMargin: ((game.totalBetAmount - totalPayout) / game.totalBetAmount) * 100,
                    isHighPayout: totalPayout > 5000,
                    isCrown: game.winningType === 'crown'
                };
            });
        }

        res.json({
            success: true,
            data: games
        });
    } catch (error: any) {
        log.error('❌ Error getting game history with risk:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get game history'
        });
    }
};

/**
 * Mark risk event as reviewed
 * PUT /api/admin/risk-control/events/:eventId/review
 */
export const reviewRiskEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = getParam(req, 'eventId');
        if (!eventId) {
            res.status(400).json({ success: false, error: 'Event ID required' });
            return;
        }
        const { reviewNotes } = req.body;
        const adminId = req.user?._id?.toString() || '';

        const event = await RiskEvent.findByIdAndUpdate(
            eventId,
            {
                reviewedBy: adminId,
                reviewedAt: new Date(),
                reviewNotes: reviewNotes || ''
            },
            { new: true }
        );

        if (!event) {
            res.status(404).json({
                success: false,
                error: 'Risk event not found'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Risk event marked as reviewed',
            data: event
        });
    } catch (error: any) {
        log.error('❌ Error reviewing risk event:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to review risk event'
        });
    }
};

/**
 * Get risk event statistics/summary
 * GET /api/admin/risk-control/event-stats
 */
export const getRiskEventStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        // Get counts by severity
        const criticalCount = await riskControlService.getRiskEventCount({ severity: 'critical', startDate, endDate });
        const highCount = await riskControlService.getRiskEventCount({ severity: 'high', startDate, endDate });
        const mediumCount = await riskControlService.getRiskEventCount({ severity: 'medium', startDate, endDate });
        const lowCount = await riskControlService.getRiskEventCount({ severity: 'low', startDate, endDate });

        // Get counts by event type
        const highPayoutCount = await riskControlService.getRiskEventCount({ eventType: 'high_payout', startDate, endDate });
        const consecutiveWinsCount = await riskControlService.getRiskEventCount({ eventType: 'consecutive_wins', startDate, endDate });
        const anomalyCount = await riskControlService.getRiskEventCount({ eventType: 'anomaly_detected', startDate, endDate });
        const treasuryLowCount = await riskControlService.getRiskEventCount({ eventType: 'treasury_low', startDate, endDate });
        const payoutLimitCount = await riskControlService.getRiskEventCount({ eventType: 'payout_limit_reached', startDate, endDate });
        const payoutAdjustedCount = await riskControlService.getRiskEventCount({ eventType: 'payout_adjusted', startDate, endDate });
        const payoutBlockedCount = await riskControlService.getRiskEventCount({ eventType: 'payout_blocked', startDate, endDate });

        // Get counts by game type
        const crashCount = await riskControlService.getRiskEventCount({ gameType: 'crash', startDate, endDate });
        const rouletteCount = await riskControlService.getRiskEventCount({ gameType: 'roulette', startDate, endDate });

        const totalCount = criticalCount + highCount + mediumCount + lowCount;

        res.json({
            success: true,
            data: {
                total: totalCount,
                bySeverity: {
                    critical: criticalCount,
                    high: highCount,
                    medium: mediumCount,
                    low: lowCount
                },
                byEventType: {
                    high_payout: highPayoutCount,
                    consecutive_wins: consecutiveWinsCount,
                    anomaly_detected: anomalyCount,
                    treasury_low: treasuryLowCount,
                    payout_limit_reached: payoutLimitCount,
                    payout_adjusted: payoutAdjustedCount,
                    payout_blocked: payoutBlockedCount
                },
                byGameType: {
                    crash: crashCount,
                    roulette: rouletteCount
                }
            }
        });
    } catch (error: any) {
        log.error('❌ Error getting risk event stats:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get risk event stats'
        });
    }
};

