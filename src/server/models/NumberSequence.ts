import mongoose, { Document, Schema } from 'mongoose';

export interface INumberSequenceDocument extends Document {
  key: string;
  value: number;
  updatedAt?: Date;
}

const NumberSequenceSchema = new Schema<INumberSequenceDocument>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    value: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// sequence key must be unique only within a tenant.
NumberSequenceSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const NumberSequence = mongoose.model<INumberSequenceDocument>('NumberSequence', NumberSequenceSchema);
