import { useState, useCallback } from 'react';
import api from '../api';

export const useEmployeeIssuedItems = () => {
  const [issuedBhpByEmployee, setIssuedBhpByEmployee] = useState({});
  const [issuedToolsByEmployee, setIssuedToolsByEmployee] = useState({});
  const [issuedSlingsByEmployee, setIssuedSlingsByEmployee] = useState({});

  const fetchIssuedBhp = useCallback(async (employeeId) => {
    const id = Number(employeeId);
    if (!Number.isFinite(id) || id <= 0) return;
    
    setIssuedBhpByEmployee(prev => {
      const existing = prev[id];
      if (existing && (existing.loading || Array.isArray(existing.items))) return prev;
      return { ...prev, [id]: { loading: true, items: [] } };
    });

    try {
      const res = await api.get(`/api/bhp-issues?status=issued&employee_id=${id}&limit=100`);
      const items = Array.isArray(res?.data) ? res.data : [];
      setIssuedBhpByEmployee(prev => ({
        ...prev,
        [id]: { loading: false, items }
      }));
    } catch (_err) {
      setIssuedBhpByEmployee(prev => ({
        ...prev,
        [id]: { loading: false, items: [] }
      }));
    }
  }, []);

  const fetchIssuedTools = useCallback(async (employeeId) => {
    const id = Number(employeeId);
    if (!Number.isFinite(id) || id <= 0) return;

    setIssuedToolsByEmployee(prev => {
      const existing = prev[id];
      if (existing && (existing.loading || Array.isArray(existing.items))) return prev;
      return { ...prev, [id]: { loading: true, items: [] } };
    });

    try {
      const res = await api.get(`/api/tool-issues?status=issued,permanent&employee_id=${id}&limit=100`);
      const items = Array.isArray(res?.data) ? res.data : [];
      setIssuedToolsByEmployee(prev => ({
        ...prev,
        [id]: { loading: false, items }
      }));
    } catch (_err) {
      setIssuedToolsByEmployee(prev => ({
        ...prev,
        [id]: { loading: false, items: [] }
      }));
    }
  }, []);

  const fetchIssuedSlings = useCallback(async (employeeId) => {
    const id = Number(employeeId);
    if (!Number.isFinite(id) || id <= 0) return;

    setIssuedSlingsByEmployee(prev => {
      const existing = prev[id];
      if (existing && (existing.loading || Array.isArray(existing.items))) return prev;
      return { ...prev, [id]: { loading: true, items: [] } };
    });

    try {
      const res = await api.get(`/api/slings/issued-by-employee/${id}`);
      const items = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setIssuedSlingsByEmployee(prev => ({
        ...prev,
        [id]: { loading: false, items }
      }));
    } catch (_err) {
      setIssuedSlingsByEmployee(prev => ({
        ...prev,
        [id]: { loading: false, items: [] }
      }));
    }
  }, []);

  return {
    issuedBhpByEmployee,
    issuedToolsByEmployee,
    issuedSlingsByEmployee,
    fetchIssuedBhp,
    fetchIssuedTools,
    fetchIssuedSlings
  };
};
