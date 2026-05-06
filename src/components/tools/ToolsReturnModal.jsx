import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { useLanguage } from '../../contexts/LanguageContext';
import { pl } from 'date-fns/locale';

const ToolsReturnModal = ({ isOpen, onClose, tool, apiClient, onConfirm }) => {
  const { t } = useLanguage();
  const [activeIssues, setActiveIssues] = useState([]);
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [loading, setLoading] = useState(false);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [issuedSubitems, setIssuedSubitems] = useState([]);
  const [selectedSubitemIds, setSelectedSubitemIds] = useState([]);

  const returnMode = useMemo(() => {
    const cat = String(tool?.category || '').trim().toLowerCase();
    if (['zawiesia pasowe', 'zawiesia łańcuchowe'].includes(cat)) return 'slings';
    return 'issues';
  }, [tool?.category]);

  const fetchActiveIssues = useCallback(async () => {
    if (!tool) return;
    setLoading(true);
    try {
      if (returnMode === 'slings') {
        const res = await apiClient.get(`/api/slings/by-tool/${tool.id}`);
        const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        const issued = rows.filter(r => String(r?.status || '').toLowerCase() === 'issued');
        setIssuedSubitems(issued);
        setSelectedSubitemIds([]);
        setActiveIssues([]);
        setSelectedIssueId('');
        setReturnQuantity(1);
      } else {
        const res = await apiClient.get(`/api/tools/${tool.id}/details`);
        const toolData = res.data || res;
        const issues = (toolData.issues || []).filter(i =>
          ['issued', 'partially_issued', 'permanent'].includes((i.status || '').toLowerCase())
        );
        setActiveIssues(issues);
        setIssuedSubitems([]);
        setSelectedSubitemIds([]);
        if (issues.length === 1) {
          setSelectedIssueId(issues[0].id);
          setReturnQuantity(issues[0].quantity);
        } else {
          setSelectedIssueId('');
          setReturnQuantity(1);
        }
      }
    } catch (error) {
      console.error('Error fetching issues', error);
      toast.error('Błąd pobierania listy wydań');
    } finally {
      setLoading(false);
    }
  }, [apiClient, tool, returnMode]);

  useEffect(() => {
    if (isOpen && tool) {
      Promise.resolve().then(() => { fetchActiveIssues(); });
    }
  }, [isOpen, tool, fetchActiveIssues]);

  const handleSubmit = () => {
    if (returnMode === 'slings') {
      if (!selectedSubitemIds.length) {
        toast.error(t('slings.return.onlyIssued') || 'Wybierz podpozycje do zwrotu');
        return;
      }
      setLoading(true);
      Promise.resolve()
        .then(async () => {
          await apiClient.post('/api/slings/return', { item_ids: selectedSubitemIds });
          toast.success(t('slings.return.success') || 'Pomyślnie zwrócono podpozycje');
          window.dispatchEvent(new CustomEvent('tools:list:changed'));
          onClose();
        })
        .catch((err) => {
          toast.error(err?.response?.data?.message || err?.message || 'Wystąpił błąd podczas zwrotu');
        })
        .finally(() => setLoading(false));
      return;
    }

    if (!selectedIssueId) {
      toast.error('Wybierz pracownika zwracającego narzędzie');
      return;
    }
    const issue = activeIssues.find(i => i.id === Number(selectedIssueId));
    if (!issue) return;
    if (returnQuantity > issue.quantity) {
      toast.error(`Nie można zwrócić więcej niż wydano (${issue.quantity})`);
      return;
    }
    onConfirm(tool.id, selectedIssueId, returnQuantity);
  };

  if (!isOpen || !tool) return null;

  const selectedIssue = activeIssues.find(i => i.id === Number(selectedIssueId));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-xl">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('tools.returnModal.title')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{tool.name} ({tool.sku || tool.inventory_number})</p>
        </div>
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center text-slate-900 dark:text-slate-100 py-4">{t('common.loading')}</div>
          ) : returnMode === 'slings' ? (
            issuedSubitems.length === 0 ? (
              <div className="text-center py-4 text-slate-500">{t('tools.returnModal.noActiveIssues')}</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {t('common.quantity') || 'Ilość'}: {issuedSubitems.length}
                  </div>
                  <button
                    onClick={() => {
                      if (selectedSubitemIds.length === issuedSubitems.length) setSelectedSubitemIds([]);
                      else setSelectedSubitemIds(issuedSubitems.map(r => r.id));
                    }}
                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    {selectedSubitemIds.length === issuedSubitems.length ? (t('common.deselectAll') || 'Odznacz') : (t('common.selectAll') || 'Zaznacz')}
                  </button>
                </div>

                <div className="max-h-80 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  {issuedSubitems.map((row) => {
                    const checked = selectedSubitemIds.includes(row.id);
                    const employeeLabel = row?.employee_brand_number
                      ? `[${row.employee_brand_number}] ${row.employee_first_name || ''} ${row.employee_last_name || ''}`.trim()
                      : (row?.employee_name || '').trim();
                    const meta = [row?.kind, row?.serial_number, employeeLabel].filter(Boolean).join(' • ');
                    return (
                      <label
                        key={row.id}
                        className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedSubitemIds(prev => (
                              prev.includes(row.id) ? prev.filter(x => x !== row.id) : [...prev, row.id]
                            ));
                          }}
                          className="mt-1 w-4 h-4"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                            {row?.sku || `ID: ${row.id}`}
                          </div>
                          {meta ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                              {meta}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={onClose} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">{t('common.cancel')}</button>
                  <button onClick={handleSubmit} disabled={!selectedSubitemIds.length} className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{t('common.return')}</button>
                </div>
              </>
            )
          ) : activeIssues.length === 0 ? (
            <div className="text-center py-4 text-slate-500">{t('tools.returnModal.noActiveIssues')}</div>
          ) : (
            <>
              <div>
                <label htmlFor="returnIssueSelect" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('tools.returnModal.selectEmployee')}</label>
                <select 
                  id="returnIssueSelect"
                  name="returnIssueSelect"
                  value={selectedIssueId} 
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedIssueId(id);
                    const iss = activeIssues.find(i => i.id === Number(id));
                    if (iss) setReturnQuantity(iss.quantity);
                  }} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— wybierz —</option>
                  {activeIssues.map(issue => (
                    <option key={issue.id} value={issue.id}>
                      {issue.employee_brand_number ? ` [${issue.employee_brand_number}] ` : ''}
                      {issue.employee_first_name} {issue.employee_last_name} 
                      {` (${issue.quantity} szt. - ${format(new Date(issue.issued_at), 'dd.MM.yyyy HH:mm', { locale: pl })})`}
                    </option>
                  ))}
                </select>
              </div>

              {selectedIssue && selectedIssue.quantity > 1 && (
                <div>
                  <label htmlFor="returnToolQuantity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ilość do zwrotu (max {selectedIssue.quantity})</label>
                  <input
                    id="returnToolQuantity"
                    name="returnToolQuantity"
                    type="number"
                    min="1"
                    max={selectedIssue.quantity}
                    value={returnQuantity}
                    onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">{t('common.cancel')}</button>
                <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors">{t('common.return')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToolsReturnModal;
