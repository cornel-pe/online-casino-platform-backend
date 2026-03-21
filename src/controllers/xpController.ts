import { Request, Response } from 'express';
import XPService from '../services/xpService';
import { LocalAuthRequest } from '../middleware/localAuth';

export class XPController {
    /**
     * Get user's XP information
     */
    static async getUserXP(req: LocalAuthRequest, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const xpStats = await XPService.getUserXPStats(userId.toString());
            if (!xpStats) {
                return res.json({
                    success: true,
                    data: {
                        level: 0,
                        xp: 0,
                        totalXP: 0,
                        totalWagered: 0
                    }
                });
            }

            res.json({
                success: true,
                data: xpStats
            });
        } catch (error) {
            console.error('Error getting user XP:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user XP'
            });
        }
    }

    /**
     * Get level leaderboard
     */
    static async getLevelLeaderboard(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const leaderboard = await XPService.getLevelLeaderboard(limit);

            res.json({
                success: true,
                data: leaderboard.map(user => ({
                    username: (user.userId as any)?.username || 'Unknown',
                    displayName: (user.userId as any)?.displayName || (user.userId as any)?.username || 'Unknown',
                    avatar: (user.userId as any)?.avatar || null,
                    level: user.currentLevel,
                    totalXP: user.totalXP,
                    totalWagered: user.totalWagered
                }))
            });
        } catch (error) {
            console.error('Error getting level leaderboard:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get level leaderboard'
            });
        }
    }

    /**
     * Get wagering leaderboard
     */
    static async getWageringLeaderboard(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const leaderboard = await XPService.getWageringLeaderboard(limit);

            res.json({
                success: true,
                data: leaderboard.map(user => ({
                    username: (user.userId as any)?.username || 'Unknown',
                    displayName: (user.userId as any)?.displayName || (user.userId as any)?.username || 'Unknown',
                    avatar: (user.userId as any)?.avatar || null,
                    level: user.currentLevel,
                    totalXP: user.totalXP,
                    totalWagered: user.totalWagered
                }))
            });
        } catch (error) {
            console.error('Error getting wagering leaderboard:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get wagering leaderboard'
            });
        }
    }

    /**
     * Get weekly wagering leaderboard
     */
    static async getWeeklyWageringLeaderboard(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const leaderboard = await XPService.getWeeklyWageringLeaderboard(limit);

            res.json({
                success: true,
                data: leaderboard
            });
        } catch (error) {
            console.error('Error getting weekly wagering leaderboard:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get weekly wagering leaderboard'
            });
        }
    }

    /**
     * Get XP requirements for levels (for frontend display)
     */
    static async getXPRequirements(req: Request, res: Response) {
        try {
            const maxLevel = parseInt(req.query.maxLevel as string) || 50;
            const requirements = [];

            for (let level = 1; level <= maxLevel; level++) {
                requirements.push({
                    level,
                    xpRequired: XPService.calculateXPForLevel(level),
                    totalXPRequired: XPService.calculateTotalXPForLevel(level)
                });
            }

            res.json({
                success: true,
                data: requirements
            });
        } catch (error) {
            console.error('Error getting XP requirements:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get XP requirements'
            });
        }
    }

    /**
     * Get user achievements
     */
    static async getUserAchievements(req: LocalAuthRequest, res: Response) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const userXP = await XPService.getUserXP(userId.toString());
            if (!userXP) {
                return res.json({
                    success: true,
                    data: {
                        achievements: [],
                        unlockedCount: 0,
                        totalCount: 0
                    }
                });
            }

            // Define all possible achievements with descriptions
            const allAchievements = {
                firstBet: {
                    name: 'First Steps',
                    description: 'Place your first bet',
                    unlocked: userXP.achievements.firstBet || false
                },
                level5: {
                    name: 'Rising Star',
                    description: 'Reach level 5',
                    unlocked: userXP.achievements.level5 || false
                },
                level10: {
                    name: 'Experienced Player',
                    description: 'Reach level 10',
                    unlocked: userXP.achievements.level10 || false
                },
                level25: {
                    name: 'Veteran',
                    description: 'Reach level 25',
                    unlocked: userXP.achievements.level25 || false
                },
                level50: {
                    name: 'Elite Player',
                    description: 'Reach level 50',
                    unlocked: userXP.achievements.level50 || false
                },
                level100: {
                    name: 'Legend',
                    description: 'Reach level 100',
                    unlocked: userXP.achievements.level100 || false
                },
                bigBettor: {
                    name: 'Big Bettor',
                    description: 'Wager 5,000+ total',
                    unlocked: userXP.achievements.bigBettor || false
                },
                whale: {
                    name: 'Whale',
                    description: 'Wager 50,000+ total',
                    unlocked: userXP.achievements.whale || false
                }
            };

            res.json({
                success: true,
                data: {
                    achievements: allAchievements,
                    unlockedCount: Object.values(allAchievements).filter(a => a.unlocked).length,
                    totalCount: Object.keys(allAchievements).length
                }
            });
        } catch (error) {
            console.error('Error getting user achievements:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user achievements'
            });
        }
    }
}

export default XPController;
