import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { decryptBackupPayload, encryptBackupPayload, isBackupEncryptionEnabled } from '../services/backupCrypto.js';

const router = Router();
const RESERVED_COLLECTION_PREFIX = 'system.';
const BACKUP_AUDIT_ACTIONS = ['database_backup_generated', 'database_restore_executed'];

const flattenObject = (
  value: Record<string, any>,
  prefix = '',
  out: Record<string, string> = {}
): Record<string, string> => {
  for (const [key, val] of Object.entries(value || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flattenObject(val, path, out);
      continue;
    }
    out[path] = JSON.stringify(val);
  }
  return out;
};

const requireSuperAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }

  const user = await User.findById(req.userId).select('role email firstName lastName');
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return null;
  }

  if (String(user.role || '').toLowerCase() !== 'super_admin') {
    res.status(403).json({ success: false, error: 'Only super admin can perform this action' });
    return null;
  }

  return user;
};

router.get('/database-backup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await requireSuperAdmin(req, res);
    if (!user) return;

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database connection not ready' });
    }

    const collectionsList = await db.listCollections({}, { nameOnly: true }).toArray();
    const names = collectionsList
      .map((entry) => String(entry.name || ''))
      .filter((name) => Boolean(name) && !name.startsWith(RESERVED_COLLECTION_PREFIX));

    const collections: Record<string, any[]> = {};
    for (const name of names) {
      collections[name] = await db.collection(name).find({}).toArray();
    }

    const backupPayload = {
      meta: {
        version: 1,
        exportedAt: new Date(),
        exportedBy: {
          userId: user._id.toString(),
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
        },
        dbName: db.databaseName,
        collections: names,
      },
      collections,
    };

    await writeAuditLog({
      module: 'settings',
      action: 'database_backup_generated',
      entityType: 'database_backup',
      userId: req.userId,
      metadata: {
        dbName: db.databaseName,
        collections: names.length,
        encrypted: isBackupEncryptionEnabled(),
      },
    });

    const content = encryptBackupPayload(EJSON.stringify(backupPayload, undefined, 2, { relaxed: false }));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sarva-backup-${stamp}.${isBackupEncryptionEnabled() ? 'enc.json' : 'json'}"`);
    res.status(200).send(content);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate database backup' });
  }
});

router.get('/database-stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await requireSuperAdmin(req, res);
    if (!user) return;

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database connection not ready' });
    }

    const [dbStats, collections] = await Promise.all([
      db.command({ dbStats: 1, scale: 1 }),
      db.listCollections({}, { nameOnly: true }).toArray(),
    ]);

    const names = collections
      .map((entry) => String(entry.name || ''))
      .filter((name) => Boolean(name) && !name.startsWith(RESERVED_COLLECTION_PREFIX))
      .sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      data: {
        dbName: db.databaseName,
        collections: Number(dbStats.collections || names.length || 0),
        objects: Number(dbStats.objects || 0),
        avgObjSize: Number(dbStats.avgObjSize || 0),
        dataSize: Number(dbStats.dataSize || 0),
        storageSize: Number(dbStats.storageSize || 0),
        indexSize: Number(dbStats.indexSize || 0),
        totalSize: Number((dbStats.dataSize || 0) + (dbStats.indexSize || 0)),
        fsUsedSize: Number(dbStats.fsUsedSize || 0),
        fsTotalSize: Number(dbStats.fsTotalSize || 0),
        collectionNames: names,
        checkedAt: new Date(),
        connectionState: mongoose.connection.readyState,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load database stats' });
  }
});

router.post('/database-restore', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await requireSuperAdmin(req, res);
    if (!user) return;

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database connection not ready' });
    }

    const mode = String(req.body?.mode || 'replace').toLowerCase();
    const rawBackupContent = req.body?.backupContent;
    const parsedPayload =
      typeof rawBackupContent === 'string'
        ? EJSON.parse(decryptBackupPayload(rawBackupContent))
        : req.body?.backupPayload;

    if (!parsedPayload || typeof parsedPayload !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid backup payload' });
    }

    const collections = (parsedPayload as any).collections;
    if (!collections || typeof collections !== 'object') {
      return res.status(400).json({ success: false, error: 'Backup payload missing collections' });
    }

    const entries = Object.entries(collections).filter(([name]) => !String(name).startsWith(RESERVED_COLLECTION_PREFIX));
    const result: Array<{ collection: string; restored: number }> = [];

    for (const [collectionName, docs] of entries) {
      if (!Array.isArray(docs)) continue;
      const collection = db.collection(collectionName);

      if (mode === 'replace') {
        await collection.deleteMany({});
      }

      if (docs.length > 0) {
        await collection.insertMany(docs as any[], { ordered: false });
      }

      result.push({ collection: collectionName, restored: docs.length });
    }

    await writeAuditLog({
      module: 'settings',
      action: 'database_restore_executed',
      entityType: 'database_backup',
      userId: req.userId,
      metadata: {
        mode,
        collectionsRestored: result.length,
        collectionNames: result.map((item) => item.collection),
        encrypted: typeof rawBackupContent === 'string' && rawBackupContent.includes('"algorithm":"aes-256-gcm"'),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Database restored successfully',
      data: {
        mode,
        collectionsRestored: result.length,
        details: result,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to restore database backup' });
  }
});

router.get('/database-history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await requireSuperAdmin(req, res);
    if (!user) return;

    const requestedLimit = Number(req.query?.limit || 30);
    const limit = Math.min(100, Math.max(5, Number.isFinite(requestedLimit) ? requestedLimit : 30));

    const rows = await AuditLog.find({
      module: 'settings',
      action: { $in: BACKUP_AUDIT_ACTIONS },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select('action createdAt userId metadata')
      .lean();

    const userIds = Array.from(
      new Set(
        rows
          .map((row) => String(row.userId || ''))
          .filter((id) => Boolean(id) && mongoose.Types.ObjectId.isValid(id))
      )
    );

    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean()
      : [];
    const userMap = new Map(
      users.map((entry) => [
        String(entry._id),
        {
          name: `${String(entry.firstName || '').trim()} ${String(entry.lastName || '').trim()}`
            .trim()
            .replace(/\s+/g, ' '),
          email: String(entry.email || '').trim(),
        },
      ])
    );

    const history = rows.map((row) => {
      const actor = userMap.get(String(row.userId || ''));
      return {
        id: String(row._id),
        action: row.action,
        createdAt: row.createdAt,
        userId: row.userId ? String(row.userId) : '',
        actorName: actor?.name || '',
        actorEmail: actor?.email || '',
        metadata: row.metadata || {},
      };
    });

    res.json({
      success: true,
      data: {
        history,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load backup history' });
  }
});

router.post('/audit-change', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const before = req.body?.before;
    const after = req.body?.after;

    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
      return res.status(400).json({ success: false, error: 'before and after settings payloads are required' });
    }

    const beforeFlat = flattenObject(before);
    const afterFlat = flattenObject(after);
    const changedKeys = Array.from(new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]))
      .filter((key) => beforeFlat[key] !== afterFlat[key])
      .slice(0, 200);

    await writeAuditLog({
      module: 'settings',
      action: 'settings_changed',
      entityType: 'app_settings',
      userId: req.userId,
      metadata: {
        changedKeys,
        changedCount: changedKeys.length,
      },
      before,
      after,
    });

    res.json({ success: true, message: 'Settings change audited', data: { changedKeys, changedCount: changedKeys.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to audit settings change' });
  }
});

export default router;
