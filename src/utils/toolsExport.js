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

export const exportListToPDF = (itemsArr, locale, t) => {
  void locale;
  const stamp = formatDate(new Date());

  const headerCells = [
    'Nr ewidencyjny',
    'Nazwa',
    'Numer fabryczny',
    'Kategoria',
    'Producent',
    'Model',
    'Rok Produkcji',
    'Status',
    'Lokalizacja',
    'SKU',
    'Ilość',
    'Opis',
    'Data przeglądu'
  ];
  const headerHtml = headerCells.map(h => `<th>${h}</th>`).join('');

  const tableRows = itemsArr.map(item => {
    const isSpawalnicze = String(item.category || '').trim().toLowerCase() === 'spawalnicze';
    const isElektronarzedzia = String(item.category || '').trim().toLowerCase() === 'elektronarzędzia';
    const insp = (isSpawalnicze && item.inspection_date) ? formatDateOnly(item.inspection_date) : '';
    const cells = [
      `<td>${item.inventory_number || ''}</td>`,
      `<td>${item.name || ''}</td>`,
      `<td>${item.serial_unreadable ? 'nieczytelny' : (item.serial_number || '')}</td>`,
      `<td>${item.category || ''}</td>`,
      `<td>${isElektronarzedzia ? (item.manufacturer || '') : ''}</td>`,
      `<td>${isElektronarzedzia ? (item.model || '') : ''}</td>`,
      `<td>${isElektronarzedzia ? (item.production_year ?? '') : ''}</td>`,
      `<td>${item.status || ''}</td>`,
      `<td>${item.location || ''}</td>`,
      `<td>${item.sku || ''}</td>`,
      `<td>${item.quantity ?? ''}</td>`,
      `<td>${item.description || ''}</td>`,
      `<td>${insp}</td>`
    ];
    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Eksport Narzędzia — lista</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead th { background: #f3f4f6; color: #111827; text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
        tbody td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
        tbody tr:nth-child(even) td { background: #fafafa; }
        @page { size: A4 landscape; margin: 12mm; }
      </style>
    </head>
    <body>
      <h1>Lista narzędzi</h1>
      <div class="meta">Wygenerowano: ${stamp}</div>
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body>
    </html>`;

  const w = window.open('', '_blank');
  if (!w) return toast.error(t('common.popupBlocked'));
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
};

export const exportListToXLSX = (itemsArr) => {
  const headers = [
    'Nr ewidencyjny',
    'Nazwa',
    'Numer fabryczny',
    'Kategoria',
    'Producent',
    'Model',
    'Rok Produkcji',
    'Status',
    'Lokalizacja',
    'SKU',
    'Ilość',
    'Opis',
    'Data przeglądu'
  ];
  const rows = itemsArr.map(item => {
    const isSpawalnicze = String(item.category || '').trim().toLowerCase() === 'spawalnicze';
    const isElektronarzedzia = String(item.category || '').trim().toLowerCase() === 'elektronarzędzia';
    const insp = (isSpawalnicze && item.inspection_date) ? formatDateOnly(item.inspection_date) : '';

    let status = item.status;
    if (status === 'available') status = 'Dostępne';
    else if (status === 'issued') status = 'Wydane';
    else if (status === 'permanent') status = 'Wydane na stałe';
    else if (status === 'service') status = 'Serwis';
    else if (status === 'damaged') status = 'Uszkodzone';

    return [
      item.inventory_number || '',
      item.name || '',
      (item.serial_unreadable ? 'nieczytelny' : (item.serial_number || '')),
      item.category || '',
      isElektronarzedzia ? (item.manufacturer || '') : '',
      isElektronarzedzia ? (item.model || '') : '',
      isElektronarzedzia ? (item.production_year ?? '') : '',
      status || '',
      item.location || '',
      item.sku || '',
      item.quantity ?? '',
      item.description || '',
      insp
    ];
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
  XLSX.utils.book_append_sheet(wb, ws, 'Narzędzia');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  downloadBlob(`narzedzia_lista_${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', wbout);
};

export const exportDetailsToPDF = (tool, locale, t) => {
  if (!tool) return;
  void locale;
  const stamp = formatDate(new Date());
  const isElektronarzedzia = String(tool.category || '').trim().toLowerCase() === 'elektronarzędzia';
  const isSpawalnicze = String(tool.category || '').trim().toLowerCase() === 'spawalnicze';

  const rows = [
    ['Nazwa', tool.name || '-'],
    ['Nr ewidencyjny', tool.inventory_number || '-'],
    ['Numer fabryczny', tool.serial_unreadable ? 'nieczytelny' : (tool.serial_number || '-')],
    ['SKU', tool.sku || '-'],
    ['Kategoria', tool.category || '-'],
    ['Status', tool.status || '-'],
    ['Lokalizacja', tool.location || '-'],
    ['Ilość (Suma)', String(tool.quantity || 0)],
    ['Ilość (Serwis)', String(tool.service_quantity || 0)],
    ['Opis', tool.description || '-']
  ];

  if (isElektronarzedzia) {
    rows.push(
      ['Producent', tool.manufacturer || '-'],
      ['Model', tool.model || '-'],
      ['Rok produkcji', tool.production_year || '-']
    );
  }

  if (isSpawalnicze) {
    const insp = tool.inspection_date ? formatDateOnly(tool.inspection_date) : '-';
    rows.push(['Data przeglądu', insp]);
  }

  // Active issues
  const activeIssues = Array.isArray(tool.issues) ? tool.issues.filter(i => i.status === 'issued') : [];
  if (activeIssues.length > 0) {
    rows.push(['---', '---']);
    rows.push(['WYDANE NARZĘDZIA', '']);
    activeIssues.forEach(iss => {
      const who = `${iss.employee_first_name || ''} ${iss.employee_last_name || ''} (${iss.employee_brand_number || ''})`.trim();
      rows.push(['Pracownik', who]);
      rows.push(['Ilość', String(iss.quantity || 0)]);
      rows.push(['Data wydania', iss.issued_at ? formatDate(iss.issued_at) : '-']);
    });
  }

  const tableRows = rows.map(r => `<tr><td style="width: 40%; font-weight: bold; background: #fafafa;">${r[0]}</td><td>${r[1]}</td></tr>`).join('');

  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Karta narzędzia: ${tool.name}</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 40px; }
        h1 { font-size: 24px; margin: 0 0 8px; border-bottom: 2px solid #eee; padding-bottom: 16px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px; }
        td { padding: 12px; border-bottom: 1px solid #eee; vertical-align: top; }
        @page { size: A4 portrait; margin: 20mm; }
      </style>
    </head>
    <body>
      <h1>${tool.name}</h1>
      <div class="meta">Wygenerowano: ${stamp}</div>
      <table>
        <tbody>${tableRows}</tbody>
      </table>
    </body>
    </html>`;

  const w = window.open('', '_blank');
  if (!w) return toast.error(t('common.popupBlocked'));
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
};

export const exportDetailsToXLSX = (tool, locale) => {
  if (!tool) return;
  void locale;
  const isElektronarzedzia = String(tool.category || '').trim().toLowerCase() === 'elektronarzędzia';
  const isSpawalnicze = String(tool.category || '').trim().toLowerCase() === 'spawalnicze';

  const rows = [
    ['Nazwa', tool.name || '-'],
    ['Nr ewidencyjny', tool.inventory_number || '-'],
    ['Numer fabryczny', tool.serial_unreadable ? 'nieczytelny' : (tool.serial_number || '-')],
    ['SKU', tool.sku || '-'],
    ['Kategoria', tool.category || '-'],
    ['Status', tool.status || '-'],
    ['Lokalizacja', tool.location || '-'],
    ['Ilość (Suma)', tool.quantity || 0],
    ['Ilość (Serwis)', tool.service_quantity || 0],
    ['Opis', tool.description || '-']
  ];

  if (isElektronarzedzia) {
    rows.push(
      ['Producent', tool.manufacturer || '-'],
      ['Model', tool.model || '-'],
      ['Rok produkcji', tool.production_year || '-']
    );
  }

  if (isSpawalnicze) {
    const insp = tool.inspection_date ? formatDateOnly(tool.inspection_date) : '-';
    rows.push(['Data przeglądu', insp]);
  }

  const activeIssues = Array.isArray(tool.issues) ? tool.issues.filter(i => i.status === 'issued') : [];
  if (activeIssues.length > 0) {
    rows.push([], ['WYDANE NARZĘDZIA']);
    activeIssues.forEach(iss => {
      const who = `${iss.employee_first_name || ''} ${iss.employee_last_name || ''} (${iss.employee_brand_number || ''})`.trim();
      rows.push(
        ['Pracownik', who],
        ['Ilość', iss.quantity || 0],
        ['Data wydania', iss.issued_at ? formatDate(iss.issued_at) : '-'],
        []
      );
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Auto-width
  const colWidths = [{ wch: 30 }, { wch: 50 }];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Karta Narzędzia');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  downloadBlob(`narzedzie_${tool.inventory_number || 'details'}_${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', wbout);
};
