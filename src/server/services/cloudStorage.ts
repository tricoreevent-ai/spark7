import { createHash, randomBytes } from 'crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AppSetting } from '../models/AppSetting.js';

export const CLOUD_STORAGE_SETTINGS_KEY = 'cloud_storage_config';

export type CloudStorageProvider = 'cloudflare_r2';

export interface CloudStorageConfig {
  enabled: boolean;
  provider: CloudStorageProvider;
  accountId: string;
  bucketName: string;
  s3Endpoint: string;
  publicBaseUrl: string;
  catalogUri: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const trim = (value: unknown): string => String(value || '').trim();
const trimTrailingSlash = (value: unknown): string => trim(value).replace(/\/+$/g, '');
const normalizeBucketName = (value: unknown): string =>
  trim(value).replace(/[^a-z0-9._-]+/gi, '').toLowerCase();

const maskValue = (value: unknown, visible = 4): string => {
  const raw = trim(value);
  if (!raw) return '';
  if (raw.length <= visible) return raw;
  return `${'*'.repeat(Math.max(4, raw.length - visible))}${raw.slice(-visible)}`;
};

export const extractBucketNameFromS3Endpoint = (value: unknown): string => {
  const raw = trim(value);
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').map((part) => part.trim()).filter(Boolean);
    return normalizeBucketName(parts[0] || '');
  } catch {
    return '';
  }
};

const normalizeS3Endpoint = (value: unknown, accountId: string): string => {
  const raw = trimTrailingSlash(value);
  if (raw) {
    try {
      const url = new URL(raw);
      url.hash = '';
      url.search = '';
      url.pathname = '';
      return trimTrailingSlash(url.toString());
    } catch {
      // fall through to derived endpoint below
    }
  }

  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
};

export const buildCloudflareCatalogUri = (accountId: string, bucketName: string): string => {
  if (!accountId || !bucketName) return '';
  return `https://catalog.cloudflarestorage.com/${accountId}/${bucketName}`;
};

export const normalizeCloudStorageConfig = (value: any): CloudStorageConfig => {
  const accountId = trim(value?.accountId);
  const bucketName = normalizeBucketName(value?.bucketName || extractBucketNameFromS3Endpoint(value?.s3Endpoint));

  return {
    enabled: Boolean(value?.enabled),
    provider: 'cloudflare_r2',
    accountId,
    bucketName,
    s3Endpoint: normalizeS3Endpoint(value?.s3Endpoint, accountId),
    publicBaseUrl: trimTrailingSlash(value?.publicBaseUrl),
    catalogUri: trimTrailingSlash(value?.catalogUri || buildCloudflareCatalogUri(accountId, bucketName)),
    accessKeyId: trim(value?.accessKeyId),
    secretAccessKey: trim(value?.secretAccessKey),
  };
};

export const isCloudStorageConfigUsable = (config: CloudStorageConfig): boolean =>
  Boolean(
    config.provider === 'cloudflare_r2'
      && config.accountId
      && config.bucketName
      && config.s3Endpoint
      && config.publicBaseUrl
      && config.accessKeyId
      && config.secretAccessKey
  );

export const storagePathFromR2Object = (bucketName: string, objectKey: string): string =>
  `r2://${normalizeBucketName(bucketName)}/${String(objectKey || '').trim().replace(/^\/+/, '')}`;

export const parseR2StoragePath = (
  value: unknown
): { bucketName: string; objectKey: string } | null => {
  const raw = trim(value);
  const match = /^r2:\/\/([^/]+)\/(.+)$/i.exec(raw);
  if (!match) return null;
  return {
    bucketName: normalizeBucketName(match[1] || ''),
    objectKey: String(match[2] || '').trim().replace(/^\/+/, ''),
  };
};

export const buildPublicObjectUrl = (config: CloudStorageConfig, objectKey: string): string => {
  const baseUrl = trimTrailingSlash(config.publicBaseUrl);
  const key = String(objectKey || '')
    .trim()
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return baseUrl && key ? `${baseUrl}/${key}` : '';
};

export const loadCloudStorageConfigRow = async (): Promise<{
  config: CloudStorageConfig;
  updatedAt: Date | null;
}> => {
  const row = await AppSetting.findOne({ key: CLOUD_STORAGE_SETTINGS_KEY }).select('value updatedAt').lean();
  return {
    config: normalizeCloudStorageConfig(row?.value || {}),
    updatedAt: row?.updatedAt || null,
  };
};

export const saveCloudStorageConfig = async (config: CloudStorageConfig, updatedBy?: string) => {
  const normalized = normalizeCloudStorageConfig(config);
  return AppSetting.findOneAndUpdate(
    { key: CLOUD_STORAGE_SETTINGS_KEY },
    {
      $set: {
        key: CLOUD_STORAGE_SETTINGS_KEY,
        value: normalized,
        updatedBy: trim(updatedBy),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
};

export const sanitizeCloudStorageConfigForClient = (
  config: CloudStorageConfig,
  updatedAt?: Date | null
) => ({
  enabled: config.enabled,
  provider: config.provider,
  accountId: config.accountId,
  bucketName: config.bucketName,
  s3Endpoint: config.s3Endpoint,
  publicBaseUrl: config.publicBaseUrl,
  catalogUri: config.catalogUri,
  hasCredentials: Boolean(config.accessKeyId && config.secretAccessKey),
  accessKeyIdMasked: maskValue(config.accessKeyId, 6),
  secretAccessKeyMasked: maskValue(config.secretAccessKey, 4),
  updatedAt: updatedAt || null,
});

export const deriveCloudflareR2CredentialsFromApiToken = async (args: {
  accountId: string;
  apiToken: string;
}): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  tokenStatus: string;
}> => {
  const accountId = trim(args.accountId);
  const apiToken = trim(args.apiToken);

  if (!accountId) {
    throw new Error('Cloudflare account ID is required.');
  }
  if (!apiToken) {
    throw new Error('Cloudflare API token is required.');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/tokens/verify`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !trim(payload?.result?.id)) {
    throw new Error(String(payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || 'Cloudflare token verification failed.'));
  }

  return {
    accessKeyId: trim(payload.result.id),
    secretAccessKey: createHash('sha256').update(apiToken).digest('hex'),
    tokenStatus: trim(payload.result.status) || 'active',
  };
};

export const createCloudStorageClient = (config: CloudStorageConfig): S3Client => {
  if (!isCloudStorageConfigUsable(config)) {
    throw new Error('Cloud storage configuration is incomplete.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: config.s3Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const testCloudStorageConnection = async (config: CloudStorageConfig) => {
  if (!isCloudStorageConfigUsable(config)) {
    throw new Error('Cloud storage configuration is incomplete.');
  }

  const client = createCloudStorageClient(config);
  const objectKey = `_healthchecks/${Date.now()}-${randomBytes(5).toString('hex')}.txt`;
  const publicUrl = buildPublicObjectUrl(config, objectKey);
  const body = Buffer.from(`spark-ai-r2-check ${new Date().toISOString()}`, 'utf8');

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
    })
  );

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      })
    );

    let publicFetchStatus: number | null = null;
    if (publicUrl) {
      try {
        const response = await fetch(publicUrl, { method: 'GET' });
        publicFetchStatus = response.status;
      } catch {
        publicFetchStatus = null;
      }
    }

    return {
      provider: config.provider,
      bucketName: config.bucketName,
      objectKey,
      publicUrl,
      publicFetchStatus,
      checkedAt: new Date(),
    };
  } finally {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      })
    ).catch(() => undefined);
  }
};
