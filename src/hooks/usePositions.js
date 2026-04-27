import { useQuery } from '@tanstack/react-query';
import api from '../api';

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const data = await api.get('/api/positions');
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10 * 60 * 1000, // 10 minut
    initialData: [
        { id: 1, name: 'Administrator systemu' },
        { id: 2, name: 'Automatyk' },
        { id: 3, name: 'Elektryk' },
        { id: 4, name: 'Kierownik działu' },
        { id: 5, name: 'Kontroler jakości' },
        { id: 6, name: 'Mechanik' },
        { id: 7, name: 'Narzędziowiec' },
        { id: 8, name: 'Pomiarowiec' },
        { id: 9, name: 'Spawacz' },
        { id: 10, name: 'Tokarz' },
        { id: 11, name: 'Ślusarz' },
        { id: 12, name: 'Zewnętrzny' }
    ]
  });
}
