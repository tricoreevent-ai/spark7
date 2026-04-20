import mongoose, { Document, Schema } from 'mongoose';

export type TdsTransactionType = 'bill' | 'payment' | 'advance' | 'journal' | 'manual';
export type TdsTransactionStatus = 'not_deducted' | 'deducted' | 'partial_paid' | 'paid' | 'filed' | 'reversed';

export interface ITdsTransaction extends Document {
  transactionDate: Date;
  financialYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  deducteeProfileId?: mongoose.Types.ObjectId;
  vendorId?: mongoose.Types.ObjectId;
  deducteeName: string;
  pan?: string;
  panStatus: 'valid' | 'invalid' | 'missing';
  sectionId: mongoose.Types.ObjectId;
  sectionCode: string;
  returnSectionCode?: string;
  sectionName: string;
  transactionType: TdsTransactionType;
  sourceType?: string;
  sourceId?: string;
  referenceNo?: string;
  grossAmount: number;
  taxableAmount: number;
  priorAnnualAmount: number;
  projectedAnnualAmount: number;
  thresholdPerTransaction: number;
  thresholdMonthly: number;
  thresholdAnnual: number;
  thresholdBreached: boolean;
  thresholdReason?: string;
  rate: number;
  effectiveRate: number;
  tdsAmount: number;
  paidAmount: number;
  balanceAmount: number;
  dueDate?: Date;
  challanId?: mongoose.Types.ObjectId;
  challanSerialNo?: string;
  journalEntryId?: mongoose.Types.ObjectId;
  returnId?: mongoose.Types.ObjectId;
  certificateId?: mongoose.Types.ObjectId;
  ldcApplied: boolean;
  lowerDeductionCertificateNo?: string;
  status: TdsTransactionStatus;
  notes?: string;
  warnings?: string[];
  metadata?: Record<string, any>;
  createdBy?: string;
  reversedAt?: Date;
  reversedBy?: string;
  reversalReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TdsTransactionSchema = new Schema<ITdsTransaction>(
  {
    transactionDate: { type: Date, required: true, default: Date.now, index: true },
    financialYear: { type: String, required: true, trim: true, index: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true, index: true },
    deducteeProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsDeducteeProfile', index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
    deducteeName: { type: String, required: true, trim: true, index: true },
    pan: { type: String, trim: true, uppercase: true, index: true },
    panStatus: { type: String, enum: ['valid', 'invalid', 'missing'], default: 'missing', index: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsSection', required: true, index: true },
    sectionCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    returnSectionCode: { type: String, trim: true, uppercase: true },
    sectionName: { type: String, required: true, trim: true },
    transactionType: { type: String, enum: ['bill', 'payment', 'advance', 'journal', 'manual'], default: 'bill', index: true },
    sourceType: { type: String, trim: true, index: true },
    sourceId: { type: String, trim: true, index: true },
    referenceNo: { type: String, trim: true, index: true },
    grossAmount: { type: Number, required: true, min: 0 },
    taxableAmount: { type: Number, required: true, min: 0 },
    priorAnnualAmount: { type: Number, default: 0, min: 0 },
    projectedAnnualAmount: { type: Number, default: 0, min: 0 },
    thresholdPerTransaction: { type: Number, default: 0, min: 0 },
    thresholdMonthly: { type: Number, default: 0, min: 0 },
    thresholdAnnual: { type: Number, default: 0, min: 0 },
    thresholdBreached: { type: Boolean, default: false, index: true },
    thresholdReason: { type: String, trim: true },
    rate: { type: Number, default: 0, min: 0 },
    effectiveRate: { type: Number, default: 0, min: 0 },
    tdsAmount: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    balanceAmount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, index: true },
    challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsChallan', index: true },
    challanSerialNo: { type: String, trim: true },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', index: true },
    returnId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsReturn', index: true },
    certificateId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsCertificate', index: true },
    ldcApplied: { type: Boolean, default: false, index: true },
    lowerDeductionCertificateNo: { type: String, trim: true, uppercase: true },
    status: {
      type: String,
      enum: ['not_deducted', 'deducted', 'partial_paid', 'paid', 'filed', 'reversed'],
      default: 'deducted',
      index: true,
    },
    notes: { type: String, trim: true },
    warnings: [{ type: String, trim: true }],
    metadata: { type: Schema.Types.Mixed },
    createdBy: { type: String, trim: true, index: true },
    reversedAt: { type: Date },
    reversedBy: { type: String, trim: true },
    reversalReason: { type: String, trim: true },
  },
  { timestamps: true }
);

TdsTransactionSchema.index({ tenantId: 1, financialYear: 1, quarter: 1, sectionCode: 1 });
TdsTransactionSchema.index({ tenantId: 1, deducteeProfileId: 1, financialYear: 1, sectionCode: 1 });
TdsTransactionSchema.index({ tenantId: 1, status: 1, dueDate: 1 });

export const TdsTransaction = mongoose.model<ITdsTransaction>('TdsTransaction', TdsTransactionSchema);
