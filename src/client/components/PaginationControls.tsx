import React from 'react';
import { PAGE_SIZE_OPTIONS } from '../hooks/usePaginatedRows';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  totalRows,
  pageSize,
  startIndex,
  endIndex,
  itemLabel = 'rows',
  onPageChange,
  onPageSizeChange,
}) => {
  if (totalRows <= 0) return null;

  const buttonClass =
    'rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 text-xs text-gray-300 sm:flex-row sm:items-center sm:justify-between">
      <div>
        Showing <span className="font-semibold text-white">{startIndex}</span> to{' '}
        <span className="font-semibold text-white">{endIndex}</span> of{' '}
        <span className="font-semibold text-white">{totalRows}</span> {itemLabel}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-indigo-400"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={buttonClass}
        >
          Previous
        </button>
        <span className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white">
          Page {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={buttonClass}
        >
          Next
        </button>
      </div>
    </div>
  );
};
