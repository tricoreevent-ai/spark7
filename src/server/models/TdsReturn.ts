import mongoose, { Document, Schema } from 'mongoose';
import type { TdsFormType } from './TdsSection.js';

export type TdsReturnStatus = 'draft' | 'validated' | 'filed' | 'rejected' | 'correction';

export interface ITdsReturn extends Document {
  formType: TdsFormType;
  financialYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  filingKey: string;
  status: TdsReturnStatus;
  transactionIds: mongoose.Types.ObjectId[];
  challanIds: mongoose.Types.ObjectId[];
  fileName?: string;
  fileContent?: string;
  fvuValidationStatus?: 'not_validated' | 'passed' | 'failed';
  fvuValidationMessage?: string;
  acknowledgementNo?: string;
  originalTokenNo?: string;
  correctionTokenNo?: string;
  filedAt?: Date;
  summary?: Record<string, any>;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TdsReturnSchema = new Schema<ITdsReturn>(
  {
    formType: { type: String, enum: ['24Q', '26Q', '27Q', '27EQ'], required: true, index: true },
    financialYear: { type: String, required: true, trim: true, index: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true, index: true },
    filingKey: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['draft', 'validated', 'filed', 'rejected', 'correction'], default: 'draft', index: true },
    transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TdsTransaction' }],
    challanIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TdsChallan' }],
    fileName: { type: String, trim: true },
    fileContent: { type: String },
    fvuValidationStatus: { type: String, enum: ['not_validated', 'passed', 'failed'], default: 'not_validated', index: true },
    fvuValidationMessage: { type: String, trim: true },
    acknowledgementNo: { type: String, trim: true },
    originalTokenNo: { type: String, trim: true },
    correctionTokenNo: { type: String, trim: true },
    filedAt: { type: Date },
    summary: { type: Schema.Types.Mixed },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

TdsReturnSchema.index({ tenantId: 1, filingKey: 1 }, { unique: true });

export const TdsReturn = mongoose.model<ITdsReturn>('TdsReturn', TdsReturnSchema);
