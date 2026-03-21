import mongoose, { Document, Schema } from 'mongoose';

export interface IUserXP extends Document {
    userId: mongoose.Types.ObjectId;
    currentLevel: number;
    currentXP: number;
    totalXP: number;
    totalWagered: number;
    levelProgress: number; // Percentage to next level (0-100)
    nextLevelXP: number; // XP required for next level
    achievements: {
        firstBet: boolean;
        level5: boolean;
        level10: boolean;
        level25: boolean;
        level50: boolean;
        level100: boolean;
        bigBettor: boolean; // Wagered 100+ ETH
        whale: boolean; // Wagered 1000+ ETH
        [key: string]: boolean;
    };
    lastLevelUp: Date;
    createdAt: Date;
    updatedAt: Date;
}

const UserXPSchema = new Schema<IUserXP>({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    currentLevel: {
        type: Number,
        default: 0,
        min: 0
    },
    currentXP: {
        type: Number,
        default: 0,
        min: 0
    },
    totalXP: {
        type: Number,
        default: 0,
        min: 0
    },
    totalWagered: {
        type: Number,
        default: 0,
        min: 0
    },
    levelProgress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    nextLevelXP: {
        type: Number,
        default: 100
    },
    achievements: {
        firstBet: { type: Boolean, default: false },
        level5: { type: Boolean, default: false },
        level10: { type: Boolean, default: false },
        level25: { type: Boolean, default: false },
        level50: { type: Boolean, default: false },
        level100: { type: Boolean, default: false },
        bigBettor: { type: Boolean, default: false },
        whale: { type: Boolean, default: false }
    },
    lastLevelUp: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient queries
UserXPSchema.index({ userId: 1 });
UserXPSchema.index({ currentLevel: -1 });
UserXPSchema.index({ totalXP: -1 });

export default mongoose.model<IUserXP>('UserXP', UserXPSchema);
