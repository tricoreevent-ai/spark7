import React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ValidationReport } from '../types';
import { formatDate } from '../utils';

export const TimelineChart: React.FC<{ reports: ValidationReport[] }> = ({ reports }) => {
  const data = [...reports]
    .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime())
    .map((report) => ({
      run: formatDate(report.runAt),
      critical: report.summary.critical,
      warning: report.summary.warning,
      passed: report.summary.passed,
    }));

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Run Timeline</p>
        <h3 className="mt-1 text-lg font-bold text-white">Critical and warning trend</h3>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis dataKey="run" stroke="#94a3b8" fontSize={12} />
            <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 14,
                color: '#fff',
              }}
            />
            <Line type="monotone" dataKey="critical" stroke="#fb7185" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="warning" stroke="#fbbf24" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="passed" stroke="#34d399" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
