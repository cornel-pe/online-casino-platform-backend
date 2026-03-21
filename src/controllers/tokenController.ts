import { Request, Response } from 'express';
import Token from '../models/Token';
import { getParam } from '../utils/requestParams';

export class TokenController {
  // Get all active tokens
  static async getAllTokens(req: Request, res: Response) {
    try {
      const tokens = await Token.find({ isActive: true }).select('name symbol price updatedAt');
      res.json(tokens);
    } catch (error) {
      console.error('Error getting tokens:', error);
      res.status(500).json({ error: 'Failed to get tokens' });
    }
  }

  // Get token by ID
  static async getTokenById(req: Request, res: Response) {
    try {
      const tokenId = getParam(req, 'tokenId');
      if (!tokenId) {
        return res.status(400).json({ error: 'Token ID required' });
      }
      const token = await Token.findById(tokenId);
      
      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }
      
      res.json(token);
    } catch (error) {
      console.error('Error getting token:', error);
      res.status(500).json({ error: 'Failed to get token' });
    }
  }

  // Update token price (for admin or price update service)
  static async updateTokenPrice(req: Request, res: Response) {
    try {
      const tokenId = getParam(req, 'tokenId');
      if (!tokenId) {
        return res.status(400).json({ error: 'Token ID required' });
      }
      const { price } = req.body;

      if (!price || price < 0) {
        return res.status(400).json({ error: 'Invalid price' });
      }

      const token = await Token.findByIdAndUpdate(
        tokenId,
        { price, updatedAt: new Date() },
        { new: true }
      );

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json(token);
    } catch (error) {
      console.error('Error updating token price:', error);
      res.status(500).json({ error: 'Failed to update token price' });
    }
  }

  // Create new token (admin only)
  static async createToken(req: Request, res: Response) {
    try {
      const { name, symbol, price } = req.body;

      if (!name || !symbol || price === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if token already exists
      const existingToken = await Token.findOne({ 
        $or: [{ name }, { symbol }] 
      });

      if (existingToken) {
        return res.status(400).json({ error: 'Token already exists' });
      }

      const token = new Token({
        name,
        symbol,
        price,
        isActive: true,
      });

      await token.save();
      res.status(201).json(token);
    } catch (error) {
      console.error('Error creating token:', error);
      res.status(500).json({ error: 'Failed to create token' });
    }
  }

  // Update token status (admin only)
  static async updateTokenStatus(req: Request, res: Response) {
    try {
      const tokenId = getParam(req, 'tokenId');
      if (!tokenId) {
        return res.status(400).json({ error: 'Token ID required' });
      }
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const token = await Token.findByIdAndUpdate(
        tokenId,
        { isActive, updatedAt: new Date() },
        { new: true }
      );

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json(token);
    } catch (error) {
      console.error('Error updating token status:', error);
      res.status(500).json({ error: 'Failed to update token status' });
    }
  }
}
