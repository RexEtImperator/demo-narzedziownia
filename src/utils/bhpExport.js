import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { formatDate, formatDateOnly } from './dateUtils';

const downloadBlob = (filename, mime, content) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportListToPDF = (itemsArr, t) => {
  const stamp = formatDate(new Date());
  const hasAnyShock = itemsArr.some(it => it.shock_absorber_name || it.shock_absorber_model || it.shock_absorber_serial || it.shock_absorber_catalog_number || it.shock_absorber_production_date);
  const hasAnySrd = itemsArr.some(it => it.srd_manufacturer || it.srd_model || it.srd_serial_number || it.srd_catalog_number || it.srd_production_date);

  const headerCells = [
    'Nr ewidencyjny',
    'Producent / Model',
    'Nr seryjny',
    'Nr katalogowy',
    'Data produkcji',
    'Data przeglądu',
    'Status',
    'Przypisany'
  ];
  if (hasAnyShock) {
    headerCells.push('Amortyzator: Producent', 'Amortyzator: Model', 'Amortyzator: S/N', 'Amortyzator: Kat.', 'Amortyzator: Data prod.');
  }
  if (hasAnySrd) {
    headerCells.push('SRD: Producent', 'SRD: Model', 'SRD: S/N', 'SRD: Kat.', 'SRD: Data prod.');
  }

  const headerHtml = headerCells.map(h => `<th>${h}</th>`).join('');

  const tableRows = itemsArr.map(item => {
    const cells = [
      `<td>${item.inventory_number || ''}</td>`,
      `<td>${(item.manufacturer || '')} ${item.model ? '— ' + item.model : ''}</td>`,
      `<td>${item.serial_number || ''}</td>`,
      `<td>${item.catalog_number || ''}</td>`,
      `<td>${item.production_date ? formatDateOnly(item.production_date) : ''}</td>`,
      `<td>${item.inspection_date ? formatDateOnly(item.inspection_date) : ''}</td>`,
      `<td>${item.status || ''}</td>`,
      `<td>${[(item.assigned_employee_first_name || ''),(item.assigned_employee_last_name || '')].join(' ').trim()}</td>`
    ];
    if (hasAnyShock) {
      const shockName = item.shock_absorber_name || '-';
      const shockModel = item.shock_absorber_model || '-';
      const shockSerial = item.shock_absorber_serial || '-';
      const shockCatalog = item.shock_absorber_catalog_number || '-';
      const shockProdDate = item.shock_absorber_production_date ? formatDateOnly(item.shock_absorber_production_date) : '-';
      cells.push(
        `<td>${shockName}</td>`,
        `<td>${shockModel}</td>`,
        `<td>${shockSerial}</td>`,
        `<td>${shockCatalog}</td>`,
        `<td>${shockProdDate}</td>`
      );
    }
    if (hasAnySrd) {
      const srdMan = item.srd_manufacturer || '-';
      const srdModel = item.srd_model || '-';
      const srdSerial = item.srd_serial_number || '-';
      const srdCatalog = item.srd_catalog_number || '-';
      const srdProdDate = item.srd_production_date ? formatDateOnly(item.srd_production_date) : '-';
      cells.push(
        `<td>${srdMan}</td>`,
        `<td>${srdModel}</td>`,
        `<td>${srdSerial}</td>`,
        `<td>${srdCatalog}</td>`,
        `<td>${srdProdDate}</td>`
      );
    }
    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Eksport BHP — lista</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #eee; }
        .muted { color: #666; }
        @page { size: A4 landscape; margin: 10mm; }
      </style>
    </head>
    <body>
      <h1>Sprzęt BHP — lista</h1>
      <div class="meta">Wygenerowano: ${stamp}</div>
      <table>
        <thead>
          <tr>
            ${headerHtml}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>`;
  const w = window.open('', '_blank');
  if (!w) { toast.error(t ? t('BHP.errors.popupBlocked') : 'Popup blocked'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
};

export const exportListToXLSX = (itemsArr) => {
  const hasAnyShock = itemsArr.some(it => it.shock_absorber_name || it.shock_absorber_model || it.shock_absorber_serial || it.shock_absorber_catalog_number || it.shock_absorber_production_date);
  const hasAnySrd = itemsArr.some(it => it.srd_manufacturer || it.srd_model || it.srd_serial_number || it.srd_catalog_number || it.srd_production_date);

  const headers = [
    'Nr ewidencyjny',
    'Producent',
    'Model',
    'Nr seryjny',
    'Nr katalogowy',
    'Data produkcji',
    'Data przeglądu',
    'Status',
    'Przypisany (imię)',
    'Przypisany (nazwisko)'
  ];
  if (hasAnyShock) headers.push('Amortyzator');
  if (hasAnySrd) headers.push('Urządzenie samohamowne');

  const rows = itemsArr.map(item => {
    const base = [
      item.inventory_number || '',
      item.manufacturer || '',
      item.model || '',
      item.serial_number || '',
      item.catalog_number || '',
      formatDate(item.production_date) || '',
      formatDate(item.inspection_date) || '',
      item.status || '',
      item.assigned_employee_first_name || '',
      item.assigned_employee_last_name || ''
    ];
    if (hasAnyShock) {
      const shockParts = [];
      if (item.shock_absorber_name) shockParts.push(`Prod.: ${item.shock_absorber_name}`);
      if (item.shock_absorber_model) shockParts.push(`Model: ${item.shock_absorber_model}`);
      if (item.shock_absorber_serial) shockParts.push(`S/N: ${item.shock_absorber_serial}`);
      if (item.shock_absorber_catalog_number) shockParts.push(`Kat.: ${item.shock_absorber_catalog_number}`);
      if (item.shock_absorber_production_date) shockParts.push(`Prod. data: ${formatDate(item.shock_absorber_production_date)}`);
      base.push(shockParts.length ? shockParts.join(' • ') : '');
    }
    if (hasAnySrd) {
      const srdParts = [];
      if (item.srd_manufacturer) srdParts.push(`Prod.: ${item.srd_manufacturer}`);
      if (item.srd_model) srdParts.push(`Model: ${item.srd_model}`);
      if (item.srd_serial_number) srdParts.push(`S/N: ${item.srd_serial_number}`);
      if (item.srd_catalog_number) srdParts.push(`Kat.: ${item.srd_catalog_number}`);
      if (item.srd_production_date) srdParts.push(`Prod. data: ${formatDate(item.srd_production_date)}`);
      base.push(srdParts.length ? srdParts.join(' • ') : '');
    }
    return base;
  });
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length));
    const w = Math.min(Math.max(maxLen + 2, 10), 80);
    return { wch: w };
  });
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BHP');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  downloadBlob(`bhp_lista_${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', wbout);
};

export const exportDetailsToPDF = (detailsItem, detailsData, t) => {
  if (!detailsItem || !detailsData) return;
  const stamp = formatDate(new Date());
  const hasShock = !!(detailsData.shock_absorber_name || detailsData.shock_absorber_model || detailsData.shock_absorber_serial || detailsData.shock_absorber_catalog_number || detailsData.shock_absorber_production_date);
  const hasSrd = !!(detailsData.srd_manufacturer || detailsData.srd_model || detailsData.srd_serial_number || detailsData.srd_catalog_number || detailsData.srd_production_date);

  const rows = [
    ['Nr ewidencyjny', detailsItem.inventory_number || '-'],
    ['Producent', detailsData.manufacturer || '-'],
    ['Model', detailsData.model || '-'],
    ['Nr seryjny', detailsData.serial_number || '-'],
    ['Nr katalogowy', detailsData.catalog_number || '-'],
    ['Data produkcji', detailsData.production_date ? formatDateOnly(detailsData.production_date) : '-'],
    ['Rozpoczęcie użytkowania', detailsData.harness_start_date ? formatDateOnly(detailsData.harness_start_date) : '-'],
    ['Data przeglądu', detailsData.inspection_date ? formatDateOnly(detailsData.inspection_date) : '-'],
    ['Status', detailsItem.status || '-'],
    ['Przypisany', `${(detailsItem.assigned_employee_first_name || '')} ${(detailsItem.assigned_employee_last_name || '')}`.trim() || '-']
  ];

  if (hasShock) {
    rows.push(
      ['Amortyzator: Producent', detailsData.shock_absorber_name || '-'],
      ['Amortyzator: Model', detailsData.shock_absorber_model || '-'],
      ['Amortyzator: S/N', detailsData.shock_absorber_serial || '-'],
      ['Amortyzator: Nr katalogowy', detailsData.shock_absorber_catalog_number || '-'],
      ['Amortyzator: Data produkcji', detailsData.shock_absorber_production_date ? formatDateOnly(detailsData.shock_absorber_production_date) : '-']
    );
  }

  if (hasSrd) {
    rows.push(
      ['SRD: Producent', detailsData.srd_manufacturer || '-'],
      ['SRD: Model', detailsData.srd_model || '-'],
      ['SRD: S/N', detailsData.srd_serial_number || '-'],
      ['SRD: Nr katalogowy', detailsData.srd_catalog_number || '-'],
      ['SRD: Data produkcji', detailsData.srd_production_date ? formatDateOnly(detailsData.srd_production_date) : '-']
    );
  }

  const tableRowsHtml = rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('');
  const title = t ? `${t('BHP.export.detailsTitle')} ${detailsItem.inventory_number || ''}` : `Karta Sprzętu BHP ${detailsItem.inventory_number || ''}`;
  const header = t ? `${t('BHP.export.detailsHeader')}: ${detailsItem.inventory_number || ''}` : `Sprzęt BHP: ${detailsItem.inventory_number || ''}`;
  const generatedAt = t ? t('BHP.export.generatedAt') : 'Wygenerowano';
  const fieldLabel = t ? t('BHP.export.field') : 'Pole';
  const valueLabel = t ? t('BHP.export.value') : 'Wartość';

  const html = `
    <html><head><meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      thead th { background: #f3f4f6; color: #111827; text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
      tbody td { padding: 8px; border-bottom: 1px solid #eee; }
      tbody tr:nth-child(even) td { background: #fafafa; }
      @page { size: A4 landscape; margin: 12mm; }
    </style>
    </head>
    <body>
      <h1>${header}</h1>
      <div class="meta">${generatedAt}: ${stamp}</div>
      <table>
        <thead>
          <tr>
            <th>${fieldLabel}</th>
            <th>${valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </body></html>`;
  
  const w = window.open('', '_blank');
  if (!w) { toast.error(t ? t('BHP.errors.popupBlocked') : 'Popup blocked'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
};

export const exportDetailsToXLSX = (detailsItem, detailsData, t) => {
  if (!detailsItem || !detailsData) return;
  const rows = [
    ['Nr ewidencyjny', detailsItem.inventory_number || ''],
    ['Producent', detailsData.manufacturer || ''],
    ['Model', detailsData.model || ''],
    ['Nr seryjny', detailsData.serial_number || ''],
    ['Nr katalogowy', detailsData.catalog_number || ''],
    ['Data produkcji', formatDate(detailsData.production_date) || ''],
    ['Rozpoczęcie użytkowania', formatDate(detailsData.harness_start_date) || ''],
    ['Data przeglądu', formatDate(detailsData.inspection_date) || ''],
    ['Status', detailsItem.status || ''],
    ['Przypisany', `${(detailsItem.assigned_employee_first_name || '')} ${(detailsItem.assigned_employee_last_name || '')}`.trim()]
  ];

  const hasShock = !!(detailsData.shock_absorber_name || detailsData.shock_absorber_model || detailsData.shock_absorber_serial || detailsData.shock_absorber_catalog_number || detailsData.shock_absorber_production_date);
  const hasSrd = !!(detailsData.srd_manufacturer || detailsData.srd_model || detailsData.srd_serial_number || detailsData.srd_catalog_number || detailsData.srd_production_date);

  if (hasShock) {
    rows.push(
      ['Amortyzator: Producent', detailsData.shock_absorber_name || ''],
      ['Amortyzator: Model', detailsData.shock_absorber_model || ''],
      ['Amortyzator: S/N', detailsData.shock_absorber_serial || ''],
      ['Amortyzator: Nr katalogowy', detailsData.shock_absorber_catalog_number || ''],
      ['Amortyzator: Data produkcji', detailsData.shock_absorber_production_date ? formatDate(detailsData.shock_absorber_production_date) : '']
    );
  }

  if (hasSrd) {
    rows.push(
      ['SRD: Producent', detailsData.srd_manufacturer || ''],
      ['SRD: Model', detailsData.srd_model || ''],
      ['SRD: S/N', detailsData.srd_serial_number || ''],
      ['SRD: Nr katalogowy', detailsData.srd_catalog_number || ''],
      ['SRD: Data produkcji', detailsData.srd_production_date ? formatDate(detailsData.srd_production_date) : '']
    );
  }

  const fieldLabel = t ? t('BHP.export.field') : 'Pole';
  const valueLabel = t ? t('BHP.export.value') : 'Wartość';
  const sheetName = t ? t('BHP.export.sheetName') : 'BHP';

  const ws = XLSX.utils.aoa_to_sheet([[fieldLabel, valueLabel], ...rows]);
  const maxCol0 = Math.max(fieldLabel.length, ...rows.map(r => String(r[0] ?? '').length));
  const maxCol1 = Math.max(valueLabel.length, ...rows.map(r => String(r[1] ?? '').length));
  ws['!cols'] = [{ wch: Math.min(Math.max(maxCol0 + 2, 10), 80) }, { wch: Math.min(Math.max(maxCol1 + 2, 10), 80) }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const base = detailsItem.inventory_number || 'pozycja';
  downloadBlob(`bhp_${base}_${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', wbout);
};
