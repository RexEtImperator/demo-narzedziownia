import { useQuery } from '@tanstack/react-query';
import api from '../api';

export function useSidebarCounts(options = true) {
  const normalized = typeof options === 'boolean' ? { enabled: options } : (options || {});
  const { enabled = true, ...queryOptions } = normalized;

  return useQuery({
    queryKey: ['sidebarCounts', 'v2'],
    queryFn: async () => {
      const res = await api.get('/api/dashboard/sidebar-counts');
      return {
        toolsCount: Number(res?.toolsCount || 0),
        bhpCount: Number(res?.bhpCount || 0),
        employeesCount: Number(res?.employeesCount || 0),
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    refetchOnMount: true,
    ...queryOptions,
  });
}
