import mongoose, { Schema, Document } from 'mongoose';

export type EmploymentType = 'salaried' | 'daily' | 'contractor';

export interface IEmployee extends Document {
  employeeCode: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  designation?: string;
  pan?: string;
  aadhaar?: string;
  uan?: string;
  esiNumber?: string;
  pfAccountNumber?: string;
  state?: string;
  employmentType: EmploymentType;
  monthlySalary?: number;
  basicSalary?: number;
  dearnessAllowance?: number;
  hra?: number;
  conveyanceAllowance?: number;
  specialAllowance?: number;
  dailyRate?: number;
  overtimeHourlyRate?: number;
  pfEnabled?: boolean;
  esiEnabled?: boolean;
  professionalTaxEnabled?: boolean;
  professionalTax?: number;
  tdsEnabled?: boolean;
  monthlyTdsOverride?: number;
  paidLeave: boolean;
  active: boolean;
  joinDate?: Date;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    employeeCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    designation: { type: String, trim: true },
    pan: { type: String, trim: true, uppercase: true, index: true },
    aadhaar: { type: String, trim: true },
    uan: { type: String, trim: true },
    esiNumber: { type: String, trim: true },
    pfAccountNumber: { type: String, trim: true },
    state: { type: String, trim: true },
    employmentType: {
      type: String,
      enum: ['salaried', 'daily', 'contractor'],
      required: true,
      default: 'salaried',
    },
    monthlySalary: { type: Number, min: 0, default: 0 },
    basicSalary: { type: Number, min: 0, default: 0 },
    dearnessAllowance: { type: Number, min: 0, default: 0 },
    hra: { type: Number, min: 0, default: 0 },
    conveyanceAllowance: { type: Number, min: 0, default: 0 },
    specialAllowance: { type: Number, min: 0, default: 0 },
    dailyRate: { type: Number, min: 0, default: 0 },
    overtimeHourlyRate: { type: Number, min: 0, default: 0 },
    pfEnabled: { type: Boolean, default: true },
    esiEnabled: { type: Boolean, default: true },
    professionalTaxEnabled: { type: Boolean, default: false },
    professionalTax: { type: Number, min: 0, default: 0 },
    tdsEnabled: { type: Boolean, default: false },
    monthlyTdsOverride: { type: Number, min: 0, default: 0 },
    paidLeave: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    joinDate: { type: Date, default: Date.now },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

EmployeeSchema.index({ name: 1, active: 1 });

export const Employee = mongoose.model<IEmployee>('Employee', EmployeeSchema);
