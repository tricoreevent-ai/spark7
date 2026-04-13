import mongoose, { Document, Schema } from 'mongoose';

export type TreasuryPaymentMethod =
  | 'cash'
  | 'bank'
  | 'card'
  | 'upi'
  | 'cheque'
  | 'online'
  | 'bank_transfer'
  | 'original_payment';

export interface IPaymentMethodRouting extends Document {
  paymentMethod: TreasuryPaymentMethod;
  channelLabel?: string;
  processorName?: string;
  treasuryAccountId: mongoose.Types.ObjectId;
  settlementDays: number;
  feePercent: number;
  fixedFee: number;
  isDefault: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentMethodRoutingSchema = new Schema<IPaymentMethodRouting>(
  {
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', 'card', 'upi', 'cheque', 'online', 'bank_transfer', 'original_payment'],
      required: true,
      index: true,
    },
    channelLabel: { type: String, trim: true, lowercase: true, default: '' },
    processorName: { type: String, trim: true },
    treasuryAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    settlementDays: { type: Number, default: 0, min: 0, max: 30 },
    feePercent: { type: Number, default: 0, min: 0, max: 100 },
    fixedFee: { type: Number, default: 0, min: 0 },
    isDefault: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

PaymentMethodRoutingSchema.index(
  { tenantId: 1, paymentMethod: 1, channelLabel: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  }
);

export const PaymentMethodRouting = mongoose.model<IPaymentMethodRouting>('PaymentMethodRouting', PaymentMethodRoutingSchema);
