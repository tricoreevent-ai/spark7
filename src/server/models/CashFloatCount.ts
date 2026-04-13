import mongoose, { Document, Schema } from 'mongoose';

export interface ICashFloatCount extends Document {
  treasuryAccountId: mongoose.Types.ObjectId;
  countDate: Date;
  calculatedBalance: number;
  physicalAmount: number;
  varianceAmount: number;
  adjustmentJournalId?: mongoose.Types.ObjectId;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CashFloatCountSchema = new Schema<ICashFloatCount>(
  {
    treasuryAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    countDate: { type: Date, required: true, index: true },
    calculatedBalance: { type: Number, required: true },
    physicalAmount: { type: Number, required: true },
    varianceAmount: { type: Number, required: true },
    adjustmentJournalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      index: true,
    },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

CashFloatCountSchema.index({ tenantId: 1, treasuryAccountId: 1, countDate: -1 });

export const CashFloatCount = mongoose.model<ICashFloatCount>('CashFloatCount', CashFloatCountSchema);
