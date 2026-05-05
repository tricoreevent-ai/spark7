const API_URL = process.env.SARVA_API_URL || 'http://localhost:3000/api';
const EMAIL = process.env.SARVA_SEED_EMAIL || 'default.accounting.admin@example.com';
const PASSWORD = process.env.SARVA_SEED_PASSWORD || 'Sarva@12345';
const TENANT_SLUG = process.env.SARVA_TENANT_SLUG || 'default';
const TAG = '[manual-api-seed-2026-04-22]';
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';

const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const includesText = (value, fragment) => String(value || '').toLowerCase().includes(String(fragment || '').toLowerCase());
const round2 = (value) => Number(Number(value || 0).toFixed(2));
const now = new Date();
const todayDate = now.toISOString().slice(0, 10);
const todayIso = `${todayDate}T10:00:00+05:30`;
const currentMonth = todayDate.slice(0, 7);

class ApiClient {
  constructor() {
    this.token = '';
    this.created = 0;
    this.skipped = 0;
    this.touched = [];
  }

  async login() {
    const payload = await this.request('POST', '/auth/login', {
      body: {
        email: EMAIL,
        password: PASSWORD,
        tenantSlug: TENANT_SLUG,
      },
      auth: false,
    });
    if (!payload?.token) {
      throw new Error(`Login did not return token: ${JSON.stringify(payload)}`);
    }
    this.token = payload.token;
    console.log(`Logged in as ${payload?.user?.email || EMAIL} for tenant ${payload?.tenant?.slug || TENANT_SLUG}`);
    return payload;
  }

  async request(method, path, options = {}) {
    const query = options.query
      ? `?${new URLSearchParams(
          Object.entries(options.query).filter(([, value]) => value !== undefined && value !== null && value !== '')
        ).toString()}`
      : '';
    const url = `${API_URL}${path}${query}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.auth === false || !this.token ? {} : { Authorization: `Bearer ${this.token}` }),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    const expectedStatuses = options.okStatuses || [200, 201];
    if (!expectedStatuses.includes(response.status)) {
      const errorMessage =
        (payload && typeof payload === 'object' && (payload.error || payload.message))
        || text
        || `HTTP ${response.status}`;
      throw new Error(`${method} ${path} failed (${response.status}): ${errorMessage}`);
    }

    return payload;
  }

  async getArray(path, query) {
    const payload = await this.request('GET', path, { query, okStatuses: [200] });
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  note(action, label, detail) {
    this.touched.push({ action, label, detail });
    if (action === 'created') this.created += 1;
    if (action === 'skipped') this.skipped += 1;
    console.log(`${action === 'created' ? 'CREATE' : 'SKIP  '} ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const api = new ApiClient();

function rowLabel(primary, secondary) {
  return secondary ? `${primary} / ${secondary}` : String(primary || '');
}

async function ensureCustomer(input) {
  const byPhone = input.phone
    ? await api.request('GET', `/customers/by-phone/${String(input.phone)}`, { okStatuses: [200] })
    : null;
  if (byPhone?.data) {
    api.note('skipped', 'customer', `${input.name} (${input.phone})`);
    return byPhone.data;
  }

  const rows = await api.getArray('/customers', { q: input.name, limit: 50 });
  const existing = rows.find((row) => sameText(row.name, input.name));
  if (existing) {
    api.note('skipped', 'customer', `${input.name}`);
    return existing;
  }

  const created = await api.request('POST', '/customers', { body: input });
  api.note('created', 'customer', `${input.name}`);
  return created.data;
}

async function ensureFacility(input) {
  const rows = await api.getArray('/facilities');
  const existing = rows.find((row) => sameText(row.name, input.name));
  if (existing) {
    api.note('skipped', 'facility', input.name);
    return existing;
  }

  const created = await api.request('POST', '/facilities', {
    body: {
      ...input,
      imageUrl: TRANSPARENT_PNG,
    },
  });
  api.note('created', 'facility', input.name);
  return created.data;
}

async function ensureProduct(input) {
  const rows = await api.getArray('/products', { q: input.sku, limit: 50 });
  const existing = rows.find((row) => sameText(row.sku, input.sku));
  if (existing) {
    api.note('skipped', 'product', `${input.name} (${input.sku})`);
    if (Number(existing.stock || 0) < Number(input.stock || 0)) {
      await api.request('POST', '/inventory', {
        body: {
          productId: existing._id,
          quantity: Number(input.stock || 0),
          warehouseLocation: 'Main Store',
          batchNumber: `${input.sku}-OPEN`,
          adjustmentReason: `${TAG} opening stock sync`,
        },
      });
    }
    return existing;
  }

  const created = await api.request('POST', '/products', { body: input });
  api.note('created', 'product', `${input.name} (${input.sku})`);
  return created.data;
}

async function ensureEmployee(input) {
  const rows = await api.getArray('/employees');
  const existing = rows.find((row) => sameText(row.employeeCode, input.employeeCode));
  if (existing) {
    api.note('skipped', 'employee', `${input.employeeCode} ${input.name}`);
    return existing;
  }

  const created = await api.request('POST', '/employees', { body: input });
  api.note('created', 'employee', `${input.employeeCode} ${input.name}`);
  return created.data;
}

async function ensureSupplier(input) {
  const rows = await api.getArray('/suppliers', { q: input.name, limit: 50 });
  const existing = rows.find((row) => sameText(row.name, input.name));
  if (existing) {
    api.note('skipped', 'supplier', input.name);
    return existing;
  }

  const created = await api.request('POST', '/suppliers', { body: input });
  api.note('created', 'supplier', input.name);
  return created.data;
}

async function ensureVendor(input) {
  const rows = await api.getArray('/accounting/vendors');
  const existing = rows.find((row) => sameText(row.name, input.name));
  if (existing) {
    api.note('skipped', 'vendor', input.name);
    return existing;
  }

  const created = await api.request('POST', '/accounting/vendors', { body: input });
  api.note('created', 'vendor', input.name);
  return created.data;
}

async function ensureOpeningBalances() {
  const status = await api.request('GET', '/accounting/opening-balances/status', { okStatuses: [200] });
  if (status?.data?.initializedAt || status?.data?.isLocked) {
    api.note('skipped', 'opening-balances', status?.data?.initializedAt ? 'already initialized' : 'locked');
    return status.data;
  }

  const created = await api.request('POST', '/accounting/opening-balances', {
    body: {
      openingDate: '2026-04-01',
      cashAmount: 25000,
      cashSide: 'debit',
      bankAmount: 180000,
      bankSide: 'debit',
      openingStockValue: 52000,
      openingStockSide: 'debit',
      customerAccounts: [{ name: 'Sunrise Sports School', amount: 15000, side: 'debit' }],
      supplierAccounts: [{ name: 'Bright Power Services', amount: 7000, side: 'credit' }],
      lockAfterSave: true,
    },
  });
  api.note('created', 'opening-balances', 'cash/bank/stock/customer/supplier');
  return created.data;
}

async function ensureFacilityBooking({ facilityId, customerId, customerName, customerPhone, customerEmail }) {
  const rows = await api.getArray('/facilities/bookings/list', {
    customerPhone,
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  });
  const existing = rows.find(
    (row) => sameText(row.customerPhone, customerPhone) && sameText(row.notes, `${TAG} Facility Booking`)
  );
  if (existing) {
    api.note('skipped', 'facility-booking', rowLabel(existing.bookingNumber || existing._id, customerName));
    return existing;
  }

  const created = await api.request('POST', '/facilities/bookings', {
    body: {
      facilityId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      startTime: '2026-04-10T18:00:00+05:30',
      endTime: '2026-04-10T19:00:00+05:30',
      totalAmount: 600,
      paidAmount: 600,
      advanceAmount: 600,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'confirmed',
      bookedUnits: 1,
      notes: `${TAG} Facility Booking`,
      remarks: 'Weekend coaching slot.',
    },
  });
  api.note('created', 'facility-booking', rowLabel(created?.data?.bookingNumber || created?.data?._id, customerName));
  return created.data;
}

async function ensureEventQuotation({ facilityIds }) {
  const rows = await api.getArray('/events/quotations', { q: 'State Badminton Camp', limit: 50 });
  const existing = rows.find(
    (row) => sameText(row.eventName, 'State Badminton Camp') && sameText(row.organizerName, 'Kerala Shuttle Academy')
  );
  if (existing) {
    api.note('skipped', 'event-quotation', existing.quoteNumber || existing._id);
    return existing;
  }

  const created = await api.request('POST', '/events/quotations', {
    body: {
      eventName: 'State Badminton Camp',
      organizerName: 'Kerala Shuttle Academy',
      organizationName: 'Kerala Shuttle Academy',
      contactPhone: '9847012345',
      contactEmail: 'academy@example.com',
      facilityIds,
      quoteStatus: 'sent',
      discountType: 'percentage',
      discountValue: 10,
      gstRate: 18,
      validUntil: '2026-04-30',
      occurrences: [
        { occurrenceDate: '2026-05-10', startTime: '2026-05-10T09:00:00+05:30', endTime: '2026-05-10T13:00:00+05:30' },
        { occurrenceDate: '2026-05-11', startTime: '2026-05-11T09:00:00+05:30', endTime: '2026-05-11T13:00:00+05:30' },
        { occurrenceDate: '2026-05-12', startTime: '2026-05-12T09:00:00+05:30', endTime: '2026-05-12T13:00:00+05:30' },
      ],
      items: [
        {
          itemType: 'facility',
          facilityId: facilityIds[0],
          description: 'Court 1 rental',
          quantity: 12,
          unitLabel: 'hours',
          unitPrice: 500,
          discountType: 'percentage',
          discountValue: 0,
          notes: `${TAG} Court 1 line`,
        },
        {
          itemType: 'facility',
          facilityId: facilityIds[1],
          description: 'Court 2 rental',
          quantity: 12,
          unitLabel: 'hours',
          unitPrice: 500,
          discountType: 'percentage',
          discountValue: 0,
          notes: `${TAG} Court 2 line`,
        },
      ],
      termsAndConditions: 'Sports complex discipline and damage charges apply.',
      notes: `${TAG} Event quotation sample`,
    },
  });
  api.note('created', 'event-quotation', created?.data?.quoteNumber || 'State Badminton Camp');
  return created.data;
}

async function ensureEventBooking({ facilityIds }) {
  const rows = await api.getArray('/events/bookings/list', { q: 'Summer Shuttle League', limit: 50 });
  const existing = rows.find(
    (row) => sameText(row.eventName, 'Summer Shuttle League') && sameText(row.organizerName, 'Metro Sports Club')
  );
  if (existing) {
    api.note('skipped', 'event-booking', existing.eventNumber || existing._id);
    return existing;
  }

  const created = await api.request('POST', '/events/bookings', {
    body: {
      eventName: 'Summer Shuttle League',
      organizerName: 'Metro Sports Club',
      organizationName: 'Metro Sports Club',
      contactPhone: '9895012345',
      contactEmail: 'events@metrosports.in',
      facilityIds,
      status: 'confirmed',
      totalAmount: 18000,
      advanceAmount: 5000,
      paidAmount: 5000,
      paymentMethod: 'bank_transfer',
      advancePaymentMethod: 'bank_transfer',
      remarks: `${TAG} Inter-club doubles tournament.`,
      occurrences: [
        { occurrenceDate: '2026-05-01', startTime: '2026-05-01T09:00:00+05:30', endTime: '2026-05-01T18:00:00+05:30' },
        { occurrenceDate: '2026-05-02', startTime: '2026-05-02T09:00:00+05:30', endTime: '2026-05-02T18:00:00+05:30' },
        { occurrenceDate: '2026-05-03', startTime: '2026-05-03T09:00:00+05:30', endTime: '2026-05-03T18:00:00+05:30' },
      ],
    },
  });
  api.note('created', 'event-booking', created?.data?.eventNumber || 'Summer Shuttle League');
  return created.data;
}

async function ensureSalesQuote({ customerId, items }) {
  const rows = await api.getArray('/quotes', { q: 'Rising Stars Academy', limit: 50 });
  const existing = rows.find((row) => sameText(row.customerName, 'Rising Stars Academy'));
  if (existing) {
    api.note('skipped', 'sales-quote', existing.quoteNumber || existing._id);
    return existing;
  }

  const created = await api.request('POST', '/quotes', {
    body: {
      customerId,
      customerName: 'Rising Stars Academy',
      customerPhone: '9846011122',
      customerEmail: 'vivek.joseph@example.com',
      contactPerson: 'Vivek Joseph',
      validUntil: '2026-04-30',
      pricingMode: 'retail',
      taxMode: 'exclusive',
      isGstBill: true,
      quoteStatus: 'sent',
      notes: `${TAG} Delivery within 5 working days.`,
      items: [
        { productId: items.teamJersey._id, quantity: 30, unitPrice: Number(items.teamJersey.price || 850) },
        { productId: items.practiceConeSet._id, quantity: 6, unitPrice: Number(items.practiceConeSet.price || 650) },
      ],
    },
  });
  api.note('created', 'sales-quote', created?.data?.quoteNumber || 'Rising Stars Academy');
  return created.data;
}

async function ensureSale({ label, body, customerPhone }) {
  const rows = await api.getArray('/sales', { customerPhone, limit: 100 });
  const existing = rows.find(
    (row) => includesText(row.notes, TAG) && sameText(row.customerPhone, customerPhone) && sameText(row.invoiceType, body.invoiceType || 'cash')
  );
  if (existing) {
    api.note('skipped', 'sale', `${label} (${existing.invoiceNumber || existing.saleNumber || existing._id})`);
    return existing;
  }

  const created = await api.request('POST', '/sales', { body });
  api.note('created', 'sale', `${label} (${created?.data?.invoiceNumber || created?.data?.saleNumber || created?.data?._id})`);
  return created.data;
}

async function ensureReturn({ sale, shuttleProduct }) {
  const rows = await api.getArray('/returns', { saleId: sale._id, limit: 50 });
  let existing = rows.find((row) => sameText(row.reason, 'Damaged seal'));
  if (!existing) {
    const created = await api.request('POST', '/returns', {
      body: {
        saleId: sale._id,
        sourceInvoiceNumber: sale.invoiceNumber,
        customerId: sale.customerId,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        customerEmail: sale.customerEmail,
        refundMethod: 'original_payment',
        reason: 'Damaged seal',
        notes: `${TAG} Sales return sample`,
        items: [
          {
            productId: shuttleProduct._id,
            returnQuantity: 2,
            returnReason: 'Damaged seal',
          },
        ],
      },
    });
    existing = created.data;
    api.note('created', 'sales-return', existing.returnNumber || existing._id);
  } else {
    api.note('skipped', 'sales-return', existing.returnNumber || existing._id);
  }

  if (!sameText(existing.returnStatus, 'approved')) {
    const approved = await api.request('PUT', `/returns/${existing._id}/approve`, {
      body: {
        refundStatus: 'completed',
        processDirectRefund: true,
        qualityCheck: { status: 'passed', notes: `${TAG} quality passed` },
      },
    });
    api.note('created', 'sales-return-approval', approved?.data?.returnNumber || existing.returnNumber || existing._id);
    return approved.data;
  }

  api.note('skipped', 'sales-return-approval', existing.returnNumber || existing._id);
  return existing;
}

async function ensureMembershipPlan({ facilityIds }) {
  const rows = await api.getArray('/memberships/plans');
  const existing = rows.find((row) => sameText(row.name, 'Monthly Badminton Prime'));
  if (existing) {
    api.note('skipped', 'membership-plan', existing.name);
    return existing;
  }

  const created = await api.request('POST', '/memberships/plans', {
    body: {
      name: 'Monthly Badminton Prime',
      description: `${TAG} Evening access with member discounts`,
      planType: 'paid',
      status: 'active',
      billingCycle: 'monthly',
      durationDays: 30,
      gracePeriodDays: 5,
      trialPeriodDays: 0,
      price: 2500,
      bookingDiscountPercentage: 10,
      pointsPerCurrency: 1,
      pointsRedemptionValue: 100,
      minimumRedeemPoints: 100,
      autoRenew: true,
      facilityIds,
      active: true,
    },
  });
  api.note('created', 'membership-plan', 'Monthly Badminton Prime');
  return created.data;
}

async function ensureMembershipSubscription({ planId }) {
  const rows = await api.getArray('/memberships/subscriptions', { q: '9895123456' });
  let existing = rows.find((row) => sameText(row.phone, '9895123456'));
  if (!existing) {
    const created = await api.request('POST', '/memberships/subscriptions', {
      body: {
        memberName: 'Sreya Thomas',
        fullName: 'Sreya Thomas',
        phone: '9895123456',
        email: 'sreya@example.com',
        dateOfBirth: '2001-08-14',
        address: 'Kadavanthra, Kochi',
        planId,
        startDate: '2026-04-08',
        amountPaid: 2500,
        validityReminderDays: 7,
        notes: `${TAG} Student discount approved.`,
      },
    });
    existing = created.data;
    api.note('created', 'membership-subscription', existing.memberCode || existing._id);
  } else {
    api.note('skipped', 'membership-subscription', existing.memberCode || existing._id);
  }

  const renewalHistory = Array.isArray(existing.renewalHistory) ? existing.renewalHistory : [];
  const alreadyRenewed = renewalHistory.some((row) => Number(row.amountPaid || 0) === 2500 && includesText(row.notes, TAG));
  if (!alreadyRenewed) {
    const renewed = await api.request('POST', `/memberships/subscriptions/${existing._id}/renew`, {
      body: {
        renewalType: 'manual',
        amountPaid: 2500,
        notes: `${TAG} Renewed at front desk.`,
      },
    });
    api.note('created', 'membership-renewal', renewed?.data?.memberCode || existing.memberCode || existing._id);
    return renewed.data;
  }

  api.note('skipped', 'membership-renewal', existing.memberCode || existing._id);
  return existing;
}

async function ensureSelfAttendance() {
  const status = await api.request('GET', '/attendance/self', { okStatuses: [200] });
  if (status?.data?.entry?.checkOut) {
    api.note('skipped', 'self-attendance', 'today already checked out');
    return status.data.entry;
  }

  const location = {
    latitude: 10.0159,
    longitude: 76.3419,
    accuracyMeters: 20,
  };

  if (!status?.data?.entry?.checkIn) {
    await api.request('POST', '/attendance/self/check-in', { body: location });
  }

  const checkedOut = await api.request('POST', '/attendance/self/check-out', { body: location });
  api.note('created', 'self-attendance', `${todayDate} check-in/check-out`);
  return checkedOut.data?.entry;
}

async function ensureManualAttendance(employeeId, date, payload) {
  const entries = await api.getArray('/attendance/entries', { employeeId, month: date.slice(0, 7) });
  const existing = entries.find(
    (row) => String(row.employeeId?._id || row.employeeId) === String(employeeId) && sameText(row.dateKey, date)
  );
  if (
    existing
    && sameText(existing.status, payload.status)
    && String(existing.checkIn || '') === String(payload.checkIn || '')
    && String(existing.checkOut || '') === String(payload.checkOut || '')
  ) {
    return existing;
  }

  const saved = await api.request('POST', '/attendance/mark', {
    body: {
      employeeId,
      date,
      ...payload,
    },
  });
  return saved.data;
}

async function seedPayrollAttendance(employeeId) {
  const entries = [];
  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-04-${String(day).padStart(2, '0')}`;
    const entry = await ensureManualAttendance(employeeId, date, {
      status: 'present',
      checkIn: '09:00',
      checkOut: '18:00',
      overtimeHours: day % 6 === 0 ? 0.5 : 0,
      notes: `${TAG} payroll seed`,
    });
    entries.push(entry);
  }
  api.note('created', 'attendance-bulk', `seeded payroll attendance for 2026-04 (${entries.length} days)`);
  return entries;
}

async function ensureSalaryPayment(input) {
  const rows = await api.getArray('/accounting/salary', { limit: 200 });
  const existing = rows.find(
    (row) => String(row.employeeId || '') === String(input.employeeId || '') && sameText(row.month, input.month) && sameText(String(row.payDateKey || ''), input.payDate)
  );
  if (existing) {
    api.note('skipped', 'salary-payment', `${input.month} ${input.employeeName || input.employeeId}`);
    return existing;
  }

  const created = await api.request('POST', '/accounting/salary', { body: input });
  api.note('created', 'salary-payment', `${input.month} ${input.employeeName || input.employeeId}`);
  return created.data;
}

async function ensureContractPayment(input) {
  const rows = await api.getArray('/accounting/contracts', { limit: 200 });
  const existing = rows.find((row) => sameText(row.contractorName, input.contractorName) && sameText(row.contractTitle, input.contractTitle));
  if (existing) {
    api.note('skipped', 'contract-payment', input.contractTitle);
    return existing;
  }

  const created = await api.request('POST', '/accounting/contracts', { body: input });
  api.note('created', 'contract-payment', input.contractTitle);
  return created.data;
}

async function ensureDayBookEntry(input) {
  const rows = await api.getArray('/accounting/day-book/entries', { limit: 300 });
  const existing = rows.find((row) => sameText(row.referenceNo, input.referenceNo));
  if (existing) {
    api.note('skipped', 'day-book-entry', input.referenceNo);
    return existing;
  }

  const created = await api.request('POST', '/accounting/day-book/entry', { body: input });
  api.note('created', 'day-book-entry', input.referenceNo);
  return created.data;
}

async function ensureVoucher(path, voucherType, referenceNo, body) {
  const rows = await api.getArray('/accounting/vouchers', { voucherType, limit: 200 });
  const existing = rows.find((row) => sameText(row.referenceNo, referenceNo));
  if (existing) {
    api.note('skipped', `${voucherType}-voucher`, referenceNo);
    return existing;
  }

  const created = await api.request('POST', path, { body });
  api.note('created', `${voucherType}-voucher`, referenceNo);
  return created.data;
}

async function ensureChartAccount(input) {
  const rows = await api.getArray('/accounting/chart-accounts');
  const existing = rows.find((row) => sameText(row.accountName, input.accountName) || sameText(row.accountCode, input.accountCode));
  if (existing) {
    api.note('skipped', 'chart-account', input.accountName);
    return existing;
  }

  const created = await api.request('POST', '/accounting/chart-accounts', { body: input });
  api.note('created', 'chart-account', input.accountName);
  return created.data;
}

async function ensureAccountingInvoice(input) {
  const rows = await api.getArray('/accounting/invoices', { q: input.customerName, limit: 200 });
  const existing = rows.find((row) => sameText(row.customerName, input.customerName) && includesText(row.description, TAG));
  if (existing) {
    api.note('skipped', 'accounting-invoice', existing.invoiceNumber || existing._id);
    return existing;
  }

  const created = await api.request('POST', '/accounting/invoices', { body: input });
  api.note('created', 'accounting-invoice', created?.data?.invoice?.invoiceNumber || created?.data?.invoiceNumber || created?.data?._id || input.customerName);
  return created.data?.invoice || created.data;
}

async function ensureExpense(input) {
  const rows = await api.getArray('/accounting/expenses', { limit: 200 });
  const existing = rows.find((row) => sameText(row.description, input.description));
  if (existing) {
    api.note('skipped', 'vendor-bill', input.description);
    return existing;
  }

  const created = await api.request('POST', '/accounting/expenses', { body: input });
  api.note('created', 'vendor-bill', input.description);
  return created.data;
}

async function ensureSettlementReceipt(input) {
  const rows = await api.getArray('/settlements/receipts', { limit: 200 });
  const existing = rows.find((row) => sameText(row.customerName, input.customerName) && includesText(row.notes, TAG));
  if (existing) {
    api.note('skipped', 'settlement-receipt', existing.voucherNumber || existing._id);
    return existing;
  }

  const created = await api.request('POST', '/settlements/receipts', { body: input });
  api.note('created', 'settlement-receipt', created?.data?.voucherNumber || created?.data?._id);
  return created.data;
}

async function ensureCreditNote(input) {
  const rows = await api.getArray('/credit-notes', { customerName: input.customerName, limit: 100 });
  const existing = rows.find((row) => sameText(row.reason, input.reason) && includesText(row.notes, TAG));
  if (existing) {
    api.note('skipped', 'credit-note', existing.noteNumber || existing._id);
    return existing;
  }

  const created = await api.request('POST', '/credit-notes', { body: input });
  api.note('created', 'credit-note', created?.data?.noteNumber || created?.data?._id);
  return created.data;
}

async function ensureDayEndClosing(input) {
  const created = await api.request('POST', '/settlements/day-end/close', { body: input });
  api.note('created', 'day-end-closing', input.businessDate || todayDate);
  return created.data;
}

async function ensurePurchaseOrder(input) {
  const rows = await api.getArray('/purchases', { limit: 100, supplierId: input.supplierId });
  const existing = rows.find((row) => includesText(row.notes, TAG));
  if (existing) {
    api.note('skipped', 'purchase-order', existing.purchaseNumber || existing._id);
    return existing;
  }

  const created = await api.request('POST', '/purchases', { body: input });
  api.note('created', 'purchase-order', created?.data?.purchaseNumber || created?.data?._id);
  return created.data;
}

async function ensurePurchaseReceipt(po, shuttleProductId) {
  const line = Array.isArray(po.items) ? po.items.find((item) => String(item.productId) === String(shuttleProductId)) : null;
  if (line && Number(line.receivedQuantity || 0) >= 40) {
    api.note('skipped', 'purchase-receipt', po.purchaseNumber || po._id);
    return po;
  }

  const updated = await api.request('PUT', `/purchases/${po._id}/receive`, {
    body: {
      items: [
        {
          productId: shuttleProductId,
          receivedQuantity: 40,
          warehouseLocation: 'Main Store',
          batchNumber: 'SH-APR-26-A',
          expiryDate: '2027-04-01',
        },
      ],
    },
  });
  api.note('created', 'purchase-receipt', po.purchaseNumber || po._id);
  return updated.data;
}

async function ensurePurchaseReturn(po, replacementNetId) {
  const line = Array.isArray(po.items) ? po.items.find((item) => String(item.productId) === String(replacementNetId)) : null;
  if (line && Number(line.receivedQuantity || 0) === 0) {
    api.note('skipped', 'purchase-return', po.purchaseNumber || po._id);
    return po;
  }

  const updated = await api.request('PUT', `/purchases/${po._id}/return`, {
    body: {
      reason: 'Damaged stitching from supplier pack',
      items: [
        {
          productId: replacementNetId,
          quantity: 1,
        },
      ],
    },
  });
  api.note('created', 'purchase-return', po.purchaseNumber || po._id);
  return updated.data;
}

async function ensurePayrollArrear(input) {
  const rows = await api.getArray('/payroll/arrears', { employeeId: input.employeeId, payoutMonth: input.payoutMonth });
  const existing = rows.find((row) => sameText(row.effectiveMonth, input.effectiveMonth));
  if (existing) {
    api.note('skipped', 'payroll-arrear', `${existing.employeeCode}:${existing.payoutMonth}`);
    return existing;
  }

  const created = await api.request('POST', '/payroll/arrears', { body: input });
  api.note('created', 'payroll-arrear', `${created?.data?.employeeCode || ''}:${created?.data?.payoutMonth || input.payoutMonth}`);
  return created.data;
}

async function ensurePayrollChallan(input) {
  const rows = await api.getArray('/payroll/challans', { challanType: input.challanType, periodKey: input.month });
  const existing = rows.find((row) => sameText(row.periodKey, input.month) && sameText(row.challanType, input.challanType));
  if (existing) {
    api.note('skipped', 'payroll-challan', `${input.challanType}:${input.month}`);
    return existing;
  }

  const created = await api.request('POST', '/payroll/challans/generate', { body: input });
  api.note('created', 'payroll-challan', `${input.challanType}:${input.month}`);
  return created.data;
}

async function ensureForm16(input) {
  const rows = await api.getArray('/payroll/form16', { financialYear: input.financialYear, employeeId: input.employeeId });
  if (rows.length > 0) {
    api.note('skipped', 'form16', `${input.financialYear}:${input.employeeId}`);
    return rows[0];
  }

  const created = await api.request('POST', '/payroll/form16/generate', { body: input });
  const row = Array.isArray(created?.data) ? created.data[0] : created.data;
  api.note('created', 'form16', `${input.financialYear}:${input.employeeId}`);
  return row;
}

async function ensureFullFinalSettlement(input) {
  const rows = await api.getArray('/payroll/settlements', { employeeId: input.employeeId });
  const existing = rows.find((row) => sameText(String(row.terminationDate || '').slice(0, 10), input.terminationDate));
  if (existing) {
    api.note('skipped', 'full-final-settlement', `${existing.employeeCode}:${input.terminationDate}`);
    return existing;
  }

  const created = await api.request('POST', '/payroll/settlements', { body: input });
  api.note('created', 'full-final-settlement', `${created?.data?.employeeCode || ''}:${input.terminationDate}`);
  return created.data;
}

async function getTreasuryDefaults() {
  const rows = await api.getArray('/accounting/treasury/accounts');
  const cash = rows.find((row) => String(row.accountType || '').toLowerCase().includes('cash'));
  const bank = rows.find((row) => String(row.accountType || '').toLowerCase() === 'bank');
  if (!cash || !bank) {
    throw new Error('Treasury defaults were not found. Please open the accounting treasury page once and ensure defaults exist.');
  }
  return { cash, bank };
}

async function printCounts() {
  const checks = [
    ['accounting invoices', '/accounting/invoices'],
    ['accounting payments', '/accounting/payments'],
    ['vendors', '/accounting/vendors'],
    ['salary payments', '/accounting/salary'],
    ['contract payments', '/accounting/contracts'],
    ['day-book entries', '/accounting/day-book/entries'],
    ['vouchers', '/accounting/vouchers'],
    ['sales', '/sales'],
    ['returns', '/returns'],
    ['sales quotes', '/quotes'],
    ['membership plans', '/memberships/plans'],
    ['membership subscriptions', '/memberships/subscriptions'],
    ['settlement receipts', '/settlements/receipts'],
    ['credit notes', '/credit-notes'],
    ['purchase orders', '/purchases'],
    ['suppliers', '/suppliers'],
    ['customers', '/customers'],
    ['facilities', '/facilities'],
    ['products', '/products'],
    ['employees', '/employees'],
  ];

  console.log('\nRecord counts after seeding:');
  for (const [label, path] of checks) {
    try {
      const rows = await api.getArray(path, { limit: 500 });
      console.log(`- ${label}: ${rows.length}`);
    } catch (error) {
      console.log(`- ${label}: error (${error.message})`);
    }
  }
}

async function main() {
  await api.login();

  const treasury = await getTreasuryDefaults();

  const rahul = await ensureCustomer({
    name: 'Rahul Menon',
    phone: '9876543210',
    email: 'rahul@example.com',
    customerCategory: 'individual',
    accountType: 'cash',
    notes: `${TAG} facility booking customer`,
  });
  const anjali = await ensureCustomer({
    name: 'Anjali Nair',
    phone: '9847001122',
    email: 'anjali@example.com',
    customerCategory: 'individual',
    accountType: 'cash',
    notes: `${TAG} sales customer`,
  });
  const risingStars = await ensureCustomer({
    name: 'Rising Stars Academy',
    phone: '9846011122',
    email: 'vivek.joseph@example.com',
    customerCategory: 'corporate',
    accountType: 'credit',
    creditLimit: 100000,
    creditDays: 30,
    notes: `${TAG} sales quotation customer`,
  });
  const sunrise = await ensureCustomer({
    name: 'Sunrise Sports School',
    phone: '9846111100',
    email: 'billing@sunrisesports.example.com',
    customerCategory: 'corporate',
    accountType: 'credit',
    creditLimit: 150000,
    creditDays: 30,
    notes: `${TAG} accounting and settlement customer`,
  });

  const badmintonCourt2 = await ensureFacility({
    name: 'Badminton Court 2',
    type: 'badminton_court',
    location: 'Indoor Arena',
    hourlyRate: 600,
    capacity: 8,
    description: `${TAG} weekend coaching slot court`,
    active: true,
  });
  const court1 = await ensureFacility({
    name: 'Court 1',
    type: 'badminton_court',
    location: 'Indoor Arena',
    hourlyRate: 500,
    capacity: 8,
    description: `${TAG} event court 1`,
    active: true,
  });
  const court2 = await ensureFacility({
    name: 'Court 2',
    type: 'badminton_court',
    location: 'Indoor Arena',
    hourlyRate: 500,
    capacity: 8,
    description: `${TAG} event court 2`,
    active: true,
  });

  const yonexShuttle = await ensureProduct({
    name: 'Yonex Mavis 350 Shuttle',
    sku: 'YONEX-M350',
    category: 'Shuttle',
    price: 360,
    cost: 250,
    gstRate: 12,
    stock: 80,
    openingStockValue: 20000,
    minStock: 10,
    unit: 'tube',
    hsnCode: '950669',
    description: `${TAG} sales + procurement sample`,
  });
  const badmintonGrip = await ensureProduct({
    name: 'Badminton Grip',
    sku: 'BAD-GRIP-001',
    category: 'Accessories',
    price: 80,
    cost: 40,
    gstRate: 12,
    stock: 60,
    openingStockValue: 2400,
    minStock: 10,
    unit: 'piece',
    hsnCode: '950699',
    description: `${TAG} sales sample`,
  });
  const teamJersey = await ensureProduct({
    name: 'Team Jersey',
    sku: 'TEAM-JERSEY-001',
    category: 'Apparel',
    price: 850,
    cost: 500,
    gstRate: 12,
    stock: 100,
    openingStockValue: 50000,
    minStock: 10,
    unit: 'piece',
    hsnCode: '610990',
    description: `${TAG} quotation sample`,
  });
  const practiceConeSet = await ensureProduct({
    name: 'Practice Cone Set',
    sku: 'CONE-SET-001',
    category: 'Training',
    price: 650,
    cost: 350,
    gstRate: 12,
    stock: 40,
    openingStockValue: 14000,
    minStock: 5,
    unit: 'set',
    hsnCode: '950699',
    description: `${TAG} quotation sample`,
  });
  const replacementNet = await ensureProduct({
    name: 'Replacement Net',
    sku: 'NET-REP-001',
    category: 'Court Equipment',
    price: 1200,
    cost: 950,
    gstRate: 18,
    stock: 5,
    openingStockValue: 4750,
    minStock: 2,
    unit: 'piece',
    hsnCode: '560819',
    description: `${TAG} procurement sample`,
  });

  const nikhil = await ensureEmployee({
    employeeCode: 'EMP-014',
    name: 'Nikhil Raj',
    phone: '9895000014',
    email: 'nikhil.raj@example.com',
    address: 'Kochi',
    designation: 'Accounts Executive',
    pan: 'ABCDE1234F',
    state: 'Kerala',
    employmentType: 'salaried',
    monthlySalary: 22000,
    basicSalary: 11000,
    dearnessAllowance: 2000,
    hra: 5500,
    conveyanceAllowance: 1500,
    specialAllowance: 2000,
    overtimeHourlyRate: 150,
    pfEnabled: true,
    esiEnabled: false,
    professionalTaxEnabled: true,
    professionalTax: 200,
    tdsEnabled: true,
    monthlyTdsOverride: 300,
    paidLeave: true,
    active: true,
    joinDate: '2025-01-01',
  });
  const rakesh = await ensureEmployee({
    employeeCode: 'EMP-015',
    name: 'Rakesh Kumar',
    phone: '9895000015',
    email: EMAIL,
    address: 'Kochi',
    designation: 'Arena Staff',
    pan: 'FGHIJ5678K',
    state: 'Kerala',
    employmentType: 'salaried',
    monthlySalary: 18000,
    basicSalary: 9000,
    dearnessAllowance: 1000,
    hra: 4000,
    conveyanceAllowance: 1000,
    specialAllowance: 3000,
    overtimeHourlyRate: 100,
    pfEnabled: true,
    esiEnabled: false,
    professionalTaxEnabled: true,
    professionalTax: 200,
    tdsEnabled: false,
    monthlyTdsOverride: 0,
    paidLeave: true,
    active: true,
    joinDate: '2025-06-01',
  });
  const manoj = await ensureEmployee({
    employeeCode: 'EMP-099',
    name: 'Manoj Varma',
    phone: '9895000099',
    email: 'manoj.varma@example.com',
    address: 'Kochi',
    designation: 'Support Staff',
    pan: 'KLMNO9012P',
    state: 'Kerala',
    employmentType: 'salaried',
    monthlySalary: 20000,
    basicSalary: 10000,
    dearnessAllowance: 1000,
    hra: 4500,
    conveyanceAllowance: 1000,
    specialAllowance: 3500,
    overtimeHourlyRate: 110,
    pfEnabled: true,
    esiEnabled: false,
    professionalTaxEnabled: true,
    professionalTax: 200,
    tdsEnabled: false,
    monthlyTdsOverride: 0,
    paidLeave: true,
    active: true,
    joinDate: '2024-01-10',
  });

  const aceSupplier = await ensureSupplier({
    name: 'Ace Sports Wholesale',
    contactPerson: 'Sales Desk',
    phone: '9847004455',
    email: 'orders@acesports.example.com',
    address: 'Kochi',
    notes: `${TAG} procurement supplier`,
  });
  const brightPower = await ensureVendor({
    name: 'Bright Power Services',
    contact: 'Arun Das',
    phone: '9846112233',
    email: 'support@brightpower.in',
    address: 'Thrissur Road, Kochi',
    openingBalance: 7000,
    openingSide: 'credit',
  });

  await ensureOpeningBalances();
  await ensureFacilityBooking({
    facilityId: badmintonCourt2._id,
    customerId: rahul._id,
    customerName: rahul.name,
    customerPhone: rahul.phone,
    customerEmail: rahul.email,
  });
  await ensureEventQuotation({ facilityIds: [court1._id, court2._id] });
  await ensureEventBooking({ facilityIds: [court1._id, court2._id] });

  const cashSale = await ensureSale({
    label: 'Anjali cash sale',
    customerPhone: anjali.phone,
    body: {
      customerId: anjali._id,
      customerName: anjali.name,
      customerPhone: anjali.phone,
      customerEmail: anjali.email,
      notes: `${TAG} Counter sale after coaching session`,
      paymentMethod: 'upi',
      invoiceType: 'cash',
      invoiceStatus: 'posted',
      discountAmount: 100,
      paidAmount: 0,
      isGstBill: true,
      items: [
        { productId: yonexShuttle._id, quantity: 10, unitPrice: 360, gstRate: 12 },
        { productId: badmintonGrip._id, quantity: 4, unitPrice: 80, gstRate: 12 },
      ],
    },
  });

  await ensureSalesQuote({ customerId: risingStars._id, items: { teamJersey, practiceConeSet } });
  await ensureReturn({ sale: cashSale, shuttleProduct: yonexShuttle });

  const creditSale = await ensureSale({
    label: 'Sunrise credit sale',
    customerPhone: sunrise.phone,
    body: {
      customerId: sunrise._id,
      customerName: sunrise.name,
      customerPhone: sunrise.phone,
      customerEmail: sunrise.email,
      notes: `${TAG} Outstanding invoice for settlement receipt testing`,
      paymentMethod: 'bank_transfer',
      invoiceType: 'credit',
      invoiceStatus: 'posted',
      paidAmount: 0,
      isGstBill: true,
      dueDate: `${todayDate}T23:59:59+05:30`,
      items: [{ productId: teamJersey._id, quantity: 12, unitPrice: 850, gstRate: 12 }],
    },
  });

  const membershipPlan = await ensureMembershipPlan({ facilityIds: [badmintonCourt2._id] });
  await ensureMembershipSubscription({ planId: membershipPlan._id });

  await ensureSelfAttendance();
  await ensureManualAttendance(rakesh._id, '2026-04-08', {
    status: 'present',
    checkIn: '09:00',
    checkOut: '18:10',
    overtimeHours: 0,
    notes: `${TAG} supervisor correction`,
  });
  await seedPayrollAttendance(nikhil._id);

  await ensureSalaryPayment({
    employeeId: nikhil._id,
    month: '2026-03',
    payDate: '2026-03-31',
    amount: 22000,
    bonusAmount: 0,
    paymentMethod: 'bank',
    employeePf: 1800,
    professionalTax: 200,
    tdsAmount: 300,
    employerPf: 1800,
    notes: `${TAG} March salary for Form 16 seed`,
  });
  await ensureSalaryPayment({
    employeeId: nikhil._id,
    month: currentMonth,
    payDate: `${currentMonth}-30`,
    amount: 22000,
    bonusAmount: 1500,
    paymentMethod: 'bank',
    employeePf: 1800,
    professionalTax: 200,
    tdsAmount: 300,
    employerPf: 1800,
    notes: `${TAG} Festival incentive`,
  });

  await ensureContractPayment({
    contractorName: 'Aqua Tech Solutions',
    contractTitle: 'Pool filtration AMC',
    paymentDate: `${currentMonth}-18`,
    amount: 8000,
    status: 'paid',
    paymentMethod: 'bank_transfer',
    notes: `${TAG} Quarterly maintenance payment`,
  });

  await ensureAccountingInvoice({
    invoiceDate: `${todayDate}T10:00:00+05:30`,
    customerId: sunrise._id,
    customerName: sunrise.name,
    referenceType: 'manual',
    description: `${TAG} Coaching court rental for April week 1`,
    baseAmount: 12000,
    gstAmount: 2160,
    gstRate: 18,
    gstTreatment: 'intrastate',
    paymentAmount: 5000,
    paymentMode: 'bank_transfer',
    revenueAccountKey: 'booking_revenue',
  });

  await ensureExpense({
    expenseDate: todayIso,
    description: `${TAG} LED floodlight repair`,
    amount: 4500,
    paidAmount: 2000,
    paymentMode: 'bank_transfer',
    expenseAccountName: 'Repairs and Maintenance',
    vendorId: brightPower._id,
    vendorName: brightPower.name,
    vendorPhone: brightPower.phone,
  });

  await ensureDayBookEntry({
    entryType: 'expense',
    category: 'Electricity',
    amount: 3250,
    paymentMethod: 'cash',
    entryDate: todayDate,
    referenceNo: 'EB-APR-07',
    narration: `${TAG} Utility cash payment.`,
    treasuryAccountId: treasury.cash._id,
  });
  await ensureDayBookEntry({
    entryType: 'income',
    category: 'Sponsorship',
    amount: 10000,
    paymentMethod: 'bank_transfer',
    entryDate: todayDate,
    referenceNo: 'SP-APR-01',
    narration: `${TAG} Local tournament sponsor contribution.`,
    treasuryAccountId: treasury.bank._id,
  });

  await ensureVoucher('/accounting/vouchers/receipt', 'receipt', 'RCPT-APR-07-01', {
    voucherDate: todayDate,
    amount: 3500,
    category: 'Other Income',
    paymentMode: 'cash',
    referenceNo: 'RCPT-APR-07-01',
    counterpartyName: 'Arena Cafe',
    notes: `${TAG} Stall space fee collection.`,
    treasuryAccountId: treasury.cash._id,
  });
  await ensureVoucher('/accounting/vouchers/payment', 'payment', 'PV-APR-07-03', {
    voucherDate: todayDate,
    amount: 1800,
    category: 'Repairs and Maintenance',
    paymentMode: 'cash',
    referenceNo: 'PV-APR-07-03',
    counterpartyName: 'Petty Cash Expense',
    notes: `${TAG} Plumbing repair at spectator wash area.`,
    treasuryAccountId: treasury.cash._id,
    documentFields: {
      accountName: 'Petty Cash Expense',
      beingPaymentOf: 'Plumbing repair at spectator wash area',
      forPeriod: 'April 2026',
      receivedBy: 'Manoj',
      authorizedBy: 'Admin Desk',
    },
  });

  const prepaidExpenses = await ensureChartAccount({
    accountCode: 'AS-PRPD-001',
    accountName: 'Prepaid Expenses',
    accountType: 'asset',
    subType: 'general',
  });
  const bankChargesPayable = await ensureChartAccount({
    accountCode: 'LI-BCP-001',
    accountName: 'Bank Charges Payable',
    accountType: 'liability',
    subType: 'general',
  });
  await ensureVoucher('/accounting/vouchers/journal', 'journal', 'JV-APR-07-02', {
    voucherDate: todayDate,
    referenceNo: 'JV-APR-07-02',
    notes: `${TAG} Yearly software subscription allocation.`,
    lines: [
      { accountId: prepaidExpenses._id, debit: 2500, credit: 0, narration: 'Prepaid allocation' },
      { accountId: bankChargesPayable._id, debit: 0, credit: 2500, narration: 'Bank charges payable' },
    ],
  });

  await ensureVoucher('/accounting/transfer', 'transfer', 'DEP-APR-07', {
    transferDate: todayDate,
    amount: 15000,
    direction: 'cash_to_bank',
    referenceNo: 'DEP-APR-07',
    notes: `${TAG} Daily cash deposit.`,
    fromTreasuryAccountId: treasury.cash._id,
    toTreasuryAccountId: treasury.bank._id,
  });

  await ensureSettlementReceipt({
    customerId: sunrise._id,
    customerName: sunrise.name,
    amount: 8000,
    mode: 'bank_transfer',
    notes: `${TAG} Part payment against outstanding invoice.`,
    allocations: [{ saleId: creditSale._id, amount: 8000 }],
  });

  await ensureCreditNote({
    customerName: anjali.name,
    customerPhone: anjali.phone,
    customerEmail: anjali.email,
    reason: 'Wrong product billed',
    subtotal: 1200,
    taxAmount: 216,
    totalAmount: 1416,
    sourceSaleId: cashSale._id,
    notes: `${TAG} To be adjusted against next purchase.`,
  });

  await ensureDayEndClosing({
    businessDate: todayDate,
    openingCash: 12000,
    physicalClosingCash: 28450,
    notes: `${TAG} Includes tournament walk-in collections.`,
  });

  const purchaseOrder = await ensurePurchaseOrder({
    supplierId: aceSupplier._id,
    expectedDate: '2026-04-12',
    notes: `${TAG} Restocking before district tournament.`,
    items: [
      { productId: yonexShuttle._id, quantity: 50, unitCost: 720 },
      { productId: replacementNet._id, quantity: 4, unitCost: 950 },
    ],
  });
  const afterReceipt = await ensurePurchaseReceipt(purchaseOrder, yonexShuttle._id);
  await ensurePurchaseReturn(afterReceipt, replacementNet._id);

  await ensurePayrollArrear({
    employeeId: nikhil._id,
    effectiveMonth: '2026-02',
    payoutMonth: currentMonth,
    previousMonthlySalary: 22000,
    revisedMonthlySalary: 24000,
    reason: `${TAG} Salary revision from 2026-02`,
    status: 'approved',
    applyRevision: false,
  });

  await ensurePayrollChallan({
    month: currentMonth,
    challanType: 'pf',
    markPaid: true,
    bankName: 'HDFC Bank',
    paymentDate: todayDate,
    notes: `${TAG} PF challan sample`,
  });

  await ensureForm16({
    financialYear: '2025-26',
    employeeId: nikhil._id,
    notes: `${TAG} Form 16 sample`,
  });

  await ensureFullFinalSettlement({
    employeeId: manoj._id,
    terminationDate: todayDate,
    lastWorkingDate: todayDate,
    settlementDate: todayDate,
    monthlySalary: 20000,
    noticePayDays: 15,
    leaveEncashmentDays: 4,
    recoveries: 500,
    tdsAmount: 0,
    otherEarnings: 1000,
    notes: `${TAG} Full and final settlement sample`,
    status: 'finalized',
    deactivateEmployee: true,
  });

  await printCounts();

  console.log('\nSeed summary:');
  console.log(`- created: ${api.created}`);
  console.log(`- skipped: ${api.skipped}`);
  console.log(`- api url: ${API_URL}`);
  console.log(`- tenant: ${TENANT_SLUG}`);
}

main().catch((error) => {
  console.error('\nSeeding failed.');
  console.error(error);
  process.exitCode = 1;
});
