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

export type ResolvedMailBranding = {
  displayName: string;
  legalName: string;
  tradeName: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
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

export const isValidEmailAddress = (value: unknown): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(value || '').trim());
};

export const uniqueRecipients = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  return values.reduce<string[]>((acc, value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return acc;
    }
    seen.add(normalized);
    acc.push(normalized);
    return acc;
  }, []);
};

const resolveStringSetting = (value: unknown, fallback: string): string => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeLogoUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw;
};

const businessAddress = (business: any): string => {
  const parts = [
    business?.addressLine1,
    business?.addressLine2,
    business?.city,
    business?.state,
    business?.pincode,
    business?.country,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.join(', ');
};

const mergeMailBranding = (settings: any, mail: ResolvedMailSettings): ResolvedMailBranding => {
  const business = settings?.business && typeof settings.business === 'object' ? settings.business : {};
  const legalName = String(business.legalName || '').trim();
  const tradeName = String(business.tradeName || '').trim();
  const displayName = tradeName || legalName || mail.appName || 'SPARK AI';

  return {
    displayName,
    legalName: legalName || displayName,
    tradeName,
    logoUrl: normalizeLogoUrl(business.reportLogoDataUrl || business.invoiceLogoDataUrl),
    phone: String(business.phone || '').trim(),
    email: String(business.email || mail.smtpFromEmail || '').trim(),
    address: businessAddress(business),
  };
};

export const mergeMailSettings = (value: any): ResolvedMailSettings => {
  const defaults = buildMailDefaults();
  const source = (value && typeof value === 'object') ? value : {};

  return {
    smtpHost: resolveStringSetting(source.smtpHost, defaults.smtpHost),
    smtpPort: toNumber(source.smtpPort, defaults.smtpPort),
    smtpUser: resolveStringSetting(source.smtpUser, defaults.smtpUser),
    smtpPass: resolveStringSetting(source.smtpPass, defaults.smtpPass),
    smtpFromEmail: resolveStringSetting(source.smtpFromEmail, defaults.smtpFromEmail),
    smtpToRecipients: resolveStringSetting(source.smtpToRecipients, defaults.smtpToRecipients),
    smtpSecure: parseBoolean(source.smtpSecure, defaults.smtpSecure),
    appName: resolveStringSetting(source.appName, defaults.appName),
  };
};

const findGeneralSettingsRow = async () => {
  return AppSetting.findOne({ key: { $in: GENERAL_SETTINGS_KEYS } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
};

const loadResolvedMailBranding = async (
  settingsOverride: any,
  mail: ResolvedMailSettings
): Promise<ResolvedMailBranding> => {
  if (settingsOverride?.business && typeof settingsOverride.business === 'object') {
    return mergeMailBranding(settingsOverride, mail);
  }

  const existing = await findGeneralSettingsRow();
  return mergeMailBranding(existing?.value || {}, mail);
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

const appendBusinessSignatureText = (text: string, branding: ResolvedMailBranding): string => {
  const signatureLines = [
    '',
    '--',
    branding.displayName,
    `Legal Name: ${branding.legalName}`,
    branding.phone ? `Phone: ${branding.phone}` : '',
    branding.email ? `Email: ${branding.email}` : '',
    branding.address ? `Address: ${branding.address}` : '',
  ].filter((line) => line !== '');

  return `${String(text || '').trim()}\n${signatureLines.join('\n')}`;
};

const appendBusinessSignatureHtml = (html: string, branding: ResolvedMailBranding): string => {
  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.displayName)} logo" style="max-width:96px;max-height:48px;object-fit:contain;display:block;margin-bottom:10px" />`
    : '';
  const detailLines = [
    `<strong>${escapeHtml(branding.displayName)}</strong>`,
    `Legal Name: ${escapeHtml(branding.legalName)}`,
    branding.phone ? `Phone: ${escapeHtml(branding.phone)}` : '',
    branding.email ? `Email: ${escapeHtml(branding.email)}` : '',
    branding.address ? `Address: ${escapeHtml(branding.address)}` : '',
  ].filter(Boolean);

  const signature = `
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;color:#374151;font-family:Arial,sans-serif;font-size:13px;line-height:1.45">
      ${logo}
      ${detailLines.map((line) => `<div>${line}</div>`).join('')}
    </div>
  `;

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      ${html || ''}
      ${signature}
    </div>
  `;
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
  const branding = await loadResolvedMailBranding(args.settingsOverride, mail);

  const transporter = createMailTransporter(mail);
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"${branding.displayName || mail.appName}" <${mail.smtpFromEmail}>`,
    to: args.recipients.join(', '),
    replyTo: mail.smtpFromEmail,
    subject: args.subject,
    text: appendBusinessSignatureText(args.text, branding),
    html: appendBusinessSignatureHtml(args.html, branding),
    attachments: args.attachments,
  });

  return {
    info,
    mail,
  };
};
