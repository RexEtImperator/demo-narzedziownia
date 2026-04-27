const toolsRouter = require('../routes/tools');

describe('POST /api/tools - walidacja boolean', () => {
  test('akceptuje boolean true/false dla is_consumable i serial_unreadable', () => {
    const schema = toolsRouter.schemas?.createToolSchema;
    expect(schema).toBeTruthy();

    const payload = {
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
      is_consumable: false,
      serial_number: null,
      serial_unreadable: true,
      inspection_date: null,
      production_date: ''
    };

    const { error, value } = schema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });

    expect(error).toBeFalsy();
    expect(value.is_consumable).toBe(false);
    expect(value.serial_unreadable).toBe(true);
    expect(value.sku_unreadable).toBeUndefined();
  });

  test('akceptuje 0/1 dla is_consumable i serial_unreadable (kompatybilność)', () => {
    const schema = toolsRouter.schemas?.createToolSchema;
    expect(schema).toBeTruthy();

    const payload = {
      name: 'Narzędzie test',
      category: 'Ręczne',
      quantity: 1,
      is_consumable: 1,
      serial_unreadable: 0
    };

    const { error, value } = schema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });

    expect(error).toBeFalsy();
    expect(value.is_consumable).toBe(true);
    expect(value.serial_unreadable).toBe(false);
  });
});
