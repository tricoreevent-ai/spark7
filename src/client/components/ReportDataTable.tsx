import React, { useMemo, useState } from 'react';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { PaginationControls } from './PaginationControls';

export interface ReportTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  accessor?: keyof T;
  searchValue?: (row: T) => unknown;
  sortValue?: (row: T) => unknown;
  exportValue?: (row: T) => unknown;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right';
}

export interface ReportTableFilter<T> {
  key: string;
  label: string;
  getValue: (row: T) => string;
  options?: Array<{ label: string; value: string }>;
}

interface ReportDataTableProps<T> {
  title: string;
  data: T[];
  columns: ReportTableColumn<T>[];
  keyField?: keyof T;
  itemLabel?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  filters?: ReportTableFilter<T>[];
  exportFileName?: string;
}

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const toCsvCell = (value: unknown): string => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const downloadCsv = (fileName: string, rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvCell(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const ReportDataTable = <T extends Record<string, any>>({
  title,
  data,
  columns,
  keyField = '_id',
  itemLabel = 'rows',
  emptyMessage = 'No rows found for the selected report.',
  searchPlaceholder = 'Search this report',
  filters = [],
  exportFileName = 'report.csv',
}: ReportDataTableProps<T>) => {
  const [search, setSearch] = useState('');
  const [sortState, setSortState] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filterState, setFilterState] = useState<Record<string, string>>(
    () => Object.fromEntries(filters.map((filter) => [filter.key, 'all']))
  );

  const filterOptionsByKey = useMemo(() => {
    return Object.fromEntries(
      filters.map((filter) => {
        const derivedOptions = Array.from(
          new Set(
            data
              .map((row) => String(filter.getValue(row) || '').trim())
              .filter(Boolean)
          )
        )
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
          .map((value) => ({ label: value, value }));
        return [filter.key, filter.options && filter.options.length > 0 ? filter.options : derivedOptions];
      })
    );
  }, [data, filters]);

  const filteredRows = useMemo(() => {
    const query = normalizeText(search);
    return data.filter((row) => {
      const matchesSearch = !query || columns.some((column) => {
        const rawValue = column.searchValue
          ? column.searchValue(row)
          : column.exportValue
            ? column.exportValue(row)
            : column.accessor
              ? row[column.accessor]
              : '';
        return normalizeText(rawValue).includes(query);
      });

      if (!matchesSearch) return false;

      return filters.every((filter) => {
        const selectedValue = filterState[filter.key] || 'all';
        if (selectedValue === 'all') return true;
        return String(filter.getValue(row) || '').trim() === selectedValue;
      });
    });
  }, [columns, data, filterState, filters, search]);

  const sortedRows = useMemo(() => {
    if (!sortState) return filteredRows;
    const targetColumn = columns.find((column) => column.key === sortState.key);
    if (!targetColumn) return filteredRows;
    const direction = sortState.direction === 'asc' ? 1 : -1;

    const getComparableValue = (row: T): string | number => {
      const rawValue = targetColumn.sortValue
        ? targetColumn.sortValue(row)
        : targetColumn.exportValue
          ? targetColumn.exportValue(row)
          : targetColumn.accessor
            ? row[targetColumn.accessor]
            : '';
      if (rawValue instanceof Date) return rawValue.getTime();
      if (typeof rawValue === 'number') return rawValue;
      if (typeof rawValue === 'boolean') return rawValue ? 1 : 0;
      const asDate = new Date(String(rawValue));
      if (!Number.isNaN(asDate.getTime()) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(String(rawValue))) {
        return asDate.getTime();
      }
      return normalizeText(rawValue);
    };

    return [...filteredRows].sort((left, right) => {
      const leftValue = getComparableValue(left);
      const rightValue = getComparableValue(right);
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }
      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
  }, [columns, filteredRows, sortState]);

  const pagination = usePaginatedRows(sortedRows, {
    initialPageSize: 10,
    resetDeps: [sortedRows.length, search, JSON.stringify(filterState), sortState?.key || '', sortState?.direction || ''],
  });

  const exportRows = useMemo(
    () =>
      sortedRows.map((row) =>
        Object.fromEntries(
          columns.map((column) => [
            column.header,
            column.exportValue
              ? column.exportValue(row)
              : column.accessor
                ? row[column.accessor]
                : '',
          ])
        )
      ),
    [columns, sortedRows]
  );

  const toggleSort = (columnKey: string) => {
    setSortState((previous) => {
      if (!previous || previous.key !== columnKey) return { key: columnKey, direction: 'asc' };
      return { key: columnKey, direction: previous.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const sortArrow = (columnKey: string): string => {
    if (!sortState || sortState.key !== columnKey) return ' ↕';
    return sortState.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const resetControls = () => {
    setSearch('');
    setSortState(null);
    setFilterState(Object.fromEntries(filters.map((filter) => [filter.key, 'all'])));
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="text-xs text-gray-400">
            Search, filter, sort, paginate, and export this report.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
          onClick={() => downloadCsv(exportFileName, exportRows)}
          disabled={exportRows.length === 0}
        >
          Export CSV
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full max-w-sm rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500"
        />
        {filters.map((filter) => (
          <select
            key={filter.key}
            value={filterState[filter.key] || 'all'}
            onChange={(e) => setFilterState((previous) => ({ ...previous, [filter.key]: e.target.value }))}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="all" className="bg-gray-900">
              All {filter.label}
            </option>
            {(filterOptionsByKey[filter.key] || []).map((option: { label: string; value: string }) => (
              <option key={option.value} value={option.value} className="bg-gray-900">
                {option.label}
              </option>
            ))}
          </select>
        ))}
        <button
          type="button"
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
          onClick={resetControls}
        >
          Reset
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-300">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-2 py-2 ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.headerClassName || ''}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={`rounded px-1 py-0.5 transition hover:bg-white/10 ${column.align === 'right' ? 'ml-auto flex' : ''}`}
                    title="Sort column"
                  >
                    {column.header}
                    {sortArrow(column.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagination.paginatedRows.length > 0 ? (
              pagination.paginatedRows.map((row, rowIndex) => (
                <tr key={String(row[keyField] ?? rowIndex)} className="border-t border-white/10">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-2 py-2 align-top text-gray-200 ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.className || ''}`}
                    >
                      {column.render
                        ? column.render(row)
                        : column.accessor
                          ? String(row[column.accessor] ?? '')
                          : ''}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-2 py-4 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        totalRows={pagination.totalRows}
        pageSize={pagination.pageSize}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        itemLabel={itemLabel}
        onPageChange={pagination.setCurrentPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </div>
  );
};
