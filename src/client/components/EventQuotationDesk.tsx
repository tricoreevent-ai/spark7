import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ManualHelpLink } from './ManualHelpLink';
import { ActionIconButton } from './ActionIconButton';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { getGeneralSettings } from '../utils/generalSettings';
import {
  downloadEventQuotationExcel,
  downloadEventQuotationWord,
  PrintableEventQuotation,
} from '../utils/eventQuotationPrint';
import { CrmConversionDraft } from '../utils/crmDrafts';
import { downloadPdfDocument, openPdfDocument, ServerPdfDocument } from '../utils/pdfDocument';
import { showConfirmDialog, showPromptDialog } from '../utils/appDialogs';

export interface EventQuotationFacilityOption {
  _id: string;
  name: string;
  location?: string;
  hourlyRate: number;
  active: boolean;
}

export interface EventQuotationBookingDraft {
  sourceQuotationId: string;
  sourceQuotationNumber: string;
  bookingMode: 'single' | 'multiple';
  eventName: string;
  organizerName: string;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  facilityIds: string[];
  eventDate: string;
  occurrenceDates: string[];
  startTime: string;
  endTime: string;
  totalAmount: string;
  advanceAmount: string;
  remarks: string;
}

type EventQuotationDeskProps = {
  facilities: EventQuotationFacilityOption[];
  onUseQuoteForBooking: (draft: EventQuotationBookingDraft) => void;
  allowBookingConversion?: boolean;
  incomingCrmDraft?: CrmConversionDraft | null;
  onConsumeCrmDraft?: () => void;
};

type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'replaced' | 'booked';
type DiscountType = 'percentage' | 'fixed';
type BookingMode = 'single' | 'multiple';

interface QuoteOccurrence {
  occurrenceDate?: string;
  startTime: string;
  endTime: string;
}

interface QuoteFacility {
  _id: string;
  name: string;
  location?: string;
  hourlyRate?: number;
}

interface QuoteItemFormRow {
  itemType: 'facility' | 'service' | 'custom';
  facilityId?: string;
  description: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  lineTotal: number;
  notes?: string;
}

interface QuoteRow {
  _id: string;
  quoteNumber: string;
  quoteGroupCode: string;
  version: number;
  sourceQuotationId?: string;
  replacedByQuotationId?: string;
  quoteStatus: QuoteStatus;
  validUntil?: string;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilityIds: QuoteFacility[];
  occurrences: QuoteOccurrence[];
  items: QuoteItemFormRow[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  termsAndConditions: string;
  notes?: string;
  linkedBookingId?: string;
  linkedBookingNumber?: string;
}

const DEFAULT_TERMS_AND_CONDITIONS = `1. Tentative blocking remains subject to facility availability at the time of approval.
2. Full sports complex rules, timing rules, and player discipline rules must be followed during the event.
3. Any damage to courts, lighting, seating, equipment, or common areas will be charged separately.
4. Final billing is based on the approved quotation, applicable taxes, and any extra services used on the event day.
5. Cancellation and rescheduling are subject to the venue policy and available slot timing.
6. Entry, setup, cleanup, and activity must stay within the approved booking window.`;

const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500';
const panelClass = 'rounded-xl border border-white/10 bg-white/5 p-4';
const buttonClass = 'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';

const todayInput = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const plusDays = (dateValue: string, days: number) => {
  const next = new Date(`${dateValue}T00:00:00`);
  next.setDate(next.getDate() + days);
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${next.getFullYear()}-${month}-${day}`;
};

const addHour = (time: string): string => {
  const [hours, minutes] = String(time || '10:00').split(':').map(Number);
  const date = new Date(2000, 0, 1, hours || 0, minutes || 0, 0, 0);
  date.setHours(date.getHours() + 1);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const toDateInput = (value: Date): string => {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
};

const toIsoDateTime = (dateValue: string, timeValue: string): string => {
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0).toISOString();
};

const getDurationHours = (startTime: string, endTime: string): number => {
  const [sh, sm] = String(startTime || '').split(':').map(Number);
  const [eh, em] = String(endTime || '').split(':').map(Number);
  const start = new Date(2000, 0, 1, sh || 0, sm || 0, 0, 0);
  const end = new Date(2000, 0, 1, eh || 0, em || 0, 0, 0);
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const formatDateChip = (value: string): string =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const ORDERED_WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
] as const;
const WEEKEND_WEEKDAYS = [6, 0] as number[];
const WORKWEEK_WEEKDAYS = [1, 2, 3, 4, 5] as number[];

const normalizeDateList = (values: string[]): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

const enumerateDates = (startDate: string, endDate: string): string[] => {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const sortWeekdaySelection = (values: number[]): number[] =>
  Array.from(new Set(values.filter((value) => ORDERED_WEEKDAY_VALUES.includes(value as any)))).sort(
    (left, right) => ORDERED_WEEKDAY_VALUES.indexOf(left as any) - ORDERED_WEEKDAY_VALUES.indexOf(right as any)
  );

const normalizeFacilityIdValue = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'object' && value !== null && '_id' in value) {
    const nested = String((value as any)._id || '').trim();
    return nested || undefined;
  }
  const fallback = String(value || '').trim();
  return fallback || undefined;
};

const calculateQuoteItemAmounts = (
  quantityRaw: number,
  unitPriceRaw: number,
  discountTypeRaw: DiscountType,
  discountValueRaw: number
) => {
  const quantity = round2(Math.max(0, Number(quantityRaw || 0)));
  const unitPrice = round2(Math.max(0, Number(unitPriceRaw || 0)));
  const grossAmount = round2(quantity * unitPrice);
  const discountType: DiscountType = discountTypeRaw === 'fixed' ? 'fixed' : 'percentage';
  const discountValue = round2(Math.max(0, Number(discountValueRaw || 0)));
  const discountAmount = discountType === 'fixed'
    ? round2(Math.min(discountValue, grossAmount))
    : round2((grossAmount * Math.min(discountValue, 100)) / 100);

  return {
    quantity,
    unitPrice,
    discountType,
    discountValue,
    discountAmount,
    lineTotal: round2(Math.max(0, grossAmount - discountAmount)),
    grossAmount,
  };
};

const buildQuoteItemRow = (item: Partial<QuoteItemFormRow> = {}): QuoteItemFormRow => {
  const amounts = calculateQuoteItemAmounts(
    Number(item.quantity ?? 0),
    Number(item.unitPrice ?? 0),
    item.discountType === 'fixed' ? 'fixed' : 'percentage',
    Number(item.discountValue ?? 0)
  );

  return {
    itemType: item.itemType === 'service' ? 'service' : item.itemType === 'custom' ? 'custom' : 'facility',
    facilityId: normalizeFacilityIdValue(item.facilityId),
    description: String(item.description || ''),
    quantity: amounts.quantity,
    unitLabel: String(item.unitLabel || 'Unit'),
    unitPrice: amounts.unitPrice,
    discountType: amounts.discountType,
    discountValue: amounts.discountValue,
    discountAmount: amounts.discountAmount,
    lineTotal: amounts.lineTotal,
    notes: String(item.notes || ''),
  };
};

const emptyForm = () => {
  const today = todayInput();
  return {
    id: '',
    quoteStatus: 'draft' as QuoteStatus,
    validUntil: plusDays(today, 7),
    bookingMode: 'single' as BookingMode,
    eventName: '',
    organizerName: '',
    organizationName: '',
    contactPhone: '',
    contactEmail: '',
    eventDate: today,
    occurrenceDates: [today] as string[],
    dateEntry: today,
    rangeStartDate: today,
    rangeEndDate: plusDays(today, 13),
    rangeWeekdays: [...WEEKEND_WEEKDAYS] as number[],
    startTime: '10:00',
    endTime: '11:00',
    items: [] as QuoteItemFormRow[],
    discountType: 'percentage' as DiscountType,
    discountValue: '0',
    gstRate: '18',
    termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
    notes: '',
    linkedBookingNumber: '',
  };
};

const toPrintableQuotation = (quote: QuoteRow): PrintableEventQuotation => ({
  quoteNumber: quote.quoteNumber,
  quoteStatus: quote.quoteStatus,
  validUntil: quote.validUntil,
  eventName: quote.eventName,
  organizerName: quote.organizerName,
  organizationName: quote.organizationName,
  contactPhone: quote.contactPhone,
  contactEmail: quote.contactEmail,
  facilities: Array.isArray(quote.facilityIds) ? quote.facilityIds : [],
  occurrences: Array.isArray(quote.occurrences)
    ? quote.occurrences.map((occurrence) => ({
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
      }))
    : [],
  items: Array.isArray(quote.items) ? quote.items : [],
  subtotal: Number(quote.subtotal || 0),
  discountType: quote.discountType,
  discountValue: Number(quote.discountValue || 0),
  discountAmount: Number(quote.discountAmount || 0),
  taxableAmount: Number(quote.taxableAmount || 0),
  gstRate: Number(quote.gstRate || 0),
  gstAmount: Number(quote.gstAmount || 0),
  totalAmount: Number(quote.totalAmount || 0),
  termsAndConditions: quote.termsAndConditions,
  notes: quote.notes,
  linkedBookingNumber: quote.linkedBookingNumber,
});

export const EventQuotationDesk: React.FC<EventQuotationDeskProps> = ({
  facilities,
  onUseQuoteForBooking,
  allowBookingConversion = true,
  incomingCrmDraft = null,
  onConsumeCrmDraft,
}) => {
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [versions, setVersions] = useState<QuoteRow[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | QuoteStatus>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo(() => {
    const token = localStorage.getItem('token') || '';
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, []);

  const activeFacilities = useMemo(() => facilities.filter((facility) => facility.active), [facilities]);

  useEffect(() => {
    if (!incomingCrmDraft) return;
    const requestedStartTime = incomingCrmDraft.requestedStartTime || '10:00';
    const requestedDate = incomingCrmDraft.requestedDate || todayInput();
    const requestedFacilityId = normalizeFacilityIdValue(incomingCrmDraft.requestedFacilityId);
    const requestedFacility = requestedFacilityId
      ? activeFacilities.find((facility) => facility._id === requestedFacilityId)
      : undefined;
    setForm((prev) => ({
      ...prev,
      eventName: incomingCrmDraft.requestedFacilityName
        ? `${incomingCrmDraft.requestedFacilityName} Quote`
        : (incomingCrmDraft.customerName ? `${incomingCrmDraft.customerName} Event Quote` : prev.eventName),
      organizerName: incomingCrmDraft.customerName || prev.organizerName,
      contactPhone: incomingCrmDraft.customerPhone || prev.contactPhone,
      contactEmail: incomingCrmDraft.customerEmail || prev.contactEmail,
      eventDate: requestedDate,
      occurrenceDates: requestedDate ? [requestedDate] : prev.occurrenceDates,
      dateEntry: requestedDate || prev.dateEntry,
      rangeStartDate: requestedDate || prev.rangeStartDate,
      rangeEndDate: requestedDate || prev.rangeEndDate,
      startTime: requestedStartTime,
      endTime: addHour(requestedStartTime),
      items: requestedFacilityId && !prev.items.some((item) => normalizeFacilityIdValue(item.facilityId) === requestedFacilityId)
        ? [
            ...prev.items,
            buildQuoteItemRow({
              itemType: 'facility',
              facilityId: requestedFacilityId,
              description: requestedFacility?.name || incomingCrmDraft.requestedFacilityName || '',
              quantity: 1,
              unitLabel: 'Day',
              unitPrice: 0,
              discountType: 'percentage',
              discountValue: 0,
              notes: '',
            }),
          ]
        : prev.items,
      notes: [prev.notes, incomingCrmDraft.notes].filter(Boolean).join('\n').trim(),
    }));
    setMessage(`CRM enquiry ${incomingCrmDraft.enquiryNumber || ''} loaded into event quotation.`);
    onConsumeCrmDraft?.();
  }, [activeFacilities, incomingCrmDraft, onConsumeCrmDraft]);
  const selectedDates = useMemo(
    () => (
      form.bookingMode === 'multiple'
        ? normalizeDateList(form.occurrenceDates)
        : (form.eventDate ? [form.eventDate] : [])
    ),
    [form.bookingMode, form.eventDate, form.occurrenceDates]
  );
  const selectedFacilityIds = useMemo(
    () => Array.from(
      new Set(
        form.items
          .map((item) => (Number(item.quantity || 0) > 0 ? normalizeFacilityIdValue(item.facilityId) : undefined))
          .filter((value): value is string => Boolean(value))
      )
    ),
    [form.items]
  );

  const subtotal = useMemo(
    () => round2(form.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)),
    [form.items]
  );
  const discountAmount = useMemo(() => {
    const value = Math.max(0, Number(form.discountValue || 0));
    if (form.discountType === 'percentage') {
      return round2((subtotal * Math.min(value, 100)) / 100);
    }
    return round2(Math.min(value, subtotal));
  }, [form.discountType, form.discountValue, subtotal]);
  const taxableAmount = useMemo(() => round2(Math.max(0, subtotal - discountAmount)), [discountAmount, subtotal]);
  const gstAmount = useMemo(
    () => round2((taxableAmount * Math.max(0, Number(form.gstRate || 0))) / 100),
    [form.gstRate, taxableAmount]
  );
  const totalAmount = useMemo(() => round2(taxableAmount + gstAmount), [gstAmount, taxableAmount]);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '100');
      const response = await fetchApiJson(apiUrl(`/api/events/quotations?${params.toString()}`), { headers });
      setRows(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load event quotations');
    } finally {
      setLoading(false);
    }
  }, [headers, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQuotes();
    }, search.trim() ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [loadQuotes, search]);

  const resetForm = () => {
    setForm(emptyForm());
    setVersions([]);
  };

  const loadVersions = async (quoteId: string) => {
    try {
      const response = await fetchApiJson(apiUrl(`/api/events/quotations/${quoteId}/versions`), { headers });
      setVersions(Array.isArray(response?.data) ? response.data : []);
    } catch {
      setVersions([]);
    }
  };

  const editQuote = async (quote: QuoteRow) => {
    const occurrenceDates = Array.isArray(quote.occurrences)
      ? quote.occurrences
          .map((occurrence) => String(occurrence.startTime || '').slice(0, 10))
          .filter(Boolean)
      : [];
    const firstDate = occurrenceDates[0] || todayInput();
    const firstOccurrence = Array.isArray(quote.occurrences) && quote.occurrences.length > 0
      ? quote.occurrences[0]
      : undefined;

    setForm({
      id: quote._id,
      quoteStatus: quote.quoteStatus === 'replaced' || quote.quoteStatus === 'booked' ? 'approved' : quote.quoteStatus,
      validUntil: quote.validUntil ? String(quote.validUntil).slice(0, 10) : plusDays(todayInput(), 7),
      bookingMode: occurrenceDates.length > 1 ? 'multiple' : 'single',
      eventName: quote.eventName || '',
      organizerName: quote.organizerName || '',
      organizationName: quote.organizationName || '',
      contactPhone: quote.contactPhone || '',
      contactEmail: quote.contactEmail || '',
      eventDate: firstDate,
      occurrenceDates: occurrenceDates.length ? normalizeDateList(occurrenceDates) : [firstDate],
      dateEntry: firstDate,
      rangeStartDate: firstDate,
      rangeEndDate: occurrenceDates[occurrenceDates.length - 1] || firstDate,
      rangeWeekdays: [...WEEKEND_WEEKDAYS],
      startTime: firstOccurrence ? new Date(firstOccurrence.startTime).toTimeString().slice(0, 5) : '10:00',
      endTime: firstOccurrence ? new Date(firstOccurrence.endTime).toTimeString().slice(0, 5) : '11:00',
      items: Array.isArray(quote.items)
        ? quote.items.map((item) => ({
            ...buildQuoteItemRow({
              itemType: item.itemType || 'custom',
              facilityId: normalizeFacilityIdValue(item.facilityId),
              description: item.description,
              quantity: Number(item.quantity || 0),
              unitLabel: item.unitLabel || 'Unit',
              unitPrice: Number(item.unitPrice || 0),
              discountType: item.discountType || 'percentage',
              discountValue: Number(item.discountValue || 0),
              notes: item.notes || '',
            }),
          }))
        : [],
      discountType: quote.discountType || 'percentage',
      discountValue: String(Number(quote.discountValue || 0)),
      gstRate: String(Number(quote.gstRate || 0)),
      termsAndConditions: quote.termsAndConditions || DEFAULT_TERMS_AND_CONDITIONS,
      notes: quote.notes || '',
      linkedBookingNumber: quote.linkedBookingNumber || '',
    });
    setMessage('');
    setError('');
    await loadVersions(quote._id);
  };

  const buildOccurrencesPayload = () =>
    selectedDates.map((dateValue) => ({
      occurrenceDate: dateValue,
      startTime: toIsoDateTime(dateValue, form.startTime),
      endTime: toIsoDateTime(dateValue, form.endTime),
    }));

  const saveQuote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.eventName.trim() || !form.organizerName.trim()) {
      setError('Event name and organizer name are required');
      return;
    }
    if (!selectedFacilityIds.length) {
      setError('Add at least one facility line item');
      return;
    }
    if (!selectedDates.length) {
      setError('Select at least one valid event date');
      return;
    }
    if (!form.items.length) {
      setError('Add at least one quotation item');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        eventName: form.eventName,
        organizerName: form.organizerName,
        organizationName: form.organizationName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        facilityIds: selectedFacilityIds,
        occurrences: buildOccurrencesPayload(),
        quoteStatus: form.quoteStatus,
        validUntil: form.validUntil || undefined,
        items: form.items.map((item) => ({
          itemType: item.itemType,
          facilityId: item.facilityId || undefined,
          description: item.description,
          quantity: Number(item.quantity || 0),
          unitLabel: item.unitLabel,
          unitPrice: Number(item.unitPrice || 0),
          discountType: item.discountType,
          discountValue: Number(item.discountValue || 0),
          notes: item.notes,
        })),
        discountType: form.discountType,
        discountValue: Number(form.discountValue || 0),
        gstRate: Number(form.gstRate || 0),
        termsAndConditions: form.termsAndConditions,
        notes: form.notes,
      };

      const endpoint = form.id
        ? apiUrl(`/api/events/quotations/${form.id}`)
        : apiUrl('/api/events/quotations');
      const response = await fetchApiJson(endpoint, {
        method: form.id ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      setMessage(response?.message || (form.id ? 'Event quotation updated' : 'Event quotation created'));
      resetForm();
      await loadQuotes();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save event quotation');
    } finally {
      setSaving(false);
    }
  };

  const reviseQuote = async (quote: QuoteRow) => {
    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/events/quotations/${quote._id}/revise`), {
        method: 'POST',
        headers,
      });
      setMessage(response?.message || 'Revised quotation created');
      await loadQuotes();
      if (response?.data?._id) {
        await editQuote(response.data as QuoteRow);
      }
    } catch (reviseError: any) {
      setError(reviseError?.message || 'Failed to revise quotation');
    }
  };

  const deleteQuote = async (quote: QuoteRow) => {
    if (!(await showConfirmDialog('Delete this event quotation?', { title: 'Delete Event Quotation', confirmText: 'Delete' }))) {
      return;
    }

    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/events/quotations/${quote._id}`), {
        method: 'DELETE',
        headers,
      });
      setMessage(response?.message || 'Event quotation deleted');
      if (form.id === quote._id) resetForm();
      await loadQuotes();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Failed to delete quotation');
    }
  };

  const fetchQuoteDocument = async (quote: QuoteRow, action: 'preview' | 'print' | 'download') => {
    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/events/quotations/${quote._id}/document`), {
        method: 'POST',
        headers,
      });
      const document = response?.data as ServerPdfDocument | undefined;
      if (!document) {
        setError('Quotation document is not available');
        return;
      }
      if (action === 'print') {
        const opened = openPdfDocument(document, true);
        if (!opened) setError('Unable to open print window. Please allow popups and try again.');
        return;
      }
      if (action === 'preview') {
        const opened = openPdfDocument(document, false);
        if (!opened) setError('Unable to open preview window. Please allow popups and try again.');
        return;
      }
      if (action === 'download') {
        const downloaded = downloadPdfDocument(document);
        if (!downloaded) setError('Unable to download PDF document');
      }
    } catch (docError: any) {
      setError(docError?.message || 'Failed to prepare quotation document');
    }
  };

  const emailQuote = async (quote: QuoteRow) => {
    const suggestedEmail = String(quote.contactEmail || '').trim();
    const recipient = await showPromptDialog('Enter the email address for this quotation.', {
      title: 'Send Event Quotation',
      label: 'Recipient email',
      defaultValue: suggestedEmail,
      inputType: 'email',
      confirmText: 'Send Mail',
      required: true,
    });
    if (!recipient) return;

    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/events/quotations/${quote._id}/send-mail`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: recipient }),
      });
      const document = response?.data as ServerPdfDocument | undefined;
      if (document?.emailed) {
        setMessage(response?.message || `Quotation emailed to ${document.emailedTo}`);
        return;
      }
      if (document?.emailError) {
        setError(document.emailError || response?.message || 'Quotation email failed');
        return;
      }
      setMessage(response?.message || 'Quotation email request completed');
    } catch (mailError: any) {
      setError(mailError?.message || 'Failed to send quotation email');
    }
  };

  const useQuoteForBooking = async (quote: QuoteRow) => {
    const accepted = await showConfirmDialog(
      'Load this quotation into the event booking form so you can confirm the booking next?',
      { title: 'Use Quotation For Booking', confirmText: 'Load Quote' }
    );
    if (!accepted) return;

    const occurrenceDates = Array.isArray(quote.occurrences)
      ? quote.occurrences
          .map((occurrence) => String(occurrence.startTime || '').slice(0, 10))
          .filter(Boolean)
      : [];
    const firstDate = occurrenceDates[0] || todayInput();
    const firstOccurrence = Array.isArray(quote.occurrences) && quote.occurrences.length > 0
      ? quote.occurrences[0]
      : undefined;

    onUseQuoteForBooking({
      sourceQuotationId: quote._id,
      sourceQuotationNumber: quote.quoteNumber,
      bookingMode: occurrenceDates.length > 1 ? 'multiple' : 'single',
      eventName: quote.eventName,
      organizerName: quote.organizerName,
      organizationName: quote.organizationName || '',
      contactPhone: quote.contactPhone || '',
      contactEmail: quote.contactEmail || '',
      facilityIds: Array.isArray(quote.facilityIds) ? quote.facilityIds.map((facility) => facility._id) : [],
      eventDate: firstDate,
      occurrenceDates: occurrenceDates.length ? normalizeDateList(occurrenceDates) : [firstDate],
      startTime: firstOccurrence ? new Date(firstOccurrence.startTime).toTimeString().slice(0, 5) : '10:00',
      endTime: firstOccurrence ? new Date(firstOccurrence.endTime).toTimeString().slice(0, 5) : '11:00',
      totalAmount: String(Number(quote.totalAmount || 0)),
      advanceAmount: '',
      remarks: quote.notes || '',
    });
    setMessage(`Quotation ${quote.quoteNumber} loaded into the booking form.`);
  };

  const addFacilityItem = () => {
    const nextQuantity = Math.max(1, selectedDates.length);
    setForm((prev) => {
      return {
        ...prev,
        items: [
          ...prev.items,
          buildQuoteItemRow({
            itemType: 'facility',
            facilityId: '',
            description: '',
            quantity: nextQuantity,
            unitLabel: nextQuantity > 1 ? 'Days' : 'Day',
            unitPrice: 0,
            discountType: 'percentage',
            discountValue: 0,
            notes: '',
          }),
        ],
      };
    });
    setError('');
  };

  const addCustomItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        buildQuoteItemRow({
          itemType: 'custom',
          description: '',
          quantity: 1,
          unitLabel: 'Unit',
          unitPrice: 0,
          discountType: 'percentage',
          discountValue: 0,
          notes: '',
        }),
      ],
    }));
  };

  const updateItem = (index: number, field: keyof QuoteItemFormRow, value: string) => {
    setForm((prev) => {
      const nextItems = [...prev.items];
      const current = { ...nextItems[index] };
      if (field === 'description' || field === 'unitLabel' || field === 'itemType' || field === 'facilityId' || field === 'notes' || field === 'discountType') {
        (current as any)[field] = value;
      } else {
        (current as any)[field] = Number(value || 0);
      }
      if (field === 'facilityId') {
        const selectedFacility = activeFacilities.find((facility) => facility._id === value);
        current.itemType = selectedFacility ? 'facility' : current.itemType;
        if (selectedFacility) {
          current.description = selectedFacility.name;
        }
      }
      nextItems[index] = buildQuoteItemRow(current);
      return { ...prev, items: nextItems };
    });
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, rowIndex) => rowIndex !== index) }));
  };

  const addOccurrenceDate = () => {
    const nextDate = String(form.dateEntry || '').trim();
    if (!nextDate) {
      setError('Choose a date before adding it to the quotation');
      return;
    }
    setForm((prev) => ({
      ...prev,
      occurrenceDates: normalizeDateList([...prev.occurrenceDates, nextDate]),
      dateEntry: nextDate,
    }));
    setError('');
  };

  const toggleRangeWeekday = (weekday: number) => {
    setForm((prev) => ({
      ...prev,
      rangeWeekdays: sortWeekdaySelection(
        prev.rangeWeekdays.includes(weekday)
          ? prev.rangeWeekdays.filter((value) => value !== weekday)
          : [...prev.rangeWeekdays, weekday]
      ),
    }));
  };

  const applyRangePreset = (weekdays: number[]) => {
    setForm((prev) => ({
      ...prev,
      rangeWeekdays: sortWeekdaySelection(weekdays),
    }));
  };

  const addRecurringDates = () => {
    if (!form.rangeStartDate || !form.rangeEndDate) {
      setError('Choose both range dates before adding recurring dates');
      return;
    }
    if (!form.rangeWeekdays.length) {
      setError('Select at least one weekday for the recurring pattern');
      return;
    }

    const matchedDates = enumerateDates(form.rangeStartDate, form.rangeEndDate).filter((dateValue) =>
      form.rangeWeekdays.includes(new Date(`${dateValue}T00:00:00`).getDay())
    );

    if (!matchedDates.length) {
      setError('No matching dates were found in the selected range');
      return;
    }

    setForm((prev) => ({
      ...prev,
      occurrenceDates: normalizeDateList([...prev.occurrenceDates, ...matchedDates]),
      dateEntry: matchedDates[matchedDates.length - 1] || prev.dateEntry,
    }));
    setError('');
    setMessage(
      `${matchedDates.length} recurring date${matchedDates.length === 1 ? '' : 's'} added to the quotation.`
    );
  };

  const removeOccurrenceDate = (dateValue: string) => {
    setForm((prev) => {
      const remaining = normalizeDateList(prev.occurrenceDates.filter((value) => value !== dateValue));
      return {
        ...prev,
        occurrenceDates: remaining.length ? remaining : [prev.eventDate],
      };
    });
  };

  const statusClass = (status: QuoteStatus) => {
    if (status === 'approved') return 'bg-emerald-500/20 text-emerald-200';
    if (status === 'booked') return 'bg-cyan-500/20 text-cyan-200';
    if (status === 'sent') return 'bg-indigo-500/20 text-indigo-200';
    if (status === 'rejected' || status === 'expired') return 'bg-rose-500/20 text-rose-200';
    if (status === 'replaced') return 'bg-amber-500/20 text-amber-200';
    return 'bg-slate-500/20 text-slate-200';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Event Quotations</h2>
          <p className="text-sm text-gray-300">
            Prepare sports facility quotations before booking confirmation, revise older quotes, and export a professional document for customers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quote/event/organizer..."
            className={`${inputClass} md:w-72`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="all" className="bg-gray-900">All status</option>
            {['draft', 'sent', 'approved', 'rejected', 'expired', 'replaced', 'booked'].map((status) => (
              <option key={status} value={status} className="bg-gray-900">
                {status}
              </option>
            ))}
          </select>
          <ActionIconButton kind="refresh" onClick={() => void loadQuotes()} title="Refresh" />
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <form onSubmit={saveQuote} className={`${panelClass} space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">{form.id ? 'Edit Event Quotation' : 'Create Event Quotation'}</h3>
              <p className="text-xs text-gray-400">Choose facilities inside the quotation rows, add one or many event dates, and enter the custom charge approved for each line.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ManualHelpLink anchor="transaction-event-quotation" />
              {form.id && (
                <button type="button" onClick={resetForm} className="rounded-md border border-white/20 px-3 py-2 text-sm text-gray-200">
                  New Quote
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className={inputClass} placeholder="Event name" value={form.eventName} onChange={(e) => setForm((prev) => ({ ...prev, eventName: e.target.value }))} />
            <input className={inputClass} placeholder="Organizer name" value={form.organizerName} onChange={(e) => setForm((prev) => ({ ...prev, organizerName: e.target.value }))} />
            <input className={inputClass} placeholder="Organization" value={form.organizationName} onChange={(e) => setForm((prev) => ({ ...prev, organizationName: e.target.value }))} />
            <input className={inputClass} placeholder="Valid until" type="date" value={form.validUntil} onChange={(e) => setForm((prev) => ({ ...prev, validUntil: e.target.value }))} />
            <input className={inputClass} placeholder="Phone" value={form.contactPhone} onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))} />
            <input className={inputClass} placeholder="Email" type="email" value={form.contactEmail} onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, bookingMode: 'single' }))}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${form.bookingMode === 'single' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-200'}`}
            >
              Single Date
            </button>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, bookingMode: 'multiple' }))}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${form.bookingMode === 'multiple' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-200'}`}
            >
              Multiple Dates
            </button>
          </div>

          {form.bookingMode === 'single' ? (
            <input className={inputClass} type="date" value={form.eventDate} onChange={(e) => setForm((prev) => ({ ...prev, eventDate: e.target.value }))} />
          ) : (
            <div className="space-y-3 rounded border border-white/10 bg-black/20 p-3">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.75fr_1.25fr]">
                <div className="rounded border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Manual Add</p>
                  <p className="mt-1 text-xs text-gray-400">Add one exact date when the customer gives you specific slots.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      className={`${inputClass} max-w-[220px]`}
                      type="date"
                      value={form.dateEntry}
                      onChange={(e) => setForm((prev) => ({ ...prev, dateEntry: e.target.value }))}
                    />
                    <button type="button" onClick={addOccurrenceDate} className="rounded bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30">
                      Add Date
                    </button>
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Recurring Helper</p>
                  <p className="mt-1 text-xs text-gray-400">Useful for two weekends, every Saturday, or any repeating day pattern.</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      className={inputClass}
                      type="date"
                      value={form.rangeStartDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, rangeStartDate: e.target.value }))}
                    />
                    <input
                      className={inputClass}
                      type="date"
                      value={form.rangeEndDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, rangeEndDate: e.target.value }))}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleRangeWeekday(option.value)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          form.rangeWeekdays.includes(option.value)
                            ? 'bg-indigo-500 text-white'
                            : 'border border-white/10 bg-black/20 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => applyRangePreset(WEEKEND_WEEKDAYS)} className="rounded border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20">
                      Weekends
                    </button>
                    <button type="button" onClick={() => applyRangePreset(WORKWEEK_WEEKDAYS)} className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10">
                      Weekdays
                    </button>
                    <button type="button" onClick={() => applyRangePreset([...ORDERED_WEEKDAY_VALUES])} className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10">
                      Every Day
                    </button>
                    <button type="button" onClick={addRecurringDates} className="rounded bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30">
                      Add Matching Dates
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedDates.map((dateValue) => (
                  <span key={dateValue} className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    {formatDateChip(dateValue)}
                    <button
                      type="button"
                      onClick={() => removeOccurrenceDate(dateValue)}
                      className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-cyan-50 hover:bg-black/40"
                    >
                      X
                    </button>
                  </span>
                ))}
                {!selectedDates.length ? <p className="text-xs text-gray-400">No dates added yet.</p> : null}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} type="time" value={form.startTime} onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value, endTime: addHour(e.target.value) }))} />
            <input className={inputClass} type="time" value={form.endTime} onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <select className={inputClass} value={form.quoteStatus} onChange={(e) => setForm((prev) => ({ ...prev, quoteStatus: e.target.value as QuoteStatus }))}>
              {['draft', 'sent', 'approved', 'rejected', 'expired'].map((status) => (
                <option key={status} value={status} className="bg-gray-900">{status}</option>
              ))}
            </select>
            <select className={inputClass} value={form.discountType} onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as DiscountType }))}>
              <option value="percentage" className="bg-gray-900">Discount %</option>
              <option value="fixed" className="bg-gray-900">Fixed Discount</option>
            </select>
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Discount value" value={form.discountValue} onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="GST %" value={form.gstRate} onChange={(e) => setForm((prev) => ({ ...prev, gstRate: e.target.value }))} />
            <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
              Selected dates: <span className="font-semibold text-white">{selectedDates.length}</span>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Quotation Items</p>
                <p className="text-xs text-gray-400">Select the facility in each row and enter the quoted charge. Default facility pricing is intentionally hidden here.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                  Linked facilities: <span className="font-semibold text-white">{selectedFacilityIds.length}</span>
                </div>
                <button type="button" onClick={addFacilityItem} className="rounded bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30">
                  Add Facility Line
                </button>
                <button type="button" onClick={addCustomItem} className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30">
                  Add Custom Line
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.16em] text-gray-400">
                    <th className="border-b border-white/10 px-2 py-2 font-semibold">Facility</th>
                    <th className="border-b border-white/10 px-2 py-2 font-semibold">Description</th>
                    <th className="border-b border-white/10 px-2 py-2 font-semibold">Qty</th>
                    <th className="border-b border-white/10 px-2 py-2 font-semibold">Unit</th>
                    <th className="border-b border-white/10 px-2 py-2 font-semibold">Quoted Charge</th>
                    <th className="border-b border-white/10 px-2 py-2 font-semibold">Item Discount</th>
                    <th className="border-b border-white/10 px-2 py-2 font-semibold text-right">Amount</th>
                    <th className="border-b border-white/10 px-2 py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => {
                    const grossAmount = round2(Number(item.quantity || 0) * Number(item.unitPrice || 0));
                    return (
                      <tr key={`${item.description}-${index}`} className="align-top">
                        <td className="border-b border-white/10 px-2 py-3">
                          <select className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-sm text-white" value={item.facilityId || ''} onChange={(e) => updateItem(index, 'facilityId', e.target.value)}>
                            <option value="" className="bg-gray-900">{item.itemType === 'custom' ? 'Optional facility link' : 'Select facility'}</option>
                            {activeFacilities.map((facility) => (
                              <option key={facility._id} value={facility._id} className="bg-gray-900">
                                {facility.location ? `${facility.name} | ${facility.location}` : facility.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border-b border-white/10 px-2 py-3">
                          <input className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-sm text-white" placeholder="Item description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} />
                        </td>
                        <td className="border-b border-white/10 px-2 py-3">
                          <input className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-sm text-white" type="number" min="0" step="0.01" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} />
                        </td>
                        <td className="border-b border-white/10 px-2 py-3">
                          <input className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-sm text-white" placeholder="Unit" value={item.unitLabel} onChange={(e) => updateItem(index, 'unitLabel', e.target.value)} />
                        </td>
                        <td className="border-b border-white/10 px-2 py-3">
                          <input className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-sm text-white" type="number" min="0" step="0.01" placeholder="Charge" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', e.target.value)} />
                        </td>
                        <td className="border-b border-white/10 px-2 py-3">
                          <div className="flex gap-2">
                            <select className="w-[120px] rounded-md border border-white/10 bg-black/20 px-2 py-2 text-sm text-white" value={item.discountType} onChange={(e) => updateItem(index, 'discountType', e.target.value)}>
                              <option value="percentage" className="bg-gray-900">% Off</option>
                              <option value="fixed" className="bg-gray-900">Fixed Off</option>
                            </select>
                            <input className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-2 text-sm text-white" type="number" min="0" step="0.01" placeholder="Discount" value={item.discountValue} onChange={(e) => updateItem(index, 'discountValue', e.target.value)} />
                          </div>
                          <p className={`mt-1 text-[11px] ${item.discountAmount > 0 ? 'text-amber-200' : 'text-gray-500'}`}>
                            {item.discountAmount > 0 ? `Less ${formatCurrency(item.discountAmount)}` : 'No line discount'}
                          </p>
                        </td>
                        <td className="border-b border-white/10 px-2 py-3 text-right">
                          <div className="font-semibold text-emerald-300">{formatCurrency(item.lineTotal)}</div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            {item.discountAmount > 0 ? `Gross ${formatCurrency(grossAmount)}` : 'Net line total'}
                          </div>
                        </td>
                        <td className="border-b border-white/10 px-2 py-3 text-right">
                          <button type="button" onClick={() => removeItem(index)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/30">
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!form.items.length ? (
                    <tr>
                      <td colSpan={8} className="px-2 py-6 text-center text-sm text-gray-400">No quotation items added yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-400">At least one facility line is required. Use custom lines for extras like coaching, lighting, officials, or event support.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className={panelClass}>
              <p className="text-xs text-gray-400">Subtotal</p>
              <p className="text-lg font-semibold text-white">{formatCurrency(subtotal)}</p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-gray-400">Discount</p>
              <p className="text-lg font-semibold text-amber-200">{formatCurrency(discountAmount)}</p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-gray-400">Taxable</p>
              <p className="text-lg font-semibold text-cyan-200">{formatCurrency(taxableAmount)}</p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-gray-400">GST</p>
              <p className="text-lg font-semibold text-sky-200">{formatCurrency(gstAmount)}</p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-gray-400">Grand Total</p>
              <p className="text-lg font-semibold text-emerald-300">{formatCurrency(totalAmount)}</p>
            </div>
          </div>

          <textarea className={`${inputClass} min-h-[120px]`} placeholder="Terms and conditions" value={form.termsAndConditions} onChange={(e) => setForm((prev) => ({ ...prev, termsAndConditions: e.target.value }))} />
          <textarea className={`${inputClass} min-h-[90px]`} placeholder="Additional notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />

          {form.linkedBookingNumber ? (
            <div className="rounded border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              This quotation is already linked to booking {form.linkedBookingNumber}.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button disabled={saving} className={buttonClass}>
              {saving ? 'Saving...' : form.id ? 'Update Quotation' : 'Create Quotation'}
            </button>
            {form.id ? (
              <>
                <button type="button" onClick={() => {
                  const selected = rows.find((row) => row._id === form.id) || versions[0];
                  if (selected) void fetchQuoteDocument(selected, 'preview');
                }} className="rounded-md bg-sky-500/20 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30">
                  Preview
                </button>
                <button type="button" onClick={() => {
                  const selected = rows.find((row) => row._id === form.id) || versions[0];
                  if (selected) void emailQuote(selected);
                }} className="rounded-md bg-fuchsia-500/20 px-3 py-2 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-500/30">
                  Send Mail
                </button>
                <button type="button" onClick={() => {
                  const selected = rows.find((row) => row._id === form.id) || versions[0];
                  if (selected) void fetchQuoteDocument(selected, 'print');
                }} className="rounded-md bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30">
                  Print
                </button>
              </>
            ) : null}
            {form.id && !form.linkedBookingNumber && (
              <button type="button" onClick={() => {
                const selected = rows.find((row) => row._id === form.id) || versions[0];
                if (selected) void reviseQuote(selected);
              }} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-400">
                Create Revision
              </button>
            )}
          </div>
        </form>

        <div className="space-y-4">
          <div className={panelClass}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Quotation Register</h3>
              {loading && <span className="text-xs text-gray-400">Loading...</span>}
              {!loading && <span className="text-xs text-gray-400">{rows.length} loaded</span>}
            </div>
            <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => {
                const printable = toPrintableQuotation(row);
                const isLocked = row.quoteStatus === 'booked' || Boolean(row.replacedByQuotationId);
                return (
                  <div key={row._id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {row.quoteNumber} <span className="text-xs text-gray-400">v{row.version}</span>
                        </p>
                        <p className="text-xs text-gray-300">{row.eventName}</p>
                        <p className="text-xs text-gray-500">
                          {row.organizerName}{row.organizationName ? ` | ${row.organizationName}` : ''}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${statusClass(row.quoteStatus)}`}>
                        {row.quoteStatus}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-gray-300">{row.items?.length || 0} items</span>
                      <span className="font-semibold text-emerald-300">{formatCurrency(Number(row.totalAmount || 0))}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {row.validUntil ? `Valid until ${String(row.validUntil).slice(0, 10)}` : 'No validity date'}
                    </p>
                    {row.linkedBookingNumber ? (
                      <p className="mt-1 text-[11px] text-cyan-200">Linked to booking {row.linkedBookingNumber}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void editQuote(row)} className="rounded bg-indigo-500/20 px-2 py-1 text-xs text-indigo-200">
                        Edit
                      </button>
                      <button type="button" onClick={() => void reviseQuote(row)} disabled={isLocked} className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-200 disabled:opacity-50">
                        Revise
                      </button>
                      {allowBookingConversion ? (
                        <button type="button" onClick={() => void useQuoteForBooking(row)} disabled={Boolean(row.linkedBookingNumber)} className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200 disabled:opacity-50">
                          Use for Booking
                        </button>
                      ) : null}
                      <button type="button" onClick={() => void fetchQuoteDocument(row, 'preview')} className="rounded bg-sky-500/20 px-2 py-1 text-xs text-sky-100">
                        Preview
                      </button>
                      <button type="button" onClick={() => void emailQuote(row)} className="rounded bg-fuchsia-500/20 px-2 py-1 text-xs text-fuchsia-100">
                        Mail
                      </button>
                      <button type="button" onClick={() => void fetchQuoteDocument(row, 'print')} className="rounded bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200">
                        Print
                      </button>
                      <ActionIconButton kind="downloadPdf" onClick={() => void fetchQuoteDocument(row, 'download')} title="Download PDF" className="h-8 w-8" />
                      <button type="button" onClick={() => downloadEventQuotationWord(printable, getGeneralSettings())} className="rounded bg-fuchsia-500/20 px-2 py-1 text-xs text-fuchsia-100">
                        Word
                      </button>
                      <ActionIconButton kind="exportExcel" onClick={() => downloadEventQuotationExcel(printable, getGeneralSettings())} title="Export Excel" className="h-8 w-8" />
                      <button type="button" onClick={() => void deleteQuote(row)} disabled={isLocked} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200 disabled:opacity-50">
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!rows.length && !loading && <p className="text-sm text-gray-400">No event quotations found for this filter.</p>}
            </div>
          </div>

          <div className={panelClass}>
            <h3 className="mb-2 text-lg font-semibold text-white">Revision History</h3>
            <div className="space-y-2">
              {versions.map((row) => (
                <button
                  key={row._id}
                  type="button"
                  onClick={() => void editQuote(row)}
                  className="block w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">{row.quoteNumber} v{row.version}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${statusClass(row.quoteStatus)}`}>
                      {row.quoteStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{formatCurrency(Number(row.totalAmount || 0))}</p>
                </button>
              ))}
              {!versions.length && <p className="text-sm text-gray-400">Select a quotation to see its revision chain.</p>}
            </div>
          </div>

          <div className={panelClass}>
            <h3 className="mb-2 text-lg font-semibold text-white">Professional Output</h3>
            <p className="text-sm text-gray-300">
              Preview, email, print, or export the quotation with facility list, selected dates, GST breakup, discount, and company details.
            </p>
            <div className="mt-3 rounded border border-white/10 bg-black/20 p-3 text-xs text-gray-300">
              Preview opens the quotation PDF in a new tab. Mail sends a professionally formatted email with the branded PDF attached.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
