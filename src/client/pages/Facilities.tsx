import React, { useEffect, useMemo, useState } from 'react';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

interface Facility {
  _id: string;
  name: string;
  location?: string;
  hourlyRate: number;
  capacity?: number;
  imageUrl?: string;
  active: boolean;
}

interface Booking {
  _id: string;
  bookingNumber?: string;
  facilityId: Facility;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'booked' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  bookedUnits?: number;
  amount: number;
  totalAmount?: number;
  paidAmount?: number;
  balanceAmount?: number;
}

interface CustomerOption {
  _id: string;
  customerCode?: string;
  memberCode?: string;
  memberSubscriptionId?: string;
  name: string;
  phone?: string;
  email?: string;
  accountType?: 'cash' | 'credit';
  isBlocked?: boolean;
  memberStatus?: string;
  source?: 'customer' | 'member';
}

const getTodayLocalDate = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const toDateTime = (date: string, time: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const addOneHour = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(2000, 0, 1, hours, minutes, 0, 0);
  next.setHours(next.getHours() + 1);
  return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
};

const toDisplayTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const facilityNameNormalized = (facility?: Partial<Facility> | null): string =>
  String(facility?.name || '')
    .trim()
    .toLowerCase();

const isBadmintonFacility = (facility?: Partial<Facility> | null): boolean =>
  facilityNameNormalized(facility).includes('badminton');

const isFootballTurfFacility = (facility?: Partial<Facility> | null): boolean => {
  const name = facilityNameNormalized(facility);
  return name.includes('football') && name.includes('turf');
};

const isSwimmingPoolFacility = (facility?: Partial<Facility> | null): boolean => {
  const name = facilityNameNormalized(facility);
  return name.includes('swimming') && name.includes('pool');
};

const facilityCapacity = (facility?: Partial<Facility> | null): number => {
  if (!facility) return 1;
  if (isBadmintonFacility(facility)) return 8;
  if (isFootballTurfFacility(facility)) return 1;
  if (isSwimmingPoolFacility(facility)) return 1;
  const configured = Number(facility.capacity || 0);
  return configured > 0 ? Math.floor(configured) : 1;
};

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '').slice(-10);

const hourSlots = (): string[] => {
  const slots: string[] = [];
  for (let hour = 6; hour <= 22; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return slots;
};

export const Facilities: React.FC = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [date, setDate] = useState(getTodayLocalDate());
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [bookingForm, setBookingForm] = useState({
    facilityId: '',
    customerId: '',
    customerPhone: '',
    customerName: '',
    customerEmail: '',
    bookingDate: getTodayLocalDate(),
    startTime: '09:00',
    endTime: '10:00',
    bookedUnits: '1',
    paymentStatus: 'pending',
    amount: '',
    notes: '',
  });
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const slots = useMemo(() => hourSlots(), []);

  const activeFacilities = useMemo(() => facilities.filter((facility) => facility.active), [facilities]);

  const visibleFacilities = useMemo(() => {
    if (facilityFilter === 'all') return activeFacilities;
    return activeFacilities.filter((facility) => facility._id === facilityFilter);
  }, [activeFacilities, facilityFilter]);

  const selectedFormFacility = useMemo(
    () => activeFacilities.find((facility) => facility._id === bookingForm.facilityId),
    [activeFacilities, bookingForm.facilityId]
  );

  const bookingDurationHours = useMemo(() => {
    const start = toDateTime('2000-01-01', bookingForm.startTime);
    const end = toDateTime('2000-01-01', bookingForm.endTime);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return diff > 0 ? diff : 0;
  }, [bookingForm.endTime, bookingForm.startTime]);

  const selectedFacilityCapacity = useMemo(
    () => facilityCapacity(selectedFormFacility),
    [selectedFormFacility]
  );

  const activeStatusSet = useMemo(() => new Set(['pending', 'confirmed', 'booked']), []);

  const occupiedUnitsAtSelectedTime = useMemo(() => {
    if (!selectedFormFacility) return 0;
    const start = toDateTime(bookingForm.bookingDate, bookingForm.startTime);
    const end = toDateTime(bookingForm.bookingDate, bookingForm.endTime);
    if (end <= start) return 0;

    return bookings.reduce((sum, booking) => {
      if (booking.facilityId?._id !== selectedFormFacility._id) return sum;
      if (!activeStatusSet.has(String(booking.status || '').toLowerCase())) return sum;
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);
      if (bookingStart < end && bookingEnd > start) {
        return sum + Math.max(1, Number(booking.bookedUnits || 1));
      }
      return sum;
    }, 0);
  }, [
    activeStatusSet,
    bookingForm.bookingDate,
    bookingForm.endTime,
    bookingForm.startTime,
    bookings,
    selectedFormFacility,
  ]);

  const availableUnitsAtSelectedTime = useMemo(
    () => Math.max(0, selectedFacilityCapacity - occupiedUnitsAtSelectedTime),
    [occupiedUnitsAtSelectedTime, selectedFacilityCapacity]
  );

  const requestedBookedUnits = useMemo(() => {
    const raw = Math.max(1, Math.floor(Number(bookingForm.bookedUnits || 1)));
    if (selectedFacilityCapacity <= 1) return 1;
    return Math.min(selectedFacilityCapacity, raw);
  }, [bookingForm.bookedUnits, selectedFacilityCapacity]);

  useEffect(() => {
    if (selectedFacilityCapacity <= 1 && bookingForm.bookedUnits !== '1') {
      setBookingForm((prev) => ({ ...prev, bookedUnits: '1' }));
      return;
    }
    if (selectedFacilityCapacity > 1) {
      const normalized = String(
        Math.min(
          selectedFacilityCapacity,
          Math.max(1, Math.floor(Number(bookingForm.bookedUnits || 1)))
        )
      );
      if (normalized !== bookingForm.bookedUnits) {
        setBookingForm((prev) => ({ ...prev, bookedUnits: normalized }));
      }
    }
  }, [bookingForm.bookedUnits, selectedFacilityCapacity]);

  const autoAmount = useMemo(() => {
    if (!selectedFormFacility || bookingDurationHours <= 0) return 0;
    return Number(
      (
        bookingDurationHours *
        Number(selectedFormFacility.hourlyRate || 0) *
        Math.max(1, requestedBookedUnits)
      ).toFixed(2)
    );
  }, [bookingDurationHours, requestedBookedUnits, selectedFormFacility]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const query = new URLSearchParams({ date });
      if (facilityFilter !== 'all') {
        query.set('facilityId', facilityFilter);
      }

      const [facilityData, bookingData] = await Promise.all([
        fetchApiJson(apiUrl('/api/facilities'), { headers }),
        fetchApiJson(apiUrl(`/api/facilities/bookings/list?${query.toString()}`), { headers }),
      ]);

      const facilitiesList = facilityData.data || [];
      setFacilities(facilitiesList);
      setBookings(bookingData.data || []);

      if (!bookingForm.facilityId && facilitiesList[0]?._id) {
        setBookingForm((prev) => ({ ...prev, facilityId: facilitiesList[0]._id }));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load facilities and bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [date, facilityFilter]);

  useEffect(() => {
    setBookingForm((prev) => ({ ...prev, bookingDate: date }));
  }, [date]);

  useEffect(() => {
    const phone = normalizePhone(bookingForm.customerPhone);
    if (phone.length < 4) {
      setCustomerMatches([]);
      setShowCustomerDialog(false);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setSearchingCustomer(true);
        try {
          const data = await fetchApiJson(
            apiUrl(`/api/customers/search-unified?q=${encodeURIComponent(phone)}`),
            { headers }
          );
          const rows = Array.isArray(data?.data) ? data.data : [];
          setCustomerMatches(rows);
          if (rows.length > 0 && !bookingForm.customerId) {
            setShowCustomerDialog(true);
          }
        } catch {
          setCustomerMatches([]);
        } finally {
          setSearchingCustomer(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [bookingForm.customerId, bookingForm.customerPhone, headers]);

  const selectCustomerOption = (customer: CustomerOption) => {
    setBookingForm((prev) => ({
      ...prev,
      customerId: customer.source === 'customer' ? customer._id : '',
      customerPhone: customer.phone || prev.customerPhone,
      customerName: customer.name || prev.customerName,
      customerEmail: customer.email || prev.customerEmail,
    }));
    setCustomerMatches([]);
    setShowCustomerDialog(false);
  };

  const createBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!bookingForm.facilityId) {
      setError('Select a facility');
      return;
    }
    const normalizedPhone = normalizePhone(bookingForm.customerPhone);
    if (!normalizedPhone) {
      setError('Customer phone is required');
      return;
    }
    if (!bookingForm.customerId && !bookingForm.customerName.trim()) {
      setError('Customer name is required for new customer');
      return;
    }

    const start = toDateTime(bookingForm.bookingDate, bookingForm.startTime);
    const end = toDateTime(bookingForm.bookingDate, bookingForm.endTime);

    if (end <= start) {
      setError('End time must be greater than start time');
      return;
    }

    if (requestedBookedUnits > availableUnitsAtSelectedTime) {
      setError(
        selectedFacilityCapacity > 1
          ? `Only ${availableUnitsAtSelectedTime} court(s) available for selected time`
          : 'Selected slot is not available'
      );
      return;
    }

    const finalAmount = bookingForm.amount ? Number(bookingForm.amount) : autoAmount;

    try {
      await fetchApiJson(apiUrl('/api/facilities/bookings'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          facilityId: bookingForm.facilityId,
          customerId: bookingForm.customerId || undefined,
          customerName: bookingForm.customerName,
          customerPhone: normalizedPhone,
          customerEmail: bookingForm.customerEmail,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          bookedUnits: requestedBookedUnits,
          amount: finalAmount,
          paymentStatus: bookingForm.paymentStatus,
          notes: bookingForm.notes,
        }),
      });

      setMessage('Booking created successfully');
      setBookingForm((prev) => ({
        ...prev,
        customerId: '',
        customerPhone: '',
        customerName: '',
        customerEmail: '',
        startTime: '09:00',
        endTime: '10:00',
        bookedUnits: '1',
        amount: '',
        notes: '',
      }));
      setCustomerMatches([]);
      setShowCustomerDialog(false);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to create booking');
    }
  };

  const updateBooking = async (id: string, updates: { status?: string; paymentStatus?: string }) => {
    setError('');
    setMessage('');

    try {
      await fetchApiJson(apiUrl(`/api/facilities/bookings/${id}/status`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });
      setMessage('Booking updated');
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update booking');
    }
  };

  const getCellBookings = (facilityId: string, slotLabel: string): Booking[] => {
    const slotStart = toDateTime(date, slotLabel);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    return bookings.filter((booking) => {
      if (booking.facilityId?._id !== facilityId) return false;
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);
      return bookingStart < slotEnd && bookingEnd > slotStart;
    });
  };

  const totalBookedAmount = bookings.reduce((sum, booking) => sum + Number(booking.amount || 0), 0);
  const pendingBookings = bookings.filter((booking) => ['pending', 'confirmed', 'booked'].includes(booking.status)).length;

  const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Facility Booking</h1>
          <p className="text-sm text-gray-300">Simple booking board inspired by room scheduling layout.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Date</label>
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Facility</label>
            <select className={inputClass} value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)}>
              <option value="all">All Facilities</option>
              {activeFacilities.map((facility) => (
                <option key={facility._id} value={facility._id}>{facility.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      {loading && <div className="text-sm text-gray-400">Loading...</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form onSubmit={createBooking} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Create Booking</h2>
            <ManualHelpLink anchor="transaction-facility-booking" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Facility</label>
              <select
                className={inputClass}
                required
                value={bookingForm.facilityId}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, facilityId: e.target.value }))}
              >
                <option value="">Select Facility</option>
                {activeFacilities.map((facility) => (
                  <option key={facility._id} value={facility._id}>{facility.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Booking Date</label>
              <input
                className={inputClass}
                type="date"
                required
                value={bookingForm.bookingDate}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, bookingDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Customer Phone (required)</label>
              <input
                className={inputClass}
                placeholder="Enter mobile first"
                value={bookingForm.customerPhone}
                onChange={(e) => {
                  const value = e.target.value;
                  setBookingForm((prev) => ({
                    ...prev,
                    customerPhone: value,
                    customerId: normalizePhone(value) === normalizePhone(prev.customerPhone) ? prev.customerId : '',
                  }));
                  setShowCustomerDialog(false);
                }}
              />
              {searchingCustomer && <p className="mt-1 text-[11px] text-gray-400">Searching customers...</p>}
              {!searchingCustomer && customerMatches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCustomerDialog(true)}
                  className="mt-1 rounded border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200"
                >
                  Found {customerMatches.length} existing match(es). Click to select.
                </button>
              )}
              {!searchingCustomer && normalizePhone(bookingForm.customerPhone).length >= 10 && customerMatches.length === 0 && !bookingForm.customerId && !bookingForm.customerName.trim() && (
                <p className="mt-1 text-[11px] text-amber-300">No customer found. Enter name to create a new customer.</p>
              )}
              {!!bookingForm.customerId && (
                <p className="mt-1 text-[11px] text-emerald-300">Existing customer selected from database</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Customer Name</label>
              <input
                className={inputClass}
                placeholder="Customer Name"
                value={bookingForm.customerName}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, customerName: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Customer Email</label>
              <input
                className={inputClass}
                type="email"
                placeholder="Customer Email (optional)"
                value={bookingForm.customerEmail}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, customerEmail: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Start Time</label>
              <input
                className={inputClass}
                type="time"
                required
                value={bookingForm.startTime}
                onChange={(e) =>
                  setBookingForm((prev) => ({
                    ...prev,
                    startTime: e.target.value,
                    endTime: addOneHour(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">End Time</label>
              <input
                className={inputClass}
                type="time"
                required
                value={bookingForm.endTime}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
            {selectedFacilityCapacity > 1 && (
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Courts
                </label>
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  max={selectedFacilityCapacity}
                  step="1"
                  value={bookingForm.bookedUnits}
                  onChange={(e) =>
                    setBookingForm((prev) => ({ ...prev, bookedUnits: e.target.value }))
                  }
                />
                <p className="mt-1 text-[11px] text-emerald-300">
                  Available now: {availableUnitsAtSelectedTime} / {selectedFacilityCapacity}
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-gray-400">Payment Status</label>
              <select
                className={inputClass}
                value={bookingForm.paymentStatus}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, paymentStatus: e.target.value }))}
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Custom Amount (optional)</label>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                placeholder={`Auto: ${formatCurrency(autoAmount)}`}
                value={bookingForm.amount}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </div>
          </div>

          <textarea
            className={`${inputClass} min-h-[72px]`}
            placeholder="Notes (optional)"
            value={bookingForm.notes}
            onChange={(e) => setBookingForm((prev) => ({ ...prev, notes: e.target.value }))}
          />

          <div className="flex items-center justify-between rounded border border-white/10 bg-black/10 px-3 py-2 text-sm">
            <span className="text-gray-300">Estimated Amount</span>
            <span className="font-semibold text-emerald-300">{formatCurrency(bookingForm.amount ? Number(bookingForm.amount) : autoAmount)}</span>
          </div>

          <button className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Book Slot</button>
        </form>

        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Daily Overview</h2>
          <div className="grid grid-cols-1 gap-3">
            {selectedFormFacility?.imageUrl && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <img src={selectedFormFacility.imageUrl} alt={selectedFormFacility.name} className="h-24 w-full rounded object-cover" />
              </div>
            )}
            <div className="rounded-lg border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-gray-400">Bookings</p>
              <p className="text-xl font-semibold text-white">{bookings.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-gray-400">Pending Bookings</p>
              <p className="text-xl font-semibold text-amber-300">{pendingBookings}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-gray-400">Total Amount</p>
              <p className="text-xl font-semibold text-emerald-300">{formatCurrency(totalBookedAmount)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-gray-400">Active Facilities</p>
              <p className="text-xl font-semibold text-white">{activeFacilities.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Availability Board</h2>
          <p className="text-xs text-gray-400">Time rows x facility columns</p>
        </div>

        {!visibleFacilities.length ? (
          <div className="rounded border border-white/10 p-3 text-sm text-gray-400">No active facilities found. Add facilities from Facility Setup page.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] divide-y divide-white/10">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">Time</th>
                  {visibleFacilities.map((facility) => (
                    <th key={facility._id} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                      <div className="rounded-md border border-white/10 bg-black/10 px-2 py-1">
                        {facility.imageUrl ? (
                          <img src={facility.imageUrl} alt={facility.name} className="mb-1 h-12 w-full rounded object-cover" />
                        ) : null}
                        <p className="text-sm font-semibold text-white">{facility.name}</p>
                        <p className="text-xs text-gray-400">{formatCurrency(Number(facility.hourlyRate || 0))}/hr</p>
                        <p className="text-xs text-gray-500">{facility.location || '-'}</p>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {slots.map((slot) => (
                  <tr key={slot}>
                    <td className="px-2 py-3 text-xs text-gray-400">{slot}</td>
                    {visibleFacilities.map((facility) => {
                      const cellBookings = getCellBookings(facility._id, slot);
                      const maxUnits = facilityCapacity(facility);
                      const slotBookedUnits = cellBookings.reduce((sum, booking) => {
                        if (!activeStatusSet.has(String(booking.status || '').toLowerCase())) return sum;
                        return sum + Math.max(1, Number(booking.bookedUnits || 1));
                      }, 0);
                      const slotAvailableUnits = Math.max(0, maxUnits - slotBookedUnits);
                      return (
                        <td key={`${facility._id}_${slot}`} className="px-2 py-2 align-top">
                          {cellBookings.length > 0 ? (
                            <div className="space-y-1">
                              {cellBookings.slice(0, 2).map((booking) => (
                                <div
                                  key={booking._id}
                                  className={`rounded border px-2 py-1 text-xs ${
                                    ['pending', 'confirmed', 'booked'].includes(booking.status)
                                      ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-100'
                                      : booking.status === 'completed'
                                        ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                                        : 'border-red-400/40 bg-red-500/20 text-red-100'
                                  }`}
                                >
                                  <p className="font-semibold">{booking.customerName}</p>
                                  {booking.customerPhone && <p>{booking.customerPhone}</p>}
                                  {maxUnits > 1 && (
                                    <p>{Math.max(1, Number(booking.bookedUnits || 1))} court(s)</p>
                                  )}
                                  <p>{toDisplayTime(booking.startTime)} - {toDisplayTime(booking.endTime)}</p>
                                </div>
                              ))}
                              {maxUnits > 1 && (
                                <div className="text-[11px] text-emerald-300">
                                  Available: {slotAvailableUnits}/{maxUnits} court(s)
                                </div>
                              )}
                              {cellBookings.length > 2 && <div className="text-[11px] text-gray-400">+{cellBookings.length - 2} more</div>}
                            </div>
                          ) : (
                            <div className="rounded border border-white/10 bg-black/10 px-2 py-1 text-xs text-gray-500">
                              {maxUnits > 1 ? `Available: ${maxUnits}/${maxUnits} court(s)` : 'Available'}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">Booking List</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                {['Facility', 'Customer', 'Slot', 'Units', 'Amount', 'Payment', 'Status', 'Action'].map((heading) => (
                  <th key={heading} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {bookings.map((booking) => (
                <tr key={booking._id}>
                  <td className="px-2 py-2 text-sm text-white">{booking.facilityId?.name || '-'}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">
                    <p>{booking.customerName}</p>
                    {booking.customerPhone && <p className="text-xs text-gray-500">{booking.customerPhone}</p>}
                  </td>
                  <td className="px-2 py-2 text-sm text-gray-300">{toDisplayTime(booking.startTime)} - {toDisplayTime(booking.endTime)}</td>
                  <td className="px-2 py-2 text-sm text-gray-300">{Math.max(1, Number(booking.bookedUnits || 1))}</td>
                  <td className="px-2 py-2 text-sm text-white">{formatCurrency(Number(booking.amount || 0))}</td>
                  <td className="px-2 py-2 text-sm uppercase text-gray-300">{booking.paymentStatus}</td>
                  <td className="px-2 py-2 text-sm uppercase text-gray-300">{booking.status}</td>
                  <td className="px-2 py-2 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      {['pending', 'confirmed', 'booked'].includes(booking.status) && (
                        <>
                          <button onClick={() => updateBooking(booking._id, { status: 'completed' })} className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">Complete</button>
                          <button onClick={() => updateBooking(booking._id, { status: 'cancelled' })} className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300">Cancel</button>
                        </>
                      )}
                      {['pending', 'partial'].includes(booking.paymentStatus) && booking.status !== 'cancelled' && (
                        <button onClick={() => updateBooking(booking._id, { paymentStatus: 'paid' })} className="rounded bg-indigo-500/20 px-2 py-1 text-xs text-indigo-200">Mark Paid</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!bookings.length && (
                <tr><td colSpan={8} className="px-2 py-3 text-center text-sm text-gray-400">No bookings for selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCustomerDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-gray-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Select Customer</h3>
              <button
                type="button"
                onClick={() => setShowCustomerDialog(false)}
                className="rounded bg-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/20"
              >
                Close
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-400">Choose existing customer/member for this mobile, or continue as new customer.</p>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded border border-white/10 bg-black/30 p-2">
              {customerMatches.map((customer) => (
                <button
                  type="button"
                  key={customer._id}
                  onClick={() => selectCustomerOption(customer)}
                  className="block w-full rounded border border-white/10 px-2 py-2 text-left text-xs text-gray-200 hover:bg-white/10"
                >
                  <p className="font-semibold text-white">{customer.name || '-'}</p>
                  <p>{customer.phone || '-'} {customer.email ? `| ${customer.email}` : ''}</p>
                  <p className="text-[10px] text-indigo-200">
                    {customer.source === 'member'
                      ? `Member ${customer.memberCode ? `(${customer.memberCode})` : ''}`
                      : `Customer ${customer.customerCode ? `(${customer.customerCode})` : ''}`}
                  </p>
                </button>
              ))}
              {!customerMatches.length && <p className="text-xs text-gray-400">No matches found.</p>}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCustomerDialog(false)}
                className="rounded bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30"
              >
                Continue As New Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
