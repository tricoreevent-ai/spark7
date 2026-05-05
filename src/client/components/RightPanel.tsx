import React, { useEffect, useMemo, useState } from 'react';

type InvoiceType = 'paid_now' | 'pay_later';
type SaveMode = 'finalise' | 'draft';
type TaxMode = 'gst_bill' | 'non_gst_bill';
type RoundOffMode = 'none' | 'nearest_rupee';
type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer';

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  availableCredit: number;
};

const DEMO_CUSTOMERS: CustomerOption[] = [
  { id: 'babu', name: 'Babu', phone: '9731788810', availableCredit: 250 },
];

const SUBTOTAL = 899;
const GST_RATE = 0.18;

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const roundTo2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const parseAmount = (value: string): number => {
  const cleaned = String(value || '').replace(/[^\d.]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value: number): string => currencyFormatter.format(roundTo2(value));

const applyRoundOff = (value: number, mode: RoundOffMode): number => {
  if (mode === 'nearest_rupee') {
    return Math.round(value);
  }
  return roundTo2(value);
};

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
};

const roundOffLabel: Record<RoundOffMode, string> = {
  none: 'No round-off',
  nearest_rupee: 'To nearest 1 rupee',
};

const InfoTooltip: React.FC<{ content: string; label?: string }> = ({ content, label = 'More info' }) => (
  <div className="group relative inline-flex">
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/20"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
        <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 8.2v4.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        <circle cx="10" cy="5.6" r="1" fill="currentColor" />
      </svg>
    </button>
    <div className="pointer-events-none absolute right-0 top-7 z-20 w-72 rounded-xl border border-cyan-400/25 bg-slate-950/95 p-3 text-xs leading-5 text-slate-200 opacity-0 shadow-2xl transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      {content}
    </div>
  </div>
);

const SectionCard: React.FC<{
  title: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, rightSlot, children }) => (
  <section className="rounded-2xl border border-white/10 bg-slate-900/70 shadow-[0_18px_60px_rgba(15,23,42,0.28)]">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{title}</h3>
      {rightSlot}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const ToggleGroupButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: 'emerald' | 'indigo' | 'cyan' | 'slate';
}> = ({ active, label, onClick, tone = 'slate' }) => {
  const activeToneClass =
    tone === 'emerald'
      ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-50'
      : tone === 'indigo'
        ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-50'
        : tone === 'cyan'
          ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-50'
          : 'border-white/20 bg-white/10 text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
        active
          ? activeToneClass
          : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-white/20 hover:bg-white/5 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
};

const MetricRow: React.FC<{
  label: string;
  value: string;
  emphasized?: boolean;
  muted?: boolean;
}> = ({ label, value, emphasized = false, muted = false }) => (
  <div className={`flex items-center justify-between gap-3 text-sm ${emphasized ? 'font-semibold text-white' : muted ? 'text-slate-400' : 'text-slate-200'}`}>
    <span>{label}</span>
    <span className={emphasized ? 'text-lg' : ''}>{value}</span>
  </div>
);

const RightPanel: React.FC = () => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('babu');
  const [availableCredit, setAvailableCredit] = useState<number>(0);
  const [creditLoading, setCreditLoading] = useState<boolean>(true);

  const [discountInput, setDiscountInput] = useState<string>('0.00');

  const [applyStoreCredit, setApplyStoreCredit] = useState<boolean>(false);
  const [storeCreditInput, setStoreCreditInput] = useState<string>('0.00');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');
  const [showSplitPaymentHint, setShowSplitPaymentHint] = useState<boolean>(false);

  const [invoiceType, setInvoiceType] = useState<InvoiceType>('paid_now');
  const [saveMode, setSaveMode] = useState<SaveMode>('finalise');
  const [taxMode, setTaxMode] = useState<TaxMode>('gst_bill');
  const [roundOffMode, setRoundOffMode] = useState<RoundOffMode>('none');

  const selectedCustomer = useMemo(
    () => DEMO_CUSTOMERS.find((customer) => customer.id === selectedCustomerId) ?? DEMO_CUSTOMERS[0],
    [selectedCustomerId]
  );

  // Demo "fetch" for store credit. In a real app this would call the customer wallet / ledger API.
  useEffect(() => {
    setCreditLoading(true);
    const timer = window.setTimeout(() => {
      setAvailableCredit(selectedCustomer?.availableCredit ?? 0);
      setCreditLoading(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [selectedCustomer]);

  const totals = useMemo(() => {
    const gstAmount = taxMode === 'gst_bill' ? roundTo2(SUBTOTAL * GST_RATE) : 0;
    const grossTotal = roundTo2(SUBTOTAL + gstAmount);

    const discountAmount = clamp(parseAmount(discountInput), 0, grossTotal);
    const totalBeforeCredit = roundTo2(Math.max(0, grossTotal - discountAmount));

    const maxCreditAllowed = invoiceType === 'paid_now' ? Math.min(availableCredit, totalBeforeCredit) : 0;
    const storeCreditAmount = applyStoreCredit
      ? clamp(parseAmount(storeCreditInput), 0, maxCreditAllowed)
      : 0;

    const netTotalBeforeRoundOff = roundTo2(Math.max(0, totalBeforeCredit - storeCreditAmount));
    const roundedInvoiceTotal = roundTo2(applyRoundOff(netTotalBeforeRoundOff, roundOffMode));
    const roundOffAmount = roundTo2(roundedInvoiceTotal - netTotalBeforeRoundOff);
    const collectNow = invoiceType === 'paid_now' ? roundedInvoiceTotal : 0;

    return {
      gstAmount,
      grossTotal,
      discountAmount,
      totalBeforeCredit,
      maxCreditAllowed,
      storeCreditAmount,
      netTotalBeforeRoundOff,
      roundedInvoiceTotal,
      roundOffAmount,
      collectNow,
    };
  }, [applyStoreCredit, availableCredit, discountInput, invoiceType, roundOffMode, storeCreditInput, taxMode]);

  // Store credit can only be used on "Paid Now" invoices. Switching to Pay Later clears it immediately.
  useEffect(() => {
    if (invoiceType === 'pay_later') {
      setApplyStoreCredit(false);
      setStoreCreditInput('0.00');
      setPaymentMethod('');
      setCashReceivedInput('');
    }
  }, [invoiceType]);

  // Clamp the applied credit whenever discount, tax mode, or customer credit changes.
  useEffect(() => {
    if (!applyStoreCredit) {
      setStoreCreditInput('0.00');
      return;
    }

    const clamped = clamp(parseAmount(storeCreditInput), 0, totals.maxCreditAllowed);
    if (Math.abs(clamped - parseAmount(storeCreditInput)) > 0.001) {
      setStoreCreditInput(clamped.toFixed(2));
    }
  }, [applyStoreCredit, storeCreditInput, totals.maxCreditAllowed]);

  const cashReceived = parseAmount(cashReceivedInput);
  const changeDue = paymentMethod === 'cash' ? roundTo2(Math.max(0, cashReceived - totals.collectNow)) : 0;
  const cashShortfall = paymentMethod === 'cash' ? roundTo2(Math.max(0, totals.collectNow - cashReceived)) : 0;

  const paymentRequired = invoiceType === 'paid_now' && totals.collectNow > 0;
  const paymentReady =
    !paymentRequired
    || (
      paymentMethod !== ''
      && (paymentMethod !== 'cash' || cashReceived >= totals.collectNow)
    );

  const completeDisabled = totals.roundedInvoiceTotal > 0 && !paymentReady;

  const normaliseMoneyField = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    nextValue: string,
    max: number
  ) => {
    const value = clamp(parseAmount(nextValue), 0, max);
    setter(value.toFixed(2));
  };

  return (
    <aside className="w-full max-w-[460px] space-y-4 rounded-[28px] border border-white/10 bg-slate-950/80 p-4 text-white backdrop-blur">
      <SectionCard
        title="Totals"
        rightSlot={
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
            Live totals
          </div>
        }
      >
        <div className="space-y-3">
          <MetricRow label="Subtotal" value={formatMoney(SUBTOTAL)} />
          <MetricRow label={`GST (${Math.round(GST_RATE * 100)}%)`} value={formatMoney(totals.gstAmount)} />
          <div className="border-t border-dashed border-white/10" />
          <MetricRow label="Gross Total" value={formatMoney(totals.grossTotal)} emphasized />
          <MetricRow label="Discount" value={`- ${formatMoney(totals.discountAmount)}`} />
          <MetricRow label="Store Credit" value={`- ${formatMoney(totals.storeCreditAmount)}`} />
          <div className="border-t border-dashed border-white/10" />
          <MetricRow label="Net Total" value={formatMoney(totals.netTotalBeforeRoundOff)} emphasized />
          <MetricRow
            label={`Round-off (${formatMoney(totals.roundOffAmount)})`}
            value={formatMoney(totals.roundedInvoiceTotal)}
            muted
          />
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3">
            <MetricRow
              label="Collect Now"
              value={formatMoney(totals.collectNow)}
              emphasized
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-3">
          <label htmlFor="discount" className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Discount
          </label>
          <input
            id="discount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={discountInput}
            onChange={(event) => setDiscountInput(event.target.value)}
            onBlur={() => normaliseMoneyField(setDiscountInput, discountInput, totals.grossTotal)}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10"
            placeholder="0.00"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Store Credit"
        rightSlot={
          <InfoTooltip content="Credit reduces Net Total before payment. Unused credit stays for future bills. Cannot be used with Pay Later invoices." />
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor="customer" className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Customer
              </label>
              <select
                id="customer"
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10"
              >
                {DEMO_CUSTOMERS.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.phone})
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-right">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Available credit</p>
              <p className="mt-1 text-base font-semibold text-white">
                {creditLoading ? 'Loading...' : formatMoney(availableCredit)}
              </p>
            </div>
          </div>

          <div className={`rounded-xl border px-3 py-3 ${invoiceType === 'pay_later' ? 'border-amber-400/20 bg-amber-500/10' : 'border-white/10 bg-slate-950/40'}`}>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={applyStoreCredit}
                disabled={invoiceType === 'pay_later'}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setApplyStoreCredit(checked);
                  setStoreCreditInput('0.00');
                }}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400/30"
              />
              <span>
                <span className="font-medium text-white">Apply store credit to this invoice</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {invoiceType === 'pay_later'
                    ? 'Store credit is disabled because this invoice is marked as Pay Later.'
                    : 'Any applied amount will reduce the collectible balance immediately.'}
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor="storeCreditAmount" className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Amount to use
              </label>
              <input
                id="storeCreditAmount"
                type="number"
                min="0"
                max={totals.maxCreditAllowed}
                step="0.01"
                inputMode="decimal"
                disabled={!applyStoreCredit || invoiceType === 'pay_later'}
                value={storeCreditInput}
                onChange={(event) => setStoreCreditInput(event.target.value)}
                onBlur={() => normaliseMoneyField(setStoreCreditInput, storeCreditInput, totals.maxCreditAllowed)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-50 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10"
                placeholder="0.00"
              />
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-right">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Max usable</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatMoney(totals.maxCreditAllowed)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-50">
            <div className="flex items-center gap-2 font-medium">
              <span>How it works</span>
              <InfoTooltip content="Credit reduces Net Total before payment. Unused credit stays for future bills. Cannot be used with Pay Later invoices." />
            </div>
            <p className="mt-2 text-xs leading-5 text-cyan-100/90">
              Credit is applied before payment collection. If the bill is smaller than the available credit, only the required amount is used and the remaining balance stays on the customer account.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Payment Method"
        rightSlot={
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
            Need to collect {formatMoney(totals.collectNow)}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                disabled={!paymentRequired}
                onClick={() => setPaymentMethod(method)}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition ${
                  paymentMethod === method
                    ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-50'
                    : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-white/20 hover:bg-white/5 hover:text-white'
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {paymentMethodLabel[method]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-white">Required payment</p>
              <p className="mt-1 text-xs text-slate-400">
                {invoiceType === 'pay_later'
                  ? 'No immediate payment is required for Pay Later invoices.'
                  : `Collect ${formatMoney(totals.collectNow)} using the selected method.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSplitPaymentHint((previous) => !previous)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Split payment?
            </button>
          </div>

          {showSplitPaymentHint ? (
            <div className="rounded-xl border border-dashed border-cyan-400/30 bg-cyan-500/5 px-3 py-3 text-xs leading-5 text-cyan-100">
              Demo placeholder: add multiple payment lines here when you wire this panel into the real checkout state.
            </div>
          ) : null}

          {paymentMethod === 'cash' && paymentRequired ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label htmlFor="cashReceived" className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Cash Received
                </label>
                <input
                  id="cashReceived"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={cashReceivedInput}
                  onChange={(event) => setCashReceivedInput(event.target.value)}
                  onBlur={() => normaliseMoneyField(setCashReceivedInput, cashReceivedInput || '0', 1000000)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10"
                  placeholder="0.00"
                />
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-100/70">Change Due</p>
                <p className="mt-1 text-base font-semibold text-emerald-50">{formatMoney(changeDue)}</p>
              </div>
            </div>
          ) : null}

          {paymentMethod === 'cash' && paymentRequired && cashShortfall > 0 ? (
            <p className="text-xs text-amber-200">
              Cash received is short by {formatMoney(cashShortfall)}.
            </p>
          ) : null}

          {!paymentRequired ? (
            <p className="text-xs text-slate-400">
              Payment capture is skipped because this invoice is set to Pay Later.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Invoice Settings">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Invoice Type</p>
              <InfoTooltip content="Paid Now expects immediate collection. Pay Later keeps the full amount outstanding and disables store credit usage." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ToggleGroupButton
                active={invoiceType === 'paid_now'}
                label="Paid Now"
                tone="emerald"
                onClick={() => setInvoiceType('paid_now')}
              />
              <ToggleGroupButton
                active={invoiceType === 'pay_later'}
                label="Pay Later"
                onClick={() => setInvoiceType('pay_later')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Save Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <ToggleGroupButton
                active={saveMode === 'finalise'}
                label="Finalise"
                tone="indigo"
                onClick={() => setSaveMode('finalise')}
              />
              <ToggleGroupButton
                active={saveMode === 'draft'}
                label="Save as Draft"
                onClick={() => setSaveMode('draft')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Tax Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <ToggleGroupButton
                active={taxMode === 'gst_bill'}
                label="GST Bill"
                tone="cyan"
                onClick={() => setTaxMode('gst_bill')}
              />
              <ToggleGroupButton
                active={taxMode === 'non_gst_bill'}
                label="Non-GST Bill"
                onClick={() => setTaxMode('non_gst_bill')}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Round-off</p>
                <p className="mt-1 text-sm font-medium text-white">{roundOffLabel[roundOffMode]}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRoundOffMode((previous) => (previous === 'none' ? 'nearest_rupee' : 'none'))
                }
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Change
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <button
              type="button"
              className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 font-semibold text-amber-100 transition hover:bg-amber-500/20"
            >
              Hold
            </button>
            <button
              type="button"
              disabled={completeDisabled}
              className="rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white shadow-[0_18px_40px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300 disabled:shadow-none"
            >
              Complete Sale {formatMoney(totals.roundedInvoiceTotal)}
            </button>
          </div>

          {!paymentReady && paymentRequired ? (
            <p className="text-xs text-amber-200">
              Select a payment method and capture the required payment before completing the invoice.
            </p>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-xs text-slate-400">
            Current save mode: <span className="font-medium text-slate-200">{saveMode === 'finalise' ? 'Finalise invoice' : 'Save as Draft'}</span>
          </div>
        </div>
      </SectionCard>
    </aside>
  );
};

export default RightPanel;
