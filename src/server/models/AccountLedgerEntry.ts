import mongoose, { Document, Schema } from 'mongoose';

export type LedgerVoucherType =
  | 'opening'
  | 'expense'
  | 'income'
  | 'salary'
  | 'contract'
  | 'receipt'
  | 'payment'
  | 'journal'
  | 'transfer'
  | 'adjustment';

export interface IAccountLedgerEntry extends Document {
  accountId: mongoose.Types.ObjectId;
  relatedAccountId?: mongoose.Types.ObjectId;
  entryDate: Date;
  voucherType: LedgerVoucherType;
  voucherNumber?: string;
  referenceNo?: string;
  narration?: string;
  paymentMode?: 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer' | 'adjustment';
  debit: number;
  credit: number;
  runningBalance: number;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
  isReconciled: boolean;
  reconciledAt?: Date;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const AccountLedgerEntrySchema = new Schema<IAccountLedgerEntry>(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      required: true,
      index: true,
    },
    relatedAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      index: true,
    },
    entryDate: { type: Date, required: true, default: Date.now, index: true },
    voucherType: {
      type: String,
      enum: ['opening', 'expense', 'income', 'salary', 'contract', 'receipt', 'payment', 'journal', 'transfer', 'adjustment'],
      required: true,
      index: true,
    },
    voucherNumber: { type: String, trim: true, index: true },
    referenceNo: { type: String, trim: true, index: true },
    narration: { type: String, trim: true },
    paymentMode: {
      type: String,
      enum: ['cash', 'bank', 'card', 'upi', 'cheque', 'online', 'bank_transfer', 'adjustment'],
    },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    runningBalance: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: String, index: true },
    deletionReason: { type: String, trim: true },
    isReconciled: { type: Boolean, default: false, index: true },
    reconciledAt: { type: Date },
    createdBy: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AccountLedgerEntrySchema.index({ accountId: 1, entryDate: 1, createdAt: 1 });

const excludeDeletedLedgerEntries = function (this: any) {
  const filter = this.getFilter ? this.getFilter() : {};
  if (filter?.isDeleted !== undefined) return;
  this.where({ isDeleted: { $ne: true } });
};

AccountLedgerEntrySchema.pre('find', excludeDeletedLedgerEntries);
AccountLedgerEntrySchema.pre('findOne', excludeDeletedLedgerEntries);
AccountLedgerEntrySchema.pre('countDocuments', excludeDeletedLedgerEntries);
AccountLedgerEntrySchema.pre('findOneAndUpdate', excludeDeletedLedgerEntries);

export const AccountLedgerEntry = mongoose.model<IAccountLedgerEntry>('AccountLedgerEntry', AccountLedgerEntrySchema);
