import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const EmployeeModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  employee = null, 
  departments = [], 
  positions = [],
  onRegenerateLogin
}) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    departmentId: '',
    positionId: '',
    brandNumber: '',
    status: 'active',
    rfidUid: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (employee) {
      // Helper to find ID by name if ID is missing
      const findIdByName = (list, name) => {
        if (!name) return '';
        const found = list.find(item => item.name === name);
        return found ? String(found.id) : '';
      };

      const departmentId = employee.departmentId || findIdByName(departments, employee.department);
      const positionId = employee.positionId || findIdByName(positions, employee.position);

      setFormData({
        firstName: employee.firstName || employee.first_name || '',
        lastName: employee.lastName || employee.last_name || '',
        phone: employee.phone || '',
        email: employee.email || '',
        departmentId: departmentId ? String(departmentId) : '',
        positionId: positionId ? String(positionId) : '',
        brandNumber: employee.brandNumber || employee.brand_number || '',
        status: employee.status || 'active',
        rfidUid: employee.rfidUid || employee.rfid_uid || ''
      });
    } else {
      setFormData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        departmentId: '',
        positionId: '',
        brandNumber: '',
        status: 'active',
        rfidUid: ''
      });
    }
    setErrors({});
  }, [employee, isOpen, departments, positions]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = t('employees.modal.errors.firstNameRequired');
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = t('employees.modal.errors.lastNameRequired');
    }

    if (!formData.departmentId) {
      newErrors.departmentId = t('employees.modal.errors.departmentRequired');
    }

    if (!formData.positionId) {
      newErrors.positionId = t('employees.modal.errors.positionRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const sanitizedData = { ...formData };
    Object.keys(sanitizedData).forEach(key => {
      if (typeof sanitizedData[key] === 'string') {
        sanitizedData[key] = DOMPurify.sanitize(sanitizedData[key]);
      }
    });

    setIsLoading(true);
    try {
      await onSave(sanitizedData);
      onClose();
    } catch (_error) {
      setErrors({ submit: t('employees.modal.errors.submitFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-black dark:bg-opacity-60 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        <div className="inline-block align-bottom bg-white dark:bg-slate-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white dark:bg-slate-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="w-full">
                  <h3 className="text-lg leading-6 font-medium text-slate-900 dark:text-slate-100 mb-4">
                    {employee ? t('employees.modal.title.edit') : t('employees.modal.title.add')}
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        {t('employees.modal.labels.firstName')}
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        id="firstName"
                        value={formData.firstName}
                        onChange={handleChange}
                        placeholder={t('employees.modal.placeholders.firstName')}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500 ${
                          errors.firstName ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      {errors.firstName && (
                        <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        {t('employees.modal.labels.lastName')}
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        id="lastName"
                        value={formData.lastName}
                        onChange={handleChange}
                        placeholder={t('employees.modal.placeholders.lastName')}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500 ${
                          errors.lastName ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      {errors.lastName && (
                        <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        {t('employees.modal.labels.phone')}
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        id="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder={t('employees.modal.placeholders.phone')}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 placeholder-slate-500 dark:placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        {t('employees.modal.labels.email')}
                      </label>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder={t('employees.modal.placeholders.email')}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 placeholder-slate-500 dark:placeholder-slate-500"
                      />
                    </div>
                  <div>
                    <label htmlFor="brandNumber" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      {t('employees.modal.labels.brandNumber')}
                    </label>
                    <input
                      type="text"
                      name="brandNumber"
                      id="brandNumber"
                      value={formData.brandNumber}
                      onChange={handleChange}
                      placeholder={t('employees.modal.placeholders.brandNumber')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 placeholder-slate-500 dark:placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="rfidUid" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      {t('employees.modal.labels.rfidUid') || 'Tag NFC (UID)'}
                    </label>
                    <input
                      type="text"
                      name="rfidUid"
                      id="rfidUid"
                      value={formData.rfidUid}
                      onChange={handleChange}
                      placeholder={t('employees.modal.placeholders.rfidUid')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 placeholder-slate-500 dark:placeholder-slate-500"
                    />
                  </div>
                    <div>
                      <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        {t('employees.modal.labels.department')}
                      </label>
                      <select
                        name="departmentId"
                        id="departmentId"
                        value={formData.departmentId}
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 ${
                          errors.departmentId ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        <option value="">{t('employees.modal.select.department')}</option>
                        {departments.map(dept => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                      {errors.departmentId && (
                        <p className="mt-1 text-sm text-red-600">{errors.departmentId}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="positionId" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        {t('employees.modal.labels.position')}
                      </label>
                      <select
                        name="positionId"
                        id="positionId"
                        value={formData.positionId}
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 ${
                          errors.positionId ? 'border-red-300 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        <option value="">{t('employees.modal.select.position')}</option>
                        {positions.map(pos => (
                          <option key={pos.id} value={pos.id}>
                            {pos.name}
                          </option>
                        ))}
                      </select>
                      {errors.positionId && (
                        <p className="mt-1 text-sm text-red-600">{errors.positionId}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        {t('employees.modal.labels.status')}
                      </label>
                      <select
                        name="status"
                        id="status"
                        value={formData.status}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-slate-300 text-gray-900 bg-white dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                      >
                        <option value="active">{t('employees.status.active')}</option>
                        <option value="inactive">{t('employees.status.inactive')}</option>
                        <option value="suspended">{t('employees.status.suspended')}</option>
                      </select>
                    </div>
                  </div>
                  {errors.submit && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                      <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? t('employees.modal.buttons.saving') : t('employees.modal.buttons.save')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-gray-700 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                {t('employees.modal.buttons.cancel')}
              </button>
              {employee && typeof onRegenerateLogin === 'function' ? (
                <button
                  type="button"
                  title={t('employees.modal.buttons.regenerateLogin')}
                  aria-label={t('employees.modal.buttons.regenerateLogin')}
                  onClick={() => onRegenerateLogin(formData)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-gray-700 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  <ArrowPathIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                  {t('employees.modal.buttons.regenerateLogin')}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EmployeeModal;
