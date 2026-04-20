import mongoose, { Document, Schema } from 'mongoose';

export type PayrollArrearStatus = 'draft' | 'approved' | 'included' | 'cancelled';

export interface IPayrollArrear extends Document {
  employeeId: mongoose.Types.ObjectId | string;
  employeeCode: string;
  employeeName: string;
  effectiveMonth: string;
  payoutMonth: string;
  previousMonthlySalary: number;
  revisedMonthlySalary: number;
  monthlyDifference: number;
  monthsCount: number;
  arrearsAmount: number;
  reason?: string;
  status: PayrollArrearStatus;
  includedInPayrollMonth?: string;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PayrollArrearSchema = new Schema<IPayrollArrear>(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    effectiveMonth: { type: String, required: true, trim: true, index: true },
    payoutMonth: { type: String, required: true, trim: true, index: true },
    previousMonthlySalary: { type: Number, required: true, min: 0 },
    revisedMonthlySalary: { type: Number, required: true, min: 0 },
    monthlyDifference: { type: Number, required: true },
    monthsCount: { type: Number, required: true, min: 1 },
    arrearsAmount: { type: Number, required: true },
    reason: { type: String, trim: true },
    status: { type: String, enum: ['draft', 'approved', 'included', 'cancelled'], default: 'approved', index: true },
    includedInPayrollMonth: { type: String, trim: true, index: true },
    createdBy: { type: String, trim: true, index: true },
    approvedBy: { type: String, trim: true },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

PayrollArrearSchema.index({ tenantId: 1, employeeId: 1, payoutMonth: 1, status: 1 });

export const PayrollArrear = mongoose.model<IPayrollArrear>('PayrollArrear', PayrollArrearSchema);
