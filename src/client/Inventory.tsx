import React, { useState, useEffect } from 'react';
import { apiUrl, fetchApiJson } from './utils/api';
import { showAlertDialog } from './utils/appDialogs';

interface InventoryItem {
  _id: string;
  productId: {
    _id: string;
    name: string;
    sku: string;
    barcode?: string;
    minStock: number;
    unit: string;
  };
  quantity: number;
  warehouseLocation: string;
  storeLocation?: string;
  rackLocation?: string;
  shelfLocation?: string;
  batchNumber: string;
  expiryDate?: string | null;
  adjustmentReason?: string;
  lastRestockDate: string;
}

export const Inventory = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updateAction, setUpdateAction] = useState<'add' | 'subtract' | 'set' | 'stock_in' | 'stock_out'>('stock_in');
  const [updateQuantity, setUpdateQuantity] = useState<number>(0);
  const [updateReason, setUpdateReason] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [rackLocation, setRackLocation] = useState('');
  const [shelfLocation, setShelfLocation] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState('');

  const fetchInventory = async () => {
    try {
      setError('');
      const token = localStorage.getItem('token');
      const data = await fetchApiJson(apiUrl('/api/inventory?limit=1000'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInventory(data.data || []);
    } catch (error) {
      console.error('Failed to fetch inventory', error);
      setError((error as Error)?.message || 'Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      const token = localStorage.getItem('token');
      await fetchApiJson(apiUrl(`/api/inventory/${selectedItem.productId._id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quantity: Number(updateQuantity),
          action: updateAction,
          adjustmentReason: updateReason,
          warehouseLocation,
          storeLocation,
          rackLocation,
          shelfLocation,
          batchNumber,
          expiryDate: expiryDate || undefined,
        }),
      });
      setIsModalOpen(false);
      setUpdateQuantity(0);
      setUpdateReason('');
      fetchInventory();
    } catch (error) {
      console.error('Error updating stock', error);
      await showAlertDialog((error as Error)?.message || 'Failed to update stock');
    }
  };

  const openUpdateModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setUpdateAction('stock_in');
    setUpdateQuantity(0);
    setUpdateReason(item.adjustmentReason || '');
    setWarehouseLocation(item.warehouseLocation || '');
    setStoreLocation(item.storeLocation || '');
    setRackLocation(item.rackLocation || '');
    setShelfLocation(item.shelfLocation || '');
    setBatchNumber(item.batchNumber || '');
    setExpiryDate(item.expiryDate ? String(item.expiryDate).slice(0, 10) : '');
    setIsModalOpen(true);
  };

  if (loading) return <div className="p-8 text-center text-gray-300">Loading inventory...</div>;

  const lowStockCount = inventory.filter((i) => i.quantity <= i.productId.minStock).length;
  const outOfStockCount = inventory.filter((i) => i.quantity <= 0).length;
  const totalItems = inventory.length;
  const totalStock = inventory.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Inventory Management</h1>
        <button className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400" onClick={fetchInventory}>Refresh Data</button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm text-gray-400">Total Products</h3>
          <div className="mt-1 text-3xl font-semibold text-white">{totalItems}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm text-gray-400">Total Units</h3>
          <div className="mt-1 text-3xl font-semibold text-white">{totalStock}</div>
        </div>
        <div className="rounded-lg border border-white/10 border-l-4 border-l-red-500 bg-white/5 p-5">
          <h3 className="text-sm text-gray-400">Low Stock Alerts</h3>
          <div className="mt-1 text-3xl font-semibold text-red-400">{lowStockCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 border-l-4 border-l-amber-500 bg-white/5 p-5">
          <h3 className="text-sm text-gray-400">Out of Stock</h3>
          <div className="mt-1 text-3xl font-semibold text-amber-300">{outOfStockCount}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Product Name</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">SKU</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Barcode</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Location</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Stock Level</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Last Restock</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {inventory.map((item) => (
              <tr key={item._id}>
                <td className="px-4 py-3 text-sm text-white">{item.productId.name}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.productId.sku}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.productId.barcode || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  <div>{item.warehouseLocation || 'Main Store'}</div>
                  <div className="text-xs text-gray-400">
                    {[item.storeLocation, item.rackLocation, item.shelfLocation].filter(Boolean).join(' / ') || '-'}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.quantity} {item.productId.unit}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    item.quantity <= 0
                      ? 'bg-red-500/20 text-red-300'
                      : item.quantity <= item.productId.minStock
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {item.quantity <= 0 ? 'Out of Stock' : item.quantity <= item.productId.minStock ? 'Low Stock' : 'In Stock'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">{new Date(item.lastRestockDate).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-3 text-sm">
                  <button className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400" onClick={() => openUpdateModal(item)}>
                    Update Stock
                  </button>
                </td>
              </tr>
            ))}
            {inventory.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">
                  No inventory rows found. Add products from Catalog to populate inventory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-gray-900 p-6">
            <h2 className="text-xl font-semibold text-white">Update Stock: {selectedItem.productId.name}</h2>
            <p className="mt-1 text-sm text-gray-400">Current Stock: {selectedItem.quantity} {selectedItem.productId.unit}</p>

            <form onSubmit={handleUpdateStock} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-300">Action</label>
                <select
                  value={updateAction}
                  onChange={(e) => setUpdateAction(e.target.value as 'add' | 'subtract' | 'set' | 'stock_in' | 'stock_out')}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                >
                  <option value="stock_in">Stock In (+)</option>
                  <option value="stock_out">Stock Out (-)</option>
                  <option value="add">Add Stock (+)</option>
                  <option value="subtract">Remove Stock (-)</option>
                  <option value="set">Set Exact Quantity (=)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Quantity</label>
                <input
                  type="number"
                  min={updateAction === 'set' ? 0 : 1}
                  value={updateQuantity}
                  onChange={(e) => setUpdateQuantity(Number(e.target.value))}
                  required
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Adjustment Reason</label>
                <input
                  type="text"
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                  placeholder="Manual correction, damage, expiry, loss, etc."
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Warehouse</label>
                  <input
                    type="text"
                    value={warehouseLocation}
                    onChange={(e) => setWarehouseLocation(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Store</label>
                  <input
                    type="text"
                    value={storeLocation}
                    onChange={(e) => setStoreLocation(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Rack</label>
                  <input
                    type="text"
                    value={rackLocation}
                    onChange={(e) => setRackLocation(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Shelf</label>
                  <input
                    type="text"
                    value={shelfLocation}
                    onChange={(e) => setShelfLocation(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Batch</label>
                  <input
                    type="text"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
                  Confirm Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
