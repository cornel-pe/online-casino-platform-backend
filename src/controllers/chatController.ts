import { Request, Response } from 'express';
import Chat, { IChat } from '../models/Chat';
import User, { IUser } from '../models/User';
import cronService from '../services/cronService';
import { getParam } from '../utils/requestParams';

interface AuthRequest extends Request {
  user?: IUser;
}

class ChatController {
  // Get chat messages (read-only)
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 50, room = 'default' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      // Build query
      const query: any = { 
        isDeleted: false,
        room: room
      };

      // Get messages with pagination
      const messages = await Chat.find(query)
        .populate('userId', 'username email avatar level displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      // Get total count
      const totalMessages = await Chat.countDocuments(query);

      res.json({
        messages: messages.reverse(), // Return in chronological order
        totalMessages,
        totalPages: Math.ceil(totalMessages / Number(limit)),
        currentPage: Number(page)
      });
    } catch (error) {
      console.error('Get chat messages error:', error);
      res.status(500).json({ error: 'Failed to get chat messages' });
    }
  }

  // Delete a message (own message or admin)
  async deleteMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const messageId = getParam(req, 'messageId');
      if (!messageId) {
        res.status(400).json({ error: 'Message ID required' });
        return;
      }
      const chatMessage = await Chat.findById(messageId);

      if (!chatMessage) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Check if user can delete this message
      const userId = typeof req.user?._id === 'string' ? req.user._id : req.user?._id?.toString?.();
      const canDelete =
        chatMessage.userId?.toString() === userId ||
        Boolean(req.user && typeof req.user === 'object' && 'isAdmin' in req.user && (req.user as any).isAdmin);

      if (!canDelete) {
        res.status(403).json({ error: 'Not authorized to delete this message' });
        return;
      }

      // Soft delete
      chatMessage.isDeleted = true;
      chatMessage.deletedAt = new Date();
      await chatMessage.save();

      res.json({ message: 'Message deleted successfully' });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }

  // Get chat statistics (read-only)
  async getChatStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { room = 'default' } = req.query;
      const query: any = { 
        isDeleted: false,
        room: room
      };

      // Get total messages
      const totalMessages = await Chat.countDocuments(query);

      // Get messages by type
      const messagesByType = await Chat.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get recent activity
      const recentMessages = await Chat.find(query)
        .populate('userId', 'username email avatar level displayName')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // Get retention info (messages older than 3 days)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const oldMessages = await Chat.countDocuments({
        ...query,
        createdAt: { $lt: threeDaysAgo }
      });

      // Get cron job status for chat cleanup
      const cronStatus = cronService.getJobStatus();
      const chatCleanupJob = cronStatus['chat-cleanup'];

      res.json({
        totalMessages,
        messagesByType,
        recentMessages,
        retentionInfo: {
          messagesOlderThan3Days: oldMessages,
          retentionPolicy: '3 days',
          nextCleanup: chatCleanupJob?.nextRun || 'Daily at 2:00 AM UTC',
          cronJobStatus: chatCleanupJob?.running ? 'Running' : 'Stopped',
          lastCleanup: chatCleanupJob?.lastRun || 'Never'
        }
      });
    } catch (error) {
      console.error('Get chat stats error:', error);
      res.status(500).json({ error: 'Failed to get chat statistics' });
    }
  }

  // Get online users (read-only)
  async getOnlineUsers(req: Request, res: Response): Promise<void> {
    try {
      // Get users active in the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const onlineUsers = await User.find({
        lastActivity: { $gte: fiveMinutesAgo },
        isActive: true
      })
      .select('username avatar')
      .limit(50)
      .lean();

      res.json({
        onlineUsers,
        count: onlineUsers.length
      });
    } catch (error) {
      console.error('Get online users error:', error);
      res.status(500).json({ error: 'Failed to get online users' });
    }
  }

  // Get user's chat history (read-only)
  async getUserChatHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, room = 'default' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const messages = await Chat.find({
        userId: req.user?._id,
        room: room,
        isDeleted: false
      })
      .populate('userId', 'username email avatar level displayName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

      const totalMessages = await Chat.countDocuments({
        userId: req.user?._id,
        room: room,
        isDeleted: false
      });

      res.json({
        messages,
        totalMessages,
        totalPages: Math.ceil(totalMessages / Number(limit)),
        currentPage: Number(page)
      });
    } catch (error) {
      console.error('Get user chat history error:', error);
      res.status(500).json({ error: 'Failed to get chat history' });
    }
  }

  // Search messages (read-only)
  async searchMessages(req: Request, res: Response): Promise<void> {
    try {
      const { q, page = 1, limit = 20, room = 'default' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      if (!q) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const query: any = {
        isDeleted: false,
        room: room,
        message: { $regex: q, $options: 'i' }
      };

      const messages = await Chat.find(query)
        .populate('userId', 'username email avatar level displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const totalMessages = await Chat.countDocuments(query);

      res.json({
        messages,
        totalMessages,
        totalPages: Math.ceil(totalMessages / Number(limit)),
        currentPage: Number(page)
      });
    } catch (error) {
      console.error('Search messages error:', error);
      res.status(500).json({ error: 'Failed to search messages' });
    }
  }
}

export default new ChatController(); 