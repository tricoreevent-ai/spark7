import mongoose, { Connection, Model, Schema } from 'mongoose';
import { ValidationReportDocument } from '../types.js';
import { validationConfig } from '../config/validationConfig.js';

const ValidationCheckSchema = new Schema(
  {
    checkName: { type: String, required: true, index: true },
    status: { type: String, enum: ['PASS', 'FAIL'], required: true, index: true },
    severity: { type: String, enum: ['critical', 'warning', 'info'], required: true, index: true },
    expected: { type: Schema.Types.Mixed },
    actual: { type: Schema.Types.Mixed },
    diff: { type: Number },
    possibleCauses: [{ type: String }],
    suggestedFix: { type: String },
    rawDataKey: { type: String },
    durationMs: { type: Number },
  },
  { _id: false }
);

const ValidationReportSchema = new Schema<ValidationReportDocument>(
  {
    jobId: { type: String, trim: true, index: true },
    runAt: { type: Date, required: true, default: Date.now, index: true },
    completedAt: { type: Date },
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true, index: true },
    tenantId: { type: String, trim: true, index: true },
    requestedBy: { type: String, trim: true, index: true },
    summary: {
      totalChecks: { type: Number, default: 0 },
      critical: { type: Number, default: 0 },
      warning: { type: Number, default: 0 },
      info: { type: Number, default: 0 },
      passed: { type: Number, default: 0 },
    },
    details: { type: [ValidationCheckSchema], default: [] },
    rawDataSnapshots: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: validationConfig.collections.validationReports }
);

ValidationReportSchema.index({ tenantId: 1, runAt: -1 });
ValidationReportSchema.index({ 'details.checkName': 1, runAt: -1 });

export const getValidationReportModel = (
  connection: Connection
): Model<ValidationReportDocument> => {
  if (connection.models.ValidationReport) {
    return connection.models.ValidationReport as Model<ValidationReportDocument>;
  }

  return connection.model<ValidationReportDocument>(
    'ValidationReport',
    ValidationReportSchema,
    validationConfig.collections.validationReports
  );
};

export const isValidReportId = (value: string): boolean => mongoose.Types.ObjectId.isValid(value);
