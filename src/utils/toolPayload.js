import { sanitizeObject } from './sanitize';

export const buildToolPayloadForApi = (formData, toolsCodePrefix) => {
  const payload = sanitizeObject({
    ...formData,
    quantity: Number(formData.quantity),
    production_year: formData.production_year ? Number(formData.production_year) : null,
    min_stock: formData.min_stock ? Number(formData.min_stock) : null,
    max_stock: formData.max_stock ? Number(formData.max_stock) : null,
    inspection_date: formData.inspection_date || null
  });

  payload.is_consumable = Boolean(formData.is_consumable);

  const normalizedInventoryNumber = typeof payload.inventory_number === 'string'
    ? payload.inventory_number.trim()
    : payload.inventory_number;
  payload.inventory_number = normalizedInventoryNumber ? normalizedInventoryNumber : null;

  if (formData.sku_unreadable) {
    payload.sku = null;
    payload.sku_unreadable = 1;
  } else {
    payload.sku_unreadable = 0;
    if (!payload.sku || !String(payload.sku).trim()) {
      let prefix = (toolsCodePrefix || '').toString().trim();
      if (prefix && !prefix.endsWith('-')) prefix += '-';
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      payload.sku = `${prefix}${randomPart}`;
    }
  }

  const cat = String(payload.category || '').trim().toLowerCase();
  const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat);
  const isSockets = ['nasadki 1"', 'nasadki 1/2"'].includes(cat);
  const isDetectors = cat === 'detektory';

  const shouldForceSerialUnreadable = Boolean(formData.serial_unreadable) || isSlings || isSockets || isDetectors;
  if (shouldForceSerialUnreadable) {
    payload.serial_number = null;
    payload.serial_unreadable = true;
  } else {
    payload.serial_unreadable = false;
  }

  if (payload.status === 'dostępne') payload.status = 'available';
  if (payload.status === 'wydane') payload.status = 'issued';
  if (payload.status === 'częściowo wydane') payload.status = 'partially_issued';
  if (payload.status === 'serwis') payload.status = 'service';
  if (payload.status === 'uszkodzone') payload.status = 'damaged';

  return payload;
};
