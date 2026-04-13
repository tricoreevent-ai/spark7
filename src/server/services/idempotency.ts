import { createHash } from 'crypto';
import { IdempotencyKey } from '../models/IdempotencyKey.js';

interface IdempotentResult<T> {
  status: number;
  body: T;
}

interface ExecuteIdempotentRequestInput<T> {
  scope: string;
  key: string;
  method: string;
  route: string;
  body: unknown;
  createdBy?: string;
  ttlHours?: number;
  execute: () => Promise<IdempotentResult<T>>;
}

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const buildRequestHash = (input: { method: string; route: string; body: unknown }): string =>
  createHash('sha256')
    .update(stableStringify(input))
    .digest('hex');

const normalizeIdempotencyKey = (value: string): string =>
  String(value || '').trim().slice(0, 200);

export const executeIdempotentRequest = async <T>(input: ExecuteIdempotentRequestInput<T>): Promise<{
  replayed: boolean;
  status: number;
  body: T;
}> => {
  const key = normalizeIdempotencyKey(input.key);
  if (!key) {
    throw new Error('Idempotency key is required for this request');
  }

  const requestHash = buildRequestHash({
    method: String(input.method || 'POST').toUpperCase(),
    route: String(input.route || '').trim(),
    body: input.body,
  });

  const existing = await IdempotencyKey.findOne({
    scope: input.scope,
    idempotencyKey: key,
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new Error('This idempotency key was already used with a different payload');
    }
    if (existing.status === 'completed' && existing.responseBody) {
      existing.lastReplayedAt = new Date();
      await existing.save();
      return {
        replayed: true,
        status: Number(existing.responseStatus || 200),
        body: existing.responseBody as T,
      };
    }
    throw new Error('This request is already being processed');
  }

  const ttlHours = Math.max(1, Number(input.ttlHours || 24));
  let lease;
  try {
    lease = await IdempotencyKey.create({
      scope: input.scope,
      idempotencyKey: key,
      method: String(input.method || 'POST').toUpperCase(),
      route: String(input.route || '').trim(),
      requestHash,
      status: 'in_progress',
      createdBy: input.createdBy,
      expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
    });
  } catch (error: any) {
    if (Number(error?.code) !== 11000) {
      throw error;
    }
    const retriedExisting = await IdempotencyKey.findOne({
      scope: input.scope,
      idempotencyKey: key,
    });
    if (!retriedExisting) {
      throw error;
    }
    if (retriedExisting.requestHash !== requestHash) {
      throw new Error('This idempotency key was already used with a different payload');
    }
    if (retriedExisting.status === 'completed' && retriedExisting.responseBody) {
      retriedExisting.lastReplayedAt = new Date();
      await retriedExisting.save();
      return {
        replayed: true,
        status: Number(retriedExisting.responseStatus || 200),
        body: retriedExisting.responseBody as T,
      };
    }
    throw new Error('This request is already being processed');
  }

  try {
    const result = await input.execute();
    lease.status = 'completed';
    lease.responseStatus = result.status;
    lease.responseBody = result.body as Record<string, any>;
    await lease.save();
    return {
      replayed: false,
      status: result.status,
      body: result.body,
    };
  } catch (error) {
    await IdempotencyKey.deleteOne({ _id: lease._id });
    throw error;
  }
};
