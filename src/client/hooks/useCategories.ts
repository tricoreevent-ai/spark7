import { useState, useEffect, useCallback } from 'react';
import { apiUrl, fetchApiJson } from '../utils/api';
export interface Category {
  _id: string;
  name: string;
  description?: string;
}

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const data = await fetchApiJson(apiUrl('/api/categories'), { headers });
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setCategories(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return { categories, loading, error, refetch: fetchCategories };
};
