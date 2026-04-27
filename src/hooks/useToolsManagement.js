import { useState, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import api from '../api';
import { sanitizeObject } from '../utils/sanitize';
import { buildToolPayloadForApi } from '../utils/toolPayload';

export const useToolsManagement = ({
  t,
  tools,
  addTool,
  updateTool,
  deleteTool,
  sendToService,
  receiveFromService,
  notifyReturn,
  notifySuccess,
  notifyError,
  notifyInfo,
  toolsCodePrefix,
  canManageTools,
  onSuccess
}) => {
  // State
  const [showModal, setShowModal] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [slingItems, setSlingItems] = useState([]);
  const [socketItems, setSocketItems] = useState([]);
  const [detectorsItems, setDetectorsItems] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    manufacturer: '',
    model: '',
    production_year: '',
    sku: '',
    sku_unreadable: false,
    nfc_tag_id: '',
    location: '',
    description: '',
    status: 'available',
    quantity: 1,
    min_stock: '',
    max_stock: '',
    is_consumable: false,
    serial_number: '',
    serial_unreadable: false,
    inspection_date: '',
    production_date: ''
  });
  const [errors, setErrors] = useState({});
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceFormData, setServiceFormData] = useState({ quantity: 1, orderNumber: '' });
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [notifyTool, setNotifyTool] = useState(null);
  const [notifyModal, setNotifyModal] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteLoading, setConfirmDeleteLoading] = useState(false);

  // Issue/Return Modal State
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [selectedToolForIssue, setSelectedToolForIssue] = useState(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedToolForReturn, setSelectedToolForReturn] = useState(null);

  // Tooltip State
  const [hoveredToolId, setHoveredToolId] = useState(null);
  const [issueTooltipPos, setIssueTooltipPos] = useState({ top: 0, left: 0 });
  const [tooltipPinned, setTooltipPinned] = useState(false);
  const tooltipHideTimerRef = useRef(null);
  const suppressTooltipRef = useRef(false);

  // Tooltip Handlers
  const handleToolHover = useCallback((tool, event) => {
    if (tooltipHideTimerRef.current) {
      try { clearTimeout(tooltipHideTimerRef.current); } catch (_) { /* noop */ }
    }
    setHoveredToolId(tool.id);
    const gap = 12;
    const widthPx = 600;
    const cx = event.clientX;
    const cy = event.clientY;
    const left = Math.min(Math.max(gap, cx + gap), Math.max(gap, window.innerWidth - widthPx - gap));
    const top = Math.min(Math.max(gap, cy + gap), Math.max(gap, window.innerHeight - 380));
    setIssueTooltipPos({ top, left });
  }, []);

  const handleToolLeave = useCallback(() => {
    if (tooltipHideTimerRef.current) {
      try { clearTimeout(tooltipHideTimerRef.current); } catch (_) { /* noop */ }
    }
    tooltipHideTimerRef.current = setTimeout(() => {
      if (!tooltipPinned) setHoveredToolId(null);
    }, 400);
  }, [tooltipPinned]);

  const handleTooltipEnter = useCallback(() => {
    setTooltipPinned(true);
    if (tooltipHideTimerRef.current) {
      try { clearTimeout(tooltipHideTimerRef.current); } catch (_) { /* noop */ }
    }
  }, []);

  const handleTooltipLeave = useCallback(() => {
    setTooltipPinned(false);
    setHoveredToolId(null);
  }, []);

  const handleActionsHover = useCallback(() => {
    suppressTooltipRef.current = true;
    if (tooltipHideTimerRef.current) {
      try { clearTimeout(tooltipHideTimerRef.current); } catch (_) { /* noop */ }
    }
    setHoveredToolId(null);
  }, []);

  const handleActionsLeave = useCallback(() => {
    suppressTooltipRef.current = false;
  }, []);


  // Modal handlers
  const handleOpenModal = useCallback((tool = null) => {
    if (tool) {
      setEditingTool(tool);
      setSlingItems(Array.isArray(tool.slingItems) ? tool.slingItems : []);
      setSocketItems([]);
      setDetectorsItems([]);
      setFormData({
        name: tool.name || '',
        category: tool.category || '',
        manufacturer: tool.manufacturer || '',
        model: tool.model || '',
        production_year: tool.production_year || '',
        sku: tool.sku || '',
        sku_unreadable: tool.sku === null ? 1 : 0,
        nfc_tag_id: tool.nfc_tag_id || '',
        inventory_number: tool.inventory_number || '',
        location: tool.location || '',
        description: tool.description || '',
        status: tool.status || 'available',
        quantity: tool.quantity || 1,
        min_stock: tool.min_stock || '',
        max_stock: tool.max_stock || '',
        is_consumable: tool.is_consumable ? 1 : 0,
        serial_number: tool.serial_number || '',
        serial_unreadable: tool.serial_number === null ? 1 : 0,
        inspection_date: tool.inspection_date ? tool.inspection_date.split('T')[0] : '',
        production_date: tool.production_date || ''
      });
    } else {
      setEditingTool(null);
      setSlingItems([]);
      setSocketItems([]);
      setDetectorsItems([]);
      setFormData({
        name: '',
        category: '',
        manufacturer: '',
        model: '',
        production_year: '',
        sku: '',
        sku_unreadable: 0,
        nfc_tag_id: '',
        inventory_number: '',
        location: '',
        description: '',
        status: 'available',
        quantity: 1,
        min_stock: '',
        max_stock: '',
        is_consumable: 0,
        serial_number: '',
        serial_unreadable: 0,
        inspection_date: '',
        production_date: ''
      });
      // Generate SKU if needed
      if (toolsCodePrefix) {
        setFormData(prev => ({ ...prev, sku: `${toolsCodePrefix}-` }));
      }
    }
    setErrors({});
    setShowModal(true);
  }, [toolsCodePrefix]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditingTool(null);
    setErrors({});
  }, []);

  const handleOpenDetailsModal = useCallback((tool) => {
    setSelectedTool(tool);
    setShowDetailsModal(true);
  }, []);

  const handleCloseDetailsModal = useCallback(() => {
    setShowDetailsModal(false);
    setSelectedTool(null);
  }, []);

  // Form handlers
  const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value
    }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [errors]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = t('tools.validation.nameRequired');
    if (!formData.category.trim()) newErrors.category = t('tools.validation.categoryRequired');
    const cat = String(formData.category || '').trim().toLowerCase();
    const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat);
    const isSockets = ['nasadki 1"', 'nasadki 1/2"'].includes(cat);
    const isDetectors = cat === 'detektory';
    if (!isSlings && !isSockets && !isDetectors) {
      if (!formData.quantity || formData.quantity < 1) newErrors.quantity = t('tools.validation.quantityMin');
    } else {
      // Slings validation - only require items when adding new tool, not when editing
      if (!editingTool && (!slingItems || slingItems.length === 0)) {
        // newErrors.submit = t('slings.validation.minItems') || 'Dodaj przynajmniej jeden element do podpozycji.';
        // Allow adding slings without items initially if needed, or enforce only on creation
        // But user said: "każe dodać podpozycje jak nie chce dodawać podpozycji"
        // So we relax this validation for edit mode.
      }
    }
    
    // Check duplicates
    if (!editingTool) {
      const isDuplicate = tools.some(t => 
        t.name.toLowerCase() === formData.name.trim().toLowerCase() && 
        t.sku === formData.sku.trim()
      );
      if (isDuplicate) newErrors.submit = t('tools.validation.duplicate');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, tools, editingTool, t, slingItems]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload = buildToolPayloadForApi(formData, toolsCodePrefix);

    try {
      const cat = String(payload.category || '').trim().toLowerCase();
      if (editingTool) {
        await updateTool({ id: editingTool.id, data: payload });
        
        // Handle sling items for editing (adding new items)
        if (['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat) && slingItems.length > 0) {
          try {
             await api.post(`/api/slings/by-tool/${editingTool.id}`, slingItems);
          } catch (err) {
             console.error('Failed to add sling items', err);
             notifyError(t('slings.errors.itemsFailed') || 'Narzędzie zaktualizowano, ale wystąpił błąd przy dodawaniu podpozycji.');
          }
        }

        if (['nasadki 1"', 'nasadki 1/2"'].includes(cat) && socketItems.length > 0) {
          try {
            await api.post(`/api/impact-sockets/by-tool/${editingTool.id}`, socketItems);
          } catch (err) {
            console.error('Failed to add socket items', err);
            notifyError(err?.response?.data?.message || err?.message || 'Narzędzie zaktualizowano, ale wystąpił błąd przy dodawaniu podpozycji.');
          }
        }

        if (cat === 'detektory' && detectorsItems.length > 0) {
          try {
            await api.post(`/api/detectors/by-tool/${editingTool.id}`, detectorsItems);
          } catch (err) {
            console.error('Failed to add detectors items', err);
            notifyError(err?.response?.data?.message || err?.message || 'Narzędzie zaktualizowano, ale wystąpił błąd przy dodawaniu podpozycji.');
          }
        }
        
        notifySuccess(t('tools.notifications.updateSuccess'));
      } else {
        if (['nasadki 1"', 'nasadki 1/2"'].includes(cat)) {
          const sum = (socketItems || []).reduce((acc, row) => acc + Math.max(1, parseInt(row.quantity || 1, 10)), 0);
          payload.quantity = sum || 1;
        }
        const response = await addTool(payload);
        
        // Handle sling items
        if (['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat) && slingItems.length > 0) {
          try {
             const toolId = response.id;
             if (toolId) {
               await api.post(`/api/slings/by-tool/${toolId}`, slingItems);
             }
          } catch (err) {
             console.error('Failed to add sling items', err);
             notifyError(t('slings.errors.itemsFailed') || 'Narzędzie utworzono, ale wystąpił błąd przy dodawaniu podpozycji.');
          }
        }

        if (['nasadki 1"', 'nasadki 1/2"'].includes(cat) && socketItems.length > 0) {
          try {
            const toolId = response.id;
            if (toolId) {
              await api.post(`/api/impact-sockets/by-tool/${toolId}`, socketItems);
            }
          } catch (err) {
            console.error('Failed to add socket items', err);
            notifyError(err?.response?.data?.message || err?.message || 'Narzędzie utworzono, ale wystąpił błąd przy dodawaniu podpozycji.');
          }
        }

        if (cat === 'detektory' && detectorsItems.length > 0) {
          try {
            const toolId = response.id;
            if (toolId) {
              await api.post(`/api/detectors/by-tool/${toolId}`, detectorsItems);
            }
          } catch (err) {
            console.error('Failed to add detectors items', err);
            notifyError(err?.response?.data?.message || err?.message || 'Narzędzie utworzono, ale wystąpił błąd przy dodawaniu podpozycji.');
          }
        }

        notifySuccess(t('tools.notifications.addSuccess'));
      }
      
      if (onSuccess) {
        onSuccess();
      } else {
        handleCloseModal();
      }
    } catch (err) {
      console.error('Submit error:', err);
      const apiMessage = err?.response?.data?.message;
      const apiErrors = err?.response?.data?.errors;
      const details = Array.isArray(apiErrors) ? apiErrors.filter(Boolean) : [];
      const msg = details.length ? details.join(', ') : (apiMessage || err?.message || t('tools.notifications.error'));
      notifyError(msg);
      if (details.length) {
        setErrors({ submit: msg });
      } else if (apiErrors && typeof apiErrors === 'object') {
        setErrors(apiErrors);
      }
    }
  }, [formData, validateForm, editingTool, updateTool, addTool, t, notifySuccess, notifyError, handleCloseModal, slingItems, socketItems, detectorsItems, toolsCodePrefix, onSuccess]);

  // Service logic
  const handleOpenServiceModal = useCallback((tool) => {
    if (!tool) return;
    setEditingTool(tool); // Use editingTool to store the tool being sent/managed
    setServiceFormData({ quantity: 1, orderNumber: '', status: 'service' });
    setShowServiceModal(true);
  }, []);

  const handleCloseServiceModal = useCallback(() => {
    setShowServiceModal(false);
    setEditingTool(null);
    setServiceFormData({ quantity: 1, orderNumber: '', status: 'service' });
  }, []);

  const handleSendToService = useCallback(async () => {
    if (!editingTool) return;
    const { quantity, orderNumber, status } = serviceFormData;

    // Handle 'damaged' status change
    if (status === 'damaged') {
      try {
        const payload = sanitizeObject({
          name: editingTool.name,
          category: editingTool.category,
          manufacturer: editingTool.manufacturer,
          model: editingTool.model,
          production_year: editingTool.production_year,
          sku: editingTool.sku,
          inventory_number: editingTool.inventory_number,
          location: editingTool.location,
          description: editingTool.description,
          status: 'damaged',
          quantity: Number(editingTool.quantity),
          min_stock: editingTool.min_stock,
          max_stock: editingTool.max_stock,
          is_consumable: !!editingTool.is_consumable,
          serial_number: editingTool.serial_number,
          serial_unreadable: !!editingTool.serial_unreadable,
          inspection_date: editingTool.inspection_date || null,
          production_date: editingTool.production_date || null
        });

        await updateTool({ id: editingTool.id, data: payload });
        notifySuccess(t('tools.notifications.updateSuccess'));
        handleCloseServiceModal();
      } catch (err) {
        notifyError(err?.response?.data?.message || t('tools.notifications.error'));
      }
      return;
    }

    // Handle 'service' (Send to Service)
    const maxQty = (editingTool.quantity || 0) - (editingTool.service_quantity || 0);
    
    if (quantity < 1 || quantity > maxQty) {
      notifyError(`${t('tools.service.chooseQty')} ${maxQty}`);
      return;
    }

    try {
      await sendToService({
        id: editingTool.id,
        quantity: Number(quantity),
        service_order_number: (orderNumber || '').trim() || null
      });
      notifySuccess(t('tools.service.sendSuccess'));
      handleCloseServiceModal();
    } catch (err) {
      notifyError(err?.response?.data?.message || err?.message || t('tools.service.sendFailed'));
    }
  }, [editingTool, serviceFormData, sendToService, updateTool, t, notifyError, notifySuccess, handleCloseServiceModal]);

  const handleServiceReceive = useCallback(async () => {
    if (!canManageTools) {
      notifyError(t('tools.errors.noManagePermission'));
      return;
    }
    if (!selectedTool) return;
    const current = selectedTool.service_quantity || 0;
    if (current <= 0) {
      notifyInfo(t('tools.service.receiveNone'));
      return;
    }
    try {
      await receiveFromService({ id: selectedTool.id, quantity: current });
      
      // Update selectedTool details
      try {
        const resp = await api.get(`/api/tools/${selectedTool.id}/details`);
        const details = resp?.tool || resp;
        setSelectedTool(details);
      } catch (_) { /* noop */ }

      notifySuccess(t('tools.service.receiveSuccess'));
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || t('tools.service.receiveFailed');
      notifyError(msg);
    }
  }, [canManageTools, selectedTool, receiveFromService, t, notifyError, notifyInfo, notifySuccess]);

  const handleServiceReceiveFor = useCallback(async (tool) => {
    if (!canManageTools) {
      notifyError(t('tools.errors.noManagePermission'));
      return;
    }
    if (!tool) return;
    const current = tool.service_quantity || 0;
    if (current <= 0) {
      notifyInfo(t('tools.service.receiveNone'));
      return;
    }
    try {
      await receiveFromService({ id: tool.id, quantity: current });
      
      if (selectedTool?.id === tool.id) {
         try {
           const resp = await api.get(`/api/tools/${tool.id}/details`);
           const details = resp?.tool || resp;
           setSelectedTool(details);
         } catch (_) { /* noop */ }
      }
      
      notifySuccess(t('tools.service.receiveSuccess'));
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || t('tools.service.receiveFailed');
      notifyError(msg);
    }
  }, [canManageTools, receiveFromService, selectedTool, t, notifyError, notifyInfo, notifySuccess]);

  // Notify Return Handlers
  const handleOpenNotify = useCallback(async (tool) => {
    setNotifyTool(tool);
    setNotifyModal(true);

    // Fetch details if employee info is missing to ensure modal displays it
    if (!tool.employee_brand_number && !tool.employee_first_name) {
      try {
        console.log('[ToolsManagement] Fetching details for notify modal:', tool.id);
        const resp = await api.get(`/api/tools/${tool.id}/details`);
        const details = resp?.tool || resp?.data || resp;
        
        if (details && Array.isArray(details.issues)) {
          const active = details.issues.find(i => i.status === 'issued') || details.issues[0];
          
          if (active) {
            console.log('[ToolsManagement] Found active issue for notify:', active);
            setNotifyTool(prev => {
               if (prev?.id !== tool.id) return prev;
               return {
                 ...prev,
                 employee_brand_number: active.employee_brand_number || active.employees?.brand_number,
                 employee_first_name: active.employee_first_name || active.employees?.first_name,
                 employee_last_name: active.employee_last_name || active.employees?.last_name,
                 issues: details.issues
               };
            });
          }
        }
      } catch (e) {
        console.error('Failed to fetch tool details for notification modal', e);
      }
    }
  }, []);

  const handleCloseNotify = useCallback(() => {
    setNotifyModal(false);
    setNotifyTool(null);
  }, []);

  const handleConfirmNotify = useCallback(async () => {
    if (!canManageTools) {
      notifyError(t('tools.errors.noManagePermission'));
      return;
    }
    if (!notifyTool) return;
    try {
      setNotifySending(true);
      let targetEmployeeId = null;
      let targetBrandNumber = '';
      
      try {
        // Try to get issues from existing object, or fetch fresh details
        let issues = Array.isArray(notifyTool?.issues) ? notifyTool.issues : [];
        
        if (issues.length === 0) {
          try {
            const resp = await api.get(`/api/tools/${notifyTool.id}/details`);
            const details = resp?.tool || resp?.data || resp;
            if (details && Array.isArray(details.issues)) {
              issues = details.issues;
            }
          } catch (e) {
            console.error('Failed to fetch tool details for notification', e);
          }
        }

        const active = issues.find(i => i.status === 'issued') || issues[issues.length - 1];
        if (active && (active.employee_id || active.employeeId)) {
          targetEmployeeId = active.employee_id ?? active.employeeId;
          try {
            const emp = await api.get(`/api/employees/${targetEmployeeId}`);
            targetBrandNumber = emp?.brand_number || emp?.data?.brand_number || '';
          } catch (_) { void 0; }
        }
      } catch (_) { void 0; }
      
      await notifyReturn({
        id: notifyTool.id,
        message: t('topbar.returnRequest'),
        target_employee_id: targetEmployeeId || null,
        target_brand_number: targetBrandNumber || null
      });

      notifySuccess(t('tools.notify.sent'));
      // Return requests will be refetched automatically if selectedTool matches
      try { window.dispatchEvent(new CustomEvent('notifications:refresh', { detail: { source: 'local' } })); } catch (_) { /* noop */ }
      handleCloseNotify();
    } catch (_err) {
      console.error('Notify return error:', _err);
      const msg = _err?.response?.data?.message || _err?.message || t('tools.notify.error');
      notifyError(msg);
    } finally {
      setNotifySending(false);
    }
  }, [canManageTools, notifyTool, notifyReturn, t, notifyError, notifySuccess, handleCloseNotify]);

  // Delete Handlers
  const openDeleteConfirm = useCallback((id) => {
    setConfirmDeleteId(id);
    setConfirmDeleteOpen(true);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setConfirmDeleteOpen(false);
    setConfirmDeleteId(null);
  }, []);

  const handleDeleteTool = useCallback(async () => {
    if (!canManageTools) {
      notifyError(t('tools.errors.noManagePermission'));
      return;
    }
    if (!confirmDeleteId) return;

    try {
      setConfirmDeleteLoading(true);
      await deleteTool(confirmDeleteId);
      notifySuccess(t('tools.notify.deleted'));
      closeDeleteConfirm();
    } catch (error) {
      notifyError(error?.message || t('tools.notify.deleteError'));
    } finally {
      setConfirmDeleteLoading(false);
    }
  }, [canManageTools, confirmDeleteId, deleteTool, t, notifyError, notifySuccess, closeDeleteConfirm]);

  // Issue Handlers
  const handleOpenIssueModal = useCallback((tool) => {
    setSelectedToolForIssue(tool);
    setIssueModalOpen(true);
  }, []);

  const handleCloseIssueModal = useCallback(() => {
    setIssueModalOpen(false);
    setSelectedToolForIssue(null);
  }, []);

  const handleConfirmIssue = useCallback(async (toolId, employeeId, isPermanent, quantity = 1) => {
    try {
      await api.post(`/api/tools/${toolId}/issue`, {
        employee_id: employeeId,
        quantity: Number(quantity) || 1,
        status: isPermanent ? 'permanent' : 'issued',
        is_permanent: !!isPermanent
      });
      notifySuccess(t('tools.issues.success') || 'Pomyślnie wydano narzędzie');
      handleCloseIssueModal();
      
      // Trigger update
      if (onSuccess) onSuccess();
      window.dispatchEvent(new CustomEvent('tools:list:changed'));
    } catch (error) {
      console.error('Issue error:', error);
      notifyError(error?.response?.data?.message || t('tools.issues.error') || 'Wystąpił błąd podczas wydawania narzędzia');
    }
  }, [onSuccess, notifySuccess, notifyError, handleCloseIssueModal, t]);

  // Return Handlers
  const handleOpenReturnModal = useCallback((tool) => {
    setSelectedToolForReturn(tool);
    setReturnModalOpen(true);
  }, []);

  const handleCloseReturnModal = useCallback(() => {
    setReturnModalOpen(false);
    setSelectedToolForReturn(null);
  }, []);

  const handleConfirmReturn = useCallback(async (toolId, issueId, quantity) => {
    try {
      await api.post(`/api/tools/${toolId}/return`, {
        issue_id: issueId,
        quantity: quantity
      });
      notifySuccess(t('tools.return.success') || 'Pomyślnie zwrócono narzędzie');
      handleCloseReturnModal();
      
      // Trigger update
      if (onSuccess) onSuccess();
      window.dispatchEvent(new CustomEvent('tools:list:changed'));
    } catch (error) {
      console.error('Return error:', error);
      notifyError(error?.response?.data?.message || t('tools.return.error') || 'Wystąpił błąd podczas zwracania narzędzia');
    }
  }, [onSuccess, notifySuccess, notifyError, handleCloseReturnModal, t]);

  // Barcode/QR Helpers
  const handleOpenBarcodeScanner = useCallback(() => {
    setShowBarcodeScanner(true);
  }, []);

  const handleScanResult = useCallback((result) => {
    setFormData(prev => ({ ...prev, sku: result }));
    setShowBarcodeScanner(false);
  }, []);

  const handleScanError = useCallback((error) => {
    notifyError(error?.message || t('common.error'));
    setShowBarcodeScanner(false);
  }, [notifyError, t]);

  const generateSkuWithPrefix = useCallback(() => {
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    // Use toolsCodePrefix from config if empty/undefined, but ensure it ends with '-'
    let prefix = (toolsCodePrefix).trim();
    if (!prefix.endsWith('-')) prefix += '-';
    setFormData(prev => ({ ...prev, sku: `${prefix}${randomPart}` }));
  }, [toolsCodePrefix]);

  const getToolCodeText = useCallback((tool) => {
    const base = (tool?.sku || '').toString();
    const prefix = (toolsCodePrefix || '').toString().trim();
    if (!prefix) return base;
    if (base.startsWith(`${prefix}-`)) return base;
    if (base.startsWith(prefix)) return `${prefix}-${base.slice(prefix.length)}`;
    return `${prefix}-${base}`;
  }, [toolsCodePrefix]);

  const generateQRCode = useCallback(async (text, width = 400) => {
    try {
      return await QRCode.toDataURL(text, {
        width: width,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
        quality: 1
      });
    } catch (error) {
      notifyError(error?.message || t('common.error'));
      return null;
    }
  }, [notifyError, t]);

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
      notifyError(error?.message || t('common.error'));
      return null;
    }
  }, [notifyError, t]);

  const downloadQrLabel = useCallback(async (tool) => {
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
      ctx.fillText(tool.name || '', canvas.width / 2, 40 * scale);

      ctx.font = `${18 * scale}px Arial`;
      ctx.fillText(`${t('tools.labels.sku')}: ${tool.sku || ''}`, canvas.width / 2, 70 * scale);

      const qrCodeUrl = await generateQRCode(getToolCodeText(tool) || '', 800);
      if (qrCodeUrl) {
        const qrImg = new Image();
        qrImg.onload = () => {
          const size = 200 * scale;
          const x = (canvas.width - size) / 2;
          const y = 90 * scale;
          ctx.drawImage(qrImg, x, y, size, size);

          const link = document.createElement('a');
          link.download = `${t('tools.labels.filenameQr')}-${tool.sku || t('tools.common.tool')}.png`;
          link.href = canvas.toDataURL('image/png', 1.0);
          link.click();
        };
        qrImg.src = qrCodeUrl;
      }
    } catch (error) {
      notifyError(error?.message || t('tools.labels.generateQrError'));
    }
  }, [t, getToolCodeText, notifyError, generateQRCode]);

  const downloadBarcodeLabel = useCallback(async (tool) => {
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
      ctx.fillText(tool.name || '', canvas.width / 2, 40 * scale);

      ctx.font = `${18 * scale}px Arial`;
      ctx.fillText(`${t('tools.labels.sku')}: ${tool.sku || ''}`, canvas.width / 2, 70 * scale);

      const barcodeUrl = generateBarcode(tool.barcode || '');
      if (barcodeUrl) {
        const barcodeImg = new Image();
        barcodeImg.onload = () => {
          const w = 300 * scale;
          const h = 110 * scale;
          const x = (canvas.width - w) / 2;
          const y = 110 * scale;
          ctx.drawImage(barcodeImg, x, y, w, h);

          const link = document.createElement('a');
          link.download = `${t('tools.labels.filenameBarcode')}-${tool.sku}.png`;
          link.href = canvas.toDataURL('image/png', 1.0);
          link.click();
        };
        barcodeImg.src = barcodeUrl;
      }
    } catch (error) {
      notifyError(error?.message || t('tools.labels.generateBarcodeError'));
    }
  }, [t, notifyError, generateBarcode]);

  // Export details logic moved to ToolsDetailsModal

  return {
    showModal, setShowModal,
    editingTool, setEditingTool,
    formData, setFormData,
    errors, setErrors,
    showDetailsModal, setShowDetailsModal,
    selectedTool, setSelectedTool,
    showServiceModal, setShowServiceModal,
    serviceFormData, setServiceFormData,
    showBarcodeScanner, setShowBarcodeScanner,
    handleOpenBarcodeScanner,
    handleScanResult,
    handleScanError,
    generateSkuWithPrefix,
    slingItems, setSlingItems,
    socketItems, setSocketItems,
    detectorsItems, setDetectorsItems,
    handleOpenModal,
    handleCloseModal,
    handleOpenDetailsModal,
    handleCloseDetailsModal,
    handleInputChange,
    validateForm,
    handleSubmit,
    handleOpenServiceModal,
    handleCloseServiceModal,
    handleSendToService,
    handleServiceReceive,
    handleServiceReceiveFor,
    downloadQrLabel,
    downloadBarcodeLabel,
    getToolCodeText,
    // Notify
    notifyModal,
    notifyTool,
    notifySending,
    handleOpenNotify,
    handleCloseNotify,
    handleConfirmNotify,
    // Issue
    issueModalOpen,
    selectedToolForIssue,
    handleOpenIssueModal,
    handleCloseIssueModal,
    handleConfirmIssue,
    // Return
    returnModalOpen,
    selectedToolForReturn,
    handleOpenReturnModal,
    handleCloseReturnModal,
    handleConfirmReturn,
    // Delete
    confirmDeleteOpen,
    confirmDeleteId,
    confirmDeleteLoading,
    openDeleteConfirm,
    closeDeleteConfirm,
    handleDeleteTool,
    // Tooltip
    hoveredToolId,
    setHoveredToolId,
    issueTooltipPos,
    setIssueTooltipPos,
    tooltipPinned,
    tooltipHideTimerRef,
    handleToolHover,
    handleToolLeave,
    handleTooltipEnter,
    handleTooltipLeave,
    handleActionsHover,
    handleActionsLeave,
    suppressTooltipRef
  };
};
