import mongoose, { Document, Schema } from 'mongoose';

export type StockLocationType = 'warehouse' | 'godown' | 'store' | 'branch';

export interface IStockLocation extends Document {
  locationCode: string;
  name: string;
  locationType: StockLocationType;
  address?: string;
  isDefault: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const StockLocationSchema = new Schema<IStockLocation>(
  {
    locationCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    locationType: {
      type: String,
      enum: ['warehouse', 'godown', 'store', 'branch'],
      default: 'store',
      index: true,
    },
    address: { type: String, trim: true },
    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

StockLocationSchema.index({ tenantId: 1, locationCode: 1 }, { unique: true });

export const StockLocation = mongoose.model<IStockLocation>('StockLocation', StockLocationSchema);
