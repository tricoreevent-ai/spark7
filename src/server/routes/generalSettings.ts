import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AppSetting } from '../models/AppSetting.js';
import { User } from '../models/User.js';
import { writeAuditLog } from '../services/audit.js';
import {
  parseImageDataUrl,
  persistManagedImageValue,
  removeManagedStoredFile,
  resolveManagedStoragePath,
  uploadImageBufferToManagedStorage,
} from '../services/assetStorage.js';
import {
  findGeneralSettingsRowForTenant,
  GENERAL_SETTINGS_KEY,
  GENERAL_SETTINGS_KEYS,
  loadTenantGeneralSettings,
  mergeGeneralSettingsWithDefaults,
  saveTenantGeneralSettingsRow,
} from '../services/generalSettings.js';
import {
  isValidEmailAddress,
  loadResolvedMailSettings,
  parseRecipients,
  sendConfiguredMail,
} from '../services/mail.js';
import { canAccessPage } from '../services/rbac.js';

const router = Router();
const MAX_BACKGROUND_FILE_BYTES = 6 * 1024 * 1024;

const tenantFilter = (req: AuthenticatedRequest, extra: Record<string, any> = {}) => {
  const filter: Record<string, any> = { ...extra };
  if (req.tenantId) filter.tenantId = req.tenantId;
  return filter;
};

const sanitizeFileName = (value: string): string => {
  const base = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return base || 'background-image';
};

const ensureOtpMailSettingsReady = async (settings: any) => {
  const mail = await loadResolvedMailSettings(settings);
  if (!mail.smtpHost || !mail.smtpPort || !mail.smtpUser || !mail.smtpPass || !mail.smtpFromEmail) {
    throw new Error('Configure SMTP host, port, user, password, and from email before enabling login OTP.');
  }

  const invalidRecipients = parseRecipients(settings?.security?.otpCopyRecipients).filter(
    (email) => !isValidEmailAddress(email)
  );
  if (invalidRecipients.length) {
    throw new Error('Enter valid OTP copy email addresses separated by commas.');
  }
};

const ensureEmployeeAttendanceLocationReady = (settings: any) => {
  if (!settings?.security?.employeeAttendanceGeofenceEnabled) return;

  const latitude = Number(settings?.security?.attendanceLatitude);
  const longitude = Number(settings?.security?.attendanceLongitude);
  const radiusMeters = Number(settings?.security?.attendanceRadiusMeters);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    throw new Error('Enter a valid sports complex latitude and longitude before enabling employee attendance location restriction.');
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters < 25) {
    throw new Error('Attendance radius should be at least 25 meters.');
  }
};

const loadActiveUser = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }

  const user = await User.findById(req.userId).select('role isActive');
  if (!user || !user.isActive) {
    res.status(403).json({ success: false, error: 'User is inactive or not found' });
    return null;
  }

  return user;
};

const ensureSettingsPermission = async (req: AuthenticatedRequest, res: Response) => {
  const user = await loadActiveUser(req, res);
  if (!user) return null;

  const allowed = await canAccessPage(String(user.role || ''), 'settings');
  if (!allowed) {
    res.status(403).json({ success: false, error: 'You do not have permission to update settings' });
    return null;
  }

  return user;
};

const saveTenantGeneralSettings = async (req: AuthenticatedRequest, settings: any) => {
  return saveTenantGeneralSettingsRow({
    tenantId: req.tenantId,
    settings,
    updatedBy: req.userId,
  });
};

const migrateLegacyGeneralSettings = async (req: AuthenticatedRequest) => {
  const row = await findGeneralSettingsRowForTenant(req.tenantId);
  if (!row || row.key === GENERAL_SETTINGS_KEY) {
    return row;
  }

  await AppSetting.findOneAndUpdate(
    tenantFilter(req, { key: GENERAL_SETTINGS_KEY }),
    {
      $set: {
        key: GENERAL_SETTINGS_KEY,
        tenantId: req.tenantId,
        value: row.value,
        updatedBy: row.updatedBy || req.userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await AppSetting.deleteMany(
    tenantFilter(req, {
      key: { $in: GENERAL_SETTINGS_KEYS.filter((key) => key !== GENERAL_SETTINGS_KEY) },
    })
  );

  return AppSetting.findOne(tenantFilter(req, { key: GENERAL_SETTINGS_KEY })).select('value updatedAt');
};

const removeStoredFile = async (storagePath?: string) => removeManagedStoredFile(storagePath);

const prepareManagedSettingImageField = async (args: {
  nextValue?: string;
  currentValue?: string;
  currentStoragePath?: string;
  tenantId?: string;
  fileBaseName: string;
}) => {
  const previousStoragePath = resolveManagedStoragePath(args.currentValue, args.currentStoragePath);
  const persisted = await persistManagedImageValue({
    imageValue: String(args.nextValue || '').trim(),
    tenantId: args.tenantId,
    directorySegments: ['general-settings', 'logos'],
    fileBaseName: args.fileBaseName,
  });
  const nextStoragePath = resolveManagedStoragePath(persisted.url, persisted.storagePath);

  return {
    value: persisted.url,
    storagePath: nextStoragePath,
    fileName: persisted.fileName || (nextStoragePath ? nextStoragePath.split('/').pop() || '' : ''),
    writtenStoragePath: persisted.wroteNewFile ? nextStoragePath : '',
    staleStoragePaths:
      previousStoragePath && previousStoragePath !== nextStoragePath
        ? [previousStoragePath]
        : [],
  };
};

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await loadActiveUser(req, res);
    if (!user) return;

    const row = await migrateLegacyGeneralSettings(req);
    const canonical = row || await AppSetting.findOne(tenantFilter(req, { key: GENERAL_SETTINGS_KEY })).select('value updatedAt');
    const mergedSettings = mergeGeneralSettingsWithDefaults(canonical?.value || {});

    res.json({
      success: true,
      data: {
        settings: mergedSettings,
        updatedAt: canonical?.updatedAt || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load general settings' });
  }
});

router.put('/', async (req: AuthenticatedRequest, res: Response) => {
  const writtenStoragePaths: string[] = [];
  try {
    const user = await ensureSettingsPermission(req, res);
    if (!user) return;

    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'settings object is required' });
    }

    const existing = await findGeneralSettingsRowForTenant(req.tenantId);
    const before = existing?.value || null;
    const existingSettings = mergeGeneralSettingsWithDefaults(before || {});
    const normalized = mergeGeneralSettingsWithDefaults(settings);

    const invoiceLogo = await prepareManagedSettingImageField({
      nextValue: normalized?.business?.invoiceLogoDataUrl,
      currentValue: existingSettings?.business?.invoiceLogoDataUrl,
      currentStoragePath: existingSettings?.business?.invoiceLogoStoragePath,
      tenantId: req.tenantId,
      fileBaseName: 'invoice-logo',
    });
    const reportLogo = await prepareManagedSettingImageField({
      nextValue: normalized?.business?.reportLogoDataUrl,
      currentValue: existingSettings?.business?.reportLogoDataUrl,
      currentStoragePath: existingSettings?.business?.reportLogoStoragePath,
      tenantId: req.tenantId,
      fileBaseName: 'report-logo',
    });

    if (invoiceLogo.writtenStoragePath) writtenStoragePaths.push(invoiceLogo.writtenStoragePath);
    if (reportLogo.writtenStoragePath) writtenStoragePaths.push(reportLogo.writtenStoragePath);

    normalized.business = {
      ...(normalized.business && typeof normalized.business === 'object' ? normalized.business : {}),
      invoiceLogoDataUrl: invoiceLogo.value,
      invoiceLogoStoragePath: invoiceLogo.storagePath,
      invoiceLogoFileName: invoiceLogo.fileName,
      reportLogoDataUrl: reportLogo.value,
      reportLogoStoragePath: reportLogo.storagePath,
      reportLogoFileName: reportLogo.fileName,
    };

    if (normalized.security.emailOtpEnabled) {
      await ensureOtpMailSettingsReady(normalized);
    }
    ensureEmployeeAttendanceLocationReady(normalized);

    const saved = await saveTenantGeneralSettings(req, normalized);
    writtenStoragePaths.length = 0;
    if (existing && existing.key !== GENERAL_SETTINGS_KEY) {
      await AppSetting.deleteMany(
        tenantFilter(req, {
          key: { $in: GENERAL_SETTINGS_KEYS.filter((key) => key !== GENERAL_SETTINGS_KEY) },
        })
      );
    }

    await writeAuditLog({
      module: 'settings',
      action: 'general_settings_saved',
      entityType: 'app_settings',
      userId: req.userId,
      before: before || undefined,
      after: saved?.value || normalized,
    });

    const activeManagedPaths = new Set(
      [invoiceLogo.storagePath, reportLogo.storagePath].filter(Boolean)
    );
    const staleStoragePaths = [...invoiceLogo.staleStoragePaths, ...reportLogo.staleStoragePaths]
      .filter((storagePath, index, rows) => storagePath && rows.indexOf(storagePath) === index)
      .filter((storagePath) => !activeManagedPaths.has(storagePath));
    for (const storagePath of staleStoragePaths) {
      await removeStoredFile(storagePath);
    }

    res.json({
      success: true,
      message: 'General settings saved',
      data: {
        settings: saved?.value || normalized,
        updatedAt: saved?.updatedAt || null,
      },
    });
  } catch (error: any) {
    for (const storagePath of writtenStoragePaths) {
      await removeStoredFile(storagePath);
    }
    const message = error.message || 'Failed to save general settings';
    const status = (
      message.includes('Configure SMTP')
      || message.includes('Please upload a valid image')
      || message.includes('Supported image types')
      || message.includes('less than 6 MB')
      || message.includes('empty')
    )
      ? 400
      : 500;
    res.status(status).json({ success: false, error: message });
  }
});

router.post('/appearance/home-backgrounds/upload', async (req: AuthenticatedRequest, res: Response) => {
  let writtenStoragePath = '';

  try {
    const user = await ensureSettingsPermission(req, res);
    if (!user) return;

    const dataUrl = String(req.body?.dataUrl || '').trim();
    const originalFileName = sanitizeFileName(String(req.body?.fileName || 'background-image'));
    const { mimeType, buffer } = parseImageDataUrl(dataUrl, {
      maxBytes: MAX_BACKGROUND_FILE_BYTES,
      sizeMessage: 'Background image size should be less than 6 MB.',
    });
    const persisted = await uploadImageBufferToManagedStorage({
      buffer,
      contentType: mimeType,
      tenantId: req.tenantId,
      directorySegments: ['general-settings', 'home-backgrounds'],
      fileBaseName: originalFileName,
      originalFileName,
    });
    writtenStoragePath = String(persisted.storagePath || '');

    const settings = await loadTenantGeneralSettings(req.tenantId);
    const image = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      url: persisted.url,
      storagePath: persisted.storagePath || '',
      fileName: originalFileName,
      uploadedAt: new Date().toISOString(),
    };

    const updatedSettings = mergeGeneralSettingsWithDefaults({
      ...settings,
      appearance: {
        ...settings.appearance,
        homeBackgrounds: [...settings.appearance.homeBackgrounds, image],
      },
    });

    const saved = await saveTenantGeneralSettings(req, updatedSettings);
    writtenStoragePath = '';

    await writeAuditLog({
      module: 'settings',
      action: 'home_background_uploaded',
      entityType: 'app_settings',
      userId: req.userId,
      metadata: {
        fileName: image.fileName,
        storagePath: image.storagePath,
      },
    });

    res.json({
      success: true,
      message: 'Home background uploaded',
      data: {
        image,
        settings: saved?.value || updatedSettings,
        updatedAt: saved?.updatedAt || null,
      },
    });
  } catch (error: any) {
    await removeStoredFile(writtenStoragePath);
    const message = error.message || 'Failed to upload home background';
    const status = (
      message.includes('Please upload a valid image')
      || message.includes('Supported image types')
      || message.includes('less than 6 MB')
      || message.includes('empty')
    )
      ? 400
      : 500;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

router.delete('/appearance/home-backgrounds/:imageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureSettingsPermission(req, res);
    if (!user) return;

    const imageId = String(req.params.imageId || '').trim();
    if (!imageId) {
      return res.status(400).json({ success: false, error: 'Image id is required' });
    }

    const settings = await loadTenantGeneralSettings(req.tenantId);
    const image = settings.appearance.homeBackgrounds.find((item: any) => item.id === imageId);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Home background not found' });
    }

    const updatedSettings = mergeGeneralSettingsWithDefaults({
      ...settings,
      appearance: {
        ...settings.appearance,
        homeBackgrounds: settings.appearance.homeBackgrounds.filter((item: any) => item.id !== imageId),
      },
    });

    const saved = await saveTenantGeneralSettings(req, updatedSettings);
    await removeStoredFile(image.storagePath);

    await writeAuditLog({
      module: 'settings',
      action: 'home_background_deleted',
      entityType: 'app_settings',
      userId: req.userId,
      metadata: {
        fileName: image.fileName,
        storagePath: image.storagePath,
      },
    });

    res.json({
      success: true,
      message: 'Home background removed',
      data: {
        settings: saved?.value || updatedSettings,
        updatedAt: saved?.updatedAt || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove home background',
    });
  }
});

router.post('/test-email', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await ensureSettingsPermission(req, res);
    if (!user) return;

    const submittedSettings = req.body?.settings;
    const existing = await findGeneralSettingsRowForTenant(req.tenantId);
    const mergedSettings = mergeGeneralSettingsWithDefaults(submittedSettings || existing?.value || {});
    const mail = await loadResolvedMailSettings(mergedSettings);
    const recipientInput = String(req.body?.recipientEmail || '').trim();
    const recipients = parseRecipients(recipientInput || mail.smtpToRecipients);
    const appName = String(mail.appName || 'SPARK AI').trim() || 'SPARK AI';

    const smtpInfoRows = [
      ['Host', String(mail.smtpHost || '').trim()],
      ['Port', String(mail.smtpPort || '').trim()],
      ['From', String(mail.smtpFromEmail || '').trim()],
      ['Time', new Date().toLocaleString()],
    ];

    const info = (
      await sendConfiguredMail({
        settingsOverride: mergedSettings,
        recipients,
        subject: `${appName} SMTP Test`,
        text: `This is a test email from ${appName}.\n\nSMTP host: ${mail.smtpHost}\nPort: ${mail.smtpPort}\nTime: ${new Date().toISOString()}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
            <h2 style="margin-bottom:8px">${appName} SMTP Test</h2>
            <p>This test email confirms the configured SMTP settings can connect and send successfully.</p>
            <table style="border-collapse:collapse;margin-top:12px">
              ${smtpInfoRows
                .map(
                  ([label, value]) =>
                    `<tr><td style="padding:4px 12px 4px 0"><strong>${label}</strong></td><td style="padding:4px 0">${value}</td></tr>`
                )
                .join('')}
            </table>
          </div>
        `,
      })
    ).info;

    res.json({
      success: true,
      message: `Test email sent to ${recipients.join(', ')}`,
      data: {
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        response: info.response || '',
        messageId: info.messageId || '',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send test email',
    });
  }
});

export default router;
