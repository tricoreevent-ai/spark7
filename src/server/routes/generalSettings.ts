import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AppSetting } from '../models/AppSetting.js';
import { User } from '../models/User.js';
import { writeAuditLog } from '../services/audit.js';
import {
  findGeneralSettingsRowForTenant,
  GENERAL_SETTINGS_KEY,
  GENERAL_SETTINGS_KEYS,
  loadTenantGeneralSettings,
  mergeGeneralSettingsWithDefaults,
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
const ALLOWED_IMAGE_MIME_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const entryDir = process.argv[1]
  ? path.dirname(path.resolve(process.argv[1]))
  : path.resolve(process.cwd(), 'src', 'server');

const runtimeRootCandidates = [
  path.resolve(process.cwd()),
  path.resolve(entryDir, '..', '..'),
  path.resolve(entryDir, '..'),
];

const runtimeRoot =
  runtimeRootCandidates.find((candidate, index) => {
    if (index === 0) return true;
    return ['package.json', 'dist', 'src'].some((name) => fsExists(path.join(candidate, name)));
  }) || path.resolve(process.cwd());

const uploadsRoot = path.join(runtimeRoot, 'uploads');

function fsExists(targetPath: string): boolean {
  return existsSync(targetPath);
}

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

const parseImageDataUrl = (dataUrl: string): { mimeType: string; buffer: Buffer } => {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) {
    throw new Error('Please upload a valid image file.');
  }

  const mimeType = String(match[1] || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('Supported image types are JPG, PNG, WEBP, and GIF.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw new Error('Uploaded image is empty.');
  }

  if (buffer.length > MAX_BACKGROUND_FILE_BYTES) {
    throw new Error('Background image size should be less than 6 MB.');
  }

  return { mimeType, buffer };
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
  const normalized = mergeGeneralSettingsWithDefaults(settings);
  return AppSetting.findOneAndUpdate(
    tenantFilter(req, { key: GENERAL_SETTINGS_KEY }),
    {
      $set: {
        key: GENERAL_SETTINGS_KEY,
        tenantId: req.tenantId,
        value: normalized,
        updatedBy: req.userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
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

const removeStoredFile = async (storagePath?: string) => {
  const relativePath = String(storagePath || '').trim();
  if (!relativePath) return;

  const absolutePath = path.resolve(runtimeRoot, relativePath);
  const normalizedUploadsRoot = path.resolve(uploadsRoot);
  if (!absolutePath.startsWith(`${normalizedUploadsRoot}${path.sep}`)) {
    return;
  }

  try {
    await fs.unlink(absolutePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('Failed to remove uploaded settings file:', error);
    }
  }
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
  try {
    const user = await ensureSettingsPermission(req, res);
    if (!user) return;

    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'settings object is required' });
    }

    const existing = await findGeneralSettingsRowForTenant(req.tenantId);
    const before = existing?.value || null;
    const normalized = mergeGeneralSettingsWithDefaults(settings);

    if (normalized.security.emailOtpEnabled) {
      await ensureOtpMailSettingsReady(normalized);
    }

    const saved = await saveTenantGeneralSettings(req, normalized);
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

    res.json({
      success: true,
      message: 'General settings saved',
      data: {
        settings: saved?.value || normalized,
        updatedAt: saved?.updatedAt || null,
      },
    });
  } catch (error: any) {
    const message = error.message || 'Failed to save general settings';
    const status = message.includes('Configure SMTP') ? 400 : 500;
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
    const { mimeType, buffer } = parseImageDataUrl(dataUrl);
    const extension = ALLOWED_IMAGE_MIME_TYPES.get(mimeType) || path.extname(originalFileName).toLowerCase() || '.png';
    const tenantSegment = String(req.tenantId || 'global').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const generatedFileName = `${Date.now()}-${randomBytes(6).toString('hex')}${extension}`;
    const relativeDir = path.posix.join('uploads', 'tenants', tenantSegment, 'general-settings', 'home-backgrounds');
    const relativePath = path.posix.join(relativeDir, generatedFileName);
    const absoluteDir = path.join(runtimeRoot, relativeDir);
    const absolutePath = path.join(runtimeRoot, relativePath);

    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    writtenStoragePath = relativePath;

    const settings = await loadTenantGeneralSettings(req.tenantId);
    const image = {
      id: randomBytes(12).toString('hex'),
      url: `/${relativePath.replace(/\\/g, '/')}`,
      storagePath: relativePath.replace(/\\/g, '/'),
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
