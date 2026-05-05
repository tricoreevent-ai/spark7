import mongoose, { Schema, Document } from 'mongoose';

export interface IDayBookEntry extends Document {
  entryType: 'income' | 'expense';
  category: string;
  amount: number;
  taxableAmount?: number;
  gstRate?: number;
  gstAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalAmount?: number;
  gstTreatment?: 'none' | 'intrastate' | 'interstate';
  paymentMethod: 'cash' | 'card' | 'upi' | 'bank' | 'cheque' | 'online';
  treasuryAccountId?: mongoose.Types.ObjectId;
  treasuryAccountName?: string;
  narration?: string;
  referenceNo?: string;
  entryDate: Date;
  status: 'active' | 'cancelled';
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DayBookEntrySchema = new Schema<IDayBookEntry>(
  {
    entryType: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    category: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    taxableAmount: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, default: 0 },
    gstAmount: { type: Number, min: 0, default: 0 },
    cgstAmount: { type: Number, min: 0, default: 0 },
    sgstAmount: { type: Number, min: 0, default: 0 },
    igstAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    gstTreatment: {
      type: String,
      enum: ['none', 'intrastate', 'interstate'],
      default: 'none',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank', 'cheque', 'online'],
      default: 'cash',
    },
    treasuryAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      index: true,
    },
    treasuryAccountName: { type: String, trim: true },
    narration: { type: String, trim: true },
    referenceNo: { type: String, trim: true },
    entryDate: { type: Date, required: true, default: Date.now, index: true },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: String, index: true },
    deletionReason: { type: String, trim: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, index: true },
    cancellationReason: { type: String, trim: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

DayBookEntrySchema.index({ entryDate: -1, entryType: 1, status: 1 });

const excludeDeletedDayBookEntries = function (this: any) {
  const filter = this.getFilter ? this.getFilter() : {};
  if (filter?.isDeleted !== undefined) return;
  this.where({ isDeleted: { $ne: true } });
};

DayBookEntrySchema.pre('find', excludeDeletedDayBookEntries);
DayBookEntrySchema.pre('findOne', excludeDeletedDayBookEntries);
DayBookEntrySchema.pre('countDocuments', excludeDeletedDayBookEntries);
DayBookEntrySchema.pre('findOneAndUpdate', excludeDeletedDayBookEntries);

export const DayBookEntry = mongoose.model<IDayBookEntry>('DayBookEntry', DayBookEntrySchema);
