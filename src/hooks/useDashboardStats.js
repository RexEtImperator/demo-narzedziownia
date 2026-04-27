import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api';
import { useEmployees } from './useEmployees';
import { PERMISSIONS, hasPermission } from '../constants';
import { formatDate } from '../utils/dateUtils';

export function useDashboardStats(user) {
  const isEmployee = String(user?.role) === 'employee';
  const [toolsPage, setToolsPage] = useState(1);
  const [bhpPage, setBhpPage] = useState(1);
  
  const [toolsFilters, setToolsFilters] = useState({ search: '', employeeId: null, status: '' });
  const [bhpFilters, setBhpFilters] = useState({ search: '', employeeId: null, status: '' });

  const LIMIT = 5; // Dashboard usually shows small amount

  // 1. Get Employees to find current employee ID (if needed)
  const { data: employees } = useEmployees({ enabled: isEmployee });
  
  const loggedInEmployeeId = isEmployee && employees 
    ? employees.find(e => String(e.login || '') === String(user?.username || ''))?.id 
    : null;

  const effectiveToolEmployeeId = isEmployee ? loggedInEmployeeId : toolsFilters.employeeId;
  const effectiveBhpEmployeeId = isEmployee ? loggedInEmployeeId : bhpFilters.employeeId;

  // 2. Main Stats Query
  const statsQuery = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      return api.get('/api/dashboard/stats');
    },
    // Always fetch stats
  });

  // 3. Unified Tool History Query (Tools + Slings)
  const toolHistoryQuery = useQuery({
    queryKey: ['dashboardToolHistory', effectiveToolEmployeeId, toolsPage, toolsFilters.search, toolsFilters.status],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: toolsPage,
        limit: LIMIT,
      });
      if (effectiveToolEmployeeId) params.append('employee_id', effectiveToolEmployeeId);
      if (toolsFilters.search) params.append('search', toolsFilters.search);
      if (toolsFilters.status) params.append('status', toolsFilters.status);
      
      return api.get(`/api/dashboard/history/tools?${params.toString()}`);
    },
    enabled: hasPermission(user, PERMISSIONS.VIEW_TOOL_HISTORY) && (!isEmployee || !!loggedInEmployeeId || employees === undefined),
    keepPreviousData: true
  });

  // 4. BHP History Query
  const bhpHistoryQuery = useQuery({
    queryKey: ['dashboardBhpHistory', effectiveBhpEmployeeId, bhpPage, bhpFilters.search, bhpFilters.status],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: bhpPage,
        limit: LIMIT,
      });
      if (effectiveBhpEmployeeId) params.append('employee_id', effectiveBhpEmployeeId);
      if (bhpFilters.search) params.append('search', bhpFilters.search);
      if (bhpFilters.status) params.append('status', bhpFilters.status);

      return api.get(`/api/bhp-issues?${params.toString()}`);
    },
    enabled: hasPermission(user, PERMISSIONS.VIEW_BHP_HISTORY) && (!isEmployee || !!loggedInEmployeeId || employees === undefined),
    keepPreviousData: true
  });

  // Transform Data
  const statsRes = statsQuery.data || {};
  
  const toolHistoryData = toolHistoryQuery.data?.data?.map(issue => {
    return {
      id: issue.id, // already prefixed from backend
      action: issue.action,
      toolName: issue.tool_kind ? `${issue.tool_name} - ${issue.tool_kind}` : issue.tool_name,
      toolBaseName: issue.tool_name,
      toolCategory: issue.tool_category,
      toolId: issue.tool_id, // Note: might be null if not selected in query, but our query selects it if available (well, actually we didn't select tool_id explicitly in UNION, let's fix that if needed, but for dashboard display it's not critical unless clicking needs it. DashboardScreen uses item.toolSku || item.toolName for navigation)
      toolSku: issue.tool_sku || null,
      employeeName: issue.employee_name,
      issuedByName: issue.issued_by_name || '',
      time: formatDate(issue.event_time),
      rawDate: issue.event_time,
      quantity: issue.quantity
    };
  }) || [];

  const bhpHistoryData = bhpHistoryQuery.data?.data?.map(issue => {
    let action = 'zwrot';
    if (issue.status === 'issued') {
      action = 'wydanie';
    } else if (issue.status === 'permanent') {
      action = 'wydanie_permanent';
    }

    const eventTime = issue.status === 'returned' && issue.returned_at ? issue.returned_at : issue.issued_at;

    return {
      id: issue.id,
      action,
      bhpLabel: issue.bhp_model ? `${issue.bhp_model} (${issue.bhp_inventory_number || 'brak nr'})` : `Nr ewid.: ${issue.bhp_inventory_number || 'nieznany'}`,
      bhpInventoryNumber: issue.bhp_inventory_number,
      bhpModel: issue.bhp_model,
      employeeName: `${issue.employee_first_name} ${issue.employee_last_name}`,
      issuedByName: issue.issued_by_user_name || '',
      time: formatDate(eventTime),
      rawDate: eventTime
    };
  }) || [];

  const isLoading = statsQuery.isLoading || toolHistoryQuery.isLoading || bhpHistoryQuery.isLoading;
  const isError = statsQuery.isError || toolHistoryQuery.isError || bhpHistoryQuery.isError;
  const error = statsQuery.error || toolHistoryQuery.error || bhpHistoryQuery.error;

  return {
    stats: {
      totalEmployees: statsRes.totalEmployees || 0,
      activeDepartments: statsRes.activeDepartments || 0,
      totalPositions: statsRes.totalPositions || 0,
      totalTools: statsRes.totalTools || 0,
      toolHistory: toolHistoryData,
      toolHistoryPagination: toolHistoryQuery.data?.pagination || { page: 1, limit: LIMIT, total: 0, totalPages: 1 },
      bhpHistory: bhpHistoryData,
      bhpHistoryPagination: bhpHistoryQuery.data?.pagination || { page: 1, limit: LIMIT, total: 0, totalPages: 1 },
      overdueInspections: statsRes.overdueInspections || 0,
      toolsInService: statsRes.toolsInService || 0,
      totalBhp: statsRes.totalBhp || 0,
      overdueToolsCount: statsRes.overdueToolsCount || 0,
      overdueBhpCount: statsRes.overdueBhpCount || 0,
      upcomingInspectionsList: statsRes.upcomingInspectionsList || [],
      toolsInServiceList: statsRes.toolsInServiceList || []
    },
    pagination: {
        tools: {
            page: toolsPage,
            setPage: setToolsPage
        },
        bhp: {
            page: bhpPage,
            setPage: setBhpPage
        }
    },
    filters: {
        tools: {
            values: toolsFilters,
            set: setToolsFilters
        },
        bhp: {
            values: bhpFilters,
            set: setBhpFilters
        }
    },
    isLoading,
    isError,
    error,
    refetch: () => {
        statsQuery.refetch();
        toolHistoryQuery.refetch();
        bhpHistoryQuery.refetch();
    }
  };
}
