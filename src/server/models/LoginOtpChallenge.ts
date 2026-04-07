import mongoose, { Document, Schema } from 'mongoose';

export interface ILoginOtpChallengeDocument extends Document {
  tenantId?: string;
  userId: string;
  email: string;
  purpose: 'login';
  otpHash: string;
  otpSalt: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  lastSentAt?: Date;
  consumedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const loginOtpChallengeSchema = new Schema<ILoginOtpChallengeDocument>(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['login'],
      default: 'login',
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
      trim: true,
    },
    otpSalt: {
      type: String,
      required: true,
      trim: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
      min: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    lastSentAt: {
      type: Date,
    },
    consumedAt: {
      type: Date,
      index: true,
    },
  },
  { timestamps: true }
);

export const LoginOtpChallenge = mongoose.model<ILoginOtpChallengeDocument>(
  'LoginOtpChallenge',
  loginOtpChallengeSchema
);
