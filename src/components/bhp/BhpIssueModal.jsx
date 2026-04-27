import React, { useState, useMemo } from 'react';
import { toast } from 'react-toastify';

const BhpIssueModal = ({ isOpen, onClose, bhp, employees, onConfirm }) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredEmployees = useMemo(() => {
    let result = (employees || []).filter(emp => emp.status !== 'Zawieszony');
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(emp => {
        const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
        const brandNumber = emp.brand_number ? String(emp.brand_number) : '';
        const formatted = `${emp.first_name} ${emp.last_name}${emp.brand_number ? ` [${emp.brand_number}]` : ''}`.toLowerCase();
        
        return fullName.includes(lowerSearch) || 
               brandNumber.includes(lowerSearch) ||
               formatted.includes(lowerSearch);
      });
    }

    return result.sort((a, b) => {
      const bnA = a.brand_number ? String(a.brand_number) : '';
      const bnB = b.brand_number ? String(b.brand_number) : '';
      
      const brandCompare = bnA.localeCompare(bnB, undefined, { numeric: true });
      if (brandCompare !== 0) return brandCompare;
      
      return (a.last_name || '').localeCompare(b.last_name || '');
    });
  }, [employees, searchTerm]);

  const handleSelectEmployee = (emp) => {
    setSelectedEmployeeId(emp.id);
    setSearchTerm(`${emp.first_name} ${emp.last_name}${emp.brand_number ? ` [${emp.brand_number}]` : ''}`);
    setShowDropdown(false);
  };

  const handleSubmit = () => {
    if (!selectedEmployeeId) {
      toast.error('Wybierz pracownika');
      return;
    }
    onConfirm(bhp.id, selectedEmployeeId, isPermanent);
  };

  if (!isOpen || !bhp) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Wydaj sprzęt BHP</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{bhp.name} ({bhp.inventory_number})</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Pracownik</label>
            <input
              type="text"
              placeholder="Szukaj pracownika (imię, nazwisko, numer)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedEmployeeId('');
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {showDropdown && (
              <ul className="absolute z-10 w-full mt-1 max-h-60 overflow-auto bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg">
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map(emp => (
                    <li
                      key={emp.id}
                      onClick={() => handleSelectEmployee(emp)}
                      className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-slate-700 dark:text-slate-200"
                    >
                      {emp.brand_number && <span className="text-slate-800 dark:text-slate-500">[{emp.brand_number}]</span>} {emp.first_name} {emp.last_name}
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-2 text-slate-500 dark:text-slate-400">Brak wyników</li>
                )}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="issuePermanentBhp"
              checked={isPermanent}
              onChange={(e) => setIsPermanent(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-700"
            />
            <label htmlFor="issuePermanentBhp" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              Wydać na stałe?
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Anuluj</button>
            <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors">Wydaj</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BhpIssueModal;
