import nodemailer from 'nodemailer';
import { AppSetting } from '../models/AppSetting.js';

const GENERAL_SETTINGS_KEYS = ['general_settings', 'pos_general_settings_v1', 'pos_settings'];

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

export type ResolvedMailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFromEmail: string;
  smtpToRecipients: string;
  smtpSecure: boolean;
  appName: string;
};

export const buildMailDefaults = (): ResolvedMailSettings => ({
  smtpHost: String(process.env.SMTP_HOST || '').trim(),
  smtpPort: toNumber(process.env.SMTP_PORT, 587),
  smtpUser: String(process.env.SMTP_USER || '').trim(),
  smtpPass: String(process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim(),
  smtpFromEmail: String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '').trim(),
  smtpToRecipients: String(process.env.SMTP_TO_RECIPIENTS || '').trim(),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, toNumber(process.env.SMTP_PORT, 587) === 465),
  appName: String(process.env.SMTP_APP_NAME || 'SPARK AI').trim() || 'SPARK AI',
});

export const parseRecipients = (value: unknown): string[] =>
  String(value || '')
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const mergeMailSettings = (value: any): ResolvedMailSettings => ({
  ...buildMailDefaults(),
  ...((value && typeof value === 'object') ? value : {}),
});

const findGeneralSettingsRow = async () => {
  return AppSetting.findOne({ key: { $in: GENERAL_SETTINGS_KEYS } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
};

export const loadResolvedMailSettings = async (
  settingsOverride?: any
): Promise<ResolvedMailSettings> => {
  const overrideMail = settingsOverride?.mail && typeof settingsOverride.mail === 'object'
    ? settingsOverride.mail
    : settingsOverride && typeof settingsOverride === 'object'
      ? settingsOverride
      : null;

  if (overrideMail) {
    return mergeMailSettings(overrideMail);
  }

  const existing = await findGeneralSettingsRow();
  return mergeMailSettings(existing?.value?.mail || {});
};

export const createMailTransporter = (mail: ResolvedMailSettings) => {
  return nodemailer.createTransport({
    host: mail.smtpHost,
    port: mail.smtpPort,
    secure: Boolean(mail.smtpSecure ?? (mail.smtpPort === 465)),
    auth: {
      user: mail.smtpUser,
      pass: mail.smtpPass,
    },
  });
};

export const assertMailSettingsReady = (mail: ResolvedMailSettings, recipients: string[]) => {
  if (!mail.smtpHost || !mail.smtpPort || !mail.smtpUser || !mail.smtpPass || !mail.smtpFromEmail) {
    throw new Error('Mail settings are incomplete. Please configure SMTP host, port, user, password, and from email.');
  }

  if (!recipients.length) {
    throw new Error('Recipient email address is required.');
  }
};

export const sendConfiguredMail = async (args: {
  settingsOverride?: any;
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}) => {
  const mail = await loadResolvedMailSettings(args.settingsOverride);
  assertMailSettingsReady(mail, args.recipients);

  const transporter = createMailTransporter(mail);
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"${mail.appName}" <${mail.smtpFromEmail}>`,
    to: args.recipients.join(', '),
    replyTo: mail.smtpFromEmail,
    subject: args.subject,
    text: args.text,
    html: args.html,
    attachments: args.attachments,
  });

  return {
    info,
    mail,
  };
};
