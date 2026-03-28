import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Product, useProducts } from '../hooks/useProducts';

const isInventoryItem = (product: Product): boolean => (product.itemType || 'inventory') === 'inventory';

const sortByStockGap = (a: Product, b: Product): number => {
  const aGap = Number(a.stock || 0) - Number(a.minStock || 0);
  const bGap = Number(b.stock || 0) - Number(b.minStock || 0);
  return aGap - bGap;
};

export const ProductAlerts: React.FC = () => {
  const { products, loading, error } = useProducts();

  const data = useMemo(() => {
    const inventoryItems = products.filter(isInventoryItem);
    const lowStock = inventoryItems
      .filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= Number(product.minStock || 0))
      .sort(sortByStockGap);
    const outOfStock = inventoryItems
      .filter((product) => Number(product.stock || 0) <= 0)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const reorderQueue = inventoryItems
      .filter((product) => product.autoReorder && Number(product.stock || 0) <= Number(product.minStock || 0))
      .sort(sortByStockGap);
    const inactiveItems = products
      .filter((product) => product.isActive === false)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    return { lowStock, outOfStock, reorderQueue, inactiveItems };
  }, [products]);

  const sections: Array<{
    title: string;
    subtitle: string;
    rows: Product[];
    accent: string;
    badgeClass: string;
    empty: string;
  }> = [
    {
      title: 'Low Stock',
      subtitle: 'Inventory items below or at minimum stock threshold.',
      rows: data.lowStock,
      accent: 'border-amber-500/30 bg-amber-500/10',
      badgeClass: 'bg-amber-500/20 text-amber-100',
      empty: 'No low-stock items at the moment.',
    },
    {
      title: 'Out of Stock',
      subtitle: 'Inventory items that need replenishment before next sale.',
      rows: data.outOfStock,
      accent: 'border-rose-500/30 bg-rose-500/10',
      badgeClass: 'bg-rose-500/20 text-rose-100',
      empty: 'No out-of-stock items right now.',
    },
    {
      title: 'Auto-Reorder Queue',
      subtitle: 'Products flagged for replenishment suggestions.',
      rows: data.reorderQueue,
      accent: 'border-cyan-500/30 bg-cyan-500/10',
      badgeClass: 'bg-cyan-500/20 text-cyan-100',
      empty: 'No products are currently waiting in the auto-reorder queue.',
    },
    {
      title: 'Inactive Products',
      subtitle: 'Products hidden from active catalog operations.',
      rows: data.inactiveItems,
      accent: 'border-slate-500/30 bg-slate-500/10',
      badgeClass: 'bg-slate-500/20 text-slate-100',
      empty: 'No inactive products in the catalog.',
    },
  ];

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading product alerts...</div>;
  }

  if (error) {
    return <div className="mx-auto max-w-7xl px-4 py-8 text-red-400">Failed to load product alerts: {error}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-amber-200/80">Product Monitoring</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Stock Alerts</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-300">
            Review product issues that need action from catalog managers, store operators, or procurement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/products" className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
            Product Center
          </Link>
          <Link to="/products/catalog" className="rounded-md bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30">
            Product Catalog
          </Link>
          <Link to="/products/entry" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
            Add Product
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Low Stock</p>
          <p className="mt-2 text-2xl font-semibold text-amber-300">{data.lowStock.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Out of Stock</p>
          <p className="mt-2 text-2xl font-semibold text-rose-300">{data.outOfStock.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Auto-Reorder</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-300">{data.reorderQueue.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Inactive</p>
          <p className="mt-2 text-2xl font-semibold text-slate-200">{data.inactiveItems.length}</p>
        </div>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.title} className={`rounded-2xl border p-5 ${section.accent}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                <p className="text-sm text-gray-200/80">{section.subtitle}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${section.badgeClass}`}>{section.rows.length} item(s)</span>
            </div>

            {section.rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-black/10 px-4 py-6 text-sm text-gray-100/70">
                {section.empty}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white">Product</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white">Type</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white">Stock</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white">Min</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white">Reorder Qty</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-white">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {section.rows.map((product) => (
                      <tr key={product._id}>
                        <td className="px-4 py-3 text-sm text-white">
                          <div>
                            <p className="font-semibold">{product.name}</p>
                            <p className="text-xs text-gray-400">{product.sku || 'No SKU'} {product.barcode ? `• ${product.barcode}` : ''}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{String(product.itemType || 'inventory').replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{product.category || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{Number(product.stock || 0)}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{Number(product.minStock || 0)}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{Number(product.reorderQuantity || 0)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/products/edit/${product._id}`} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">
                            Edit Product
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};
