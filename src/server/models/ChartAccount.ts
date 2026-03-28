import mongoose, { Document, Schema } from 'mongoose';

export type AccountType = 'asset' | 'liability' | 'income' | 'expense';
export type AccountSubType = 'cash' | 'bank' | 'customer' | 'supplier' | 'stock' | 'general';
export type BalanceSide = 'debit' | 'credit';

export interface IChartAccount extends Document {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subType: AccountSubType;
  openingBalance: number;
  openingSide: BalanceSide;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ChartAccountSchema = new Schema<IChartAccount>(
  {
    accountCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    accountName: { type: String, required: true, trim: true, index: true },
    accountType: {
      type: String,
      enum: ['asset', 'liability', 'income', 'expense'],
      required: true,
      index: true,
    },
    subType: {
      type: String,
      enum: ['cash', 'bank', 'customer', 'supplier', 'stock', 'general'],
      default: 'general',
      index: true,
    },
    openingBalance: { type: Number, default: 0, min: 0 },
    openingSide: {
      type: String,
      enum: ['debit', 'credit'],
      default: 'debit',
    },
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

// accountCode must be unique only within a tenant, not globally.
ChartAccountSchema.index({ tenantId: 1, accountCode: 1 }, { unique: true });
ChartAccountSchema.index({ accountType: 1, subType: 1, isActive: 1 });

export const ChartAccount = mongoose.model<IChartAccount>('ChartAccount', ChartAccountSchema);
