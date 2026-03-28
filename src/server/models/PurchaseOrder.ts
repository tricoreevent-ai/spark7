import mongoose, { Schema, Document } from 'mongoose';

export interface IPurchaseItem {
  productId: mongoose.Types.ObjectId | string;
  productName: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  lineTotal: number;
  batchNumber?: string;
  expiryDate?: Date;
  serialNumbers?: string[];
}

export interface IPurchaseOrderDocument extends Document {
  purchaseNumber: string;
  supplierId: mongoose.Types.ObjectId | string;
  status: 'pending' | 'partially_received' | 'completed' | 'cancelled' | 'returned';
  orderDate: Date;
  expectedDate?: Date;
  receivedDate?: Date;
  items: IPurchaseItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  returnReason?: string;
  createdBy?: mongoose.Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

const purchaseItemSchema = new Schema<IPurchaseItem>(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    batchNumber: { type: String, default: '' },
    expiryDate: Date,
    serialNumbers: { type: [String], default: [] },
  },
  { _id: false }
);

const purchaseOrderSchema = new Schema<IPurchaseOrderDocument>(
  {
    purchaseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'partially_received', 'completed', 'cancelled', 'returned'],
      default: 'pending',
      index: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    expectedDate: Date,
    receivedDate: Date,
    items: {
      type: [purchaseItemSchema],
      default: [],
    },
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    notes: { type: String, default: '' },
    returnReason: { type: String, default: '' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ createdAt: -1 });

export const PurchaseOrder = mongoose.model<IPurchaseOrderDocument>('PurchaseOrder', purchaseOrderSchema);
