import mongoose, { Document, Schema } from 'mongoose';

export interface IVendor extends Document {
  name: string;
  groupId?: mongoose.Types.ObjectId;
  groupName?: string;
  contact?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  isTdsApplicable: boolean;
  deducteeType?: string;
  tdsSectionCode?: string;
  tdsRate?: number;
  openingBalance: number;
  openingSide: 'debit' | 'credit';
  ledgerAccountId: mongoose.Types.ObjectId;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const VendorSchema = new Schema<IVendor>(
  {
    name: { type: String, required: true, trim: true, index: true },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountGroup',
      index: true,
    },
    groupName: { type: String, trim: true, index: true },
    contact: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true, index: true },
    pan: { type: String, trim: true, uppercase: true, index: true },
    address: { type: String, trim: true },
    isTdsApplicable: { type: Boolean, default: false, index: true },
    deducteeType: { type: String, trim: true, lowercase: true, index: true },
    tdsSectionCode: { type: String, trim: true, uppercase: true, index: true },
    tdsRate: { type: Number, min: 0, default: 0 },
    openingBalance: { type: Number, min: 0, default: 0 },
    openingSide: { type: String, enum: ['debit', 'credit'], default: 'credit' },
    ledgerAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

VendorSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Vendor = mongoose.model<IVendor>('Vendor', VendorSchema);
