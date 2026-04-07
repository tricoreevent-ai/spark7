import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { openPdfDocument, ServerPdfDocument } from '../utils/pdfDocument';
import { showPromptDialog } from '../utils/appDialogs';

interface Facility {
  _id: string;
  name: string;
  location?: string;
  hourlyRate: number;
  active: boolean;
}

interface EventOccurrence {
  occurrenceDate?: string;
  startTime: string;
  endTime: string;
}

interface EventPayment {
  _id?: string;
  receiptNumber: string;
  amount: number;
  paymentMethod?: string;
  paidAt: string;
  remarks?: string;
  confirmationEmail?: string;
  emailedAt?: string;
  emailedTo?: string;
}

interface EventBooking {
  _id: string;
  eventNumber?: string;
  seriesId?: string;
  seriesTotalDates?: number;
  eventName: string;
  organizerName: string;
  organizationName?: string;
  contactPhone?: string;
  contactEmail?: string;
  facilityIds: Array<{ _id: string; name: string; location?: string; hourlyRate?: number }>;
  startTime: string;
  endTime: string;
  occurrences?: EventOccurrence[];
  payments?: EventPayment[];
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  totalAmount: number;
  advanceAmount: number;
  paidAmount: number;
  balanceAmount: number;
  remarks?: string;
  refundAmount?: number;
  cancellationReason?: string;
}

interface PaymentDeskState {
  amount: string;
  paymentMethod: string;
  confirmationEmail: string;
  remarks: string;
  printAsConfirmation: boolean;
}

type BookingMode = 'single' | 'range';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const toDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addHour = (time: string): string => {
  const [hours, minutes] = String(time || '10:00').split(':').map(Number);
  const date = new Date(2000, 0, 1, hours || 0, minutes || 0, 0, 0);
  date.setHours(date.getHours() + 1);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const toIsoDateTime = (dateValue: string, timeValue: string): string => {
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0).toISOString();
};

const displayDateTime = (isoValue: string): string =>
  new Date(isoValue).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const displayDate = (isoValue: string): string =>
  new Date(isoValue).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const startOfMonth = (monthValue: string): Date => {
  const [year, month] = String(monthValue).split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1, 0, 0, 0, 0);
};

const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const calendarCells = (monthDate: Date): Array<{ key: string; date: Date; inMonth: boolean }> => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startPadding = first.getDay();
  const cells: Array<{ key: string; date: Date; inMonth: boolean }> = [];
  for (let i = startPadding; i > 0; i -= 1) {
    const d = new Date(first);
    d.setDate(first.getDate() - i);
    cells.push({ key: `${d.toISOString()}_p`, date: d, inMonth: false });
  }
  const lastDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= lastDate; day += 1) {
    const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    cells.push({ key: `${d.toISOString()}_m`, date: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last);
    d.setDate(last.getDate() + 1);
    cells.push({ key: `${d.toISOString()}_n`, date: d, inMonth: false });
  }
  return cells;
};

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

const bookingOccurrenceRows = (booking: EventBooking): EventOccurrence[] => {
  if (Array.isArray(booking.occurrences) && booking.occurrences.length > 0) {
    return [...booking.occurrences].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }

  return [
    {
      occurrenceDate: booking.startTime,
      startTime: booking.startTime,
      endTime: booking.endTime,
    },
  ];
};

const bookingDateKeys = (booking: EventBooking): string[] =>
  bookingOccurrenceRows(booking).map((occurrence) => toDateInput(new Date(occurrence.startTime)));

const latestPayment = (booking: EventBooking): EventPayment | null => {
  const rows = Array.isArray(booking.payments) ? booking.payments : [];
  return rows.length ? rows[rows.length - 1] : null;
};

const printServerDocument = (
  document: ServerPdfDocument | null | undefined,
  autoPrint: boolean,
  onError: (message: string) => void
) => {
  if (!document?.pdfBase64) {
    onError('Printable document is not available');
    return;
  }

  const opened = openPdfDocument(document, autoPrint);
  if (!opened) {
    onError('Unable to open print window. Please allow popups and try again.');
  }
};

type SelectedOccurrenceRow = {
  booking: EventBooking;
  occurrence: EventOccurrence;
};

export const EventManagement: React.FC = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [bookings, setBookings] = useState<EventBooking[]>([]);
  const [paymentDueBookings, setPaymentDueBookings] = useState<EventBooking[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(toDateInput(new Date()).slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(toDateInput(new Date()));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const paymentDeskRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState({
    bookingMode: 'single' as BookingMode,
    eventName: '',
    organizerName: '',
    organizationName: '',
    contactPhone: '',
    contactEmail: '',
    facilityIds: [] as string[],
    eventDate: toDateInput(new Date()),
    rangeStartDate: toDateInput(new Date()),
    rangeEndDate: toDateInput(new Date()),
    startTime: '10:00',
    endTime: '11:00',
    status: 'pending',
    totalAmount: '',
    advanceAmount: '',
    advancePaymentMethod: 'cash',
    remarks: '',
  });

  const [selectedPaymentBookingId, setSelectedPaymentBookingId] = useState('');
  const [paymentDesk, setPaymentDesk] = useState<PaymentDeskState>({
    amount: '',
    paymentMethod: 'cash',
    confirmationEmail: '',
    remarks: '',
    printAsConfirmation: true,
  });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const monthDate = useMemo(() => startOfMonth(selectedMonth), [selectedMonth]);
  const grid = useMemo(() => calendarCells(monthDate), [monthDate]);
  const activeFacilities = useMemo(() => facilities.filter((facility) => facility.active), [facilities]);

  const bookingDatesPreview = useMemo(() => {
    if (form.bookingMode === 'range') {
      return enumerateDates(form.rangeStartDate, form.rangeEndDate);
    }
    return form.eventDate ? [form.eventDate] : [];
  }, [form.bookingMode, form.eventDate, form.rangeEndDate, form.rangeStartDate]);

  const durationHours = useMemo(() => {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const start = new Date(2000, 0, 1, sh || 0, sm || 0, 0, 0);
    const end = new Date(2000, 0, 1, eh || 0, em || 0, 0, 0);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return diff > 0 ? diff : 0;
  }, [form.endTime, form.startTime]);

  const autoTotalAmount = useMemo(() => {
    const selectedFacilities = activeFacilities.filter((facility) => form.facilityIds.includes(facility._id));
    const hourlyTotal = selectedFacilities.reduce((sum, facility) => sum + Number(facility.hourlyRate || 0), 0);
    return Number((hourlyTotal * durationHours * bookingDatesPreview.length).toFixed(2));
  }, [activeFacilities, bookingDatesPreview.length, durationHours, form.facilityIds]);

  const selectedPaymentBooking = useMemo(
    () => bookings.find((booking) => booking._id === selectedPaymentBookingId) || null,
    [bookings, selectedPaymentBookingId]
  );

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const start = startOfMonth(selectedMonth);
      const end = endOfMonth(start);
      const query = new URLSearchParams({
        startDate: toDateInput(start),
        endDate: toDateInput(end),
      });

      const [facilityRes, eventRes, reminderRes] = await Promise.all([
        fetchApiJson(apiUrl('/api/facilities'), { headers }),
        fetchApiJson(apiUrl(`/api/events/bookings/list?${query.toString()}`), { headers }),
        fetchApiJson(apiUrl('/api/events/reminders?days=30'), { headers }),
      ]);

      const nextFacilities = Array.isArray(facilityRes?.data) ? facilityRes.data : [];
      const nextBookings = Array.isArray(eventRes?.data) ? eventRes.data : [];
      const nextPaymentDue = Array.isArray(reminderRes?.data?.paymentDue) ? reminderRes.data.paymentDue : [];

      setFacilities(nextFacilities);
      setBookings(nextBookings);
      setPaymentDueBookings(nextPaymentDue);
    } catch (e: any) {
      setError(e.message || 'Failed to load event data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedMonth]);

  useEffect(() => {
    if (form.bookingMode === 'single') {
      setForm((prev) => ({
        ...prev,
        eventDate: selectedDate,
        rangeStartDate: prev.rangeStartDate || selectedDate,
        rangeEndDate: prev.rangeEndDate || selectedDate,
      }));
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedPaymentBooking) return;
    setPaymentDesk((prev) => ({
      ...prev,
      amount: selectedPaymentBooking.balanceAmount > 0 ? String(Number(selectedPaymentBooking.balanceAmount || 0)) : prev.amount,
      confirmationEmail: selectedPaymentBooking.contactEmail || prev.confirmationEmail,
    }));
  }, [selectedPaymentBooking]);

  const toggleFacility = (facilityId: string) => {
    setForm((prev) => {
      const exists = prev.facilityIds.includes(facilityId);
      return {
        ...prev,
        facilityIds: exists
          ? prev.facilityIds.filter((id) => id !== facilityId)
          : [...prev.facilityIds, facilityId],
      };
    });
  };

  const focusPaymentDesk = (booking: EventBooking) => {
    setSelectedPaymentBookingId(booking._id);
    setPaymentDesk({
      amount: String(Number(booking.balanceAmount || 0)),
      paymentMethod: 'cash',
      confirmationEmail: booking.contactEmail || '',
      remarks: '',
      printAsConfirmation: true,
    });
    window.setTimeout(() => {
      paymentDeskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const buildOccurrencePayload = () => {
    return bookingDatesPreview.map((dateValue) => ({
      occurrenceDate: dateValue,
      startTime: toIsoDateTime(dateValue, form.startTime),
      endTime: toIsoDateTime(dateValue, form.endTime),
    }));
  };

  const createEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      if (!form.eventName.trim() || !form.organizerName.trim()) {
        setError('Event name and organizer are required');
        return;
      }
      if (form.facilityIds.length === 0) {
        setError('Select at least one facility');
        return;
      }
      if (bookingDatesPreview.length === 0) {
        setError('Select at least one valid booking date');
        return;
      }

      const occurrences = buildOccurrencePayload();
      if (new Date(occurrences[0].endTime).getTime() <= new Date(occurrences[0].startTime).getTime()) {
        setError('End time must be greater than start time');
        return;
      }

      setBusyKey('create-booking');
      await fetchApiJson(apiUrl('/api/events/bookings'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          eventName: form.eventName,
          organizerName: form.organizerName,
          organizationName: form.organizationName,
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail,
          facilityIds: form.facilityIds,
          occurrences,
          status: form.status,
          totalAmount: form.totalAmount ? Number(form.totalAmount) : autoTotalAmount,
          advanceAmount: form.advanceAmount ? Number(form.advanceAmount) : 0,
          paidAmount: form.advanceAmount ? Number(form.advanceAmount) : 0,
          advancePaymentMethod: form.advancePaymentMethod,
          remarks: form.remarks,
        }),
      });

      setMessage(
        bookingDatesPreview.length > 1
          ? `Event booking created for ${bookingDatesPreview.length} dates`
          : 'Event booking created successfully'
      );
      setForm((prev) => ({
        ...prev,
        eventName: '',
        organizerName: '',
        organizationName: '',
        contactPhone: '',
        contactEmail: '',
        facilityIds: [],
        startTime: '10:00',
        endTime: '11:00',
        totalAmount: '',
        advanceAmount: '',
        advancePaymentMethod: 'cash',
        remarks: '',
      }));
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to create event booking');
    } finally {
      setBusyKey('');
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setError('');
    setMessage('');
    try {
      setBusyKey(`status-${id}-${status}`);
      await fetchApiJson(apiUrl(`/api/events/bookings/${id}/status`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status }),
      });
      setMessage('Event status updated');
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update event status');
    } finally {
      setBusyKey('');
    }
  };

  const submitPayment = async () => {
    if (!selectedPaymentBooking) {
      setError('Select a booking for payment collection');
      return;
    }

    const amount = Number(paymentDesk.amount || 0);
    if (amount <= 0) {
      setError('Enter a valid payment amount');
      return;
    }

    setError('');
    setMessage('');
    try {
      setBusyKey(`payment-${selectedPaymentBooking._id}`);
      const response = await fetchApiJson(apiUrl(`/api/events/bookings/${selectedPaymentBooking._id}/payments`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount,
          paymentMethod: paymentDesk.paymentMethod,
          confirmationEmail: paymentDesk.confirmationEmail,
          remarks: paymentDesk.remarks,
          printAsConfirmation: paymentDesk.printAsConfirmation,
        }),
      });

      if (response?.document) {
        printServerDocument(response.document as ServerPdfDocument, paymentDesk.printAsConfirmation, setError);
      }

      const emailStatus = response?.document?.emailed
        ? ` Confirmation emailed to ${response.document.emailedTo}.`
        : response?.document?.emailError
          ? ` Email failed: ${response.document.emailError}`
          : '';

      setMessage(`${response?.message || 'Payment recorded successfully.'}${emailStatus}`.trim());
      setPaymentDesk((prev) => ({ ...prev, amount: '', remarks: '' }));
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to record payment');
    } finally {
      setBusyKey('');
    }
  };

  const cancelEvent = async (id: string) => {
    const reason = await showPromptDialog('Enter the cancellation reason for this event.', {
      title: 'Cancel Event',
      label: 'Cancellation reason',
      defaultValue: 'Organizer cancelled event',
      confirmText: 'Cancel Event',
      inputType: 'textarea',
      required: true,
    });
    if (!reason) return;
    setError('');
    setMessage('');
    try {
      setBusyKey(`cancel-${id}`);
      await fetchApiJson(apiUrl(`/api/events/bookings/${id}/cancel`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ cancellationReason: reason }),
      });
      setMessage('Event cancelled and refund tracked');
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to cancel event');
    } finally {
      setBusyKey('');
    }
  };

  const rescheduleEvent = async (booking: EventBooking) => {
    if (bookingOccurrenceRows(booking).length > 1) {
      setError('Multi-date event reschedule is not supported from this screen yet');
      return;
    }

    const nextDate = await showPromptDialog('Enter the new event date.', {
      title: 'Reschedule Event',
      label: 'Date',
      defaultValue: toDateInput(new Date(booking.startTime)),
      inputType: 'date',
      confirmText: 'Next',
      required: true,
    });
    if (!nextDate) return;
    const nextStart = await showPromptDialog('Enter the new start time.', {
      title: 'Reschedule Event',
      label: 'Start time',
      defaultValue: new Date(booking.startTime).toTimeString().slice(0, 5),
      inputType: 'time',
      confirmText: 'Next',
      required: true,
    });
    if (!nextStart) return;
    const nextEnd = await showPromptDialog('Enter the new end time.', {
      title: 'Reschedule Event',
      label: 'End time',
      defaultValue: new Date(booking.endTime).toTimeString().slice(0, 5),
      inputType: 'time',
      confirmText: 'Next',
      required: true,
    });
    if (!nextEnd) return;
    const reason = (await showPromptDialog('Reason for the reschedule (optional).', {
      title: 'Reschedule Event',
      label: 'Reason',
      defaultValue: 'Organizer requested change',
      inputType: 'textarea',
      confirmText: 'Save Changes',
    })) || '';

    setError('');
    setMessage('');
    try {
      setBusyKey(`reschedule-${booking._id}`);
      await fetchApiJson(apiUrl(`/api/events/bookings/${booking._id}/reschedule`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          facilityIds: booking.facilityIds.map((facility) => facility._id),
          startTime: toIsoDateTime(nextDate, nextStart),
          endTime: toIsoDateTime(nextDate, nextEnd),
          reason,
        }),
      });
      setMessage('Event rescheduled');
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to reschedule event');
    } finally {
      setBusyKey('');
    }
  };

  const printBookingConfirmation = async (booking: EventBooking, autoPrint = true) => {
    setError('');
    try {
      setBusyKey(`print-booking-${booking._id}`);
      const response = await fetchApiJson(apiUrl(`/api/events/bookings/${booking._id}/confirmation-document`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          confirmationEmail: booking.contactEmail || '',
        }),
      });
      if (response?.data) {
        printServerDocument(response.data as ServerPdfDocument, autoPrint, setError);
      }
      if (response?.data?.emailError) {
        setMessage(`Booking confirmation prepared. Email failed: ${response.data.emailError}`);
      } else if (response?.data?.emailed) {
        setMessage(`Booking confirmation prepared and emailed to ${response.data.emailedTo}`);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to prepare booking confirmation');
    } finally {
      setBusyKey('');
    }
  };

  const printLatestPaymentReceipt = async (booking: EventBooking, autoPrint = true) => {
    const payment = latestPayment(booking);
    if (!payment?._id) {
      setError('No payment receipt is available for this booking yet');
      return;
    }

    setError('');
    try {
      setBusyKey(`print-payment-${booking._id}`);
      const response = await fetchApiJson(apiUrl(`/api/events/bookings/${booking._id}/payments/${payment._id}/confirmation`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          confirmationEmail: payment.confirmationEmail || booking.contactEmail || '',
        }),
      });
      if (response?.data) {
        printServerDocument(response.data as ServerPdfDocument, autoPrint, setError);
      }
      if (response?.data?.emailError) {
        setMessage(`Payment receipt prepared. Email failed: ${response.data.emailError}`);
      } else if (response?.data?.emailed) {
        setMessage(`Payment receipt prepared and emailed to ${response.data.emailedTo}`);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to prepare payment receipt');
    } finally {
      setBusyKey('');
    }
  };

  const bookingsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach((booking) => {
      bookingDateKeys(booking).forEach((key) => {
        map[key] = (map[key] || 0) + 1;
      });
    });
    return map;
  }, [bookings]);

  const selectedDateBookings = useMemo<SelectedOccurrenceRow[]>(() => {
    return bookings
      .flatMap((booking) =>
        bookingOccurrenceRows(booking)
          .filter((occurrence) => toDateInput(new Date(occurrence.startTime)) === selectedDate)
          .map((occurrence) => ({ booking, occurrence }))
      )
      .sort((a, b) => new Date(a.occurrence.startTime).getTime() - new Date(b.occurrence.startTime).getTime());
  }, [bookings, selectedDate]);

  const paymentDuePreview = useMemo(() => {
    return [...paymentDueBookings]
      .sort((a, b) => Number(b.balanceAmount || 0) - Number(a.balanceAmount || 0))
      .slice(0, 6);
  }, [paymentDueBookings]);

  const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Event Booking (Corporate / Organizers)</h1>
          <p className="text-sm text-gray-300">Book one or multiple event dates, track advance and remaining payments, and print/email confirmations.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Month</label>
          <input type="month" className={inputClass} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading...</p>}

      <div ref={paymentDeskRef} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="lg:max-w-xl">
            <h2 className="text-lg font-semibold text-white">Remaining Payment Alerts</h2>
            <p className="mt-1 text-sm text-amber-100/80">
              Outstanding event balances remain visible here until the remaining payment is completed.
            </p>
            {!paymentDuePreview.length ? (
              <div className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                No pending event balances right now.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {paymentDuePreview.map((booking) => (
                  <button
                    key={booking._id}
                    type="button"
                    onClick={() => focusPaymentDesk(booking)}
                    className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-black/30"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{booking.eventName}</p>
                      <p className="text-xs text-gray-300">{booking.organizerName} {booking.contactPhone ? `• ${booking.contactPhone}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-amber-200">Balance</p>
                      <p className="text-sm font-semibold text-amber-100">{formatCurrency(Number(booking.balanceAmount || 0))}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-full rounded-xl border border-white/10 bg-black/20 p-4 lg:max-w-md">
            <h3 className="text-base font-semibold text-white">Payment Desk</h3>
            {!selectedPaymentBooking ? (
              <p className="mt-2 text-sm text-gray-300">Choose a pending-balance event from the alert list or booking table to collect the remaining amount.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-sm font-semibold text-white">{selectedPaymentBooking.eventName}</p>
                  <p className="text-xs text-gray-300">{selectedPaymentBooking.organizerName}</p>
                  <p className="mt-2 text-xs text-gray-400">Outstanding: <span className="font-semibold text-amber-200">{formatCurrency(Number(selectedPaymentBooking.balanceAmount || 0))}</span></p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Payment amount"
                    value={paymentDesk.amount}
                    onChange={(e) => setPaymentDesk((prev) => ({ ...prev, amount: e.target.value }))}
                  />
                  <select
                    className={inputClass}
                    value={paymentDesk.paymentMethod}
                    onChange={(e) => setPaymentDesk((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="Email confirmation PDF to"
                    value={paymentDesk.confirmationEmail}
                    onChange={(e) => setPaymentDesk((prev) => ({ ...prev, confirmationEmail: e.target.value }))}
                  />
                  <textarea
                    className={`${inputClass} min-h-[84px]`}
                    placeholder="Payment remarks"
                    value={paymentDesk.remarks}
                    onChange={(e) => setPaymentDesk((prev) => ({ ...prev, remarks: e.target.value }))}
                  />
                  <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={paymentDesk.printAsConfirmation}
                      onChange={(e) => setPaymentDesk((prev) => ({ ...prev, printAsConfirmation: e.target.checked }))}
                    />
                    Print as confirmation
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submitPayment}
                    disabled={busyKey === `payment-${selectedPaymentBooking._id}`}
                    className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {busyKey === `payment-${selectedPaymentBooking._id}` ? 'Recording...' : 'Record Payment'}
                  </button>
                  {latestPayment(selectedPaymentBooking)?._id ? (
                    <button
                      type="button"
                      onClick={() => void printLatestPaymentReceipt(selectedPaymentBooking)}
                      className="rounded-md bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30"
                    >
                      Print Last Receipt
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">Event Calendar</h2>
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-gray-300">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="rounded bg-white/5 px-2 py-2">{day}</div>
            ))}
            {grid.map((cell) => {
              const key = toDateInput(cell.date);
              const count = bookingsByDate[key] || 0;
              const selected = key === selectedDate;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`rounded border px-2 py-2 text-left ${
                    selected
                      ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100'
                      : cell.inMonth
                        ? 'border-white/10 bg-black/10 text-gray-200 hover:bg-white/10'
                        : 'border-white/5 bg-black/20 text-gray-500'
                  }`}
                >
                  <p className="text-xs">{cell.date.getDate()}</p>
                  <p className="mt-1 text-[10px]">{count ? `${count} event${count > 1 ? 's' : ''}` : 'No events'}</p>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={createEvent} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Create Event</h2>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, bookingMode: 'single', eventDate: selectedDate }))}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${form.bookingMode === 'single' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-200'}`}
            >
              Single Date
            </button>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, bookingMode: 'range', rangeStartDate: prev.rangeStartDate || selectedDate, rangeEndDate: prev.rangeEndDate || selectedDate }))}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${form.bookingMode === 'range' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-200'}`}
            >
              Date Range
            </button>
          </div>

          <input className={inputClass} placeholder="Event Name" required value={form.eventName} onChange={(e) => setForm((prev) => ({ ...prev, eventName: e.target.value }))} />
          <input className={inputClass} placeholder="Organizer Name" required value={form.organizerName} onChange={(e) => setForm((prev) => ({ ...prev, organizerName: e.target.value }))} />
          <input className={inputClass} placeholder="Organization (optional)" value={form.organizationName} onChange={(e) => setForm((prev) => ({ ...prev, organizationName: e.target.value }))} />

          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Phone" value={form.contactPhone} onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))} />
            <input className={inputClass} placeholder="Email" type="email" value={form.contactEmail} onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))} />
          </div>

          <div className="rounded border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs text-gray-300">Select multiple facilities for this event</p>
            <div className="grid grid-cols-1 gap-1">
              {activeFacilities.map((facility) => (
                <label key={facility._id} className="flex items-center gap-2 text-xs text-gray-200">
                  <input type="checkbox" checked={form.facilityIds.includes(facility._id)} onChange={() => toggleFacility(facility._id)} />
                  {facility.name} ({formatCurrency(Number(facility.hourlyRate || 0))}/hr)
                </label>
              ))}
            </div>
          </div>

          {form.bookingMode === 'single' ? (
            <input className={inputClass} type="date" value={form.eventDate} onChange={(e) => setForm((prev) => ({ ...prev, eventDate: e.target.value }))} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} type="date" value={form.rangeStartDate} onChange={(e) => setForm((prev) => ({ ...prev, rangeStartDate: e.target.value, rangeEndDate: prev.rangeEndDate < e.target.value ? e.target.value : prev.rangeEndDate }))} />
              <input className={inputClass} type="date" value={form.rangeEndDate} onChange={(e) => setForm((prev) => ({ ...prev, rangeEndDate: e.target.value }))} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} type="time" value={form.startTime} onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value, endTime: addHour(e.target.value) }))} />
            <input className={inputClass} type="time" value={form.endTime} onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))} />
          </div>

          <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
            Booking dates: <span className="font-semibold text-white">{bookingDatesPreview.length}</span>
            {bookingDatesPreview.length > 0 ? (
              <span className="ml-2 text-gray-400">{bookingDatesPreview.slice(0, 4).map((dateValue) => displayDate(`${dateValue}T00:00:00`)).join(', ')}{bookingDatesPreview.length > 4 ? '...' : ''}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select className={inputClass} value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
            <input className={inputClass} type="number" min="0" step="0.01" placeholder={`Total (Auto ${formatCurrency(autoTotalAmount)})`} value={form.totalAmount} onChange={(e) => setForm((prev) => ({ ...prev, totalAmount: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Advance Payment" value={form.advanceAmount} onChange={(e) => setForm((prev) => ({ ...prev, advanceAmount: e.target.value }))} />
            <select className={inputClass} value={form.advancePaymentMethod} onChange={(e) => setForm((prev) => ({ ...prev, advancePaymentMethod: e.target.value }))}>
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <textarea className={`${inputClass} min-h-[70px]`} placeholder="Remarks" value={form.remarks} onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} />

          <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
            Estimated total: <span className="font-semibold text-emerald-300">{formatCurrency(form.totalAmount ? Number(form.totalAmount) : autoTotalAmount)}</span>
          </div>

          <button disabled={busyKey === 'create-booking'} className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">
            {busyKey === 'create-booking' ? 'Creating...' : 'Create Event Booking'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">Events on {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN')}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {['Event No', 'Event', 'Organizer', 'Facilities', 'Selected Date Slot', 'Amount', 'Payment', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {selectedDateBookings.map(({ booking, occurrence }) => {
                const multiDate = bookingOccurrenceRows(booking).length > 1;
                const lastPayment = latestPayment(booking);
                return (
                  <tr key={`${booking._id}-${occurrence.startTime}`} className={selectedPaymentBookingId === booking._id ? 'bg-amber-500/5' : ''}>
                    <td className="px-2 py-2 text-xs text-indigo-200">{booking.eventNumber || booking._id.slice(-6)}</td>
                    <td className="px-2 py-2 text-xs text-gray-200">
                      <p className="text-sm text-white">{booking.eventName}</p>
                      <p>{booking.organizationName || '-'}</p>
                      {multiDate && <p className="text-[11px] text-cyan-200">{bookingOccurrenceRows(booking).length} booked dates</p>}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-300">
                      <p>{booking.organizerName}</p>
                      <p>{booking.contactPhone || '-'}</p>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-300">{booking.facilityIds.map((facility) => facility.name).join(', ')}</td>
                    <td className="px-2 py-2 text-xs text-gray-300">
                      <p>{displayDateTime(occurrence.startTime)}</p>
                      <p>{displayDateTime(occurrence.endTime)}</p>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-300">
                      <p>Total: {formatCurrency(Number(booking.totalAmount || 0))}</p>
                      <p>Paid: <span className="text-emerald-300">{formatCurrency(Number(booking.paidAmount || 0))}</span></p>
                      <p>Balance: <span className="text-amber-300">{formatCurrency(Number(booking.balanceAmount || 0))}</span></p>
                      {Number(booking.refundAmount || 0) > 0 && <p>Refund: <span className="text-rose-300">{formatCurrency(Number(booking.refundAmount || 0))}</span></p>}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-300">
                      <p className="uppercase">{booking.paymentStatus}</p>
                      {lastPayment?.receiptNumber ? <p className="text-[11px] text-gray-500">Last: {lastPayment.receiptNumber}</p> : null}
                    </td>
                    <td className="px-2 py-2 text-xs uppercase text-gray-300">{booking.status}</td>
                    <td className="px-2 py-2 text-xs">
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {booking.status === 'pending' && (
                            <button onClick={() => updateStatus(booking._id, 'confirmed')} className="rounded bg-indigo-500/20 px-2 py-1 text-indigo-200">
                              {busyKey === `status-${booking._id}-confirmed` ? '...' : 'Confirm'}
                            </button>
                          )}
                          {['pending', 'confirmed'].includes(booking.status) && <button onClick={() => updateStatus(booking._id, 'completed')} className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-200">Complete</button>}
                          {booking.status !== 'cancelled' && <button onClick={() => cancelEvent(booking._id)} className="rounded bg-rose-500/20 px-2 py-1 text-rose-200">Cancel</button>}
                          {['pending', 'confirmed'].includes(booking.status) && bookingOccurrenceRows(booking).length === 1 && <button onClick={() => rescheduleEvent(booking)} className="rounded bg-amber-500/20 px-2 py-1 text-amber-200">Reschedule</button>}
                          <button onClick={() => focusPaymentDesk(booking)} className="rounded bg-amber-500/20 px-2 py-1 text-amber-100">Collect Balance</button>
                          <button onClick={() => void printBookingConfirmation(booking)} className="rounded bg-cyan-500/20 px-2 py-1 text-cyan-200">
                            {busyKey === `print-booking-${booking._id}` ? 'Preparing...' : 'Print Booking'}
                          </button>
                          {lastPayment?._id ? (
                            <button onClick={() => void printLatestPaymentReceipt(booking)} className="rounded bg-fuchsia-500/20 px-2 py-1 text-fuchsia-100">
                              {busyKey === `print-payment-${booking._id}` ? 'Preparing...' : 'Payment Receipt'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!selectedDateBookings.length && (
                <tr><td colSpan={9} className="px-2 py-3 text-center text-sm text-gray-400">No events on selected date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
