import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDate, APP_CONFIG } from '../config';
import { Table, Column } from '../components/Table';

interface ReturnItem {
  productName: string;
  sku: string;
  returnQuantity?: number;
  quantity?: number;
  lineSubtotal?: number;
  lineTax?: number;
  lineTotal?: number;
  unitPrice?: number;
}

interface Return {
  _id: string;
  returnNumber: string;
  userId: string;
  saleId?: string;
  items: ReturnItem[];
  returnReason?: string;
  reason?: string;
  refundMethod: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'credit_note' | 'original_payment';
  refundAmount: number;
  refundStatus: 'pending' | 'completed' | 'rejected';
  returnStatus: 'draft' | 'approved' | 'rejected';
  approvalNotes?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

const RETURNS_BATCH_SIZE = 30;

const Returns: React.FC = () => {
  const [returns, setReturns] = useState<Return[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreReturns, setHasMoreReturns] = useState(false);
  const [totalReturns, setTotalReturns] = useState(0);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [stats, setStats] = useState<any>(null);

  const API_BASE = APP_CONFIG.apiBaseUrl;

  useEffect(() => {
    void fetchReturns(true);
    void fetchStats();
  }, [filterStatus]);

  const fetchReturns = async (reset = false) => {
    const token = localStorage.getItem('token');
    const skip = reset ? 0 : returns.length;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(RETURNS_BATCH_SIZE),
      });
      if (filterStatus !== 'all') {
        params.set('status', filterStatus);
      }
      const url = `${API_BASE}/api/returns?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success && data.data) {
        const incoming: Return[] = Array.isArray(data.data) ? data.data : [];
        const total = Number(data?.pagination?.total || incoming.length || 0);
        setTotalReturns(total);
        setReturns((prev) => {
          if (reset) return incoming;
          const merged = [...prev];
          const existing = new Set(prev.map((row) => row._id));
          incoming.forEach((row) => {
            if (!existing.has(row._id)) {
              existing.add(row._id);
              merged.push(row);
            }
          });
          return merged;
        });
        setHasMoreReturns(skip + incoming.length < total);
      }
    } catch (err) {
      setError('Failed to load returns');
      console.error(err);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const fetchStats = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE}/api/returns/stats/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success && data.data) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleApprove = async (returnId: string) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE}/api/returns/${returnId}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          approvalNotes: 'Return approved',
        }),
      });

      const data = await response.json();
      if (data.success) {
        setError('');
        void fetchReturns(true);
        void fetchStats();
        if (selectedReturn && selectedReturn._id === returnId) {
          setSelectedReturn(null);
        }
      } else {
        setError(data.error || 'Failed to approve return');
      }
    } catch (err) {
      setError(`Error: ${err}`);
    }
  };

  const handleReject = async (returnId: string) => {
    const token = localStorage.getItem('token');
    try {
      const reason = prompt('Enter rejection reason:');
      if (!reason) return;

      const response = await fetch(`${API_BASE}/api/returns/${returnId}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          rejectionReason: reason,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setError('');
        void fetchReturns(true);
        void fetchStats();
        if (selectedReturn && selectedReturn._id === returnId) {
          setSelectedReturn(null);
        }
      } else {
        setError(data.error || 'Failed to reject return');
      }
    } catch (err) {
      setError(`Error: ${err}`);
    }
  };

  const handleDelete = async (returnId: string) => {
    const token = localStorage.getItem('token');
    if (!window.confirm('Are you sure you want to delete this return?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/returns/${returnId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setError('');
        void fetchReturns(true);
        void fetchStats();
        if (selectedReturn && selectedReturn._id === returnId) {
          setSelectedReturn(null);
        }
      } else {
        setError(data.error || 'Failed to delete return');
      }
    } catch (err) {
      setError(`Error: ${err}`);
    }
  };

  const exportToCSV = () => {
    const headers = ['Return #', 'Sale ID', 'Date', 'Items Count', 'Reason', 'Refund Amount', 'Refund Method', 'Status'];
    const csvData = filteredReturns.map(ret => [
      ret.returnNumber,
      ret.saleId,
      new Date(ret.createdAt).toLocaleDateString(),
      ret.items.length,
      ret.returnReason || '',
      ret.refundAmount.toFixed(2),
      ret.refundMethod,
      ret.returnStatus
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `returns_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredReturns = returns.filter(r =>
    r.returnNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.saleId || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (selectedReturn) {
    return (
      <ReturnDetailsView
        returnData={selectedReturn}
        onClose={() => setSelectedReturn(null)}
        onApprove={() => handleApprove(selectedReturn._id)}
        onReject={() => handleReject(selectedReturn._id)}
        onDelete={() => handleDelete(selectedReturn._id)}
      />
    );
  }

  const columns: Column<Return>[] = [
    { header: 'Return #', accessor: 'returnNumber', className: 'font-medium text-white' },
    {
      header: 'Sale ID',
      sortValue: (ret) => ret.saleId || '',
      render: (ret) => (ret.saleId ? `${ret.saleId.substring(0, 8)}...` : '-'),
    },
    { header: 'Date', sortValue: (ret) => new Date(ret.createdAt).getTime(), render: (ret) => formatDate(ret.createdAt) },
    { header: 'Items', sortValue: (ret) => ret.items.length, render: (ret) => ret.items.length },
    { header: 'Reason', sortValue: (ret) => ret.reason || ret.returnReason || '', render: (ret) => ret.reason || ret.returnReason || '-' },
    { 
      header: 'Refund Amount', 
      sortValue: (ret) => Number(ret.refundAmount || 0),
      render: (ret) => formatCurrency(ret.refundAmount),
      className: 'text-right font-medium text-white'
    },
    { 
      header: 'Refund Method', 
      sortValue: (ret) => ret.refundMethod || '',
      render: (ret) => (
        <span className="inline-flex items-center rounded-md bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20 capitalize">
          {ret.refundMethod.replace('_', ' ')}
        </span>
      )
    },
    { 
      header: 'Status', 
      sortValue: (ret) => ret.returnStatus || '',
      render: (ret) => (
        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset uppercase ${
          ret.returnStatus === 'approved' ? 'bg-green-400/10 text-green-400 ring-green-400/20' :
          ret.returnStatus === 'rejected' ? 'bg-red-400/10 text-red-400 ring-red-400/20' :
          'bg-yellow-400/10 text-yellow-400 ring-yellow-400/20'
        }`}>
          {ret.returnStatus}
        </span>
      )
    },
    { 
      header: 'Refund Status', 
      sortValue: (ret) => ret.refundStatus || '',
      render: (ret) => (
        <span className="inline-flex items-center rounded-md bg-gray-400/10 px-2 py-1 text-xs font-medium text-gray-400 ring-1 ring-inset ring-gray-400/20 uppercase">
          {ret.refundStatus}
        </span>
      )
    },
    {
      header: 'Actions',
      className: 'text-right',
      sortable: false,
      render: (ret) => (
        <div className="flex justify-end gap-2">
          <button className="text-indigo-400 hover:text-indigo-300" title="View details" onClick={() => setSelectedReturn(ret)}>
            👁️
          </button>
          {ret.returnStatus === 'draft' && (
            <>
              <button className="text-green-400 hover:text-green-300" title="Approve return" onClick={() => handleApprove(ret._id)}>
                ✓
              </button>
              <button className="text-red-400 hover:text-red-300" title="Reject return" onClick={() => handleReject(ret._id)}>
                ✕
              </button>
            </>
          )}
          <button className="text-red-400 hover:text-red-300" title="Delete return" onClick={() => handleDelete(ret._id)}>
            🗑️
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <h1 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">Return Management</h1>
        <button onClick={exportToCSV} className="mt-4 sm:mt-0 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white/20">
          Export CSV
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5 mb-8">
          <div className="overflow-hidden rounded-lg bg-white/5 border border-white/10 p-5 shadow">
            <h4 className="truncate text-sm font-medium text-gray-400">Total Returns</h4>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{stats.total}</p>
          </div>
          <div className="overflow-hidden rounded-lg bg-white/5 border border-l-4 border-l-yellow-500 border-white/10 p-5 shadow">
            <h4 className="truncate text-sm font-medium text-gray-400">Pending Approval</h4>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{stats.pending}</p>
          </div>
          <div className="overflow-hidden rounded-lg bg-white/5 border border-l-4 border-l-green-500 border-white/10 p-5 shadow">
            <h4 className="truncate text-sm font-medium text-gray-400">Approved</h4>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{stats.approved}</p>
          </div>
          <div className="overflow-hidden rounded-lg bg-white/5 border border-l-4 border-l-red-500 border-white/10 p-5 shadow">
            <h4 className="truncate text-sm font-medium text-gray-400">Rejected</h4>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{stats.rejected}</p>
          </div>
          <div className="overflow-hidden rounded-lg bg-white/5 border border-l-4 border-l-blue-500 border-white/10 p-5 shadow">
            <h4 className="truncate text-sm font-medium text-gray-400">Total Refunded</h4>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{formatCurrency(stats.totalRefunded || 0)}</p>
          </div>
        </div>
      )}

      {error && <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by return number or sale ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
          />
        </div>
        <div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 [&>option]:bg-gray-900"
          >
            <option value="all">All Returns</option>
            <option value="draft">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {loading && <div className="p-8 text-center text-gray-400">Loading...</div>}

      {filteredReturns.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p>No returns found</p>
        </div>
      ) : (
        <>
          <Table data={filteredReturns} columns={columns} emptyMessage="No returns found" />
          <div className="mt-3 flex items-center justify-between rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-400">
            <span>
              Loaded {returns.length} of {totalReturns || returns.length} returns
            </span>
            {hasMoreReturns && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void fetchReturns(false)}
                className="rounded border border-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

interface ReturnDetailsViewProps {
  returnData: Return;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}

const ReturnDetailsView: React.FC<ReturnDetailsViewProps> = ({ returnData, onClose, onApprove, onReject, onDelete }) => {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">📋 Return Details</h2>
        <button onClick={onClose} className="mt-4 sm:mt-0 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white/20">Back</button>
      </div>

      <div className="rounded-lg bg-white/5 p-6 shadow border border-white/10">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-400">Return Number</label>
            <p className="mt-1 text-lg font-semibold text-white">{returnData.returnNumber}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">Date</label>
            <p className="mt-1 text-lg text-white">{formatDate(returnData.createdAt)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">Sale ID</label>
            <p className="mt-1 text-lg text-white">{returnData.saleId ? `${returnData.saleId.substring(0, 12)}...` : '-'}</p>
          </div>
        </div>

        <div className="mb-8 border-t border-white/10 pt-6">
          <h3 className="text-lg font-medium leading-6 text-white mb-4">Return Information</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-400">Return Status</label>
              <p className="mt-1">
                <span className="inline-flex items-center rounded-md bg-gray-400/10 px-2 py-1 text-sm font-medium text-gray-400 ring-1 ring-inset ring-gray-400/20 uppercase">
                  {returnData.returnStatus.toUpperCase()}
                </span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400">Reason</label>
              <p className="mt-1 text-white">{returnData.reason || returnData.returnReason || 'Not specified'}</p>
            </div>
          </div>

          {returnData.approvalNotes && (
            <div className="mt-4 rounded-md bg-green-900/30 p-4 border border-green-900/50">
              <strong className="block text-green-400 text-sm">Approval Notes:</strong>
              <p className="text-green-200">{returnData.approvalNotes}</p>
            </div>
          )}

          {returnData.rejectionReason && (
            <div className="mt-4 rounded-md bg-red-900/30 p-4 border border-red-900/50">
              <strong className="block text-red-400 text-sm">Rejection Reason:</strong>
              <p className="text-red-200">{returnData.rejectionReason}</p>
            </div>
          )}
        </div>

        <div className="mb-8 border-t border-white/10 pt-6">
          <h3 className="text-lg font-medium leading-6 text-white mb-4">Returned Items</h3>
          <div className="overflow-hidden shadow ring-1 ring-white/10 sm:rounded-lg">
            <table className="min-w-full divide-y divide-white/10 bg-white/5">
              <thead className="bg-white/5">
                <tr>
                  <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Product Name</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">SKU</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-white">Quantity</th>
                  <th className="px-3 py-3.5 text-right text-sm font-semibold text-white">Returned Amount</th>
                  <th className="px-3 py-3.5 text-right text-sm font-semibold text-white">GST</th>
                  <th className="px-3 py-3.5 text-right text-sm font-semibold text-white">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent">
                {returnData.items.map((item, index) => (
                  <tr key={index}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{item.productName}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{item.sku}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{item.returnQuantity ?? item.quantity ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300">{formatCurrency(item.lineSubtotal ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300">{formatCurrency(item.lineTax ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-bold text-white">{formatCurrency(item.lineTotal ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-8 border-t border-white/10 pt-6">
          <h3 className="text-lg font-medium leading-6 text-white mb-4">Refund Details</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-400">Refund Amount</label>
              <p className="mt-1 text-xl font-bold text-indigo-400">{formatCurrency(returnData.refundAmount)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400">Refund Method</label>
              <p className="mt-1">
                <span className="inline-flex items-center rounded-md bg-blue-400/10 px-2 py-1 text-sm font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20 uppercase">
                  {returnData.refundMethod.toUpperCase().replace('_', ' ')}
                </span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400">Refund Status</label>
              <p className="mt-1">
                <span className="inline-flex items-center rounded-md bg-gray-400/10 px-2 py-1 text-sm font-medium text-gray-400 ring-1 ring-inset ring-gray-400/20 uppercase">
                  {returnData.refundStatus.toUpperCase()}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8 border-t border-white/10 pt-6">
          {returnData.returnStatus === 'draft' && (
            <>
            <button onClick={onApprove} className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500">
              ✓ Approve Return
            </button>
            <button onClick={onReject} className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500">
              ✕ Reject Return
            </button>
            </>
          )}
          <button onClick={onDelete} className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white/20">
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default Returns;
