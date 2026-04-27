import { useQuery } from '@tanstack/react-query';
import api from '../api';

export function useEmployees(options = {}) {
  const normalized = typeof options === 'boolean' ? { enabled: options } : options;
  const { enabled = true, ...queryOptions } = normalized || {};

  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const data = await api.get('/api/employees');
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000, // 5 minut
    enabled,
    ...queryOptions,
  });
}
