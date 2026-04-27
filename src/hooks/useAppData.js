import { useState, useCallback, useMemo } from 'react';
import { useTools } from './useTools';
import { useEmployees } from './useEmployees';
import { useBhpItems } from './useBhp';
import { useSidebarCounts } from './useSidebarCounts';
import { useAppConfig } from './useAppConfig';

export const useAppData = (user) => {
  const enabled = !!user;

  const [toolsOverride, setToolsOverride] = useState(null);
  const [employeesOverride, setEmployeesOverride] = useState(null);
  const [bhpItemsOverride, setBhpItemsOverride] = useState(null);
  const [countsOverride, setCountsOverride] = useState(null);
  const [appNameOverride, setAppNameOverride] = useState(null);

  // React Query Hooks (v5: no onSuccess)
  const { data: toolsData, refetch: refetchTools } = useTools({ enabled });
  const { data: employeesData, refetch: refetchEmployees } = useEmployees({ enabled });
  const { data: bhpData, refetch: refetchBhpItems } = useBhpItems({ enabled });
  const { data: sidebarData, refetch: refetchSidebarCounts } = useSidebarCounts({ enabled });
  const { data: appConfigData, refetch: refetchAppConfig } = useAppConfig({ enabled });

  const tools = useMemo(() => {
    if (toolsOverride !== null) return toolsOverride;
    if (Array.isArray(toolsData)) return toolsData;
    if (toolsData) return toolsData;
    return [];
  }, [toolsData, toolsOverride]);

  const employees = useMemo(() => {
    if (employeesOverride !== null) return employeesOverride;
    if (Array.isArray(employeesData)) return employeesData;
    if (employeesData) return employeesData;
    return [];
  }, [employeesData, employeesOverride]);

  const bhpItems = useMemo(() => {
    if (bhpItemsOverride !== null) return bhpItemsOverride;
    if (Array.isArray(bhpData)) return bhpData;
    if (bhpData) return bhpData;
    return [];
  }, [bhpData, bhpItemsOverride]);

  const counts = useMemo(() => {
    if (countsOverride !== null) return countsOverride;
    return {
      toolsCount: sidebarData?.toolsCount || 0,
      bhpCount: sidebarData?.bhpCount || 0,
      employeesCount: sidebarData?.employeesCount || 0
    };
  }, [countsOverride, sidebarData]);

  const appName = useMemo(() => {
    if (appNameOverride !== null) return appNameOverride;
    if (appConfigData?.appName) return appConfigData.appName;
    return 'SZN - System Zarządzania Narzędziownią';
  }, [appConfigData, appNameOverride]);

  // Compatibility Wrappers for refetching
  const fetchTools = useCallback(async () => {
    const { data } = await refetchTools();
    if (data) setToolsOverride(data);
  }, [refetchTools]);

  const fetchEmployees = useCallback(async () => {
    const { data } = await refetchEmployees();
    if (data) setEmployeesOverride(data);
  }, [refetchEmployees]);

  const fetchBhpItems = useCallback(async () => {
    const { data } = await refetchBhpItems();
    if (data) setBhpItemsOverride(data);
  }, [refetchBhpItems]);

  const fetchSidebarCounts = useCallback(async () => {
    const { data } = await refetchSidebarCounts();
    if (data) {
      setCountsOverride({
        toolsCount: data.toolsCount || 0,
        bhpCount: data.bhpCount || 0,
        employeesCount: data.employeesCount || 0
      });
    }
  }, [refetchSidebarCounts]);

  const fetchAppConfig = useCallback(async () => {
    const { data } = await refetchAppConfig();
    if (data && data.appName) setAppNameOverride(data.appName);
  }, [refetchAppConfig]);

  return {
    tools,
    setTools: setToolsOverride,
    employees,
    setEmployees: setEmployeesOverride,
    bhpItems,
    toolsCount: counts.toolsCount,
    bhpCount: counts.bhpCount,
    employeesCount: counts.employeesCount,
    appName,
    fetchTools,
    fetchEmployees,
    fetchBhpItems,
    fetchSidebarCounts,
    fetchAppConfig
  };
};
