import React, { useEffect, useMemo, useState } from 'react';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { PaginationControls } from '../components/PaginationControls';
import { FloatingField } from '../components/FloatingField';
import { ActionIconButton } from '../components/ActionIconButton';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { jsPDF } from 'jspdf';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

interface PayrollRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  employmentType: string;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  weeklyOffDays: number;
  payableDays: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  arrearsPay?: number;
  grossPay: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  professionalTax: number;
  tdsAmount: number;
  totalDeductions: number;
  totalEmployerContribution: number;
  netPay: number;
  totalPayable: number;
}

interface EmployeeOption {
  _id: string;
  employeeCode: string;
  name: string;
  monthlySalary?: number;
}

export const Payroll: React.FC = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [totalEmployerContribution, setTotalEmployerContribution] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [arrears, setArrears] = useState<any[]>([]);
  const [form16Rows, setForm16Rows] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [challanType, setChallanType] = useState<'pf' | 'esi' | 'pt' | 'tds'>('pf');
  const [arrearForm, setArrearForm] = useState({
    employeeId: '',
    effectiveMonth: month,
    payoutMonth: month,
    previousMonthlySalary: '',
    revisedMonthlySalary: '',
    reason: '',
    applyRevision: true,
  });
  const [form16Year, setForm16Year] = useState(() => {
    const today = new Date();
    const startYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  });
  const [form16EmployeeId, setForm16EmployeeId] = useState('');
  const [form16Options, setForm16Options] = useState({
    assessmentYear: '',
    employerAddress: '',
    employeeAddress: '',
    citTds: '',
    responsiblePersonName: '',
    responsiblePersonDesignation: '',
    standardDeduction: '75000',
    perquisites17_2: '0',
    profits17_3: '0',
    salaryFromOtherEmployers: '0',
    travelConcessionExemption: '0',
    gratuityExemption: '0',
    pensionCommutationExemption: '0',
    leaveEncashmentExemption: '0',
    hraExemption: '0',
    otherSection10Exemption: '0',
    entertainmentAllowance: '0',
    housePropertyIncome: '0',
    otherSourcesIncome: '0',
    deduction80C: '0',
    deduction80CCC: '0',
    deduction80CCD1: '0',
    deduction80CCD1B: '0',
    deduction80CCD2: '0',
    deduction80D: '0',
    deduction80E: '0',
    deduction80G: '0',
    deduction80TTA: '0',
    otherChapterVIADeductions: '0',
    taxOnTotalIncome: '',
    rebate87A: '0',
    surcharge: '0',
    healthEducationCess: '',
    relief89: '0',
    q1ReceiptNumber: '',
    q2ReceiptNumber: '',
    q3ReceiptNumber: '',
    q4ReceiptNumber: '',
  });
  const [settlementForm, setSettlementForm] = useState({
    employeeId: '',
    terminationDate: new Date().toISOString().slice(0, 10),
    lastWorkingDate: new Date().toISOString().slice(0, 10),
    noticePayDays: '0',
    leaveEncashmentDays: '0',
    gratuityAmount: '',
    otherEarnings: '0',
    recoveries: '0',
    tdsAmount: '0',
    deactivateEmployee: true,
  });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);
  const rowsPagination = usePaginatedRows(rows, { initialPageSize: 10, resetDeps: [month] });
  const updateForm16Option = (field: keyof typeof form16Options, value: string) => {
    setForm16Options((prev) => ({ ...prev, [field]: value }));
  };
  const form16PayloadOptions = () => {
    const numericFields = [
      'standardDeduction',
      'perquisites17_2',
      'profits17_3',
      'salaryFromOtherEmployers',
      'travelConcessionExemption',
      'gratuityExemption',
      'pensionCommutationExemption',
      'leaveEncashmentExemption',
      'hraExemption',
      'otherSection10Exemption',
      'entertainmentAllowance',
      'housePropertyIncome',
      'otherSourcesIncome',
      'deduction80C',
      'deduction80CCC',
      'deduction80CCD1',
      'deduction80CCD1B',
      'deduction80CCD2',
      'deduction80D',
      'deduction80E',
      'deduction80G',
      'deduction80TTA',
      'otherChapterVIADeductions',
      'taxOnTotalIncome',
      'rebate87A',
      'surcharge',
      'healthEducationCess',
      'relief89',
    ] as const;
    const payload: Record<string, any> = { ...form16Options };
    numericFields.forEach((field) => {
      if (form16Options[field] !== '') payload[field] = Number(form16Options[field] || 0);
    });
    return payload;
  };

  const fetchCompliance = async () => {
    const [challanResp, arrearResp, form16Resp, settlementResp] = await Promise.all([
      fetchApiJson(apiUrl('/api/payroll/challans'), { headers }),
      fetchApiJson(apiUrl('/api/payroll/arrears'), { headers }),
      fetchApiJson(apiUrl(`/api/payroll/form16?financialYear=${encodeURIComponent(form16Year)}`), { headers }),
      fetchApiJson(apiUrl('/api/payroll/settlements'), { headers }),
    ]);
    setChallans(challanResp.data || []);
    setArrears(arrearResp.data || []);
    setForm16Rows(form16Resp.data || []);
    setSettlements(settlementResp.data || []);
  };

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetchApiJson(apiUrl('/api/employees'), { headers });
        setEmployees(response.data || []);
        await fetchCompliance();
      } catch {
        // Compliance panels stay usable after the next successful action.
      }
    })();
  }, [headers, form16Year]);

  const generate = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await fetchApiJson(apiUrl(`/api/payroll/generate?month=${month}`), { headers });
      setRows(data.data?.rows || []);
      setTotalPayout(Number(data.data?.totalPayout || 0));
      setTotalEmployerContribution(Number(data.data?.totalEmployerContribution || 0));
      setMessage('Payroll generated successfully');
    } catch (e: any) {
      setError(e.message || 'Failed to generate payroll');
      setRows([]);
      setTotalPayout(0);
      setTotalEmployerContribution(0);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    setError('');
    try {
      const response = await fetch(apiUrl(`/api/payroll/export/csv?month=${month}`), { headers });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to export CSV');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `payroll_${month}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'Failed to export CSV');
    }
  };

  const exportPdf = () => {
    if (!rows.length) {
      setError('Generate payroll first before PDF export');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Sarva Payroll - ${month}`, 14, 14);
    doc.setFontSize(10);
    doc.text(`Net Payout: ${formatCurrency(totalPayout)} | Employer PF/ESI: ${formatCurrency(totalEmployerContribution)}`, 14, 22);

    let y = 30;
    doc.text('Code', 14, y);
    doc.text('Name', 35, y);
    doc.text('Type', 95, y);
    doc.text('Payable', 125, y);
    doc.text('OT', 150, y);
    doc.text('Base', 170, y);
    doc.text('OT Pay', 205, y);
    doc.text('Arrears', 225, y);
    doc.text('Gross', 247, y);
    doc.text('Deduct', 267, y);
    doc.text('Net', 285, y);
    y += 6;

    for (const row of rows) {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      doc.text(String(row.employeeCode), 14, y);
      doc.text(String(row.name).slice(0, 28), 35, y);
      doc.text(String(row.employmentType), 95, y);
      doc.text(String(row.payableDays), 125, y);
      doc.text(String(row.overtimeHours), 150, y);
      doc.text(String(row.basePay.toFixed(2)), 170, y);
      doc.text(String(row.overtimePay.toFixed(2)), 205, y);
      doc.text(String(Number(row.arrearsPay || 0).toFixed(2)), 225, y);
      doc.text(String(row.grossPay.toFixed(2)), 247, y);
      doc.text(String(row.totalDeductions.toFixed(2)), 267, y);
      doc.text(String(row.netPay.toFixed(2)), 285, y);
      y += 6;
    }

    doc.save(`payroll_${month}.pdf`);
  };

  const postJson = async (path: string, body: Record<string, any>) => {
    const response = await fetchApiJson(apiUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    await fetchCompliance();
    return response;
  };

  const downloadFile = async (path: string, fallbackName: string) => {
    const response = await fetch(apiUrl(path), { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Download failed');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename=([^;]+)/i);
    anchor.download = match?.[1]?.replace(/"/g, '') || fallbackName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runChallanGeneration = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await postJson('/api/payroll/challans/generate', {
        month,
        challanType,
      });
      setMessage(response.message || 'Payroll challan generated');
    } catch (e: any) {
      setError(e.message || 'Failed to generate challan');
    } finally {
      setLoading(false);
    }
  };

  const createArrear = async () => {
    setError('');
    setMessage('');
    if (!arrearForm.employeeId) {
      setError('Select employee for arrears');
      return;
    }
    setLoading(true);
    try {
      const response = await postJson('/api/payroll/arrears', {
        ...arrearForm,
        previousMonthlySalary: Number(arrearForm.previousMonthlySalary || 0),
        revisedMonthlySalary: Number(arrearForm.revisedMonthlySalary || 0),
      });
      setMessage(response.message || 'Arrears saved');
      await generate();
    } catch (e: any) {
      setError(e.message || 'Failed to create arrears');
    } finally {
      setLoading(false);
    }
  };

  const generateForm16 = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await postJson('/api/payroll/form16/generate', {
        financialYear: form16Year,
        employeeId: form16EmployeeId || undefined,
        ...form16PayloadOptions(),
      });
      setMessage(response.message || 'Form 16 generated');
    } catch (e: any) {
      setError(e.message || 'Failed to generate Form 16');
    } finally {
      setLoading(false);
    }
  };

  const createSettlement = async () => {
    setError('');
    setMessage('');
    if (!settlementForm.employeeId) {
      setError('Select employee for full and final settlement');
      return;
    }
    setLoading(true);
    try {
      const response = await postJson('/api/payroll/settlements', {
        ...settlementForm,
        noticePayDays: Number(settlementForm.noticePayDays || 0),
        leaveEncashmentDays: Number(settlementForm.leaveEncashmentDays || 0),
        gratuityAmount: settlementForm.gratuityAmount === '' ? undefined : Number(settlementForm.gratuityAmount),
        otherEarnings: Number(settlementForm.otherEarnings || 0),
        recoveries: Number(settlementForm.recoveries || 0),
        tdsAmount: Number(settlementForm.tdsAmount || 0),
      });
      setMessage(response.message || 'Full and final settlement created');
    } catch (e: any) {
      setError(e.message || 'Failed to create settlement');
    } finally {
      setLoading(false);
    }
  };

  const form16MetaFields: Array<{ field: keyof typeof form16Options; label: string; rows?: number; className?: string }> = [
    { field: 'assessmentYear', label: 'Assessment Year (auto if blank)' },
    { field: 'citTds', label: 'CIT (TDS)' },
    { field: 'responsiblePersonName', label: 'Responsible person name' },
    { field: 'responsiblePersonDesignation', label: 'Responsible person designation' },
    { field: 'employerAddress', label: 'Employer address override', rows: 2, className: 'md:col-span-2' },
    { field: 'employeeAddress', label: 'Employee address override (single employee only)', rows: 2, className: 'md:col-span-2' },
  ];

  const form16NumericFields: Array<{ field: keyof typeof form16Options; label: string }> = [
    { field: 'standardDeduction', label: 'Standard deduction' },
    { field: 'perquisites17_2', label: 'Perquisites 17(2)' },
    { field: 'profits17_3', label: 'Profits 17(3)' },
    { field: 'salaryFromOtherEmployers', label: 'Other employer salary' },
    { field: 'hraExemption', label: 'HRA exemption 10(13A)' },
    { field: 'otherSection10Exemption', label: 'Other Section 10 exemption' },
    { field: 'travelConcessionExemption', label: 'Travel concession 10(5)' },
    { field: 'gratuityExemption', label: 'Gratuity 10(10)' },
    { field: 'leaveEncashmentExemption', label: 'Leave encashment 10(10AA)' },
    { field: 'pensionCommutationExemption', label: 'Pension commutation 10(10A)' },
    { field: 'entertainmentAllowance', label: 'Entertainment allowance' },
    { field: 'housePropertyIncome', label: 'House property income/loss' },
    { field: 'otherSourcesIncome', label: 'Other sources income' },
    { field: 'deduction80C', label: '80C deduction' },
    { field: 'deduction80CCC', label: '80CCC deduction' },
    { field: 'deduction80CCD1', label: '80CCD(1) deduction' },
    { field: 'deduction80CCD2', label: '80CCD(2) deduction' },
    { field: 'deduction80D', label: '80D deduction' },
    { field: 'deduction80E', label: '80E deduction' },
    { field: 'deduction80G', label: '80G deduction' },
    { field: 'deduction80TTA', label: '80TTA deduction' },
    { field: 'deduction80CCD1B', label: '80CCD(1B) deduction' },
    { field: 'otherChapterVIADeductions', label: 'Other Chapter VI-A deductions' },
    { field: 'taxOnTotalIncome', label: 'Tax on total income (auto from TDS if blank)' },
    { field: 'healthEducationCess', label: 'Health and education cess' },
    { field: 'rebate87A', label: 'Rebate 87A' },
    { field: 'surcharge', label: 'Surcharge' },
    { field: 'relief89', label: 'Relief 89' },
  ];

  const form16ReceiptFields: Array<{ field: keyof typeof form16Options; label: string }> = [
    { field: 'q1ReceiptNumber', label: 'Q1 24Q receipt no.' },
    { field: 'q2ReceiptNumber', label: 'Q2 24Q receipt no.' },
    { field: 'q3ReceiptNumber', label: 'Q3 24Q receipt no.' },
    { field: 'q4ReceiptNumber', label: 'Q4 24Q receipt no.' },
  ];

  const inputClass = 'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';
  const buttonClass = 'rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-70';

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Monthly Payroll</h1>
          <p className="text-sm text-gray-300">Generate payroll from attendance, weekly off shifts, and overtime.</p>
          <div className="mt-2">
            <ManualHelpLink anchor="transaction-payroll" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Month</label>
            <input type="month" className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <button onClick={generate} disabled={loading} className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-70">
            {loading ? 'Generating...' : 'Generate'}
          </button>
          <ActionIconButton kind="exportCsv" onClick={exportCsv} title="Export CSV" />
          <ActionIconButton kind="exportPdf" onClick={exportPdf} title="Export PDF" />
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Employees</p>
          <p className="mt-1 text-xl font-semibold text-white">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Net Payout</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">{formatCurrency(totalPayout)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Employer PF/ESI</p>
          <p className="mt-1 text-xl font-semibold text-cyan-300">{formatCurrency(totalEmployerContribution)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Statutory Challans</h2>
              <p className="text-xs text-gray-400">Generate PF, ESI, PT, and salary TDS challan worksheets from payroll rows.</p>
            </div>
            <div className="flex gap-2">
              <select className={inputClass} value={challanType} onChange={(e) => setChallanType(e.target.value as any)}>
                <option value="pf" className="bg-gray-900">PF</option>
                <option value="esi" className="bg-gray-900">ESI</option>
                <option value="pt" className="bg-gray-900">PT</option>
                <option value="tds" className="bg-gray-900">TDS</option>
              </select>
              <button type="button" className={buttonClass} disabled={loading} onClick={runChallanGeneration}>Generate</button>
            </div>
          </div>
          <div className="mt-3 max-h-52 overflow-y-auto divide-y divide-white/10">
            {challans.slice(0, 8).map((row) => (
              <div key={row._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-gray-200">{String(row.challanType || '').toUpperCase()} {row.periodKey} | {formatCurrency(row.totalAmount || 0)}</span>
                <button className="text-xs font-semibold text-cyan-300 hover:text-cyan-200" onClick={() => void downloadFile(`/api/payroll/challans/${row._id}/download`, `${row.challanType}-${row.periodKey}.txt`)}>
                  Download
                </button>
              </div>
            ))}
            {!challans.length && <p className="py-3 text-sm text-gray-400">No payroll challans generated yet.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Arrears Calculation</h2>
          <p className="text-xs text-gray-400">Create retroactive salary revision arrears and include them in payout month payroll.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <FloatingField
              label="Employee"
              value={arrearForm.employeeId}
              options={[
                { value: '', label: 'Select employee' },
                ...employees.map((employee) => ({ value: employee._id, label: `${employee.employeeCode} - ${employee.name}` })),
              ]}
              onChange={(value) => {
                const employee = employees.find((row) => row._id === value);
              setArrearForm((prev) => ({
                ...prev,
                  employeeId: value,
                previousMonthlySalary: employee?.monthlySalary ? String(employee.monthlySalary) : prev.previousMonthlySalary,
              }));
              }}
            />
            <FloatingField label="Effective month" type="month" value={arrearForm.effectiveMonth} onChange={(value) => setArrearForm((prev) => ({ ...prev, effectiveMonth: value }))} />
            <FloatingField label="Payout month" type="month" value={arrearForm.payoutMonth} onChange={(value) => setArrearForm((prev) => ({ ...prev, payoutMonth: value }))} />
            <FloatingField label="Previous salary" type="number" value={arrearForm.previousMonthlySalary} onChange={(value) => setArrearForm((prev) => ({ ...prev, previousMonthlySalary: value }))} />
            <FloatingField label="Revised salary" type="number" value={arrearForm.revisedMonthlySalary} onChange={(value) => setArrearForm((prev) => ({ ...prev, revisedMonthlySalary: value }))} />
            <FloatingField label="Reason" value={arrearForm.reason} onChange={(value) => setArrearForm((prev) => ({ ...prev, reason: value }))} />
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-300">
            <input type="checkbox" checked={arrearForm.applyRevision} onChange={(e) => setArrearForm((prev) => ({ ...prev, applyRevision: e.target.checked }))} />
            Update employee salary after saving
          </label>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">{arrears.length} arrear record(s)</span>
            <button type="button" className={buttonClass} disabled={loading} onClick={createArrear}>Save Arrears</button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Form 16</h2>
          <p className="text-xs text-gray-400">Generate TRACES-style Form 16 PDFs from payroll, salary TDS, employee PAN/address, and company PAN/TAN details.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <FloatingField label="Financial Year e.g. 2025-26" value={form16Year} onChange={setForm16Year} />
            <FloatingField
              label="Employee"
              value={form16EmployeeId}
              onChange={setForm16EmployeeId}
              options={[
                { value: '', label: 'All employees' },
                ...employees.map((employee) => ({ value: employee._id, label: `${employee.employeeCode} - ${employee.name}` })),
              ]}
            />
            <button type="button" className={buttonClass} disabled={loading} onClick={generateForm16}>Generate Form 16</button>
          </div>
          <details className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-cyan-200">Form 16 data collection and adjustments</summary>
            <p className="mt-2 text-xs text-gray-400">Blank values are collected automatically from Business/TDS company settings, employee master, salary payments, and payroll TDS challans. Use these fields when the certificate needs accountant-reviewed adjustments.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {form16MetaFields.map((field) => (
                <FloatingField
                  key={field.field}
                  label={field.label}
                  rows={field.rows}
                  className={field.className}
                  value={form16Options[field.field]}
                  onChange={(value) => updateForm16Option(field.field, value)}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {form16NumericFields.map((field) => (
                <FloatingField
                  key={field.field}
                  label={field.label}
                  type="number"
                  step="0.01"
                  value={form16Options[field.field]}
                  onChange={(value) => updateForm16Option(field.field, value)}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              {form16ReceiptFields.map((field) => (
                <FloatingField
                  key={field.field}
                  label={field.label}
                  value={form16Options[field.field]}
                  onChange={(value) => updateForm16Option(field.field, value)}
                />
              ))}
            </div>
          </details>
          <div className="mt-3 max-h-44 overflow-y-auto divide-y divide-white/10">
            {form16Rows.slice(0, 8).map((row) => (
              <div key={row._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-gray-200">{row.employeeCode} - {row.employeeName} | Taxable {formatCurrency(row.taxableIncome || 0)} | TDS {formatCurrency(row.tdsDeducted || 0)}</span>
                <ActionIconButton kind="downloadPdf" onClick={() => void downloadFile(`/api/payroll/form16/${row._id}/download`, `form16-${row.employeeCode}.pdf`)} title="Download PDF" className="h-8 w-8" />
              </div>
            ))}
            {!form16Rows.length && <p className="py-3 text-sm text-gray-400">No Form 16 drafts generated yet.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Full & Final Settlement</h2>
          <p className="text-xs text-gray-400">Calculate notice pay, leave encashment, gratuity, recoveries, and net settlement.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <FloatingField
              label="Employee"
              value={settlementForm.employeeId}
              options={[
                { value: '', label: 'Select employee' },
                ...employees.map((employee) => ({ value: employee._id, label: `${employee.employeeCode} - ${employee.name}` })),
              ]}
              onChange={(value) => setSettlementForm((prev) => ({ ...prev, employeeId: value }))}
            />
            <FloatingField label="Termination date" type="date" value={settlementForm.terminationDate} onChange={(value) => setSettlementForm((prev) => ({ ...prev, terminationDate: value, lastWorkingDate: value }))} />
            <FloatingField label="Notice pay days" type="number" value={settlementForm.noticePayDays} onChange={(value) => setSettlementForm((prev) => ({ ...prev, noticePayDays: value }))} />
            <FloatingField label="Leave encashment days" type="number" value={settlementForm.leaveEncashmentDays} onChange={(value) => setSettlementForm((prev) => ({ ...prev, leaveEncashmentDays: value }))} />
            <FloatingField label="Gratuity override (optional)" type="number" value={settlementForm.gratuityAmount} onChange={(value) => setSettlementForm((prev) => ({ ...prev, gratuityAmount: value }))} />
            <FloatingField label="Recoveries" type="number" value={settlementForm.recoveries} onChange={(value) => setSettlementForm((prev) => ({ ...prev, recoveries: value }))} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">{settlements.length} settlement record(s)</span>
            <button type="button" className={buttonClass} disabled={loading} onClick={createSettlement}>Calculate Settlement</button>
          </div>
          <div className="mt-2 max-h-32 overflow-y-auto divide-y divide-white/10">
            {settlements.slice(0, 5).map((row) => (
              <div key={row._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-gray-200">{row.employeeCode} | Net {formatCurrency(row.netSettlement || 0)}</span>
                <button className="text-xs font-semibold text-cyan-300 hover:text-cyan-200" onClick={() => void downloadFile(`/api/payroll/settlements/${row._id}/download`, `full-final-${row.employeeCode}.txt`)}>
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
        <table className="min-w-full divide-y divide-white/10">
          <thead>
            <tr>
              {['Code', 'Name', 'Type', 'Present', 'Half', 'Leave', 'Weekly Off', 'Absent', 'Payable Days', 'OT Hrs', 'Base', 'OT', 'Arrears', 'Gross', 'PF', 'ESI', 'PT', 'TDS', 'Deductions', 'Employer', 'Net'].map((header) => (
                <th key={header} className="px-2 py-2 text-left text-xs font-semibold text-gray-300">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rowsPagination.paginatedRows.map((row) => (
              <tr key={row.employeeId}>
                <td className="px-2 py-2 text-sm text-white">{row.employeeCode}</td>
                <td className="px-2 py-2 text-sm text-white">{row.name}</td>
                <td className="px-2 py-2 text-sm uppercase text-gray-300">{row.employmentType}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.presentDays}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.halfDays}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.leaveDays}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.weeklyOffDays}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.absentDays}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.payableDays}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{row.overtimeHours}</td>
                <td className="px-2 py-2 text-sm text-white">{formatCurrency(row.basePay)}</td>
                <td className="px-2 py-2 text-sm text-white">{formatCurrency(row.overtimePay)}</td>
                <td className="px-2 py-2 text-sm text-cyan-200">{formatCurrency(row.arrearsPay || 0)}</td>
                <td className="px-2 py-2 text-sm text-white">{formatCurrency(row.grossPay)}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(row.pfEmployee)}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(row.esiEmployee)}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(row.professionalTax)}</td>
                <td className="px-2 py-2 text-sm text-gray-300">{formatCurrency(row.tdsAmount)}</td>
                <td className="px-2 py-2 text-sm text-amber-200">{formatCurrency(row.totalDeductions)}</td>
                <td className="px-2 py-2 text-sm text-cyan-200">{formatCurrency(row.totalEmployerContribution)}</td>
                <td className="px-2 py-2 text-sm font-semibold text-emerald-300">{formatCurrency(row.netPay)}</td>
              </tr>
            ))}
            {!rowsPagination.paginatedRows.length && (
              <tr><td colSpan={21} className="px-2 py-3 text-center text-sm text-gray-400">No payroll data generated yet.</td></tr>
            )}
          </tbody>
        </table>
        <PaginationControls
          currentPage={rowsPagination.currentPage}
          totalPages={rowsPagination.totalPages}
          totalRows={rowsPagination.totalRows}
          pageSize={rowsPagination.pageSize}
          startIndex={rowsPagination.startIndex}
          endIndex={rowsPagination.endIndex}
          itemLabel="payroll rows"
          onPageChange={rowsPagination.setCurrentPage}
          onPageSizeChange={rowsPagination.setPageSize}
        />
      </div>
    </div>
  );
};
