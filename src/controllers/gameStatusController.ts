import { Request, Response } from 'express';
import { getPlayerCounts } from '../websocket/gameStatusEventHandlers';
import { getParam } from '../utils/requestParams';

interface AuthRequest extends Request {
  user?: any;
}

interface GameStatus {
  gameType: string;
  activePlayers: number;
  status: string;
  lastUpdated: string;
}

class GameStatusController {
  // Get active player counts for all games
  async getActivePlayerCounts(req: AuthRequest, res: Response): Promise<void> {
    try {
      console.log('🔍 Getting active player counts from WebSocket data...');
      
      // Get real-time player counts from WebSocket tracking
      const playerCounts = getPlayerCounts();
      
      res.json({
        success: true,
        data: playerCounts
      });
    } catch (error) {
      console.error('Get active player counts error:', error);
      res.status(500).json({ error: 'Failed to get active player counts' });
    }
  }

  // Get active player count for a specific game type
  async getGamePlayerCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const gameType = getParam(req, 'gameType');
      if (!gameType) {
        res.status(400).json({ error: 'Game type required' });
        return;
      }
      
      // Get real-time player counts from WebSocket tracking
      const playerCounts = getPlayerCounts();
      const gameStatus = playerCounts.gameStatuses.find(game => game.gameType === gameType);
      
      if (!gameStatus) {
        res.status(400).json({ error: 'Invalid game type' });
        return;
      }

      res.json({
        success: true,
        data: {
          gameType,
          activePlayers: gameStatus.activePlayers,
          status: gameStatus.status,
          lastUpdated: gameStatus.lastUpdated
        }
      });
    } catch (error) {
      console.error('Get game player count error:', error);
      res.status(500).json({ error: 'Failed to get game player count' });
    }
  }
}

export default new GameStatusController();
