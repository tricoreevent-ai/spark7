import path from 'path';
import {
  estimateInlineImageBytes,
  isCloudStoragePath,
  isInlineImageDataUrl,
  isLocalUploadsStoragePath,
  persistManagedImageValue,
  removeManagedStoredFile,
  resolveManagedStoragePath,
} from './assetStorage.js';

export type FacilityImageKind = 'inline-data-url' | 'server-file' | 'external-or-relative' | 'none';

export interface PersistedFacilityImage {
  imageUrl: string;
  imageStoragePath?: string;
  imageFileName?: string;
  imageSizeBytes?: number;
  wroteNewFile: boolean;
  fellBackToLocal?: boolean;
}

const isFacilityManagedStoragePath = (value?: string): boolean => {
  const normalized = resolveManagedStoragePath('', value);
  if (!normalized) return false;
  if (isLocalUploadsStoragePath(normalized)) {
    return normalized.includes('/facilities/');
  }
  if (isCloudStoragePath(normalized)) {
    return normalized.includes('/facilities/');
  }
  return false;
};

export const isInlineFacilityImage = (value?: string): boolean => isInlineImageDataUrl(value);

export const estimateInlineFacilityImageBytes = (value?: string): number => estimateInlineImageBytes(value);

export const resolveFacilityStoredImagePath = (imageUrl?: string, imageStoragePath?: string): string => {
  const resolved = resolveManagedStoragePath(imageUrl, imageStoragePath);
  return isFacilityManagedStoragePath(resolved) ? resolved : '';
};

export const classifyFacilityImageValue = (imageUrl?: string, imageStoragePath?: string): FacilityImageKind => {
  const trimmed = String(imageUrl || '').trim();
  if (!trimmed) return 'none';
  if (isInlineFacilityImage(trimmed)) return 'inline-data-url';
  if (resolveFacilityStoredImagePath(trimmed, imageStoragePath)) return 'server-file';
  return 'external-or-relative';
};

export const removeStoredFacilityImage = async (storagePath?: string): Promise<void> => {
  const resolved = resolveFacilityStoredImagePath('', storagePath);
  if (!resolved) return;
  await removeManagedStoredFile(resolved);
};

export const persistFacilityImageValue = async (args: {
  imageValue: string;
  tenantId?: string;
  facilityName?: string;
}): Promise<PersistedFacilityImage> => {
  const persisted = await persistManagedImageValue({
    imageValue: args.imageValue,
    tenantId: args.tenantId,
    directorySegments: ['facilities', 'images'],
    fileBaseName: args.facilityName || 'facility-image',
  });

  return {
    imageUrl: persisted.url,
    imageStoragePath: persisted.storagePath,
    imageFileName: persisted.fileName || (persisted.storagePath ? path.posix.basename(persisted.storagePath) : undefined),
    imageSizeBytes: persisted.sizeBytes,
    wroteNewFile: persisted.wroteNewFile,
    fellBackToLocal: persisted.fellBackToLocal,
  };
};
