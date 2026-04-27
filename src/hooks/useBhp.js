import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export function useBhpItems(options = true) {
  const normalized = typeof options === 'boolean' ? { enabled: options } : (options || {});
  const { enabled = true, ...queryOptions } = normalized;

  return useQuery({
    queryKey: ['bhpItems'],
    queryFn: async () => {
      const response = await api.get('/api/bhp');
      return Array.isArray(response) ? response : (response.data || []);
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...queryOptions,
  });
}

export function useAddBhpItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/api/bhp', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['bhpItems']);
    },
  });
}

export function useUpdateBhpItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/api/bhp/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['bhpItems']);
    },
  });
}

export function useDeleteBhpItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/api/bhp/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['bhpItems']);
    },
  });
}
