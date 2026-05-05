import mongoose, { Document, Schema } from 'mongoose';

export type AccountingInvoiceStatus = 'draft' | 'posted' | 'partial' | 'paid' | 'cancelled';
export type AccountingInvoiceReferenceType = 'manual' | 'sale' | 'facility_booking' | 'event_booking' | 'expense';
export type GstTreatment = 'none' | 'intrastate' | 'interstate';

export interface IAccountingInvoice extends Document {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;
  customerId?: string;
  customerName: string;
  referenceType: AccountingInvoiceReferenceType;
  referenceId?: string;
  description?: string;
  baseAmount: number;
  discountAmount: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: AccountingInvoiceStatus;
  gstTreatment: GstTreatment;
  revenueAccountId?: mongoose.Types.ObjectId;
  journalEntryId?: mongoose.Types.ObjectId;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const AccountingInvoiceSchema = new Schema<IAccountingInvoice>(
  {
    invoiceNumber: { type: String, required: true, trim: true, index: true },
    invoiceDate: { type: Date, required: true, default: Date.now, index: true },
    dueDate: { type: Date, index: true },
    customerId: { type: String, trim: true, index: true },
    customerName: { type: String, required: true, trim: true, index: true },
    referenceType: {
      type: String,
      enum: ['manual', 'sale', 'facility_booking', 'event_booking', 'expense'],
      default: 'manual',
      index: true,
    },
    referenceId: { type: String, trim: true, index: true },
    description: { type: String, trim: true },
    baseAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    cgstAmount: { type: Number, default: 0, min: 0 },
    sgstAmount: { type: Number, default: 0, min: 0 },
    igstAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    balanceAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['draft', 'posted', 'partial', 'paid', 'cancelled'], default: 'posted', index: true },
    gstTreatment: { type: String, enum: ['none', 'intrastate', 'interstate'], default: 'none' },
    revenueAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartAccount', index: true },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', index: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true, index: true },
    cancellationReason: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AccountingInvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
AccountingInvoiceSchema.index({ referenceType: 1, referenceId: 1, status: 1 });

export const AccountingInvoice = mongoose.model<IAccountingInvoice>('AccountingInvoice', AccountingInvoiceSchema);
