export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePagination(page?: number, pageSize?: number) {
  const normalizedPage = Math.max(1, page ?? DEFAULT_PAGE);
  const normalizedPageSize = Math.min(
    Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    skip: (normalizedPage - 1) * normalizedPageSize
  };
}

