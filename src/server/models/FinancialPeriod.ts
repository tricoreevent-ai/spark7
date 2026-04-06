import mongoose, { Document, Schema } from 'mongoose';

export interface IFinancialPeriod extends Document {
  periodKey: string;
  month: number;
  year: number;
  startDate: Date;
  endDate: Date;
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const FinancialPeriodSchema = new Schema<IFinancialPeriod>(
  {
    periodKey: { type: String, required: true, trim: true, index: true, unique: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    year: { type: Number, required: true, min: 2000, max: 9999, index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    isLocked: { type: Boolean, default: false, index: true },
    lockedAt: { type: Date },
    lockedBy: { type: String, trim: true, index: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

FinancialPeriodSchema.index({ tenantId: 1, periodKey: 1 }, { unique: true });
FinancialPeriodSchema.index({ year: 1, month: 1 });

export const FinancialPeriod = mongoose.model<IFinancialPeriod>('FinancialPeriod', FinancialPeriodSchema);
