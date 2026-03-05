// ---------------------------------------------------------------------------
// Generic API response envelopes
// Used by API, web, and mobile to ensure consistent response shapes.
// ---------------------------------------------------------------------------

/**
 * Pagination metadata returned alongside paginated collections.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Standard success envelope for single-item responses.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/**
 * Standard error envelope — mirrors the shape produced by HttpExceptionFilter.
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    statusCode: number;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}

/**
 * Paginated success envelope — `data` is always an array and `meta` is required.
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}
