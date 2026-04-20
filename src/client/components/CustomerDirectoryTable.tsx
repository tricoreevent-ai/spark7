import React, { useEffect, useMemo, useState } from 'react';
import { PaginationControls } from './PaginationControls';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { CustomerCrmCustomerRow, CustomerCrmDirectoryFilters } from './customerCrmShared';

type DirectorySortKey =
  | 'name'
  | 'customerCode'
  | 'phone'
  | 'email'
  | 'customerCategory'
  | 'accountType'
  | 'pricingTier'
  | 'status';

interface CustomerDirectoryTableProps {
  rows: CustomerCrmCustomerRow[];
  loading: boolean;
  query: string;
  selectedIds: string[];
  onQueryChange: (value: string) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onFilteredRowsChange: (rows: CustomerCrmCustomerRow[]) => void;
  onFilterPayloadChange: (filters: CustomerCrmDirectoryFilters) => void;
  onEditCustomer: (row: CustomerCrmCustomerRow) => void;
  onToggleBlock: (row: CustomerCrmCustomerRow) => void | Promise<void>;
  onOpenCampaigns: () => void;
}

const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500';

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const categoryLabel = (value?: string) =>
  String(value || 'individual')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const mapCustomerCsvRow = (row: CustomerCrmCustomerRow) => ({
  Code: row.customerCode,
  Name: row.name,
  Phone: row.phone || '',
  Email: row.email || '',
  Category: categoryLabel(row.customerCategory),
  Account: row.accountType || '',
  PricingTier: row.pricingTier || '',
  PreferredSport: row.preferences?.preferredSport || '',
  PreferredTimeSlot: row.preferences?.preferredTimeSlot || '',
  Status: row.isBlocked ? 'Blocked' : 'Active',
});

const sortValueFor = (row: CustomerCrmCustomerRow, key: DirectorySortKey): string | number => {
  switch (key) {
    case 'customerCode':
      return normalizeText(row.customerCode);
    case 'phone':
      return normalizeText(row.phone);
    case 'email':
      return normalizeText(row.email);
    case 'customerCategory':
      return normalizeText(row.customerCategory);
    case 'accountType':
      return normalizeText(row.accountType);
    case 'pricingTier':
      return normalizeText(row.pricingTier);
    case 'status':
      return row.isBlocked ? 1 : 0;
    case 'name':
    default:
      return normalizeText(row.name);
  }
};

export const CustomerDirectoryTable: React.FC<CustomerDirectoryTableProps> = ({
  rows,
  loading,
  query,
  selectedIds,
  onQueryChange,
  onSelectedIdsChange,
  onFilteredRowsChange,
  onFilterPayloadChange,
  onEditCustomer,
  onToggleBlock,
  onOpenCampaigns,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'cash' | 'credit'>('all');
  const [pricingTierFilter, setPricingTierFilter] = useState<'all' | string>('all');
  const [sortState, setSortState] = useState<{ key: DirectorySortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pricingTierOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.pricingTier || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return rows.filter((row) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          row.customerCode,
          row.name,
          row.phone,
          row.email,
          row.pricingTier,
          row.preferences?.preferredSport,
          row.preferences?.preferredTimeSlot,
        ].some((value) => normalizeText(value).includes(normalizedQuery));

      if (!matchesSearch) return false;
      if (statusFilter === 'active' && row.isBlocked) return false;
      if (statusFilter === 'blocked' && !row.isBlocked) return false;
      if (categoryFilter !== 'all' && String(row.customerCategory || 'individual') !== categoryFilter) return false;
      if (accountTypeFilter !== 'all' && String(row.accountType || 'cash') !== accountTypeFilter) return false;
      if (pricingTierFilter !== 'all' && String(row.pricingTier || '').trim() !== pricingTierFilter) return false;
      return true;
    });
  }, [accountTypeFilter, categoryFilter, pricingTierFilter, query, rows, statusFilter]);

  const sortedRows = useMemo(() => {
    const direction = sortState.direction === 'asc' ? 1 : -1;
    return [...filteredRows].sort((left, right) => {
      const leftValue = sortValueFor(left, sortState.key);
      const rightValue = sortValueFor(right, sortState.key);
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }
      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
  }, [filteredRows, sortState.direction, sortState.key]);

  useEffect(() => {
    onFilteredRowsChange(filteredRows);
    onFilterPayloadChange({
      search: query,
      customerCategories: categoryFilter === 'all' ? [] : [categoryFilter],
      accountTypes: accountTypeFilter === 'all' ? [] : [accountTypeFilter],
      statuses: statusFilter === 'all' ? [] : [statusFilter],
      pricingTiers: pricingTierFilter === 'all' ? [] : [pricingTierFilter],
    });
  }, [
    accountTypeFilter,
    categoryFilter,
    filteredRows,
    onFilterPayloadChange,
    onFilteredRowsChange,
    pricingTierFilter,
    query,
    statusFilter,
  ]);

  const pagination = usePaginatedRows(sortedRows, {
    initialPageSize: 10,
    resetDeps: [sortedRows.length, query, categoryFilter, accountTypeFilter, pricingTierFilter, statusFilter, sortState.key, sortState.direction],
  });

  const pageRowIds = pagination.paginatedRows.map((row) => row._id);
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedSet.has(id));
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedSet.has(row._id));
  const selectedRows = rows.filter((row) => selectedSet.has(row._id));

  const toggleSort = (key: DirectorySortKey) => {
    setSortState((previous) => {
      if (previous.key !== key) return { key, direction: 'asc' };
      return { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const sortArrow = (key: DirectorySortKey) => {
    if (sortState.key !== key) return ' ↕';
    return sortState.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const toggleRow = (rowId: string) => {
    if (selectedSet.has(rowId)) {
      onSelectedIdsChange(selectedIds.filter((value) => value !== rowId));
      return;
    }
    onSelectedIdsChange([...selectedIds, rowId]);
  };

  const togglePageSelection = () => {
    if (allPageSelected) {
      onSelectedIdsChange(selectedIds.filter((id) => !pageRowIds.includes(id)));
      return;
    }
    onSelectedIdsChange(Array.from(new Set([...selectedIds, ...pageRowIds])));
  };

  const toggleFilteredSelection = () => {
    const filteredIds = filteredRows.map((row) => row._id);
    if (allFilteredSelected) {
      onSelectedIdsChange(selectedIds.filter((id) => !filteredIds.includes(id)));
      return;
    }
    onSelectedIdsChange(Array.from(new Set([...selectedIds, ...filteredIds])));
  };

  const resetFilters = () => {
    onQueryChange('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setAccountTypeFilter('all');
    setPricingTierFilter('all');
    setSortState({ key: 'name', direction: 'asc' });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200">Customer Directory</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Profiles ready for booking, sales, and follow-up</h2>
          <p className="mt-2 text-sm text-gray-400">Sort, filter, export, select multiple customers, and launch brochure campaigns from one directory.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadCsv('customer-directory-visible.csv', sortedRows.map(mapCustomerCsvRow))}
            className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100"
            disabled={!sortedRows.length}
          >
            Export Visible CSV
          </button>
          <button
            type="button"
            onClick={() => downloadCsv('customer-directory-selected.csv', selectedRows.map(mapCustomerCsvRow))}
            className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100"
            disabled={!selectedRows.length}
          >
            Export Selected CSV
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <input
          className={inputClass}
          placeholder="Search by name, phone, email, code, sport, or pricing tier"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'blocked')}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          <option value="individual">Individual</option>
          <option value="group_team">Group / Team</option>
          <option value="corporate">Corporate</option>
          <option value="regular_member">Regular Member</option>
          <option value="walk_in">Walk In</option>
        </select>
        <select className={inputClass} value={accountTypeFilter} onChange={(e) => setAccountTypeFilter(e.target.value as 'all' | 'cash' | 'credit')}>
          <option value="all">All accounts</option>
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
        </select>
        <select className={inputClass} value={pricingTierFilter} onChange={(e) => setPricingTierFilter(e.target.value)}>
          <option value="all">All pricing tiers</option>
          {pricingTierOptions.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-white/5"
        >
          Reset
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-gray-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
            {selectedRows.length} selected
          </span>
          <span>{filteredRows.length} visible customer{filteredRows.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={togglePageSelection} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5">
            {allPageSelected ? 'Clear Page' : 'Select Page'}
          </button>
          <button type="button" onClick={toggleFilteredSelection} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5">
            {allFilteredSelected ? 'Clear Visible' : 'Select Visible'}
          </button>
          <button
            type="button"
            onClick={() => onSelectedIdsChange([])}
            className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5"
            disabled={!selectedRows.length}
          >
            Clear Selection
          </button>
          <button
            type="button"
            onClick={onOpenCampaigns}
            className="rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
            disabled={!selectedRows.length && !filteredRows.length}
          >
            Send Brochure / Campaign
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.24em] text-gray-400">
              <th className="px-3 py-3">
                <input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} />
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => toggleSort('name')} className="rounded px-1 py-0.5 hover:bg-white/10">
                  Customer{sortArrow('name')}
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => toggleSort('phone')} className="rounded px-1 py-0.5 hover:bg-white/10">
                  Contact{sortArrow('phone')}
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => toggleSort('customerCategory')} className="rounded px-1 py-0.5 hover:bg-white/10">
                  Type{sortArrow('customerCategory')}
                </button>
              </th>
              <th className="px-3 py-3">Preferences</th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => toggleSort('accountType')} className="rounded px-1 py-0.5 hover:bg-white/10">
                  Account{sortArrow('accountType')}
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => toggleSort('pricingTier')} className="rounded px-1 py-0.5 hover:bg-white/10">
                  Tier{sortArrow('pricingTier')}
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => toggleSort('status')} className="rounded px-1 py-0.5 hover:bg-white/10">
                  Status{sortArrow('status')}
                </button>
              </th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {pagination.paginatedRows.map((row) => (
              <tr key={row._id} className="align-top">
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selectedSet.has(row._id)} onChange={() => toggleRow(row._id)} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                      {row.profilePhotoUrl ? (
                        <img src={row.profilePhotoUrl} alt={row.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-cyan-100">{String(row.name || '?').slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{row.name}</p>
                      <p className="text-xs text-gray-400">{row.customerCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-gray-300">
                  <p>{row.phone || '-'}</p>
                  <p className="text-xs text-gray-400">{row.email || 'No email saved'}</p>
                </td>
                <td className="px-3 py-3 text-gray-300">{categoryLabel(row.customerCategory)}</td>
                <td className="px-3 py-3 text-gray-300">
                  <p>{row.preferences?.preferredSport || '-'}</p>
                  <p className="text-xs text-gray-400">{row.preferences?.preferredTimeSlot || 'No saved time slot'}</p>
                </td>
                <td className="px-3 py-3 text-gray-300">{categoryLabel(row.accountType)}</td>
                <td className="px-3 py-3 text-gray-300">{row.pricingTier || '-'}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.isBlocked ? 'bg-rose-500/15 text-rose-100' : 'bg-emerald-500/15 text-emerald-100'}`}>
                    {row.isBlocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onEditCustomer(row)}
                      className="rounded-md bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onToggleBlock(row)}
                      className={`rounded-md px-3 py-2 text-xs font-semibold ${row.isBlocked ? 'bg-emerald-500/15 text-emerald-100' : 'bg-amber-500/15 text-amber-100'}`}
                    >
                      {row.isBlocked ? 'Unblock' : 'Block'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !pagination.paginatedRows.length && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-400">
                  No customer profiles match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-400">Loading customer profiles...</p>}

      <div className="mt-4">
        <PaginationControls
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalRows={pagination.totalRows}
          pageSize={pagination.pageSize}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          itemLabel="customer profiles"
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </div>
    </div>
  );
};
