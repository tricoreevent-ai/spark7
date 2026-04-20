import mongoose, { Document, Schema } from 'mongoose';

export type PayrollForm16Status = 'draft' | 'generated' | 'emailed' | 'cancelled';

export interface IPayrollForm16 extends Document {
  financialYear: string;
  assessmentYear?: string;
  employeeId: mongoose.Types.ObjectId | string;
  employeeCode: string;
  employeeName: string;
  employeeAddress?: string;
  employeeDesignation?: string;
  pan?: string;
  certificateNumber: string;
  lastUpdatedOn?: Date;
  employerName?: string;
  employerAddress?: string;
  employerPan?: string;
  employerTan?: string;
  employerEmail?: string;
  employerPhone?: string;
  citTds?: string;
  responsiblePersonName?: string;
  responsiblePersonDesignation?: string;
  periodFrom?: Date;
  periodTo?: Date;
  salary17_1?: number;
  perquisites17_2?: number;
  profits17_3?: number;
  salaryFromOtherEmployers?: number;
  travelConcessionExemption?: number;
  gratuityExemption?: number;
  pensionCommutationExemption?: number;
  leaveEncashmentExemption?: number;
  hraExemption?: number;
  otherSection10Exemption?: number;
  totalSection10Exemption?: number;
  salaryFromCurrentEmployer?: number;
  grossSalary: number;
  standardDeduction: number;
  entertainmentAllowance?: number;
  professionalTax: number;
  totalDeductionsUnder16?: number;
  incomeChargeableSalaries?: number;
  housePropertyIncome?: number;
  otherSourcesIncome?: number;
  totalOtherIncome?: number;
  grossTotalIncome?: number;
  deduction80C?: number;
  deduction80CCC?: number;
  deduction80CCD1?: number;
  deduction80CCD1B?: number;
  deduction80CCD2?: number;
  deduction80D?: number;
  deduction80E?: number;
  deduction80G?: number;
  deduction80TTA?: number;
  otherChapterVIADeductions?: number;
  totalChapterVIADeductions?: number;
  taxableIncome: number;
  taxOnTotalIncome?: number;
  rebate87A?: number;
  surcharge?: number;
  healthEducationCess?: number;
  relief89?: number;
  netTaxPayable?: number;
  tdsDeducted: number;
  tdsDeposited?: number;
  quarterlyBreakup?: Array<{
    quarter: string;
    receiptNumber?: string;
    amountPaidCredited: number;
    taxDeducted: number;
    taxDepositedRemitted: number;
  }>;
  challanBreakup?: Array<{
    serialNo: number;
    taxDeposited: number;
    bsrCode?: string;
    depositedDate?: Date;
    challanSerialNumber?: string;
    oltasStatus?: string;
  }>;
  monthlyBreakup: Array<{
    month: string;
    grossPay: number;
    professionalTax: number;
    tdsAmount: number;
    netPay: number;
  }>;
  fileName?: string;
  fileContent?: string;
  status: PayrollForm16Status;
  generatedAt?: Date;
  emailedAt?: Date;
  emailedTo?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PayrollForm16MonthSchema = new Schema(
  {
    month: { type: String, required: true, trim: true },
    grossPay: { type: Number, default: 0, min: 0 },
    professionalTax: { type: Number, default: 0, min: 0 },
    tdsAmount: { type: Number, default: 0, min: 0 },
    netPay: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const PayrollForm16QuarterSchema = new Schema(
  {
    quarter: { type: String, required: true, trim: true },
    receiptNumber: { type: String, trim: true },
    amountPaidCredited: { type: Number, default: 0, min: 0 },
    taxDeducted: { type: Number, default: 0, min: 0 },
    taxDepositedRemitted: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const PayrollForm16ChallanSchema = new Schema(
  {
    serialNo: { type: Number, default: 0, min: 0 },
    taxDeposited: { type: Number, default: 0, min: 0 },
    bsrCode: { type: String, trim: true },
    depositedDate: { type: Date },
    challanSerialNumber: { type: String, trim: true },
    oltasStatus: { type: String, trim: true, default: 'F' },
  },
  { _id: false }
);

const PayrollForm16Schema = new Schema<IPayrollForm16>(
  {
    financialYear: { type: String, required: true, trim: true, index: true },
    assessmentYear: { type: String, trim: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    employeeAddress: { type: String, trim: true },
    employeeDesignation: { type: String, trim: true },
    pan: { type: String, trim: true, uppercase: true, index: true },
    certificateNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    lastUpdatedOn: { type: Date, default: Date.now },
    employerName: { type: String, trim: true },
    employerAddress: { type: String, trim: true },
    employerPan: { type: String, trim: true, uppercase: true },
    employerTan: { type: String, trim: true, uppercase: true },
    employerEmail: { type: String, trim: true, lowercase: true },
    employerPhone: { type: String, trim: true },
    citTds: { type: String, trim: true },
    responsiblePersonName: { type: String, trim: true },
    responsiblePersonDesignation: { type: String, trim: true },
    periodFrom: { type: Date },
    periodTo: { type: Date },
    salary17_1: { type: Number, default: 0, min: 0 },
    perquisites17_2: { type: Number, default: 0, min: 0 },
    profits17_3: { type: Number, default: 0, min: 0 },
    salaryFromOtherEmployers: { type: Number, default: 0, min: 0 },
    travelConcessionExemption: { type: Number, default: 0, min: 0 },
    gratuityExemption: { type: Number, default: 0, min: 0 },
    pensionCommutationExemption: { type: Number, default: 0, min: 0 },
    leaveEncashmentExemption: { type: Number, default: 0, min: 0 },
    hraExemption: { type: Number, default: 0, min: 0 },
    otherSection10Exemption: { type: Number, default: 0, min: 0 },
    totalSection10Exemption: { type: Number, default: 0, min: 0 },
    salaryFromCurrentEmployer: { type: Number, default: 0, min: 0 },
    grossSalary: { type: Number, default: 0, min: 0 },
    standardDeduction: { type: Number, default: 0, min: 0 },
    entertainmentAllowance: { type: Number, default: 0, min: 0 },
    professionalTax: { type: Number, default: 0, min: 0 },
    totalDeductionsUnder16: { type: Number, default: 0, min: 0 },
    incomeChargeableSalaries: { type: Number, default: 0, min: 0 },
    housePropertyIncome: { type: Number, default: 0 },
    otherSourcesIncome: { type: Number, default: 0 },
    totalOtherIncome: { type: Number, default: 0 },
    grossTotalIncome: { type: Number, default: 0, min: 0 },
    deduction80C: { type: Number, default: 0, min: 0 },
    deduction80CCC: { type: Number, default: 0, min: 0 },
    deduction80CCD1: { type: Number, default: 0, min: 0 },
    deduction80CCD1B: { type: Number, default: 0, min: 0 },
    deduction80CCD2: { type: Number, default: 0, min: 0 },
    deduction80D: { type: Number, default: 0, min: 0 },
    deduction80E: { type: Number, default: 0, min: 0 },
    deduction80G: { type: Number, default: 0, min: 0 },
    deduction80TTA: { type: Number, default: 0, min: 0 },
    otherChapterVIADeductions: { type: Number, default: 0, min: 0 },
    totalChapterVIADeductions: { type: Number, default: 0, min: 0 },
    taxableIncome: { type: Number, default: 0, min: 0 },
    taxOnTotalIncome: { type: Number, default: 0, min: 0 },
    rebate87A: { type: Number, default: 0, min: 0 },
    surcharge: { type: Number, default: 0, min: 0 },
    healthEducationCess: { type: Number, default: 0, min: 0 },
    relief89: { type: Number, default: 0, min: 0 },
    netTaxPayable: { type: Number, default: 0, min: 0 },
    tdsDeducted: { type: Number, default: 0, min: 0 },
    tdsDeposited: { type: Number, default: 0, min: 0 },
    quarterlyBreakup: { type: [PayrollForm16QuarterSchema], default: [] },
    challanBreakup: { type: [PayrollForm16ChallanSchema], default: [] },
    monthlyBreakup: { type: [PayrollForm16MonthSchema], default: [] },
    fileName: { type: String, trim: true },
    fileContent: { type: String },
    status: { type: String, enum: ['draft', 'generated', 'emailed', 'cancelled'], default: 'generated', index: true },
    generatedAt: { type: Date, default: Date.now, index: true },
    emailedAt: { type: Date },
    emailedTo: { type: String, trim: true, lowercase: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

PayrollForm16Schema.index({ tenantId: 1, financialYear: 1, employeeId: 1 }, { unique: true });
PayrollForm16Schema.index({ tenantId: 1, certificateNumber: 1 }, { unique: true });

export const PayrollForm16 = mongoose.model<IPayrollForm16>('PayrollForm16', PayrollForm16Schema);
