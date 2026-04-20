import React, { useEffect, useMemo, useState } from 'react';
import { CardTabs } from './CardTabs';
import { ReportDataTable } from './ReportDataTable';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

type TdsWorkspaceTab = 'overview' | 'setup' | 'deductees' | 'deductions' | 'challans' | 'returns' | 'certificates' | 'reconciliation';

const tabs: Array<{ key: TdsWorkspaceTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'setup', label: 'Setup' },
  { key: 'deductees', label: 'Deductees' },
  { key: 'deductions', label: 'Deductions' },
  { key: 'challans', label: 'Challans' },
  { key: 'returns', label: 'Returns' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'reconciliation', label: 'Reconciliation' },
];

const inputClass = 'w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none';
const buttonClass = 'inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60';
const dangerBadgeClass = 'rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100';

const todayKey = () => new Date().toISOString().slice(0, 10);

const createCompanyForm = () => ({
  legalName: '',
  pan: '',
  tan: '',
  deductorCategory: 'company',
  responsiblePersonName: '',
  responsiblePersonDesignation: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
});

const createSectionForm = () => ({
  sectionCode: '',
  returnSectionCode: '',
  actReference: 'transition',
  sectionName: '',
  natureOfPayment: '',
  defaultRate: '',
  panMissingRate: '20',
  thresholdPerTransaction: '',
  thresholdMonthly: '',
  thresholdAnnual: '',
  formType: '26Q',
  notes: '',
});

const createProfileForm = () => ({
  vendorId: '',
  deducteeName: '',
  deducteeType: 'vendor',
  residentialStatus: 'resident',
  pan: '',
  email: '',
  phone: '',
  defaultSectionId: '',
  ldcEnabled: false,
  ldcCertificateNumber: '',
  ldcRate: '',
  ldcValidFrom: '',
  ldcValidTo: '',
  ldcAmountLimit: '',
  notes: '',
});

const createDeductionForm = () => ({
  transactionDate: todayKey(),
  transactionType: 'bill',
  tdsUseCaseKey: 'custom',
  tdsUseCaseLabel: '',
  vendorId: '',
  deducteeProfileId: '',
  deducteeName: '',
  pan: '',
  sectionId: '',
  grossAmount: '',
  taxableAmount: '',
  rateOverride: '',
  thresholdPerTransactionOverride: '',
  thresholdMonthlyOverride: '',
  thresholdAnnualOverride: '',
  referenceNo: '',
  sourceType: 'manual',
  sourceId: '',
  postJournal: false,
  notes: '',
});

const createChallanForm = () => ({
  paymentDate: todayKey(),
  financialYear: '',
  quarter: 'Q1',
  sectionCode: '',
  amount: '',
  bsrCode: '',
  challanSerialNo: '',
  cin: '',
  bankName: '',
  depositMode: 'online',
  notes: '',
});

const createReturnForm = () => ({
  formType: '26Q',
  financialYear: '',
  quarter: 'Q1',
  isCorrection: false,
  originalTokenNo: '',
  notes: '',
});

const createCertificateForm = () => ({
  deducteeProfileId: '',
  financialYear: '',
  quarter: 'Q1',
  formType: 'Form16A',
});

const createReconciliationForm = () => ({
  sourceType: 'form26as',
  financialYear: '',
  quarter: 'Q1',
  rawText: 'referenceNo,pan,tdsAmount\nBILL-001,ABCDE1234F,1000',
  notes: '',
});

interface TdsUseCasePreset {
  key: string;
  label: string;
  sectionCode: string;
  rate: number;
  thresholdPerTransaction?: number;
  thresholdMonthly?: number;
  thresholdAnnual?: number;
  transactionType: string;
  sourceType: string;
  hint: string;
}

const tdsUseCasePresets: TdsUseCasePreset[] = [
  {
    key: 'sports_facility_equipment_rent',
    label: 'Sports facility rent - equipment',
    sectionCode: '194I',
    rate: 2,
    thresholdMonthly: 50000,
    transactionType: 'payment',
    sourceType: 'facility_rent',
    hint: 'Use when rent is mainly for plant, machinery, or sports equipment.',
  },
  {
    key: 'sports_facility_building_rent',
    label: 'Sports facility rent - land/building',
    sectionCode: '194I',
    rate: 10,
    thresholdMonthly: 50000,
    transactionType: 'payment',
    sourceType: 'facility_rent',
    hint: 'Use when rent is mainly for land, building, furniture, or fittings.',
  },
  {
    key: 'commercial_room_rent',
    label: 'Commercial room / hall rent',
    sectionCode: '194I',
    rate: 10,
    thresholdMonthly: 50000,
    transactionType: 'payment',
    sourceType: 'room_rent',
    hint: 'Use for commercial room, hall, or office-space rent.',
  },
  {
    key: 'residential_room_rent',
    label: 'Residential room rent',
    sectionCode: '194-IB',
    rate: 2,
    thresholdMonthly: 50000,
    transactionType: 'payment',
    sourceType: 'residential_rent',
    hint: 'Use for residential rent by specified individual/HUF deductors. The official FY 2025-26 table shows 194-IB at 2%.',
  },
  {
    key: 'contract_labour_individual_huf',
    label: 'Contract labour - Individual/HUF',
    sectionCode: '194C',
    rate: 1,
    thresholdPerTransaction: 30000,
    thresholdAnnual: 100000,
    transactionType: 'payment',
    sourceType: 'contract_labour',
    hint: 'Use for security, housekeeping, maintenance, and similar contractor payments to an individual/HUF.',
  },
  {
    key: 'contract_labour_company_firm',
    label: 'Contract labour - Company/Firm',
    sectionCode: '194C',
    rate: 2,
    thresholdPerTransaction: 30000,
    thresholdAnnual: 100000,
    transactionType: 'payment',
    sourceType: 'contract_labour',
    hint: 'Use for security, housekeeping, maintenance, and similar contractor payments to companies or firms.',
  },
  {
    key: 'professional_services',
    label: 'Professional services',
    sectionCode: '194J',
    rate: 10,
    thresholdAnnual: 50000,
    transactionType: 'payment',
    sourceType: 'professional_services',
    hint: 'Use for coaches, physiotherapists, event managers, and other professional fees.',
  },
  {
    key: 'event_prize_money',
    label: 'Event prize money',
    sectionCode: '194B',
    rate: 30,
    thresholdPerTransaction: 10000,
    transactionType: 'payment',
    sourceType: 'event_prize',
    hint: 'Use for competition prize money or winnings where the prize exceeds the configured threshold.',
  },
];

const formatDate = (value?: string | Date) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
};

const downloadBlob = async (url: string, headers: HeadersInit) => {
  const response = await fetch(apiUrl(url), { headers });
  if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const fileNameMatch = /filename="?([^"]+)"?/i.exec(response.headers.get('content-disposition') || '');
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileNameMatch?.[1] || 'tds-download.txt';
  link.click();
  URL.revokeObjectURL(objectUrl);
};

export const AccountingTdsWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TdsWorkspaceTab>('overview');
  const [data, setData] = useState<any>({});
  const [companyForm, setCompanyForm] = useState(createCompanyForm);
  const [sectionForm, setSectionForm] = useState(createSectionForm);
  const [profileForm, setProfileForm] = useState(createProfileForm);
  const [deductionForm, setDeductionForm] = useState(createDeductionForm);
  const [challanForm, setChallanForm] = useState(createChallanForm);
  const [returnForm, setReturnForm] = useState(createReturnForm);
  const [certificateForm, setCertificateForm] = useState(createCertificateForm);
  const [reconciliationForm, setReconciliationForm] = useState(createReconciliationForm);
  const [calculation, setCalculation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo<HeadersInit>(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }), []);
  const downloadHeaders = useMemo<HeadersInit>(() => ({
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }), []);

  const sections = data.sections || [];
  const profiles = data.profiles || [];
  const vendors = data.vendors || [];
  const transactions = data.transactions || [];
  const challans = data.challans || [];
  const returns = data.returns || [];
  const certificates = data.certificates || [];
  const reconciliationRuns = data.reconciliationRuns || [];
  const currentFinancialYear = data.currentFinancialYear || '';
  const selectedTdsUseCase = tdsUseCasePresets.find((preset) => preset.key === deductionForm.tdsUseCaseKey);

  const findSectionByCode = (sectionCode: string) =>
    sections.find((row: any) => String(row.sectionCode || '').toUpperCase() === sectionCode.toUpperCase());

  const buildDeductionPayload = () => ({
    ...deductionForm,
    vendorId: deductionForm.vendorId || undefined,
    deducteeProfileId: deductionForm.deducteeProfileId || undefined,
    grossAmount: Number(deductionForm.grossAmount || 0),
    taxableAmount: deductionForm.taxableAmount ? Number(deductionForm.taxableAmount) : undefined,
    rateOverride: deductionForm.rateOverride ? Number(deductionForm.rateOverride) : undefined,
    thresholdPerTransactionOverride: deductionForm.thresholdPerTransactionOverride ? Number(deductionForm.thresholdPerTransactionOverride) : undefined,
    thresholdMonthlyOverride: deductionForm.thresholdMonthlyOverride ? Number(deductionForm.thresholdMonthlyOverride) : undefined,
    thresholdAnnualOverride: deductionForm.thresholdAnnualOverride ? Number(deductionForm.thresholdAnnualOverride) : undefined,
    tdsUseCaseKey: deductionForm.tdsUseCaseKey === 'custom' ? undefined : deductionForm.tdsUseCaseKey,
    tdsUseCaseLabel: deductionForm.tdsUseCaseLabel || selectedTdsUseCase?.label || undefined,
    metadata: {
      tdsUseCaseKey: deductionForm.tdsUseCaseKey === 'custom' ? undefined : deductionForm.tdsUseCaseKey,
      tdsUseCaseLabel: deductionForm.tdsUseCaseLabel || selectedTdsUseCase?.label || undefined,
    },
  });

  const hydrateForms = (payload: any) => {
    const company = payload.company || {};
    setCompanyForm((prev) => ({ ...prev, ...company }));
    setChallanForm((prev) => ({ ...prev, financialYear: payload.currentFinancialYear || prev.financialYear }));
    setReturnForm((prev) => ({ ...prev, financialYear: payload.currentFinancialYear || prev.financialYear }));
    setCertificateForm((prev) => ({ ...prev, financialYear: payload.currentFinancialYear || prev.financialYear }));
    setReconciliationForm((prev) => ({ ...prev, financialYear: payload.currentFinancialYear || prev.financialYear }));
    if (!deductionForm.sectionId && payload.sections?.[0]?._id) {
      setDeductionForm((prev) => ({ ...prev, sectionId: payload.sections[0]._id }));
    }
  };

  const load = async () => {
    const response = await fetchApiJson(apiUrl('/api/accounting/tds/bootstrap'), { headers });
    const payload = response.data || {};
    setData(payload);
    hydrateForms(payload);
  };

  const runAction = async (fn: () => Promise<void>, successMessage?: string) => {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await fn();
      if (successMessage) setMessage(successMessage);
    } catch (actionError: any) {
      setError(actionError?.message || 'TDS request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAction(load);
  }, []);

  const postJson = async (path: string, body: any) => fetchApiJson(apiUrl(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const saveCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await postJson('/api/accounting/tds/company', companyForm);
      await load();
    }, 'TDS company settings saved');
  };

  const saveSection = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await postJson('/api/accounting/tds/sections', {
        ...sectionForm,
        defaultRate: Number(sectionForm.defaultRate || 0),
        panMissingRate: Number(sectionForm.panMissingRate || 0),
        thresholdPerTransaction: Number(sectionForm.thresholdPerTransaction || 0),
        thresholdMonthly: Number(sectionForm.thresholdMonthly || 0),
        thresholdAnnual: Number(sectionForm.thresholdAnnual || 0),
      });
      setSectionForm(createSectionForm());
      await load();
    }, 'TDS section saved');
  };

  const seedSections = async () => {
    await runAction(async () => {
      await postJson('/api/accounting/tds/sections/seed', {});
      await load();
    }, 'Default TDS sections are ready');
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await postJson('/api/accounting/tds/deductees', {
        vendorId: profileForm.vendorId || undefined,
        deducteeName: profileForm.deducteeName,
        deducteeType: profileForm.deducteeType,
        residentialStatus: profileForm.residentialStatus,
        pan: profileForm.pan,
        email: profileForm.email,
        phone: profileForm.phone,
        defaultSectionId: profileForm.defaultSectionId || undefined,
        lowerDeductionCertificate: {
          enabled: profileForm.ldcEnabled,
          certificateNumber: profileForm.ldcCertificateNumber,
          rate: profileForm.ldcRate ? Number(profileForm.ldcRate) : undefined,
          validFrom: profileForm.ldcValidFrom || undefined,
          validTo: profileForm.ldcValidTo || undefined,
          amountLimit: profileForm.ldcAmountLimit ? Number(profileForm.ldcAmountLimit) : undefined,
        },
        notes: profileForm.notes,
      });
      setProfileForm(createProfileForm());
      await load();
    }, 'TDS deductee profile saved');
  };

  const calculateDeduction = async () => {
    await runAction(async () => {
      const response = await postJson('/api/accounting/tds/calculate', buildDeductionPayload());
      setCalculation(response.data);
    });
  };

  const recordDeduction = async () => {
    await runAction(async () => {
      await postJson('/api/accounting/tds/transactions', buildDeductionPayload());
      setDeductionForm(createDeductionForm());
      setCalculation(null);
      await load();
    }, 'TDS transaction recorded');
  };

  const recordChallan = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await postJson('/api/accounting/tds/challans', {
        ...challanForm,
        amount: Number(challanForm.amount || 0),
      });
      setChallanForm((prev) => ({ ...createChallanForm(), financialYear: prev.financialYear || currentFinancialYear }));
      await load();
    }, 'TDS challan recorded and allocated');
  };

  const generateReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await postJson('/api/accounting/tds/returns', returnForm);
      await load();
    }, 'Draft TDS return generated');
  };

  const generateCertificate = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await postJson('/api/accounting/tds/certificates', certificateForm);
      await load();
    }, 'Draft TDS certificate generated');
  };

  const runReconciliation = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await postJson('/api/accounting/tds/reconciliation', reconciliationForm);
      await load();
    }, 'TDS reconciliation run saved');
  };

  const selectVendorForProfile = (vendorId: string) => {
    const vendor = vendors.find((row: any) => row._id === vendorId);
    const defaultSection = vendor?.tdsSectionCode ? findSectionByCode(vendor.tdsSectionCode) : null;
    const vendorDeducteeType = ['vendor', 'contractor', 'employee', 'customer', 'other'].includes(String(vendor?.deducteeType || ''))
      ? String(vendor?.deducteeType)
      : 'vendor';
    setProfileForm((prev) => ({
      ...prev,
      vendorId,
      deducteeName: vendor?.name || prev.deducteeName,
      deducteeType: vendor ? vendorDeducteeType : prev.deducteeType,
      pan: vendor?.pan || prev.pan,
      email: vendor?.email || prev.email,
      phone: vendor?.phone || prev.phone,
      defaultSectionId: defaultSection?._id || prev.defaultSectionId,
    }));
  };

  const selectVendorForDeduction = (vendorId: string) => {
    const profile = profiles.find((row: any) => row.vendorId === vendorId);
    const vendor = vendors.find((row: any) => row._id === vendorId);
    const defaultSection = vendor?.tdsSectionCode ? findSectionByCode(vendor.tdsSectionCode) : null;
    setDeductionForm((prev) => ({
      ...prev,
      vendorId,
      deducteeProfileId: profile?._id || '',
      deducteeName: profile?.deducteeName || vendor?.name || '',
      pan: profile?.pan || vendor?.pan || '',
      sectionId: profile?.defaultSectionId || defaultSection?._id || prev.sectionId,
      rateOverride: vendor?.tdsRate ? String(vendor.tdsRate) : prev.rateOverride,
    }));
  };

  const applyTdsUseCasePreset = (presetKey: string) => {
    if (presetKey === 'custom') {
      setDeductionForm((prev) => ({
        ...prev,
        tdsUseCaseKey: 'custom',
        tdsUseCaseLabel: '',
        rateOverride: '',
        thresholdPerTransactionOverride: '',
        thresholdMonthlyOverride: '',
        thresholdAnnualOverride: '',
      }));
      setCalculation(null);
      return;
    }

    const preset = tdsUseCasePresets.find((row) => row.key === presetKey);
    if (!preset) return;
    const section = findSectionByCode(preset.sectionCode);
    setDeductionForm((prev) => ({
      ...prev,
      tdsUseCaseKey: preset.key,
      tdsUseCaseLabel: preset.label,
      sectionId: section?._id || prev.sectionId,
      transactionType: preset.transactionType,
      sourceType: preset.sourceType,
      rateOverride: String(preset.rate),
      thresholdPerTransactionOverride: String(preset.thresholdPerTransaction ?? 0),
      thresholdMonthlyOverride: String(preset.thresholdMonthly ?? 0),
      thresholdAnnualOverride: String(preset.thresholdAnnual ?? 0),
    }));
    setCalculation(null);
  };

  const renderSummaryCard = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );

  const renderTransactionsTable = (rows: any[], title = 'TDS Transactions') => (
    <ReportDataTable
      title={title}
      data={rows}
      itemLabel="TDS deductions"
      searchPlaceholder="Search by deductee, PAN, section, use case, reference, or status"
      exportFileName={`tds-transactions-${currentFinancialYear || 'current'}.csv`}
      filters={[
        { key: 'sectionCode', label: 'Section', getValue: (row: any) => String(row.sectionCode || 'N/A') },
        { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'DEDUCTED' },
        { key: 'panStatus', label: 'PAN Status', getValue: (row: any) => String(row.panStatus || 'missing').toUpperCase() },
      ]}
      columns={[
        { key: 'transactionDate', header: 'Date', render: (row: any) => formatDate(row.transactionDate), exportValue: (row: any) => String(row.transactionDate || '').slice(0, 10), sortValue: (row: any) => row.transactionDate },
        { key: 'deducteeName', header: 'Deductee', accessor: 'deducteeName' },
        { key: 'pan', header: 'PAN', render: (row: any) => row.pan || '-', exportValue: (row: any) => row.pan || '' },
        { key: 'sectionCode', header: 'Section', accessor: 'sectionCode' },
        { key: 'taxableAmount', header: 'Taxable', render: (row: any) => formatCurrency(row.taxableAmount || 0), exportValue: (row: any) => Number(row.taxableAmount || 0), sortValue: (row: any) => Number(row.taxableAmount || 0), align: 'right' },
        { key: 'tdsAmount', header: 'TDS', render: (row: any) => formatCurrency(row.tdsAmount || 0), exportValue: (row: any) => Number(row.tdsAmount || 0), sortValue: (row: any) => Number(row.tdsAmount || 0), align: 'right' },
        { key: 'balanceAmount', header: 'Outstanding', render: (row: any) => formatCurrency(row.balanceAmount || 0), exportValue: (row: any) => Number(row.balanceAmount || 0), sortValue: (row: any) => Number(row.balanceAmount || 0), align: 'right' },
        { key: 'dueDate', header: 'Due Date', render: (row: any) => formatDate(row.dueDate), exportValue: (row: any) => String(row.dueDate || '').slice(0, 10), sortValue: (row: any) => row.dueDate },
        { key: 'status', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
        { key: 'useCase', header: 'Use Case', render: (row: any) => row.metadata?.tdsUseCaseLabel || '-', exportValue: (row: any) => row.metadata?.tdsUseCaseLabel || '' },
        { key: 'referenceNo', header: 'Reference', render: (row: any) => row.referenceNo || '-', exportValue: (row: any) => row.referenceNo || '' },
      ]}
    />
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">India TDS Compliance</p>
            <h2 className="mt-2 text-2xl font-bold text-white">TDS Control Center</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Configure PAN/TAN, maintain sections and deductees, calculate deductions, track challans, prepare draft returns, and reconcile with government records without disturbing existing accounting entries.
            </p>
          </div>
          <button type="button" className={secondaryButtonClass} disabled={loading} onClick={() => runAction(load, 'TDS workspace refreshed')}>
            Refresh TDS
          </button>
        </div>
        {data.warnings?.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {data.warnings.map((warning: string) => <div key={warning} className={dangerBadgeClass}>{warning}</div>)}
          </div>
        )}
      </div>

      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <CardTabs
        ariaLabel="TDS workspace tabs"
        items={tabs}
        activeKey={activeTab}
        onChange={setActiveTab}
        className="w-full"
        listClassName="border-b-0 px-0 pt-0"
      />

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {renderSummaryCard('TDS Deducted', formatCurrency(data.summary?.deducted || 0), `${data.summary?.sectionsCount || 0} active sections`)}
            {renderSummaryCard('Deposited', formatCurrency(data.summary?.paid || 0), 'Allocated through challans')}
            {renderSummaryCard('Outstanding', formatCurrency(data.summary?.outstanding || 0), `${data.summary?.overdueCount || 0} overdue`)}
            {renderSummaryCard('Deductees', data.summary?.profilesCount || 0, 'PAN/LDC profiles')}
          </div>
          {renderTransactionsTable(transactions.slice(0, 10), 'Recent TDS Deductions')}
        </div>
      )}

      {activeTab === 'setup' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <form onSubmit={saveCompany} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Company & Deductor Setup</h3>
                <p className="text-xs text-slate-400">PAN/TAN is used across challans, returns, and certificates.</p>
              </div>
              <button className={buttonClass} disabled={loading}>Save</button>
            </div>
            <input className={inputClass} placeholder="Legal Name" value={companyForm.legalName} onChange={(e) => setCompanyForm((prev) => ({ ...prev, legalName: e.target.value }))} />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Company PAN" value={companyForm.pan} onChange={(e) => setCompanyForm((prev) => ({ ...prev, pan: e.target.value.toUpperCase() }))} />
              <input className={inputClass} placeholder="Company TAN" value={companyForm.tan} onChange={(e) => setCompanyForm((prev) => ({ ...prev, tan: e.target.value.toUpperCase() }))} />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Responsible Person" value={companyForm.responsiblePersonName} onChange={(e) => setCompanyForm((prev) => ({ ...prev, responsiblePersonName: e.target.value }))} />
              <input className={inputClass} placeholder="Designation" value={companyForm.responsiblePersonDesignation} onChange={(e) => setCompanyForm((prev) => ({ ...prev, responsiblePersonDesignation: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Email" value={companyForm.email} onChange={(e) => setCompanyForm((prev) => ({ ...prev, email: e.target.value }))} />
              <input className={inputClass} placeholder="Phone" value={companyForm.phone} onChange={(e) => setCompanyForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <textarea className={inputClass} rows={3} placeholder="Address / notes" value={companyForm.address} onChange={(e) => setCompanyForm((prev) => ({ ...prev, address: e.target.value }))} />
          </form>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">TDS Sections & Rates</h3>
                <p className="text-xs text-slate-400">Defaults are editable. Review rates with your accountant before filing.</p>
              </div>
              <button type="button" className={secondaryButtonClass} disabled={loading} onClick={seedSections}>Seed FY 2025-26 Sections</button>
            </div>
            <form onSubmit={saveSection} className="grid grid-cols-1 gap-2 lg:grid-cols-4">
              <input className={inputClass} placeholder="Section e.g. 194C" required value={sectionForm.sectionCode} onChange={(e) => setSectionForm((prev) => ({ ...prev, sectionCode: e.target.value.toUpperCase() }))} />
              <input className={inputClass} placeholder="Return/FVU Code" value={sectionForm.returnSectionCode} onChange={(e) => setSectionForm((prev) => ({ ...prev, returnSectionCode: e.target.value.toUpperCase() }))} />
              <select className={inputClass} value={sectionForm.actReference} onChange={(e) => setSectionForm((prev) => ({ ...prev, actReference: e.target.value }))}>
                <option value="transition">Transition</option>
                <option value="1961">Income-tax Act, 1961</option>
                <option value="2025">Income-tax Act, 2025</option>
              </select>
              <input className={inputClass} placeholder="Section Name" required value={sectionForm.sectionName} onChange={(e) => setSectionForm((prev) => ({ ...prev, sectionName: e.target.value }))} />
              <input className={inputClass} type="number" step="0.001" placeholder="Rate %" required value={sectionForm.defaultRate} onChange={(e) => setSectionForm((prev) => ({ ...prev, defaultRate: e.target.value }))} />
              <select className={inputClass} value={sectionForm.formType} onChange={(e) => setSectionForm((prev) => ({ ...prev, formType: e.target.value }))}>
                <option value="24Q">24Q</option>
                <option value="26Q">26Q</option>
                <option value="27Q">27Q</option>
                <option value="27EQ">27EQ</option>
              </select>
              <input className={inputClass} placeholder="Nature of payment" value={sectionForm.natureOfPayment} onChange={(e) => setSectionForm((prev) => ({ ...prev, natureOfPayment: e.target.value }))} />
              <input className={inputClass} type="number" step="0.01" placeholder="Txn Threshold" value={sectionForm.thresholdPerTransaction} onChange={(e) => setSectionForm((prev) => ({ ...prev, thresholdPerTransaction: e.target.value }))} />
              <input className={inputClass} type="number" step="0.01" placeholder="Monthly Threshold" value={sectionForm.thresholdMonthly} onChange={(e) => setSectionForm((prev) => ({ ...prev, thresholdMonthly: e.target.value }))} />
              <input className={inputClass} type="number" step="0.01" placeholder="Annual Threshold" value={sectionForm.thresholdAnnual} onChange={(e) => setSectionForm((prev) => ({ ...prev, thresholdAnnual: e.target.value }))} />
              <button className={buttonClass} disabled={loading}>Save Section</button>
            </form>
            <ReportDataTable
              title="Configured TDS Sections"
              data={sections}
              itemLabel="TDS sections"
              searchPlaceholder="Search by section, FVU code, name, nature, or return form"
              exportFileName="tds-sections.csv"
              filters={[
                { key: 'formType', label: 'Return Form', getValue: (row: any) => String(row.formType || '26Q') },
                { key: 'isActive', label: 'Status', getValue: (row: any) => row.isActive === false ? 'Inactive' : 'Active' },
              ]}
              columns={[
                { key: 'sectionCode', header: 'Section', accessor: 'sectionCode' },
                { key: 'returnSectionCode', header: 'FVU Code', render: (row: any) => row.returnSectionCode || row.sectionCode, exportValue: (row: any) => row.returnSectionCode || row.sectionCode },
                { key: 'sectionName', header: 'Name', accessor: 'sectionName' },
                { key: 'natureOfPayment', header: 'Nature', render: (row: any) => row.natureOfPayment || '-', exportValue: (row: any) => row.natureOfPayment || '' },
                { key: 'defaultRate', header: 'Rate', render: (row: any) => `${row.defaultRate || 0}%`, exportValue: (row: any) => Number(row.defaultRate || 0), sortValue: (row: any) => Number(row.defaultRate || 0), align: 'right' },
                { key: 'thresholdPerTransaction', header: 'Txn Threshold', render: (row: any) => formatCurrency(row.thresholdPerTransaction || 0), exportValue: (row: any) => Number(row.thresholdPerTransaction || 0), sortValue: (row: any) => Number(row.thresholdPerTransaction || 0), align: 'right' },
                { key: 'thresholdMonthly', header: 'Monthly', render: (row: any) => formatCurrency(row.thresholdMonthly || 0), exportValue: (row: any) => Number(row.thresholdMonthly || 0), sortValue: (row: any) => Number(row.thresholdMonthly || 0), align: 'right' },
                { key: 'thresholdAnnual', header: 'Annual', render: (row: any) => formatCurrency(row.thresholdAnnual || 0), exportValue: (row: any) => Number(row.thresholdAnnual || 0), sortValue: (row: any) => Number(row.thresholdAnnual || 0), align: 'right' },
                { key: 'formType', header: 'Return', accessor: 'formType' },
              ]}
            />
          </div>
        </div>
      )}

      {activeTab === 'deductees' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <form onSubmit={saveProfile} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h3 className="font-semibold text-white">PAN / LDC Deductee Profile</h3>
            <select className={inputClass} value={profileForm.vendorId} onChange={(e) => selectVendorForProfile(e.target.value)}>
              <option value="">Select vendor or create manual profile</option>
              {vendors.map((row: any) => <option key={row._id} value={row._id}>{row.name}</option>)}
            </select>
            <input className={inputClass} placeholder="Deductee Name" required value={profileForm.deducteeName} onChange={(e) => setProfileForm((prev) => ({ ...prev, deducteeName: e.target.value }))} />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <select className={inputClass} value={profileForm.deducteeType} onChange={(e) => setProfileForm((prev) => ({ ...prev, deducteeType: e.target.value }))}>
                <option value="vendor">Vendor</option>
                <option value="contractor">Contractor</option>
                <option value="employee">Employee</option>
                <option value="customer">Customer</option>
                <option value="other">Other</option>
              </select>
              <select className={inputClass} value={profileForm.defaultSectionId} onChange={(e) => setProfileForm((prev) => ({ ...prev, defaultSectionId: e.target.value }))}>
                <option value="">Default TDS Section</option>
                {sections.map((row: any) => <option key={row._id} value={row._id}>{row.sectionCode} - {row.sectionName}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="PAN" value={profileForm.pan} onChange={(e) => setProfileForm((prev) => ({ ...prev, pan: e.target.value.toUpperCase() }))} />
              <select className={inputClass} value={profileForm.residentialStatus} onChange={(e) => setProfileForm((prev) => ({ ...prev, residentialStatus: e.target.value }))}>
                <option value="resident">Resident</option>
                <option value="non_resident">Non Resident</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Email" value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} />
              <input className={inputClass} placeholder="Phone" value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={profileForm.ldcEnabled} onChange={(e) => setProfileForm((prev) => ({ ...prev, ldcEnabled: e.target.checked }))} />
              Lower deduction certificate applies
            </label>
            {profileForm.ldcEnabled && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input className={inputClass} placeholder="Certificate No." value={profileForm.ldcCertificateNumber} onChange={(e) => setProfileForm((prev) => ({ ...prev, ldcCertificateNumber: e.target.value.toUpperCase() }))} />
                <input className={inputClass} type="number" step="0.001" placeholder="LDC Rate %" value={profileForm.ldcRate} onChange={(e) => setProfileForm((prev) => ({ ...prev, ldcRate: e.target.value }))} />
                <input className={inputClass} type="date" value={profileForm.ldcValidFrom} onChange={(e) => setProfileForm((prev) => ({ ...prev, ldcValidFrom: e.target.value }))} />
                <input className={inputClass} type="date" value={profileForm.ldcValidTo} onChange={(e) => setProfileForm((prev) => ({ ...prev, ldcValidTo: e.target.value }))} />
              </div>
            )}
            <button className={buttonClass} disabled={loading}>Save Deductee Profile</button>
          </form>

          <ReportDataTable
            title="Deductee Profiles"
            data={profiles}
            itemLabel="deductee profiles"
            searchPlaceholder="Search by deductee, PAN, email, phone, section, residency, or PAN status"
            exportFileName="tds-deductee-profiles.csv"
            filters={[
              { key: 'panStatus', label: 'PAN Status', getValue: (row: any) => String(row.panStatus || 'missing').toUpperCase() },
              { key: 'residentialStatus', label: 'Residency', getValue: (row: any) => String(row.residentialStatus || 'resident') },
              { key: 'ldc', label: 'LDC', getValue: (row: any) => row.lowerDeductionCertificate?.enabled ? 'LDC Enabled' : 'No LDC' },
            ]}
            columns={[
              { key: 'deducteeName', header: 'Name', accessor: 'deducteeName' },
              { key: 'pan', header: 'PAN', render: (row: any) => row.pan || '-', exportValue: (row: any) => row.pan || '' },
              { key: 'panStatus', header: 'PAN Status', render: (row: any) => String(row.panStatus || '-').toUpperCase(), exportValue: (row: any) => row.panStatus || '' },
              { key: 'residentialStatus', header: 'Residency', render: (row: any) => row.residentialStatus || 'resident', exportValue: (row: any) => row.residentialStatus || 'resident' },
              { key: 'defaultSection', header: 'Default Section', render: (row: any) => sections.find((section: any) => section._id === row.defaultSectionId)?.sectionCode || '-', exportValue: (row: any) => sections.find((section: any) => section._id === row.defaultSectionId)?.sectionCode || '' },
              { key: 'ldcRate', header: 'LDC', render: (row: any) => row.lowerDeductionCertificate?.enabled ? `${row.lowerDeductionCertificate.rate || 0}%` : '-', exportValue: (row: any) => row.lowerDeductionCertificate?.enabled ? `${row.lowerDeductionCertificate.rate || 0}%` : '' },
              { key: 'email', header: 'Email', render: (row: any) => row.email || '-', exportValue: (row: any) => row.email || '' },
              { key: 'phone', header: 'Phone', render: (row: any) => row.phone || '-', exportValue: (row: any) => row.phone || '' },
            ]}
          />
        </div>
      )}

      {activeTab === 'deductions' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h3 className="font-semibold text-white">Calculate & Record TDS</h3>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Sports Complex Use Case</label>
              <select className={inputClass} value={deductionForm.tdsUseCaseKey} onChange={(e) => applyTdsUseCasePreset(e.target.value)}>
                <option value="custom">Custom / accountant reviewed</option>
                {tdsUseCasePresets.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label} ({preset.sectionCode}, {preset.rate}%)
                  </option>
                ))}
              </select>
              {selectedTdsUseCase && (
                <div className="mt-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs text-cyan-50">
                  <p className="font-semibold">{selectedTdsUseCase.hint}</p>
                  <p className="mt-1">
                    Section {selectedTdsUseCase.sectionCode}, rate {selectedTdsUseCase.rate}%,
                    {selectedTdsUseCase.thresholdPerTransaction ? ` transaction threshold ${formatCurrency(selectedTdsUseCase.thresholdPerTransaction)},` : ''}
                    {selectedTdsUseCase.thresholdMonthly ? ` monthly threshold ${formatCurrency(selectedTdsUseCase.thresholdMonthly)},` : ''}
                    {selectedTdsUseCase.thresholdAnnual ? ` annual threshold ${formatCurrency(selectedTdsUseCase.thresholdAnnual)},` : ''}
                    PAN missing/invalid uses the higher-rate rule where applicable.
                  </p>
                  {!findSectionByCode(selectedTdsUseCase.sectionCode) && (
                    <p className="mt-1 text-amber-100">This section is not seeded yet. Click "Seed Common Sections" in Setup, then come back and select this preset again.</p>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} type="date" value={deductionForm.transactionDate} onChange={(e) => setDeductionForm((prev) => ({ ...prev, transactionDate: e.target.value }))} />
              <select className={inputClass} value={deductionForm.transactionType} onChange={(e) => setDeductionForm((prev) => ({ ...prev, transactionType: e.target.value }))}>
                <option value="bill">Bill</option>
                <option value="payment">Payment</option>
                <option value="advance">Advance</option>
                <option value="journal">Journal</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <select className={inputClass} value={deductionForm.vendorId} onChange={(e) => selectVendorForDeduction(e.target.value)}>
              <option value="">Select vendor/deductee</option>
              {vendors.map((row: any) => <option key={row._id} value={row._id}>{row.name}</option>)}
            </select>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Deductee Name" value={deductionForm.deducteeName} onChange={(e) => setDeductionForm((prev) => ({ ...prev, deducteeName: e.target.value }))} />
              <input className={inputClass} placeholder="PAN" value={deductionForm.pan} onChange={(e) => setDeductionForm((prev) => ({ ...prev, pan: e.target.value.toUpperCase() }))} />
            </div>
            <select className={inputClass} required value={deductionForm.sectionId} onChange={(e) => setDeductionForm((prev) => ({ ...prev, sectionId: e.target.value }))}>
              <option value="">Select TDS section</option>
              {sections.map((row: any) => <option key={row._id} value={row._id}>{row.sectionCode} - {row.sectionName}</option>)}
            </select>
            <div>
              <p className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-400">Transaction Overrides</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input className={inputClass} type="number" step="0.001" placeholder="Rate override %" value={deductionForm.rateOverride} onChange={(e) => setDeductionForm((prev) => ({ ...prev, rateOverride: e.target.value }))} />
                <input className={inputClass} type="number" step="0.01" placeholder="Single transaction threshold" value={deductionForm.thresholdPerTransactionOverride} onChange={(e) => setDeductionForm((prev) => ({ ...prev, thresholdPerTransactionOverride: e.target.value }))} />
                <input className={inputClass} type="number" step="0.01" placeholder="Monthly threshold" value={deductionForm.thresholdMonthlyOverride} onChange={(e) => setDeductionForm((prev) => ({ ...prev, thresholdMonthlyOverride: e.target.value }))} />
                <input className={inputClass} type="number" step="0.01" placeholder="Annual threshold" value={deductionForm.thresholdAnnualOverride} onChange={(e) => setDeductionForm((prev) => ({ ...prev, thresholdAnnualOverride: e.target.value }))} />
              </div>
              <p className="mt-1 text-xs text-slate-400">Preset values override the section default for this transaction only; edit these fields if your accountant confirms a different rate or threshold.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} type="number" step="0.01" placeholder="Gross Amount" value={deductionForm.grossAmount} onChange={(e) => setDeductionForm((prev) => ({ ...prev, grossAmount: e.target.value }))} />
              <input className={inputClass} type="number" step="0.01" placeholder="Taxable Amount (optional)" value={deductionForm.taxableAmount} onChange={(e) => setDeductionForm((prev) => ({ ...prev, taxableAmount: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Reference No." value={deductionForm.referenceNo} onChange={(e) => setDeductionForm((prev) => ({ ...prev, referenceNo: e.target.value }))} />
              <input className={inputClass} placeholder="Source ID (optional)" value={deductionForm.sourceId} onChange={(e) => setDeductionForm((prev) => ({ ...prev, sourceId: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={deductionForm.postJournal} onChange={(e) => setDeductionForm((prev) => ({ ...prev, postJournal: e.target.checked }))} />
              Also post accounting journal: Dr vendor payable, Cr TDS payable
            </label>
            <textarea className={inputClass} rows={2} placeholder="Notes" value={deductionForm.notes} onChange={(e) => setDeductionForm((prev) => ({ ...prev, notes: e.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButtonClass} disabled={loading} onClick={calculateDeduction}>Preview Calculation</button>
              <button type="button" className={buttonClass} disabled={loading} onClick={recordDeduction}>Record Deduction</button>
            </div>
            {calculation && (
              <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">
                <p className="font-semibold">TDS Preview: {formatCurrency(calculation.tdsAmount || 0)} at {calculation.effectiveRate}%</p>
                {calculation.useCase?.label && <p>Use Case: {calculation.useCase.label}</p>}
                <p>Threshold: {calculation.thresholdReason}</p>
                <p>Financial Year: {calculation.financialYear} / {calculation.quarter}</p>
                {calculation.warnings?.map((warning: string) => <p key={warning} className="mt-1 text-amber-100">{warning}</p>)}
              </div>
            )}
          </div>

          {renderTransactionsTable(transactions, 'All TDS Transactions')}
        </div>
      )}

      {activeTab === 'challans' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
          <form onSubmit={recordChallan} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h3 className="font-semibold text-white">Record Government Challan</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} type="date" value={challanForm.paymentDate} onChange={(e) => setChallanForm((prev) => ({ ...prev, paymentDate: e.target.value }))} />
              <input className={inputClass} placeholder="Financial Year" value={challanForm.financialYear} onChange={(e) => setChallanForm((prev) => ({ ...prev, financialYear: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <select className={inputClass} value={challanForm.quarter} onChange={(e) => setChallanForm((prev) => ({ ...prev, quarter: e.target.value }))}>
                <option value="Q1">Q1 Apr-Jun</option>
                <option value="Q2">Q2 Jul-Sep</option>
                <option value="Q3">Q3 Oct-Dec</option>
                <option value="Q4">Q4 Jan-Mar</option>
              </select>
              <select className={inputClass} value={challanForm.sectionCode} onChange={(e) => setChallanForm((prev) => ({ ...prev, sectionCode: e.target.value }))}>
                <option value="">All sections by oldest due</option>
                {sections.map((row: any) => <option key={row._id} value={row.sectionCode}>{row.sectionCode}</option>)}
              </select>
            </div>
            <input className={inputClass} type="number" step="0.01" placeholder="Challan Amount" required value={challanForm.amount} onChange={(e) => setChallanForm((prev) => ({ ...prev, amount: e.target.value }))} />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="BSR Code" required value={challanForm.bsrCode} onChange={(e) => setChallanForm((prev) => ({ ...prev, bsrCode: e.target.value }))} />
              <input className={inputClass} placeholder="Challan Serial No." required value={challanForm.challanSerialNo} onChange={(e) => setChallanForm((prev) => ({ ...prev, challanSerialNo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="CIN (optional)" value={challanForm.cin} onChange={(e) => setChallanForm((prev) => ({ ...prev, cin: e.target.value.toUpperCase() }))} />
              <input className={inputClass} placeholder="Bank Name" value={challanForm.bankName} onChange={(e) => setChallanForm((prev) => ({ ...prev, bankName: e.target.value }))} />
            </div>
            <button className={buttonClass} disabled={loading}>Record Challan</button>
          </form>

          <ReportDataTable
            title="Challan History"
            data={challans}
            itemLabel="challans"
            searchPlaceholder="Search challans by serial, BSR, CIN, bank, section, or status"
            exportFileName={`tds-challans-${currentFinancialYear || 'current'}.csv`}
            filters={[
              { key: 'sectionCode', label: 'Section', getValue: (row: any) => String(row.sectionCode || 'All sections') },
              { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() },
              { key: 'quarter', label: 'Quarter', getValue: (row: any) => String(row.quarter || 'All') },
            ]}
            columns={[
              { key: 'paymentDate', header: 'Date', render: (row: any) => formatDate(row.paymentDate), exportValue: (row: any) => String(row.paymentDate || '').slice(0, 10), sortValue: (row: any) => row.paymentDate },
              { key: 'challanSerialNo', header: 'Serial', accessor: 'challanSerialNo' },
              { key: 'bsrCode', header: 'BSR', accessor: 'bsrCode' },
              { key: 'cin', header: 'CIN', render: (row: any) => row.cin || '-', exportValue: (row: any) => row.cin || '' },
              { key: 'sectionCode', header: 'Section', render: (row: any) => row.sectionCode || 'All sections', exportValue: (row: any) => row.sectionCode || '' },
              { key: 'amount', header: 'Amount', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
              { key: 'allocatedAmount', header: 'Allocated', render: (row: any) => formatCurrency(row.allocatedAmount || 0), exportValue: (row: any) => Number(row.allocatedAmount || 0), sortValue: (row: any) => Number(row.allocatedAmount || 0), align: 'right' },
              { key: 'unallocatedAmount', header: 'Unallocated', render: (row: any) => formatCurrency(row.unallocatedAmount || 0), exportValue: (row: any) => Number(row.unallocatedAmount || 0), sortValue: (row: any) => Number(row.unallocatedAmount || 0), align: 'right' },
              { key: 'bankName', header: 'Bank', render: (row: any) => row.bankName || '-', exportValue: (row: any) => row.bankName || '' },
              { key: 'status', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
            ]}
          />
        </div>
      )}

      {activeTab === 'returns' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form onSubmit={generateReturn} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h3 className="font-semibold text-white">Generate Draft TDS Return</h3>
            <p className="text-xs text-slate-400">This creates a draft text working file. Validate with the prescribed FVU process before filing.</p>
            <select className={inputClass} value={returnForm.formType} onChange={(e) => setReturnForm((prev) => ({ ...prev, formType: e.target.value }))}>
              <option value="24Q">24Q Salary</option>
              <option value="26Q">26Q Resident non-salary</option>
              <option value="27Q">27Q Non-resident</option>
              <option value="27EQ">27EQ TCS</option>
            </select>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Financial Year" value={returnForm.financialYear} onChange={(e) => setReturnForm((prev) => ({ ...prev, financialYear: e.target.value }))} />
              <select className={inputClass} value={returnForm.quarter} onChange={(e) => setReturnForm((prev) => ({ ...prev, quarter: e.target.value }))}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={returnForm.isCorrection} onChange={(e) => setReturnForm((prev) => ({ ...prev, isCorrection: e.target.checked }))} />
              Correction return
            </label>
            {returnForm.isCorrection && (
              <input className={inputClass} placeholder="Original Token No." value={returnForm.originalTokenNo} onChange={(e) => setReturnForm((prev) => ({ ...prev, originalTokenNo: e.target.value }))} />
            )}
            <textarea className={inputClass} rows={2} placeholder="Reviewer notes" value={returnForm.notes} onChange={(e) => setReturnForm((prev) => ({ ...prev, notes: e.target.value }))} />
            <button className={buttonClass} disabled={loading}>Generate Draft Return</button>
          </form>

          <ReportDataTable
            title="Return Drafts"
            data={returns}
            itemLabel="return drafts"
            searchPlaceholder="Search returns by form, period, status, acknowledgement, or file"
            exportFileName={`tds-return-drafts-${currentFinancialYear || 'current'}.csv`}
            filters={[
              { key: 'formType', label: 'Form', getValue: (row: any) => String(row.formType || '') },
              { key: 'quarter', label: 'Quarter', getValue: (row: any) => String(row.quarter || '') },
              { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() },
            ]}
            columns={[
              { key: 'formType', header: 'Form', accessor: 'formType' },
              { key: 'period', header: 'Period', render: (row: any) => `${row.financialYear || ''} ${row.quarter || ''}`.trim(), exportValue: (row: any) => `${row.financialYear || ''} ${row.quarter || ''}`.trim() },
              { key: 'totalRows', header: 'Rows', render: (row: any) => row.summary?.totalRows || 0, exportValue: (row: any) => Number(row.summary?.totalRows || 0), sortValue: (row: any) => Number(row.summary?.totalRows || 0), align: 'right' },
              { key: 'totalTds', header: 'TDS', render: (row: any) => formatCurrency(row.summary?.totalTds || 0), exportValue: (row: any) => Number(row.summary?.totalTds || 0), sortValue: (row: any) => Number(row.summary?.totalTds || 0), align: 'right' },
              { key: 'status', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
              { key: 'fvuValidationStatus', header: 'FVU', render: (row: any) => String(row.fvuValidationStatus || 'not_validated').replace(/_/g, ' ').toUpperCase(), exportValue: (row: any) => row.fvuValidationStatus || '' },
              { key: 'fileName', header: 'File', render: (row: any) => row.fileName || '-', exportValue: (row: any) => row.fileName || '' },
              {
                key: 'action',
                header: 'Action',
                render: (row: any) => (
                  <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={() => runAction(() => downloadBlob(`/api/accounting/tds/returns/${row._id}/download`, downloadHeaders))}>
                    Download TXT
                  </button>
                ),
                exportValue: () => '',
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'certificates' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form onSubmit={generateCertificate} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h3 className="font-semibold text-white">Generate Draft Certificate</h3>
            <select className={inputClass} value={certificateForm.deducteeProfileId} onChange={(e) => setCertificateForm((prev) => ({ ...prev, deducteeProfileId: e.target.value }))}>
              <option value="">All paid/filed deductions</option>
              {profiles.map((row: any) => <option key={row._id} value={row._id}>{row.deducteeName} {row.pan ? `(${row.pan})` : ''}</option>)}
            </select>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <select className={inputClass} value={certificateForm.formType} onChange={(e) => setCertificateForm((prev) => ({ ...prev, formType: e.target.value }))}>
                <option value="Form16A">Form 16A</option>
                <option value="Form16">Form 16</option>
                <option value="Form27D">Form 27D</option>
              </select>
              <select className={inputClass} value={certificateForm.quarter} onChange={(e) => setCertificateForm((prev) => ({ ...prev, quarter: e.target.value }))}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <input className={inputClass} placeholder="Financial Year" value={certificateForm.financialYear} onChange={(e) => setCertificateForm((prev) => ({ ...prev, financialYear: e.target.value }))} />
            <button className={buttonClass} disabled={loading}>Generate Certificate</button>
          </form>

          <ReportDataTable
            title="Certificates"
            data={certificates}
            itemLabel="certificates"
            searchPlaceholder="Search certificates by form, deductee, PAN, certificate number, period, or status"
            exportFileName={`tds-certificates-${currentFinancialYear || 'current'}.csv`}
            filters={[
              { key: 'formType', label: 'Form', getValue: (row: any) => String(row.formType || '') },
              { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() },
              { key: 'quarter', label: 'Quarter', getValue: (row: any) => String(row.quarter || 'Annual') },
            ]}
            columns={[
              { key: 'formType', header: 'Form', accessor: 'formType' },
              { key: 'certificateNumber', header: 'Certificate', render: (row: any) => row.certificateNumber || '-', exportValue: (row: any) => row.certificateNumber || '' },
              { key: 'deducteeName', header: 'Deductee', accessor: 'deducteeName' },
              { key: 'pan', header: 'PAN', render: (row: any) => row.pan || '-', exportValue: (row: any) => row.pan || '' },
              { key: 'period', header: 'Period', render: (row: any) => `${row.financialYear || ''} ${row.quarter || ''}`.trim(), exportValue: (row: any) => `${row.financialYear || ''} ${row.quarter || ''}`.trim() },
              { key: 'transactionCount', header: 'Txns', render: (row: any) => row.transactionIds?.length || 0, exportValue: (row: any) => Number(row.transactionIds?.length || 0), sortValue: (row: any) => Number(row.transactionIds?.length || 0), align: 'right' },
              { key: 'status', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
              {
                key: 'action',
                header: 'Action',
                render: (row: any) => (
                  <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={() => runAction(() => downloadBlob(`/api/accounting/tds/certificates/${row._id}/download`, downloadHeaders))}>
                    Download TXT
                  </button>
                ),
                exportValue: () => '',
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
          <form onSubmit={runReconciliation} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h3 className="font-semibold text-white">TRACES / Form 26AS Reconciliation</h3>
            <p className="text-xs text-slate-400">Paste CSV/JSON rows with referenceNo, PAN, and tdsAmount to find mismatches against books.</p>
            <select className={inputClass} value={reconciliationForm.sourceType} onChange={(e) => setReconciliationForm((prev) => ({ ...prev, sourceType: e.target.value }))}>
              <option value="form26as">Form 26AS</option>
              <option value="traces">TRACES</option>
              <option value="ais">AIS</option>
              <option value="manual">Manual</option>
            </select>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={inputClass} placeholder="Financial Year" value={reconciliationForm.financialYear} onChange={(e) => setReconciliationForm((prev) => ({ ...prev, financialYear: e.target.value }))} />
              <select className={inputClass} value={reconciliationForm.quarter} onChange={(e) => setReconciliationForm((prev) => ({ ...prev, quarter: e.target.value }))}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <textarea className={inputClass} rows={10} value={reconciliationForm.rawText} onChange={(e) => setReconciliationForm((prev) => ({ ...prev, rawText: e.target.value }))} />
            <button className={buttonClass} disabled={loading}>Run Reconciliation</button>
          </form>

          <ReportDataTable
            title="Reconciliation History"
            data={reconciliationRuns}
            itemLabel="reconciliation runs"
            searchPlaceholder="Search by source, financial year, quarter, notes, or mismatch counts"
            exportFileName={`tds-reconciliation-${currentFinancialYear || 'current'}.csv`}
            filters={[
              { key: 'sourceType', label: 'Source', getValue: (row: any) => String(row.sourceType || '').toUpperCase() },
              { key: 'quarter', label: 'Quarter', getValue: (row: any) => String(row.quarter || 'All') },
            ]}
            columns={[
              { key: 'createdAt', header: 'Date', render: (row: any) => formatDate(row.createdAt), exportValue: (row: any) => String(row.createdAt || '').slice(0, 10), sortValue: (row: any) => row.createdAt },
              { key: 'sourceType', header: 'Source', render: (row: any) => String(row.sourceType || '-').toUpperCase(), exportValue: (row: any) => String(row.sourceType || '').toUpperCase() },
              { key: 'period', header: 'Period', render: (row: any) => `${row.financialYear || ''} ${row.quarter || ''}`.trim(), exportValue: (row: any) => `${row.financialYear || ''} ${row.quarter || ''}`.trim() },
              { key: 'imported', header: 'Imported', render: (row: any) => row.summary?.imported || row.importedRows?.length || 0, exportValue: (row: any) => Number(row.summary?.imported || row.importedRows?.length || 0), sortValue: (row: any) => Number(row.summary?.imported || row.importedRows?.length || 0), align: 'right' },
              { key: 'matched', header: 'Matched', render: (row: any) => row.summary?.matched || 0, exportValue: (row: any) => Number(row.summary?.matched || 0), sortValue: (row: any) => Number(row.summary?.matched || 0), align: 'right' },
              { key: 'mismatches', header: 'Mismatches', render: (row: any) => row.summary?.mismatches || 0, exportValue: (row: any) => Number(row.summary?.mismatches || 0), sortValue: (row: any) => Number(row.summary?.mismatches || 0), align: 'right' },
              { key: 'missing', header: 'Missing', render: (row: any) => (row.summary?.missingInBooks || 0) + (row.summary?.missingInImport || 0), exportValue: (row: any) => Number((row.summary?.missingInBooks || 0) + (row.summary?.missingInImport || 0)), sortValue: (row: any) => Number((row.summary?.missingInBooks || 0) + (row.summary?.missingInImport || 0)), align: 'right' },
              { key: 'notes', header: 'Notes', render: (row: any) => row.notes || '-', exportValue: (row: any) => row.notes || '' },
            ]}
          />
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Working on TDS data...</p>}
    </div>
  );
};
