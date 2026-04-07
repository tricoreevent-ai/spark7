import { AppSetting } from '../models/AppSetting.js';
import { buildMailDefaults } from './mail.js';

export const GENERAL_SETTINGS_KEY = 'general_settings';
export const GENERAL_SETTINGS_KEYS = [GENERAL_SETTINGS_KEY, 'pos_general_settings_v1', 'pos_settings'];

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const normalizeBackgroundImage = (value: any) => ({
  id: String(value?.id || '').trim(),
  url: String(value?.url || '').trim(),
  storagePath: String(value?.storagePath || '').trim(),
  fileName: String(value?.fileName || '').trim(),
  uploadedAt: String(value?.uploadedAt || '').trim(),
});

export const mergeGeneralSettingsWithDefaults = (settings: any) => ({
  ...(settings && typeof settings === 'object' ? settings : {}),
  printing: {
    promptAfterSale: Boolean(settings?.printing?.promptAfterSale ?? true),
    autoPrintAfterSale: Boolean(settings?.printing?.autoPrintAfterSale),
    profile: ['a4', 'thermal80', 'thermal58'].includes(String(settings?.printing?.profile || ''))
      ? String(settings?.printing?.profile)
      : 'a4',
    showPrintPreviewHint: Boolean(settings?.printing?.showPrintPreviewHint ?? true),
    showVoucherSignatureLines: Boolean(settings?.printing?.showVoucherSignatureLines ?? true),
  },
  mail: {
    ...buildMailDefaults(),
    ...((settings?.mail && typeof settings.mail === 'object') ? settings.mail : {}),
  },
  appearance: {
    homeBackgrounds: Array.isArray(settings?.appearance?.homeBackgrounds)
      ? settings.appearance.homeBackgrounds
        .map(normalizeBackgroundImage)
        .filter((image: any) => image.id && image.url)
      : [],
    homeBackgroundRotationSeconds: clampNumber(settings?.appearance?.homeBackgroundRotationSeconds, 8, 3, 60),
  },
  security: {
    emailOtpEnabled: Boolean(settings?.security?.emailOtpEnabled),
    otpExpiryMinutes: clampNumber(settings?.security?.otpExpiryMinutes, 10, 3, 30),
    otpCopyRecipients: String(settings?.security?.otpCopyRecipients || '').trim(),
  },
});

export const findGeneralSettingsRowForTenant = async (tenantId?: string) => {
  const filter: Record<string, any> = { key: { $in: GENERAL_SETTINGS_KEYS } };
  if (tenantId) filter.tenantId = tenantId;
  return AppSetting.findOne(filter).sort({ updatedAt: -1, createdAt: -1 });
};

export const loadTenantGeneralSettings = async (tenantId?: string) => {
  const row = await findGeneralSettingsRowForTenant(tenantId);
  return mergeGeneralSettingsWithDefaults(row?.value || {});
};
