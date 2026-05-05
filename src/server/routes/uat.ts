import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { cleanupUatData } from '../services/uatCleanup.js';

const router = Router();

const listOfText = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
};

router.post('/cleanup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = String(req.body?.tenantId || req.tenantId || '').trim();
    const result = await cleanupUatData({
      dryRun: req.body?.dryRun !== false,
      tags: listOfText(req.body?.tags),
      prefixes: listOfText(req.body?.prefixes),
      tenantId,
      overrideSafeThreshold: req.body?.overrideSafeThreshold === true,
    });
    res.json({ success: true, data: result, ...result });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      status: 'FAIL',
      error: error?.message || 'Unable to cleanup UAT records.',
      collections: [],
      warnings: [error?.message || 'Unable to cleanup UAT records.'],
    });
  }
});

export default router;
