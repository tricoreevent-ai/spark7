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

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs.length, job?.status]);

  return (
    <section className="flex min-h-[360px] flex-col rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-cyan-950/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Live Log View</p>
          <h2 className="mt-2 text-2xl font-black text-white">Validation activity stream</h2>
          <p className="mt-1 text-sm text-slate-400">
            Watch each CA-style health check as it starts, finishes, and writes the report.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
          {job?.status || 'idle'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Current</p>
          <p className="mt-2 text-sm font-semibold text-white">{job?.currentStep || 'Waiting for a validation run'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Progress</p>
          <p className="mt-2 text-sm font-semibold text-white">{job ? `${job.progress}% complete` : 'No active run'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Checks</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {job?.totalSteps ? `${job.completedSteps || 0}/${job.totalSteps} finished` : 'Will appear after run starts'}
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-300 transition-[width] duration-300" style={{ width: `${job?.progress || 0}%` }} />
      </div>

      <div
        ref={scrollRef}
        className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        {logs.length ? (
          <div className="space-y-3">
            {logs.map((log) => {
              const tone = levelStyles[log.level] || levelStyles.info;
              return (
                <article key={log.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                      <span className={tone.text}>{tone.label}</span>
                      {log.checkName ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] text-slate-300">
                          {log.checkName}
                        </span>
                      ) : null}
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">{formatLogTime(log.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-100">{log.message}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{log.durationMs ? `${log.durationMs} ms` : 'Awaiting more details'}</span>
                    <span>{log.progress}%</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center text-sm leading-6 text-slate-400">
            Press <span className="mx-1 font-semibold text-white">Run Full Validation Now</span> to open the live job log here.
          </div>
        )}
      </div>
    </section>
  );
};
