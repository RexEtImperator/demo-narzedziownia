import React, { useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import EmployeeModal from './employees/EmployeeModal';
import EmployeesTable from './employees/EmployeesTable';
import { PERMISSIONS, hasPermission } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import SkeletonList from './SkeletonList';
import { useEmployeeIssuedItems } from '../hooks/useEmployeeIssuedItems';
import { useEmployeeManagement } from '../hooks/useEmployeeManagement';
import { exportEmployeesToPDF, exportEmployeesToXLSX } from '../utils/employeesExport';

function EmployeesScreen({ employees, setEmployees, user }) {
  const { t } = useLanguage();
  const [hoveredEmployeeId, setHoveredEmployeeId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const {
    searchTerm,
    setSearchTerm,
    filterDepartment,
    setFilterDepartment,
    filterPosition,
    setFilterPosition,
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    editingEmployee,
    setEditingEmployee,
    departments,
    positions,
    initialLoading,
    error,
    setError,
    departmentNames,
    positionNames,
    filteredEmployees,
    refreshEmployees,
    handleAddEmployee,
    openEditModal,
    handleEditEmployee,
    regenerateLogin,
    handleDeleteEmployee,
    handleSendCredentials,
    handleExportEmployeeCard
  } = useEmployeeManagement(employees, setEmployees, user, t);

  const { 
    issuedBhpByEmployee, 
    issuedToolsByEmployee, 
    issuedSlingsByEmployee,
    fetchIssuedBhp, 
    fetchIssuedTools,
    fetchIssuedSlings
  } = useEmployeeIssuedItems();

  const getDepartmentName = (department) => {
    return department || t('employees.unknownDept');
  };

  const getPositionName = (position) => {
    return position || t('employees.unknownPos');
  };

  const handleExportPDF = () => {
    exportEmployeesToPDF(filteredEmployees, t, user);
  };

  const handleExportXLSX = () => {
    exportEmployeesToXLSX(filteredEmployees, t);
  };

  // Skeleton dla tabeli pracowników
  const renderSkeleton = (
    <div className="p-4">
      <SkeletonList rows={8} cols={4} />
    </div>
  );

  return (
    <div className="px-6 pb-6 bg-white dark:bg-slate-900 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('employees.title')}</h1>
          <p className="text-slate-600 dark:text-slate-400">{t('employees.subtitle')}</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {hasPermission(user, PERMISSIONS.MANAGE_EMPLOYEES) && (
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <span>+</span>
                {t('employees.add')}
              </button>
            )}
            <button
              onClick={refreshEmployees}
              className="w-auto p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              aria-label={t('employees.refresh')}
              title={t('employees.refresh')}
            >
              <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center">
            <div className="text-red-600 dark:text-red-400 mr-2">⚠️</div>
            <p className="text-red-800 dark:text-red-200">{error}</p>
            <button
              onClick={() => setError('')}
              className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Filtry i wyszukiwanie */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6 p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="employee-search" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('employees.search')}
            </label>
            <div className="relative">
              <input
                id="employee-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('employees.searchPlaceholder')}
                className="w-full pr-12 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label={t('common.clearInput')}
                  title={t('common.clearInput')}
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-4 h-4"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div>
            <label
              htmlFor="employees-filter-department"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              {t('employees.department')}
            </label>
            <select
              id="employees-filter-department"
              name="employees-filter-department"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{t('employees.allDepartments')}</option>
              {departmentNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="employees-filter-position"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              {t('employees.position')}
            </label>
            <select
              id="employees-filter-position"
              name="employees-filter-position"
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{t('employees.allPositions')}</option>
              {positionNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterDepartment('all');
                setFilterPosition('all');
              }}
              className="w-full px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              {t('employees.clearFilters')}
            </button>
          </div>
        </div>
        {hasPermission(user, PERMISSIONS.EXPORT_EMPLOYEES) && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={filteredEmployees.length === 0}
              className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.export.PDF')}
            </button>
            <button
              type="button"
              onClick={handleExportXLSX}
              disabled={filteredEmployees.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.export.EXCEL')}
            </button>
          </div>
        )}
      </div>

      {(initialLoading && (!employees || employees.length === 0)) ? renderSkeleton : (
        <EmployeesTable
          employees={filteredEmployees}
          user={user}
          t={t}
          hoveredEmployeeId={hoveredEmployeeId}
          setHoveredEmployeeId={setHoveredEmployeeId}
          tooltipPos={tooltipPos}
          setTooltipPos={setTooltipPos}
          issuedBhpByEmployee={issuedBhpByEmployee}
          issuedToolsByEmployee={issuedToolsByEmployee}
          issuedSlingsByEmployee={issuedSlingsByEmployee}
          fetchIssuedBhp={fetchIssuedBhp}
          fetchIssuedTools={fetchIssuedTools}
          fetchIssuedSlings={fetchIssuedSlings}
          handleExportEmployeeCard={handleExportEmployeeCard}
          handleSendCredentials={handleSendCredentials}
          openEditModal={openEditModal}
          handleDeleteEmployee={handleDeleteEmployee}
          getDepartmentName={getDepartmentName}
          getPositionName={getPositionName}
        />
      )}

      {/* Modals */}
      <EmployeeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddEmployee}
        departments={departments}
        positions={positions}
      />

      <EmployeeModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingEmployee(null);
        }}
        onSave={handleEditEmployee}
        employee={editingEmployee}
        departments={departments}
        positions={positions}
        onRegenerateLogin={regenerateLogin}
      />
    </div>
  );
}

export default EmployeesScreen;
