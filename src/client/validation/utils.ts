import { ValidationReport } from './types';

export const formatDate = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export const formatAmount = (value: unknown): string => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
};

export const healthScore = (report?: ValidationReport): number => {
  if (!report?.summary.totalChecks) return 0;
  const weightedFailures = report.summary.critical * 3 + report.summary.warning * 1.5 + report.summary.info * 0.5;
  const maxPenalty = Math.max(1, report.summary.totalChecks * 3);
  return Math.max(0, Math.round((1 - weightedFailures / maxPenalty) * 100));
};

export const severityClass = (severity: string): string => {
  if (severity === 'critical') return 'border-rose-400/40 bg-rose-500/15 text-rose-100';
  if (severity === 'warning') return 'border-amber-400/40 bg-amber-500/15 text-amber-100';
  return 'border-sky-400/40 bg-sky-500/15 text-sky-100';
};

export const statusClass = (status: string, severity?: string): string => {
  if (status === 'PASS') return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100';
  return severityClass(severity || 'warning');
};

export const downloadTextFile = (filename: string, content: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
