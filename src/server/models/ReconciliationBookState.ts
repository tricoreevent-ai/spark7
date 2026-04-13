import mongoose, { Document, Schema } from 'mongoose';

export type ReconciliationBookStateAction = 'ignore' | 'manual_deposit';

export interface IReconciliationBookState extends Document {
  treasuryAccountId: mongoose.Types.ObjectId;
  bookEntryKey: string;
  action: ReconciliationBookStateAction;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ReconciliationBookStateSchema = new Schema<IReconciliationBookState>(
  {
    treasuryAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    bookEntryKey: { type: String, required: true, trim: true, index: true },
    action: {
      type: String,
      enum: ['ignore', 'manual_deposit'],
      required: true,
      index: true,
    },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

ReconciliationBookStateSchema.index({ tenantId: 1, treasuryAccountId: 1, bookEntryKey: 1 }, { unique: true });

export const ReconciliationBookState = mongoose.model<IReconciliationBookState>('ReconciliationBookState', ReconciliationBookStateSchema);
