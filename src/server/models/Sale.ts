import mongoose, { Schema, Document } from 'mongoose';

export interface ISaleItem {
  productId: string;
  productName: string;
  sku?: string;
  category?: string;
  subcategory?: string;
  itemType?: 'inventory' | 'service' | 'non_inventory';
  hsnCode?: string;
  batchNo?: string;
  expiryDate?: Date | string;
  serialNumbers?: string[];
  variantSize?: string;
  variantColor?: string;
  quantity: number;
  unitPrice: number;
  listPrice?: number;
  discountAmount?: number;
  discountPercentage?: number;
  taxableValue?: number;
  gstRate?: number;
  gstAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  batchAllocations?: Array<{
    batchId?: string;
    batchNumber?: string;
    locationId?: string;
    locationCode?: string;
    expiryDate?: Date | string;
    quantity: number;
    unitCost: number;
    valueOut?: number;
  }>;
  cogsAmount?: number;
  taxType?: 'gst' | 'vat';
  vatAmount?: number;
  lineTotal?: number; // quantity * unitPrice + gstAmount
}

export interface ISale {
  _id?: string;
  saleNumber: string; // Auto-generated unique sales number
  invoiceNumber?: string;
  userId?: string; // Reference to user who made the sale
  invoiceType: 'cash' | 'credit';
  invoiceStatus: 'draft' | 'posted' | 'cancelled';
  isLocked: boolean;
  pricingMode?: 'retail' | 'wholesale' | 'customer';
  taxMode?: 'inclusive' | 'exclusive';
  isGstBill?: boolean;
  items: ISaleItem[];
  subtotal: number; // Sum of all line totals before GST
  totalGst: number; // Total GST amount
  grossTotal?: number; // Total before round-off
  roundOffAmount?: number;
  totalAmount: number; // Final amount including GST
  paymentMethod: 'cash' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
  treasuryAccountId?: string;
  treasuryAccountName?: string;
  expectedSettlementDate?: Date;
  paymentChannelLabel?: string;
  processorName?: string;
  paymentStatus: 'pending' | 'completed' | 'failed';
  saleStatus: 'draft' | 'completed' | 'cancelled' | 'returned';
  outstandingAmount?: number;
  creditAppliedAmount?: number;
  dueDate?: Date;
  customerId?: string;
  customerCode?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  discountAmount?: number;
  discountPercentage?: number;
  priceOverrideRequired?: boolean;
  priceOverrideApprovedBy?: string;
  postedAt?: Date;
  postedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    saleNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    invoiceType: {
      type: String,
      enum: ['cash', 'credit'],
      default: 'cash',
    },
    invoiceStatus: {
      type: String,
      enum: ['draft', 'posted', 'cancelled'],
      default: 'posted',
      index: true,
    },
    isLocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    pricingMode: {
      type: String,
      enum: ['retail', 'wholesale', 'customer'],
      default: 'retail',
    },
    taxMode: {
      type: String,
      enum: ['inclusive', 'exclusive'],
      default: 'exclusive',
    },
    isGstBill: { type: Boolean, default: true },
    items: [
      {
        productId: String,
        productName: String,
        sku: String,
        category: String,
        subcategory: String,
        itemType: { type: String, enum: ['inventory', 'service', 'non_inventory'], default: 'inventory' },
        hsnCode: String,
        batchNo: String,
        expiryDate: Date,
        serialNumbers: { type: [String], default: [] },
        variantSize: String,
        variantColor: String,
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        listPrice: Number,
        discountAmount: Number,
        discountPercentage: Number,
        taxableValue: Number,
        gstRate: { type: Number, default: 18 },
        gstAmount: Number,
        cgstAmount: Number,
        sgstAmount: Number,
        batchAllocations: {
          type: [{
            batchId: String,
            batchNumber: String,
            locationId: String,
            locationCode: String,
            expiryDate: Date,
            quantity: { type: Number, default: 0, min: 0 },
            unitCost: { type: Number, default: 0, min: 0 },
            valueOut: { type: Number, default: 0, min: 0 },
          }],
          default: [],
        },
        cogsAmount: { type: Number, default: 0, min: 0 },
        taxType: { type: String, enum: ['gst', 'vat'], default: 'gst' },
        vatAmount: Number,
        lineTotal: Number,
      },
    ],
    subtotal: { type: Number, default: 0 },
    totalGst: { type: Number, default: 0 },
    grossTotal: { type: Number, default: 0 },
    roundOffAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'cheque', 'online', 'bank_transfer'],
      default: 'cash',
    },
    treasuryAccountId: { type: String, trim: true, index: true },
    treasuryAccountName: { type: String, trim: true },
    expectedSettlementDate: { type: Date, index: true },
    paymentChannelLabel: { type: String, trim: true, lowercase: true },
    processorName: { type: String, trim: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    saleStatus: {
      type: String,
      enum: ['draft', 'completed', 'cancelled', 'returned'],
      default: 'draft',
    },
    outstandingAmount: { type: Number, default: 0 },
    creditAppliedAmount: { type: Number, default: 0 },
    dueDate: { type: Date, index: true },
    customerId: { type: String, index: true },
    customerCode: String,
    customerName: String,
    customerPhone: String,
    customerEmail: String,
    notes: String,
    discountAmount: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    priceOverrideRequired: { type: Boolean, default: false },
    priceOverrideApprovedBy: { type: String, index: true },
    postedAt: { type: Date, index: true },
    postedBy: { type: String, index: true },
  },
  { timestamps: true }
);

export const Sale = mongoose.model<ISale>('Sale', SaleSchema);
