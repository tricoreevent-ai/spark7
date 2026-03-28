import mongoose, { Document, Schema } from 'mongoose';

export interface IQuoteItem {
  productId: string;
  productName: string;
  sku?: string;
  itemType?: 'inventory' | 'service' | 'non_inventory';
  quantity: number;
  unitPrice: number;
  listPrice?: number;
  discountAmount?: number;
  discountPercentage?: number;
  gstRate?: number;
  taxType?: 'gst' | 'vat';
  taxableValue?: number;
  gstAmount?: number;
  lineTotal?: number;
}

export interface IQuote extends Document {
  quoteNumber: string;
  quoteGroupCode: string;
  version: number;
  sourceQuoteId?: string;
  quoteStatus: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'converted';
  validUntil?: Date;
  pricingMode?: 'retail' | 'wholesale' | 'customer';
  taxMode?: 'inclusive' | 'exclusive';
  isGstBill?: boolean;
  customerId?: string;
  customerCode?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  contactPerson?: string;
  contactRole?: string;
  approval?: {
    approvedByName?: string;
    approvedAt?: Date;
    method?: 'digital' | 'manual';
    notes?: string;
  };
  items: IQuoteItem[];
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  notes?: string;
  convertedSaleId?: string;
  convertedSaleNumber?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const QuoteItemSchema = new Schema<IQuoteItem>(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    sku: String,
    itemType: { type: String, enum: ['inventory', 'service', 'non_inventory'], default: 'inventory' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    listPrice: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    discountPercentage: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, default: 0 },
    taxType: { type: String, enum: ['gst', 'vat'], default: 'gst' },
    taxableValue: { type: Number, min: 0, default: 0 },
    gstAmount: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const QuoteSchema = new Schema<IQuote>(
  {
    quoteNumber: { type: String, required: true, unique: true, index: true },
    quoteGroupCode: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    sourceQuoteId: { type: String, index: true },
    quoteStatus: {
      type: String,
      enum: ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'],
      default: 'draft',
      index: true,
    },
    validUntil: { type: Date, index: true },
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
    customerId: { type: String, index: true },
    customerCode: String,
    customerName: String,
    customerPhone: String,
    customerEmail: String,
    contactPerson: String,
    contactRole: String,
    approval: {
      approvedByName: String,
      approvedAt: Date,
      method: { type: String, enum: ['digital', 'manual'], default: 'digital' },
      notes: String,
    },
    items: { type: [QuoteItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    totalGst: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    notes: String,
    convertedSaleId: { type: String, index: true },
    convertedSaleNumber: String,
    createdBy: { type: String, index: true },
    updatedBy: { type: String, index: true },
  },
  { timestamps: true }
);

QuoteSchema.index({ quoteGroupCode: 1, version: -1 });

export const Quote = mongoose.model<IQuote>('Quote', QuoteSchema);
