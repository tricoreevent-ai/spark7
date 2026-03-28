import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PermissionMatrix } from '@shared/rbac';

interface SalesDashboardProps {
  permissions: PermissionMatrix;
}

export const SalesDashboard: React.FC<SalesDashboardProps> = ({ permissions }) => {
  const navigate = useNavigate();
  const hasProductWorkspaceAccess = permissions.products || permissions.sales;
  const salesCards = [
    {
      key: 'sales',
      title: 'New Sale (POS)',
      description: 'Open Point of Sale terminal to create new invoices.',
      path: '/sales',
      icon: '➕',
    },
    {
      key: 'orders',
      title: 'Sales History',
      description: 'View and manage past orders and transactions.',
      path: '/orders',
      icon: '📜',
    },
    {
      key: 'returns',
      title: 'Returns',
      description: 'Process and manage product returns.',
      path: '/returns',
      icon: '↩️',
    },
    {
      key: 'reports',
      title: 'Analytics',
      description: 'View detailed sales reports and insights.',
      path: '/reports',
      icon: '📊',
    },
  ].filter((card) => permissions[card.key as keyof PermissionMatrix]);

  const productCards = [
    {
      title: 'Product Entry',
      description: 'Add new products, pricing, GST, barcode, and stock settings.',
      path: '/products/entry',
      icon: '➕',
    },
    {
      title: 'Product Catalog',
      description: 'Review and edit the product list used in billing.',
      path: '/products/catalog',
      icon: '📦',
    },
    {
      title: 'Stock Alerts',
      description: 'Review low-stock and auto-reorder items before selling.',
      path: '/products/alerts',
      icon: '🚨',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">Sales Dashboard</h1>
          <p className="mt-2 text-sm text-gray-400">Sales operations, billing shortcuts, and product setup links in one place.</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-200">Sales Actions</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {salesCards.map((card) => (
            <button
              key={card.path}
              type="button"
              className="overflow-hidden rounded-lg border border-white/10 bg-white/5 text-left shadow transition-all hover:bg-white/10"
              onClick={() => navigate(card.path)}
            >
              <div className="p-5">
                <h3 className="text-lg font-medium leading-6 text-white">{card.icon} {card.title}</h3>
                <p className="mt-2 text-sm text-gray-400">{card.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {hasProductWorkspaceAccess && (
        <div className="mt-6 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-200">Product Setup</h2>
              <p className="mt-1 text-sm text-gray-400">Open product entry and catalog pages directly from the sales area.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {productCards.map((card) => (
              <button
                key={card.path}
                type="button"
                className="overflow-hidden rounded-lg border border-white/10 bg-white/5 text-left shadow transition-all hover:bg-white/10"
                onClick={() => navigate(card.path)}
              >
                <div className="p-5">
                  <h3 className="text-lg font-medium leading-6 text-white">{card.icon} {card.title}</h3>
                  <p className="mt-2 text-sm text-gray-400">{card.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
