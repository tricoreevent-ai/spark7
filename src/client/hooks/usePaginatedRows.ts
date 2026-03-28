import { DependencyList, useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const clampPage = (page: number, totalPages: number): number => {
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, Math.max(totalPages, 1));
};

type UsePaginatedRowsOptions = {
  initialPageSize?: number;
  resetDeps?: DependencyList;
};

export const usePaginatedRows = <T,>(
  rows: T[],
  options: UsePaginatedRowsOptions = {}
) => {
  const { initialPageSize = 10, resetDeps = [] } = options;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  useEffect(() => {
    setCurrentPage((prev) => clampPage(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, resetDeps);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [currentPage, pageSize, rows]);

  const startIndex = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = totalRows === 0 ? 0 : Math.min(currentPage * pageSize, totalRows);

  return {
    currentPage,
    endIndex,
    pageSize,
    paginatedRows,
    setCurrentPage,
    setPageSize,
    startIndex,
    totalPages,
    totalRows,
  };
};
