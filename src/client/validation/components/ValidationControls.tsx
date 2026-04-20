import React, { useMemo, useState } from 'react';
import { ValidationJobStatus } from '../types';

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthStartKey = () => {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
};

export const ValidationControls: React.FC<{
  running?: boolean;
  job?: ValidationJobStatus;
  settings?: {
    scheduleEnabled: boolean;
    cron: string;
    timezone: string;
    alertEmails: string[];
  };
  savingSettings?: boolean;
  onRun: (periodStart: string, periodEnd: string) => void;
  onSaveSettings: (settings: {
    scheduleEnabled: boolean;
    cron: string;
    timezone: string;
    alertEmails: string[];
  }) => void;
}> = ({ job, onRun, onSaveSettings, running, savingSettings, settings }) => {
  const [periodStart, setPeriodStart] = useState(monthStartKey());
  const [periodEnd, setPeriodEnd] = useState(todayKey());
  const [scheduleEnabled, setScheduleEnabled] = useState(settings?.scheduleEnabled ?? true);
  const [cron, setCron] = useState(settings?.cron || '0 2 * * *');
  const [timezone, setTimezone] = useState(settings?.timezone || 'Asia/Kolkata');
  const [alertEmails, setAlertEmails] = useState((settings?.alertEmails || []).join(', '));

  const canRun = useMemo(() => Boolean(periodStart && periodEnd && !running), [periodEnd, periodStart, running]);

  React.useEffect(() => {
    if (!settings) return;
    setScheduleEnabled(settings.scheduleEnabled);
    setCron(settings.cron || '0 2 * * *');
    setTimezone(settings.timezone || 'Asia/Kolkata');
    setAlertEmails((settings.alertEmails || []).join(', '));
  }, [settings]);

  const saveSchedule = () => {
    onSaveSettings({
      scheduleEnabled,
      cron,
      timezone,
      alertEmails: alertEmails.split(/[,\n;]+/).map((item) => item.trim()).filter(Boolean),
    });
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/40 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Validation Command Center</p>
          <h2 className="mt-2 text-2xl font-black text-white">Run CA-style health checks</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Uses read-only validation queries, stores the result separately, and gives audit-friendly fixes.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[150px_150px_auto]">
          <input
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
          />
          <input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
          />
          <button
            type="button"
            disabled={!canRun}
            onClick={() => onRun(periodStart, periodEnd)}
            className="rounded-xl bg-cyan-300 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Running...' : 'Run Full Validation Now'}
          </button>
        </div>
      </div>

      {job ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-white">Job {job.jobId}</span>
            <span className="uppercase tracking-[0.18em] text-slate-400">
              {job.totalSteps ? `${job.completedSteps || 0}/${job.totalSteps} checks` : job.status}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${job.progress || 0}%` }} />
          </div>
          {job.currentStep ? <p className="mt-2 text-sm text-cyan-100">Current activity: {job.currentStep}</p> : null}
          {job.error ? <p className="mt-2 text-sm text-rose-200">{job.error}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_150px_150px_1fr_auto]">
        <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(event) => setScheduleEnabled(event.target.checked)}
            className="h-4 w-4 accent-cyan-300"
          />
          Nightly 2 AM schedule
        </label>
        <input
          value={cron}
          onChange={(event) => setCron(event.target.value)}
          placeholder="0 2 * * *"
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
        />
        <input
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="Asia/Kolkata"
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
        />
        <input
          value={alertEmails}
          onChange={(event) => setAlertEmails(event.target.value)}
          placeholder="Critical alert emails, comma separated"
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
        />
        <button
          type="button"
          onClick={saveSchedule}
          className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          {savingSettings ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Settings are stored in validation module collections only. The active server cron reads environment defaults at startup; saved values are available for the next scheduler integration phase.
      </p>
    </div>
  );
};
