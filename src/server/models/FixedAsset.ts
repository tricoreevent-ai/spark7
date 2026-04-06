import mongoose, { Document, Schema } from 'mongoose';

export type FixedAssetStatus = 'active' | 'disposed';

export interface IFixedAsset extends Document {
  assetName: string;
  description?: string;
  cost: number;
  lifeYears: number;
  purchaseDate: Date;
  assetAccountId: mongoose.Types.ObjectId;
  depreciationExpenseAccountId: mongoose.Types.ObjectId;
  accumulatedDepreciationAccountId: mongoose.Types.ObjectId;
  totalDepreciationPosted: number;
  lastDepreciationDate?: Date;
  status: FixedAssetStatus;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const FixedAssetSchema = new Schema<IFixedAsset>(
  {
    assetName: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true },
    cost: { type: Number, required: true, min: 0 },
    lifeYears: { type: Number, required: true, min: 1 },
    purchaseDate: { type: Date, required: true, default: Date.now, index: true },
    assetAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      required: true,
      index: true,
    },
    depreciationExpenseAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      required: true,
      index: true,
    },
    accumulatedDepreciationAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartAccount',
      required: true,
      index: true,
    },
    totalDepreciationPosted: { type: Number, default: 0, min: 0 },
    lastDepreciationDate: { type: Date },
    status: { type: String, enum: ['active', 'disposed'], default: 'active', index: true },
    createdBy: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

FixedAssetSchema.index({ tenantId: 1, assetName: 1, purchaseDate: 1 });

export const FixedAsset = mongoose.model<IFixedAsset>('FixedAsset', FixedAssetSchema);
