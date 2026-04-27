import * as XLSX from 'xlsx';
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

const getUserStatusLabel = (s, t) => {
  const k = String(s || '').trim().toLowerCase();
  if (k === 'active') return t('userSettings.profile.statusLabels.active');
  if (k === 'inactive') return t('userSettings.profile.statusLabels.inactive');
  if (k === 'suspended') return t('userSettings.profile.statusLabels.suspended');
  return s || '-';
};

export const exportEmployeesToPDF = (employees, t, user) => {
  const stamp = formatDate(new Date());
  const itemsArr = employees || [];
  const headerCells = [
    t('employees.fullName'), // 'Imię i nazwisko'
    t('employees.brandNumber'), // 'Numer służbowy'
    t('employees.phone'), // 'Telefon'
    t('employees.departmentCol'), // 'Dział'
    t('employees.positionCol'), // 'Stanowisko'
    'Login',
    'E‑mail',
    'Status'
  ];
  const headerHtml = headerCells.map(h => `<th>${h}</th>`).join('');
  const tableRows = itemsArr.map(item => {
    const cells = [
      `<td>${[(item.first_name || ''),(item.last_name || '')].join(' ').trim()}</td>`,
      `<td>${item.brand_number || ''}</td>`,
      `<td>${item.phone || ''}</td>`,
      `<td>${item.department || ''}</td>`,
      `<td>${item.position || ''}</td>`,
      `<td>${item.login || ''}</td>`,
      `<td>${item.email || ''}</td>`,
      `<td>${getUserStatusLabel(item.status, t)}</td>`
    ];
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Eksport — Lista pracowników</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #eee; }
        @page { size: A4 landscape; margin: 10mm; }
      </style>
    </head>
    <body>
      <h1>Lista pracowników</h1>
      <div class="meta">Wygenerowano: ${stamp}${user ? ` przez ${user.full_name || ((user.first_name || user.last_name) ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : (user.username || ''))}` : ''}</div>
      <table>
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>`;
  const w = window.open('', '_blank');
  if (!w) { return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
};

export const exportEmployeesToXLSX = (employees, t) => {
  const itemsArr = employees || [];
  const headers = [
    t('employees.fullName'),
    t('employees.brandNumber'),
    t('employees.phone'),
    t('employees.departmentCol'),
    t('employees.positionCol'),
    'Login',
    'E‑mail',
    'Status'
  ];
  const rows = itemsArr.map(item => [
    `${(item.first_name || '')} ${(item.last_name || '')}`.trim(),
    item.brand_number || '',
    item.phone || '',
    item.department || '',
    item.position || '',
    item.login || '',
    item.email || '',
    getUserStatusLabel(item.status, t)
  ]);
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length));
    const w = Math.min(Math.max(maxLen + 2, 10), 80);
    return { wch: w };
  });
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pracownicy');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  downloadBlob(`pracownicy_${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', wbout);
};

export const generateAndPrintEmployeeCard = (employee, tools, bhp, _t, user) => {
  const stamp = formatDate(new Date());

  const toolsRows = tools.map(item => {
    // Use exact keys from backend with fallbacks
    const name = item.tool_name || item.name || '-';
    const brand = item.tool_manufacturer || item.manufacturer || '-';
    const model = item.tool_model || item.model || '-';
    const year = item.tool_production_year || item.production_year || '';
    
    const inventoryNumber = item.tool_inventory_number || item.inventory_number || '-';
    
    // Handle unreadable serial number logic
    const serialUnreadable = item.tool_serial_unreadable || item.serial_unreadable;
    const serialNumRaw = item.tool_serial_number || item.serial_number;
    const serialNumber = serialUnreadable ? 'nieczytelny' : (serialNumRaw || '-');
    
    const category = item.tool_category || item.category || '-';
    const sku = item.tool_sku || item.sku || '-';
    const issuedAt = item.issued_at ? formatDate(item.issued_at) : '-';
    const issuedBy = item.issued_by_user_name || '-';

    const formatToolNameParts = () => {
         const details = [brand, model, year].filter(p => p && p !== '-').join(' / ');
         return (name && name !== '-') 
            ? (details ? `${name} (${details})` : name)
            : (details ? `(${details})` : '-');
    };

    return `
      <tr>
        <td>${inventoryNumber}</td>
        <td>${formatToolNameParts()}</td>
        <td>${serialNumber}</td>
        <td>${category}</td>
        <td>${sku}</td>
        <td>${issuedAt}</td>
        <td>${issuedBy}</td>
      </tr>
    `;
  }).join('');

  const bhpRows = bhp.map(item => {
    // Use exact keys from backend
    const inventoryNumber = item.bhp_inventory_number || '-';
    const name = item.bhp_name || item.name || '-';
    const brand = item.bhp_manufacturer || '-';
    const model = item.bhp_model || '-';
    const date = item.bhp_production_date || '';
    
    const serial = item.bhp_serial_number;
    const catalog = item.bhp_catalog_number;

    const shockAbsorberSerial = item.bhp_shock_absorber_serial;
    const srdSerial = item.bhp_srd_serial_number;
    
    const serialCatalog = [serial, catalog].filter(Boolean).join(' / ') || '-';

    const extraSerials = [];
    if (shockAbsorberSerial && shockAbsorberSerial !== '-' && shockAbsorberSerial !== 'null') {
         extraSerials.push(`Amortyzator: ${shockAbsorberSerial}`);
    }
    if (srdSerial && srdSerial !== '-' && srdSerial !== 'null') {
         extraSerials.push(`Samohamowne: ${srdSerial}`);
    }
    const extraSerialsStr = extraSerials.join(' / ') || '-';
    const issuedAt = item.issued_at ? formatDate(item.issued_at) : '-';
    const issuedBy = item.issued_by_user_name || '-';

    const formatBhpNameParts = () => {
         const details = [brand, model, date ? formatDateOnly(date) : ''].filter(p => p && p !== '-').join(' / ');
         return (name && name !== '-') 
            ? (details ? `${name} (${details})` : name)
            : (details ? details : '-');
    };

    return `
      <tr>
        <td>${inventoryNumber}</td>
        <td>${formatBhpNameParts()}</td>
        <td>${serialCatalog}</td>
        <td>${extraSerialsStr}</td>
        <td>${issuedAt}</td>
        <td>${issuedBy}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Kartoteka pracownika - ${employee.first_name} ${employee.last_name}</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #111; }
        .header { margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 16px; }
        h1 { font-size: 24px; margin: 0 0 8px; text-transform: uppercase; }
        .meta { font-size: 14px; color: #555; margin-bottom: 4px; }
        .section-title { font-size: 16px; font-weight: bold; margin: 24px 0 8px; background: #eee; padding: 4px 8px; border-left: 4px solid #333; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #f0f0f0; font-weight: 600; text-align: center; }
        .empty { font-style: italic; color: #777; padding: 8px; }
        @page { size: A4 landscape; margin: 15mm; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Kartoteka Pracownika</h1>
        <div class="meta"><strong>Pracownik:</strong> ${employee.first_name} ${employee.last_name}</div>
        <div class="meta"><strong>Numer służbowy:</strong> ${employee.brand_number || '-'}</div>
        <div class="meta"><strong>Stan na dzień:</strong> ${stamp}</div>
      </div>

      <div class="section-title">Wydane Narzędzia</div>
      ${tools.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Numer ewidencyjny</th>
              <th>Nazwa (Producent / Model / Rok)</th>
              <th>Numer fabryczny</th>
              <th>Kategoria</th>
              <th>SKU</th>
              <th>Data wydania</th>
              <th>Wydał</th>
            </tr>
          </thead>
          <tbody>
            ${toolsRows}
          </tbody>
        </table>
      ` : '<div class="empty">Brak wydanych narzędzi.</div>'}

      <div class="section-title">Wydany Sprzęt BHP</div>
      ${bhp.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Numer ewidencyjny</th>
              <th>Producent / Model / Data produkcji</th>
              <th>Nr Seryjny / Katalogowy</th>
              <th>Amortyzator / Samohamowne</th>
              <th>Data wydania</th>
              <th>Wydał</th>
            </tr>
          </thead>
          <tbody>
            ${bhpRows}
          </tbody>
        </table>
      ` : '<div class="empty">Brak wydanego sprzętu BHP.</div>'}
      
      <div style="margin-top: 40px; font-size: 11px; text-align: center; color: #999;">
        Wygenerowano z Systemu Zarządzania Narzędziownią przez ${(user && (user.full_name || ((user.first_name || user.last_name) ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : (user.username || '')))) || '-'} dnia ${formatDate(new Date())}
      </div>
    </body>
    </html>`;

  const w = window.open('', '_blank');
  if (!w) {
    throw new Error('Popup blocked');
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
};
