import { Request, Response } from 'express';
import User, { IUser } from '../models/User';
import { AuthenticatedRequest } from '../middleware/supabaseAuth';
import XPService from '../services/xpService';

export class UserController {
  // Get user profile
  static async getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      // Load XP/Level from XPService (fallback to user doc if missing)
      const userXP = await XPService.getUserXP(req.user._id.toString());

      // Return user profile with calculated fields
      const profile = {
        id: req.user._id,
        supabaseId: req.user.supabaseId,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
        bio: req.user.bio,
        name: req.user.displayName || req.user.username || req.user.email?.split('@')[0],
        avatar: req.user.avatar,
        balance: req.user.balance,
        totalGames: req.user.totalBets,
        totalWins: req.user.totalWins,
        totalLosses: req.user.totalLosses,
        totalWagered: req.user.totalWagered,
        totalWon: req.user.totalWon,
        winRate: req.user.winRate,
        profitLoss: req.user.profitLoss,
        exp: userXP?.totalXP ?? req.user.exp,
        level: userXP?.currentLevel ?? req.user.level,
        isActive: req.user.isActive,
        seed: req.user.seed,
        paymentAccount: req.user.paymentAccount,
        lastLogin: req.user.lastLogin,
        createdAt: req.user.createdAt
      };

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Error getting user profile:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user profile'
      });
    }
  }

  // Update user profile
  static async updateProfile(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      const { username, displayName, email, bio, avatar } = req.body;
      const updateData: any = {};

      // Only allow updating certain fields
      if (username && username !== req.user.username) {
        // Check if username is already taken
        const existingUser = await User.findOne({ username });
        if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
          return res.status(400).json({
            success: false,
            error: 'Username already taken'
          });
        }
        updateData.username = username;
      }

      if (displayName !== undefined && displayName !== req.user.displayName) {
        updateData.displayName = displayName;
      }

      if (email && email !== req.user.email) {
        // Check if email is already taken
        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
          return res.status(400).json({
            success: false,
            error: 'Email already taken'
          });
        }
        updateData.email = email;
      }

      if (bio !== undefined && bio !== req.user.bio) {
        updateData.bio = bio;
      }

      if (avatar) {
        updateData.avatar = avatar;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
      }

      updateData.updatedAt = new Date();

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        updateData,
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          id: updatedUser._id,
          supabaseId: updatedUser.supabaseId,
          username: updatedUser.username,
          displayName: updatedUser.displayName,
          email: updatedUser.email,
          bio: updatedUser.bio,
          name: updatedUser.displayName || updatedUser.username || updatedUser.email?.split('@')[0],
          avatar: updatedUser.avatar,
          balance: updatedUser.balance,
          totalGames: updatedUser.totalBets,
          totalWins: updatedUser.totalWins,
          totalLosses: updatedUser.totalLosses,
          totalWagered: updatedUser.totalWagered,
          totalWon: updatedUser.totalWon,
          winRate: updatedUser.winRate,
          profitLoss: updatedUser.profitLoss,
          exp: updatedUser.exp,
          level: updatedUser.level,
        isActive: updatedUser.isActive,
        isAdmin: updatedUser.isAdmin,
        seed: updatedUser.seed,
        lastLogin: updatedUser.lastLogin,
        createdAt: updatedUser.createdAt
        }
      });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user profile'
      });
    }
  }

  // Get user statistics
  static async getStats(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      const userXP = await XPService.getUserXP(req.user._id.toString());

      const stats = {
        totalGames: req.user.totalBets,
        totalWins: req.user.totalWins,
        totalLosses: req.user.totalLosses,
        totalWagered: req.user.totalWagered,
        totalWon: req.user.totalWon,
        winRate: req.user.winRate,
        profitLoss: req.user.profitLoss,
        exp: userXP?.totalXP ?? req.user.exp,
        level: userXP?.currentLevel ?? req.user.level,
        balance: req.user.balance
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting user stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user statistics'
      });
    }
  }

  // Regenerate user seed
  static async regenerateSeed(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      // Generate new seed using the user model method
      const newSeed = (req.user as any).generateSeed();
      await req.user.save();

      res.json({
        success: true,
        data: {
          seed: newSeed,
          message: req.user.seed ? 'Seed regenerated successfully' : 'Seed generated successfully'
        }
      });
    } catch (error) {
      console.error('Error regenerating seed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to regenerate seed'
      });
    }
  }

  // Get leaderboard
  static async getLeaderboard(req: Request, res: Response) {
    try {
      const { type = 'balance', limit = 10 } = req.query;

      let sortField = 'balance';
      let sortOrder = -1; // Descending

      switch (type) {
        case 'balance':
          sortField = 'balance';
          break;
        case 'wins':
          sortField = 'totalWins';
          break;
        case 'wagered':
          sortField = 'totalWagered';
          break;
        case 'profit':
          sortField = 'totalWon';
          break;
        case 'level':
          sortField = 'level';
          break;
        default:
          sortField = 'balance';
      }

      const leaderboard = await User.find({ isActive: true })
        .select('username avatar balance totalWins totalWagered totalWon level exp')
        .sort({ [sortField]: sortOrder as any })
        .limit(parseInt(limit as string))
        .lean();

      const formattedLeaderboard = leaderboard.map((user, index) => ({
        rank: index + 1,
        username: user.username || user.email?.split('@')[0] || 'Anonymous',
        avatar: user.avatar,
        balance: user.balance,
        totalWins: user.totalWins,
        totalWagered: user.totalWagered,
        totalWon: user.totalWon,
        level: user.level,
        exp: user.exp
      }));

      res.json({
        success: true,
        data: {
          type,
          leaderboard: formattedLeaderboard
        }
      });
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get leaderboard'
      });
    }
  }
} 