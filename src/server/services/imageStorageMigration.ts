import { Customer } from '../models/Customer.js';
import { Facility } from '../models/Facility.js';
import {
  isCloudStorageConfigUsable,
  loadCloudStorageConfigRow,
} from './cloudStorage.js';
import {
  isInlineImageDataUrl,
  isLocalUploadsStoragePath,
  persistManagedImageValue,
  readManagedImageSource,
  removeManagedStoredFile,
  resolveManagedStoragePath,
  uploadImageBufferToManagedStorage,
} from './assetStorage.js';
import {
  persistFacilityImageValue,
  removeStoredFacilityImage,
  resolveFacilityStoredImagePath,
} from './facilityStorage.js';
import {
  loadTenantGeneralSettings,
  mergeGeneralSettingsWithDefaults,
  saveTenantGeneralSettingsRow,
} from './generalSettings.js';

interface EntityMigrationSummary {
  inlineMigrated: number;
  localToCloudMigrated: number;
  metadataNormalized: number;
  failed: number;
}

export interface ImageStorageMigrationSummary {
  provider: 'cloudflare_r2' | 'local';
  cloudStorageEnabled: boolean;
  facilities: EntityMigrationSummary;
  customers: EntityMigrationSummary;
  settings: {
    logos: EntityMigrationSummary;
    homeBackgrounds: EntityMigrationSummary;
  };
}

const createEntitySummary = (): EntityMigrationSummary => ({
  inlineMigrated: 0,
  localToCloudMigrated: 0,
  metadataNormalized: 0,
  failed: 0,
});

const resolveActiveStoragePathsFromSettings = (settings: any): Set<string> => {
  const paths = new Set<string>();
  const invoiceLogoStoragePath = resolveManagedStoragePath(
    settings?.business?.invoiceLogoDataUrl,
    settings?.business?.invoiceLogoStoragePath
  );
  const reportLogoStoragePath = resolveManagedStoragePath(
    settings?.business?.reportLogoDataUrl,
    settings?.business?.reportLogoStoragePath
  );

  if (invoiceLogoStoragePath) paths.add(invoiceLogoStoragePath);
  if (reportLogoStoragePath) paths.add(reportLogoStoragePath);

  const backgrounds = Array.isArray(settings?.appearance?.homeBackgrounds)
    ? settings.appearance.homeBackgrounds
    : [];
  for (const row of backgrounds) {
    const storagePath = resolveManagedStoragePath(row?.url, row?.storagePath);
    if (storagePath) paths.add(storagePath);
  }

  return paths;
};

const promoteManagedLocalImageToCloud = async (args: {
  imageUrl?: string;
  storagePath?: string;
  tenantId?: string;
  directorySegments: string[];
  fileBaseName: string;
  originalFileName?: string;
}) => {
  const source = await readManagedImageSource({
    imageUrl: args.imageUrl,
    storagePath: args.storagePath,
  });
  if (!source?.buffer?.length) {
    return null;
  }

  return uploadImageBufferToManagedStorage({
    buffer: source.buffer,
    contentType: source.contentType,
    tenantId: args.tenantId,
    directorySegments: args.directorySegments,
    fileBaseName: args.fileBaseName,
    originalFileName: args.originalFileName,
    allowCloudFallbackToLocal: false,
  });
};

const migrateGeneralSettingsAssets = async (args: {
  tenantId?: string;
  updatedBy?: string;
  preferCloud: boolean;
  summary: ImageStorageMigrationSummary['settings'];
}) => {
  const settings = await loadTenantGeneralSettings(args.tenantId);
  const nextSettings = mergeGeneralSettingsWithDefaults(settings);
  const newStoragePaths: string[] = [];
  const staleStoragePaths: string[] = [];
  let changed = false;

  const migrateLogoField = async (fieldName: 'invoice' | 'report') => {
    const valueKey = fieldName === 'invoice' ? 'invoiceLogoDataUrl' : 'reportLogoDataUrl';
    const storageKey = fieldName === 'invoice' ? 'invoiceLogoStoragePath' : 'reportLogoStoragePath';
    const fileNameKey = fieldName === 'invoice' ? 'invoiceLogoFileName' : 'reportLogoFileName';
    const currentUrl = String(nextSettings?.business?.[valueKey] || '').trim();
    const currentStoragePath = resolveManagedStoragePath(
      currentUrl,
      nextSettings?.business?.[storageKey]
    );
    const currentFileName = String(nextSettings?.business?.[fileNameKey] || '').trim();

    if (!currentUrl) {
      if (currentStoragePath || currentFileName) {
        nextSettings.business = {
          ...(nextSettings.business && typeof nextSettings.business === 'object' ? nextSettings.business : {}),
          [storageKey]: '',
          [fileNameKey]: '',
        };
        if (currentStoragePath) {
          staleStoragePaths.push(currentStoragePath);
        }
        args.summary.logos.metadataNormalized += 1;
        changed = true;
      }
      return;
    }

    if (isInlineImageDataUrl(currentUrl)) {
      const persisted = await persistManagedImageValue({
        imageValue: currentUrl,
        tenantId: args.tenantId,
        directorySegments: ['general-settings', 'logos'],
        fileBaseName: fieldName === 'invoice' ? 'invoice-logo' : 'report-logo',
      });
      const nextStoragePath = resolveManagedStoragePath(persisted.url, persisted.storagePath);
      nextSettings.business = {
        ...(nextSettings.business && typeof nextSettings.business === 'object' ? nextSettings.business : {}),
        [valueKey]: persisted.url,
        [storageKey]: nextStoragePath,
        [fileNameKey]: persisted.fileName || (nextStoragePath ? nextStoragePath.split('/').pop() || '' : ''),
      };
      if (persisted.wroteNewFile && nextStoragePath) {
        newStoragePaths.push(nextStoragePath);
      }
      if (currentStoragePath && currentStoragePath !== nextStoragePath) {
        staleStoragePaths.push(currentStoragePath);
      }
      args.summary.logos.inlineMigrated += 1;
      changed = true;
      return;
    }

    if (args.preferCloud && isLocalUploadsStoragePath(currentStoragePath)) {
      const promoted = await promoteManagedLocalImageToCloud({
        imageUrl: currentUrl,
        storagePath: currentStoragePath,
        tenantId: args.tenantId,
        directorySegments: ['general-settings', 'logos'],
        fileBaseName: fieldName === 'invoice' ? 'invoice-logo' : 'report-logo',
        originalFileName: currentFileName || `${fieldName}-logo`,
      });
      if (promoted?.storagePath) {
        nextSettings.business = {
          ...(nextSettings.business && typeof nextSettings.business === 'object' ? nextSettings.business : {}),
          [valueKey]: promoted.url,
          [storageKey]: promoted.storagePath,
          [fileNameKey]: promoted.fileName || (promoted.storagePath ? promoted.storagePath.split('/').pop() || '' : ''),
        };
        newStoragePaths.push(promoted.storagePath);
        staleStoragePaths.push(currentStoragePath);
        args.summary.logos.localToCloudMigrated += 1;
        changed = true;
        return;
      }
    }

    const normalizedStoragePath = resolveManagedStoragePath(currentUrl, currentStoragePath);
    const normalizedFileName = currentFileName || (normalizedStoragePath ? normalizedStoragePath.split('/').pop() || '' : '');
    if (
      normalizedStoragePath !== String(nextSettings?.business?.[storageKey] || '').trim()
      || normalizedFileName !== currentFileName
    ) {
      nextSettings.business = {
        ...(nextSettings.business && typeof nextSettings.business === 'object' ? nextSettings.business : {}),
        [storageKey]: normalizedStoragePath,
        [fileNameKey]: normalizedFileName,
      };
      args.summary.logos.metadataNormalized += 1;
      changed = true;
    }
  };

  const backgrounds = Array.isArray(nextSettings?.appearance?.homeBackgrounds)
    ? nextSettings.appearance.homeBackgrounds
    : [];
  const nextBackgrounds: any[] = [];
  for (const image of backgrounds) {
    const currentUrl = String(image?.url || '').trim();
    const currentStoragePath = resolveManagedStoragePath(currentUrl, image?.storagePath);
    const fileName = String(image?.fileName || '').trim() || 'home-background';
    const nextImage = {
      ...(image && typeof image === 'object' ? image : {}),
      url: currentUrl.startsWith('uploads/') ? `/${currentUrl}` : currentUrl,
      storagePath: currentStoragePath,
    };

    if (isInlineImageDataUrl(currentUrl)) {
      const persisted = await persistManagedImageValue({
        imageValue: currentUrl,
        tenantId: args.tenantId,
        directorySegments: ['general-settings', 'home-backgrounds'],
        fileBaseName: fileName,
        originalFileName: fileName,
      });
      const nextStoragePath = resolveManagedStoragePath(persisted.url, persisted.storagePath);
      nextBackgrounds.push({
        ...nextImage,
        url: persisted.url,
        storagePath: nextStoragePath,
        fileName,
      });
      if (persisted.wroteNewFile && nextStoragePath) {
        newStoragePaths.push(nextStoragePath);
      }
      if (currentStoragePath && currentStoragePath !== nextStoragePath) {
        staleStoragePaths.push(currentStoragePath);
      }
      args.summary.homeBackgrounds.inlineMigrated += 1;
      changed = true;
      continue;
    }

    if (args.preferCloud && isLocalUploadsStoragePath(currentStoragePath)) {
      const promoted = await promoteManagedLocalImageToCloud({
        imageUrl: currentUrl,
        storagePath: currentStoragePath,
        tenantId: args.tenantId,
        directorySegments: ['general-settings', 'home-backgrounds'],
        fileBaseName: fileName,
        originalFileName: fileName,
      });
      if (promoted?.storagePath) {
        nextBackgrounds.push({
          ...nextImage,
          url: promoted.url,
          storagePath: promoted.storagePath,
          fileName,
        });
        newStoragePaths.push(promoted.storagePath);
        staleStoragePaths.push(currentStoragePath);
        args.summary.homeBackgrounds.localToCloudMigrated += 1;
        changed = true;
        continue;
      }
    }

    if (String(image?.storagePath || '').trim() !== currentStoragePath) {
      args.summary.homeBackgrounds.metadataNormalized += 1;
      changed = true;
    }
    nextBackgrounds.push(nextImage);
  }

  await migrateLogoField('invoice');
  await migrateLogoField('report');

  if (changed) {
    nextSettings.appearance = {
      ...(nextSettings.appearance && typeof nextSettings.appearance === 'object' ? nextSettings.appearance : {}),
      homeBackgrounds: nextBackgrounds,
    };

    try {
      await saveTenantGeneralSettingsRow({
        tenantId: args.tenantId,
        settings: nextSettings,
        updatedBy: args.updatedBy,
      });
      newStoragePaths.length = 0;
    } catch (error) {
      for (const storagePath of newStoragePaths) {
        await removeManagedStoredFile(storagePath);
      }
      throw error;
    }

    const activePaths = resolveActiveStoragePathsFromSettings(nextSettings);
    const safeStalePaths = staleStoragePaths
      .filter((storagePath, index, rows) => storagePath && rows.indexOf(storagePath) === index)
      .filter((storagePath) => !activePaths.has(storagePath));
    for (const storagePath of safeStalePaths) {
      await removeManagedStoredFile(storagePath);
    }
  }
};

const migrateFacilities = async (args: {
  tenantId?: string;
  preferCloud: boolean;
  summary: EntityMigrationSummary;
}) => {
  const facilities = await Facility.find().sort({ updatedAt: -1, createdAt: -1 });

  for (const facility of facilities) {
    let writtenStoragePath = '';
    try {
      const currentUrl = String(facility.imageUrl || '').trim();
      const currentStoragePath = resolveFacilityStoredImagePath(currentUrl, facility.imageStoragePath);
      let changed = false;

      if (!currentUrl) {
        if (facility.imageStoragePath || facility.imageFileName || Number(facility.imageSizeBytes || 0) > 0) {
          facility.imageStoragePath = undefined;
          facility.imageFileName = undefined;
          facility.imageSizeBytes = undefined;
          args.summary.metadataNormalized += 1;
          changed = true;
        }
      } else if (isInlineImageDataUrl(currentUrl)) {
        const persisted = await persistFacilityImageValue({
          imageValue: currentUrl,
          tenantId: args.tenantId,
          facilityName: facility.name,
        });
        writtenStoragePath = String(persisted.imageStoragePath || '');
        facility.imageUrl = persisted.imageUrl;
        facility.imageStoragePath = persisted.imageStoragePath;
        facility.imageFileName = persisted.imageFileName;
        facility.imageSizeBytes = persisted.imageSizeBytes;
        args.summary.inlineMigrated += 1;
        changed = true;
      } else if (args.preferCloud && isLocalUploadsStoragePath(currentStoragePath)) {
        const promoted = await promoteManagedLocalImageToCloud({
          imageUrl: currentUrl,
          storagePath: currentStoragePath,
          tenantId: args.tenantId,
          directorySegments: ['facilities', 'images'],
          fileBaseName: String(facility.name || 'facility-image'),
          originalFileName: String(facility.imageFileName || currentStoragePath.split('/').pop() || 'facility-image'),
        });
        if (promoted?.storagePath) {
          writtenStoragePath = promoted.storagePath;
          facility.imageUrl = promoted.url;
          facility.imageStoragePath = promoted.storagePath;
          facility.imageFileName = promoted.fileName || (promoted.storagePath ? promoted.storagePath.split('/').pop() || '' : undefined);
          facility.imageSizeBytes = promoted.sizeBytes;
          args.summary.localToCloudMigrated += 1;
          changed = true;
        }
      } else {
        const normalizedStoragePath = resolveFacilityStoredImagePath(currentUrl, currentStoragePath);
        const normalizedImageUrl = currentUrl.startsWith('uploads/') ? `/${currentUrl}` : currentUrl;
        const normalizedFileName = normalizedStoragePath
          ? String(facility.imageFileName || normalizedStoragePath.split('/').pop() || '')
          : undefined;

        if (
          facility.imageUrl !== normalizedImageUrl
          || String(facility.imageStoragePath || '') !== normalizedStoragePath
          || String(facility.imageFileName || '') !== String(normalizedFileName || '')
        ) {
          facility.imageUrl = normalizedImageUrl;
          facility.imageStoragePath = normalizedStoragePath || undefined;
          facility.imageFileName = normalizedFileName;
          args.summary.metadataNormalized += 1;
          changed = true;
        }
      }

      if (changed) {
        await facility.save();
        const nextStoragePath = resolveFacilityStoredImagePath(facility.imageUrl, facility.imageStoragePath);
        if (currentStoragePath && currentStoragePath !== nextStoragePath) {
          await removeStoredFacilityImage(currentStoragePath);
        }
        writtenStoragePath = '';
      }
    } catch (error) {
      if (writtenStoragePath) {
        await removeStoredFacilityImage(writtenStoragePath);
      }
      args.summary.failed += 1;
      console.warn(`Facility image migration skipped for ${String(facility?._id || '')}:`, error);
    }
  }
};

const migrateCustomers = async (args: {
  tenantId?: string;
  preferCloud: boolean;
  summary: EntityMigrationSummary;
}) => {
  const customers = await Customer.find().sort({ updatedAt: -1, createdAt: -1 });

  for (const customer of customers) {
    let writtenStoragePath = '';
    try {
      const currentUrl = String(customer.profilePhotoUrl || '').trim();
      const currentStoragePath = resolveManagedStoragePath(currentUrl, customer.profilePhotoStoragePath);
      let changed = false;

      if (!currentUrl) {
        if (String(customer.profilePhotoStoragePath || '').trim()) {
          customer.profilePhotoStoragePath = '';
          args.summary.metadataNormalized += 1;
          changed = true;
        }
      } else if (isInlineImageDataUrl(currentUrl)) {
        const persisted = await persistManagedImageValue({
          imageValue: currentUrl,
          tenantId: args.tenantId,
          directorySegments: ['customers', 'profile-photos'],
          fileBaseName: String(customer.name || 'customer-photo'),
        });
        writtenStoragePath = String(persisted.storagePath || '');
        customer.profilePhotoUrl = persisted.url;
        customer.profilePhotoStoragePath = persisted.storagePath || '';
        args.summary.inlineMigrated += 1;
        changed = true;
      } else if (args.preferCloud && isLocalUploadsStoragePath(currentStoragePath)) {
        const promoted = await promoteManagedLocalImageToCloud({
          imageUrl: currentUrl,
          storagePath: currentStoragePath,
          tenantId: args.tenantId,
          directorySegments: ['customers', 'profile-photos'],
          fileBaseName: String(customer.name || 'customer-photo'),
          originalFileName: currentStoragePath.split('/').pop() || 'customer-photo',
        });
        if (promoted?.storagePath) {
          writtenStoragePath = promoted.storagePath;
          customer.profilePhotoUrl = promoted.url;
          customer.profilePhotoStoragePath = promoted.storagePath;
          args.summary.localToCloudMigrated += 1;
          changed = true;
        }
      } else {
        const normalizedUrl = currentUrl.startsWith('uploads/') ? `/${currentUrl}` : currentUrl;
        const normalizedStoragePath = resolveManagedStoragePath(normalizedUrl, currentStoragePath);
        if (
          customer.profilePhotoUrl !== normalizedUrl
          || String(customer.profilePhotoStoragePath || '') !== normalizedStoragePath
        ) {
          customer.profilePhotoUrl = normalizedUrl;
          customer.profilePhotoStoragePath = normalizedStoragePath;
          args.summary.metadataNormalized += 1;
          changed = true;
        }
      }

      if (changed) {
        await customer.save();
        const nextStoragePath = resolveManagedStoragePath(
          customer.profilePhotoUrl,
          customer.profilePhotoStoragePath
        );
        if (currentStoragePath && currentStoragePath !== nextStoragePath) {
          await removeManagedStoredFile(currentStoragePath);
        }
        writtenStoragePath = '';
      }
    } catch (error) {
      if (writtenStoragePath) {
        await removeManagedStoredFile(writtenStoragePath);
      }
      args.summary.failed += 1;
      console.warn(`Customer image migration skipped for ${String(customer?._id || '')}:`, error);
    }
  }
};

export const migrateExistingImagesToManagedStorage = async (args: {
  tenantId?: string;
  updatedBy?: string;
}): Promise<ImageStorageMigrationSummary> => {
  const { config } = await loadCloudStorageConfigRow();
  const preferCloud = config.enabled && isCloudStorageConfigUsable(config);
  const summary: ImageStorageMigrationSummary = {
    provider: preferCloud ? 'cloudflare_r2' : 'local',
    cloudStorageEnabled: preferCloud,
    facilities: createEntitySummary(),
    customers: createEntitySummary(),
    settings: {
      logos: createEntitySummary(),
      homeBackgrounds: createEntitySummary(),
    },
  };

  await migrateGeneralSettingsAssets({
    tenantId: args.tenantId,
    updatedBy: args.updatedBy,
    preferCloud,
    summary: summary.settings,
  });
  await migrateFacilities({
    tenantId: args.tenantId,
    preferCloud,
    summary: summary.facilities,
  });
  await migrateCustomers({
    tenantId: args.tenantId,
    preferCloud,
    summary: summary.customers,
  });

  return summary;
};
