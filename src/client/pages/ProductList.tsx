import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../config';
import { Product, useProducts } from '../hooks/useProducts';
import { apiUrl, fetchApiJson } from '../utils/api';

type ProductColumnId =
  | 'name'
  | 'sku'
  | 'barcode'
  | 'category'
  | 'subcategory'
  | 'itemType'
  | 'description'
  | 'price'
  | 'wholesalePrice'
  | 'promotionalPrice'
  | 'cost'
  | 'gstRate'
  | 'taxType'
  | 'hsnCode'
  | 'stock'
  | 'minStock'
  | 'autoReorder'
  | 'reorderQuantity'
  | 'unit'
  | 'returnStock'
  | 'damagedStock'
  | 'allowNegativeStock'
  | 'batchTracking'
  | 'expiryRequired'
  | 'isActive'
  | 'createdAt'
  | 'updatedAt';

interface ColumnDef {
  id: ProductColumnId;
  label: string;
  defaultVisible: boolean;
}

const COLUMN_STORAGE_KEY = 'product_list_visible_columns_v1';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
type StockFilterOption = 'all' | 'inStock' | 'lowStock' | 'outOfStock';
type StatusFilterOption = 'all' | 'active' | 'inactive';
type SortDirection = 'asc' | 'desc';
type ProductSortField = ProductColumnId;

const SORT_FIELD_OPTIONS: Array<{ value: ProductSortField; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'sku', label: 'SKU' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'category', label: 'Category' },
  { value: 'subcategory', label: 'Subcategory' },
  { value: 'itemType', label: 'Item Type' },
  { value: 'description', label: 'Description' },
  { value: 'price', label: 'Selling Price' },
  { value: 'wholesalePrice', label: 'Wholesale Price' },
  { value: 'promotionalPrice', label: 'Promo Price' },
  { value: 'cost', label: 'Cost Price' },
  { value: 'stock', label: 'Stock' },
  { value: 'minStock', label: 'Min Stock' },
  { value: 'autoReorder', label: 'Auto Reorder' },
  { value: 'reorderQuantity', label: 'Reorder Qty' },
  { value: 'unit', label: 'Unit' },
  { value: 'gstRate', label: 'GST %' },
  { value: 'taxType', label: 'Tax Type' },
  { value: 'hsnCode', label: 'HSN Code' },
  { value: 'returnStock', label: 'Return Stock' },
  { value: 'damagedStock', label: 'Damaged Stock' },
  { value: 'allowNegativeStock', label: 'Allow Negative' },
  { value: 'batchTracking', label: 'Batch Tracking' },
  { value: 'expiryRequired', label: 'Expiry Required' },
  { value: 'isActive', label: 'Status' },
  { value: 'createdAt', label: 'Created Date' },
  { value: 'updatedAt', label: 'Updated Date' },
];

const columnDefs: ColumnDef[] = [
  { id: 'name', label: 'Name', defaultVisible: true },
  { id: 'sku', label: 'SKU', defaultVisible: true },
  { id: 'barcode', label: 'Barcode', defaultVisible: false },
  { id: 'category', label: 'Category', defaultVisible: true },
  { id: 'subcategory', label: 'Subcategory', defaultVisible: false },
  { id: 'itemType', label: 'Item Type', defaultVisible: false },
  { id: 'description', label: 'Description', defaultVisible: false },
  { id: 'price', label: 'Selling Price', defaultVisible: true },
  { id: 'wholesalePrice', label: 'Wholesale Price', defaultVisible: false },
  { id: 'promotionalPrice', label: 'Promo Price', defaultVisible: false },
  { id: 'cost', label: 'Cost Price', defaultVisible: true },
  { id: 'gstRate', label: 'GST %', defaultVisible: true },
  { id: 'taxType', label: 'Tax Type', defaultVisible: false },
  { id: 'hsnCode', label: 'HSN Code', defaultVisible: false },
  { id: 'stock', label: 'Stock', defaultVisible: true },
  { id: 'minStock', label: 'Min Stock', defaultVisible: true },
  { id: 'autoReorder', label: 'Auto Reorder', defaultVisible: false },
  { id: 'reorderQuantity', label: 'Reorder Qty', defaultVisible: false },
  { id: 'unit', label: 'Unit', defaultVisible: true },
  { id: 'returnStock', label: 'Return Stock', defaultVisible: false },
  { id: 'damagedStock', label: 'Damaged Stock', defaultVisible: false },
  { id: 'allowNegativeStock', label: 'Allow Negative', defaultVisible: false },
  { id: 'batchTracking', label: 'Batch Tracking', defaultVisible: false },
  { id: 'expiryRequired', label: 'Expiry Required', defaultVisible: false },
  { id: 'isActive', label: 'Status', defaultVisible: true },
  { id: 'createdAt', label: 'Created', defaultVisible: false },
  { id: 'updatedAt', label: 'Updated', defaultVisible: false },
];

const defaultVisibleColumns = columnDefs.filter((col) => col.defaultVisible).map((col) => col.id);

const parseStoredColumns = (): ProductColumnId[] => {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaultVisibleColumns;
    const parsed = JSON.parse(raw) as ProductColumnId[];
    const valid = parsed.filter((item) => columnDefs.some((col) => col.id === item));
    return valid.length ? valid : defaultVisibleColumns;
  } catch {
    return defaultVisibleColumns;
  }
};

const toDateText = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
};

const yesNo = (value?: boolean): string => (value ? 'Yes' : 'No');

const getSortValue = (product: Product, field: ProductSortField): number | string => {
  if (field === 'name') return String(product.name || '');
  if (field === 'sku') return String(product.sku || '');
  if (field === 'barcode') return String(product.barcode || '');
  if (field === 'category') return String(product.category || '');
  if (field === 'subcategory') return String(product.subcategory || '');
  if (field === 'itemType') return String(product.itemType || 'inventory');
  if (field === 'description') return String(product.description || '');
  if (field === 'price') return Number(product.price || 0);
  if (field === 'wholesalePrice') return Number(product.wholesalePrice || 0);
  if (field === 'promotionalPrice') return Number(product.promotionalPrice || 0);
  if (field === 'cost') return Number(product.cost || 0);
  if (field === 'stock') return Number(product.stock || 0);
  if (field === 'minStock') return Number(product.minStock || 0);
  if (field === 'autoReorder') return product.autoReorder ? 1 : 0;
  if (field === 'reorderQuantity') return Number(product.reorderQuantity || 0);
  if (field === 'unit') return String(product.unit || '');
  if (field === 'gstRate') return Number(product.gstRate || 0);
  if (field === 'taxType') return String(product.taxType || '');
  if (field === 'hsnCode') return String(product.hsnCode || '');
  if (field === 'returnStock') return Number(product.returnStock || 0);
  if (field === 'damagedStock') return Number(product.damagedStock || 0);
  if (field === 'allowNegativeStock') return product.allowNegativeStock ? 1 : 0;
  if (field === 'batchTracking') return product.batchTracking ? 1 : 0;
  if (field === 'expiryRequired') return product.expiryRequired ? 1 : 0;
  if (field === 'isActive') return product.isActive === false ? 0 : 1;
  if (field === 'createdAt') return new Date(product.createdAt || 0).getTime() || 0;
  if (field === 'updatedAt') return new Date(product.updatedAt || 0).getTime() || 0;
  return '';
};

export const ProductList: React.FC = () => {
  const { products, loading, error, refetch } = useProducts();
  const [search, setSearch] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ProductColumnId[]>(() => parseStoredColumns());
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('all');
  const [stockFilter, setStockFilter] = useState<StockFilterOption>('all');
  const [sortField, setSortField] = useState<ProductSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const token = localStorage.getItem('token');
      await fetchApiJson(apiUrl(`/api/products/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      refetch();
    } catch (err) {
      alert((err as Error)?.message || 'Failed to delete product');
    }
  };

  const searchedProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) =>
      [
        product.name,
        product.sku,
        product.barcode,
        product.category,
        product.subcategory,
        product.description,
        product.hsnCode,
        product.taxType,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [products, search]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(products.map((product) => String(product.category || '').trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const filtered = searchedProducts.filter((product) => {
      if (categoryFilter && String(product.category || '').trim() !== categoryFilter) return false;
      if (statusFilter === 'active' && product.isActive === false) return false;
      if (statusFilter === 'inactive' && product.isActive !== false) return false;

      const stock = Number(product.stock || 0);
      const minStock = Number(product.minStock || 0);
      if (stockFilter === 'inStock' && stock <= 0) return false;
      if (stockFilter === 'outOfStock' && stock > 0) return false;
      if (stockFilter === 'lowStock' && !(stock > 0 && stock <= minStock)) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aValue = getSortValue(a, sortField);
      const bValue = getSortValue(b, sortField);

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const compare = String(aValue).localeCompare(String(bValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortDirection === 'asc' ? compare : -compare;
    });

    return sorted;
  }, [searchedProducts, categoryFilter, statusFilter, stockFilter, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, search, categoryFilter, statusFilter, stockFilter, sortField, sortDirection]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const visibleColumnDefs = useMemo(
    () => columnDefs.filter((col) => visibleColumns.includes(col.id)),
    [visibleColumns]
  );

  const lowStockCount = useMemo(
    () =>
      filteredProducts.filter(
        (product) =>
          (product.itemType || 'inventory') === 'inventory'
          && Number(product.stock || 0) <= Number(product.minStock || 0)
      ).length,
    [filteredProducts]
  );

  const autoReorderCount = useMemo(
    () =>
      filteredProducts.filter(
        (product) =>
          product.autoReorder
          && (product.itemType || 'inventory') === 'inventory'
          && Number(product.stock || 0) <= Number(product.minStock || 0)
      ).length,
    [filteredProducts]
  );

  const totalStock = useMemo(
    () =>
      filteredProducts.reduce(
        (sum, product) => sum + ((product.itemType || 'inventory') === 'inventory' ? Number(product.stock || 0) : 0),
        0
      ),
    [filteredProducts]
  );

  const toggleColumn = (columnId: ProductColumnId) => {
    setVisibleColumns((prev) => {
      if (prev.includes(columnId)) {
        const next = prev.filter((id) => id !== columnId);
        return next.length ? next : prev;
      }
      return [...prev, columnId];
    });
  };

  const isSortableColumn = (_columnId: ProductColumnId): boolean => true;

  const toggleColumnSort = (columnId: ProductColumnId) => {
    if (!isSortableColumn(columnId)) return;
    if (sortField === columnId) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(columnId);
    setSortDirection('asc');
  };

  const sortArrow = (columnId: ProductColumnId): string => {
    if (!isSortableColumn(columnId)) return '';
    if (sortField !== columnId) return ' ↕';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const renderCell = (product: Product, columnId: ProductColumnId) => {
    if (columnId === 'name') return <span className="font-medium text-white">{product.name}</span>;
    if (columnId === 'sku') return product.sku || '-';
    if (columnId === 'barcode') return product.barcode || '-';
    if (columnId === 'category') {
      return (
        <span className="rounded bg-blue-400/10 px-2 py-0.5 text-xs font-medium text-blue-300">
          {product.category || '-'}
        </span>
      );
    }
    if (columnId === 'subcategory') return product.subcategory || '-';
    if (columnId === 'itemType') return String(product.itemType || 'inventory').replace('_', ' ');
    if (columnId === 'description') return product.description || '-';
    if (columnId === 'price') return formatCurrency(Number(product.price || 0));
    if (columnId === 'wholesalePrice') return formatCurrency(Number(product.wholesalePrice || 0));
    if (columnId === 'promotionalPrice') return Number(product.promotionalPrice || 0) > 0 ? formatCurrency(Number(product.promotionalPrice || 0)) : '-';
    if (columnId === 'cost') return formatCurrency(Number(product.cost || 0));
    if (columnId === 'gstRate') return `${Number(product.gstRate || 0)}%`;
    if (columnId === 'taxType') return String(product.taxType || 'gst').toUpperCase();
    if (columnId === 'hsnCode') return product.hsnCode || '-';
    if (columnId === 'stock') {
      const isLow = Number(product.stock || 0) <= Number(product.minStock || 0);
      return <span className={isLow ? 'font-semibold text-red-400' : 'text-emerald-300'}>{Number(product.stock || 0)}</span>;
    }
    if (columnId === 'minStock') return Number(product.minStock || 0);
    if (columnId === 'autoReorder') return yesNo(product.autoReorder);
    if (columnId === 'reorderQuantity') return Number(product.reorderQuantity || 0);
    if (columnId === 'unit') return product.unit || '-';
    if (columnId === 'returnStock') return Number(product.returnStock || 0);
    if (columnId === 'damagedStock') return Number(product.damagedStock || 0);
    if (columnId === 'allowNegativeStock') return yesNo(product.allowNegativeStock);
    if (columnId === 'batchTracking') return yesNo(product.batchTracking);
    if (columnId === 'expiryRequired') return yesNo(product.expiryRequired);
    if (columnId === 'isActive') {
      const active = product.isActive !== false;
      return (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
          {active ? 'Active' : 'Inactive'}
        </span>
      );
    }
    if (columnId === 'createdAt') return toDateText(product.createdAt);
    if (columnId === 'updatedAt') return toDateText(product.updatedAt);
    return '-';
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading products...</div>;
  if (error) return <div className="mx-auto max-w-7xl px-4 py-6 text-red-500">Error: {error}</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-sky-200/80">Catalog Review</p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Product Catalog</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/products"
            className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Product Center
          </Link>
          <Link
            to="/products/alerts"
            className="rounded-md bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            Stock Alerts
          </Link>
          <button
            type="button"
            onClick={() => setShowColumnPicker((value) => !value)}
            className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Customize Columns
          </button>
          <button
            type="button"
            onClick={refetch}
            className="rounded-md bg-indigo-500/90 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
          >
            Refresh
          </button>
          <Link
            to="/products/entry"
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
          >
            Add Product
          </Link>
        </div>
      </div>

      {showColumnPicker && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Choose columns to display</p>
            <button
              type="button"
              onClick={() => setVisibleColumns(defaultVisibleColumns)}
              className="rounded-md bg-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/20"
            >
              Reset Default
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {columnDefs.map((col) => (
              <label key={col.id} className="flex items-center gap-2 rounded bg-black/20 px-2 py-1.5 text-xs text-gray-200">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.id)}
                  onChange={() => toggleColumn(col.id)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-gray-400">Filtered Products</p>
          <p className="text-lg font-semibold text-white">{filteredProducts.length}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-gray-400">Total Stock</p>
          <p className="text-lg font-semibold text-white">{totalStock}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-gray-400">Low Stock</p>
          <p className="text-lg font-semibold text-red-400">{lowStockCount}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-gray-400">Visible Columns</p>
          <p className="text-lg font-semibold text-white">{visibleColumnDefs.length + 1}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-gray-400">Auto-Reorder</p>
          <p className="text-lg font-semibold text-cyan-300">{autoReorderCount}</p>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, barcode, category, HSN, tax type..."
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 sm:max-w-xl"
          />
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-gray-900">
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            title="Filter by category"
          >
            <option value="" className="bg-gray-900">
              All categories
            </option>
            {categoryOptions.map((category) => (
              <option key={category} value={category} className="bg-gray-900">
                {category}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilterOption)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            title="Filter by status"
          >
            <option value="all" className="bg-gray-900">
              All status
            </option>
            <option value="active" className="bg-gray-900">
              Active only
            </option>
            <option value="inactive" className="bg-gray-900">
              Inactive only
            </option>
          </select>

          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as StockFilterOption)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            title="Filter by stock level"
          >
            <option value="all" className="bg-gray-900">
              All stock
            </option>
            <option value="inStock" className="bg-gray-900">
              In stock
            </option>
            <option value="lowStock" className="bg-gray-900">
              Low stock
            </option>
            <option value="outOfStock" className="bg-gray-900">
              Out of stock
            </option>
          </select>

          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as ProductSortField)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            title="Sort by field"
          >
            {SORT_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-gray-900">
                Sort: {option.label}
              </option>
            ))}
          </select>

          <select
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value as SortDirection)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            title="Sort direction"
          >
            <option value="asc" className="bg-gray-900">
              Ascending
            </option>
            <option value="desc" className="bg-gray-900">
              Descending
            </option>
          </select>

          <button
            type="button"
            onClick={() => {
              setCategoryFilter('');
              setStatusFilter('all');
              setStockFilter('all');
              setSortField('name');
              setSortDirection('asc');
            }}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
          >
            Reset Filter/Sort
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5">
            <tr>
              {visibleColumnDefs.map((col) => (
                <th key={col.id} className="px-4 py-3 text-left text-sm font-semibold text-white">
                  <button
                    type="button"
                    onClick={() => toggleColumnSort(col.id)}
                    className={`rounded px-1 py-0.5 ${
                      isSortableColumn(col.id) ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'
                    }`}
                    title={isSortableColumn(col.id) ? 'Sort' : undefined}
                  >
                    {col.label}
                    {sortArrow(col.id)}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {paginatedProducts.map((product) => (
              <tr key={product._id}>
                {visibleColumnDefs.map((col) => (
                  <td key={`${product._id}-${col.id}`} className="whitespace-nowrap px-4 py-3 text-sm text-gray-300">
                    {renderCell(product, col.id)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link to={`/products/edit/${product._id}`} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(product._id)}
                      className="text-sm font-semibold text-red-300 hover:text-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!paginatedProducts.length && (
              <tr>
                <td colSpan={visibleColumnDefs.length + 1} className="px-4 py-6 text-center text-sm text-gray-400">
                  No products found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-gray-400">
          Showing {filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
          {Math.min(currentPage * pageSize, filteredProducts.length)} of {filteredProducts.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: Math.min(7, totalPages) }, (_, idx) => {
            const startPage = Math.max(1, Math.min(currentPage - 3, totalPages - 6));
            const page = startPage + idx;
            if (page > totalPages) return null;
            return (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  currentPage === page
                    ? 'bg-indigo-500 text-white'
                    : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                {page}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
