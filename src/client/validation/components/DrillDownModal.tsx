import React, { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { ValidationDrilldownResponse } from '../types';

export const DrillDownModal: React.FC<{
  open: boolean;
  loading?: boolean;
  data?: ValidationDrilldownResponse;
  error?: string;
  onClose: () => void;
  onMarkFalsePositive: (reason: string) => Promise<void>;
}> = ({ data, error, loading, onClose, onMarkFalsePositive, open }) => {
  const [reason, setReason] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy JSON');
  const [saving, setSaving] = useState(false);

  useEscapeKey(onClose, { enabled: open });

  if (!open) return null;

  const json = JSON.stringify(data?.drilldown || data || {}, null, 2);

  const copyJson = async () => {
    await navigator.clipboard.writeText(json);
    setCopyLabel('Copied');
    window.setTimeout(() => setCopyLabel('Copy JSON'), 1400);
  };

  const saveFalsePositive = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await onMarkFalsePositive(reason.trim());
      setReason('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="mx-auto flex max-h-[92vh] max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Drilldown</p>
            <h3 className="mt-1 text-xl font-black text-white">{data?.checkName || 'Loading finding details'}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copyJson} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
              {copyLabel}
            </button>
            <button onClick={onClose} className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-950 hover:bg-cyan-100">
              Close
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
            {loading ? (
              <p className="text-slate-300">Loading offending records...</p>
            ) : error ? (
              <p className="text-rose-200">{error}</p>
            ) : (
              <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">
                {json}
              </pre>
            )}
          </div>

          <aside className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-bold text-white">Mark as false positive</p>
            <p className="mt-2 text-xs text-slate-400">
              This saves feedback only in the validation module. Existing accounting collections are not changed.
            </p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason, e.g. expected migration difference verified by auditor"
              className="mt-3 min-h-28 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
            />
            <button
              type="button"
              disabled={!reason.trim() || saving}
              onClick={() => void saveFalsePositive()}
              className="mt-3 w-full rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save feedback'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
};
