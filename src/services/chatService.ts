import Chat from "../models/Chat";
import User from "../models/User";
import mongoose from "mongoose";

export class ChatService {
  static async saveMessage(token: any, message: string, room: string = 'default') {
    try {
      let user = null;
      if (token) {
        user = await User.findOne({ supabaseId: token?.user.id })

        if (user) {
          const chat = new Chat({
            userId: user._id,
            message: message,
            type: 'text',
            room: room
          });
          
          // Save message asynchronously without waiting
          chat.save().then(() => {
            console.log('Chat message saved to database:', chat._id);
          }).catch((error) => {
            console.error('Error saving chat message:', error);
          });
          
          const populatedChat = await chat.populate('userId', 'username email avatar level');
          return { type: 'chat', data: populatedChat };
        }
        else {
          console.log("User not found for token:", token);
          return { type: 'error', data: { message: 'User not found' } };
        }
      }
      else {
        console.log("No token provided for chat message");
        return { type: 'error', data: { message: 'Authentication required' } };
      }
    } catch (error) {
      console.error('Error handling chat message:', error);
      return { type: 'error', data: { message: 'Failed to process message' } };
    }
  }

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

  // Clean up old messages (older than 3 days)
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
}