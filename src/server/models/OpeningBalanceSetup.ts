import mongoose, { Document, Schema } from 'mongoose';

export interface IOpeningBalanceSetup extends Document {
  setupKey: string;
  isLocked: boolean;
  initializedAt?: Date;
  initializedBy?: string;
  lockedAt?: Date;
  lockedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const OpeningBalanceSetupSchema = new Schema<IOpeningBalanceSetup>(
  {
    setupKey: { type: String, required: true, default: 'primary', index: true },
    isLocked: { type: Boolean, default: false, index: true },
    initializedAt: { type: Date },
    initializedBy: { type: String, index: true },
    lockedAt: { type: Date },
    lockedBy: { type: String, index: true },
  },
  { timestamps: true }
);

// setupKey must be unique only within a tenant, not globally.
OpeningBalanceSetupSchema.index({ tenantId: 1, setupKey: 1 }, { unique: true });

export const OpeningBalanceSetup = mongoose.model<IOpeningBalanceSetup>('OpeningBalanceSetup', OpeningBalanceSetupSchema);
