import mongoose, { Document, Schema } from 'mongoose';

export type AuditFlagSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AuditFlagStatus = 'open' | 'resolved';

export interface IAuditFlag extends Document {
  storeKey: string;
  storeName?: string;
  storeGstin?: string;
  module: string;
  flagType: string;
  severity: AuditFlagSeverity;
  status: AuditFlagStatus;
  entityType?: string;
  entityId?: string;
  referenceNo?: string;
  message: string;
  dedupeKey?: string;
  metadata?: Record<string, any>;
  detectedBy?: string;
  detectedAt: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNote?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AuditFlagSchema = new Schema<IAuditFlag>(
  {
    storeKey: { type: String, required: true, trim: true, index: true },
    storeName: { type: String, trim: true },
    storeGstin: { type: String, trim: true, uppercase: true },
    module: { type: String, required: true, trim: true, index: true },
    flagType: { type: String, required: true, trim: true, index: true },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
      index: true,
    },
    entityType: { type: String, trim: true, index: true },
    entityId: { type: String, trim: true, index: true },
    referenceNo: { type: String, trim: true, index: true },
    message: { type: String, required: true, trim: true },
    dedupeKey: { type: String, trim: true, index: true },
    metadata: { type: Schema.Types.Mixed },
    detectedBy: { type: String, trim: true, index: true },
    detectedAt: { type: Date, required: true, default: Date.now, index: true },
    resolvedBy: { type: String, trim: true },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'audit_flags',
  }
);

AuditFlagSchema.index({ storeKey: 1, detectedAt: -1 });
AuditFlagSchema.index({ module: 1, flagType: 1, status: 1, detectedAt: -1 });
AuditFlagSchema.index({ dedupeKey: 1, status: 1, detectedAt: -1 });

export const AuditFlag = mongoose.model<IAuditFlag>('AuditFlag', AuditFlagSchema);
