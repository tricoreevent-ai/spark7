import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplierDocument extends Document {
  supplierCode: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  performanceScore: number;
  accountingVendorId?: mongoose.Types.ObjectId | string;
  payableLedgerAccountId?: mongoose.Types.ObjectId | string;
  accountingLinkedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const supplierSchema = new Schema<ISupplierDocument>(
  {
    supplierCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
      index: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    performanceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    accountingVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      index: true,
    },
    payableLedgerAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      index: true,
    },
    accountingLinkedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 });
supplierSchema.index({ phone: 1 });
supplierSchema.index({ email: 1 });

export const Supplier = mongoose.model<ISupplierDocument>('Supplier', supplierSchema);
