import React from 'react';
import { ValidationReport } from '../types';

const cardClass = 'rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

export const SummaryCards: React.FC<{ report?: ValidationReport }> = ({ report }) => {
  const summary = report?.summary || { totalChecks: 0, critical: 0, warning: 0, info: 0, passed: 0 };
  const cards = [
    { label: 'Total checks', value: summary.totalChecks, tone: 'text-slate-100', hint: 'Rules executed' },
    { label: 'Critical', value: summary.critical, tone: 'text-rose-200', hint: 'Needs CA review' },
    { label: 'Warning', value: summary.warning, tone: 'text-amber-200', hint: 'Follow-up required' },
    { label: 'Passed', value: summary.passed, tone: 'text-emerald-200', hint: 'Healthy checks' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className={cardClass}>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className={`text-3xl font-black ${card.tone}`}>{card.value}</p>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-slate-300">
              {card.hint}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
