import express from 'express';
import { UserController } from '../controllers/userController';
import { getConnectionStats, getRoomInfo } from '../websocket';
import { authenticateLocalToken } from '../middleware/localAuth';
import { getParam } from '../utils/requestParams';

const router = express.Router();

// Debug WebSocket status (no auth required for debugging)
router.get('/ws-status', (req, res) => {
  const stats = getConnectionStats();
  res.json({
    success: true,
    data: stats
  });
});

// Debug specific room (no auth required for debugging)
router.get('/ws-room/:room', (req, res) => {
  const room = getParam(req, 'room');
  if (!room) {
    return res.status(400).json({ success: false, error: 'Room required' });
  }
  const roomInfo = getRoomInfo(room);
  res.json({
    success: true,
    data: roomInfo
  });
});

// Test broadcast (no auth required for debugging)
router.post('/test-broadcast', (req, res) => {
  const { room, event, data } = req.body;
  
  if (!room || !event) {
    return res.status(400).json({
      success: false,
      error: 'Room and event are required'
    });
  }
  
  try {
    const { broadcastToRoom } = require('../websocket');
    broadcastToRoom(room, event, data || { message: 'Test broadcast' });
    
    res.json({
      success: true,
      message: `Broadcasted ${event} to room ${room}`,
      data: getConnectionStats()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Apply authentication middleware to all other routes
router.use(authenticateLocalToken);

// Get user profile
router.get('/profile', UserController.getProfile);

// Update user profile
router.put('/profile', UserController.updateProfile);

// Get user statistics
router.get('/stats', UserController.getStats);

// Regenerate user seed
router.post('/regenerate-seed', UserController.regenerateSeed);

// Get leaderboard (public route, no auth required)
router.get('/leaderboard', UserController.getLeaderboard);

export default router; 