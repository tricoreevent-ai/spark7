import mongoose, { Schema, Document } from 'mongoose';

export interface IReturnItem {
  saleId?: string;
  productId: string;
  productName: string;
  sku: string;
  originalQuantity?: number;
  returnQuantity: number;
  unitPrice: number;
  gstRate: number;
  returnReason: string;
  lineSubtotal?: number;
  lineTax?: number;
  lineTotal?: number;
  qualityStatus?: 'pending' | 'passed' | 'failed';
}

export interface IReturn {
  _id?: string;
  returnNumber: string; // Auto-generated unique return number
  userId: string;
  saleId?: string; // Reference to original sale (optional for manual return)
  sourceInvoiceNumber?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  isManualReturn?: boolean;
  items: IReturnItem[];
  returnedAmount: number; // Total amount to refund
  returnedGst: number; // GST portion refunded
  refundAmount: number; // Final refund amount
  refundMethod: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'credit_note' | 'original_payment';
  refundTreasuryAccountId?: mongoose.Types.ObjectId;
  refundTreasuryAccountName?: string;
  refundProcessedAt?: Date;
  refundReferenceNo?: string;
  refundExpectedSettlementDate?: Date;
  refundStatus: 'pending' | 'completed' | 'rejected';
  returnStatus: 'draft' | 'approved' | 'rejected';
  reason: string; // Overall return reason (mandatory)
  notes?: string;
  approvedBy?: string;
  approvedAt?: Date;
  qualityCheckRequired?: boolean;
  qualityCheck?: {
    status: 'pending' | 'passed' | 'failed';
    notes?: string;
    checkedBy?: string;
    checkedAt?: Date;
  };
  restockStatus?: 'pending' | 'completed' | 'skipped';
  creditNoteId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface IReturnDocument extends Document, Omit<IReturn, '_id'> {}

const ReturnSchema = new Schema<IReturnDocument>(
  {
    returnNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    saleId: {
      type: String,
      index: true,
    },
    sourceInvoiceNumber: { type: String, index: true },
    customerId: { type: String, index: true },
    customerName: { type: String, index: true },
    customerPhone: { type: String, index: true },
    customerEmail: { type: String, index: true },
    isManualReturn: { type: Boolean, default: false },
    items: [
      {
        saleId: String,
        productId: String,
        productName: String,
        sku: String,
        originalQuantity: Number,
        returnQuantity: { type: Number, required: true },
        unitPrice: Number,
        gstRate: Number,
        returnReason: { type: String, required: true },
        lineSubtotal: Number,
        lineTax: Number,
        lineTotal: Number,
        qualityStatus: {
          type: String,
          enum: ['pending', 'passed', 'failed'],
          default: 'pending',
        },
      },
    ],
    returnedAmount: { type: Number, default: 0 },
    returnedGst: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    refundMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank_transfer', 'credit_note', 'original_payment'],
      default: 'original_payment',
    },
    refundTreasuryAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      index: true,
    },
    refundTreasuryAccountName: { type: String, trim: true },
    refundProcessedAt: { type: Date, index: true },
    refundReferenceNo: { type: String, trim: true, index: true },
    refundExpectedSettlementDate: { type: Date, index: true },
    refundStatus: {
      type: String,
      enum: ['pending', 'completed', 'rejected'],
      default: 'pending',
    },
    returnStatus: {
      type: String,
      enum: ['draft', 'approved', 'rejected'],
      default: 'draft',
    },
    reason: { type: String, required: true, trim: true },
    notes: String,
    approvedBy: String,
    approvedAt: Date,
    qualityCheckRequired: { type: Boolean, default: false },
    qualityCheck: {
      status: {
        type: String,
        enum: ['pending', 'passed', 'failed'],
        default: 'pending',
      },
      notes: String,
      checkedBy: String,
      checkedAt: Date,
    },
    restockStatus: {
      type: String,
      enum: ['pending', 'completed', 'skipped'],
      default: 'pending',
    },
    creditNoteId: { type: String, index: true },
  },
  { timestamps: true }
);

export type { IReturnDocument };
export const Return = mongoose.model<IReturnDocument>('Return', ReturnSchema);
