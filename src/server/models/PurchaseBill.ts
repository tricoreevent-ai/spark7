import mongoose, { Document, Schema } from 'mongoose';

export interface IPurchaseBillLine {
  productId: mongoose.Types.ObjectId | string;
  productName: string;
  sku: string;
  receivedQuantity: number;
  unitCost: number;
  taxableValue: number;
  taxAmount: number;
  totalAmount: number;
}

export interface IPurchaseBillDocument extends Document {
  billNumber: string;
  purchaseOrderId: mongoose.Types.ObjectId | string;
  purchaseNumber: string;
  supplierId: mongoose.Types.ObjectId | string;
  supplierName: string;
  billDate: Date;
  status: 'draft' | 'posted' | 'revised';
  lines: IPurchaseBillLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  journalEntryId?: mongoose.Types.ObjectId | string;
  revisionOf?: mongoose.Types.ObjectId | string;
  revisionReason?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PurchaseBillLineSchema = new Schema<IPurchaseBillLine>(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    receivedQuantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    taxableValue: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const PurchaseBillSchema = new Schema<IPurchaseBillDocument>(
  {
    billNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
    purchaseNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierName: { type: String, required: true, trim: true },
    billDate: { type: Date, required: true, default: Date.now, index: true },
    status: { type: String, enum: ['draft', 'posted', 'revised'], default: 'posted', index: true },
    lines: { type: [PurchaseBillLineSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    taxAmount: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', index: true },
    revisionOf: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseBill', index: true },
    revisionReason: { type: String, trim: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

PurchaseBillSchema.index({ purchaseOrderId: 1, status: 1 });
PurchaseBillSchema.index({ tenantId: 1, billNumber: 1 }, { unique: true });

export const PurchaseBill = mongoose.model<IPurchaseBillDocument>('PurchaseBill', PurchaseBillSchema);
