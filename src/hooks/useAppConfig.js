import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export function useAppConfig(options = true) {
  const normalized = typeof options === 'boolean' ? { enabled: options } : (options || {});
  const { enabled = true, ...queryOptions } = normalized;

  return useQuery({
    queryKey: ['appConfig'],
    queryFn: async () => {
      const config = await api.get('/api/config/general');
      return config || {};
    },
    enabled,
    staleTime: 60 * 60 * 1000, // 1 hour (config changes rarely)
    ...queryOptions,
  });
}

export function useUpdateAppConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.put('/api/config/general', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['appConfig']);
    },
  });
}
