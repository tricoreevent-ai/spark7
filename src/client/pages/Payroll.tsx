import React, { useMemo, useState } from 'react';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { PaginationControls } from '../components/PaginationControls';
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
  totalPayable: number;
}

export const Payroll: React.FC = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);
  const rowsPagination = usePaginatedRows(rows, { initialPageSize: 10, resetDeps: [month] });

  const generate = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await fetchApiJson(apiUrl(`/api/payroll/generate?month=${month}`), { headers });
      setRows(data.data?.rows || []);
      setTotalPayout(Number(data.data?.totalPayout || 0));
      setMessage('Payroll generated successfully');
    } catch (e: any) {
      setError(e.message || 'Failed to generate payroll');
      setRows([]);
      setTotalPayout(0);
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
    doc.text(`Total Payout: ${formatCurrency(totalPayout)}`, 14, 22);

    let y = 30;
    doc.text('Code', 14, y);
    doc.text('Name', 35, y);
    doc.text('Type', 95, y);
    doc.text('Payable', 125, y);
    doc.text('OT', 150, y);
    doc.text('Base', 170, y);
    doc.text('OT Pay', 220, y);
    doc.text('Total', 255, y);
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
      doc.text(String(row.overtimePay.toFixed(2)), 220, y);
      doc.text(String(row.totalPayable.toFixed(2)), 255, y);
      y += 6;
    }

    doc.save(`payroll_${month}.pdf`);
  };

  const inputClass = 'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';

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
          <button onClick={exportCsv} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Export CSV</button>
          <button onClick={exportPdf} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400">Export PDF</button>
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
          <p className="text-xs text-gray-400">Total Payout</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">{formatCurrency(totalPayout)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400">Month</p>
          <p className="mt-1 text-xl font-semibold text-white">{month}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4">
        <table className="min-w-full divide-y divide-white/10">
          <thead>
            <tr>
              {['Code', 'Name', 'Type', 'Present', 'Half', 'Leave', 'Weekly Off', 'Absent', 'Payable Days', 'OT Hrs', 'Base', 'OT', 'Total'].map((header) => (
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
                <td className="px-2 py-2 text-sm font-semibold text-emerald-300">{formatCurrency(row.totalPayable)}</td>
              </tr>
            ))}
            {!rowsPagination.paginatedRows.length && (
              <tr><td colSpan={13} className="px-2 py-3 text-center text-sm text-gray-400">No payroll data generated yet.</td></tr>
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
