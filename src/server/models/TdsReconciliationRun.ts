import mongoose, { Document, Schema } from 'mongoose';

export type TdsReconciliationSource = 'form26as' | 'traces' | 'ais' | 'manual';

export interface ITdsReconciliationRun extends Document {
  sourceType: TdsReconciliationSource;
  financialYear: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  importedRows: Array<Record<string, any>>;
  matchedRows: Array<Record<string, any>>;
  mismatchRows: Array<Record<string, any>>;
  missingInBooks: Array<Record<string, any>>;
  missingInImport: Array<Record<string, any>>;
  summary: Record<string, any>;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TdsReconciliationRunSchema = new Schema<ITdsReconciliationRun>(
  {
    sourceType: { type: String, enum: ['form26as', 'traces', 'ais', 'manual'], default: 'manual', index: true },
    financialYear: { type: String, required: true, trim: true, index: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], index: true },
    importedRows: [{ type: Schema.Types.Mixed }],
    matchedRows: [{ type: Schema.Types.Mixed }],
    mismatchRows: [{ type: Schema.Types.Mixed }],
    missingInBooks: [{ type: Schema.Types.Mixed }],
    missingInImport: [{ type: Schema.Types.Mixed }],
    summary: { type: Schema.Types.Mixed, default: {} },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

TdsReconciliationRunSchema.index({ tenantId: 1, financialYear: 1, quarter: 1, createdAt: -1 });

export const TdsReconciliationRun = mongoose.model<ITdsReconciliationRun>('TdsReconciliationRun', TdsReconciliationRunSchema);
