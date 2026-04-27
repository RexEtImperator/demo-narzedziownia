import React, { useRef, useState } from 'react';
import { ArrowPathIcon, WifiIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import ToolsSlingsEditor from './ToolsSlingsEditor';
import ToolsSlingsItemsTable from './ToolsSlingsItemsTable';
import ToolsImpactSocketsEditor from './ToolsImpactSocketsEditor';
import ToolsImpactSocketsItemsTable from './ToolsImpactSocketsItemsTable';
import ToolsDetectorsEditor from './ToolsDetectorsEditor';
import ToolsDetectorsItemsTable from './ToolsDetectorsItemsTable';

const ToolsForm = ({
  isOpen,
  onClose,
  editingTool,
  formData,
  errors,
  isSubmitting,
  handleSubmit,
  handleInputChange,
  availableCategories,
  suggestions,
  modalRef,
  t,
  generateSkuWithPrefix,
  slingItems,
  setSlingItems,
  socketItems,
  setSocketItems,
  detectorsItems,
  setDetectorsItems,
  isPage
}) => {

  const { manufacturer: manufacturerSuggestions = [], model: modelSuggestions = [], production_year: yearSuggestions = [] } = suggestions || {};

  const nfcInputRef = useRef(null);
  const [isNfcScanning, setIsNfcScanning] = useState(false);
  const [nfcError, setNfcError] = useState(null);

  if (!isOpen && !isPage) return null;

  const startNfcScan = async () => {
    setNfcError(null);
    
    // 1. Próba użycia Web NFC API (dla Androida / kompatybilnych czytników PC/SC w Chrome)
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      try {
        const ndef = new window.NDEFReader();
        await ndef.scan();
        setIsNfcScanning(true);
        
        ndef.onreading = (event) => {
          const serialNumber = event.serialNumber;
          if (serialNumber) {
            handleInputChange({
              target: { name: 'nfc_tag_id', value: serialNumber.toUpperCase() }
            });
            setIsNfcScanning(false);
          }
        };
        
        ndef.onreadingerror = () => {
          setNfcError('Błąd odczytu tagu. Spróbuj ponownie.');
          setIsNfcScanning(false);
        };
      } catch (error) {
        console.error("NFC Error:", error);
        // Jeśli użytkownik zablokował dostęp lub brak sprzętu obsługiwanego przez Web NFC
        setNfcError('Nie można uruchomić Web NFC. Użyj czytnika w trybie klawiatury.');
        if (nfcInputRef.current) nfcInputRef.current.focus();
      }
    } else {
      // 2. Fallback: Pouczenie o trybie klawiatury
      setNfcError('Brak obsługi Web NFC w tej przeglądarce. Upewnij się, że czytnik działa jako klawiatura (przetestuj w Notatniku).');
      if (nfcInputRef.current) {
        nfcInputRef.current.focus();
      }
    }
  };

  // Obsługa skanera (często kończy znakiem nowej linii/Enter)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Można tu dodać logikę walidacji lub przejścia do następnego pola
    }
  };

  const content = (
    <div 
      ref={modalRef} 
      role={isPage ? "main" : "dialog"}
      aria-modal={!isPage}
      aria-labelledby="edit-title" 
      aria-describedby="edit-desc" 
      className={isPage 
        ? "bg-white dark:bg-slate-800 rounded-lg shadow-sm w-full" 
        : "bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      }
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 id="edit-title" className="text-xl font-bold text-slate-900 dark:text-slate-100 sharp-text">
            {editingTool ? (t('tools.actions.edit') || 'Edytuj narzędzie') : (t('tools.actions.add') || 'Dodaj narzędzie')}
          </h2>
          {!isPage && (
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="text-2xl">×</span>
            </button>
          )}
        </div>
        <div id="edit-desc" className="text-sm text-slate-600 dark:text-slate-300 mb-3 sharp-text">
          {t('tools.edit.modalDescription')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            {/* First row - Name, SKU, and NFC Tag */}
            {(() => {
              const cat = (formData.category || '').trim().toLowerCase();
              const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat);
              
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div>
                    <label htmlFor="tool-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                      {t('tools.details.name')} *
                    </label>
                    <input
                      id="tool-name"
                      type="text"
                      name="name"
                      autoComplete="off"
                      value={formData.name}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 sharp-text ${
                        errors.name ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                      }`}
                      placeholder={t('tools.details.placeholders.name')}
                    />
                    {errors.name && (
                      <p className="text-red-600 dark:text-red-400 text-sm mt-1 sharp-text">{errors.name}</p>
                    )}
                  </div>

                  {/* SKU and NFC Container */}
                  <div className="flex gap-4">
                    {/* SKU */}
                    <div className="flex-1">
                      <label htmlFor="tool-sku" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                        {isSlings ? 'SKU' : 'SKU *'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="tool-sku"
                          type="text"
                          name="sku"
                          autoComplete="off"
                          value={formData.sku_unreadable ? '-' : formData.sku}
                          onChange={handleInputChange}
                          disabled={formData.sku_unreadable}
                          className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text ${
                            errors.sku ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                          } ${formData.sku_unreadable ? 'opacity-70 cursor-not-allowed' : ''}`}
                          placeholder={t('tools.details.placeholders.SKU')}
                        />
                        <button
                          type="button"
                          onClick={() => handleInputChange({ target: { name: 'sku_unreadable', type: 'checkbox', checked: !formData.sku_unreadable } })}
                          className={`px-3 py-2 border rounded-lg transition-colors ${
                            formData.sku_unreadable
                              ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                              : 'bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 border-gray-300 dark:border-slate-500 text-slate-700 dark:text-slate-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={t('tools.details.skuUnreadable') || 'Zaznacz SKU jako nieczytelne (wartość NULL)'}
                        >
                          <EyeSlashIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={generateSkuWithPrefix}
                          disabled={formData.sku_unreadable}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 border border-gray-300 dark:border-slate-500 rounded-lg transition-colors text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t('tools.actions.generateSku') || 'Generuj SKU'}
                        >
                          <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                        {formData.sku && errors.sku && (
                          <span className="px-2 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-700 rounded self-center whitespace-nowrap sharp-text">
                            {t('tools.errors.indexTaken')}
                          </span>
                        )}
                      </div>
                      {(!isSlings && !formData.sku_unreadable && errors.sku) && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400 sharp-text">{errors.sku}</p>
                      )}
                    </div>

                    {/* NFC Tag - Hidden for slings, positioned right of SKU */}
                    {!isSlings && (
                      <div className="flex-1">
                        <label htmlFor="tool-nfc-tag" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                          {t('common.nfcTag') || 'Tag NFC (UID)'}
                        </label>
                        <div className="relative flex gap-2">
                          <input
                            ref={nfcInputRef}
                            id="tool-nfc-tag"
                            type="text"
                            name="nfc_tag_id"
                            value={formData.nfc_tag_id || ''}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text pr-10 ${
                              isNfcScanning ? 'ring-2 ring-green-500 border-green-500' : 'border-slate-300 dark:border-slate-600'
                            }`}
                            placeholder={isNfcScanning ? 'Zbliż kartę NFC...' : (t('common.scanNfc') || 'Zeskanuj tag NFC...')}
                          />
                          <button
                            type="button"
                            onClick={startNfcScan}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-colors ${
                              isNfcScanning 
                                ? 'text-green-600 animate-pulse' 
                                : 'text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400'
                            }`}
                            title={isNfcScanning ? "Skanowanie aktywne..." : "Kliknij, aby aktywować skaner lub Web NFC"}
                          >
                            <WifiIcon className="h-5 w-5" />
                          </button>
                        </div>
                        {nfcError && (
                          <div className="mt-1">
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
                              {nfcError}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Second row - Inventory Number and Serial Number */}
            {(() => {
              const cat = (formData.category || '').trim().toLowerCase();
              const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat);
              const isSockets = ['nasadki 1"', 'nasadki 1/2"'].includes(cat);
              const hasSubItems = isSlings || isSockets;
              return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tool-inventory-number" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                  {t('tools.details.inventoryNumber')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="tool-inventory-number"
                    type="text"
                    name="inventory_number"
                    autoComplete="off"
                    value={formData.inventory_number || ''}
                    onChange={handleInputChange}
                    list="inventory-suggestions"
                    className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text ${
                      errors.inventory_number ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                    }`}
                    placeholder={t('tools.details.placeholders.inventoryNumber')}
                  />
                  <datalist id="inventory-suggestions">
                    {(suggestions?.inventory_number || []).map(opt => (
                      <option key={`inv-${opt}`} value={opt} />
                    ))}
                  </datalist>
                  {formData.inventory_number && errors.inventory_number && (
                    <span className="px-2 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-700 rounded self-center whitespace-nowrap sharp-text">
                      {t('tools.errors.taken')}
                    </span>
                  )}
                </div>
                {errors.inventory_number && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 sharp-text">{errors.inventory_number}</p>
                )}
              </div>

              <div>
                <label htmlFor="tool-serial-number" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                  {hasSubItems ? t('tools.details.serialNumber') : `${t('tools.details.serialNumber')} *`}
                </label>
                <div className="flex gap-2">
                  <input
                    id="tool-serial-number"
                    type="text"
                    name="serial_number"
                    value={hasSubItems || formData.serial_unreadable ? '-' : (formData.serial_number || '')}
                    onChange={handleInputChange}
                    disabled={hasSubItems || formData.serial_unreadable}
                    title={hasSubItems ? (t('slings.editor.skuDisabledHint') || 'Dla tej kategorii identyfikacja odbywa się na poziomie podpozycji, pole wyłączone.') : undefined}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text ${
                      errors.serial_number ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                    } ${hasSubItems || formData.serial_unreadable ? 'opacity-70 cursor-not-allowed' : ''}`}
                    placeholder="Np. SN-123456"
                  />
                  <button
                    type="button"
                    onClick={() => handleInputChange({ target: { name: 'serial_unreadable', type: 'checkbox', checked: !formData.serial_unreadable } })}
                    className={`px-3 py-2 border rounded-lg transition-colors ${
                      formData.serial_unreadable
                        ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 border-gray-300 dark:border-slate-500 text-slate-700 dark:text-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={t('tools.details.serialUnreadable') || 'Zaznacz numer fabryczny jako nieczytelny'}
                  >
                    <EyeSlashIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                {(!hasSubItems && !formData.serial_unreadable && errors.serial_number) && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 sharp-text">{errors.serial_number}</p>
                )}
              </div>
            </div>
              );
            })()}

            {/* Third row - Category and Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tool-category" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                  {t('tools.details.category')} *
                </label>
                <select
                  id="tool-category"
                  name="category"
                  autoComplete="off"
                  value={formData.category}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 sharp-text ${
                    errors.category ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <option value="">{t('tools.details.placeholders.selectCategory')}</option>
                  {availableCategories.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  {formData.category && !availableCategories.includes(formData.category) && (
                    <option value={formData.category}>{formData.category} ({t('common.existing')})</option>
                  )}
                </select>
                {errors.category && (
                  <p className="text-red-600 dark:text-red-400 text-sm mt-1 sharp-text">{errors.category}</p>
                )}
              </div>

              <div>
                <label htmlFor="tool-location" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                  {t('tools.details.location')}
                </label>
                <input
                  id="tool-location"
                  type="text"
                  name="location"
                  autoComplete="off"
                  value={formData.location}
                  onChange={handleInputChange}
                  list="location-suggestions"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text"
                  placeholder={t('tools.details.placeholders.location')}
                />
                <datalist id="location-suggestions">
                  {(suggestions?.location || []).map(opt => (
                    <option key={`loc-${opt}`} value={opt} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Review Date tile for Spawalnicze */}
            {(() => {
              const cat = (formData.category || '').trim().toLowerCase();
              const isCombustion = cat === 'spawalnicze' || cat === 'spalawnicze';
              if (!isCombustion) return null;
              return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-4">
                  <label htmlFor="tool-inspection-date" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 sharp-text">
                    {t('tools.details.inspectionDate') || 'Data przeglądu'}
                  </label>
                  <input
                    id="tool-inspection-date"
                    type="date"
                    name="inspection_date"
                    autoComplete="off"
                    value={formData.inspection_date || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text"
                  />
                </div>
              );
            })()}

            {/* Elektronarzędzia / Akumulatorowe tile: Producent/Model/Rok lub Data Produkcji */}
            {(() => {
              const cat = (formData.category || '').trim().toLowerCase();
              if (!['elektronarzędzia', 'akumulatorowe'].includes(cat)) return null;
              const currentYear = new Date().getFullYear();

              const handleDateChange = (e) => {
                let value = e.target.value;
                // Allow only numbers and dot
                value = value.replace(/[^0-9.]/g, '');
                
                // Simulate event for handleInputChange
                handleInputChange({
                  target: {
                    name: 'production_date',
                    value: value
                  }
                });
              };

              return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-4">
                  <div className="mb-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 sharp-text">
                      {t('tools.details.techData') || 'Dane techniczne'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="tool-manufacturer" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                        {t('tools.details.manufacturer')}
                      </label>
                      <input
                        id="tool-manufacturer"
                        type="text"
                        name="manufacturer"
                        autoComplete="off"
                        value={formData.manufacturer || ''}
                        onChange={handleInputChange}
                        list="manufacturer-suggestions"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text"
                        placeholder="Np. Bosch, Makita"
                      />
                      <datalist id="manufacturer-suggestions">
                        {manufacturerSuggestions.map(opt => (
                          <option key={`mf-${opt}`} value={opt} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label htmlFor="tool-model" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                        {t('tools.details.model')}
                      </label>
                      <input
                        id="tool-model"
                        type="text"
                        name="model"
                        value={formData.model || ''}
                        onChange={handleInputChange}
                        list="model-suggestions"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text"
                        placeholder="Np. GSR 18V-55"
                      />
                      <datalist id="model-suggestions">
                        {modelSuggestions.map(opt => (
                          <option key={`md-${opt}`} value={opt} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      {cat === 'elektronarzędzia' ? (
                        <>
                          <label htmlFor="tool-production-year" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                            {t('tools.labels.productionYear') || 'Rok Produkcji'}
                          </label>
                          <input
                            id="tool-production-year"
                            type="number"
                            name="production_year"
                            autoComplete="off"
                            value={formData.production_year || ''}
                            onChange={handleInputChange}
                            list="year-suggestions"
                            min={1900}
                            max={currentYear + 1}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text"
                            placeholder="Np. 2024"
                          />
                          <datalist id="year-suggestions">
                            {yearSuggestions.map(opt => (
                              <option key={`yr-${opt}`} value={opt} />
                            ))}
                          </datalist>
                        </>
                      ) : (
                        <>
                          <label htmlFor="tool-production-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                            {t('tools.labels.productionDate') || 'Data produkcji'}
                          </label>
                          <input
                            id="tool-production-date"
                            type="text"
                            name="production_date"
                            value={formData.production_date || ''}
                            onChange={handleDateChange}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text"
                            placeholder="MM.YYYY"
                            maxLength={7}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 sharp-text">
                    {t('tools.hints.useSuggestions') || 'Skorzystaj z podpowiedzi aby szybko wybrać wcześniej użyte wartości.'}
                  </p>
                </div>
              );
            })()}

            {/* Fourth row - Quantity (hidden for slings categories) */}
            {(() => {
              const cat = (formData.category || '').trim().toLowerCase();
              const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat);
              const isSockets = ['nasadki 1"', 'nasadki 1/2"'].includes(cat);
              const isDetectors = cat === 'detektory';
              if (isSlings || isSockets || isDetectors) return null;
              return (
                <div>
              <label htmlFor="tool-quantity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                {t('tools.details.quantity')} *
              </label>
              <input
                id="tool-quantity"
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleInputChange}
                min="1"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 sharp-text ${
                  errors.quantity ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              {errors.quantity && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-1 sharp-text">{errors.quantity}</p>
              )}
            </div>
          );
        })()}

        {/* Slings Editor (new) or Table (edit) */}
        {(() => {
          const cat = (formData.category || '').trim().toLowerCase();
          const isSlings = ['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat);
          
          if (!isSlings) return null;

          if (editingTool) {
             return (
              <div className="col-span-1 md:col-span-2 mt-4">
                <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 italic">
                  {t('slings.details.slingsItemsTable')}
                </div>
                <ToolsSlingsItemsTable 
                   toolId={editingTool.id}
                   category={formData.category}
                   t={t}
                   canManage={true}
                />
              </div>
             );
          }

          return (
            <div className="col-span-1 md:col-span-2 mt-4">
              <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 italic">
                {t('slings.details.slingsEditor')}
              </div>
              <ToolsSlingsEditor 
                 items={slingItems} 
                 onChange={setSlingItems} 
                 category={formData.category}
                 t={t} 
              />
            </div>
          );
        })()}

        {(() => {
          const cat = (formData.category || '').trim().toLowerCase();
          const isSockets = ['nasadki 1"', 'nasadki 1/2"'].includes(cat);

          if (!isSockets) return null;

          if (editingTool) {
            return (
              <div className="col-span-1 md:col-span-2 mt-4">
                <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 italic">
                  {t?.('sockets.details.itemsTable') || 'Edytuj podpozycje (nasadki) dla tego narzędzia.'}
                </div>
                <ToolsImpactSocketsItemsTable toolId={editingTool.id} category={formData.category} t={t} canManage={true} />
              </div>
            );
          }

          return (
            <div className="col-span-1 md:col-span-2 mt-4">
              <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 italic">
                {t?.('sockets.details.editor') || 'Dodaj podpozycje (nasadki). Ilość jest liczona na poziomie podpozycji.'}
              </div>
              <ToolsImpactSocketsEditor items={socketItems} onChange={setSocketItems} category={formData.category} t={t} />
            </div>
          );
        })()}

        {(() => {
          const cat = (formData.category || '').trim().toLowerCase();
          const isDetectors = cat === 'detektory';
          if (!isDetectors) return null;

          if (editingTool) {
            return (
              <div className="col-span-1 md:col-span-2 mt-4">
                <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 italic">
                  {t?.('detectors.details.itemsTable') || 'Edytuj podpozycje (detektory) dla tego narzędzia.'}
                </div>
                <ToolsDetectorsItemsTable toolId={editingTool.id} t={t} canManage={true} />
              </div>
            );
          }

          return (
            <div className="col-span-1 md:col-span-2 mt-4">
              <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 italic">
                {t?.('detectors.details.editor') || 'Dodaj podpozycje (detektory). Wydanie/zwrot odbywa się na poziomie podpozycji.'}
              </div>
              <ToolsDetectorsEditor items={detectorsItems} onChange={setDetectorsItems} category={formData.category} t={t} />
            </div>
          );
        })()}

            {(() => {
              const cat = String(formData.category || '').trim().toLowerCase();
              const isHandTools = cat === 'ręczne' || cat === 'reczne';
              if (!isHandTools) return null;

              return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="is_consumable"
                      type="checkbox"
                      name="is_consumable"
                      checked={!!formData.is_consumable}
                      onChange={handleInputChange}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="is_consumable" className="text-sm font-medium text-slate-700 dark:text-slate-200 sharp-text">
                      {t('tools.details.consumable')}
                    </label>
                  </div>

                  {!!formData.is_consumable && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      <div>
                        <label htmlFor="tool-min-stock" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                          {t('tools.details.minStock')}
                        </label>
                        <input
                          id="tool-min-stock"
                          type="number"
                          name="min_stock"
                          value={formData.min_stock}
                          onChange={handleInputChange}
                          min="0"
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 sharp-text ${
                            errors.min_stock ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                          }`}
                          placeholder="np. 10"
                        />
                        {errors.min_stock && (
                          <p className="text-red-600 dark:text-red-400 text-sm mt-1 sharp-text">{errors.min_stock}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="tool-max-stock" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                          {t('tools.details.maxStock')}
                        </label>
                        <input
                          id="tool-max-stock"
                          type="number"
                          name="max_stock"
                          value={formData.max_stock}
                          onChange={handleInputChange}
                          min="0"
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 sharp-text ${
                            errors.max_stock ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                          }`}
                          placeholder="np. 100"
                        />
                        {errors.max_stock && (
                          <p className="text-red-600 dark:text-red-400 text-sm mt-1 sharp-text">{errors.max_stock}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 sharp-text">
                    {t('tools.details.stockLimits')}
                  </p>
                </div>
              );
            })()}

            {/* Description - full width */}
            <div>
              <label htmlFor="tool-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sharp-text">
                {t('tools.details.description')}
              </label>
              <textarea
                id="tool-description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 sharp-text"
                placeholder={t('tools.details.placeholders.description')}
              />
            </div>

            {/* Status Selection - Badges */}
            <div role="group" aria-labelledby="status-group-label">
              <span id="status-group-label" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 sharp-text">{t('tools.filters.status.label')}</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'available', label: t('tools.filters.saved.available') || 'Dostępne', color: '#22c55e' },
                  { id: 'issued', label: t('tools.filters.saved.issued') || 'Wydane', color: '#eab308' },
                  { id: 'partially_issued', label: t('tools.filters.saved.partiallyIssued') || 'Wydane - częściowo', color: '#CDDC39' },
                  { id: 'permanent', label: t('tools.filters.saved.permanent') || 'Wydane - na stałe', color: '#3b82f6' },
                  { id: 'service', label: t('tools.filters.saved.service') || 'Serwis', color: '#ef4444' },
                  { id: 'damaged', label: t('tools.filters.saved.damaged') || 'Uszkodzone', color: '#f97316' }
                ].map((statusOption) => {
                  const isActive = formData.status === statusOption.id;
                  
                  // Logic to determine if this option should be disabled in Edit mode
                  let isDisabled = false;
                  if (editingTool) {
                    const initial = editingTool.status;
                    // If currently Issued or Service, lock everything (cannot change status here)
                    if (initial === 'issued' || initial === 'service') {
                      isDisabled = true;
                    } 
                    // If currently Available or Damaged, only allow toggling between these two
                    else if (initial === 'available' || initial === 'damaged') {
                      if (statusOption.id === 'issued' || statusOption.id === 'service') {
                        isDisabled = true;
                      }
                    }
                  }

                  let colorClasses = '';
                  
                  if (isActive) {
                    if (statusOption.color === '#22c55e') colorClasses = 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800';
                    else if (statusOption.color === '#eab308') colorClasses = 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800';
                    else if (statusOption.color === '#CDDC39') colorClasses = 'bg-yellow-500 text-white border-yellow-700 dark:bg-yellow-700 dark:text-yellow-300 dark:border-yellow-800';
                    else if (statusOption.color === '#3b82f6') colorClasses = 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800';
                    else if (statusOption.color === '#ef4444') colorClasses = 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800';
                    else if (statusOption.color === '#f97316') colorClasses = 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-800';
                    
                    if (isDisabled) colorClasses += ' opacity-75 cursor-not-allowed';
                  } else {
                    if (isDisabled) {
                      colorClasses = 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-slate-800/50 dark:text-slate-600 dark:border-slate-700/50';
                    } else {
                      colorClasses = 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700';
                    }
                  }

                  return (
                    <button
                      key={statusOption.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleInputChange({ target: { name: 'status', value: statusOption.id } })}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border sharp-text ${colorClasses}`}
                    >
                      {statusOption.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {errors.submit && (
              <div className="text-red-600 dark:text-red-400 text-sm sharp-text">{errors.submit}</div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors sharp-text"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 sharp-text"
              >
                {isSubmitting ? (t('common.saving') || 'Zapisywanie...') : (editingTool ? (t('common.update') || 'Zaktualizuj') : (t('common.add') || 'Dodaj'))}
              </button>
            </div>
          </form>
        </div>
    </div>
  );

  if (isPage) return content;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {content}
    </div>
  );
};

export default ToolsForm;
