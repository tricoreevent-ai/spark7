import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '@shared/types';
import { normalizeRoleName } from '../services/rbac.js';

interface IUserDocument extends Document, Omit<IUser, '_id'> {
  _id: mongoose.Types.ObjectId;
}

const userSchema = new Schema<IUserDocument>(
  {
    tenantId: {
      type: String,
      trim: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      match: [/^\d{10}$/, 'Please provide a valid phone number'],
    },
    role: {
      type: String,
      trim: true,
      lowercase: true,
      default: 'receptionist',
      set: (value: string) => normalizeRoleName(value),
    },
    businessName: String,
    gstin: {
      type: String,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format'],
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'India' },
    },
    uiPreferences: {
      themeMode: {
        type: String,
        enum: ['dark', 'light'],
        default: 'dark',
      },
      fontScale: {
        type: Number,
        default: 1,
        min: 0.9,
        max: 1.25,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: Date,
    deletedBy: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true, tenantUniqueRewrite: false } as any
);

export const User = mongoose.model<IUserDocument>('User', userSchema);
export type { IUserDocument };
