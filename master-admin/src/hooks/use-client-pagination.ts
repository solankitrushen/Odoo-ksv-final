"use client";

import { useEffect, useMemo, useState } from "react";

export const LIST_PAGE_SIZE = 25;

/** Slice a client-filtered list into pages. Resets to page 1 when `resetKey` changes. */
export function useClientPagination<T>(
  items: T[],
  opts: { pageSize?: number; resetKey?: string | number } = {}
) {
  const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [opts.resetKey, pageSize]);

  return useMemo(() => {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return {
      page: safePage,
      setPage,
      pageSize,
      total,
      items: items.slice(start, start + pageSize),
    };
  }, [items, page, pageSize]);
}
