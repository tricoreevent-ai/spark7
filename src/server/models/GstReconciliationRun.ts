import mongoose, { Document, Schema } from 'mongoose';

export type GstReconciliationCategory =
  | 'matched'
  | 'partial_match'
  | 'missing_in_gstr2b'
  | 'missing_in_ledger'
  | 'reconciled';

export interface IGstReconciliationRow {
  key: string;
  category: GstReconciliationCategory;
  decision?: 'pending' | 'accept_supplier' | 'keep_ledger' | 'ignore';
  supplierGstin?: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
  ledger?: Record<string, any> | null;
  gst2b?: Record<string, any> | null;
  differences?: Record<string, any>;
  recommendedAction?: string;
}

export interface IGstReconciliationRun extends Document {
  periodKey: string;
  gstin?: string;
  source: 'manual_import';
  importedRowsCount: number;
  summary: Record<string, any>;
  eligibleItc: Record<string, any>;
  rows: IGstReconciliationRow[];
  importSample?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const GstReconciliationRowSchema = new Schema<IGstReconciliationRow>(
  {
    key: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['matched', 'partial_match', 'missing_in_gstr2b', 'missing_in_ledger', 'reconciled'],
      required: true,
    },
    decision: {
      type: String,
      enum: ['pending', 'accept_supplier', 'keep_ledger', 'ignore'],
      default: 'pending',
    },
    supplierGstin: { type: String, trim: true, uppercase: true },
    invoiceNumber: { type: String, trim: true },
    invoiceDate: { type: Date },
    ledger: { type: Schema.Types.Mixed, default: null },
    gst2b: { type: Schema.Types.Mixed, default: null },
    differences: { type: Schema.Types.Mixed, default: {} },
    recommendedAction: { type: String, trim: true },
  },
  { _id: false }
);

const GstReconciliationRunSchema = new Schema<IGstReconciliationRun>(
  {
    periodKey: { type: String, required: true, trim: true, index: true },
    gstin: { type: String, trim: true, uppercase: true, index: true },
    source: { type: String, enum: ['manual_import'], default: 'manual_import' },
    importedRowsCount: { type: Number, required: true, min: 0 },
    summary: { type: Schema.Types.Mixed, default: {} },
    eligibleItc: { type: Schema.Types.Mixed, default: {} },
    rows: { type: [GstReconciliationRowSchema], default: [] },
    importSample: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

GstReconciliationRunSchema.index({ tenantId: 1, periodKey: 1, createdAt: -1 });

export const GstReconciliationRun = mongoose.model<IGstReconciliationRun>('GstReconciliationRun', GstReconciliationRunSchema);
