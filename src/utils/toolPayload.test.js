import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildToolPayloadForApi } from './toolPayload';

const baseForm = () => ({
  name: 'Detektory',
  category: 'Detektory',
  manufacturer: '',
  model: '',
  production_year: null,
  sku: null,
  sku_unreadable: 1,
  nfc_tag_id: '',
  inventory_number: 'D1',
  location: 'Narzędziownia',
  description: '',
  status: 'available',
  quantity: 1,
  min_stock: null,
  max_stock: null,
  is_consumable: 0,
  serial_number: null,
  serial_unreadable: 1,
  inspection_date: null,
  production_date: ''
});

describe('buildToolPayloadForApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('mapuje is_consumable z 0/1 na boolean', () => {
    const f0 = baseForm();
    f0.is_consumable = 0;
    const p0 = buildToolPayloadForApi(f0, '');
    expect(p0.is_consumable).toBe(false);

    const f1 = baseForm();
    f1.is_consumable = 1;
    const p1 = buildToolPayloadForApi(f1, '');
    expect(p1.is_consumable).toBe(true);
  });

  it('ustawia serial_unreadable jako boolean i zeruje serial_number gdy checkbox jest zaznaczony', () => {
    const f = baseForm();
    f.category = 'Ręczne';
    f.serial_unreadable = 1;
    f.serial_number = 'SN-123';

    const p = buildToolPayloadForApi(f, '');
    expect(p.serial_unreadable).toBe(true);
    expect(p.serial_number).toBe(null);
  });

  it('wymusza serial_unreadable dla kategorii detektory', () => {
    const f = baseForm();
    f.category = 'Detektory';
    f.serial_unreadable = 0;
    f.serial_number = 'SN-123';

    const p = buildToolPayloadForApi(f, '');
    expect(p.serial_unreadable).toBe(true);
    expect(p.serial_number).toBe(null);
  });

  it('ustawia serial_unreadable=false gdy nie jest wymuszony i checkbox jest odznaczony', () => {
    const f = baseForm();
    f.category = 'Ręczne';
    f.serial_unreadable = 0;
    f.serial_number = 'SN-123';

    const p = buildToolPayloadForApi(f, '');
    expect(p.serial_unreadable).toBe(false);
    expect(p.serial_number).toBe('SN-123');
  });

  it('gdy sku_unreadable=1 ustawia sku=null i zachowuje flagę jako 1', () => {
    const f = baseForm();
    f.sku_unreadable = 1;
    f.sku = 'ABC-0001';

    const p = buildToolPayloadForApi(f, 'ABC');
    expect(p.sku).toBe(null);
    expect(p.sku_unreadable).toBe(1);
  });

  it('gdy sku_unreadable=0 i brak sku, generuje sku z prefiksem', () => {
    const f = baseForm();
    f.sku_unreadable = 0;
    f.sku = '';

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    const p = buildToolPayloadForApi(f, 'ABC');

    expect(spy).toHaveBeenCalled();
    expect(typeof p.sku).toBe('string');
    expect(p.sku.startsWith('ABC-')).toBe(true);
    expect(p.sku_unreadable).toBe(0);
  });

  it.each([
    { sku_unreadable: 0, serial_unreadable: 0, expectedSkuUnreadable: 0, expectedSerialUnreadable: false, label: 'oba odznaczone' },
    { sku_unreadable: 1, serial_unreadable: 0, expectedSkuUnreadable: 1, expectedSerialUnreadable: false, label: 'sku zaznaczone, serial odznaczony' },
    { sku_unreadable: 0, serial_unreadable: 1, expectedSkuUnreadable: 0, expectedSerialUnreadable: true, label: 'sku odznaczone, serial zaznaczony' },
    { sku_unreadable: 1, serial_unreadable: 1, expectedSkuUnreadable: 1, expectedSerialUnreadable: true, label: 'oba zaznaczone' }
  ])('mapuje kombinacje checkboxów: $label', ({ sku_unreadable, serial_unreadable, expectedSkuUnreadable, expectedSerialUnreadable }) => {
    const f = baseForm();
    f.category = 'Ręczne';
    f.sku_unreadable = sku_unreadable;
    f.serial_unreadable = serial_unreadable;
    f.sku = sku_unreadable ? 'ABC-0001' : '';
    f.serial_number = serial_unreadable ? 'SN-123' : 'SN-123';

    const p = buildToolPayloadForApi(f, 'ABC');
    expect(p.sku_unreadable).toBe(expectedSkuUnreadable);
    expect(p.serial_unreadable).toBe(expectedSerialUnreadable);
  });
});
