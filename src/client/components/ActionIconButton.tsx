import React from 'react';
import { Link } from 'react-router-dom';
import { FileDown, Pencil, RefreshCw, Trash2 } from 'lucide-react';

type ActionKind = 'edit' | 'delete' | 'refresh' | 'exportCsv' | 'exportExcel' | 'exportPdf' | 'downloadPdf';
type ActionIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

interface ActionIconButtonProps {
  kind: ActionKind;
  title?: string;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  className?: string;
}

const CsvExportIcon: ActionIcon = ({ className, ...props }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12.5h6M15 12.5l-2-2M15 12.5l-2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <text x="12" y="19" textAnchor="middle" fill="currentColor" fontSize="5.2" fontWeight="800" fontFamily="Arial, sans-serif">CSV</text>
  </svg>
);

const ExcelExportIcon: ActionIcon = ({ className, ...props }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M5 4h14v16H5V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M5 9h14M5 14h14M10 4v16M15 4v16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M8.5 7.5 12 12l-3.5 4.5M15.5 7.5 12 12l3.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 18.5h3M19 18.5l-1-1M19 18.5l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const kindConfig: Record<ActionKind, { label: string; icon: ActionIcon; className: string }> = {
  edit: {
    label: 'Edit',
    icon: Pencil,
    className: 'border-cyan-400/20 bg-cyan-500/12 text-cyan-100 hover:bg-cyan-500/20',
  },
  delete: {
    label: 'Delete',
    icon: Trash2,
    className: 'border-rose-400/20 bg-rose-500/12 text-rose-100 hover:bg-rose-500/20',
  },
  refresh: {
    label: 'Refresh',
    icon: RefreshCw,
    className: 'border-indigo-400/20 bg-indigo-500/12 text-indigo-100 hover:bg-indigo-500/20',
  },
  exportCsv: {
    label: 'Export CSV',
    icon: CsvExportIcon,
    className: 'border-cyan-400/20 bg-cyan-500/12 text-cyan-100 hover:bg-cyan-500/20',
  },
  exportExcel: {
    label: 'Export Excel',
    icon: ExcelExportIcon,
    className: 'border-emerald-400/20 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/20',
  },
  exportPdf: {
    label: 'Export PDF',
    icon: FileDown,
    className: 'border-amber-400/20 bg-amber-500/12 text-amber-100 hover:bg-amber-500/20',
  },
  downloadPdf: {
    label: 'Download PDF',
    icon: FileDown,
    className: 'border-cyan-400/20 bg-cyan-500/12 text-cyan-100 hover:bg-cyan-500/20',
  },
};

export const ActionIconButton: React.FC<ActionIconButtonProps> = ({ kind, title, onClick, to, disabled, className = '' }) => {
  const config = kindConfig[kind];
  const Icon = config.icon;
  const label = title || config.label;
  const classes = `inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${config.className} ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`.trim();
  const content = (
    <>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={label} title={label}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes} aria-label={label} title={label}>
      {content}
    </button>
  );
};
