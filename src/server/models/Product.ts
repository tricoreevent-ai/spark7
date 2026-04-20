import mongoose, { Schema, Document } from 'mongoose';
import { IProduct } from '@shared/types';

type IProductDocument = IProduct & Document;

const PriceTierSchema = new Schema(
  {
    tierName: { type: String, trim: true, default: '' },
    minQuantity: { type: Number, min: 1, default: 1 },
    unitPrice: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const VariantMatrixSchema = new Schema(
  {
    size: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '' },
    skuSuffix: { type: String, trim: true, default: '' },
    barcode: { type: String, trim: true, uppercase: true, default: '' },
    price: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const productSchema = new Schema<IProductDocument>(
  {
    name: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    barcode: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      unique: true,
      index: true,
    },
    description: String,
    category: {
      type: String,
      required: true,
    },
    subcategory: {
      type: String,
      default: '',
      trim: true,
    },
    itemType: {
      type: String,
      enum: ['inventory', 'service', 'non_inventory'],
      default: 'inventory',
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    wholesalePrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    promotionalPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    promotionStartDate: {
      type: Date,
      default: undefined,
    },
    promotionEndDate: {
      type: Date,
      default: undefined,
    },
    priceTiers: {
      type: [PriceTierSchema],
      default: [],
    },
    cost: {
      type: Number,
      required: true,
      min: 0,
    },
    taxType: {
      type: String,
      enum: ['gst', 'vat'],
      default: 'gst',
    },
    gstRate: {
      type: Number,
      enum: [0, 5, 12, 18, 28],
      default: 18,
    },
    cgstRate: {
      type: Number,
      min: 0,
      default: 0,
    },
    sgstRate: {
      type: Number,
      min: 0,
      default: 0,
    },
    igstRate: {
      type: Number,
      min: 0,
      default: 0,
    },
    hsnCode: {
      type: String,
      default: '',
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    openingStockValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    stockLedgerAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      index: true,
    },
    returnStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    damagedStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    allowNegativeStock: {
      type: Boolean,
      default: false,
    },
    batchTracking: {
      type: Boolean,
      default: false,
    },
    expiryRequired: {
      type: Boolean,
      default: false,
    },
    serialNumberTracking: {
      type: Boolean,
      default: false,
    },
    variantSize: {
      type: String,
      default: '',
      trim: true,
    },
    variantColor: {
      type: String,
      default: '',
      trim: true,
    },
    variantMatrix: {
      type: [VariantMatrixSchema],
      default: [],
    },
    minStock: {
      type: Number,
      default: 10,
    },
    autoReorder: {
      type: Boolean,
      default: false,
    },
    reorderQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    unit: {
      type: String,
      enum: ['piece', 'pcs', 'kg', 'gram', 'liter', 'ml', 'meter', 'box', 'pack', 'dozen'],
      default: 'piece',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: String,
      trim: true,
      index: true,
    },
    deletionReason: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

export const Product = mongoose.model<IProductDocument>('Product', productSchema);
export type { IProductDocument };
