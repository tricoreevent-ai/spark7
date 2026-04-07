import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  storeKey: string;
  storeName?: string;
  storeGstin?: string;
  module: string;
  action: string;
  entityType: string;
  entityId?: string;
  referenceNo?: string;
  userId?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
  before?: Record<string, any>;
  after?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    storeKey: { type: String, required: true, trim: true, index: true },
    storeName: { type: String, trim: true },
    storeGstin: { type: String, trim: true, uppercase: true },
    module: { type: String, required: true, trim: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, trim: true, index: true },
    referenceNo: { type: String, trim: true, index: true },
    userId: { type: String, trim: true, index: true },
    ipAddress: { type: String, trim: true, index: true },
    metadata: { type: Schema.Types.Mixed },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1, module: 1 });
AuditLogSchema.index({ storeKey: 1, createdAt: -1 });

const immutableError = () => new Error('Audit logs are immutable and cannot be modified or deleted');

AuditLogSchema.pre('save', function () {
  if (!this.isNew) {
    throw immutableError();
  }
});

AuditLogSchema.pre('updateOne', function () {
  throw immutableError();
});

AuditLogSchema.pre('updateMany', function () {
  throw immutableError();
});

AuditLogSchema.pre('findOneAndUpdate', function () {
  throw immutableError();
});

AuditLogSchema.pre('replaceOne', function () {
  throw immutableError();
});

AuditLogSchema.pre('deleteOne', { document: false, query: true }, function () {
  throw immutableError();
});

AuditLogSchema.pre('deleteMany', function () {
  throw immutableError();
});

AuditLogSchema.pre('findOneAndDelete', function () {
  throw immutableError();
});

AuditLogSchema.pre('deleteOne', { document: true, query: false }, function () {
  throw immutableError();
});

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
