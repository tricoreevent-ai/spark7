import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ManualHelpLink } from './ManualHelpLink';
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
import { showConfirmDialog } from '../utils/appDialogs';

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
  bookingMode: 'single' | 'range';
  eventName: string;
  organizerName: string;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  facilityIds: string[];
  eventDate: string;
  rangeStartDate: string;
  rangeEndDate: string;
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
type BookingMode = 'single' | 'range';

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

const enumerateDates = (startDate: string, endDate: string): string[] => {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const rows: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    rows.push(toDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
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
    facilityIds: [] as string[],
    eventDate: today,
    rangeStartDate: today,
    rangeEndDate: today,
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
    setForm((prev) => ({
      ...prev,
      eventName: incomingCrmDraft.requestedFacilityName
        ? `${incomingCrmDraft.requestedFacilityName} Quote`
        : (incomingCrmDraft.customerName ? `${incomingCrmDraft.customerName} Event Quote` : prev.eventName),
      organizerName: incomingCrmDraft.customerName || prev.organizerName,
      contactPhone: incomingCrmDraft.customerPhone || prev.contactPhone,
      contactEmail: incomingCrmDraft.customerEmail || prev.contactEmail,
      facilityIds: incomingCrmDraft.requestedFacilityId ? [incomingCrmDraft.requestedFacilityId] : prev.facilityIds,
      eventDate: incomingCrmDraft.requestedDate || prev.eventDate,
      rangeStartDate: incomingCrmDraft.requestedDate || prev.rangeStartDate,
      rangeEndDate: incomingCrmDraft.requestedDate || prev.rangeEndDate,
      startTime: requestedStartTime,
      endTime: addHour(requestedStartTime),
      notes: [prev.notes, incomingCrmDraft.notes].filter(Boolean).join('\n').trim(),
    }));
    setMessage(`CRM enquiry ${incomingCrmDraft.enquiryNumber || ''} loaded into event quotation.`);
    onConsumeCrmDraft?.();
  }, [incomingCrmDraft, onConsumeCrmDraft]);
  const selectedDates = useMemo(
    () => (
      form.bookingMode === 'range'
        ? enumerateDates(form.rangeStartDate, form.rangeEndDate)
        : (form.eventDate ? [form.eventDate] : [])
    ),
    [form.bookingMode, form.eventDate, form.rangeEndDate, form.rangeStartDate]
  );

  const defaultFacilityItems = useMemo(() => {
    const totalHours = round2(getDurationHours(form.startTime, form.endTime) * selectedDates.length);
    return activeFacilities
      .filter((facility) => form.facilityIds.includes(facility._id))
      .map((facility) => {
        const unitPrice = round2(Number(facility.hourlyRate || 0));
        return {
          itemType: 'facility' as const,
          facilityId: facility._id,
          description: facility.name,
          quantity: totalHours,
          unitLabel: 'Hours',
          unitPrice,
          lineTotal: round2(totalHours * unitPrice),
          notes: '',
        };
      });
  }, [activeFacilities, form.endTime, form.facilityIds, form.startTime, selectedDates.length]);

  const subtotal = useMemo(
    () => round2(form.items.reduce((sum, item) => sum + round2(Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0)),
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

  useEffect(() => {
    if (!form.items.length && defaultFacilityItems.length) {
      setForm((prev) => ({ ...prev, items: defaultFacilityItems }));
    }
  }, [defaultFacilityItems, form.items.length]);

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
    const lastDate = occurrenceDates[occurrenceDates.length - 1] || firstDate;
    const firstOccurrence = Array.isArray(quote.occurrences) && quote.occurrences.length > 0
      ? quote.occurrences[0]
      : undefined;

    setForm({
      id: quote._id,
      quoteStatus: quote.quoteStatus === 'replaced' || quote.quoteStatus === 'booked' ? 'approved' : quote.quoteStatus,
      validUntil: quote.validUntil ? String(quote.validUntil).slice(0, 10) : plusDays(todayInput(), 7),
      bookingMode: occurrenceDates.length > 1 ? 'range' : 'single',
      eventName: quote.eventName || '',
      organizerName: quote.organizerName || '',
      organizationName: quote.organizationName || '',
      contactPhone: quote.contactPhone || '',
      contactEmail: quote.contactEmail || '',
      facilityIds: Array.isArray(quote.facilityIds) ? quote.facilityIds.map((facility) => facility._id) : [],
      eventDate: firstDate,
      rangeStartDate: firstDate,
      rangeEndDate: lastDate,
      startTime: firstOccurrence ? new Date(firstOccurrence.startTime).toTimeString().slice(0, 5) : '10:00',
      endTime: firstOccurrence ? new Date(firstOccurrence.endTime).toTimeString().slice(0, 5) : '11:00',
      items: Array.isArray(quote.items)
        ? quote.items.map((item) => ({
            itemType: item.itemType || 'custom',
            facilityId: item.facilityId,
            description: item.description,
            quantity: Number(item.quantity || 0),
            unitLabel: item.unitLabel || 'Unit',
            unitPrice: Number(item.unitPrice || 0),
            lineTotal: Number(item.lineTotal || 0),
            notes: item.notes || '',
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
    if (!form.facilityIds.length) {
      setError('Select at least one facility');
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
        facilityIds: form.facilityIds,
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

  const exportPdf = async (quote: QuoteRow, autoPrint = false) => {
    try {
      setError('');
      const response = await fetchApiJson(apiUrl(`/api/events/quotations/${quote._id}/document`), {
        method: 'POST',
        headers,
      });
      const document = response?.data as ServerPdfDocument | undefined;
      if (!document) {
        setError('Quotation document is not available');
        return;
      }
      if (autoPrint) {
        const opened = openPdfDocument(document, true);
        if (!opened) setError('Unable to open print window. Please allow popups and try again.');
      } else {
        const downloaded = downloadPdfDocument(document);
        if (!downloaded) setError('Unable to download PDF document');
      }
    } catch (docError: any) {
      setError(docError?.message || 'Failed to prepare quotation document');
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
    const lastDate = occurrenceDates[occurrenceDates.length - 1] || firstDate;
    const firstOccurrence = Array.isArray(quote.occurrences) && quote.occurrences.length > 0
      ? quote.occurrences[0]
      : undefined;

    onUseQuoteForBooking({
      sourceQuotationId: quote._id,
      sourceQuotationNumber: quote.quoteNumber,
      bookingMode: occurrenceDates.length > 1 ? 'range' : 'single',
      eventName: quote.eventName,
      organizerName: quote.organizerName,
      organizationName: quote.organizationName || '',
      contactPhone: quote.contactPhone || '',
      contactEmail: quote.contactEmail || '',
      facilityIds: Array.isArray(quote.facilityIds) ? quote.facilityIds.map((facility) => facility._id) : [],
      eventDate: firstDate,
      rangeStartDate: firstDate,
      rangeEndDate: lastDate,
      startTime: firstOccurrence ? new Date(firstOccurrence.startTime).toTimeString().slice(0, 5) : '10:00',
      endTime: firstOccurrence ? new Date(firstOccurrence.endTime).toTimeString().slice(0, 5) : '11:00',
      totalAmount: String(Number(quote.totalAmount || 0)),
      advanceAmount: '',
      remarks: quote.notes || '',
    });
    setMessage(`Quotation ${quote.quoteNumber} loaded into the booking form.`);
  };

  const syncFacilityPricing = () => {
    setForm((prev) => ({ ...prev, items: defaultFacilityItems }));
  };

  const addCustomItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          itemType: 'custom',
          description: '',
          quantity: 1,
          unitLabel: 'Unit',
          unitPrice: 0,
          lineTotal: 0,
          notes: '',
        },
      ],
    }));
  };

  const updateItem = (index: number, field: keyof QuoteItemFormRow, value: string) => {
    setForm((prev) => {
      const nextItems = [...prev.items];
      const current = { ...nextItems[index] };
      if (field === 'description' || field === 'unitLabel' || field === 'itemType' || field === 'facilityId' || field === 'notes') {
        (current as any)[field] = value;
      } else {
        (current as any)[field] = Number(value || 0);
      }
      current.lineTotal = round2(Number(current.quantity || 0) * Number(current.unitPrice || 0));
      nextItems[index] = current;
      return { ...prev, items: nextItems };
    });
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, rowIndex) => rowIndex !== index) }));
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
          <button type="button" onClick={() => void loadQuotes()} className={buttonClass}>Refresh</button>
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <form onSubmit={saveQuote} className={`${panelClass} space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">{form.id ? 'Edit Event Quotation' : 'Create Event Quotation'}</h3>
              <p className="text-xs text-gray-400">Default facility charges are loaded from the selected sports facilities and time slot, but every amount stays editable.</p>
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
              onClick={() => setForm((prev) => ({ ...prev, bookingMode: 'range' }))}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${form.bookingMode === 'range' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-200'}`}
            >
              Date Range
            </button>
          </div>

          <div className="rounded border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-300">Select facilities for the quotation</p>
              <button type="button" onClick={syncFacilityPricing} className="rounded bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30">
                Refresh Facility Pricing
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {activeFacilities.map((facility) => (
                <label key={facility._id} className="flex items-center gap-2 text-xs text-gray-200">
                  <input
                    type="checkbox"
                    checked={form.facilityIds.includes(facility._id)}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        facilityIds: prev.facilityIds.includes(facility._id)
                          ? prev.facilityIds.filter((id) => id !== facility._id)
                          : [...prev.facilityIds, facility._id],
                      }))
                    }
                  />
                  {facility.name} ({formatCurrency(Number(facility.hourlyRate || 0))}/hr)
                </label>
              ))}
            </div>
          </div>

          {form.bookingMode === 'single' ? (
            <input className={inputClass} type="date" value={form.eventDate} onChange={(e) => setForm((prev) => ({ ...prev, eventDate: e.target.value }))} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} type="date" value={form.rangeStartDate} onChange={(e) => setForm((prev) => ({ ...prev, rangeStartDate: e.target.value }))} />
              <input className={inputClass} type="date" value={form.rangeEndDate} onChange={(e) => setForm((prev) => ({ ...prev, rangeEndDate: e.target.value }))} />
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Quotation Items</p>
              <button type="button" onClick={addCustomItem} className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30">
                Add Custom Item
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div key={`${item.description}-${index}`} className="grid grid-cols-12 gap-2 rounded border border-white/10 bg-white/5 p-2">
                  <input className="col-span-12 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm text-white md:col-span-4" placeholder="Item description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} />
                  <input className="col-span-4 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm text-white md:col-span-2" type="number" min="0" step="0.01" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} />
                  <input className="col-span-4 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm text-white md:col-span-2" placeholder="Unit" value={item.unitLabel} onChange={(e) => updateItem(index, 'unitLabel', e.target.value)} />
                  <input className="col-span-4 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm text-white md:col-span-2" type="number" min="0" step="0.01" placeholder="Rate" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', e.target.value)} />
                  <div className="col-span-8 flex items-center justify-end text-sm font-semibold text-emerald-300 md:col-span-1">
                    {formatCurrency(round2(Number(item.quantity || 0) * Number(item.unitPrice || 0)))}
                  </div>
                  <div className="col-span-4 flex items-center justify-end md:col-span-1">
                    <button type="button" onClick={() => removeItem(index)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/30">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {!form.items.length && <p className="text-sm text-gray-400">No quotation items added yet.</p>}
            </div>
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
                      <button type="button" onClick={() => void exportPdf(row, true)} className="rounded bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200">
                        Print
                      </button>
                      <button type="button" onClick={() => void exportPdf(row, false)} className="rounded bg-sky-500/20 px-2 py-1 text-xs text-sky-100">
                        PDF
                      </button>
                      <button type="button" onClick={() => downloadEventQuotationWord(printable, getGeneralSettings())} className="rounded bg-fuchsia-500/20 px-2 py-1 text-xs text-fuchsia-100">
                        Word
                      </button>
                      <button type="button" onClick={() => downloadEventQuotationExcel(printable, getGeneralSettings())} className="rounded bg-violet-500/20 px-2 py-1 text-xs text-violet-100">
                        Excel
                      </button>
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
              Print or export the quotation with facility list, schedule, GST breakup, discount, and terms and conditions.
            </p>
            <div className="mt-3 rounded border border-white/10 bg-black/20 p-3 text-xs text-gray-300">
              Word and Excel exports download directly. PDF and Print use the professional quotation document layout.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
