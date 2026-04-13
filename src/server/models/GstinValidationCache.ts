import mongoose, { Document, Schema } from 'mongoose';

export interface IGstinValidationCache extends Document {
  gstin: string;
  isValid: boolean;
  formatValid: boolean;
  checksumValid: boolean;
  stateCode?: string;
  pan?: string;
  registrationStatus?: string;
  legalName?: string;
  address?: string;
  source: 'local_checksum' | 'manual' | 'gstn' | 'gsp';
  validatedAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const GstinValidationCacheSchema = new Schema<IGstinValidationCache>(
  {
    gstin: { type: String, required: true, trim: true, uppercase: true, index: true },
    isValid: { type: Boolean, required: true, index: true },
    formatValid: { type: Boolean, required: true },
    checksumValid: { type: Boolean, required: true },
    stateCode: { type: String, trim: true },
    pan: { type: String, trim: true, uppercase: true },
    registrationStatus: { type: String, trim: true },
    legalName: { type: String, trim: true },
    address: { type: String, trim: true },
    source: {
      type: String,
      enum: ['local_checksum', 'manual', 'gstn', 'gsp'],
      default: 'local_checksum',
      index: true,
    },
    validatedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

GstinValidationCacheSchema.index({ tenantId: 1, gstin: 1 }, { unique: true });

export const GstinValidationCache = mongoose.model<IGstinValidationCache>('GstinValidationCache', GstinValidationCacheSchema);
