import mongoose, { Document, Schema } from 'mongoose';

// Interface for Chat document
export interface IChat extends Document {
  userId?: mongoose.Types.ObjectId;
  message: string;
  type: string;
  room?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  // Anonymous user fields
  isAnonymous?: boolean;
  anonymousUsername?: string;
  anonymousId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<IChat>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false // Allow null for system messages
  },
  
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  
  type: {
    type: String,
    enum: ['text', 'system', 'join', 'leave'],
    default: 'text'
  },
  
  room: {
    type: String,
    default: 'default',
    required: false
  },
  
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  deletedAt: {
    type: Date,
    default: null
  },
  
  // Anonymous user fields
  isAnonymous: {
    type: Boolean,
    default: false
  },
  
  anonymousUsername: {
    type: String,
    required: false
  },
  
  anonymousId: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for better query performance
chatSchema.index({ userId: 1 });
chatSchema.index({ room: 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ createdAt: -1 });
chatSchema.index({ isDeleted: 1 });

// Prevent model re-registration (and duplicate index warnings) in dev/watch mode.
const Chat = (mongoose.models.Chat as mongoose.Model<IChat>) || mongoose.model<IChat>('Chat', chatSchema);

export default Chat;