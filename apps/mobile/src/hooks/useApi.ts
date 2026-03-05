import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { PaginatedResult } from '@marketplace/shared';

export function useApiQuery<T>(key: string[], path: string, options?: { enabled?: boolean; staleTime?: number }) {
  return useQuery({
    queryKey: key,
    queryFn: () => api<T>(path),
    enabled: options?.enabled,
    staleTime: options?.staleTime ?? 30_000,
  });
}

export function useApiPaginated<T>(key: string[], path: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: [...key, page, limit],
    queryFn: () => api<PaginatedResult<T>>(`${path}?page=${page}&limit=${limit}`),
    staleTime: 30_000,
  });
}

export function useApiMutation<TInput, TOutput = unknown>(
  path: string,
  method: string = 'POST',
  invalidateKeys?: string[][],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TInput) => api<TOutput>(path, { method, body }),
    onSuccess: () => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}
