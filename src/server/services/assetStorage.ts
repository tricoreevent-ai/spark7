import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  buildPublicObjectUrl,
  createCloudStorageClient,
  isCloudStorageConfigUsable,
  loadCloudStorageConfigRow,
  parseR2StoragePath,
  storagePathFromR2Object,
} from './cloudStorage.js';

export const MAX_MANAGED_IMAGE_BYTES = 6 * 1024 * 1024;

export const ALLOWED_MANAGED_IMAGE_MIME_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const MIME_TYPE_BY_EXTENSION = new Map<string, string>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

const IMAGE_SIGNATURES = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff]),
  gif87a: Buffer.from('474946383761', 'hex'),
  gif89a: Buffer.from('474946383961', 'hex'),
  riff: Buffer.from('52494646', 'hex'),
  webp: Buffer.from('57454250', 'hex'),
};

const entryDir = process.argv[1]
  ? path.dirname(path.resolve(process.argv[1]))
  : path.resolve(process.cwd(), 'src', 'server');

const runtimeRootCandidates = [
  path.resolve(process.cwd()),
  path.resolve(entryDir, '..', '..'),
  path.resolve(entryDir, '..'),
];

export const runtimeRoot =
  runtimeRootCandidates.find((candidate, index) => {
    if (index === 0) return true;
    return ['package.json', 'dist', 'src'].some((name) => existsSync(path.join(candidate, name)));
  }) || path.resolve(process.cwd());

export const uploadsRoot = path.join(runtimeRoot, 'uploads');

export type ManagedAssetProvider = 'local' | 'cloudflare_r2' | 'external' | 'none';

export interface PersistedManagedImage {
  url: string;
  storagePath?: string;
  fileName?: string;
  sizeBytes?: number;
  provider: ManagedAssetProvider;
  wroteNewFile: boolean;
  fellBackToLocal?: boolean;
}

const trim = (value: unknown): string => String(value || '').trim();

const sanitizeFileName = (value: string, fallback: string): string => {
  const base = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return base || fallback;
};

const resolveFileStem = (value: string, fallback: string): string =>
  sanitizeFileName(path.parse(String(value || '')).name || String(value || ''), fallback);

export const normalizeTenantSegment = (value?: string): string =>
  String(value || 'global')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'global';

const normalizeDirectorySegments = (segments: string[]): string[] =>
  segments
    .map((segment) =>
      String(segment || '')
        .trim()
        .replace(/[^a-zA-Z0-9/_-]+/g, '-')
        .replace(/\/+/g, '/')
        .replace(/^\/+|\/+$/g, '')
    )
    .filter(Boolean)
    .flatMap((segment) => segment.split('/').filter(Boolean));

export const normalizeManagedStoragePath = (value?: string): string =>
  String(value || '').trim().replace(/^\/+/, '').replace(/\\/g, '/');

export const detectManagedImageMimeType = (buffer: Buffer): string => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';

  if (buffer.length >= IMAGE_SIGNATURES.png.length && buffer.subarray(0, IMAGE_SIGNATURES.png.length).equals(IMAGE_SIGNATURES.png)) {
    return 'image/png';
  }
  if (buffer.length >= IMAGE_SIGNATURES.jpeg.length && buffer.subarray(0, IMAGE_SIGNATURES.jpeg.length).equals(IMAGE_SIGNATURES.jpeg)) {
    return 'image/jpeg';
  }
  if (buffer.length >= IMAGE_SIGNATURES.gif87a.length) {
    const header = buffer.subarray(0, IMAGE_SIGNATURES.gif87a.length);
    if (header.equals(IMAGE_SIGNATURES.gif87a) || header.equals(IMAGE_SIGNATURES.gif89a)) {
      return 'image/gif';
    }
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, IMAGE_SIGNATURES.riff.length).equals(IMAGE_SIGNATURES.riff)
    && buffer.subarray(8, 12).equals(IMAGE_SIGNATURES.webp)
  ) {
    return 'image/webp';
  }

  return '';
};

export const isInlineImageDataUrl = (value?: string): boolean =>
  /^data:image\/[a-z0-9.+-]+;base64,/i.test(trim(value));

export const estimateInlineImageBytes = (value?: string): number =>
  isInlineImageDataUrl(value) ? Buffer.byteLength(trim(value), 'utf8') : 0;

export const isLocalUploadsStoragePath = (value?: string): boolean =>
  normalizeManagedStoragePath(value).startsWith('uploads/');

export const isCloudStoragePath = (value?: string): boolean =>
  Boolean(parseR2StoragePath(value));

export const resolveManagedStoragePath = (url?: string, storagePath?: string): string => {
  const explicit = normalizeManagedStoragePath(storagePath);
  if (isLocalUploadsStoragePath(explicit) || isCloudStoragePath(explicit)) {
    return explicit;
  }

  const normalizedUrl = trim(url);
  if (normalizedUrl.startsWith('/uploads/') || normalizedUrl.startsWith('uploads/')) {
    const derived = normalizeManagedStoragePath(normalizedUrl);
    if (isLocalUploadsStoragePath(derived)) {
      return derived;
    }
  }

  return '';
};

export const parseImageDataUrl = (
  dataUrl: string,
  options?: {
    allowedMimeTypes?: Map<string, string>;
    maxBytes?: number;
    invalidMessage?: string;
    emptyMessage?: string;
    sizeMessage?: string;
  }
): { mimeType: string; buffer: Buffer; declaredMimeType: string; detectedMimeType: string } => {
  const allowedMimeTypes = options?.allowedMimeTypes || ALLOWED_MANAGED_IMAGE_MIME_TYPES;
  const maxBytes = Number(options?.maxBytes || MAX_MANAGED_IMAGE_BYTES);
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(trim(dataUrl));
  if (!match) {
    throw new Error(options?.invalidMessage || 'Please upload a valid image file.');
  }

  const declaredMimeType = trim(match[1]).toLowerCase();

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw new Error(options?.emptyMessage || 'Uploaded image is empty.');
  }

  if (buffer.length > maxBytes) {
    throw new Error(options?.sizeMessage || `Image size should be less than ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }

  const detectedMimeType = detectManagedImageMimeType(buffer);
  const mimeType = detectedMimeType || declaredMimeType;
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error('Supported image types are JPG, PNG, WEBP, and GIF.');
  }

  return { mimeType, buffer, declaredMimeType, detectedMimeType };
};

const contentTypeFromFileName = (value?: string): string => {
  const extension = path.extname(trim(value)).toLowerCase();
  return MIME_TYPE_BY_EXTENSION.get(extension) || 'application/octet-stream';
};

const contentTypeFromStoragePath = (value?: string): string => {
  const normalized = normalizeManagedStoragePath(value);
  if (!normalized) return 'application/octet-stream';
  return contentTypeFromFileName(normalized);
};

const localPathFromStoragePath = (storagePath: string): string => path.resolve(runtimeRoot, storagePath);

const buildLocalAssetResult = async (args: {
  buffer: Buffer;
  contentType: string;
  tenantId?: string;
  directorySegments: string[];
  fileBaseName: string;
  originalFileName?: string;
}): Promise<PersistedManagedImage> => {
  const extension =
    ALLOWED_MANAGED_IMAGE_MIME_TYPES.get(trim(args.contentType).toLowerCase())
    || path.extname(trim(args.originalFileName)).toLowerCase()
    || '.png';
  const tenantSegment = normalizeTenantSegment(args.tenantId);
  const fileBaseName = resolveFileStem(args.fileBaseName, 'image');
  const generatedFileName = `${Date.now()}-${fileBaseName}-${randomBytes(5).toString('hex')}${extension}`;
  const relativeDir = path.posix.join('uploads', 'tenants', tenantSegment, ...normalizeDirectorySegments(args.directorySegments));
  const relativePath = path.posix.join(relativeDir, generatedFileName);
  const absoluteDir = path.join(runtimeRoot, relativeDir);
  const absolutePath = path.join(runtimeRoot, relativePath);

  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(absolutePath, args.buffer);

  return {
    url: `/${relativePath}`,
    storagePath: relativePath,
    fileName: generatedFileName,
    sizeBytes: args.buffer.length,
    provider: 'local',
    wroteNewFile: true,
  };
};

export const uploadImageBufferToManagedStorage = async (args: {
  buffer: Buffer;
  contentType: string;
  tenantId?: string;
  directorySegments: string[];
  fileBaseName: string;
  originalFileName?: string;
  allowCloudFallbackToLocal?: boolean;
}): Promise<PersistedManagedImage> => {
  const allowCloudFallbackToLocal = args.allowCloudFallbackToLocal !== false;
  const { config } = await loadCloudStorageConfigRow();
  const preferredCloud = config.enabled && isCloudStorageConfigUsable(config);

  if (preferredCloud) {
    const extension =
      ALLOWED_MANAGED_IMAGE_MIME_TYPES.get(trim(args.contentType).toLowerCase())
      || path.extname(trim(args.originalFileName)).toLowerCase()
      || '.png';
    const tenantSegment = normalizeTenantSegment(args.tenantId);
    const fileBaseName = resolveFileStem(args.fileBaseName, 'image');
    const generatedFileName = `${Date.now()}-${fileBaseName}-${randomBytes(5).toString('hex')}${extension}`;
    const objectKey = path.posix.join(
      'tenants',
      tenantSegment,
      ...normalizeDirectorySegments(args.directorySegments),
      generatedFileName
    );

    try {
      const client = createCloudStorageClient(config);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: objectKey,
          Body: args.buffer,
          ContentType: trim(args.contentType).toLowerCase() || 'application/octet-stream',
        })
      );

      return {
        url: buildPublicObjectUrl(config, objectKey),
        storagePath: storagePathFromR2Object(config.bucketName, objectKey),
        fileName: generatedFileName,
        sizeBytes: args.buffer.length,
        provider: 'cloudflare_r2',
        wroteNewFile: true,
      };
    } catch (error) {
      if (!allowCloudFallbackToLocal) {
        throw error;
      }
    }
  }

  const local = await buildLocalAssetResult(args);
  return preferredCloud
    ? { ...local, fellBackToLocal: true }
    : local;
};

export const persistManagedImageValue = async (args: {
  imageValue: string;
  tenantId?: string;
  directorySegments: string[];
  fileBaseName: string;
  originalFileName?: string;
  allowCloudFallbackToLocal?: boolean;
}): Promise<PersistedManagedImage> => {
  const imageValue = trim(args.imageValue);
  if (!imageValue) {
    return {
      url: '',
      provider: 'none',
      wroteNewFile: false,
    };
  }

  if (!isInlineImageDataUrl(imageValue)) {
    const storagePath = resolveManagedStoragePath(imageValue);
    return {
      url: imageValue.startsWith('uploads/') ? `/${imageValue}` : imageValue,
      storagePath: storagePath || undefined,
      fileName: storagePath ? path.posix.basename(storagePath) : undefined,
      provider: isCloudStoragePath(storagePath)
        ? 'cloudflare_r2'
        : isLocalUploadsStoragePath(storagePath)
          ? 'local'
          : 'external',
      wroteNewFile: false,
    };
  }

  const { mimeType, buffer } = parseImageDataUrl(imageValue);
  return uploadImageBufferToManagedStorage({
    buffer,
    contentType: mimeType,
    tenantId: args.tenantId,
    directorySegments: args.directorySegments,
    fileBaseName: args.fileBaseName,
    originalFileName: args.originalFileName,
    allowCloudFallbackToLocal: args.allowCloudFallbackToLocal,
  });
};

export const removeManagedStoredFile = async (storagePath?: string): Promise<void> => {
  const normalized = normalizeManagedStoragePath(storagePath);
  if (!normalized) return;

  if (isLocalUploadsStoragePath(normalized)) {
    const absolutePath = localPathFromStoragePath(normalized);
    const normalizedUploadsRoot = path.resolve(uploadsRoot);
    if (!absolutePath.startsWith(`${normalizedUploadsRoot}${path.sep}`)) {
      return;
    }

    try {
      await fs.unlink(absolutePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn('Failed to remove stored local image:', error);
      }
    }
    return;
  }

  const remote = parseR2StoragePath(normalized);
  if (!remote) return;

  try {
    const { config } = await loadCloudStorageConfigRow();
    if (!isCloudStorageConfigUsable(config)) {
      return;
    }

    const client = createCloudStorageClient(config);
    await client.send(
      new DeleteObjectCommand({
        Bucket: remote.bucketName,
        Key: remote.objectKey,
      })
    );
  } catch (error) {
    console.warn('Failed to remove stored cloud image:', error);
  }
};

export const readManagedImageSource = async (args: {
  imageUrl?: string;
  storagePath?: string;
}): Promise<{ buffer: Buffer; contentType: string } | null> => {
  const imageUrl = trim(args.imageUrl);
  const storagePath = resolveManagedStoragePath(imageUrl, args.storagePath);

  if (isInlineImageDataUrl(imageUrl)) {
    const parsed = parseImageDataUrl(imageUrl);
    return { buffer: parsed.buffer, contentType: parsed.mimeType };
  }

  if (isLocalUploadsStoragePath(storagePath)) {
    const absolutePath = localPathFromStoragePath(storagePath);
    const buffer = await fs.readFile(absolutePath);
    return {
      buffer,
      contentType: contentTypeFromStoragePath(storagePath),
    };
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: trim(response.headers.get('content-type')) || contentTypeFromFileName(imageUrl),
    };
  }

  return null;
};

export const resolveImageValueToDataUrl = async (value?: string): Promise<string> => {
  const raw = trim(value);
  if (!raw) return '';
  if (isInlineImageDataUrl(raw)) return raw;

  const source = await readManagedImageSource({ imageUrl: raw });
  if (!source?.buffer?.length) return '';
  const contentType = trim(source.contentType).toLowerCase() || 'image/png';
  return `data:${contentType};base64,${source.buffer.toString('base64')}`;
};
