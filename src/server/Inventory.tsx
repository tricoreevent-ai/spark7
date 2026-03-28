import React, { useState, useEffect } from 'react';
import './Inventory.css';
import { formatCurrency } from '../shared/utils';

interface InventoryItem {
  _id: string;
  productId: {
    _id: string;
    name: string;
    sku: string;
    minStock: number;
    unit: string;
  };
  quantity: number;
  warehouseLocation: string;
  batchNumber: string;
  lastRestockDate: string;
}

export const Inventory = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updateAction, setUpdateAction] = useState<'add' | 'subtract' | 'set'>('add');
  const [updateQuantity, setUpdateQuantity] = useState<number>(0);

  const fetchInventory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/inventory', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setInventory(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch inventory', error);
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
      const response = await fetch(`/api/inventory/${selectedItem.productId._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          quantity: Number(updateQuantity),
          action: updateAction
        })
      });

      const data = await response.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchInventory();
        setUpdateQuantity(0);
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Error updating stock', error);
    }
  };

  const openUpdateModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setUpdateAction('add');
    setUpdateQuantity(0);
    setIsModalOpen(true);
  };

  if (loading) return <div className="inventory-container">Loading inventory...</div>;

  const lowStockCount = inventory.filter(i => i.quantity <= i.productId.minStock).length;
  const totalItems = inventory.length;
  const totalStock = inventory.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="inventory-container">
      <div className="page-header">
        <h1>Inventory Management</h1>
        <button className="action-btn" onClick={fetchInventory}>Refresh Data</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Products</h3>
          <div className="value">{totalItems}</div>
        </div>
        <div className="stat-card">
          <h3>Total Units</h3>
          <div className="value">{totalStock}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #e53e3e' }}>
          <h3>Low Stock Alerts</h3>
          <div className="value" style={{ color: '#e53e3e' }}>{lowStockCount}</div>
        </div>
      </div>

      <div className="inventory-table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>SKU</th>
              <th>Location</th>
              <th>Stock Level</th>
              <th>Status</th>
              <th>Last Restock</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item._id}>
                <td>{item.productId.name}</td>
                <td>{item.productId.sku}</td>
                <td>{item.warehouseLocation || 'Main Store'}</td>
                <td>
                  {item.quantity} {item.productId.unit}
                </td>
                <td>
                  <span className={`stock-badge ${item.quantity <= item.productId.minStock ? 'low' : 'good'}`}>
                    {item.quantity <= item.productId.minStock ? 'Low Stock' : 'In Stock'}
                  </span>
                </td>
                <td>{new Date(item.lastRestockDate).toLocaleDateString()}</td>
                <td>
                  <button 
                    className="action-btn"
                    onClick={() => openUpdateModal(item)}
                  >
                    Update Stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && selectedItem && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Update Stock: {selectedItem.productId.name}</h2>
            <p style={{color: '#666', marginBottom: '1rem'}}>Current Stock: {selectedItem.quantity} {selectedItem.productId.unit}</p>
            
            <form onSubmit={handleUpdateStock}>
              <div className="form-group">
                <label>Action</label>
                <select 
                  value={updateAction} 
                  onChange={(e) => setUpdateAction(e.target.value as any)}
                >
                  <option value="add">Add Stock (+)</option>
                  <option value="subtract">Remove Stock (-)</option>
                  <option value="set">Set Exact Quantity (=)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={updateQuantity}
                  onChange={(e) => setUpdateQuantity(Number(e.target.value))}
                  required
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="action-btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn">
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