import mongoose, { Document, Schema } from 'mongoose';

export type IdempotencyStatus = 'in_progress' | 'completed';

export interface IIdempotencyKey extends Document {
  scope: string;
  idempotencyKey: string;
  method: string;
  route: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseStatus?: number;
  responseBody?: Record<string, any>;
  createdBy?: string;
  lastReplayedAt?: Date;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    scope: { type: String, required: true, trim: true, index: true },
    idempotencyKey: { type: String, required: true, trim: true, index: true },
    method: { type: String, required: true, trim: true },
    route: { type: String, required: true, trim: true },
    requestHash: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
      index: true,
    },
    responseStatus: { type: Number },
    responseBody: { type: Schema.Types.Mixed },
    createdBy: { type: String, trim: true, index: true },
    lastReplayedAt: { type: Date },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
    collection: 'idempotency_keys',
  }
);

IdempotencyKeySchema.index({ tenantId: 1, scope: 1, idempotencyKey: 1 }, { unique: true });

export const IdempotencyKey = mongoose.model<IIdempotencyKey>('IdempotencyKey', IdempotencyKeySchema);
