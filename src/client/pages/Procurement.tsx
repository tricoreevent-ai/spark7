import React, { useEffect, useMemo, useState } from 'react';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { ActionIconButton } from '../components/ActionIconButton';
import { formatCurrency } from '../config';
import { useProducts } from '../hooks/useProducts';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showConfirmDialog } from '../utils/appDialogs';

interface SupplierRow {
  _id: string;
  supplierCode: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  isActive: boolean;
}

interface PurchaseItemRow {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
}

interface PurchaseOrderRow {
  _id: string;
  purchaseNumber: string;
  supplierId: SupplierRow | string;
  status: 'pending' | 'partially_received' | 'completed' | 'cancelled' | 'returned';
  orderDate: string;
  expectedDate?: string;
  items: PurchaseItemRow[];
  totalAmount: number;
  notes?: string;
  returnReason?: string;
}

interface PurchaseLine {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
}

interface SupplierForm {
  supplierCode: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  isActive: boolean;
}

interface ReceiveRow {
  productId: string;
  productName: string;
  sku: string;
  pending: number;
  quantity: string;
  warehouseLocation: string;
  batchNumber: string;
  expiryDate: string;
}

interface ReturnRow {
  productId: string;
  productName: string;
  sku: string;
  received: number;
  quantity: string;
}

type ActionMode = 'receive' | 'return';

const createLine = (): PurchaseLine => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  productId: '',
  quantity: '1',
  unitCost: '',
});

const emptySupplier = (): SupplierForm => ({
  supplierCode: '',
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  gstin: '',
  isActive: true,
});

const toNumber = (value: unknown): number => Number(value || 0);

const getHeaders = (json = true): HeadersInit => {
  const token = localStorage.getItem('token') || '';
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
};

const supplierName = (value: PurchaseOrderRow['supplierId']): string =>
  typeof value === 'string' ? value : value?.name || '-';

const supplierCode = (value: PurchaseOrderRow['supplierId']): string =>
  typeof value === 'string' ? '' : value?.supplierCode || '';

const formatDate = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('en-IN');
};

const statusLabel = (value: string): string =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const Procurement: React.FC = () => {
  const { products, loading: productsLoading, error: productsError, refetch: refetchProducts } = useProducts();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(() => emptySupplier());
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    expectedDate: '',
    notes: '',
    items: [createLine()],
  });
  const [supplierSearch, setSupplierSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState<'all' | PurchaseOrderRow['status']>('all');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [action, setAction] = useState<{ orderId: string; mode: ActionMode } | null>(null);
  const [receiveRows, setReceiveRows] = useState<ReceiveRow[]>([]);
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([]);
  const [returnReason, setReturnReason] = useState('');

  const productById = useMemo(
    () => new Map(products.map((product) => [String(product._id), product])),
    [products]
  );

  const loadData = async () => {
    const headers = getHeaders(false);
    const [supplierResp, orderResp] = await Promise.all([
      fetchApiJson(apiUrl('/api/suppliers?isActive=all&limit=200'), { headers }),
      fetchApiJson(apiUrl('/api/purchases?limit=200'), { headers }),
    ]);
    setSuppliers(Array.isArray(supplierResp?.data) ? supplierResp.data : []);
    setOrders(Array.isArray(orderResp?.data) ? orderResp.data : []);
  };

  const refreshAll = async (nextMessage?: string) => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadData(), refetchProducts()]);
      if (nextMessage) setMessage(nextMessage);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load procurement data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.supplierCode, supplier.name, supplier.contactPerson, supplier.phone, supplier.email, supplier.gstin]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [supplierSearch, suppliers]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((order) => {
      if (orderStatus !== 'all' && order.status !== orderStatus) return false;
      if (!q) return true;
      return [order.purchaseNumber, supplierName(order.supplierId), order.notes, order.returnReason]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [orderSearch, orderStatus, orders]);

  const purchaseTotals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const row of purchaseForm.items) {
      const product = productById.get(row.productId);
      const quantity = Math.max(0, toNumber(row.quantity));
      const unitCost = Math.max(0, toNumber(row.unitCost));
      subtotal += quantity * unitCost;
      tax += quantity * unitCost * (toNumber(product?.gstRate) / 100);
    }
    subtotal = Number(subtotal.toFixed(2));
    tax = Number(tax.toFixed(2));
    return { subtotal, tax, total: Number((subtotal + tax).toFixed(2)) };
  }, [productById, purchaseForm.items]);

  const stats = useMemo(() => {
    const activeSuppliers = suppliers.filter((supplier) => supplier.isActive).length;
    const pendingOrders = orders.filter((order) => ['pending', 'partially_received'].includes(order.status)).length;
    const completedOrders = orders.filter((order) => order.status === 'completed').length;
    const totalSpend = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    return { activeSuppliers, pendingOrders, completedOrders, totalSpend };
  }, [orders, suppliers]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order._id === action?.orderId) || null,
    [action?.orderId, orders]
  );

  const inputClass =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';
  const buttonClass =
    'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';
  const ghostButtonClass =
    'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-white/10';

  const resetSupplierForm = () => {
    setEditingSupplierId('');
    setSupplierForm(emptySupplier());
  };

  const editSupplier = (supplier: SupplierRow) => {
    setEditingSupplierId(supplier._id);
    setSupplierForm({
      supplierCode: supplier.supplierCode || '',
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      gstin: supplier.gstin || '',
      isActive: Boolean(supplier.isActive),
    });
  };

  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl(editingSupplierId ? `/api/suppliers/${editingSupplierId}` : '/api/suppliers'), {
        method: editingSupplierId ? 'PUT' : 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          supplierCode: supplierForm.supplierCode.trim() || undefined,
          name: supplierForm.name.trim(),
          contactPerson: supplierForm.contactPerson.trim(),
          phone: supplierForm.phone.trim(),
          email: supplierForm.email.trim(),
          gstin: supplierForm.gstin.trim().toUpperCase(),
          isActive: supplierForm.isActive,
        }),
      });
      resetSupplierForm();
      await refreshAll(editingSupplierId ? 'Supplier updated successfully.' : 'Supplier created successfully.');
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save supplier');
      setLoading(false);
    }
  };

  const deactivateSupplier = async (supplier: SupplierRow) => {
    if (!(await showConfirmDialog(`Deactivate supplier "${supplier.name}"?`, { title: 'Deactivate Supplier', confirmText: 'Deactivate' }))) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl(`/api/suppliers/${supplier._id}`), {
        method: 'DELETE',
        headers: getHeaders(false),
      });
      if (editingSupplierId === supplier._id) resetSupplierForm();
      await refreshAll('Supplier deactivated successfully.');
    } catch (deactivateError: any) {
      setError(deactivateError?.message || 'Failed to deactivate supplier');
      setLoading(false);
    }
  };

  const updateLine = (id: string, field: keyof PurchaseLine, value: string) => {
    setPurchaseForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, [field]: value };
        if (field === 'productId') {
          const product = productById.get(value);
          if (product) next.unitCost = String(product.cost || product.price || 0);
        }
        return next;
      }),
    }));
  };

  const addLine = () => {
    setPurchaseForm((prev) => ({ ...prev, items: [...prev.items, createLine()] }));
  };

  const removeLine = (id: string) => {
    setPurchaseForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((item) => item.id !== id) : prev.items,
    }));
  };

  const savePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const items = purchaseForm.items
        .map((item) => ({
          productId: item.productId,
          quantity: Math.max(0, toNumber(item.quantity)),
          unitCost: Math.max(0, toNumber(item.unitCost)),
        }))
        .filter((item) => item.productId && item.quantity > 0);

      if (!purchaseForm.supplierId) throw new Error('Select a supplier before creating a purchase order');
      if (!items.length) throw new Error('Add at least one valid product line');

      await fetchApiJson(apiUrl('/api/purchases'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          supplierId: purchaseForm.supplierId,
          expectedDate: purchaseForm.expectedDate || undefined,
          notes: purchaseForm.notes.trim(),
          items,
        }),
      });

      setPurchaseForm({
        supplierId: '',
        expectedDate: '',
        notes: '',
        items: [createLine()],
      });
      await refreshAll('Purchase order created successfully.');
    } catch (purchaseError: any) {
      setError(purchaseError?.message || 'Failed to create purchase order');
      setLoading(false);
    }
  };

  const openAction = (order: PurchaseOrderRow, mode: ActionMode) => {
    setAction({ orderId: order._id, mode });
    setReturnReason(order.returnReason || '');
    setReceiveRows(
      order.items.map((item) => ({
        productId: String(item.productId),
        productName: item.productName,
        sku: item.sku,
        pending: Math.max(0, Number(item.quantity || 0) - Number(item.receivedQuantity || 0)),
        quantity: '',
        warehouseLocation: '',
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : '',
      }))
    );
    setReturnRows(
      order.items.map((item) => ({
        productId: String(item.productId),
        productName: item.productName,
        sku: item.sku,
        received: Number(item.receivedQuantity || 0),
        quantity: '',
      }))
    );
  };

  const saveReceive = async () => {
    if (!selectedOrder) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const items = receiveRows
        .map((row) => ({
          productId: row.productId,
          receivedQuantity: Math.max(0, toNumber(row.quantity)),
          warehouseLocation: row.warehouseLocation.trim(),
          batchNumber: row.batchNumber.trim(),
          expiryDate: row.expiryDate || undefined,
        }))
        .filter((row) => row.receivedQuantity > 0);

      if (!items.length) throw new Error('Enter at least one received quantity');

      await fetchApiJson(apiUrl(`/api/purchases/${selectedOrder._id}/receive`), {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ items }),
      });
      setAction(null);
      await refreshAll('Stock received successfully.');
    } catch (receiveError: any) {
      setError(receiveError?.message || 'Failed to receive stock');
      setLoading(false);
    }
  };

  const saveReturn = async () => {
    if (!selectedOrder) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const items = returnRows
        .map((row) => ({
          productId: row.productId,
          quantity: Math.max(0, toNumber(row.quantity)),
        }))
        .filter((row) => row.quantity > 0);

      if (!items.length) throw new Error('Enter at least one return quantity');
      if (!returnReason.trim()) throw new Error('Return reason is required');

      await fetchApiJson(apiUrl(`/api/purchases/${selectedOrder._id}/return`), {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ items, reason: returnReason.trim() }),
      });
      setAction(null);
      setReturnReason('');
      await refreshAll('Purchase return processed successfully.');
    } catch (returnError: any) {
      setError(returnError?.message || 'Failed to process purchase return');
      setLoading(false);
    }
  };

  const createPurchaseBill = async (order: PurchaseOrderRow) => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl(`/api/purchases/${order._id}/bill`), {
        method: 'POST',
        headers: getHeaders(false),
      });
      await refreshAll(`Purchase bill posted for ${order.purchaseNumber}.`);
    } catch (billError: any) {
      setError(billError?.message || 'Failed to create purchase bill');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Procurement</h1>
          <p className="text-sm text-gray-300">Suppliers, purchase orders, stock receiving, and purchase returns.</p>
        </div>
        <ActionIconButton kind="refresh" onClick={() => void refreshAll('Procurement data refreshed.')} disabled={loading} title="Refresh" />
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      {productsError && <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{productsError}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Active Suppliers</p><p className="mt-1 text-xl font-semibold text-white">{stats.activeSuppliers}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Pending Orders</p><p className="mt-1 text-xl font-semibold text-amber-300">{stats.pendingOrders}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Completed Orders</p><p className="mt-1 text-xl font-semibold text-emerald-300">{stats.completedOrders}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Tracked Spend</p><p className="mt-1 text-xl font-semibold text-white">{formatCurrency(stats.totalSpend)}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form onSubmit={saveSupplier} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">{editingSupplierId ? 'Edit Supplier' : 'Add Supplier'}</h2>
            {editingSupplierId && <button type="button" onClick={resetSupplierForm} className={ghostButtonClass}>Cancel</button>}
          </div>
          <input className={inputClass} placeholder="Supplier Code (optional)" value={supplierForm.supplierCode} onChange={(e) => setSupplierForm((prev) => ({ ...prev, supplierCode: e.target.value.toUpperCase() }))} />
          <input className={inputClass} placeholder="Supplier Name" required value={supplierForm.name} onChange={(e) => setSupplierForm((prev) => ({ ...prev, name: e.target.value }))} />
          <input className={inputClass} placeholder="Contact Person" value={supplierForm.contactPerson} onChange={(e) => setSupplierForm((prev) => ({ ...prev, contactPerson: e.target.value }))} />
          <input className={inputClass} placeholder="Phone" value={supplierForm.phone} onChange={(e) => setSupplierForm((prev) => ({ ...prev, phone: e.target.value }))} />
          <input className={inputClass} type="email" placeholder="Email" value={supplierForm.email} onChange={(e) => setSupplierForm((prev) => ({ ...prev, email: e.target.value }))} />
          <input className={inputClass} placeholder="GSTIN" value={supplierForm.gstin} onChange={(e) => setSupplierForm((prev) => ({ ...prev, gstin: e.target.value.toUpperCase() }))} />
          <label className="inline-flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={supplierForm.isActive} onChange={(e) => setSupplierForm((prev) => ({ ...prev, isActive: e.target.checked }))} />Supplier is active</label>
          <button type="submit" className={buttonClass} disabled={loading}>{editingSupplierId ? 'Update Supplier' : 'Create Supplier'}</button>
        </form>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Suppliers</h2>
            <input className={`${inputClass} max-w-sm`} placeholder="Search supplier..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead><tr className="text-left text-gray-300"><th className="px-2 py-2">Supplier</th><th className="px-2 py-2">Contact</th><th className="px-2 py-2">GSTIN</th><th className="px-2 py-2">Status</th><th className="px-2 py-2 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier._id}>
                    <td className="px-2 py-2 text-white"><div className="font-semibold">{supplier.name}</div><div className="text-xs text-gray-500">{supplier.supplierCode}</div></td>
                    <td className="px-2 py-2 text-gray-300"><div>{supplier.contactPerson || '-'}</div><div className="text-xs text-gray-500">{supplier.phone || supplier.email || '-'}</div></td>
                    <td className="px-2 py-2 text-gray-300">{supplier.gstin || '-'}</td>
                    <td className="px-2 py-2"><span className={`rounded-full px-2 py-1 text-xs ${supplier.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{supplier.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-2 py-2 text-right"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => editSupplier(supplier)} className="text-xs text-indigo-200 hover:text-indigo-100">Edit</button><button type="button" onClick={() => void deactivateSupplier(supplier)} className="text-xs text-red-300 hover:text-red-200">Deactivate</button></div></td>
                  </tr>
                ))}
                {!filteredSuppliers.length && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-400">No suppliers found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form onSubmit={savePurchaseOrder} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Create Purchase Order</h2>
            <ManualHelpLink anchor="transaction-purchase-order" />
          </div>
          <select className={inputClass} required value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, supplierId: e.target.value }))}>
            <option value="">Select Supplier</option>
            {suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.supplierCode} - {supplier.name}</option>)}
          </select>
          <input className={inputClass} type="date" value={purchaseForm.expectedDate} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, expectedDate: e.target.value }))} />
          <textarea className={`${inputClass} min-h-[72px]`} placeholder="Notes" value={purchaseForm.notes} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <div className="space-y-3 rounded-lg border border-white/10 bg-black/10 p-3">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">Items</p><button type="button" onClick={addLine} className="text-xs text-indigo-200 hover:text-indigo-100">Add Item</button></div>
            {purchaseForm.items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 p-3">
                <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Line {index + 1}</span>{purchaseForm.items.length > 1 && <button type="button" onClick={() => removeLine(item.id)} className="text-xs text-red-300 hover:text-red-200">Remove</button>}</div>
                <select className={inputClass} value={item.productId} onChange={(e) => updateLine(item.id, 'productId', e.target.value)} required>
                  <option value="">Select Product</option>
                  {products.map((product) => <option key={product._id} value={product._id}>{product.sku} - {product.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputClass} type="number" min="1" step="0.01" placeholder="Quantity" value={item.quantity} onChange={(e) => updateLine(item.id, 'quantity', e.target.value)} />
                  <input className={inputClass} type="number" min="0" step="0.01" placeholder="Unit Cost" value={item.unitCost} onChange={(e) => updateLine(item.id, 'unitCost', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm">
            <div className="flex items-center justify-between text-gray-300"><span>Subtotal</span><span>{formatCurrency(purchaseTotals.subtotal)}</span></div>
            <div className="mt-1 flex items-center justify-between text-gray-300"><span>Tax</span><span>{formatCurrency(purchaseTotals.tax)}</span></div>
            <div className="mt-2 flex items-center justify-between font-semibold text-white"><span>Total</span><span>{formatCurrency(purchaseTotals.total)}</span></div>
          </div>
          <button type="submit" className={buttonClass} disabled={loading || productsLoading}>Create Purchase Order</button>
        </form>

        <div className="space-y-5 xl:col-span-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Purchase Orders</h2>
              <div className="flex flex-wrap gap-2">
                <input className={`${inputClass} min-w-[220px]`} placeholder="Search orders..." value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
                <select className={`${inputClass} min-w-[180px]`} value={orderStatus} onChange={(e) => setOrderStatus(e.target.value as 'all' | PurchaseOrderRow['status'])}>
                  {['all', 'pending', 'partially_received', 'completed', 'returned', 'cancelled'].map((status) => <option key={status} value={status}>{status === 'all' ? 'All status' : statusLabel(status)}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead><tr className="text-left text-gray-300"><th className="px-2 py-2">PO</th><th className="px-2 py-2">Supplier</th><th className="px-2 py-2">Date</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Total</th><th className="px-2 py-2 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-white/10">
                  {filteredOrders.map((order) => {
                    const hasPending = order.items.some((item) => Number(item.receivedQuantity || 0) < Number(item.quantity || 0));
                    const hasReceived = order.items.some((item) => Number(item.receivedQuantity || 0) > 0);
                    return (
                      <tr key={order._id}>
                        <td className="px-2 py-2 text-white"><div className="font-semibold">{order.purchaseNumber}</div><div className="text-xs text-gray-500">{order.items.length} item(s)</div></td>
                        <td className="px-2 py-2 text-gray-300"><div>{supplierName(order.supplierId)}</div><div className="text-xs text-gray-500">{supplierCode(order.supplierId)}</div></td>
                        <td className="px-2 py-2 text-gray-300"><div>{formatDate(order.orderDate)}</div><div className="text-xs text-gray-500">{formatDate(order.expectedDate)}</div></td>
                        <td className="px-2 py-2"><span className={`rounded-full px-2 py-1 text-xs ${order.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : order.status === 'returned' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>{statusLabel(order.status)}</span></td>
                        <td className="px-2 py-2 text-white">{formatCurrency(Number(order.totalAmount || 0))}</td>
                        <td className="px-2 py-2 text-right"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => openAction(order, 'receive')} className="text-xs text-emerald-200 hover:text-emerald-100" disabled={!hasPending}>Receive</button><button type="button" onClick={() => openAction(order, 'return')} className="text-xs text-amber-200 hover:text-amber-100" disabled={!hasReceived}>Return</button><button type="button" onClick={() => void createPurchaseBill(order)} className="text-xs text-cyan-200 hover:text-cyan-100" disabled={!hasReceived || loading}>Create Bill</button></div></td>
                      </tr>
                    );
                  })}
                  {!filteredOrders.length && <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">No purchase orders found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {action && selectedOrder && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-white">{action.mode === 'receive' ? 'Receive Stock' : 'Purchase Return'} for {selectedOrder.purchaseNumber}</h2>
                    <ManualHelpLink anchor={action.mode === 'receive' ? 'transaction-receive-stock' : 'transaction-purchase-return'} />
                  </div>
                  <p className="text-sm text-gray-300">{supplierName(selectedOrder.supplierId)}</p>
                </div>
                <button type="button" onClick={() => setAction(null)} className={ghostButtonClass}>Close</button>
              </div>

              {action.mode === 'receive' ? (
                <div className="space-y-3">
                  {receiveRows.map((row) => (
                    <div key={row.productId} className="rounded-lg border border-white/10 bg-black/10 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div><p className="font-semibold text-white">{row.productName}</p><p className="text-xs text-gray-400">{row.sku} | Pending {row.pending}</p></div>
                        <input className={`${inputClass} max-w-[160px]`} type="number" min="0" max={row.pending} step="0.01" placeholder="Receive qty" value={row.quantity} onChange={(e) => setReceiveRows((prev) => prev.map((item) => item.productId === row.productId ? { ...item, quantity: e.target.value } : item))} />
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <input className={inputClass} placeholder="Warehouse" value={row.warehouseLocation} onChange={(e) => setReceiveRows((prev) => prev.map((item) => item.productId === row.productId ? { ...item, warehouseLocation: e.target.value } : item))} />
                        <input className={inputClass} placeholder="Batch" value={row.batchNumber} onChange={(e) => setReceiveRows((prev) => prev.map((item) => item.productId === row.productId ? { ...item, batchNumber: e.target.value } : item))} />
                        <input className={inputClass} type="date" value={row.expiryDate} onChange={(e) => setReceiveRows((prev) => prev.map((item) => item.productId === row.productId ? { ...item, expiryDate: e.target.value } : item))} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => void saveReceive()} className={buttonClass} disabled={loading}>Receive Stock</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea className={`${inputClass} min-h-[84px]`} placeholder="Return reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
                  {returnRows.map((row) => (
                    <div key={row.productId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/10 p-3">
                      <div><p className="font-semibold text-white">{row.productName}</p><p className="text-xs text-gray-400">{row.sku} | Received {row.received}</p></div>
                      <input className={`${inputClass} max-w-[180px]`} type="number" min="0" max={row.received} step="0.01" placeholder="Return qty" value={row.quantity} onChange={(e) => setReturnRows((prev) => prev.map((item) => item.productId === row.productId ? { ...item, quantity: e.target.value } : item))} />
                    </div>
                  ))}
                  <button type="button" onClick={() => void saveReturn()} className={buttonClass} disabled={loading}>Process Return</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
