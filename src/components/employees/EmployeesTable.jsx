import React, { useState, useEffect, useRef } from 'react';
import { PencilSquareIcon, TrashIcon, EnvelopeIcon, DocumentArrowDownIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { PERMISSIONS, hasPermission } from '../../constants';
import EmployeeTooltip from './EmployeeTooltip';

const EmployeesTable = ({
  employees,
  user,
  t,
  hoveredEmployeeId,
  setHoveredEmployeeId,
  tooltipPos,
  setTooltipPos,
  issuedBhpByEmployee,
  issuedToolsByEmployee,
  issuedSlingsByEmployee,
  fetchIssuedBhp,
  fetchIssuedTools,
  fetchIssuedSlings,
  handleExportEmployeeCard,
  handleSendCredentials,
  openEditModal,
  handleDeleteEmployee,
  getDepartmentName,
  getPositionName
}) => {
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownCoords, setDropdownCoords] = useState(null);
  const dropdownRef = useRef(null);
  const dropdownButtonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const menuEl = dropdownRef.current;
      const buttonEl = dropdownButtonRef.current;

      if (
        (menuEl && menuEl.contains(event.target)) ||
        (buttonEl && buttonEl.contains(event.target))
      ) {
        return;
      }

      setOpenDropdownId(null);
      setDropdownCoords(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = (id) => {
    setOpenDropdownId(prev => {
      if (prev === id) {
        setDropdownCoords(null);
        return null;
      }
      return id;
    });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      {employees.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('employees.none')}</h3>
          <p className="text-slate-600 dark:text-slate-400">
            {t('employees.noneFound')}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                <tr>
                  <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100">{t('employees.brandNumber')}</th>
                  <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100">{t('employees.fullName')}</th>
                  <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100">{t('employees.phone')}</th>
                  <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100">{t('employees.departmentCol')}</th>
                  <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100">{t('employees.positionCol')}</th>
                  {hasPermission(user, PERMISSIONS.MANAGE_EMPLOYEES) && (
                    <th className="text-left p-4 font-semibold text-slate-900 dark:text-slate-100">{t('employees.actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700"
                    onMouseEnter={(e) => {
                      setHoveredEmployeeId(employee.id);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const gap = 12;
                      const widthPx = 308;
                      const canPlaceRight = rect.right + gap + widthPx <= (window.innerWidth - gap);
                      const left = canPlaceRight ? (rect.right + gap) : Math.max(gap, rect.left + widthPx - gap);
                      const top = Math.min(Math.max(gap, rect.top), Math.max(gap, window.innerHeight - 380));
                      setTooltipPos({ top, left });
                      fetchIssuedBhp(employee.id);
                      fetchIssuedTools(employee.id);
                      if (fetchIssuedSlings) fetchIssuedSlings(employee.id);
                    }}
                    onMouseLeave={() => {
                      setHoveredEmployeeId(null);
                    }}
                  >
                    <td className="p-4 font-mono text-sm text-slate-600 dark:text-slate-400">
                      {employee.brand_number || '-'}
                    </td>
                    <td className="p-4 relative">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {employee.first_name} {employee.last_name}
                      </div>
                      {employee.login && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                          LOGIN: {employee.login}
                        </div>
                      )}
                      {employee.email && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                          EMAIL: {employee.email}
                        </div>
                      )}
                      <EmployeeTooltip
                        hoveredEmployeeId={hoveredEmployeeId}
                        employee={employee}
                        tooltipPos={tooltipPos}
                        issuedToolsByEmployee={issuedToolsByEmployee}
                        issuedBhpByEmployee={issuedBhpByEmployee}
                        issuedSlingsByEmployee={issuedSlingsByEmployee}
                        t={t}
                      />
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">
                      {employee.phone || '-'}
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">
                      {getDepartmentName(employee.department)}
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">
                      {getPositionName(employee.position)}
                    </td>
                    {hasPermission(user, PERMISSIONS.MANAGE_EMPLOYEES) && (
                      <td className="p-4">
                        <div className="relative">
                          <button
                            ref={openDropdownId === employee.id ? dropdownButtonRef : null}
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const dropdownWidth = 224;
                              const dropdownHeight = 240;
                              const margin = 8;

                              let left = rect.right - dropdownWidth;
                              if (left < margin) left = margin;

                              const spaceBelow = window.innerHeight - rect.bottom;
                              let top;
                              if (spaceBelow < dropdownHeight) {
                                top = Math.max(margin, rect.top - dropdownHeight);
                              } else {
                                top = rect.bottom + 4;
                              }

                              setDropdownCoords({ top, left });
                              toggleDropdown(employee.id);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                          >
                            Opcje
                            <ChevronDownIcon className={`h-4 w-4 transition-transform ${openDropdownId === employee.id ? 'rotate-180' : ''}`} />
                          </button>

                          {openDropdownId === employee.id && dropdownCoords && (
                            <div
                              ref={dropdownRef}
                              className="fixed w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-1 overflow-hidden"
                              style={{ top: dropdownCoords.top, left: dropdownCoords.left }}
                            >
                              <button
                                onClick={() => {
                                  handleExportEmployeeCard(employee);
                                  setOpenDropdownId(null);
                                  setDropdownCoords(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                              >
                                <DocumentArrowDownIcon className="h-4 w-4" />
                                Pobierz kartotekę
                              </button>
                              <button
                                onClick={() => {
                                  handleSendCredentials(employee);
                                  setOpenDropdownId(null);
                                  setDropdownCoords(null);
                                }}
                                disabled={!employee?.email}
                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                                  !employee?.email 
                                    ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                                title={!employee?.email ? 'Uzupełnij e‑mail pracownika, aby wysłać' : 'Wyślij dane logowania'}
                              >
                                <EnvelopeIcon className="h-4 w-4" />
                                Wyślij dane logowania
                              </button>
                              <button
                                onClick={() => {
                                  openEditModal(employee);
                                  setOpenDropdownId(null);
                                  setDropdownCoords(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                                Edytuj
                              </button>
                              <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                              <button
                                onClick={() => {
                                  handleDeleteEmployee(employee);
                                  setOpenDropdownId(null);
                                  setDropdownCoords(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                              >
                                <TrashIcon className="h-4 w-4" />
                                Usuń
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-600">
            {employees.map((employee) => (
              <div key={employee.id} className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {employee.first_name} {employee.last_name}
                    </h3>
                    {employee.login && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                        LOGIN: {employee.login}
                      </p>
                    )}
                    {employee.email && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                        EMAIL: {employee.email}
                      </p>
                    )}
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono truncate">
                      {t('employees.brandNumber')}: {employee.brand_number || '-'}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('employees.mobilePhone')}</span>
                    <span className="text-slate-900 dark:text-slate-100">{employee.phone || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('employees.mobileDepartment')}</span>
                    <span className="text-slate-900 dark:text-slate-100">{getDepartmentName(employee.department)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('employees.mobilePosition')}</span>
                    <span className="text-slate-900 dark:text-slate-100">{getPositionName(employee.position)}</span>
                  </div>
                </div>

                {hasPermission(user, PERMISSIONS.MANAGE_EMPLOYEES) && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
                    <button
                      onClick={() => handleExportEmployeeCard(employee)}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <DocumentArrowDownIcon className="h-4 w-4" aria-hidden="true" />
                      Kartoteka
                    </button>
                    <button
                      onClick={() => handleSendCredentials(employee)}
                      disabled={!employee?.email}
                      className={`px-3 py-2 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-md hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors flex items-center gap-2 text-sm font-medium ${!employee?.email ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={!employee?.email ? 'Uzupełnij e‑mail pracownika, aby wysłać' : 'Wyślij dane logowania'}
                    >
                      <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
                      Wyślij
                    </button>
                    <button
                      onClick={() => openEditModal(employee)}
                      className="px-3 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                      Edytuj
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(employee)}
                      className="px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <TrashIcon className="h-4 w-4" aria-hidden="true" />
                      Usuń
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default EmployeesTable;
