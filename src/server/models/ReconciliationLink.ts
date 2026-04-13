import mongoose, { Document, Schema } from 'mongoose';

export type ReconciliationLinkKind =
  | 'sale'
  | 'receipt'
  | 'refund'
  | 'expense'
  | 'salary'
  | 'contract'
  | 'voucher'
  | 'transfer'
  | 'accounting_payment'
  | 'cash_variance';

export interface IReconciliationLink extends Document {
  bankTransactionId: mongoose.Types.ObjectId;
  treasuryAccountId: mongoose.Types.ObjectId;
  bookEntryKey: string;
  bookSourceType: string;
  bookSourceId: string;
  bookReferenceNo?: string;
  linkedAmount: number;
  bookAmount: number;
  kind: ReconciliationLinkKind;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ReconciliationLinkSchema = new Schema<IReconciliationLink>(
  {
    bankTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankFeedTransaction',
      required: true,
      index: true,
    },
    treasuryAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    bookEntryKey: { type: String, required: true, trim: true, index: true },
    bookSourceType: { type: String, required: true, trim: true, index: true },
    bookSourceId: { type: String, required: true, trim: true, index: true },
    bookReferenceNo: { type: String, trim: true, index: true },
    linkedAmount: { type: Number, required: true, min: 0 },
    bookAmount: { type: Number, required: true, min: 0 },
    kind: {
      type: String,
      enum: ['sale', 'receipt', 'refund', 'expense', 'salary', 'contract', 'voucher', 'transfer', 'accounting_payment', 'cash_variance'],
      required: true,
      index: true,
    },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

ReconciliationLinkSchema.index({ tenantId: 1, bankTransactionId: 1, bookEntryKey: 1 }, { unique: true });

export const ReconciliationLink = mongoose.model<IReconciliationLink>('ReconciliationLink', ReconciliationLinkSchema);
