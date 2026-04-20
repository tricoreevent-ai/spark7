import mongoose, { Document, Schema } from 'mongoose';

export type TdsChallanStatus = 'recorded' | 'reconciled' | 'cancelled';

export interface ITdsChallan extends Document {
  paymentDate: Date;
  financialYear: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  sectionCode?: string;
  amount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  bsrCode: string;
  challanSerialNo: string;
  cin?: string;
  bankName?: string;
  depositMode?: string;
  allocatedTransactionIds: mongoose.Types.ObjectId[];
  status: TdsChallanStatus;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TdsChallanSchema = new Schema<ITdsChallan>(
  {
    paymentDate: { type: Date, required: true, default: Date.now, index: true },
    financialYear: { type: String, required: true, trim: true, index: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], index: true },
    sectionCode: { type: String, trim: true, uppercase: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    allocatedAmount: { type: Number, default: 0, min: 0 },
    unallocatedAmount: { type: Number, default: 0, min: 0 },
    bsrCode: { type: String, required: true, trim: true },
    challanSerialNo: { type: String, required: true, trim: true, index: true },
    cin: { type: String, trim: true, uppercase: true, index: true },
    bankName: { type: String, trim: true },
    depositMode: { type: String, trim: true },
    allocatedTransactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TdsTransaction' }],
    status: { type: String, enum: ['recorded', 'reconciled', 'cancelled'], default: 'recorded', index: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

TdsChallanSchema.index({ tenantId: 1, financialYear: 1, challanSerialNo: 1 }, { unique: true });
TdsChallanSchema.index({ tenantId: 1, status: 1, paymentDate: -1 });

export const TdsChallan = mongoose.model<ITdsChallan>('TdsChallan', TdsChallanSchema);
