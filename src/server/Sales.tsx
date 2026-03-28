import React, { useState, useEffect } from 'react';
import './Sales.css';
import { formatCurrency } from '../shared/utils';
import { IProduct } from '@shared/types';

interface CartItem extends IProduct {
  quantity: number;
  cartId: string;
}

export const Sales = () => {
  const [products, setProducts] = useState<IProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/products?limit=100', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: IProduct) => {
    if (product.stock <= 0) {
      alert('Out of stock!');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item._id === product._id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert('Cannot add more than available stock');
          return prev;
        }
        return prev.map(item => 
          item._id === product._id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, cartId: Date.now().toString() }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item._id === productId) {
        const newQty = item.quantity + delta;
        if (newQty < 1) return item;
        if (newQty > item.stock) {
          alert('Stock limit reached');
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item._id !== productId));
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const gst = cart.reduce((acc, item) => {
      const itemTotal = item.price * item.quantity;
      return acc + (itemTotal * (item.gstRate || 18) / 100);
    }, 0);
    return { subtotal, gst, total: subtotal + gst };
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);

    try {
      const token = localStorage.getItem('token');
      const totals = calculateTotals();
      
      const saleData = {
        items: cart.map(item => ({
          productId: item._id,
          quantity: item.quantity,
          unitPrice: item.price,
          gstRate: item.gstRate
        })),
        paymentMethod,
        saleStatus: 'completed',
        paymentStatus: 'completed',
        subtotal: totals.subtotal,
        totalGst: totals.gst,
        totalAmount: totals.total
      };

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(saleData)
      });

      const data = await response.json();
      if (data.success) {
        alert('Sale completed successfully!');
        setCart([]);
        fetchProducts(); // Refresh stock
      } else {
        alert(data.error || 'Sale failed');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to process sale');
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { subtotal, gst, total } = calculateTotals();

  return (
    <div className="sales-container">
      <div className="products-section">
        <div className="search-bar">
          <input 
            type="text" 
            placeholder="Search products by name or SKU..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="products-grid">
          {loading ? <p>Loading products...</p> : filteredProducts.map(product => (
            <div 
              key={product._id} 
              className="product-card"
              onClick={() => addToCart(product)}
            >
              <div>
                <h3>{product.name}</h3>
                <div className="sku">{product.sku}</div>
                <div className="stock">Stock: {product.stock}</div>
              </div>
              <div className="price">{formatCurrency(product.price)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="cart-section">
        <div className="cart-header">
          <h2>Current Sale</h2>
        </div>
        
        <div className="cart-items">
          {cart.length === 0 ? (
            <p style={{textAlign: 'center', color: '#a0aec0', marginTop: '2rem'}}>Cart is empty</p>
          ) : (
            cart.map(item => (
              <div key={item.cartId} className="cart-item">
                <div className="cart-item-info">
                  <h4>{item.name}</h4>
                  <p>{formatCurrency(item.price)} x {item.quantity}</p>
                </div>
                <div className="cart-controls">
                  <button className="qty-btn" onClick={() => updateQuantity(item._id!, -1)}>-</button>
                  <span>{item.quantity}</span>
                  <button className="qty-btn" onClick={() => updateQuantity(item._id!, 1)}>+</button>
                  <button className="qty-btn" style={{color: 'red', borderColor: 'red'}} onClick={() => removeFromCart(item._id!)}>×</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-footer">
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>GST</span>
            <span>{formatCurrency(gst)}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>

          <div className="payment-methods">
            {['cash', 'card', 'upi'].map(method => (
              <button 
                key={method}
                className={`payment-btn ${paymentMethod === method ? 'active' : ''}`}
                onClick={() => setPaymentMethod(method)}
              >
                {method.toUpperCase()}
              </button>
            ))}
          </div>

          <button 
            className="checkout-btn" 
            disabled={cart.length === 0 || processing}
            onClick={handleCheckout}
          >
            {processing ? 'Processing...' : `Pay ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
};