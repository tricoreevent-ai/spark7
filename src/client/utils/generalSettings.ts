import { apiUrl, fetchApiJson } from './api';

export type PrintProfile = 'a4' | 'thermal80' | 'thermal58';

export interface BusinessSettings {
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  invoiceLogoDataUrl: string;
  reportLogoDataUrl: string;
}

export interface InvoiceSettings {
  title: string;
  subtitle: string;
  prefix: string;
  nextNumber: number;
  showGstBreakup: boolean;
  showHsnCode: boolean;
  showCustomerDetails: boolean;
  showBusinessGstin: boolean;
  useCustomInvoiceNumber: boolean;
  terms: string;
  footerNote: string;
}

export interface PrintingSettings {
  promptAfterSale: boolean;
  autoPrintAfterSale: boolean;
  profile: PrintProfile;
  showPrintPreviewHint: boolean;
  showVoucherSignatureLines: boolean;
}

export interface MailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFromEmail: string;
  smtpToRecipients: string;
  smtpSecure: boolean;
  appName: string;
}

export interface HomeBackgroundImage {
  id: string;
  url: string;
  storagePath: string;
  fileName: string;
  uploadedAt: string;
}

export interface AppearanceSettings {
  homeBackgrounds: HomeBackgroundImage[];
  homeBackgroundRotationSeconds: number;
}

export interface SecuritySettings {
  emailOtpEnabled: boolean;
  otpExpiryMinutes: number;
  otpCopyRecipients: string;
}

export interface GeneralSettings {
  business: BusinessSettings;
  invoice: InvoiceSettings;
  printing: PrintingSettings;
  mail: MailSettings;
  appearance: AppearanceSettings;
  security: SecuritySettings;
}

export const GENERAL_SETTINGS_KEY = 'pos_general_settings_v1';
const LEGACY_GENERAL_SETTINGS_KEYS = ['pos_settings'];
const GENERAL_SETTINGS_API_PATH = '/api/general-settings';

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  business: {
    legalName: 'Your Business Name',
    tradeName: 'Your Store',
    gstin: '',
    pan: '',
    phone: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    invoiceLogoDataUrl: '',
    reportLogoDataUrl: '',
  },
  invoice: {
    title: 'TAX INVOICE',
    subtitle: 'Original for Recipient',
    prefix: 'INV-',
    nextNumber: 1,
    showGstBreakup: true,
    showHsnCode: true,
    showCustomerDetails: true,
    showBusinessGstin: true,
    useCustomInvoiceNumber: false,
    terms: 'Goods once sold will not be taken back without valid reason.',
    footerNote: 'Thank you for your business.',
  },
  printing: {
    promptAfterSale: true,
    autoPrintAfterSale: false,
    profile: 'a4',
    showPrintPreviewHint: true,
    showVoucherSignatureLines: true,
  },
  mail: {
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFromEmail: '',
    smtpToRecipients: '',
    smtpSecure: false,
    appName: 'Tricore',
  },
  appearance: {
    homeBackgrounds: [],
    homeBackgroundRotationSeconds: 8,
  },
  security: {
    emailOtpEnabled: false,
    otpExpiryMinutes: 10,
    otpCopyRecipients: '',
  },
};

const safeParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const mergeGeneralSettings = (saved?: Partial<GeneralSettings> | null): GeneralSettings => ({
  business: {
    ...DEFAULT_GENERAL_SETTINGS.business,
    ...((saved?.business as Partial<BusinessSettings>) || {}),
  },
  invoice: {
    ...DEFAULT_GENERAL_SETTINGS.invoice,
    ...((saved?.invoice as Partial<InvoiceSettings>) || {}),
  },
  printing: {
    ...DEFAULT_GENERAL_SETTINGS.printing,
    ...((saved?.printing as Partial<PrintingSettings>) || {}),
  },
  mail: {
    ...DEFAULT_GENERAL_SETTINGS.mail,
    ...((saved?.mail as Partial<MailSettings>) || {}),
  },
  appearance: {
    ...DEFAULT_GENERAL_SETTINGS.appearance,
    ...((saved?.appearance as Partial<AppearanceSettings>) || {}),
    homeBackgrounds: Array.isArray(saved?.appearance?.homeBackgrounds)
      ? saved!.appearance!.homeBackgrounds
        .map((image) => ({
          id: String(image?.id || '').trim(),
          url: String(image?.url || '').trim(),
          storagePath: String(image?.storagePath || '').trim(),
          fileName: String(image?.fileName || '').trim(),
          uploadedAt: String(image?.uploadedAt || '').trim(),
        }))
        .filter((image) => image.id && image.url)
      : [],
  },
  security: {
    ...DEFAULT_GENERAL_SETTINGS.security,
    ...((saved?.security as Partial<SecuritySettings>) || {}),
  },
});

const readGeneralSettingsFromStorage = (): GeneralSettings | null => {
  const current = safeParse<Partial<GeneralSettings>>(localStorage.getItem(GENERAL_SETTINGS_KEY));
  if (current) return mergeGeneralSettings(current);

  for (const legacyKey of LEGACY_GENERAL_SETTINGS_KEYS) {
    const legacy = safeParse<Partial<GeneralSettings>>(localStorage.getItem(legacyKey));
    if (!legacy) continue;
    const migrated = mergeGeneralSettings(legacy);
    localStorage.setItem(GENERAL_SETTINGS_KEY, JSON.stringify(migrated));
    localStorage.removeItem(legacyKey);
    return migrated;
  }

  return null;
};

export const getGeneralSettings = (): GeneralSettings => {
  return readGeneralSettingsFromStorage() || mergeGeneralSettings(null);
};

export const saveGeneralSettings = (settings: GeneralSettings): void => {
  localStorage.setItem(GENERAL_SETTINGS_KEY, JSON.stringify(mergeGeneralSettings(settings)));
};

export const loadGeneralSettingsFromServer = async (
  token?: string,
  options?: { force?: boolean }
): Promise<GeneralSettings> => {
  const fromStorage = readGeneralSettingsFromStorage();
  const shouldForce = Boolean(options?.force);
  if (fromStorage && !shouldForce) {
    return fromStorage;
  }

  const activeToken = String(token || localStorage.getItem('token') || '').trim();
  if (!activeToken) {
    return fromStorage || mergeGeneralSettings(null);
  }

  try {
    const response = await fetchApiJson(apiUrl(GENERAL_SETTINGS_API_PATH), {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    });
    const shared = response?.data?.settings;
    if (shared && typeof shared === 'object') {
      const merged = mergeGeneralSettings(shared as Partial<GeneralSettings>);
      saveGeneralSettings(merged);
      return merged;
    }
  } catch {
    // keep local/default values if server sync is unavailable
  }

  return fromStorage || mergeGeneralSettings(null);
};

export const resetGeneralSettings = (): GeneralSettings => {
  const reset = mergeGeneralSettings(DEFAULT_GENERAL_SETTINGS);
  localStorage.setItem(GENERAL_SETTINGS_KEY, JSON.stringify(reset));
  return reset;
};

export const resolveGeneralSettingsAssetUrl = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return apiUrl(raw.startsWith('/') ? raw : `/${raw}`);
};

export const formatCustomInvoiceNumber = (prefix: string, nextNumber: number): string => {
  return `${prefix}${String(nextNumber).padStart(6, '0')}`;
};

export const reserveInvoiceNumber = (
  settings: GeneralSettings,
  saleNumber?: string
): { invoiceNumber: string; updatedSettings: GeneralSettings } => {
  if (!settings.invoice.useCustomInvoiceNumber) {
    return {
      invoiceNumber: saleNumber || '-',
      updatedSettings: settings,
    };
  }

  const invoiceNumber = formatCustomInvoiceNumber(settings.invoice.prefix, settings.invoice.nextNumber);
  const updatedSettings: GeneralSettings = {
    ...settings,
    invoice: {
      ...settings.invoice,
      nextNumber: settings.invoice.nextNumber + 1,
    },
  };

  return { invoiceNumber, updatedSettings };
};
