import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { ProductCenterInsights } from '../components/ProductCenterInsights';
import { formatCurrency } from '../config';
import { Product, useProducts } from '../hooks/useProducts';

const isInventoryItem = (product: Product): boolean => (product.itemType || 'inventory') === 'inventory';
const isActiveProduct = (product: Product): boolean => product.isActive !== false;

const isPromotionActive = (product: Product): boolean => {
  const promotionalPrice = Number(product.promotionalPrice || 0);
  if (promotionalPrice <= 0) return false;

  const now = new Date();
  const start = product.promotionStartDate ? new Date(product.promotionStartDate) : null;
  const end = product.promotionEndDate ? new Date(product.promotionEndDate) : null;

  if (start && !Number.isNaN(start.getTime()) && start > now) return false;
  if (end && !Number.isNaN(end.getTime()) && end < now) return false;
  return true;
};

export const ProductCenter: React.FC = () => {
  const { products, loading, error } = useProducts();

  const metrics = useMemo(() => {
    const activeProducts = products.filter(isActiveProduct);
    const inventoryItems = activeProducts.filter(isInventoryItem);
    const lowStockItems = inventoryItems.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= Number(product.minStock || 0));
    const outOfStockItems = inventoryItems.filter((product) => Number(product.stock || 0) <= 0);
    const autoReorderItems = inventoryItems.filter(
      (product) => product.autoReorder && Number(product.stock || 0) <= Number(product.minStock || 0)
    );
    const activePromotions = activeProducts.filter(isPromotionActive);
    const inactiveItems = products.filter((product) => product.isActive === false);

    return {
      total: products.length,
      inventory: inventoryItems.length,
      services: products.filter((product) => product.itemType === 'service').length,
      nonInventory: products.filter((product) => product.itemType === 'non_inventory').length,
      lowStock: lowStockItems.length,
      outOfStock: outOfStockItems.length,
      autoReorder: autoReorderItems.length,
      promotions: activePromotions.length,
      inactive: inactiveItems.length,
      stockValue: inventoryItems.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.cost || 0), 0),
      totalShopWorth: activeProducts.reduce(
        (sum, product) => sum + Number(product.stock || 0) * Number(product.wholesalePrice || 0),
        0
      ),
      lowStockItems: lowStockItems
        .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
        .slice(0, 5),
      recentItems: [...products]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
        .slice(0, 6),
    };
  }, [products]);

  const quickLinks = [
    {
      title: 'Product Entry',
      description: 'Create new products with SKU, barcode, pricing, tax, stock, and reorder settings.',
      path: '/products/entry',
      accent: 'from-emerald-500/25 to-emerald-400/10',
      icon: '➕',
    },
    {
      title: 'Bulk Product Entry',
      description: 'Download the Excel template and import or update products in large batches.',
      path: '/products/bulk-entry',
      accent: 'from-violet-500/25 to-violet-400/10',
      icon: '📥',
    },
    {
      title: 'Product Catalog',
      description: 'Browse, filter, and edit the full product list with configurable columns.',
      path: '/products/catalog',
      accent: 'from-sky-500/25 to-sky-400/10',
      icon: '📦',
    },
    {
      title: 'Stock Alerts',
      description: 'Review low stock, out-of-stock, and auto-reorder candidates in one place.',
      path: '/products/alerts',
      accent: 'from-amber-500/25 to-amber-400/10',
      icon: '🚨',
    },
    {
      title: 'Categories',
      description: 'Maintain category structure used by the product catalog.',
      path: '/categories',
      accent: 'from-indigo-500/25 to-indigo-400/10',
      icon: '🗂️',
    },
    {
      title: 'Procurement',
      description: 'Open supplier and purchasing workflows tied to stock replenishment.',
      path: '/inventory/procurement',
      accent: 'from-cyan-500/25 to-cyan-400/10',
      icon: '🚚',
    },
  ];

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading product center...</div>;
  }

  if (error) {
    return <div className="mx-auto max-w-7xl px-4 py-8 text-red-400">Failed to load products: {error}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-sky-200/80">Catalog Workspace</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Product Center</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-300">
            This is the product entry point for SPARK AI. Use it to open product entry, catalog review, pricing and stock monitoring workflows.
          </p>
          <p className="mt-2 max-w-3xl text-xs text-gray-500 sm:text-sm">
            Total Products counts all product masters. Low Stock means active inventory stock is above 0 but at or below Min Stock. Out of Stock means active inventory stock is 0 or lower. Total Worth of Products in Shop is calculated as quantity in stock multiplied by wholesale purchase price for active catalog products.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ManualHelpLink anchor="product-center-logic" />
          <Link to="/products/entry" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
            New Product
          </Link>
          <Link to="/products/bulk-entry" className="rounded-md bg-violet-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">
            Bulk Entry
          </Link>
          <Link to="/products/catalog" className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
            Open Catalog
          </Link>
          <Link to="/products/alerts" className="rounded-md bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30">
            Stock Alerts
          </Link>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Total Products</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metrics.total}</p>
          <p className="mt-2 text-xs text-gray-400">{metrics.inventory} inventory, {metrics.services} services, {metrics.nonInventory} non-inventory</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Low Stock</p>
          <p className="mt-2 text-2xl font-semibold text-amber-300">{metrics.lowStock}</p>
          <p className="mt-2 text-xs text-gray-400">{metrics.autoReorder} marked for auto-reorder</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Out of Stock</p>
          <p className="mt-2 text-2xl font-semibold text-rose-300">{metrics.outOfStock}</p>
          <p className="mt-2 text-xs text-gray-400">Inventory items that need replenishment soonest</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Promotions</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">{metrics.promotions}</p>
          <p className="mt-2 text-xs text-gray-400">{metrics.inactive} inactive items in catalog</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Stock Value</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-200">{formatCurrency(metrics.stockValue)}</p>
          <p className="mt-2 text-xs text-gray-400">Approximate cost-based inventory value</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Total Worth of Products in Shop</p>
          <p className="mt-2 text-2xl font-semibold text-violet-200">{formatCurrency(metrics.totalShopWorth)}</p>
          <p className="mt-2 text-xs text-gray-400">Stock quantity multiplied by wholesale purchase price</p>
        </div>
      </div>

      <ProductCenterInsights products={products} />

      <div className="mb-8 grid grid-cols-1 gap-4 xl:grid-cols-6">
        {quickLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`rounded-2xl border border-white/10 bg-gradient-to-br ${link.accent} p-5 transition hover:-translate-y-0.5 hover:border-white/20`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-2xl">{link.icon}</span>
              <span className="rounded-full bg-black/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80">Open</span>
            </div>
            <h2 className="text-lg font-semibold text-white">{link.title}</h2>
            <p className="mt-2 text-sm text-gray-200/90">{link.description}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Low Stock Snapshot</h2>
              <p className="text-sm text-gray-400">The most urgent inventory items that need product or purchasing attention.</p>
            </div>
            <Link to="/products/alerts" className="text-sm font-semibold text-amber-200 hover:text-amber-100">
              View all alerts
            </Link>
          </div>

          {metrics.lowStockItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
              No low-stock inventory items right now.
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.lowStockItems.map((product) => (
                <div key={product._id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.sku || 'No SKU'} • {product.category || 'Uncategorized'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-rose-500/15 px-3 py-1 text-rose-200">Stock {Number(product.stock || 0)}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-gray-200">Min {Number(product.minStock || 0)}</span>
                    <Link to={`/products/edit/${product._id}`} className="font-semibold text-indigo-300 hover:text-indigo-200">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Recently Updated</h2>
            <p className="text-sm text-gray-400">Quick jump list for the latest product changes.</p>
          </div>

          <div className="space-y-3">
            {metrics.recentItems.map((product) => (
              <Link
                key={product._id}
                to={`/products/edit/${product._id}`}
                className="block rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-white/20 hover:bg-black/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.category || 'Uncategorized'} • {product.itemType || 'inventory'}</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(product.updatedAt || product.createdAt || Date.now()).toLocaleDateString('en-IN')}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
                  <span className="rounded-full bg-white/10 px-2.5 py-1">{formatCurrency(Number(product.price || 0))}</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1">Stock {Number(product.stock || 0)}</span>
                  {product.promotionalPrice ? (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
                      Promo {formatCurrency(Number(product.promotionalPrice || 0))}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
            {metrics.recentItems.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-gray-400">
                No products have been added yet. Start from Product Entry.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
