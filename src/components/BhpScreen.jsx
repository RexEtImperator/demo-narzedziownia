import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FixedSizeList as List } from 'react-window';
import { createPortal } from 'react-dom';
import { PencilSquareIcon, TrashIcon, EnvelopeIcon,  ArrowDownTrayIcon, ArrowUpIcon, ArrowDownIcon, QrCodeIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { exportListToPDF, exportListToXLSX, exportDetailsToPDF, exportDetailsToXLSX } from '../utils/bhpExport';
import api from '../api';
import { toast } from 'react-toastify';
import { PERMISSIONS, hasPermission } from '../constants';
import BarcodeScannerComponent from './BarcodeScanner';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { useLanguage } from '../contexts/LanguageContext';
import SkeletonList from './SkeletonList';
import { getBhpStatusInfo } from '../utils/statusUtils';
import ConfirmationModal from './ConfirmationModal';
import BhpForm from './bhp/BhpForm';
import { formatDate, formatDateOnly } from '../utils/dateUtils';

const QRCodeDisplay = ({ text }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  useEffect(() => {
    const run = async () => {
      if (!text) { setQrCodeUrl(''); return; }
      try {
        const url = await QRCode.toDataURL(text, {
          width: 300,
          margin: 1,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'H',
          quality: 1
        });
        setQrCodeUrl(url);
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrCodeUrl('');
      }
    };
    run();
  }, [text]);
  if (!qrCodeUrl) return <div>Generowanie kodu QR...</div>;
  return (
    <img 
      src={qrCodeUrl} 
      alt="QR Code" 
      className="w-32 h-32 border border-slate-200 rounded" 
      style={{ imageRendering: 'crisp-edges' }} 
      decoding="async"
    />
  );
};

const BarcodeDisplay = ({ text }) => {
  const [barcodeUrl, setBarcodeUrl] = useState('');
  useEffect(() => {
    const run = () => {
      if (!text) { setBarcodeUrl(''); return; }
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, text, {
          format: 'CODE128',
          width: 4,
          height: 100,
          fontSize: 16,
          margin: 10,
          font: 'Arial',
          fontOptions: 'bold'
        });
        setBarcodeUrl(canvas.toDataURL('image/png', 1.0));
      } catch (error) {
        console.error('Error generating barcode:', error);
        setBarcodeUrl('');
      }
    };
    run();
  }, [text]);
  if (!barcodeUrl) return <div>Generowanie kodu kreskowego...</div>;
  return (
    <img 
      src={barcodeUrl} 
      alt="Barcode" 
      className="border border-slate-200 rounded" 
      style={{ imageRendering: 'crisp-edges' }} 
      decoding="async"
    />
  );
};

function BhpScreen({ employees = [], user, initialSearchTerm = '' }) {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, _setSelectedStatus] = useState('');
  const [detailsItem, setDetailsItem] = useState(null);
  const [detailsData, setDetailsData] = useState(null);
  const [issueModal, setIssueModal] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [notifyModal, setNotifyModal] = useState(false);
  const [notifyItem, setNotifyItem] = useState(null);
  const [notifySending, setNotifySending] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [searchEmployee, setSearchEmployee] = useState('');
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'inventory_number', direction: 'asc' });
  const [bhpCodePrefix, setBhpCodePrefix] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [isPermanent, setIsPermanent] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
  const [activeStatsFilter, setActiveStatsFilter] = useState('all');
  const dropdownRef = useRef(null);

  const toggleDropdown = (id, rect, estimatedMenuHeightOverride) => {
    if (openDropdownId === id) {
      setOpenDropdownId(null);
    } else {
      if (rect) {
        const menuWidth = 224;
        const gap = 4;
        const estimatedMenuHeight = Number.isFinite(estimatedMenuHeightOverride)
          ? estimatedMenuHeightOverride
          : 200;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const desiredLeft = rect.right + scrollX - menuWidth;
        const minLeft = scrollX + 8;
        const maxLeft = scrollX + window.innerWidth - menuWidth - 8;
        const clampedLeft = Math.min(Math.max(desiredLeft, minLeft), Math.max(minLeft, maxLeft));
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUp = estimatedMenuHeight > spaceBelow && spaceAbove > spaceBelow;
        const desiredTop = openUp
          ? (rect.top + scrollY - estimatedMenuHeight - gap)
          : (rect.bottom + scrollY + gap);
        const minTop = scrollY + 8;
        setDropdownPosition({
          top: Math.max(desiredTop, minTop),
          left: clampedLeft,
          placement: openUp ? 'top' : 'bottom'
        });
      }
      setOpenDropdownId(id);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!openDropdownId) return;
    const handleScroll = (event) => {
      const dropdownEl = dropdownRef.current;
      if (dropdownEl && event?.target && dropdownEl.contains(event.target)) return;
      setOpenDropdownId(null);
    };
    const handleResize = () => setOpenDropdownId(null);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [openDropdownId]);

  const getButtonColorClasses = (status) => {
    switch(status) {
      case 'available':
        return 'from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 border-emerald-700/20';
      case 'issued':
        return 'from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 border-amber-600/20';
      case 'partially_issued':
        return 'from-lime-500 to-lime-400 hover:from-lime-600 hover:to-lime-500 border-lime-600/20';
      case 'permanent':
        return 'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 border-blue-700/20';
      case 'service':
        return 'from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 border-rose-700/20';
      case 'damaged':
        return 'from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 border-orange-700/20';
      default:
        return 'from-slate-600 to-slate-500 hover:from-slate-700 hover:to-slate-600 border-slate-700/20';
    }
  };

  const handleScanResult = useCallback((decodedText) => {
    if (decodedText) {
      setSearchTerm(decodedText);
      setShowBarcodeScanner(false);
      toast.success(t('common.scanSuccess'));
    }
  }, [t]);

  const handleScanError = useCallback(() => {
  }, []);

  // Load codePrefix from application configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await api.get('/api/config/general');
        setBhpCodePrefix(cfg?.bhpCodePrefix || '');
      } catch (err) {
        const msg = err?.messageKey ? t(err.messageKey) : (err?.message || t('BHP.errors.loadingConfig'));
        toast.error(msg);
      }
    };
    loadConfig();
  }, [t]);

  // Hints from existing health and safety items (without serial and registration numbers)
  const uniqueValues = useCallback((field) => {
    try {
      const vals = (items || []).map(i => i?.[field]).filter(v => !!v && String(v).trim() !== '');
      return Array.from(new Set(vals)).slice(0, 100);
    } catch (_) {
      return [];
    }
  }, [items]);

  const manufacturerOptions = useMemo(() => uniqueValues('manufacturer'), [uniqueValues]);
  const modelOptions = useMemo(() => uniqueValues('model'), [uniqueValues]);
  const catalogOptions = useMemo(() => uniqueValues('catalog_number'), [uniqueValues]);
  const shockAbsorberManufacturerOptions = useMemo(() => uniqueValues('shock_absorber_name'), [uniqueValues]);
  const shockAbsorberModelOptions = useMemo(() => uniqueValues('shock_absorber_model'), [uniqueValues]);
  const shockAbsorberCatalogOptions = useMemo(() => uniqueValues('shock_absorber_catalog_number'), [uniqueValues]);
  const srdManufacturerOptions = useMemo(() => uniqueValues('srd_manufacturer'), [uniqueValues]);
  const srdModelOptions = useMemo(() => uniqueValues('srd_model'), [uniqueValues]);
  const srdCatalogOptions = useMemo(() => uniqueValues('srd_catalog_number'), [uniqueValues]);

  // Set initial filter from deep-link if passed
  useEffect(() => {
    if (initialSearchTerm) {
      Promise.resolve().then(() => { setSearchTerm(initialSearchTerm); });
    }
  }, [initialSearchTerm]);

  // Handle search query param from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search');
    if (searchParam) {
      Promise.resolve().then(() => { setSearchTerm(searchParam); });
    }
  }, [location.search]);

  const notifiedRef = useRef(new Set());
  const dayWord = (n) => {
    const lang = String(localStorage.getItem('language') || 'pl').toLowerCase();
    const isOne = Math.abs(Number(n)) === 1;
    if (lang === 'pl') return isOne ? 'dzień' : 'dni';
    if (lang === 'de') return isOne ? 'Tag' : 'Tage';
    return isOne ? 'day' : 'days';
  };

  const getInspectionDiffDays = useCallback((inspection_date) => {
    if (!inspection_date) return null;
    const now = new Date();
    const insp = new Date(inspection_date);
    return Math.ceil((insp - now) / (1000 * 60 * 60 * 24));
  }, []);

  const isBhpExpired = useCallback((inspection_date) => {
    const diffDays = getInspectionDiffDays(inspection_date);
    return typeof diffDays === 'number' && diffDays < 0;
  }, [getInspectionDiffDays]);

  const canViewBhp = (
    hasPermission(user, PERMISSIONS.VIEW_BHP) ||
    hasPermission(user, PERMISSIONS.VIEW_BHP_HISTORY)
  );

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      if (!canViewBhp) {
        setItems([]);
        return;
      }
      const result = await api.get('/api/bhp?limit=10000');
      const list = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
      setItems(list);
      const notifyInspections = (list) => {
        (list || []).forEach(item => {
          if (!item?.inspection_date) return;
          const insp = new Date(item.inspection_date);
          const now = new Date();
          const diffDays = Math.ceil((insp - now) / (1000 * 60 * 60 * 24));
          const key = `${item.id}-${diffDays}`;
          if (notifiedRef.current.has(key)) return;
          if (diffDays <= 7 && diffDays >= 0) {
            toast.warn(t('BHP.notify.upcoming7Days', { number: item.inventory_number, days: diffDays, unit: dayWord(diffDays) }), { toastId: key });
            notifiedRef.current.add(key);
          } else if (diffDays <= 30 && diffDays >= 0) {
            toast.info(t('BHP.notify.upcoming30Days', { number: item.inventory_number, days: diffDays, unit: dayWord(diffDays) }), { toastId: key });
            notifiedRef.current.add(key);
          }
        });
      };
      notifyInspections(list);
    } catch (e) {
      const msg = e?.messageKey ? t(e.messageKey) : (e?.message || t('BHP.errors.fethingFailed'));
      toast.error(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canViewBhp, t]);

  useEffect(() => {
    if (!canViewBhp) {
      Promise.resolve().then(() => {
        setItems([]);
        setLoading(false);
      });
      return;
    }
    Promise.resolve().then(() => { fetchItems(); });
  }, [canViewBhp, fetchItems]);

  const openModal = useCallback((item = null) => {
    setEditingItem(item);
    setShowModal(true);
  }, []);

  // Prefill add modal from query param (newSku -> inventory_number)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const newSku = params.get('newSku');
      if (newSku && hasPermission(user, PERMISSIONS.MANAGE_BHP)) {
        Promise.resolve().then(() => {
          openModal({ inventory_number: newSku });
          navigate('/bhp', { replace: true });
        });
      }
    } catch (_) { /* noop */ }
  }, [location.search, user, navigate, openModal]);

  // Close Issue Modal on ESC
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && issueModal) {
        setIssueModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [issueModal]);



  const filteredItemsBase = useMemo(() => {
    return (items || []).filter(item => {
      const matchesSearch = !searchTerm || (
        item.inventory_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.catalog_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.nfc_tag_id?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesStatus = !selectedStatus || item.status === selectedStatus;
      
      let matchesStatsFilter = true;
      if (activeStatsFilter === 'expired') {
        matchesStatsFilter = isBhpExpired(item.inspection_date);
      } else if (activeStatsFilter === 'available') {
        matchesStatsFilter = item.status === 'available' && !isBhpExpired(item.inspection_date);
      } else if (activeStatsFilter === 'issued') {
        matchesStatsFilter = item.status === 'issued';
      } else if (activeStatsFilter === 'permanent') {
        matchesStatsFilter = item.status === 'permanent';
      }

      return matchesSearch && matchesStatus && matchesStatsFilter;
    });
  }, [items, searchTerm, selectedStatus, activeStatsFilter, isBhpExpired]);

  const stats = useMemo(() => {
    const all = items.length;
    const expired = items.filter(i => isBhpExpired(i.inspection_date)).length;
    const available = items.filter(i => i.status === 'available' && !isBhpExpired(i.inspection_date)).length;
    const issued = items.filter(i => i.status === 'issued').length;
    const permanent = items.filter(i => i.status === 'permanent').length;
    return { all, expired, available, issued, permanent };
  }, [items, isBhpExpired]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredItems = useMemo(() => {
    let data = [...filteredItemsBase];
    if (sortConfig.key) {
      data.sort((a, b) => {
        if (sortConfig.key === 'inventory_number') {
           const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
           const aVal = a.inventory_number || '';
           const bVal = b.inventory_number || '';
           if (!aVal && !bVal) return 0;
           if (!aVal) return 1;
           if (!bVal) return -1;
           return sortConfig.direction === 'asc' ? collator.compare(aVal, bVal) : collator.compare(bVal, aVal);
        }
        
        let aValue, bValue;
        if (sortConfig.key === 'manufacturer_model') {
           aValue = ((a.manufacturer || '') + (a.model || '')).toLowerCase();
           bValue = ((b.manufacturer || '') + (b.model || '')).toLowerCase();
        } else if (sortConfig.key === 'serial_catalog') {
           aValue = ((a.serial_number || '') + (a.catalog_number || '')).toLowerCase();
           bValue = ((b.serial_number || '') + (b.catalog_number || '')).toLowerCase();
        } else if (sortConfig.key === 'inspection_date') {
           aValue = a.inspection_date ? new Date(a.inspection_date).getTime() : 0;
           bValue = b.inspection_date ? new Date(b.inspection_date).getTime() : 0;
        } else {
           aValue = a[sortConfig.key] || '';
           bValue = b[sortConfig.key] || '';
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [filteredItemsBase, sortConfig]);

  if (!canViewBhp) {
    return (
      <div className="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Brak uprawnień</h3>
          <p className="text-slate-600 dark:text-slate-400">Brak uprawnień do przeglądania BHP (VIEW_BHP).</p>
        </div>
      </div>
    );
  }

  // --- Generatory QR i kodu kreskowego oraz podglądy ---
  const generateQRCode = async (text, width = 400) => {
    try {
      return await QRCode.toDataURL(text, {
        width,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
        quality: 1
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
      return null;
    }
  };

  const generateBarcode = (text) => {
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
      console.error('Error generating barcode:', error);
      return null;
    }
  };

  const computeCodeText = (inv) => {
    return (inv || '').toString();
  };

  const downloadBhpQrLabel = async (item) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = 4;
      canvas.width = 400 * scale;
      canvas.height = 300 * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = `bold ${26 * scale}px Arial`;
      const title = [item.manufacturer, item.model].filter(Boolean).join(' ');
      ctx.fillText(title || 'Sprzęt BHP', canvas.width / 2, 40 * scale);
      ctx.font = `${18 * scale}px Arial`;
      ctx.fillText(`Nr ew.: ${item.inventory_number || ''}`, canvas.width / 2, 70 * scale);
      const codeText = computeCodeText(item.inventory_number || '');
      const qrCodeUrl = await generateQRCode(codeText, 800);
      if (qrCodeUrl) {
        const qrImg = new Image();
        qrImg.onload = () => {
          const size = 200 * scale;
          const x = (canvas.width - size) / 2;
          const y = 90 * scale;
          ctx.drawImage(qrImg, x, y, size, size);
          const link = document.createElement('a');
          link.download = `etykieta-qr-bhp-${item.inventory_number || 'pozycja'}.png`;
          link.href = canvas.toDataURL('image/png', 1.0);
          link.click();
        };
        qrImg.src = qrCodeUrl;
      }
    } catch (error) {
      toast.error(error?.message || t('BHP.errors.qrGenerateFailed'));
    }
  };

  const downloadBhpBarcodeLabel = async (item) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = 4;
      canvas.width = 400 * scale;
      canvas.height = 300 * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = `bold ${26 * scale}px Arial`;
      const title = [item.manufacturer, item.model].filter(Boolean).join(' ');
      ctx.fillText(title || 'Sprzęt BHP', canvas.width / 2, 40 * scale);
      ctx.font = `${18 * scale}px Arial`;
      ctx.fillText(`Nr ew.: ${item.inventory_number || ''}`, canvas.width / 2, 70 * scale);
      const codeText = computeCodeText(item.inventory_number || '');
      const barcodeUrl = generateBarcode(codeText);
      if (barcodeUrl) {
        const barcodeImg = new Image();
        barcodeImg.onload = () => {
          const w = 300 * scale;
          const h = 110 * scale;
          const x = (canvas.width - w) / 2;
          const y = 110 * scale;
          ctx.drawImage(barcodeImg, x, y, w, h);
          const link = document.createElement('a');
          link.download = `etykieta-kreskowy-bhp-${item.inventory_number || 'pozycja'}.png`;
          link.href = canvas.toDataURL('image/png', 1.0);
          link.click();
        };
        barcodeImg.src = barcodeUrl;
      }
    } catch (error) {
      toast.error(error?.message || t('BHP.errors.barcodeGenerateFailed'));
    }
  };

  const handleFormSuccess = async (savedItem) => {
    // Update list locally
    setItems(prev => {
        const exists = prev.some(i => i.id === savedItem.id);
        if (exists) {
            return prev.map(i => i.id === savedItem.id ? savedItem : i);
        }
        return [...prev, savedItem];
    });

    // Refresh list from API to be sure
    await fetchItems();

    // Refresh details if open
    if (detailsItem && detailsItem.id === savedItem.id) {
        try {
            const freshDetails = await api.get(`/api/bhp/${savedItem.id}/details`);
            setDetailsData(freshDetails);
            setDetailsItem(prev => (prev ? { ...prev, ...savedItem } : prev));
        } catch (err) {
            console.error('Error refreshing details after save:', err);
        }
    }
  };

  const canManageBhp = hasPermission(user, PERMISSIONS.MANAGE_BHP);
  const canExportBhp = hasPermission(user, PERMISSIONS.EXPORT_BHP);

  const deleteItem = (id) => {
    if (!canManageBhp) {
      toast.error(t('BHP.actions.noPermission'));
      return;
    }
    setDeleteTargetId(id);
    setDeleteModalOpen(true);
  };

  const confirmDeleteItem = async () => {
    if (!deleteTargetId) return;
    try {
      setDeleteLoading(true);
      await api.delete(`/api/bhp/${deleteTargetId}`);
      setItems(prev => prev.filter(i => i.id !== deleteTargetId));
      toast.success(t('common.remove'));
    } catch (e) {
      const msg = e?.messageKey ? t(e.messageKey) : (e?.message || t('BHP.errors.detailsFetchFailed'));
      toast.error(msg);
    } finally {
      setDeleteLoading(false);
      setDeleteModalOpen(false);
      setDeleteTargetId(null);
    }
  };

  const openDetails = async (item) => {
    try {
      setDetailsItem(item);
      const data = await api.get(`/api/bhp/${item.id}/details`);
      setDetailsData(data);
    } catch (e) {
      const msg = e?.messageKey ? t(e.messageKey) : (e?.message || t('BHP.errors.issueFailed'));
      toast.error(msg);
    }
  };

  const openIssue = (item) => {
    if (item.inspection_date) {
      const now = new Date();
      const insp = new Date(item.inspection_date);
      const diffDays = Math.ceil((insp - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        toast.error(t('BHP.errors.overdueIssueBlocked') || 'Nie można wydać sprzętu - termin przeglądu minął!');
        return;
      }
    }
    setDetailsItem(item);
    setSelectedEmployeeId('');
    setSearchEmployee('');
    setEmployeeDropdownOpen(false);
    setIsPermanent(false);
    setIssueModal(true);
  };

  const employeesForIssue = (employees || [])
    .filter(emp => emp.status !== 'Zawieszony')
    .sort((a, b) => {
      const bnA = a.brand_number ? String(a.brand_number) : '';
      const bnB = b.brand_number ? String(b.brand_number) : '';
      return bnA.localeCompare(bnB, undefined, { numeric: true });
    });

  const filteredEmployeesForIssue = employeesForIssue.filter(emp => {
    const q = (searchEmployee || '').trim().toLowerCase();
    if (!q) return true;
    const brand = emp.brand_number ? String(emp.brand_number).toLowerCase() : '';
    const first = (emp.first_name || '').toLowerCase();
    const last = (emp.last_name || '').toLowerCase();
    const full = `${first} ${last}`.trim();
    return (
      brand.includes(q) ||
      first.includes(q) ||
      last.includes(q) ||
      full.includes(q)
    );
  });

  const confirmIssue = async () => {
    if (!canManageBhp) {
      toast.error(t('BHP.actions.noPermission'));
      return;
    }
    if (!selectedEmployeeId) { toast.error(t('common.selectEmployee')); return; }
    try {
      await api.post(`/api/bhp/${detailsItem.id}/issue`, { 
        employee_id: Number(selectedEmployeeId),
        is_permanent: isPermanent
      });
      setIssueModal(false);
      fetchItems();
    } catch (e) {
      toast.error(e?.message || t('BHP.errors.issueFailed'));
    }
  };

  const openReturn = async (item) => {
    setDetailsItem(item);
    try {
      const data = await api.get(`/api/bhp/${item.id}/details`);
      const active = (data.issues || []).find(issue => issue.status === 'issued' || issue.status === 'permanent');
      setActiveIssueId(active ? active.id : '');
      setReturnModal(true);
    } catch (e) {
      const msg = e?.messageKey ? t(e.messageKey) : (e?.message || t('BHP.errors.prepRetunFailed'));
      toast.error(msg);
    }
  };

  const openNotify = (item) => {
    setNotifyItem(item);
    setNotifyModal(true);
  };

  const confirmReturn = async () => {
    if (!canManageBhp) {
      toast.error(t('BHP.actions.noPermission'));
      return;
    }
    if (!activeIssueId) { toast.error(t('BHP.errors.noActiveIssue')); return; }
    try {
      await api.post(`/api/bhp/${detailsItem.id}/return`, { issue_id: Number(activeIssueId) });
      setReturnModal(false);
      fetchItems();
    } catch (e) {
      const msg = e?.messageKey ? t(e.messageKey) : (e?.message || t('BHP.errors.returnFailed'));
      toast.error(msg);
    }
  };

  const confirmNotify = async () => {
    if (!canManageBhp) {
      toast.error(t('BHP.actions.noPermission'));
      return;
    }
    if (!notifyItem) return;
    try {
      setNotifySending(true);
      let targetEmployeeId = null;
      let targetBrandNumber = '';
      try {
        const details = await api.get(`/api/bhp/${notifyItem.id}/details`);
        const issues = Array.isArray(details?.issues) ? details.issues : [];
        const active = issues.find(i => i.status === 'issued' || i.status === 'permanent') || issues[issues.length - 1];
        if (active && (active.employee_id || active.employeeId)) {
          targetEmployeeId = active.employee_id ?? active.employeeId;
          try {
            const emp = await api.get(`/api/employees/${targetEmployeeId}`);
            targetBrandNumber = emp?.brand_number || '';
          } catch (_) { void 0; }
        }
      } catch (_) { void 0; }
      await api.post(`/api/bhp/${notifyItem.id}/notify-return`, {
        message: t('topbar.returnRequest'),
        target_employee_id: targetEmployeeId || undefined,
        target_brand_number: targetBrandNumber || undefined
      });
      toast.success(t('BHP.notify.sent'));
      try { window.dispatchEvent(new CustomEvent('notifications:refresh', { detail: { source: 'local' } })); } catch (_) { /* noop */ }
      setNotifyModal(false);
      setNotifyItem(null);
    } catch (e) {
      const msg = e?.messageKey ? t(e.messageKey) : (e?.message || t('BHP.notify.error'));
      toast.error(msg);
    } finally {
      setNotifySending(false);
    }
  };
  if (loading) {
    return (
      <div className="p-6">
        <SkeletonList rows={12} cols={6} />
      </div>
    );
  }

  const warningTapeBg = 'repeating-linear-gradient(135deg, rgba(220, 38, 38, 0.10) 0px, rgba(220, 38, 38, 0.10) 18px, rgba(255, 255, 255, 0.10) 18px, rgba(255, 255, 255, 0.10) 36px)';

  const renderReminderBadge = (inspection_date) => {
    if (!inspection_date) return null;
    const diffDays = getInspectionDiffDays(inspection_date);
    if (typeof diffDays !== 'number') return null;
    const statusClass = diffDays < 0
      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
      : (diffDays <= 30
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300');
    const label = diffDays < 0
      ? `Po terminie (${Math.abs(diffDays)} ${dayWord(diffDays)})`
      : `Przegląd za ${diffDays} ${dayWord(diffDays)}`;
    return (
      <span className={`inline-flex px-2 py-1 text-md font-medium rounded-full ${statusClass}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="px-6 pb-6 bg-white dark:bg-slate-900">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('BHP.title')}</h1>
          <p className="text-slate-600 dark:text-slate-400">{t('BHP.manageDescription')}</p>
        </div>

        <div className="flex gap-4 mx-8 flex-1 justify-center max-w-4xl">
          <button 
            onClick={() => setActiveStatsFilter('all')}
            className={`flex flex-col items-center px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg min-w-[120px] transition-all duration-200 cursor-pointer ${activeStatsFilter === 'all' ? 'border-2 border-slate-400 dark:border-slate-500 shadow-md transform scale-105' : 'border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
          >
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Wszystkie</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{stats.all}</span>
          </button>
          <button 
            onClick={() => setActiveStatsFilter('expired')}
            className={`flex flex-col items-center px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg min-w-[120px] transition-all duration-200 cursor-pointer ${activeStatsFilter === 'expired' ? 'border-2 border-red-500 shadow-md transform scale-105' : 'border border-red-100 dark:border-red-900/30 hover:border-red-300 dark:hover:border-red-700/50'}`}
          >
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">Przeterminowane</span>
            <span className="text-xl font-bold text-red-700 dark:text-red-300">{stats.expired}</span>
          </button>
          <button 
            onClick={() => setActiveStatsFilter('available')}
            className={`flex flex-col items-center px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg min-w-[120px] transition-all duration-200 cursor-pointer ${activeStatsFilter === 'available' ? 'border-2 border-green-500 shadow-md transform scale-105' : 'border border-green-100 dark:border-green-900/30 hover:border-green-300 dark:hover:border-green-700/50'}`}
          >
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Dostępne</span>
            <span className="text-xl font-bold text-green-700 dark:text-green-300">{stats.available}</span>
          </button>
          <button 
            onClick={() => setActiveStatsFilter('issued')}
            className={`flex flex-col items-center px-4 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg min-w-[120px] transition-all duration-200 cursor-pointer ${activeStatsFilter === 'issued' ? 'border-2 border-amber-500 shadow-md transform scale-105' : 'border border-amber-100 dark:border-amber-900/30 hover:border-amber-300 dark:hover:border-amber-700/50'}`}
          >
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Wydane</span>
            <span className="text-xl font-bold text-amber-700 dark:text-amber-300">{stats.issued}</span>
          </button>
          <button 
            onClick={() => setActiveStatsFilter('permanent')}
            className={`flex flex-col items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg min-w-[120px] transition-all duration-200 cursor-pointer ${activeStatsFilter === 'permanent' ? 'border-2 border-blue-500 shadow-md transform scale-105' : 'border border-blue-100 dark:border-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700/50'}`}
          >
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Na stałe</span>
            <span className="text-xl font-bold text-blue-700 dark:text-blue-300">{stats.permanent}</span>
          </button>
        </div>

        {canManageBhp ? (
          <button
            onClick={() => openModal()}
            className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 whitespace-nowrap"
          >
            {t('BHP.actions.addEquipment')}
          </button>
        ) : null}
      </div>

      {/* Filtry */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="bhpSearch" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 sharp-text">{t('BHP.filters.search')}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="bhpSearch"
                  name="bhpSearch"
                  type="text"
                  placeholder={t('BHP.filters.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-10 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sharp-text"
                />
                {searchTerm && (
                  <button
                    type="button"
                    aria-label={t('common.clearInput')}
                    title={t('common.clearInput')}
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowBarcodeScanner(true)}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600"
                title={t('common.scanQr') || 'Skanuj kod'}
              >
                <QrCodeIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
        {canExportBhp && (
          <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
            <button
              type="button"
              onClick={() => exportListToPDF(filteredItems || [], t)}
              className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white rounded-lg dark:text-slate-700 hover:opacity-70 sharp-text text-sm font-medium"
            >
              {t('common.export.PDF')}
            </button>
            <button
              type="button"
              onClick={() => exportListToXLSX(filteredItems || [], t)}
              className="px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 sharp-text text-sm font-medium"
            >
              {t('common.export.EXCEL')}
            </button>
          </div>
        )}
      </div>

      {/* Widok desktop (tabela) */}
      <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700 border-l-4 border-slate-50 dark:border-slate-700">
            <tr>
              <th 
                onClick={() => handleSort('inventory_number')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('BHP.table.inventoryShort')}
                  {sortConfig.key === 'inventory_number' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('manufacturer_model')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('BHP.table.manufacturerModel')}
                  {sortConfig.key === 'manufacturer_model' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('serial_catalog')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('BHP.table.serialCatalog')}
                  {sortConfig.key === 'serial_catalog' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('inspection_date')}
                className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-1">
                  {t('BHP.table.inspection')}
                  {sortConfig.key === 'inspection_date' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </th>
              <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100">{t('BHP.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
            {filteredItems.map(item => {
              const { statusBorderColor } = getBhpStatusInfo(item, t);
              const isIssued = item.status === 'issued' || item.status === 'permanent';
              const showReturn = isIssued;
              const buttonColorClasses = getButtonColorClasses(item.status);
              const isOpen = openDropdownId === item.id;
              const expired = isBhpExpired(item.inspection_date);
              const issueDisabled = expired && !showReturn;
              const rowStyle = {
                borderLeft: '4px solid',
                borderLeftColor: statusBorderColor,
                ...(expired ? { backgroundImage: warningTapeBg } : {})
              };
              
              return (
              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer" onClick={() => openDetails(item)} style={rowStyle}>
                <td className="p-4 font-mono text-sm text-slate-700 dark:text-slate-200">{item.inventory_number}</td>
                <td className="p-4 text-slate-700 dark:text-slate-200">
                  <div className="font-large">{item.manufacturer || '-'} {item.model ? `— ${item.model}` : ''}</div>
                  {item.is_set ? (
                    <div className="text-md text-slate-500 dark:text-slate-400">
                      {(() => {
                        const parts = [];
                        const hasShock = !!(item.shock_absorber_name || item.shock_absorber_model || item.shock_absorber_serial || item.shock_absorber_catalog_number);
                        const hasSrd = !!(item.srd_manufacturer || item.srd_model || item.srd_serial_number || item.srd_catalog_number);
                        if (hasShock) {
                          parts.push(`${t('BHP.set.shock')} ${item.shock_absorber_name || '-'} ${item.shock_absorber_model || ''} • ${t('BHP.labels.numberAbbrev')} ${item.shock_absorber_serial || '-'} • ${t('BHP.labels.catalogAbbrev')} ${item.shock_absorber_catalog_number || '-'}`.trim());
                        }
                        if (hasSrd) {
                          parts.push(`${t('BHP.set.srd')} ${item.srd_manufacturer || '-'} ${item.srd_model || ''} • ${t('BHP.labels.numberAbbrev')} ${item.srd_serial_number || '-'} • ${t('BHP.labels.catalogAbbrev')} ${item.srd_catalog_number || '-'}`.trim());
                        }
                        const summary = parts.length ? parts.join(' | ') : '-';
                        return `${t('BHP.set.label')}: ${summary}`;
                      })()}
                    </div>
                  ) : null}
                  {item.assigned_employee_first_name || item.assigned_employee_last_name ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('BHP.labels.assignedLabel')}: {item.assigned_employee_first_name || ''} {item.assigned_employee_last_name || ''}</div>
                  ) : null}
                </td>
                <td className="p-4 text-slate-700 dark:text-slate-200">
                  <div>{item.serial_number || '-'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t('BHP.labels.catalogAbbrev')}: {item.catalog_number || '-'}</div>
                </td>
                <td className="p-4">
                  <div className="text-slate-700 dark:text-slate-200">{item.inspection_date ? formatDateOnly(item.inspection_date) : '-'}</div>
                  <div className="mt-1">{renderReminderBadge(item.inspection_date)}</div>
                </td>
                
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    {canManageBhp ? (
                      <div className="relative">
                        <div className="flex rounded-md shadow-sm">
                          <button 
                            disabled={issueDisabled}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (issueDisabled) return;
                              if (showReturn) openReturn(item);
                              else openIssue(item);
                            }} 
                            className={`px-3 py-1.5 text-sm font-medium rounded-l-md transition-all shadow-sm bg-gradient-to-r text-white ${buttonColorClasses} ${issueDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            {showReturn ? t('BHP.actions.return') : t('BHP.actions.issue')}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const estimatedMenuHeight = showReturn ? 164 : 118;
                              toggleDropdown(item.id, rect, estimatedMenuHeight);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`px-1 py-1.5 border-l rounded-r-md transition-all shadow-sm bg-gradient-to-r text-white ${buttonColorClasses}`}
                          >
                            <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>

                        {isOpen && createPortal(
                          <div
                            ref={dropdownRef}
                            style={{
                              position: 'absolute',
                              top: dropdownPosition.top,
                              left: dropdownPosition.left,
                              zIndex: 9999
                            }}
                            className="w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); openModal(item); toggleDropdown(null); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                              {t('BHP.actions.edit')}
                            </button>
                            
                            {showReturn && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openNotify(item); toggleDropdown(null); }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                                >
                                  <EnvelopeIcon className="h-4 w-4" />
                                  {t('BHP.actions.notifyReturn')}
                                </button>
                            )}

                            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                            
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteItem(item.id); toggleDropdown(null); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                            >
                              <TrashIcon className="h-4 w-4" />
                              {t('BHP.actions.delete')}
                            </button>
                          </div>,
                          document.body
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t('BHP.actions.noPermission')}</span>
                    )}
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {Array.isArray(filteredItems) && filteredItems.length > 0 ? (
          <List
            height={Math.min(800, Math.max(320, filteredItems.length * 240))}
            itemCount={filteredItems.length}
            itemSize={240}
            width={'100%'}
            itemData={filteredItems}
          >
            {({ index, style, data }) => {
              const item = data[index];
              const { statusBorderColor } = getBhpStatusInfo(item, t);
              const isIssued = item.status === 'issued' || item.status === 'permanent';
              const expired = isBhpExpired(item.inspection_date);
              const issueDisabled = expired && !isIssued;
              const cardStyle = {
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                borderLeftColor: statusBorderColor,
                ...(expired ? { backgroundImage: warningTapeBg } : {})
              };
              return (
                <div style={style} className="divide-y divide-slate-200 dark:divide-slate-600">
                  <div
                    key={item.id}
                    className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-800"
                    onClick={() => openDetails(item)}
                    style={cardStyle}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.manufacturer || '-'} {item.model ? `— ${item.model}` : ''}
                        </div>
                        {item.is_set ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {t('BHP.set.label')}: {t('BHP.set.shock')} {item.shock_absorber_name || '-'} {item.shock_absorber_model || ''} • {t('BHP.labels.numberAbbrev')} {item.shock_absorber_serial || '-'} • {t('BHP.labels.catalogAbbrev')} {item.shock_absorber_catalog_number || '-'}
                          </div>
                        ) : null}
                        {item.assigned_employee_first_name || item.assigned_employee_last_name ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {t('BHP.labels.assignedLabel')}: {item.assigned_employee_first_name || ''} {item.assigned_employee_last_name || ''}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">{t('BHP.labels.inventoryLabel')}:</span>
                        <span className="text-slate-900 dark:text-slate-100 font-mono text-xs">{item.inventory_number || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">{t('BHP.labels.serialLabel')}:</span>
                        <span className="text-slate-900 dark:text-slate-100">{item.serial_number || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">{t('BHP.labels.catalogLabel')}:</span>
                        <span className="text-slate-900 dark:text-slate-100">{item.catalog_number || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">{t('BHP.labels.inspectionLabel')}:</span>
                        <span className="text-slate-900 dark:text-slate-100">{item.inspection_date ? formatDateOnly(item.inspection_date) : '-'}</span>
                      </div>
                      <div>
                        {renderReminderBadge(item.inspection_date)}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-600" onClick={(e) => e.stopPropagation()}>
                      {canManageBhp ? (
                        <>
                          <button
                            onClick={() => openModal(item)}
                            className="flex-1 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300 py-2 px-3 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors text-sm font-medium"
                          >
                            {t('BHP.actions.edit')}
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="flex-1 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300 py-2 px-3 rounded-lg hover:bg-red-100 dark:hover:bg-red-800 transition-colors text-sm font-medium"
                          >
                            {t('BHP.actions.delete')}
                          </button>
                          {item.status !== 'issued' && item.status !== 'permanent' ? (
                            <button
                              disabled={issueDisabled}
                              onClick={() => { if (!issueDisabled) openIssue(item); }}
                              className={`flex-1 bg-emerald-50 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 py-2 px-3 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-800 transition-colors text-sm font-medium ${issueDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              {t('BHP.actions.issue')}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => openReturn(item)}
                                className="flex-1 bg-orange-50 dark:bg-orange-900 text-orange-600 dark:text-orange-300 py-2 px-3 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-800 transition-colors text-sm font-medium"
                              >
                                {t('BHP.actions.return')}
                              </button>
                              <button
                                onClick={() => openNotify(item)}
                                className="flex-1 bg-indigo-50 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 py-2 px-3 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors text-sm font-medium"
                              >
                                {t('BHP.actions.notifyReturn')}
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{t('BHP.actions.noPermission')}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          </List>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-600"></div>
        )}
      </div>

      {/* Modal dodawania/edycji */}
      <BhpForm
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleFormSuccess}
        initialData={editingItem}
        suggestions={{
          manufacturerOptions,
          modelOptions,
          catalogOptions,
          shockAbsorberManufacturerOptions,
          shockAbsorberModelOptions,
          shockAbsorberCatalogOptions,
          srdManufacturerOptions,
          srdModelOptions,
          srdCatalogOptions
        }}
        bhpCodePrefix={bhpCodePrefix}
      />

      {/* Modal szczegółów */}
      {detailsItem && detailsData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) { setDetailsItem(null); setDetailsData(null); } }}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Szczegóły BHP: {detailsItem.inventory_number}</h2>
              <div className="flex items-center gap-3">
                {canExportBhp && (
                  <>
                    <button
                      onClick={() => exportDetailsToPDF(detailsItem, detailsData, t)}
                      className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white rounded-lg dark:text-slate-700 hover:opacity-90 sharp-text text-sm font-medium"
                    >
                      {t('common.export.PDF')}
                    </button>
                    <button
                      onClick={() => exportDetailsToXLSX(detailsItem, detailsData, t)}
                      className="px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 sharp-text text-sm font-medium"
                    >
                      {t('common.export.EXCEL')}
                    </button>
                  </>
                )}
                <button onClick={() => { setDetailsItem(null); setDetailsData(null); }} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><span className="text-2xl">×</span></button>
              </div>
            </div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-400 dark:text-slate-400">Producent</span>
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {detailsData.manufacturer || '-'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-400 dark:text-slate-400">Model</span>
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {detailsData.model || '-'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Nr seryjny</span>
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {detailsData.serial_number || '-'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Nr katalogowy</span>
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {detailsData.catalog_number || '-'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Data produkcji</span>
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {detailsData.production_date
                        ? formatDateOnly(detailsData.production_date)
                        : '-'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Rozpoczęcie użytkowania
                    </span>
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {detailsData.harness_start_date
                        ? formatDateOnly(detailsData.harness_start_date)
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Przegląd</span>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {detailsData.inspection_date
                          ? formatDateOnly(detailsData.inspection_date)
                          : '-'}
                      </div>
                      <div className="shrink-0">
                        {renderReminderBadge(detailsData.inspection_date)}
                      </div>
                    </div>
                  </div>
                </div>

                {(() => {
                  const hasShock = !!(
                    detailsData.shock_absorber_name ||
                    detailsData.shock_absorber_model ||
                    detailsData.shock_absorber_serial ||
                    detailsData.shock_absorber_catalog_number ||
                    detailsData.shock_absorber_production_date
                  );
                  const hasSrd = !!(
                    detailsData.srd_manufacturer ||
                    detailsData.srd_model ||
                    detailsData.srd_catalog_number ||
                    detailsData.srd_production_date ||
                    detailsData.srd_serial_number
                  );
                  return (
                    <>
                      {hasShock ? (
                        <div className="mt-6">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Amortyzator
                            </div>
                            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Producent
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.shock_absorber_name || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Model
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.shock_absorber_model || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Nr seryjny
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.shock_absorber_serial || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Nr katalogowy
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.shock_absorber_catalog_number || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Data produkcji
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.shock_absorber_production_date
                                  ? formatDateOnly(detailsData.shock_absorber_production_date)
                                  : '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {hasSrd ? (
                        <div className="mt-6">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Urządzenie samohamowne
                            </div>
                            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Producent
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.srd_manufacturer || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Model
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.srd_model || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Nr seryjny
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.srd_serial_number || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Nr katalogowy
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.srd_catalog_number || '-'}
                              </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-4 py-3 flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Data produkcji
                              </span>
                              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {detailsData.srd_production_date
                                  ? formatDateOnly(detailsData.srd_production_date)
                                  : '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
              <div>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {canManageBhp && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Kod QR</h3>
                      <button
                        onClick={() => downloadBhpQrLabel(detailsItem)}
                        className="bg-blue-600 dark:bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors flex items-center justify-center"
                        aria-label={t('tools.qr.downloadLabel')}
                        title={t('tools.qr.downloadLabel')}
                      >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                        <span className="sr-only">{t('tools.qr.downloadLabel')}</span>
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <QRCodeDisplay text={computeCodeText(detailsItem.inventory_number)} />
                    </div>
                  </div>
                  )}
                  {canManageBhp && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Kod kreskowy</h3>
                      <button
                        onClick={() => downloadBhpBarcodeLabel(detailsItem)}
                        className="bg-blue-600 dark:bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors flex items-center justify-center"
                        aria-label={t('tools.barcode.downloadLabel')}
                        title={t('tools.barcode.downloadLabel')}
                      >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                        <span className="sr-only">{t('tools.barcode.downloadLabel')}</span>
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <BarcodeDisplay text={computeCodeText(detailsItem.inventory_number)} />
                    </div>
                  </div>
                  )}
                </div>
                {canManageBhp && (
                  <div className="mt-4">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-700">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Historia wydań/zwrotów</h3>
                      <div className="space-y-2">
                        {(detailsData.issues || []).length === 0 ? (
                          <div className="text-md text-slate-500 dark:text-slate-400">Brak wpisów</div>
                        ) : (
                          detailsData.issues.map((issue) => {
                            const name = `${issue.employee_first_name || ''} ${issue.employee_last_name || ''}`.trim();
                            const brand = issue.employee_brand_number || '';
                            const qParam = brand || name;
                            const statusLabel =
                              issue.status === 'issued'
                                ? 'Wydano'
                                : issue.status === 'permanent'
                                ? 'Wydano - na stałe'
                                : 'Zwrócono';
                            return (
                              <div key={issue.id} className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                  <div className="text-md text-slate-900 dark:text-slate-100">
                                    {statusLabel} —{' '}
                                    <button
                                      type="button"
                                      className="text-blue-600 dark:text-blue-300 hover:underline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        try {
                                          window.dispatchEvent(
                                            new CustomEvent('navigate', {
                                              detail: { url: `/employees?q=${encodeURIComponent(qParam)}` },
                                            }),
                                          );
                                        } catch (_) { void 0; }
                                      }}
                                    >
                                      {brand ? ` [${brand}]` : ''} {name || 'Nieznany pracownik'}
                                    </button>
                                  </div>
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                  {issue.issued_at
                                    ? formatDate(issue.issued_at)
                                    : '-'}
                                  {issue.returned_at
                                    ? ` • Zwrot: ${formatDate(issue.returned_at)}`
                                    : ''}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal wydania */}
      {issueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) setIssueModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Wydaj sprzęt BHP</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Pracownik</label>
                <input
                  type="text"
                  id="bhp-employee-search"
                  name="bhp-employee-search"
                  autoComplete="off"
                  value={searchEmployee}
                  onFocus={() => setEmployeeDropdownOpen(true)}
                  onClick={() => setEmployeeDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchEmployee(e.target.value);
                    setSelectedEmployeeId('');
                    setEmployeeDropdownOpen(true);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Wyszukaj pracownika (imię, nazwisko, numer)"
                />
                {employeeDropdownOpen && (
                  <div className="mt-2 max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800">
                    {filteredEmployeesForIssue.map(emp => {
                      const idStr = String(emp.id);
                      const label = `${emp.brand_number ? `[${emp.brand_number}] ` : ''}${emp.first_name || ''} ${emp.last_name || ''}`.trim();
                      return (
                        <div
                          key={emp.id}
                          onClick={() => {
                            setSelectedEmployeeId(idStr);
                            setSearchEmployee(label);
                            setEmployeeDropdownOpen(false);
                          }}
                          className={`px-3 py-2 text-sm cursor-pointer text-slate-900 dark:text-slate-100 ${
                            selectedEmployeeId === idStr
                              ? 'bg-blue-100 dark:bg-blue-900'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {label}
                        </div>
                      );
                    })}
                    {filteredEmployeesForIssue.length === 0 && (searchEmployee || '').trim() !== '' && (
                      <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Brak wyników</div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="issuePermanent"
                  checked={isPermanent}
                  onChange={(e) => setIsPermanent(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-700"
                />
                <label htmlFor="issuePermanent" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Wydać na stałe?
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIssueModal(false)} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg">Anuluj</button>
                <button type="button" onClick={confirmIssue} className="flex-1 px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg">Wydaj</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal zwrotu */}
      {returnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) setReturnModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Zwrot sprzętu BHP</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                {!activeIssueId ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Brak aktywnego wydania do zwrotu</div>
                ) : (
                  <div className="text-sm text-slate-700 dark:text-slate-200">Wydanie ID: {activeIssueId}</div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setReturnModal(false)} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg">Anuluj</button>
                <button onClick={confirmReturn} disabled={!activeIssueId} className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded-lg disabled:opacity-50">Zwróć</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal powiadomienia o zwrocie */}
      {notifyModal && notifyItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) setNotifyModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('BHP.actions.notifyReturn')}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-700 dark:text-slate-200">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{t('BHP.labels.inventoryLabel')}:</span><span className="text-slate-900 dark:text-slate-100 font-mono text-xs">{notifyItem.inventory_number || '-'}</span></div>
                <div className="flex justify-between mt-1"><span className="text-slate-500 dark:text-slate-400">{t('BHP.labels.assigned')}:</span><span className="text-slate-900 dark:text-slate-100">{(notifyItem.assigned_employee_first_name || notifyItem.assigned_employee_last_name) ? `${notifyItem.assigned_employee_first_name || ''} ${notifyItem.assigned_employee_last_name || ''}`.trim() : '-'}</span></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setNotifyModal(false)} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg">{t('common.cancel')}</button>
                <button onClick={confirmNotify} disabled={notifySending} className="flex-1 px-4 py-2 bg-indigo-600 dark:bg-indigo-700 text-white rounded-lg disabled:opacity-50">{t('confirmation.confirm')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => { if (!deleteLoading) setDeleteModalOpen(false); }}
        onConfirm={confirmDeleteItem}
        title={t('confirmation.title')}
        message={t('confirmation.message')}
        confirmText={t('common.remove')}
        cancelText={t('common.cancel')}
        type="danger"
        loading={deleteLoading}
      />

      {/* Komponent skanera kodów */}
      <BarcodeScannerComponent
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleScanResult}
        onError={handleScanError}
        displayQuantity={false}
      />
    </div>
  );
}

export default BhpScreen;
