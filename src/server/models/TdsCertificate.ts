import mongoose, { Document, Schema } from 'mongoose';

export type TdsCertificateFormType = 'Form16' | 'Form16A' | 'Form27D';
export type TdsCertificateStatus = 'draft' | 'generated' | 'emailed' | 'cancelled';

export interface ITdsCertificate extends Document {
  formType: TdsCertificateFormType;
  financialYear: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  deducteeProfileId?: mongoose.Types.ObjectId;
  deducteeName: string;
  pan?: string;
  certificateNumber?: string;
  transactionIds: mongoose.Types.ObjectId[];
  fileName?: string;
  fileContent?: string;
  status: TdsCertificateStatus;
  emailedAt?: Date;
  emailedTo?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TdsCertificateSchema = new Schema<ITdsCertificate>(
  {
    formType: { type: String, enum: ['Form16', 'Form16A', 'Form27D'], required: true, index: true },
    financialYear: { type: String, required: true, trim: true, index: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], index: true },
    deducteeProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsDeducteeProfile', index: true },
    deducteeName: { type: String, required: true, trim: true, index: true },
    pan: { type: String, trim: true, uppercase: true, index: true },
    certificateNumber: { type: String, trim: true, uppercase: true, index: true },
    transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TdsTransaction' }],
    fileName: { type: String, trim: true },
    fileContent: { type: String },
    status: { type: String, enum: ['draft', 'generated', 'emailed', 'cancelled'], default: 'draft', index: true },
    emailedAt: { type: Date },
    emailedTo: { type: String, trim: true, lowercase: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

TdsCertificateSchema.index({ tenantId: 1, financialYear: 1, deducteeProfileId: 1, quarter: 1 });

export const TdsCertificate = mongoose.model<ITdsCertificate>('TdsCertificate', TdsCertificateSchema);
