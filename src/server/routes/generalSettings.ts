import { Router, Response } from 'express';
import nodemailer from 'nodemailer';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AppSetting } from '../models/AppSetting.js';
import { User } from '../models/User.js';
import { canAccessPage } from '../services/rbac.js';
import { writeAuditLog } from '../services/audit.js';

const router = Router();
const GENERAL_SETTINGS_KEY = 'general_settings';
const GENERAL_SETTINGS_KEYS = [GENERAL_SETTINGS_KEY, 'pos_general_settings_v1', 'pos_settings'];

const parseBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildMailDefaults = () => ({
  smtpHost: String(process.env.SMTP_HOST || '').trim(),
  smtpPort: toNumber(process.env.SMTP_PORT, 587),
  smtpUser: String(process.env.SMTP_USER || '').trim(),
  smtpPass: String(process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim(),
  smtpFromEmail: String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '').trim(),
  smtpToRecipients: String(process.env.SMTP_TO_RECIPIENTS || '').trim(),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, toNumber(process.env.SMTP_PORT, 587) === 465),
  appName: String(process.env.SMTP_APP_NAME || 'Tricore').trim() || 'Tricore',
});

const mergeSettingsWithDefaults = (settings: any) => ({
  ...(settings && typeof settings === 'object' ? settings : {}),
  mail: {
    ...buildMailDefaults(),
    ...((settings?.mail && typeof settings.mail === 'object') ? settings.mail : {}),
  },
});

const parseRecipients = (value: unknown): string[] =>
  String(value || '')
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const findGeneralSettingsRow = async () => {
  return AppSetting.findOne({ key: { $in: GENERAL_SETTINGS_KEYS } })
    .sort({ updatedAt: -1, createdAt: -1 });
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

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await loadActiveUser(req, res);
    if (!user) return;

    const row = await findGeneralSettingsRow();
    if (row && row.key !== GENERAL_SETTINGS_KEY) {
      await AppSetting.findOneAndUpdate(
        { key: GENERAL_SETTINGS_KEY },
        { $set: { value: row.value, updatedBy: row.updatedBy || req.userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await AppSetting.deleteMany({ key: { $in: GENERAL_SETTINGS_KEYS.filter((key) => key !== GENERAL_SETTINGS_KEY) } });
    }

    const canonical = await AppSetting.findOne({ key: GENERAL_SETTINGS_KEY }).select('value updatedAt');
    const mergedSettings = mergeSettingsWithDefaults(canonical?.value || row?.value || {});

    res.json({
      success: true,
      data: {
        settings: mergedSettings,
        updatedAt: canonical?.updatedAt || row?.updatedAt || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load general settings' });
  }
});

router.put('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await loadActiveUser(req, res);
    if (!user) return;

    const allowed = await canAccessPage(String(user.role || ''), 'settings');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'You do not have permission to update settings' });
    }

    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'settings object is required' });
    }

    const existing = await findGeneralSettingsRow();
    const before = existing?.value || null;

    const saved = await AppSetting.findOneAndUpdate(
      { key: GENERAL_SETTINGS_KEY },
      { $set: { value: settings, updatedBy: req.userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (existing && existing.key !== GENERAL_SETTINGS_KEY) {
      await AppSetting.deleteMany({ key: { $in: GENERAL_SETTINGS_KEYS.filter((key) => key !== GENERAL_SETTINGS_KEY) } });
    }

    await writeAuditLog({
      module: 'settings',
      action: 'general_settings_saved',
      entityType: 'app_settings',
      userId: req.userId,
      before: before || undefined,
      after: saved?.value || settings,
    });

    res.json({
      success: true,
      message: 'General settings saved',
      data: {
        settings: saved?.value || settings,
        updatedAt: saved?.updatedAt || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to save general settings' });
  }
});

router.post('/test-email', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await loadActiveUser(req, res);
    if (!user) return;

    const allowed = await canAccessPage(String(user.role || ''), 'settings');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'You do not have permission to test email settings' });
    }

    const submittedSettings = req.body?.settings;
    const existing = await findGeneralSettingsRow();
    const mergedSettings = mergeSettingsWithDefaults(submittedSettings || existing?.value || {});
    const mail = mergedSettings?.mail || {};

    const smtpHost = String(mail.smtpHost || '').trim();
    const smtpPort = toNumber(mail.smtpPort, 587);
    const smtpUser = String(mail.smtpUser || '').trim();
    const smtpPass = String(mail.smtpPass || '').trim();
    const smtpFromEmail = String(mail.smtpFromEmail || smtpUser).trim();
    const smtpSecure = Boolean(mail.smtpSecure ?? (smtpPort === 465));
    const smtpToRecipients = parseRecipients(mail.smtpToRecipients);
    const appName = String(mail.appName || 'Tricore').trim() || 'Tricore';

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFromEmail || smtpToRecipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Mail settings are incomplete. Please set host, port, user, password, from email and recipients.',
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"${appName}" <${smtpFromEmail}>`,
      to: smtpToRecipients.join(', '),
      replyTo: smtpFromEmail,
      subject: `${appName} SMTP Test`,
      text: `This is a test email from ${appName}.\n\nSMTP host: ${smtpHost}\nPort: ${smtpPort}\nTime: ${new Date().toISOString()}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2 style="margin-bottom:8px">${appName} SMTP Test</h2>
          <p>This test email confirms the configured SMTP settings can connect and send successfully.</p>
          <table style="border-collapse:collapse;margin-top:12px">
            <tr><td style="padding:4px 12px 4px 0"><strong>Host</strong></td><td style="padding:4px 0">${smtpHost}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Port</strong></td><td style="padding:4px 0">${smtpPort}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>From</strong></td><td style="padding:4px 0">${smtpFromEmail}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Time</strong></td><td style="padding:4px 0">${new Date().toLocaleString()}</td></tr>
          </table>
        </div>
      `,
    });

    res.json({
      success: true,
      message: `Test email sent to ${smtpToRecipients.join(', ')}`,
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
