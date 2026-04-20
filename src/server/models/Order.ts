import mongoose, { Schema, Document } from 'mongoose';
import { IOrder } from '@shared/types';

// Mongoose document interfaces (use ObjectId for relational fields)
interface IOrderItemDoc {
  productId: mongoose.Types.ObjectId | string;
  productName?: string;
  sku?: string;
  quantity: number;
  price: number;
  gstAmount: number;
  gstRate?: number;
  reservedQuantity?: number;
  deliveredQuantity?: number;
  invoicedQuantity?: number;
  backOrderQuantity?: number;
  reservationAllocations?: Array<{
    batchId?: mongoose.Types.ObjectId | string;
    batchNumber?: string;
    locationId?: mongoose.Types.ObjectId | string;
    locationCode?: string;
    expiryDate?: Date;
    quantity: number;
    unitCost?: number;
  }>;
  deliveryAllocations?: Array<{
    batchId?: mongoose.Types.ObjectId | string;
    batchNumber?: string;
    locationId?: mongoose.Types.ObjectId | string;
    locationCode?: string;
    quantity: number;
    unitCost?: number;
  }>;
}

export type OrderWorkflowStatus =
  | 'pending'
  | 'confirmed'
  | 'partially_reserved'
  | 'reserved'
  | 'back_order'
  | 'partially_dispatched'
  | 'dispatched'
  | 'invoiced'
  | 'processing'
  | 'completed'
  | 'cancelled';

interface IOrderDocument extends Document {
  orderNumber: string;
  userId: mongoose.Types.ObjectId | string;
  items: IOrderItemDoc[];
  totalAmount: number;
  gstAmount: number;
  paymentMethod: 'cash' | 'card' | 'upi' | 'check';
  paymentStatus: 'pending' | 'completed' | 'failed';
  orderStatus: OrderWorkflowStatus;
  reservationStatus?: 'not_reserved' | 'partial' | 'reserved' | 'back_order';
  deliveryStatus?: 'not_dispatched' | 'partial' | 'dispatched';
  invoiceSaleId?: mongoose.Types.ObjectId | string;
  deliveryChallanIds?: Array<mongoose.Types.ObjectId | string>;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderSchema = new Schema<IOrderDocument>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        productName: String,
        sku: String,
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        gstAmount: {
          type: Number,
          required: true,
        },
        gstRate: { type: Number, default: 0 },
        reservedQuantity: { type: Number, default: 0, min: 0 },
        deliveredQuantity: { type: Number, default: 0, min: 0 },
        invoicedQuantity: { type: Number, default: 0, min: 0 },
        backOrderQuantity: { type: Number, default: 0, min: 0 },
        reservationAllocations: {
          type: [{
            batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch' },
            batchNumber: String,
            locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation' },
            locationCode: String,
            expiryDate: Date,
            quantity: { type: Number, default: 0, min: 0 },
            unitCost: { type: Number, default: 0, min: 0 },
          }],
          default: [],
        },
        deliveryAllocations: {
          type: [{
            batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch' },
            batchNumber: String,
            locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation' },
            locationCode: String,
            quantity: { type: Number, default: 0, min: 0 },
            unitCost: { type: Number, default: 0, min: 0 },
          }],
          default: [],
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    gstAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'check'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    orderStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'partially_reserved',
        'reserved',
        'back_order',
        'partially_dispatched',
        'dispatched',
        'invoiced',
        'processing',
        'completed',
        'cancelled',
      ],
      default: 'pending',
    },
    reservationStatus: {
      type: String,
      enum: ['not_reserved', 'partial', 'reserved', 'back_order'],
      default: 'not_reserved',
    },
    deliveryStatus: {
      type: String,
      enum: ['not_dispatched', 'partial', 'dispatched'],
      default: 'not_dispatched',
    },
    invoiceSaleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
    },
    deliveryChallanIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryChallan' }],
      default: [],
    },
    notes: String,
  },
  { timestamps: true }
);

export const Order = mongoose.model<IOrderDocument>('Order', orderSchema);
export type { IOrderDocument };
