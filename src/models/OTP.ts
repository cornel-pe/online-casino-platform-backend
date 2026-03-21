import mongoose, { Document, Schema } from 'mongoose';

export interface IOTP extends Document {
  email: string;
  code: string;
  expiresAt: Date;
  verified: boolean;
  attempts: number;
  createdAt: Date;
}

const OTPSchema = new Schema<IOTP>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // Auto-delete after expiry
  },
  verified: {
    type: Boolean,
    default: false,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for faster lookups
OTPSchema.index({ email: 1, code: 1 });
OTPSchema.index({ email: 1, verified: 1 });

// Auto-delete verified OTPs after 10 minutes
OTPSchema.index({ createdAt: 1 }, { 
  expireAfterSeconds: 600,
  partialFilterExpression: { verified: true }
});

export default mongoose.model<IOTP>('OTP', OTPSchema);


