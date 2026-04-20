import mongoose, { Document, Schema } from 'mongoose';

export type InventoryValuationMethod = 'fifo' | 'weighted_average';

export interface IInventoryValuationSetting extends Document {
  periodKey: string;
  method: InventoryValuationMethod;
  effectiveFrom: Date;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const InventoryValuationSettingSchema = new Schema<IInventoryValuationSetting>(
  {
    periodKey: { type: String, required: true, trim: true, index: true },
    method: {
      type: String,
      enum: ['fifo', 'weighted_average'],
      default: 'weighted_average',
      required: true,
    },
    effectiveFrom: { type: Date, required: true, index: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

InventoryValuationSettingSchema.index({ tenantId: 1, periodKey: 1 }, { unique: true });

export const InventoryValuationSetting = mongoose.model<IInventoryValuationSetting>('InventoryValuationSetting', InventoryValuationSettingSchema);
