import mongoose, { Document, Schema } from 'mongoose';

export interface IJournalLine extends Document {
  journalId: mongoose.Types.ObjectId;
  entryDate: Date;
  lineNumber: number;
  accountId: mongoose.Types.ObjectId;
  accountCode: string;
  accountName: string;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const JournalLineSchema = new Schema<IJournalLine>(
  {
    journalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      required: true,
      index: true,
    },
    entryDate: { type: Date, required: true, default: Date.now, index: true },
    lineNumber: { type: Number, required: true, min: 1 },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      required: true,
      index: true,
    },
    accountCode: { type: String, required: true, trim: true, uppercase: true },
    accountName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    debitAmount: { type: Number, default: 0, min: 0 },
    creditAmount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

JournalLineSchema.index({ journalId: 1, lineNumber: 1 }, { unique: true });
JournalLineSchema.index({ accountId: 1, entryDate: 1 });

export const JournalLine = mongoose.model<IJournalLine>('JournalLine', JournalLineSchema);
