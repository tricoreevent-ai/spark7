import mongoose, { Document, Schema } from 'mongoose';

export type VoucherType = 'receipt' | 'payment' | 'journal' | 'transfer';

export interface IAccountingVoucherLine {
  accountId?: mongoose.Types.ObjectId;
  accountCode?: string;
  accountName: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface IAccountingVoucherDocumentFields {
  accountName?: string;
  beingPaymentOf?: string;
  forPeriod?: string;
  receivedBy?: string;
  authorizedBy?: string;
  receivedSign?: string;
  authorizedSign?: string;
}

export interface IAccountingVoucher extends Document {
  voucherNumber: string;
  voucherType: VoucherType;
  voucherDate: Date;
  paymentMode?: 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
  referenceNo?: string;
  counterpartyName?: string;
  notes?: string;
  documentFields?: IAccountingVoucherDocumentFields;
  metadata?: Record<string, any>;
  totalAmount: number;
  lines: IAccountingVoucherLine[];
  isPrinted: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AccountingVoucherLineSchema = new Schema<IAccountingVoucherLine>(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartAccount' },
    accountCode: { type: String, trim: true },
    accountName: { type: String, required: true, trim: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    narration: { type: String, trim: true },
  },
  { _id: false }
);

const AccountingVoucherSchema = new Schema<IAccountingVoucher>(
  {
    voucherNumber: { type: String, required: true, unique: true, trim: true, index: true },
    voucherType: { type: String, enum: ['receipt', 'payment', 'journal', 'transfer'], required: true, index: true },
    voucherDate: { type: Date, required: true, default: Date.now, index: true },
    paymentMode: {
      type: String,
      enum: ['cash', 'bank', 'card', 'upi', 'cheque', 'online', 'bank_transfer'],
    },
    referenceNo: { type: String, trim: true, index: true },
    counterpartyName: { type: String, trim: true },
    notes: { type: String, trim: true },
    documentFields: {
      accountName: { type: String, trim: true },
      beingPaymentOf: { type: String, trim: true },
      forPeriod: { type: String, trim: true },
      receivedBy: { type: String, trim: true },
      authorizedBy: { type: String, trim: true },
      receivedSign: { type: String, trim: true },
      authorizedSign: { type: String, trim: true },
    },
    metadata: { type: Schema.Types.Mixed },
    totalAmount: { type: Number, required: true, min: 0 },
    lines: { type: [AccountingVoucherLineSchema], default: [] },
    isPrinted: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: String, trim: true, index: true },
    deletionReason: { type: String, trim: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

AccountingVoucherSchema.index({ voucherType: 1, voucherDate: -1 });

const excludeDeletedVouchers = function (this: any) {
  const filter = this.getFilter ? this.getFilter() : {};
  if (filter?.isDeleted !== undefined) return;
  this.where({ isDeleted: { $ne: true } });
};

AccountingVoucherSchema.pre('find', excludeDeletedVouchers);
AccountingVoucherSchema.pre('findOne', excludeDeletedVouchers);
AccountingVoucherSchema.pre('countDocuments', excludeDeletedVouchers);
AccountingVoucherSchema.pre('findOneAndUpdate', excludeDeletedVouchers);

export const AccountingVoucher = mongoose.model<IAccountingVoucher>('AccountingVoucher', AccountingVoucherSchema);
