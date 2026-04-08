import React from 'react';
import { Link } from 'react-router-dom';

type ManualHelpLinkProps = {
  anchor: string;
  label?: string;
  className?: string;
};

export const ManualHelpLink: React.FC<ManualHelpLinkProps> = ({
  anchor,
  label = 'Help for this screen',
  className = '',
}) => {
  return (
    <Link
      to={`/user-manual#${anchor}`}
      className={`inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/20 text-[11px] font-bold text-cyan-50">
        ?
      </span>
      <span>{label}</span>
    </Link>
  );
};
