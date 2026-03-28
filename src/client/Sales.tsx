import React, { useState } from 'react';
import { useProducts, Product } from '../hooks/useProducts';
import { formatCurrency } from '../config';
import { apiUrl } from './utils/api';

interface CartItem extends Product {
  cartQuantity: number;
}

export const Sales: React.FC = () => {
  const { products, loading, error, refetch } = useProducts();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState(false);

  const filteredProducts = products.filter(p => 
    (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
     p.sku.toLowerCase().includes(searchTerm.toLowerCase())) &&
    p.stock > 0
  );

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item._id === product._id);
      if (existing) {
        if (existing.cartQuantity >= product.stock) return prev; // Check stock limit
        return prev.map(item => 
          item._id === product._id 
            ? { ...item, cartQuantity: item.cartQuantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item._id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item._id === productId) {
        const newQty = item.cartQuantity + delta;
        if (newQty < 1) return item;
        if (newQty > item.stock) return item;
        return { ...item, cartQuantity: newQty };
      }
      return item;
    }));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);

    try {
      const token = localStorage.getItem('token');
      const orderItems = cart.map(item => ({
        product: item._id,
        quantity: item.cartQuantity
      }));

      const response = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: orderItems, paymentMethod: 'cash' })
      });

      if (response.ok) {
        alert('Order completed successfully!');
        setCart([]);
        refetch(); // Refresh product stock
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to process order');
      }
    } catch (err) {
      console.error(err);
      alert('Error processing order');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-6">Loading products...</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

  return (
    <div className="flex h-[calc(100vh-80px)] bg-black text-gray-200">
      {/* Product Selection - Left Side */}
      <div className="w-2/3 p-6 border-r border-gray-800 overflow-y-auto">
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search products..."
            className="w-full p-3 border border-gray-700 rounded-lg shadow-sm bg-gray-900 text-white focus:border-blue-500 outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <div 
              key={product._id} 
              onClick={() => addToCart(product)}
              className="p-4 border border-gray-700 rounded-lg shadow-sm hover:shadow-md cursor-pointer bg-gray-900 transition-all active:scale-95 hover:border-blue-500"
            >
              <div className="font-bold text-lg text-gray-100">{product.name}</div>
              <div className="text-gray-500 text-sm mb-2">{product.sku}</div>
              <div className="flex justify-between items-center mt-2">
                <span className="font-bold text-blue-400">{formatCurrency(product.price)}</span>
                <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">Stock: {product.stock}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart - Right Side */}
      <div className="w-1/3 p-6 bg-gray-900 flex flex-col border-l border-gray-800">
        <h2 className="text-2xl font-bold mb-4">Current Order</h2>
        
        <div className="flex-1 overflow-y-auto mb-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-gray-500 text-center mt-10">Cart is empty</div>
          ) : (
            cart.map(item => (
              <div key={item._id} className="bg-gray-800 p-3 rounded shadow-sm flex justify-between items-center border border-gray-700">
                <div className="flex-1">
                  <div className="font-medium text-gray-200">{item.name}</div>
                  <div className="text-sm text-gray-400">{formatCurrency(item.price)} x {item.cartQuantity}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-gray-600 rounded bg-gray-700">
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateQuantity(item._id, -1); }}
                      className="px-2 py-1 hover:bg-gray-600 text-gray-300"
                    >-</button>
                    <span className="px-2">{item.cartQuantity}</span>
                    <button 
                      className="px-2 py-1 hover:bg-gray-600 text-gray-300"
                    >+</button>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeFromCart(item._id); }}
                    className="text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-700 pt-4 mt-auto">
          <div className="flex justify-between text-xl font-bold mb-4">
            <span>Total:</span>
            <span>{formatCurrency(calculateTotal())}</span>
          </div>
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || processing}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {processing ? 'Processing...' : 'Complete Order'}
          </button>
        </div>
      </div>
    </div>
  );
};
