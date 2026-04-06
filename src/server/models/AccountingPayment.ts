import mongoose, { Document, Schema } from 'mongoose';

export type AccountingPaymentMode = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
export type AccountingPaymentStatus = 'posted' | 'cancelled';

export interface IAccountingPayment extends Document {
  paymentNumber: string;
  paymentDate: Date;
  amount: number;
  mode: AccountingPaymentMode;
  invoiceId?: mongoose.Types.ObjectId;
  customerId?: string;
  customerName?: string;
  vendorId?: mongoose.Types.ObjectId;
  description?: string;
  journalEntryId?: mongoose.Types.ObjectId;
  status: AccountingPaymentStatus;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const AccountingPaymentSchema = new Schema<IAccountingPayment>(
  {
    paymentNumber: { type: String, required: true, trim: true, index: true, unique: true },
    paymentDate: { type: Date, required: true, default: Date.now, index: true },
    amount: { type: Number, required: true, min: 0 },
    mode: {
      type: String,
      enum: ['cash', 'bank', 'card', 'upi', 'cheque', 'online', 'bank_transfer'],
      default: 'cash',
      index: true,
    },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountingInvoice', index: true },
    customerId: { type: String, trim: true, index: true },
    customerName: { type: String, trim: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
    description: { type: String, trim: true },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', index: true },
    status: { type: String, enum: ['posted', 'cancelled'], default: 'posted', index: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true, index: true },
    cancellationReason: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AccountingPaymentSchema.index({ tenantId: 1, paymentNumber: 1 }, { unique: true });
AccountingPaymentSchema.index({ invoiceId: 1, status: 1, paymentDate: -1 });

export const AccountingPayment = mongoose.model<IAccountingPayment>('AccountingPayment', AccountingPaymentSchema);
