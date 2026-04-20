import React, { useMemo, useState } from 'react';
import { ValidationReport } from '../types';
import { formatDate, formatDateTime } from '../utils';

export const ReportList: React.FC<{
  reports: ValidationReport[];
  selectedReportId?: string;
  onSelect: (reportId: string) => void;
}> = ({ reports, selectedReportId, onSelect }) => {
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<'latest' | 'critical' | 'warning'>('latest');

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return reports
      .filter((report) => {
        const runAt = new Date(report.runAt).getTime();
        if (from && runAt < from) return false;
        if (to && runAt > to) return false;
        if (!normalizedQuery) return true;
        return [
          report._id,
          formatDate(report.periodStart),
          formatDate(report.periodEnd),
          String(report.summary.critical),
          String(report.summary.warning),
        ].join(' ').toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sort === 'critical') return b.summary.critical - a.summary.critical;
        if (sort === 'warning') return b.summary.warning - a.summary.warning;
        return new Date(b.runAt).getTime() - new Date(a.runAt).getTime();
      });
  }, [fromDate, query, reports, sort, toDate]);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Report Register</p>
          <h3 className="mt-1 text-lg font-bold text-white">Previous validation runs</h3>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search report"
            className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
          />
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
          />
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as any)}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
          >
            <option value="latest">Latest first</option>
            <option value="critical">Critical first</option>
            <option value="warning">Warning first</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-3 py-3">Run Date</th>
              <th className="px-3 py-3">Period</th>
              <th className="px-3 py-3">Critical</th>
              <th className="px-3 py-3">Warning</th>
              <th className="px-3 py-3">Passed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {filteredReports.map((report) => (
              <tr
                key={report._id}
                onClick={() => onSelect(report._id)}
                className={`cursor-pointer transition hover:bg-white/[0.04] ${
                  selectedReportId === report._id ? 'bg-cyan-500/10' : ''
                }`}
              >
                <td className="px-3 py-3 font-semibold text-white">{formatDateTime(report.runAt)}</td>
                <td className="px-3 py-3 text-slate-300">{formatDate(report.periodStart)} to {formatDate(report.periodEnd)}</td>
                <td className="px-3 py-3 text-rose-200">{report.summary.critical}</td>
                <td className="px-3 py-3 text-amber-200">{report.summary.warning}</td>
                <td className="px-3 py-3 text-emerald-200">{report.summary.passed}</td>
              </tr>
            ))}
            {filteredReports.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={5}>
                  No reports match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};
