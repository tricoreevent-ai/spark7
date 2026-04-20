import mongoose, { Document, Schema } from 'mongoose';

export type JournalReferenceType =
  | 'manual'
  | 'invoice'
  | 'payment'
  | 'expense'
  | 'purchase_bill'
  | 'inventory_adjustment'
  | 'refund'
  | 'tds'
  | 'booking'
  | 'event_booking'
  | 'depreciation'
  | 'opening'
  | 'reversal';

export type JournalStatus = 'posted' | 'cancelled';

export interface IJournalEntry extends Document {
  entryNumber: string;
  entryDate: Date;
  referenceType: JournalReferenceType;
  referenceId?: string;
  referenceNo?: string;
  description: string;
  status: JournalStatus;
  totalDebit: number;
  totalCredit: number;
  previousEntryHash?: string;
  entryHash?: string;
  hashVersion: number;
  reversedEntryId?: mongoose.Types.ObjectId;
  cancellationReason?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    entryNumber: { type: String, required: true, trim: true, index: true },
    entryDate: { type: Date, required: true, default: Date.now, index: true },
    referenceType: {
      type: String,
      enum: ['manual', 'invoice', 'payment', 'expense', 'purchase_bill', 'inventory_adjustment', 'refund', 'tds', 'booking', 'event_booking', 'depreciation', 'opening', 'reversal'],
      required: true,
      index: true,
    },
    referenceId: { type: String, trim: true, index: true },
    referenceNo: { type: String, trim: true, index: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ['posted', 'cancelled'], default: 'posted', index: true },
    totalDebit: { type: Number, required: true, min: 0 },
    totalCredit: { type: Number, required: true, min: 0 },
    previousEntryHash: { type: String, trim: true },
    entryHash: { type: String, trim: true, index: true },
    hashVersion: { type: Number, default: 1, min: 1 },
    reversedEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', index: true },
    cancellationReason: { type: String, trim: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true, index: true },
    createdBy: { type: String, trim: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

JournalEntrySchema.index({ tenantId: 1, entryNumber: 1 }, { unique: true });
JournalEntrySchema.index({ referenceType: 1, referenceId: 1, status: 1 });
JournalEntrySchema.index(
  { tenantId: 1, previousEntryHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      previousEntryHash: { $exists: true, $nin: ['', 'GENESIS'] },
    },
  }
);

export const JournalEntry = mongoose.model<IJournalEntry>('JournalEntry', JournalEntrySchema);
