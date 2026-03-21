import express, { Request, Response } from 'express';
import cronService from '../services/cronService';
import { authenticateLocalToken, LocalAuthRequest } from '../middleware/localAuth';
import { getConnectionStats } from '../websocket';
import { getParam } from '../utils/requestParams';
import { log } from '../utils/logger';

const router = express.Router();

// Public WebSocket status endpoint (for testing)
router.get('/ws-status-public', async (req: Request, res: Response) => {
  try {
    const basicStats = getConnectionStats();
    
    res.json({
      success: true,
      data: {
        ...basicStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    log.error('Error getting WebSocket status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get WebSocket status'
    });
  }
});

// Protected WebSocket status endpoint (requires authentication)
router.get('/ws-status', authenticateLocalToken, async (req: LocalAuthRequest, res: Response) => {
  try {
    const basicStats = getConnectionStats();
    
    res.json({
      success: true,
      data: {
        ...basicStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    log.error('Error getting WebSocket status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get WebSocket status'
    });
  }
});

// Get cron job status (admin only)
router.get('/status', authenticateLocalToken, async (req: LocalAuthRequest, res: Response) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = cronService.getJobStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Error getting cron status:', error);
    res.status(500).json({ error: 'Failed to get cron status' });
  }
});

// Manually trigger chat cleanup (admin only)
router.post('/trigger-chat-cleanup', authenticateLocalToken, async (req: LocalAuthRequest, res: Response) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const deletedCount = await cronService.triggerChatCleanup();
    res.json({
      success: true,
      data: {
        deletedCount,
        message: `Successfully deleted ${deletedCount} old chat messages`
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Error triggering chat cleanup:', error);
    res.status(500).json({ error: 'Failed to trigger chat cleanup' });
  }
});

// Stop a specific cron job (admin only)
router.post('/stop/:jobName', authenticateLocalToken, async (req: LocalAuthRequest, res: Response) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const jobName = getParam(req, 'jobName');
    if (!jobName) {
      return res.status(400).json({ error: 'Job name required' });
    }
    cronService.stopJob(jobName);
    
    res.json({
      success: true,
      data: {
        message: `Job ${jobName} stopped successfully`
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Error stopping cron job:', error);
    res.status(500).json({ error: 'Failed to stop cron job' });
  }
});

// Start a specific cron job (admin only)
router.post('/start/:jobName', authenticateLocalToken, async (req: LocalAuthRequest, res: Response) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const jobName = getParam(req, 'jobName');
    if (!jobName) {
      return res.status(400).json({ error: 'Job name required' });
    }
    cronService.startJob(jobName);
    
    res.json({
      success: true,
      data: {
        message: `Job ${jobName} started successfully`
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Error starting cron job:', error);
    res.status(500).json({ error: 'Failed to start cron job' });
  }
});

// Stop all cron jobs (admin only)
router.post('/stop-all', authenticateLocalToken, async (req: LocalAuthRequest, res: Response) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    cronService.stopAll();
    
    res.json({
      success: true,
      data: {
        message: 'All cron jobs stopped successfully'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Error stopping all cron jobs:', error);
    res.status(500).json({ error: 'Failed to stop all cron jobs' });
  }
});

export default router;
