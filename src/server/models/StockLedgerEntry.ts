import mongoose, { Document, Schema } from 'mongoose';

export type StockTransactionType =
  | 'legacy_opening'
  | 'purchase_receive'
  | 'sale_reserve'
  | 'sale_dispatch'
  | 'sale_invoice'
  | 'reservation_release'
  | 'adjustment_gain'
  | 'adjustment_loss'
  | 'transfer_out'
  | 'transfer_in'
  | 'back_order';

export interface IStockLedgerEntry extends Document {
  productId: mongoose.Types.ObjectId | string;
  locationId?: mongoose.Types.ObjectId | string;
  batchId?: mongoose.Types.ObjectId | string;
  transactionType: StockTransactionType;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  quantityIn: number;
  quantityOut: number;
  reservedDelta: number;
  dispatchedDelta: number;
  unitCost: number;
  valueIn: number;
  valueOut: number;
  oldQuantity?: number;
  newQuantity?: number;
  oldReservedQuantity?: number;
  newReservedQuantity?: number;
  oldDispatchedQuantity?: number;
  newDispatchedQuantity?: number;
  metadata?: Record<string, any>;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const StockLedgerEntrySchema = new Schema<IStockLedgerEntry>(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation', index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch', index: true },
    transactionType: {
      type: String,
      enum: [
        'legacy_opening',
        'purchase_receive',
        'sale_reserve',
        'sale_dispatch',
        'sale_invoice',
        'reservation_release',
        'adjustment_gain',
        'adjustment_loss',
        'transfer_out',
        'transfer_in',
        'back_order',
      ],
      required: true,
      index: true,
    },
    referenceType: { type: String, trim: true, index: true },
    referenceId: { type: String, trim: true, index: true },
    referenceNo: { type: String, trim: true, index: true },
    quantityIn: { type: Number, min: 0, default: 0 },
    quantityOut: { type: Number, min: 0, default: 0 },
    reservedDelta: { type: Number, default: 0 },
    dispatchedDelta: { type: Number, default: 0 },
    unitCost: { type: Number, min: 0, default: 0 },
    valueIn: { type: Number, min: 0, default: 0 },
    valueOut: { type: Number, min: 0, default: 0 },
    oldQuantity: { type: Number },
    newQuantity: { type: Number },
    oldReservedQuantity: { type: Number },
    newReservedQuantity: { type: Number },
    oldDispatchedQuantity: { type: Number },
    newDispatchedQuantity: { type: Number },
    metadata: { type: Schema.Types.Mixed },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

StockLedgerEntrySchema.index({ productId: 1, createdAt: -1 });
StockLedgerEntrySchema.index({ locationId: 1, createdAt: -1 });

const immutableError = () => new Error('Stock ledger entries are append-only and cannot be modified or deleted');
StockLedgerEntrySchema.pre('updateOne', function () { throw immutableError(); });
StockLedgerEntrySchema.pre('updateMany', function () { throw immutableError(); });
StockLedgerEntrySchema.pre('findOneAndUpdate', function () { throw immutableError(); });
StockLedgerEntrySchema.pre('deleteOne', { document: false, query: true }, function () { throw immutableError(); });
StockLedgerEntrySchema.pre('deleteMany', function () { throw immutableError(); });
StockLedgerEntrySchema.pre('findOneAndDelete', function () { throw immutableError(); });

export const StockLedgerEntry = mongoose.model<IStockLedgerEntry>('StockLedgerEntry', StockLedgerEntrySchema);
