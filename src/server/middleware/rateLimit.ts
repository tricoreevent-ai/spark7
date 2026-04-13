import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { writeAuditFlag } from '../services/auditFlag.js';

interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowMs: number;
  message: string;
  auditFlagType?: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const cleanupExpiredBuckets = (now: number): void => {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
};

const buildActorKey = (req: AuthenticatedRequest): string =>
  String(req.userId || req.ip || 'anonymous').trim().toLowerCase();

export const createRateLimitMiddleware = (options: RateLimitOptions) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const actorKey = buildActorKey(req);
    const bucketKey = `${options.bucket}:${actorKey}`;
    const current = buckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    current.count += 1;
    buckets.set(bucketKey, current);

    if (current.count <= options.limit) {
      next();
      return;
    }

    if (options.auditFlagType) {
      await writeAuditFlag({
        module: 'security',
        flagType: options.auditFlagType,
        severity: 'high',
        message: `${options.bucket} exceeded rate limit`,
        dedupeKey: `${options.auditFlagType}:${actorKey}:${Math.floor(now / options.windowMs)}`,
        detectedBy: req.userId,
        metadata: {
          bucket: options.bucket,
          actorKey,
          limit: options.limit,
          windowMs: options.windowMs,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          path: req.originalUrl,
          method: req.method,
        },
      });
    }

    res.status(429).json({
      success: false,
      error: options.message,
    });
  };
};
