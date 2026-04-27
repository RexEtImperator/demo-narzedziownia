import { useEffect, useRef } from 'react';
import { notifyWarn, notifyInfo } from '../utils/notify.jsx';

export const useWeldingInspectionNotifications = (tools, t) => {
  const notifiedUpcomingRef = useRef(new Set());
  const didNotifyUpcomingRef = useRef(false);

  const daysUntil = (dateString) => {
    if (!dateString) return null;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = startOfDate - startOfNow;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    if (!didNotifyUpcomingRef.current && (tools || []).length > 0) {
      try {
        const arr = Array.isArray(tools) ? tools : [];
        arr.forEach(item => {
          const isSpawalnicze = String(item.category || '').toLowerCase() === 'spawalnicze';
          if (!isSpawalnicze) return;
          const d = daysUntil(item.inspection_date);
          if (d === null) return;
          if (d < 0 || d > 30) return;
          const key = `${item.id || item.name}-${item.inspection_date || ''}`;
          if (notifiedUpcomingRef.current.has(key)) return;
          notifiedUpcomingRef.current.add(key);
          const label = item.inventory_number || item.name || t('tools.common.tool');
          const title = t('tools.weldInspection.title');
          const inTxt = t('tools.weldInspection.in');
          const daysTxt = t('tools.weldInspection.days');
          const extra = d <= 7 ? '' : t('tools.weldInspection.lessEqual30');
          const message = `${title}${label}${inTxt}${d}${daysTxt}${extra}`;
          if (d <= 7) { notifyWarn(message); } else { notifyInfo(message); }
        });
      } finally {
        didNotifyUpcomingRef.current = true;
      }
    }
  }, [tools, t]);
};
