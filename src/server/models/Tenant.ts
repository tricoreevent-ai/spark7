import mongoose, { Document, Schema } from 'mongoose';

export interface ITenantDocument extends Document {
  name: string;
  slug: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const tenantSchema = new Schema<ITenantDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true, tenantScoped: false, tenantUniqueRewrite: false } as any
);

export const Tenant = mongoose.model<ITenantDocument>('Tenant', tenantSchema);

