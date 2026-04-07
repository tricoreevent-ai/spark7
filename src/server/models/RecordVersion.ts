import mongoose, { Document, Schema } from 'mongoose';

export interface IRecordVersion extends Document {
  module: string;
  entityType: string;
  recordId: string;
  versionNumber: number;
  action: string;
  dataSnapshot: Record<string, any>;
  changedBy?: string;
  changedAt: Date;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const RecordVersionSchema = new Schema<IRecordVersion>(
  {
    module: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    recordId: { type: String, required: true, trim: true, index: true },
    versionNumber: { type: Number, required: true, min: 1 },
    action: { type: String, required: true, trim: true, index: true },
    dataSnapshot: { type: Schema.Types.Mixed, required: true },
    changedBy: { type: String, trim: true, index: true },
    changedAt: { type: Date, required: true, default: Date.now, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: 'record_versions',
  }
);

RecordVersionSchema.index({ tenantId: 1, module: 1, entityType: 1, recordId: 1, versionNumber: 1 }, { unique: true });
RecordVersionSchema.index({ module: 1, entityType: 1, recordId: 1, changedAt: -1 });

const immutableError = () => new Error('Record versions are immutable and cannot be modified or deleted');

RecordVersionSchema.pre('save', function () {
  if (!this.isNew) {
    throw immutableError();
  }
});

RecordVersionSchema.pre('updateOne', function () {
  throw immutableError();
});

RecordVersionSchema.pre('updateMany', function () {
  throw immutableError();
});

RecordVersionSchema.pre('findOneAndUpdate', function () {
  throw immutableError();
});

RecordVersionSchema.pre('replaceOne', function () {
  throw immutableError();
});

RecordVersionSchema.pre('deleteOne', { document: false, query: true }, function () {
  throw immutableError();
});

RecordVersionSchema.pre('deleteMany', function () {
  throw immutableError();
});

RecordVersionSchema.pre('findOneAndDelete', function () {
  throw immutableError();
});

RecordVersionSchema.pre('deleteOne', { document: true, query: false }, function () {
  throw immutableError();
});

export const RecordVersion = mongoose.model<IRecordVersion>('RecordVersion', RecordVersionSchema);
