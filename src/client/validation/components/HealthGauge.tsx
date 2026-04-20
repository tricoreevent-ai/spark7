import React from 'react';
import { ValidationReport } from '../types';
import { healthScore } from '../utils';

export const HealthGauge: React.FC<{ report?: ValidationReport }> = ({ report }) => {
  const score = healthScore(report);
  const tone = score >= 85 ? 'from-emerald-400 to-cyan-300' : score >= 65 ? 'from-amber-300 to-orange-400' : 'from-rose-400 to-orange-500';

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Compliance Health</p>
          <h3 className="mt-2 text-2xl font-black text-white">{score}% compliant</h3>
          <p className="mt-1 text-sm text-slate-400">Weighted score based on critical, warning, and info findings.</p>
        </div>
        <div className="grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/[0.04]">
          <span className="text-xl font-black text-white">{score}</span>
        </div>
      </div>
      <div className="mt-5 h-4 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} shadow-[0_0_22px_rgba(34,211,238,0.24)] transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};
