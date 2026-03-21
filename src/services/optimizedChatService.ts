import Chat from "../models/Chat";
import User from "../models/User";
import mongoose from "mongoose";

// In-memory message queue for immediate response
interface QueuedMessage {
  id: string;
  userId: string;
  message: string;
  type: string;
  room: string;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
}

class OptimizedChatService {
  private messageQueue: QueuedMessage[] = [];
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private failedMessages: QueuedMessage[] = [];

  constructor() {
    this.startMessageProcessor();
  }

  // Immediate response version - no database blocking
  static async saveMessageImmediate(token: any, message: string, room: string = 'default') {
    const startTime = Date.now();
    console.log('🚀 Starting immediate chat response', token, message, room);
    try {
      let user = null;
      if (token) {
        // Handle both platform token users (by _id) and Supabase users (by supabaseId)
        if (token.userId) {
          user = await User.findById(token.userId).lean();
        } else {
          user = await User.findOne({ supabaseId: token?.userId }).lean();
        }
        
        if (user) {
          // Create message object for immediate response
          const messageId = new mongoose.Types.ObjectId().toString();
          const chatMessage = {
            _id: messageId,
            userId: {
              _id: user._id,
              username: user.username,
              email: user.email,
              avatar: user.avatar,
              level: user.level
            },
            message: message,
            type: 'text',
            room: room,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Queue message for async database save
          const queuedMessage: QueuedMessage = {
            id: messageId,
            userId: user._id.toString(),
            message: message,
            type: 'text',
            room: room,
            timestamp: new Date(),
            retryCount: 0,
            maxRetries: 3
          };

          // Add to queue for background processing
          this.getInstance().addToQueue(queuedMessage);

          const responseTime = Date.now() - startTime;
          console.log(`⚡ Immediate chat response: ${responseTime}ms`);
          
          return { 
            type: 'chat', 
            data: chatMessage,
            responseTime: responseTime
          };
        } else {
          console.log("User not found for token:", token);
          return { type: 'error', data: { message: 'User not found' } };
        }
      } else {
        console.log("No token provided for chat message");
        return { type: 'error', data: { message: 'Authentication required' } };
      }
    } catch (error) {
      console.error('Error handling chat message:', error);
      return { type: 'error', data: { message: 'Failed to process message' } };
    }
  }

  // Original blocking version for comparison
  static async saveMessageBlocking(token: any, message: string, room: string = 'default') {
    const startTime = Date.now();
    
    try {
      let user = null;
      if (token) {
        // Handle both platform token users (by _id) and Supabase users (by supabaseId)
        if (token.userId) {
          user = await User.findById(token.userId);
        } else {
          user = await User.findOne({ supabaseId: token?.userId });
        }

        if (user) {
          const chat = new Chat({
            userId: user._id,
            message: message,
            type: 'text',
            room: room
          });
          
          // Blocking save - wait for database
          await chat.save();
          
          // Blocking populate - wait for database
          const populatedChat = await chat.populate('userId', 'username email avatar level');
          
          const responseTime = Date.now() - startTime;
          console.log(`🐌 Blocking chat response: ${responseTime}ms`);
          
          return { type: 'chat', data: populatedChat, responseTime: responseTime };
        } else {
          console.log("User not found for token:", token);
          return { type: 'error', data: { message: 'User not found' } };
        }
      } else {
        console.log("No token provided for chat message");
        return { type: 'error', data: { message: 'Authentication required' } };
      }
    } catch (error) {
      console.error('Error handling chat message:', error);
      return { type: 'error', data: { message: 'Failed to process message' } };
    }
  }

  // Singleton instance for queue management
  private static instance: OptimizedChatService;
  private static getInstance(): OptimizedChatService {
    if (!OptimizedChatService.instance) {
      OptimizedChatService.instance = new OptimizedChatService();
    }
    return OptimizedChatService.instance;
  }

  // Add message to processing queue
  private addToQueue(message: QueuedMessage): void {
    this.messageQueue.push(message);
    console.log(`📝 Message queued for async save: ${message.id}`);
  }

  // Start background message processor
  private startMessageProcessor(): void {
    if (this.processingInterval) return;
    
    this.processingInterval = setInterval(() => {
      this.processMessageQueue();
    }, 100); // Process every 100ms
  }

  // Process queued messages
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Process up to 10 messages at once
      const batchSize = Math.min(10, this.messageQueue.length);
      const batch = this.messageQueue.splice(0, batchSize);
      
      // Process batch in parallel
      const promises = batch.map(message => this.saveMessageToDatabase(message));
      await Promise.allSettled(promises);
      
    } catch (error) {
      console.error('Error processing message queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Save individual message to database
  private async saveMessageToDatabase(queuedMessage: QueuedMessage): Promise<void> {
    try {
      const chat = new Chat({
        _id: queuedMessage.id,
        userId: queuedMessage.userId,
        message: queuedMessage.message,
        type: queuedMessage.type,
        room: queuedMessage.room,
        createdAt: queuedMessage.timestamp
      });
      
      await chat.save();
      console.log(`✅ Message saved to database: ${queuedMessage.id}`);
      
    } catch (error) {
      console.error(`❌ Failed to save message ${queuedMessage.id}:`, error);
      
      // Retry logic
      queuedMessage.retryCount++;
      if (queuedMessage.retryCount < queuedMessage.maxRetries) {
        console.log(`🔄 Retrying message ${queuedMessage.id} (attempt ${queuedMessage.retryCount})`);
        // Add back to queue with delay
        setTimeout(() => {
          this.addToQueue(queuedMessage);
        }, 1000 * queuedMessage.retryCount); // Exponential backoff
      } else {
        console.error(`💥 Message ${queuedMessage.id} failed permanently after ${queuedMessage.maxRetries} attempts`);
        this.failedMessages.push(queuedMessage);
      }
    }
  }

  // Get queue statistics
  static getQueueStats() {
    const instance = OptimizedChatService.getInstance();
    return {
      queuedMessages: instance.messageQueue.length,
      failedMessages: instance.failedMessages.length,
      isProcessing: instance.isProcessing
    };
  }

  // Get chat history (unchanged)
  static async getChatHistory(room: string = 'default', limit: number = 50) {
    try {
      const messages = await Chat.find({
        room: room,
        isDeleted: false
      })
      .populate('userId', 'username email avatar level')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }
  }

  // Clean up old messages (unchanged)
  static async cleanupOldMessages() {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const result = await Chat.deleteMany({
        createdAt: { $lt: threeDaysAgo },
        isDeleted: false
      });

      console.log(`Cleaned up ${result.deletedCount} old chat messages`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up old messages:', error);
      return 0;
    }
  }

  // Graceful shutdown
  static async shutdown(): Promise<void> {
    const instance = OptimizedChatService.getInstance();
    if (instance.processingInterval) {
      clearInterval(instance.processingInterval);
    }
    
    // Wait for remaining messages to be processed
    while (instance.messageQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('OptimizedChatService shutdown complete');
  }
}

export default OptimizedChatService;
