import { RecordVersion } from '../models/RecordVersion.js';

interface WriteRecordVersionInput {
  module: string;
  entityType: string;
  recordId: string;
  action: string;
  dataSnapshot: Record<string, any>;
  changedBy?: string;
  metadata?: Record<string, any>;
}

export const writeRecordVersion = async (input: WriteRecordVersionInput): Promise<void> => {
  try {
    const module = String(input.module || '').trim();
    const entityType = String(input.entityType || '').trim();
    const recordId = String(input.recordId || '').trim();
    if (!module || !entityType || !recordId) return;

    const latest = await RecordVersion.findOne({ module, entityType, recordId })
      .sort({ versionNumber: -1 })
      .select('versionNumber')
      .lean();

    const nextVersion = Math.max(1, Number(latest?.versionNumber || 0) + 1);

    await RecordVersion.create({
      module,
      entityType,
      recordId,
      versionNumber: nextVersion,
      action: String(input.action || 'update').trim().toUpperCase(),
      dataSnapshot: input.dataSnapshot || {},
      changedBy: input.changedBy,
      changedAt: new Date(),
      metadata: input.metadata,
    });
  } catch (error) {
    console.error('Failed to write record version:', error);
  }
};
