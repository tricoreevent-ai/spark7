import mongoose, { Document, Schema } from 'mongoose';

export type BankFeedSource = 'import' | 'manual';
export type BankFeedMatchStatus = 'matched' | 'partial' | 'unmatched' | 'ignored' | 'refund_linked';

export interface IBankFeedTransaction extends Document {
  treasuryAccountId: mongoose.Types.ObjectId;
  transactionDate: Date;
  valueDate?: Date;
  amount: number;
  description?: string;
  referenceNo?: string;
  processorName?: string;
  externalTransactionId?: string;
  source: BankFeedSource;
  matchStatus: BankFeedMatchStatus;
  isIgnored: boolean;
  rawPayload?: Record<string, any>;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const BankFeedTransactionSchema = new Schema<IBankFeedTransaction>(
  {
    treasuryAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    transactionDate: { type: Date, required: true, index: true },
    valueDate: { type: Date, index: true },
    amount: { type: Number, required: true },
    description: { type: String, trim: true },
    referenceNo: { type: String, trim: true, index: true },
    processorName: { type: String, trim: true },
    externalTransactionId: { type: String, trim: true, index: true },
    source: {
      type: String,
      enum: ['import', 'manual'],
      default: 'import',
      index: true,
    },
    matchStatus: {
      type: String,
      enum: ['matched', 'partial', 'unmatched', 'ignored', 'refund_linked'],
      default: 'unmatched',
      index: true,
    },
    isIgnored: { type: Boolean, default: false, index: true },
    rawPayload: { type: Schema.Types.Mixed },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

BankFeedTransactionSchema.index({ tenantId: 1, treasuryAccountId: 1, transactionDate: -1 });

export const BankFeedTransaction = mongoose.model<IBankFeedTransaction>('BankFeedTransaction', BankFeedTransactionSchema);
