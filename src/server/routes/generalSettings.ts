import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AppSetting } from '../models/AppSetting.js';
import { User } from '../models/User.js';
import { canAccessPage } from '../services/rbac.js';
import { writeAuditLog } from '../services/audit.js';
import {
  buildMailDefaults,
  loadResolvedMailSettings,
  mergeMailSettings,
  parseRecipients,
  sendConfiguredMail,
} from '../services/mail.js';

const router = Router();
const GENERAL_SETTINGS_KEY = 'general_settings';
const GENERAL_SETTINGS_KEYS = [GENERAL_SETTINGS_KEY, 'pos_general_settings_v1', 'pos_settings'];

const mergeSettingsWithDefaults = (settings: any) => ({
  ...(settings && typeof settings === 'object' ? settings : {}),
  mail: {
    ...buildMailDefaults(),
    ...((settings?.mail && typeof settings.mail === 'object') ? settings.mail : {}),
  },
});

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
