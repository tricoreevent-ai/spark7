import mongoose, { Document, Schema } from 'mongoose';

export interface IDeliveryChallanItem {
  productId: mongoose.Types.ObjectId | string;
  productName: string;
  sku: string;
  quantity: number;
  allocations?: Array<{
    batchId?: mongoose.Types.ObjectId | string;
    batchNumber?: string;
    locationId?: mongoose.Types.ObjectId | string;
    quantity: number;
  }>;
}

export interface IDeliveryChallan extends Document {
  challanNumber: string;
  orderId: mongoose.Types.ObjectId | string;
  orderNumber: string;
  status: 'issued' | 'cancelled' | 'invoiced';
  challanDate: Date;
  items: IDeliveryChallanItem[];
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DeliveryChallanItemSchema = new Schema<IDeliveryChallanItem>(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    quantity: { type: Number, required: true, min: 0 },
    allocations: {
      type: [{
        batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch' },
        batchNumber: { type: String, trim: true },
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation' },
        quantity: { type: Number, min: 0, default: 0 },
      }],
      default: [],
    },
  },
  { _id: false }
);

const DeliveryChallanSchema = new Schema<IDeliveryChallan>(
  {
    challanNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    status: { type: String, enum: ['issued', 'cancelled', 'invoiced'], default: 'issued', index: true },
    challanDate: { type: Date, required: true, default: Date.now, index: true },
    items: { type: [DeliveryChallanItemSchema], default: [] },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

DeliveryChallanSchema.index({ tenantId: 1, challanNumber: 1 }, { unique: true });

export const DeliveryChallan = mongoose.model<IDeliveryChallan>('DeliveryChallan', DeliveryChallanSchema);
