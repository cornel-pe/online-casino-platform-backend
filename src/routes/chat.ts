import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateLocalToken, optionalLocalAuth } from '../middleware/localAuth';
import chatController from '../controllers/chatController';

const router = Router();

type ValidationRequest = Request & { user?: any };
const validateRequest = (req: ValidationRequest, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get chat messages (read-only)
router.get('/messages', optionalLocalAuth, (req: Request, res: Response) => chatController.getMessages(req, res));

// Get chat statistics (read-only)
router.get('/stats', authenticateLocalToken, (req: Request, res: Response) => chatController.getChatStatistics(req, res));

// Get online users (read-only)
router.get('/online', optionalLocalAuth, (req: Request, res: Response) => chatController.getOnlineUsers(req, res));

// Get user's chat history (read-only)
router.get('/history', authenticateLocalToken, (req: Request, res: Response) => chatController.getUserChatHistory(req, res));

// Search messages (read-only)
router.get('/search', optionalLocalAuth, (req: Request, res: Response) => chatController.searchMessages(req, res));

// Delete a message (own message or admin)
router.delete('/:messageId', authenticateLocalToken, (req: Request, res: Response) => chatController.deleteMessage(req, res));

export default router; 