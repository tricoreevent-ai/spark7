import React, { useMemo, useState } from 'react';
import { ValidationCheckDetail, ValidationReport } from '../types';
import { formatAmount, formatDate, statusClass } from '../utils';

const categoryForCheck = (checkName: string): string => {
  const value = checkName.toLowerCase();
  if (value.includes('tds') || value.includes('gst')) return 'Compliance';
  if (value.includes('vendor') || value.includes('customer')) return 'Sub-ledgers';
  if (value.includes('cash') || value.includes('bank')) return 'Books';
  if (value.includes('balance') || value.includes('trial') || value.includes('double')) return 'Core Accounting';
  return 'Controls';
};

export const DetailedReport: React.FC<{
  report?: ValidationReport;
  onDrilldown: (detail: ValidationCheckDetail) => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
  canRepair?: boolean;
  repairing?: boolean;
  onRepair?: () => void | Promise<void>;
}> = ({ canRepair, onDrilldown, onExportExcel, onExportPdf, onRepair, repairing, report }) => {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    'Core Accounting': true,
    Compliance: true,
  });
  const [whyOpen, setWhyOpen] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const groups = new Map<string, ValidationCheckDetail[]>();
    (report?.details || []).forEach((detail) => {
      const category = categoryForCheck(detail.checkName);
      groups.set(category, [...(groups.get(category) || []), detail]);
    });
    return Array.from(groups.entries());
  }, [report?.details]);

  if (!report) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-slate-400">
        Select a validation run to see the accountant review details.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Detailed Report</p>
          <h3 className="mt-1 text-xl font-black text-white">{formatDate(report.periodStart)} to {formatDate(report.periodEnd)}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onRepair?.()}
            disabled={!canRepair || repairing}
            className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {repairing ? 'Fixing Database...' : 'Fix Repairable Issues'}
          </button>
          <button onClick={onExportPdf} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
            Export PDF
          </button>
          <button onClick={onExportExcel} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-300">
            Export Excel
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {grouped.map(([category, checks]) => {
          const isOpen = openCategories[category] ?? false;
          const failedCount = checks.filter((check) => check.status === 'FAIL').length;
          return (
            <section key={category} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35">
              <button
                type="button"
                onClick={() => setOpenCategories((current) => ({ ...current, [category]: !isOpen }))}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span>
                  <span className="text-sm font-black text-white">{category}</span>
                  <span className="ml-2 text-xs text-slate-400">{checks.length} checks, {failedCount} finding(s)</span>
                </span>
                <span className="text-slate-400">{isOpen ? 'Hide' : 'Show'}</span>
              </button>

              {isOpen ? (
                <div className="divide-y divide-white/8">
                  {checks.map((detail) => {
                    const whyKey = `${category}-${detail.checkName}`;
                    const hasDrilldown = detail.status === 'FAIL' || detail.rawDataKey;
                    return (
                      <article key={detail.checkName} className="p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-bold text-white">{detail.checkName}</h4>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${statusClass(detail.status, detail.severity)}`}>
                                {detail.status === 'PASS' ? 'Passed' : detail.severity}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-400">
                              Difference: <span className="font-semibold text-white">{formatAmount(detail.diff || 0)}</span>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setWhyOpen((current) => ({ ...current, [whyKey]: !current[whyKey] }))}
                              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
                            >
                              Why?
                            </button>
                            {hasDrilldown ? (
                              <button
                                type="button"
                                onClick={() => onDrilldown(detail)}
                                className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950 hover:bg-cyan-100"
                              >
                                Drill down
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {whyOpen[whyKey] ? (
                          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Likely causes</p>
                            <ul className="mt-2 space-y-1 text-sm text-slate-300">
                              {(detail.possibleCauses || ['No likely causes supplied.']).map((cause) => (
                                <li key={cause}>{cause}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {detail.status === 'FAIL' ? (
                          <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Fix suggestion</p>
                            <p className="mt-2 text-sm text-slate-100">{detail.suggestedFix}</p>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};
