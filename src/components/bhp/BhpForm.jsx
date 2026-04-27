import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../api';
import BarcodeScannerComponent from '../BarcodeScanner';
import { useLanguage } from '../../contexts/LanguageContext';

const formatDateForInput = (value) => {
  if (!value) return '';
  try {
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    const dmy = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (dmy) {
      const [, dd, mm, yyyy] = dmy;
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  } catch (_) {
    return '';
  }
};

const initialFormState = {
  inventory_number: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  catalog_number: '',
  production_date: '',
  inspection_date: '',
  is_set: false,
  has_shock_absorber: false,
  has_srd: false,
  harness_start_date: '',
  shock_absorber_serial: '',
  shock_absorber_name: '',
  shock_absorber_model: '',
  shock_absorber_catalog_number: '',
  shock_absorber_production_date: '',
  shock_absorber_start_date: '',
  srd_manufacturer: '',
  srd_model: '',
  srd_serial_number: '',
  srd_catalog_number: '',
  srd_production_date: '',
  status: 'available',
  nfc_tag_id: ''
};

const BhpForm = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  initialData, 
  suggestions = {}, 
  bhpCodePrefix 
}) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState(initialFormState);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const hasShock = !!(initialData.shock_absorber_name || initialData.shock_absorber_model || initialData.shock_absorber_serial || initialData.shock_absorber_catalog_number || initialData.shock_absorber_production_date);
        const hasSrd = !!(initialData.srd_manufacturer || initialData.srd_model || initialData.srd_catalog_number || initialData.srd_production_date || initialData.srd_serial_number);
        
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData({
          ...initialData,
          nfc_tag_id: initialData.nfc_tag_id || '',
          is_set: !!initialData.is_set,
          has_shock_absorber: hasShock,
          has_srd: hasSrd,
          production_date: formatDateForInput(initialData.production_date),
          harness_start_date: formatDateForInput(initialData.harness_start_date),
          inspection_date: formatDateForInput(initialData.inspection_date),
          shock_absorber_name: initialData.shock_absorber_name || '',
          shock_absorber_model: initialData.shock_absorber_model || '',
          shock_absorber_serial: initialData.shock_absorber_serial || '',
          shock_absorber_catalog_number: initialData.shock_absorber_catalog_number || '',
          shock_absorber_production_date: formatDateForInput(initialData.shock_absorber_production_date),
          shock_absorber_start_date: formatDateForInput(initialData.shock_absorber_start_date),
          srd_manufacturer: initialData.srd_manufacturer || '',
          srd_model: initialData.srd_model || '',
          srd_serial_number: initialData.srd_serial_number || '',
          srd_catalog_number: initialData.srd_catalog_number || '',
          srd_production_date: formatDateForInput(initialData.srd_production_date)
        });
      } else {
        setFormData(initialFormState);
      }
    }
  }, [isOpen, initialData]);

  const generateInventoryWithPrefix = () => {
    const prefix = (bhpCodePrefix || '').toString();
    const current = (formData.inventory_number || '').toString().trim();
    const suffix = current || Date.now().toString(36).toUpperCase().slice(-6);
    const next = prefix ? (current.startsWith(prefix) ? current : `${prefix}-${suffix}`) : suffix;
    setFormData(prev => ({ ...prev, inventory_number: next }));
  };

  const handleScanResult = (text) => {
    setFormData(prev => ({ ...prev, inventory_number: text || '' }));
    setShowBarcodeScanner(false);
  };

  const handleScanError = (error) => {
    console.error('Scan error:', error);
    setShowBarcodeScanner(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.has_shock_absorber && formData.has_srd) {
        toast.error(t('BHP.errors.setMutualExclusive'));
        return;
      }
      const normalizeDate = (v) => {
        if (!v) return null;
        const str = String(v).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
        const dmy = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
        if (dmy) {
          const [, dd, mm, yyyy] = dmy;
          return `${yyyy}-${mm}-${dd}`;
        }
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        return null;
      };

      let payload = { 
        ...formData, 
        is_set: (formData.has_shock_absorber || formData.has_srd) ? 1 : 0,
        production_date: normalizeDate(formData.production_date),
        harness_start_date: normalizeDate(formData.harness_start_date),
        inspection_date: normalizeDate(formData.inspection_date),
        shock_absorber_production_date: normalizeDate(formData.shock_absorber_production_date),
        shock_absorber_start_date: normalizeDate(formData.shock_absorber_start_date),
        srd_production_date: normalizeDate(formData.srd_production_date)
      };

      let result;
      if (initialData) {
        await api.put(`/api/bhp/${initialData.id}`, payload);
        result = { ...initialData, ...payload };
        toast.success(t('common.updateSuccess'));
      } else {
        result = await api.post('/api/bhp', payload);
        toast.success(t('common.createSuccess')); // Assuming translation exists or fallback
      }
      
      onSuccess(result);
      onClose();
    } catch (e) {
      toast.error(e?.message || t('BHP.errors.saveFailed'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{initialData && initialData.id ? t('BHP.modal.editTitle') : t('BHP.modal.addTitle')}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.inventoryNumberRequired')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.inventory_number}
                  onChange={(e) => setFormData({ ...formData, inventory_number: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(true)}
                  className="px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  title={t('BHP.form.scanCode')}
                >
                  📷
                </button>
                <button
                  type="button"
                  onClick={generateInventoryWithPrefix}
                  className="px-3 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors"
                  title={t('BHP.form.generateWithPrefix')}
                >
                  ⚙️
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('common.nfcTag') || 'Tag NFC (UID)'}</label>
              <input type="text" value={formData.nfc_tag_id || ''} onChange={(e) => setFormData({ ...formData, nfc_tag_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder={t('common.scanNfc') || 'Zeskanuj tag NFC...'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.manufacturer')}</label>
              <input type="text" list="manufacturerOptions" value={formData.manufacturer} onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.model')}</label>
              <input type="text" list="modelOptions" value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.serialNumber')}</label>
              <input type="text" value={formData.serial_number} onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.catalogNumber')}</label>
              <input type="text" list="catalogOptions" value={formData.catalog_number} onChange={(e) => setFormData({ ...formData, catalog_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.productionDateHarness')}</label>
              <input type="date" value={formData.production_date || ''} onChange={(e) => setFormData({ ...formData, production_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.harnessStartDate')}</label>
              <input type="date" value={formData.harness_start_date || ''} onChange={(e) => setFormData({ ...formData, harness_start_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data przeglądu</label>
              <input type="date" value={formData.inspection_date || ''} onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('BHP.form.set')}</div>
              <div className="flex items-center gap-6">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" className="accent-blue-600 dark:accent-blue-400" checked={formData.has_shock_absorber} onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData({ ...formData, has_shock_absorber: checked, has_srd: checked ? false : formData.has_srd });
                  }} />
                  {t('BHP.form.shock')}
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" className="accent-blue-600 dark:accent-blue-400" checked={formData.has_srd} onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData({ ...formData, has_srd: checked, has_shock_absorber: checked ? false : formData.has_shock_absorber });
                  }} />
                  {t('BHP.form.srd')}
                </label>
              </div>
            </div>
          </div>

          {/* Amortyzator — pola po zaznaczeniu */}
          {formData.has_shock_absorber && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amortyzator - producent</label>
                  <input type="text" list="shockAbsorberManufacturerOptions" value={formData.shock_absorber_name} onChange={(e) => setFormData({ ...formData, shock_absorber_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amortyzator - model</label>
                  <input type="text" list="shockAbsorberModelOptions" value={formData.shock_absorber_model} onChange={(e) => setFormData({ ...formData, shock_absorber_model: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amortyzator - nr seryjny</label>
                  <input type="text" value={formData.shock_absorber_serial} onChange={(e) => setFormData({ ...formData, shock_absorber_serial: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amortyzator - numer katalogowy</label>
                  <input type="text" list="shockAbsorberCatalogOptions" value={formData.shock_absorber_catalog_number} onChange={(e) => setFormData({ ...formData, shock_absorber_catalog_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amortyzator - data produkcji</label>
                  <input type="date" value={formData.shock_absorber_production_date || ''} onChange={(e) => setFormData({ ...formData, shock_absorber_production_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
            </div>
          )}

          {/* Urządzenie samohamowne — pola po zaznaczeniu */}
          {formData.has_srd && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Urządzenie samohamowne - producent</label>
                  <input type="text" list="srdManufacturerOptions" value={formData.srd_manufacturer} onChange={(e) => setFormData({ ...formData, srd_manufacturer: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Urządzenie samohamowne - model</label>
                  <input type="text" list="srdModelOptions" value={formData.srd_model} onChange={(e) => setFormData({ ...formData, srd_model: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Urządzenie samohamowne - nr seryjny</label>
                  <input type="text" value={formData.srd_serial_number} onChange={(e) => setFormData({ ...formData, srd_serial_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Urządzenie samohamowne - numer katalogowy</label>
                  <input type="text" list="srdCatalogOptions" value={formData.srd_catalog_number} onChange={(e) => setFormData({ ...formData, srd_catalog_number: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Urządzenie samohamowne - data produkcji</label>
                  <input type="date" value={formData.srd_production_date || ''} onChange={(e) => setFormData({ ...formData, srd_production_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
            </div>
          )}

          {/* Datalisty z podpowiedziami */}
          <datalist id="manufacturerOptions">
            {suggestions.manufacturerOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="modelOptions">
            {suggestions.modelOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="catalogOptions">
            {suggestions.catalogOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="shockAbsorberManufacturerOptions">
            {suggestions.shockAbsorberManufacturerOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="shockAbsorberModelOptions">
            {suggestions.shockAbsorberModelOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="shockAbsorberCatalogOptions">
            {suggestions.shockAbsorberCatalogOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="srdManufacturerOptions">
            {suggestions.srdManufacturerOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="srdModelOptions">
            {suggestions.srdModelOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>
          <datalist id="srdCatalogOptions">
            {suggestions.srdCatalogOptions?.map((v) => (<option key={v} value={v} />))}
          </datalist>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
        {showBarcodeScanner && (
          <BarcodeScannerComponent
            onScan={handleScanResult}
            onError={handleScanError}
            onClose={() => setShowBarcodeScanner(false)}
          />
        )}
      </div>
    </div>
  );
};

export default BhpForm;
