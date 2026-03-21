import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Mine from '../models/Mine';
import { CrashGame } from '../models/Crash';
import { RouletteGame } from '../models/Roulette';
import Coinflip from '../models/Coinflip';
import User from '../models/User';

interface AuthRequest extends Request {
    user?: any;
}

interface GameHistoryEntry {
    id: string;
    gameType: 'mine' | 'coinflip' | 'crash' | 'roulette';
    gameName: string;
    date: string;
    betAmount: number;
    payoutAmount?: number;
    result: 'win' | 'loss' | 'pending';
    profitLoss: number;
    multiplier?: number;
    description: string;
    gameId: string;
    status: string;
    metadata?: any;
}

interface GameHistoryStats {
    totalGames: number;
    winRate: number;
    netProfit: number;
    totalWagered: number;
    totalWon: number;
    totalLost: number;
}

class GameHistoryController {
    // Get user's game history from all game models
    async getUserGameHistory(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user?._id?.toString();
            console.log('🔍 Request user object:', req.user);
            console.log('🔍 Extracted user ID:', userId);

            if (!userId) {
                res.status(401).json({ error: 'User not authenticated' });
                return;
            }

            const {
                page = 1,
                limit = 20,
                gameType,
                result,
                startDate,
                endDate
            } = req.query;

            const pageNum = Math.max(1, Number(page));
            const limitNum = Math.min(100, Math.max(1, Number(limit)));
            const skip = (pageNum - 1) * limitNum;

            // Build date filters for different game types
            const mineDateFilter: any = {};
            const crashDateFilter: any = {};
            const rouletteDateFilter: any = {};
            const coinflipDateFilter: any = {};

            if (startDate || endDate) {
                const start = startDate ? new Date(startDate as string) : null;
                let end = endDate ? new Date(endDate as string) : null;

                // Validate dates
                if (start && isNaN(start.getTime())) {
                    res.status(400).json({ error: 'Invalid start date format' });
                    return;
                }
                if (end && isNaN(end.getTime())) {
                    res.status(400).json({ error: 'Invalid end date format' });
                    return;
                }

                // Fix end date to include the entire day
                if (end) {
                    // Set end date to end of day (23:59:59.999)
                    end.setHours(23, 59, 59, 999);
                }

                // Mine and Coinflip use createdAt
                if (start || end) {
                    mineDateFilter.createdAt = {};
                    coinflipDateFilter.createdAt = {};
                    if (start) {
                        mineDateFilter.createdAt.$gte = start;
                        coinflipDateFilter.createdAt.$gte = start;
                    }
                    if (end) {
                        mineDateFilter.createdAt.$lte = end;
                        coinflipDateFilter.createdAt.$lte = end;
                    }
                }

                // Crash uses startTime
                if (start || end) {
                    crashDateFilter.startTime = {};
                    if (start) crashDateFilter.startTime.$gte = start;
                    if (end) crashDateFilter.startTime.$lte = end;
                }

                // Roulette uses bettingStartTime
                if (start || end) {
                    rouletteDateFilter.bettingStartTime = {};
                    if (start) rouletteDateFilter.bettingStartTime.$gte = start;
                    if (end) rouletteDateFilter.bettingStartTime.$lte = end;
                }
            }

            const gameHistory: GameHistoryEntry[] = [];

            // Fetch Mine games
            if (!gameType || gameType === 'all' || gameType === 'mine') {
                const mineFilter = {
                    player: new mongoose.Types.ObjectId(userId),
                    ...mineDateFilter,
                    status: { $in: ['win', 'lose'] } // Only completed games
                };

                console.log('🔍 Mine filter:', JSON.stringify(mineFilter, null, 2));
                console.log('🔍 User ID:', userId);

                // First, let's check all mine games to see what's in the database
                const allMineGames = await Mine.find({}).limit(5).lean();
                console.log('🔍 All mine games in DB (first 5):', allMineGames.map(g => ({
                    id: g._id,
                    player: g.player,
                    playerType: typeof g.player,
                    status: g.status,
                    betAmount: g.betAmount
                })));

                // Check if any mine games match our user ID
                const userMineGames = await Mine.find({ player: new mongoose.Types.ObjectId(userId) }).lean();
                console.log('🔍 Mine games for this user ID:', userMineGames.length);

                // Check if any mine games match our user ID as string
                const userMineGamesString = await Mine.find({ player: userId }).lean();
                console.log('🔍 Mine games for this user ID as string:', userMineGamesString.length);

                // Check what statuses exist in mine games
                const statusCounts = await Mine.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ]);
                console.log('🔍 Mine game status counts:', statusCounts);

                const mineGames = await Mine.find(mineFilter)
                    .sort({ createdAt: -1 })
                    .lean();

                console.log('🔍 Found mine games with filter:', mineGames.length);
                if (mineGames.length > 0) {
                    console.log('🔍 First mine game:', JSON.stringify(mineGames[0], null, 2));
                }


                for (const game of mineGames) {
                    const isWin = game.status === 'win';
                    const betAmount = game.betAmount;
                    const payoutAmount = isWin ? game.payout : 0;
                    const profitLoss = payoutAmount - betAmount;
                    console.log('🔍 Game:', game, result);
                    // Apply result filter
                    if (result && result !== 'all') {
                        if (result === 'win' && !isWin) continue;
                        if (result === 'loss' && isWin) continue;
                    }

                    gameHistory.push({
                        id: game._id.toString(),
                        gameType: 'mine',
                        gameName: 'Mine',
                        date: game.createdAt.toISOString(),
                        betAmount,
                        payoutAmount,
                        result: isWin ? 'win' : 'loss',
                        profitLoss,
                        multiplier: game.currentMultiplier,
                        description: `Mine game with ${game.numMines} mines`,
                        gameId: game._id.toString(),
                        status: game.status,
                        metadata: {
                            gridSize: game.gridSize,
                            numMines: game.numMines,
                            revealedTiles: game.revealedTiles
                        }
                    });
                }

                console.log('🔍 MineGame history:', gameHistory);
            }

            // Fetch Crash games
            if (!gameType || gameType === 'all' || gameType === 'crash') {
                const crashFilter = {
                    'playerBets.user': new mongoose.Types.ObjectId(userId),
                    ...crashDateFilter,
                    status: { $in: ['crashed', 'ended'] } // Only completed games
                };

                const crashGames = await CrashGame.find(crashFilter)
                    .sort({ startTime: -1 })
                    .lean();

                for (const game of crashGames) {
                    const userBet = game.playerBets.find((bet: any) =>
                        bet.user.toString() === userId
                    );

                    if (!userBet) continue;

                    const isWin = userBet.status === 'cashed_out';
                    const betAmount = userBet.betAmount;
                    const payoutAmount = userBet.payout || 0;
                    const profitLoss = payoutAmount - betAmount;

                    // Apply result filter
                    if (result && result !== 'all') {
                        if (result === 'win' && !isWin) continue;
                        if (result === 'loss' && isWin) continue;
                    }

                    gameHistory.push({
                        id: game._id.toString(),
                        gameType: 'crash',
                        gameName: 'Crash',
                        date: game.startTime.toISOString(),
                        betAmount,
                        payoutAmount,
                        result: isWin ? 'win' : 'loss',
                        profitLoss,
                        multiplier: userBet.cashoutMultiplier,
                        description: `Crash game - cashed out at ${userBet.cashoutMultiplier || game.crashPoint}x`,
                        gameId: game._id.toString(),
                        status: game.status,
                        metadata: {
                            crashPoint: game.crashPoint,
                            round: game.round
                        }
                    });
                }
            }

            // Fetch Roulette games
            if (!gameType || gameType === 'all' || gameType === 'roulette') {
                const rouletteFilter = {
                    'playerBets.user': new mongoose.Types.ObjectId(userId),
                    ...rouletteDateFilter,
                    status: 'completed'
                };

                const rouletteGames = await RouletteGame.find(rouletteFilter)
                    .sort({ bettingStartTime: -1 })
                    .lean();

                for (const game of rouletteGames) {
                    const userBet = game.playerBets.find((bet: any) =>
                        bet.user.toString() === userId
                    );

                    if (!userBet) continue;

                    const isWin = game.winners?.some((winner: any) =>
                        winner.userId.toString() === userId
                    );
                    const betAmount = userBet.betAmount;
                    const payoutAmount = isWin ?
                        (game.winners?.find((w: any) => w.userId.toString() === userId)?.payout || 0) : 0;
                    const profitLoss = payoutAmount - betAmount;

                    // Apply result filter
                    if (result && result !== 'all') {
                        if (result === 'win' && !isWin) continue;
                        if (result === 'loss' && isWin) continue;
                    }

                    gameHistory.push({
                        id: game._id.toString(),
                        gameType: 'roulette',
                        gameName: 'Roulette',
                        date: game.bettingStartTime.toISOString(),
                        betAmount,
                        payoutAmount,
                        result: isWin ? 'win' : 'loss',
                        profitLoss,
                        multiplier: isWin ? (payoutAmount / betAmount) : undefined,
                        description: `Roulette - bet on ${userBet.betType}`,
                        gameId: game._id.toString(),
                        status: game.status,
                        metadata: {
                            betType: userBet.betType,
                            winningType: game.winningType,
                            winningSlot: game.winningSlot
                        }
                    });
                }
            }

            // Fetch Coinflip games
            if (!gameType || gameType === 'all' || gameType === 'coinflip') {
                const coinflipFilter = {
                    $or: [
                        { creator: new mongoose.Types.ObjectId(userId) },
                        { joiner: new mongoose.Types.ObjectId(userId) }
                    ],
                    ...coinflipDateFilter,
                    status: 'completed'
                };

                const coinflipGames = await Coinflip.find(coinflipFilter)
                    .sort({ createdAt: -1 })
                    .lean();

                for (const game of coinflipGames) {
                    const isCreator = game.creator.toString() === userId;
                    const isWinner = game.winner?.toString() === userId;
                    const betAmount = game.betAmount;
                    const payoutAmount = isWinner ? game.winnerPayout : 0;
                    const profitLoss = payoutAmount - betAmount;

                    // Apply result filter
                    if (result && result !== 'all') {
                        if (result === 'win' && !isWinner) continue;
                        if (result === 'loss' && isWinner) continue;
                    }

                    gameHistory.push({
                        id: game._id.toString(),
                        gameType: 'coinflip',
                        gameName: 'Coinflip',
                        date: game.createdAt.toISOString(),
                        betAmount,
                        payoutAmount,
                        result: isWinner ? 'win' : 'loss',
                        profitLoss,
                        multiplier: isWinner ? 2 : undefined, // Coinflip is 2x for winner
                        description: `Coinflip - ${isCreator ? 'created' : 'joined'} game`,
                        gameId: game._id.toString(),
                        status: game.status,
                        metadata: {
                            coinSide: game.coinSide,
                            winningTicket: game.winningTicket
                        }
                    });
                }
            }

            // Sort all games by date (newest first)
            gameHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            console.log('🔍 Total game history entries:', gameHistory.length);
            console.log('🔍 Game history entries:', gameHistory.map(g => ({ type: g.gameType, date: g.date, result: g.result })));

            // Apply pagination
            const total = gameHistory.length;
            const paginatedHistory = gameHistory.slice(skip, skip + limitNum);
            const totalPages = Math.ceil(total / limitNum);

            res.json({
                success: true,
                data: {
                    transactions: paginatedHistory,
                    total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages
                }
            });
        } catch (error) {
            console.error('Get user game history error:', error);
            res.status(500).json({ error: 'Failed to get game history' });
        }
    }

    // Get user's game history statistics
    async getUserGameHistoryStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user?._id?.toString();
            if (!userId) {
                res.status(401).json({ error: 'User not authenticated' });
                return;
            }

            const { gameType, startDate, endDate } = req.query;

            // Build date filters for different game types
            const mineDateFilter: any = {};
            const crashDateFilter: any = {};
            const rouletteDateFilter: any = {};
            const coinflipDateFilter: any = {};

            if (startDate || endDate) {
                const start = startDate ? new Date(startDate as string) : null;
                let end = endDate ? new Date(endDate as string) : null;

                // Validate dates
                if (start && isNaN(start.getTime())) {
                    res.status(400).json({ error: 'Invalid start date format' });
                    return;
                }
                if (end && isNaN(end.getTime())) {
                    res.status(400).json({ error: 'Invalid end date format' });
                    return;
                }

                // Fix end date to include the entire day
                if (end) {
                    // Set end date to end of day (23:59:59.999)
                    end.setHours(23, 59, 59, 999);
                }

                // Mine and Coinflip use createdAt
                if (start || end) {
                    mineDateFilter.createdAt = {};
                    coinflipDateFilter.createdAt = {};
                    if (start) {
                        mineDateFilter.createdAt.$gte = start;
                        coinflipDateFilter.createdAt.$gte = start;
                    }
                    if (end) {
                        mineDateFilter.createdAt.$lte = end;
                        coinflipDateFilter.createdAt.$lte = end;
                    }
                }

                // Crash uses startTime
                if (start || end) {
                    crashDateFilter.startTime = {};
                    if (start) crashDateFilter.startTime.$gte = start;
                    if (end) crashDateFilter.startTime.$lte = end;
                }

                // Roulette uses bettingStartTime
                if (start || end) {
                    rouletteDateFilter.bettingStartTime = {};
                    if (start) rouletteDateFilter.bettingStartTime.$gte = start;
                    if (end) rouletteDateFilter.bettingStartTime.$lte = end;
                }
            }

            let totalGames = 0;
            let totalWins = 0;
            let totalWagered = 0;
            let totalWon = 0;
            let totalLost = 0;

            // Calculate stats for Mine games
            if (!gameType || gameType === 'all' || gameType === 'mine') {
                const mineFilter = {
                    player: new mongoose.Types.ObjectId(userId),
                    ...mineDateFilter,
                    status: { $in: ['win', 'lose'] }
                };

                const mineGames = await Mine.find(mineFilter).lean();

                for (const game of mineGames) {
                    const isWin = game.status === 'win';
                    const betAmount = game.betAmount;
                    const payoutAmount = isWin ? game.payout : 0;

                    totalGames++;
                    totalWagered += betAmount;

                    if (isWin) {
                        totalWins++;
                        totalWon += payoutAmount;
                    } else {
                        totalLost += betAmount;
                    }
                }
            }

            // Calculate stats for Crash games
            if (!gameType || gameType === 'all' || gameType === 'crash') {
                const crashFilter = {
                    'playerBets.user': new mongoose.Types.ObjectId(userId),
                    ...crashDateFilter,
                    status: { $in: ['crashed', 'ended'] }
                };

                const crashGames = await CrashGame.find(crashFilter).lean();

                for (const game of crashGames) {
                    const userBet = game.playerBets.find((bet: any) =>
                        bet.user.toString() === userId
                    );

                    if (!userBet) continue;

                    const isWin = userBet.status === 'cashed_out';
                    const betAmount = userBet.betAmount;
                    const payoutAmount = userBet.payout || 0;

                    totalGames++;
                    totalWagered += betAmount;

                    if (isWin) {
                        totalWins++;
                        totalWon += payoutAmount;
                    } else {
                        totalLost += betAmount;
                    }
                }
            }

            // Calculate stats for Roulette games
            if (!gameType || gameType === 'all' || gameType === 'roulette') {
                const rouletteFilter = {
                    'playerBets.user': new mongoose.Types.ObjectId(userId),
                    ...rouletteDateFilter,
                    status: 'completed'
                };

                const rouletteGames = await RouletteGame.find(rouletteFilter).lean();

                for (const game of rouletteGames) {
                    const userBet = game.playerBets.find((bet: any) =>
                        bet.user.toString() === userId
                    );

                    if (!userBet) continue;

                    const isWin = game.winners?.some((winner: any) =>
                        winner.userId.toString() === userId
                    );
                    const betAmount = userBet.betAmount;
                    const payoutAmount = isWin ?
                        (game.winners?.find((w: any) => w.userId.toString() === userId)?.payout || 0) : 0;

                    totalGames++;
                    totalWagered += betAmount;

                    if (isWin) {
                        totalWins++;
                        totalWon += payoutAmount;
                    } else {
                        totalLost += betAmount;
                    }
                }
            }

            // Calculate stats for Coinflip games
            if (!gameType || gameType === 'all' || gameType === 'coinflip') {
                const coinflipFilter = {
                    $or: [
                        { creator: new mongoose.Types.ObjectId(userId) },
                        { joiner: new mongoose.Types.ObjectId(userId) }
                    ],
                    ...coinflipDateFilter,
                    status: 'completed'
                };

                const coinflipGames = await Coinflip.find(coinflipFilter).lean();

                for (const game of coinflipGames) {
                    const isWinner = game.winner?.toString() === userId;
                    const betAmount = game.betAmount;
                    const payoutAmount = isWinner ? game.winnerPayout : 0;

                    totalGames++;
                    totalWagered += betAmount;

                    if (isWinner) {
                        totalWins++;
                        totalWon += payoutAmount;
                    } else {
                        totalLost += betAmount;
                    }
                }
            }

            const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
            const netProfit = totalWon - totalLost;

            res.json({
                success: true,
                data: {
                    totalGames,
                    winRate,
                    netProfit,
                    totalWagered,
                    totalWon,
                    totalLost
                }
            });
        } catch (error) {
            console.error('Get user game history stats error:', error);
            res.status(500).json({ error: 'Failed to get game history statistics' });
        }
    }

    // Get daily playing statistics for charts
    async getDailyPlayingStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user?._id?.toString();
            if (!userId) {
                res.status(401).json({ error: 'User not authenticated' });
                return;
            }

            const { days = 30 } = req.query;
            const daysCount = Math.min(Number(days), 365); // Max 1 year
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - daysCount);

            console.log(`🔍 Getting daily playing stats for user ${userId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

            // Get all game history for the user in the date range
            const mineGames = await Mine.find({
                player: new mongoose.Types.ObjectId(userId),
                createdAt: { $gte: startDate, $lte: endDate }
            }).sort({ createdAt: 1 });

            const crashGames = await CrashGame.find({
                'playerBets.user': new mongoose.Types.ObjectId(userId),
                startTime: { $gte: startDate, $lte: endDate }
            }).sort({ startTime: 1 });

            const rouletteGames = await RouletteGame.find({
                'playerBets.user': new mongoose.Types.ObjectId(userId),
                bettingStartTime: { $gte: startDate, $lte: endDate }
            }).sort({ bettingStartTime: 1 });

            const coinflipGames = await Coinflip.find({
                player: new mongoose.Types.ObjectId(userId),
                createdAt: { $gte: startDate, $lte: endDate }
            }).sort({ createdAt: 1 });

            // Group games by date
            const dailyStats: { [key: string]: { date: string; games: number; wagered: number; won: number; profit: number } } = {};

            // Initialize all dates in range with zero values
            for (let i = 0; i < daysCount; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                const dateKey = date.toISOString().split('T')[0];
                dailyStats[dateKey] = {
                    date: dateKey,
                    games: 0,
                    wagered: 0,
                    won: 0,
                    profit: 0
                };
            }

            // Process Mine games
            mineGames.forEach(game => {
                const dateKey = game.createdAt.toISOString().split('T')[0];
                if (dailyStats[dateKey]) {
                    dailyStats[dateKey].games += 1;
                    dailyStats[dateKey].wagered += game.betAmount || 0;
                    
                    if (game.status === 'win') {
                        const winnings = game.payout || 0;
                        dailyStats[dateKey].won += winnings;
                        dailyStats[dateKey].profit += winnings - (game.betAmount || 0);
                    } else if (game.status === 'lose') {
                        dailyStats[dateKey].profit -= game.betAmount || 0;
                    }
                }
            });

            // Process Crash games
            crashGames.forEach(game => {
                const userBet = game.playerBets.find(bet => bet.user.toString() === userId);
                if (userBet) {
                    const dateKey = game.startTime.toISOString().split('T')[0];
                    if (dailyStats[dateKey]) {
                        dailyStats[dateKey].games += 1;
                        dailyStats[dateKey].wagered += userBet.betAmount;
                        
                        if (userBet.status === 'cashed_out') {
                            const winnings = userBet.payout || 0;
                            dailyStats[dateKey].won += winnings;
                            dailyStats[dateKey].profit += winnings - userBet.betAmount;
                        } else if (userBet.status === 'lost') {
                            dailyStats[dateKey].profit -= userBet.betAmount;
                        }
                    }
                }
            });

            // Process Roulette games
            rouletteGames.forEach(game => {
                const userBet = game.playerBets.find(bet => bet.user.toString() === userId);
                if (userBet) {
                    const dateKey = game.bettingStartTime.toISOString().split('T')[0];
                    if (dailyStats[dateKey]) {
                        dailyStats[dateKey].games += 1;
                        dailyStats[dateKey].wagered += userBet.betAmount;
                        
                        // Check if user won (they are in the winners array)
                        const userWin = game.winners?.find(winner => winner.userId.toString() === userId);
                        if (userWin) {
                            dailyStats[dateKey].won += userWin.payout;
                            dailyStats[dateKey].profit += userWin.payout - userBet.betAmount;
                        } else {
                            // User lost
                            dailyStats[dateKey].profit -= userBet.betAmount;
                        }
                    }
                }
            });

            // Process Coinflip games
            coinflipGames.forEach(game => {
                const dateKey = game.createdAt.toISOString().split('T')[0];
                if (dailyStats[dateKey]) {
                    dailyStats[dateKey].games += 1;
                    dailyStats[dateKey].wagered += game.betAmount || 0;
                    
                    if (game.status === 'completed') {
                        // Check if user won (they are the winner)
                        if (game.winner && game.winner.toString() === userId) {
                            const winnings = game.winnerPayout || 0;
                            dailyStats[dateKey].won += winnings;
                            dailyStats[dateKey].profit += winnings - (game.betAmount || 0);
                        } else {
                            // User lost
                            dailyStats[dateKey].profit -= game.betAmount || 0;
                        }
                    } else if (game.status === 'cancelled') {
                        // No profit/loss for cancelled games
                    }
                }
            });

            // Convert to array and sort by date
            const dailyStatsArray = Object.values(dailyStats).sort((a, b) => 
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            // Calculate summary statistics
            const totalGames = dailyStatsArray.reduce((sum, day) => sum + day.games, 0);
            const totalWagered = dailyStatsArray.reduce((sum, day) => sum + day.wagered, 0);
            const totalWon = dailyStatsArray.reduce((sum, day) => sum + day.won, 0);
            const totalProfit = dailyStatsArray.reduce((sum, day) => sum + day.profit, 0);
            const activeDays = dailyStatsArray.filter(day => day.games > 0).length;

            console.log(`🔍 Daily stats calculated: ${totalGames} games, ${totalWagered} wagered, ${totalWon} won, ${totalProfit} profit over ${activeDays} active days`);

            res.json({
                success: true,
                data: {
                    dailyStats: dailyStatsArray,
                    summary: {
                        totalGames,
                        totalWagered,
                        totalWon,
                        totalProfit,
                        activeDays,
                        averageGamesPerDay: activeDays > 0 ? (totalGames / activeDays).toFixed(2) : 0,
                        averageWageredPerDay: activeDays > 0 ? (totalWagered / activeDays).toFixed(2) : 0,
                        winRate: totalGames > 0 ? ((dailyStatsArray.filter(day => day.profit > 0).length / totalGames) * 100).toFixed(1) : 0
                    },
                    period: {
                        startDate: startDate.toISOString().split('T')[0],
                        endDate: endDate.toISOString().split('T')[0],
                        days: daysCount
                    }
                }
            });
        } catch (error) {
            console.error('Get daily playing stats error:', error);
            res.status(500).json({ error: 'Failed to get daily playing statistics' });
        }
    }
}

export default new GameHistoryController();
