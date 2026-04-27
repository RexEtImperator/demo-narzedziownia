// A simple helper for calculating the displayed status and border color
// Maintains the existing logic in Tools and Health and Safety

export function getToolStatusInfo(tool) {
  const displayStatus = (tool?.quantity === 1 && (tool?.service_quantity || 0) > 0)
    ? 'service'
    : (tool?.status || 'unknown');

  const statusBorderColor = displayStatus === 'available'
    ? '#22c55e' // green-500
    : displayStatus === 'issued'
    ? '#eab308' // yellow-500
    : displayStatus === 'partially_issued'
    ? '#CDDC39' // lime-500
    : displayStatus === 'permanent'
    ? '#3b82f6' // blue-500
    : displayStatus === 'service'
    ? '#ef4444' // red-500
    : displayStatus === 'damaged'
    ? '#f97316' // orange-500
    : '#94a3b8'; // slate-400

  return { displayStatus, statusBorderColor };
}

export function getBhpStatusInfo(item, t) {
  const rawStatus = item?.status ? String(item.status).trim() : null;
  const displayStatus = rawStatus || (t ? t('BHP.status.unknown') : 'unknown');

  const statusBorderColor = displayStatus === 'available'
    ? '#22c55e' // green-500
    : displayStatus === 'issued'
    ? '#eab308' // yellow-500
    : displayStatus === 'permanent'
    ? '#3b82f6' // blue-500
    : '#94a3b8'; // slate-400

  return { displayStatus, statusBorderColor };
}