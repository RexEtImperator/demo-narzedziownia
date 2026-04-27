import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '../api';

// Hook to fetch tools with filters
export function useTools(options = {}) {
  const {
    search = '',
    category = '',
    status = '',
    enabled = true,
    ...queryOptions
  } = options || {};

  return useQuery({
    queryKey: ['tools', { search, category, status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (category) params.append('category', category);
      if (status) params.append('status', status);
      
      const response = await api.get(`/api/tools?${params.toString()}`);
      return Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []);
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: keepPreviousData,
    ...queryOptions,
  });
}

// Hook to fetch a single tool's details including issues
export function useToolDetails(id) {
  return useQuery({
    queryKey: ['tool', id, 'details'],
    queryFn: async () => {
      if (!id) return null;
      const resp = await api.get(`/api/tools/${id}/details`);
      return resp?.tool || resp;
    },
    enabled: !!id,
  });
}

// Hook to fetch return requests for a tool
export function useToolReturnRequests(id) {
  return useQuery({
    queryKey: ['tool', id, 'returnRequests'],
    queryFn: async () => {
      if (!id) return [];
      const rows = await api.get(`/api/tools/${id}/return-requests`);
      return Array.isArray(rows) ? rows : [];
    },
    enabled: !!id,
  });
}

// Hook to fetch sling items for a tool
export function useToolSlings(id) {
  return useQuery({
    queryKey: ['tool', id, 'slings'],
    queryFn: async () => {
      if (!id) return [];
      const items = await api.get(`/api/slings/by-tool/${id}`);
      return Array.isArray(items) ? items : [];
    },
    enabled: !!id,
  });
}

// Hook to fetch suggestions for a category
export function useToolSuggestions(category) {
  return useQuery({
    queryKey: ['toolSuggestions', category],
    queryFn: async () => {
      // Jeśli category nie jest podane, pobierzemy ogólne sugestie
      const url = category ? `/api/tools/suggestions?category=${encodeURIComponent(category)}` : `/api/tools/suggestions`;
      const data = await api.get(url);
      const safe = data && typeof data === 'object' ? data : {};
      return {
        manufacturer: Array.isArray(safe.manufacturer) ? safe.manufacturer : [],
        model: Array.isArray(safe.model) ? safe.model : [],
        production_year: Array.isArray(safe.production_year) ? safe.production_year : [],
        location: Array.isArray(safe.location) ? safe.location : [],
        inventory_number: Array.isArray(safe.inventory_number) ? safe.inventory_number : []
      };
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Hook to add a tool
export function useAddTool() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (toolData) => {
      const response = await api.post('/api/tools', toolData);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tools']);
      queryClient.invalidateQueries(['dashboardStats']);
    },
  });
}

// Hook to update a tool
export function useUpdateTool() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }) => {
      const response = await api.put(`/api/tools/${id}`, data);
      return response;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['tools']);
      queryClient.invalidateQueries(['tool', variables.id]);
      queryClient.invalidateQueries(['dashboardStats']);
    },
  });
}

// Hook to delete a tool
export function useDeleteTool() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/api/tools/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tools']);
      queryClient.invalidateQueries(['dashboardStats']);
    },
  });
}

// Hook to notify return
export function useNotifyReturn() {
  return useMutation({
    mutationFn: async ({ id, message, target_employee_id, target_brand_number }) => {
      await api.post(`/api/tools/${id}/notify-return`, {
        message,
        target_employee_id,
        target_brand_number
      });
      return id;
    },
  });
}

// Hook to send tool to service
export function useSendToService() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, quantity, service_order_number }) => {
      const response = await api.post(`/api/tools/${id}/service`, { 
        quantity, 
        service_order_number 
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['tools']);
      queryClient.invalidateQueries(['tool', variables.id]);
      queryClient.invalidateQueries(['dashboardStats']);
    },
  });
}

// Hook to receive tool from service
export function useReceiveFromService() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, quantity }) => {
      const response = await api.post(`/api/tools/${id}/service/receive`, { quantity });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['tools']);
      queryClient.invalidateQueries(['tool', variables.id]);
      queryClient.invalidateQueries(['dashboardStats']);
    },
  });
}

// Hook to fetch categories
export function useCategories(enabled = true) {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await api.get('/api/categories');
      return Array.isArray(response) ? response.map(c => c.name).filter(Boolean) : [];
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useCategoryStats(enabled = true) {
  return useQuery({
    queryKey: ['categoryStats'],
    queryFn: async () => {
      const response = await api.get('/api/categories/stats');
      return Array.isArray(response) ? response : [];
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

// Hook to fetch app config (prefixes)
export function useAppConfig(enabled = true) {
  return useQuery({
    queryKey: ['appConfig'],
    queryFn: async () => {
      const response = await api.get('/api/config/general');
      return response || {};
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}
