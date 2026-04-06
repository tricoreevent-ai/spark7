import mongoose, { Schema, Document } from 'mongoose';

export interface IDayBookEntry extends Document {
  entryType: 'income' | 'expense';
  category: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'upi' | 'bank' | 'cheque' | 'online';
  narration?: string;
  referenceNo?: string;
  entryDate: Date;
  status: 'active' | 'cancelled';
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
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank', 'cheque', 'online'],
      default: 'cash',
    },
    narration: { type: String, trim: true },
    referenceNo: { type: String, trim: true },
    entryDate: { type: Date, required: true, default: Date.now, index: true },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, index: true },
    cancellationReason: { type: String, trim: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

DayBookEntrySchema.index({ entryDate: -1, entryType: 1, status: 1 });

export const DayBookEntry = mongoose.model<IDayBookEntry>('DayBookEntry', DayBookEntrySchema);
