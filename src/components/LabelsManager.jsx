import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { ArrowDownTrayIcon, Cog6ToothIcon, MagnifyingGlassIcon, PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline';
import ToolsSlingsItemsTable from './tools/ToolsSlingsItemsTable';
import ToolsImpactSocketsItemsTable from './tools/ToolsImpactSocketsItemsTable';
import ToolsDetectorsItemsTable from './tools/ToolsDetectorsItemsTable';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import api from '../api';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { PERMISSIONS, hasPermission } from '../constants';

// Prosta walidacja URL (HTTP/HTTPS)
function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string') return false;
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Komponent zarządzania etykietami
function LabelsManager({ tools = [], user }) {
  const { t } = useLanguage();
  const [selectedTools, setSelectedTools] = useState([]);
  const [selectedSubitems, setSelectedSubitems] = useState([]);
  const [toolsData, setToolsData] = useState(Array.isArray(tools) ? tools : []);
  const [toolsCodePrefix, setToolsCodePrefix] = useState('');
  const [toolCategoryPrefixes, setToolCategoryPrefixes] = useState({});
  const [expandedIds, setExpandedIds] = useState([]);
  const [expandedLabelToolIds, setExpandedLabelToolIds] = useState([]);
  const [subitemsByToolId, setSubitemsByToolId] = useState({});
  const [previewOverrideTool, setPreviewOverrideTool] = useState(null);
  const [previews, setPreviews] = useState({}); // { [id]: { qr: string|null, barcode: string|null } }
  const previewsRef = useRef(previews);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  const [selectedSizes, setSelectedSizes] = useState({}); // { [id]: '70x40' | '51x32' | '110x60' }
  const [currentTab, setCurrentTab] = useState('generator'); // 'generator' | 'editor' | 'editor_separate' | 'bhp'
  const [bhpData, setBhpData] = useState([]);
  const [selectedBhp, setSelectedBhp] = useState([]);
  const [printMode, setPrintMode] = useState(() => {
    try {
      const raw = localStorage.getItem('labelsManager.printMode');
      return raw === 'barcode' || raw === 'qr' ? raw : 'qr';
    } catch { void 0; }
    return 'qr';
  }); // 'qr' | 'barcode'

  useEffect(() => {
    try {
      localStorage.setItem('labelsManager.printMode', printMode);
    } catch { void 0; }
  }, [printMode]);

  const [toolsSearch, setToolsSearch] = useState('');
  const [toolsCategory, setToolsCategory] = useState('all');
  const [toolsSort, setToolsSort] = useState('name_asc');
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false);

  // Modal for Slings
  const [slingsModalOpen, setSlingsModalOpen] = useState(false);
  const [slingsModalTool, setSlingsModalTool] = useState(null);
  const [socketsModalOpen, setSocketsModalOpen] = useState(false);
  const [socketsModalTool, setSocketsModalTool] = useState(null);
  const [detectorsModalOpen, setDetectorsModalOpen] = useState(false);
  const [detectorsModalTool, setDetectorsModalTool] = useState(null);

  // Konfiguracja szablonu etykiety (zapisywana w localStorage)
  const DEFAULT_TEMPLATE = {
    version: 1,
    language: 'pl',
    logoUrl: 'https://github.com/RexEtImperator/system-zarzadzania-narzedziownia/raw/main/public/equipr-nobg.png?raw=true',
    sizeKey: '70x40',
    options: {
      barcodeShowValue: false,
      barcodeValueFontRatio: 0.12,
      logoVisible: true,
      logoWidthMm: 14,
      driverLabelLengthMm: 85,
      showCategory: true,
      nameFontPx: 18,
      skuFontPx: 12
    },
    layout: {
      title: { x: 0.5, y: 0.13, fontSize: 26, align: 'center' },
      subtitle: { x: 0.5, y: 0.23, fontSize: 18, align: 'center' },
      qr: { x: 0.125, y: 0.33, w: 0.4, h: 0.53 },
      barcode: { x: 0.55, y: 0.33, w: 0.42, h: 0.36 },
      info: { x: 0.5, y: 0.93, fontSize: 14, align: 'center' },
      logo: { x: 0.06, y: 0.08, w: 0.1, h: 0.12 }
    },
    translations: {
      pl: { sku: 'SKU', scanInfo: 'Zeskanuj kod aby sprawdzić status' },
      en: { sku: 'SKU', scanInfo: 'Scan the code to check status' }
    }
  };
  const [templateConfig, setTemplateConfig] = useState(() => {
    try {
      const raw = localStorage.getItem('labelTemplateConfig');
      if (raw) {
        const loaded = JSON.parse(raw);
        return {
          ...DEFAULT_TEMPLATE,
          ...loaded,
          options: { ...DEFAULT_TEMPLATE.options, ...(loaded.options || {}) },
          layout: { ...DEFAULT_TEMPLATE.layout, ...(loaded.layout || {}) },
          sizeKey: loaded.sizeKey || DEFAULT_TEMPLATE.sizeKey,
          dpi: loaded.dpi || DEFAULT_TEMPLATE.dpi
        };
      }
    } catch { void 0; }
    return DEFAULT_TEMPLATE;
  });

  // Osobne konfiguracje dla etykiety QR i etykiety kodu kreskowego
  const DEFAULT_QR_TEMPLATE = {
    version: 2,
    language: 'pl',
    logoUrl: 'https://github.com/RexEtImperator/system-zarzadzania-narzedziownia/raw/main/public/equipr-nobg.png?raw=true',
    sizeKey: '51x32',
    options: {
      logoVisible: true
    },
    layout: {
      title: { x: 0.45, y: 0.3, fontSize: 22, align: 'left' },
      subtitle: { x: 0.45, y: 0.5, fontSize: 16, align: 'left' },
      qr: { x: 0.05, y: 0.15, w: 0.35, h: 0.7 },
      info: { x: 0.5, y: 0.93, fontSize: 14, align: 'center' },
      logo: { x: 0.85, y: 0.08, w: 0.1, h: 0.12 }
    },
    translations: {
      pl: { sku: 'SKU', scanInfo: 'Zeskanuj kod aby sprawdzić status' },
      en: { sku: 'SKU', scanInfo: 'Scan the code to check status' }
    }
  };
  const DEFAULT_BARCODE_TEMPLATE = {
    version: 1,
    language: 'pl',
    logoUrl: 'https://github.com/RexEtImperator/system-zarzadzania-narzedziownia/raw/main/public/equipr-nobg.png?raw=true',
    sizeKey: '70x40',
    options: {
      barcodeShowValue: true,
      barcodeValueFontRatio: 0.12,
      logoVisible: true
    },
    layout: {
      title: { x: 0.5, y: 0.13, fontSize: 26, align: 'center' },
      subtitle: { x: 0.5, y: 0.23, fontSize: 18, align: 'center' },
      barcode: { x: 0.55, y: 0.33, w: 0.42, h: 0.36 },
      info: { x: 0.5, y: 0.93, fontSize: 14, align: 'center' },
      logo: { x: 0.06, y: 0.08, w: 0.1, h: 0.12 }
    },
    translations: {
      pl: { sku: 'SKU', scanInfo: 'Zeskanuj kod aby sprawdzić status' },
      en: { sku: 'SKU', scanInfo: 'Scan the code to check status' }
    }
  };
  const [qrTemplateConfig, setQrTemplateConfig] = useState(() => {
    try {
      const raw = localStorage.getItem('qrLabelTemplateConfig');
      if (raw) {
        const loaded = JSON.parse(raw);
        const isOld = !loaded.version || loaded.version < 2;
        return {
          ...DEFAULT_QR_TEMPLATE,
          ...loaded,
          version: DEFAULT_QR_TEMPLATE.version,
          options: { ...DEFAULT_QR_TEMPLATE.options, ...(loaded.options || {}) },
          layout: isOld ? DEFAULT_QR_TEMPLATE.layout : { ...DEFAULT_QR_TEMPLATE.layout, ...(loaded.layout || {}) },
          sizeKey: loaded.sizeKey || DEFAULT_QR_TEMPLATE.sizeKey,
          dpi: loaded.dpi || DEFAULT_QR_TEMPLATE.dpi
        };
      }
    } catch { void 0; }
    return DEFAULT_QR_TEMPLATE;
  });
  const [barcodeTemplateConfig, setBarcodeTemplateConfig] = useState(() => {
    try {
      const raw = localStorage.getItem('barcodeLabelTemplateConfig');
      if (raw) {
        const loaded = JSON.parse(raw);
        return {
          ...DEFAULT_BARCODE_TEMPLATE,
          ...loaded,
          options: { ...DEFAULT_BARCODE_TEMPLATE.options, ...(loaded.options || {}) },
          layout: { ...DEFAULT_BARCODE_TEMPLATE.layout, ...(loaded.layout || {}) },
          sizeKey: loaded.sizeKey || DEFAULT_BARCODE_TEMPLATE.sizeKey,
          dpi: loaded.dpi || DEFAULT_BARCODE_TEMPLATE.dpi
        };
      }
    } catch { void 0; }
    return DEFAULT_BARCODE_TEMPLATE;
  });
  // Konfiguracje drukowania dla osobnych szablonów
  const [qrPrintConfig, setQrPrintConfig] = useState({ protocol: 'ipp', url: '', copies: 1 });
  const [barcodePrintConfig, setBarcodePrintConfig] = useState({ protocol: 'ipp', url: '', copies: 1 });

  // Zapis w czasie rzeczywistym i emitowanie zdarzenia aktualizacji
  const toolsLength = Array.isArray(tools) ? tools.length : 0;
  const userId = user?.id ?? null;

  useEffect(() => {
    try {
      localStorage.setItem('labelTemplateConfig', JSON.stringify(templateConfig));
      window.dispatchEvent(new CustomEvent('labelTemplateConfigUpdated', { detail: templateConfig }));
    } catch (e) {
      console.warn('Nie udało się zapisać konfiguracji szablonu etykiety:', e);
    }
  }, [templateConfig]);

  // Zapis osobnych konfiguracji
  useEffect(() => {
    try {
      localStorage.setItem('qrLabelTemplateConfig', JSON.stringify(qrTemplateConfig));
    } catch (e) {
      console.warn('Nie udało się zapisać konfiguracji szablonu QR:', e);
    }
  }, [qrTemplateConfig]);
  useEffect(() => {
    try {
      localStorage.setItem('barcodeLabelTemplateConfig', JSON.stringify(barcodeTemplateConfig));
    } catch (e) {
      console.warn('Nie udało się zapisać konfiguracji szablonu kodu kreskowego:', e);
    }
  }, [barcodeTemplateConfig]);

  // Konwersja mm -> px (300 DPI)
  const mmToPx = (mm) => Math.round((mm * 300) / 25.4);
  const LABEL_SIZES = {
    '51x32': { w: mmToPx(51), h: mmToPx(32), label: '51x32 mm' },
    '70x40': { w: mmToPx(70), h: mmToPx(40), label: '70x40 mm' },
    '110x60': { w: mmToPx(110), h: mmToPx(60), label: '110x60 mm' },
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await api.get('/api/config/general');
        setToolsCodePrefix(cfg?.toolsCodePrefix || '');
        setToolCategoryPrefixes(cfg?.toolCategoryPrefixes || {});
        
      } catch (err) {
        toast.error(err?.message || t('labelManager.errors.loadingLabelConfiguration'));
      }
    };
    loadConfig();
  }, [t]);

  // Synchronizuj stan z przekazanymi propsami lub pobierz narzędzia z API gdy brak
  // Uwaga: zależność oparta o długość tablicy, aby uniknąć pętli (domyślne [] zmienia referencję przy każdym renderze)
  useEffect(() => {
    // Bramka uprawnień: bez VIEW_LABELS nie pobieraj danych
    if (!hasPermission(user, PERMISSIONS.VIEW_LABELS)) {
      setToolsData([]);
      return;
    }
    if (Array.isArray(tools) && tools.length > 0) {
      setToolsData(tools);
      return;
    }
    const fetchTools = async () => {
      try {
        const resp = await api.get('/api/tools?limit=1000&sortBy=inventory_number&sortDir=asc');
        const list = Array.isArray(resp) ? resp : (resp?.data || []);
        setToolsData(list);
      } catch (err) {
        toast.error(err?.message || t('labelsManager.errors.fetchToolsFailed'));
        setToolsData([]);
      }
    };
    fetchTools();
    // tools i user są używane tylko do odczytu (sprawdzanie długości / id),
    // ale nie chcemy refetch przy każdej zmianie ich referencji, dlatego
    // w tablicy zależności używamy tylko pochodnych: toolsLength i userId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsLength, userId, t]);

  // Pobieranie danych BHP
  useEffect(() => {
    if (currentTab !== 'bhp') return;
    const fetchBhp = async () => {
      try {
        const res = await api.get('/api/bhp?limit=10000');
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        setBhpData(list);
      } catch (e) {
        console.warn('Błąd pobierania BHP:', e);
      }
    };
    fetchBhp();
  }, [currentTab]);

  // Narzędzie używane do generowania wartości w podglądzie (QR/BARCODE)
  const [selectedPreviewToolId, setSelectedPreviewToolId] = useState(null);
  const previewTool = useMemo(() => {
    if (previewOverrideTool) return previewOverrideTool;
    if (!toolsData || toolsData.length === 0) return null;
    const found = toolsData.find(t => t.id === selectedPreviewToolId);
    return found || toolsData[0];
  }, [previewOverrideTool, toolsData, selectedPreviewToolId]);
  const previewValue = useMemo(() => {
    if (!previewTool) return 'DEMO-001';
    return previewTool.sku || previewTool.code || `TOOL-${previewTool.id}`;
  }, [previewTool]);
  const previewSubLine = useMemo(() => {
    const v = previewTool?.subitem_print_line;
    return typeof v === 'string' ? v.trim() : '';
  }, [previewTool]);

  const computeToolCodeText = useCallback((tool) => {
    // BHP Check: jeśli obiekt ma inventory_number a nie ma sku (lub sku jest puste), traktujemy jako BHP
    if (tool.inventory_number !== undefined && !tool.sku) {
      return tool.inventory_number || '';
    }
    const cat = tool?.category || '';
    const byCat = (toolCategoryPrefixes || {})[cat];
    const prefix = byCat || toolsCodePrefix || '';
    return tool.qr_code || tool.barcode || (prefix ? `${prefix}-${tool.sku}` : tool.sku);
  }, [toolCategoryPrefixes, toolsCodePrefix]);

  const selectedSubitemsSet = useMemo(() => new Set(selectedSubitems), [selectedSubitems]);

  const getToolSubitemsKind = (category) => {
    const cat = String(category || '').trim().toLowerCase();
    if (cat === 'zawiesia pasowe' || cat === 'zawiesia łańcuchowe') return 'slings';
    if (cat === 'nasadki 1"' || cat === 'nasadki 1/2"') return 'sockets';
    if (cat === 'detektory') return 'detectors';
    return null;
  };

  const fetchSubitems = async (toolId, kind) => {
    if (!toolId || !kind) return [];
    setSubitemsByToolId(prev => ({
      ...prev,
      [toolId]: { kind, loading: true, error: null, items: Array.isArray(prev?.[toolId]?.items) ? prev[toolId].items : [] }
    }));
    try {
      const endpoint = kind === 'slings'
        ? `/api/slings/by-tool/${toolId}`
        : (kind === 'sockets' ? `/api/impact-sockets/by-tool/${toolId}` : `/api/detectors/by-tool/${toolId}`);
      const res = await api.get(endpoint);
      const items = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setSubitemsByToolId(prev => ({ ...prev, [toolId]: { kind, loading: false, error: null, items } }));
      return items;
    } catch (e) {
      setSubitemsByToolId(prev => ({ ...prev, [toolId]: { kind, loading: false, error: e?.message || 'Błąd pobierania podpozycji', items: [] } }));
      return [];
    }
  };

  const ensureSubitemsLoaded = async (tool) => {
    const toolId = tool?.id;
    const kind = getToolSubitemsKind(tool?.category);
    if (!toolId || !kind) return { kind: null, items: [] };
    const cached = subitemsByToolId?.[toolId];
    if (cached && cached.kind === kind && Array.isArray(cached.items) && cached.items.length > 0) {
      return { kind, items: cached.items };
    }
    const items = await fetchSubitems(toolId, kind);
    return { kind, items };
  };

  const toggleExpandLabelTool = async (tool) => {
    const toolId = tool?.id;
    if (!toolId) return;
    const isOpen = expandedLabelToolIds.includes(toolId);
    if (isOpen) {
      setExpandedLabelToolIds(prev => prev.filter(id => id !== toolId));
      return;
    }
    setExpandedLabelToolIds(prev => Array.from(new Set([...(prev || []), toolId])));
    await ensureSubitemsLoaded(tool);
  };

  const buildSyntheticToolForSubitem = (parentTool, kind, item) => {
    const parentName = String(parentTool?.name || '').trim();
    const parentCategory = parentTool?.category || '';
    const sku = String(item?.sku || '').trim();
    const serial = item?.serial_number ? String(item.serial_number).trim() : '';
    const id = `sub:${kind}:${parentTool?.id}:${item?.id}`;
    const printLine = (() => {
      if (kind === 'detectors') return String(item?.type || '').trim();
      if (kind === 'slings') return String(item?.kind || '').trim();
      if (kind === 'sockets') return [String(item?.kind || '').trim(), String(item?.size || '').trim()].filter(Boolean).join(' / ');
      return '';
    })();
    if (kind === 'slings') {
      return {
        ...parentTool,
        id,
        name: parentName,
        category: parentCategory,
        sku,
        barcode: sku,
        qr_code: sku,
        serial_number: serial || null,
        inventory_number: serial || sku,
        index_prefix: 'SKU:',
        index_text: serial || sku,
        parent_name: parentName,
        subitem_kind: kind,
        subitem_print_line: printLine || ''
      };
    }
    return {
      ...parentTool,
      id,
      name: parentName,
      category: parentCategory,
      sku,
      barcode: sku,
      qr_code: sku,
      serial_number: serial || (item?.serial_number ? String(item.serial_number).trim() : null),
      inventory_number: serial || sku,
      parent_name: parentName,
      subitem_kind: kind,
      subitem_print_line: printLine || ''
    };
  };

  const getSubitemDisplayLine = (kind, item) => {
    if (kind === 'slings') {
      const a = String(item?.kind || '').trim();
      const b = String(item?.serial_number || '').trim();
      return [a, b].filter(Boolean).join(' • ') || String(item?.sku || '').trim();
    }
    if (kind === 'sockets') {
      const a = String(item?.kind || '').trim();
      const b = String(item?.size || '').trim();
      return [a, b].filter(Boolean).join(' • ') || String(item?.sku || '').trim();
    }
    const a = String(item?.type || '').trim();
    const b = String(item?.serial_number || '').trim();
    return [a, b].filter(Boolean).join(' • ') || String(item?.sku || '').trim();
  };

  // Reset selection/previews on tab change
  useEffect(() => {
    setExpandedIds([]);
    setExpandedLabelToolIds([]);
    setPreviewOverrideTool(null);
    setPreviews({});
  }, [currentTab]);

  // Funkcja zaznaczania/odznaczania wszystkich narzędzi
  const toolCategoryOptions = useMemo(() => {
    const cats = Array.from(new Set((toolsData || []).map(t => String(t?.category || '').trim()).filter(Boolean)));
    cats.sort((a, b) => a.localeCompare(b, 'pl'));
    return cats;
  }, [toolsData]);

  const filteredToolsData = useMemo(() => {
    const q = String(toolsSearch || '').trim().toLowerCase();
    const cat = String(toolsCategory || 'all');
    const list = (toolsData || []).filter(t => {
      if (cat !== 'all' && String(t?.category || '') !== cat) return false;
      if (!q) return true;
      const hay = `${t?.name || ''} ${t?.sku || ''} ${t?.inventory_number || ''} ${t?.manufacturer || ''} ${t?.model || ''}`.toLowerCase();
      return hay.includes(q);
    });
    const sortKey = String(toolsSort || 'name_asc');
    list.sort((a, b) => {
      const an = String(a?.name || '');
      const bn = String(b?.name || '');
      const ak = String(a?.sku || '');
      const bk = String(b?.sku || '');
      if (sortKey === 'name_desc') return bn.localeCompare(an, 'pl');
      if (sortKey === 'sku_asc') return ak.localeCompare(bk, 'pl');
      if (sortKey === 'sku_desc') return bk.localeCompare(ak, 'pl');
      return an.localeCompare(bn, 'pl');
    });
    return list;
  }, [toolsData, toolsSearch, toolsCategory, toolsSort]);

  const previewLabelWidthPx = useMemo(() => {
    const mm = Math.max(15, Math.min(200, Number(templateConfig?.options?.driverLabelLengthMm ?? 85) || 85));
    const px = Math.round(mm * 3.78);
    return Math.max(280, Math.min(920, px));
  }, [templateConfig?.options?.driverLabelLengthMm]);

  const suggestedDriverLabelLengthMm = useMemo(() => {
    const base = 85;
    const logoWidthMm = Math.max(6, Math.min(60, Number(templateConfig?.options?.logoWidthMm ?? 14) || 14));
    return Math.max(15, Math.min(200, Math.ceil(base + logoWidthMm + 1)));
  }, [templateConfig?.options?.logoWidthMm]);

  const handleSelectAll = async (checked) => {
    const list = filteredToolsData || [];
    if (list.length === 0) return;

    if (!checked) {
      const removeToolIds = new Set(list.filter(t => !getToolSubitemsKind(t?.category)).map(t => t.id));
      setSelectedTools(prev => (prev || []).filter(id => !removeToolIds.has(id)));
      setSelectedSubitems(prev => (prev || []).filter(key => {
        const parts = String(key || '').split(':');
        if (parts.length < 4) return false;
        const toolId = parts[2];
        return !list.some(t => String(t.id) === String(toolId) && Boolean(getToolSubitemsKind(t?.category)));
      }));
      return;
    }

    const plainIds = list.filter(t => !getToolSubitemsKind(t?.category)).map(t => t.id);
    if (plainIds.length > 0) {
      setSelectedTools(prev => Array.from(new Set([...(prev || []), ...plainIds])));
    }

    const withSub = list.filter(t => Boolean(getToolSubitemsKind(t?.category)));
    if (withSub.length === 0) return;

    toast.info('Pobieranie podpozycji do zaznaczenia...');
    for (const tool of withSub) {
      const { kind, items } = await ensureSubitemsLoaded(tool);
      if (!kind || !Array.isArray(items) || items.length === 0) continue;
      const keys = items.map(it => `sub:${kind}:${tool.id}:${it.id}`);
      setSelectedSubitems(prev => Array.from(new Set([...(prev || []), ...keys])));
    }
  };

  const isAllSelected = useMemo(() => {
    const list = filteredToolsData || [];
    if (list.length === 0) return false;
    const toolsSet = new Set(selectedTools);
    for (const tool of list) {
      const kind = getToolSubitemsKind(tool?.category);
      if (!kind) {
        if (!toolsSet.has(tool.id)) return false;
        continue;
      }
      const cached = subitemsByToolId?.[tool.id];
      const items = Array.isArray(cached?.items) ? cached.items : [];
      if (items.length === 0) return false;
      const selectedCount = items.reduce((acc, it) => acc + (selectedSubitemsSet.has(`sub:${kind}:${tool.id}:${it.id}`) ? 1 : 0), 0);
      if (selectedCount !== items.length) return false;
    }
    return true;
  }, [filteredToolsData, selectedTools, selectedSubitemsSet, subitemsByToolId]);

  const generateQRCode = useCallback(async (text, size = 200, margin = 2) => {
    try {
      const url = await QRCode.toDataURL(text, {
        width: size,
        margin,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      return url;
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.generateQrFailed'));
      return null;
    }
  }, [t]);

  // Generate Barcode
  const generateBarcode = useCallback((text) => {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, text, {
        format: 'CODE128',
        width: 3,
        height: 120,
        fontSize: 16,
        margin: 10,
        font: 'Arial',
        fontOptions: 'bold'
      });
      return canvas.toDataURL('image/png', 1.0);
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.generateBarcodeFailed'));
      return null;
    }
  }, [t]);

  // Upewnij się, że podglądy dla danego narzędzia są wygenerowane (tylko po rozwinięciu)
  const ensurePreviews = useCallback(async (tool) => {
    const id = tool.id;
    const existing = previewsRef.current?.[id];
    if (existing && existing.qr && existing.barcode) return;
    const codeText = computeToolCodeText(tool);
    try {
      const qrUrl = await generateQRCode(codeText, 200);
      const barcodeUrl = generateBarcode(codeText);
      setPreviews(prev => ({ ...prev, [id]: { qr: qrUrl, barcode: barcodeUrl } }));
    } catch (e) {
      toast.error(e?.message || t('labelsManager.errors.previewFailed'));
    }
  }, [computeToolCodeText, generateBarcode, generateQRCode, t]);

  useEffect(() => {
    if (currentTab !== 'generator') return;
    if (!previewTool) return;
    ensurePreviews(previewTool);
  }, [currentTab, previewTool, ensurePreviews]);

  const handlePrintSubItem = async (parentTool, subItem) => {
    const syntheticTool = {
      ...parentTool,
      name: '',
      sku: subItem.sku,
      qr_code: subItem.sku,
      serial_number: subItem.serial_number,
      inventory_number: subItem.serial_number || subItem.sku
    };
    await handlePrintBrother([syntheticTool]);
  };

  const toggleExpand = async (tool) => {
    // Jeśli to zawiesia, otwórz modal
    if ((tool.category || '').toLowerCase().includes('zawiesia')) {
      setSlingsModalTool(tool);
      setSlingsModalOpen(true);
      return;
    }
    if ((tool.category || '').toLowerCase().includes('nasadki')) {
      setSocketsModalTool(tool);
      setPrintMode('barcode');
      setSocketsModalOpen(true);
      return;
    }
    if ((tool.category || '').toLowerCase().includes('detekt')) {
      setDetectorsModalTool(tool);
      setPrintMode('qr');
      setDetectorsModalOpen(true);
      return;
    }

    setExpandedIds(prev => {
      const isOpen = prev.includes(tool.id);
      const next = isOpen ? prev.filter(x => x !== tool.id) : [...prev, tool.id];
      return next;
    });
    // Ustaw domyślny rozmiar i wygeneruj podgląd
    setSelectedSizes(prev => ({ ...prev, [tool.id]: prev[tool.id] || '70x40' }));
    await ensurePreviews(tool);
  };

  // Pobieranie etykiety QR w wybranym rozmiarze
  const downloadQrLabelSized = async (tool, sizeKey) => {
    try {
      const { w, h } = LABEL_SIZES[sizeKey] || LABEL_SIZES['70x40'];
      const [mmW] = (sizeKey || '70x40').split('x').map(n => Number(n));
      const PREVIEW_PX_PER_MM = 8;
      const previewW = Math.floor(mmW * PREVIEW_PX_PER_MM);
      const scale = w / previewW; // skala względem podglądu
      const codeText = computeToolCodeText(tool);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // tło
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const t = qrTemplateConfig;
      // Tytuł wg layoutu
      ctx.fillStyle = '#000000';
      ctx.textAlign = t?.layout?.title?.align || 'center';
      ctx.font = `bold ${Math.floor((t?.layout?.title?.fontSize || 26) * scale)}px Arial`;
      const tx = Math.floor((t?.layout?.title?.x ?? 0.5) * w);
      const ty = Math.floor((t?.layout?.title?.y ?? 0.13) * h);
      const titleText = (tool && typeof tool.title_text === 'string') ? tool.title_text : tool.name;
      ctx.fillText(titleText, tx, ty);
      // Podtytuł (SKU)
      ctx.textAlign = t?.layout?.subtitle?.align || 'center';
      ctx.font = `${Math.floor((t?.layout?.subtitle?.fontSize || 18) * scale)}px Arial`;
      const skuLabel = t?.translations?.[t?.language || 'pl']?.sku || 'SKU';
      const sx = Math.floor((t?.layout?.subtitle?.x ?? 0.5) * w);
      const sy = Math.floor((t?.layout?.subtitle?.y ?? 0.23) * h);
      const subtitleText = (tool && typeof tool.subtitle_text === 'string')
        ? tool.subtitle_text
        : `${skuLabel}: ${tool.sku || tool.inventory_number}`;
      ctx.fillText(subtitleText, sx, sy);
      // QR wg layoutu
      const qrL = t?.layout?.qr || { x: 0.125, y: 0.33, w: 0.4, h: 0.53 };
      const qrBoxW = Math.floor(qrL.w * w);
      const qrBoxH = Math.floor(qrL.h * h);
      const qrSize = Math.min(qrBoxW, qrBoxH);
      const qrUrl = await generateQRCode(codeText, qrSize);
      if (qrUrl) {
        const img = new Image();
        img.onload = () => {
          const qrX = Math.floor(qrL.x * w + (qrBoxW - qrSize) / 2);
          const qrY = Math.floor(qrL.y * h + (qrBoxH - qrSize) / 2);
          ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
          // Info wg layoutu
          ctx.textAlign = t?.layout?.info?.align || 'center';
          ctx.font = `${Math.floor((t?.layout?.info?.fontSize || 14) * scale)}px Arial`;
          const scanInfo = t?.translations?.[t?.language || 'pl']?.scanInfo || 'Zeskanuj kod aby sprawdzić status';
          const ix = Math.floor((t?.layout?.info?.x ?? 0.5) * w);
          const iy = Math.floor((t?.layout?.info?.y ?? 0.93) * h);
          ctx.fillText(scanInfo, ix, iy);
          const maybeFinish = () => {
            const link = document.createElement('a');
            link.download = `etykieta-qr-${codeText}-${sizeKey}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            link.click();
          };
          const showLogo = (t?.options?.logoVisible ?? true);
          const lx = Math.floor(w * (t?.layout?.logo?.x ?? 0.06));
          const ly = Math.floor(h * (t?.layout?.logo?.y ?? 0.08));
          const lw = Math.floor(w * (t?.layout?.logo?.w ?? 0.1));
          const lh = Math.floor(h * (t?.layout?.logo?.h ?? 0.12));
          if (showLogo && isValidHttpUrl(t?.logoUrl)) {
            try {
              const logoImg = new Image();
              logoImg.crossOrigin = 'anonymous';
              logoImg.onload = () => { ctx.drawImage(logoImg, lx, ly, lw, lh); maybeFinish(); };
              logoImg.onerror = () => {
                ctx.strokeStyle = '#888'; ctx.strokeRect(lx, ly, lw, lh);
                ctx.font = `${Math.max(10, Math.floor(lh * 0.4))}px Arial`;
                ctx.fillStyle = '#000'; ctx.textAlign = 'center';
                ctx.fillText('LOGO', lx + lw / 2, ly + lh / 2 + Math.floor(lh * 0.15));
                maybeFinish();
              };
              logoImg.src = t.logoUrl;
            } catch { maybeFinish(); }
          } else if (showLogo) {
            ctx.strokeStyle = '#888'; ctx.strokeRect(lx, ly, lw, lh);
            ctx.font = `${Math.max(10, Math.floor(lh * 0.4))}px Arial`;
            ctx.fillStyle = '#000'; ctx.textAlign = 'center';
            ctx.fillText('LOGO', lx + lw / 2, ly + lh / 2 + Math.floor(lh * 0.15));
            maybeFinish();
          } else {
            maybeFinish();
          }
        };
        img.src = qrUrl;
      }
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.generateQrFailed'));
    }
  };

  // Drukowanie etykiety QR w wybranym rozmiarze przez Print API
  const printQrLabelSized = async (tool, sizeKey) => {
    try {
      const { w, h } = LABEL_SIZES[sizeKey] || LABEL_SIZES['70x40'];
      const codeText = computeToolCodeText(tool);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = `${Math.max(12, Math.floor(h * 0.14))}px Arial`;
      ctx.fillText(tool.name, w / 2, Math.floor(h * 0.16));
      const qrSize = Math.min(Math.floor(w * 0.6), Math.floor(h * 0.62));
      const qrUrl = await generateQRCode(codeText, qrSize);
      if (qrUrl) {
        const img = new Image();
        img.onload = async () => {
          const x = Math.floor((w - qrSize) / 2);
          const y = Math.floor(h * 0.2);
          ctx.drawImage(img, x, y, qrSize, qrSize);
          ctx.font = `${Math.max(10, Math.floor(h * 0.12))}px Arial`;
          ctx.fillText(codeText, w / 2, Math.floor(h * 0.92));
          const showLogo = (qrTemplateConfig?.options?.logoVisible ?? true);
          const lx = Math.floor(w * (qrTemplateConfig?.layout?.logo?.x ?? 0.06));
          const ly = Math.floor(h * (qrTemplateConfig?.layout?.logo?.y ?? 0.08));
          const lw = Math.floor(w * (qrTemplateConfig?.layout?.logo?.w ?? 0.1));
          const lh = Math.floor(h * (qrTemplateConfig?.layout?.logo?.h ?? 0.12));
          if (showLogo && isValidHttpUrl(qrTemplateConfig?.logoUrl)) {
            try {
              const logoImg = new Image();
              logoImg.crossOrigin = 'anonymous';
              logoImg.onload = async () => {
                ctx.drawImage(logoImg, lx, ly, lw, lh);
                const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
                await api.post('/api/print', {
                  protocol: qrPrintConfig.protocol || 'ipp',
                  printerUrl: qrPrintConfig.url,
                  contentType: 'image/png',
                  dataBase64: base64,
                  copies: Number(qrPrintConfig.copies || 1),
                  jobName: `QR-${codeText}-${sizeKey}`
                });
                toast.success(t('labelsManager.print.sentQr'));
              };
              logoImg.onerror = async () => {
                ctx.strokeStyle = '#888';
                ctx.strokeRect(lx, ly, lw, lh);
                ctx.font = `${Math.max(10, Math.floor(lh * 0.4))}px Arial`;
                ctx.fillStyle = '#000';
                ctx.textAlign = 'center';
                ctx.fillText('LOGO', lx + lw / 2, ly + lh / 2 + Math.floor(lh * 0.15));
                const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
                await api.post('/api/print', {
                  protocol: qrPrintConfig.protocol || 'ipp',
                  printerUrl: qrPrintConfig.url,
                  contentType: 'image/png',
                  dataBase64: base64,
                  copies: Number(qrPrintConfig.copies || 1),
                  jobName: `QR-${codeText}-${sizeKey}`
                });
                toast.success(t('labelsManager.print.sentQr'));
              };
              logoImg.src = qrTemplateConfig.logoUrl;
            } catch {
              const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
              await api.post('/api/print', {
                protocol: qrPrintConfig.protocol || 'ipp',
                printerUrl: qrPrintConfig.url,
                contentType: 'image/png',
                dataBase64: base64,
                copies: Number(qrPrintConfig.copies || 1),
                jobName: `QR-${codeText}-${sizeKey}`
              });
              toast.success(t('labelsManager.print.sentQr'));
            }
          } else {
            const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
            await api.post('/api/print', {
              protocol: qrPrintConfig.protocol || 'ipp',
              printerUrl: qrPrintConfig.url,
              contentType: 'image/png',
              dataBase64: base64,
              copies: Number(qrPrintConfig.copies || 1),
              jobName: `QR-${codeText}-${sizeKey}`
            });
            toast.success(t('labelsManager.print.sentQr'));
          }
        };
        img.src = qrUrl;
      }
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.printQrFailed'));
    }
  };

  // Pobieranie etykiety kodu kreskowego w wybranym rozmiarze
  const downloadBarcodeLabelSized = async (tool, sizeKey) => {
    try {
      const { w, h } = LABEL_SIZES[sizeKey] || LABEL_SIZES['70x40'];
      const [mmW] = (sizeKey || '70x40').split('x').map(n => Number(n));
      const PREVIEW_PX_PER_MM = 8;
      const previewW = Math.floor(mmW * PREVIEW_PX_PER_MM);
      const scale = w / previewW;
      const codeText = computeToolCodeText(tool);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // tło
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const t = barcodeTemplateConfig;
      // nagłówek wg layoutu
      ctx.fillStyle = '#000000';
      ctx.textAlign = t?.layout?.title?.align || 'center';
      ctx.font = `bold ${Math.floor((t?.layout?.title?.fontSize || 26) * scale)}px Arial`;
      const tx = Math.floor((t?.layout?.title?.x ?? 0.5) * w);
      const ty = Math.floor((t?.layout?.title?.y ?? 0.13) * h);
      ctx.fillText(tool.name, tx, ty);
      // podtytuł (SKU)
      ctx.textAlign = t?.layout?.subtitle?.align || 'center';
      ctx.font = `${Math.floor((t?.layout?.subtitle?.fontSize || 18) * scale)}px Arial`;
      const skuLabel = t?.translations?.[t?.language || 'pl']?.sku || 'SKU';
      const sx = Math.floor((t?.layout?.subtitle?.x ?? 0.5) * w);
      const sy = Math.floor((t?.layout?.subtitle?.y ?? 0.23) * h);
      ctx.fillText(`${skuLabel}: ${tool.sku || tool.inventory_number}`, sx, sy);
      // Kod kreskowy wg layoutu
      const bcL = t?.layout?.barcode || { x: 0.55, y: 0.33, w: 0.42, h: 0.36 };
      const targetWAreaPx = Math.max(32, Math.floor(bcL.w * w));
      const barsHeightPx = Math.max(24, Math.floor(bcL.h * h));
      const valueFontRatio = (t?.options?.barcodeValueFontRatio ?? 0.12);
      const barWidth = Math.max(1, Math.floor(targetWAreaPx / 150));
      const barcodeCanvas = document.createElement('canvas');
      try {
        JsBarcode(barcodeCanvas, codeText, {
          format: 'CODE128',
          displayValue: t?.options?.barcodeShowValue !== false,
          margin: 0,
          background: 'transparent',
          lineColor: '#1f2937',
          height: barsHeightPx,
          width: barWidth,
          textMargin: 2,
          fontSize: Math.max(8, Math.round(barsHeightPx * valueFontRatio)),
          font: 'Arial',
          fontOptions: 'bold'
        });
      } catch { void 0; }
      const img = new Image();
      img.onload = () => {
        const canvasW = barcodeCanvas.width;
        const canvasH = barcodeCanvas.height;
        const targetW = Math.min(targetWAreaPx, canvasW);
        const x = Math.floor(bcL.x * w + (targetWAreaPx - targetW) / 2);
        const y = Math.floor(bcL.y * h);
        ctx.drawImage(img, x, y, targetW, canvasH);
        // Info
        ctx.textAlign = t?.layout?.info?.align || 'center';
        ctx.font = `${Math.floor((t?.layout?.info?.fontSize || 14) * scale)}px Arial`;
        const scanInfo = t?.translations?.[t?.language || 'pl']?.scanInfo || 'Zeskanuj kod aby sprawdzić status';
        const ix = Math.floor((t?.layout?.info?.x ?? 0.5) * w);
        const iy = Math.floor((t?.layout?.info?.y ?? 0.93) * h);
        ctx.fillText(scanInfo, ix, iy);
        const maybeFinish = () => {
          const link = document.createElement('a');
          link.download = `etykieta-barcode-${codeText}-${sizeKey}.png`;
          link.href = canvas.toDataURL('image/png', 1.0);
          link.click();
        };
        const showLogo = (t?.options?.logoVisible ?? true);
        const lx = Math.floor(w * (t?.layout?.logo?.x ?? 0.06));
        const ly = Math.floor(h * (t?.layout?.logo?.y ?? 0.08));
        const lw = Math.floor(w * (t?.layout?.logo?.w ?? 0.1));
        const lh = Math.floor(h * (t?.layout?.logo?.h ?? 0.12));
        if (showLogo && isValidHttpUrl(t?.logoUrl)) {
          try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            logoImg.onload = () => { ctx.drawImage(logoImg, lx, ly, lw, lh); maybeFinish(); };
            logoImg.onerror = () => {
              ctx.strokeStyle = '#888'; ctx.strokeRect(lx, ly, lw, lh);
              ctx.font = `${Math.max(10, Math.floor(lh * 0.4))}px Arial`;
              ctx.fillStyle = '#000'; ctx.textAlign = 'center';
              ctx.fillText('LOGO', lx + lw / 2, ly + lh / 2 + Math.floor(lh * 0.15));
              maybeFinish();
            };
            logoImg.src = t.logoUrl;
          } catch { maybeFinish(); }
        } else if (showLogo) {
          ctx.strokeStyle = '#888'; ctx.strokeRect(lx, ly, lw, lh);
          ctx.font = `${Math.max(10, Math.floor(lh * 0.4))}px Arial`;
          ctx.fillStyle = '#000'; ctx.textAlign = 'center';
          ctx.fillText('LOGO', lx + lw / 2, ly + lh / 2 + Math.floor(lh * 0.15));
          maybeFinish();
        } else {
          maybeFinish();
        }
      };
      img.src = barcodeCanvas.toDataURL('image/png', 1.0);
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.generateBarcodeFailed'));
    }
  };

  // Drukowanie etykiety kodu kreskowego przez Print API
  const printBarcodeLabelSized = async (tool, sizeKey) => {
    try {
      const { w, h } = LABEL_SIZES[sizeKey] || LABEL_SIZES['70x40'];
      const codeText = computeToolCodeText(tool);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = `${Math.max(12, Math.floor(h * 0.14))}px Arial`;
      ctx.fillText(tool.name, w / 2, Math.floor(h * 0.16));
      const barcodeCanvas = document.createElement('canvas');
      const barWidth = w >= 1000 ? 3 : w >= 800 ? 3 : w >= 600 ? 2 : 2;
      const barHeight = Math.floor(h * 0.5);
      const valueFontRatio = (barcodeTemplateConfig?.options?.barcodeValueFontRatio ?? templateConfig?.options?.barcodeValueFontRatio ?? 0.12);
      JsBarcode(barcodeCanvas, codeText, {
        format: 'CODE128',
        width: barWidth,
        height: barHeight,
        fontSize: Math.max(8, Math.floor(h * valueFontRatio)),
        margin: 0,
        font: 'Arial',
        fontOptions: 'bold'
      });
      const img = new Image();
      img.onload = async () => {
        const targetW = Math.min(w - 20, barcodeCanvas.width);
        const x = Math.floor((w - targetW) / 2);
        const y = Math.floor(h * 0.22);
        ctx.drawImage(img, x, y, targetW, barHeight + 40);
        const showLogo = (barcodeTemplateConfig?.options?.logoVisible ?? true);
        const lx = Math.floor(w * (barcodeTemplateConfig?.layout?.logo?.x ?? 0.06));
        const ly = Math.floor(h * (barcodeTemplateConfig?.layout?.logo?.y ?? 0.08));
        const lw = Math.floor(w * (barcodeTemplateConfig?.layout?.logo?.w ?? 0.1));
        const lh = Math.floor(h * (barcodeTemplateConfig?.layout?.logo?.h ?? 0.12));
        if (showLogo && isValidHttpUrl(barcodeTemplateConfig?.logoUrl)) {
          try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            logoImg.onload = async () => {
              ctx.drawImage(logoImg, lx, ly, lw, lh);
              const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
              await api.post('/api/print', {
                protocol: barcodePrintConfig.protocol || 'ipp',
                printerUrl: barcodePrintConfig.url,
                contentType: 'image/png',
                dataBase64: base64,
                copies: Number(barcodePrintConfig.copies || 1),
                jobName: `BAR-${codeText}-${sizeKey}`
              });
              toast.success(t('labelsManager.print.sentBarcode'));
            };
            logoImg.onerror = async () => {
              ctx.strokeStyle = '#888';
              ctx.strokeRect(lx, ly, lw, lh);
              ctx.font = `${Math.max(10, Math.floor(lh * 0.4))}px Arial`;
              ctx.fillStyle = '#000';
              ctx.textAlign = 'center';
              ctx.fillText('LOGO', lx + lw / 2, ly + lh / 2 + Math.floor(lh * 0.15));
              const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
              await api.post('/api/print', {
                protocol: barcodePrintConfig.protocol || 'ipp',
                printerUrl: barcodePrintConfig.url,
                contentType: 'image/png',
                dataBase64: base64,
                copies: Number(barcodePrintConfig.copies || 1),
                jobName: `BAR-${codeText}-${sizeKey}`
              });
              toast.success(t('labelsManager.print.sentBarcode'));
            };
            logoImg.src = barcodeTemplateConfig.logoUrl;
          } catch {
            const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
            await api.post('/api/print', {
              protocol: barcodePrintConfig.protocol || 'ipp',
              printerUrl: barcodePrintConfig.url,
              contentType: 'image/png',
              dataBase64: base64,
              copies: Number(barcodePrintConfig.copies || 1),
              jobName: `BAR-${codeText}-${sizeKey}`
            });
            toast.success(t('labelsManager.print.sentBarcode'));
          }
        } else {
          const base64 = canvas.toDataURL('image/png', 1.0).split(',')[1];
          await api.post('/api/print', {
            protocol: barcodePrintConfig.protocol || 'ipp',
            printerUrl: barcodePrintConfig.url,
            contentType: 'image/png',
            dataBase64: base64,
            copies: Number(barcodePrintConfig.copies || 1),
            jobName: `BAR-${codeText}-${sizeKey}`
          });
          toast.success(t('labelsManager.print.sentBarcode'));
        }
      };
      img.src = barcodeCanvas.toDataURL('image/png', 1.0);
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.printBarcodeFailed'));
    }
  };

  // Download label function for a single tool
  const _downloadSingleLabel = async (tool) => {
    try {
      const codeText = computeToolCodeText(tool);
      const name = tool.name || [tool.manufacturer, tool.model].filter(Boolean).join(' ') || 'Sprzęt BHP';
      const sku = tool.sku || tool.inventory_number || '';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Increase canvas size for better print quality (4x scale)
      const scale = 4;
      canvas.width = 400 * scale;
      canvas.height = 300 * scale;
      
      // Enable anti-aliasing and image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.textRenderingOptimization = 'optimizeQuality';
      
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Tool name wg szablonu
      ctx.fillStyle = '#000000';
      const titleFont = (templateConfig?.layout?.title?.fontSize || 26) * scale;
      ctx.font = `bold ${titleFont}px Arial`;
      ctx.textAlign = templateConfig?.layout?.title?.align || 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      const tx = (templateConfig?.layout?.title?.x || 0.5) * canvas.width;
      const ty = (templateConfig?.layout?.title?.y || 0.13) * canvas.height;
      ctx.fillText(name, tx, ty);
      
      // SKU wg szablonu
      const subFont = (templateConfig?.layout?.subtitle?.fontSize || 18) * scale;
      ctx.font = `${subFont}px Arial`;
      ctx.shadowColor = 'transparent';
      const skuLabel = templateConfig?.translations?.[templateConfig?.language || 'pl']?.sku || 'SKU';
      const sTx = (templateConfig?.layout?.subtitle?.x || 0.5) * canvas.width;
      const sTy = (templateConfig?.layout?.subtitle?.y || 0.23) * canvas.height;
      ctx.fillText(`${skuLabel}: ${sku}`, sTx, sTy);
      
      // Generate and draw QR code
      const qrCodeUrl = await generateQRCode(codeText, 400);
      if (qrCodeUrl) {
        const qrImg = new Image();
        qrImg.onload = () => {
          const qrL = templateConfig?.layout?.qr || { x: 0.125, y: 0.33, w: 0.4, h: 0.53 };
          ctx.drawImage(qrImg, qrL.x * canvas.width, qrL.y * canvas.height, qrL.w * canvas.width, qrL.h * canvas.height);
          
          // Generate and draw barcode
          const barcodeUrl = generateBarcode(codeText);
          if (barcodeUrl) {
            const barcodeImg = new Image();
            barcodeImg.onload = () => {
              const bcL = templateConfig?.layout?.barcode || { x: 0.55, y: 0.33, w: 0.42, h: 0.36 };
              ctx.drawImage(barcodeImg, bcL.x * canvas.width, bcL.y * canvas.height, bcL.w * canvas.width, bcL.h * canvas.height);
              
              // Tekst informacyjny wg szablonu
              const infoFont = (templateConfig?.layout?.info?.fontSize || 14) * scale;
              ctx.font = `${infoFont}px Arial`;
              ctx.textAlign = templateConfig?.layout?.info?.align || 'center';
              const infoText = templateConfig?.translations?.[templateConfig?.language || 'pl']?.scanInfo || 'Zeskanuj kod aby sprawdzić status';
              const iTx = (templateConfig?.layout?.info?.x || 0.5) * canvas.width;
              const iTy = (templateConfig?.layout?.info?.y || 0.93) * canvas.height;
              ctx.fillText(infoText, iTx, iTy);
              
              // Logo (opcjonalnie wg opcji) + fallback placeholder
              const lg = templateConfig?.layout?.logo || { x: 0.06, y: 0.08, w: 0.1, h: 0.12 };
              const showLogo = (templateConfig?.options?.logoVisible ?? true);
              if (showLogo && isValidHttpUrl(templateConfig?.logoUrl)) {
                const logoImg = new Image();
                logoImg.crossOrigin = 'anonymous';
                logoImg.onload = () => {
                  ctx.drawImage(logoImg, lg.x * canvas.width, lg.y * canvas.height, lg.w * canvas.width, lg.h * canvas.height);
                  const link = document.createElement('a');
                  link.download = `etykieta-${codeText}.png`;
                  link.href = canvas.toDataURL('image/png', 1.0);
                  link.click();
                };
                logoImg.onerror = () => {
                  // Fallback: placeholder LOGO
                  ctx.strokeStyle = '#888';
                  ctx.strokeRect(lg.x * canvas.width, lg.y * canvas.height, lg.w * canvas.width, lg.h * canvas.height);
                  ctx.font = `${Math.max(10, Math.floor((lg.h * canvas.height) * 0.4))}px Arial`;
                  ctx.fillStyle = '#000';
                  ctx.textAlign = 'center';
                  ctx.fillText('LOGO', (lg.x + lg.w / 2) * canvas.width, (lg.y + lg.h / 2) * canvas.height + Math.floor((lg.h * canvas.height) * 0.15));
                  const link = document.createElement('a');
                  link.download = `etykieta-${codeText}.png`;
                  link.href = canvas.toDataURL('image/png', 1.0);
                  link.click();
                };
                logoImg.src = templateConfig.logoUrl;
              } else if (showLogo) {
                // Fallback: placeholder LOGO przy niepoprawnym URL
                ctx.strokeStyle = '#888';
                ctx.strokeRect(lg.x * canvas.width, lg.y * canvas.height, lg.w * canvas.width, lg.h * canvas.height);
                ctx.font = `${Math.max(10, Math.floor((lg.h * canvas.height) * 0.4))}px Arial`;
                ctx.fillStyle = '#000';
                ctx.textAlign = 'center';
                ctx.fillText('LOGO', (lg.x + lg.w / 2) * canvas.width, (lg.y + lg.h / 2) * canvas.height + Math.floor((lg.h * canvas.height) * 0.15));
                const link = document.createElement('a');
                link.download = `etykieta-${codeText}.png`;
                link.href = canvas.toDataURL('image/png', 1.0);
                link.click();
              } else {
                const link = document.createElement('a');
                link.download = `etykieta-${codeText}.png`;
                link.href = canvas.toDataURL('image/png', 1.0);
                link.click();
              }
            };
            barcodeImg.src = barcodeUrl;
          }
        };
        qrImg.src = qrCodeUrl;
      }
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.generateFailed'));
    }
  };

  const downloadSelectedLabels = async () => {
    const isBhp = currentTab === 'bhp';
    const sourceData = isBhp ? bhpData : toolsData;
    const selectedIds = isBhp ? selectedBhp : selectedTools;

    if (selectedIds.length === 0) return;

    const selectedToolsData = sourceData.filter(tool => selectedIds.includes(tool.id));
    
    // Show progress indicator
    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      text-align: center;
    `;
    progressDiv.innerHTML = `
      <div>${t('labelsManager.progress.generating')}</div>
      <div style="margin-top: 10px;">
        <div style="width: 200px; height: 4px; background: #e5e7eb; border-radius: 2px;">
          <div id="progress-bar" style="width: 0%; height: 100%; background: #3b82f6; border-radius: 2px; transition: width 0.3s;"></div>
        </div>
      </div>
      <div id="progress-text" style="margin-top: 10px; font-size: 14px; color: #6b7280;">0 / ${selectedToolsData.length}</div>
    `;
    document.body.appendChild(progressDiv);

    try {
      for (let i = 0; i < selectedToolsData.length; i++) {
        const tool = selectedToolsData[i];
        
        // Update progress
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        if (progressBar && progressText) {
          const progress = ((i + 1) / selectedToolsData.length) * 100;
          progressBar.style.width = `${progress}%`;
          progressText.textContent = `${i + 1} / ${selectedToolsData.length}`;
        }

        if (printMode === 'qr') {
          await downloadQrLabelSized(tool, qrTemplateConfig.sizeKey || '70x40');
        } else {
          await downloadBarcodeLabelSized(tool, barcodeTemplateConfig.sizeKey || '70x40');
        }
        
        // Small delay between downloads to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      toast.error(error?.message || t('labelsManager.errors.downloadSelectedFailed'));
    } finally {
      // Remove progress indicator
      document.body.removeChild(progressDiv);
    }
  };

  // Jeśli brak uprawnienia, pokaż czytelny komunikat i nie renderuj reszty UI
  if (!hasPermission(user, PERMISSIONS.VIEW_LABELS)) {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('labelsManager.permissions.title')}</h3>
          <p className="text-slate-600 dark:text-slate-400">{t('labelsManager.permissions.viewLabelsDenied')}</p>
        </div>
      </div>
    );
  }

  // Reset konfiguracji szablonu do wartości domyślnych
  const handleResetTemplate = () => {
    setTemplateConfig(DEFAULT_TEMPLATE);
    try {
      localStorage.setItem('labelTemplateConfig', JSON.stringify(DEFAULT_TEMPLATE));
      window.dispatchEvent(new Event('labelTemplateConfigUpdated'));
    } catch { void 0; }
  };

  // Funkcja drukowania bezpośrednio z przeglądarki na drukarce systemowej (Brother P-touch)
  const handlePrintBrother = async (explicitTools = null, forcedMode = null) => {
    const isBhp = currentTab === 'bhp';
    const sourceData = isBhp ? bhpData : toolsData;
    const selectedIds = isBhp ? selectedBhp : selectedTools;
    const effectivePrintMode = forcedMode || printMode;
    const driverLabelLengthMm = Math.max(15, Math.min(200, Number(templateConfig?.options?.driverLabelLengthMm ?? 85) || 85));
    const showCategoryOnLabel = (templateConfig?.options?.showCategory ?? true);
    const showLogoOnLabel = (templateConfig?.options?.logoVisible ?? true) && isValidHttpUrl(templateConfig?.logoUrl);
    const logoWidthMm = Math.max(6, Math.min(60, Number(templateConfig?.options?.logoWidthMm ?? 14) || 14));
    const nameFontPx = Math.max(8, Math.min(40, Number(templateConfig?.options?.nameFontPx ?? 18) || 18));
    const skuFontPx = Math.max(8, Math.min(32, Number(templateConfig?.options?.skuFontPx ?? 12) || 12));
    
    // If explicitTools is passed but it's an event (from onClick), treat it as null
    let toolsToPrint = explicitTools;
    if (toolsToPrint && !Array.isArray(toolsToPrint)) {
        toolsToPrint = null;
    }

    let selected = toolsToPrint;
    if (!selected) {
      const base = sourceData.filter(t => selectedIds.includes(t.id));
      if (isBhp) {
        selected = base;
      } else {
        const synthetic = [];
        for (const key of (selectedSubitems || [])) {
          const parts = String(key || '').split(':');
          if (parts.length < 4) continue;
          const kind = parts[1];
          const toolId = parts[2];
          const itemId = parts[3];
          const parent = (toolsData || []).find(t => String(t.id) === String(toolId));
          const bucket = subitemsByToolId?.[toolId];
          const items = Array.isArray(bucket?.items) ? bucket.items : [];
          const item = items.find(it => String(it?.id) === String(itemId));
          if (!parent || !item) continue;
          synthetic.push(buildSyntheticToolForSubitem(parent, kind, item));
        }
        selected = [...base, ...synthetic];
      }
    }
    if (selected.length === 0) {
      toast.info(t('labelsManager.errors.noToolsSelected') || 'Nie wybrano elementów');
      return;
    }

    // Tworzymy ukryty iframe do druku
    const iframeId = 'print-brother-iframe';
    let iframe = document.getElementById(iframeId);
    if (iframe) document.body.removeChild(iframe);
    
    iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    const labelsDataPromises = selected.map(async (tool) => {
        const codeText = computeToolCodeText(tool);
        const name = isBhp ? ([tool.manufacturer, tool.model].filter(Boolean).join(' ') || 'Sprzęt BHP') : tool.name;
        const categoryText = String(tool?.category || '').trim();
        const subLine = (tool && typeof tool.subitem_print_line === 'string') ? String(tool.subitem_print_line).trim() : '';
        const subLineHtml = subLine ? `<div class="tool-subline-qr">${subLine}</div>` : '';
        
        // Check if it's a sling sub-item (synthetic tool with empty name)
        // In this case, we use serial_number for the "index:" display text, 
        // but keep codeText (SKU) for the QR code.
        const isSlingSubItem = !name && tool.serial_number;
        const fallbackIndexText = isSlingSubItem ? tool.serial_number : codeText;
        const indexPrefix = (tool && typeof tool.index_prefix === 'string') ? tool.index_prefix : 'SKU:';
        const indexText = (tool && typeof tool.index_text === 'string') ? tool.index_text : fallbackIndexText;
        const indexLine = indexPrefix ? `${indexPrefix}${indexText ? ` ${indexText}` : ''}` : (indexText || '');

        let imgDataUrl = '';
        let labelWidthMm = 70;
        let htmlContent = '';

        if (effectivePrintMode === 'qr') {
            imgDataUrl = await generateQRCode(codeText, 320, 0);
            
            // Calculate width for QR layout
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            // Use 13px (approx 10pt) to match CSS .tool-name-qr
            ctx.font = "bold 13px Arial";
            const pxToMm = 0.264583;

            // Measure Name (10pt bold ~ 13px)
            ctx.font = "bold 13px Arial";
            const nameMetrics = ctx.measureText(name);
            const textWidthMm = nameMetrics.width * pxToMm * 0.95;
            
            // Measure Code/Index (8pt normal ~ 11px)
            ctx.font = "normal 13px Arial";
            const fullText = indexLine;
            const fullMetrics = ctx.measureText(fullText);
            const fullTextWidthMm = fullMetrics.width * pxToMm * 0.95;
            
            const codeMetrics = ctx.measureText(indexText || '');
            const codeTextWidthMm = codeMetrics.width * pxToMm * 0.95;
            
            // QR is roughly square, restricted by height (approx 20mm in 24mm tape with padding)
            const qrWidthMm = 20; 
            const gapMm = 2;
            const leftPaddingMm = 2; // Matches CSS .qr-layout padding-left
            const rightPaddingMm = 1; // Minimal safety margin
            
            let effectiveTextWidth = Math.max(textWidthMm, codeTextWidthMm);
            
            // Special handling: if name is empty (slings), we use the full text width (index: code)
            // because it is displayed on one line
            if (!name) {
                effectiveTextWidth = fullTextWidthMm;
            }

            // Limit max width for very long names (increased to 150mm to allow longer labels if needed)
            if (effectiveTextWidth > 150) {
                 effectiveTextWidth = 150; 
            }

            // For side-by-side layout: PaddingLeft + QR + Gap + Text + PaddingRight
            const contentWidthMm = leftPaddingMm + qrWidthMm + gapMm + effectiveTextWidth + rightPaddingMm;
            // Round up to nearest mm, no extra buffer to keep it tight
            labelWidthMm = Math.ceil(contentWidthMm);
            labelWidthMm = driverLabelLengthMm;
            console.log(`[BrotherPrint] Label for "${name}": Width=${labelWidthMm}mm (Content=${contentWidthMm.toFixed(2)}mm, Text=${effectiveTextWidth.toFixed(2)}mm)`);

            const logoHtml = showLogoOnLabel ? `
                <div class="qr-logo" style="width: ${logoWidthMm}mm;">
                    <img src="${templateConfig.logoUrl}" />
                </div>
            ` : '';

            const categoryHtml = (showCategoryOnLabel && categoryText) ? `
                <div class="category-badge">Kategoria: ${categoryText}</div>
            ` : '';

             htmlContent = `
                <div class="qr-layout" style="width: ${labelWidthMm}mm;">
                    <div class="qr-code">
                        <img src="${imgDataUrl}" />
                    </div>
                    <div class="qr-divider"></div>
                    <div class="qr-right">
                        <div class="tool-name-qr">${name}</div>
                        ${subLineHtml}
                        <div class="code-text-qr">${indexLine}</div>
                        ${categoryHtml}
                    </div>
                    ${showLogoOnLabel ? '<div class="qr-divider"></div>' : ''}
                    ${logoHtml}
                </div>
            `;

        } else {
            const canvas = document.createElement('canvas');
            try {
                JsBarcode(canvas, codeText, {
                    format: 'CODE128',
                    displayValue: false, // Hide default text to render it manually with better control
                    margin: 0,
                    height: 90,
                    width: 3,
                    fontSize: 14,
                    textMargin: 0
                });
            } catch (e) { console.error(e); }
            
            // Calculate dynamic width based on content width
            // 96 DPI -> 1px = 0.264583 mm
            const pxToMm = 0.264583;
            const barcodeWidthMm = canvas.width * pxToMm;
            
            // Measure text width approximately
            const ctx = canvas.getContext('2d');
            ctx.font = "bold 12px Arial"; // Reduced font size for calculation
            const nameMetrics = ctx.measureText(name);
            const codeMetrics = ctx.measureText(codeText);
            
            const textWidthMm = nameMetrics.width * pxToMm;
            const codeTextWidthMm = codeMetrics.width * pxToMm;

            // Logic to save tape: allow text wrapping for long names
            // If text is significantly wider than barcode, assume it wraps to 2 lines
            let effectiveTextWidth = textWidthMm;
            if (textWidthMm > barcodeWidthMm && textWidthMm > 25) { // Threshold for wrapping
                 // Estimate wrapped width (60% of total length to be safe for word breaks)
                 effectiveTextWidth = textWidthMm * 0.6; 
            }
            
            // Use the larger of text or barcode width, plus minimal padding
            const contentWidthMm = Math.max(barcodeWidthMm, effectiveTextWidth, codeTextWidthMm - 100);
            
            // Add padding to prevent horizontal cutting and ensure separation (4mm each side -> +8mm total)
            labelWidthMm = Math.max(15, Math.ceil(contentWidthMm));
            labelWidthMm = driverLabelLengthMm;
            imgDataUrl = canvas.toDataURL('image/png');

            const logoHtml = showLogoOnLabel ? `
                <div class="barcode-logo" style="width: ${logoWidthMm}mm;">
                  <img src="${templateConfig.logoUrl}" />
                </div>
            ` : '';
            htmlContent = `
                <div class="label-container" style="width: ${labelWidthMm}mm;">
                    <div class="label-content">
                        <div class="barcode-header">
                          <div class="tool-name">${name}</div>
                        </div>
                        <div class="barcode-row">
                          <div class="barcode-left">
                            <div class="barcode-wrapper">
                              <img src="${imgDataUrl}" />
                            </div>
                            <div class="code-text">${codeText}</div>
                          </div>
                          ${logoHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        return { html: htmlContent, width: labelWidthMm };
    });

    const labelsData = await Promise.all(labelsDataPromises);
    const labelsHtml = labelsData.map(d => d.html);
    
    const pageCss = `size: ${driverLabelLengthMm}mm 24mm;`;
    const bodyCss = `width: ${driverLabelLengthMm}mm; height: 24mm; overflow: hidden; margin: 0; padding: 0;`;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Brother Labels</title>
          <style>
            @media print {
                @page {
                    ${pageCss}
                    margin: 0mm;
                }
                html, body {
                    margin: 0;
                    padding: 0;
                    ${bodyCss}
                }
                .label-container, .qr-layout {
                    page-break-after: always;
                    break-after: page;
                }
            }
            
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                ${bodyCss}
            }

            .label-container {
                /* width set via inline style per label */
                height: 24mm; /* Tape width */
                padding-top: 2mm;
                padding-bottom: 1mm;
                padding-left: 2mm;
                padding-right: 2mm;
                box-sizing: border-box;
                text-align: left;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                justify-content: flex-start;
                overflow: hidden;
                margin: 0; /* Remove auto margin to align left */
            }

            .label-content {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                gap: 0.6mm;
            }

            .barcode-header {
                flex: 1 1 auto;
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                min-height: 5mm;
            }

            .barcode-row {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 1.2mm;
            }

            .barcode-left {
                flex: 1 1 auto;
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                gap: 0.3mm;
            }

            .barcode-logo {
                flex: 0 0 auto;
                height: 11mm;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .barcode-logo img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                display: block;
            }

            .tool-name {
                font-size: ${nameFontPx}px;
                font-weight: bold;
                line-height: 1.05;
                max-height: 10mm;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow-wrap: anywhere;
                word-break: break-word;
            }

            .barcode-wrapper {
                flex: 1 1 auto;
                height: 11mm;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                overflow: hidden;
                min-height: 0;
                padding: 0;
            }

            .barcode-wrapper img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                width: 100%;
                height: 100%;
            }
            
            .code-text {
                font-size: ${skuFontPx}px;
                font-weight: bold;
                line-height: 1;
                white-space: nowrap;
                width: 100%;
                text-align: center;
            }

            .qr-layout {
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: flex-start;
                text-align: left;
                padding-top: 1mm;
                padding-bottom: 1mm;
                padding-left: 2mm;
                padding-right: 2mm;
                gap: 2mm;
                height: 24mm;
                box-sizing: border-box;
                margin-right: auto;
            }
            .qr-logo {
                height: 22mm;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .qr-logo img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                width: 100%;
                height: 100%;
                display: block;
            }
            .qr-divider {
                width: 0.4mm;
                height: 20mm;
                background: #cbd5e1;
                flex-shrink: 0;
            }
            .qr-code {
                width: 21mm;
                height: 21mm;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .qr-code img {
                width: 100%;
                height: 100%;
                max-width: 100%;
                max-height: 100%;
                display: block;
            }
            .qr-right {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                overflow: hidden;
                min-width: 0;
            }
            .tool-name-qr {
                font-size: ${nameFontPx}px;
                font-weight: bold;
                margin-bottom: 1mm;
                line-height: 1.05;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow-wrap: anywhere;
                word-break: break-word;
                max-width: 100%;
            }
            .tool-subline-qr {
                font-size: ${Math.max(8, nameFontPx - 2)}px;
                font-weight: normal;
                line-height: 1.05;
                margin-bottom: 0.6mm;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: clip;
                max-width: 100%;
            }
            .code-text-qr {
                font-size: ${skuFontPx}px;
                font-weight: normal;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: clip;
            }
            .category-badge {
                display: inline-flex;
                align-items: center;
                width: fit-content;
                margin-top: 1mm;
                padding: 0.8mm 1.8mm;
                font-size: ${Math.max(8, skuFontPx - 2)}px;
                color: #1d4ed8;
                background: #eff6ff;
                border: 0.3mm solid #bfdbfe;
                border-radius: 2mm;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 100%;
            }
          </style>
        </head>
        <body>
            ${labelsHtml.join('')}
        </body>
      </html>
    `);
    doc.close();

    // Drukuj
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        // Nie usuwamy iframe od razu, żeby wydruk poszedł
    }, 500);
  };

  const selectedCount = currentTab === 'bhp'
    ? selectedBhp.length
    : (currentTab === 'generator' ? (selectedTools.length + selectedSubitems.length) : selectedTools.length);

  return (
    <div className="px-4 lg:px-8 pb-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t('labelsManager.title')}</h1>
          <p className="text-slate-600 dark:text-slate-400">{t('labelsManager.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={handlePrintBrother}
          disabled={selectedCount === 0}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/40 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-blue-300 dark:hover:bg-slate-800 dark:border-blue-400/30"
        >
          <PrinterIcon className="w-5 h-5" />
          Drukuj zaznaczone ({selectedCount})
        </button>
      </div>

      {labelSettingsOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Ustawienia etykiety</div>
              <button
                type="button"
                onClick={() => setLabelSettingsOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200"
                title="Zamknij"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">URL logo</div>
                <input
                  value={templateConfig.logoUrl || ''}
                  onChange={(e) => setTemplateConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="https://..."
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-900/30 text-slate-900 dark:text-slate-100 ${(!templateConfig.logoUrl || isValidHttpUrl(templateConfig.logoUrl)) ? 'border-slate-200 dark:border-slate-600' : 'border-red-500 dark:border-red-400'}`}
                />
                {templateConfig.logoUrl && !isValidHttpUrl(templateConfig.logoUrl) ? (
                  <div className="mt-1 text-xs text-red-600 dark:text-red-400">Nieprawidłowy URL (wymagany http/https)</div>
                ) : null}
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Szerokość logo (mm)</div>
                <input
                  type="number"
                  min={6}
                  max={60}
                  value={Number(templateConfig.options?.logoWidthMm ?? 14)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setTemplateConfig(prev => ({ ...prev, options: { ...(prev.options || {}), logoWidthMm: v } }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Długość etykiety w sterowniku (mm)</div>
                <input
                  type="number"
                  min={15}
                  max={200}
                  value={Number(templateConfig.options?.driverLabelLengthMm ?? 85)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setTemplateConfig(prev => ({ ...prev, options: { ...(prev.options || {}), driverLabelLengthMm: v } }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                {(templateConfig.options?.logoVisible ?? true) ? (
                  <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                    Sugerowana długość dla logo: {suggestedDriverLabelLengthMm}mm
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={templateConfig.options?.showCategory ?? true}
                    onChange={(e) => setTemplateConfig(prev => ({ ...prev, options: { ...(prev.options || {}), showCategory: e.target.checked } }))}
                    className="w-4 h-4 accent-blue-600 dark:accent-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Pokazuj “Kategoria:” w podglądzie etykiety</span>
                </label>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Rozmiar tekstu: Nazwa (px)</div>
                <input
                  type="number"
                  min={8}
                  max={40}
                  value={Number(templateConfig.options?.nameFontPx ?? 18)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setTemplateConfig(prev => ({ ...prev, options: { ...(prev.options || {}), nameFontPx: v } }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Rozmiar tekstu: SKU (px)</div>
                <input
                  type="number"
                  min={8}
                  max={32}
                  value={Number(templateConfig.options?.skuFontPx ?? 12)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setTemplateConfig(prev => ({ ...prev, options: { ...(prev.options || {}), skuFontPx: v } }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setTemplateConfig(prev => ({
                  ...prev,
                  options: {
                    ...(prev.options || {}),
                    logoWidthMm: DEFAULT_TEMPLATE.options.logoWidthMm,
                    driverLabelLengthMm: DEFAULT_TEMPLATE.options.driverLabelLengthMm,
                    showCategory: DEFAULT_TEMPLATE.options.showCategory,
                    nameFontPx: DEFAULT_TEMPLATE.options.nameFontPx,
                    skuFontPx: DEFAULT_TEMPLATE.options.skuFontPx
                  },
                  logoUrl: DEFAULT_TEMPLATE.logoUrl
                }))}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Przywróć domyślne
              </button>
              <button
                type="button"
                onClick={() => setLabelSettingsOpen(false)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            className={`px-4 py-3 text-sm font-medium ${currentTab === 'generator' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setCurrentTab('generator')}
          >
            {t('labelsManager.tabs.tools')}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium ${currentTab === 'bhp' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setCurrentTab('bhp')}
          >
            {t('labelsManager.tabs.bhp')}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium ${currentTab === 'editor' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setCurrentTab('editor')}
          >
            {t('labelsManager.tabs.editor')}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium ${currentTab === 'editor_separate' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setCurrentTab('editor_separate')}
          >
            {t('labelsManager.tabs.editorSeparate')}
          </button>
        </div>

        {currentTab === 'generator' ? (
          <div className="p-4 lg:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Opcje etykiet</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-blue-600 dark:accent-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                        checked={templateConfig.options?.logoVisible ?? true}
                        onChange={(e) => {
                          const nextChecked = e.target.checked;
                          const suggested = suggestedDriverLabelLengthMm;
                          setTemplateConfig(prev => {
                            const nextOptions = { ...(prev.options || {}), logoVisible: nextChecked };
                            if (nextChecked) {
                              const currentLen = Math.max(15, Math.min(200, Number(nextOptions.driverLabelLengthMm ?? DEFAULT_TEMPLATE.options?.driverLabelLengthMm ?? 85) || 85));
                              if (currentLen < suggested) nextOptions.driverLabelLengthMm = suggested;
                            }
                            return { ...prev, options: nextOptions };
                          });
                          if (nextChecked) {
                            toast.info(`Włączono logo. Zmień w sterowniku drukarki długość etykiety na sugerowaną: ${suggested}mm`);
                          }
                        }}
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Pokaż logo na etykiecie</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setLabelSettingsOpen(true)}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      title="Ustawienia etykiety"
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {(templateConfig.options?.logoVisible ?? true) ? (
                    <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800/50">
                      Zmień w sterowniku drukarki długość etykiety na sugerowaną: {suggestedDriverLabelLengthMm}mm
                    </div>
                  ) : null}
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Typ kodu do druku/pobrania</div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="printMode_gen"
                          value="qr"
                          checked={printMode === 'qr'}
                          onChange={(e) => setPrintMode(e.target.value)}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">QR Kod</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="printMode_gen"
                          value="barcode"
                          checked={printMode === 'barcode'}
                          onChange={(e) => setPrintMode(e.target.value)}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">Kod kreskowy</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtry</div>
                  <div className="mt-3">
                    <div className="relative">
                      <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={toolsSearch}
                        onChange={(e) => setToolsSearch(e.target.value)}
                        placeholder="Szukaj narzędzia lub SKU..."
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Kategoria</div>
                    <select
                      value={toolsCategory}
                      onChange={(e) => setToolsCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="all">Wszystkie</option>
                      {toolCategoryOptions.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                  {selectedTools.length > 0 ? (
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{selectedTools.length} narzędzi zaznaczonych</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Kliknij “Drukuj zaznaczone”, aby wydrukować etykiety.</div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      <div className="font-medium text-slate-800 dark:text-slate-200">0 narzędzi zaznaczonych</div>
                      <div className="text-xs mt-1">Wybierz narzędzia, aby zobaczyć podgląd etykiety.</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 min-w-0">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Podgląd etykiety</div>
                    <button
                      type="button"
                      onClick={() => setLabelSettingsOpen(true)}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      title="Ustawienia etykiety"
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Podgląd zmienia się w zależności od wybranego typu kodu.</div>
                  <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 p-4">
                    <div className="mx-auto" style={{ width: `${previewLabelWidthPx}px`, maxWidth: '100%' }}>
                      <div
                        className={`bg-white rounded-lg border border-slate-200 px-4 py-3 ${
                          printMode === 'qr' ? 'flex items-center gap-4' : 'flex flex-col gap-3'
                        }`}
                      >
                        {printMode === 'qr' ? (
                          <>
                            <div className="flex items-center justify-center shrink-0" style={{ width: '96px', height: '96px' }}>
                              {previews[previewTool?.id]?.qr ? (
                                <img src={previews[previewTool.id].qr} alt="Podgląd QR" className="w-full h-full object-contain" />
                              ) : (
                                <div className="text-xs text-slate-500">Ładowanie...</div>
                              )}
                            </div>
                            <div className="h-16 w-px bg-slate-200 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div
                                className="font-bold text-slate-900 leading-tight truncate"
                                style={{ fontSize: `${Number(templateConfig.options?.nameFontPx ?? 18) || 18}px` }}
                                title={previewTool?.name || ''}
                              >
                                {previewTool?.name || ''}
                              </div>
                              {previewSubLine ? (
                                <div
                                  className="text-slate-700 mt-1 truncate"
                                  style={{ fontSize: `${Math.max(10, (Number(templateConfig.options?.skuFontPx ?? 12) || 12) - 1)}px` }}
                                  title={previewSubLine}
                                >
                                  {previewSubLine}
                                </div>
                              ) : null}
                              <div
                                className="text-slate-700 mt-1 truncate"
                                style={{ fontSize: `${Number(templateConfig.options?.skuFontPx ?? 12) || 12}px` }}
                                title={`SKU: ${previewTool?.sku || ''}`}
                              >
                                SKU: {previewTool?.sku || ''}
                              </div>
                              {(templateConfig.options?.showCategory ?? true) && previewTool?.category ? (
                                <div className="mt-2 inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-blue-50 text-blue-700 border border-blue-200">
                                  Kategoria: {previewTool.category}
                                </div>
                              ) : null}
                            </div>
                            {(templateConfig.options?.logoVisible ?? true) && isValidHttpUrl(templateConfig.logoUrl) ? (
                              <>
                                <div className="h-16 w-px bg-slate-200 shrink-0" />
                                <div
                                  className="flex items-center justify-center shrink-0"
                                  style={{
                                    width: `${Math.max(28, Math.min(140, Math.round((Number(templateConfig.options?.logoWidthMm ?? 14) || 14) * 2.8)))}px`,
                                    height: '64px'
                                  }}
                                >
                                  <img src={templateConfig.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                </div>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="relative w-full">
                              {(templateConfig.options?.logoVisible ?? true) && isValidHttpUrl(templateConfig.logoUrl) ? (
                                <div
                                  className="absolute right-0 top-0 flex items-center justify-center"
                                  style={{
                                    width: `${Math.max(28, Math.min(140, Math.round((Number(templateConfig.options?.logoWidthMm ?? 14) || 14) * 2.8)))}px`,
                                    height: '64px'
                                  }}
                                >
                                  <img src={templateConfig.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                </div>
                              ) : null}
                              <div className="w-full">
                                <div
                                  className="font-bold text-slate-900 leading-tight text-center truncate"
                                  style={{ fontSize: `${Number(templateConfig.options?.nameFontPx ?? 18) || 18}px` }}
                                  title={previewTool?.name || ''}
                                >
                                  {previewTool?.name || ''}
                                </div>
                              {previewSubLine ? (
                                <div
                                  className="text-slate-700 mt-1 text-center truncate"
                                  style={{ fontSize: `${Math.max(10, (Number(templateConfig.options?.skuFontPx ?? 12) || 12) - 1)}px` }}
                                  title={previewSubLine}
                                >
                                  {previewSubLine}
                                </div>
                              ) : null}
                                {(templateConfig.options?.showCategory ?? true) && previewTool?.category ? (
                                  <div className="mt-2 flex items-center justify-center">
                                    <div className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-blue-50 text-blue-700 border border-blue-200">
                                      Kategoria: {previewTool.category}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="w-full flex items-center justify-center">
                              <div className="w-full">
                                <div className="w-full" style={{ height: '64px' }}>
                                {previews[previewTool?.id]?.barcode ? (
                                  <img
                                    src={previews[previewTool.id].barcode}
                                    alt="Podgląd kodu kreskowego"
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <div className="text-xs text-slate-500">Ładowanie...</div>
                                )}
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lista narzędzi</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{filteredToolsData.length} narzędzi</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAll(!isAllSelected)}
                        className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {isAllSelected ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                      </button>
                      <select
                        value={toolsSort}
                        onChange={(e) => setToolsSort(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-700 dark:text-slate-200"
                      >
                        <option value="name_asc">Sortuj: Nazwa A-Z</option>
                        <option value="name_desc">Sortuj: Nazwa Z-A</option>
                        <option value="sku_asc">Sortuj: SKU A-Z</option>
                        <option value="sku_desc">Sortuj: SKU Z-A</option>
                      </select>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[520px] overflow-auto">
                    {filteredToolsData.map(tool => {
                      const kind = getToolSubitemsKind(tool?.category);
                      const hasSubitems = Boolean(kind);
                      const isExpanded = expandedLabelToolIds.includes(tool.id);
                      const bucket = subitemsByToolId?.[tool.id];
                      const items = Array.isArray(bucket?.items) ? bucket.items : [];
                      const subPrefix = hasSubitems ? `sub:${kind}:${tool.id}:` : '';
                      const subKeys = hasSubitems ? items.map(it => `sub:${kind}:${tool.id}:${it.id}`) : [];
                      const selectedSubCount = hasSubitems
                        ? subKeys.reduce((acc, k) => acc + (selectedSubitemsSet.has(k) ? 1 : 0), 0)
                        : 0;
                      const isSelected = hasSubitems ? (subKeys.length > 0 && selectedSubCount === subKeys.length) : selectedTools.includes(tool.id);
                      const isSubIndeterminate = hasSubitems ? (selectedSubCount > 0 && selectedSubCount < subKeys.length) : false;
                      return (
                        <div key={tool.id}>
                          <div className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              ref={(el) => { if (el) el.indeterminate = isSubIndeterminate; }}
                              onChange={async (e) => {
                                const checked = e.target.checked;
                                if (!hasSubitems) {
                                  setSelectedTools(prev => checked ? Array.from(new Set([...(prev || []), tool.id])) : (prev || []).filter(x => x !== tool.id));
                                  return;
                                }
                                if (!kind) return;
                                if (!checked) {
                                  setSelectedSubitems(prev => (prev || []).filter(k => !String(k).startsWith(subPrefix)));
                                  return;
                                }
                                const { items: loaded } = await ensureSubitemsLoaded(tool);
                                const nextKeys = (loaded || []).map(it => `sub:${kind}:${tool.id}:${it.id}`);
                                setSelectedSubitems(prev => Array.from(new Set([...(prev || []), ...nextKeys])));
                              }}
                              className="w-4 h-4 accent-blue-600 dark:accent-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{tool.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">SKU: {tool.sku}</div>
                            </div>
                            {tool.category ? (
                              <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                                Kategoria: {tool.category}
                              </div>
                            ) : null}
                            {hasSubitems ? (
                              <button
                                type="button"
                                onClick={async () => await toggleExpandLabelTool(tool)}
                                className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                {isExpanded ? 'Zwiń' : 'Rozwiń'}
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setPreviewOverrideTool(null);
                                    setSelectedPreviewToolId(tool.id);
                                    await ensurePreviews(tool);
                                  }}
                                  className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  Podgląd
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setPreviewOverrideTool(null);
                                    setSelectedPreviewToolId(tool.id);
                                    await handlePrintBrother([tool], printMode);
                                  }}
                                  className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-2"
                                >
                                  <PrinterIcon className="w-4 h-4" />
                                  Drukuj etykietę
                                </button>
                              </>
                            )}
                          </div>

                          {hasSubitems && isExpanded ? (
                            <div className="bg-slate-50 dark:bg-slate-900/20 border-t border-slate-200 dark:border-slate-700">
                              {bucket?.loading ? (
                                <div className="px-10 py-3 text-xs text-slate-500 dark:text-slate-400">Ładowanie podpozycji...</div>
                              ) : bucket?.error ? (
                                <div className="px-10 py-3 text-xs text-red-600 dark:text-red-400">{bucket.error}</div>
                              ) : items.length === 0 ? (
                                <div className="px-10 py-3 text-xs text-slate-500 dark:text-slate-400">Brak podpozycji</div>
                              ) : (
                                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                  {items.map(item => {
                                    const subKey = `sub:${kind}:${tool.id}:${item.id}`;
                                    const subChecked = selectedSubitemsSet.has(subKey);
                                    const line = getSubitemDisplayLine(kind, item);
                                    const synthetic = buildSyntheticToolForSubitem(tool, kind, item);
                                    return (
                                      <div key={subKey} className="px-10 py-2 flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={subChecked}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            setSelectedSubitems(prev => checked
                                              ? Array.from(new Set([...(prev || []), subKey]))
                                              : (prev || []).filter(k => k !== subKey)
                                            );
                                          }}
                                          className="w-4 h-4 accent-blue-600 dark:accent-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{line}</div>
                                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">SKU: {item?.sku}</div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            setPreviewOverrideTool(synthetic);
                                            await ensurePreviews(synthetic);
                                          }}
                                          className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/30 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                        >
                                          Podgląd
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            setPreviewOverrideTool(synthetic);
                                            await handlePrintBrother([synthetic], printMode);
                                          }}
                                          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-2"
                                        >
                                          <PrinterIcon className="w-4 h-4" />
                                          Drukuj etykietę
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {filteredToolsData.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Brak narzędzi do wyświetlenia</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : currentTab === 'bhp' ? (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Generator etykiet BHP</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">Generuj i drukuj etykiety dla sprzętu BHP.</p>

            {bhpData.length > 0 && (
              <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={bhpData.length > 0 && selectedBhp.length === bhpData.length}
                    ref={(el) => { if (el) el.indeterminate = selectedBhp.length > 0 && selectedBhp.length < bhpData.length; }}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedBhp(bhpData.map(t => t.id));
                      else setSelectedBhp([]);
                    }}
                    className="w-4 h-4 accent-blue-600 dark:accent-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {selectedBhp.length === bhpData.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {selectedBhp.length} z {bhpData.length} elementów zaznaczonych
                    </p>
                  </div>
                </label>
                {/* Opcja logo wspólna */}
                <label className="mt-3 flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600 dark:accent-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                    checked={templateConfig.options?.logoVisible ?? true}
                    onChange={(e) => {
                      const nextChecked = e.target.checked;
                      const suggested = suggestedDriverLabelLengthMm;
                      setTemplateConfig(prev => {
                        const nextOptions = { ...(prev.options || {}), logoVisible: nextChecked };
                        if (nextChecked) {
                          const currentLen = Math.max(15, Math.min(200, Number(nextOptions.driverLabelLengthMm ?? DEFAULT_TEMPLATE.options?.driverLabelLengthMm ?? 85) || 85));
                          if (currentLen < suggested) nextOptions.driverLabelLengthMm = suggested;
                        }
                        return { ...prev, options: nextOptions };
                      });
                      if (nextChecked) {
                        toast.info(`Włączono logo. Zmień w sterowniku drukarki długość etykiety na sugerowaną: ${suggested}mm`);
                      }
                    }}
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Pokaż logo na etykiecie</span>
                </label>
                <div className="mt-3 flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Typ kodu do druku/pobrania:</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="printMode_bhp"
                      value="qr"
                      checked={printMode === 'qr'}
                      onChange={(e) => setPrintMode(e.target.value)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">QR Kod</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="printMode_bhp"
                      value="barcode"
                      checked={printMode === 'barcode'}
                      onChange={(e) => setPrintMode(e.target.value)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Kod kreskowy</span>
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bhpData.map(tool => {
                const isSelected = selectedBhp.includes(tool.id);
                const toggleSelect = (id, checked = null) => {
                  setSelectedBhp(prev => {
                    const currentlySelected = prev.includes(id);
                    const shouldSelect = checked !== null ? checked : !currentlySelected;
                    return shouldSelect ? [...prev, id] : prev.filter(x => x !== id);
                  });
                };
                const bhpName = [tool.manufacturer, tool.model].filter(Boolean).join(' ') || 'Sprzęt BHP';

                return (
                  <div
                    key={tool.id}
                    onClick={() => toggleSelect(tool.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-shadow shadow-sm ${isSelected ? 'border-blue-500 dark:border-blue-600 ring-2 ring-blue-200 dark:ring-blue-500/40 bg-blue-50/50 dark:bg-blue-900/25' : 'border-slate-200 dark:border-slate-700 hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{bhpName}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Nr: {tool.inventory_number}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title="Podgląd"
                          onClick={async (e) => { e.stopPropagation(); await toggleExpand(tool); }}
                          className="px-2 py-1 text-xs rounded-md bg-slate-600 hover:bg-slate-700 text-white dark:bg-slate-700 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400"
                          aria-label="Podgląd"
                        >
                          👁️
                        </button>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => { e.stopPropagation(); toggleSelect(tool.id, e.target.checked); }}
                          className="mt-1 w-4 h-4 accent-blue-600 dark:accent-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                          aria-label="Zaznacz"
                        />
                      </div>
                    </div>

                    {expandedIds.includes(tool.id) && (
                      <div className="mt-4 p-3 rounded-md bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-3">
                          <label className="text-sm text-slate-700 dark:text-slate-200">Rozmiar etykiety:</label>
                          <select
                            value={selectedSizes[tool.id] || '70x40'}
                            onChange={(e) => setSelectedSizes(prev => ({ ...prev, [tool.id]: e.target.value }))}
                            className="text-sm px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                          >
                            {Object.keys(LABEL_SIZES).map(key => (
                              <option key={key} value={key}>{LABEL_SIZES[key].label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">Podgląd QR</p>
                            {previews[tool.id]?.qr ? (
                              <img src={previews[tool.id].qr} alt="Podgląd QR" className="w-full max-w-[240px] rounded border border-slate-200 dark:border-slate-600 bg-white" />
                            ) : (
                              <div className="text-xs text-slate-500 dark:text-slate-400">Generowanie podglądu...</div>
                            )}
                            <div className="mt-2">
                              <button
                                type="button"
                                className="px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={async () => await downloadQrLabelSized({
                                    ...tool,
                                    name: bhpName,
                                    inventory_number: tool.inventory_number,
                                    sku: undefined
                                }, selectedSizes[tool.id] || '70x40')}
                              >
                                Pobierz QR
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">Podgląd kodu kreskowego</p>
                            {previews[tool.id]?.barcode ? (
                              <img src={previews[tool.id].barcode} alt="Podgląd kreskowego" className="w-full max-w-[300px] rounded border border-slate-200 dark:border-slate-600 bg-white" />
                            ) : (
                              <div className="text-xs text-slate-500 dark:text-slate-400">Generowanie podglądu...</div>
                            )}
                            <div className="mt-2">
                              <button
                                type="button"
                                className="px-3 py-1 text-xs rounded-md bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={async () => await downloadBarcodeLabelSized({
                                    ...tool,
                                    name: bhpName,
                                    inventory_number: tool.inventory_number,
                                    sku: undefined
                                }, selectedSizes[tool.id] || '70x40')}
                              >
                                Pobierz kod kreskowy
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedBhp.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={downloadSelectedLabels}
                    className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>📄</span>
                    Pobierz etykiety zaznaczonych ({selectedBhp.length})
                  </button>
                  <button
                    onClick={handlePrintBrother}
                    className="bg-indigo-600 dark:bg-indigo-700 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🖨️</span>
                    Drukuj (Brother P-touch)
                  </button>
                  <button
                    onClick={() => setSelectedBhp([])}
                    className="bg-slate-500 dark:bg-slate-600 text-white px-6 py-2 rounded-lg hover:bg-slate-600 dark:hover:bg-slate-700 transition-colors"
                  >
                    Wyczyść zaznaczenie
                  </button>
                </div>
              </div>
            )}

            {bhpData.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-500 dark:text-slate-400">Brak sprzętu BHP do wyświetlenia</p>
              </div>
            )}
          </div>
        ) : currentTab === 'editor' ? (
          <div className="p-6 grid grid-cols-1 xl:grid-cols-1 gap-6">
            {/* Panel konfiguracji */}
            <div className="xl:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Konfiguracja szablonu</h3>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={handleResetTemplate}
                    className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80"
                  >
                    Resetuj do domyślnego
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* Ustawienia ogólne */}
                <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Ustawienia ogólne</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Logo (URL)</label>
                      <input
                        type="url"
                        placeholder="https://..."
                        className={`mt-1 block w-full rounded-md border ${(!templateConfig.logoUrl || isValidHttpUrl(templateConfig.logoUrl)) ? 'border-slate-300 dark:border-slate-600' : 'border-red-500 dark:border-red-400'} bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100`}
                        value={templateConfig.logoUrl}
                        onChange={(e) => setTemplateConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                      />
                      <p className="mt-1 text-xs text-slate-500">Opcjonalne logo firmy na etykiecie.</p>
                      {templateConfig.logoUrl && !isValidHttpUrl(templateConfig.logoUrl) && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">Niepoprawny URL – użyty będzie placeholder.</p>
                      )}
                      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-indigo-600 dark:accent-indigo-400"
                          checked={templateConfig.options?.logoVisible ?? true}
                          onChange={(e) => setTemplateConfig(prev => ({
                            ...prev,
                            options: { ...(prev.options || {}), logoVisible: e.target.checked }
                          }))}
                        />
                        Pokaż logo na etykiecie
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rozdzielczość (DPI)</label>
                      <select
                        className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                        value={templateConfig.dpi || 300}
                        onChange={(e) => setTemplateConfig(prev => ({ ...prev, dpi: Number(e.target.value) }))}
                      >
                        <option value={300}>300 DPI</option>
                        <option value={600}>600 DPI</option>
                      </select>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Używane do wyliczenia rozdzielczości eksportu w pikselach.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rozmiar etykiety</label>
                      <select
                        className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                        value={templateConfig.sizeKey || '70x40'}
                        onChange={(e) => setTemplateConfig(prev => ({ ...prev, sizeKey: e.target.value }))}
                      >
                        <option value="51x32">51x32 mm</option>
                        <option value="70x40">70x40 mm</option>
                        <option value="110x60">110x60 mm</option>
                      </select>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Wpływa na proporcje podglądu szablonu.</p>
                    </div>
                  </div>
                </section>

                {/* Tekst: tytuł/podtytuł */}
                <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Teksty</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tytuł – pozycja (X/Y)</label>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <input type="number" step="0.01" min="0" max="1" value={templateConfig.layout.title.x}
                          className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, x: Number(e.target.value) } } }))} />
                        <input type="number" step="0.01" min="0" max="1" value={templateConfig.layout.title.y}
                          className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, y: Number(e.target.value) } } }))} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tytuł – rozmiar</label>
                      <input type="number" min="8" max="64" value={templateConfig.layout.title.fontSize}
                        className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                        onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, fontSize: Number(e.target.value) } } }))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Podtytuł – pozycja (X/Y)</label>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <input type="number" step="0.01" min="0" max="1" value={templateConfig.layout.subtitle.x}
                          className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, subtitle: { ...prev.layout.subtitle, x: Number(e.target.value) } } }))} />
                        <input type="number" step="0.01" min="0" max="1" value={templateConfig.layout.subtitle.y}
                          className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, subtitle: { ...prev.layout.subtitle, y: Number(e.target.value) } } }))} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Podtytuł – rozmiar</label>
                      <input type="number" min="8" max="64" value={templateConfig.layout.subtitle.fontSize}
                        className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                        onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, subtitle: { ...prev.layout.subtitle, fontSize: Number(e.target.value) } } }))} />
                    </div>
                  </div>
                </section>

                {/* QR i Kod kreskowy */}
                <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Kody</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">QR – pozycja i rozmiar (X/Y/W/H)</label>
                      <div className="mt-1 grid grid-cols-4 gap-2">
                        {['x','y','w','h'].map(k => (
                          <input key={`qr-${k}`} type="number" step="0.01" min="0" max="1" value={templateConfig.layout.qr[k]}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, qr: { ...prev.layout.qr, [k]: Number(e.target.value) } } }))} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Kod kreskowy – pozycja i rozmiar (X/Y/W/H)</label>
                      <div className="mt-1 grid grid-cols-4 gap-2">
                        {['x','y','w','h'].map(k => (
                          <input key={`bc-${k}`} type="number" step="0.01" min="0" max="1" value={templateConfig.layout.barcode[k]}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, barcode: { ...prev.layout.barcode, [k]: Number(e.target.value) } } }))} />
                        ))}
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-indigo-600 dark:accent-indigo-400"
                          checked={Boolean(templateConfig.options?.barcodeShowValue)}
                          onChange={(e) => setTemplateConfig(prev => ({
                            ...prev,
                            options: { ...(prev.options || {}), barcodeShowValue: e.target.checked }
                          }))}
                        />
                        Pokaż wartości pod kodem kreskowym
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rozmiar tekstu pod kodem (%)</label>
                          <input
                            type="number"
                            min={6}
                            max={24}
                            step={1}
                            value={Math.round(((templateConfig.options?.barcodeValueFontRatio ?? 0.12) * 100))}
                            onChange={(e) => {
                              const pct = Number(e.target.value);
                              const ratio = isNaN(pct) ? 0.12 : Math.min(Math.max(pct, 1), 50) / 100;
                              setTemplateConfig(prev => ({
                                ...prev,
                                options: { ...(prev.options || {}), barcodeValueFontRatio: ratio }
                              }));
                            }}
                            className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Info i Logo */}
                <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Informacje dodatkowe</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tekst informacji</label>
                      <input
                        type="text"
                        placeholder="np. Zeskanuj kod aby sprawdzić status"
                        className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                        value={templateConfig?.translations?.[templateConfig?.language || 'pl']?.scanInfo || ''}
                        onChange={(e) => setTemplateConfig(prev => ({
                          ...prev,
                          translations: {
                            ...(prev.translations || {}),
                            [prev.language || 'pl']: {
                              ...(prev.translations?.[prev.language || 'pl'] || {}),
                              scanInfo: e.target.value
                            }
                          }
                        }))}
                      />
                      <p className="mt-1 text-xs text-slate-500">Ten tekst pojawi się na dole etykiety.</p>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Informacja – pozycja (X/Y) i rozmiar</label>
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        <input type="number" step="0.01" min="0" max="1" value={templateConfig.layout.info.x}
                          className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, x: Number(e.target.value) } } }))} />
                        <input type="number" step="0.01" min="0" max="1" value={templateConfig.layout.info.y}
                          className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, y: Number(e.target.value) } } }))} />
                        <input type="number" min="8" max="64" value={templateConfig.layout.info.fontSize}
                          className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, fontSize: Number(e.target.value) } } }))} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Logo – pozycja i rozmiar (X/Y/W/H)</label>
                      <div className="mt-1 grid grid-cols-4 gap-2">
                        {['x','y','w','h'].map(k => (
                          <input key={`lg-${k}`} type="number" step="0.01" min="0" max="1" value={templateConfig.layout.logo[k]}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, logo: { ...prev.layout.logo, [k]: Number(e.target.value) } } }))} />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            {/* Panel podglądu */}
            <div className="xl:col-span-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Podgląd szablonu</h3>
              {toolsData.length > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <label className="text-sm text-slate-700 dark:text-slate-300">Dane podglądu:</label>
                  <select
                    className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    value={previewTool?.id || ''}
                    onChange={(e) => setSelectedPreviewToolId(Number(e.target.value))}
                  >
                    {toolsData.map(tool => (
                      <option key={tool.id} value={tool.id}>{tool.name} ({tool.sku || tool.id})</option>
                    ))}
                  </select>
                </div>
              )}
              <TemplatePreview
                template={templateConfig}
                sampleValue={previewValue}
                sampleTitle={previewTool?.name || 'Przykładowe narzędzie'}
                onUpdateLayout={(key, patch) => setTemplateConfig(prev => ({
                  ...prev,
                  layout: { ...prev.layout, [key]: { ...prev.layout[key], ...patch } }
                }))}
              />
              {(() => {
                const sizesMM = { '51x32': { w: 51, h: 32 }, '70x40': { w: 70, h: 40 }, '110x60': { w: 110, h: 60 } };
                const key = templateConfig.sizeKey || '70x40';
                const mm = sizesMM[key] || sizesMM['70x40'];
                const dpi = templateConfig.dpi || 300;
                const pxW = Math.round(mm.w * dpi / 25.4);
                const pxH = Math.round(mm.h * dpi / 25.4);
                return (
                  <div className="mt-2 text-xs text-slate-700 dark:text-slate-300">
                    Rozmiar: {mm.w}×{mm.h} mm • DPI: {dpi} • Eksport: {pxW}×{pxH} px
                  </div>
                );
              })()}
              <p className="text-xs text-slate-500 mt-2">Zmiany zapisywane są automatycznie i obowiązują globalnie.</p>
            </div>
          </div>
        ) : (
          // Edytor osobnych szablonów: osobno dla QR i kodu kreskowego
          <div className="p-6 grid grid-cols-1 xl:grid-cols-1 gap-6">
            <div className="xl:col-span-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Edytor osobnych szablonów</h3>
              {toolsData.length > 0 && (
                <div className="mb-4 flex items-center gap-2">
                  <label className="text-sm text-slate-700 dark:text-slate-300">Dane podglądu:</label>
                  <select
                    className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    value={previewTool?.id || ''}
                    onChange={(e) => setSelectedPreviewToolId(Number(e.target.value))}
                  >
                    {toolsData.map(tool => (
                      <option key={tool.id} value={tool.id}>{tool.name} ({tool.sku || tool.id})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sekcja QR */}
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Szablon etykiety QR</h4>
                  <button
                    type="button"
                    disabled={!previewTool}
                    className="ml-2 inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={async () => {
                      if (!previewTool) return;
                      await downloadQrLabelSized(previewTool, qrTemplateConfig.sizeKey || '70x40');
                    }}
                    aria-label={'Pobierz etykietę (tylko QR)'}
                    title={'Pobierz etykietę (tylko QR)'}
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Tytuł i SKU</h5>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tytuł – pozycja (X/Y)</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <input type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.title.x}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, x: Number(e.target.value) } } }))} />
                          <input type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.title.y}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, y: Number(e.target.value) } } }))} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tytuł – rozmiar</label>
                        <input type="number" min="12" max="64" value={qrTemplateConfig.layout.title.fontSize}
                          className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, fontSize: Number(e.target.value) } } }))} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SKU – pozycja (X/Y)</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <input type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.subtitle.x}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, subtitle: { ...prev.layout.subtitle, x: Number(e.target.value) } } }))} />
                          <input type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.subtitle.y}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, subtitle: { ...prev.layout.subtitle, y: Number(e.target.value) } } }))} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">QR – pozycja i rozmiar (X/Y/W/H)</label>
                      <div className="mt-1 grid grid-cols-4 gap-2">
                        {['x','y','w','h'].map(k => (
                          <input key={`qrsep-${k}`} type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.qr[k]}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, qr: { ...prev.layout.qr, [k]: Number(e.target.value) } } }))} />
                        ))}
                      </div>
                    </div>

                    <div className="mt-3">
                      {/* Informacja: tekst oraz pozycja (X/Y) i rozmiar – nad polem Logo (URL) */}
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tekst informacji</label>
                      <input
                        type="text"
                        placeholder="np. Zeskanuj kod aby sprawdzić status"
                        className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                        value={qrTemplateConfig?.translations?.[qrTemplateConfig?.language || 'pl']?.scanInfo || ''}
                        onChange={(e) => setQrTemplateConfig(prev => ({
                          ...prev,
                          translations: {
                            ...(prev.translations || {}),
                            [prev.language || 'pl']: {
                              ...(prev.translations?.[prev.language || 'pl'] || {}),
                              scanInfo: e.target.value
                            }
                          }
                        }))}
                      />
                      <div className="mt-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Informacja – pozycja (X/Y) i rozmiar</label>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                          <input type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.info.x}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, x: Number(e.target.value) } } }))} />
                          <input type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.info.y}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, y: Number(e.target.value) } } }))} />
                          <input type="number" min="8" max="64" value={qrTemplateConfig.layout.info.fontSize}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, fontSize: Number(e.target.value) } } }))} />
                        </div>
                      </div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Logo (URL)</label>
                      <input
                        type="url"
                        placeholder="https://..."
                        className={`mt-1 block w-full rounded-md border ${(!qrTemplateConfig.logoUrl || isValidHttpUrl(qrTemplateConfig.logoUrl)) ? 'border-slate-300 dark:border-slate-600' : 'border-red-500 dark:border-red-400'} bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100`}
                        value={qrTemplateConfig.logoUrl}
                        onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                      />
                      {qrTemplateConfig.logoUrl && !isValidHttpUrl(qrTemplateConfig.logoUrl) && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">Niepoprawny URL – użyty będzie placeholder.</p>
                      )}
                      <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                          checked={qrTemplateConfig.options?.logoVisible ?? true}
                          onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, options: { ...(prev.options || {}), logoVisible: e.target.checked } }))}
                        />
                        Pokaż logo na etykiecie
                      </label>
                      <div className="mt-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Logo – pozycja i rozmiar (X/Y/W/H)</label>
                        <div className="mt-1 grid grid-cols-4 gap-2">
                          {['x','y','w','h'].map(k => (
                            <input key={`lgqr-${k}`} type="number" step="0.01" min="0" max="1" value={qrTemplateConfig.layout.logo[k]}
                              className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                              onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, logo: { ...prev.layout.logo, [k]: Number(e.target.value) } } }))} />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-700 dark:text-slate-300">Rozmiar etykiety:</label>
                        <select
                          className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          value={qrTemplateConfig.sizeKey || '70x40'}
                          onChange={(e) => setQrTemplateConfig(prev => ({ ...prev, sizeKey: e.target.value }))}
                        >
                          <option value="51x32">51x32 mm</option>
                          <option value="70x40">70x40 mm</option>
                          <option value="110x60">110x60 mm</option>
                        </select>
                      </div>
                      <div className="flex-1" />
                    </div>
                    {/* Kafelek: Drukowanie (QR) */}
                    <div className="mt-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Drukowanie</h5>
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 lg:items-end">
                        <div className="flex flex-col">
                          <label className="text-sm text-slate-700 dark:text-slate-300">Protokół:</label>
                          <select
                            className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            value={qrPrintConfig.protocol}
                            onChange={(e) => setQrPrintConfig(prev => ({ ...prev, protocol: e.target.value }))}
                          >
                            <option value="ipp">IPP</option>
                            <option value="zebra_raw">Zebra RAW (9100)</option>
                          </select>
                        </div>
                        <div className="flex flex-col lg:col-span-2">
                          <label className="text-sm text-slate-700 dark:text-slate-300">Adres drukarki</label>
                          <input
                            type="text"
                            placeholder="ipp://adres-drukarki/ipp/print lub tcp://IP:9100"
                            className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            value={qrPrintConfig.url}
                            onChange={(e) => setQrPrintConfig(prev => ({ ...prev, url: e.target.value }))}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-sm text-slate-700 dark:text-slate-300">Kopie</label>
                          <input
                            type="number"
                            min={1}
                            className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            value={qrPrintConfig.copies}
                            onChange={(e) => setQrPrintConfig(prev => ({ ...prev, copies: Number(e.target.value) }))}
                          />
                        </div>
                        <div className="lg:col-span-4 flex justify-end">
                          <button
                            type="button"
                            disabled={!previewTool || !qrPrintConfig.url}
                            className="mt-2 px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white"
                            onClick={async () => {
                              if (!previewTool || !qrPrintConfig.url) return;
                              await printQrLabelSized(previewTool, qrTemplateConfig.sizeKey || '70x40');
                            }}
                          >
                            Drukuj (QR)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <TemplatePreview
                      template={qrTemplateConfig}
                      sampleTitle={previewTool?.name || 'Przykładowe narzędzie'}
                      sampleValue={previewValue}
                      mode="qr"
                      onUpdateLayout={(key, patch) => setQrTemplateConfig(prev => ({
                        ...prev,
                        layout: { ...prev.layout, [key]: { ...prev.layout[key], ...patch } }
                      }))}
                    />
                  </div>
                </div>
              </section>

              {/* Sekcja Kod kreskowy */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Szablon etykiety kodu kreskowego</h4>
                  <button
                    type="button"
                    disabled={!previewTool}
                    className="ml-2 inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={async () => {
                      if (!previewTool) return;
                      await downloadBarcodeLabelSized(previewTool, barcodeTemplateConfig.sizeKey || '70x40');
                    }}
                    aria-label={'Pobierz etykietę (tylko kod kreskowy)'}
                    title={'Pobierz etykietę (tylko kod kreskowy)'}
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Tytuł i SKU</h5>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tytuł – pozycja (X/Y)</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <input type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.title.x}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, x: Number(e.target.value) } } }))} />
                          <input type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.title.y}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, y: Number(e.target.value) } } }))} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tytuł – rozmiar</label>
                        <input type="number" min="12" max="64" value={barcodeTemplateConfig.layout.title.fontSize}
                          className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, title: { ...prev.layout.title, fontSize: Number(e.target.value) } } }))} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SKU – pozycja (X/Y)</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <input type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.subtitle.x}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, subtitle: { ...prev.layout.subtitle, x: Number(e.target.value) } } }))} />
                          <input type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.subtitle.y}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, subtitle: { ...prev.layout.subtitle, y: Number(e.target.value) } } }))} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Kod kreskowy – pozycja i rozmiar (X/Y/W/H)</label>
                      <div className="mt-1 grid grid-cols-4 gap-2">
                        {['x','y','w','h'].map(k => (
                          <input key={`bcsep-${k}`} type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.barcode[k]}
                            className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                            onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, barcode: { ...prev.layout.barcode, [k]: Number(e.target.value) } } }))} />
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={Boolean(barcodeTemplateConfig.options?.barcodeShowValue)}
                          onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, options: { ...prev.options, barcodeShowValue: e.target.checked } }))}
                          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400" />
                        Pokazuj wartość pod kodem kreskowym
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rozmiar tekstu pod kodem (%)</label>
                          <input
                            type="number"
                            min={6}
                            max={24}
                            step={1}
                            value={Math.round(((barcodeTemplateConfig.options?.barcodeValueFontRatio ?? 0.12) * 100))}
                            onChange={(e) => {
                              const pct = Number(e.target.value);
                              const ratio = isNaN(pct) ? 0.12 : Math.min(Math.max(pct, 1), 50) / 100;
                              setBarcodeTemplateConfig(prev => ({
                                ...prev,
                                options: { ...(prev.options || {}), barcodeValueFontRatio: ratio }
                              }));
                            }}
                            className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        {/* Informacja: tekst oraz pozycja (X/Y) i rozmiar – nad polem Logo (URL) */}
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tekst informacji</label>
                        <input
                          type="text"
                          placeholder="np. Zeskanuj kod aby sprawdzić status"
                          className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                          value={barcodeTemplateConfig?.translations?.[barcodeTemplateConfig?.language || 'pl']?.scanInfo || ''}
                          onChange={(e) => setBarcodeTemplateConfig(prev => ({
                            ...prev,
                            translations: {
                              ...(prev.translations || {}),
                              [prev.language || 'pl']: {
                                ...(prev.translations?.[prev.language || 'pl'] || {}),
                                scanInfo: e.target.value
                              }
                            }
                          }))}
                        />
                        <div className="mt-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Informacja – pozycja (X/Y) i rozmiar</label>
                          <div className="mt-1 grid grid-cols-3 gap-2">
                            <input type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.info.x}
                              className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                              onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, x: Number(e.target.value) } } }))} />
                            <input type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.info.y}
                              className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                              onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, y: Number(e.target.value) } } }))} />
                            <input type="number" min="8" max="64" value={barcodeTemplateConfig.layout.info.fontSize}
                              className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                              onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, info: { ...prev.layout.info, fontSize: Number(e.target.value) } } }))} />
                          </div>
                        </div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Logo (URL)</label>
                        <input
                          type="url"
                          placeholder="https://..."
                          className={`mt-1 block w-full rounded-md border ${(!barcodeTemplateConfig.logoUrl || isValidHttpUrl(barcodeTemplateConfig.logoUrl)) ? 'border-slate-300 dark:border-slate-600' : 'border-red-500 dark:border-red-400'} bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100`}
                          value={barcodeTemplateConfig.logoUrl || ''}
                          onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                        />
                        {barcodeTemplateConfig.logoUrl && !isValidHttpUrl(barcodeTemplateConfig.logoUrl) && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">Niepoprawny URL – użyty będzie placeholder.</p>
                        )}
                      </div>
                      <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                          checked={barcodeTemplateConfig.options?.logoVisible ?? true}
                          onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, options: { ...(prev.options || {}), logoVisible: e.target.checked } }))}
                        />
                        Pokaż logo na etykiecie
                      </label>
                      <div className="mt-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Logo – pozycja i rozmiar (X/Y/W/H)</label>
                        <div className="mt-1 grid grid-cols-4 gap-2">
                          {['x','y','w','h'].map(k => (
                            <input key={`lgbc-${k}`} type="number" step="0.01" min="0" max="1" value={barcodeTemplateConfig.layout.logo[k]}
                              className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                              onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, layout: { ...prev.layout, logo: { ...prev.layout.logo, [k]: Number(e.target.value) } } }))} />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-700 dark:text-slate-300">Rozmiar etykiety:</label>
                        <select
                          className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          value={barcodeTemplateConfig.sizeKey || '70x40'}
                          onChange={(e) => setBarcodeTemplateConfig(prev => ({ ...prev, sizeKey: e.target.value }))}
                        >
                          <option value="51x32">51x32 mm</option>
                          <option value="70x40">70x40 mm</option>
                          <option value="110x60">110x60 mm</option>
                        </select>
                      </div>
                      <div className="flex-1" />
                    </div>
                    {/* Kafelek: Drukowanie (Kod kreskowy) */}
                    <div className="mt-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Drukowanie</h5>
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 lg:items-end">
                        <div className="flex flex-col">
                          <label className="text-sm text-slate-700 dark:text-slate-300">Protokół:</label>
                          <select
                            className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            value={barcodePrintConfig.protocol}
                            onChange={(e) => setBarcodePrintConfig(prev => ({ ...prev, protocol: e.target.value }))}
                          >
                            <option value="ipp">IPP</option>
                            <option value="zebra_raw">Zebra RAW (9100)</option>
                          </select>
                        </div>
                        <div className="flex flex-col lg:col-span-2">
                          <label className="text-sm text-slate-700 dark:text-slate-300">Adres drukarki</label>
                          <input
                            type="text"
                            placeholder="ipp://adres-drukarki/ipp/print lub tcp://IP:9100"
                            className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            value={barcodePrintConfig.url}
                            onChange={(e) => setBarcodePrintConfig(prev => ({ ...prev, url: e.target.value }))}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-sm text-slate-700 dark:text-slate-300">Kopie</label>
                          <input
                            type="number"
                            min={1}
                            className="text-sm px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            value={barcodePrintConfig.copies}
                            onChange={(e) => setBarcodePrintConfig(prev => ({ ...prev, copies: Number(e.target.value) }))}
                          />
                        </div>
                        <div className="lg:col-span-4 flex justify-end">
                          <button
                            type="button"
                            disabled={!previewTool || !barcodePrintConfig.url}
                            className="mt-2 px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white"
                            onClick={async () => {
                              if (!previewTool || !barcodePrintConfig.url) return;
                              await printBarcodeLabelSized(previewTool, barcodeTemplateConfig.sizeKey || '70x40');
                            }}
                          >
                            Drukuj (Kod kreskowy)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <TemplatePreview
                      template={barcodeTemplateConfig}
                      sampleTitle={previewTool?.name || 'Przykładowe narzędzie'}
                      sampleValue={previewValue}
                      mode="barcode"
                      onUpdateLayout={(key, patch) => setBarcodeTemplateConfig(prev => ({
                        ...prev,
                        layout: { ...prev.layout, [key]: { ...prev.layout[key], ...patch } }
                      }))}
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Modal dla zawiesi */}
        {slingsModalOpen && slingsModalTool && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {slingsModalTool.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Zarządzanie podpozycjami i drukowanie etykiet
                  </p>
                </div>
                <button 
                  onClick={() => setSlingsModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto bg-white dark:bg-slate-800">
                <ToolsSlingsItemsTable 
                  toolId={slingsModalTool.id}
                  t={t}
                  canManage={hasPermission(user, PERMISSIONS.MANAGE_TOOLS)}
                  hideDelete={true}
                  hideEdit={true}
                  onDownloadLabel={async (subItem) => {
                    const syntheticTool = {
                      ...slingsModalTool,
                      name: '',
                      sku: subItem.sku,
                      qr_code: subItem.sku,
                      serial_number: subItem.serial_number,
                      inventory_number: subItem.serial_number || subItem.sku
                    };
                    await downloadQrLabelSized(syntheticTool, qrTemplateConfig.sizeKey || '70x40');
                  }}
                  onPrintQr={(subItem) => handlePrintSubItem(slingsModalTool, subItem)}
                  onPrintBatch={(items) => {
                    const syntheticTools = items.map(subItem => ({
                      ...slingsModalTool,
                      name: '',
                      sku: subItem.sku,
                      qr_code: subItem.sku,
                      serial_number: subItem.serial_number,
                      inventory_number: subItem.serial_number || subItem.sku
                    }));
                    handlePrintBrother(syntheticTools);
                  }}
                />
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
                <button
                  onClick={() => setSlingsModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        )}

        {socketsModalOpen && socketsModalTool && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {socketsModalTool.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Zarządzanie podpozycjami i drukowanie etykiet
                  </p>
                </div>
                <button
                  onClick={() => setSocketsModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto bg-white dark:bg-slate-800">
                <ToolsImpactSocketsItemsTable
                  toolId={socketsModalTool.id}
                  category={socketsModalTool.category}
                  t={t}
                  canManage={hasPermission(user, PERMISSIONS.MANAGE_TOOLS)}
                  hideDelete={true}
                  hideEdit={true}
                  onDownloadLabel={async (subItem) => {
                    const syntheticTool = {
                      ...socketsModalTool,
                      name: `${subItem.kind || ''} ${subItem.size || ''}`.trim() || socketsModalTool.name || '',
                      sku: subItem.sku,
                      barcode: subItem.sku,
                      qr_code: subItem.sku,
                      inventory_number: subItem.sku
                    };
                    await downloadBarcodeLabelSized(syntheticTool, barcodeTemplateConfig.sizeKey || '70x40');
                  }}
                  onPrintLabel={(subItem) => {
                    const syntheticTool = {
                      ...socketsModalTool,
                      name: `${subItem.kind || ''} ${subItem.size || ''}`.trim() || socketsModalTool.name || '',
                      sku: subItem.sku,
                      barcode: subItem.sku,
                      qr_code: subItem.sku,
                      inventory_number: subItem.sku
                    };
                    handlePrintBrother([syntheticTool]);
                  }}
                  onPrintBatch={(items) => {
                    const syntheticTools = items.map(subItem => ({
                      ...socketsModalTool,
                      name: `${subItem.kind || ''} ${subItem.size || ''}`.trim() || socketsModalTool.name || '',
                      sku: subItem.sku,
                      barcode: subItem.sku,
                      qr_code: subItem.sku,
                      inventory_number: subItem.sku
                    }));
                    handlePrintBrother(syntheticTools);
                  }}
                />
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
                <button
                  onClick={() => setSocketsModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        )}

        {detectorsModalOpen && detectorsModalTool && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {detectorsModalTool.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Zarządzanie podpozycjami i drukowanie etykiet
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDetectorsModalOpen(false);
                    setDetectorsModalTool(null);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto bg-white dark:bg-slate-800">
                <ToolsDetectorsItemsTable
                  toolId={detectorsModalTool.id}
                  t={t}
                  canManage={hasPermission(user, PERMISSIONS.MANAGE_TOOLS)}
                  hideDelete={true}
                  hideEdit={true}
                  onDownloadLabel={async (subItem) => {
                    const syntheticTool = {
                      ...detectorsModalTool,
                      name: (subItem?.type || '').trim(),
                      title_text: (subItem?.type || '').trim(),
                      subtitle_text: String(subItem?.sku || '').trim(),
                      sku: subItem.sku,
                      qr_code: subItem.sku,
                      barcode: subItem.sku,
                      inventory_number: subItem.inventory_number || subItem.sku,
                      serial_number: subItem.serial_number || null,
                      index_prefix: '',
                      index_text: String(subItem?.sku || '').trim()
                    };
                    await downloadQrLabelSized(syntheticTool, qrTemplateConfig.sizeKey || '70x40');
                  }}
                  onPrintLabel={(subItem) => {
                    const syntheticTool = {
                      ...detectorsModalTool,
                      name: (subItem?.type || '').trim(),
                      title_text: (subItem?.type || '').trim(),
                      subtitle_text: String(subItem?.sku || '').trim(),
                      sku: subItem.sku,
                      qr_code: subItem.sku,
                      barcode: subItem.sku,
                      inventory_number: subItem.inventory_number || subItem.sku,
                      serial_number: subItem.serial_number || null,
                      index_prefix: '',
                      index_text: String(subItem?.sku || '').trim()
                    };
                    handlePrintBrother([syntheticTool], 'qr');
                  }}
                  onPrintBatch={(items) => {
                    const syntheticTools = items.map(subItem => ({
                      ...detectorsModalTool,
                      name: (subItem?.type || '').trim(),
                      title_text: (subItem?.type || '').trim(),
                      subtitle_text: String(subItem?.sku || '').trim(),
                      sku: subItem.sku,
                      qr_code: subItem.sku,
                      barcode: subItem.sku,
                      inventory_number: subItem.inventory_number || subItem.sku,
                      serial_number: subItem.serial_number || null,
                      index_prefix: '',
                      index_text: String(subItem?.sku || '').trim()
                    }));
                    handlePrintBrother(syntheticTools, 'qr');
                  }}
                />
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setDetectorsModalOpen(false);
                    setDetectorsModalTool(null);
                  }}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Podgląd szablonu etykiety (HTML/CSS – bez generowania pliku)
function TemplatePreview({ template, onUpdateLayout, sampleValue, sampleTitle, mode = 'both' }) {
  // Ustal wymiar podglądu w oparciu o wybrany rozmiar etykiety (proporcje mm)
  const sizesMM = {
    '51x32': { w: 51, h: 32 },
    '70x40': { w: 70, h: 40 },
    '110x60': { w: 110, h: 60 },
  };
  const sizeKey = template?.sizeKey || '70x40';
  const mm = sizesMM[sizeKey] || sizesMM['70x40'];
  const dpi = (template?.dpi || 300);
  const exportPxW = Math.round(mm.w * dpi / 25.4);
  const exportPxH = Math.round(mm.h * dpi / 25.4);
  // Podgląd powinien odzwierciedlać wybrany rozmiar etykiety.
  // Zamiast stałej szerokości, użyj skalowania stałego w px/mm.
  const PREVIEW_PX_PER_MM = 8; // współczynnik podglądu: 8 px na 1 mm
  const w = Math.round(mm.w * PREVIEW_PX_PER_MM);
  const h = Math.round(mm.h * PREVIEW_PX_PER_MM);
  // Skala czcionek względem bazowego rozmiaru 70x40 mm, aby przy zmianie rozmiaru etykiety
  // teksty automatycznie skalowały się proporcjonalnie
  const baseH = Math.round(sizesMM['70x40'].h * PREVIEW_PX_PER_MM);
  const fontScale = h / baseH;
  // Siatka pomocnicza: linie co 1 mm (delikatne) i co 10 mm (mocniejsze)
  const gridMinor = PREVIEW_PX_PER_MM; // 1 mm
  const gridMajor = PREVIEW_PX_PER_MM * 10; // 10 mm
  const gridColorMinor = 'rgba(100,116,139,0.12)'; // slate-500 z niską przezroczystością
  const gridColorMajor = 'rgba(100,116,139,0.25)'; // bardziej widoczne
  const t = template || {};
  const merge = (def, obj) => ({ ...def, ...(obj || {}) });
  const title = merge({ x: 0.5, y: 0.13, fontSize: 26, align: 'center' }, t.layout?.title);
  const subtitle = merge({ x: 0.5, y: 0.23, fontSize: 18, align: 'center' }, t.layout?.subtitle);
  const qr = merge({ x: 0.125, y: 0.33, w: 0.4, h: 0.53 }, t.layout?.qr);
  const barcode = merge({ x: 0.55, y: 0.33, w: 0.42, h: 0.36 }, t.layout?.barcode);
  const info = merge({ x: 0.5, y: 0.93, fontSize: 14, align: 'center' }, t.layout?.info);
  const logo = merge({ x: 0.06, y: 0.08, w: 0.1, h: 0.12 }, t.layout?.logo);
  const skuLabel = (t.translations?.[t.language || 'pl']?.sku) || 'SKU';
  const scanInfo = (t.translations?.[t.language || 'pl']?.scanInfo) || 'Zeskanuj kod aby sprawdzić status';

  const pos = (p) => ({ left: `${p.x * w}px`, top: `${p.y * h}px` });
  const box = (p) => ({ left: `${p.x * w}px`, top: `${p.y * h}px`, width: `${p.w * w}px`, height: `${p.h * h}px` });

  const containerRef = useRef(null);
  const barcodeCanvasRef = useRef(null);
  const [qrSrc, setQrSrc] = useState('');
  const [dragState, setDragState] = useState(null); // { target: 'qr'|'barcode', type: 'move'|'resize', handle?: 'nw'|'ne'|'sw'|'se', offsetX, offsetY, startBox }

  useEffect(() => {
    const sample = sampleValue || 'DEMO-001';
    const defaultQrW = 0.4;
    const size = Math.max(32, Math.round(((t.layout?.qr?.w ?? defaultQrW) * exportPxW)));
    QRCode.toDataURL(sample, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
      quality: 1
    })
      .then(setQrSrc)
      .catch(() => setQrSrc(''));
  }, [t.layout?.qr?.w, sampleValue, exportPxW]);

  useEffect(() => {
    const sample = sampleValue || 'DEMO-001';
    const canvas = barcodeCanvasRef.current;
    if (!canvas) return;
    const defaultBarcodeW = 0.42;
    const defaultBarcodeH = 0.36;
    const targetW = Math.max(32, Math.round(((t.layout?.barcode?.w ?? defaultBarcodeW) * exportPxW)));
    const targetH = Math.max(24, Math.round(((t.layout?.barcode?.h ?? defaultBarcodeH) * exportPxH)));
    canvas.width = targetW;
    canvas.height = targetH;
    try {
      JsBarcode(canvas, sample, {
        format: 'CODE128',
        displayValue: Boolean(t.options?.barcodeShowValue),
        margin: 0,
        background: 'transparent',
        lineColor: '#1f2937',
        height: targetH,
        width: Math.max(1, Math.floor(targetW / 150)),
        textMargin: 2,
        fontSize: Math.max(8, Math.round(targetH * (t.options?.barcodeValueFontRatio ?? 0.12)))
      });
    } catch { void 0; }
  }, [t.layout?.barcode?.w, t.layout?.barcode?.h, t.options?.barcodeShowValue, t.options?.barcodeValueFontRatio, sampleValue, exportPxW, exportPxH]);

  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
  const handleDragStart = (target, e) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const current =
      target === 'qr' ? qr :
      target === 'barcode' ? barcode :
      target === 'title' ? (t.layout?.title || title) :
      target === 'subtitle' ? (t.layout?.subtitle || subtitle) :
      (t.layout?.info || info);
    const elemLeft = current.x * w;
    const elemTop = current.y * h;
    const offsetX = clientX - rect.left - elemLeft;
    const offsetY = clientY - rect.top - elemTop;
    setDragState({ target, type: 'move', offsetX, offsetY, startBox: { ...current } });
  };
  const handleResizeStart = (target, handle, e) => {
    e.stopPropagation();
    const current = target === 'qr' ? qr : barcode;
    setDragState({ target, type: 'resize', handle, startBox: { ...current } });
  };
  const handleMouseMove = (e) => {
    if (!dragState || !onUpdateLayout) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const current =
      dragState.target === 'qr' ? (t.layout?.qr || qr) :
      dragState.target === 'barcode' ? (t.layout?.barcode || barcode) :
      dragState.target === 'title' ? (t.layout?.title || title) :
      dragState.target === 'subtitle' ? (t.layout?.subtitle || subtitle) :
      (t.layout?.info || info);
    if (dragState.type === 'move') {
      const leftPx = clientX - rect.left - dragState.offsetX;
      const topPx = clientY - rect.top - dragState.offsetY;
      const newX = clamp(leftPx / w, 0, 1 - (current.w || 0));
      const newY = clamp(topPx / h, 0, 1 - (current.h || 0));
      onUpdateLayout(dragState.target, { x: Number(newX.toFixed(4)), y: Number(newY.toFixed(4)) });
    } else if (dragState.type === 'resize') {
      const minW = 0.05;
      const minH = 0.05;
      const start = dragState.startBox;
      const left = start.x * w;
      const top = start.y * h;
      const right = (start.x + start.w) * w;
      const bottom = (start.y + start.h) * h;
      let newX = start.x;
      let newY = start.y;
      let newW = start.w;
      let newH = start.h;
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;
      if (dragState.handle === 'se') {
        newW = clamp((relX - left) / w, minW, 1 - start.x);
        newH = clamp((relY - top) / h, minH, 1 - start.y);
      } else if (dragState.handle === 'ne') {
        newW = clamp((relX - left) / w, minW, 1 - start.x);
        newH = clamp((bottom - relY) / h, minH, start.y + start.h);
        newY = clamp(relY / h, 0, start.y + start.h - minH);
      } else if (dragState.handle === 'sw') {
        newW = clamp((right - relX) / w, minW, start.x + start.w);
        newH = clamp((relY - top) / h, minH, 1 - start.y);
        newX = clamp(relX / w, 0, start.x + start.w - minW);
      } else if (dragState.handle === 'nw') {
        newW = clamp((right - relX) / w, minW, start.x + start.w);
        newH = clamp((bottom - relY) / h, minH, start.y + start.h);
        newX = clamp(relX / w, 0, start.x + start.w - minW);
        newY = clamp(relY / h, 0, start.y + start.h - minH);
      }
      onUpdateLayout(dragState.target, {
        x: Number(newX.toFixed(4)),
        y: Number(newY.toFixed(4)),
        w: Number(newW.toFixed(4)),
        h: Number(newH.toFixed(4))
      });
    }
  };
  const endDrag = () => setDragState(null);

  return (
      <div
        ref={containerRef}
        className="relative"
        style={{
          width: w,
          height: h,
          backgroundColor: '#ffffff',
          backgroundImage: `
            repeating-linear-gradient(to right, ${gridColorMinor} 0, ${gridColorMinor} 1px, transparent 1px, transparent ${gridMinor}px),
            repeating-linear-gradient(to bottom, ${gridColorMinor} 0, ${gridColorMinor} 1px, transparent 1px, transparent ${gridMinor}px),
            repeating-linear-gradient(to right, ${gridColorMajor} 0, ${gridColorMajor} 2px, transparent 2px, transparent ${gridMajor}px),
            repeating-linear-gradient(to bottom, ${gridColorMajor} 0, ${gridColorMajor} 2px, transparent 2px, transparent ${gridMajor}px)
          `
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {/* Tytuł */}
        <div
          style={{ position: 'absolute', ...pos(title), transform: 'translate(-50%, -50%)', fontSize: Math.round((title.fontSize || 26) * fontScale), fontWeight: 700, cursor: 'move' }}
          className="text-slate-900"
          onMouseDown={(e) => handleDragStart('title', e)}
        >
          {sampleTitle || 'Przykładowe narzędzie'}
        </div>
        {/* Podtytuł */}
        <div
          style={{ position: 'absolute', ...pos(subtitle), transform: 'translate(-50%, -50%)', fontSize: Math.round((subtitle.fontSize || 18) * fontScale), cursor: 'move' }}
          className="text-slate-900"
          onMouseDown={(e) => handleDragStart('subtitle', e)}
        >
          {skuLabel}: {sampleValue || 'DEMO-001'}
        </div>
        {/* QR */}
        {mode !== 'barcode' && (
          <div
            style={{ position: 'absolute', ...box(qr), cursor: 'move' }}
            className="rounded group"
            onMouseDown={(e) => handleDragStart('qr', e)}
          >
            {qrSrc ? (
              <img src={qrSrc} alt="QR" className="w-full h-full border border-slate-200 rounded" style={{ imageRendering: 'crisp-edges' }} draggable={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 dark:text-slate-300">QR</div>
            )}
            {/* Resize handles */}
            {['nw','ne','sw','se'].map(h => (
              <div
                key={`qr-h-${h}`}
                onMouseDown={(e) => handleResizeStart('qr', h, e)}
                className="absolute w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-sm border border-white shadow-sm opacity-0 group-hover:opacity-100"
                style={{
                  left: h.includes('w') ? '-3px' : 'calc(100% - 5px)',
                  top: h.includes('n') ? '-3px' : 'calc(100% - 5px)'
                }}
              />
            ))}
          </div>
        )}
        {/* Barcode */}
        {mode !== 'qr' && (
          <div
            style={{ position: 'absolute', ...box(barcode), cursor: 'move' }}
            className="rounded group"
            onMouseDown={(e) => handleDragStart('barcode', e)}
          >
            <canvas ref={barcodeCanvasRef} className="w-full h-full border border-slate-200 rounded" />
            {/* Resize handles */}
            {['nw','ne','sw','se'].map(h => (
              <div
                key={`bc-h-${h}`}
                onMouseDown={(e) => handleResizeStart('barcode', h, e)}
                className="absolute w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-sm border border-white shadow-sm opacity-0 group-hover:opacity-100"
                style={{
                  left: h.includes('w') ? '-3px' : 'calc(100% - 5px)',
                  top: h.includes('n') ? '-3px' : 'calc(100% - 5px)'
                }}
              />
            ))}
          </div>
        )}
        {/* Info */}
        <div
          style={{ position: 'absolute', ...pos(info), transform: 'translate(-50%, -50%)', fontSize: Math.round((info.fontSize || 14) * fontScale), cursor: 'move' }}
          className="text-slate-900"
          onMouseDown={(e) => handleDragStart('info', e)}
        >
          {scanInfo}
        </div>
        {/* Logo */}
        {t.options?.logoVisible !== false && (
          <div style={{ position: 'absolute', ...box(logo) }} className="rounded overflow-hidden">
            {t.logoUrl && isValidHttpUrl(t.logoUrl) ? (
              <img src={t.logoUrl} alt="logo" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-white flex items-center justify-center text-[12px] text-slate-900">LOGO</div>
            )}
          </div>
        )}
        {/* Obramowanie podglądu */}
        <div className="absolute inset-0 border border-slate-300 rounded pointer-events-none" />
      </div>
  );
}

export default LabelsManager;
