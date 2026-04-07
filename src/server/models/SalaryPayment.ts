import mongoose, { Schema, Document } from 'mongoose';

export interface ISalaryPayment extends Document {
  employeeId?: mongoose.Types.ObjectId;
  employeeName: string;
  designation?: string;
  month: string; // YYYY-MM
  payDate: Date;
  payDateKey?: string; // YYYY-MM-DD
  baseAmount?: number;
  bonusAmount?: number;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'upi' | 'bank' | 'cheque';
  payslipRecipient?: string;
  payslipSentAt?: Date;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SalaryPaymentSchema = new Schema<ISalaryPayment>(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      index: true,
    },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    payDate: { type: Date, required: true, default: Date.now },
    payDateKey: { type: String, trim: true, index: true },
    baseAmount: { type: Number, min: 0, default: 0 },
    bonusAmount: { type: Number, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank', 'cheque'],
      default: 'bank',
    },
    payslipRecipient: { type: String, trim: true, lowercase: true },
    payslipSentAt: { type: Date },
    notes: { type: String, trim: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

SalaryPaymentSchema.index({ month: 1, payDate: -1 });
SalaryPaymentSchema.index(
  { tenantId: 1, employeeId: 1, month: 1, payDateKey: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $exists: true }, payDateKey: { $gt: '' } } }
);

export const SalaryPayment = mongoose.model<ISalaryPayment>('SalaryPayment', SalaryPaymentSchema);
