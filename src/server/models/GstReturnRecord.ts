import mongoose, { Document, Schema } from 'mongoose';

export type GstReturnType = 'GSTR1' | 'GSTR3B' | 'GSTR9';
export type GstReturnStatus = 'draft' | 'saved' | 'submitted' | 'filed' | 'processed' | 'rejected';

export interface IGstReturnStatusHistory {
  status: GstReturnStatus;
  changedAt: Date;
  changedBy?: string;
  note?: string;
}

export interface IGstReturnRecord extends Document {
  filingKey: string;
  returnType: GstReturnType;
  periodKey?: string;
  periodCode?: string;
  financialYear?: string;
  gstin?: string;
  status: GstReturnStatus;
  filingReference?: string;
  submittedAt?: Date;
  filedAt?: Date;
  processedAt?: Date;
  rejectedAt?: Date;
  generatedAt: Date;
  generatedBy?: string;
  summary: Record<string, any>;
  payload: Record<string, any>;
  warnings: string[];
  notes?: string;
  sourceMetrics?: Record<string, any>;
  statusHistory: IGstReturnStatusHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

const GstReturnStatusHistorySchema = new Schema<IGstReturnStatusHistory>(
  {
    status: {
      type: String,
      enum: ['draft', 'saved', 'submitted', 'filed', 'processed', 'rejected'],
      required: true,
    },
    changedAt: { type: Date, required: true, default: Date.now },
    changedBy: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const GstReturnRecordSchema = new Schema<IGstReturnRecord>(
  {
    filingKey: { type: String, required: true, trim: true, index: true },
    returnType: { type: String, enum: ['GSTR1', 'GSTR3B', 'GSTR9'], required: true, index: true },
    periodKey: { type: String, trim: true, index: true },
    periodCode: { type: String, trim: true, index: true },
    financialYear: { type: String, trim: true, index: true },
    gstin: { type: String, trim: true, uppercase: true, index: true },
    status: {
      type: String,
      enum: ['draft', 'saved', 'submitted', 'filed', 'processed', 'rejected'],
      default: 'draft',
      index: true,
    },
    filingReference: { type: String, trim: true, index: true },
    submittedAt: { type: Date },
    filedAt: { type: Date },
    processedAt: { type: Date },
    rejectedAt: { type: Date },
    generatedAt: { type: Date, required: true, default: Date.now },
    generatedBy: { type: String, trim: true, index: true },
    summary: { type: Schema.Types.Mixed, default: {} },
    payload: { type: Schema.Types.Mixed, default: {} },
    warnings: { type: [String], default: [] },
    notes: { type: String, trim: true },
    sourceMetrics: { type: Schema.Types.Mixed, default: {} },
    statusHistory: { type: [GstReturnStatusHistorySchema], default: [] },
  },
  { timestamps: true }
);

GstReturnRecordSchema.index({ tenantId: 1, filingKey: 1 }, { unique: true });

export const GstReturnRecord = mongoose.model<IGstReturnRecord>('GstReturnRecord', GstReturnRecordSchema);
