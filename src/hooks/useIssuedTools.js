import { useQuery } from '@tanstack/react-query';
import api from '../api';
import { useEmployees } from './useEmployees';

export function useIssuedTools(user, options = {}) {
  const { enabled = true } = options;
  const { data: employees } = useEmployees({ enabled: String(user?.role) === 'employee' });
  
  return useQuery({
    queryKey: ['issuedTools', user?.role, user?.username],
    queryFn: async () => {
      let url = '/api/tool-issues?status=issued,permanent&limit=100';
      
      if (String(user?.role) === 'employee') {
        const matched = (Array.isArray(employees) ? employees : []).find(e => String(e.login || '') === String(user?.username || ''));
        if (matched?.id) {
          url += `&employee_id=${matched.id}`;
        }
      }
      
      const response = await api.get(url);
      const data = response.data || [];
      
      return data.filter(item => ['issued', 'permanent'].includes(item.status)).map(item => ({
        id: item.id,
        toolId: item.tool_id,
        toolName: item.tool_name,
        employeeName: `${item.employee_first_name} ${item.employee_last_name}`,
        employeeId: item.employee_id,
        quantity: item.quantity,
        issuedAt: item.issued_at,
        status: item.status
      }));
    },
    enabled: enabled && (String(user?.role) !== 'employee' || !!employees),
    onError: (error) => {
        console.error("Error fetching issued tools", error);
    }
  });
}
