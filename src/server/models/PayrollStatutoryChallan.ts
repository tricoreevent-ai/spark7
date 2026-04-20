import mongoose, { Document, Schema } from 'mongoose';

export type PayrollChallanType = 'pf' | 'esi' | 'pt' | 'tds';
export type PayrollChallanStatus = 'draft' | 'generated' | 'paid' | 'cancelled';

export interface IPayrollStatutoryChallan extends Document {
  challanType: PayrollChallanType;
  periodType: 'month' | 'quarter';
  periodKey: string;
  financialYear: string;
  dueDate?: Date;
  generatedDate: Date;
  paymentDate?: Date;
  challanNumber: string;
  utrNumber?: string;
  bankName?: string;
  status: PayrollChallanStatus;
  employeeAmount: number;
  employerAmount: number;
  penaltyAmount: number;
  interestAmount: number;
  totalAmount: number;
  employeeBreakup: Array<{
    employeeId: mongoose.Types.ObjectId | string;
    employeeCode: string;
    name: string;
    employeeAmount: number;
    employerAmount: number;
    grossPay: number;
  }>;
  fileName?: string;
  fileContent?: string;
  notes?: string;
  journalEntryId?: mongoose.Types.ObjectId | string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PayrollChallanBreakupSchema = new Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    employeeAmount: { type: Number, default: 0, min: 0 },
    employerAmount: { type: Number, default: 0, min: 0 },
    grossPay: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const PayrollStatutoryChallanSchema = new Schema<IPayrollStatutoryChallan>(
  {
    challanType: { type: String, enum: ['pf', 'esi', 'pt', 'tds'], required: true, index: true },
    periodType: { type: String, enum: ['month', 'quarter'], required: true, default: 'month', index: true },
    periodKey: { type: String, required: true, trim: true, index: true },
    financialYear: { type: String, required: true, trim: true, index: true },
    dueDate: { type: Date, index: true },
    generatedDate: { type: Date, required: true, default: Date.now, index: true },
    paymentDate: { type: Date, index: true },
    challanNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    utrNumber: { type: String, trim: true, uppercase: true },
    bankName: { type: String, trim: true },
    status: { type: String, enum: ['draft', 'generated', 'paid', 'cancelled'], default: 'generated', index: true },
    employeeAmount: { type: Number, default: 0, min: 0 },
    employerAmount: { type: Number, default: 0, min: 0 },
    penaltyAmount: { type: Number, default: 0, min: 0 },
    interestAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    employeeBreakup: { type: [PayrollChallanBreakupSchema], default: [] },
    fileName: { type: String, trim: true },
    fileContent: { type: String },
    notes: { type: String, trim: true },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

PayrollStatutoryChallanSchema.index(
  { tenantId: 1, challanType: 1, periodKey: 1 },
  { unique: true }
);

export const PayrollStatutoryChallan = mongoose.model<IPayrollStatutoryChallan>(
  'PayrollStatutoryChallan',
  PayrollStatutoryChallanSchema
);
