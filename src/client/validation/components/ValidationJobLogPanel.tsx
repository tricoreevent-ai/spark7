import React, { useEffect, useRef } from 'react';
import { ValidationJobLogEntry, ValidationJobStatus } from '../types';

const levelStyles: Record<ValidationJobLogEntry['level'], { dot: string; text: string; label: string }> = {
  info: {
    dot: 'bg-cyan-300',
    text: 'text-cyan-100',
    label: 'Info',
  },
  success: {
    dot: 'bg-emerald-300',
    text: 'text-emerald-100',
    label: 'Pass',
  },
  warning: {
    dot: 'bg-amber-300',
    text: 'text-amber-100',
    label: 'Warn',
  },
  error: {
    dot: 'bg-rose-300',
    text: 'text-rose-100',
    label: 'Error',
  },
};

const formatLogTime = (value?: string): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const ValidationJobLogPanel: React.FC<{ job?: ValidationJobStatus }> = ({ job }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const logs = job?.logs || [];
  const latestLog = logs[logs.length - 1];

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs.length, job?.status]);

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950 to-cyan-950/20 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Live Log View</p>
          <h2 className="mt-2 text-2xl font-black text-white">Validation activity stream</h2>
          <p className="mt-1 text-sm text-slate-400">
            Watch each CA-style health check as it starts, finishes, and writes the report.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {latestLog ? (
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
              Updated {formatLogTime(latestLog.timestamp)}
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
            {job?.status || 'idle'}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Current</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-white">
                {job?.currentStep || 'Waiting for a validation run'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Progress</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {job ? `${job.progress}% complete` : 'No active run'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Checks</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {job?.totalSteps ? `${job.completedSteps || 0}/${job.totalSteps} finished` : 'Will appear after run starts'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Run progress</p>
                <p className="mt-1 text-lg font-black text-white">{job?.progress || 0}%</p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>{job?.totalSteps ? `${job.completedSteps || 0} of ${job.totalSteps} checks complete` : 'Checks will appear after the run starts'}</p>
                <p className="mt-1">{job?.jobId ? `Job ${job.jobId}` : 'No active job selected'}</p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-cyan-300 transition-[width] duration-300"
                style={{ width: `${job?.progress || 0}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Started</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {job?.startedAt ? formatLogTime(job.startedAt) : '--'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {job?.status === 'completed' ? 'Completed' : 'Latest update'}
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {job?.completedAt
                    ? formatLogTime(job.completedAt)
                    : latestLog?.timestamp
                      ? formatLogTime(latestLog.timestamp)
                      : '--'}
                </p>
              </div>
            </div>
            {job?.error ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">
                {job.error}
              </div>
            ) : latestLog ? (
              <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.06] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100">Latest note</p>
                <p className="mt-2 text-sm leading-6 text-slate-100">{latestLog.message}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">Latest steps</p>
              <p className="mt-1 text-sm text-slate-400">
                {logs.length
                  ? `${logs.length} event${logs.length === 1 ? '' : 's'} captured for this validation run.`
                  : 'The live feed will appear here after the next run starts.'}
              </p>
            </div>
            <span className="text-xs text-slate-500">Newest activity stays pinned to the bottom.</span>
          </div>

          <div ref={scrollRef} className="max-h-[520px] overflow-y-auto p-3 sm:p-4">
            {logs.length ? (
              <div className="space-y-3">
                {logs.map((log) => {
                  const tone = levelStyles[log.level] || levelStyles.info;
                  return (
                    <article key={log.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                          <span className={tone.text}>{tone.label}</span>
                          {log.checkName ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] text-slate-300">
                              {log.checkName}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="font-mono">{formatLogTime(log.timestamp)}</span>
                          <span>{log.progress}%</span>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-100">{log.message}</p>
                      <div className="mt-3 text-[11px] text-slate-500">
                        {log.durationMs ? `${log.durationMs} ms` : 'Awaiting more details'}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center text-sm leading-6 text-slate-400">
                Press <span className="mx-1 font-semibold text-white">Run Full Validation Now</span> to open the live job log here.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
