import UserXP, { IUserXP } from '../models/UserXP';
import User from '../models/User';

export interface XPCalculationResult {
    newLevel: number;
    newXP: number;
    totalXP: number;
    levelProgress: number;
    nextLevelXP: number;
    leveledUp: boolean;
    levelsGained: number;
}

export interface XPReward {
    xpGained: number;
    reason: string;
    multiplier?: number;
}

export class XPService {
    // Mathematical formula for XP requirements per level
    // Formula: XP = baseXP * (level^exponent) + (level * linearFactor)
    // Increased to balance with 10x higher XP rewards
    private static readonly BASE_XP = 1000;
    private static readonly EXPONENT = 1.5;
    private static readonly LINEAR_FACTOR = 500;

    /**
     * Calculate XP required for a specific level
     */
    static calculateXPForLevel(level: number): number {
        if (level <= 0) return 0;
        return Math.floor(
            this.BASE_XP * Math.pow(level, this.EXPONENT) + (level * this.LINEAR_FACTOR)
        );
    }

    /**
     * Calculate total XP required to reach a level (cumulative)
     */
    static calculateTotalXPForLevel(level: number): number {
        let totalXP = 0;
        for (let i = 1; i <= level; i++) {
            totalXP += this.calculateXPForLevel(i);
        }
        return totalXP;
    }

    /**
     * Calculate level from total XP
     */
    static calculateLevelFromTotalXP(totalXP: number): { level: number; currentLevelXP: number } {
        let level = 0;
        let currentLevelXP = totalXP;

        while (currentLevelXP >= this.calculateXPForLevel(level + 1)) {
            level++;
            currentLevelXP -= this.calculateXPForLevel(level);
        }

        return { level, currentLevelXP };
    }

    /**
     * Calculate XP reward based on bet amount
     */
    static calculateXPReward(betAmount: number, gameType: string): XPReward {
        // Base XP per bet amount (pure score system)
        const baseXPPerBet = 100;
        
        // Game type multipliers
        const gameMultipliers: { [key: string]: number } = {
            'roulette': 1.0,
            'crash': 1.2,
            'mine': 1.5,
            'coinflip': 0.8
        };

        const multiplier = gameMultipliers[gameType] || 1.0;
        const xpGained = Math.floor(betAmount * baseXPPerBet * multiplier);

        console.log(`🎯 XP Calculation: ${betAmount} * ${baseXPPerBet} * ${multiplier} = ${xpGained} XP for ${gameType}`);

        return {
            xpGained,
            reason: `Bet ${betAmount} in ${gameType}`,
            multiplier
        };
    }

    /**
     * Add XP to user and handle level progression
     */
    static async addXP(
        userId: string, 
        xpReward: XPReward, 
        betAmount: number
    ): Promise<XPCalculationResult> {
        try {
            console.log(`🎯 Adding XP to user ${userId}: ${xpReward.xpGained} XP for ${betAmount} bet`);
            
            // Find or create user XP record
            let userXP = await UserXP.findOne({ userId });
            
            if (!userXP) {
                console.log(`🎯 Creating new XP record for user ${userId}`);
                userXP = new UserXP({
                    userId,
                    currentLevel: 0,
                    currentXP: 0,
                    totalXP: 0,
                    totalWagered: 0,
                    levelProgress: 0,
                    nextLevelXP: this.calculateXPForLevel(1),
                    achievements: {
                        firstBet: false,
                        level5: false,
                        level10: false,
                        level25: false,
                        level50: false,
                        level100: false,
                        bigBettor: false,
                        whale: false
                    },
                    lastLevelUp: null
                });
            } else {
                console.log(`🎯 Found existing XP record for user ${userId}: Level ${userXP.currentLevel}, Total XP: ${userXP.totalXP}`);
            }

            // Update total wagered
            userXP.totalWagered += betAmount;
            console.log(`🎯 Updated total wagered: ${userXP.totalWagered}`);

            // Add XP
            const oldTotalXP = userXP.totalXP;
            userXP.totalXP += xpReward.xpGained;
            console.log(`🎯 XP added: ${oldTotalXP} + ${xpReward.xpGained} = ${userXP.totalXP} total XP`);

            // Calculate new level and progress
            const { level: newLevel, currentLevelXP } = this.calculateLevelFromTotalXP(userXP.totalXP);
            const oldLevel = userXP.currentLevel;
            const leveledUp = newLevel > oldLevel;
            console.log(`🎯 Level calculation: ${oldLevel} -> ${newLevel} (leveled up: ${leveledUp})`);

            // Update user XP record
            userXP.currentLevel = newLevel;
            userXP.currentXP = currentLevelXP;
            userXP.nextLevelXP = this.calculateXPForLevel(newLevel + 1);
            userXP.levelProgress = newLevel > 0 ? 
                (currentLevelXP / this.calculateXPForLevel(newLevel + 1)) * 100 : 0;

            if (leveledUp) {
                userXP.lastLevelUp = new Date();
            }

            // Check achievements after updating totalWagered and XP
            await this.checkAchievements(userXP);

            await userXP.save();
            console.log(`🎯 XP record saved successfully for user ${userId}`);

            return {
                newLevel,
                newXP: currentLevelXP,
                totalXP: userXP.totalXP,
                levelProgress: userXP.levelProgress,
                nextLevelXP: userXP.nextLevelXP,
                leveledUp,
                levelsGained: newLevel - oldLevel
            };

        } catch (error) {
            console.error('Error adding XP:', error);
            throw new Error('Failed to add XP to user');
        }
    }

    /**
     * Check and unlock achievements
     */
    private static async checkAchievements(userXP: IUserXP): Promise<void> {
        const achievements = userXP.achievements;
        let hasNewAchievements = false;
        
        console.log(`🏆 Checking achievements for user ${userXP.userId}: Level ${userXP.currentLevel}, Total Wagered: ${userXP.totalWagered}`);
        console.log(`🏆 Current achievements state:`, achievements);

        // Level-based achievements
        if (userXP.currentLevel >= 5 && !achievements.level5) {
            achievements.level5 = true;
            hasNewAchievements = true;
        }
        if (userXP.currentLevel >= 10 && !achievements.level10) {
            achievements.level10 = true;
            hasNewAchievements = true;
        }
        if (userXP.currentLevel >= 25 && !achievements.level25) {
            achievements.level25 = true;
            hasNewAchievements = true;
        }
        if (userXP.currentLevel >= 50 && !achievements.level50) {
            achievements.level50 = true;
            hasNewAchievements = true;
        }
        if (userXP.currentLevel >= 100 && !achievements.level100) {
            achievements.level100 = true;
            hasNewAchievements = true;
        }

        // Wagering achievements (updated for new XP system)
        if (userXP.totalWagered >= 5000 && !achievements.bigBettor) {
            achievements.bigBettor = true;
            hasNewAchievements = true;
        }
        if (userXP.totalWagered >= 50000 && !achievements.whale) {
            achievements.whale = true;
            hasNewAchievements = true;
        }

        // First bet achievement
        console.log(`🏆 First Bet check: totalWagered=${userXP.totalWagered}, firstBet=${achievements.firstBet}, condition=${userXP.totalWagered > 0 && !achievements.firstBet}`);
        if (userXP.totalWagered > 0 && !achievements.firstBet) {
            console.log(`🏆 Unlocking First Bet achievement for user ${userXP.userId} (totalWagered: ${userXP.totalWagered})`);
            achievements.firstBet = true;
            hasNewAchievements = true;
        }

        if (hasNewAchievements) {
            console.log(`🏆 Saving achievements for user ${userXP.userId}`);
            await userXP.save();
        } else {
            console.log(`🏆 No new achievements for user ${userXP.userId}`);
        }
    }

    /**
     * Get user XP information
     */
    static async getUserXP(userId: string): Promise<IUserXP | null> {
        try {
            return await UserXP.findOne({ userId }).populate('userId', 'username avatar');
        } catch (error) {
            console.error('Error getting user XP:', error);
            return null;
        }
    }

    /**
     * Get leaderboard by level
     */
    static async getLevelLeaderboard(limit: number = 10): Promise<IUserXP[]> {
        try {
            return await UserXP.find()
                .populate('userId', 'username displayName avatar')
                .sort({ currentLevel: -1, totalXP: -1 })
                .limit(limit);
        } catch (error) {
            console.error('Error getting level leaderboard:', error);
            return [];
        }
    }

    /**
     * Get leaderboard by total wagered
     */
    static async getWageringLeaderboard(limit: number = 10): Promise<IUserXP[]> {
        try {
            return await UserXP.find()
                .populate('userId', 'username displayName avatar')
                .sort({ totalWagered: -1 })
                .limit(limit);
        } catch (error) {
            console.error('Error getting wagering leaderboard:', error);
            return [];
        }
    }

    /**
     * Get weekly wagering leaderboard
     */
    static async getWeeklyWageringLeaderboard(limit: number = 10): Promise<any[]> {
        try {
            // Calculate the start of the current week (Monday)
            const now = new Date();
            const startOfWeek = new Date(now);
            const dayOfWeek = now.getDay();
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 0, so 6 days to Monday
            startOfWeek.setDate(now.getDate() - daysToMonday);
            startOfWeek.setHours(0, 0, 0, 0);

            console.log(`📊 Getting weekly wagering leaderboard from ${startOfWeek.toISOString()}`);

            // Import game models
            const Mine = require('../models/Mine').default;
            const CrashGame = require('../models/Crash').CrashGame;
            const RouletteGame = require('../models/Roulette').RouletteGame;
            const Coinflip = require('../models/Coinflip').default;
            const mongoose = require('mongoose');

            // Get weekly wagering data from all games
            const weeklyWagering = await mongoose.connection.db.collection('userxps').aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                {
                    $unwind: '$user'
                },
                {
                    $project: {
                        userId: 1,
                        username: '$user.username',
                        displayName: '$user.displayName',
                        avatar: '$user.avatar',
                        level: '$currentLevel',
                        totalXP: 1,
                        weeklyWagered: 0 // We'll calculate this
                    }
                }
            ]).toArray();

            // Calculate weekly wagering for each user
            for (let userXP of weeklyWagering) {
                let weeklyTotal = 0;

                // Mine games
                const mineGames = await Mine.find({
                    player: userXP.userId,
                    createdAt: { $gte: startOfWeek }
                });
                weeklyTotal += mineGames.reduce((sum: number, game: any) => sum + (game.betAmount || 0), 0);

                // Crash games
                const crashGames = await CrashGame.find({
                    'players.userId': userXP.userId,
                    startTime: { $gte: startOfWeek }
                });
                for (const game of crashGames) {
                    const userBets = game.players.filter((p: any) => p.userId.toString() === userXP.userId.toString());
                    weeklyTotal += userBets.reduce((sum: number, bet: any) => sum + (bet.betAmount || 0), 0);
                }

                // Roulette games
                const rouletteGames = await RouletteGame.find({
                    'players.userId': userXP.userId,
                    bettingStartTime: { $gte: startOfWeek }
                });
                for (const game of rouletteGames) {
                    const userBets = game.players.filter((p: any) => p.userId.toString() === userXP.userId.toString());
                    weeklyTotal += userBets.reduce((sum: number, bet: any) => sum + (bet.betAmount || 0), 0);
                }

                // Coinflip games
                const coinflipGames = await Coinflip.find({
                    $or: [
                        { player1: userXP.userId },
                        { player2: userXP.userId }
                    ],
                    createdAt: { $gte: startOfWeek }
                });
                for (const game of coinflipGames) {
                    if (game.player1.toString() === userXP.userId.toString()) {
                        weeklyTotal += game.amount || 0;
                    }
                    if (game.player2 && game.player2.toString() === userXP.userId.toString()) {
                        weeklyTotal += game.amount || 0;
                    }
                }

                userXP.weeklyWagered = weeklyTotal;
            }

            // Sort by weekly wagered and return top users
            return weeklyWagering
                .filter((user: any) => user.weeklyWagered > 0)
                .sort((a: any, b: any) => b.weeklyWagered - a.weeklyWagered)
                .slice(0, limit)
                .map((user: any) => ({
                    userId: user.userId,
                    username: user.username,
                    displayName: user.displayName || user.username,
                    avatar: user.avatar,
                    level: user.level,
                    totalXP: user.totalXP,
                    totalWagered: user.weeklyWagered // Use weekly wagered as totalWagered for display
                }));

        } catch (error) {
            console.error('Error getting weekly wagering leaderboard:', error);
            return [];
        }
    }

    /**
     * Get XP statistics for a user
     */
    static async getUserXPStats(userId: string): Promise<{
        currentLevel: number;
        currentXP: number;
        totalXP: number;
        levelProgress: number;
        nextLevelXP: number;
        totalWagered: number;
        achievements: any;
        rank: number;
        username: string;
        displayName: string;
        avatar?: string;
    } | null> {
        try {
            const userXP = await this.getUserXP(userId);
            if (!userXP) return null;

            // Get user info for username, displayName, and avatar
            const user = await User.findById(userId);
            const username = user?.username || 'Unknown';
            const displayName = user?.displayName || user?.username || 'Unknown';
            const avatar = user?.avatar || null;

            // Calculate rank
            const higherLevelUsers = await UserXP.countDocuments({
                $or: [
                    { currentLevel: { $gt: userXP.currentLevel } },
                    { 
                        currentLevel: userXP.currentLevel,
                        totalXP: { $gt: userXP.totalXP }
                    }
                ]
            });
            const rank = higherLevelUsers + 1;

            return {
                currentLevel: userXP.currentLevel,
                currentXP: userXP.currentXP,
                totalXP: userXP.totalXP,
                levelProgress: userXP.levelProgress,
                nextLevelXP: userXP.nextLevelXP,
                totalWagered: userXP.totalWagered,
                achievements: userXP.achievements,
                rank,
                username,
                displayName,
                avatar
            };
        } catch (error) {
            console.error('Error getting user XP stats:', error);
            return null;
        }
    }
}

export default XPService;
