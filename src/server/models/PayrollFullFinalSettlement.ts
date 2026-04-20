import mongoose, { Document, Schema } from 'mongoose';

export type PayrollSettlementStatus = 'draft' | 'finalized' | 'paid' | 'cancelled';

export interface IPayrollFullFinalSettlement extends Document {
  employeeId: mongoose.Types.ObjectId | string;
  employeeCode: string;
  employeeName: string;
  terminationDate: Date;
  lastWorkingDate: Date;
  settlementDate: Date;
  monthlySalary: number;
  noticePayDays: number;
  noticePay: number;
  leaveEncashmentDays: number;
  leaveEncashment: number;
  gratuityYears: number;
  gratuityAmount: number;
  otherEarnings: number;
  recoveries: number;
  tdsAmount: number;
  grossSettlement: number;
  totalDeductions: number;
  netSettlement: number;
  status: PayrollSettlementStatus;
  fileName?: string;
  fileContent?: string;
  notes?: string;
  journalEntryId?: mongoose.Types.ObjectId | string;
  createdBy?: string;
  finalizedBy?: string;
  finalizedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PayrollFullFinalSettlementSchema = new Schema<IPayrollFullFinalSettlement>(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    terminationDate: { type: Date, required: true, index: true },
    lastWorkingDate: { type: Date, required: true, index: true },
    settlementDate: { type: Date, required: true, default: Date.now, index: true },
    monthlySalary: { type: Number, default: 0, min: 0 },
    noticePayDays: { type: Number, default: 0, min: 0 },
    noticePay: { type: Number, default: 0, min: 0 },
    leaveEncashmentDays: { type: Number, default: 0, min: 0 },
    leaveEncashment: { type: Number, default: 0, min: 0 },
    gratuityYears: { type: Number, default: 0, min: 0 },
    gratuityAmount: { type: Number, default: 0, min: 0 },
    otherEarnings: { type: Number, default: 0, min: 0 },
    recoveries: { type: Number, default: 0, min: 0 },
    tdsAmount: { type: Number, default: 0, min: 0 },
    grossSettlement: { type: Number, default: 0, min: 0 },
    totalDeductions: { type: Number, default: 0, min: 0 },
    netSettlement: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['draft', 'finalized', 'paid', 'cancelled'], default: 'finalized', index: true },
    fileName: { type: String, trim: true },
    fileContent: { type: String },
    notes: { type: String, trim: true },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
    createdBy: { type: String, trim: true, index: true },
    finalizedBy: { type: String, trim: true },
    finalizedAt: { type: Date },
  },
  { timestamps: true }
);

PayrollFullFinalSettlementSchema.index({ tenantId: 1, employeeId: 1, terminationDate: 1 });

export const PayrollFullFinalSettlement = mongoose.model<IPayrollFullFinalSettlement>(
  'PayrollFullFinalSettlement',
  PayrollFullFinalSettlementSchema
);
