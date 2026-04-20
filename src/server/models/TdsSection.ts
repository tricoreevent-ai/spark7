import mongoose, { Document, Schema } from 'mongoose';

export type TdsFormType = '24Q' | '26Q' | '27Q' | '27EQ';

export interface ITdsSection extends Document {
  sectionCode: string;
  returnSectionCode?: string;
  actReference?: '1961' | '2025' | 'transition';
  sectionName: string;
  natureOfPayment?: string;
  defaultRate: number;
  panMissingRate: number;
  thresholdPerTransaction: number;
  thresholdMonthly: number;
  thresholdAnnual: number;
  formType: TdsFormType;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  isActive: boolean;
  isSystemDefault: boolean;
  statutoryReference?: string;
  notes?: string;
  rateMatrix?: Record<string, any>;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TdsSectionSchema = new Schema<ITdsSection>(
  {
    sectionCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    returnSectionCode: { type: String, trim: true, uppercase: true },
    actReference: { type: String, enum: ['1961', '2025', 'transition'], default: 'transition', index: true },
    sectionName: { type: String, required: true, trim: true },
    natureOfPayment: { type: String, trim: true },
    defaultRate: { type: Number, required: true, min: 0 },
    panMissingRate: { type: Number, default: 20, min: 0 },
    thresholdPerTransaction: { type: Number, default: 0, min: 0 },
    thresholdMonthly: { type: Number, default: 0, min: 0 },
    thresholdAnnual: { type: Number, default: 0, min: 0 },
    formType: { type: String, enum: ['24Q', '26Q', '27Q', '27EQ'], default: '26Q', index: true },
    effectiveFrom: { type: Date, index: true },
    effectiveTo: { type: Date, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isSystemDefault: { type: Boolean, default: false, index: true },
    statutoryReference: { type: String, trim: true },
    notes: { type: String, trim: true },
    rateMatrix: { type: Schema.Types.Mixed },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

TdsSectionSchema.index({ tenantId: 1, sectionCode: 1 }, { unique: true });
TdsSectionSchema.index({ sectionCode: 1, isActive: 1, effectiveFrom: -1 });

export const TdsSection = mongoose.model<ITdsSection>('TdsSection', TdsSectionSchema);
