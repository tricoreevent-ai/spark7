import mongoose, { Schema, Document } from 'mongoose';

export interface IInventoryTransferDocument extends Document {
  productId: mongoose.Types.ObjectId | string;
  quantity: number;
  fromWarehouseLocation?: string;
  fromStoreLocation?: string;
  fromRackLocation?: string;
  fromShelfLocation?: string;
  toWarehouseLocation?: string;
  toStoreLocation?: string;
  toRackLocation?: string;
  toShelfLocation?: string;
  reason?: string;
  transferredBy?: mongoose.Types.ObjectId | string;
  transferredAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const inventoryTransferSchema = new Schema<IInventoryTransferDocument>(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    fromWarehouseLocation: { type: String, default: '' },
    fromStoreLocation: { type: String, default: '' },
    fromRackLocation: { type: String, default: '' },
    fromShelfLocation: { type: String, default: '' },
    toWarehouseLocation: { type: String, default: '' },
    toStoreLocation: { type: String, default: '' },
    toRackLocation: { type: String, default: '' },
    toShelfLocation: { type: String, default: '' },
    reason: { type: String, default: '' },
    transferredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    transferredAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

inventoryTransferSchema.index({ transferredAt: -1 });

export const InventoryTransfer = mongoose.model<IInventoryTransferDocument>('InventoryTransfer', inventoryTransferSchema);
