import React, { useMemo, useState } from 'react';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { PaginationControls } from './PaginationControls';

export interface Column<T> {
  header: string;
  accessor?: keyof T;
  render?: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (item: T) => unknown;
  headerClassName?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField?: keyof T;
  emptyMessage?: string;
  sortable?: boolean;
  itemLabel?: string;
  initialPageSize?: number;
}

export const Table = <T extends Record<string, any>>({ 
  data, 
  columns, 
  keyField = '_id', 
  emptyMessage = 'No data found',
  sortable = true,
  itemLabel = 'rows',
  initialPageSize = 10,
}: TableProps<T>) => {
  const [sortState, setSortState] = useState<{ index: number; direction: 'asc' | 'desc' } | null>(null);

  const getSortComparable = (item: T, column: Column<T>): string | number => {
    const raw = column.sortValue ? column.sortValue(item) : (column.accessor ? item[column.accessor] : null);
    if (raw === null || raw === undefined) return '';
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    const asDate = new Date(String(raw));
    if (!Number.isNaN(asDate.getTime()) && String(raw).match(/\d{4}|\d{1,2}[/:-]\d{1,2}/)) {
      return asDate.getTime();
    }
    return String(raw).toLowerCase();
  };

  const sortedData = useMemo(() => {
    if (!sortState || !sortable) return data;
    const targetColumn = columns[sortState.index];
    if (!targetColumn) return data;
    const canSort = targetColumn.sortable !== false && (targetColumn.accessor || targetColumn.sortValue);
    if (!canSort) return data;

    const directionMultiplier = sortState.direction === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = getSortComparable(a, targetColumn);
      const bv = getSortComparable(b, targetColumn);
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * directionMultiplier;
      }
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * directionMultiplier;
    });
  }, [columns, data, sortState, sortable]);

  const {
    currentPage,
    endIndex,
    pageSize,
    paginatedRows,
    setCurrentPage,
    setPageSize,
    startIndex,
    totalPages,
    totalRows,
  } = usePaginatedRows(sortedData, {
    initialPageSize,
    resetDeps: [sortedData.length],
  });

  const toggleSort = (index: number) => {
    if (!sortable) return;
    const col = columns[index];
    const canSort = col.sortable !== false && (col.accessor || col.sortValue);
    if (!canSort) return;
    setSortState((prev) => {
      if (!prev || prev.index !== index) return { index, direction: 'asc' };
      return { index, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const headerArrow = (index: number, col: Column<T>) => {
    const canSort = sortable && col.sortable !== false && (col.accessor || col.sortValue);
    if (!canSort) return '';
    if (!sortState || sortState.index !== index) return ' ↕';
    return sortState.direction === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="overflow-x-auto shadow ring-1 ring-white/10 sm:rounded-lg">
      <table className="min-w-full divide-y divide-white/10 bg-white/5">
        <thead className="bg-white/5">
          <tr>
            {columns.map((col, index) => (
              <th 
                key={index} 
                scope="col" 
                className={`py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6 ${col.className || ''} ${col.headerClassName || ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(index)}
                  className={`rounded px-1 py-0.5 ${
                    sortable && col.sortable !== false && (col.accessor || col.sortValue)
                      ? 'cursor-pointer hover:bg-white/10'
                      : 'cursor-default'
                  }`}
                >
                  {col.header}
                  {headerArrow(index, col)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 bg-transparent">
          {paginatedRows.length > 0 ? (
            paginatedRows.map((item, rowIndex) => (
              <tr key={item[keyField] || rowIndex}>
                {columns.map((col, colIndex) => (
                  <td 
                    key={colIndex} 
                    className={`whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-300 sm:pl-6 ${col.className || ''}`}
                  >
                    {col.render ? col.render(item) : (col.accessor ? item[col.accessor] : null)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="py-4 text-center text-sm text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="px-4 py-1 sm:px-6">
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalRows={totalRows}
          pageSize={pageSize}
          startIndex={startIndex}
          endIndex={endIndex}
          itemLabel={itemLabel}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
};
