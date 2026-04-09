export type CrmDraftTarget = 'facility-booking' | 'event-booking' | 'event-quotation' | 'sales-quotation';

export type CrmConversionDraft = {
  target: CrmDraftTarget;
  enquiryId: string;
  enquiryNumber?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  requestedFacilityId?: string;
  requestedFacilityName?: string;
  requestedDate?: string;
  requestedStartTime?: string;
  durationHours?: number;
  preferredSport?: string;
  notes?: string;
};

const STORAGE_KEY = 'sarva.crm.conversionDraft';

export const saveCrmConversionDraft = (draft: CrmConversionDraft): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
};

export const consumeCrmConversionDraft = (target: CrmDraftTarget): CrmConversionDraft | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CrmConversionDraft;
    if (parsed?.target !== target) return null;
    window.localStorage.removeItem(STORAGE_KEY);
    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};
