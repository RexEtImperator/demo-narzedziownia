import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveBoxIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';
import { PERMISSIONS, hasPermission } from '../constants';
import api from '../api';
import { formatDate } from '../utils/dateUtils';

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildMapSrcDoc({ canManage, reporterName }) {
  const canManageLiteral = canManage ? 'true' : 'false';
  const reporterLiteral = JSON.stringify(String(reporterName || '').trim());

  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mapa zakładu</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css"/>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      #wrap { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 14px; border: 1px solid rgba(148,163,184,0.45); background: #fff; }
      #map { width: 100%; height: 100%; }
      #addBtn {
        position: absolute;
        bottom: 18px;
        right: 18px;
        width: 52px;
        height: 52px;
        border-radius: 999px;
        background: #c0392b;
        border: none;
        color: #fff;
        font-size: 24px;
        cursor: pointer;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
      }
      #addBtn[hidden] { display: none; }
      #settingsBtn {
        position: absolute;
        bottom: 80px;
        right: 18px;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        background: #0f172a;
        border: none;
        color: #fff;
        font-size: 20px;
        cursor: pointer;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
      }
      #settingsBtn[hidden] { display: none; }
      #legendBtn {
        position: absolute;
        bottom: 132px;
        right: 18px;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        background: #1f2937;
        border: none;
        color: #fff;
        font-size: 20px;
        cursor: pointer;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
      }
      #editBar {
        display: none;
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 1200;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(148,163,184,0.7);
        border-radius: 999px;
        padding: 8px 10px;
        gap: 8px;
        align-items: center;
        backdrop-filter: blur(6px);
      }
      #editBar button {
        border: none;
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
      }
      #saveShapesBtn { background: #16a34a; color: #fff; }
      #exitEditBtn { background: #0f172a; color: #fff; }
      #modeIndicator {
        display: none;
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: #c0392b;
        color: #fff;
        padding: 8px 16px;
        border-radius: 999px;
        font-size: 13px;
        z-index: 1000;
      }
      #overlay {
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 2000;
        align-items: center;
        justify-content: center;
      }
      #shapeOverlay, #msgOverlay, #legendOverlay, #namesOverlay {
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 2100;
        align-items: center;
        justify-content: center;
      }
      #modal {
        background: #fff;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.45);
        padding: 18px 20px;
        width: 420px;
        max-width: 95%;
        max-height: 90vh;
        overflow-y: auto;
      }
      #shapeModal, #msgModal, #legendModal, #namesModal {
        background: #fff;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.45);
        padding: 18px 20px;
        width: 420px;
        max-width: 95%;
        max-height: 90vh;
        overflow-y: auto;
      }
      #modal h3 { margin: 0; font-size: 16px; font-weight: 600; color: #0f172a; }
      #shapeModal h3, #msgModal h3, #legendModal h3, #namesModal h3 { margin: 0; font-size: 16px; font-weight: 600; color: #0f172a; }
      .names-list { display: grid; gap: 10px; margin-top: 12px; }
      .names-row { display: grid; gap: 6px; }
      .names-meta { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: #475569; }
      .legend-group { margin-top: 12px; }
      .legend-group h4 { margin: 0 0 8px 0; font-size: 13px; color: #334155; }
      .legend-list { display: grid; gap: 6px; }
      .legend-item {
        text-align: left;
        width: 100%;
        border: 1px solid rgba(148,163,184,0.45);
        border-radius: 10px;
        background: #fff;
        cursor: pointer;
        padding: 8px 10px;
        color: #0f172a;
      }
      .legend-item:hover { background: #f8fafc; }
      .legend-item small { color: #64748b; display: block; margin-top: 2px; }
      .row { display: grid; gap: 12px; margin-top: 12px; }
      label { font-size: 12px; color: #475569; display: block; margin-bottom: 4px; }
      input, select, textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(148,163,184,0.7);
        font-size: 14px;
        background: #fff;
        color: #0f172a;
      }
      textarea { resize: vertical; }
      .actions { display: flex; gap: 8px; margin-top: 14px; }
      .btn-primary { flex: 1; padding: 10px; background: #c0392b; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .btn-secondary { padding: 10px 16px; background: none; border: 1px solid rgba(148,163,184,0.7); border-radius: 10px; font-size: 14px; cursor: pointer; color: #0f172a; }
      .btn-icon { background: none; border: none; cursor: pointer; font-size: 20px; color: #64748b; padding: 0; line-height: 1; }
      .radio-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
      .radio-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(148,163,184,0.7);
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
        user-select: none;
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
        background: #fff;
      }
      .radio-pill input { width: auto; margin: 0; }
      .leaflet-tooltip.map-label {
        background: rgba(15, 23, 42, 0.86);
        border: 0;
        color: #fff;
        box-shadow: none;
        border-radius: 8px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
      }
      .leaflet-tooltip.map-label:before {
        display: none;
      }
      .leaflet-tooltip.object-label {
        background: rgba(30, 41, 59, 0.92);
      }
    </style>
  </head>
  <body>
    <div id="wrap">
      <div id="map"></div>
      <button id="legendBtn" title="Legenda">☰</button>
      <button id="settingsBtn" title="Edytuj strefy i obiekty">⚙</button>
      <button id="addBtn" title="Dodaj zgłoszenie awarii">+</button>
      <div id="modeIndicator">Kliknij na mapie, aby dodać pinezkę</div>
      <div id="editBar">
        <button id="saveShapesBtn" type="button">Zapisz strefy</button>
        <button id="editNamesBtn" type="button">Nazwy</button>
        <button id="exitEditBtn" type="button">Zakończ</button>
      </div>
      <div id="overlay">
        <div id="modal">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3 id="formTitle">Nowe zgłoszenie awarii</h3>
            <button id="closeBtn" class="btn-icon" aria-label="Zamknij">&times;</button>
          </div>
          <div class="row">
            <div>
              <label for="f-awaria">Rodzaj awarii *</label>
              <input id="f-awaria" name="awaria" type="text" placeholder="np. wyciek oleju, awaria pompy..." />
            </div>
            <div>
              <label for="f-priorytet">Priorytet</label>
              <select id="f-priorytet" name="priorytet">
                <option value="niski">Niski</option>
                <option value="sredni" selected>Średni</option>
                <option value="wysoki">Wysoki</option>
                <option value="krytyczny">Krytyczny</option>
              </select>
            </div>
            <div>
              <label for="f-status">Status</label>
              <select id="f-status" name="status">
                <option value="aktywne" selected>Aktywne</option>
                <option value="w_trakcie">W trakcie</option>
                <option value="ukonczono">Ukończono</option>
              </select>
            </div>
            <div>
              <label for="f-data">Data zgłoszenia</label>
              <input id="f-data" name="data" type="datetime-local" />
            </div>
            <div>
              <label for="f-obszar">Obszar</label>
              <input id="f-obszar" name="obszar" type="text" readonly />
            </div>
            <div>
              <label for="f-obiekt">Obiekt</label>
              <input id="f-obiekt" name="obiekt" type="text" readonly />
            </div>
            <div>
              <label for="f-pracownik">Pracownik przydzielony do naprawy *</label>
              <input id="f-pracownik" name="pracownik" type="text" list="employees-list" autocomplete="off" placeholder="Wpisz imię i nazwisko..." />
              <datalist id="employees-list"></datalist>
            </div>
            <div>
              <label for="f-zlecajacy">Kto zlecił</label>
              <input id="f-zlecajacy" name="zlecajacy" type="text" readonly />
            </div>
            <div>
              <label for="f-opis">Opis / uwagi</label>
              <textarea id="f-opis" name="opis" rows="3" placeholder="Dodatkowe informacje..."></textarea>
            </div>
          </div>
          <div class="actions">
            <button id="saveBtn" class="btn-primary">Zapisz zgłoszenie</button>
            <button id="cancelBtn" class="btn-secondary">Anuluj</button>
          </div>
        </div>
      </div>
      <div id="shapeOverlay">
        <div id="shapeModal">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3>Nowy element mapy</h3>
            <button id="shapeCloseBtn" class="btn-icon" aria-label="Zamknij">&times;</button>
          </div>
          <div style="font-size:13px;color:#475569;">Wybierz typ, a następnie nadaj nazwę.</div>
          <div class="radio-row" role="radiogroup" aria-label="Typ elementu">
            <label class="radio-pill">
              <input type="radio" name="shape-type" value="area" id="shape-type-area" />
              <span>Obszar</span>
            </label>
            <label class="radio-pill">
              <input type="radio" name="shape-type" value="object" id="shape-type-object" />
              <span>Obiekt</span>
            </label>
          </div>
          <div id="shapeNameWrap" style="display:none;margin-top:12px;">
            <label for="shapeName">Nazwa *</label>
            <input id="shapeName" name="shapeName" type="text" placeholder="Wpisz nazwę..." />
          </div>
          <div class="actions">
            <button id="shapeSaveBtn" class="btn-primary" type="button">Zapisz</button>
            <button id="shapeCancelBtn" class="btn-secondary" type="button">Anuluj</button>
          </div>
        </div>
      </div>
      <div id="msgOverlay">
        <div id="msgModal">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3 id="msgTitle">Informacja</h3>
            <button id="msgCloseBtn" class="btn-icon" aria-label="Zamknij">&times;</button>
          </div>
          <div id="msgText" style="font-size:13px;color:#0f172a;white-space:pre-wrap;"></div>
          <div class="actions">
            <button id="msgOkBtn" class="btn-primary" type="button">OK</button>
          </div>
        </div>
      </div>
      <div id="legendOverlay">
        <div id="legendModal">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3>Legenda</h3>
            <button id="legendCloseBtn" class="btn-icon" aria-label="Zamknij">&times;</button>
          </div>
          <div class="legend-group">
            <h4>Obiekty</h4>
            <div id="legendObjects" class="legend-list"></div>
          </div>
          <div class="legend-group">
            <h4>Obszary</h4>
            <div id="legendZones" class="legend-list"></div>
          </div>
          <div class="actions">
            <button id="legendOkBtn" class="btn-primary" type="button">Zamknij</button>
          </div>
        </div>
      </div>
      <div id="namesOverlay">
        <div id="namesModal">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3>Edycja nazw</h3>
            <button id="namesCloseBtn" class="btn-icon" aria-label="Zamknij">&times;</button>
          </div>
          <div style="font-size:13px;color:#475569;">Zmień nazwy obszarów i obiektów. Zapis stref wykonaj przyciskiem „Zapisz strefy”.</div>
          <div id="namesList" class="names-list"></div>
          <div class="actions">
            <button id="namesSaveBtn" class="btn-primary" type="button">Zastosuj</button>
            <button id="namesCancelBtn" class="btn-secondary" type="button">Anuluj</button>
          </div>
        </div>
      </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
    <script>
      const CAN_MANAGE = ${canManageLiteral};
      const CURRENT_REPORTER = ${reporterLiteral};
      const TRZEBINIA = [50.16185, 19.45031];
      const BOUNDS = [[50.1565, 19.4445], [50.1668, 19.4588]];

      const map = L.map('map', {
        center: TRZEBINIA,
        zoom: 15,
        minZoom: 14,
        maxZoom: 18,
        maxBounds: BOUNDS,
        maxBoundsViscosity: 1.0
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      const addBtn = document.getElementById('addBtn');
      const legendBtn = document.getElementById('legendBtn');
      const settingsBtn = document.getElementById('settingsBtn');
      const editBar = document.getElementById('editBar');
      const saveShapesBtn = document.getElementById('saveShapesBtn');
      const editNamesBtn = document.getElementById('editNamesBtn');
      const exitEditBtn = document.getElementById('exitEditBtn');
      const overlay = document.getElementById('overlay');
      const shapeOverlay = document.getElementById('shapeOverlay');
      const msgOverlay = document.getElementById('msgOverlay');
      const legendOverlay = document.getElementById('legendOverlay');
      const namesOverlay = document.getElementById('namesOverlay');
      const modeInd = document.getElementById('modeIndicator');

      if (!CAN_MANAGE) {
        addBtn.hidden = true;
        settingsBtn.hidden = true;
      }

      const priorityColors = { niski:'#27ae60', sredni:'#f39c12', wysoki:'#e67e22', krytyczny:'#c0392b' };
      const LEGEND_OBJECTS = [
        { key: 'P.1', label: 'P.1 - Pompownia centralna' },
        { key: 'P.2', label: 'P.2 - Budynek DRW' },
        { key: 'P.2a', label: 'P.2a - Pompownia atmosferyczna' },
        { key: 'P.2b', label: 'P.2b - Pompownia transferowa' },
        { key: 'P.2c', label: 'P.2c - Pompownia pozostałościowa' },
        { key: 'P.3', label: 'P.3 - Pompownia ekstrakcyjna' },
        { key: 'P.4', label: 'P.4 - Pompownia ropna' },
        { key: 'P.5', label: 'P.5 - Pompownia "M"' },
        { key: 'P.6', label: 'P.6 - Pompownia ropna/benzyn' },
        { key: 'P.7', label: 'P.7 - Pompownia etylizacji' },
        { key: 'P.8', label: 'P.8 - Pompownia wyspy opału' },
        { key: 'P.9', label: 'P.9 - Pompownia Pb95' },
        { key: 'P.10', label: 'P.10 - Pompownia Pb98' },
        { key: 'P.11', label: 'P.11 - Pompownia ON' },
        { key: 'P.12', label: 'P.12 - Pompownia T-56 i T-58' },
        { key: 'P.13', label: 'P.13 - Pompownia T-54' },
        { key: 'P.14', label: 'P.14 - Pompownia O-3 i O-4' },
        { key: 'P.15', label: 'P.15 - Pompownia "oczyszczalnia"' }
      ];
      const LEGEND_ZONES = [
        { key: 'Zbiorniki D', label: 'Zbiorniki D' },
        { key: 'Zbiorniki M', label: 'Zbiorniki M' }
      ];
      const employeeInput = document.getElementById('f-pracownik');
      const employeesList = document.getElementById('employees-list');
      const reporterInput = document.getElementById('f-zlecajacy');
      let employeeNames = [];
      const legendObjectsEl = document.getElementById('legendObjects');
      const legendZonesEl = document.getElementById('legendZones');
      const legendCloseBtn = document.getElementById('legendCloseBtn');
      const legendOkBtn = document.getElementById('legendOkBtn');
      const namesListEl = document.getElementById('namesList');
      const namesSaveBtn = document.getElementById('namesSaveBtn');
      const namesCancelBtn = document.getElementById('namesCancelBtn');
      const namesCloseBtn = document.getElementById('namesCloseBtn');

      function normalizeEmployeeName(emp) {
        if (!emp || typeof emp !== 'object') return '';
        const first = String(emp.first_name || '').trim();
        const last = String(emp.last_name || '').trim();
        const full = \`\${first} \${last}\`.trim();
        if (full) return full;
        return String(emp.name || emp.full_name || emp.username || '').trim();
      }

      function setEmployeesList(employees) {
        const names = (Array.isArray(employees) ? employees : [])
          .map(normalizeEmployeeName)
          .filter(Boolean);
        employeeNames = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'pl'));
        employeesList.innerHTML = employeeNames.map((name) => \`<option value="\${escapeHtml(name)}"></option>\`).join('');
      }

      let AREAS = [];
      let OBJECTS = [];

      const shapeLayers = new L.FeatureGroup();
      map.addLayer(shapeLayers);

      const markers = [];
      let addMode = false;
      let pendingLatLng = null;
      let pendingContext = { obszar: 'Nieprzypisany', obiekt: 'Nieprzypisany' };
      let editingMarker = null;
      let isEditMode = false;
      let drawControl = null;

      const pendingRequests = new Map();

      const msgTitle = document.getElementById('msgTitle');
      const msgText = document.getElementById('msgText');
      const msgOkBtn = document.getElementById('msgOkBtn');
      const msgCloseBtn = document.getElementById('msgCloseBtn');

      function showMessage(title, text) {
        msgTitle.textContent = String(title || 'Informacja');
        msgText.textContent = String(text || '');
        msgOverlay.style.display = 'flex';
        setTimeout(() => msgOkBtn.focus(), 0);
      }

      function closeMessage() {
        msgOverlay.style.display = 'none';
      }

      msgOkBtn.addEventListener('click', closeMessage);
      msgCloseBtn.addEventListener('click', closeMessage);
      msgOverlay.addEventListener('click', (e) => {
        if (e.target === msgOverlay) closeMessage();
      });

      function openLegend() {
        legendOverlay.style.display = 'flex';
      }

      function closeLegend() {
        legendOverlay.style.display = 'none';
      }

      legendBtn.addEventListener('click', openLegend);
      legendOkBtn.addEventListener('click', closeLegend);
      legendCloseBtn.addEventListener('click', closeLegend);
      legendOverlay.addEventListener('click', (e) => {
        if (e.target === legendOverlay) closeLegend();
      });

      function findLegendLayer(type, keyText) {
        const key = String(keyText || '').trim().toLowerCase();
        let found = null;
        shapeLayers.eachLayer((layer) => {
          if (found) return;
          const item = layer?._mapItem;
          if (!item) return;
          if (String(item.type || '').toLowerCase() !== type) return;
          const name = String(item.name || '').toLowerCase();
          if (name.includes(key)) {
            found = layer;
          }
        });
        return found;
      }

      function focusLegendLayer(layer) {
        if (!layer) return;
        try {
          const bounds = layer.getBounds?.();
          if (bounds) {
            map.fitBounds(bounds.pad(0.35));
          }
        } catch (_) { void 0; }
      }

      function renderLegend() {
        legendObjectsEl.innerHTML = '';
        legendZonesEl.innerHTML = '';

        LEGEND_OBJECTS.forEach((entry) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'legend-item';
          btn.innerHTML = \`<strong>\${escapeHtml(entry.key)}</strong><small>\${escapeHtml(entry.label)}</small>\`;
          btn.addEventListener('click', () => {
            const layer = findLegendLayer('object', entry.key);
            if (!layer) {
              showMessage('Brak na mapie', 'Nie znaleziono obiektu ' + entry.key + '. Najpierw dodaj go na mapie.');
              return;
            }
            focusLegendLayer(layer);
            const center = layer.getBounds?.().getCenter?.();
            const ctx = center ? getLocationContext(center) : { obszar: 'Nieprzypisany' };
            showMessage('Lokalizacja', \`\${entry.label}\\nStrefa: \${ctx.obszar || 'Nieprzypisany'}\`);
          });
          legendObjectsEl.appendChild(btn);
        });

        LEGEND_ZONES.forEach((entry) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'legend-item';
          btn.innerHTML = \`<strong>\${escapeHtml(entry.label)}</strong>\`;
          btn.addEventListener('click', () => {
            const layer = findLegendLayer('area', entry.key);
            if (!layer) {
              showMessage('Brak na mapie', 'Nie znaleziono strefy "' + entry.label + '". Najpierw dodaj ją na mapie.');
              return;
            }
            focusLegendLayer(layer);
            showMessage('Strefa', entry.label);
          });
          legendZonesEl.appendChild(btn);
        });
      }

      renderLegend();

      let namesDraft = [];

      function openNamesEditor() {
        namesDraft = [];
        namesListEl.innerHTML = '';

        const layers = [];
        shapeLayers.eachLayer((layer) => {
          const item = layer?._mapItem;
          if (!item) return;
          const type = String(item.type || '').trim().toLowerCase();
          if (type !== 'area' && type !== 'object') return;
          layers.push(layer);
        });

        layers.sort((a, b) => {
          const ai = a?._mapItem || {};
          const bi = b?._mapItem || {};
          const at = String(ai.type || '');
          const bt = String(bi.type || '');
          if (at !== bt) return at.localeCompare(bt, 'pl');
          return String(ai.name || '').localeCompare(String(bi.name || ''), 'pl');
        });

        layers.forEach((layer) => {
          const item = layer._mapItem;
          const row = document.createElement('div');
          row.className = 'names-row';

          const meta = document.createElement('div');
          meta.className = 'names-meta';
          const left = document.createElement('span');
          left.textContent = item.type === 'area' ? 'Obszar' : 'Obiekt';
          const right = document.createElement('span');
          right.textContent = item.id ? ('ID: ' + item.id) : '';
          meta.appendChild(left);
          meta.appendChild(right);

          const input = document.createElement('input');
          input.type = 'text';
          input.value = String(item.name || '');

          row.appendChild(meta);
          row.appendChild(input);
          namesListEl.appendChild(row);

          namesDraft.push({ layer, input });
        });

        namesOverlay.style.display = 'flex';
        setTimeout(() => {
          const first = namesDraft[0]?.input;
          if (first) first.focus();
        }, 0);
      }

      function closeNamesEditor() {
        namesOverlay.style.display = 'none';
        namesDraft = [];
      }

      function applyNamesEditor() {
        let changed = 0;
        namesDraft.forEach(({ layer, input }) => {
          const next = String(input?.value || '').trim();
          if (!next) return;
          const item = layer?._mapItem;
          if (!item) return;
          if (String(item.name || '') === next) return;
          item.name = next;
          layer._mapItem = item;
          try {
            layer.unbindTooltip();
            layer.bindTooltip(item.name, { permanent: true, direction: 'center', className: tooltipClassForType(item.type) });
          } catch (_) { void 0; }
          changed += 1;
        });

        rebuildRegionsFromLayers();
        renderLegend();
        closeNamesEditor();
        showMessage('Zastosowano', changed ? ('Zmieniono nazw: ' + changed + '.') : 'Brak zmian.');
      }

      editNamesBtn.addEventListener('click', () => {
        if (!isEditMode) return;
        openNamesEditor();
      });
      namesSaveBtn.addEventListener('click', applyNamesEditor);
      namesCancelBtn.addEventListener('click', closeNamesEditor);
      namesCloseBtn.addEventListener('click', closeNamesEditor);
      namesOverlay.addEventListener('click', (e) => {
        if (e.target === namesOverlay) closeNamesEditor();
      });

      const shapeTypeArea = document.getElementById('shape-type-area');
      const shapeTypeObject = document.getElementById('shape-type-object');
      const shapeNameWrap = document.getElementById('shapeNameWrap');
      const shapeNameInput = document.getElementById('shapeName');
      const shapeSaveBtn = document.getElementById('shapeSaveBtn');
      const shapeCancelBtn = document.getElementById('shapeCancelBtn');
      const shapeCloseBtn = document.getElementById('shapeCloseBtn');
      let pendingShapeLayer = null;
      let pendingShapeIsNew = false;

      function selectedShapeType() {
        if (shapeTypeArea.checked) return 'area';
        if (shapeTypeObject.checked) return 'object';
        return '';
      }

      function openShapeModal(layer, opts) {
        pendingShapeLayer = layer;
        pendingShapeIsNew = !!opts?.isNew;
        const existingType = String(layer?._mapItem?.type || '').trim().toLowerCase();
        shapeTypeArea.checked = existingType === 'area';
        shapeTypeObject.checked = existingType === 'object';
        shapeNameInput.value = String(layer?._mapItem?.name || '');
        shapeNameWrap.style.display = (shapeTypeArea.checked || shapeTypeObject.checked) ? 'block' : 'none';
        shapeOverlay.style.display = 'flex';
        setTimeout(() => {
          if (shapeNameWrap.style.display === 'block') shapeNameInput.focus();
          else shapeTypeArea.focus();
        }, 0);
      }

      function closeShapeModal() {
        shapeOverlay.style.display = 'none';
        pendingShapeLayer = null;
        pendingShapeIsNew = false;
      }

      function cancelPendingShape() {
        if (pendingShapeLayer && pendingShapeIsNew) {
          try { shapeLayers.removeLayer(pendingShapeLayer); } catch (_) { void 0; }
          try { map.removeLayer(pendingShapeLayer); } catch (_) { void 0; }
        }
        closeShapeModal();
      }

      function onShapeTypeChanged() {
        const type = selectedShapeType();
        if (!type) return;
        shapeNameWrap.style.display = 'block';
        setTimeout(() => shapeNameInput.focus(), 0);
      }

      shapeTypeArea.addEventListener('change', onShapeTypeChanged);
      shapeTypeObject.addEventListener('change', onShapeTypeChanged);
      shapeCancelBtn.addEventListener('click', cancelPendingShape);
      shapeCloseBtn.addEventListener('click', cancelPendingShape);
      shapeOverlay.addEventListener('click', (e) => {
        if (e.target === shapeOverlay) cancelPendingShape();
      });

      function requestParent(action, payload) {
        const requestId = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        return new Promise((resolve, reject) => {
          pendingRequests.set(requestId, { resolve, reject });
          parent.postMessage({ source: 'plant_map', action, requestId, payload }, '*');
          setTimeout(() => {
            if (pendingRequests.has(requestId)) {
              pendingRequests.delete(requestId);
              reject(new Error('timeout'));
            }
          }, 12000);
        });
      }

      window.addEventListener('message', (e) => {
        if (e.source !== parent) return;
        const msg = e?.data;
        if (msg?.source === 'plant_map_parent' && msg?.type === 'sync_reports') {
          renderReportMarkers(Array.isArray(msg.reports) ? msg.reports : []);
          return;
        }
        if (!msg || msg.source !== 'plant_map' || msg.type !== 'response') return;
        const req = pendingRequests.get(msg.requestId);
        if (!req) return;
        pendingRequests.delete(msg.requestId);
        if (msg.ok) req.resolve(msg.payload);
        else req.reject(new Error(msg.error || 'error'));
      });

      function normalizeCoords(coords) {
        if (!Array.isArray(coords)) return [];
        return coords
          .map(p => Array.isArray(p) && p.length >= 2 ? [Number(p[0]), Number(p[1])] : null)
          .filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      }

      function styleForType(type) {
        if (type === 'object') {
          return { color: '#0f766e', weight: 1.5, dashArray: '3 3', fillColor: '#2dd4bf', fillOpacity: 0.15 };
        }
        return { color: '#2563eb', weight: 1.5, fillColor: '#60a5fa', fillOpacity: 0.08 };
      }

      function tooltipClassForType(type) {
        return type === 'object' ? 'map-label object-label' : 'map-label';
      }

      function normalizeShapeType(raw) {
        const val = String(raw || '').trim().toLowerCase();
        if (['area', 'obszar', 'strefa', 'zone'].includes(val)) return 'area';
        if (['object', 'obiekt', 'asset', 'instalacja'].includes(val)) return 'object';
        return '';
      }

      function rebuildRegionsFromLayers() {
        const areas = [];
        const objects = [];
        shapeLayers.eachLayer((layer) => {
          const item = layer?._mapItem;
          if (!item) return;
          const type = String(item.type || '').trim().toLowerCase();
          const name = String(item.name || '').trim();
          if (!name) return;
          const latlngs = layer.getLatLngs();
          const ring = Array.isArray(latlngs) && Array.isArray(latlngs[0]) ? latlngs[0].map(ll => [ll.lat, ll.lng]) : [];
          if (ring.length < 3) return;
          if (type === 'area') areas.push({ name, coords: ring });
          if (type === 'object') objects.push({ name, coords: ring });
        });
        AREAS = areas;
        OBJECTS = objects;
      }

      function setPlantMapItems(items) {
        shapeLayers.clearLayers();

        const list = (Array.isArray(items) && items.length > 0) ? items : [];
        const areas = [];
        const objects = [];

        list.forEach((it) => {
          const type = String(it?.type || '').trim().toLowerCase();
          const name = String(it?.name || '').trim();
          const coords = normalizeCoords(it?.coords);
          if (!name || coords.length < 3) return;
          if (type !== 'area' && type !== 'object') return;

          const layer = L.polygon(coords, styleForType(type));
          layer._mapItem = { id: it?.id ?? null, type, name };
          layer.bindTooltip(name, { permanent: true, direction: 'center', className: tooltipClassForType(type) });
          layer.on('click', () => {
            if (!CAN_MANAGE || !isEditMode) return;
            openShapeModal(layer, { isNew: false });
          });
          shapeLayers.addLayer(layer);

          if (type === 'area') areas.push({ name, coords });
          else objects.push({ name, coords });
        });

        AREAS = areas;
        OBJECTS = objects;
      }

      function addReportMarker(report) {
        const lat = Number(report?.lat);
        const lng = Number(report?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const data = {
          id: report?.id,
          awaria: report?.awaria,
          status: report?.status || 'aktywne',
          priorytet: report?.priorytet || 'sredni',
          data: report?.data,
          pracownik: report?.pracownik,
          zlecajacy: report?.zlecajacy,
          opis: report?.opis,
          obszar: report?.obszar,
          obiekt: report?.obiekt
        };
        const marker = L.marker({ lat, lng }, { icon: makeIcon(priorityColors[data.priorytet] || priorityColors.sredni) }).addTo(map);
        marker._aId = report?.id;
        marker._aData = data;
        const popup = L.popup({ maxWidth: 280 }).setContent(buildPopup(data, marker));
        marker.bindPopup(popup);
        marker.on('popupopen', () => startTimer(data));
        markers.push(marker);
      }

      function clearReportMarkers() {
        markers.forEach((m) => {
          try { map.removeLayer(m); } catch (_) { void 0; }
        });
        markers.length = 0;
      }

      function renderReportMarkers(reports) {
        clearReportMarkers();
        const list = Array.isArray(reports) ? reports : [];
        list.slice().reverse().forEach(addReportMarker);
      }

      async function loadFromDb() {
        try {
          const resp = await requestParent('load', {});
          setPlantMapItems(resp?.plantMap || []);
          const reports = Array.isArray(resp?.reports) ? resp.reports : [];
          setEmployeesList(resp?.employees || []);
          renderReportMarkers(reports);
        } catch (_) {
          setPlantMapItems([]);
          setEmployeesList([]);
          clearReportMarkers();
        }
      }

      setPlantMapItems([]);
      loadFromDb();

      function setEditMode(next) {
        if (!CAN_MANAGE) return;
        isEditMode = !!next;
        editBar.style.display = isEditMode ? 'flex' : 'none';
        if (isEditMode) {
          addMode = false;
          addBtn.style.background = '#c0392b';
          addBtn.textContent = '+';
          modeInd.style.display = 'none';
          map.getContainer().style.cursor = '';
          if (!drawControl) {
            drawControl = new L.Control.Draw({
              draw: {
                polygon: true,
                rectangle: true,
                polyline: false,
                circle: false,
                circlemarker: false,
                marker: false
              },
              edit: {
                featureGroup: shapeLayers,
                remove: true
              }
            });
          }
          map.addControl(drawControl);
        } else {
          if (drawControl) {
            try { map.removeControl(drawControl); } catch (_) {}
          }
        }
      }

      if (CAN_MANAGE) {
        settingsBtn.addEventListener('click', () => {
          setEditMode(!isEditMode);
        });
        exitEditBtn.addEventListener('click', () => setEditMode(false));
        saveShapesBtn.addEventListener('click', async () => {
          const items = [];
          shapeLayers.eachLayer((layer) => {
            const item = layer?._mapItem;
            if (!item) return;
            const type = String(item.type || '').trim().toLowerCase();
            const name = String(item.name || '').trim();
            if (!name || (type !== 'area' && type !== 'object')) return;
            const latlngs = layer.getLatLngs();
            const ring = Array.isArray(latlngs) && Array.isArray(latlngs[0]) ? latlngs[0] : [];
            const coords = ring.map(ll => [ll.lat, ll.lng]);
            if (coords.length < 3) return;
            items.push({ type, name, coords });
          });
          try {
            const resp = await requestParent('save_shapes', { items });
            setPlantMapItems(resp?.items || []);
            showMessage('Zapisano', 'Zapisano strefy/obiekty.');
          } catch (e) {
            showMessage('Błąd', 'Nie udało się zapisać: ' + (e?.message || 'błąd'));
          }
        });

        map.on(L.Draw.Event.CREATED, (e) => {
          if (!isEditMode) return;
          const layer = e.layer;
          shapeLayers.addLayer(layer);
          openShapeModal(layer, { isNew: true });
        });

        shapeSaveBtn.addEventListener('click', () => {
          if (!pendingShapeLayer) return;
          const type = selectedShapeType();
          if (!type) {
            showMessage('Uwaga', 'Wybierz typ: Obszar lub Obiekt.');
            return;
          }
          const name = String(shapeNameInput.value || '').trim();
          if (!name) {
            showMessage('Uwaga', 'Podaj nazwę.');
            setTimeout(() => shapeNameInput.focus(), 0);
            return;
          }

          pendingShapeLayer.setStyle(styleForType(type));
          const existingId = pendingShapeLayer?._mapItem?.id ?? null;
          pendingShapeLayer._mapItem = { id: existingId, type, name };
          pendingShapeLayer.unbindTooltip();
          pendingShapeLayer.bindTooltip(name, { permanent: true, direction: 'center', className: tooltipClassForType(type) });
          pendingShapeLayer.off('click');
          pendingShapeLayer.on('click', () => {
            if (!CAN_MANAGE || !isEditMode) return;
            openShapeModal(pendingShapeLayer, { isNew: false });
            const currentType = pendingShapeLayer?._mapItem?.type;
            shapeTypeArea.checked = currentType === 'area';
            shapeTypeObject.checked = currentType === 'object';
            shapeNameWrap.style.display = 'block';
            shapeNameInput.value = String(pendingShapeLayer?._mapItem?.name || '');
            setTimeout(() => shapeNameInput.focus(), 0);
          });

          rebuildRegionsFromLayers();
          closeShapeModal();
        });

        map.on(L.Draw.Event.EDITED, () => rebuildRegionsFromLayers());
        map.on(L.Draw.Event.DELETED, () => rebuildRegionsFromLayers());
      }

      function escapeHtml(s) {
        return String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function now() {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return \`\${yyyy}-\${mm}-\${dd}T\${hh}:\${mi}\`;
      }

      function pointInPolygon(latlng, polygon) {
        const x = latlng.lng;
        const y = latlng.lat;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const xi = polygon[i][1];
          const yi = polygon[i][0];
          const xj = polygon[j][1];
          const yj = polygon[j][0];
          const intersects = ((yi > y) !== (yj > y))
            && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
          if (intersects) inside = !inside;
        }
        return inside;
      }

      function findNamedRegion(latlng, collection) {
        const found = collection.find(item => pointInPolygon(latlng, item.coords));
        return found ? found.name : 'Nieprzypisany';
      }

      function getLocationContext(latlng) {
        return {
          obszar: findNamedRegion(latlng, AREAS),
          obiekt: findNamedRegion(latlng, OBJECTS)
        };
      }

      AREAS.forEach((area) => {
        L.polygon(area.coords, {
          color: '#2563eb',
          weight: 1.5,
          fillColor: '#60a5fa',
          fillOpacity: 0.08
        })
          .addTo(map)
          .bindTooltip(area.name, { permanent: true, direction: 'center', className: 'map-label' });
      });

      OBJECTS.forEach((objectItem) => {
        L.polygon(objectItem.coords, {
          color: '#0f766e',
          weight: 1.5,
          dashArray: '3 3',
          fillColor: '#2dd4bf',
          fillOpacity: 0.15
        })
          .addTo(map)
          .bindTooltip(objectItem.name, { permanent: true, direction: 'center', className: 'map-label object-label' });
      });

      function elapsed(isoStr) {
        const diff = Date.now() - new Date(isoStr).getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return \`\${String(h).padStart(2,'0')}:\${String(m).padStart(2,'0')}:\${String(s).padStart(2,'0')}\`;
      }

      function priorityLabel(p) {
        return { niski:'Niski', sredni:'Średni', wysoki:'Wysoki', krytyczny:'Krytyczny' }[p] || p;
      }

      function statusLabel(s) {
        return { aktywne: 'Aktywne', w_trakcie: 'W trakcie', ukonczono: 'Ukończono' }[s] || 'Aktywne';
      }

      function statusColor(s) {
        return { aktywne: '#dc2626', w_trakcie: '#d97706', ukonczono: '#16a34a' }[s] || '#dc2626';
      }

      function makeIcon(color, status) {
        const strokeColor = status === 'w_trakcie' ? '#f59e0b' : status === 'ukonczono' ? '#22c55e' : '#fff';
        const strokeWidth = status === 'w_trakcie' || status === 'ukonczono' ? '3' : '1.5';
        return L.divIcon({
          className: '',
          html: \`<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 9.6 14 24 14 24S28 23.6 28 14C28 6.27 21.73 0 14 0z" fill="\${color}" stroke="\${strokeColor}" stroke-width="\${strokeWidth}"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>\`,
          iconSize: [28,38],
          iconAnchor: [14,38],
          popupAnchor: [0,-40]
        });
      }

      function formatDateTimeFromStorage(value) {
        try {
          const fmt = localStorage.getItem('dateFormat') || 'DD/MM/YYYY HH:mm:ss';
          const lang = String(localStorage.getItem('language') || 'pl').toLowerCase();
          const tz = localStorage.getItem('timezone') || 'Europe/Warsaw';
          const locale = lang === 'de' ? 'de-DE' : (lang === 'en' ? 'en-GB' : (lang === 'cz' ? 'cs-CZ' : 'pl-PL'));
          const d = new Date(value);
          if (isNaN(d.getTime())) return String(value || '-');
          const dtf = new Intl.DateTimeFormat(locale, {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
          });
          const parts = dtf.formatToParts(d);
          const map = {};
          for (const p of parts) {
            if (p.type !== 'literal') map[p.type] = p.value;
          }
          const monthLong = new Intl.DateTimeFormat(locale, { timeZone: tz, month: 'long' }).format(d);
          const repl = { MMMM: monthLong, YYYY: map.year, DD: map.day, MM: map.month, HH: map.hour, mm: map.minute, ss: map.second };
          return String(fmt).replace(/MMMM|YYYY|DD|MM|HH|mm|ss/g, (t) => (repl[t] ?? t));
        } catch (_) {
          return String(value || '-');
        }
      }

      function buildPopup(data, marker) {
        const div = document.createElement('div');
        div.style.cssText = 'min-width:220px;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;';
        const title = escapeHtml(data.awaria || 'Awaria');
        const pracownik = escapeHtml(data.pracownik || '-');
        const zlecajacy = escapeHtml(data.zlecajacy || '-');
        const opis = escapeHtml(data.opis || '');
        const obszar = escapeHtml(data.obszar || 'Nieprzypisany');
        const obiekt = escapeHtml(data.obiekt || 'Nieprzypisany');
        const priorytet = data.priorytet;
        const status = data.status || 'aktywne';
        const dataLabel = data.data ? formatDateTimeFromStorage(data.data) : '-';

        div.innerHTML = \`
          <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#c0392b;">\${title}</div>
          <div style="display:grid;gap:4px;">
            <div><span style="color:#64748b;">Priorytet:</span> <span style="color:\${priorityColors[priorytet]};font-weight:700;">\${priorityLabel(priorytet)}</span></div>
            <div><span style="color:#64748b;">Status:</span> <span style="color:\${statusColor(status)};font-weight:700;">\${statusLabel(status)}</span></div>
            <div><span style="color:#64748b;">Data:</span> \${escapeHtml(dataLabel)}</div>
            <div><span style="color:#64748b;">Obszar:</span> \${obszar}</div>
            <div><span style="color:#64748b;">Obiekt:</span> \${obiekt}</div>
            <div><span style="color:#64748b;">Pracownik:</span> \${pracownik}</div>
            <div><span style="color:#64748b;">Zlecił:</span> \${zlecajacy}</div>
            \${opis ? \`<div><span style="color:#64748b;">Uwagi:</span> \${opis}</div>\` : ''}
          </div>
          <div style="margin-top:10px;padding:6px 8px;background:#f1f5f9;border-radius:10px;text-align:center;">
            <div style="color:#64748b;font-size:11px;">Czas od zgłoszenia</div>
            <div id="timer-\${data.id}" style="font-size:18px;font-weight:800;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;color:#0f172a;">--:--:--</div>
          </div>
          \${CAN_MANAGE ? \`
            <div style="display:flex;gap:6px;margin-top:10px;">
              <button class="edit-btn" style="flex:1;padding:6px;background:#2980b9;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;">Edytuj</button>
              <button class="del-btn" style="flex:1;padding:6px;background:#c0392b;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;">Usuń</button>
            </div>\` : ''}\`;

        if (CAN_MANAGE) {
          div.querySelector('.edit-btn').addEventListener('click', () => {
            map.closePopup();
            openForm(marker, data);
          });
          div.querySelector('.del-btn').addEventListener('click', async () => {
            if (!confirm('Usunąć to zgłoszenie?')) return;
            try {
              const id = marker?._aId;
              if (id) {
                await requestParent('report_delete', { id });
              }
              map.removeLayer(marker);
              const i = markers.indexOf(marker);
              if (i > -1) markers.splice(i, 1);
            } catch (e) {
              showMessage('Błąd', 'Nie udało się usunąć: ' + (e?.message || 'błąd'));
            }
          });
        }

        return div;
      }

      function startTimer(data) {
        if (!data.data) return;
        const id = \`timer-\${data.id}\`;
        const startMs = new Date(data.data).getTime();

        function tick() {
          const el = document.getElementById(id);
          if (!el) return;
          const diff = Date.now() - startMs;
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          el.textContent = \`\${String(h).padStart(2,'0')}:\${String(m).padStart(2,'0')}:\${String(s).padStart(2,'0')}\`;
          setTimeout(tick, 1000);
        }

        tick();
      }

      function openForm(existingMarker, existingData) {
        editingMarker = existingMarker || null;
        document.getElementById('formTitle').textContent = existingMarker ? 'Edytuj zgłoszenie' : 'Nowe zgłoszenie awarii';
        document.getElementById('f-awaria').value = existingData?.awaria || '';
        document.getElementById('f-priorytet').value = existingData?.priorytet || 'sredni';
        document.getElementById('f-status').value = existingData?.status || 'aktywne';
        document.getElementById('f-data').value = existingData?.data || now();
        document.getElementById('f-obszar').value = existingData?.obszar || pendingContext.obszar || 'Nieprzypisany';
        document.getElementById('f-obiekt').value = existingData?.obiekt || pendingContext.obiekt || 'Nieprzypisany';
        document.getElementById('f-pracownik').value = existingData?.pracownik || '';
        reporterInput.value = existingData?.zlecajacy || CURRENT_REPORTER || '';
        document.getElementById('f-opis').value = existingData?.opis || '';
        overlay.style.display = 'flex';
        setTimeout(() => employeeInput.focus(), 0);
      }

      function closeForm() {
        overlay.style.display = 'none';
        pendingLatLng = null;
        pendingContext = { obszar: 'Nieprzypisany', obiekt: 'Nieprzypisany' };
        editingMarker = null;
      }

      addBtn.addEventListener('click', () => {
        if (!CAN_MANAGE) return;
        if (isEditMode) return;
        addMode = !addMode;
        addBtn.style.background = addMode ? '#64748b' : '#c0392b';
        addBtn.textContent = addMode ? '✕' : '+';
        modeInd.style.display = addMode ? 'block' : 'none';
        map.getContainer().style.cursor = addMode ? 'crosshair' : '';
      });

      map.on('click', (e) => {
        if (!CAN_MANAGE) return;
        if (isEditMode) return;
        if (!addMode) return;
        pendingLatLng = e.latlng;
        pendingContext = getLocationContext(e.latlng);
        addMode = false;
        addBtn.style.background = '#c0392b';
        addBtn.textContent = '+';
        modeInd.style.display = 'none';
        map.getContainer().style.cursor = '';
        openForm(null, null);
      });

      document.getElementById('saveBtn').addEventListener('click', async () => {
        if (!CAN_MANAGE) return;
        const awaria = document.getElementById('f-awaria').value.trim();
        const pracownik = document.getElementById('f-pracownik').value.trim();
        if (!awaria) { showMessage('Uwaga', 'Podaj rodzaj awarii.'); return; }
        if (!pracownik) { showMessage('Uwaga', 'Podaj pracownika przydzielonego do naprawy.'); return; }

        const priorytet = document.getElementById('f-priorytet').value;
        const status = document.getElementById('f-status').value;
        const dataValue = document.getElementById('f-data').value;
        const obszar = document.getElementById('f-obszar').value.trim() || 'Nieprzypisany';
        const obiekt = document.getElementById('f-obiekt').value.trim() || 'Nieprzypisany';
        const zlecajacy = document.getElementById('f-zlecajacy').value.trim();
        const opis = document.getElementById('f-opis').value.trim();

        try {
          if (editingMarker) {
            const id = editingMarker._aId;
            const updated = await requestParent('report_update', {
              id,
              patch: {
                obszar,
                obiekt,
                awaria,
                status,
                priorytet,
                data: dataValue,
                pracownik,
                zlecajacy,
                opis
              }
            });
            const localData = {
              id: updated?.id ?? id,
              awaria: updated?.awaria ?? awaria,
              status: updated?.status ?? status,
              priorytet: updated?.priorytet ?? priorytet,
              data: updated?.data ?? dataValue,
              obszar: updated?.obszar ?? obszar,
              obiekt: updated?.obiekt ?? obiekt,
              pracownik: updated?.pracownik ?? pracownik,
              zlecajacy: updated?.zlecajacy ?? zlecajacy,
              opis: updated?.opis ?? opis
            };

            editingMarker._aId = localData.id;
            editingMarker._aData = localData;
            editingMarker.setIcon(makeIcon(priorityColors[localData.priorytet] || priorityColors.sredni, localData.status));
            const popup = L.popup({ maxWidth: 280 }).setContent(buildPopup(localData, editingMarker));
            editingMarker.bindPopup(popup);
            editingMarker.openPopup();
            editingMarker.off('popupopen');
            editingMarker.on('popupopen', () => startTimer(localData));
          } else if (pendingLatLng) {
            const created = await requestParent('report_create', {
              report: {
                lat: pendingLatLng.lat,
                lng: pendingLatLng.lng,
                obszar,
                obiekt,
                awaria,
                status,
                priorytet,
                data: dataValue,
                pracownik,
                zlecajacy,
                opis
              }
            });
            addReportMarker(created);
            const marker = markers[markers.length - 1];
            if (marker) marker.openPopup();
          }
          closeForm();
        } catch (e) {
          showMessage('Błąd', 'Nie udało się zapisać zgłoszenia: ' + (e?.message || 'błąd'));
        }
      });

      document.getElementById('closeBtn').addEventListener('click', closeForm);
      document.getElementById('cancelBtn').addEventListener('click', closeForm);
    </script>
  </body>
</html>`;
}

function PlantMapScreen({ user }) {
  const { t } = useLanguage();
  const canViewMap = hasPermission(user, PERMISSIONS.VIEW_MAP);
  const canManageMap = hasPermission(user, PERMISSIONS.MANAGE_MAP);
  const iframeRef = useRef(null);
  const reporterName = String(user?.full_name || user?.username || '').trim();

  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const srcDoc = useMemo(
    () => buildMapSrcDoc({ canManage: canManageMap, reporterName }),
    [canManageMap, reporterName]
  );

  const postToIframe = useCallback((message) => {
    try {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(message, '*');
    } catch (_) { void 0; }
  }, []);

  const statusLabel = useCallback((status) => {
    return {
      aktywne: 'Aktywne',
      w_trakcie: 'W trakcie',
      ukonczono: 'Ukończono'
    }[String(status || '').trim()] || 'Aktywne';
  }, []);

  const filteredReports = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const priorityRank = { krytyczny: 0, wysoki: 1, sredni: 2, niski: 3 };
    const statusRank = { aktywne: 0, w_trakcie: 1, ukonczono: 2 };

    let list = [...reports];
    if (query) {
      list = list.filter((r) => {
        const text = [
          r.awaria,
          r.obszar,
          r.obiekt,
          r.pracownik,
          r.zlecajacy,
          statusLabel(r.status)
        ].map((x) => String(x || '').toLowerCase()).join(' ');
        return text.includes(query);
      });
    }

    list.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.created_at || a.data || 0).getTime() - new Date(b.created_at || b.data || 0).getTime();
      }
      if (sortBy === 'priority') {
        return (priorityRank[a.priorytet] ?? 99) - (priorityRank[b.priorytet] ?? 99);
      }
      if (sortBy === 'status') {
        return (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
      }
      return new Date(b.created_at || b.data || 0).getTime() - new Date(a.created_at || a.data || 0).getTime();
    });

    return list;
  }, [reports, searchTerm, sortBy, statusLabel]);

  const updateReportStatus = useCallback(async (id, nextStatus) => {
    const report = await api.put(`/api/plant-map/reports/${id}`, { status: nextStatus });
    setReports((prev) => prev.map((r) => (Number(r.id) === Number(id) ? report : r)));
  }, []);

  useEffect(() => {
    postToIframe({ source: 'plant_map_parent', type: 'sync_reports', reports });
  }, [reports, postToIframe]);

  useEffect(() => {
    const onMessage = async (e) => {
      try {
        if (e.source !== iframeRef.current?.contentWindow) return;
        const msg = e?.data;
        if (!msg || msg.source !== 'plant_map') return;
        const requestId = msg.requestId;
        const action = msg.action;
        const payload = msg.payload;
        if (!requestId || !action) return;

        const replyOk = (data) => postToIframe({ source: 'plant_map', type: 'response', requestId, ok: true, payload: data });
        const replyErr = (error) => postToIframe({ source: 'plant_map', type: 'response', requestId, ok: false, error: String(error || 'error') });

        if (action === 'load') {
          const [plantMapRes, reportsRes, employeesRes] = await Promise.allSettled([
            api.get('/api/plant-map'),
            api.get('/api/plant-map/reports', { params: { limit: 2000 } }),
            api.get('/api/employees')
          ]);
          const plantMap = plantMapRes.status === 'fulfilled' ? plantMapRes.value : [];
          const loadedReports = reportsRes.status === 'fulfilled' ? reportsRes.value : [];
          setReports(Array.isArray(loadedReports) ? loadedReports : []);
          const employeesRaw = employeesRes.status === 'fulfilled' ? employeesRes.value : [];
          const employees = Array.isArray(employeesRaw)
            ? employeesRaw
            : (Array.isArray(employeesRaw?.data) ? employeesRaw.data : []);
          replyOk({
            plantMap: Array.isArray(plantMap) ? plantMap : [],
            reports: Array.isArray(loadedReports) ? loadedReports : [],
            employees
          });
          return;
        }

        if (action === 'save_shapes') {
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const result = await api.put('/api/plant-map/bulk', { items });
          replyOk(result);
          return;
        }

        if (action === 'report_create') {
          const report = await api.post('/api/plant-map/reports', payload?.report || payload || {});
          setReports((prev) => [report, ...prev]);
          replyOk(report);
          return;
        }

        if (action === 'report_update') {
          const id = payload?.id;
          const patch = payload?.patch || {};
          const report = await api.put(`/api/plant-map/reports/${id}`, patch);
          setReports((prev) => prev.map((r) => (Number(r.id) === Number(id) ? report : r)));
          replyOk(report);
          return;
        }

        if (action === 'report_delete') {
          const id = payload?.id;
          await api.delete(`/api/plant-map/reports/${id}`);
          setReports((prev) => prev.filter((r) => Number(r.id) !== Number(id)));
          replyOk({ success: true });
          return;
        }

        replyErr('unknown_action');
      } catch (err) {
        postToIframe({ source: 'plant_map', type: 'response', requestId: e?.data?.requestId, ok: false, error: err?.message || String(err || 'error') });
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postToIframe]);

  if (!canViewMap) {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            {t('map.permissions.title')}
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            {t('map.permissions.viewMapDenied')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('map.title')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {canManageMap ? t('map.hint.manage') : t('map.hint.view')}
        </p>
      </div>
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsReportsOpen((v) => !v)}
          className="absolute top-3 right-3 z-20 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
          title="Pokaż/ukryj listę zgłoszeń"
        >
          <ArchiveBoxIcon className="w-4 h-4" />
          {isReportsOpen ? 'Ukryj listę' : 'Lista zgłoszeń'}
        </button>
        <div className="flex w-full" style={{ height: '70vh', minHeight: 520 }}>
          <div className={isReportsOpen ? 'w-2/3' : 'w-full'}>
            <iframe
              title={escapeHtml(t('map.title'))}
              srcDoc={srcDoc}
              className="w-full h-full"
              ref={iframeRef}
            />
          </div>
          {isReportsOpen && (
            <aside className="w-1/3 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col">
              <div className="p-3 border-b border-slate-200 dark:border-slate-700 space-y-2 text-slate-500 dark:text-slate-400">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Szukaj zgłoszenia..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="newest">Sortuj: najnowsze</option>
                  <option value="oldest">Sortuj: najstarsze</option>
                  <option value="status">Sortuj: status</option>
                  <option value="priority">Sortuj: priorytet</option>
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredReports.map((r) => {
                  const status = String(r.status || 'aktywne');
                  const badgeClass = status === 'ukonczono'
                    ? 'bg-green-100 text-green-700'
                    : status === 'w_trakcie'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700';
                  return (
                    <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{r.awaria || 'Awaria'}</div>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
                          {statusLabel(status)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {r.obszar || '-'} | {r.obiekt || '-'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        Pracownik: {r.pracownik || '-'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        Data: {r.data ? formatDate(r.data) : '-'}
                      </div>
                      {canManageMap && (
                        <div className="mt-2 text-slate-500 dark:text-slate-300">
                          <select
                            value={status}
                            onChange={(e) => updateReportStatus(r.id, e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs"
                          >
                            <option value="aktywne">Aktywne</option>
                            <option value="w_trakcie">W trakcie</option>
                            <option value="ukonczono">Ukończono</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredReports.length === 0 && (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Brak zgłoszeń dla podanego filtra.</div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlantMapScreen;
