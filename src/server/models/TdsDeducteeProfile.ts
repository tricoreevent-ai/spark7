import mongoose, { Document, Schema } from 'mongoose';

export type TdsDeducteeType = 'vendor' | 'employee' | 'contractor' | 'customer' | 'other';
export type TdsResidentialStatus = 'resident' | 'non_resident';
export type TdsPanStatus = 'valid' | 'invalid' | 'missing';

export interface ITdsLowerDeductionCertificate {
  enabled: boolean;
  certificateNumber?: string;
  rate?: number;
  validFrom?: Date;
  validTo?: Date;
  amountLimit?: number;
  notes?: string;
}

export interface ITdsDeducteeProfile extends Document {
  vendorId?: mongoose.Types.ObjectId;
  employeeId?: mongoose.Types.ObjectId;
  deducteeName: string;
  deducteeType: TdsDeducteeType;
  residentialStatus: TdsResidentialStatus;
  pan?: string;
  panStatus: TdsPanStatus;
  email?: string;
  phone?: string;
  defaultSectionId?: mongoose.Types.ObjectId;
  lowerDeductionCertificate?: ITdsLowerDeductionCertificate;
  isActive: boolean;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const LowerDeductionCertificateSchema = new Schema<ITdsLowerDeductionCertificate>(
  {
    enabled: { type: Boolean, default: false },
    certificateNumber: { type: String, trim: true, uppercase: true },
    rate: { type: Number, min: 0 },
    validFrom: { type: Date },
    validTo: { type: Date },
    amountLimit: { type: Number, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const TdsDeducteeProfileSchema = new Schema<ITdsDeducteeProfile>(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    deducteeName: { type: String, required: true, trim: true, index: true },
    deducteeType: {
      type: String,
      enum: ['vendor', 'employee', 'contractor', 'customer', 'other'],
      default: 'vendor',
      index: true,
    },
    residentialStatus: {
      type: String,
      enum: ['resident', 'non_resident'],
      default: 'resident',
      index: true,
    },
    pan: { type: String, trim: true, uppercase: true, index: true },
    panStatus: { type: String, enum: ['valid', 'invalid', 'missing'], default: 'missing', index: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    defaultSectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsSection', index: true },
    lowerDeductionCertificate: { type: LowerDeductionCertificateSchema, default: () => ({ enabled: false }) },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

TdsDeducteeProfileSchema.index({ tenantId: 1, vendorId: 1 }, { unique: true, partialFilterExpression: { vendorId: { $exists: true } } });
TdsDeducteeProfileSchema.index({ tenantId: 1, pan: 1 }, { partialFilterExpression: { pan: { $gt: '' } } });

export const TdsDeducteeProfile = mongoose.model<ITdsDeducteeProfile>('TdsDeducteeProfile', TdsDeducteeProfileSchema);
