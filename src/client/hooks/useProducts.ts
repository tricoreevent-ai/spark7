import { useState, useEffect, useCallback } from 'react';
import { apiUrl, fetchApiJson } from '../utils/api';

export interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  subcategory?: string;
  itemType?: 'inventory' | 'service' | 'non_inventory';
  price: number;
  promotionalPrice?: number;
  promotionStartDate?: string;
  promotionEndDate?: string;
  priceTiers?: Array<{
    tierName: string;
    minQuantity: number;
    unitPrice: number;
  }>;
  cost: number;
  stock: number;
  minStock: number;
  autoReorder?: boolean;
  reorderQuantity?: number;
  unit: string;
  gstRate: number;
  description?: string;
  wholesalePrice?: number;
  taxType?: 'gst' | 'vat';
  hsnCode?: string;
  returnStock?: number;
  damagedStock?: number;
  allowNegativeStock?: boolean;
  batchTracking?: boolean;
  expiryRequired?: boolean;
  serialNumberTracking?: boolean;
  variantSize?: string;
  variantColor?: string;
  imageUrl?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const useProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const pageSize = 250;
      const maxTotal = 50_000; // safety cap for very large catalogs
      let skip = 0;
      let total: number | null = null;
      const merged: Product[] = [];

      while (skip < maxTotal) {
        const data = await fetchApiJson(apiUrl(`/api/products?skip=${skip}&limit=${pageSize}&isActive=all`), { headers });
        const rows: Product[] = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data)
          ? (data as any)
          : [];

        merged.push(...rows);

        const nextTotal = Number(data?.pagination?.total);
        if (!Number.isNaN(nextTotal) && nextTotal >= 0) {
          total = nextTotal;
        }

        skip += rows.length;
        if (rows.length === 0) break;
        if (total !== null && skip >= total) break;
      }

      setProducts(merged);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refetch: fetchProducts };
};
