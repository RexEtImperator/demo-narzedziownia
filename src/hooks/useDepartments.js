import { useQuery } from '@tanstack/react-query';
import api from '../api';

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const data = await api.get('/api/departments');
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10 * 60 * 1000, // 10 minut
    initialData: [
        { id: 1, name: 'Administracja' },
        { id: 2, name: 'Automatyczny' },
        { id: 3, name: 'Elektryczny' },
        { id: 4, name: 'Kontrola jakości' },
        { id: 5, name: 'Mechaniczny' },
        { id: 6, name: 'Narzędziownia' },
        { id: 7, name: 'Pomiarowy' },
        { id: 8, name: 'Skrawanie' },
        { id: 9, name: 'Ślusarsko-spawalniczy' },
        { id: 10, name: 'Zewnętrzny' }
    ]
  });
}
