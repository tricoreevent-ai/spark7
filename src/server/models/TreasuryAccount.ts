import mongoose, { Document, Schema } from 'mongoose';

export type TreasuryAccountType = 'bank' | 'cash_float';

export interface ITreasuryAccount extends Document {
  accountType: TreasuryAccountType;
  accountName: string;
  displayName: string;
  chartAccountId?: mongoose.Types.ObjectId;
  chartAccountCode?: string;
  bankName?: string;
  accountNumberMasked?: string;
  accountNumberLast4?: string;
  branchName?: string;
  ifscCode?: string;
  walletProvider?: string;
  processorName?: string;
  isPrimary: boolean;
  isActive: boolean;
  openingBalance: number;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TreasuryAccountSchema = new Schema<ITreasuryAccount>(
  {
    accountType: {
      type: String,
      enum: ['bank', 'cash_float'],
      required: true,
      index: true,
    },
    accountName: { type: String, required: true, trim: true, index: true },
    displayName: { type: String, required: true, trim: true, index: true },
    chartAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      index: true,
    },
    chartAccountCode: { type: String, trim: true, uppercase: true, index: true },
    bankName: { type: String, trim: true },
    accountNumberMasked: { type: String, trim: true },
    accountNumberLast4: { type: String, trim: true, minlength: 4, maxlength: 4 },
    branchName: { type: String, trim: true },
    ifscCode: { type: String, trim: true, uppercase: true },
    walletProvider: { type: String, trim: true },
    processorName: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    openingBalance: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

TreasuryAccountSchema.index(
  { tenantId: 1, accountType: 1, isPrimary: 1 },
  {
    unique: true,
    partialFilterExpression: { isPrimary: true },
  }
);
TreasuryAccountSchema.index({ tenantId: 1, displayName: 1 }, { unique: true });

export const TreasuryAccount = mongoose.model<ITreasuryAccount>('TreasuryAccount', TreasuryAccountSchema);
