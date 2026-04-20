import mongoose, { Document, Schema } from 'mongoose';

export interface IInventoryBatch extends Document {
  productId: mongoose.Types.ObjectId | string;
  locationId: mongoose.Types.ObjectId | string;
  locationCode: string;
  locationName: string;
  batchNumber: string;
  manufacturingDate?: Date;
  expiryDate?: Date;
  receivedDate: Date;
  originalQuantity: number;
  quantity: number;
  reservedQuantity: number;
  dispatchedQuantity: number;
  unitCost: number;
  sourceType: 'opening' | 'purchase' | 'adjustment' | 'transfer' | 'legacy';
  sourceId?: string;
  referenceNo?: string;
  status: 'active' | 'expired' | 'depleted';
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const InventoryBatchSchema = new Schema<IInventoryBatch>(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation', required: true, index: true },
    locationCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    locationName: { type: String, required: true, trim: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    manufacturingDate: { type: Date },
    expiryDate: { type: Date, index: true },
    receivedDate: { type: Date, required: true, default: Date.now, index: true },
    originalQuantity: { type: Number, required: true, min: 0, default: 0 },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    reservedQuantity: { type: Number, required: true, min: 0, default: 0 },
    dispatchedQuantity: { type: Number, required: true, min: 0, default: 0 },
    unitCost: { type: Number, required: true, min: 0, default: 0 },
    sourceType: {
      type: String,
      enum: ['opening', 'purchase', 'adjustment', 'transfer', 'legacy'],
      default: 'purchase',
      index: true,
    },
    sourceId: { type: String, trim: true, index: true },
    referenceNo: { type: String, trim: true, index: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'depleted'],
      default: 'active',
      index: true,
    },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

InventoryBatchSchema.index({ tenantId: 1, productId: 1, locationId: 1, batchNumber: 1 });
InventoryBatchSchema.index({ productId: 1, locationId: 1, expiryDate: 1, receivedDate: 1 });

export const InventoryBatch = mongoose.model<IInventoryBatch>('InventoryBatch', InventoryBatchSchema);
