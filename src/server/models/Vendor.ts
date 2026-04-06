import mongoose, { Document, Schema } from 'mongoose';

export interface IVendor extends Document {
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  ledgerAccountId: mongoose.Types.ObjectId;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const VendorSchema = new Schema<IVendor>(
  {
    name: { type: String, required: true, trim: true, index: true },
    contact: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
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
