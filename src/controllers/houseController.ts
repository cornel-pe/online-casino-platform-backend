import { Request, Response } from 'express';
import houseService from '../services/houseService';
import { isAdminById } from '../utils/adminUtils';
import User, { IUser } from '../models/User';

interface AuthRequest extends Request {
  user?: IUser;
}

class HouseController {
  // Get house statistics (admin only)
  async getHouseStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user is admin
      const isAdmin = await isAdminById(userId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const result = await houseService.getHouseStats();
      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      console.error('Get house stats error:', error);
      res.status(500).json({ error: 'Failed to get house statistics' });
    }
  }

  // Get house transaction history (admin only)
  async getHouseTransactionHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user is admin
      const isAdmin = await isAdminById(userId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const {
        page = 1,
        limit = 50,
        type,
        gameType,
        startDate,
        endDate
      } = req.query;

      const options = {
        page: Number(page),
        limit: Number(limit),
        type: type as string,
        gameType: gameType as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      };

      const result = await houseService.getHouseTransactionHistory(options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get house transaction history error:', error);
      res.status(500).json({ error: 'Failed to get house transaction history' });
    }
  }

  // Adjust treasury balance (admin only)
  async adjustTreasury(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user is admin
      const isAdmin = await isAdminById(userId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const { amount, reason } = req.body;
      if (amount === undefined || !reason) {
        res.status(400).json({ error: 'Amount and reason are required' });
        return;
      }

      const result = await houseService.adjustTreasury(Number(amount), reason, userId);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        data: {
          house: result.house,
          transaction: result.transaction,
          message: `Treasury adjusted by ${amount}: ${reason}`
        }
      });
    } catch (error) {
      console.error('Adjust treasury error:', error);
      res.status(500).json({ error: 'Failed to adjust treasury' });
    }
  }

  // Get house balance (public endpoint - for transparency)
  async getHouseBalance(req: Request, res: Response): Promise<void> {
    try {
      const result = await houseService.getHouseStats();
      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Only return basic balance info for public
      res.json({
        success: true,
        data: {
          treasuryBalance: result.data?.treasuryBalance,
          isActive: result.data?.isActive,
          maintenanceMode: result.data?.maintenanceMode
        }
      });
    } catch (error) {
      console.error('Get house balance error:', error);
      res.status(500).json({ error: 'Failed to get house balance' });
    }
  }
}

export default new HouseController();
