import { useCallback, useEffect, useState } from 'react';
import { apiUrl, fetchApiJson } from '../utils/api';
import { subscribeToProductsChanged } from '../utils/productCatalogEvents';

export interface ProductCatalogSummary {
  totalProducts: number;
  inventoryProducts: number;
  totalStockUnits: number;
  totalShopProductWorth: number;
}

const DEFAULT_SUMMARY: ProductCatalogSummary = {
  totalProducts: 0,
  inventoryProducts: 0,
  totalStockUnits: 0,
  totalShopProductWorth: 0,
};

export const useProductSummary = () => {
  const [summary, setSummary] = useState<ProductCatalogSummary>(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const data = await fetchApiJson(apiUrl('/api/products/summary'), { headers });
      setSummary({
        totalProducts: Number(data?.data?.totalProducts || 0),
        inventoryProducts: Number(data?.data?.inventoryProducts || 0),
        totalStockUnits: Number(data?.data?.totalStockUnits || 0),
        totalShopProductWorth: Number(data?.data?.totalShopProductWorth || 0),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => subscribeToProductsChanged(() => void fetchSummary()), [fetchSummary]);

  return { summary, loading, error, refetch: fetchSummary };
};
